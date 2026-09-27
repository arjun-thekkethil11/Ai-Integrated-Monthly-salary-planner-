import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Settings2, Wallet, TrendingDown, CalendarRange, Sun, CalendarDays, Sparkles, ArrowRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { api } from "../api/client";
import { Card, SectionTitle, Pill, ProgressBar, Button } from "../components/ui";
import { SettingsModal } from "../components/SettingsModal";
import { QuickAddExpense } from "../components/QuickAddExpense";
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
      </Card>

      {/* Allowance cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {settings.daily_plan_enabled && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Sun size={16} className="text-amber-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white/90">Daily plan</div>
                <div className="text-[11px] text-white/40">what you can spend today</div>
              </div>
            </div>
            <div className="text-3xl font-bold text-white tabular-nums">{formatCurrency(budget.dailyBudget, cur)}</div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-white/45 mb-1.5">
                <span>Spent today: {formatCurrency(budget.spentToday, cur)}</span>
                <span>{budget.dailyBudget ? Math.round((budget.spentToday / budget.dailyBudget) * 100) : 0}%</span>
              </div>
              <ProgressBar value={budget.dailyBudget ? (budget.spentToday / budget.dailyBudget) * 100 : 0} tone={dailyTone === "danger" ? "danger" : "default"} />
            </div>
            <Pill tone={dailyTone === "danger" ? "danger" : "success"}>
              {budget.dailyRemainingToday != null && budget.dailyRemainingToday < 0
                ? `Over by ${formatCurrency(Math.abs(budget.dailyRemainingToday), cur)}`
                : `${formatCurrency(budget.dailyRemainingToday, cur)} left today`}
            </Pill>
          </Card>
        )}

        {settings.weekly_plan_enabled && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                <CalendarDays size={16} className="text-cyan-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white/90">Weekly plan</div>
                <div className="text-[11px] text-white/40">what you can spend this week</div>
              </div>
            </div>
            <div className="text-3xl font-bold text-white tabular-nums">{formatCurrency(budget.weeklyBudget, cur)}</div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-white/45 mb-1.5">
                <span>Spent this week: {formatCurrency(budget.spentThisWeek, cur)}</span>
                <span>{budget.weeklyBudget ? Math.round((budget.spentThisWeek / budget.weeklyBudget) * 100) : 0}%</span>
              </div>
              <ProgressBar value={budget.weeklyBudget ? (budget.spentThisWeek / budget.weeklyBudget) * 100 : 0} tone={weeklyTone === "danger" ? "danger" : "default"} />
            </div>
            <Pill tone={weeklyTone === "danger" ? "danger" : "success"}>
              {budget.weeklyRemainingThisWeek != null && budget.weeklyRemainingThisWeek < 0
                ? `Over by ${formatCurrency(Math.abs(budget.weeklyRemainingThisWeek), cur)}`
                : `${formatCurrency(budget.weeklyRemainingThisWeek, cur)} left this week`}
            </Pill>
          </Card>
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

      {/* Quick add + recent + insight teaser */}
      <div className="grid md:grid-cols-2 gap-4 items-start">
        <QuickAddExpense
          onAdded={() => {
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
            <EmptyMini text="No expenses yet — add your first one!" />
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
