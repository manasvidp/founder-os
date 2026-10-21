import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, HeartPulse, Flame, Scale, Target, Trash2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useGet, useMut } from "@/lib/api";
import { todayStr, addDays, parseD } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { PageHeader, Card, Empty, Sel, Field, Bar, Tag } from "@/components/app/kit";

const AREAS = ["health", "fitness", "sleep", "mind", "learning", "relationships", "creativity", "admin", "work", "other"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const ROUTINES = [["morning", "Morning"], ["evening", "Evening"], ["anytime", "Anytime"]].map(([value, label]) => ({ value, label }));
const T = todayStr();

function HabitDialog({ open, onOpenChange }) {
  const mut = useMut();
  const [f, setF] = useState({ name: "", area: "health", target_per_week: 7, routine: "anytime" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="habit-dialog">
        <DialogHeader><DialogTitle>New habit</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Habit" className="col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. 20 min walk" data-testid="habit-name-input" /></Field>
          <Field label="Area"><Sel value={f.area} onChange={(v) => setF({ ...f, area: v })} options={AREAS} testid="habit-area-select" /></Field>
          <Field label="Routine"><Sel value={f.routine} onChange={(v) => setF({ ...f, routine: v })} options={ROUTINES} testid="habit-routine-select" /></Field>
          <Field label="Target days per week"><Input type="number" min="1" max="7" value={f.target_per_week} onChange={(e) => setF({ ...f, target_per_week: Number(e.target.value) })} data-testid="habit-target-input" /></Field>
        </div>
        <p className="text-[11px] text-muted-foreground">Streaks forgive a single missed day. Consistency matters more than perfection.</p>
        <DialogFooter><Button disabled={!f.name.trim()} data-testid="habit-save-btn" onClick={async () => { await mut("post", "/habits", { ...f, domain: "personal" }, "Habit added"); onOpenChange(false); setF({ ...f, name: "" }); }}>Add habit</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Checkin({ today }) {
  const mut = useMut();
  const c = today || {};
  const scale = (k, label) => (
    <div><div className="eyebrow mb-1.5">{label}</div><div className="flex gap-1.5">{[1, 2, 3, 4, 5].map((n) => (
      <button key={n} onClick={() => mut("put", `/checkins/${T}`, { [k]: n })} data-testid={`checkin-${k}-${n}`}
        className={cn("num h-8 flex-1 rounded-md border text-xs font-semibold", c[k] === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{n}</button>))}</div></div>
  );
  return (
    <Card title="Today's check-in" icon={HeartPulse} testid="checkin-card">
      <div className="space-y-3">
        {scale("energy", "Energy")}{scale("mood", "Mood")}{scale("stress", "Stress")}
        <div><div className="eyebrow mb-1.5">Sleep (hours)</div>
          <Input type="number" step="0.5" min="0" max="24" defaultValue={c.sleep_hours ?? ""} key={c.sleep_hours} data-testid="checkin-sleep-input"
            onBlur={(e) => e.target.value !== "" && Number(e.target.value) !== c.sleep_hours && mut("put", `/checkins/${T}`, { sleep_hours: Number(e.target.value) }, "Sleep logged")} /></div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Self-reported and private. Used to spot unsustainable workload, never to judge you.</p>
    </Card>
  );
}

export default function Personal() {
  const mut = useMut();
  const habits = useGet("/habits/overview", { date: T }).data || [];
  const checkins = useGet("/checkins").data || [];
  const goals = (useGet("/strategy/overview", { date: T }).data?.goals || []).filter((g) => g.domain === "personal" && g.status === "active");
  const balance = useGet("/reviews/stats", { start: addDays(T, -6), end: T }).data;
  const [open, setOpen] = useState(false);
  const week = Array.from({ length: 7 }, (_, i) => addDays(T, i - 6));
  const chart = [...checkins].reverse().slice(-21).map((c) => ({ d: c.date.slice(5), energy: c.energy, mood: c.mood, sleep: c.sleep_hours }));
  const bh = balance?.event_hours?.business || 0, ph = balance?.event_hours?.personal || 0;
  const bt = balance?.tasks_by_domain?.business || 0, pt = balance?.tasks_by_domain?.personal || 0;
  return (
    <div data-testid="personal-page">
      <PageHeader eyebrow="Life" title="Personal" subtitle="Health, routines, relationships, learning and the life outside the business."
        actions={<Button onClick={() => setOpen(true)} data-testid="new-habit-btn"><Plus className="mr-1 h-4 w-4" />Habit</Button>} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Habits & routines" icon={Flame} className="lg:col-span-2" testid="habits-card">
          {habits.length === 0 ? <Empty title="No habits yet" text="Track the routines you actually care about — sleep, movement, reading, time with family." testid="habits-empty" /> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-[11px] text-muted-foreground"><th className="pb-2 text-left font-medium">Habit</th>
              {week.map((d) => <th key={d} className="w-9 pb-2 font-medium">{parseD(d).toLocaleDateString(undefined, { weekday: "narrow" })}</th>)}<th className="pb-2 pl-3 text-right font-medium">Streak</th><th /></tr></thead>
              <tbody>{habits.map((h) => (
                <tr key={h.id} className="border-t" data-testid={`habit-row-${h.id}`}>
                  <td className="py-2.5"><div className="font-medium">{h.name}</div><div className="text-[11px] text-muted-foreground">{h.routine} · {h.week_count}/{h.target_per_week} this week</div></td>
                  {week.map((d, i) => (
                    <td key={d} className="text-center"><button onClick={() => mut("post", `/habits/${h.id}/toggle`, { date: d })} data-testid={`habit-cell-${h.id}-${d}`} aria-label={`Toggle ${h.name} on ${d}`}
                      className={cn("h-7 w-7 rounded-md border transition-colors", h.last7[i] ? "border-ok bg-ok" : "hover:border-ok", d === T && !h.last7[i] && "border-foreground/40")} /></td>))}
                  <td className="num pl-3 text-right font-semibold">{h.streak}d</td>
                  <td className="pl-2 text-right"><button onClick={() => window.confirm("Delete habit and its history?") && mut("delete", `/habits/${h.id}`, null, "Habit deleted")} aria-label="Delete habit" data-testid={`habit-delete-${h.id}`}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button></td>
                </tr>))}</tbody></table></div>
          )}
        </Card>
        <Checkin today={checkins.find((c) => c.date === T)} />
        <Card title="Work–life balance · last 7 days" icon={Scale} testid="balance-card">
          {!balance ? null : <div className="space-y-4 text-sm">
            <div><div className="mb-1 flex justify-between text-xs"><span>Calendar time</span><span className="num">{bh}h business · {ph}h personal</span></div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted"><div className="bg-brand" style={{ width: `${bh + ph ? (100 * bh) / (bh + ph) : 0}%` }} /><div className="bg-ok" style={{ width: `${bh + ph ? (100 * ph) / (bh + ph) : 0}%` }} /></div></div>
            <div><div className="mb-1 flex justify-between text-xs"><span>Completed tasks</span><span className="num">{bt} business · {pt} personal</span></div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted"><div className="bg-brand" style={{ width: `${bt + pt ? (100 * bt) / (bt + pt) : 0}%` }} /><div className="bg-ok" style={{ width: `${bt + pt ? (100 * pt) / (bt + pt) : 0}%` }} /></div></div>
            <div className="text-xs text-muted-foreground">Avg energy: <span className="num text-foreground">{balance.avg_energy ?? "—"}</span> · Habit completion: <span className="num text-foreground">{balance.habit_completion ?? "—"}{balance.habit_completion != null && "%"}</span></div>
          </div>}
        </Card>
        <Card title="Wellbeing trend" className="lg:col-span-2" testid="wellbeing-chart">
          {chart.length < 2 ? <p className="text-xs text-muted-foreground">Check in on a few days to see your energy, mood and sleep trend.</p> : (
            <div className="h-48"><ResponsiveContainer><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="d" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={28} /><Tooltip />
              <Line dataKey="energy" stroke="hsl(var(--ok))" dot={false} connectNulls /><Line dataKey="mood" stroke="hsl(var(--brand))" dot={false} connectNulls /><Line dataKey="sleep" stroke="hsl(var(--ai))" dot={false} connectNulls /></LineChart></ResponsiveContainer></div>
          )}
        </Card>
        <Card title="Personal goals" icon={Target} className="lg:col-span-3" testid="personal-goals" action={<Link to="/plan" className="text-xs font-medium text-brand">Plan</Link>}>
          {goals.length === 0 ? <p className="text-xs text-muted-foreground">Health, relationships, learning, travel, financial independence — set personal goals in Plan with the Personal area.</p> : (
            <div className="grid gap-4 md:grid-cols-3">{goals.map((g) => (
              <Link key={g.id} to={`/plan?goal=${g.id}`} className="rounded-lg border p-3 hover:bg-muted/50"><div className="flex justify-between gap-2 text-sm font-medium"><span className="truncate">{g.title}</span><Tag tone="personal">{g.horizon.replace("_", " ")}</Tag></div><Bar value={g.progress} expected={g.expected} color="bg-ok" className="mt-2" /></Link>))}</div>
          )}
        </Card>
      </div>
      <HabitDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
