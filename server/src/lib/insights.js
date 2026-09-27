import { categoryMeta } from "./categorize.js";
import { round2 } from "./budget.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export function dayOfWeekPattern(expenses) {
  const totals = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (const e of expenses) {
    const day = new Date(e.date + "T00:00:00").getDay();
    totals[day] += e.amount;
    counts[day] += 1;
  }
  return DAY_NAMES.map((name, i) => ({
    day: name,
    total: round2(totals[i]),
    average: counts[i] > 0 ? round2(totals[i] / counts[i]) : 0,
    count: counts[i],
  }));
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
export function generateInsights({ breakdown, salary, budget, trend, dayPattern, expenseCount }) {
  const insights = [];

  if (expenseCount === 0) {
    insights.push({
      type: "info",
      title: "Add a few expenses to unlock insights",
      message: "Once you log some spending, this panel will surface patterns, risks and personalised saving tips.",
    });
    return insights;
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

  // 3. Day-of-week pattern
  const busiestDay = [...dayPattern].sort((a, b) => b.total - a.total)[0];
  if (busiestDay && busiestDay.total > 0) {
    insights.push({
      type: "info",
      title: `You spend the most on ${busiestDay.day}s`,
      message: `Historically ₹${busiestDay.total} total has gone out on ${busiestDay.day}s. Planning ahead for that day (e.g. meal-prepping or setting a cap) could help you save.`,
    });
  }

  // 4. Month-over-month trend
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
