import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { http, errMsg } from "@/lib/api";
import { useAuth } from "@/context/Auth";
import { Field } from "@/components/app/kit";

const POINTS = ["Vision to daily execution in one connected system", "Business and personal life, clearly separated and intelligently linked", "An AI Chief of Staff grounded in your real records"];

export default function Login() {
  const { user, signIn } = useAuth();
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ email: "", password: "", name: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [cfg, setCfg] = useState({ google: false, email: false, signups: true });
  const [params] = useSearchParams();
  useEffect(() => { http.get("/auth/config").then((r) => setCfg(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    const e = params.get("auth_error");
    if (e) setErr(e === "closed" ? "New sign-ups are closed for this workspace." : "Google sign-in didn't complete. Please try again.");
  }, [params]);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    if (mode === "forgot") {
      try { const { data } = await http.post("/auth/forgot-password", { email: f.email }); setSent(data.message); }
      catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
      return;
    }
    try {
      const { data } = await http.post(mode === "login" ? "/auth/login" : "/auth/register", mode === "login" ? { email: f.email, password: f.password } : f);
      signIn(data);
    } catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };
  const google = () => { window.location.href = "/api/auth/google/start"; };
  const switchMode = (m) => { setMode(m); setErr(""); setSent(""); };
  const TITLES = { login: ["Welcome back", "Sign in to your command centre."], register: ["Create your workspace", "Set up your private Founder OS."],
    forgot: ["Reset your password", "We'll email you a link to choose a new one."] };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5"><div className="grid h-9 w-9 place-items-center rounded-lg bg-primary-foreground font-extrabold text-primary">F</div><span className="font-bold">Founder OS</span></div>
        <div>
          <div className="eyebrow mb-4 !text-primary-foreground/60">Your executive operating environment</div>
          <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight">One person. One connected system. One clear direction.</h1>
          <ul className="mt-8 space-y-3 text-sm text-primary-foreground/75">{POINTS.map((p) => <li key={p} className="flex gap-3"><span className="mt-2 h-1 w-4 bg-primary-foreground/50" />{p}</li>)}</ul>
        </div>
        <div className="text-xs text-primary-foreground/50">Your data stays private to your account. <a href="/privacy" className="underline" data-testid="privacy-link">Privacy & data handling</a></div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight">{TITLES[mode][0]}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{TITLES[mode][1]}</p>
          {cfg.google && mode !== "forgot" && <>
          <Button variant="outline" className="mt-6 w-full" onClick={google} data-testid="google-login-btn">
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.8z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" /></svg>
            Continue with Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" /></div>
          </>}
          {!(cfg.google && mode !== "forgot") && <div className="mt-6" />}
          {sent ? (
            <div className="rounded-md border bg-muted/40 px-3 py-3 text-sm" data-testid="forgot-sent">{sent}</div>
          ) : (
          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && <Field label="Name"><Input required value={f.name} onChange={set("name")} data-testid="register-name-input" /></Field>}
            <Field label="Email"><Input type="email" required value={f.email} onChange={set("email")} data-testid="login-email-input" /></Field>
            {mode !== "forgot" && <Field label="Password"><Input type="password" required minLength={mode === "register" ? 8 : 1} value={f.password} onChange={set("password")} data-testid="login-password-input" /></Field>}
            {mode === "login" && <div className="-mt-1 text-right"><button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => switchMode("forgot")} data-testid="login-forgot-password-link">Forgot password?</button></div>}
            {err && <div className="rounded-md bg-risk/10 px-3 py-2 text-xs text-risk" data-testid="auth-error">{err}</div>}
            <Button type="submit" className="w-full" disabled={busy} data-testid="login-submit-btn">{busy ? "Please wait…" : { login: "Sign in", register: "Create account", forgot: "Email me a reset link" }[mode]}</Button>
          </form>
          )}
          {(cfg.signups || mode !== "login") && <button className="mt-4 text-sm text-muted-foreground hover:text-foreground" onClick={() => switchMode(mode === "login" ? "register" : "login")} data-testid="auth-mode-toggle">
            {mode === "login" ? "New here? Create an account" : mode === "forgot" ? "Back to sign in" : "Already have an account? Sign in"}
          </button>}
        </div>
      </div>
    </div>
  );
}
