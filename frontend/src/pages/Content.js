import { useEffect, useState } from "react";
import { Plus, Sparkles, Copy, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGet, useMut, http, errMsg } from "@/lib/api";
import { useAuth } from "@/context/Auth";
import { fdate } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PageHeader, Card, Empty, Tag, Sel, Field, useLookups } from "@/components/app/kit";

const STAGES = [["idea", "Ideas"], ["drafting", "Drafting"], ["review", "Review"], ["approved", "Approved"], ["scheduled", "Scheduled"], ["published", "Published"]];
const FORMATS = [["linkedin_post", "LinkedIn post"], ["article", "Article"], ["case_study", "Case study"], ["lead_magnet", "Lead magnet"], ["newsletter", "Newsletter"], ["other", "Other"]].map(([value, label]) => ({ value, label }));
const FL = Object.fromEntries(FORMATS.map((f) => [f.value, f.label]));
const KEYS = ["title", "format", "status", "pillar", "audience", "body", "cta", "campaign", "sources", "scheduled_date", "published_url", "goal_id", "contact_id", "ai_generated", "impressions", "engagements", "leads"];

function Editor({ open, onOpenChange, item }) {
  const mut = useMut();
  const { goals, contacts } = useLookups();
  const [f, setF] = useState({});
  const [draft, setDraft] = useState(null);
  const [instr, setInstr] = useState("");
  const [busy, setBusy] = useState(false);
  const [rep, setRep] = useState("article");
  useEffect(() => { if (open) { setF(item ? { ...item } : { title: "", format: "linkedin_post", status: "idea" }); setDraft(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const body = () => { const b = {}; KEYS.forEach((k) => { let v = f[k]; if (v === "") v = null; if (["impressions", "engagements", "leads"].includes(k) && v != null) v = Number(v); if (v !== undefined) b[k] = v; }); return b; };
  const save = async () => {
    if (f.status === "published" && !f.published_url) return toast.error("Add the live URL to mark as published — publishing is manual until LinkedIn is connected.");
    if (item) await mut("patch", `/content/${item.id}`, body(), "Saved"); else await mut("post", "/content", body(), "Idea added");
    onOpenChange(false);
  };
  const runAi = async () => {
    setBusy(true);
    try { setDraft((await http.post(`/content/${item.id}/ai-draft`, { instruction: instr || null, sources: f.sources || null, body: f.body || null, cta: f.cta || null })).data.draft); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const repurpose = async () => {
    await mut("post", "/content", { title: `${f.title} (${FL[rep]})`, format: rep, status: "idea", pillar: f.pillar, audience: f.audience, cta: f.cta, campaign: f.campaign, sources: f.sources, goal_id: f.goal_id, source_content_id: item.id }, `Repurposed as ${FL[rep]}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="content-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{item ? "Edit content" : "New idea"}{f.ai_generated && <Tag tone="ai">contains AI draft</Tag>}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Title / idea" className="col-span-2 sm:col-span-4"><Input value={f.title || ""} onChange={set("title")} data-testid="content-title-input" /></Field>
          <Field label="Format"><Sel value={f.format} onChange={set("format")} options={FORMATS} testid="content-format-select" /></Field>
          <Field label="Status"><Sel value={f.status} onChange={set("status")} options={STAGES.map(([value, label]) => ({ value, label }))} testid="content-status-select" /></Field>
          <Field label="Publish date"><Input type="date" value={f.scheduled_date || ""} onChange={set("scheduled_date")} data-testid="content-date-input" /></Field>
          <Field label="Pillar"><Input value={f.pillar || ""} onChange={set("pillar")} data-testid="content-pillar-input" /></Field>
          <Field label="Audience"><Input value={f.audience || ""} onChange={set("audience")} data-testid="content-audience-input" /></Field>
          <Field label="Call to action"><Input value={f.cta || ""} onChange={set("cta")} data-testid="content-cta-input" /></Field>
          <Field label="Campaign"><Input value={f.campaign || ""} onChange={set("campaign")} data-testid="content-campaign-input" /></Field>
          <Field label="Supports goal"><Sel allowNone value={f.goal_id} onChange={set("goal_id")} options={goals.map((g) => ({ value: g.id, label: g.title }))} testid="content-goal-select" /></Field>
          <Field label="Sources & verified facts (AI may only use these)" className="col-span-2 sm:col-span-4"><Textarea rows={2} value={f.sources || ""} onChange={set("sources")} data-testid="content-sources-input" /></Field>
          <Field label="Draft" className="col-span-2 sm:col-span-4"><Textarea rows={8} value={f.body || ""} onChange={set("body")} data-testid="content-body-input" /></Field>
        </div>
        {item && <div className="rounded-lg border border-ai/30 bg-ai/5 p-3">
          <div className="flex gap-2"><Input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Instruction, e.g. 'shorter, stronger hook'" data-testid="content-ai-instruction" />
            <Button variant="outline" className="shrink-0 text-ai" onClick={runAi} disabled={busy} data-testid="content-ai-btn"><Sparkles className="mr-1 h-4 w-4" />{busy ? "Drafting…" : "AI draft"}</Button></div>
          {draft && <div className="mt-3" data-testid="content-ai-preview"><div className="eyebrow mb-1 !text-ai">AI preview — not saved</div><p className="max-h-56 overflow-y-auto whitespace-pre-line rounded-md bg-card p-3 text-sm">{draft}</p>
            <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => { setF((s) => ({ ...s, body: draft, ai_generated: true, status: s.status === "idea" ? "drafting" : s.status })); setDraft(null); }} data-testid="content-ai-apply">Use this draft</Button><Button size="sm" variant="ghost" onClick={() => setDraft(null)} data-testid="content-ai-discard">Discard</Button></div></div>}
        </div>}
        {item && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Live URL (manual publish)" className="col-span-2"><Input value={f.published_url || ""} onChange={set("published_url")} data-testid="content-url-input" /></Field>
          <Field label="Impressions (you enter)"><Input type="number" value={f.impressions ?? ""} onChange={set("impressions")} data-testid="content-impressions-input" /></Field>
          <Field label="Leads (you enter)"><Input type="number" value={f.leads ?? ""} onChange={set("leads")} data-testid="content-leads-input" /></Field>
        </div>}
        <DialogFooter className="gap-2 sm:justify-between">
          {item ? <div className="flex gap-2"><Sel value={rep} onChange={setRep} options={FORMATS} className="w-36" testid="content-repurpose-select" /><Button variant="outline" onClick={repurpose} data-testid="content-repurpose-btn"><Copy className="mr-1 h-4 w-4" />Repurpose</Button>
            <Button variant="ghost" className="text-risk" onClick={async () => { await mut("delete", `/content/${item.id}`, null, "Deleted"); onOpenChange(false); }} data-testid="content-delete-btn">Delete</Button></div> : <span />}
          <Button onClick={save} disabled={!f.title?.trim()} data-testid="content-save-btn">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Brand() {
  const { user, setUser } = useAuth();
  const mut = useMut();
  const [f, setF] = useState({});
  useEffect(() => { setF({ ...(user?.profile || {}) }); }, [user]);
  const F = [["positioning", "Positioning & professional profile"], ["audience", "Target audience"], ["content_pillars", "Content pillars"], ["brand_voice", "Brand voice & writing preferences"]];
  return (
    <Card title="Brand guidelines" testid="brand-card">
      <div className="grid gap-3 md:grid-cols-2">{F.map(([k, l]) => <Field key={k} label={l}><Textarea rows={3} value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`brand-${k}`} /></Field>)}</div>
      <Button className="mt-3" data-testid="brand-save-btn" onClick={async () => { const b = {}; F.forEach(([k]) => { b[k] = f[k] || null; }); setUser(await mut("patch", "/me/profile", b, "Brand guidelines saved")); }}>Save</Button>
    </Card>
  );
}

export default function Content() {
  const mut = useMut();
  const items = useGet("/content").data || [];
  const [open, setOpen] = useState(null);
  const [over, setOver] = useState(null);
  const cal = items.filter((i) => i.scheduled_date).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  return (
    <div data-testid="content-page">
      <PageHeader eyebrow="Brand" title="Content Studio" subtitle="From idea to draft, review, approval and publication. Publishing is manual — no integration is connected."
        actions={<Button onClick={() => setOpen({})} data-testid="new-content-btn"><Plus className="mr-1 h-4 w-4" />Idea</Button>} />
      <Tabs defaultValue="board">
        <TabsList className="mb-4"><TabsTrigger value="board" data-testid="content-tab-board">Pipeline</TabsTrigger><TabsTrigger value="calendar" data-testid="content-tab-calendar">Calendar</TabsTrigger><TabsTrigger value="brand" data-testid="content-tab-brand">Brand</TabsTrigger></TabsList>
        <TabsContent value="board">
          {items.length === 0 ? <Empty icon={PenLine} title="No content yet" text="Capture ideas, add verified sources, then draft with AI in your voice." testid="content-empty" /> : (
            <div className="flex gap-3 overflow-x-auto pb-3">{STAGES.map(([s, l]) => {
              const col = items.filter((i) => i.status === s);
              return (
                <div key={s} className="kanban-col w-60 shrink-0 rounded-xl bg-muted/50 p-2" data-over={over === s} data-testid={`content-col-${s}`}
                  onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
                  onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/content"); if (!id) return; if (s === "published" && !items.find((i) => i.id === id)?.published_url) return toast.error("Open the item and add its live URL to mark it published."); mut("patch", `/content/${id}`, { status: s }); }}>
                  <div className="mb-2 flex justify-between px-1.5 text-xs font-semibold">{l}<span className="num text-muted-foreground">{col.length}</span></div>
                  <div className="min-h-[100px] space-y-2">{col.map((i) => (
                    <div key={i.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/content", i.id)} onClick={() => setOpen(i)} className="card-hover cursor-grab rounded-lg border bg-card p-2.5 text-sm" data-testid={`content-card-${i.id}`}>
                      <div className="leading-snug">{i.title}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1"><Tag>{FL[i.format]}</Tag>{i.ai_generated && <Tag tone="ai">AI draft</Tag>}{i.scheduled_date && <Tag tone="info">{fdate(i.scheduled_date)}</Tag>}</div>
                    </div>))}</div>
                </div>
              );
            })}</div>
          )}
        </TabsContent>
        <TabsContent value="calendar">
          <Card title="Publishing calendar" testid="content-calendar">{cal.length === 0 ? <p className="text-xs text-muted-foreground">Set publish dates to plan your calendar.</p> : cal.map((i) => (
            <button key={i.id} onClick={() => setOpen(i)} className="flex w-full items-center gap-3 border-b py-2 text-left text-sm last:border-0"><span className="num w-20 text-xs text-muted-foreground">{fdate(i.scheduled_date)}</span><span className="flex-1 truncate">{i.title}</span><Tag>{FL[i.format]}</Tag><Tag tone={i.status === "published" ? "ok" : "muted"}>{i.status}</Tag></button>))}</Card>
        </TabsContent>
        <TabsContent value="brand"><Brand /></TabsContent>
      </Tabs>
      <Editor open={!!open} onOpenChange={(o) => !o && setOpen(null)} item={open?.id ? open : null} />
    </div>
  );
}
