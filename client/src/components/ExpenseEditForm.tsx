import { useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import { CATEGORIES } from "../lib/categories";
import { inputClass } from "./ui";
import type { Expense } from "../types";

/** Correct an expense that was already saved. Amount changes move the current balance by the difference. */
export function ExpenseEditForm({
  expense,
  onCancel,
  onSaved,
}: {
  expense: Expense;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const pushToast = useAppStore((s) => s.pushToast);
  const [amount, setAmount] = useState(String(expense.amount));
  const [description, setDescription] = useState(expense.description || "");
  const [date, setDate] = useState(expense.date);
  const [category, setCategory] = useState(expense.category);
  const [recurring, setRecurring] = useState(!!expense.recurring);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      pushToast("Enter a valid amount", "error");
      return;
    }
    setSaving(true);
    try {
      await api.updateExpense(expense.id, {
        amount: amt,
        description,
        date,
        category,
        recurring: recurring ? 1 : 0,
      });
      pushToast("Expense updated — balance adjusted", "success");
      onSaved();
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClass}
          aria-label="Amount"
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} aria-label="Date" />
      </div>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What was it for?"
        className={inputClass}
      />
      <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} aria-label="Category">
        {CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.key}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-xs text-white/55">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="accent-violet-500" />
        Repeats every month
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-white/40 hover:text-white/70 p-1.5 rounded-lg bg-white/5" title="Cancel">
          <X size={15} />
        </button>
        <button type="button" onClick={handleSave} disabled={saving} className="text-emerald-400 hover:text-emerald-300 p-1.5 rounded-lg bg-emerald-500/10" title="Save">
          <Check size={15} />
        </button>
      </div>
    </div>
  );
}
