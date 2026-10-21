import { useEffect, useState } from "react";
import { Download, ShieldAlert, Zap, Plug, User, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useGet, useMut, http, errMsg } from "@/lib/api";
import { useAuth } from "@/context/Auth";
import { cn } from "@/lib/utils";
import { PageHeader, Card, Tag, Field, Sel } from "@/components/app/kit";

const CUR = ["USD", "GBP", "EUR", "CAD", "AUD", "INR", "SGD", "AED"].map((c) => ({ value: c, label: c }));
const STATUS_TONE = { connected: "ok", not_configured: "warning", not_implemented: "muted" };
const STATUS_LABEL = { connected: "Connected", not_configured: "Not configured", not_implemented: "Not yet available" };

function Profile() {
  const { user, setUser } = useAuth();
  const mut = useMut();
  const [f, setF] = useState({});
  useEffect(() => { const s = user?.settings || {}; setF({ name: user?.name, company_name: user?.profile?.company_name || "", role: user?.profile?.role || "", work_start: s.work_start || "09:00", work_end: s.work_end || "18:00", daily_capacity_minutes: s.daily_capacity_minutes || 360, currency: s.currency || "USD" }); }, [user]);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  return (
    <Card title="Profile & working rhythm" icon={User} testid="settings-profile">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name || ""} onChange={set("name")} data-testid="settings-name" /></Field>
        <Field label="Company"><Input value={f.company_name || ""} onChange={set("company_name")} data-testid="settings-company" /></Field>
        <Field label="Role"><Input value={f.role || ""} onChange={set("role")} data-testid="settings-role" /></Field>
        <Field label="Currency"><Sel value={f.currency} onChange={set("currency")} options={CUR} testid="settings-currency" /></Field>
        <Field label="Work starts"><Input type="time" value={f.work_start || ""} onChange={set("work_start")} data-testid="settings-work-start" /></Field>
        <Field label="Work ends"><Input type="time" value={f.work_end || ""} onChange={set("work_end")} data-testid="settings-work-end" /></Field>
        <Field label="Focus capacity per day (min)"><Input type="number" value={f.daily_capacity_minutes || ""} onChange={set("daily_capacity_minutes")} data-testid="settings-capacity" /></Field>
      </div>
      <Button className="mt-4" data-testid="settings-save-btn" onClick={async () => setUser(await mut("patch", "/me/profile", { ...f, company_name: f.company_name || null, role: f.role || null, daily_capacity_minutes: Number(f.daily_capacity_minutes) }, "Settings saved"))}>Save</Button>
    </Card>
  );
}

function Automations() {
  const mut = useMut();
  const rules = useGet("/automations").data || [];
  const runs = useGet("/automations/runs").data || [];
  return (
    <Card title="Automations" icon={Zap} className="lg:col-span-2" testid="settings-automations">
      <p className="mb-3 text-xs text-muted-foreground">Internal automations only change records inside Founder OS. External actions (sending email, publishing, moving money) are never automated.</p>
      <div className="grid gap-2 md:grid-cols-2">{rules.map((r) => (
        <div key={r.key} className="rounded-lg border p-3" data-testid={`rule-${r.key}`}>
          <div className="flex items-center justify-between"><span className="text-sm font-semibold">{r.name}</span><Switch checked={r.enabled} onCheckedChange={(v) => mut("put", `/automations/${r.key}`, { enabled: v }, v ? "Automation on" : "Automation paused")} data-testid={`rule-switch-${r.key}`} /></div>
          <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground"><div><b>When</b> {r.trigger}</div><div><b>If</b> {r.condition}</div><div><b>Then</b> {r.action}</div></div>
        </div>))}</div>
      <div className="eyebrow mb-2 mt-5">Run log (audit trail)</div>
      <div className="max-h-72 overflow-y-auto rounded-lg border">{runs.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No automation runs yet.</p> : runs.map((r) => (
        <div key={r.id} className="flex items-center gap-3 border-b px-3 py-2 text-xs last:border-0" data-testid={`run-${r.id}`}>
          <Tag tone={r.status === "success" ? "ok" : r.status === "failed" ? "risk" : "muted"}>{r.status}</Tag>
          <span className="w-40 shrink-0 truncate font-medium">{r.rule}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.error || r.result}</span>
          <span className="num hidden shrink-0 text-muted-foreground sm:inline">{r.started_at.slice(0, 16).replace("T", " ")}</span>
          {r.status === "failed" && <button onClick={() => mut("post", `/automations/runs/${r.id}/retry`, null, "Retried")} data-testid={`run-retry-${r.id}`} aria-label="Retry"><RotateCcw className="h-3.5 w-3.5" /></button>}
        </div>))}</div>
    </Card>
  );
}

function Integrations() {
  const list = useGet("/integrations").data || [];
  const [testing, setTesting] = useState(false);
  const testEmail = async () => {
    setTesting(true);
    try { const { data } = await http.post("/integrations/email/test"); toast.success(`Test email sent to ${data.sent_to}`); }
    catch (e) { toast.error(errMsg(e)); } finally { setTesting(false); }
  };
  return (
    <Card title="Integrations" icon={Plug} testid="settings-integrations">
      <div className="space-y-2">{list.map((i) => (
        <div key={i.key} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0" data-testid={`integration-${i.key}`}>
          <div><div className="text-sm font-medium">{i.name}</div><div className="text-[11px] text-muted-foreground">{i.detail}</div>
            {i.key === "email" && i.status === "connected" && <button className="mt-1 text-[11px] font-medium underline underline-offset-2 disabled:opacity-50" onClick={testEmail} disabled={testing} data-testid="email-test-btn">{testing ? "Sending…" : "Send me a test email"}</button>}
          </div>
          <Tag tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Tag>
        </div>))}</div>
    </Card>
  );
}

function Activity() {
  const list = useGet("/activity", { limit: 60 }).data || [];
  return (
    <Card title="Activity log" icon={History} testid="settings-activity">
      <ul className="max-h-80 space-y-1.5 overflow-y-auto text-xs">{list.map((a) => (
        <li key={a.id} className="flex gap-2"><span className="num shrink-0 text-muted-foreground">{a.at.slice(5, 16).replace("T", " ")}</span><span className="truncate"><b>{a.action}</b> {a.entity} · {a.title}{a.note ? ` — ${a.note}` : ""}</span></li>))}</ul>
    </Card>
  );
}

function Privacy() {
  const { user, setUser } = useAuth();
  const [confirm, setConfirm] = useState("");
  const exportData = async () => {
    try {
      const { data } = await http.get("/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `founder-os-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async () => {
    try { await http.delete("/account", { data: { confirm } }); localStorage.removeItem("fos_token"); setUser(false); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Card title="Data & privacy" icon={ShieldAlert} testid="settings-privacy">
      <p className="text-xs text-muted-foreground">All records are private to your account and isolated on the server. The AI reads only your own records when you ask it something.</p>
      <Button variant="outline" className="mt-3" onClick={exportData} data-testid="export-btn"><Download className="mr-1 h-4 w-4" />Export all my data (JSON)</Button>
      <div className={cn("mt-5 rounded-lg border border-risk/30 p-3", user?.role === "admin" && "opacity-60")}>
        <div className="text-sm font-semibold text-risk">Delete account</div>
        <p className="text-[11px] text-muted-foreground">{user?.role === "admin" ? "The owner account cannot be deleted from inside the app." : "Permanently deletes your account and every record. Type DELETE to confirm."}</p>
        <div className="mt-2 flex gap-2"><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" disabled={user?.role === "admin"} data-testid="delete-confirm-input" />
          <Button variant="destructive" disabled={confirm !== "DELETE" || user?.role === "admin"} onClick={del} data-testid="delete-account-btn">Delete</Button></div>
      </div>
    </Card>
  );
}

function Security() {
  const { user } = useAuth();
  const [f, setF] = useState({ current_password: "", new_password: "" });
  if (user?.auth_provider === "google") return null;
  const save = async () => { try { await http.post("/auth/change-password", f); toast.success("Password changed"); setF({ current_password: "", new_password: "" }); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card title="Password" icon={ShieldAlert} testid="settings-password">
      <div className="grid gap-2 sm:grid-cols-2"><Input type="password" placeholder="Current password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} data-testid="pw-current-input" />
        <Input type="password" placeholder="New password (8+ characters)" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} data-testid="pw-new-input" /></div>
      <Button className="mt-3" onClick={save} disabled={!f.current_password || f.new_password.length < 8} data-testid="pw-save-btn">Change password</Button>
      <p className="mt-2 text-[11px] text-muted-foreground">Forgot it? Use "Forgot password?" on the sign-in screen once email is connected.</p>
    </Card>
  );
}

export default function Settings() {
  return (
    <div data-testid="settings-page">
      <PageHeader eyebrow="System" title="Settings & Integrations" subtitle="Your rhythm, automations, integrations and data controls — all transparent." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Profile /><Integrations /><Automations /><Privacy /><Security /><Activity />
      </div>
    </div>
  );
}
