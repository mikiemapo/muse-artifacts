import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";

type Dashboard = ApiResponse<typeof api, "getDashboard">;
type Bill = Dashboard["bills"][number];
type Allocation = Dashboard["allocations"][number];
type BillStatus = Bill["status"];
type ModalState =
  | { type: "bill"; item?: Bill }
  | { type: "allocation"; item?: Allocation }
  | { type: "settings" }
  | null;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const cents = (value: number) => money.format(value / 100);

function dateLabel(value: string | null) {
  if (!value) return "Date to verify";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

const statusLabels: Record<BillStatus, string> = {
  pending: "Pending",
  covered: "Covered",
  paid: "Paid",
  needs_attention: "Needs attention",
};

function downloadCsv(data: Dashboard) {
  const quote = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [
    ["Priority", "Bill", "Amount", "Due", "Status", "Account", "Category", "Recurrence", "Note"],
    ...data.bills.map((bill) => [bill.priority, bill.name, bill.amountCents == null ? "" : (bill.amountCents / 100).toFixed(2), bill.dueDate, statusLabels[bill.status], bill.account, bill.category, bill.recurring, bill.note]),
  ];
  const blob = new Blob([lines.map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "budget-ledger.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "attention" | "paid">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState("");

  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => api.getDashboard({}) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  const initialize = useMutation({ mutationFn: () => api.initializeBudget({}), onSuccess: refresh });
  const statusMutation = useMutation({ mutationFn: (input: { id: number; status: BillStatus }) => api.setBillStatus(input), onSuccess: refresh });
  const saveBill = useMutation({ mutationFn: (input: Parameters<typeof api.saveBill>[0]) => api.saveBill(input), onSuccess: () => { refresh(); setModal(null); setNotice("Bill saved"); } });
  const deleteBill = useMutation({ mutationFn: (id: number) => api.deleteBill({ id }), onSuccess: () => { refresh(); setModal(null); setNotice("Bill removed"); } });
  const saveAllocation = useMutation({ mutationFn: (input: Parameters<typeof api.saveAllocation>[0]) => api.saveAllocation(input), onSuccess: () => { refresh(); setModal(null); setNotice("Payday lane saved"); } });
  const deleteAllocation = useMutation({ mutationFn: (id: number) => api.deleteAllocation({ id }), onSuccess: () => { refresh(); setModal(null); setNotice("Payday lane removed"); } });
  const saveSettings = useMutation({ mutationFn: (input: Parameters<typeof api.saveSettings>[0]) => api.saveSettings(input), onSuccess: () => { refresh(); setModal(null); setNotice("Paycheck updated"); } });

  const data = dashboard.data;
  const metrics = useMemo(() => {
    if (!data) return { committed: 0, unassigned: 0, protectedTotal: 0, openTotal: 0 };
    const committed = data.allocations.reduce((sum, row) => sum + row.amountCents, 0);
    const paycheck = data.settings?.paycheckCents ?? 0;
    return {
      committed,
      unassigned: paycheck - committed,
      protectedTotal: data.allocations.filter((row) => row.protected).reduce((sum, row) => sum + row.amountCents, 0),
      openTotal: data.bills.filter((row) => row.status !== "paid").reduce((sum, row) => sum + (row.amountCents ?? 0), 0),
    };
  }, [data]);

  const visibleBills = useMemo(() => {
    if (!data) return [];
    if (filter === "attention") return data.bills.filter((bill) => bill.status === "needs_attention");
    if (filter === "paid") return data.bills.filter((bill) => bill.status === "paid");
    return data.bills;
  }, [data, filter]);

  if (dashboard.isPending) {
    return <main className="loading"><span className="loading-mark" />Opening your ledger…</main>;
  }

  if (dashboard.isError) {
    return <main className="loading error-state"><strong>Couldn’t open the ledger.</strong><button onClick={() => dashboard.refetch()}>Try again</button></main>;
  }

  if (!data?.settings) {
    return (
      <main className="empty-state">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <p className="eyebrow">Starting point</p>
        <h1>Your budget is ready to organize.</h1>
        <p>Load the bills and payday priorities you already worked out, then keep every amount editable.</p>
        <button className="primary-btn" onClick={() => initialize.mutate()} disabled={initialize.isPending}>{initialize.isPending ? "Loading…" : "Load my starting plan"}</button>
      </main>
    );
  }

  const paycheck = data.settings.paycheckCents;
  const progress = paycheck > 0 ? Math.min(100, (metrics.committed / paycheck) * 100) : 0;

  return (
    <div className="app-shell">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main>
        <section className="paycheck-hero" aria-labelledby="paycheck-heading">
          <div className="hero-topline">
            <div>
              <p className="eyebrow">Next {data.settings.cadence.toLowerCase()} check</p>
              <h1 id="paycheck-heading">{cents(paycheck)}</h1>
            </div>
            <button className="text-btn" onClick={() => setModal({ type: "settings" })}>Edit check</button>
          </div>
          <p className="payday-date">{dateLabel(data.settings.nextPayday)} · focus account: {data.settings.focusAccount}</p>
          <div className="meter" aria-label={`${Math.round(progress)} percent assigned`}><span style={{ width: `${progress}%` }} /></div>
          <div className="hero-metrics">
            <div><span>Assigned</span><strong>{cents(metrics.committed)}</strong></div>
            <div><span>Protected</span><strong>{cents(metrics.protectedTotal)}</strong></div>
            <div className={metrics.unassigned < 0 ? "negative" : ""}><span>{metrics.unassigned < 0 ? "Over" : "Unassigned"}</span><strong>{cents(Math.abs(metrics.unassigned))}</strong></div>
          </div>
          <p className="payday-rule"><span>1</span> Mazda reserve moves first — before the day starts asking for money.</p>
        </section>

        <div className="content-grid">
          <section className="ledger" aria-labelledby="ledger-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Priority ledger</p>
                <h2 id="ledger-heading">Bills in order</h2>
              </div>
              <button className="primary-btn compact" onClick={() => setModal({ type: "bill" })}>Add bill</button>
            </div>

            <div className="ledger-toolbar">
              <div className="filter-group" aria-label="Filter bills">
                {(["all", "attention", "paid"] as const).map((value) => (
                  <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                    {value === "all" ? "All" : value === "attention" ? "Needs attention" : "Paid"}
                  </button>
                ))}
              </div>
              <button className="export-btn" onClick={() => downloadCsv(data)}>Export CSV</button>
            </div>

            <div className="bill-list">
              {visibleBills.length === 0 ? <p className="blank-row">Nothing in this view.</p> : visibleBills.map((bill) => (
                <article className={`bill-row status-${bill.status}`} key={bill.id}>
                  <button
                    className={`check ${bill.status === "paid" ? "checked" : ""}`}
                    aria-label={bill.status === "paid" ? `Mark ${bill.name} pending` : `Mark ${bill.name} paid`}
                    onClick={() => statusMutation.mutate({ id: bill.id, status: bill.status === "paid" ? "pending" : "paid" })}
                  >{bill.status === "paid" ? "✓" : bill.priority}</button>
                  <button className="bill-main" onClick={() => setModal({ type: "bill", item: bill })} aria-label={`Edit ${bill.name}`}>
                    <span className="bill-title-line"><strong>{bill.name}</strong><span className="amount">{bill.amountCents == null ? "Verify amount" : cents(bill.amountCents)}</span></span>
                    <span className="bill-meta"><span className={`status-dot ${bill.status}`} />{statusLabels[bill.status]} · {dateLabel(bill.dueDate)} · {bill.account}</span>
                    {bill.note ? <span className="bill-note">{bill.note}</span> : null}
                  </button>
                </article>
              ))}
            </div>
            <p className="ledger-total"><span>Open listed bills</span><strong>{cents(metrics.openTotal)}</strong></p>
          </section>

          <aside className="payday-plan" aria-labelledby="plan-heading">
            <div className="section-heading">
              <div><p className="eyebrow">Order of operations</p><h2 id="plan-heading">Payday plan</h2></div>
              <button className="text-btn" onClick={() => setModal({ type: "allocation" })}>Add lane</button>
            </div>
            <ol className="allocation-list">
              {data.allocations.map((row) => (
                <li key={row.id}>
                  <span className="order">{row.sortOrder}</span>
                  <button className="allocation-main" onClick={() => setModal({ type: "allocation", item: row })} aria-label={`Edit ${row.label}`}>
                    <span><strong>{row.label}</strong>{row.protected ? <em>Protected</em> : null}</span>
                    <small>{row.note}</small>
                  </button>
                  <strong className="allocation-amount">{cents(row.amountCents)}</strong>
                </li>
              ))}
            </ol>
            <div className="allocation-footer"><span>Check total</span><strong>{cents(metrics.committed)} <small>of {cents(paycheck)}</small></strong></div>
          </aside>
        </div>
      </main>

      {notice ? <button className="toast" onClick={() => setNotice("")} aria-label="Dismiss message">{notice}</button> : null}
      {modal?.type === "bill" ? <BillEditor item={modal.item} maxPriority={data.bills.length + 1} onClose={() => setModal(null)} onSave={(value) => saveBill.mutate(value)} onDelete={modal.item ? () => deleteBill.mutate(modal.item!.id) : undefined} busy={saveBill.isPending || deleteBill.isPending} /> : null}
      {modal?.type === "allocation" ? <AllocationEditor item={modal.item} maxOrder={data.allocations.length + 1} onClose={() => setModal(null)} onSave={(value) => saveAllocation.mutate(value)} onDelete={modal.item ? () => deleteAllocation.mutate(modal.item!.id) : undefined} busy={saveAllocation.isPending || deleteAllocation.isPending} /> : null}
      {modal?.type === "settings" ? <SettingsEditor settings={data.settings} onClose={() => setModal(null)} onSave={(value) => saveSettings.mutate(value)} busy={saveSettings.isPending} /> : null}
    </div>
  );
}

function EditorShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="editor" role="dialog" aria-modal="true" aria-label={title}><div className="editor-head"><h2>{title}</h2><button onClick={onClose} aria-label="Close editor">Close</button></div>{children}</section></div>;
}

function BillEditor({ item, maxPriority, onClose, onSave, onDelete, busy }: { item?: Bill; maxPriority: number; onClose: () => void; onSave: (value: Parameters<typeof api.saveBill>[0]) => void; onDelete?: () => void; busy: boolean }) {
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(item?.amountCents == null ? "" : (item.amountCents / 100).toFixed(2));
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [status, setStatus] = useState<BillStatus>(item?.status ?? "pending");
  const [priority, setPriority] = useState(String(item?.priority ?? maxPriority));
  const [category, setCategory] = useState(item?.category ?? "Other");
  const [account, setAccount] = useState(item?.account ?? "BofA");
  const [recurring, setRecurring] = useState<Bill["recurring"]>(item?.recurring ?? "monthly");
  const [note, setNote] = useState(item?.note ?? "");
  const submit = (event: FormEvent) => { event.preventDefault(); onSave({ id: item?.id, name, amountCents: amount === "" ? null : Math.round(Number(amount) * 100), dueDate: dueDate || null, status, priority: Number(priority), category, account, recurring, note }); };
  return <EditorShell title={item ? "Edit bill" : "Add a bill"} onClose={onClose}><form className="editor-form" onSubmit={submit}>
    <label>Bill name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
    <div className="field-pair"><label>Amount<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Leave blank to verify" /></label><label>Due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label></div>
    <div className="field-pair"><label>Status<select value={status} onChange={(e) => setStatus(e.target.value as BillStatus)}><option value="pending">Pending</option><option value="covered">Covered</option><option value="paid">Paid</option><option value="needs_attention">Needs attention</option></select></label><label>Priority<input type="number" min="1" max="99" value={priority} onChange={(e) => setPriority(e.target.value)} required /></label></div>
    <div className="field-pair"><label>Category<input value={category} onChange={(e) => setCategory(e.target.value)} required /></label><label>Payment account<input value={account} onChange={(e) => setAccount(e.target.value)} required /></label></div>
    <label>Repeats<select value={recurring} onChange={(e) => setRecurring(e.target.value as Bill["recurring"])}><option value="none">Does not repeat</option><option value="monthly">Monthly</option><option value="biweekly">Every two weeks</option></select></label>
    <label>Note<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></label>
    <div className="form-actions">{onDelete ? <button type="button" className="danger-btn" onClick={onDelete}>Delete</button> : <span />}<button className="primary-btn" disabled={busy}>{busy ? "Saving…" : "Save bill"}</button></div>
  </form></EditorShell>;
}

function AllocationEditor({ item, maxOrder, onClose, onSave, onDelete, busy }: { item?: Allocation; maxOrder: number; onClose: () => void; onSave: (value: Parameters<typeof api.saveAllocation>[0]) => void; onDelete?: () => void; busy: boolean }) {
  const [label, setLabel] = useState(item?.label ?? "");
  const [amount, setAmount] = useState(item ? (item.amountCents / 100).toFixed(2) : "");
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? maxOrder));
  const [protectedLane, setProtectedLane] = useState(item?.protected ?? false);
  const [note, setNote] = useState(item?.note ?? "");
  const submit = (event: FormEvent) => { event.preventDefault(); onSave({ id: item?.id, label, amountCents: Math.round(Number(amount) * 100), sortOrder: Number(sortOrder), protected: protectedLane, note }); };
  return <EditorShell title={item ? "Edit payday lane" : "Add payday lane"} onClose={onClose}><form className="editor-form" onSubmit={submit}>
    <label>Lane name<input value={label} onChange={(e) => setLabel(e.target.value)} required /></label>
    <div className="field-pair"><label>Amount per check<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label><label>Order<input type="number" min="1" max="99" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} required /></label></div>
    <label className="checkbox-label"><input type="checkbox" checked={protectedLane} onChange={(e) => setProtectedLane(e.target.checked)} /> Protect this money on payday</label>
    <label>Note<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
    <div className="form-actions">{onDelete ? <button type="button" className="danger-btn" onClick={onDelete}>Delete</button> : <span />}<button className="primary-btn" disabled={busy}>{busy ? "Saving…" : "Save lane"}</button></div>
  </form></EditorShell>;
}

function SettingsEditor({ settings, onClose, onSave, busy }: { settings: NonNullable<Dashboard["settings"]>; onClose: () => void; onSave: (value: Parameters<typeof api.saveSettings>[0]) => void; busy: boolean }) {
  const [amount, setAmount] = useState((settings.paycheckCents / 100).toFixed(2));
  const [date, setDate] = useState(settings.nextPayday);
  const [cadence, setCadence] = useState(settings.cadence);
  const [account, setAccount] = useState(settings.focusAccount);
  const submit = (event: FormEvent) => { event.preventDefault(); onSave({ paycheckCents: Math.round(Number(amount) * 100), nextPayday: date, cadence, focusAccount: account }); };
  return <EditorShell title="Edit next paycheck" onClose={onClose}><form className="editor-form" onSubmit={submit}>
    <label>Take-home amount<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
    <label>Next payday<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
    <div className="field-pair"><label>Cadence<input value={cadence} onChange={(e) => setCadence(e.target.value)} required /></label><label>Focus account<input value={account} onChange={(e) => setAccount(e.target.value)} required /></label></div>
    <div className="form-actions"><span /><button className="primary-btn" disabled={busy}>{busy ? "Saving…" : "Save paycheck"}</button></div>
  </form></EditorShell>;
}
