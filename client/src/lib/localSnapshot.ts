import type { Expense, Goal, PastMonth, Settings } from "../types";

const STORAGE_KEY = "finly.snapshot.v1";

export interface DataSnapshot {
  settings: Settings;
  expenses: Expense[];
  pastMonths: PastMonth[];
  goals: Goal[];
}

interface StoredSnapshot {
  savedAt: string;
  snapshot: DataSnapshot;
}

export function readLocalSnapshot(): DataSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSnapshot | DataSnapshot;
    if (parsed && "snapshot" in parsed && parsed.snapshot?.settings) return parsed.snapshot;
    if (parsed && "settings" in parsed && parsed.settings) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function writeLocalSnapshot(snapshot: DataSnapshot) {
  try {
    const stored: StoredSnapshot = { savedAt: new Date().toISOString(), snapshot };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Private mode or a full browser store. The server copy still updates.
  }
}

export function snapshotHasUserData(snapshot: DataSnapshot | null): boolean {
  if (!snapshot?.settings) return false;
  const settings = snapshot.settings;
  if (settings.onboarded) return true;
  if (Number(settings.monthly_salary) > 0 || Number(settings.current_balance) > 0) return true;
  if (Number(settings.salary_day) > 1) return true;
  if (Number(settings.safety_buffer_pct) !== 10) return true;
  if (settings.daily_plan_enabled === false || settings.weekly_plan_enabled === false) return true;
  if (settings.daily_budget_override != null || settings.weekly_budget_override != null) return true;
  if (settings.currency && settings.currency !== "₹") return true;
  if (snapshot.expenses?.some((expense) => !expense.applied && !String(expense.id).startsWith("applied-"))) return true;
  if (snapshot.pastMonths?.length) return true;
  if (snapshot.goals?.length) return true;
  return false;
}
