import { Router } from "express";
import { db } from "../db.js";
import { getSettings } from "./settings.js";
import { computeBudget } from "../lib/budget.js";
import { getSalaryCycle, toISODate } from "../lib/dates.js";
import { listRecurringCommitments, unpaidRecurring, recurringTotals } from "../lib/recurring.js";

const router = Router();

export function getCurrentBudget() {
  const settings = getSettings();
  const today = new Date();
  const { cycleStart, nextCycleStart } = getSalaryCycle(today, settings.salary_day || 1);
  const startIso = toISODate(cycleStart);
  const endIso = toISODate(nextCycleStart);

  const expensesInCycle = db
    .prepare("SELECT * FROM expenses WHERE date >= ? AND date < ? ORDER BY date ASC")
    .all(startIso, endIso);

  const commitments = listRecurringCommitments(db.prepare("SELECT * FROM expenses WHERE recurring = 1").all());
  const unpaid = unpaidRecurring(commitments, expensesInCycle, startIso);
  const unpaidTotal = unpaid.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  const budget = computeBudget(settings, expensesInCycle, today, unpaidTotal);
  budget.recurringMonthlyTotal = recurringTotals(commitments).total;
  return { settings, budget, expensesInCycle, recurringCommitments: commitments, unpaidRecurring: unpaid };
}

router.get("/", (_req, res) => {
  const { settings, budget } = getCurrentBudget();
  res.json({ settings, budget });
});

export default router;
