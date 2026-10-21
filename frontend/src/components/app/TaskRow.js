import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CalendarDays, FolderKanban, User, Repeat, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMut } from "@/lib/api";
import { relDay, todayStr } from "@/lib/fmt";
import { Pri, Tag } from "./kit";

export function TaskCheck({ task, testid }) {
  const mut = useMut();
  const [burst, setBurst] = useState(false);
  const done = task.status === "done";
  const toggle = async (e) => {
    e.stopPropagation();
    if (!done) { setBurst(true); setTimeout(() => setBurst(false), 700); }
    await mut("patch", `/tasks/${task.id}`, { status: done ? "todo" : "done" }, done ? "Task reopened" : "Done. Nice work.");
  };
  return (
    <button onClick={toggle} data-testid={testid || `task-check-${task.id}`} aria-label={done ? "Mark as not done" : "Mark as done"}
      className={cn("relative grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
        done ? "border-ok bg-ok text-white" : "border-muted-foreground/50 hover:border-ok")}>
      {done && <Check className="h-3 w-3" strokeWidth={3} />}
      <AnimatePresence>
        {burst && (
          <motion.span initial={{ scale: 0.6, opacity: 0.8 }} animate={{ scale: 2.6, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-ok" />
        )}
      </AnimatePresence>
    </button>
  );
}

export function TaskRow({ task, onOpen, byId = {}, selectable, selected, onSelect }) {
  const overdue = task.due_date && task.due_date < todayStr() && task.status !== "done";
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid={`task-row-${task.id}`}
      onClick={() => onOpen?.(task)}
      className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
      {selectable && (
        <input type="checkbox" checked={selected} onClick={(e) => e.stopPropagation()} onChange={() => onSelect(task.id)}
          className="h-3.5 w-3.5 accent-[hsl(var(--brand))]" data-testid={`task-select-${task.id}`} />
      )}
      <TaskCheck task={task} />
      <Pri p={task.priority} />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {task.due_date && <span className={cn("inline-flex items-center gap-1", overdue && "text-risk")}><CalendarDays className="h-3 w-3" />{relDay(task.due_date)}</span>}
          {task.scheduled_time && task.scheduled_date && <span className="num">{task.scheduled_time}</span>}
          {task.project_id && byId[task.project_id] && <span className="inline-flex items-center gap-1"><FolderKanban className="h-3 w-3" />{byId[task.project_id]}</span>}
          {task.contact_id && byId[task.contact_id] && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{byId[task.contact_id]}</span>}
          {task.recurrence !== "none" && task.recurrence && <Repeat className="h-3 w-3" />}
          {task.blocked_by?.length > 0 && <span className="inline-flex items-center gap-1 text-warn"><Lock className="h-3 w-3" />blocked</span>}
          {task.delegated_to && <span>→ {task.delegated_to}</span>}
          {task.est_minutes ? <span className="num">{task.est_minutes}m</span> : null}
        </div>
      </div>
      {task.top3_date === todayStr() && <Tag tone="bronze">Top 3</Tag>}
      {task.domain === "personal" && <Tag tone="personal">Personal</Tag>}
    </motion.div>
  );
}
