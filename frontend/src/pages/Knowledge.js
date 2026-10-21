import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Upload, FileText, RotateCcw, Trash2, Sparkles, Download, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGet, useMut, http, errMsg } from "@/lib/api";
import { fdate } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { PageHeader, Card, Empty, Tag, Sel, Field, useLookups } from "@/components/app/kit";
import { AiMarkdown } from "@/components/app/AiMarkdown";

const TONE = { ready: "ok", processing: "info", failed: "risk" };

function DocSheet({ id, loc, onClose }) {
  const mut = useMut();
  const nav = useNavigate();
  const { goals, projects, contacts } = useLookups();
  const { data: d } = useGet(`/documents/${id}`, null, { enabled: !!id });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (d && loc) setTimeout(() => document.getElementById(`sec-${loc}`)?.scrollIntoView({ block: "center" }), 300); }, [d, loc]);
  const dl = async () => { const r = await http.get(`/documents/${id}/download`, { responseType: "blob" }); const u = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = u; a.download = d.title; a.click(); URL.revokeObjectURL(u); };
  const sum = async () => { setBusy(true); try { await mut("post", `/documents/${id}/summarize`, null, "Summary ready"); } catch { /* toast shown */ } setBusy(false); };
  const link = (k) => (v) => mut("patch", `/documents/${id}`, { [k]: v }, "Linked");
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" data-testid="doc-sheet">
        {!d ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
          <SheetHeader><SheetTitle className="text-left">{d.title}</SheetTitle></SheetHeader>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]"><Tag tone={TONE[d.status]}>{d.status}</Tag><Tag>v{d.version}</Tag><Tag>{d.ext}</Tag>{d.folder && <Tag>{d.folder}</Tag>}{d.tags.map((t) => <Tag key={t} tone="info">{t}</Tag>)}<span className="text-muted-foreground">{Math.round(d.size / 1024)} KB · {d.sections || 0} sections</span></div>
          {d.error && <p className="mt-2 text-xs text-risk">{d.error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={dl} data-testid="doc-download-btn"><Download className="mr-1 h-3.5 w-3.5" />Download</Button>
            {d.status === "ready" && <Button size="sm" variant="outline" className="text-ai" onClick={sum} disabled={busy} data-testid="doc-summarize-btn"><Sparkles className="mr-1 h-3.5 w-3.5" />{busy ? "Summarising…" : d.summary ? "Re-summarise" : "Summarise"}</Button>}
            {d.status === "ready" && <Button size="sm" variant="outline" className="text-ai" onClick={() => nav(`/chief?q=${encodeURIComponent(`Using the document "${d.title}", answer: what are the key decisions, deadlines and obligations? Cite pages.`)}`)} data-testid="doc-ask-btn">Ask AI</Button>}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Field label="Goal"><Sel allowNone value={d.goal_id} onChange={link("goal_id")} options={goals.map((g) => ({ value: g.id, label: g.title }))} testid="doc-goal-select" /></Field>
            <Field label="Project"><Sel allowNone value={d.project_id} onChange={link("project_id")} options={projects.map((p) => ({ value: p.id, label: p.title }))} testid="doc-project-select" /></Field>
            <Field label="Contact"><Sel allowNone value={d.contact_id} onChange={link("contact_id")} options={contacts.map((c) => ({ value: c.id, label: c.name }))} testid="doc-contact-select" /></Field>
          </div>
          {d.summary && <Card title="AI summary" className="mt-4" testid="doc-summary"><AiMarkdown content={d.summary} /><p className="mt-2 text-[11px] text-muted-foreground">AI-generated from the extracted text. Tags like [p.3] point to the source page below.</p></Card>}
          {d.versions.length > 1 && <div className="mt-4 text-xs text-muted-foreground">Versions: {d.versions.map((v) => `v${v.version}`).join(", ")}</div>}
          <div className="eyebrow mb-2 mt-5">Extracted text</div>
          <div className="space-y-3">{d.chunks.map((c) => (
            <div key={c.id} id={`sec-${c.label}`} className={cn("rounded-lg border p-3", loc === c.label && "border-brand ring-2 ring-brand/30")} data-testid={`doc-section-${c.label}`}>
              <div className="eyebrow mb-1">{c.label.startsWith("p.") ? `Page ${c.label.slice(2)}` : `Section ${c.label.slice(2)}`}</div>
              <p className="whitespace-pre-line text-xs leading-relaxed">{c.text}</p></div>))}</div>
          <Button variant="ghost" size="sm" className="mt-4 text-risk" onClick={async () => { if (window.confirm("Delete this document and its extracted text?")) { await mut("delete", `/documents/${id}`, null, "Document deleted"); onClose(); } }} data-testid="doc-delete-btn"><Trash2 className="mr-1 h-3.5 w-3.5" />Delete document</Button>
        </>}
      </SheetContent>
    </Sheet>
  );
}

export default function Knowledge() {
  const qc = useQueryClient();
  const mut = useMut();
  const [params, setParams] = useSearchParams();
  const ref = useRef();
  const [folder, setFolder] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [ff, setFf] = useState(null);
  const docs = useGet("/documents").data || [];
  const folders = [...new Set(docs.map((d) => d.folder).filter(Boolean))];
  const shown = docs.filter((d) => !ff || d.folder === ff);
  const upload = async () => {
    const files = [...(ref.current?.files || [])];
    if (!files.length) return;
    setBusy(true);
    for (const file of files) {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", folder); fd.append("tags", tags);
      try { const r = await http.post("/documents", fd); r.data.status === "ready" ? toast.success(`${file.name} is searchable`) : toast.error(`${file.name}: ${r.data.error}`); }
      catch (e) { toast.error(`${file.name}: ${errMsg(e)}`); }
    }
    ref.current.value = ""; setBusy(false); qc.invalidateQueries();
  };
  const search = async (e) => { e.preventDefault(); if (q.trim().length < 2) return setRes(null); try { setRes((await http.get("/documents/search", { params: { q } })).data); } catch (er) { toast.error(errMsg(er)); } };
  return (
    <div data-testid="knowledge-page">
      <PageHeader eyebrow="Knowledge" title="Knowledge Library" subtitle="Private documents with extracted text, summaries and AI answers that cite the exact page or section." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Upload" icon={Upload} testid="doc-upload-card">
          <Input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" ref={ref} data-testid="doc-file-input" />
          <div className="mt-2 grid grid-cols-2 gap-2"><Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Folder" data-testid="doc-folder-input" /><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated" data-testid="doc-tags-input" /></div>
          <Button className="mt-3 w-full" onClick={upload} disabled={busy} data-testid="doc-upload-btn">{busy ? "Uploading & extracting…" : "Upload"}</Button>
          <p className="mt-2 text-[11px] text-muted-foreground">PDF, DOCX, TXT, MD, CSV · max 10 MB. Duplicates are detected. Scanned PDFs without a text layer can't be read yet (no OCR).</p>
        </Card>
        <Card title="Search inside documents" icon={Search} className="lg:col-span-2" testid="doc-search-card">
          <form onSubmit={search} className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names and contents" data-testid="doc-search-input" /><Button type="submit" variant="outline" data-testid="doc-search-btn">Search</Button></form>
          {res && <div className="mt-3 max-h-64 space-y-2 overflow-y-auto" data-testid="doc-search-results">{res.length === 0 ? <p className="text-xs text-muted-foreground">No matches.</p> : res.map((r, i) => (
            <button key={i} onClick={() => setParams({ doc: r.doc_id, ...(r.label ? { loc: r.label } : {}) })} className="block w-full rounded-lg border p-2 text-left hover:bg-muted" data-testid={`doc-hit-${i}`}>
              <div className="text-xs font-semibold">{r.title} {r.label && <Tag className="ml-1">{r.label}</Tag>}</div><div className="line-clamp-2 text-xs text-muted-foreground">{r.snippet}</div></button>))}</div>}
        </Card>
      </div>
      <div className="mb-3 mt-6 flex flex-wrap gap-1">{[null, ...folders].map((f) => <button key={f || "all"} onClick={() => setFf(f)} className={cn("rounded-lg px-3 py-1.5 text-sm", ff === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} data-testid={`folder-${f || "all"}`}>{f || "All documents"}</button>)}</div>
      {shown.length === 0 ? <Empty icon={FileText} title="No documents yet" text="Upload strategy docs, contracts, proposals or research. Your Chief of Staff will cite them." testid="docs-empty" /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{shown.map((d) => (
          <div key={d.id} className="card-hover cursor-pointer rounded-xl border bg-card p-4" onClick={() => setParams({ doc: d.id })} data-testid={`doc-card-${d.id}`}>
            <div className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate font-medium">{d.title}</span><Tag tone={TONE[d.status]}>{d.status === "ready" ? "searchable" : d.status}</Tag></div>
            <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted-foreground">{d.folder && <Tag>{d.folder}</Tag>}{d.tags.map((t) => <Tag key={t} tone="info">{t}</Tag>)}<span>v{d.version} · {fdate(d.created_at.slice(0, 10))}{d.summary ? " · summarised" : ""}</span></div>
            {d.status === "failed" && <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-risk"><span className="truncate">{d.error}</span><Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={(e) => { e.stopPropagation(); mut("post", `/documents/${d.id}/retry`, null, "Retried"); }} data-testid={`doc-retry-${d.id}`}><RotateCcw className="mr-1 h-3 w-3" />Retry</Button></div>}
          </div>))}</div>
      )}
      <DocSheet id={params.get("doc")} loc={params.get("loc")} onClose={() => setParams({})} />
    </div>
  );
}
