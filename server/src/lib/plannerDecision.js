import { round2 } from "./budget.js";
import { monthKey, toISODate, daysBetween, daysInMonth } from "./dates.js";
import { ESSENTIAL_CATEGORIES } from "./categorize.js";

const MAX_MONTHS = 18;

/**
 * Purchase decisions use only money the user actually saved:
 * salary, balance, safety buffer, recurring bills, past months, and logged
 * expenses. A partial month is never scaled up into a "typical" spend, and
 * a missing history is never filled with a percent of salary.
 */
export function decideAffordability({ amount, itemName, targetMonthKey, today, settings, budget, pastMonths, expenses, recurringCommitments }) {
  const picture = buildPicture({ today, settings, budget, pastMonths, expenses, recurringCommitments });
  const currentKey = monthKey(today);
  const offset = monthDiff(currentKey, targetMonthKey);

  if (offset < 0) {
    return finish({
      picture,
      amount,
      itemName,
      kind: "afford",
      verdict: "no",
      headline: "That month is already over",
      targetMonthKey,
      recommendedMonth: null,
      recommendedDate: null,
      monthsFromNow: null,
      projectedAvailable: picture.cashAfterBuffer,
      working: "Pick this month or a later one.",
      facts: ["That month is in the past."],
    });
  }

  const buyDate = recommendDate(today, picture.salaryDay, targetMonthKey);
  const projection = project({ picture, buyDate });
  return finish(judgment({ picture, projection, amount, itemName, kind: "afford", targetMonthKey, monthsFromNow: offset }));
}

export function decideTiming({ amount, itemName, today, settings, budget, pastMonths, expenses, recurringCommitments }) {
  const picture = buildPicture({ today, settings, budget, pastMonths, expenses, recurringCommitments });
  const currentKey = monthKey(today);

  if (picture.knownMonthlyCost == null) {
    const projection = project({ picture, buyDate: toISODate(today) });
    return finish(judgment({
      picture,
      projection,
      amount,
      itemName,
      kind: "predict",
      targetMonthKey: currentKey,
      monthsFromNow: null,
    }));
  }

  const monthlySavings = round2(picture.salary - picture.knownMonthlyCost);
  for (let offset = 0; offset <= MAX_MONTHS; offset++) {
    const targetMonthKey = addMonthKey(currentKey, offset);
    const buyDate = recommendDate(today, picture.salaryDay, targetMonthKey);
    const projection = project({ picture, buyDate });
    if (projection.projectedAvailable >= amount) {
      return finish(judgment({
        picture,
        projection,
        amount,
        itemName,
        kind: "predict",
        targetMonthKey,
        monthsFromNow: offset,
      }));
    }
    if (monthlySavings <= 0) break;
  }

  const projection = project({ picture, buyDate: toISODate(today) });
  const missed = judgment({
    picture,
    projection: { ...projection, projectedAvailable: projection.projectedAvailable },
    amount,
    itemName,
    kind: "predict",
    targetMonthKey: currentKey,
    monthsFromNow: null,
  });
  if (missed.verdict === "yes") return finish(missed);
  return finish({
    ...missed,
    verdict: "no",
    headline: monthlySavings <= 0 ? "Spending is already at your salary" : `Not within ${MAX_MONTHS} months`,
    recommendedDate: null,
    recommendedMonth: null,
    monthsFromNow: null,
    working: monthlySavings <= 0
      ? `Your recorded monthly spend is ${picture.money(picture.knownMonthlyCost)} and your salary is ${picture.money(picture.salary)}, so a ${picture.money(amount)} ${itemName} does not get closer by waiting.`
      : `Saving about ${picture.money(monthlySavings)} a month from the spending on file, a ${picture.money(amount)} ${itemName} is still more than ${MAX_MONTHS} months away.`,
    facts: picture.coreFacts(),
  });
}

export function listAllowedAmounts(decision) {
  return decision.allowedAmounts || [];
}

function judgment({ picture, projection, amount, itemName, kind, targetMonthKey, monthsFromNow }) {
  const left = projection.projectedAvailable;
  const gap = round2(left - amount);
  const covers = gap >= 0;
  let verdict;
  let headline;
  let working;

  if (picture.knownMonthlyCost == null) {
    if (covers) {
      verdict = "uncertain";
      headline = "Cash covers the price, but spending isn't logged";
      working = `${picture.money(picture.balance)} is in hand and ${picture.money(picture.buffer)} stays aside as your safety buffer, which leaves ${picture.money(left)}. That is enough cash for a ${picture.money(amount)} ${itemName}, but there is no full month of spending saved, so this does not account for rent, food, or bills. It is not a reliable yes.`;
    } else {
      verdict = "no";
      headline = "The cash in hand doesn't cover it";
      working = `After setting aside the ${picture.money(picture.buffer)} safety buffer, ${picture.money(left)} is left from your ${picture.money(picture.balance)} balance. That is ${picture.money(Math.abs(gap))} short of a ${picture.money(amount)} ${itemName}.`;
    }
  } else if (covers) {
    verdict = "yes";
    const when = kind === "predict" ? addMonthKey(monthKey(picture.today), monthsFromNow || 0) : targetMonthKey;
    headline = kind === "predict"
      ? `Best time is ${labelMonth(when)}`
      : `Yes — ${labelMonth(targetMonthKey)} can cover it`;
    working = projection.sentence({ amount, itemName, targetMonthKey: when });
  } else {
    verdict = "no";
    headline = kind === "predict" ? "Not reachable on your recorded spending" : `No — ${labelMonth(targetMonthKey)} comes up short`;
    working = projection.sentence({ amount, itemName, targetMonthKey });
  }

  const recommendedMonth = verdict === "yes" ? targetMonthKey : null;
  const recommendedDate = verdict === "yes"
    ? recommendDate(picture.today, picture.salaryDay, targetMonthKey)
    : null;

  const facts = [
    ...picture.coreFacts(),
    ...projection.factLines(picture),
    covers && picture.knownMonthlyCost != null
      ? `After the ${picture.money(amount)} purchase, ${picture.money(gap)} of that month's available money is still unused.`
      : null,
    !covers && picture.knownMonthlyCost != null
      ? `Short by ${picture.money(Math.abs(gap))} for this ${picture.money(amount)} purchase.`
      : null,
  ].filter(Boolean);

  return {
    picture,
    projection,
    verdict,
    headline,
    working,
    facts,
    targetMonthKey,
    recommendedMonth,
    recommendedDate,
    monthsFromNow: verdict === "yes" ? monthsFromNow : null,
    projectedAvailable: left,
    amount,
    itemName,
    kind,
    gap,
  };
}

function finish(draft) {
  const { picture, projection, verdict, gap } = draft;
  const affordable = verdict === "yes";
  const allowed = uniqueNumbers([
    draft.amount,
    picture.salary,
    picture.balance,
    picture.buffer,
    picture.bufferPct,
    picture.salaryDay,
    picture.knownMonthlyCost,
    picture.unpaidRecurring,
    picture.recurringMonthlyTotal,
    picture.cashAfterBuffer,
    draft.projectedAvailable,
    projection?.spendUntil,
    projection?.daysUntil,
    projection?.credits,
    gap,
    Math.abs(gap || 0),
    picture.expenseSum,
    picture.expenseDays,
    picture.expenseCount,
    picture.months?.length,
    draft.monthsFromNow,
    ...(picture.months || []).flatMap((m) => [m.totalSpent, m.salary]),
    ...(picture.bills || []).map((b) => b.amount),
    ...(picture.categories || []).map((c) => c.total),
  ]);

  return {
    verdict,
    headline: draft.headline,
    affordable,
    possible: affordable,
    targetMonthKey: draft.targetMonthKey,
    recommendedMonth: draft.recommendedMonth,
    recommendedDate: draft.recommendedDate,
    dateCaption: !draft.recommendedDate
      ? null
      : draft.recommendedDate === toISODate(picture.today)
        ? "Payday already arrived — buy today"
        : "Buy on payday",
    monthsFromNow: draft.monthsFromNow,
    projectedAvailable: draft.projectedAvailable,
    surplus: affordable ? round2(gap) : undefined,
    shortfall: verdict === "no" ? round2(Math.abs(gap)) : undefined,
    availableLabel: picture.knownMonthlyCost == null ? "Cash after safety buffer" : "Available before buying",
    basis: picture.basis,
    reasoning: draft.working,
    facts: draft.facts,
    working: draft.working,
    allowedAmounts: allowed,
    avgMonthlyExpense: picture.knownMonthlyCost,
    essentialMonthlyExpense: picture.essentialMonthly,
    discretionaryMonthlyExpense: picture.discretionaryMonthly,
    optimistic: picture.knownMonthlyCost == null,
    itemName: draft.itemName,
    amount: draft.amount,
    kind: draft.kind,
    currency: picture.currency,
    projection,
  };
}

function buildPicture({ today, settings, budget, pastMonths, expenses, recurringCommitments }) {
  const currency = settings.currency || "₹";
  const salary = num(settings.monthly_salary);
  const balance = num(settings.current_balance);
  const bufferPct = num(settings.safety_buffer_pct);
  const buffer = round2((bufferPct / 100) * salary);
  const salaryDay = clampDay(settings.salary_day);
  const unpaidRecurring = num(budget?.unpaidRecurringThisCycle);
  const daysRemaining = Math.max(1, num(budget?.daysRemaining) || 1);
  const totalCycleDays = Math.max(1, num(budget?.totalCycleDays) || 30);

  const months = (pastMonths || [])
    .map((m) => ({
      month: m.month,
      totalSpent: num(m.total_spent),
      salary: num(m.salary),
      breakdown: parseBreakdown(m.category_breakdown),
    }))
    .filter((m) => /^\d{4}-\d{2}$/.test(m.month || "") && m.totalSpent > 0)
    .sort((a, b) => (a.month < b.month ? -1 : 1));

  const logged = (expenses || [])
    .map((e) => ({
      amount: num(e.amount),
      category: e.category || "Other",
      description: String(e.description || "").slice(0, 80),
      date: e.date,
    }))
    .filter((e) => e.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ""));

  const dates = [...new Set(logged.map((e) => e.date))].sort();
  const expenseSum = round2(logged.reduce((sum, e) => sum + e.amount, 0));
  const expenseDays = dates.length >= 2 ? daysBetween(parseDay(dates[0]), parseDay(dates[dates.length - 1])) + 1 : dates.length;

  let knownMonthlyCost = null;
  let costBasis = "unknown";
  if (months.length > 0) {
    let weighted = 0;
    let weight = 0;
    months.forEach((m, index) => {
      const w = index + 1;
      weighted += m.totalSpent * w;
      weight += w;
    });
    knownMonthlyCost = round2(weighted / weight);
    costBasis = "past_months";
  } else if (dates.length >= 14 && logged.length >= 5 && expenseDays >= 14 && expenseSum > 0) {
    knownMonthlyCost = round2((expenseSum / expenseDays) * 30);
    costBasis = "logged_expenses";
  }

  const categories = categoryTotals(logged, months);
  const essentialTotal = round2(categories.filter((c) => ESSENTIAL_CATEGORIES.has(c.category)).reduce((sum, c) => sum + c.total, 0));
  const categorizedTotal = round2(categories.reduce((sum, c) => sum + c.total, 0));
  let essentialMonthly = null;
  let discretionaryMonthly = null;
  if (knownMonthlyCost != null && categorizedTotal > 0) {
    essentialMonthly = round2(knownMonthlyCost * (essentialTotal / categorizedTotal));
    discretionaryMonthly = round2(Math.max(0, knownMonthlyCost - essentialMonthly));
  }

  const bills = (recurringCommitments || []).map((bill) => ({
    name: bill.description || bill.category || "Bill",
    category: bill.category || "Bills & Utilities",
    amount: num(bill.amount),
  })).filter((bill) => bill.amount > 0);
  const recurringMonthlyTotal = round2(bills.reduce((sum, bill) => sum + bill.amount, 0));

  const cashAfterBuffer = round2(balance - buffer - unpaidRecurring);
  const money = (n) => formatMoney(n, currency);

  let basis;
  if (costBasis === "past_months") {
    const first = labelMonth(months[0].month);
    const last = labelMonth(months[months.length - 1].month);
    basis = months.length === 1
      ? `Usual spending is the one month you saved (${first}): ${money(knownMonthlyCost)}.`
      : `Usual spending is the average of ${months.length} saved months (${first}–${last}): ${money(knownMonthlyCost)}. More recent months count more.`;
  } else if (costBasis === "logged_expenses") {
    basis = `Usual spending is scaled from ${money(expenseSum)} logged across ${expenseDays} days: ${money(knownMonthlyCost)} a month. A shorter stretch is not treated as a full month.`;
  } else {
    basis = "No full month of spending is saved yet, so everyday costs are not guessed.";
  }

  function coreFacts() {
    const lines = [
      `Salary ${money(salary)}, balance ${money(balance)}, safety buffer ${money(buffer)} (${bufferPct}% of salary).`,
      basis,
    ];
    if (bills.length > 0) {
      const listed = bills.slice(0, 4).map((bill) => `${bill.name} ${money(bill.amount)}`).join(", ");
      lines.push(`Recurring bills on file: ${listed}.`);
    }
    if (categories.length > 0) {
      const top = categories.slice(0, 4).map((c) => `${c.category} ${money(c.total)}`).join(", ");
      lines.push(`Categorized spending on file: ${top}.`);
    }
    return lines;
  }

  return {
    today,
    currency,
    salary,
    balance,
    buffer,
    bufferPct,
    salaryDay,
    unpaidRecurring,
    daysRemaining,
    totalCycleDays,
    knownMonthlyCost,
    costBasis,
    months,
    expenseSum,
    expenseDays,
    expenseCount: logged.length,
    categories,
    essentialMonthly,
    discretionaryMonthly,
    bills,
    recurringMonthlyTotal,
    cashAfterBuffer,
    basis,
    money,
    coreFacts,
  };
}

function project({ picture, buyDate }) {
  const { balance, salary, buffer, knownMonthlyCost, unpaidRecurring, money, today, salaryDay } = picture;
  const todayIso = toISODate(today);

  if (knownMonthlyCost == null) {
    const projectedAvailable = round2(balance - buffer - unpaidRecurring);
    return {
      projectedAvailable,
      buyDate,
      sentence() {
        return "";
      },
      factLines() {
        return [`Cash after the safety buffer and unpaid bills: ${money(projectedAvailable)}.`];
      },
    };
  }

  // Buying today still has to leave enough for the days until the next salary.
  // Buying on a future payday counts the salary credits up to that day, and the
  // usual spending across the days in between. It does not subtract an extra month.
  const horizon = buyDate > todayIso ? buyDate : nextPayday(today, salaryDay);
  const daysUntil = Math.max(0, daysBetween(today, parseDay(horizon)));
  const credits = buyDate > todayIso ? countPaydays(today, buyDate, salaryDay) : 0;
  const spendUntil = round2(Math.max(knownMonthlyCost * (daysUntil / 30), unpaidRecurring));
  const projectedAvailable = round2(balance + credits * salary - spendUntil - buffer);

  return {
    projectedAvailable,
    buyDate,
    daysUntil,
    credits,
    spendUntil,
    sentence({ amount, itemName, targetMonthKey }) {
      const gap = round2(projectedAvailable - amount);
      const fit = gap >= 0
        ? `A ${money(amount)} ${itemName} fits, with ${money(gap)} left over.`
        : `A ${money(amount)} ${itemName} is short by ${money(Math.abs(gap))}.`;
      const salaryLine = credits > 0
        ? `${credits} salary credit(s) of ${money(salary)} arrive by ${labelMonth(targetMonthKey)}.`
        : `No new salary arrives before this purchase.`;
      return `Buy date ${buyDate}. ${salaryLine} Usual spending over the ${daysUntil} day(s) until then is ${money(spendUntil)}, from ${money(knownMonthlyCost)} a month. From today's ${money(balance)}, after that spending and the ${money(buffer)} safety buffer, ${money(projectedAvailable)} is available. ${fit}`;
    },
    factLines(pic) {
      return [
        `Usual monthly spend used in the estimate: ${pic.money(knownMonthlyCost)}.`,
        `Spending reserved until the buy date: ${pic.money(spendUntil)} over ${daysUntil} day(s).`,
        credits > 0 ? `Salary credits counted: ${credits} × ${pic.money(salary)}.` : `No new salary is added before the purchase.`,
      ];
    },
  };
}

function nextPayday(today, salaryDay) {
  const todayIso = toISODate(today);
  const thisMonth = paydayOn(monthKey(today), salaryDay);
  if (thisMonth > todayIso) return thisMonth;
  return paydayOn(addMonthKey(monthKey(today), 1), salaryDay);
}

function countPaydays(today, throughIso, salaryDay) {
  const todayIso = toISODate(today);
  let count = 0;
  let key = monthKey(today);
  for (let i = 0; i < 24; i++) {
    const payday = paydayOn(key, salaryDay);
    if (payday > todayIso && payday <= throughIso) count += 1;
    if (payday > throughIso) break;
    key = addMonthKey(key, 1);
  }
  return count;
}

function recommendDate(today, salaryDay, targetMonth) {
  const todayIso = toISODate(today);
  const payday = paydayOn(targetMonth, salaryDay);
  return payday < todayIso ? todayIso : payday;
}

function paydayOn(targetMonth, salaryDay) {
  const [year, month] = targetMonth.split("-").map(Number);
  const day = Math.min(salaryDay || 1, daysInMonth(year, month - 1));
  return toISODate(new Date(year, month - 1, day));
}

function categoryTotals(expenses, months) {
  const totals = new Map();
  const add = (category, amount) => {
    const key = category || "Other";
    const n = num(amount);
    if (n <= 0) return;
    totals.set(key, (totals.get(key) || 0) + n);
  };
  for (const expense of expenses) add(expense.category, expense.amount);
  for (const month of months) {
    if (!month.breakdown) continue;
    for (const [category, amount] of Object.entries(month.breakdown)) add(category, amount);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
}

function parseBreakdown(raw) {
  if (!raw) return null;
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  if (!value || typeof value !== "object") return null;
  return value;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatMoney(amount, currency) {
  const n = round2(num(amount));
  const formatted = Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `${n < 0 ? "-" : ""}${currency}${formatted}`;
}

function labelMonth(key) {
  const [year, month] = String(key || "").split("-").map(Number);
  if (!year || !month) return "that month";
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function monthDiff(fromKey, toKey) {
  const [fromYear, fromMonth] = fromKey.split("-").map(Number);
  const [toYear, toMonth] = toKey.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function addMonthKey(key, offset) {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + offset, 1));
}

function parseDay(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function clampDay(value) {
  const day = Math.round(num(value) || 1);
  return Math.max(1, Math.min(31, day));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function uniqueNumbers(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    const key = String(round2(n));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(round2(n));
  }
  return out;
}

/** Keep an AI rewrite only when every amount in it already appears in the decision. */
export function applyPlannerExplanation(decision, advice) {
  const client = toClientDecision(decision);
  if (!advice || typeof advice !== "object") return { ...client, explainedBy: "numbers" };

  let headline = groundedText(advice.headline, decision.allowedAmounts) ? clip(advice.headline, 90) : client.headline;
  if (decision.verdict !== "yes" && /\b(can afford|fits|great shape|go ahead|buy it)\b/i.test(headline)) {
    headline = client.headline;
  }
  const reasoning = groundedText(advice.reasoning, decision.allowedAmounts) ? clip(advice.reasoning, 700) : client.reasoning;
  const aiFacts = Array.isArray(advice.facts)
    ? advice.facts.filter((fact) => groundedText(fact, decision.allowedAmounts)).map((fact) => clip(fact, 220)).slice(0, 5)
    : [];
  const usedAi = reasoning !== client.reasoning;
  return {
    ...client,
    headline,
    reasoning,
    facts: aiFacts.length >= 2 ? aiFacts : client.facts,
    explainedBy: usedAi ? "ai" : "numbers",
  };
}

export function toClientDecision(decision) {
  return {
    verdict: decision.verdict,
    headline: decision.headline,
    affordable: decision.affordable,
    possible: decision.possible,
    targetMonthKey: decision.targetMonthKey,
    recommendedMonth: decision.recommendedMonth,
    recommendedDate: decision.recommendedDate,
    dateCaption: decision.dateCaption,
    monthsFromNow: decision.monthsFromNow,
    projectedAvailable: decision.projectedAvailable,
    surplus: decision.surplus,
    shortfall: decision.shortfall,
    availableLabel: decision.availableLabel,
    basis: decision.basis,
    reasoning: decision.reasoning,
    facts: decision.facts,
    avgMonthlyExpense: decision.avgMonthlyExpense,
    essentialMonthlyExpense: decision.essentialMonthlyExpense,
    discretionaryMonthlyExpense: decision.discretionaryMonthlyExpense,
    optimistic: decision.optimistic,
  };
}

function groundedText(text, allowed) {
  if (typeof text !== "string" || !text.trim()) return false;
  const stripped = text
    .replace(/\d{4}-\d{2}-\d{2}/g, " ")
    .replace(/\d{4}-\d{2}/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ");
  const nums = stripped.match(/\d[\d,]*(?:\.\d+)?/g) || [];
  return nums.every((raw) => {
    const n = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(n)) return false;
    if (Number.isInteger(n) && n >= 0 && n <= 36) return true;
    return (allowed || []).some((amount) => Math.abs(amount - n) <= 1);
  });
}

function clip(text, max) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}
