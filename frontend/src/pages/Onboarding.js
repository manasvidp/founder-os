import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { http, errMsg } from "@/lib/api";
import { todayStr } from "@/lib/fmt";
import { useAuth } from "@/context/Auth";
import { Field, Sel, DOMAINS } from "@/components/app/kit";
import { toast } from "sonner";

const CUR = ["USD", "GBP", "EUR", "CAD", "AUD", "INR", "SGD", "AED"].map((c) => ({ value: c, label: c }));
const STEPS = ["About you", "Direction", "Rhythm", "First goal", "Today"];

export default function Onboarding() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: user?.name || "", company_name: "", role: "Founder", currency: "USD", life_vision: "", company_vision: "", definition_of_success: "",
    work_start: "09:00", work_end: "18:00", daily_capacity_minutes: 360, goal: "", goal_domain: "business", metric_name: "", target: "", baseline: "", goal_due: "", t1: "", t2: "", t3: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  const finish = async () => {
    setBusy(true);
    try {
      let goalId = null;
      if (f.goal.trim()) {
        const g = await http.post("/goals", { title: f.goal, horizon: "quarter", domain: f.goal_domain, metric_name: f.metric_name || null,
          target: f.target === "" ? null : Number(f.target), baseline: f.baseline === "" ? null : Number(f.baseline), current: f.baseline === "" ? null : Number(f.baseline),
          due_date: f.goal_due || null, start_date: todayStr() });
        goalId = g.data.id;
      }
      for (const t of [f.t1, f.t2, f.t3].filter((x) => x.trim())) {
        await http.post("/tasks", { title: t, status: "todo", priority: 2, top3_date: todayStr(), due_date: todayStr(), goal_id: goalId, domain: f.goal_domain });
      }
      const { data } = await http.patch("/me/profile", { name: f.name, company_name: f.company_name || null, role: f.role || null, currency: f.currency,
        life_vision: f.life_vision || null, company_vision: f.company_vision || null, definition_of_success: f.definition_of_success || null,
        work_start: f.work_start, work_end: f.work_end, daily_capacity_minutes: Number(f.daily_capacity_minutes), onboarding_complete: true });
      setUser(data);
      nav("/", { replace: true });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const body = [
    <div className="grid gap-4 sm:grid-cols-2" key="0">
      <Field label="Your name"><Input value={f.name} onChange={set("name")} data-testid="onb-name-input" /></Field>
      <Field label="Company"><Input value={f.company_name} onChange={set("company_name")} data-testid="onb-company-input" /></Field>
      <Field label="Role"><Input value={f.role} onChange={set("role")} data-testid="onb-role-input" /></Field>
      <Field label="Currency"><Sel value={f.currency} onChange={set("currency")} options={CUR} testid="onb-currency-select" /></Field>
    </div>,
    <div className="space-y-4" key="1">
      <Field label="Company vision — what are you building and why?"><Textarea rows={3} value={f.company_vision} onChange={set("company_vision")} data-testid="onb-company-vision" /></Field>
      <Field label="Life vision — the life you want to build"><Textarea rows={3} value={f.life_vision} onChange={set("life_vision")} data-testid="onb-life-vision" /></Field>
      <Field label="How do you define success? (your words, not ours)"><Textarea rows={2} value={f.definition_of_success} onChange={set("definition_of_success")} data-testid="onb-success" /></Field>
    </div>,
    <div className="grid gap-4 sm:grid-cols-3" key="2">
      <Field label="Work starts"><Input type="time" value={f.work_start} onChange={set("work_start")} data-testid="onb-work-start" /></Field>
      <Field label="Work ends"><Input type="time" value={f.work_end} onChange={set("work_end")} data-testid="onb-work-end" /></Field>
      <Field label="Focused work per day (min)"><Input type="number" min="30" max="1200" value={f.daily_capacity_minutes} onChange={set("daily_capacity_minutes")} data-testid="onb-capacity" /></Field>
      <p className="text-xs text-muted-foreground sm:col-span-3">Founder OS uses this to flag overcommitment and protect your evenings. You can change it any time.</p>
    </div>,
    <div className="grid gap-4 sm:grid-cols-2" key="3">
      <Field label="One goal for this quarter (optional)" className="sm:col-span-2"><Input value={f.goal} onChange={set("goal")} placeholder="e.g. Reach $20k monthly recurring revenue" data-testid="onb-goal-input" /></Field>
      <Field label="Area"><Sel value={f.goal_domain} onChange={set("goal_domain")} options={DOMAINS} testid="onb-goal-domain" /></Field>
      <Field label="Due"><Input type="date" value={f.goal_due} onChange={set("goal_due")} data-testid="onb-goal-due" /></Field>
      <Field label="Success metric"><Input value={f.metric_name} onChange={set("metric_name")} placeholder="e.g. MRR" data-testid="onb-metric" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Baseline"><Input type="number" value={f.baseline} onChange={set("baseline")} data-testid="onb-baseline" /></Field>
        <Field label="Target"><Input type="number" value={f.target} onChange={set("target")} data-testid="onb-target" /></Field>
      </div>
    </div>,
    <div className="space-y-3" key="4">
      <p className="text-sm text-muted-foreground">What are the three things that would make today a success? (optional)</p>
      {["t1", "t2", "t3"].map((k, i) => <Input key={k} value={f[k]} onChange={set(k)} placeholder={`Priority ${i + 1}`} data-testid={`onb-${k}`} />)}
    </div>,
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-2">{STEPS.map((s, i) => <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-muted"}`} />)}</div>
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="rounded-xl border bg-card p-6 shadow-sm sm:p-8" data-testid="onboarding-card">
          <div className="eyebrow">Step {step + 1} of {STEPS.length}</div>
          <h1 className="mb-6 mt-1 text-2xl font-bold tracking-tight">{STEPS[step]}</h1>
          {body[step]}
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} data-testid="onb-back-btn">Back</Button>
            {step < STEPS.length - 1
              ? <Button onClick={() => setStep(step + 1)} data-testid="onb-next-btn">Continue</Button>
              : <Button onClick={finish} disabled={busy} data-testid="onb-finish-btn">{busy ? "Setting up…" : "Enter my command centre"}</Button>}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
