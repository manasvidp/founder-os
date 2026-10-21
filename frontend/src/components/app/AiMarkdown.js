import { useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMut } from "@/lib/api";
import { REF_ROUTES } from "@/lib/fmt";

const REF_RE = /\[(task|goal|project|contact|event|note|habit|transaction|doc):([0-9a-f-]{36})(?: ([ps]\.\d+))?\]/g;
const ACT_RE = /```fos-actions\s*([\s\S]*?)(```|$)/;

export function parseActions(text) {
  const m = text.match(ACT_RE);
  if (!m || !m[2]) return [];
  try { const a = JSON.parse(m[1]); return Array.isArray(a) ? a : []; } catch { return []; }
}

export function AiMarkdown({ content, refs = {} }) {
  const clean = content.replace(ACT_RE, "").replace(REF_RE, (_, type, id, loc) => `[${(refs[id]?.title || type).replace(/[[\]]/g, "")}${loc ? ` · ${loc}` : ""}](#ref:${type}:${id}${loc ? `:${loc}` : ""})`);
  return (
    <div className="prose-ai text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        a: ({ href = "", children }) => {
          if (href.startsWith("#ref:")) {
            const [, type, id, loc] = href.split(":");
            return <Link to={REF_ROUTES[type]?.(id, loc) || "/"} data-testid={`ai-ref-${id}`}
              className="mx-0.5 inline-flex items-center rounded bg-brand/10 px-1.5 py-px text-[12px] font-medium text-brand no-underline hover:bg-brand/20">{children}</Link>;
          }
          return <a href={href} target="_blank" rel="noreferrer" className="text-brand underline">{children}</a>;
        },
      }}>{clean}</ReactMarkdown>
    </div>
  );
}

const ALLOWED = {
  create_task: ["title", "priority", "due_date", "domain", "project_id", "goal_id", "est_minutes", "notes", "contact_id"],
  create_goal: ["title", "horizon", "domain", "due_date", "metric_name", "target", "baseline", "unit", "parent_id", "rationale"],
  create_project: ["title", "domain", "goal_id", "due_date", "description"],
};
const URL = { create_task: "/tasks", create_goal: "/goals", create_project: "/projects" };
const LABEL = { create_task: "Task", create_goal: "Goal", create_project: "Project" };

export function ProposedActions({ actions }) {
  const mut = useMut();
  const [state, setState] = useState({});
  const valid = actions.filter((a) => ALLOWED[a.type] && a.title);
  if (!valid.length) return null;
  const approve = async (a, i) => {
    const body = {};
    ALLOWED[a.type].forEach((k) => { if (a[k] !== undefined && a[k] !== null && a[k] !== "") body[k] = a[k]; });
    if (a.type === "create_task") body.status = "todo";
    try { await mut("post", URL[a.type], body); setState((s) => ({ ...s, [i]: "approved" })); } catch { setState((s) => ({ ...s, [i]: "failed" })); }
  };
  const all = async () => { for (let i = 0; i < valid.length; i++) if (!state[i]) await approve(valid[i], i); };
  return (
    <div className="mt-3 rounded-lg border border-ai/30 bg-ai/5 p-3" data-testid="ai-proposed-actions">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ai"><Sparkles className="h-3.5 w-3.5" />Proposed changes · needs your approval</div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={all} data-testid="ai-approve-all-btn">Approve all</Button>
      </div>
      <div className="space-y-1.5">
        {valid.map((a, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md bg-card px-2.5 py-1.5 text-sm" data-testid={`ai-action-${i}`}>
            <span className="rounded bg-muted px-1.5 text-[10px] font-semibold uppercase">{LABEL[a.type]}</span>
            <span className="flex-1 truncate">{a.title}</span>
            {a.due_date && <span className="num text-xs text-muted-foreground">{a.due_date}</span>}
            {state[i] === "approved" ? <span className="flex items-center gap-1 text-xs text-ok"><Check className="h-3.5 w-3.5" />Created</span>
              : state[i] === "dismissed" ? <span className="text-xs text-muted-foreground">Dismissed</span>
              : <>
                <button onClick={() => approve(a, i)} className="rounded p-1 text-ok hover:bg-ok/10" aria-label="Approve" data-testid={`ai-action-approve-${i}`}><Check className="h-4 w-4" /></button>
                <button onClick={() => setState((s) => ({ ...s, [i]: "dismissed" }))} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Dismiss" data-testid={`ai-action-dismiss-${i}`}><X className="h-4 w-4" /></button>
              </>}
          </div>
        ))}
      </div>
    </div>
  );
}
