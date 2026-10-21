import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Wand2, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGet, useMut } from "@/lib/api";
import { todayStr, addDays, weekStart, parseD, dstr, fdate, mins } from "@/lib/fmt";
import { useAuth } from "@/context/Auth";
import { cn } from "@/lib/utils";
import { PageHeader, Sel, Field, DOMAINS, useLookups, Tag } from "@/components/app/kit";
import TaskDialog from "@/components/app/TaskDialog";

const H0 = 6, H1 = 23, PX = 44;
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const KINDS = ["meeting", "focus", "personal", "travel", "other"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

function EventDialog({ open, onOpenChange, event, date }) {
  const { contacts, projects } = useLookups();
  const mut = useMut();
  const [f, setF] = useState({});
  useEffect(() => {
    if (!open) return;
    setF(event ? { ...event, date: event.start.slice(0, 10), s: event.start.slice(11, 16), e: event.end.slice(11, 16) }
      : { title: "", date: date || todayStr(), s: "10:00", e: "11:00", domain: "business", kind: "meeting" });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    const body = { title: f.title, start: `${f.date}T${f.s}`, end: `${f.date}T${f.e}`, domain: f.domain, kind: f.kind, location: f.location || null,
      contact_id: f.contact_id || null, project_id: f.project_id || null, prep_notes: f.prep_notes || null };
    if (event) await mut("patch", `/events/${event.id}`, body, "Event saved");
    else await mut("post", "/events", body, "Event created");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="event-dialog">
        <DialogHeader><DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Input placeholder="Title" value={f.title || ""} onChange={set("title")} data-testid="event-title-input" />
          <div className="grid grid-cols-3 gap-2">
            <Input type="date" value={f.date || ""} onChange={set("date")} data-testid="event-date-input" />
            <Input type="time" value={f.s || ""} onChange={set("s")} data-testid="event-start-input" />
            <Input type="time" value={f.e || ""} onChange={set("e")} data-testid="event-end-input" />
          </div>
          {f.e && f.s && f.e <= f.s && <p className="text-xs text-risk">End time must be after start time.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Area"><Sel value={f.domain} onChange={set("domain")} options={DOMAINS} testid="event-domain-select" /></Field>
            <Field label="Type"><Sel value={f.kind} onChange={set("kind")} options={KINDS} testid="event-kind-select" /></Field>
            <Field label="With"><Sel allowNone value={f.contact_id} onChange={set("contact_id")} options={contacts.map((c) => ({ value: c.id, label: c.name }))} testid="event-contact-select" /></Field>
            <Field label="Project"><Sel allowNone value={f.project_id} onChange={set("project_id")} options={projects.map((p) => ({ value: p.id, label: p.title }))} testid="event-project-select" /></Field>
          </div>
          <Input placeholder="Location" value={f.location || ""} onChange={set("location")} data-testid="event-location-input" />
          <Textarea rows={3} placeholder="Preparation notes" value={f.prep_notes || ""} onChange={set("prep_notes")} data-testid="event-prep-input" />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {event ? <Button variant="ghost" className="text-risk" onClick={async () => { await mut("delete", `/events/${event.id}`, null, "Event deleted"); onOpenChange(false); }} data-testid="event-delete-btn">Delete</Button> : <span />}
          <Button onClick={save} disabled={!f.title?.trim() || f.e <= f.s} data-testid="event-save-btn">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Planner({ open, onClose, date }) {
  const mut = useMut();
  const { data: p, refetch } = useGet("/plan/day", { date }, { enabled: open });
  const [defer, setDefer] = useState({});
  useEffect(() => { if (open) { refetch(); setDefer({}); } }, [open, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const accept = async () => {
    await mut("post", "/plan/apply", { date, blocks: p.blocks.map((b) => ({ task_id: b.task_id, start: b.start })),
      defer: p.overflow.filter((o) => defer[o.task_id]).map((o) => ({ task_id: o.task_id, date: o.suggested_date })) }, "Plan applied to your calendar");
    onClose();
  };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="planner-sheet">
        <SheetHeader><SheetTitle className="text-left">Day planner · {fdate(date, { weekday: "short", month: "short", day: "numeric" })}</SheetTitle></SheetHeader>
        {!p ? <p className="mt-4 text-sm text-muted-foreground">Calculating…</p> : <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
            <div className="rounded-lg border p-2"><div className="num text-sm font-semibold text-foreground">{mins(p.free_minutes)}</div>free in {p.work_start}–{p.work_end}</div>
            <div className="rounded-lg border p-2"><div className="num text-sm font-semibold text-foreground">{mins(p.capacity_minutes)}</div>focus capacity</div>
            <div className={cn("rounded-lg border p-2", p.overcommitted && "border-warn")}><div className={cn("num text-sm font-semibold", p.overcommitted ? "text-warn" : "text-foreground")}>{mins(p.demand_minutes)}</div>work requested</div>
          </div>
          {p.overcommitted && <p className="mt-3 flex gap-2 rounded-lg bg-warn/10 p-2.5 text-xs text-warn" data-testid="planner-overcommitted"><AlertTriangle className="h-4 w-4 shrink-0" />More work than time. Defer lower-priority tasks below rather than working late.</p>}
          <div className="eyebrow mb-2 mt-5">Proposed time blocks</div>
          {p.blocks.length === 0 && <p className="text-xs text-muted-foreground">No tasks due, scheduled or prioritised for this day.</p>}
          <div className="space-y-1.5">{p.blocks.map((b) => (
            <div key={b.task_id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm" data-testid={`plan-block-${b.task_id}`}>
              <span className="num w-24 shrink-0 text-xs text-muted-foreground">{b.start}–{b.end}</span>
              <span className="min-w-0 flex-1"><span className="block truncate">{b.title}</span><span className="text-[11px] text-muted-foreground">{b.reason}{b.estimated && " · 30m assumed"}</span></span>
            </div>))}</div>
          {p.overflow.length > 0 && <>
            <div className="eyebrow mb-2 mt-5">Doesn't fit — reschedule?</div>
            {p.overflow.map((o) => (
              <label key={o.task_id} className="mb-1.5 flex items-center gap-3 rounded-lg border border-dashed p-2.5 text-sm" data-testid={`plan-overflow-${o.task_id}`}>
                <input type="checkbox" checked={!!defer[o.task_id]} onChange={() => setDefer((d) => ({ ...d, [o.task_id]: !d[o.task_id] }))} data-testid={`plan-defer-${o.task_id}`} />
                <span className="min-w-0 flex-1 truncate">{o.title}</span>
                <span className="text-[11px] text-muted-foreground">→ {fdate(o.suggested_date)}</span>
              </label>))}
            <p className="text-[11px] text-muted-foreground">Only ticked tasks move. Due dates are never changed automatically.</p>
          </>}
          {p.blocked.length > 0 && <><div className="eyebrow mb-2 mt-5">Blocked</div>{p.blocked.map((b) => <div key={b.task_id} className="flex items-center gap-2 py-1 text-sm text-muted-foreground"><Lock className="h-3.5 w-3.5" />{b.title}</div>)}</>}
          <Button className="mt-6 w-full" onClick={accept} disabled={!p.blocks.length && !Object.values(defer).some(Boolean)} data-testid="planner-accept-btn">Accept plan</Button>
        </>}
      </SheetContent>
    </Sheet>
  );
}

function TimeGrid({ days, events, tasks, onEvent, onTask, onSlot }) {
  const today = todayStr();
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d) => (
          <div key={d} className="border-b border-l px-2 py-2 text-center">
            <div className="text-[11px] text-muted-foreground">{parseD(d).toLocaleDateString(undefined, { weekday: "short" })}</div>
            <div className={cn("num mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm font-semibold", d === today && "bg-primary text-primary-foreground")}>{parseD(d).getDate()}</div>
            <div className="mt-1 space-y-0.5">{tasks.filter((t) => (t.due_date === d && !(t.scheduled_date && t.scheduled_time)) && t.status !== "done").slice(0, 3).map((t) => (
              <button key={t.id} onClick={() => onTask(t)} className="block w-full truncate rounded bg-muted px-1 text-left text-[10px]">{t.title}</button>))}</div>
          </div>
        ))}
        <div className="relative" style={{ height: (H1 - H0) * PX }}>
          {Array.from({ length: H1 - H0 }, (_, i) => <div key={i} className="num absolute right-2 text-[10px] text-muted-foreground" style={{ top: i * PX - 6 }}>{i ? `${String(H0 + i).padStart(2, "0")}:00` : ""}</div>)}
        </div>
        {days.map((d) => (
          <div key={d} className="relative border-l" style={{ height: (H1 - H0) * PX }} data-testid={`day-col-${d}`}>
            {Array.from({ length: H1 - H0 }, (_, i) => <div key={i} onClick={() => onSlot(d, H0 + i)} className="absolute inset-x-0 border-t border-dashed border-border/60 hover:bg-muted/40" style={{ top: i * PX, height: PX }} />)}
            {events.filter((e) => e.start.slice(0, 10) === d).map((e) => {
              const s = toMin(e.start.slice(11, 16)), en = e.end.slice(0, 10) === d ? toMin(e.end.slice(11, 16)) : H1 * 60;
              return (
                <button key={e.id} onClick={() => onEvent(e)} data-testid={`event-${e.id}`}
                  className={cn("absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight", e.domain === "personal" ? "border-ok bg-ok/10" : "border-brand bg-brand/10")}
                  style={{ top: ((s - H0 * 60) / 60) * PX, height: Math.max(18, ((en - s) / 60) * PX - 2) }}>
                  <div className="truncate font-semibold">{e.title}</div><div className="num text-muted-foreground">{e.start.slice(11, 16)}–{e.end.slice(11, 16)}</div>
                </button>
              );
            })}
            {tasks.filter((t) => t.scheduled_date === d && t.scheduled_time).map((t) => {
              const s = toMin(t.scheduled_time), dur = t.est_minutes || 30;
              return (
                <button key={t.id} onClick={() => onTask(t)} data-testid={`cal-task-${t.id}`}
                  className={cn("absolute inset-x-3 overflow-hidden rounded-md border border-dashed border-bronze bg-bronze/10 px-1.5 py-0.5 text-left text-[11px]", t.status === "done" && "opacity-50 line-through")}
                  style={{ top: ((s - H0 * 60) / 60) * PX, height: Math.max(16, (dur / 60) * PX - 2) }}>{t.title}</button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ anchor, events, tasks, onDay }) {
  const first = parseD(anchor.slice(0, 8) + "01");
  const start = weekStart(dstr(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-xl border bg-card" data-testid="month-grid">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="border-b py-2 text-center text-[11px] text-muted-foreground">{d}</div>)}
      {days.map((d) => {
        const items = [...events.filter((e) => e.start.startsWith(d)).map((e) => ({ id: e.id, t: e.title, c: e.domain === "personal" ? "bg-ok" : "bg-brand" })),
          ...tasks.filter((t) => (t.due_date === d || t.scheduled_date === d) && t.status !== "done").map((t) => ({ id: t.id, t: t.title, c: "bg-bronze" }))];
        return (
          <button key={d} onClick={() => onDay(d)} className={cn("min-h-[92px] border-b border-r p-1.5 text-left hover:bg-muted/40", d.slice(5, 7) !== anchor.slice(5, 7) && "opacity-40")} data-testid={`month-day-${d}`}>
            <div className={cn("num mb-1 grid h-6 w-6 place-items-center rounded-full text-xs", d === todayStr() && "bg-primary text-primary-foreground")}>{parseD(d).getDate()}</div>
            {items.slice(0, 3).map((i) => <div key={i.id} className="flex items-center gap-1 truncate text-[10px]"><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", i.c)} />{i.t}</div>)}
            {items.length > 3 && <div className="text-[10px] text-muted-foreground">+{items.length - 3} more</div>}
          </button>
        );
      })}
    </div>
  );
}

export default function CalendarPage() {
  const { perspective } = useAuth();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(window.innerWidth < 768 ? "day" : "week");
  const [anchor, setAnchor] = useState(todayStr());
  const [ev, setEv] = useState(null);
  const [newEv, setNewEv] = useState(null);
  const [task, setTask] = useState(null);
  const range = view === "day" ? [anchor, anchor] : view === "week" ? [weekStart(anchor), addDays(weekStart(anchor), 6)] : [addDays(weekStart(anchor.slice(0, 8) + "01"), 0), addDays(weekStart(anchor.slice(0, 8) + "01"), 41)];
  const { data } = useGet("/calendar", { start: range[0], end: range[1] });
  const scope = (x) => perspective === "combined" || x.domain === perspective;
  const events = (data?.events || []).filter(scope);
  const tasks = (data?.tasks || []).filter(scope);
  const step = (n) => setAnchor(view === "day" ? addDays(anchor, n) : view === "week" ? addDays(anchor, 7 * n) : dstr(new Date(parseD(anchor).getFullYear(), parseD(anchor).getMonth() + n, 1)));
  const days = view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(range[0], i));
  const title = view === "month" ? parseD(anchor).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : view === "day" ? fdate(anchor, { weekday: "long", month: "long", day: "numeric" }) : `${fdate(range[0])} – ${fdate(range[1])}`;
  return (
    <div data-testid="calendar-page">
      <PageHeader eyebrow="Time" title="Calendar" subtitle={<span>Meetings, time blocks and personal commitments. <Tag tone="muted">Native calendar · external sync not yet connected</Tag></span>}
        actions={<>
          <Button variant="outline" onClick={() => setParams({ planner: "1" })} data-testid="open-planner-btn"><Wand2 className="mr-1 h-4 w-4" />Plan {anchor === todayStr() ? "today" : "this day"}</Button>
          <Button onClick={() => setNewEv({ date: anchor })} data-testid="new-event-btn"><Plus className="mr-1 h-4 w-4" />Event</Button>
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => step(-1)} data-testid="cal-prev" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setAnchor(todayStr())} data-testid="cal-today">Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => step(1)} data-testid="cal-next" aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <h2 className="text-base font-semibold" data-testid="cal-title">{title}</h2>
        <div className="ml-auto flex rounded-lg border p-0.5">
          {["day", "week", "month"].map((v) => <button key={v} onClick={() => setView(v)} data-testid={`cal-view-${v}`} className={cn("rounded-md px-3 py-1 text-xs font-medium capitalize", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{v}</button>)}
        </div>
      </div>
      {view === "month" ? <MonthGrid anchor={anchor} events={events} tasks={tasks} onDay={(d) => { setAnchor(d); setView("day"); }} />
        : <TimeGrid days={days} events={events} tasks={tasks} onEvent={setEv} onTask={setTask} onSlot={(d, h) => setNewEv({ date: d, hour: h })} />}
      <EventDialog open={!!ev || !!newEv} onOpenChange={(o) => { if (!o) { setEv(null); setNewEv(null); } }} event={ev} date={newEv?.date} />
      <TaskDialog open={!!task} onOpenChange={(o) => !o && setTask(null)} task={task} />
      <Planner open={params.get("planner") === "1"} onClose={() => setParams({})} date={anchor} />
    </div>
  );
}
