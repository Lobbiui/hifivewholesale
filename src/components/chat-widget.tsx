"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowUp, CheckCircle2, MessageCircle, Minus, ShieldCheck, X } from "lucide-react";
import { CHAT_CHANGE_EVENT, CHAT_STORAGE_KEY, createChatId, createMessageId, currentChatIdentity, readChatConversations, writeChatConversations, type ChatConversation } from "@/lib/chat-preview";

const ACTIVE_CHAT_KEY = "hifive-active-chat";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState("");
  const [emailStatus, setEmailStatus] = useState<"" | "sent" | "queued">("");

  const sync = () => {
    const next = readChatConversations();
    const identity = currentChatIdentity();
    const storedId = sessionStorage.getItem(ACTIVE_CHAT_KEY) || "";
    const matching = identity ? next.find((item) => item.buyerApplicationId === identity.buyerApplicationId) : next.find((item) => item.id === storedId);
    setConversations(next);
    setActiveId(matching?.id || "");
    if (identity) { setCompany(identity.company); setContact(identity.contact); setEmail(identity.email); }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { sync(); setReady(true); }, 0);
    const onStorage = (event: StorageEvent) => { if (event.key === CHAT_STORAGE_KEY) sync(); };
    window.addEventListener(CHAT_CHANGE_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => { window.clearTimeout(timer); window.removeEventListener(CHAT_CHANGE_EVENT, sync); window.removeEventListener("storage", onStorage); };
  }, []);

  const active = useMemo(() => conversations.find((item) => item.id === activeId), [activeId, conversations]);

  useEffect(() => {
    if (!open || !active || active.unreadByBuyer === 0) return;
    const timer = window.setTimeout(() => writeChatConversations(readChatConversations().map((item) => item.id === active.id ? { ...item, unreadByBuyer: 0 } : item)), 0);
    return () => window.clearTimeout(timer);
  }, [active, open]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !company.trim() || !contact.trim() || !email.trim()) return;
    const now = new Date().toISOString();
    const message = { id: createMessageId(), sender: "buyer" as const, body: body.slice(0, 2000), sentAt: now };
    const identity = currentChatIdentity();
    const conversationId = active?.id || createChatId();
    const nextConversation: ChatConversation = active ? { ...active, company: company.trim(), contact: contact.trim(), email: email.trim(), status: "Open", unreadByAdmin: active.unreadByAdmin + 1, updatedAt: now, messages: [...active.messages, message] } : { id: conversationId, company: company.trim(), contact: contact.trim(), email: email.trim(), buyerApplicationId: identity?.buyerApplicationId, status: "Open", unreadByAdmin: 1, unreadByBuyer: 0, updatedAt: now, messages: [message] };
    const next = [nextConversation, ...conversations.filter((item) => item.id !== conversationId)];
    sessionStorage.setItem(ACTIVE_CHAT_KEY, conversationId);
    setActiveId(conversationId);
    setDraft("");
    setEmailStatus("");
    writeChatConversations(next);
    try {
      const response = await fetch("/api/chat/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, company: nextConversation.company, contact: nextConversation.contact, email: nextConversation.email, message: body }) });
      const result = await response.json() as { delivered?: boolean };
      setEmailStatus(result.delivered ? "sent" : "queued");
    } catch {
      setEmailStatus("queued");
    }
  };

  if (!ready) return null;
  return <aside className={open ? "chat-widget open" : "chat-widget"} aria-label="Hi-Five wholesale chat">
    {open && <div className="chat-window">
      <header><div><span><i/>Wholesale desk</span><strong>How can we help?</strong></div><div><button onClick={() => setOpen(false)} aria-label="Minimize chat"><Minus/></button><button onClick={() => setOpen(false)} aria-label="Close chat"><X/></button></div></header>
      <div className="chat-trust"><ShieldCheck/>Messages go directly to the Hi-Five wholesale team.</div>
      <div className="chat-thread" aria-live="polite">
        {!active && <div className="chat-welcome"><MessageCircle/><h3>Talk to a real wholesale person.</h3><p>Ask about products, case pricing, territory, delivery, or your business application.</p></div>}
        {active?.messages.map((message) => <div className={`chat-message ${message.sender}`} key={message.id}><span>{message.sender === "admin" ? "Hi-Five" : "You"}</span><p>{message.body}</p><small>{new Date(message.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></div>)}
      </div>
      <form onSubmit={send}>
        {!active && <div className="chat-identify"><label>Business name<input value={company} onChange={(event) => setCompany(event.target.value)} required/></label><div><label>Your name<input value={contact} onChange={(event) => setContact(event.target.value)} required/></label><label>Business email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required/></label></div></div>}
        <div className="chat-compose"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type your message…" maxLength={2000} required/><button aria-label="Send message"><ArrowUp/></button></div>
        <small className="chat-email-status">{emailStatus === "sent" ? <><CheckCircle2/>Admin notified by email</> : emailStatus === "queued" ? "Message saved · email activates when configured" : "Typical reply during business hours"}</small>
      </form>
    </div>}
    {!open && <button className="chat-launcher" onClick={() => setOpen(true)}><MessageCircle/><span>Message wholesale</span>{active?.unreadByBuyer ? <b>{active.unreadByBuyer}</b> : null}</button>}
  </aside>;
}
