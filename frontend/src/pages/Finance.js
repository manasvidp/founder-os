import { useEffect, useRef, useState } from "react";
import { Plus, Upload, Wallet, Trash2, Pencil } from "lucide-react";
import { BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGet, useMut, http, errMsg } from "@/lib/api";
import { useAuth } from "@/context/Auth";
import { todayStr, money, fdate } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, Card, Stat, Empty, Tag, Sel, Field, Bar, DOMAINS } from "@/components/app/kit";

const STATUS = [["actual", "Actual"], ["pending", "Pending (invoice / bill)"], ["projected", "Projected"]].map(([value, label]) => ({ value, label }));

function TxDialog({ open, onOpenChange, tx, domain, accounts }) {
  const mut = useMut();
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF(tx ? { ...tx } : { date: todayStr(), direction: "expense", status: "actual", category: "", domain: domain === "combined" ? "business" : domain }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    const body = { date: f.date, description: f.description, amount: Number(f.amount), direction: f.direction, category: f.category || "General", domain: f.domain, status: f.status, account_id: f.account_id || null };
    if (tx) await mut("patch", `/transactions/${tx.id}`, body, "Transaction saved"); else await mut("post", "/transactions", body, "Transaction added");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="tx-dialog">
        <DialogHeader><DialogTitle>{tx ? "Edit transaction" : "Add transaction"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Description" className="col-span-2"><Input value={f.description || ""} onChange={set("description")} data-testid="tx-desc-input" /></Field>
          <Field label="Amount"><Input type="number" min="0" step="0.01" value={f.amount ?? ""} onChange={set("amount")} data-testid="tx-amount-input" /></Field>
          <Field label="Type"><Sel value={f.direction} onChange={set("direction")} options={[{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }]} testid="tx-direction-select" /></Field>
          <Field label="Date"><Input type="date" value={f.date || ""} onChange={set("date")} data-testid="tx-date-input" /></Field>
          <Field label="Category"><Input value={f.category || ""} onChange={set("category")} data-testid="tx-category-input" /></Field>
          <Field label="Area"><Sel value={f.domain} onChange={set("domain")} options={DOMAINS} testid="tx-domain-select" /></Field>
          <Field label="Status"><Sel value={f.status} onChange={set("status")} options={STATUS} testid="tx-status-select" /></Field>
          <Field label="Account" className="col-span-2"><Sel allowNone value={f.account_id} onChange={set("account_id")} options={accounts.map((a) => ({ value: a.id, label: a.name }))} testid="tx-account-select" /></Field>
        </div>
        <p className="text-[11px] text-muted-foreground">Account balances are entered by you and are not changed by transactions.</p>
        <DialogFooter><Button onClick={save} disabled={!f.description?.trim() || !(Number(f.amount) >= 0) || f.amount === ""} data-testid="tx-save-btn">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SimpleDialog({ open, onOpenChange, title, fields, onSave, testid }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF(Object.fromEntries(fields.map((x) => [x.k, x.v ?? ""]))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testid}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid gap-3">{fields.map((x) => <Field key={x.k} label={x.label}>{x.options ? <Sel value={f[x.k]} onChange={(v) => setF({ ...f, [x.k]: v })} options={x.options} testid={`${testid}-${x.k}`} />
          : <Input type={x.type || "text"} value={f[x.k] ?? ""} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} data-testid={`${testid}-${x.k}`} />}</Field>)}</div>
        <DialogFooter><Button onClick={async () => { await onSave(f); onOpenChange(false); }} data-testid={`${testid}-save`}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange, domain }) {
  const qc = useQueryClient();
  const ref = useRef();
  const [d, setD] = useState(domain === "combined" ? "business" : domain);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    const file = ref.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append("file", file); fd.append("domain", d);
    try { const r = await http.post("/transactions/import", fd); setRes(r.data); qc.invalidateQueries(); toast.success(`${r.data.created} transactions imported`); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setRes(null); }}>
      <DialogContent data-testid="import-dialog">
        <DialogHeader><DialogTitle>Import CSV</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Columns: <code>date</code> (YYYY-MM-DD), <code>description</code>, <code>amount</code> (negative = expense), optional <code>category</code>, <code>type</code> (income/expense). Duplicate rows are skipped.</p>
        <Input type="file" accept=".csv,text/csv" ref={ref} data-testid="import-file-input" />
        <Sel value={d} onChange={setD} options={DOMAINS} testid="import-domain-select" />
        {res && <div className="rounded-lg bg-muted p-3 text-xs" data-testid="import-result">{res.created} created · {res.skipped_duplicates} duplicates skipped · {res.errors.length} errors{res.errors.slice(0, 5).map((e) => <div key={e} className="text-risk">{e}</div>)}</div>}
        <DialogFooter><Button onClick={upload} disabled={busy} data-testid="import-submit-btn">{busy ? "Importing…" : "Import"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Finance() {
  const { perspective, currency } = useAuth();
  const mut = useMut();
  const [domain, setDomain] = useState(perspective);
  const { data: s } = useGet("/finance/summary", { date: todayStr(), domain });
  const txs = (useGet("/transactions").data || []).filter((t) => domain === "combined" || t.domain === domain);
  const accounts = (useGet("/accounts").data || []);
  const [tx, setTx] = useState(null);
  const [newTx, setNewTx] = useState(false);
  const [acct, setAcct] = useState(null);
  const [budget, setBudget] = useState(false);
  const [imp, setImp] = useState(false);
  const m = (n) => money(n, currency);
  const scen = s?.scenarios ? s.scenarios.expected.map((_, i) => ({ m: `+${i + 1}m`, Conservative: s.scenarios.conservative[i], Expected: s.scenarios.expected[i], Ambitious: s.scenarios.ambitious[i] })) : [];
  const dAccounts = accounts.filter((a) => domain === "combined" || a.domain === domain);
  return (
    <div data-testid="finance-page">
      <PageHeader eyebrow="Money" title="Finance" subtitle="Business and personal money kept separate, with an optional combined view."
        actions={<>
          <Button variant="outline" onClick={() => setImp(true)} data-testid="import-csv-btn"><Upload className="mr-1 h-4 w-4" />Import CSV</Button>
          <Button onClick={() => setNewTx(true)} data-testid="new-tx-btn"><Plus className="mr-1 h-4 w-4" />Transaction</Button>
        </>} />
      <div className="mb-5 flex rounded-lg border p-0.5 sm:w-fit" data-testid="finance-domain-switch">
        {["business", "personal", "combined"].map((d) => <button key={d} onClick={() => setDomain(d)} data-testid={`finance-domain-${d}`} className={cn("flex-1 rounded-md px-4 py-1.5 text-sm capitalize", domain === d ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{d}</button>)}
      </div>
      {!s ? <div className="text-sm text-muted-foreground">Loading…</div> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Cash (accounts)" value={m(s.cash)} sub={`${s.accounts.length} account(s)`} testid="fin-stat-cash" />
          <Stat label={`Income · ${s.month}`} value={m(s.income)} sub="actual" testid="fin-stat-income" />
          <Stat label={`Spend · ${s.month}`} value={m(s.expense)} sub="actual" testid="fin-stat-expense" />
          <Stat label="Net this month" value={m(s.net)} tone={s.net < 0 ? "risk" : "ok"} testid="fin-stat-net" />
          <Stat label="Avg net burn (3 mo)" value={s.burn == null ? "—" : m(s.burn)} sub={s.burn != null && s.burn <= 0 ? "cash-flow positive" : "trailing actuals"} testid="fin-stat-burn" />
          <Stat label="Runway" value={s.runway_months != null ? `${s.runway_months} mo` : "—"} sub={s.months_of_data ? (s.runway_months == null ? "not burning cash" : "cash ÷ avg burn") : "needs a full month of data"} testid="fin-stat-runway" />
          <Stat label="Receivables" value={m(s.receivables)} sub="pending income" testid="fin-stat-receivables" />
          <Stat label="Due in 30 days" value={m(s.upcoming.reduce((a, t) => a + t.amount, 0))} sub={`${s.upcoming.length} pending/projected`} testid="fin-stat-upcoming" />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Income vs spend · last 6 months" testid="fin-chart">
            <div className="h-56"><ResponsiveContainer><BarChart data={s.series}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} /><YAxis tick={{ fontSize: 11 }} width={50} /><Tooltip formatter={(v) => m(v)} />
              <RBar dataKey="income" fill="hsl(var(--ok))" radius={[4, 4, 0, 0]} /><RBar dataKey="expense" fill="hsl(var(--brand))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </Card>
          <Card title="Cash scenarios · next 6 months" testid="fin-scenarios" action={<Tag tone="warning">Projection</Tag>}>
            {scen.length === 0 ? <Empty title="Not enough history" text="Scenarios appear once you have at least one full month of actual transactions." /> : <>
              <div className="h-48"><ResponsiveContainer><LineChart data={scen}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="m" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={55} /><Tooltip formatter={(v) => m(v)} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="Conservative" stroke="hsl(var(--risk))" dot={false} /><Line dataKey="Expected" stroke="hsl(var(--brand))" dot={false} /><Line dataKey="Ambitious" stroke="hsl(var(--ok))" dot={false} /></LineChart></ResponsiveContainer></div>
              <p className="mt-2 text-[11px] text-muted-foreground">{s.basis} Conservative: −20% income, +10% spend. Ambitious: +20% income.</p>
            </>}
          </Card>
          <Card title={`Budget vs actual · ${s.month}`} testid="fin-budgets" action={domain !== "combined" && <Button size="sm" variant="ghost" onClick={() => setBudget(true)} data-testid="add-budget-btn"><Plus className="mr-1 h-3.5 w-3.5" />Budget</Button>}>
            {s.budgets.length === 0 ? <p className="text-xs text-muted-foreground">Set monthly budgets per category to track spending against plan.</p> : (
              <div className="space-y-3">{s.budgets.map((b) => (
                <div key={b.id} data-testid={`budget-${b.id}`}><div className="mb-1 flex justify-between text-sm"><span>{b.category}</span><span className="num text-xs">{m(b.spent)} / {m(b.amount)}</span></div>
                  <Bar value={b.pct} color={b.pct > 100 ? "bg-risk" : b.pct > 85 ? "bg-warn" : "bg-ok"} /></div>))}</div>
            )}
            {Object.keys(s.by_category).length > 0 && <div className="mt-4 border-t pt-3"><div className="eyebrow mb-2">Spend by category</div>{Object.entries(s.by_category).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => <div key={k} className="flex justify-between py-0.5 text-xs"><span>{k}</span><span className="num">{m(v)}</span></div>)}</div>}
          </Card>
          <Card title="Accounts" icon={Wallet} testid="fin-accounts" action={<Button size="sm" variant="ghost" onClick={() => setAcct({})} data-testid="add-account-btn"><Plus className="mr-1 h-3.5 w-3.5" />Account</Button>}>
            {dAccounts.length === 0 ? <p className="text-xs text-muted-foreground">Add your bank or cash accounts with their current balance. Bank feeds are not connected yet.</p> : dAccounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0" data-testid={`account-${a.id}`}>
                <span>{a.name} <Tag tone={a.domain} className="ml-1">{a.kind}</Tag></span>
                <span className="flex items-center gap-2"><span className="num font-medium">{m(a.balance)}</span><button onClick={() => setAcct(a)} aria-label="Edit account" data-testid={`account-edit-${a.id}`}><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button></span>
              </div>))}
          </Card>
        </div>
        <Card title="Transactions" className="mt-5" testid="fin-transactions">
          {txs.length === 0 ? <Empty title="No transactions" text="Add transactions manually or import a CSV. Nothing is fabricated." /> : (
            <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="hidden md:table-cell">Category</TableHead><TableHead className="hidden sm:table-cell">Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{txs.slice(0, 200).map((t) => (
                <TableRow key={t.id} data-testid={`tx-row-${t.id}`}>
                  <TableCell className="num text-xs">{fdate(t.date)}</TableCell><TableCell className="max-w-[220px] truncate">{t.description}{domain === "combined" && <Tag tone={t.domain} className="ml-2">{t.domain}</Tag>}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs">{t.category}</TableCell><TableCell className="hidden sm:table-cell"><Tag tone={t.status === "actual" ? "muted" : "warning"}>{t.status}</Tag></TableCell>
                  <TableCell className={cn("num text-right", t.direction === "income" ? "text-ok" : "")}>{t.direction === "income" ? "+" : "−"}{m(t.amount)}</TableCell>
                  <TableCell className="w-16 text-right"><button onClick={() => setTx(t)} className="mr-2" aria-label="Edit" data-testid={`tx-edit-${t.id}`}><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                    <button onClick={() => window.confirm("Delete transaction?") && mut("delete", `/transactions/${t.id}`, null, "Deleted")} aria-label="Delete" data-testid={`tx-delete-${t.id}`}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button></TableCell>
                </TableRow>))}</TableBody></Table>
          )}
        </Card>
      </>}
      <TxDialog open={newTx || !!tx} onOpenChange={(o) => { if (!o) { setNewTx(false); setTx(null); } }} tx={tx} domain={domain} accounts={accounts} />
      <ImportDialog open={imp} onOpenChange={setImp} domain={domain} />
      <SimpleDialog open={!!acct} onOpenChange={(o) => !o && setAcct(null)} title={acct?.id ? "Edit account" : "Add account"} testid="account-dialog"
        fields={[{ k: "name", label: "Name", v: acct?.name }, { k: "balance", label: "Current balance", type: "number", v: acct?.balance }, { k: "domain", label: "Area", options: DOMAINS, v: acct?.domain || (domain === "personal" ? "personal" : "business") },
          { k: "kind", label: "Type", options: ["bank", "cash", "savings", "credit", "investment"].map((v) => ({ value: v, label: v })), v: acct?.kind || "bank" }]}
        onSave={(f) => (acct?.id ? mut("patch", `/accounts/${acct.id}`, { ...f, balance: Number(f.balance || 0) }, "Account saved") : mut("post", "/accounts", { ...f, balance: Number(f.balance || 0) }, "Account added"))} />
      <SimpleDialog open={budget} onOpenChange={setBudget} title={`Budget for ${s?.month}`} testid="budget-dialog"
        fields={[{ k: "category", label: "Category (matches transaction category)" }, { k: "amount", label: "Monthly amount", type: "number" }]}
        onSave={(f) => mut("post", "/budgets", { category: f.category, amount: Number(f.amount || 0), month: s.month, domain }, "Budget added")} />
    </div>
  );
}
