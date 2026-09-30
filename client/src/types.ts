export interface Settings {
  id: number;
  monthly_salary: number;
  current_balance: number;
  salary_day: number;
  safety_buffer_pct: number;
  daily_plan_enabled: boolean;
  weekly_plan_enabled: boolean;
  daily_budget_override: number | null;
  weekly_budget_override: number | null;
  currency: string;
  onboarded: boolean;
  updated_at: string;
}

export interface Budget {
  cycleStart: string;
  cycleEnd: string;
  nextCycleStart: string;
  totalCycleDays: number;
  daysElapsed: number;
  daysRemaining: number;
  weeksRemaining: number;
  safetyBufferAmount: number;
  spendableBalance: number;
  dailyAllowance: number;
  weeklyAllowance: number;
  dailyBudget: number | null;
  weeklyBudget: number | null;
  spentThisCycle: number;
  spentToday: number;
  spentThisWeek: number;
  dailyRemainingToday: number | null;
  weeklyRemainingThisWeek: number | null;
  projectedEndOfCycleBalance: number;
  burnRatePerDay: number;
  unpaidRecurringThisCycle: number;
  recurringMonthlyTotal: number;
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  auto_categorized: number;
  recurring: number;
  applied?: number;
  source_id?: string;
  created_at: string;
}

export interface CategoryMeta {
  key: string;
  color: string;
  icon: string;
}

export interface PastMonth {
  id: string;
  month: string;
  salary: number;
  total_spent: number;
  savings: number;
  notes: string | null;
  category_breakdown: Record<string, number> | null;
  created_at: string;
}

export interface CategoryBreakdownRow {
  category: string;
  total: number;
  pct: number;
  color: string;
  icon: string;
}

export interface Breakdown {
  rows: CategoryBreakdownRow[];
  grandTotal: number;
}

export interface DayPatternRow {
  day: string;
  total: number;
  average: number;
  count: number;
}

export interface TrendRow {
  month: string;
  salary: number;
  spent: number;
  savings: number;
  isCurrent: boolean;
}

export interface Insight {
  type: "info" | "success" | "warning" | "danger";
  title: string;
  message: string;
}

export interface AnalyticsResponse {
  breakdown: Breakdown;
  breakdownRecent: Breakdown;
  breakdownAllTime: Breakdown;
  dayPattern: DayPatternRow[];
  trend: TrendRow[];
  insights: Insight[];
  budget: Budget;
  currentMonthSpent: number;
}

export interface AffordResult {
  id: string;
  itemName: string;
  amount: number;
  targetMonthKey: string;
  affordable: boolean;
  verdict?: "yes" | "no" | "uncertain";
  headline?: string;
  projectedAvailable: number;
  availableLabel?: string;
  surplus?: number;
  shortfall?: number;
  recommendedDate?: string;
  dateCaption?: string;
  reasoning: string;
  facts: string[];
  basis?: string;
  explainedBy?: "ai" | "numbers";
  avgMonthlyExpense: number | null;
  essentialMonthlyExpense: number | null;
  discretionaryMonthlyExpense: number | null;
  aiTip?: string | null;
}

export interface PredictResult {
  id: string;
  itemName: string;
  amount: number;
  possible: boolean;
  verdict?: "yes" | "no" | "uncertain";
  headline?: string;
  monthsFromNow?: number;
  recommendedMonth?: string;
  recommendedDate?: string;
  dateCaption?: string;
  projectedAvailable?: number;
  availableLabel?: string;
  surplus?: number;
  shortfall?: number;
  reasoning: string;
  facts: string[];
  basis?: string;
  explainedBy?: "ai" | "numbers";
  avgMonthlyExpense: number | null;
  essentialMonthlyExpense: number | null;
  discretionaryMonthlyExpense: number | null;
  aiTip?: string | null;
}

export interface AiKindLimits {
  perMinute: number;
  weight: number;
  usedToday: number;
}

export interface AiLimits {
  sharedPerDay: number;
  sharedUsedToday: number;
  sharedRemainingToday: number;
  text: AiKindLimits;
  image: AiKindLimits;
}

export interface AiStatus {
  enabled: boolean;
  model: string | null;
  limits?: AiLimits;
}

export interface ParsedExpense {
  amount: number | null;
  description: string;
  category: string;
  date: string;
}

// A single transaction scraped from a payment-app screenshot. Always shown
// to the user for review/edit before anything is saved.
export interface ScannedExpense extends ParsedExpense {
  amount: number;
  include?: boolean;
  recurring?: boolean;
}

export interface MonthScanResult {
  month: string | null;
  totalSpent: number | null;
  totalIncome: number | null;
  categoryBreakdown: Record<string, number> | null;
  note: string;
}

export interface AiInsight {
  title: string;
  message: string;
}

export interface Goal {
  id: string;
  item_name: string;
  amount: number;
  mode: "specific_month" | "flexible";
  target_month: string | null;
  status: string;
  result: AffordResult | PredictResult | null;
  created_at: string;
}
