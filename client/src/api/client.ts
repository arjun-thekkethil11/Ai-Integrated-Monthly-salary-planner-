import type {
  Settings,
  Expense,
  PastMonth,
  AnalyticsResponse,
  CategoryMeta,
  AffordResult,
  PredictResult,
  Goal,
  Reminder,
  Budget,
  AiStatus,
  ParsedExpense,
  AiInsight,
  ScannedExpense,
  MonthScanResult,
} from "../types";
import { writeLocalSnapshot, type DataSnapshot } from "../lib/localSnapshot";

const BASE = "/api";

// Backing up to this browser after every save happens in the background —
// it must never make the action the user is waiting on (add an expense,
// save settings, etc.) feel slower. If a burst of mutations comes in, only
// the last one bothers fetching the snapshot.
let backupTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBackup() {
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = null;
    request<DataSnapshot>("/snapshot", {}, false)
      .then(writeLocalSnapshot)
      .catch(() => {
        // Keep the previous browser copy if the backup read fails.
      });
  }, 400);
}

async function request<T>(path: string, options: RequestInit = {}, persist = true): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  const data = res.status === 204 ? (undefined as T) : await res.json();
  if (persist && changesSavedData(path, options.method)) {
    scheduleBackup();
  }
  return data;
}

function changesSavedData(path: string, method: string | undefined) {
  const verb = (method || "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD") return false;
  if (path.startsWith("/ai")) return false;
  return true;
}

export const api = {
  getSettings: () => request<Settings>("/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),

  getBudget: () => request<{ settings: Settings; budget: Budget }>("/budget"),
  getSnapshot: () => request<DataSnapshot>("/snapshot", {}, false),
  restoreSnapshot: (snapshot: DataSnapshot) =>
    request<DataSnapshot>("/snapshot/restore", { method: "POST", body: JSON.stringify(snapshot) }, false),

  getExpenses: (params?: { month?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.month) qs.set("month", params.month);
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<Expense[]>(`/expenses${suffix}`);
  },
  addExpense: (payload: { amount: number; description: string; date: string; category?: string; recurring?: boolean }) =>
    request<Expense>("/expenses", { method: "POST", body: JSON.stringify(payload) }),
  updateExpense: (id: string, patch: Partial<Expense>) =>
    request<Expense>(`/expenses/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteExpense: (id: string) => request<void>(`/expenses/${id}`, { method: "DELETE" }),
  previewCategory: (description: string) =>
    request<{ category: string }>("/expenses/categorize-preview", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),

  getCategories: () => request<CategoryMeta[]>("/categories"),

  getPastMonths: () => request<PastMonth[]>("/past-months"),
  upsertPastMonth: (payload: { month: string; salary: number; total_spent: number; notes?: string; category_breakdown?: Record<string, number> | null }) =>
    request<PastMonth>("/past-months", { method: "POST", body: JSON.stringify(payload) }),
  deletePastMonth: (id: string) => request<void>(`/past-months/${id}`, { method: "DELETE" }),

  getAnalytics: (rangeMonths = 6) => request<AnalyticsResponse>(`/analytics?rangeMonths=${rangeMonths}`),

  checkAfford: (payload: { itemName: string; amount: number; targetMonth: string }) =>
    request<AffordResult>("/planner/afford", { method: "POST", body: JSON.stringify(payload) }),
  predictTiming: (payload: { itemName: string; amount: number }) =>
    request<PredictResult>("/planner/predict", { method: "POST", body: JSON.stringify(payload) }),
  getGoals: () => request<Goal[]>("/planner/goals"),
  deleteGoal: (id: string) => request<void>(`/planner/goals/${id}`, { method: "DELETE" }),

  getReminders: () => request<Reminder[]>("/reminders"),
  addReminder: (payload: { itemName: string; amount: number; dueDate: string; category?: string }) =>
    request<Reminder>("/reminders", { method: "POST", body: JSON.stringify(payload) }),
  completeReminder: (id: string) =>
    request<{ reminder: Reminder; expense: Expense | null }>(`/reminders/${id}/complete`, { method: "POST" }),
  deleteReminder: (id: string) => request<void>(`/reminders/${id}`, { method: "DELETE" }),

  getAiStatus: () => request<AiStatus>("/ai/status"),
  parseExpenseAI: (text: string) => request<ParsedExpense>("/ai/parse-expense", { method: "POST", body: JSON.stringify({ text }) }),
  parseExpenseImageAI: (image: string) =>
    request<{ transactions: ScannedExpense[] }>("/ai/parse-expense-image", { method: "POST", body: JSON.stringify({ image }) }),
  parseMonthImageAI: (image: string) =>
    request<MonthScanResult>("/ai/parse-month-image", { method: "POST", body: JSON.stringify({ image }) }),
  getAiInsights: () => request<{ enabled: boolean; insights: AiInsight[] }>("/ai/insights", { method: "POST" }),
};
