import { Router } from "express";
import { db } from "../db.js";
import { getSettings } from "./settings.js";
import { getCurrentBudget } from "./budget.js";
import { categoryBreakdown, categoryBreakdownWithPastMonths, cycleSplit, monthlyTrend, generateInsights } from "../lib/insights.js";
import { monthKey, addDays, toISODate } from "../lib/dates.js";
import { round2 } from "../lib/budget.js";

const router = Router();

router.get("/", (req, res) => {
  const settings = getSettings();
  const { budget, expensesInCycle, unpaidRecurring: unpaid } = getCurrentBudget();

  const rangeMonths = Math.max(1, Math.min(24, Number(req.query.rangeMonths) || 6));
  const since = toISODate(addDays(new Date(), -rangeMonths * 31));
  const recentExpenses = db.prepare("SELECT * FROM expenses WHERE date >= ? ORDER BY date ASC").all(since);

  const breakdown = categoryBreakdown([...expensesInCycle, ...(unpaid || [])]);
  const breakdownRecent = categoryBreakdown(recentExpenses);
  const split = cycleSplit(settings, budget);

  const pastMonths = db.prepare("SELECT * FROM past_months ORDER BY month ASC").all();
  // Folds in category totals scanned from monthly-summary screenshots too,
  // so that data doesn't just sit unused in the database.
  const breakdownAllTime = categoryBreakdownWithPastMonths(recentExpenses, pastMonths);
  const currentMonthKey = monthKey(new Date());
  const currentMonthPrefix = `${currentMonthKey}%`;
  const currentMonthSpentRow = db
    .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date LIKE ?")
    .get(currentMonthPrefix);
  const currentMonthSpent = round2(currentMonthSpentRow.total);

  const trend = monthlyTrend(pastMonths, currentMonthKey, settings.monthly_salary, currentMonthSpent);

  const totalExpenseCount = db.prepare("SELECT COUNT(*) as c FROM expenses").get().c;

  const insights = generateInsights({
    breakdown,
    salary: settings.monthly_salary,
    budget,
    trend,
    expenseCount: totalExpenseCount,
    currency: settings.currency || "₹",
    currentBalance: settings.current_balance || 0,
  });

  res.json({
    breakdown,
    breakdownRecent,
    breakdownAllTime,
    cycleSplit: split,
    trend,
    insights,
    budget,
    currentMonthSpent,
  });
});

export default router;
