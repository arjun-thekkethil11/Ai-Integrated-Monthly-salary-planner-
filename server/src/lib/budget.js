import { getSalaryCycle, daysBetween, formatISO } from "./dates.js";

/**
 * Core budgeting engine: figures out, from the current balance and where the
 * user is inside their salary cycle, how much they can safely spend per day
 * and per week, plus how they're tracking against any custom daily/weekly
 * plan they've opted into.
 */
export function computeBudget(settings, expensesInCycle, today = new Date()) {
  const { cycleStart, cycleEnd, nextCycleStart } = getSalaryCycle(today, settings.salary_day || 1);

  const totalCycleDays = daysBetween(cycleStart, nextCycleStart);
  const daysElapsed = Math.min(totalCycleDays, Math.max(1, daysBetween(cycleStart, today) + 1));
  const daysRemaining = Math.max(1, daysBetween(today, nextCycleStart));
  const weeksRemaining = Math.max(daysRemaining / 7, 1 / 7);

  const safetyBufferAmount = Math.max(0, (settings.safety_buffer_pct || 0) / 100 * (settings.monthly_salary || 0));
  const spendableBalance = Math.max(0, (settings.current_balance || 0) - safetyBufferAmount);

  const dailyAllowance = spendableBalance / daysRemaining;
  const weeklyAllowance = spendableBalance / weeksRemaining;

  const todayIso = formatISO(today);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  let spentThisCycle = 0;
  let spentToday = 0;
  let spentThisWeek = 0;
  for (const e of expensesInCycle) {
    spentThisCycle += e.amount;
    if (e.date === todayIso) spentToday += e.amount;
    if (new Date(e.date) >= startOfWeek) spentThisWeek += e.amount;
  }

  const dailyBudget = settings.daily_plan_enabled
    ? (settings.daily_budget_override && settings.daily_budget_override > 0 ? settings.daily_budget_override : dailyAllowance)
    : null;
  const weeklyBudget = settings.weekly_plan_enabled
    ? (settings.weekly_budget_override && settings.weekly_budget_override > 0 ? settings.weekly_budget_override : weeklyAllowance)
    : null;

  const projectedEndOfCycleBalance = settings.current_balance - (spentThisCycle > 0 ? (spentThisCycle / daysElapsed) * (daysElapsed + daysRemaining - 1) : 0);

  return {
    cycleStart: formatISO(cycleStart),
    cycleEnd: formatISO(cycleEnd),
    nextCycleStart: formatISO(nextCycleStart),
    totalCycleDays,
    daysElapsed,
    daysRemaining,
    weeksRemaining: Math.round(weeksRemaining * 10) / 10,
    safetyBufferAmount: round2(safetyBufferAmount),
    spendableBalance: round2(spendableBalance),
    dailyAllowance: round2(dailyAllowance),
    weeklyAllowance: round2(weeklyAllowance),
    dailyBudget: dailyBudget != null ? round2(dailyBudget) : null,
    weeklyBudget: weeklyBudget != null ? round2(weeklyBudget) : null,
    spentThisCycle: round2(spentThisCycle),
    spentToday: round2(spentToday),
    spentThisWeek: round2(spentThisWeek),
    dailyRemainingToday: dailyBudget != null ? round2(dailyBudget - spentToday) : null,
    weeklyRemainingThisWeek: weeklyBudget != null ? round2(weeklyBudget - spentThisWeek) : null,
    projectedEndOfCycleBalance: round2(projectedEndOfCycleBalance),
    burnRatePerDay: round2(daysElapsed > 0 ? spentThisCycle / daysElapsed : 0),
  };
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
