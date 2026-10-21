import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Inbox, Search, CheckCheck, Trash2, CalendarPlus, LayoutList, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGet, useMut } from "@/lib/api";
import { todayStr, addDays } from "@/lib/fmt";
import { useAuth } from "@/context/Auth";
import { cn } from "@/lib/utils";
import { PageHeader, Empty, Sel, useLookups, Pri, Tag } from "@/components/app/kit";
import { TaskRow } from "@/components/app/TaskRow";
import TaskDialog from "@/components/app/TaskDialog";

const T = todayStr();
const VIEWS = {
  inbox: ["Inbox", (t) => t.status === "inbox"],
  today: ["Today", (t) => t.status !== "done" && (t.due_date === T || t.scheduled_date === T || t.top3_date === T)],
  upcoming: ["Upcoming", (t) => t.status !== "done" && ((t.due_date && t.due_date > T) || (t.scheduled_date && t.scheduled_date > T))],
  waiting: ["Waiting for", (t) => t.status === "waiting"],
  delegated: ["Delegated", (t) => t.status !== "done" && !!t.delegated_to],
  overdue: ["Overdue", (t) => t.status !== "done" && t.due_date && t.due_date < T],
  all: ["All open", (t) => t.status !== "done"],
  completed: ["Completed", (t) => t.status === "done"],
};
const COLS = [["inbox", "Inbox"], ["todo", "To do"], ["in_progress", "In progress"], ["waiting", "Waiting"], ["done", "Done"]];

function Board({ tasks, onOpen }) {
  const mut = useMut();
  const [over, setOver] = useState(null);
  const drop = (e, status) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/task"); if (id) mut("patch", `/tasks/${id}`, { status }); };
  return (
    <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-5" data-testid="task-board">
      {COLS.map(([s, label]) => {
        const items = tasks.filter((t) => t.status === s);
        return (
          <div key={s} className="kanban-col min-h-[200px] rounded-xl bg-muted/50 p-2" data-over={over === s} data-testid={`board-col-${s}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, s)}>
            <div className="mb-2 flex items-center justify-between px-1.5 text-xs font-semibold">{label}<span className="num text-muted-foreground">{items.length}</span></div>
            <div className="space-y-2">
              {items.slice(0, 80).map((t) => (
                <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)} onClick={() => onOpen(t)} data-testid={`board-card-${t.id}`}
                  className="card-hover cursor-grab rounded-lg border bg-card p-2.5 text-sm active:cursor-grabbing">
                  <div className="flex items-start gap-2"><Pri p={t.priority} /><span className={cn("flex-1 leading-snug", s === "done" && "text-muted-foreground line-through")}>{t.title}</span></div>
                  <div className="mt-1.5 flex flex-wrap gap-1">{t.due_date && <Tag tone={t.due_date < T && s !== "done" ? "risk" : "muted"}>{t.due_date.slice(5)}</Tag>}{t.domain === "personal" && <Tag tone="personal">Personal</Tag>}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "today";
  const { perspective } = useAuth();
  const { projects, byId } = useLookups();
  const { data: all = [], isLoading } = useGet("/tasks");
  const mut = useMut();
  const [q, setQ] = useState("");
  const [project, setProject] = useState(null);
  const [mode, setMode] = useState("list");
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const [sel, setSel] = useState([]);
  const [quick, setQuick] = useState("");

  useEffect(() => {
    const id = params.get("task");
    if (id && all.length) { const t = all.find((x) => x.id === id); if (t) setOpen(t); }
  }, [params, all]);

  const scoped = useMemo(() => all.filter((t) => (perspective === "combined" || t.domain === perspective) && (!project || t.project_id === project)
    && (!q || t.title.toLowerCase().includes(q.toLowerCase()))), [all, perspective, project, q]);
  const list = scoped.filter(VIEWS[view][1]).sort((a, b) => (a.priority - b.priority) || (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  const counts = Object.fromEntries(Object.entries(VIEWS).map(([k, [, fn]]) => [k, scoped.filter(fn).length]));
  const toggleSel = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const bulk = async (action, value) => { await mut("post", "/tasks/bulk", { ids: sel, action, value }, `${sel.length} task(s) updated`); setSel([]); };
  const addQuick = async (e) => {
    e.preventDefault();
    if (!quick.trim()) return;
    const extra = view === "today" ? { due_date: T, status: "todo" } : view === "inbox" ? { status: "inbox" } : { status: "todo" };
    await mut("post", "/tasks", { title: quick.trim(), domain: perspective === "personal" ? "personal" : "business", project_id: project, ...extra });
    setQuick("");
  };

  return (
    <div data-testid="tasks-page">
      <PageHeader eyebrow="Execution" title="Tasks" subtitle="Every commitment, linked to the projects, goals and people it serves."
        actions={<>
          <div className="flex rounded-lg border p-0.5">
            <button onClick={() => setMode("list")} className={cn("rounded-md p-1.5", mode === "list" && "bg-muted")} data-testid="tasks-list-mode" aria-label="List view"><LayoutList className="h-4 w-4" /></button>
            <button onClick={() => setMode("board")} className={cn("rounded-md p-1.5", mode === "board" && "bg-muted")} data-testid="tasks-board-mode" aria-label="Board view"><Columns3 className="h-4 w-4" /></button>
          </div>
          <Button onClick={() => setCreating(true)} data-testid="new-task-btn"><Plus className="mr-1 h-4 w-4" />New task</Button>
        </>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tasks" className="pl-9" data-testid="tasks-filter-input" /></div>
        <Sel allowNone="All projects" value={project} onChange={setProject} options={projects.map((p) => ({ value: p.id, label: p.title }))} className="sm:w-56" testid="tasks-project-filter" />
      </div>
      {mode === "board" ? <Board tasks={scoped} onOpen={setOpen} /> : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
          <div className="flex gap-1 overflow-x-auto lg:flex-col" data-testid="task-views">
            {Object.entries(VIEWS).map(([k, [label]]) => (
              <button key={k} onClick={() => setParams({ view: k })} data-testid={`view-${k}`}
                className={cn("flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                {label}<span className={cn("num text-xs", k === "overdue" && counts[k] > 0 && view !== k && "text-risk")}>{counts[k]}</span>
              </button>
            ))}
          </div>
          <div className="min-w-0 rounded-xl border bg-card p-3">
            {view !== "completed" && (
              <form onSubmit={addQuick} className="mb-2 flex gap-2 border-b pb-3">
                <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={`Add to ${VIEWS[view][0]} and press Enter`} className="border-0 shadow-none focus-visible:ring-0" data-testid="task-quick-add" />
              </form>
            )}
            {sel.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs" data-testid="bulk-bar">
                <span className="font-semibold">{sel.length} selected</span>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => bulk("complete")} data-testid="bulk-complete"><CheckCheck className="mr-1 h-3.5 w-3.5" />Complete</Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => bulk("schedule", T)} data-testid="bulk-today"><CalendarPlus className="mr-1 h-3.5 w-3.5" />Today</Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => bulk("schedule", addDays(T, 1))} data-testid="bulk-tomorrow">Tomorrow</Button>
                <Button size="sm" variant="ghost" className="h-7 text-risk" onClick={() => bulk("delete")} data-testid="bulk-delete"><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
                <button className="ml-auto text-muted-foreground" onClick={() => setSel([])}>Clear</button>
              </div>
            )}
            {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : list.length === 0
              ? <Empty icon={Inbox} title={`Nothing in ${VIEWS[view][0]}`} text={view === "inbox" ? "Captured tasks land here until you organise them." : "You're clear here."} testid="tasks-empty" />
              : <div className="space-y-0.5" data-testid="task-list">{list.map((t) => <TaskRow key={t.id} task={t} onOpen={setOpen} byId={byId} selectable selected={sel.includes(t.id)} onSelect={toggleSel} />)}</div>}
          </div>
        </div>
      )}
      <TaskDialog open={creating || !!open} onOpenChange={(o) => { if (!o) { setCreating(false); setOpen(null); if (params.get("task")) setParams({ view }); } }} task={open}
        defaults={{ project_id: project, ...(view === "today" ? { due_date: T } : {}), status: view === "inbox" ? "inbox" : "todo" }} />
    </div>
  );
}
