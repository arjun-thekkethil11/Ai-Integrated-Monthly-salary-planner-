import { db } from "../db.js";

// Free-tier friendly defaults — override via server/.env.
//
// IMPORTANT: text and image calls share the SAME underlying model quota at
// the provider (e.g. Gemini's free tier is a flat N requests/day for a given
// model, regardless of whether the request was text or vision). So on top of
// per-kind soft limits (mainly to keep image bursts cheap, since a screenshot
// costs far more tokens than a short prompt), we enforce one combined daily
// budget across both kinds — weighted, since an image call is "worth" more.
const MAX_TEXT_PER_MINUTE = intEnv("AI_MAX_TEXT_PER_MINUTE", 4);
const MAX_IMAGE_PER_MINUTE = intEnv("AI_MAX_IMAGE_PER_MINUTE", 1);
const SHARED_MAX_PER_DAY = intEnv("AI_MAX_REQUESTS_PER_DAY", 15); // stay under typical free-tier ~20/day
const IMAGE_REQUEST_WEIGHT = intEnv("AI_IMAGE_REQUEST_WEIGHT", 2); // an image call "costs" 2x a text call

function intEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function perMinuteFor(kind) {
  return kind === "image" ? MAX_IMAGE_PER_MINUTE : MAX_TEXT_PER_MINUTE;
}

function weightFor(kind) {
  return kind === "image" ? IMAGE_REQUEST_WEIGHT : 1;
}

// In-memory sliding window for burst protection (per-minute). Doesn't need
// to survive restarts — a restart naturally clears any burst.
const recentCalls = { text: [], image: [] };

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function usageRow(kind, day = todayKey()) {
  return db.prepare("SELECT count FROM ai_usage WHERE key = ?").get(`${day}|${kind}`);
}

export function getUsageToday(kind) {
  return usageRow(kind)?.count || 0;
}

function weightedUsageToday() {
  return getUsageToday("text") * weightFor("text") + getUsageToday("image") * weightFor("image");
}

export function getAiLimits() {
  const used = weightedUsageToday();
  return {
    sharedPerDay: SHARED_MAX_PER_DAY,
    sharedUsedToday: used,
    sharedRemainingToday: Math.max(0, SHARED_MAX_PER_DAY - used),
    text: { perMinute: MAX_TEXT_PER_MINUTE, weight: 1, usedToday: getUsageToday("text") },
    image: { perMinute: MAX_IMAGE_PER_MINUTE, weight: IMAGE_REQUEST_WEIGHT, usedToday: getUsageToday("image") },
  };
}

/**
 * Checks (and, if allowed, atomically consumes) one unit of AI quota for the
 * given kind ('text' | 'image'). Always call this immediately before making
 * the actual model call. Never throws — returns a plain result object so
 * every caller can decide how to surface it.
 */
export function checkAndConsumeAiQuota(kind = "text") {
  const perMinute = perMinuteFor(kind);
  const now = Date.now();
  const bucket = recentCalls[kind] || (recentCalls[kind] = []);
  const recent = bucket.filter((t) => now - t < 60_000);
  recentCalls[kind] = recent;

  if (recent.length >= perMinute) {
    return {
      ok: false,
      reason: `AI is on a free-tier plan and briefly rate-limited (max ${perMinute} ${kind} request${perMinute === 1 ? "" : "s"}/minute). Give it a moment and try again.`,
    };
  }

  const weight = weightFor(kind);
  const usedWeighted = weightedUsageToday();
  if (usedWeighted + weight > SHARED_MAX_PER_DAY) {
    return {
      ok: false,
      reason: `Daily free-tier AI budget reached (${SHARED_MAX_PER_DAY} request${SHARED_MAX_PER_DAY === 1 ? "" : "s"}/day, shared across text & photo scans). It resets tomorrow — manual entry still works perfectly in the meantime.`,
    };
  }

  recent.push(now);
  const day = todayKey();
  db.prepare(
    `INSERT INTO ai_usage (key, day, kind, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET count = count + 1`
  ).run(`${day}|${kind}`, day, kind);

  return { ok: true, remainingToday: Math.max(0, SHARED_MAX_PER_DAY - usedWeighted - weight) };
}
