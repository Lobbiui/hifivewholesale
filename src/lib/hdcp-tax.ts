export const hdcpTaxProfiles = [
  "NONE",
  "FIXED_PER_CASE",
  "PERCENT_OF_LINE",
  "CANNABINOID_MG",
  "FLOWER_OUNCE",
  "LIQUID_ML",
  "INHALABLE_LIQUID_ML",
] as const;

export type HdcpTaxProfile = (typeof hdcpTaxProfiles)[number];
export type HdcpTaxSelection = HdcpTaxProfile | "INHERIT";

export const hdcpTaxProfileLabels: Record<HdcpTaxSelection, string> = {
  INHERIT: "Use product default",
  NONE: "No HDCP tax",
  FIXED_PER_CASE: "Fixed amount per case",
  PERCENT_OF_LINE: "Percentage of wholesale line",
  CANNABINOID_MG: "Cannabinoid milligrams",
  FLOWER_OUNCE: "Flower / plant ounces",
  LIQUID_ML: "Liquid volume (mL)",
  INHALABLE_LIQUID_ML: "Inhalable liquid (mL + 10%)",
};

export const hdcpTaxValueLabels: Record<HdcpTaxProfile, string> = {
  NONE: "No value required",
  FIXED_PER_CASE: "Tax dollars per case",
  PERCENT_OF_LINE: "Tax rate percent",
  CANNABINOID_MG: "Taxable cannabinoid mg per unit",
  FLOWER_OUNCE: "Flower ounces per unit",
  LIQUID_ML: "Liquid milliliters per unit",
  INHALABLE_LIQUID_ML: "Liquid milliliters per unit",
};

const CANNABINOID_CENTS_PER_MG = 2;
const FLOWER_CENTS_PER_OUNCE = 5_000;
const LIQUID_CENTS_PER_GALLON = 440;
const MILLILITERS_PER_GALLON = 3_785.411784;
const INHALABLE_LIQUID_RATE = 0.1;

export type HdcpTaxCalculation = {
  profile: HdcpTaxProfile;
  configuredValue: number;
  unitsPerCase: number;
  quantityCases: number;
  lineSubtotalCents: number;
  measurementQuantity: number;
  measurementUnit: "none" | "case" | "percent" | "mg" | "oz" | "mL";
  baseTaxCents: number;
  inhalableTaxCents: number;
  totalTaxCents: number;
};

export function calculateHdcpTax(input: {
  profile?: HdcpTaxProfile | null;
  value?: number | null;
  unitsPerCase?: number | null;
  quantityCases: number;
  casePriceCents: number;
}): HdcpTaxCalculation {
  const profile = input.profile ?? "NONE";
  const configuredValue = nonNegative(input.value);
  const unitsPerCase = Math.max(1, Math.trunc(nonNegative(input.unitsPerCase) || 1));
  const quantityCases = Math.max(0, Math.trunc(nonNegative(input.quantityCases)));
  const casePriceCents = Math.max(0, Math.round(nonNegative(input.casePriceCents)));
  const lineSubtotalCents = casePriceCents * quantityCases;
  const totalUnits = unitsPerCase * quantityCases;
  let measurementQuantity = 0;
  let measurementUnit: HdcpTaxCalculation["measurementUnit"] = "none";
  let baseTaxCents = 0;
  let inhalableTaxCents = 0;

  if (profile === "FIXED_PER_CASE") {
    measurementQuantity = quantityCases;
    measurementUnit = "case";
    baseTaxCents = Math.round(configuredValue * 100 * quantityCases);
  } else if (profile === "PERCENT_OF_LINE") {
    measurementQuantity = configuredValue;
    measurementUnit = "percent";
    baseTaxCents = Math.round(lineSubtotalCents * (configuredValue / 100));
  } else if (profile === "CANNABINOID_MG") {
    measurementQuantity = configuredValue * totalUnits;
    measurementUnit = "mg";
    baseTaxCents = Math.round(measurementQuantity * CANNABINOID_CENTS_PER_MG);
  } else if (profile === "FLOWER_OUNCE") {
    measurementQuantity = configuredValue * totalUnits;
    measurementUnit = "oz";
    baseTaxCents = Math.round(measurementQuantity * FLOWER_CENTS_PER_OUNCE);
  } else if (profile === "LIQUID_ML" || profile === "INHALABLE_LIQUID_ML") {
    measurementQuantity = configuredValue * totalUnits;
    measurementUnit = "mL";
    baseTaxCents = Math.round(
      (measurementQuantity / MILLILITERS_PER_GALLON) * LIQUID_CENTS_PER_GALLON,
    );
    if (profile === "INHALABLE_LIQUID_ML")
      inhalableTaxCents = Math.round(lineSubtotalCents * INHALABLE_LIQUID_RATE);
  }

  return {
    profile,
    configuredValue,
    unitsPerCase,
    quantityCases,
    lineSubtotalCents,
    measurementQuantity,
    measurementUnit,
    baseTaxCents,
    inhalableTaxCents,
    totalTaxCents: baseTaxCents + inhalableTaxCents,
  };
}

function nonNegative(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}
