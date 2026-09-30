import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { getSettings } from "../routes/settings.js";
import { serializeExpense } from "./recurring.js";

const MAX_ROWS = 5000;

export function readSnapshot() {
  const settings = getSettings();
  const expenses = db
    .prepare("SELECT * FROM expenses ORDER BY date DESC, created_at DESC")
    .all()
    .map((row) => serializeExpense(row));
  const pastMonths = db
    .prepare("SELECT * FROM past_months ORDER BY month DESC")
    .all()
    .map((row) => ({
      ...row,
      category_breakdown: parseJson(row.category_breakdown),
    }));
  const goals = db
    .prepare(
      "SELECT id, item_name, amount, mode, target_month, status, result_json, created_at FROM goals ORDER BY created_at DESC"
    )
    .all();

  return { settings, expenses, pastMonths, goals };
}

export function restoreSnapshot(body) {
  const settings = body?.settings;
  const expenses = asArray(body?.expenses);
  const pastMonths = asArray(body?.pastMonths);
  const goals = asArray(body?.goals);
  if (!settings || typeof settings !== "object" || !expenses || !pastMonths || !goals) {
    const error = new Error("snapshot must include settings, expenses, pastMonths, and goals");
    error.status = 400;
    throw error;
  }

  const nextSettings = normalizeSettings(settings);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `UPDATE settings SET monthly_salary = ?, current_balance = ?, salary_day = ?, safety_buffer_pct = ?,
        daily_plan_enabled = ?, weekly_plan_enabled = ?, daily_budget_override = ?, weekly_budget_override = ?,
        currency = ?, onboarded = ?, updated_at = ? WHERE id = 1`
    ).run(
      nextSettings.monthly_salary,
      nextSettings.current_balance,
      nextSettings.salary_day,
      nextSettings.safety_buffer_pct,
      nextSettings.daily_plan_enabled,
      nextSettings.weekly_plan_enabled,
      nextSettings.daily_budget_override,
      nextSettings.weekly_budget_override,
      nextSettings.currency,
      nextSettings.onboarded,
      nextSettings.updated_at
    );

    db.prepare("DELETE FROM expenses").run();
    const insertExpense = db.prepare(
      `INSERT INTO expenses (id, amount, category, description, date, auto_categorized, recurring, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of expenses) {
      const expense = normalizeExpense(row);
      if (!expense) continue;
      insertExpense.run(
        expense.id,
        expense.amount,
        expense.category,
        expense.description,
        expense.date,
        expense.auto_categorized,
        expense.recurring,
        expense.created_at
      );
    }

    db.prepare("DELETE FROM past_months").run();
    const insertMonth = db.prepare(
      `INSERT INTO past_months (id, month, salary, total_spent, savings, notes, category_breakdown, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of pastMonths) {
      const month = normalizePastMonth(row);
      if (!month) continue;
      insertMonth.run(
        month.id,
        month.month,
        month.salary,
        month.total_spent,
        month.savings,
        month.notes,
        month.category_breakdown,
        month.created_at
      );
    }

    db.prepare("DELETE FROM goals").run();
    const insertGoal = db.prepare(
      `INSERT INTO goals (id, item_name, amount, mode, target_month, status, result_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of goals) {
      const goal = normalizeGoal(row);
      if (!goal) continue;
      insertGoal.run(
        goal.id,
        goal.item_name,
        goal.amount,
        goal.mode,
        goal.target_month,
        goal.status,
        goal.result_json,
        goal.created_at
      );
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return readSnapshot();
}

function asArray(value) {
  if (!Array.isArray(value)) return null;
  return value.slice(0, MAX_ROWS);
}

function normalizeSettings(settings) {
  return {
    monthly_salary: num(settings.monthly_salary, 0),
    current_balance: num(settings.current_balance, 0),
    salary_day: clampInt(settings.salary_day, 1, 31, 1),
    safety_buffer_pct: num(settings.safety_buffer_pct, 10),
    daily_plan_enabled: settings.daily_plan_enabled === false ? 0 : 1,
    weekly_plan_enabled: settings.weekly_plan_enabled === false ? 0 : 1,
    daily_budget_override: nullableNum(settings.daily_budget_override),
    weekly_budget_override: nullableNum(settings.weekly_budget_override),
    currency: String(settings.currency || "₹").slice(0, 8),
    onboarded: settings.onboarded === false ? 0 : 1,
    updated_at: typeof settings.updated_at === "string" && settings.updated_at ? settings.updated_at : new Date().toISOString(),
  };
}

function normalizeExpense(row) {
  if (!row || row.applied || String(row.id || "").startsWith("applied-")) return null;
  const amount = Number(row.amount);
  const date = String(row.date || "");
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    id: String(row.id || randomUUID()),
    amount,
    category: String(row.category || "other").slice(0, 80),
    description: String(row.description || "").slice(0, 500),
    date,
    auto_categorized: row.auto_categorized ? 1 : 0,
    recurring: row.recurring ? 1 : 0,
    created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
  };
}

function normalizePastMonth(row) {
  const month = String(row?.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const salary = num(row.salary, 0);
  const totalSpent = num(row.total_spent, 0);
  const breakdown = row.category_breakdown;
  return {
    id: String(row.id || randomUUID()),
    month,
    salary,
    total_spent: totalSpent,
    savings: num(row.savings, salary - totalSpent),
    notes: row.notes ? String(row.notes).slice(0, 2000) : null,
    category_breakdown: breakdown ? JSON.stringify(breakdown) : null,
    created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
  };
}

function normalizeGoal(row) {
  const amount = Number(row?.amount);
  const name = String(row?.item_name || "").trim();
  if (!name || !Number.isFinite(amount) || amount <= 0) return null;
  const mode = row.mode === "flexible" ? "flexible" : "specific_month";
  let resultJson = null;
  if (typeof row.result_json === "string") resultJson = row.result_json;
  else if (row.result_json && typeof row.result_json === "object") resultJson = JSON.stringify(row.result_json);
  else if (row.result && typeof row.result === "object") resultJson = JSON.stringify(row.result);
  return {
    id: String(row.id || randomUUID()),
    item_name: name.slice(0, 200),
    amount,
    mode,
    target_month: typeof row.target_month === "string" ? row.target_month : null,
    status: String(row.status || "resolved").slice(0, 40),
    result_json: resultJson,
    created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
  };
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNum(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
