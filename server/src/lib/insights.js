import { categoryMeta } from "./categorize.js";
import { round2 } from "./budget.js";

export function categoryBreakdown(expenses) {
  const totals = new Map();
  let grandTotal = 0;
  for (const e of expenses) {
    totals.set(e.category, (totals.get(e.category) || 0) + e.amount);
    grandTotal += e.amount;
  }
  const rows = [...totals.entries()].map(([category, total]) => {
    const meta = categoryMeta(category);
    return {
      category,
      total: round2(total),
      pct: grandTotal > 0 ? round2((total / grandTotal) * 100) : 0,
      color: meta.color,
      icon: meta.icon,
    };
  });
  rows.sort((a, b) => b.total - a.total);
  return { rows, grandTotal: round2(grandTotal) };
}

/**
 * Same shape as categoryBreakdown(), but also folds in category totals
 * captured from scanned monthly-summary screenshots (past_months.category_breakdown)
 * for months that predate detailed day-to-day expense logging. This is what
 * lets category-wise data pulled from an image scan actually feed analytics,
 * instead of sitting unused in the database.
 */
export function categoryBreakdownWithPastMonths(expenses, pastMonths) {
  const totals = new Map();
  let grandTotal = 0;
  for (const e of expenses) {
    totals.set(e.category, (totals.get(e.category) || 0) + e.amount);
    grandTotal += e.amount;
  }
  for (const m of pastMonths || []) {
    if (!m.category_breakdown) continue;
    let parsed = m.category_breakdown;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = null;
      }
    }
    if (!parsed || typeof parsed !== "object") continue;
    for (const [category, amount] of Object.entries(parsed)) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) continue;
      totals.set(category, (totals.get(category) || 0) + n);
      grandTotal += n;
    }
  }
  const rows = [...totals.entries()].map(([category, total]) => {
    const meta = categoryMeta(category);
    return {
      category,
      total: round2(total),
      pct: grandTotal > 0 ? round2((total / grandTotal) * 100) : 0,
      color: meta.color,
      icon: meta.icon,
    };
  });
  rows.sort((a, b) => b.total - a.total);
  return { rows, grandTotal: round2(grandTotal) };
}

/**
 * How the cash still in the account is spoken for, using the same order as
 * the budget: safety buffer, then the savings goal, then bills not yet paid,
 * and whatever is left is free to spend. "Spent this cycle" is separate —
 * that money has already left the balance.
 */
export function cycleSplit(settings, budget) {
  const balance = Math.max(0, Number(settings?.current_balance) || 0);
  let remaining = balance;
  const take = (label, wanted, color) => {
    const amount = round2(Math.min(remaining, Math.max(0, Number(wanted) || 0)));
    remaining = round2(Math.max(0, remaining - amount));
    return { label, amount, color };
  };
  const reserved = [
    take("Safety buffer", budget?.safetyBufferAmount, "#22d3ee"),
    take("Savings goal", budget?.savingsGoalAmount, "#a78bfa"),
    take("Bills still due", budget?.unpaidRecurringThisCycle, "#fbbf24"),
    take("Free to spend", remaining, "#34d399"),
  ];
  const spent = round2(Math.max(0, Number(budget?.spentThisCycle) || 0));
  return [
    ...(spent > 0 ? [{ label: "Spent this cycle", amount: spent, color: "#fb7185" }] : []),
    ...reserved,
  ].filter((row) => row.amount > 0);
}

export function monthlyTrend(pastMonths, currentMonthKey, currentSalary, currentSpent) {
  const trend = pastMonths.map((m) => ({
    month: m.month,
    salary: m.salary,
    spent: m.total_spent,
    savings: round2(m.salary - m.total_spent),
    isCurrent: false,
  }));
  const alreadyHasCurrent = trend.some((t) => t.month === currentMonthKey);
  if (!alreadyHasCurrent) {
    trend.push({
      month: currentMonthKey,
      salary: currentSalary,
      spent: round2(currentSpent),
      savings: round2(currentSalary - currentSpent),
      isCurrent: true,
    });
  }
  trend.sort((a, b) => (a.month > b.month ? 1 : -1));
  return trend;
}

/**
 * Rule-based "smart" insight generator. Produces short, tailored,
 * human-readable observations & savings tips from the user's own data,
 * rather than generic advice.
 */
function money(amount, currency = "₹") {
  const n = Math.round(Math.abs(Number(amount) || 0));
  const formatted = n.toLocaleString("en-IN");
  return `${Number(amount) < 0 ? "-" : ""}${currency}${formatted}`;
}

export function generateInsights({ breakdown, salary, budget, trend, expenseCount, currency = "₹", currentBalance = 0 }) {
  const insights = [];

  if (expenseCount === 0) {
    insights.push({
      type: "info",
      title: "Add a few expenses to unlock insights",
      message: "Once you log some spending, this panel will surface patterns, risks and personalised saving tips.",
    });
  }

  // 1. Top category concentration
  if (breakdown.rows.length > 0) {
    const top = breakdown.rows[0];
    if (top.pct >= 30) {
      insights.push({
        type: "warning",
        title: `${top.category} is eating your budget`,
        message: `${top.pct}% of your tracked spending (₹${top.total}) is going to ${top.category}. Trimming even 15% here would free up roughly ₹${round2(top.total * 0.15)} this cycle.`,
      });
    } else {
      insights.push({
        type: "info",
        title: `Biggest spend: ${top.category}`,
        message: `${top.category} makes up ${top.pct}% of your spending so far (₹${top.total}). It's your #1 category this cycle.`,
      });
    }
  }

  // 2. Salary utilisation / burn rate
  if (salary > 0 && budget) {
    const utilisation = round2((budget.spentThisCycle / salary) * 100);
    if (budget.projectedEndOfCycleBalance < 0) {
      insights.push({
        type: "danger",
        title: "You're on track to run out before payday",
        message: `At your current pace (₹${budget.burnRatePerDay}/day), your balance is projected to hit ₹${budget.projectedEndOfCycleBalance} before your next salary. Consider slowing spending to about ₹${budget.dailyAllowance}/day for the rest of this cycle.`,
      });
    } else if (utilisation > 0) {
      insights.push({
        type: utilisation > 80 ? "warning" : "success",
        title: utilisation > 80 ? "Spending is running hot" : "Spending is well under control",
        message: `You've used ${utilisation}% of your monthly salary so far this cycle, with ${budget.daysRemaining} day(s) left before your next payday.`,
      });
    }
  }

  // 3. Is the savings goal actually still covered by the balance?
  if (budget && budget.savingsGoalAmount > 0) {
    const needed = round2(budget.safetyBufferAmount + budget.savingsGoalAmount + (budget.unpaidRecurringThisCycle || 0));
    if (currentBalance + 0.5 >= needed) {
      insights.push({
        type: "success",
        title: "Savings goal is still set aside",
        message: `${money(budget.savingsGoalAmount, currency)} for savings is fully covered, on top of your safety buffer. ${money(budget.spendableBalance, currency)} is free to spend before payday.`,
      });
    } else {
      const short = round2(needed - currentBalance);
      insights.push({
        type: "warning",
        title: "Savings goal is no longer fully covered",
        message: `Holding the ${money(budget.savingsGoalAmount, currency)} savings goal, the safety buffer, and upcoming bills together needs ${money(short, currency)} more than your current balance.`,
      });
    }
  }

  // 4. Pace against the daily plan (the number the home screen actually uses)
  if (budget && budget.dailyBudget > 0 && budget.daysElapsed > 0 && budget.spentThisCycle > 0) {
    const pace = round2(budget.spentThisCycle / budget.daysElapsed);
    if (pace > budget.dailyBudget) {
      insights.push({
        type: "warning",
        title: "Daily pace is above your plan",
        message: `You're averaging ${money(pace, currency)} a day against a ${money(budget.dailyBudget, currency)} daily plan. Staying at the plan is what keeps the savings goal intact until payday.`,
      });
    } else {
      insights.push({
        type: "success",
        title: "Daily pace fits your plan",
        message: `You're averaging ${money(pace, currency)} a day, within the ${money(budget.dailyBudget, currency)} daily plan, with ${budget.daysRemaining} day(s) left in this cycle.`,
      });
    }
  }

  // 5. Month-over-month trend
  if (trend.length >= 2) {
    const last = trend[trend.length - 2];
    const current = trend[trend.length - 1];
    if (last.spent > 0) {
      const delta = round2(((current.spent - last.spent) / last.spent) * 100);
      if (delta > 10) {
        insights.push({
          type: "warning",
          title: "Spending is trending up",
          message: `You've spent ${Math.abs(delta)}% more so far this month compared to ${last.month}. Keep an eye on discretionary categories like ${breakdown.rows[0]?.category ?? "Shopping"}.`,
        });
      } else if (delta < -10) {
        insights.push({
          type: "success",
          title: "Great progress vs. last month",
          message: `You're spending ${Math.abs(delta)}% less so far than in ${last.month}. Consider moving the difference straight into savings/investments.`,
        });
      }
    }
  }

  // 5. Savings rate insight
  if (trend.length > 0) {
    const avgSavingsRate = trend.reduce((sum, t) => sum + (t.salary > 0 ? (t.savings / t.salary) : 0), 0) / trend.length;
    const pct = round2(avgSavingsRate * 100);
    if (pct < 10) {
      insights.push({
        type: "warning",
        title: "Savings rate is low",
        message: `On average you're saving about ${pct}% of your salary. Financial guidelines often suggest aiming for 20%+ — even automating a small SIP right after payday can help.`,
      });
    } else if (pct >= 20) {
      insights.push({
        type: "success",
        title: "Healthy savings rate",
        message: `You're saving roughly ${pct}% of your salary on average — that's a solid, sustainable rate. Keep it up!`,
      });
    }
  }

  // 6. Subscriptions / recurring nudge
  const subs = breakdown.rows.find((r) => r.category === "Subscriptions" || r.category === "Entertainment");
  if (subs && subs.pct > 8) {
    insights.push({
      type: "info",
      title: "Check your subscriptions",
      message: `₹${subs.total} (${subs.pct}%) is going towards ${subs.category}. Review for overlapping or unused subscriptions you could cancel.`,
    });
  }

  return insights;
}
