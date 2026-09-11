import { readApprovedBuyerSession } from "./wholesale-preview";

export const CHAT_STORAGE_KEY = "hifive-chat-conversations";
export const CHAT_CHANGE_EVENT = "hifive-chat-change";

export type ChatMessage = {
  id: string;
  sender: "buyer" | "admin";
  body: string;
  sentAt: string;
};

export type ChatConversation = {
  id: string;
  company: string;
  contact: string;
  email: string;
  buyerApplicationId?: string;
  status: "Open" | "Closed";
  unreadByAdmin: number;
  unreadByBuyer: number;
  updatedAt: string;
  messages: ChatMessage[];
};

export function readChatConversations(): ChatConversation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]") as ChatConversation[];
  } catch {
    return [];
  }
}

export function writeChatConversations(conversations: ChatConversation[]) {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations));
  window.dispatchEvent(new Event(CHAT_CHANGE_EVENT));
}

export function currentChatIdentity() {
  const buyer = readApprovedBuyerSession();
  if (!buyer) return null;
  return { company: buyer.company, contact: buyer.contact, email: buyer.email, buyerApplicationId: buyer.applicationId };
}

export function createChatId() {
  return `CHAT-${Date.now().toString().slice(-7)}`;
}

export function createMessageId() {
  return `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
