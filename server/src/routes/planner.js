import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { getCurrentBudget } from "./budget.js";
import { decideAffordability, decideTiming, applyPlannerExplanation } from "../lib/plannerDecision.js";
import { explainPlannerDecision } from "../lib/aiFeatures.js";
import { monthKey, addDays, toISODate } from "../lib/dates.js";

const router = Router();

function getInputs() {
  const { settings, budget, recurringCommitments } = getCurrentBudget();
  const today = new Date();
  const since = toISODate(addDays(today, -180));
  const pastMonths = db.prepare("SELECT * FROM past_months ORDER BY month ASC").all();
  const expenses = db.prepare("SELECT amount, category, description, date FROM expenses WHERE date >= ? ORDER BY date ASC").all(since);
  return { settings, budget, today, pastMonths, expenses, recurringCommitments };
}

async function withExplanation(decision) {
  const advice = await explainPlannerDecision(decision);
  return applyPlannerExplanation(decision, advice);
}

// FEATURE A: "I want to buy X this/next month — can I afford it, and when?"
router.post("/afford", async (req, res) => {
  const { itemName = "", amount, targetMonth } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  const inputs = getInputs();
  const targetMonthKey = targetMonth && /^\d{4}-\d{2}$/.test(targetMonth) ? targetMonth : monthKey(inputs.today);
  const finalItemName = itemName || "Unnamed purchase";

  const decision = decideAffordability({ ...inputs, amount: amt, itemName: finalItemName, targetMonthKey });
  const result = await withExplanation(decision);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO goals (id, item_name, amount, mode, target_month, status, result_json) VALUES (?, ?, ?, 'specific_month', ?, 'resolved', ?)`
  ).run(id, finalItemName, amt, targetMonthKey, JSON.stringify(result));

  res.json({ id, itemName: finalItemName, amount: amt, targetMonthKey, ...result });
});

// FEATURE B: "I want to buy X — when's the right time?" (system picks the timing)
router.post("/predict", async (req, res) => {
  const { itemName = "", amount } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  const inputs = getInputs();
  const finalItemName = itemName || "Unnamed item";

  const decision = decideTiming({ ...inputs, amount: amt, itemName: finalItemName });
  const result = await withExplanation(decision);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO goals (id, item_name, amount, mode, target_month, status, result_json) VALUES (?, ?, ?, 'flexible', NULL, 'resolved', ?)`
  ).run(id, finalItemName, amt, JSON.stringify(result));

  res.json({ id, itemName: finalItemName, amount: amt, ...result });
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
