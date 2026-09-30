import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarCheck, Compass, CheckCircle2, XCircle, HelpCircle, Sparkles, Trash2, Dot } from "lucide-react";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import { Card, SectionTitle, Button, Field, inputClass } from "../components/ui";
import { formatCurrency, dateLabel, monthLabel, monthOptions, currentMonthKey } from "../lib/format";
import type { AffordResult, PredictResult, Goal } from "../types";

type Mode = "afford" | "predict";

export function Planner() {
  const settings = useAppStore((s) => s.settings);
  const pushToast = useAppStore((s) => s.pushToast);
  const cur = settings?.currency || "₹";

  const [mode, setMode] = useState<Mode>("afford");
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("");
  const [targetMonth, setTargetMonth] = useState(currentMonthKey());
  const [loading, setLoading] = useState(false);
  const [affordResult, setAffordResult] = useState<AffordResult | null>(null);
  const [predictResult, setPredictResult] = useState<PredictResult | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);

  const months = monthOptions(0, 18);

  async function loadGoals() {
    setGoals(await api.getGoals());
  }
  useEffect(() => {
    loadGoals();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      pushToast("Enter a valid amount", "error");
      return;
    }
    setLoading(true);
    try {
      if (mode === "afford") {
        const res = await api.checkAfford({ itemName: itemName || "This purchase", amount: amt, targetMonth });
        setAffordResult(res);
        setPredictResult(null);
      } else {
        const res = await api.predictTiming({ itemName: itemName || "This item", amount: amt });
        setPredictResult(res);
        setAffordResult(null);
      }
      loadGoals();
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteGoal(id: string) {
    await api.deleteGoal(id);
    loadGoals();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Purchase Planner</h1>
        <p className="text-white/45 text-sm mt-1">
          Check a month, or ask for the right time. Both answers use your salary, balance, bills, and the spending you've actually saved.
        </p>
      </div>

      <div className="flex gap-2">
        <ModeTab
          active={mode === "afford"}
          onClick={() => setMode("afford")}
          icon={CalendarCheck}
          title="Can I afford it this month?"
          desc="Pick an item, amount & month"
        />
        <ModeTab
          active={mode === "predict"}
          onClick={() => setMode("predict")}
          icon={Compass}
          title="When's the right time?"
          desc="No month needed — we'll find it"
        />
      </div>

      <div className="grid md:grid-cols-[0.9fr_1.1fr] gap-4 items-start">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="What do you want to buy?">
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. iPhone case, Goa trip, Sofa…"
                className={inputClass}
              />
            </Field>
            <Field label="Amount needed">
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 8000"
                className={inputClass}
                required
              />
            </Field>
            {mode === "afford" && (
              <Field label="Which month?">
                <select value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} className={inputClass}>
                  {months.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              <Sparkles size={15} /> {loading ? "Checking your numbers…" : mode === "afford" ? "Check affordability" : "Find the right time"}
            </Button>
          </form>
        </Card>

        <AnimatePresence mode="wait">
          {affordResult && mode === "afford" && <AffordCard key="afford" result={affordResult} currency={cur} />}
          {predictResult && mode === "predict" && <PredictCard key="predict" result={predictResult} currency={cur} />}
          {!affordResult && !predictResult && (
            <Card className="flex items-center justify-center h-full min-h-[280px] text-center">
              <div>
                <Sparkles size={28} className="text-white/15 mx-auto mb-3" />
                <p className="text-white/35 text-sm max-w-xs mx-auto">
                  Fill in the form. Finly checks the money you've saved in the app, then explains that result. It won't invent a monthly spend.
                </p>
              </div>
            </Card>
          )}
        </AnimatePresence>
      </div>

      {goals.length > 0 && (
        <Card>
          <SectionTitle subtitle="Your recent purchase-planning queries">History</SectionTitle>
          <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
            {goals.map((g) => (
              <GoalRow key={g.id} goal={g} currency={cur} onDelete={() => handleDeleteGoal(g.id)} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ModeTab({ active, onClick, icon: Icon, title, desc }: { active: boolean; onClick: () => void; icon: any; title: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left rounded-2xl p-4 border transition-all ${
        active ? "glass-strong border-violet-400/30" : "glass border-transparent hover:border-white/10"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${active ? "bg-gradient-to-br from-violet-500 to-cyan-400" : "bg-white/10"}`}>
          <Icon size={16} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white/90">{title}</div>
          <div className="text-[11px] text-white/40">{desc}</div>
        </div>
      </div>
    </button>
  );
}

function AffordCard({ result, currency }: { result: AffordResult; currency: string }) {
  const verdict = result.verdict || (result.affordable ? "yes" : "no");
  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
      <Card className={verdictClass(verdict)}>
        <VerdictTitle
          verdict={verdict}
          headline={result.headline || (verdict === "yes" ? "Yes, you can afford it" : "Not affordable on these numbers")}
        />
        <div className="text-white/90 text-2xl font-bold tabular-nums mb-1">{formatCurrency(result.amount, currency)}</div>
        <div className="text-white/40 text-xs mb-4">for "{result.itemName}" in {monthLabel(result.targetMonthKey)}</div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <MiniStat label={result.availableLabel || "Available before buying"} value={formatCurrency(result.projectedAvailable, currency)} />
          {verdict === "yes" ? (
            <MiniStat label="Left after buying" value={formatCurrency(result.surplus, currency)} tone="success" />
          ) : verdict === "no" ? (
            <MiniStat label="Short by" value={formatCurrency(result.shortfall, currency)} tone="danger" />
          ) : (
            <MiniStat label="Spending history" value="Not saved yet" />
          )}
        </div>

        {verdict === "yes" && result.recommendedDate && (
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 mb-3">
            <div className="text-xs text-white/40 mb-0.5">{result.dateCaption || "Buy on payday"}</div>
            <div className="text-white font-semibold">{dateLabel(result.recommendedDate)}</div>
          </div>
        )}

        {result.basis && <p className="text-white/45 text-xs mb-3">{result.basis}</p>}
        <div className="text-white/85 text-sm font-medium mb-2">{result.reasoning}</div>
        <FactsList facts={result.facts} />
        <ExplainedBy source={result.explainedBy} />
      </Card>
    </motion.div>
  );
}

function PredictCard({ result, currency }: { result: PredictResult; currency: string }) {
  const verdict = result.verdict || (result.possible ? "yes" : "no");
  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
      <Card className={verdictClass(verdict)}>
        <VerdictTitle
          verdict={verdict}
          headline={result.headline || (verdict === "yes" ? "Here's the earliest month that fits" : "No date yet")}
        />
        <div className="text-white/90 text-2xl font-bold tabular-nums mb-1">{formatCurrency(result.amount, currency)}</div>
        <div className="text-white/40 text-xs mb-4">for "{result.itemName}"</div>

        {verdict === "yes" && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MiniStat label="Best month" value={result.recommendedMonth ? monthLabel(result.recommendedMonth) : "—"} />
            <MiniStat label="Months from now" value={String(result.monthsFromNow ?? 0)} />
          </div>
        )}

        {verdict === "yes" && result.recommendedDate && (
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 mb-3">
            <div className="text-xs text-white/40 mb-0.5">{result.dateCaption || "Buy on payday"}</div>
            <div className="text-white font-semibold">{dateLabel(result.recommendedDate)}</div>
          </div>
        )}

        {verdict !== "yes" && result.projectedAvailable != null && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MiniStat label={result.availableLabel || "Cash after safety buffer"} value={formatCurrency(result.projectedAvailable, currency)} />
            {verdict === "no" && result.shortfall != null ? (
              <MiniStat label="Short by" value={formatCurrency(result.shortfall, currency)} tone="danger" />
            ) : (
              <MiniStat label="Spending history" value="Not saved yet" />
            )}
          </div>
        )}

        {result.basis && <p className="text-white/45 text-xs mb-3">{result.basis}</p>}
        <div className="text-white/85 text-sm font-medium mb-2">{result.reasoning}</div>
        <FactsList facts={result.facts} />
        <ExplainedBy source={result.explainedBy} />
      </Card>
    </motion.div>
  );
}

function verdictClass(verdict: "yes" | "no" | "uncertain") {
  if (verdict === "yes") return "border-emerald-400/25";
  if (verdict === "uncertain") return "border-amber-400/25";
  return "border-rose-400/25";
}

function VerdictTitle({ verdict, headline }: { verdict: "yes" | "no" | "uncertain"; headline: string }) {
  const icon = verdict === "yes"
    ? <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
    : verdict === "uncertain"
      ? <HelpCircle size={20} className="text-amber-300 shrink-0" />
      : <XCircle size={20} className="text-rose-400 shrink-0" />;
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <div className="text-lg font-bold text-white">{headline}</div>
    </div>
  );
}

function ExplainedBy({ source }: { source?: "ai" | "numbers" }) {
  if (source !== "ai") return null;
  return (
    <p className="mt-3 text-[11px] text-violet-200/70">Explained by AI from these saved figures only. The amounts were not rewritten.</p>
  );
}

function FactsList({ facts }: { facts?: string[] }) {
  if (!facts || facts.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {facts.map((fact, i) => (
        <li key={i} className="flex items-start gap-1 text-white/55 text-sm leading-snug">
          <Dot size={16} className="text-white/25 shrink-0 -mt-0.5" />
          <span>{fact}</span>
        </li>
      ))}
    </ul>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-emerald-300" : tone === "danger" ? "text-rose-300" : "text-white";
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5">
      <div className="text-[11px] text-white/40 mb-0.5">{label}</div>
      <div className={`font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function goalVerdict(goal: Goal): "yes" | "no" | "uncertain" {
  const result = goal.result;
  if (result?.verdict) return result.verdict;
  if (!result) return "no";
  return ("affordable" in result ? result.affordable : result.possible) ? "yes" : "no";
}

function GoalRow({ goal, currency, onDelete }: { goal: Goal; currency: string; onDelete: () => void }) {
  const verdict = goalVerdict(goal);
  const icon = verdict === "yes"
    ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
    : verdict === "uncertain"
      ? <HelpCircle size={16} className="text-amber-300 shrink-0" />
      : <XCircle size={16} className="text-rose-400 shrink-0" />;
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5 transition-colors group">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white/85 truncate">{goal.item_name}</div>
        <div className="text-xs text-white/35">
          {formatCurrency(goal.amount, currency)} · {goal.mode === "specific_month" ? monthLabel(goal.target_month || "") : "flexible timing"}
        </div>
      </div>
      <button onClick={onDelete} className="text-white/20 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-colors shrink-0">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
