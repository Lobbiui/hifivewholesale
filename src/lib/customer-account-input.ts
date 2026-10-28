import { z } from "zod";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => value ?? "",
    z.string().trim().max(maximum),
  );

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
    websiteUrl: z.preprocess(
      (value) => value ?? "",
      z.string().trim().url().max(500).or(z.literal("")),
    ),
    tnLicenseVerified: z.boolean(),
    setupMethod: z.enum(["ACTIVATION_LINK", "TEMPORARY_PASSWORD"]).default("ACTIVATION_LINK"),
    temporaryPassword: optionalText(200),
  }).strict(),
  z.object({
    action: z.literal("resend_activation"),
    organizationId: z.string().min(1),
  }).strict(),
]);
