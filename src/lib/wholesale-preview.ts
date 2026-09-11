export const WHOLESALE_SESSION_KEY = "hifive-wholesale-session";
export const WHOLESALE_APPLICATIONS_KEY = "hifive-access-applications";
export const WHOLESALE_ORDERS_KEY = "hifive-buyer-orders";
export const CART_STORAGE_KEY = "hifive-wholesale-cart";

export type AccessApplication = {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  resaleId: string;
  territory: string;
  businessType?: string;
  website?: string;
  status: "Pending" | "Approved" | "Declined";
  submitted: string;
  accessCode?: string;
};

export type WholesaleBuyerSession = {
  applicationId: string;
  company: string;
  contact: string;
  email: string;
  status: "Approved";
  demo?: boolean;
};

export type WholesalePreviewOrder = {
  id: string;
  company: string;
  buyerEmail: string;
  contactEmail: string;
  purchaseOrder: string;
  method: "pickup" | "delivery";
  submitted: string;
  status: "Submitted for review";
  pricingPending: boolean;
  itemCount: number;
  items: { id: string; name: string; quantity: number }[];
};

export const demoBuyer: WholesaleBuyerSession = {
  applicationId: "WA-DEMO",
  company: "Hi-Five Preview Retailer",
  contact: "Preview Buyer",
  email: "buyer@hifivesupply.com",
  status: "Approved",
  demo: true,
};

export function createPreviewAccessCode(applicationId: string) {
  return `HF-${applicationId.replace(/\D/g, "").slice(-4) || "BUYER"}`;
}

export function readAccessApplications(): AccessApplication[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(WHOLESALE_APPLICATIONS_KEY) || "[]") as AccessApplication[];
  } catch {
    return [];
  }
}

export function writeBuyerSession(session: WholesaleBuyerSession) {
  sessionStorage.setItem(WHOLESALE_SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("hifive-wholesale-session-change"));
}

export function clearBuyerSession() {
  sessionStorage.removeItem(WHOLESALE_SESSION_KEY);
  window.dispatchEvent(new Event("hifive-wholesale-session-change"));
}

export function readApprovedBuyerSession(): WholesaleBuyerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WHOLESALE_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as WholesaleBuyerSession;
    if (session.demo && session.email === demoBuyer.email) return demoBuyer;
    const application = readAccessApplications().find((item) => item.id === session.applicationId && item.email.toLowerCase() === session.email.toLowerCase());
    if (!application || application.status !== "Approved") {
      clearBuyerSession();
      return null;
    }
    return { applicationId: application.id, company: application.company, contact: application.contact, email: application.email, status: "Approved" };
  } catch {
    clearBuyerSession();
    return null;
  }
}
