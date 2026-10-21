import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, NotebookPen, Lightbulb, Scale, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useGet, useMut } from "@/lib/api";
import { useAuth } from "@/context/Auth";
import { fdate } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { PageHeader, Empty, Tag, Sel, Field, DOMAINS, useLookups } from "@/components/app/kit";

const KINDS = ["note", "idea", "decision", "meeting", "journal", "learning"];
const ICON = { decision: Scale, idea: Lightbulb, meeting: Users };
const KEYS = ["title", "body", "kind", "domain", "project_id", "goal_id", "contact_id", "decision", "rationale", "alternatives"];

function NoteDialog({ open, onOpenChange, note }) {
  const mut = useMut();
  const { projects, goals, contacts } = useLookups();
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF(note ? { ...note } : { title: "", kind: "note", domain: "business" }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    const body = {}; KEYS.forEach((k) => { body[k] = f[k] === "" || f[k] === undefined ? null : f[k]; });
    if (note) await mut("patch", `/notes/${note.id}`, body, "Note saved"); else await mut("post", "/notes", body, f.kind === "meeting" ? "Meeting note saved · action items extracted" : "Note saved");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="note-dialog">
        <DialogHeader><DialogTitle>{note ? "Edit" : "New"} {f.kind}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Input placeholder="Title" value={f.title || ""} onChange={set("title")} data-testid="note-title-input" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="Type"><Sel value={f.kind} onChange={set("kind")} options={KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))} testid="note-kind-select" /></Field>
            <Field label="Area"><Sel value={f.domain} onChange={set("domain")} options={DOMAINS} testid="note-domain-select" /></Field>
            <Field label="Project"><Sel allowNone value={f.project_id} onChange={set("project_id")} options={projects.map((p) => ({ value: p.id, label: p.title }))} testid="note-project-select" /></Field>
            <Field label="Goal"><Sel allowNone value={f.goal_id} onChange={set("goal_id")} options={goals.map((g) => ({ value: g.id, label: g.title }))} testid="note-goal-select" /></Field>
            <Field label="Contact"><Sel allowNone value={f.contact_id} onChange={set("contact_id")} options={contacts.map((c) => ({ value: c.id, label: c.name }))} testid="note-contact-select" /></Field>
          </div>
          {f.kind === "decision" && <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
            <Field label="Decision"><Textarea rows={2} value={f.decision || ""} onChange={set("decision")} data-testid="note-decision-input" /></Field>
            <Field label="Rationale"><Textarea rows={2} value={f.rationale || ""} onChange={set("rationale")} data-testid="note-rationale-input" /></Field>
            <Field label="Alternatives considered"><Textarea rows={2} value={f.alternatives || ""} onChange={set("alternatives")} data-testid="note-alternatives-input" /></Field>
          </div>}
          <Textarea rows={8} value={f.body || ""} onChange={set("body")} data-testid="note-body-input"
            placeholder={f.kind === "meeting" ? "Meeting notes. Lines starting with '- [ ]', 'TODO:' or 'Action:' become proposed tasks in your Inbox." : "Write freely…"} />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {note ? <Button variant="ghost" className="text-risk" onClick={async () => { await mut("delete", `/notes/${note.id}`, null, "Deleted"); onOpenChange(false); }} data-testid="note-delete-btn">Delete</Button> : <span />}
          <Button onClick={save} disabled={!f.title?.trim()} data-testid="note-save-btn">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Notes() {
  const { perspective } = useAuth();
  const { byId } = useLookups();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const all = useGet("/notes").data || [];
  const open = all.find((n) => n.id === params.get("note"));
  const list = all.filter((n) => (perspective === "combined" || n.domain === perspective) && (kind === "all" || n.kind === kind)
    && (!q || `${n.title} ${n.body || ""} ${n.decision || ""}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div data-testid="notes-page">
      <PageHeader eyebrow="Knowledge" title="Notes & Decisions" subtitle="Ideas, meeting notes and the reasoning behind your decisions — searchable and linked."
        actions={<Button onClick={() => setCreating(true)} data-testid="new-note-btn"><Plus className="mr-1 h-4 w-4" />Note</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-1">
        {["all", ...KINDS].map((k) => <button key={k} onClick={() => setKind(k)} data-testid={`notes-filter-${k}`} className={cn("rounded-lg px-3 py-1.5 text-sm capitalize", kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{k}</button>)}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className="ml-auto h-9 w-52" data-testid="notes-search" />
      </div>
      {list.length === 0 ? <Empty icon={NotebookPen} title="No notes here" text="Capture ideas and decisions. Meeting notes turn action lines into tasks automatically." testid="notes-empty" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((n) => {
            const Icon = ICON[n.kind] || NotebookPen;
            return (
              <button key={n.id} onClick={() => setParams({ note: n.id })} className="card-hover rounded-xl border bg-card p-4 text-left" data-testid={`note-card-${n.id}`}>
                <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /><span className="flex-1 truncate font-semibold">{n.title}</span><Tag tone={n.domain}>{n.kind}</Tag></div>
                {n.decision && <p className="mt-2 line-clamp-2 text-sm"><b>Decision:</b> {n.decision}</p>}
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{n.body}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span>{fdate(n.created_at.slice(0, 10))}</span>{[n.project_id, n.goal_id, n.contact_id].filter(Boolean).map((id) => byId[id] && <span key={id}>· {byId[id]}</span>)}</div>
              </button>
            );
          })}
        </div>
      )}
      <NoteDialog open={creating || !!open} onOpenChange={(o) => { if (!o) { setCreating(false); setParams({}); } }} note={open} />
    </div>
  );
}
