import { Router } from "express";
import { db } from "../db.js";
import { getSettings } from "./settings.js";
import { computeBudget } from "../lib/budget.js";
import { getSalaryCycle, toISODate } from "../lib/dates.js";

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

  const budget = computeBudget(settings, expensesInCycle, today);
  return { settings, budget, expensesInCycle };
}

router.get("/", (_req, res) => {
  const { settings, budget } = getCurrentBudget();
  res.json({ settings, budget });
});

export default router;
