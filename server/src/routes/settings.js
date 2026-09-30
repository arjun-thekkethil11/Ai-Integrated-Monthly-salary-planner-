import { Router } from "express";
import { db } from "../db.js";

const router = Router();

function getSettings() {
  const row = db.prepare("SELECT * FROM settings WHERE id = 1").get();
  return {
    ...row,
    daily_plan_enabled: !!row.daily_plan_enabled,
    weekly_plan_enabled: !!row.weekly_plan_enabled,
    onboarded: !!row.onboarded,
  };
}

router.get("/", (_req, res) => {
  res.json(getSettings());
});

router.put("/", (req, res) => {
  const current = getSettings();
  const body = req.body || {};

  const next = {
    monthly_salary: numOr(body.monthly_salary, current.monthly_salary),
    current_balance: numOr(body.current_balance, current.current_balance),
    salary_day: clampInt(numOr(body.salary_day, current.salary_day), 1, 31),
    safety_buffer_pct: numOr(body.safety_buffer_pct, current.safety_buffer_pct),
    monthly_savings_goal: Math.max(0, numOr(body.monthly_savings_goal, current.monthly_savings_goal)),
    daily_plan_enabled: body.daily_plan_enabled != null ? (body.daily_plan_enabled ? 1 : 0) : (current.daily_plan_enabled ? 1 : 0),
    weekly_plan_enabled: body.weekly_plan_enabled != null ? (body.weekly_plan_enabled ? 1 : 0) : (current.weekly_plan_enabled ? 1 : 0),
    daily_budget_override: body.daily_budget_override != null ? Number(body.daily_budget_override) || null : current.daily_budget_override,
    weekly_budget_override: body.weekly_budget_override != null ? Number(body.weekly_budget_override) || null : current.weekly_budget_override,
    currency: body.currency || current.currency,
    onboarded: 1,
  };

  db.prepare(
    `UPDATE settings SET monthly_salary = ?, current_balance = ?, salary_day = ?, safety_buffer_pct = ?, monthly_savings_goal = ?,
      daily_plan_enabled = ?, weekly_plan_enabled = ?, daily_budget_override = ?, weekly_budget_override = ?,
      currency = ?, onboarded = ?, updated_at = datetime('now') WHERE id = 1`
  ).run(
    next.monthly_salary,
    next.current_balance,
    next.salary_day,
    next.safety_buffer_pct,
    next.monthly_savings_goal,
    next.daily_plan_enabled,
    next.weekly_plan_enabled,
    next.daily_budget_override,
    next.weekly_budget_override,
    next.currency,
    next.onboarded
  );

  res.json(getSettings());
});

function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export { getSettings };
export default router;
