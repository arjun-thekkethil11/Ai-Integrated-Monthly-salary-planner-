import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, CalendarClock, Check } from "lucide-react";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import { Card, SectionTitle, Button, Field, inputClass } from "./ui";
import { formatCurrency, dateLabel, todayISO } from "../lib/format";
import type { Reminder } from "../types";

/**
 * "I want to buy X on [date] this month" reminders. Ticking one off logs
 * the real expense for that amount/item and marks it done; deleting just
 * removes it — either way it stops being a reminder.
 */
export function RemindersCard({ onChanged }: { onChanged: () => void }) {
  const settings = useAppStore((s) => s.settings);
  const pushToast = useAppStore((s) => s.pushToast);
  const cur = settings?.currency || "₹";

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setReminders(await api.getReminders());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!itemName.trim()) {
      pushToast("What do you want to buy?", "error");
      return;
    }
    if (!amt || amt <= 0) {
      pushToast("Enter a valid amount", "error");
      return;
    }
    setSaving(true);
    try {
      await api.addReminder({ itemName: itemName.trim(), amount: amt, dueDate });
      setItemName("");
      setAmount("");
      pushToast("Reminder set", "success");
      load();
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(reminder: Reminder) {
    setCompletingId(reminder.id);
    try {
      await api.completeReminder(reminder.id);
      pushToast(`Logged as an expense — ${formatCurrency(reminder.amount, cur)}`, "success");
      load();
      onChanged();
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setCompletingId(null);
    }
  }

  async function handleDelete(id: string) {
    await api.deleteReminder(id);
    load();
  }

  const pending = reminders.filter((r) => r.status === "pending").sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const done = reminders.filter((r) => r.status === "done").slice(0, 3);
  const today = todayISO();

  return (
    <Card>
      <SectionTitle subtitle="Write down what you want to buy and when — tick it off once bought">Reminders</SectionTitle>

      <form onSubmit={handleAdd} className="space-y-3 mb-4">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="What do you want to buy?">
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. New shoes"
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Amount">
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 2000"
              className={inputClass}
            />
          </Field>
          <Field label="By date">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Button type="submit" disabled={saving} className="w-full" size="sm">
          <Plus size={14} /> {saving ? "Saving…" : "Add reminder"}
        </Button>
      </form>

      {loading ? (
        <div className="text-center py-6 text-sm text-white/30">Loading…</div>
      ) : pending.length === 0 && done.length === 0 ? (
        <div className="text-center py-6 text-sm text-white/30">Nothing planned yet — add something above.</div>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {pending.map((r) => {
              const overdue = r.due_date < today;
              const dueToday = r.due_date === today;
              return (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => handleComplete(r)}
                    disabled={completingId === r.id}
                    title="Mark as bought — logs it as an expense"
                    className="w-6 h-6 rounded-full border-2 border-white/20 flex items-center justify-center shrink-0 hover:border-emerald-400 hover:bg-emerald-400/15 transition-colors disabled:opacity-50"
                  >
                    {completingId === r.id ? (
                      <motion.div
                        className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.6, ease: "linear" }}
                      />
                    ) : (
                      <Check size={12} className="text-transparent group-hover:text-emerald-400 transition-colors" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white/85 truncate">{r.item_name}</div>
                    <div className={`text-xs flex items-center gap-1 ${overdue ? "text-rose-300/80" : dueToday ? "text-amber-300/80" : "text-white/35"}`}>
                      <CalendarClock size={11} />
                      {overdue ? "Overdue · " : dueToday ? "Due today · " : "By "}
                      {dateLabel(r.due_date)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-white/90 tabular-nums shrink-0">{formatCurrency(r.amount, cur)}</div>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-white/20 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {done.length > 0 && (
            <div className="pt-1 space-y-1">
              {done.map((r) => (
                <div key={r.id} className="group flex items-center gap-3 rounded-xl px-3 py-2 opacity-50 hover:opacity-80 transition-opacity">
                  <div className="w-6 h-6 rounded-full bg-emerald-400/15 flex items-center justify-center shrink-0">
                    <Check size={12} className="text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1 text-sm text-white/60 truncate line-through">{r.item_name}</div>
                  <div className="text-xs text-white/40 tabular-nums shrink-0">{formatCurrency(r.amount, cur)}</div>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-white/20 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
