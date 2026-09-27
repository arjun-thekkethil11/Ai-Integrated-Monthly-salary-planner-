import { useState } from "react";
import { motion } from "framer-motion";
import { Wallet, ArrowRight } from "lucide-react";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import { Button, Field, inputClass } from "./ui";

export function OnboardingModal({ onDone }: { onDone: () => void }) {
  const refresh = useAppStore((s) => s.refresh);
  const pushToast = useAppStore((s) => s.pushToast);
  const [salary, setSalary] = useState("");
  const [balance, setBalance] = useState("");
  const [salaryDay, setSalaryDay] = useState("1");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings({
        monthly_salary: Number(salary) || 0,
        current_balance: Number(balance) || 0,
        salary_day: Number(salaryDay) || 1,
      });
      await refresh();
      pushToast("You're all set! Welcome to Finly.", "success");
      onDone();
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="glass-strong rounded-3xl p-6 sm:p-8 w-full max-w-md"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-violet-500/30 mb-4">
          <Wallet size={22} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Welcome to Finly</h1>
        <p className="text-sm text-white/50 mt-1.5 mb-6">
          Let's set up your budget. This takes 30 seconds and you can change everything later.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Your monthly salary" hint="Editable anytime from the dashboard.">
            <input
              autoFocus
              required
              type="number"
              min="0"
              step="0.01"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 60000"
              className={inputClass}
            />
          </Field>
          <Field label="Current balance in hand" hint="What you actually have right now to spend/save.">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="e.g. 32000"
              className={inputClass}
            />
          </Field>
          <Field label="Salary credit date" hint="Day of the month you usually get paid.">
            <select value={salaryDay} onChange={(e) => setSalaryDay(e.target.value)} className={inputClass}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>

          <Button type="submit" disabled={saving} className="w-full mt-2">
            {saving ? "Setting up…" : "Start planning"}
            <ArrowRight size={16} />
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
