import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useGet, useMut } from "@/lib/api";
import { todayStr } from "@/lib/fmt";
import { useAuth } from "@/context/Auth";
import { Field, Sel, useLookups, DOMAINS } from "./kit";

const STATUSES = [["inbox", "Inbox"], ["todo", "To do"], ["in_progress", "In progress"], ["waiting", "Waiting"], ["done", "Done"]].map(([value, label]) => ({ value, label }));
const PRIS = [1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${p}${p === 1 ? " · Critical" : p === 4 ? " · Low" : ""}` }));
const REC = ["none", "daily", "weekly", "monthly"].map((v) => ({ value: v, label: v === "none" ? "Does not repeat" : v[0].toUpperCase() + v.slice(1) }));
const EDITABLE = ["title", "notes", "status", "priority", "due_date", "scheduled_date", "scheduled_time", "est_minutes", "actual_minutes", "project_id", "goal_id", "contact_id", "domain", "top3_date", "delegated_to", "waiting_on", "recurrence", "blocked_by", "subtasks", "completion_criteria", "outcome"];

const blank = (perspective, defaults) => ({
  title: "", notes: "", status: "todo", priority: 3, domain: perspective === "personal" ? "personal" : "business",
  recurrence: "none", blocked_by: [], subtasks: [], ...defaults,
});

export default function TaskDialog({ open, onOpenChange, task, defaults }) {
  const { perspective } = useAuth();
  const { projects, goals, contacts } = useLookups();
  const allTasks = useGet("/tasks", undefined, { enabled: open }).data || [];
  const mut = useMut();
  const [f, setF] = useState(blank(perspective, defaults));
  const [sub, setSub] = useState("");
  useEffect(() => { if (open) setF(task ? { ...task } : blank(perspective, defaults)); }, [open, task]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const ev = (k) => (e) => set(k)(e.target.value);
  const num = (k) => (e) => set(k)(e.target.value === "" ? null : Number(e.target.value));

  const save = async () => {
    const body = {};
    EDITABLE.forEach((k) => { if (f[k] !== undefined) body[k] = f[k] === "" && k !== "title" ? null : f[k]; });
    body.priority = Number(body.priority);
    if (task) await mut("patch", `/tasks/${task.id}`, body, "Task saved");
    else await mut("post", "/tasks", body, "Task created");
    onOpenChange(false);
  };
  const remove = async () => { await mut("delete", `/tasks/${task.id}`, null, "Task deleted"); onOpenChange(false); };
  const top3 = f.top3_date === todayStr();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="task-dialog">
        <DialogHeader><DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Input autoFocus placeholder="What needs to happen?" value={f.title} onChange={ev("title")} data-testid="task-title-input" className="text-base" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Status"><Sel value={f.status} onChange={set("status")} options={STATUSES} testid="task-status-select" /></Field>
            <Field label="Priority"><Sel value={String(f.priority)} onChange={(v) => set("priority")(Number(v))} options={PRIS} testid="task-priority-select" /></Field>
            <Field label="Due date"><Input type="date" value={f.due_date || ""} onChange={ev("due_date")} data-testid="task-due-input" /></Field>
            <Field label="Area"><Sel value={f.domain} onChange={set("domain")} options={DOMAINS} testid="task-domain-select" /></Field>
            <Field label="Scheduled for"><Input type="date" value={f.scheduled_date || ""} onChange={ev("scheduled_date")} data-testid="task-scheduled-input" /></Field>
            <Field label="Start time"><Input type="time" value={f.scheduled_time || ""} onChange={ev("scheduled_time")} data-testid="task-time-input" /></Field>
            <Field label="Estimate (min)"><Input type="number" min="0" value={f.est_minutes ?? ""} onChange={num("est_minutes")} data-testid="task-est-input" /></Field>
            <Field label="Actual (min)"><Input type="number" min="0" value={f.actual_minutes ?? ""} onChange={num("actual_minutes")} data-testid="task-actual-input" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Project"><Sel allowNone value={f.project_id} onChange={set("project_id")} options={projects.map((p) => ({ value: p.id, label: p.title }))} testid="task-project-select" /></Field>
            <Field label="Goal"><Sel allowNone value={f.goal_id} onChange={set("goal_id")} options={goals.map((g) => ({ value: g.id, label: g.title }))} testid="task-goal-select" /></Field>
            <Field label="Contact"><Sel allowNone value={f.contact_id} onChange={set("contact_id")} options={contacts.map((c) => ({ value: c.id, label: c.name }))} testid="task-contact-select" /></Field>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div><div className="text-sm font-medium">Today's top three</div><div className="text-xs text-muted-foreground">Mark this as one of today's three priorities</div></div>
            <Switch checked={top3} onCheckedChange={(v) => set("top3_date")(v ? todayStr() : null)} data-testid="task-top3-switch" />
          </div>
          <Field label="Notes"><Textarea rows={3} value={f.notes || ""} onChange={ev("notes")} data-testid="task-notes-input" /></Field>
          <Field label="Subtasks">
            <div className="space-y-1.5">
              {(f.subtasks || []).map((s, i) => (
                <div key={s.id || i} className="flex items-center gap-2">
                  <input type="checkbox" checked={s.done} onChange={() => set("subtasks")(f.subtasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} data-testid={`subtask-check-${i}`} />
                  <span className={s.done ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm"}>{s.title}</span>
                  <button onClick={() => set("subtasks")(f.subtasks.filter((_, j) => j !== i))} aria-label="Remove subtask"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="Add a subtask" value={sub} onChange={(e) => setSub(e.target.value)} data-testid="subtask-input"
                  onKeyDown={(e) => { if (e.key === "Enter" && sub.trim()) { set("subtasks")([...(f.subtasks || []), { title: sub.trim(), done: false }]); setSub(""); } }} />
                <Button variant="outline" size="icon" data-testid="subtask-add-btn" onClick={() => { if (sub.trim()) { set("subtasks")([...(f.subtasks || []), { title: sub.trim(), done: false }]); setSub(""); } }}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </Field>
          <details className="rounded-lg border px-3 py-2" data-testid="task-advanced">
            <summary className="cursor-pointer text-sm font-medium">Delegation, dependencies, recurrence & outcome</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Delegated to"><Input value={f.delegated_to || ""} onChange={ev("delegated_to")} data-testid="task-delegated-input" /></Field>
              <Field label="Waiting on"><Input value={f.waiting_on || ""} onChange={ev("waiting_on")} data-testid="task-waiting-input" /></Field>
              <Field label="Repeats"><Sel value={f.recurrence} onChange={set("recurrence")} options={REC} testid="task-recurrence-select" /></Field>
              <Field label="Blocked by">
                <Sel value={null} onChange={(v) => v && !f.blocked_by.includes(v) && set("blocked_by")([...f.blocked_by, v])} placeholder="Add blocking task"
                  options={allTasks.filter((t) => t.id !== task?.id && t.status !== "done").map((t) => ({ value: t.id, label: t.title }))} testid="task-blocked-select" />
                <div className="mt-1 flex flex-wrap gap-1">
                  {f.blocked_by.map((b) => (
                    <span key={b} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">{allTasks.find((t) => t.id === b)?.title || "Task"}
                      <button onClick={() => set("blocked_by")(f.blocked_by.filter((x) => x !== b))} aria-label="Remove dependency"><X className="h-3 w-3" /></button></span>
                  ))}
                </div>
              </Field>
              <Field label="Completion criteria" className="sm:col-span-2"><Textarea rows={2} value={f.completion_criteria || ""} onChange={ev("completion_criteria")} data-testid="task-criteria-input" /></Field>
              <Field label="Outcome / evidence" className="sm:col-span-2"><Textarea rows={2} value={f.outcome || ""} onChange={ev("outcome")} data-testid="task-outcome-input" /></Field>
            </div>
          </details>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {task ? <Button variant="ghost" className="text-risk" onClick={remove} data-testid="task-delete-btn"><Trash2 className="mr-1 h-4 w-4" />Delete</Button> : <span />}
          <Button onClick={save} disabled={!f.title?.trim()} data-testid="task-save-btn">{task ? "Save changes" : "Create task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
