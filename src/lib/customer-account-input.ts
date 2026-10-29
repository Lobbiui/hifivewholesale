import { z } from "zod";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => value ?? "",
    z.string().trim().max(maximum),
  );

const optionalWebsite = z.preprocess(
  (value) => {
    const normalized = typeof value === "string" ? value.trim() : value ?? "";
    return /^(?:https?:\/\/)?$/i.test(String(normalized)) ? "" : normalized;
  },
  z.string().url().max(500).or(z.literal("")),
);

export const temporaryBuyerPasswordPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,200}$/;

export function temporaryBuyerPasswordError(password: string) {
  return temporaryBuyerPasswordPattern.test(password)
    ? null
    : "Temporary password must be 12 or more characters and include a letter, a number, and a symbol.";
}

export const customerAccountRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    companyName: z.string().trim().min(2).max(200),
    contactName: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(7).max(40),
    resaleId: optionalText(100),
    territory: z.string().trim().min(2).max(100),
    businessType: z.string().trim().min(2).max(100),
    websiteUrl: optionalWebsite,
    tnLicenseVerified: z.boolean().optional().default(false),
    setupMethod: z.enum(["ACTIVATION_LINK", "TEMPORARY_PASSWORD"]).default("ACTIVATION_LINK"),
    temporaryPassword: optionalText(200),
  }).strict(),
  z.object({
    action: z.literal("resend_activation"),
    organizationId: z.string().min(1),
  }).strict(),
]);
