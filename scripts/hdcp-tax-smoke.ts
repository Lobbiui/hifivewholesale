import assert from "node:assert/strict";
import { calculateHdcpTax } from "../src/lib/hdcp-tax";

const cases = [
  {
    name: "none",
    expected: 0,
    input: { profile: "NONE" as const, value: 0, unitsPerCase: 10, quantityCases: 2, casePriceCents: 10_000 },
  },
  {
    name: "fixed per case",
    expected: 825,
    input: { profile: "FIXED_PER_CASE" as const, value: 2.75, unitsPerCase: 1, quantityCases: 3, casePriceCents: 10_000 },
  },
  {
    name: "percentage",
    expected: 1_300,
    input: { profile: "PERCENT_OF_LINE" as const, value: 6.5, unitsPerCase: 1, quantityCases: 2, casePriceCents: 10_000 },
  },
  {
    name: "cannabinoid milligrams",
    expected: 600,
    input: { profile: "CANNABINOID_MG" as const, value: 15, unitsPerCase: 10, quantityCases: 2, casePriceCents: 10_000 },
  },
  {
    name: "flower ounces",
    expected: 10_000,
    input: { profile: "FLOWER_OUNCE" as const, value: 0.125, unitsPerCase: 8, quantityCases: 2, casePriceCents: 10_000 },
  },
  {
    name: "liquid milliliters",
    expected: 116,
    input: { profile: "LIQUID_ML" as const, value: 1_000, unitsPerCase: 1, quantityCases: 1, casePriceCents: 100_000 },
  },
  {
    name: "inhalable liquid",
    expected: 10_116,
    input: { profile: "INHALABLE_LIQUID_ML" as const, value: 1_000, unitsPerCase: 1, quantityCases: 1, casePriceCents: 100_000 },
  },
];

for (const test of cases) {
  const result = calculateHdcpTax(test.input);
  assert.equal(result.totalTaxCents, test.expected, test.name);
}

console.log(`HDCP tax smoke test passed (${cases.length} profiles).`);
