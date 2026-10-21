import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, FolderKanban, ArrowLeft, Trash2, Target, Flag, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useGet, useMut } from "@/lib/api";
import { todayStr, relDay, fdate } from "@/lib/fmt";
import { useAuth } from "@/context/Auth";
import { cn } from "@/lib/utils";
import { PageHeader, Card, Empty, Bar, Tag, Sel, Field, DOMAINS, useLookups, ProgressRing } from "@/components/app/kit";
import { TaskRow } from "@/components/app/TaskRow";
import TaskDialog from "@/components/app/TaskDialog";

const STATUS = [["planning", "Planning"], ["active", "Active"], ["on_hold", "On hold"], ["completed", "Completed"], ["cancelled", "Cancelled"]].map(([value, label]) => ({ value, label }));

export function ProjectDialog({ open, onOpenChange, project, defaults }) {
  const { goals } = useLookups();
  const mut = useMut();
  const nav = useNavigate();
  const [f, setF] = useState({});
  const [note, setNote] = useState("");
  const init = () => setF(project ? { ...project } : { title: "", description: "", status: "active", domain: "business", goal_id: null, ...defaults });
  useEffect(() => { if (open) { init(); setNote(""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    const body = { title: f.title, description: f.description || null, status: f.status, domain: f.domain, goal_id: f.goal_id || null, start_date: f.start_date || null, due_date: f.due_date || null };
    if (project) await mut("patch", `/projects/${project.id}`, { ...body, change_note: note || null }, "Project saved");
    else { const p = await mut("post", "/projects", body, "Project created"); nav(`/projects/${p.id}`); }
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="project-dialog">
        <DialogHeader><DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Input placeholder="Project name" value={f.title || ""} onChange={set("title")} data-testid="project-title-input" />
          <Textarea rows={3} placeholder="Outcome and scope" value={f.description || ""} onChange={set("description")} data-testid="project-desc-input" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status"><Sel value={f.status} onChange={set("status")} options={STATUS} testid="project-status-select" /></Field>
            <Field label="Area"><Sel value={f.domain} onChange={set("domain")} options={DOMAINS} testid="project-domain-select" /></Field>
            <Field label="Start"><Input type="date" value={f.start_date || ""} onChange={set("start_date")} data-testid="project-start-input" /></Field>
            <Field label="Due"><Input type="date" value={f.due_date || ""} onChange={set("due_date")} data-testid="project-due-input" /></Field>
          </div>
          <Field label="Supports goal"><Sel allowNone="Not linked to a goal" value={f.goal_id} onChange={set("goal_id")} options={goals.map((g) => ({ value: g.id, label: g.title }))} testid="project-goal-select" /></Field>
          {project && <Field label="Reason for change (kept in history)"><Input value={note} onChange={(e) => setNote(e.target.value)} data-testid="project-change-note" /></Field>}
        </div>
        <DialogFooter><Button onClick={save} disabled={!f.title?.trim()} data-testid="project-save-btn">{project ? "Save" : "Create project"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Projects() {
  const { perspective } = useAuth();
  const { byId } = useLookups();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("open");
  const all = useGet("/strategy/overview", { date: todayStr() }).data?.projects || [];
  const enriched = Object.fromEntries(all.map((p) => [p.id, p]));
  const list = all.filter((p) => (perspective === "combined" || p.domain === perspective) && (status === "open" ? ["active", "planning", "on_hold"].includes(p.status) : p.status === status));
  return (
    <div data-testid="projects-page">
      <PageHeader eyebrow="Execution" title="Projects" subtitle="Outcomes with milestones, tasks and a clear line to your goals."
        actions={<Button onClick={() => setOpen(true)} data-testid="new-project-btn"><Plus className="mr-1 h-4 w-4" />New project</Button>} />
      <div className="mb-4 flex gap-1">
        {[["open", "Open"], ["completed", "Completed"], ["cancelled", "Cancelled"]].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)} className={cn("rounded-lg px-3 py-1.5 text-sm", status === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} data-testid={`projects-filter-${k}`}>{l}</button>
        ))}
      </div>
      {list.length === 0 ? <Empty icon={FolderKanban} title="No projects here" text="Create a project and link it to a goal so progress rolls up automatically." testid="projects-empty" /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const e = enriched[p.id] || {};
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="card-hover rounded-xl border bg-card p-5" data-testid={`project-card-${p.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate font-semibold">{p.title}</div>{p.goal_id && <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><Target className="h-3 w-3" />{byId[p.goal_id]}</div>}</div>
                  <Tag tone={p.status === "active" ? "business" : "muted"}>{p.status.replace("_", " ")}</Tag>
                </div>
                <div className="mt-4 flex items-center gap-2"><Bar value={e.progress ?? (p.status === "completed" ? 100 : 0)} /><span className="num text-xs">{e.progress ?? (p.status === "completed" ? 100 : 0)}%</span></div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {e.at_risk && <Tag tone="risk">At risk</Tag>}
                  {p.due_date && <span>Due {relDay(p.due_date)}</span>}
                  <span>{(p.milestones || []).filter((m) => m.done).length}/{(p.milestones || []).length} milestones</span>
                  <DomainTagMini d={p.domain} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <ProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

const DomainTagMini = ({ d }) => <span className={d === "personal" ? "text-ok" : "text-brand"}>{d}</span>;

function Milestones({ p }) {
  const mut = useMut();
  const [t, setT] = useState("");
  const [due, setDue] = useState("");
  const ms = p.milestones || [];
  const save = (list) => mut("patch", `/projects/${p.id}`, { milestones: list });
  return (
    <Card title="Milestones" icon={Flag} testid="milestones-card">
      <div className="space-y-1">
        {ms.length === 0 && <p className="text-xs text-muted-foreground">Break the project into meaningful checkpoints. Completing one is recorded as an achievement.</p>}
        {ms.map((m) => (
          <div key={m.id} className="flex items-center gap-2 rounded-md px-1 py-1.5" data-testid={`milestone-${m.id}`}>
            <input type="checkbox" checked={m.done} onChange={() => save(ms.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)))} data-testid={`milestone-check-${m.id}`} className="h-4 w-4 accent-[hsl(var(--ok))]" />
            <span className={cn("flex-1 text-sm", m.done && "text-muted-foreground line-through")}>{m.title}</span>
            {m.due_date && <span className="num text-xs text-muted-foreground">{fdate(m.due_date)}</span>}
            <button onClick={() => save(ms.filter((x) => x.id !== m.id))} aria-label="Delete milestone" data-testid={`milestone-delete-${m.id}`}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button>
          </div>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!t.trim()) return; await save([...ms, { title: t.trim(), done: false, due_date: due || null }]); setT(""); setDue(""); }}>
        <Input value={t} onChange={(e) => setT(e.target.value)} placeholder="New milestone" data-testid="milestone-input" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40" data-testid="milestone-due-input" />
        <Button type="submit" variant="outline" size="icon" data-testid="milestone-add-btn"><Plus className="h-4 w-4" /></Button>
      </form>
    </Card>
  );
}

export function ProjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const mut = useMut();
  const { byId } = useLookups();
  const { data, isLoading, error } = useGet(`/projects/${id}/context`, { date: todayStr() });
  const [edit, setEdit] = useState(false);
  const [task, setTask] = useState(null);
  const [newTask, setNewTask] = useState(false);
  if (error) return <Empty title="Project not found" action={<Button variant="outline" onClick={() => nav("/projects")}>Back to projects</Button>} />;
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const { project: p, goal, tasks, notes, history } = data;
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  return (
    <div data-testid="project-detail">
      <Link to="/projects" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" />Projects</Link>
      <PageHeader eyebrow={`${p.domain} project`} title={p.title} subtitle={p.description}
        actions={<>
          <Button variant="outline" onClick={() => setEdit(true)} data-testid="edit-project-btn">Edit</Button>
          {p.status !== "completed" && <Button variant="outline" onClick={() => mut("patch", `/projects/${p.id}`, { status: "completed" }, "Project completed. Well done.")} data-testid="complete-project-btn">Mark complete</Button>}
          <Button variant="ghost" className="text-risk" onClick={async () => { if (window.confirm("Delete this project? Linked tasks are kept but unlinked.")) { await mut("delete", `/projects/${p.id}`, null, "Project deleted"); nav("/projects"); } }} data-testid="delete-project-btn"><Trash2 className="h-4 w-4" /></Button>
        </>} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-5 lg:col-span-2">
          <Card title={`Tasks · ${open.length} open`} action={<Button size="sm" variant="outline" onClick={() => setNewTask(true)} data-testid="project-add-task-btn"><Plus className="mr-1 h-3.5 w-3.5" />Task</Button>} testid="project-tasks">
            {tasks.length === 0 ? <Empty title="No tasks yet" text="Add the concrete next steps for this project." /> : <>
              {open.map((t) => <TaskRow key={t.id} task={t} onOpen={setTask} byId={byId} />)}
              {done.length > 0 && <details className="mt-2"><summary className="cursor-pointer px-2 text-xs text-muted-foreground">{done.length} completed</summary>{done.map((t) => <TaskRow key={t.id} task={t} onOpen={setTask} byId={byId} />)}</details>}
            </>}
          </Card>
          <Milestones p={p} />
        </div>
        <div className="space-y-5">
          <Card testid="project-progress">
            <div className="flex items-center gap-4">
              <ProgressRing value={p.progress} size={88} stroke={8}><span className="num text-lg font-bold" data-testid="project-progress-value">{p.progress}%</span></ProgressRing>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div><Tag tone={p.status === "active" ? "business" : "muted"}>{p.status.replace("_", " ")}</Tag>{p.at_risk && <Tag tone="risk" className="ml-1">At risk</Tag>}</div>
                <div>{p.task_done}/{p.task_total} tasks · {(p.milestones || []).filter((m) => m.done).length}/{(p.milestones || []).length} milestones</div>
                {p.due_date && <div>Due {fdate(p.due_date, { month: "long", day: "numeric", year: "numeric" })}</div>}
              </div>
            </div>
            <div className="mt-4 border-t pt-3 text-xs">
              <div className="eyebrow mb-1">Supports goal</div>
              {goal ? <Link to={`/plan?goal=${goal.id}`} className="flex items-center gap-1.5 font-medium text-brand" data-testid="project-goal-link"><Target className="h-3.5 w-3.5" />{goal.title}</Link> : <span className="text-muted-foreground">Not linked — this project may not serve a strategic priority.</span>}
            </div>
          </Card>
          <Card title="Notes & decisions" testid="project-notes">
            {notes.length === 0 ? <p className="text-xs text-muted-foreground">Link notes to this project from Notes & Decisions.</p> : notes.map((n) => <Link key={n.id} to={`/notes?note=${n.id}`} className="block truncate py-1 text-sm hover:text-brand">{n.title}</Link>)}
          </Card>
          <Card title="History" icon={History} testid="project-history">
            <ul className="max-h-64 space-y-2 overflow-y-auto text-xs">{history.map((h) => (
              <li key={h.id}><span className="text-muted-foreground">{fdate(h.at.slice(0, 10))}</span> · {h.action}{Object.keys(h.diff || {}).length > 0 && `: ${Object.keys(h.diff).join(", ")}`}{h.note && <div className="text-muted-foreground">“{h.note}”</div>}</li>
            ))}</ul>
          </Card>
        </div>
      </div>
      <ProjectDialog open={edit} onOpenChange={setEdit} project={p} />
      <TaskDialog open={newTask || !!task} onOpenChange={(o) => { if (!o) { setNewTask(false); setTask(null); } }} task={task} defaults={{ project_id: p.id, goal_id: p.goal_id, domain: p.domain }} />
    </div>
  );
}
