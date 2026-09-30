import { db } from "../db.js";

/**
 * Move the saved current balance by `delta` (negative when money is spent,
 * positive when an expense is removed or reduced). Rounded to paise so
 * repeated adds and deletes don't drift.
 */
export function adjustCurrentBalance(delta) {
  const d = Number(delta);
  if (!Number.isFinite(d) || d === 0) return;
  const row = db.prepare("SELECT current_balance FROM settings WHERE id = 1").get();
  const next = Math.round(((Number(row?.current_balance) || 0) + d) * 100) / 100;
  db.prepare("UPDATE settings SET current_balance = ?, updated_at = datetime('now') WHERE id = 1").run(next);
}
