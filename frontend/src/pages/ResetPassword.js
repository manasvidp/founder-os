import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { http, errMsg } from "@/lib/api";
import { Field } from "@/components/app/kit";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setErr(""); setBusy(true);
    try {
      await http.post("/auth/reset-password", { token, password: pw });
      toast.success("Password updated. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6" data-testid="reset-page">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">F</div><span className="font-bold">Founder OS</span></div>
        <h2 className="text-2xl font-bold tracking-tight">Choose a new password</h2>
        {!token ? (
          <p className="mt-3 text-sm text-muted-foreground">This link is missing its reset code. <Link to="/login" className="underline">Request a new link</Link>.</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <Field label="New password"><Input type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="reset-password-input" /></Field>
            <Field label="Type it again"><Input type="password" required minLength={8} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="reset-password-confirm" /></Field>
            <p className="text-[11px] text-muted-foreground">At least 8 characters. The link works once, for an hour.</p>
            {err && <div className="rounded-md bg-risk/10 px-3 py-2 text-xs text-risk" data-testid="reset-error">{err}</div>}
            <Button type="submit" className="w-full" disabled={busy} data-testid="reset-submit-btn">{busy ? "Saving…" : "Save new password"}</Button>
          </form>
        )}
        <Link to="/login" className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground">Back to sign in</Link>
      </div>
    </div>
  );
}
