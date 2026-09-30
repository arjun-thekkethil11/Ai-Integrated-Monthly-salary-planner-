import { useEffect, useMemo, useState } from "react";
import { Trash2, Wand2, Repeat, Pencil } from "lucide-react";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import { Card, SectionTitle, Pill } from "../components/ui";
import { QuickAddExpense } from "../components/QuickAddExpense";
import { ExpenseEditForm } from "../components/ExpenseEditForm";
import { CategoryIcon } from "../components/CategoryIcon";
import { categoryMetaFor } from "../lib/categories";
import { formatCurrency, dateLabel, currentMonthKey, monthOptions } from "../lib/format";
import type { Expense } from "../types";

export function Expenses() {
  const settings = useAppStore((s) => s.settings);
  const refresh = useAppStore((s) => s.refresh);
  const pushToast = useAppStore((s) => s.pushToast);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [month, setMonth] = useState<string>(currentMonthKey());
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const rows = await api.getExpenses({ month, limit: 500 });
    setExpenses(rows);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const logged = useMemo(() => expenses.filter((e) => !e.applied), [expenses]);
  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const months = useMemo(() => monthOptions(12, 0).reverse(), []);

  async function handleDelete(e: Expense) {
    if (e.applied) return;
    await api.deleteExpense(e.id);
    pushToast("Expense removed", "info");
    load();
    refresh();
  }

  const cur = settings?.currency || "₹";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Expenses</h1>
        <p className="text-white/45 text-sm mt-1">Every expense you log gets auto-categorized, just like a smart card statement.</p>
      </div>

      <div className="grid md:grid-cols-[1fr_1.3fr] gap-4 items-start">
        <QuickAddExpense onAdded={() => { load(); refresh(); }} />

        <Card>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <SectionTitle subtitle={`${logged.length} expense${logged.length === 1 ? "" : "s"} · Total ${formatCurrency(total, cur)}`}>
              History
            </SectionTitle>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/80 focus:outline-none"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="text-center py-10 text-white/30 text-sm">Loading…</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-10 text-white/30 text-sm">No expenses logged for this month yet.</div>
          ) : (
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto scrollbar-thin pr-1">
              {expenses.map((e) => {
                const meta = categoryMetaFor(e.category);
                if (editingId === e.id) {
                  return (
                    <ExpenseEditForm
                      key={e.id}
                      expense={e}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        load();
                        refresh();
                      }}
                    />
                  );
                }
                return (
                  <div key={e.id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5 transition-colors">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${meta.color}20` }}
                    >
                      <CategoryIcon icon={meta.icon} size={15} style={{ color: meta.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white/85 truncate">{e.description || e.category}</div>
                      <div className="text-xs text-white/35 flex items-center gap-1.5 flex-wrap">
                        {e.applied ? "Applied from monthly bill" : dateLabel(e.date)} · {e.category}
                        {!!e.recurring && (
                          <span className="inline-flex items-center gap-0.5 text-cyan-300/80">
                            <Repeat size={10} /> monthly
                          </span>
                        )}
                        {!!e.auto_categorized && !e.applied && (
                          <span className="inline-flex items-center gap-0.5 text-violet-300/70">
                            <Wand2 size={10} /> auto
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-white/90 tabular-nums shrink-0">{formatCurrency(e.amount, cur)}</div>
                    {!e.applied && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingId(e.id)}
                          title="Edit expense"
                          className="text-white/35 hover:text-violet-300 transition-colors p-1 shrink-0"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(e)}
                          title="Delete expense"
                          className="text-white/35 hover:text-rose-400 transition-colors p-1 shrink-0"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {expenses.length > 0 && <CategorySummary expenses={expenses} currency={cur} />}
    </div>
  );
}

function CategorySummary({ expenses, currency }: { expenses: Expense[]; currency: string }) {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const e of expenses) {
    totals.set(e.category, (totals.get(e.category) || 0) + e.amount);
    grand += e.amount;
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <SectionTitle subtitle="For the selected month">Category breakdown</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {rows.map(([category, total]) => {
          const meta = categoryMetaFor(category);
          const pct = grand > 0 ? Math.round((total / grand) * 100) : 0;
          return (
            <div key={category} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}20` }}>
                <CategoryIcon icon={meta.icon} size={14} style={{ color: meta.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/75 truncate">{category}</span>
                  <span className="text-white/50 tabular-nums">{formatCurrency(total, currency)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                </div>
              </div>
              <Pill>{pct}%</Pill>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
