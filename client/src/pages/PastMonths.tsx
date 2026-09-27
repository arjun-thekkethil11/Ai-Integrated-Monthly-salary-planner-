import { useEffect, useState } from "react";
import { Trash2, Plus, TrendingUp, TrendingDown, Camera, Sparkles, Loader2, X } from "lucide-react";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import { Card, SectionTitle, Button, Field, inputClass, Pill } from "../components/ui";
import { formatCurrency, monthLabel, monthOptions } from "../lib/format";
import { resizeImageForAi } from "../lib/image";
import { CATEGORIES } from "../lib/categories";
import type { PastMonth, AiStatus } from "../types";

export function PastMonths() {
  const settings = useAppStore((s) => s.settings);
  const pushToast = useAppStore((s) => s.pushToast);
  const cur = settings?.currency || "₹";

  const months = [...monthOptions(24, -1)].reverse(); // most recent past month first

  const [rows, setRows] = useState<PastMonth[]>([]);
  const [month, setMonth] = useState(months[0]?.value || "");
  const [salary, setSalary] = useState("");
  const [spent, setSpent] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<Record<string, number> | null>(null);
  const [addCategoryKey, setAddCategoryKey] = useState(CATEGORIES[0].key);

  async function load() {
    setRows(await api.getPastMonths());
  }
  useEffect(() => {
    load();
    api.getAiStatus().then(setAiStatus).catch(() => setAiStatus({ enabled: false, model: null }));
  }, []);

  async function handleScanMonthPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    setScanNote(null);
    try {
      const dataUrl = await resizeImageForAi(file);
      const result = await api.parseMonthImageAI(dataUrl);
      if (result.month) setMonth(result.month);
      if (result.totalSpent != null) setSpent(String(result.totalSpent));
      if (result.totalIncome != null) setSalary(String(result.totalIncome));
      setCategoryBreakdown(result.categoryBreakdown && Object.keys(result.categoryBreakdown).length > 0 ? result.categoryBreakdown : null);
      if (result.note) setScanNote(result.note);
      pushToast("Scanned — review the fields below, then save", "success");
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setScanning(false);
      api.getAiStatus().then(setAiStatus).catch(() => {});
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!month) return;
    setSaving(true);
    try {
      await api.upsertPastMonth({
        month,
        salary: Number(salary) || 0,
        total_spent: Number(spent) || 0,
        notes,
        category_breakdown: categoryBreakdown,
      });
      pushToast("Saved past month data", "success");
      setSalary("");
      setSpent("");
      setNotes("");
      setScanNote(null);
      setCategoryBreakdown(null);
      load();
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await api.deletePastMonth(id);
    load();
  }

  function updateBreakdownAmount(category: string, value: string) {
    const n = Number(value);
    setCategoryBreakdown((prev) => ({ ...(prev || {}), [category]: Number.isFinite(n) ? n : 0 }));
  }

  function removeBreakdownCategory(category: string) {
    setCategoryBreakdown((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[category];
      return Object.keys(next).length > 0 ? next : null;
    });
  }

  function addBreakdownCategory() {
    if (categoryBreakdown?.[addCategoryKey] != null) return;
    setCategoryBreakdown((prev) => ({ ...(prev || {}), [addCategoryKey]: 0 }));
  }

  const breakdownTotal = categoryBreakdown ? Object.values(categoryBreakdown).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const availableToAdd = CATEGORIES.filter((c) => !categoryBreakdown || categoryBreakdown[c.key] == null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Past Months</h1>
        <p className="text-white/45 text-sm mt-1">
          Log your history so analytics & the purchase planner can spot real trends, not just guesses.
        </p>
      </div>

      <div className="grid md:grid-cols-[0.8fr_1.2fr] gap-4 items-start">
        <Card>
          <SectionTitle subtitle="One entry per month">Add / update a month</SectionTitle>

          {aiStatus?.enabled && (
            <label
              className={`mb-4 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 py-3 px-3 text-center cursor-pointer transition-colors hover:border-violet-400/40 hover:bg-white/[0.03] ${
                scanning ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {scanning ? <Loader2 size={14} className="animate-spin text-white/50" /> : <Camera size={14} className="text-white/50" />}
              <span className="text-xs text-white/55 font-medium">
                {scanning ? "Reading screenshot…" : "Scan a monthly summary screenshot instead"}
              </span>
              <input type="file" accept="image/*" onChange={handleScanMonthPhoto} className="hidden" disabled={scanning} />
            </label>
          )}
          {aiStatus?.enabled && aiStatus.limits && (
            <div className="text-[11px] text-white/30 -mt-2 mb-4 flex items-center gap-1">
              <Sparkles size={10} /> {aiStatus.limits.sharedRemainingToday}/{aiStatus.limits.sharedPerDay} AI requests left today
            </div>
          )}
          {scanNote && <div className="text-xs text-violet-300/80 -mt-2 mb-4">{scanNote}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Month">
              <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass}>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Salary that month">
              <input type="number" min="0" step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} className={inputClass} required />
            </Field>
            <Field label="Total spent that month">
              <input type="number" min="0" step="0.01" value={spent} onChange={(e) => setSpent(e.target.value)} className={inputClass} required />
            </Field>
            <Field label="Notes (optional)">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. medical emergency, bonus month…"
                className={inputClass}
              />
            </Field>

            {categoryBreakdown && (
              <div className="rounded-xl border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50 font-medium">Category breakdown (from scan — feeds analytics & the planner)</span>
                  <span className="text-white/30">{formatCurrency(breakdownTotal, cur)} total</span>
                </div>
                {Object.entries(categoryBreakdown).map(([cat, amt]) => (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-xs text-white/60 flex-1 truncate">{cat}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amt}
                      onChange={(e) => updateBreakdownAmount(cat, e.target.value)}
                      className={`${inputClass} !py-1.5 !text-xs w-28`}
                    />
                    <button type="button" onClick={() => removeBreakdownCategory(cat)} className="text-white/25 hover:text-rose-400">
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {availableToAdd.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={addCategoryKey}
                      onChange={(e) => setAddCategoryKey(e.target.value)}
                      className={`${inputClass} !py-1.5 !text-xs flex-1`}
                    >
                      {availableToAdd.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.key}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addBreakdownCategory}
                      className="text-xs text-violet-300/80 hover:text-violet-200 flex items-center gap-1 px-2"
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                )}
              </div>
            )}
            {!categoryBreakdown && aiStatus?.enabled && (
              <div className="text-[11px] text-white/25">
                Tip: scan a screenshot that shows spending by category and it'll be saved for richer analytics.
              </div>
            )}

            <Button type="submit" disabled={saving} className="w-full">
              <Plus size={15} /> {saving ? "Saving…" : "Save month"}
            </Button>
          </form>
        </Card>

        <Card>
          <SectionTitle subtitle={`${rows.length} month${rows.length === 1 ? "" : "s"} logged`}>Your history</SectionTitle>
          {rows.length === 0 ? (
            <div className="text-center py-10 text-sm text-white/30">
              No past months yet. Add a few to unlock richer trend analytics.
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const positive = r.savings >= 0;
                return (
                  <div key={r.id} className="group flex items-center gap-3 rounded-xl px-3.5 py-3 hover:bg-white/5 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                      {positive ? <TrendingUp size={16} className="text-emerald-400" /> : <TrendingDown size={16} className="text-rose-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white/90">{monthLabel(r.month)}</div>
                      <div className="text-xs text-white/40">
                        Salary {formatCurrency(r.salary, cur)} · Spent {formatCurrency(r.total_spent, cur)}
                        {r.notes ? ` · ${r.notes}` : ""}
                      </div>
                      {r.category_breakdown && Object.keys(r.category_breakdown).length > 0 && (
                        <div className="text-[11px] text-white/30 mt-0.5 truncate">
                          {Object.entries(r.category_breakdown)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 3)
                            .map(([cat, amt]) => `${cat} ${formatCurrency(amt, cur)}`)
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                    <Pill tone={positive ? "success" : "danger"}>
                      {positive ? "+" : ""}
                      {formatCurrency(r.savings, cur)}
                    </Pill>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-white/20 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
