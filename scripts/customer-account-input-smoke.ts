import { customerAccountRequestSchema } from "../src/lib/customer-account-input";

const activationLinkRequest = customerAccountRequestSchema.safeParse({
  action: "create",
  companyName: "Account Creation Test",
  contactName: "Test Buyer",
  email: "ACCOUNT-CREATION@example.test",
  phone: "615-555-0100",
  resaleId: null,
  territory: "KY",
  businessType: "Retailer",
  websiteUrl: null,
  setupMethod: "ACTIVATION_LINK",
  temporaryPassword: null,
});

if (!activationLinkRequest.success) {
  throw new Error(`Activation-link account request was rejected: ${activationLinkRequest.error.message}`);
}
if (
  activationLinkRequest.data.action !== "create" ||
  activationLinkRequest.data.email !== "account-creation@example.test" ||
  activationLinkRequest.data.resaleId !== "" ||
  activationLinkRequest.data.websiteUrl !== "" ||
  activationLinkRequest.data.temporaryPassword !== ""
) {
  throw new Error("Optional account fields were not normalized correctly.");
}

console.log("Administrator activation-link account input passed.");
