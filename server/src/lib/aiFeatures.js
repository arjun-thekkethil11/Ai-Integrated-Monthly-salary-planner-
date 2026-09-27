import { aiJson, isAiEnabled } from "./ai.js";
import { CATEGORIES } from "./categorize.js";
import { toISODate } from "./dates.js";

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
    maxTokens: 1200,
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
    maxTokens: 2500,
    images: [imageDataUrl],
    system: `You read a screenshot of a monthly spending summary or statement from a payment app / bank app.
Extract: the month it covers (as "YYYY-MM" if a month & year are visible, else null), the total amount spent/debited that
month, and the total income/credited amount that month if visible (else null). Respond with ONLY a JSON object, no prose,
no markdown fences, shaped exactly like:
{"month": "YYYY-MM" or null, "totalSpent": <number> or null, "totalIncome": <number> or null, "note": "<one short clause about what you saw, e.g. '3 categories shown', or empty string>"}
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

  return {
    data: {
      month,
      totalSpent: Number.isFinite(totalSpent) && totalSpent > 0 ? totalSpent : null,
      totalIncome: Number.isFinite(totalIncome) && totalIncome > 0 ? totalIncome : null,
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
export async function generateAiInsights({ settings, budget, breakdown, trend, dayPattern }) {
  if (!isAiEnabled()) return { data: null, blocked: false, reason: "AI isn't configured." };

  const context = {
    currency: settings.currency,
    monthlySalary: settings.monthly_salary,
    currentBalance: settings.current_balance,
    daysRemainingInCycle: budget.daysRemaining,
    spentThisCycle: budget.spentThisCycle,
    dailyAllowance: budget.dailyAllowance,
    topCategories: breakdown.rows.slice(0, 6),
    monthlyTrend: trend,
    dayOfWeekPattern: dayPattern,
  };

  const { data: result, blocked, reason } = await aiJson({
    kind: "text",
    temperature: 0.6,
    maxTokens: 2500,
    system: `You are a friendly, sharp personal finance coach embedded in a budgeting app.
Given a JSON snapshot of a user's salary, balance, spending by category, and monthly trend, write 2-4 short,
specific, non-generic insights or savings tips personalised to THEIR numbers (reference actual figures/categories
where useful). Avoid restating obvious facts already implied by the raw numbers alone — add real, actionable judgement.
Keep each message under 40 words. Respond with ONLY a JSON array, no prose, shaped exactly like:
[{"title": "<short punchy title>", "message": "<the tip>"}]`,
    user: JSON.stringify(context),
  });

  if (blocked || !Array.isArray(result)) return { data: null, blocked, reason };
  const insights = result.filter((r) => r && typeof r.title === "string" && typeof r.message === "string").slice(0, 4);
  return { data: insights, blocked: false, reason: null };
}

/**
 * A single short, human "coach" remark layered on top of an already-computed
 * (deterministic) Purchase Planner result. The math/decision itself always
 * comes from checkAffordability / predictPurchaseTiming — this just adds tone.
 * Decorative only, so callers can just take the string and ignore failures.
 */
export async function generatePlannerTip({ kind, itemName, amount, result, settings }) {
  if (!isAiEnabled()) return null;

  const { data } = await aiJson({
    kind: "text",
    temperature: 0.6,
    maxTokens: 1000,
    system: `You are a warm, encouraging personal finance coach. You'll get the JSON result of a deterministic
affordability calculation for a purchase a user wants to make. Do NOT change or re-derive any numbers or the
affordable/possible verdict — just add ONE short, genuinely useful, personable remark (max 30 words) that a human
advisor might add on top: encouragement, a practical tip, or a gentle caution. Respond with ONLY JSON: {"tip": "<remark>"}`,
    user: JSON.stringify({ kind, itemName, amount, currency: settings.currency, result }),
  });

  if (!data || typeof data.tip !== "string") return null;
  return data.tip.trim() || null;
}
