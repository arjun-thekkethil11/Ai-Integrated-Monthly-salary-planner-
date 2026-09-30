import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings2 } from "lucide-react";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import { Button, Field, inputClass } from "./ui";
import type { Settings } from "../types";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((s) => s.settings) as Settings;
  const refresh = useAppStore((s) => s.refresh);
  const pushToast = useAppStore((s) => s.pushToast);

  const [form, setForm] = useState({
    monthly_salary: String(settings.monthly_salary ?? ""),
    current_balance: String(settings.current_balance ?? ""),
    salary_day: String(settings.salary_day ?? 1),
    safety_buffer_pct: String(settings.safety_buffer_pct ?? 10),
    monthly_savings_goal: String(settings.monthly_savings_goal ?? ""),
    daily_plan_enabled: settings.daily_plan_enabled,
    weekly_plan_enabled: settings.weekly_plan_enabled,
    daily_budget_override: settings.daily_budget_override != null ? String(settings.daily_budget_override) : "",
    weekly_budget_override: settings.weekly_budget_override != null ? String(settings.weekly_budget_override) : "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings({
        monthly_salary: Number(form.monthly_salary) || 0,
        current_balance: Number(form.current_balance) || 0,
        salary_day: Number(form.salary_day) || 1,
        safety_buffer_pct: Number(form.safety_buffer_pct) || 0,
        monthly_savings_goal: Number(form.monthly_savings_goal) || 0,
        daily_plan_enabled: form.daily_plan_enabled,
        weekly_plan_enabled: form.weekly_plan_enabled,
        daily_budget_override: form.daily_budget_override ? Number(form.daily_budget_override) : null,
        weekly_budget_override: form.weekly_budget_override ? Number(form.weekly_budget_override) : null,
      });
      await refresh();
      pushToast("Settings updated", "success");
      onClose();
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="glass-strong rounded-3xl p-5 sm:p-7 w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center">
                <Settings2 size={16} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">Budget settings</h2>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly salary">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthly_salary}
                  onChange={(e) => setForm((f) => ({ ...f, monthly_salary: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Current balance">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.current_balance}
                  onChange={(e) => setForm((f) => ({ ...f, current_balance: e.target.value }))}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Salary day" hint="Day of month you get paid">
                <select
                  value={form.salary_day}
                  onChange={(e) => setForm((f) => ({ ...f, salary_day: e.target.value }))}
                  className={inputClass}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Safety buffer %" hint="Kept aside, never counted as spendable">
                <input
                  type="number"
                  min="0"
                  max="90"
                  step="1"
                  value={form.safety_buffer_pct}
                  onChange={(e) => setForm((f) => ({ ...f, safety_buffer_pct: e.target.value }))}
                  className={inputClass}
                />
              </Field>
            </div>

            <Field
              label="Monthly savings goal (optional)"
              hint="Kept aside on top of the safety buffer, so your daily/weekly plan actually leaves this much unspent by month end."
            >
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthly_savings_goal}
                onChange={(e) => setForm((f) => ({ ...f, monthly_savings_goal: e.target.value }))}
                placeholder="e.g. 5000 — leave blank for 0"
                className={inputClass}
              />
            </Field>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Optional plan modules</p>

              <ToggleRow
                label="Daily spending plan"
                checked={form.daily_plan_enabled}
                onChange={(v) => setForm((f) => ({ ...f, daily_plan_enabled: v }))}
              />
              {form.daily_plan_enabled && (
                <Field label="Your daily spending target" hint="e.g. 300 if that's what feels sufficient. Leave blank to auto-calculate from balance, buffer & savings goal.">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.daily_budget_override}
                    onChange={(e) => setForm((f) => ({ ...f, daily_budget_override: e.target.value }))}
                    placeholder="Auto"
                    className={inputClass}
                  />
                </Field>
              )}

              <ToggleRow
                label="Weekly spending plan"
                checked={form.weekly_plan_enabled}
                onChange={(v) => setForm((f) => ({ ...f, weekly_plan_enabled: v }))}
              />
              {form.weekly_plan_enabled && (
                <Field label="Custom weekly budget (optional)" hint="Leave blank to auto-calculate from balance">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.weekly_budget_override}
                    onChange={(e) => setForm((f) => ({ ...f, weekly_budget_override: e.target.value }))}
                    placeholder="Auto"
                    className={inputClass}
                  />
                </Field>
              )}
            </div>

            <Button type="submit" disabled={saving} className="w-full mt-2">
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-white/75">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${checked ? "bg-gradient-to-r from-violet-500 to-cyan-400" : "bg-white/10"}`}
      >
        <motion.div
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow"
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}
