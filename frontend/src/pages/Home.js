import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Target, CalendarDays, FolderKanban, Wallet, Users, HeartPulse, Trophy, AlertTriangle, Sparkles, ArrowRight, Star, SlidersHorizontal, Info, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useGet, useMut, streamChat } from "@/lib/api";
import { todayStr, fday, greeting, money, relDay, mins } from "@/lib/fmt";
import { useAuth } from "@/context/Auth";
import { cn } from "@/lib/utils";
import { Card, ProgressRing, Bar, Empty, Tag, Sel, useLookups } from "@/components/app/kit";
import { TaskRow, TaskCheck } from "@/components/app/TaskRow";
import TaskDialog from "@/components/app/TaskDialog";
import { AiMarkdown } from "@/components/app/AiMarkdown";

const WIDGETS = [["briefing", "Briefing"], ["score", "Execution score"], ["top3", "Top 3"], ["agenda", "Agenda"], ["insights", "Risks & insights"], ["goals", "Goals"],
  ["projects", "Projects"], ["finance", "Finance"], ["people", "Follow-ups"], ["habits", "Habits & wellbeing"], ["wins", "Achievements"]];

function Briefing({ d, onOpen }) {
  const { user } = useAuth();
  const name = user?.name;
  const [ai, setAi] = useState("");
  const [refs, setRefs] = useState({});
  const [busy, setBusy] = useState(false);
  const na = d.next_action;
  const run = async () => {
    setAi(""); setBusy(true);
    await streamChat({ message: "Prepare my daily briefing for today: what matters most, conflicts in my time, risks, and the single best next action. Be concise (under 200 words).",
      title: `Daily briefing ${d.date}`, onDelta: (t) => setAi((s) => s + t), onDone: (e) => setRefs(e.refs || {}), onError: (m) => setAi(`⚠️ ${m}`) });
    setBusy(false);
  };
  const open = d.top3.filter((t) => t.status !== "done").length;
  return (
    <Card className="lg:col-span-8" testid="widget-briefing">
      <div className="eyebrow">{fday(d.date)}</div>
      <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{greeting()}, {(d.profile?.name || name || "").split(" ")[0] || "founder"}.</h2>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="briefing-summary">
        {open} of {d.top3.length} priorities open · {d.events.length} event{d.events.length === 1 ? "" : "s"} · {d.today_tasks.length} other task{d.today_tasks.length === 1 ? "" : "s"} today
        {d.overdue.length > 0 && <> · <span className="text-risk">{d.overdue.length} overdue</span></>}
        {d.followups.length > 0 && <> · {d.followups.length} follow-up{d.followups.length === 1 ? "" : "s"}</>}
        {d.plan.overcommitted && <> · <span className="text-warn">over capacity ({mins(d.plan.demand_minutes)} planned)</span></>}
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-muted/40 p-4" data-testid="next-action">
          <div className="eyebrow flex items-center gap-1.5"><ArrowRight className="h-3 w-3" />Recommended next action</div>
          {na ? <>
            <div className="mt-2 flex w-full items-center gap-2 text-[15px] font-semibold">
              <TaskCheck task={na.task} testid="next-action-check" />
              <button onClick={() => onOpen(na.task)} className="min-w-0 truncate text-left hover:text-brand" data-testid="next-action-title">{na.task.title}</button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Why: {na.reason}</p>
          </> : <p className="mt-2 text-sm text-muted-foreground">Nothing urgent. Pick your top three or protect time for what matters to you.</p>}
        </div>
        <div className="rounded-lg border border-ai/25 bg-ai/5 p-4">
          <div className="flex items-center justify-between"><div className="eyebrow flex items-center gap-1.5 !text-ai"><Sparkles className="h-3 w-3" />AI briefing</div>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={run} disabled={busy} data-testid="ai-briefing-btn">{busy ? "Thinking…" : ai ? "Refresh" : "Generate"}</Button></div>
          <div className="mt-2 max-h-56 overflow-y-auto" data-testid="ai-briefing-output">
            {ai ? <AiMarkdown content={ai} refs={refs} /> : <p className="text-xs text-muted-foreground">Your Chief of Staff reads your goals, calendar, tasks, finances and habits to brief you. Nothing is sent externally.</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Score({ d }) {
  const p = useGet("/progress", { date: d.date }).data;
  return (
    <Card title="Daily execution" icon={Star} className="lg:col-span-4" testid="widget-score"
      action={<Link to="/reviews?tab=shutdown" className="text-xs font-medium text-brand" data-testid="shutdown-link">{d.shutdown_done ? "Shutdown done" : "Daily shutdown"}</Link>}>
      <div className="flex items-center gap-5">
        <ProgressRing value={d.score.value} testid="score-ring" color="hsl(var(--ok))">
          <div><div className="num text-2xl font-bold" data-testid="score-value">{d.score.value}</div><div className="text-[10px] text-muted-foreground">of 100</div></div>
        </ProgressRing>
        <div className="min-w-0 flex-1 space-y-2">
          {d.score.components.map((c) => (
            <div key={c.key}><div className="flex justify-between text-[11px]"><span className="text-muted-foreground">{c.label}</span><span className="num">{Math.round(c.value * 100)}%</span></div><Bar value={c.value * 100} color="bg-ok" /></div>
          ))}
        </div>
      </div>
      {p && <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs" data-testid="level-display">
        <span><span className="font-semibold">Level {p.level}</span> · {p.title}</span>
        <span className="num text-muted-foreground">{p.xp} / {p.next_level_xp} XP</span>
      </div>}
    </Card>
  );
}

function Top3({ d, onOpen, byId }) {
  const mut = useMut();
  const candidates = [...d.today_tasks, ...d.overdue].filter((t) => t.top3_date !== d.date);
  const all = useGet("/tasks", { status: "todo" }).data || [];
  const pool = [...candidates, ...all.filter((t) => !candidates.find((c) => c.id === t.id) && t.top3_date !== d.date)];
  return (
    <Card title="Today's top three" icon={Target} className="lg:col-span-4" testid="widget-top3">
      <div className="space-y-0.5">
        {d.top3.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpen} byId={byId} />)}
        {d.top3.length === 0 && <p className="pb-2 text-xs text-muted-foreground">Choose up to three outcomes that would make today a success.</p>}
      </div>
      {d.top3.length < 3 && pool.length > 0 && (
        <Sel value={null} placeholder="+ Add a priority from your tasks" className="mt-3" testid="top3-add-select"
          onChange={(id) => id && mut("patch", `/tasks/${id}`, { top3_date: d.date }, "Added to top three")}
          options={pool.slice(0, 30).map((t) => ({ value: t.id, label: t.title }))} />
      )}
    </Card>
  );
}

function Agenda({ d, onOpen }) {
  const sched = [...d.top3, ...d.today_tasks].filter((t) => t.scheduled_date === d.date && t.scheduled_time);
  const items = [...d.events.map((e) => ({ t: e.start.slice(11, 16), e })), ...sched.map((t) => ({ t: t.scheduled_time, task: t }))].sort((a, b) => a.t.localeCompare(b.t));
  return (
    <Card title="Agenda" icon={CalendarDays} className="lg:col-span-4" testid="widget-agenda" action={<Link to="/calendar?planner=1" className="text-xs font-medium text-brand" data-testid="plan-day-link">Plan my day</Link>}>
      {items.length === 0 ? <Empty title="Nothing scheduled" text="Use the day planner to time-block your priorities." /> : (
        <ol className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex gap-3 rounded-md px-1 py-1.5 text-sm">
              <span className="num w-11 shrink-0 text-xs text-muted-foreground">{it.t}</span>
              <span className={cn("w-0.5 shrink-0 rounded", it.e ? (it.e.domain === "personal" ? "bg-ok" : "bg-brand") : "bg-bronze")} />
              {it.e ? <span className="min-w-0"><span className="block truncate font-medium">{it.e.title}</span><span className="text-xs text-muted-foreground">until {it.e.end.slice(11, 16)}{it.e.prep_notes ? " · prep notes" : ""}</span></span>
                : <button className="truncate text-left hover:text-brand" onClick={() => onOpen(it.task)}>{it.task.title}</button>}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center text-[11px] text-muted-foreground">
        <div><div className="num text-sm font-semibold text-foreground">{mins(d.plan.meeting_minutes)}</div>meetings</div>
        <div><div className="num text-sm font-semibold text-foreground">{mins(d.plan.free_minutes)}</div>free</div>
        <div><div className={cn("num text-sm font-semibold", d.plan.overcommitted ? "text-warn" : "text-foreground")}>{mins(d.plan.demand_minutes)}</div>planned work</div>
      </div>
    </Card>
  );
}

function Insights({ d }) {
  const nav = useNavigate();
  return (
    <Card title="Risks & insights" icon={AlertTriangle} className="lg:col-span-4" testid="widget-insights">
      {d.insights.length === 0 ? <Empty title="All clear" text="No risks detected in your goals, projects, time or money." /> : (
        <div className="space-y-1.5">
          {d.insights.slice(0, 6).map((i, k) => (
            <button key={k} onClick={() => nav(i.link)} className="flex w-full gap-2.5 rounded-lg p-2 text-left hover:bg-muted" data-testid={`insight-${i.kind}`}>
              {i.severity === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" /> : <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", i.severity === "risk" ? "text-risk" : "text-warn")} />}
              <div className="min-w-0"><div className="text-[13px] font-medium">{i.title}</div><div className="truncate text-xs text-muted-foreground">{i.detail}</div></div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function Goals({ d }) {
  return (
    <Card title="Goal progress" icon={Target} className="lg:col-span-6" testid="widget-goals" action={<Link to="/plan" className="text-xs font-medium text-brand">All goals</Link>}>
      {d.goals.length === 0 ? <Empty title="No active goals" text="Set an annual or quarterly goal to connect your work to outcomes." action={<Button size="sm" variant="outline" asChild><Link to="/plan">Set a goal</Link></Button>} /> : (
        <div className="space-y-3.5">
          {d.goals.slice(0, 5).map((g) => (
            <Link key={g.id} to={`/plan?goal=${g.id}`} className="block" data-testid={`home-goal-${g.id}`}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{g.title}</span>
                <span className="flex shrink-0 items-center gap-2">{g.behind && <Tag tone="risk">Behind</Tag>}{g.no_plan && <Tag tone="warning">No plan</Tag>}
                  <span className="num text-xs">{g.progress == null ? "—" : `${g.progress}%`}</span></span>
              </div>
              <Bar value={g.progress} expected={g.expected} color={g.domain === "personal" ? "bg-ok" : "bg-brand"} />
              {g.metric_name && <div className="num mt-1 text-[11px] text-muted-foreground">{g.metric_name}: {g.current ?? "—"} / {g.target ?? "—"} {g.unit || ""}</div>}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function Projects({ d }) {
  return (
    <Card title="Active projects" icon={FolderKanban} className="lg:col-span-6" testid="widget-projects" action={<Link to="/projects" className="text-xs font-medium text-brand">All projects</Link>}>
      {d.projects.length === 0 ? <Empty title="No active projects" text="Projects turn goals into milestones and tasks." /> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {d.projects.slice(0, 4).map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card-hover rounded-lg border p-3" data-testid={`home-project-${p.id}`}>
              <div className="flex items-start justify-between gap-2"><span className="line-clamp-1 text-sm font-medium">{p.title}</span>{p.at_risk && <Tag tone="risk">At risk</Tag>}</div>
              <div className="mt-2 flex items-center gap-2"><Bar value={p.progress} /><span className="num text-xs">{p.progress}%</span></div>
              <div className="mt-1.5 truncate text-[11px] text-muted-foreground">{p.next_milestone ? `Next: ${p.next_milestone.title}` : p.due_date ? `Due ${relDay(p.due_date)}` : `${p.task_total} tasks`}</div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function Finance({ d }) {
  const { currency } = useAuth();
  const b = d.finance.business, p = d.finance.personal;
  const show = d.perspective === "combined" ? [["Business", b], ["Personal", p]] : d.perspective === "business" ? [["Business", b]] : [["Personal", p]];
  return (
    <Card title="Finance snapshot" icon={Wallet} className="lg:col-span-4" testid="widget-finance" action={<Link to="/finance" className="text-xs font-medium text-brand">Open</Link>}>
      <div className="space-y-3">
        {show.map(([label, f]) => (
          <div key={label} className="rounded-lg bg-muted/40 p-3">
            <div className="flex items-baseline justify-between"><span className="eyebrow">{label} cash</span><span className="num text-lg font-semibold" data-testid={`fin-cash-${label.toLowerCase()}`}>{money(f.cash, currency)}</span></div>
            <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
              <span>Month net <span className={cn("num font-medium", f.net < 0 ? "text-risk" : "text-ok")}>{money(f.net, currency, true)}</span></span>
              <span className="text-right">{label === "Business" ? <>Runway <span className="num font-medium text-foreground">{f.runway_months != null ? `${f.runway_months} mo` : f.months_of_data ? "positive" : "—"}</span></> : <>Spent <span className="num font-medium text-foreground">{money(f.expense, currency, true)}</span></>}</span>
            </div>
          </div>
        ))}
        {b.cash === 0 && p.cash === 0 && !b.months_of_data && <p className="text-xs text-muted-foreground">Add accounts and transactions to see real figures.</p>}
      </div>
    </Card>
  );
}

function People({ d }) {
  const { currency } = useAuth();
  return (
    <Card title="Follow-ups" icon={Users} className="lg:col-span-4" testid="widget-people" action={<Link to="/people" className="text-xs font-medium text-brand">CRM</Link>}>
      <div className="mb-3 flex gap-4 text-xs text-muted-foreground"><span><span className="num font-semibold text-foreground">{d.pipeline.count}</span> open deals</span><span><span className="num font-semibold text-foreground">{money(d.pipeline.value, currency, true)}</span> pipeline</span></div>
      {d.followups.length === 0 ? <Empty title="No follow-ups due" text="Log interactions with next steps to stay on top of relationships." /> : (
        <div className="space-y-1">
          {d.followups.slice(0, 5).map((c) => (
            <Link key={c.id} to={`/people?contact=${c.id}`} className="flex items-center gap-3 rounded-md p-1.5 hover:bg-muted" data-testid={`home-followup-${c.id}`}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-[11px] font-semibold">{c.name[0]}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{c.name}</span><span className="text-[11px] text-muted-foreground">{c.organisation || c.kind}</span></span>
              <span className={cn("text-[11px]", c.next_follow_up < d.date ? "text-risk" : "text-muted-foreground")}>{relDay(c.next_follow_up)}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function Habits({ d }) {
  const mut = useMut();
  const ck = d.checkin || {};
  return (
    <Card title="Habits & wellbeing" icon={HeartPulse} className="lg:col-span-4" testid="widget-habits" action={<Link to="/personal" className="text-xs font-medium text-brand">Personal</Link>}>
      {d.habits.length === 0 ? <p className="mb-3 text-xs text-muted-foreground">No habits yet. Add routines that matter to you in Personal.</p> : (
        <div className="mb-4 flex flex-wrap gap-2">
          {d.habits.map((h) => (
            <button key={h.id} onClick={() => mut("post", `/habits/${h.id}/toggle`, { date: d.date })} data-testid={`habit-toggle-${h.id}`}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", h.done_today ? "border-ok bg-ok text-white" : "hover:border-ok")}>
              {h.name}{h.streak > 0 && <span className="num ml-1.5 opacity-75">{h.streak}d</span>}
            </button>
          ))}
        </div>
      )}
      <div className="eyebrow mb-1.5">Energy today</div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => mut("put", `/checkins/${d.date}`, { energy: n }, "Check-in saved")} data-testid={`energy-${n}`}
            className={cn("num h-8 flex-1 rounded-md border text-xs font-semibold transition-colors", ck.energy === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{n}</button>
        ))}
      </div>
    </Card>
  );
}

function Wins({ d }) {
  return (
    <Card title="Recent achievements" icon={Trophy} className="lg:col-span-4" testid="widget-wins" action={<Link to="/reviews?tab=achievements" className="text-xs font-medium text-brand">Timeline</Link>}>
      {d.achievements.length === 0 ? <Empty title="Your wins will appear here" text="Milestones, completed projects, goals and streaks are recorded automatically." /> : (
        <ul className="space-y-2">{d.achievements.map((a) => (
          <li key={a.id} className="flex gap-2.5 text-sm"><Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bronze" /><span className="min-w-0"><span className="block truncate">{a.title}</span><span className="text-[11px] text-muted-foreground">{relDay(a.date)}</span></span></li>
        ))}</ul>
      )}
    </Card>
  );
}

function Customise({ hidden, order }) {
  const { setUser } = useAuth();
  const mut = useMut();
  const toggle = async (k) => { const u = await mut("patch", "/me/profile", { widgets: { ...hidden, [k]: !hidden[k] } }); setUser(u); };
  const move = async (i, dir) => { const o = [...order]; [o[i], o[i + dir]] = [o[i + dir], o[i]]; setUser(await mut("patch", "/me/profile", { widget_order: o })); };
  const reset = async () => setUser(await mut("patch", "/me/profile", { widget_order: WIDGETS.map(([k]) => k), widgets: {} }, "Layout restored"));
  const label = Object.fromEntries(WIDGETS);
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8 gap-1.5" data-testid="customise-btn"><SlidersHorizontal className="h-3.5 w-3.5" />Customise</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-60 space-y-2">
        <div className="text-xs font-semibold">Show & order widgets</div>
        {order.map((k, i) => <div key={k} className="flex items-center gap-1.5 text-sm"><button disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-muted-foreground disabled:opacity-30" aria-label="Move up" data-testid={`widget-up-${k}`}>↑</button><button disabled={i === order.length - 1} onClick={() => move(i, 1)} className="px-1 text-muted-foreground disabled:opacity-30" aria-label="Move down" data-testid={`widget-down-${k}`}>↓</button><span className="flex-1">{label[k]}</span><Switch checked={!hidden[k]} onCheckedChange={() => toggle(k)} data-testid={`widget-switch-${k}`} /></div>)}
        <Button size="sm" variant="ghost" className="w-full" onClick={reset} data-testid="widget-reset-btn">Restore default layout</Button>
      </PopoverContent>
    </Popover>
  );
}

export default function Home() {
  const { perspective, user } = useAuth();
  const { byId } = useLookups();
  const { data: d, isLoading, error } = useGet("/dashboard", { date: todayStr(), perspective });
  const [open, setOpen] = useState(null);
  const hidden = user?.settings?.widgets || {};
  const saved = (user?.settings?.widget_order || []).filter((k) => WIDGETS.some(([w]) => w === k));
  const order = [...saved, ...WIDGETS.map(([k]) => k).filter((k) => !saved.includes(k))];
  if (error) return <Empty icon={AlertTriangle} title="Could not load your command centre" text="Please refresh. If it persists, check your connection." testid="home-error" />;
  if (isLoading || !d) return <div className="grid gap-5 lg:grid-cols-12">{[8, 4, 4, 4, 4].map((s, i) => <Skeleton key={i} className={`h-56 lg:col-span-${s}`} />)}</div>;
  const W = { briefing: <Briefing d={d} onOpen={setOpen} />, score: <Score d={d} />, top3: <Top3 d={d} onOpen={setOpen} byId={byId} />, agenda: <Agenda d={d} onOpen={setOpen} />,
    insights: <Insights d={d} />, goals: <Goals d={d} />, projects: <Projects d={d} />, finance: <Finance d={d} />, people: <People d={d} />, habits: <Habits d={d} />, wins: <Wins d={d} /> };
  return (
    <div data-testid="home-page">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="eyebrow">Command centre</span><Tag tone={perspective === "personal" ? "personal" : perspective === "business" ? "business" : "muted"} testid="perspective-tag">{perspective}</Tag></div>
        <div className="flex items-center gap-2">
          {d.inbox_count > 0 && <Button variant="ghost" size="sm" className="h-8 text-xs" asChild><Link to="/tasks?view=inbox" data-testid="inbox-link">{d.inbox_count} in Inbox</Link></Button>}
          <Customise hidden={hidden} order={order} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">{order.filter((k) => !hidden[k]).map((k) => <div key={k} className="contents">{W[k]}</div>)}</div>
      {!hidden.habits && d.perspective === "business" && <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><Moon className="h-3 w-3" />Personal habits are hidden in the Business perspective.</p>}
      <TaskDialog open={!!open} onOpenChange={(o) => !o && setOpen(null)} task={open} />
    </div>
  );
}
