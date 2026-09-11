"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, Check, Mail, MessageCircle, Search, Send, UserRound } from "lucide-react";
import { CHAT_CHANGE_EVENT, CHAT_STORAGE_KEY, createMessageId, readChatConversations, writeChatConversations, type ChatConversation } from "@/lib/chat-preview";

export function AdminChatInbox() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState("");
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);

  const sync = () => {
    const next = readChatConversations();
    setConversations(next);
    setActiveId((current) => current || next[0]?.id || "");
  };

  useEffect(() => {
    const timer = window.setTimeout(sync, 0);
    const onStorage = (event: StorageEvent) => { if (event.key === CHAT_STORAGE_KEY) sync(); };
    window.addEventListener(CHAT_CHANGE_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => { window.clearTimeout(timer); window.removeEventListener(CHAT_CHANGE_EVENT, sync); window.removeEventListener("storage", onStorage); };
  }, []);

  useEffect(() => {
    fetch("/api/chat/notify").then((response) => response.json()).then((result: { configured?: boolean }) => setEmailConfigured(Boolean(result.configured))).catch(() => setEmailConfigured(false));
  }, []);

  const active = useMemo(() => conversations.find((item) => item.id === activeId), [activeId, conversations]);
  const filtered = conversations.filter((item) => `${item.company} ${item.contact} ${item.email}`.toLowerCase().includes(query.toLowerCase()));
  const unread = conversations.reduce((sum, item) => sum + item.unreadByAdmin, 0);

  const selectConversation = (id: string) => {
    setActiveId(id);
    const next = readChatConversations().map((item) => item.id === id ? { ...item, unreadByAdmin: 0 } : item);
    writeChatConversations(next);
  };

  const sendReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active || !reply.trim()) return;
    const now = new Date().toISOString();
    const next = readChatConversations().map((item) => item.id === active.id ? { ...item, status: "Open" as const, unreadByAdmin: 0, unreadByBuyer: item.unreadByBuyer + 1, updatedAt: now, messages: [...item.messages, { id: createMessageId(), sender: "admin" as const, body: reply.trim().slice(0, 2000), sentAt: now }] } : item);
    setReply("");
    writeChatConversations(next);
  };

  const toggleStatus = () => {
    if (!active) return;
    writeChatConversations(readChatConversations().map((item) => item.id === active.id ? { ...item, status: item.status === "Open" ? "Closed" : "Open" } : item));
  };

  return <>
    <div className="admin-section-head"><div><span className="eyebrow">Buyer conversations</span><h2>CHAT INBOX.</h2><p>Reply to approved buyers, applicants, brands, and wholesale prospects from one shared queue.</p></div><div className={`chat-admin-status ${emailConfigured ? "configured" : ""}`}><Mail/><div><small>Email notifications</small><strong>{emailConfigured === null ? "Checking configuration…" : emailConfigured ? "Resend notifications active" : "Awaiting email configuration"}</strong></div><span>{unread} unread</span></div></div>
    <section className="admin-chat-shell">
      <aside className="admin-chat-list"><div className="admin-chat-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations"/></div>{filtered.length === 0 ? <div className="admin-chat-empty"><MessageCircle/><strong>No conversations yet</strong><span>New storefront messages will appear here.</span></div> : filtered.map((conversation) => <button className={conversation.id === activeId ? "active" : ""} key={conversation.id} onClick={() => selectConversation(conversation.id)}><div className="chat-avatar">{conversation.company.slice(0, 2).toUpperCase()}</div><div><strong>{conversation.company}</strong><span>{conversation.messages.at(-1)?.body}</span><small>{conversation.contact} · {new Date(conversation.updatedAt).toLocaleDateString()}</small></div>{conversation.unreadByAdmin > 0 && <b>{conversation.unreadByAdmin}</b>}</button>)}</aside>
      <div className="admin-chat-panel">{active ? <><header><div><Building2/><div><strong>{active.company}</strong><span>{active.contact} · {active.email}</span></div></div><button onClick={toggleStatus}>{active.status === "Open" ? <><Check/>Close conversation</> : "Reopen conversation"}</button></header><div className="admin-chat-thread">{active.messages.map((message) => <div className={`admin-chat-message ${message.sender}`} key={message.id}><span>{message.sender === "admin" ? "Hi-Five team" : active.contact}</span><p>{message.body}</p><small>{new Date(message.sentAt).toLocaleString()}</small></div>)}</div><form onSubmit={sendReply}><UserRound/><textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder={`Reply to ${active.contact}…`} maxLength={2000} required/><button aria-label="Send reply"><Send/></button></form></> : <div className="admin-chat-placeholder"><MessageCircle/><h3>SELECT A CONVERSATION.</h3><p>Buyer messages and contact details will appear here.</p></div>}</div>
    </section>
  </>;
}
