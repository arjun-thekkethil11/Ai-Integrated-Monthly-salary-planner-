import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { getSettings } from "./settings.js";
import { getCurrentBudget } from "./budget.js";
import { estimateAvgMonthlyExpense, checkAffordability, predictPurchaseTiming } from "../lib/planner.js";
import { generatePlannerTip } from "../lib/aiFeatures.js";
import { monthKey } from "../lib/dates.js";

const router = Router();

function getContext() {
  const settings = getSettings();
  const { budget } = getCurrentBudget();
  const today = new Date();

  const pastMonths = db.prepare("SELECT * FROM past_months ORDER BY month ASC").all();
  const currentMonthKey = monthKey(today);
  const currentMonthSpentRow = db
    .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date LIKE ?")
    .get(`${currentMonthKey}%`);

  const currentRunRate = budget.daysElapsed > 0 ? (currentMonthSpentRow.total / budget.daysElapsed) * budget.totalCycleDays : null;

  const avgMonthlyExpense = estimateAvgMonthlyExpense({
    pastMonths,
    currentRunRate,
    salary: settings.monthly_salary || 0,
  });

  return { settings, budget, today, avgMonthlyExpense };
}

// FEATURE A: "I want to buy X this/next month — can I afford it, and when?"
router.post("/afford", async (req, res) => {
  const { itemName = "", amount, targetMonth } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  const { settings, budget, today, avgMonthlyExpense } = getContext();
  const targetMonthKey = targetMonth && /^\d{4}-\d{2}$/.test(targetMonth) ? targetMonth : monthKey(today);
  const finalItemName = itemName || "Unnamed purchase";

  const result = checkAffordability({ amount: amt, targetMonthKey, today, budget, settings, avgMonthlyExpense });
  const aiTip = await generatePlannerTip({ kind: "afford", itemName: finalItemName, amount: amt, result, settings });

  const id = randomUUID();
  db.prepare(
    `INSERT INTO goals (id, item_name, amount, mode, target_month, status, result_json) VALUES (?, ?, ?, 'specific_month', ?, 'resolved', ?)`
  ).run(id, finalItemName, amt, targetMonthKey, JSON.stringify(result));

  res.json({ id, itemName: finalItemName, amount: amt, targetMonthKey, ...result, avgMonthlyExpense, aiTip });
});

// FEATURE B: "I want to buy X — when's the right time?" (system picks the timing)
router.post("/predict", async (req, res) => {
  const { itemName = "", amount } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  const { settings, budget, today, avgMonthlyExpense } = getContext();
  const finalItemName = itemName || "Unnamed item";

  const result = predictPurchaseTiming({ amount: amt, today, budget, settings, avgMonthlyExpense });
  const aiTip = await generatePlannerTip({ kind: "predict", itemName: finalItemName, amount: amt, result, settings });

  const id = randomUUID();
  db.prepare(
    `INSERT INTO goals (id, item_name, amount, mode, target_month, status, result_json) VALUES (?, ?, ?, 'flexible', NULL, 'resolved', ?)`
  ).run(id, finalItemName, amt, JSON.stringify(result));

  res.json({ id, itemName: finalItemName, amount: amt, ...result, avgMonthlyExpense, aiTip });
});

router.get("/goals", (_req, res) => {
  const rows = db.prepare("SELECT * FROM goals ORDER BY created_at DESC LIMIT 50").all();
  res.json(
    rows.map((r) => ({
      ...r,
      result: r.result_json ? JSON.parse(r.result_json) : null,
    }))
  );
});

router.delete("/goals/:id", (req, res) => {
  db.prepare("DELETE FROM goals WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
