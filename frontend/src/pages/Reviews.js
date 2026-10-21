import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, Sparkles, Moon, CalendarRange, Award, Plus, Search, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGet, useMut } from "@/lib/api";
import { todayStr, addDays, weekStart, fdate, mins } from "@/lib/fmt";
import { useAuth } from "@/context/Auth";
import { cn } from "@/lib/utils";
import { PageHeader, Card, Stat, Empty, Tag, Field, Sel, DOMAINS, ProgressRing } from "@/components/app/kit";
import { TaskCheck } from "@/components/app/TaskRow";

const T = todayStr();
const RFIELDS = [["wins", "Wins — what went well?"], ["challenges", "Challenges — what got in the way?"], ["lessons", "Lessons"], ["next_focus", "Focus for next period"], ["gratitude", "Gratitude (optional)"]];

function ReviewForm({ kind, start, end, extra }) {
  const mut = useMut();
  const nav = useNavigate();
  const { data: stats } = useGet("/reviews/stats", { start, end });
  const existing = (useGet("/reviews", { kind, period_start: start }).data || [])[0];
  const [f, setF] = useState({});
  useEffect(() => { setF(existing ? { ...existing } : {}); }, [existing?.id, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    const body = { kind, period_start: start, period_end: end, draft: false, stats: stats ? { tasks_completed: stats.tasks_completed, top3_done: stats.top3_done, top3_set: stats.top3_set, focus_minutes: stats.focus_minutes, habit_completion: stats.habit_completion } : {} };
    RFIELDS.forEach(([k]) => { body[k] = f[k] || null; });
    if (existing) await mut("patch", `/reviews/${existing.id}`, body, "Review updated"); else await mut("post", "/reviews", body, kind === "daily" ? "Shutdown complete. Rest well." : "Review saved");
  };
  const draft = () => nav(`/chief?q=${encodeURIComponent(`Run my ${kind} review for ${start} to ${end}. Compare goals, completed work, time allocation between business and personal, spending and wellbeing. Then propose next ${kind === "daily" ? "day's" : "week's"} top priorities as actions.`)}`);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 [&>*]:min-w-0">
      <div className="space-y-3 lg:col-span-1">
        {stats && <div className="grid grid-cols-2 gap-3">
          <Stat label="Tasks done" value={stats.tasks_completed} sub={`${stats.tasks_by_domain.business} biz · ${stats.tasks_by_domain.personal} personal`} testid="review-stat-tasks" />
          <Stat label="Top-3 hit rate" value={stats.top3_set ? `${stats.top3_done}/${stats.top3_set}` : "—"} testid="review-stat-top3" />
          <Stat label="Focus time" value={mins(stats.focus_minutes)} sub="actual or estimated" testid="review-stat-focus" />
          <Stat label="Habits" value={stats.habit_completion != null ? `${stats.habit_completion}%` : "—"} testid="review-stat-habits" />
          <Stat label="Meetings" value={`${stats.event_hours.business}h`} sub={`${stats.event_hours.personal}h personal`} testid="review-stat-hours" />
          <Stat label="Interactions" value={stats.interactions} testid="review-stat-interactions" />
        </div>}
        {stats?.completed?.length > 0 && <Card title="Completed"><ul className="max-h-48 space-y-1 overflow-y-auto text-xs">{stats.completed.map((t) => <li key={t.id} className="truncate">✓ {t.title}</li>)}</ul></Card>}
        {extra}
      </div>
      <Card className="lg:col-span-2" title={`${kind === "daily" ? "Daily shutdown" : "Weekly review"} · ${fdate(start)}${start !== end ? ` – ${fdate(end)}` : ""}`} testid={`review-form-${kind}`}
        action={<Button size="sm" variant="outline" className="border-ai/30 text-ai" onClick={draft} data-testid={`review-ai-${kind}`}><Sparkles className="mr-1 h-3.5 w-3.5" />Review with AI</Button>}>
        <div className="space-y-3">{RFIELDS.map(([k, l]) => <Field key={k} label={l}><Textarea rows={2} value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`review-${kind}-${k}`} /></Field>)}</div>
        <div className="mt-4 flex items-center justify-between"><span className="text-xs text-muted-foreground">{existing ? (existing.draft ? "Auto-prepared draft — edit and save to confirm." : "Saved — edits update this review.") : "Not yet saved."}</span>
          <div className="flex gap-2">{kind === "weekly" && !existing && <Button variant="outline" onClick={() => mut("post", "/reviews/draft-weekly", null, "Draft prepared from your data")} data-testid="review-prefill-btn">Pre-fill from my week</Button>}
          <Button onClick={save} data-testid={`review-save-${kind}`}>{kind === "daily" ? "Complete shutdown" : "Save review"}</Button></div></div>
      </Card>
    </div>
  );
}

function TomorrowTop3() {
  const mut = useMut();
  const tm = addDays(T, 1);
  const tasks = useGet("/tasks").data || [];
  const chosen = tasks.filter((t) => t.top3_date === tm);
  const pool = tasks.filter((t) => t.status !== "done" && t.top3_date !== tm);
  return (
    <Card title="Set tomorrow's top three" icon={Moon} testid="tomorrow-top3">
      {chosen.map((t) => <div key={t.id} className="flex items-center gap-2 py-1 text-sm"><TaskCheck task={t} /><span className="flex-1 truncate">{t.title}</span><button className="text-xs text-muted-foreground" onClick={() => mut("patch", `/tasks/${t.id}`, { top3_date: null })}>remove</button></div>)}
      {chosen.length < 3 && <Sel value={null} placeholder="+ Choose a task" onChange={(id) => id && mut("patch", `/tasks/${id}`, { top3_date: tm }, "Set for tomorrow")} options={pool.slice(0, 40).map((t) => ({ value: t.id, label: t.title }))} testid="tomorrow-top3-select" className="mt-2" />}
    </Card>
  );
}

function Achievements() {
  const mut = useMut();
  const { data: p } = useGet("/progress", { date: T });
  const list = useGet("/achievements").data || [];
  const [q, setQ] = useState("");
  const [f, setF] = useState({ title: "", domain: "business", date: T });
  const shown = list.filter((a) => !q || `${a.title} ${a.description || ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 [&>*]:min-w-0">
      <div className="space-y-5">
        {p && <Card testid="level-card"><div className="flex items-center gap-4">
          <ProgressRing value={((p.xp - p.level_floor) / (p.next_level_xp - p.level_floor)) * 100} size={92} color="hsl(var(--bronze))"><div><div className="num text-xl font-bold">{p.level}</div><div className="text-[10px] text-muted-foreground">level</div></div></ProgressRing>
          <div><div className="font-semibold" data-testid="level-title">{p.title}</div><div className="num text-xs text-muted-foreground">{p.xp} XP · {p.next_level_xp - p.xp} to next level</div><div className="mt-1 text-[11px] text-muted-foreground">Earned only from real completed work, habits, reviews and relationships.</div></div>
        </div></Card>}
        {p && <Card title="Badges" icon={Award} testid="badges-card"><div className="grid grid-cols-2 gap-2">{p.badges.map((b) => (
          <div key={b.key} className={cn("rounded-lg border p-2.5", !b.earned && "opacity-50")} data-testid={`badge-${b.key}`}>
            <div className="flex items-center gap-1.5 text-xs font-semibold">{b.earned ? <Trophy className="h-3.5 w-3.5 text-bronze" /> : <Lock className="h-3.5 w-3.5" />}{b.name}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{b.desc}</div></div>))}</div></Card>}
        <Card title="Record a win" icon={Plus} testid="add-win-card">
          <div className="space-y-2">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What did you achieve?" data-testid="win-title-input" />
            <div className="grid grid-cols-2 gap-2"><Sel value={f.domain} onChange={(v) => setF({ ...f, domain: v })} options={DOMAINS} testid="win-domain-select" /><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="win-date-input" /></div>
            <Button className="w-full" disabled={!f.title.trim()} data-testid="win-save-btn" onClick={async () => { await mut("post", "/achievements", { ...f, kind: f.domain === "personal" ? "personal" : "win" }, "Win recorded"); setF({ ...f, title: "" }); }}>Add to timeline</Button>
          </div>
        </Card>
      </div>
      <Card title="Momentum timeline" icon={Trophy} className="lg:col-span-2" testid="achievement-timeline"
        action={<div className="relative"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search wins" className="h-8 w-44 pl-7 text-xs" data-testid="win-search" /></div>}>
        {shown.length === 0 ? <Empty title="No achievements yet" text="Completing milestones, projects, goals and habit streaks adds entries automatically." /> : (
          <ol className="relative space-y-4 border-l pl-5">{shown.map((a) => (
            <li key={a.id} className="relative" data-testid={`achievement-${a.id}`}><span className={cn("absolute -left-[26px] top-1 grid h-3 w-3 place-items-center rounded-full", a.domain === "personal" ? "bg-ok" : "bg-bronze")} />
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">{fdate(a.date, { month: "short", day: "numeric", year: "numeric" })}<Tag tone={a.domain}>{a.kind}</Tag>{a.auto && <Tag>auto</Tag>}</div>
              <div className="text-sm font-medium">{a.title}</div>{a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}</li>))}</ol>
        )}
      </Card>
    </div>
  );
}

function History() {
  const list = useGet("/reviews").data || [];
  return list.length === 0 ? <Empty icon={CalendarRange} title="No reviews yet" text="Your daily shutdowns and weekly reviews build a record of how you've grown." /> : (
    <div className="grid gap-4 md:grid-cols-2">{list.map((r) => (
      <Card key={r.id} title={`${r.kind} · ${fdate(r.period_start)}${r.period_end !== r.period_start ? ` – ${fdate(r.period_end)}` : ""}`} testid={`review-history-${r.id}`}>
        {RFIELDS.filter(([k]) => r[k]).map(([k, l]) => <div key={k} className="mb-2"><div className="eyebrow">{l.split(" —")[0]}</div><p className="whitespace-pre-line text-sm">{r[k]}</p></div>)}
        {r.stats?.tasks_completed != null && <div className="num mt-2 text-[11px] text-muted-foreground">{r.stats.tasks_completed} tasks · top-3 {r.stats.top3_done}/{r.stats.top3_set}</div>}
      </Card>))}</div>
  );
}

export default function Reviews() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "weekly";
  const ws = weekStart(T);
  useAuth();
  return (
    <div data-testid="reviews-page">
      <PageHeader eyebrow="Reflection" title="Reviews & Achievements" subtitle="Close the loop: what happened, what you learned, and what comes next." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList className="mb-5 h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="weekly" data-testid="tab-weekly">Weekly review</TabsTrigger>
          <TabsTrigger value="shutdown" data-testid="tab-shutdown">Daily shutdown</TabsTrigger>
          <TabsTrigger value="achievements" data-testid="tab-achievements">Achievements</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="weekly"><ReviewForm kind="weekly" start={ws} end={addDays(ws, 6)} /></TabsContent>
        <TabsContent value="shutdown"><ReviewForm kind="daily" start={T} end={T} extra={<TomorrowTop3 />} /></TabsContent>
        <TabsContent value="achievements"><Achievements /></TabsContent>
        <TabsContent value="history"><History /></TabsContent>
      </Tabs>
    </div>
  );
}
