import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useMut } from "@/lib/api";
import { todayStr } from "@/lib/fmt";
import { useAuth } from "@/context/Auth";
import { Field, Sel, DOMAINS } from "./kit";

const KINDS = ["task", "note", "contact", "expense", "event"];

export default function QuickCapture({ open, onOpenChange }) {
  const { perspective } = useAuth();
  const mut = useMut();
  const [kind, setKind] = useState("task");
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF({ domain: perspective === "personal" ? "personal" : "business", date: todayStr(), start: "10:00", end: "11:00" }); }, [open, perspective]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e?.preventDefault();
    const d = f.domain;
    const map = {
      task: ["/tasks", { title: f.title, status: "inbox", domain: d, due_date: f.due || null }],
      note: ["/notes", { title: f.title, body: f.body || null, kind: f.noteKind || "note", domain: d }],
      contact: ["/contacts", { name: f.title, organisation: f.org || null, email: f.email || null, domain: d, kind: d === "personal" ? "personal" : "prospect" }],
      expense: ["/transactions", { description: f.title, amount: Number(f.amount || 0), direction: "expense", category: f.category || "General", domain: d, date: f.date }],
      event: ["/events", { title: f.title, start: `${f.date}T${f.start}`, end: `${f.date}T${f.end}`, domain: d, kind: d === "personal" ? "personal" : "meeting" }],
    };
    const [url, body] = map[kind];
    await mut("post", url, body, `${kind[0].toUpperCase() + kind.slice(1)} captured`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="quick-capture-dialog">
        <DialogHeader><DialogTitle>Quick capture</DialogTitle></DialogHeader>
        <Tabs value={kind} onValueChange={setKind}>
          <TabsList className="grid w-full grid-cols-5">
            {KINDS.map((k) => <TabsTrigger key={k} value={k} className="capitalize" data-testid={`capture-tab-${k}`}>{k}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <form onSubmit={submit} className="space-y-3">
          <Input autoFocus required value={f.title || ""} onChange={set("title")} data-testid="capture-title-input"
            placeholder={{ task: "Task — lands in your Inbox", note: "Note or idea title", contact: "Full name", expense: "What was it for?", event: "Event title" }[kind]} />
          {kind === "task" && <Field label="Due (optional)"><Input type="date" value={f.due || ""} onChange={set("due")} data-testid="capture-due-input" /></Field>}
          {kind === "note" && <>
            <Sel value={f.noteKind || "note"} onChange={set("noteKind")} testid="capture-note-kind" options={["note", "idea", "decision", "meeting", "journal", "learning"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
            <Textarea rows={4} value={f.body || ""} onChange={set("body")} placeholder="Details. In meeting notes, lines starting with '- [ ]' become proposed tasks." data-testid="capture-body-input" />
          </>}
          {kind === "contact" && <div className="grid grid-cols-2 gap-3"><Input placeholder="Organisation" value={f.org || ""} onChange={set("org")} data-testid="capture-org-input" /><Input placeholder="Email" value={f.email || ""} onChange={set("email")} data-testid="capture-email-input" /></div>}
          {kind === "expense" && <div className="grid grid-cols-3 gap-3">
            <Input type="number" step="0.01" min="0" required placeholder="Amount" value={f.amount || ""} onChange={set("amount")} data-testid="capture-amount-input" />
            <Input placeholder="Category" value={f.category || ""} onChange={set("category")} data-testid="capture-category-input" />
            <Input type="date" value={f.date} onChange={set("date")} data-testid="capture-date-input" />
          </div>}
          {kind === "event" && <div className="grid grid-cols-3 gap-3">
            <Input type="date" value={f.date} onChange={set("date")} data-testid="capture-event-date" />
            <Input type="time" value={f.start} onChange={set("start")} data-testid="capture-event-start" />
            <Input type="time" value={f.end} onChange={set("end")} data-testid="capture-event-end" />
          </div>}
          <div className="flex items-center justify-between gap-3">
            <Sel value={f.domain} onChange={set("domain")} options={DOMAINS} className="w-36" testid="capture-domain-select" />
            <Button type="submit" data-testid="capture-submit-btn">Capture</Button>
          </div>
        </form>
        <p className="text-[11px] text-muted-foreground">Tip: press <kbd className="rounded border px-1">C</kbd> anywhere to capture, <kbd className="rounded border px-1">⌘K</kbd> to search.</p>
      </DialogContent>
    </Dialog>
  );
}
