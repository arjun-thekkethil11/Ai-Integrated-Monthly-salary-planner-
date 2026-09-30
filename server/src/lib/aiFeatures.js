import { aiJson, isAiEnabled } from "./ai.js";
import { CATEGORIES } from "./categorize.js";
import { toISODate } from "./dates.js";
import { round2 } from "./budget.js";

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
const MAX_TRANSACTIONS_PER_IMAGE = 40;

/**
 * Turn a free-text sentence like "spent 450 on swiggy dinner yesterday"
 * into structured expense fields, resolving relative dates against `today`.
 * Returns { data, blocked, reason } — data is null if AI isn't configured,
 * the guardrail blocked the call, or parsing failed; `reason` explains why.
 */
export async function parseExpenseWithAI({ text, today = new Date() }) {
  if (!isAiEnabled()) return { data: null, blocked: false, reason: "AI isn't configured." };
  if (!text?.trim()) return { data: null, blocked: false, reason: "Type something first." };

  const todayIso = toISODate(today);
  const { data: result, blocked, reason } = await aiJson({
    kind: "text",
    temperature: 0.1,
    maxTokens: 600,
    system: `You extract structured expense data from a short, casual sentence a user types into a budgeting app.
Today's date is ${todayIso} (YYYY-MM-DD). Resolve relative dates ("today", "yesterday", "last Friday", "on the 3rd") against it.
Pick the single best-fitting category from EXACTLY this list (case-sensitive): ${CATEGORY_KEYS.join(", ")}.
Respond with ONLY a JSON object, no prose, no markdown fences, shaped exactly like:
{"amount": <number>, "description": "<short clean description, 1-6 words>", "category": "<one of the allowed categories>", "date": "YYYY-MM-DD"}
If the sentence has no clear amount, set "amount" to 0. Never invent an amount.`,
    user: text.trim(),
  });

  if (blocked || !result || typeof result !== "object") return { data: null, blocked, reason };

  const amount = Number(result.amount);
  const category = CATEGORY_KEYS.includes(result.category) ? result.category : "Other";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(result.date || "") ? result.date : todayIso;
  const description = typeof result.description === "string" && result.description.trim() ? result.description.trim() : text.trim();

  return {
    data: {
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      description,
      category,
      date,
    },
    blocked: false,
    reason: null,
  };
}

/**
 * Extract a LIST of transactions from a payment-app / bank screenshot
 * (e.g. GPay/PhonePe/Paytm transaction history, a bank statement page).
 * `imageDataUrl` is a data: URL (base64). Returns { data, blocked, reason }
 * where data is an array of { amount, description, category, date } ready
 * for the user to review, edit and confirm — never auto-saved.
 */
export async function parseExpensesFromImage({ imageDataUrl, today = new Date() }) {
  if (!isAiEnabled()) return { data: null, blocked: false, reason: "AI isn't configured." };
  if (!imageDataUrl) return { data: null, blocked: false, reason: "No image provided." };

  const todayIso = toISODate(today);
  const { data: result, blocked, reason } = await aiJson({
    kind: "image",
    temperature: 0.1,
    maxTokens: 4000,
    images: [imageDataUrl],
    system: `You read screenshots from payment apps (Google Pay, PhonePe, Paytm, bank apps, card statements) and extract
every individual transaction/spend visible in the image (ignore incoming/credit transactions unless the user's screenshot
is clearly only about spends). Today's date is ${todayIso} (YYYY-MM-DD) — resolve relative labels like "Today", "Yesterday",
or a date with no year against it. If a transaction's date truly cannot be determined, use ${todayIso}.
For each transaction, pick the single best-fitting category from EXACTLY this list (case-sensitive): ${CATEGORY_KEYS.join(", ")}.
Respond with ONLY a JSON array, no prose, no markdown fences, shaped exactly like:
[{"amount": <number>, "description": "<merchant/short label, 1-6 words>", "category": "<one of the allowed categories>", "date": "YYYY-MM-DD"}]
Skip anything that isn't a real spend transaction (balances, headers, ads, navigation). If you truly see nothing, return [].
Extract at most ${MAX_TRANSACTIONS_PER_IMAGE} transactions.`,
    user: "Extract every spend transaction from this screenshot.",
  });

  if (blocked) return { data: null, blocked, reason };
  if (!Array.isArray(result)) return { data: null, blocked: false, reason: reason || "Couldn't read any transactions from that image — try a clearer screenshot or add manually." };

  const cleaned = result
    .map((r) => {
      const amount = Number(r?.amount);
      const category = CATEGORY_KEYS.includes(r?.category) ? r.category : "Other";
      const date = /^\d{4}-\d{2}-\d{2}$/.test(r?.date || "") ? r.date : todayIso;
      const description = typeof r?.description === "string" && r.description.trim() ? r.description.trim() : "Expense";
      return Number.isFinite(amount) && amount > 0 ? { amount, description, category, date } : null;
    })
    .filter(Boolean)
    .slice(0, MAX_TRANSACTIONS_PER_IMAGE);

  if (cleaned.length === 0) {
    return { data: [], blocked: false, reason: "Couldn't spot any clear transactions in that image — try a sharper screenshot." };
  }
  return { data: cleaned, blocked: false, reason: null };
}

/**
 * Extract a monthly summary (total spend / income, and the month itself if
 * visible) from a screenshot of a payment app's monthly summary/statement.
 * Used to pre-fill the Past Months form — the user still reviews & saves.
 */
export async function parseMonthSummaryFromImage({ imageDataUrl }) {
  if (!isAiEnabled()) return { data: null, blocked: false, reason: "AI isn't configured." };
  if (!imageDataUrl) return { data: null, blocked: false, reason: "No image provided." };

  const { data: result, blocked, reason } = await aiJson({
    kind: "image",
    temperature: 0.1,
    maxTokens: 900,
    images: [imageDataUrl],
    system: `You read a screenshot of a monthly spending summary or statement from a payment app / bank app.
Extract: the month it covers (as "YYYY-MM" if a month & year are visible, else null), the total amount spent/debited that
month, the total income/credited amount that month if visible (else null), and — if the screenshot breaks spending down
by category (e.g. "Food", "Shopping", "Bills", pie-chart legends, category lists) — the amount for EACH category shown.
Map each category label you see to the single best-fitting category from EXACTLY this list (case-sensitive):
${CATEGORY_KEYS.join(", ")}. Only include a category if you can see a real amount for it; never guess or invent one.
If multiple visible labels map to the same allowed category, sum them. If no category-level breakdown is visible at all,
use an empty object.
Respond with ONLY a JSON object, no prose, no markdown fences, shaped exactly like:
{"month": "YYYY-MM" or null, "totalSpent": <number> or null, "totalIncome": <number> or null, "categoryBreakdown": {"<category>": <number>, ...}, "note": "<one short clause about what you saw, e.g. '3 categories shown', or empty string>"}
If you cannot find a clear monthly total spent figure, set totalSpent to null — never guess a number.`,
    user: "Extract the monthly summary from this screenshot.",
  });

  if (blocked) return { data: null, blocked, reason };
  if (!result || typeof result !== "object") {
    return { data: null, blocked: false, reason: reason || "Couldn't read a monthly summary from that image — try a clearer screenshot or add manually." };
  }

  const month = /^\d{4}-\d{2}$/.test(result.month || "") ? result.month : null;
  const totalSpent = Number(result.totalSpent);
  const totalIncome = Number(result.totalIncome);

  let categoryBreakdown = null;
  if (result.categoryBreakdown && typeof result.categoryBreakdown === "object") {
    const cleaned = {};
    for (const [category, amount] of Object.entries(result.categoryBreakdown)) {
      const n = Number(amount);
      if (CATEGORY_KEYS.includes(category) && Number.isFinite(n) && n > 0) {
        cleaned[category] = round2(n);
      }
    }
    if (Object.keys(cleaned).length > 0) categoryBreakdown = cleaned;
  }

  return {
    data: {
      month,
      totalSpent: Number.isFinite(totalSpent) && totalSpent > 0 ? totalSpent : null,
      totalIncome: Number.isFinite(totalIncome) && totalIncome > 0 ? totalIncome : null,
      categoryBreakdown,
      note: typeof result.note === "string" ? result.note : "",
    },
    blocked: false,
    reason: null,
  };
}

/**
 * Generate a handful of extra, conversational savings insights to sit
 * alongside the deterministic rule-based ones. Purely additive — never
 * used for any of the app's actual budgeting math.
 */
export async function generateAiInsights({ settings, budget, breakdown, trend }) {
  if (!isAiEnabled()) return { data: null, blocked: false, reason: "AI isn't configured." };

  const context = {
    currency: settings.currency,
    monthlySalary: settings.monthly_salary,
    currentBalance: settings.current_balance,
    savingsGoal: settings.monthly_savings_goal,
    safetyBuffer: budget.safetyBufferAmount,
    freeToSpend: budget.spendableBalance,
    dailyPlan: budget.dailyBudget,
    daysRemainingInCycle: budget.daysRemaining,
    spentThisCycle: budget.spentThisCycle,
    topCategories: breakdown.rows.slice(0, 6),
    monthlyTrend: trend,
  };

  const { data: result, blocked, reason } = await aiJson({
    kind: "text",
    temperature: 0.6,
    maxTokens: 1200,
    system: `You are a friendly, sharp personal finance coach embedded in a budgeting app.
Given a JSON snapshot of a user's salary, balance, savings goal, daily plan, spending by category, and monthly trend, write 2-4 short,
specific, non-generic insights or savings tips personalised to THEIR numbers (reference actual figures/categories
where useful). Focus on whether the savings goal is still covered, whether their pace fits the daily plan, bills, and which category is heavy.
Do not mention weekdays or which day of the week they spend more. Avoid restating obvious facts already implied by the raw numbers alone.
Keep each message under 40 words. Respond with ONLY a JSON array, no prose, shaped exactly like:
[{"title": "<short punchy title>", "message": "<the tip>"}]`,
    user: JSON.stringify(context),
  });

  if (blocked || !Array.isArray(result)) return { data: null, blocked, reason };
  const insights = result.filter((r) => r && typeof r.title === "string" && typeof r.message === "string").slice(0, 4);
  return { data: insights, blocked: false, reason: null };
}

/**
 * Rewrite a purchase decision as a short headline + a handful of bullet
 * points — not a paragraph. The verdict and every rupee figure are already
 * fixed from the user's saved data; this only rephrases them for
 * readability. Returns null when AI is off, blocked, or unusable — callers
 * then keep the original (also bullet-point) explanation.
 */
export async function explainPlannerDecision(decision) {
  if (!isAiEnabled()) return null;

  const brief = {
    verdict: decision.verdict,
    itemName: decision.itemName,
    amount: decision.amount,
    currency: decision.currency,
    targetMonth: decision.targetMonthKey,
    recommendedDate: decision.recommendedDate,
    basis: decision.basis,
    working: decision.working,
    facts: decision.facts,
    figures: decision.allowedAmounts,
  };

  const { data, blocked } = await aiJson({
    kind: "text",
    temperature: 0.2,
    maxTokens: 700,
    system: `You explain a purchase decision for a personal budgeting app, as a short headline plus a handful of bullet points — never a paragraph. The decision is already made. You must not change the verdict, invent expenses, or introduce any rupee amount that is not in "figures".
Rules:
- verdict "yes" means it fits the saved numbers. verdict "no" means it does not. verdict "uncertain" means cash might cover the price but everyday spending is not on file — never say they can afford it in that case.
- headline: at most 10 words, must match the verdict.
- facts: exactly 3 to 5 bullet points, each ONE short clause under 14 words (like reading a receipt, not a story). Together they should cover: where the spending figure came from, the money available, and how it compares to the amount needed. Reuse the numbers already in "working"/"facts" — do not recompute.
- recommendedDate, when present, is the salary credit date (or today if payday has passed). Mention it only if it is in the input, in at most one bullet.
- No festive-season advice, discounts, shopping tips, or encouragement that isn't tied to these figures. No full sentences with "because"/"therefore" chains — keep each bullet standalone.
Respond with ONLY JSON: {"headline":"...","facts":["...","...","..."]}`,
    user: JSON.stringify(brief),
  });

  if (blocked || !data || typeof data !== "object") return null;
  return data;
}
