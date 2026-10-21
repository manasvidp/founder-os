import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Briefcase, AlertTriangle, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useGet, useMut } from "@/lib/api";
import { useAuth } from "@/context/Auth";
import { todayStr, money, fdate } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { PageHeader, Card, Stat, Empty, Tag, Sel, Field, Bar, useLookups } from "@/components/app/kit";

export const KINDS = [["kpi", "KPIs"], ["product", "Products & services"], ["revenue_stream", "Revenue streams"], ["assumption", "Model assumptions"], ["procedure", "Operations & SOPs"],
  ["team_member", "Team"], ["meeting", "Meetings"], ["risk", "Risks & blockers"], ["decision", "Decisions"], ["opportunity", "Opportunities"]];
const LABEL = Object.fromEntries(KINDS);
const SINGULAR = { kpi: "KPI", product: "product", revenue_stream: "revenue stream", assumption: "assumption", procedure: "procedure", team_member: "team member", meeting: "meeting", risk: "risk", decision: "decision", opportunity: "opportunity" };
const KEYS = ["kind", "title", "description", "owner", "status", "goal_id", "project_id", "contact_id", "unit", "baseline", "target", "current", "amount", "due_date", "cadence", "severity", "action_items"];
const NUM = ["baseline", "target", "current", "amount"];

function BizDialog({ open, onOpenChange, item, kind }) {
  const mut = useMut();
  const { goals, projects, contacts } = useLookups();
  const [f, setF] = useState({});
  const [ai, setAi] = useState("");
  useEffect(() => { if (open) setF(item ? { ...item } : { kind, title: "", action_items: [] }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const k = f.kind;
  const save = async () => {
    const body = {};
    KEYS.forEach((x) => { let v = f[x]; if (v === "" || v === undefined) v = null; if (NUM.includes(x) && v != null) v = Number(v); if (x !== "action_items" || v) body[x] = v; });
    if (item) { delete body.kind; await mut("patch", `/biz/${item.id}`, body, "Saved"); } else await mut("post", "/biz", body, "Added");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="biz-dialog">
        <DialogHeader><DialogTitle>{item ? "Edit" : "Add"} · {LABEL[k]}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label={k === "team_member" ? "Name" : "Title"} className="col-span-2"><Input value={f.title || ""} onChange={set("title")} data-testid="biz-title-input" /></Field>
          <Field label={k === "team_member" ? "Role & responsibilities" : "Description"} className="col-span-2"><Textarea rows={3} value={f.description || ""} onChange={set("description")} data-testid="biz-desc-input" /></Field>
          <Field label="Owner"><Input value={f.owner || ""} onChange={set("owner")} data-testid="biz-owner-input" /></Field>
          <Field label="Status"><Input value={f.status || ""} onChange={set("status")} placeholder="active, open, done…" data-testid="biz-status-input" /></Field>
          {["kpi", "assumption"].includes(k) && <>
            <Field label="Unit"><Input value={f.unit || ""} onChange={set("unit")} data-testid="biz-unit-input" /></Field>
            <Field label="Baseline"><Input type="number" value={f.baseline ?? ""} onChange={set("baseline")} data-testid="biz-baseline-input" /></Field>
            <Field label="Target"><Input type="number" value={f.target ?? ""} onChange={set("target")} data-testid="biz-target-input" /></Field>
            <Field label="Current (actual)"><Input type="number" value={f.current ?? ""} onChange={set("current")} data-testid="biz-current-input" /></Field>
          </>}
          {["product", "revenue_stream", "opportunity"].includes(k) && <Field label={k === "product" ? "Price" : "Monthly value"}><Input type="number" value={f.amount ?? ""} onChange={set("amount")} data-testid="biz-amount-input" /></Field>}
          {["procedure", "kpi"].includes(k) && <Field label="Cadence"><Sel allowNone value={f.cadence} onChange={set("cadence")} options={["daily", "weekly", "monthly", "quarterly", "ad_hoc"].map((v) => ({ value: v, label: v }))} testid="biz-cadence-select" /></Field>}
          {["risk", "opportunity"].includes(k) && <Field label="Severity / impact"><Sel allowNone value={f.severity} onChange={set("severity")} options={["low", "medium", "high"].map((v) => ({ value: v, label: v }))} testid="biz-severity-select" /></Field>}
          <Field label={k === "meeting" ? "Date" : "Due / review date"}><Input type="date" value={f.due_date || ""} onChange={set("due_date")} data-testid="biz-date-input" /></Field>
          <Field label="Goal"><Sel allowNone value={f.goal_id} onChange={set("goal_id")} options={goals.map((g) => ({ value: g.id, label: g.title }))} testid="biz-goal-select" /></Field>
          <Field label="Project"><Sel allowNone value={f.project_id} onChange={set("project_id")} options={projects.map((p) => ({ value: p.id, label: p.title }))} testid="biz-project-select" /></Field>
          <Field label="Contact"><Sel allowNone value={f.contact_id} onChange={set("contact_id")} options={contacts.map((c) => ({ value: c.id, label: c.name }))} testid="biz-contact-select" /></Field>
          {k === "meeting" && <Field label="Action items" className="col-span-2">
            {(f.action_items || []).map((a, i) => <div key={a.id || i} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={a.done} onChange={() => set("action_items")(f.action_items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />{a.title}</div>)}
            <Input value={ai} onChange={(e) => setAi(e.target.value)} placeholder="Add action item and press Enter" data-testid="biz-action-input"
              onKeyDown={(e) => { if (e.key === "Enter" && ai.trim()) { e.preventDefault(); set("action_items")([...(f.action_items || []), { title: ai.trim(), done: false }]); setAi(""); } }} />
          </Field>}
        </div>
        <DialogFooter><Button onClick={save} disabled={!f.title?.trim()} data-testid="biz-save-btn">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Health({ items }) {
  const { currency } = useAuth();
  const fin = useGet("/finance/summary", { date: todayStr(), domain: "business" }).data;
  const ov = useGet("/strategy/overview", { date: todayStr() }).data;
  const contacts = useGet("/contacts", { domain: "business" }).data || [];
  const goals = (ov?.goals || []).filter((g) => g.domain === "business" && g.status === "active");
  const risks = items.filter((i) => i.kind === "risk" && i.status !== "closed" && i.status !== "done");
  const pipe = contacts.filter((c) => ["lead", "contacted", "meeting", "proposal"].includes(c.stage));
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-6" data-testid="business-health">
      <Stat label="Cash" value={money(fin?.cash, currency, true)} sub="your account balances" testid="bh-cash" />
      <Stat label="Revenue (month)" value={money(fin?.income, currency, true)} sub="actual" testid="bh-revenue" />
      <Stat label="Runway" value={fin?.runway_months != null ? `${fin.runway_months} mo` : "—"} testid="bh-runway" />
      <Stat label="Pipeline" value={money(pipe.reduce((a, c) => a + (c.deal_value || 0), 0), currency, true)} sub={`${pipe.length} open deals`} testid="bh-pipeline" />
      <Stat label="Goals on track" value={`${goals.filter((g) => !g.behind && !g.no_plan).length}/${goals.length}`} testid="bh-goals" />
      <Stat label="Open risks" value={risks.length} tone={risks.some((r) => r.severity === "high") ? "risk" : undefined} sub={`${risks.filter((r) => r.severity === "high").length} high`} testid="bh-risks" />
    </div>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const mut = useMut();
  const p = user?.profile || {};
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({});
  const F = [["company_name", "Company"], ["mission", "Mission"], ["company_vision", "Vision & strategic direction"], ["business_model", "Business model"], ["positioning", "Positioning"], ["target_customers", "Target customers"]];
  return (
    <Card title="Company profile" icon={Briefcase} testid="company-profile" action={<Button size="sm" variant="ghost" onClick={() => { setF({ ...p }); setEdit(!edit); }} data-testid="company-edit-btn"><Pencil className="h-3.5 w-3.5" /></Button>}>
      {edit ? <div className="grid gap-2">{F.map(([k, l]) => <Field key={k} label={l}><Textarea rows={2} value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`company-${k}`} /></Field>)}
        <Button data-testid="company-save-btn" onClick={async () => { const b = {}; F.forEach(([k]) => { b[k] = f[k] || null; }); setUser(await mut("patch", "/me/profile", b, "Company profile saved")); setEdit(false); }}>Save</Button></div>
        : F.some(([k]) => p[k]) ? <div className="grid gap-3 md:grid-cols-3">{F.filter(([k]) => p[k]).map(([k, l]) => <div key={k}><div className="eyebrow">{l}</div><p className="mt-0.5 whitespace-pre-line text-sm">{p[k]}</p></div>)}</div>
        : <p className="text-sm text-muted-foreground">Describe your company, business model and direction. These feed your AI Chief of Staff and Content Studio.</p>}
    </Card>
  );
}

export default function Business() {
  const mut = useMut();
  const { byId } = useLookups();
  const items = useGet("/biz").data || [];
  const [kind, setKind] = useState("kpi");
  const [open, setOpen] = useState(null);
  const list = items.filter((i) => i.kind === kind);
  const toTasks = async (m) => {
    for (const a of (m.action_items || []).filter((x) => !x.done)) await mut("post", "/tasks", { title: a.title, status: "inbox", project_id: m.project_id, goal_id: m.goal_id, contact_id: m.contact_id, domain: "business" });
    await mut("patch", `/biz/${m.id}`, { action_items: m.action_items.map((x) => ({ ...x, done: true })) }, "Action items sent to your Inbox");
  };
  return (
    <div data-testid="business-page">
      <PageHeader eyebrow="Workspace" title="Business" subtitle="Company, model, KPIs, operations, team, risks and decisions — linked to your goals, projects and finance."
        actions={<Button onClick={() => setOpen({})} data-testid="new-biz-btn"><Plus className="mr-1 h-4 w-4" />Add {SINGULAR[kind]}</Button>} />
      <Health items={items} />
      <div className="mt-5"><Profile /></div>
      <div className="mb-4 mt-6 flex gap-1 overflow-x-auto" data-testid="biz-tabs">
        {KINDS.map(([k, l]) => <button key={k} onClick={() => setKind(k)} data-testid={`biz-tab-${k}`} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm", kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{l}<span className="num text-xs opacity-70">{items.filter((i) => i.kind === k).length}</span></button>)}
      </div>
      {list.length === 0 ? <Empty title={`No ${LABEL[kind].toLowerCase()} yet`} text="Everything here links to goals, projects and people so nothing is duplicated." testid="biz-empty" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((i) => {
          const pct = i.target != null && i.current != null && i.target !== (i.baseline || 0) ? Math.round(((i.current - (i.baseline || 0)) / (i.target - (i.baseline || 0))) * 100) : null;
          return (
            <div key={i.id} className="rounded-xl border bg-card p-4" data-testid={`biz-card-${i.id}`}>
              <div className="flex items-start justify-between gap-2"><span className="font-semibold">{i.title}</span>
                <span className="flex shrink-0 gap-1">{i.severity && <Tag tone={i.severity === "high" ? "risk" : i.severity === "medium" ? "warning" : "muted"}>{i.severity}</Tag>}{i.status && <Tag>{i.status}</Tag>}
                  <button onClick={() => setOpen(i)} aria-label="Edit" data-testid={`biz-edit-${i.id}`}><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                  <button onClick={() => window.confirm("Delete?") && mut("delete", `/biz/${i.id}`, null, "Deleted")} aria-label="Delete" data-testid={`biz-delete-${i.id}`}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button></span></div>
              {i.description && <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{i.description}</p>}
              {pct != null && <div className="mt-3"><div className="num mb-1 flex justify-between text-xs"><span>{i.current} / {i.target} {i.unit}</span><span>{pct}%</span></div><Bar value={pct} /></div>}
              {i.amount != null && <div className="num mt-2 text-sm">{i.amount}</div>}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {i.owner && <span>Owner: {i.owner}</span>}{i.cadence && <span>· {i.cadence}</span>}{i.due_date && <span>· {fdate(i.due_date)}</span>}
                {[i.goal_id, i.project_id, i.contact_id].filter(Boolean).map((id) => byId[id] && <span key={id}>· {byId[id]}</span>)}
              </div>
              {i.kind === "meeting" && (i.action_items || []).length > 0 && <div className="mt-3 border-t pt-2 text-xs">
                {i.action_items.map((a) => <div key={a.id} className={cn(a.done && "text-muted-foreground line-through")}>• {a.title}</div>)}
                {i.action_items.some((a) => !a.done) && <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => toTasks(i)} data-testid={`biz-to-tasks-${i.id}`}><ListPlus className="mr-1 h-3.5 w-3.5" />Send open actions to Inbox</Button>}
              </div>}
              {i.kind === "risk" && i.severity === "high" && <div className="mt-2 flex items-center gap-1 text-[11px] text-risk"><AlertTriangle className="h-3 w-3" />Review in your weekly review</div>}
            </div>
          );
        })}</div>
      )}
      <BizDialog open={!!open} onOpenChange={(o) => !o && setOpen(null)} item={open?.id ? open : null} kind={kind} />
    </div>
  );
}
