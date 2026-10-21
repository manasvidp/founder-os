import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Sparkles, Send, Plus, Trash2, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGet, useMut, streamChat, http } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AiMarkdown, ProposedActions, parseActions } from "@/components/app/AiMarkdown";

const PROMPTS = ["Plan my day around my most important goals.", "Review the business and personal commitments competing for my time.", "Identify projects that are falling behind and explain why.",
  "Prepare me for my meetings tomorrow.", "Review my actual spending against my monthly budget.", "Show me what I achieved this week.", "Which tasks should I delegate or postpone?", "Help me plan next quarter around the life I want to build."];

function Message({ m }) {
  if (m.role === "user") return <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground" data-testid="chat-user-msg">{m.content}</div>;
  return (
    <div className="max-w-[92%]" data-testid="chat-ai-msg">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-ai"><Sparkles className="h-3 w-3" />Chief of Staff</div>
      <div className="rounded-2xl rounded-tl-md border bg-card px-4 py-3">
        {m.error ? <p className="text-sm text-risk" data-testid="chat-error">{m.error}</p> : m.content ? <AiMarkdown content={m.content} refs={m.refs} /> : <span className="inline-flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ai" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ai [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ai [animation-delay:240ms]" /></span>}
        {!m.streaming && <ProposedActions actions={parseActions(m.content || "")} />}
      </div>
    </div>
  );
}

export default function Chief() {
  const qc = useQueryClient();
  const mut = useMut();
  const [params, setParams] = useSearchParams();
  const sessions = useGet("/ai/sessions").data || [];
  const [sid, setSid] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef();
  const sent = useRef(false);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);
  const load = async (id) => { setSid(id); setMsgs((await http.get(`/ai/sessions/${id}/messages`)).data); };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "", streaming: true }]);
    const upd = (fn) => setMsgs((m) => { const c = [...m]; c[c.length - 1] = fn(c[c.length - 1]); return c; });
    await streamChat({ message, session_id: sid, onSession: setSid, onDelta: (t) => upd((x) => ({ ...x, content: x.content + t })),
      onDone: (e) => upd((x) => ({ ...x, refs: e.refs, streaming: false })), onError: (err) => upd((x) => ({ ...x, error: err, streaming: false })) });
    upd((x) => ({ ...x, streaming: false }));
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["/ai/sessions"] });
  };

  useEffect(() => {
    const q = params.get("q");
    if (q && !sent.current) { sent.current = true; setParams({}); setSid(null); setMsgs([]); setTimeout(() => send(q), 0); }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid h-[calc(100vh-140px)] gap-5 lg:grid-cols-[240px_1fr]" data-testid="chief-page">
      <aside className="hidden flex-col overflow-hidden rounded-xl border bg-card lg:flex">
        <div className="border-b p-3"><Button className="w-full" variant="outline" size="sm" onClick={() => { setSid(null); setMsgs([]); }} data-testid="new-chat-btn"><Plus className="mr-1 h-4 w-4" />New conversation</Button></div>
        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {sessions.map((s) => (
            <div key={s.id} className={cn("group flex items-center rounded-lg", sid === s.id ? "bg-muted" : "hover:bg-muted/60")}>
              <button onClick={() => load(s.id)} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-xs" data-testid={`session-${s.id}`}>{s.title}</button>
              <button onClick={async () => { await mut("delete", `/ai/sessions/${s.id}`); if (sid === s.id) { setSid(null); setMsgs([]); } }} className="px-2 opacity-0 group-hover:opacity-100" aria-label="Delete conversation" data-testid={`session-delete-${s.id}`}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button>
            </div>
          ))}
          {sessions.length === 0 && <p className="p-3 text-xs text-muted-foreground">Conversations are saved here.</p>}
        </div>
        <div className="flex gap-2 border-t p-3 text-[11px] text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-ok" />Reads only your Founder OS records. Proposes changes; you approve them. Never sends messages or moves money.</div>
      </aside>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background">
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" data-testid="chat-thread">
          {msgs.length === 0 && (
            <div className="mx-auto max-w-2xl pt-6 text-center">
              <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-ai/10 text-ai"><Sparkles className="h-5 w-5" /></div>
              <h1 className="text-xl font-bold tracking-tight">AI Chief of Staff</h1>
              <p className="mt-1 text-sm text-muted-foreground">Grounded in your goals, projects, tasks, calendar, people, finances and habits. Every claim links back to a record.</p>
              <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">{PROMPTS.map((p, i) => (
                <button key={p} onClick={() => send(p)} className="card-hover rounded-lg border bg-card p-3 text-sm" data-testid={`prompt-${i}`}>{p}</button>))}</div>
            </div>
          )}
          {msgs.map((m, i) => <Message key={i} m={m} />)}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t bg-card p-3">
          <div className="flex items-end gap-2">
            <Textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about your business and life…" className="max-h-40 min-h-[44px] resize-none" data-testid="chat-input"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={busy || !input.trim()} data-testid="chat-send-btn" aria-label="Send"><Send className="h-4 w-4" /></Button>
          </div>
        </form>
      </section>
    </div>
  );
}
