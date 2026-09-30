import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings2, Wallet, TrendingDown, CalendarRange, Sun, CalendarDays, Sparkles, ArrowRight, Plus, Pencil, Check, X, PartyPopper } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { api } from "../api/client";
import { Card, SectionTitle, Pill, ProgressBar, Button } from "../components/ui";
import { SettingsModal } from "../components/SettingsModal";
import { RemindersCard } from "../components/RemindersCard";
import { formatCurrency, dateLabel } from "../lib/format";
import type { AnalyticsResponse, Expense } from "../types";

export function Dashboard() {
  const settings = useAppStore((s) => s.settings);
  const budget = useAppStore((s) => s.budget);
  const refresh = useAppStore((s) => s.refresh);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);

  async function loadExtras() {
    const [a, exp] = await Promise.all([api.getAnalytics(3), api.getExpenses({ limit: 5 })]);
    setAnalytics(a);
    setRecentExpenses(exp);
  }

  useEffect(() => {
    loadExtras();
  }, []);

  if (!settings || !budget) return null;

  const cur = settings.currency;
  const cycleProgressPct = (budget.daysElapsed / budget.totalCycleDays) * 100;
  const dailyTone = budget.dailyRemainingToday != null && budget.dailyRemainingToday < 0 ? "danger" : "default";
  const weeklyTone = budget.weeklyRemainingThisWeek != null && budget.weeklyRemainingThisWeek < 0 ? "danger" : "default";

  const greeting = getGreeting();

  return (
    <div className="space-y-6">
      {showSettings && <SettingsModal onClose={() => { setShowSettings(false); loadExtras(); }} />}

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            {greeting}, let's check your <span className="gradient-text">money</span>.
          </h1>
          <p className="text-white/45 text-sm mt-1">
            Cycle: {dateLabel(budget.cycleStart)} → {dateLabel(budget.cycleEnd)} · Day {budget.daysElapsed} of {budget.totalCycleDays}
          </p>
        </div>
        <Button variant="ghost" onClick={() => setShowSettings(true)}>
          <Settings2 size={15} /> Edit salary & balance
        </Button>
      </div>

      {/* Top stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Wallet} label="Monthly salary" value={formatCurrency(settings.monthly_salary, cur)} accent="from-violet-500 to-purple-400" />
        <StatCard icon={TrendingDown} label="Current balance" value={formatCurrency(settings.current_balance, cur)} accent="from-cyan-500 to-blue-400" />
        <StatCard icon={CalendarRange} label="Spent this cycle" value={formatCurrency(budget.spentThisCycle, cur)} accent="from-rose-500 to-orange-400" />
        <StatCard icon={Sparkles} label="Days to payday" value={`${budget.daysRemaining}`} accent="from-emerald-500 to-teal-400" />
      </div>

      {/* Cycle progress */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/60">Salary cycle progress</span>
          <span className="text-sm text-white/40">{Math.round(cycleProgressPct)}%</span>
        </div>
        <ProgressBar value={cycleProgressPct} />
        <div className="flex items-center justify-between mt-2 text-xs text-white/35">
          <span>{dateLabel(budget.cycleStart)}</span>
          <span>Next payday · {dateLabel(budget.nextCycleStart)}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {budget.unpaidRecurringThisCycle > 0 && (
            <p className="text-xs text-cyan-300/70">
              {formatCurrency(budget.unpaidRecurringThisCycle, cur)} reserved for monthly bills (rent, EMI, etc.)
            </p>
          )}
          {budget.savingsGoalAmount > 0 && (
            <p className="text-xs text-emerald-300/70">
              {formatCurrency(budget.savingsGoalAmount, cur)} set aside toward your monthly savings goal
            </p>
          )}
        </div>
      </Card>

      {/* Allowance cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {settings.daily_plan_enabled && (
          <DailyOrWeeklyCard
            icon={Sun}
            iconBg="bg-amber-500/15"
            iconColor="text-amber-300"
            title="Daily plan"
            subtitle="what you can spend today"
            budgetValue={budget.dailyBudget}
            spent={budget.spentToday}
            remaining={budget.dailyRemainingToday}
            spentLabel="Spent today"
            remainingLabelSuffix="left today"
            tone={dailyTone}
            currency={cur}
            editable
            overrideValue={settings.daily_budget_override}
            onSaveOverride={async (value) => {
              await api.updateSettings({ daily_budget_override: value });
              refresh();
            }}
          />
        )}

        {settings.weekly_plan_enabled && (
          <DailyOrWeeklyCard
            icon={CalendarDays}
            iconBg="bg-cyan-500/15"
            iconColor="text-cyan-300"
            title="Weekly plan"
            subtitle="what you can spend this week"
            budgetValue={budget.weeklyBudget}
            spent={budget.spentThisWeek}
            remaining={budget.weeklyRemainingThisWeek}
            spentLabel="Spent this week"
            remainingLabelSuffix="left this week"
            tone={weeklyTone}
            currency={cur}
          />
        )}

        {!settings.daily_plan_enabled && !settings.weekly_plan_enabled && (
          <Card className="md:col-span-2 text-center py-8">
            <p className="text-white/50 text-sm">
              Daily & weekly plans are turned off. Enable them from{" "}
              <button onClick={() => setShowSettings(true)} className="text-violet-300 underline">
                settings
              </button>{" "}
              to get bite-sized spending targets.
            </p>
          </Card>
        )}
      </div>

      {/* Reminders + recent activity */}
      <div className="grid md:grid-cols-2 gap-4 items-start">
        <RemindersCard
          onChanged={() => {
            refresh();
            loadExtras();
          }}
        />

        <Card>
          <SectionTitle
            subtitle="Latest logged expenses"
            action={
              <Link to="/expenses" className="text-xs text-violet-300 flex items-center gap-1 hover:underline">
                View all <ArrowRight size={12} />
              </Link>
            }
          >
            Recent activity
          </SectionTitle>
          {recentExpenses.length === 0 ? (
            <EmptyMini text="No expenses yet — add your first one from the Expenses tab!" />
          ) : (
            <div className="space-y-2.5">
              {recentExpenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="text-white/85 truncate">{e.description || e.category}</div>
                    <div className="text-white/35 text-xs">
                      {e.category} · {dateLabel(e.date)}
                    </div>
                  </div>
                  <div className="text-white/90 font-medium tabular-nums shrink-0 ml-3">{formatCurrency(e.amount, cur)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {analytics && analytics.insights.length > 0 && (
        <Card>
          <SectionTitle
            subtitle="Tailored to your recent spending"
            action={
              <Link to="/analytics" className="text-xs text-violet-300 flex items-center gap-1 hover:underline">
                Full analytics <ArrowRight size={12} />
              </Link>
            }
          >
            Smart insight
          </SectionTitle>
          <InsightPreview insight={analytics.insights[0]} />
        </Card>
      )}

      <Card className="bg-gradient-to-br from-violet-600/20 to-cyan-500/10 border-violet-400/20" strong>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-white font-semibold text-base">
              <Sparkles size={16} className="text-violet-300" /> Thinking of buying something?
            </div>
            <p className="text-white/55 text-sm mt-1 max-w-md">
              Tell the Purchase Planner what you want and how much it costs — it'll tell you if, and exactly when, you can buy it comfortably.
            </p>
          </div>
          <Link to="/planner">
            <Button>
              <Plus size={15} /> Plan a purchase
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

function DailyOrWeeklyCard({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  budgetValue,
  spent,
  remaining,
  spentLabel,
  remainingLabelSuffix,
  tone,
  currency,
  editable,
  overrideValue,
  onSaveOverride,
}: {
  icon: any;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  budgetValue: number | null;
  spent: number;
  remaining: number | null;
  spentLabel: string;
  remainingLabelSuffix: string;
  tone: "default" | "danger";
  currency: string;
  editable?: boolean;
  overrideValue?: number | null;
  onSaveOverride?: (value: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(overrideValue != null ? String(overrideValue) : "");
  const [saving, setSaving] = useState(false);
  const good = remaining == null || remaining >= 0;
  const pct = budgetValue ? (spent / budgetValue) * 100 : 0;

  async function handleSave() {
    if (!onSaveOverride) return;
    setSaving(true);
    try {
      const n = draft.trim() === "" ? null : Number(draft);
      await onSaveOverride(Number.isFinite(n as number) || n === null ? n : null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="relative overflow-hidden">
      <SavingsBurst tone={good ? "good" : "bad"} />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
            <Icon size={16} className={iconColor} />
          </div>
          <div>
            <div className="text-sm font-semibold text-white/90">{title}</div>
            <div className="text-[11px] text-white/40">{subtitle}</div>
          </div>
        </div>
        {editable && !editing && (
          <button
            onClick={() => {
              setDraft(overrideValue != null ? String(overrideValue) : "");
              setEditing(true);
            }}
            title="Set your own daily target"
            className="text-white/25 hover:text-violet-300 transition-colors p-1"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 mb-3">
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. 300 — blank = auto"
              className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
            <button onClick={handleSave} disabled={saving} className="text-emerald-400 hover:text-emerald-300 p-1.5 rounded-lg bg-emerald-500/10">
              <Check size={15} />
            </button>
            <button onClick={() => setEditing(false)} className="text-white/40 hover:text-white/70 p-1.5 rounded-lg bg-white/5">
              <X size={15} />
            </button>
          </motion.div>
        ) : (
          <motion.div key={`amount-${good}`} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="text-3xl font-bold text-white tabular-nums mb-3">
            {formatCurrency(budgetValue, currency)}
            {editable && overrideValue != null && <span className="text-[11px] font-normal text-violet-300/70 ml-2">your target</span>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-1">
        <div className="flex justify-between text-xs text-white/45 mb-1.5">
          <span>
            {spentLabel}: {formatCurrency(spent, currency)}
          </span>
          <span>{budgetValue ? Math.round(pct) : 0}%</span>
        </div>
        <ProgressBar value={pct} tone={tone === "danger" ? "danger" : "default"} />
      </div>

      <motion.div key={`pill-${good}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 inline-block">
        <Pill tone={good ? "success" : "danger"}>
          {!good
            ? `Over by ${formatCurrency(Math.abs(remaining as number), currency)}`
            : `${formatCurrency(remaining, currency)} ${remainingLabelSuffix}`}
        </Pill>
      </motion.div>
    </Card>
  );
}

/** Decorative-only feedback: a little rising sparkle burst when you're on
 * track, a quick shake when you're over. Replays whenever the tone flips —
 * not on every render — so it stays a nice touch, not a distraction. */
function SavingsBurst({ tone }: { tone: "good" | "bad" }) {
  if (tone === "bad") {
    return (
      <motion.div
        key="bad"
        className="absolute inset-0 rounded-2xl pointer-events-none"
        initial={{ x: 0 }}
        animate={{ x: [0, -6, 6, -4, 4, -2, 2, 0], boxShadow: ["0 0 0 rgba(244,63,94,0)", "0 0 24px rgba(244,63,94,0.25)", "0 0 0 rgba(244,63,94,0)"] }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      />
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`good-${i}`}
          className="absolute text-emerald-300"
          style={{ left: `${18 + i * 30}%`, bottom: 8 }}
          initial={{ opacity: 0, y: 0, scale: 0.5 }}
          animate={{ opacity: [0, 1, 0], y: -46, scale: 1 }}
          transition={{ duration: 1.3, delay: i * 0.12, ease: "easeOut" }}
        >
          <PartyPopper size={13} />
        </motion.div>
      ))}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute -right-6 -top-6 w-20 h-20 rounded-full bg-gradient-to-br ${accent} opacity-15 blur-xl`} />
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center mb-3 shadow-lg`}>
        <Icon size={16} className="text-white" />
      </div>
      <div className="text-[11px] text-white/45 mb-1">{label}</div>
      <div className="text-xl font-bold text-white tabular-nums truncate">{value}</div>
    </Card>
  );
}

function EmptyMini({ text }: { text: string }) {
  return <div className="text-center py-6 text-sm text-white/35">{text}</div>;
}

function InsightPreview({ insight }: { insight: { type: string; title: string; message: string } }) {
  const toneMap: Record<string, string> = {
    info: "border-cyan-400/30 bg-cyan-500/5",
    success: "border-emerald-400/30 bg-emerald-500/5",
    warning: "border-amber-400/30 bg-amber-500/5",
    danger: "border-rose-400/30 bg-rose-500/5",
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl border p-4 ${toneMap[insight.type]}`}>
      <div className="font-medium text-white/90 text-sm mb-1">{insight.title}</div>
      <div className="text-white/55 text-sm leading-relaxed">{insight.message}</div>
    </motion.div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
