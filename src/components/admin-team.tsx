"use client";

import { Copy, KeyRound, Save, ShieldCheck, UserPlus, Users } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type StaffUser = {
  id: string; email: string; display_name: string; system_role: "SALES_REP" | "ADMIN" | "SUPER_ADMIN";
  status: string; active_sessions: number; last_seen_at: string | null;
  commission_rate_bps: number; custom_pricing_enabled: boolean; assigned_customer_ids: string[];
};
type Customer = { id: string; display_name: string };

export function AdminTeam() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [message, setMessage] = useState("Loading staff accounts…");
  const [link, setLink] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffUser["system_role"]>("SALES_REP");
  const [setupMethod, setSetupMethod] = useState("ACTIVATION_LINK");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/team", { cache: "no-store" });
    const result = await response.json() as { users?: StaffUser[]; customers?: Customer[] };
    if (!response.ok) throw new Error();
    setUsers(result.users ?? []); setCustomers(result.customers ?? []); setMessage("");
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(() => setMessage("Staff accounts could not be loaded.")), 0); return () => window.clearTimeout(timer); }, [load]);
  const act = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/admin/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as { message?: string; activationUrl?: string };
    if (!response.ok) { setMessage(result.message || "The change could not be saved."); return false; }
    setLink(result.activationUrl ?? "");
    await load(); setMessage(result.message || "Saved."); return true;
  };
  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const formElement=event.currentTarget,form = new FormData(formElement);
    const saved=await act({ action: "invite", displayName: form.get("displayName"), email: form.get("email"), role: form.get("role"),
      commissionRate: Number(form.get("commissionRate") || 0), customPricingEnabled: form.get("customPricingEnabled") === "on",
      customerIds: form.getAll("customerIds").map(String), setupMethod: form.get("setupMethod"), temporaryPassword: form.get("temporaryPassword")??"" });
    if(saved){formElement.reset();setInviteRole("SALES_REP");setSetupMethod("ACTIVATION_LINK")}
  };
  return <>
    <div className="admin-section-head"><div><span className="eyebrow">Super-admin controls</span><h2>STAFF & SALES ACCESS.</h2><p>Create administrators and restricted sales representatives. Commission, pricing authority, and assigned accounts are controlled internally.</p></div></div>
    {message && <div className="gate-message">{message}</div>}
    {link && <div className="gate-message activation-link"><b>One-time activation link</b><span>{link}</span><button className="link-button" onClick={() => void navigator.clipboard.writeText(link)}><Copy/>Copy</button></div>}
    <form className="admin-card operations-form" onSubmit={invite}>
      <label>Name<input name="displayName" required/></label>
      <label>Email<input name="email" type="email" required/></label>
      <label>Role<select name="role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as StaffUser["system_role"])}><option value="SALES_REP">Sales representative</option><option value="ADMIN">Administrator</option><option value="SUPER_ADMIN">Super administrator</option></select></label>
      {inviteRole === "SALES_REP" ? <><label>Commission rate (%)<input name="commissionRate" type="number" min="0" max="100" step="0.01" defaultValue="0" required/></label><label><input name="customPricingEnabled" type="checkbox"/> Allow custom invoice pricing</label><fieldset className="full-field"><legend>Customer accounts this representative may invoice</legend><div className="sales-customer-checklist">{customers.map((customer)=><label key={customer.id}><input name="customerIds" value={customer.id} type="checkbox"/>{customer.display_name}</label>)}</div><small>Assignments can be changed at any time after the login is created.</small></fieldset></> : null}
      <label>Account setup<select name="setupMethod" value={setupMethod} onChange={(event)=>setSetupMethod(event.target.value)}><option value="ACTIVATION_LINK">Email activation link</option><option value="TEMPORARY_PASSWORD">Super Admin creates temporary password</option></select></label>
      {setupMethod==="TEMPORARY_PASSWORD"?<label>Temporary password<input name="temporaryPassword" type="password" minLength={12} maxLength={200} pattern="(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{12,200}" title="Use 12 or more characters with at least one letter, one number, and one symbol." required/><small>Use 12+ characters with a letter, number, and symbol. The staff member must replace it at first sign-in.</small></label>:<p className="territory-note">The activation link expires after 24 hours. You can also copy it and send it directly.</p>}
      <button className="admin-button primary"><UserPlus/>{setupMethod==="TEMPORARY_PASSWORD"?"Create staff login":"Create and send activation"}</button>
    </form>
    <div className="admin-table-wrap"><table><thead><tr><th>Staff member</th><th>Role</th><th>Status</th><th>Sessions</th><th>Controls</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><b>{user.display_name}</b><small>{user.email}</small>{user.system_role === "SALES_REP" ? <SalesSettings user={user} customers={customers} save={act}/> : null}</td><td><ShieldCheck/> {user.system_role.replaceAll("_", " ")}</td><td>{user.status}</td><td>{user.active_sessions}<small>{user.last_seen_at ? new Date(user.last_seen_at).toLocaleString() : "Never signed in"}</small></td><td><div className="decision-actions"><button onClick={() => void act({ action: "reset", id: user.id })}><KeyRound/>Reset password</button><button onClick={() => void act({ action: "revoke_sessions", id: user.id })}><Users/>Revoke sessions</button><button onClick={() => void act({ action: "status", id: user.id, status: user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}>{user.status === "ACTIVE" ? "Suspend" : "Activate"}</button></div></td></tr>)}</tbody></table></div>
  </>;
}

function SalesSettings({ user, customers, save }: { user: StaffUser; customers: Customer[]; save: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void save({ action: "sales_settings", id: user.id, commissionRate: Number(form.get("commissionRate")),
      customPricingEnabled: form.get("customPricingEnabled") === "on", customerIds: form.getAll("customerIds").map(String) });
  };
  return <details className="sales-rep-settings"><summary>Commission & assigned customers</summary><form onSubmit={submit}>
    <label>Commission rate (%)<input name="commissionRate" type="number" min="0" max="100" step="0.01" defaultValue={(user.commission_rate_bps / 100).toFixed(2)} required/></label>
    <label><input name="customPricingEnabled" type="checkbox" defaultChecked={user.custom_pricing_enabled}/> Allow custom invoice pricing</label>
    <fieldset><legend>Assigned customer accounts</legend><div className="sales-customer-checklist">{customers.map((customer) => <label key={customer.id}><input name="customerIds" value={customer.id} type="checkbox" defaultChecked={user.assigned_customer_ids.includes(customer.id)}/>{customer.display_name}</label>)}</div></fieldset>
    <button className="admin-button primary"><Save/>Save sales settings</button>
  </form></details>;
}
