// Small date helper utilities (kept dependency-free on purpose).
//
// IMPORTANT: we always format dates using their *local* calendar fields
// (getFullYear/getMonth/getDate), never toISOString(), because
// toISOString() converts to UTC first and silently shifts the date by a
// day for users in positive UTC offsets (e.g. IST).

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function addMonths(d, n) {
  const copy = new Date(d);
  copy.setMonth(copy.getMonth() + n);
  return copy;
}

export function daysBetween(a, b) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86400000);
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Given "today" and the salary credit day-of-month, compute the current
 * salary cycle window: [cycleStart, cycleEnd] inclusive, where cycleStart is
 * the most recent salary date on/before today, and cycleEnd is the day
 * before the next salary date. This lets budgeting follow the user's actual
 * pay cycle rather than the plain calendar month.
 */
export function getSalaryCycle(today, salaryDay) {
  const t = startOfDay(today);
  const clampDay = (year, month, day) => Math.min(day, daysInMonth(year, month));

  let cycleStartCandidate = new Date(t.getFullYear(), t.getMonth(), clampDay(t.getFullYear(), t.getMonth(), salaryDay));

  let cycleStart;
  if (t.getDate() >= cycleStartCandidate.getDate()) {
    cycleStart = cycleStartCandidate;
  } else {
    const prevMonth = addMonths(cycleStartCandidate, -1);
    cycleStart = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), clampDay(prevMonth.getFullYear(), prevMonth.getMonth(), salaryDay));
  }

  const nextMonthAnchor = addMonths(cycleStart, 1);
  const cycleEndExclusive = new Date(
    nextMonthAnchor.getFullYear(),
    nextMonthAnchor.getMonth(),
    clampDay(nextMonthAnchor.getFullYear(), nextMonthAnchor.getMonth(), salaryDay)
  );
  const cycleEnd = addDays(cycleEndExclusive, -1);

  return { cycleStart: startOfDay(cycleStart), cycleEnd: startOfDay(cycleEnd), nextCycleStart: startOfDay(cycleEndExclusive) };
}

export function formatISO(d) {
  return toISODate(d);
}
