import { round2 } from "./budget.js";
import { addMonths, monthKey, daysInMonth, toISODate } from "./dates.js";

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
 * to buy (and why).
 */
export function checkAffordability({ amount, targetMonthKey, today, budget, settings, avgMonthlyExpense }) {
  const currentMonthKey = monthKey(today);
  const offset = monthDiff(currentMonthKey, targetMonthKey);

  if (offset < 0) {
    return { affordable: false, reasoning: "That month is in the past — pick the current month or a future one." };
  }

  const safetyBufferAmount = (settings.safety_buffer_pct / 100) * settings.monthly_salary;

  if (offset === 0) {
    // Target is the current salary cycle.
    const estDailySpend = avgMonthlyExpense / 30;
    const estimatedRemainingSpend = round2(estDailySpend * budget.daysRemaining);
    const projectedAvailable = round2(budget.spendableBalance - estimatedRemainingSpend);
    const surplus = round2(projectedAvailable - amount);
    const affordable = surplus >= 0;

    if (affordable) {
      const comfortable = surplus >= amount * 0.2 || surplus >= budget.dailyAllowance * 3;
      let recommendedDate;
      let reasoning;
      if (comfortable) {
        recommendedDate = toISODate(today);
        reasoning = `After accounting for your typical remaining spend this cycle (~₹${estimatedRemainingSpend}), you're projected to have ₹${projectedAvailable} available — comfortably more than the ₹${amount} you need. You can buy it today.`;
      } else {
        // find the day within the remaining cycle where accumulated daily surplus covers the amount
        const dailySurplus = Math.max(budget.dailyAllowance - estDailySpend, 1);
        const daysToWait = Math.min(budget.daysRemaining - 1, Math.max(0, Math.ceil(amount / Math.max(budget.dailyAllowance, 1)) - 1));
        const target = new Date(today);
        target.setDate(target.getDate() + daysToWait);
        recommendedDate = toISODate(target);
        reasoning = `It's affordable, but the margin is thin (₹${surplus} left after this purchase). Waiting ~${daysToWait} day(s) lets a bit more buffer build up before you spend, so ${recommendedDate} is a safer moment than right now.`;
      }
      return {
        affordable: true,
        targetMonthKey,
        projectedAvailable,
        surplus,
        recommendedDate,
        reasoning,
      };
    }

    const shortfall = round2(amount - projectedAvailable);
    return {
      affordable: false,
      targetMonthKey,
      projectedAvailable,
      shortfall,
      reasoning: `Based on your remaining balance and typical spending (~₹${estimatedRemainingSpend} left this cycle), you're projected to have only ₹${projectedAvailable} available — that's ₹${shortfall} short of ₹${amount}. Consider trimming discretionary spend, or check when it becomes affordable using the "best time to buy" tool.`,
    };
  }

  // Future month: simulate forward.
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

  if (affordable) {
    const target = new Date(today);
    target.setMonth(target.getMonth() + offset);
    const safeDay = Math.min(settings.salary_day + 2, daysInMonth(target.getFullYear(), target.getMonth()));
    const recommendedDate = toISODate(new Date(target.getFullYear(), target.getMonth(), safeDay));
    return {
      affordable: true,
      targetMonthKey,
      projectedAvailable: targetProjection.projectedAvailable,
      surplus,
      recommendedDate,
      reasoning: `Projecting forward ${offset} month(s) at your typical salary/spend pattern, you should have about ₹${targetProjection.projectedAvailable} available in ${targetMonthKey} — enough to cover ₹${amount}. Buying a couple of days after your salary lands (around ${recommendedDate}) gives you the freshest cash cushion with the whole month still ahead to recover.`,
    };
  }

  const nextAffordableOffset = timeline.findIndex((t) => round2(t.projectedAvailable - amount) >= 0);
  let extraNote = "";
  if (nextAffordableOffset >= 0) {
    const nm = addMonths(today, nextAffordableOffset + 1);
    extraNote = ` At this pace, ${monthKey(nm)} looks more realistic instead.`;
  }
  const shortfall = round2(amount - targetProjection.projectedAvailable);
  return {
    affordable: false,
    targetMonthKey,
    projectedAvailable: targetProjection.projectedAvailable,
    shortfall,
    reasoning: `Projecting forward to ${targetMonthKey}, you're likely to have only ₹${targetProjection.projectedAvailable} available — ₹${shortfall} short of the ₹${amount} needed, assuming spending stays at your typical rate.${extraNote}`,
  };
}

/**
 * FEATURE B — "When can I comfortably afford ₹X for <item>?" (no month given)
 * Walks forward month by month (starting with the current cycle) until the
 * projected available balance covers the amount, and returns that timing.
 */
export function predictPurchaseTiming({ amount, today, budget, settings, avgMonthlyExpense, maxMonthsAhead = 24 }) {
  const estDailySpend = avgMonthlyExpense / 30;
  const estimatedRemainingSpend = round2(estDailySpend * budget.daysRemaining);
  const projectedAvailableNow = round2(budget.spendableBalance - estimatedRemainingSpend);

  if (projectedAvailableNow >= amount) {
    const surplus = round2(projectedAvailableNow - amount);
    return {
      possible: true,
      monthsFromNow: 0,
      recommendedMonth: monthKey(today),
      recommendedDate: toISODate(today),
      projectedAvailable: projectedAvailableNow,
      reasoning: `Good news — right now you're projected to have ₹${projectedAvailableNow} available after typical remaining spend this cycle, which already covers the ₹${amount} you need (₹${surplus} to spare). You can buy it comfortably today.`,
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
  if (!hit) {
    const monthlySavings = round2(settings.monthly_salary - avgMonthlyExpense);
    return {
      possible: false,
      reasoning: monthlySavings <= 0
        ? `At your current spending rate (~₹${avgMonthlyExpense}/month vs. ₹${settings.monthly_salary} salary), you're not projected to build up enough surplus for ₹${amount} within the next ${maxMonthsAhead} months. Reducing monthly spend is the fastest way to bring this within reach.`
        : `You're saving about ₹${monthlySavings}/month at your current pace, which is slower than ideal — this purchase looks more than ${maxMonthsAhead} months away. Consider increasing your savings rate to get there sooner.`,
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
    reasoning: `At your typical savings pace, you'll comfortably be able to afford ₹${amount} in about ${hit.monthsFromNow} month(s) — around ${monthKey(targetDate)}. Aim to buy it a couple of days after payday (${recommendedDate}) when your balance is freshest.`,
  };
}
