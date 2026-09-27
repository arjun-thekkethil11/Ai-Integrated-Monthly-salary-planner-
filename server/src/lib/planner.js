import { round2 } from "./budget.js";
import { addMonths, monthKey, daysInMonth, toISODate } from "./dates.js";
import { ESSENTIAL_CATEGORIES } from "./categorize.js";

/**
 * Estimate a realistic "typical monthly expense" figure by blending:
 *  - a recency-weighted average of the user's logged past months, and
 *  - the current cycle's extrapolated run-rate (spend-so-far scaled to a full cycle).
 * Falls back to a conservative 65% of salary if there's no data at all yet.
 */
export function estimateAvgMonthlyExpense({ pastMonths, currentRunRate, salary }) {
  const sorted = [...pastMonths].sort((a, b) => (a.month > b.month ? 1 : -1));
  let weightedSum = 0;
  let weightTotal = 0;
  sorted.forEach((m, idx) => {
    const weight = idx + 1; // more recent months (later in sorted order) count more
    weightedSum += m.total_spent * weight;
    weightTotal += weight;
  });

  const historicalAvg = weightTotal > 0 ? weightedSum / weightTotal : null;

  if (historicalAvg != null && currentRunRate != null && currentRunRate > 0) {
    return round2(historicalAvg * 0.6 + currentRunRate * 0.4);
  }
  if (historicalAvg != null) return round2(historicalAvg);
  if (currentRunRate != null && currentRunRate > 0) return round2(currentRunRate);
  return round2(salary * 0.65);
}

function parseCategoryBreakdown(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Splits the estimated average monthly expense into "essential" (rent,
 * bills, groceries, health, education, investment commitments) vs
 * "discretionary" (everything else) using REAL category-level data — logged
 * expenses (server/src/lib/categorize.js ESSENTIAL_CATEGORIES) plus any
 * category breakdowns captured from scanned monthly-summary screenshots
 * (past_months.category_breakdown). This is what lets the planner reason
 * about whether a purchase would still leave room for necessary spending,
 * instead of just comparing one lump total against the balance.
 */
export function estimateEssentialSplit({ pastMonths, recentExpenses, avgMonthlyExpense, recurringCommitments = [] }) {
  let essentialSum = 0;
  let totalSum = 0;

  for (const e of recentExpenses || []) {
    totalSum += e.amount;
    if (ESSENTIAL_CATEGORIES.has(e.category)) essentialSum += e.amount;
  }

  for (const m of pastMonths || []) {
    const breakdown = parseCategoryBreakdown(m.category_breakdown);
    if (!breakdown) continue;
    for (const [category, amount] of Object.entries(breakdown)) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) continue;
      totalSum += n;
      if (ESSENTIAL_CATEGORIES.has(category)) essentialSum += n;
    }
  }

  // No category-level data anywhere yet — don't pretend to know the split;
  // use a documented, conservative default instead of guessing a number.
  const hasCategoryData = totalSum > 0;
  const essentialRatio = hasCategoryData ? Math.min(1, essentialSum / totalSum) : 0.55;

  let essentialMonthlyExpense = round2(avgMonthlyExpense * essentialRatio);
  const recurringEssential = (recurringCommitments || []).reduce((sum, c) => {
    return ESSENTIAL_CATEGORIES.has(c.category) ? sum + (Number(c.amount) || 0) : sum;
  }, 0);
  if (recurringEssential > essentialMonthlyExpense) {
    essentialMonthlyExpense = round2(recurringEssential);
  }
  const discretionaryMonthlyExpense = round2(Math.max(0, avgMonthlyExpense - essentialMonthlyExpense));
  const recurringMonthlyTotal = round2(
    (recurringCommitments || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
  );

  return {
    essentialMonthlyExpense,
    discretionaryMonthlyExpense,
    essentialRatioPct: round2(essentialRatio * 100),
    hasCategoryData,
    recurringMonthlyTotal,
  };
}

/**
 * Simulate the projected *available-to-spend* balance (after safety buffer)
 * at the start of each of the next N future full months, assuming the
 * estimated average monthly expense repeats.
 */
function simulateFutureMonths({ startBalance, salary, avgMonthlyExpense, safetyBufferPct, monthsAhead }) {
  const timeline = [];
  let balance = startBalance;
  for (let i = 1; i <= monthsAhead; i++) {
    balance = balance + salary - avgMonthlyExpense;
    const safetyBuffer = (safetyBufferPct / 100) * salary;
    timeline.push({
      monthsFromNow: i,
      projectedBalance: round2(balance),
      projectedAvailable: round2(balance - safetyBuffer),
    });
  }
  return timeline;
}

function monthDiff(fromKey, toKey) {
  const [fy, fm] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * FEATURE A — "Can I afford ₹X in [specific month]?"
 * Projects forward to the requested month and tells the user whether it's
 * affordable, and if so, which date within that month is the smart moment
 * to buy — with a short verdict plus a handful of concrete, data-derived
 * facts (never a guessy paragraph).
 */
export function checkAffordability({ amount, targetMonthKey, today, budget, settings, avgMonthlyExpense, essentialSplit }) {
  const cur = settings.currency || "₹";
  const { essentialMonthlyExpense, discretionaryMonthlyExpense } = essentialSplit;
  const currentMonthKey = monthKey(today);
  const offset = monthDiff(currentMonthKey, targetMonthKey);

  if (offset < 0) {
    return {
      affordable: false,
      reasoning: "That month is in the past.",
      facts: ["Pick the current month or a future one instead."],
    };
  }

  if (offset === 0) {
    // Target is the current salary cycle — use real remaining-days math,
    // split between essential (committed) and discretionary spend.
    const essentialDailyRate = essentialMonthlyExpense / 30;
    const discretionaryDailyRate = discretionaryMonthlyExpense / 30;
    let estEssentialRemaining = round2(essentialDailyRate * budget.daysRemaining);
    const reservedRecurring = budget.unpaidRecurringThisCycle || 0;
    if (reservedRecurring > 0) {
      estEssentialRemaining = round2(Math.max(0, estEssentialRemaining - reservedRecurring));
    }
    const estDiscretionaryRemaining = round2(discretionaryDailyRate * budget.daysRemaining);
    const estimatedRemainingSpend = round2(estEssentialRemaining + estDiscretionaryRemaining);
    const projectedAvailable = round2(budget.spendableBalance - estimatedRemainingSpend);
    const surplus = round2(projectedAvailable - amount);
    const affordable = surplus >= 0;
    const balanceAfterPurchase = round2(budget.spendableBalance - amount);
    const essentialCushion = round2(balanceAfterPurchase - estEssentialRemaining);

    const facts = [
      `${budget.daysRemaining} day(s) left this cycle, ${cur}${budget.spendableBalance} spendable now`,
      `Your usual remaining spend: ~${cur}${estimatedRemainingSpend} (essentials ~${cur}${estEssentialRemaining}, discretionary ~${cur}${estDiscretionaryRemaining})`,
    ];
    if (essentialSplit.recurringMonthlyTotal > 0) {
      facts.splice(1, 0, `Monthly bills (rent, EMI, etc.): ${cur}${essentialSplit.recurringMonthlyTotal} every month`);
    }

    if (affordable) {
      const comfortable = surplus >= amount * 0.2 || surplus >= budget.dailyAllowance * 3;
      facts.push(
        essentialCushion >= 0
          ? `Still leaves ~${cur}${essentialCushion} beyond essentials for the rest of the cycle`
          : `Cuts ~${cur}${Math.abs(essentialCushion)} into money usually reserved for essentials — tight`
      );
      let recommendedDate;
      let reasoning;
      if (comfortable) {
        recommendedDate = toISODate(today);
        reasoning = "You can buy it today.";
      } else {
        const daysToWait = Math.min(budget.daysRemaining - 1, Math.max(0, Math.ceil(amount / Math.max(budget.dailyAllowance, 1)) - 1));
        const target = new Date(today);
        target.setDate(target.getDate() + daysToWait);
        recommendedDate = toISODate(target);
        reasoning = daysToWait > 0 ? `Affordable, but margin is thin — wait ${daysToWait} day(s) for more buffer.` : "Affordable, but the margin is thin.";
      }
      return {
        affordable: true,
        targetMonthKey,
        projectedAvailable,
        surplus,
        recommendedDate,
        reasoning,
        facts,
      };
    }

    const shortfall = round2(amount - projectedAvailable);
    facts.push(
      essentialCushion >= 0
        ? `You'd still be ~${cur}${shortfall} short even with essentials covered`
        : `Essentials alone need ~${cur}${estEssentialRemaining} — this purchase isn't realistic this cycle`
    );
    return {
      affordable: false,
      targetMonthKey,
      projectedAvailable,
      shortfall,
      reasoning: `Short by ~${cur}${shortfall} this cycle.`,
      facts,
    };
  }

  // Future month: simulate forward using the essential/discretionary-aware average.
  const timeline = simulateFutureMonths({
    startBalance: settings.current_balance,
    salary: settings.monthly_salary,
    avgMonthlyExpense,
    safetyBufferPct: settings.safety_buffer_pct,
    monthsAhead: offset,
  });
  const targetProjection = timeline[timeline.length - 1];
  const surplus = round2(targetProjection.projectedAvailable - amount);
  const affordable = surplus >= 0;

  const facts = [
    `Typical monthly spend: ~${cur}${avgMonthlyExpense} (essentials ~${cur}${essentialMonthlyExpense}, discretionary ~${cur}${discretionaryMonthlyExpense})`,
    `Projected available in ${targetMonthKey}: ~${cur}${targetProjection.projectedAvailable} after safety buffer`,
  ];
  if (essentialSplit.recurringMonthlyTotal > 0) {
    facts.splice(1, 0, `Includes monthly bills of ${cur}${essentialSplit.recurringMonthlyTotal} (rent, EMI, etc.)`);
  }

  if (affordable) {
    const target = new Date(today);
    target.setMonth(target.getMonth() + offset);
    const safeDay = Math.min(settings.salary_day + 2, daysInMonth(target.getFullYear(), target.getMonth()));
    const recommendedDate = toISODate(new Date(target.getFullYear(), target.getMonth(), safeDay));
    facts.push(`Buying leaves ~${cur}${surplus} beyond your usual monthly needs`);
    return {
      affordable: true,
      targetMonthKey,
      projectedAvailable: targetProjection.projectedAvailable,
      surplus,
      recommendedDate,
      reasoning: `Affordable by ${targetMonthKey} — buy around ${recommendedDate}.`,
      facts,
    };
  }

  const nextAffordableOffset = timeline.findIndex((t) => round2(t.projectedAvailable - amount) >= 0);
  const shortfall = round2(amount - targetProjection.projectedAvailable);
  facts.push(`That's ~${cur}${shortfall} short of the ${cur}${amount} needed`);
  if (nextAffordableOffset >= 0) {
    const nm = addMonths(today, nextAffordableOffset + 1);
    facts.push(`${monthKey(nm)} looks realistic at your current pace instead`);
  }
  return {
    affordable: false,
    targetMonthKey,
    projectedAvailable: targetProjection.projectedAvailable,
    shortfall,
    reasoning: `Short by ~${cur}${shortfall} in ${targetMonthKey}.`,
    facts,
  };
}

/**
 * FEATURE B — "When can I comfortably afford ₹X for <item>?" (no month given)
 * Walks forward month by month (starting with the current cycle) until the
 * projected available balance covers the amount, and returns that timing —
 * with a short verdict plus concrete facts.
 */
export function predictPurchaseTiming({ amount, today, budget, settings, avgMonthlyExpense, essentialSplit, maxMonthsAhead = 24 }) {
  const cur = settings.currency || "₹";
  const { essentialMonthlyExpense, discretionaryMonthlyExpense } = essentialSplit;
  const estDailySpend = avgMonthlyExpense / 30;
  const reservedRecurring = budget.unpaidRecurringThisCycle || 0;
  const estimatedRemainingSpend = round2(Math.max(0, estDailySpend * budget.daysRemaining - reservedRecurring));
  const projectedAvailableNow = round2(budget.spendableBalance - estimatedRemainingSpend);

  if (projectedAvailableNow >= amount) {
    const surplus = round2(projectedAvailableNow - amount);
    return {
      possible: true,
      monthsFromNow: 0,
      recommendedMonth: monthKey(today),
      recommendedDate: toISODate(today),
      projectedAvailable: projectedAvailableNow,
      reasoning: "You can buy it comfortably today.",
      facts: [
        `Available now after typical remaining spend: ~${cur}${projectedAvailableNow}`,
        `That's ~${cur}${surplus} to spare beyond the ${cur}${amount} needed`,
      ],
    };
  }

  const timeline = simulateFutureMonths({
    startBalance: settings.current_balance,
    salary: settings.monthly_salary,
    avgMonthlyExpense,
    safetyBufferPct: settings.safety_buffer_pct,
    monthsAhead: maxMonthsAhead,
  });

  const hit = timeline.find((t) => t.projectedAvailable >= amount);
  const baseFacts = [`Typical monthly spend: ~${cur}${avgMonthlyExpense} (essentials ~${cur}${essentialMonthlyExpense}, discretionary ~${cur}${discretionaryMonthlyExpense})`];
  if (essentialSplit.recurringMonthlyTotal > 0) {
    baseFacts.push(`Includes monthly bills of ${cur}${essentialSplit.recurringMonthlyTotal} (rent, EMI, etc.)`);
  }

  if (!hit) {
    const monthlySavings = round2(settings.monthly_salary - avgMonthlyExpense);
    return {
      possible: false,
      reasoning: monthlySavings <= 0 ? "Not projected within reach at your current spending rate." : `More than ${maxMonthsAhead} months away at your current pace.`,
      facts: [
        ...baseFacts,
        monthlySavings <= 0
          ? `Spending (~${cur}${avgMonthlyExpense}/mo) is at or above your salary (${cur}${settings.monthly_salary}/mo)`
          : `You save ~${cur}${monthlySavings}/mo at this pace — cutting discretionary spend (~${cur}${discretionaryMonthlyExpense}/mo) would speed this up`,
      ],
    };
  }

  const targetDate = addMonths(today, hit.monthsFromNow);
  const safeDay = Math.min((settings.salary_day || 1) + 2, daysInMonth(targetDate.getFullYear(), targetDate.getMonth()));
  const recommendedDate = toISODate(new Date(targetDate.getFullYear(), targetDate.getMonth(), safeDay));

  return {
    possible: true,
    monthsFromNow: hit.monthsFromNow,
    recommendedMonth: monthKey(targetDate),
    recommendedDate,
    projectedAvailable: hit.projectedAvailable,
    reasoning: `Best time: ~${monthKey(targetDate)} — buy around ${recommendedDate}.`,
    facts: [...baseFacts, `Projected available then: ~${cur}${hit.projectedAvailable}`, `That's ${hit.monthsFromNow} month(s) of saving at your current pace`],
  };
}
