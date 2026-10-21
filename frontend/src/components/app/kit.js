import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useGet } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function Card({ title, icon: Icon, action, children, className, testid, eyebrow }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      data-testid={testid} className={cn("min-w-0 rounded-xl border bg-card p-5 shadow-sm", className)}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              {eyebrow && <div className="eyebrow">{eyebrow}</div>}
              <h3 className="truncate text-sm font-semibold">{title}</h3>
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </motion.section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]" data-testid="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ProgressRing({ value = 0, size = 112, stroke = 9, color = "hsl(var(--brand))", children, testid }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-testid={testid}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (v / 100) * c }} transition={{ duration: 0.9, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Bar({ value, expected, className, color = "bg-brand" }) {
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <motion.div className={cn("h-full rounded-full", color)} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} transition={{ duration: 0.6 }} />
      {expected != null && <div className="absolute top-0 h-full w-0.5 bg-foreground/40" style={{ left: `${Math.min(100, expected)}%` }} title={`Expected ${expected}%`} />}
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action, testid }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center" data-testid={testid}>
      {Icon && <Icon className="mb-2 h-5 w-5 text-muted-foreground" />}
      <div className="text-sm font-medium">{title}</div>
      {text && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const TONES = {
  business: "bg-brand/10 text-brand", personal: "bg-ok/10 text-ok", risk: "bg-risk/10 text-risk", warning: "bg-warn/15 text-warn",
  info: "bg-info/10 text-info", ai: "bg-ai/10 text-ai", muted: "bg-muted text-muted-foreground", ok: "bg-ok/10 text-ok", bronze: "bg-bronze/15 text-bronze",
};
export const Tag = ({ tone = "muted", children, className, testid }) => (
  <span data-testid={testid} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium", TONES[tone], className)}>{children}</span>
);
export const DomainTag = ({ domain }) => <Tag tone={domain}>{domain === "business" ? "Business" : "Personal"}</Tag>;
const PCOL = { 1: "bg-risk", 2: "bg-warn", 3: "bg-brand", 4: "bg-muted-foreground/40" };
export const Pri = ({ p }) => <span title={`Priority ${p}`} className={cn("inline-block h-2 w-2 shrink-0 rounded-full", PCOL[p])} />;

export function Stat({ label, value, sub, tone, testid, onClick }) {
  return (
    <div onClick={onClick} data-testid={testid} className={cn("rounded-lg border bg-card p-4", onClick && "card-hover cursor-pointer")}>
      <div className="eyebrow">{label}</div>
      <div className={cn("num mt-1.5 text-xl font-semibold", tone && `text-${tone}`)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Sel({ value, onChange, options, placeholder, testid, className, allowNone }) {
  const opts = allowNone ? [{ value: null, label: allowNone === true ? "None" : allowNone }, ...options] : options;
  return (
    <Select value={value == null ? (allowNone ? "__none" : undefined) : String(value)} onValueChange={(v) => onChange(v === "__none" ? null : v)}>
      <SelectTrigger data-testid={testid} className={cn("h-9", className)}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {opts.map((o) => <SelectItem key={o.value ?? "__none"} value={o.value == null ? "__none" : String(o.value)}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export const Field = ({ label, children, className }) => (
  <div className={cn("space-y-1.5", className)}><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>
);

export function useLookups() {
  const projects = useGet("/projects").data || [];
  const goals = useGet("/goals").data || [];
  const contacts = useGet("/contacts").data || [];
  const byId = {};
  projects.forEach((p) => { byId[p.id] = p.title; });
  goals.forEach((g) => { byId[g.id] = g.title; });
  contacts.forEach((c) => { byId[c.id] = c.name; });
  return { projects, goals, contacts, byId };
}

export const DOMAINS = [{ value: "business", label: "Business" }, { value: "personal", label: "Personal" }];
export const HORIZONS = [
  { value: "vision", label: "Vision" }, { value: "three_year", label: "3-Year" }, { value: "annual", label: "Annual" },
  { value: "quarter", label: "Quarter" }, { value: "month", label: "Month" }, { value: "week", label: "Week" },
];
