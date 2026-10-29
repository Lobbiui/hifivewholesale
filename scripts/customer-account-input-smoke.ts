import {
  customerAccountRequestSchema,
  temporaryBuyerPasswordError,
} from "../src/lib/customer-account-input";

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

const peterFormRequest = customerAccountRequestSchema.safeParse({
  action: "create",
  companyName: "Discount Vape",
  contactName: "Jason Knowles",
  email: "buyer@example.test",
  phone: "+19316460900",
  resaleId: "0p",
  territory: "TN",
  businessType: "Smoke / vape shop",
  websiteUrl: "https://",
  tnLicenseVerified: false,
  setupMethod: "TEMPORARY_PASSWORD",
  temporaryPassword: "ValidExample1!",
});

if (!peterFormRequest.success || peterFormRequest.data.action !== "create") {
  throw new Error("Peter's administrator account form shape was rejected.");
}
if (peterFormRequest.data.websiteUrl !== "") {
  throw new Error("A bare website protocol was not normalized to an empty optional field.");
}
if (temporaryBuyerPasswordError(peterFormRequest.data.temporaryPassword)) {
  throw new Error("A compliant administrator-created temporary password was rejected.");
}
if (!temporaryBuyerPasswordError("twelvecharacters")) {
  throw new Error("A temporary password without a number and symbol was accepted.");
}

console.log("Administrator temporary-password account input passed.");
