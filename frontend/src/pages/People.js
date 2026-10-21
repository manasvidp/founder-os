import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Users, Mail, Phone, Linkedin, Sparkles, MessageSquarePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGet, useMut } from "@/lib/api";
import { useAuth } from "@/context/Auth";
import { todayStr, relDay, money, fdate } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { PageHeader, Empty, Tag, Sel, Field, DOMAINS } from "@/components/app/kit";
import { TaskRow } from "@/components/app/TaskRow";
import TaskDialog from "@/components/app/TaskDialog";

const STAGES = [["lead", "Lead"], ["contacted", "Contacted"], ["meeting", "Meeting"], ["proposal", "Proposal"], ["won", "Won"], ["lost", "Lost"], ["nurture", "Nurture"]];
const KINDS = ["client", "prospect", "investor", "mentor", "founder", "collaborator", "supplier", "personal", "other"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const IKINDS = ["meeting", "call", "email", "message", "event", "other"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const FIELDS = ["name", "organisation", "role", "email", "phone", "linkedin", "kind", "domain", "stage", "deal_value", "communication_pref", "notes", "next_follow_up"];

function ContactSheet({ id, onClose, isNew }) {
  const mut = useMut();
  const nav = useNavigate();
  const { data } = useGet(`/contacts/${id}/context`, null, { enabled: !!id && !isNew });
  const [f, setF] = useState({});
  const [i, setI] = useState({ kind: "meeting", date: todayStr() });
  const [task, setTask] = useState(null);
  const c = data?.contact;
  useEffect(() => { if (isNew) setF({ name: "", kind: "prospect", domain: "business", stage: "lead" }); else if (c) setF({ ...c }); }, [c, isNew]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    const body = {};
    FIELDS.forEach((k) => { body[k] = f[k] === "" || f[k] === undefined ? null : k === "deal_value" && f[k] != null ? Number(f[k]) : f[k]; });
    if (isNew) { await mut("post", "/contacts", body, "Contact added"); onClose(); } else await mut("patch", `/contacts/${id}`, body, "Contact saved");
  };
  const log = async (e) => {
    e.preventDefault();
    await mut("post", "/interactions", { contact_id: id, kind: i.kind, date: i.date, summary: i.summary, next_step: i.next_step || null, next_step_date: i.next_step_date || null },
      i.next_step ? "Logged · follow-up task created" : "Interaction logged");
    setI({ kind: "meeting", date: todayStr() });
  };
  const ask = (q) => nav(`/chief?q=${encodeURIComponent(q)}`);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[440px]" data-testid="contact-sheet">
        <SheetHeader><SheetTitle className="text-left">{isNew ? "New contact" : f.name}</SheetTitle></SheetHeader>
        {!isNew && c && <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-foreground"><Mail className="h-3 w-3" />{c.email}</a>}
          {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
          {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground"><Linkedin className="h-3 w-3" />LinkedIn</a>}
          {c.last_contacted && <span>· last contact {relDay(c.last_contacted)}</span>}
        </div>}
        {!isNew && c && <div className="mt-4 grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" className="border-ai/30 text-ai" data-testid="contact-prep-btn" onClick={() => ask(`Prepare me for my next conversation with [contact:${c.id}]. Summarise the relationship, history, open commitments and suggest talking points.`)}><Sparkles className="mr-1 h-3.5 w-3.5" />Prep brief</Button>
          <Button size="sm" variant="outline" className="border-ai/30 text-ai" data-testid="contact-draft-btn" onClick={() => ask(`Draft a thoughtful follow-up message to [contact:${c.id}] based on our last interaction. I will review and send it myself.`)}><Sparkles className="mr-1 h-3.5 w-3.5" />Draft follow-up</Button>
        </div>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2"><Input value={f.name || ""} onChange={set("name")} data-testid="contact-name-input" /></Field>
          <Field label="Organisation"><Input value={f.organisation || ""} onChange={set("organisation")} data-testid="contact-org-input" /></Field>
          <Field label="Role"><Input value={f.role || ""} onChange={set("role")} data-testid="contact-role-input" /></Field>
          <Field label="Email"><Input value={f.email || ""} onChange={set("email")} data-testid="contact-email-input" /></Field>
          <Field label="Phone"><Input value={f.phone || ""} onChange={set("phone")} data-testid="contact-phone-input" /></Field>
          <Field label="Relationship"><Sel value={f.kind} onChange={set("kind")} options={KINDS} testid="contact-kind-select" /></Field>
          <Field label="Area"><Sel value={f.domain} onChange={set("domain")} options={DOMAINS} testid="contact-domain-select" /></Field>
          <Field label="Stage"><Sel value={f.stage} onChange={set("stage")} options={STAGES.map(([value, label]) => ({ value, label }))} testid="contact-stage-select" /></Field>
          <Field label="Deal value"><Input type="number" value={f.deal_value ?? ""} onChange={set("deal_value")} data-testid="contact-deal-input" /></Field>
          <Field label="Next follow-up"><Input type="date" value={f.next_follow_up || ""} onChange={set("next_follow_up")} data-testid="contact-followup-input" /></Field>
          <Field label="Prefers"><Input value={f.communication_pref || ""} onChange={set("communication_pref")} placeholder="email, WhatsApp…" data-testid="contact-pref-input" /></Field>
          <Field label="LinkedIn URL" className="col-span-2"><Input value={f.linkedin || ""} onChange={set("linkedin")} data-testid="contact-linkedin-input" /></Field>
          <Field label="Context & notes" className="col-span-2"><Textarea rows={3} value={f.notes || ""} onChange={set("notes")} data-testid="contact-notes-input" /></Field>
        </div>
        <div className="mt-3 flex justify-between">
          {!isNew ? <Button variant="ghost" size="sm" className="text-risk" data-testid="contact-delete-btn" onClick={async () => { if (window.confirm("Delete contact and its interaction history?")) { await mut("delete", `/contacts/${id}`, null, "Contact deleted"); onClose(); } }}><Trash2 className="h-4 w-4" /></Button> : <span />}
          <Button onClick={save} disabled={!f.name?.trim()} data-testid="contact-save-btn">{isNew ? "Add contact" : "Save"}</Button>
        </div>
        {!isNew && data && <>
          <form onSubmit={log} className="mt-6 space-y-2 rounded-lg border bg-muted/30 p-3" data-testid="interaction-form">
            <div className="flex items-center gap-1.5 text-sm font-semibold"><MessageSquarePlus className="h-4 w-4" />Log interaction</div>
            <div className="grid grid-cols-2 gap-2"><Sel value={i.kind} onChange={(v) => setI({ ...i, kind: v })} options={IKINDS} testid="interaction-kind-select" /><Input type="date" value={i.date} onChange={(e) => setI({ ...i, date: e.target.value })} data-testid="interaction-date-input" /></div>
            <Textarea required rows={2} placeholder="What happened?" value={i.summary || ""} onChange={(e) => setI({ ...i, summary: e.target.value })} data-testid="interaction-summary-input" />
            <div className="grid grid-cols-[1fr_140px] gap-2"><Input placeholder="Next step (creates a follow-up task)" value={i.next_step || ""} onChange={(e) => setI({ ...i, next_step: e.target.value })} data-testid="interaction-next-input" /><Input type="date" value={i.next_step_date || ""} onChange={(e) => setI({ ...i, next_step_date: e.target.value })} data-testid="interaction-next-date" /></div>
            <Button type="submit" size="sm" className="w-full" data-testid="interaction-submit-btn">Log</Button>
          </form>
          <div className="mt-5"><div className="eyebrow mb-1">Open tasks</div>{data.tasks.filter((t) => t.status !== "done").map((t) => <TaskRow key={t.id} task={t} onOpen={setTask} />)}{data.tasks.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}</div>
          <div className="mt-5"><div className="eyebrow mb-2">History</div>
            <ol className="space-y-3 border-l pl-4" data-testid="interaction-timeline">{data.interactions.map((x) => (
              <li key={x.id} className="relative text-sm"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand" />
                <div className="text-[11px] text-muted-foreground">{fdate(x.date)} · {x.kind}</div><div>{x.summary}</div>{x.next_step && <div className="text-xs text-muted-foreground">Next: {x.next_step}</div>}</li>))}
              {data.interactions.length === 0 && <li className="text-xs text-muted-foreground">No interactions yet.</li>}</ol>
          </div>
        </>}
        <TaskDialog open={!!task} onOpenChange={(o) => !o && setTask(null)} task={task} />
      </SheetContent>
    </Sheet>
  );
}

function Pipeline({ contacts, onOpen }) {
  const mut = useMut();
  const { currency } = useAuth();
  const [over, setOver] = useState(null);
  return (
    <div className="flex gap-3 overflow-x-auto pb-3" data-testid="pipeline-board">
      {STAGES.map(([s, label]) => {
        const items = contacts.filter((c) => c.stage === s);
        const val = items.reduce((a, c) => a + (c.deal_value || 0), 0);
        return (
          <div key={s} className="kanban-col w-64 shrink-0 rounded-xl bg-muted/50 p-2" data-over={over === s} data-testid={`pipeline-col-${s}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/contact"); if (id) mut("patch", `/contacts/${id}`, { stage: s }, `Moved to ${label}`); }}>
            <div className="mb-2 px-1.5"><div className="flex justify-between text-xs font-semibold">{label}<span className="num text-muted-foreground">{items.length}</span></div><div className="num text-[11px] text-muted-foreground">{money(val, currency, true)}</div></div>
            <div className="min-h-[120px] space-y-2">{items.map((c) => (
              <div key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/contact", c.id)} onClick={() => onOpen(c.id)} data-testid={`pipeline-card-${c.id}`}
                className="card-hover cursor-grab rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold">{c.name[0]}</span><div className="min-w-0"><div className="truncate text-sm font-medium">{c.name}</div><div className="truncate text-[11px] text-muted-foreground">{c.organisation || c.kind}</div></div></div>
                <div className="mt-2 flex items-center justify-between text-[11px]">{c.deal_value ? <span className="num font-medium">{money(c.deal_value, currency, true)}</span> : <span />}{c.next_follow_up && <span className={cn(c.next_follow_up < todayStr() ? "text-risk" : "text-muted-foreground")}>{relDay(c.next_follow_up)}</span>}</div>
              </div>))}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function People() {
  const { perspective } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "pipeline";
  const open = params.get("contact");
  const [kind, setKind] = useState(null);
  const [q, setQ] = useState("");
  const all = useGet("/contacts").data || [];
  const list = all.filter((c) => (perspective === "combined" || c.domain === perspective) && (!kind || c.kind === kind) && (!q || `${c.name} ${c.organisation || ""}`.toLowerCase().includes(q.toLowerCase())));
  const go = (o) => setParams({ view, ...o });
  const follow = list.filter((c) => c.next_follow_up).sort((a, b) => a.next_follow_up.localeCompare(b.next_follow_up));
  return (
    <div data-testid="people-page">
      <PageHeader eyebrow="Relationships" title="People" subtitle="Clients, prospects, investors, mentors and the people who matter to you."
        actions={<Button onClick={() => go({ contact: "new" })} data-testid="new-contact-btn"><Plus className="mr-1 h-4 w-4" />Contact</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[["pipeline", "Pipeline"], ["list", "All contacts"], ["followups", "Follow-ups"]].map(([k, l]) => (
          <button key={k} onClick={() => setParams({ view: k })} data-testid={`people-view-${k}`} className={cn("rounded-lg px-3 py-1.5 text-sm", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{l}</button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="ml-auto h-9 w-48" data-testid="people-search" />
        <Sel allowNone="All types" value={kind} onChange={setKind} options={KINDS} className="w-36" testid="people-kind-filter" />
      </div>
      {all.length === 0 ? <Empty icon={Users} title="No contacts yet" text="Add the people you work with. Logging interactions with next steps creates follow-up tasks automatically." testid="people-empty" />
        : view === "pipeline" ? <Pipeline contacts={list} onOpen={(id) => go({ contact: id })} />
        : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Organisation</TableHead><TableHead>Type</TableHead><TableHead className="hidden md:table-cell">Stage</TableHead><TableHead>Follow-up</TableHead></TableRow></TableHeader>
              <TableBody>{(view === "followups" ? follow : list).map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => go({ contact: c.id })} data-testid={`contact-row-${c.id}`}>
                  <TableCell className="font-medium">{c.name}</TableCell><TableCell className="hidden sm:table-cell">{c.organisation}</TableCell>
                  <TableCell><Tag tone={c.domain}>{c.kind}</Tag></TableCell><TableCell className="hidden md:table-cell capitalize">{c.stage}</TableCell>
                  <TableCell className={cn("text-xs", c.next_follow_up && c.next_follow_up < todayStr() && "text-risk")}>{c.next_follow_up ? relDay(c.next_follow_up) : "—"}</TableCell>
                </TableRow>))}</TableBody>
            </Table>
          </div>
        )}
      <ContactSheet id={open} isNew={open === "new"} onClose={() => setParams({ view })} />
    </div>
  );
}
