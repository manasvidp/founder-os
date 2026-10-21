import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Target, Compass, Pencil, History, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGet, useMut } from "@/lib/api";
import { useAuth } from "@/context/Auth";
import { todayStr, fdate } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { PageHeader, Card, Empty, Bar, Tag, Sel, Field, DOMAINS, HORIZONS, ProgressRing, useLookups } from "@/components/app/kit";
import { TaskRow } from "@/components/app/TaskRow";
import TaskDialog from "@/components/app/TaskDialog";
import { ProjectDialog } from "./Projects";

const GSTATUS = ["active", "achieved", "paused", "abandoned"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const PROFILE = [["company_vision", "Company vision"], ["mission", "Mission"], ["positioning", "Positioning & advantage"], ["target_customers", "Target customers"],
  ["life_vision", "Life vision"], ["values", "Values"], ["definition_of_success", "Definition of success"]];
const NUMS = ["baseline", "target", "current"];

function GoalDialog({ open, onOpenChange, goal, defaults }) {
  const { goals } = useLookups();
  const mut = useMut();
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF(goal ? { ...goal, change_note: "" } : { title: "", horizon: "quarter", domain: "business", status: "active", start_date: todayStr(), ...defaults }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    const keys = ["title", "description", "horizon", "domain", "area", "parent_id", "metric_name", "unit", "baseline", "target", "current", "start_date", "due_date", "status", "rationale", "change_note"];
    const body = {};
    keys.forEach((k) => { let v = f[k]; if (v === "" || v === undefined) v = null; if (NUMS.includes(k) && v != null) v = Number(v); body[k] = v; });
    if (!goal) delete body.change_note;
    if (goal) await mut("patch", `/goals/${goal.id}`, body, "Goal saved");
    else await mut("post", "/goals", body, "Goal created");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="goal-dialog">
        <DialogHeader><DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Input placeholder="What do you want to achieve?" value={f.title || ""} onChange={set("title")} data-testid="goal-title-input" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Horizon"><Sel value={f.horizon} onChange={set("horizon")} options={HORIZONS} testid="goal-horizon-select" /></Field>
            <Field label="Area"><Sel value={f.domain} onChange={set("domain")} options={DOMAINS} testid="goal-domain-select" /></Field>
            <Field label="Start"><Input type="date" value={f.start_date || ""} onChange={set("start_date")} data-testid="goal-start-input" /></Field>
            <Field label="Due"><Input type="date" value={f.due_date || ""} onChange={set("due_date")} data-testid="goal-due-input" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="Metric" className="col-span-2"><Input value={f.metric_name || ""} onChange={set("metric_name")} placeholder="e.g. MRR" data-testid="goal-metric-input" /></Field>
            <Field label="Baseline"><Input type="number" value={f.baseline ?? ""} onChange={set("baseline")} data-testid="goal-baseline-input" /></Field>
            <Field label="Target"><Input type="number" value={f.target ?? ""} onChange={set("target")} data-testid="goal-target-input" /></Field>
            <Field label="Current"><Input type="number" value={f.current ?? ""} onChange={set("current")} data-testid="goal-current-input" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit"><Input value={f.unit || ""} onChange={set("unit")} placeholder="$, clients, kg…" data-testid="goal-unit-input" /></Field>
            <Field label="Status"><Sel value={f.status} onChange={set("status")} options={GSTATUS} testid="goal-status-select" /></Field>
          </div>
          <Field label="Parent goal (ladders up to)"><Sel allowNone value={f.parent_id} onChange={set("parent_id")} options={goals.filter((g) => g.id !== goal?.id).map((g) => ({ value: g.id, label: g.title }))} testid="goal-parent-select" /></Field>
          <Field label="Rationale — why this matters"><Textarea rows={2} value={f.rationale || ""} onChange={set("rationale")} data-testid="goal-rationale-input" /></Field>
          {goal && <Field label="Reason for change (preserved in history)"><Input value={f.change_note || ""} onChange={set("change_note")} data-testid="goal-change-note" /></Field>}
        </div>
        <DialogFooter><Button onClick={save} disabled={!f.title?.trim()} data-testid="goal-save-btn">{goal ? "Save" : "Create goal"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoalSheet({ id, onClose }) {
  const mut = useMut();
  const { byId } = useLookups();
  const { data } = useGet(`/goals/${id}/context`, { date: todayStr() }, { enabled: !!id });
  const [edit, setEdit] = useState(false);
  const [proj, setProj] = useState(false);
  const [task, setTask] = useState(null);
  const [newTask, setNewTask] = useState(false);
  const [cur, setCur] = useState("");
  const g = data?.goal;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="goal-sheet">
        {!g ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> : <>
          <SheetHeader><div className="eyebrow">{HORIZONS.find((h) => h.value === g.horizon)?.label} · {g.domain}</div><SheetTitle className="text-left">{g.title}</SheetTitle></SheetHeader>
          <div className="mt-5 flex items-center gap-4">
            <ProgressRing value={g.progress} size={84} stroke={8} color={g.domain === "personal" ? "hsl(var(--ok))" : "hsl(var(--brand))"}><span className="num font-bold" data-testid="goal-progress-value">{g.progress == null ? "—" : `${g.progress}%`}</span></ProgressRing>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>Progress from <b>{g.progress_source}</b>{g.expected != null && <> · expected {g.expected}% by now</>}</div>
              {g.metric_name && <div className="num">{g.metric_name}: {g.baseline ?? 0} → <b className="text-foreground">{g.current ?? "—"}</b> / {g.target} {g.unit}</div>}
              <div className="flex gap-1">{g.behind && <Tag tone="risk">Behind</Tag>}{g.no_plan && <Tag tone="warning">No execution plan</Tag>}<Tag>{g.status}</Tag></div>
            </div>
          </div>
          {g.metric_name && (
            <form className="mt-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (cur === "") return; await mut("patch", `/goals/${g.id}`, { current: Number(cur), change_note: "Metric update" }, "Progress recorded"); setCur(""); }}>
              <Input type="number" value={cur} onChange={(e) => setCur(e.target.value)} placeholder={`Record current ${g.metric_name}`} data-testid="goal-record-input" />
              <Button type="submit" variant="outline" data-testid="goal-record-btn">Record</Button>
            </form>
          )}
          {g.rationale && <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm"><span className="eyebrow block">Why</span>{g.rationale}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEdit(true)} data-testid="goal-edit-btn"><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
            <Button size="sm" variant="outline" onClick={() => setProj(true)} data-testid="goal-add-project-btn"><FolderKanban className="mr-1 h-3.5 w-3.5" />Add project</Button>
            <Button size="sm" variant="outline" onClick={() => setNewTask(true)} data-testid="goal-add-task-btn"><Plus className="mr-1 h-3.5 w-3.5" />Add task</Button>
            <Button size="sm" variant="ghost" className="text-risk" onClick={async () => { if (window.confirm("Delete this goal? Linked projects and tasks are unlinked, not deleted. Consider marking it abandoned to keep history.")) { await mut("delete", `/goals/${g.id}`, null, "Goal deleted"); onClose(); } }} data-testid="goal-delete-btn">Delete</Button>
          </div>
          {data.parent && <div className="mt-5 text-xs"><span className="eyebrow">Ladders up to</span><div className="mt-1 font-medium">{data.parent.title}</div></div>}
          {data.children.length > 0 && <div className="mt-5"><div className="eyebrow mb-2">Supporting goals</div>{data.children.map((c) => <div key={c.id} className="mb-2"><div className="flex justify-between text-sm"><span>{c.title}</span><span className="num text-xs">{c.progress ?? "—"}%</span></div><Bar value={c.progress} /></div>)}</div>}
          <div className="mt-5"><div className="eyebrow mb-2">Projects</div>
            {data.projects.length === 0 ? <p className="text-xs text-muted-foreground">No projects yet — this goal has no execution plan.</p> : data.projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="mb-2 block rounded-lg border p-2.5 hover:bg-muted" data-testid={`goal-project-${p.id}`}>
                <div className="flex justify-between text-sm"><span>{p.title}</span><span className="num text-xs">{p.progress}%</span></div><Bar value={p.progress} className="mt-1.5" />
              </Link>))}
          </div>
          <div className="mt-5"><div className="eyebrow mb-1">Directly linked tasks</div>{data.tasks.map((t) => <TaskRow key={t.id} task={t} onOpen={setTask} byId={byId} />)}</div>
          <div className="mt-5"><div className="eyebrow mb-2 flex items-center gap-1"><History className="h-3 w-3" />Decision history</div>
            <ul className="space-y-2 text-xs">{data.history.map((h) => (
              <li key={h.id} className="border-l-2 pl-2"><span className="text-muted-foreground">{fdate(h.at.slice(0, 10))}</span> · {h.action}
                {Object.entries(h.diff || {}).filter(([k]) => k !== "change_note").slice(0, 4).map(([k, [a, b]]) => <div key={k} className="num text-muted-foreground">{k}: {String(a ?? "—")} → {String(b ?? "—")}</div>)}
                {h.note && <div className="italic">“{h.note}”</div>}</li>))}</ul>
          </div>
          <GoalDialog open={edit} onOpenChange={setEdit} goal={g} />
          <ProjectDialog open={proj} onOpenChange={setProj} defaults={{ goal_id: g.id, domain: g.domain }} />
          <TaskDialog open={newTask || !!task} onOpenChange={(o) => { if (!o) { setNewTask(false); setTask(null); } }} task={task} defaults={{ goal_id: g.id, domain: g.domain }} />
        </>}
      </SheetContent>
    </Sheet>
  );
}

function StrategyProfile() {
  const { user, setUser } = useAuth();
  const mut = useMut();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({});
  const p = user?.profile || {};
  const filled = PROFILE.filter(([k]) => p[k]);
  return (
    <Card title="Vision & strategy" icon={Compass} testid="strategy-profile" action={<Button size="sm" variant="ghost" onClick={() => { setF({ ...p }); setEdit(true); }} data-testid="edit-strategy-btn"><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>}>
      {filled.length === 0 ? <p className="text-sm text-muted-foreground">Write down your company vision, mission and life vision. Your Chief of Staff uses them to judge trade-offs.</p> : (
        <div className="grid gap-4 md:grid-cols-2">{filled.map(([k, l]) => <div key={k}><div className="eyebrow">{l}</div><p className="mt-1 whitespace-pre-line text-sm">{p[k]}</p></div>)}</div>
      )}
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Vision & strategy</DialogTitle></DialogHeader>
          <div className="grid gap-3">{PROFILE.map(([k, l]) => <Field key={k} label={l}><Textarea rows={2} value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`strategy-${k}`} /></Field>)}</div>
          <DialogFooter><Button data-testid="strategy-save-btn" onClick={async () => { const body = {}; PROFILE.forEach(([k]) => { body[k] = f[k] || null; }); setUser(await mut("patch", "/me/profile", body, "Strategy saved")); setEdit(false); }}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function Plan() {
  const { perspective } = useAuth();
  const [params, setParams] = useSearchParams();
  const [horizon, setHorizon] = useState("quarter");
  const [creating, setCreating] = useState(false);
  const { data: ov } = useGet("/strategy/overview", { date: todayStr() });
  const raw = ov?.goals || [];
  const goalId = params.get("goal");
  const enriched = {};
  const goals = raw.filter((g) => (perspective === "combined" || g.domain === perspective) && g.horizon === horizon);
  const counts = Object.fromEntries(HORIZONS.map((h) => [h.value, raw.filter((g) => g.horizon === h.value && (perspective === "combined" || g.domain === perspective)).length]));
  return (
    <div data-testid="plan-page">
      <PageHeader eyebrow="Strategy" title="Plan" subtitle="Vision → three-year direction → annual objectives → quarterly outcomes → monthly and weekly commitments."
        actions={<Button onClick={() => setCreating(true)} data-testid="new-goal-btn"><Plus className="mr-1 h-4 w-4" />New goal</Button>} />
      <StrategyProfile />
      <div className="mb-4 mt-6 flex gap-1 overflow-x-auto" data-testid="horizon-tabs">
        {HORIZONS.map((h) => (
          <button key={h.value} onClick={() => setHorizon(h.value)} data-testid={`horizon-${h.value}`}
            className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm", horizon === h.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            {h.label}<span className="num text-xs opacity-70">{counts[h.value]}</span>
          </button>
        ))}
      </div>
      {goals.length === 0 ? <Empty icon={Target} title={`No ${HORIZONS.find((h) => h.value === horizon).label.toLowerCase()} goals`} text="Goals carry a metric, baseline and target so progress is measured, not guessed." action={<Button size="sm" variant="outline" onClick={() => setCreating(true)}>Add goal</Button>} testid="goals-empty" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g0) => {
            const g = { ...g0, ...(enriched[g0.id] || {}) };
            return (
              <button key={g.id} onClick={() => setParams({ goal: g.id })} className="card-hover rounded-xl border bg-card p-5 text-left" data-testid={`goal-card-${g.id}`}>
                <div className="flex items-start justify-between gap-2"><span className="font-semibold leading-snug">{g.title}</span><Tag tone={g.domain}>{g.domain}</Tag></div>
                <div className="mt-4 flex items-center gap-2"><Bar value={g.progress} expected={g.expected} color={g.domain === "personal" ? "bg-ok" : "bg-brand"} /><span className="num text-xs">{g.progress == null ? "—" : `${g.progress}%`}</span></div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {g.status !== "active" && <Tag>{g.status}</Tag>}{g.behind && <Tag tone="risk">Behind</Tag>}{g.no_plan && <Tag tone="warning">No plan</Tag>}
                  {g.metric_name && <span className="num">{g.metric_name} {g.current ?? "—"}/{g.target ?? "—"}</span>}
                  {g.due_date && <span>· due {fdate(g.due_date)}</span>}
                  {g.project_count != null && <span>· {g.project_count} projects</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <GoalDialog open={creating} onOpenChange={setCreating} defaults={{ horizon, domain: perspective === "personal" ? "personal" : "business" }} />
      <GoalSheet id={goalId} onClose={() => setParams({})} />
    </div>
  );
}
