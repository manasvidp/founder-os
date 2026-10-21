const pad = (n) => String(n).padStart(2, "0");
export const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dstr(new Date());
export const parseD = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
export const weekStart = (s) => { const d = parseD(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return dstr(d); };
export const fdate = (s, opts = { month: "short", day: "numeric" }) => (s ? parseD(s).toLocaleDateString(undefined, opts) : "");
export const fday = (s) => fdate(s, { weekday: "long", month: "long", day: "numeric" });
export const relDay = (s) => {
  if (!s) return "";
  const diff = Math.round((parseD(s) - parseD(todayStr())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff < 0 ? `${-diff}d overdue` : diff < 7 ? parseD(s).toLocaleDateString(undefined, { weekday: "short" }) : fdate(s);
};
export const money = (n, cur = "USD", compact = false) =>
  n == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: compact || Math.abs(n) >= 1000 ? 0 : 2, notation: compact ? "compact" : "standard" }).format(n);
export const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m || 0}m`);
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
export const REF_ROUTES = {
  task: (id) => `/tasks?task=${id}`, goal: (id) => `/plan?goal=${id}`, project: (id) => `/projects/${id}`,
  contact: (id) => `/people?contact=${id}`, event: () => "/calendar", note: (id) => `/notes?note=${id}`,
  habit: () => "/personal", transaction: () => "/finance", doc: (id, loc) => `/knowledge?doc=${id}${loc ? `&loc=${loc}` : ""}`,
};
