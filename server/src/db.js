import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.PLANNER_DATA_DIR
  ? path.resolve(process.env.PLANNER_DATA_DIR)
  : path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "planner.db");
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    monthly_salary REAL NOT NULL DEFAULT 0,
    current_balance REAL NOT NULL DEFAULT 0,
    salary_day INTEGER NOT NULL DEFAULT 1,
    safety_buffer_pct REAL NOT NULL DEFAULT 10,
    daily_plan_enabled INTEGER NOT NULL DEFAULT 1,
    weekly_plan_enabled INTEGER NOT NULL DEFAULT 1,
    daily_budget_override REAL,
    weekly_budget_override REAL,
    currency TEXT NOT NULL DEFAULT '₹',
    onboarded INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    auto_categorized INTEGER NOT NULL DEFAULT 0,
    recurring INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
  CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

  CREATE TABLE IF NOT EXISTS past_months (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL UNIQUE,
    salary REAL NOT NULL DEFAULT 0,
    total_spent REAL NOT NULL DEFAULT 0,
    savings REAL NOT NULL DEFAULT 0,
    notes TEXT,
    category_breakdown TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    amount REAL NOT NULL,
    mode TEXT NOT NULL,
    target_month TEXT,
    status TEXT NOT NULL DEFAULT 'resolved',
    result_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Persisted daily counters so the free-tier AI guardrail survives server
  -- restarts. Keyed by "YYYY-MM-DD|kind" (kind = 'text' | 'image').
  CREATE TABLE IF NOT EXISTS ai_usage (
    key TEXT PRIMARY KEY,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
  );
`);

const expenseCols = db.prepare("PRAGMA table_info(expenses)").all().map((c) => c.name);
if (!expenseCols.includes("recurring")) {
  db.exec("ALTER TABLE expenses ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0");
}

// Ensure a single settings row always exists.
const existing = db.prepare("SELECT id FROM settings WHERE id = 1").get();
if (!existing) {
  db.prepare(
    `INSERT INTO settings (id, monthly_salary, current_balance, salary_day, safety_buffer_pct, daily_plan_enabled, weekly_plan_enabled, currency, onboarded)
     VALUES (1, 0, 0, 1, 10, 1, 1, '₹', 0)`
  ).run();
}

export function nowIso() {
  return new Date().toISOString();
}
