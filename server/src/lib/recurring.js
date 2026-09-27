import { ESSENTIAL_CATEGORIES } from "./categorize.js";
import { round2 } from "./budget.js";

export function isRecurringFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function commitmentKey(expense) {
  const desc = String(expense.description || "")
    .trim()
    .toLowerCase();
  return `${expense.category}::${desc || String(expense.category || "").toLowerCase()}`;
}

/**
 * Latest unique monthly commitments (rent, EMI, etc.). If the user logs the
 * same bill again later, the newest amount/category wins.
 */
export function listRecurringCommitments(rows) {
  const latest = new Map();
  const sorted = [...(rows || [])].sort((a, b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return 0;
  });
  for (const row of sorted) {
    if (!isRecurringFlag(row.recurring)) continue;
    const key = commitmentKey(row);
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}

export function recurringTotals(commitments) {
  let total = 0;
  let essential = 0;
  for (const c of commitments || []) {
    const n = Number(c.amount) || 0;
    total += n;
    if (ESSENTIAL_CATEGORIES.has(c.category)) essential += n;
  }
  return { total: round2(total), essential: round2(essential) };
}

export function unpaidRecurring(commitments, expensesInPeriod, periodStartIso) {
  return (commitments || []).filter((c) => {
    if (periodStartIso && c.date >= periodStartIso) return false;
    const key = commitmentKey(c);
    return !(expensesInPeriod || []).some((e) => commitmentKey(e) === key);
  });
}

export function serializeExpense(row, extra = {}) {
  return {
    ...row,
    recurring: isRecurringFlag(row.recurring) ? 1 : 0,
    applied: extra.applied ? 1 : 0,
    ...extra,
  };
}
