import type {
  Settings,
  Expense,
  PastMonth,
  AnalyticsResponse,
  CategoryMeta,
  AffordResult,
  PredictResult,
  Goal,
  Budget,
  AiStatus,
  ParsedExpense,
  AiInsight,
  ScannedExpense,
  MonthScanResult,
} from "../types";

const BASE = "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getSettings: () => request<Settings>("/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),

  getBudget: () => request<{ settings: Settings; budget: Budget }>("/budget"),

  getExpenses: (params?: { month?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.month) qs.set("month", params.month);
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<Expense[]>(`/expenses${suffix}`);
  },
  addExpense: (payload: { amount: number; description: string; date: string; category?: string }) =>
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
  upsertPastMonth: (payload: { month: string; salary: number; total_spent: number; notes?: string }) =>
    request<PastMonth>("/past-months", { method: "POST", body: JSON.stringify(payload) }),
  deletePastMonth: (id: string) => request<void>(`/past-months/${id}`, { method: "DELETE" }),

  getAnalytics: (rangeMonths = 6) => request<AnalyticsResponse>(`/analytics?rangeMonths=${rangeMonths}`),

  checkAfford: (payload: { itemName: string; amount: number; targetMonth: string }) =>
    request<AffordResult>("/planner/afford", { method: "POST", body: JSON.stringify(payload) }),
  predictTiming: (payload: { itemName: string; amount: number }) =>
    request<PredictResult>("/planner/predict", { method: "POST", body: JSON.stringify(payload) }),
  getGoals: () => request<Goal[]>("/planner/goals"),
  deleteGoal: (id: string) => request<void>(`/planner/goals/${id}`, { method: "DELETE" }),

  getAiStatus: () => request<AiStatus>("/ai/status"),
  parseExpenseAI: (text: string) => request<ParsedExpense>("/ai/parse-expense", { method: "POST", body: JSON.stringify({ text }) }),
  parseExpenseImageAI: (image: string) =>
    request<{ transactions: ScannedExpense[] }>("/ai/parse-expense-image", { method: "POST", body: JSON.stringify({ image }) }),
  parseMonthImageAI: (image: string) =>
    request<MonthScanResult>("/ai/parse-month-image", { method: "POST", body: JSON.stringify({ image }) }),
  getAiInsights: () => request<{ enabled: boolean; insights: AiInsight[] }>("/ai/insights", { method: "POST" }),
};
