import "../env.js";
import OpenAI from "openai";
import { checkAndConsumeAiQuota, getAiLimits } from "./aiGuardrail.js";

let client = null;

// How long a single call is allowed to hang before we give up and tell the
// user, instead of leaving the UI spinning. Vision calls (screenshots) get
// longer, since they carry more image tokens to read.
const TEXT_TIMEOUT_MS = 20_000;
const IMAGE_TIMEOUT_MS = 35_000;

export function isAiEnabled() {
  return !!process.env.OPENAI_API_KEY;
}

export function aiModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export { getAiLimits };

function getClient() {
  if (!isAiEnabled()) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      // The SDK's own retry loop silently waits and re-sends on 429/5xx —
      // on a rate-limited free-tier key that means the caller (and the
      // user staring at a spinner) waits through 1-2 extra full timeouts
      // before ever seeing an error. We handle rate limits ourselves below
      // instead, so failures surface fast.
      maxRetries: 0,
    });
  }
  return client;
}

// Free-tier keys (Gemini's included) cap requests/day PER MODEL — once that
// cap is hit, every call 429s instantly for a while. Remembering that for a
// short cooldown means the 2nd+ attempt fails immediately with a clear
// "try again in Ns" instead of repeating the same slow round trip.
let providerCooldownUntil = 0;
let providerCooldownReason = null;

function extractRetrySeconds(err) {
  const message = err?.error?.error?.message || err?.message || "";
  const match = /retry in ([\d.]+)\s*s/i.exec(message) || /retryDelay"\s*:\s*"(\d+)s?"/i.exec(message);
  const seconds = match ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 30;
}

function isRateLimit(err) {
  return err?.status === 429 || err?.statusCode === 429 || /RESOURCE_EXHAUSTED|rate.?limit/i.test(err?.message || "");
}

function isTimeout(err) {
  return err?.name === "APIConnectionTimeoutError" || err?.code === "ETIMEDOUT" || /timeout/i.test(err?.message || "");
}

/**
 * Ask the model for a chat completion. Never throws — always resolves to
 * { text, blocked, reason }. `blocked` means the free-tier guardrail (or a
 * known provider rate-limit) stopped the call before/without spending more
 * tokens; `reason` is a human-readable message safe to show the user in
 * either case (blocked, or any other failure).
 */
async function complete({ system, user, images = [], temperature = 0.4, maxTokens = 1500, kind = "text" }) {
  const c = getClient();
  if (!c) return { text: null, blocked: false, reason: "AI isn't configured." };

  if (Date.now() < providerCooldownUntil) {
    const waitSec = Math.ceil((providerCooldownUntil - Date.now()) / 1000);
    return { text: null, blocked: true, reason: providerCooldownReason || `AI provider is rate-limited — try again in ${waitSec}s.` };
  }

  const gate = checkAndConsumeAiQuota(kind);
  if (!gate.ok) {
    console.warn(`[ai] blocked (${kind}):`, gate.reason);
    return { text: null, blocked: true, reason: gate.reason };
  }

  const userContent =
    images.length === 0
      ? user
      : [
          { type: "text", text: user },
          ...images.map((url) => ({ type: "image_url", image_url: { url } })),
        ];

  const timeoutMs = kind === "image" ? IMAGE_TIMEOUT_MS : TEXT_TIMEOUT_MS;

  try {
    const res = await c.chat.completions.create(
      {
        model: aiModel(),
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      },
      { timeout: timeoutMs }
    );
    if (process.env.AI_DEBUG) console.log("[ai:debug] full response:", JSON.stringify(res, null, 2));
    const choice = res.choices?.[0];
    if (choice?.finish_reason === "length") {
      // Some models (e.g. Gemini 3's "thinking" variants) spend a chunk of
      // max_tokens on hidden reasoning before writing the visible answer.
      // If we still got cut off, the caller's maxTokens is too tight for
      // this model — surface it so it's easy to bump rather than silently
      // returning an empty/partial result.
      console.warn(`[ai] response truncated (finish_reason=length, maxTokens=${maxTokens}) — consider raising maxTokens for this call.`);
    }
    const text = choice?.message?.content?.trim() || null;
    return { text, blocked: false, reason: text ? null : "The AI didn't return a usable answer — try again or use manual entry." };
  } catch (err) {
    if (isRateLimit(err)) {
      const waitSec = extractRetrySeconds(err);
      providerCooldownUntil = Date.now() + waitSec * 1000;
      providerCooldownReason = `AI hit its free-tier daily limit — try again in about ${waitSec}s, or use manual entry.`;
      console.warn(`[ai] provider rate-limited (${kind}), cooling down ${waitSec}s`);
      return { text: null, blocked: true, reason: providerCooldownReason };
    }
    if (isTimeout(err)) {
      console.warn(`[ai] timed out after ${timeoutMs}ms (${kind})`);
      return { text: null, blocked: false, reason: "AI is taking too long to respond — try again in a moment, or use manual entry." };
    }
    console.error("[ai] completion failed:", err.message);
    return { text: null, blocked: false, reason: "AI request failed — try again or use manual entry." };
  }
}

/** Extract the first JSON object/array found in a string (handles ```json fences, stray prose, etc). */
function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const slice = candidate.slice(start);
  for (let end = slice.length; end > 0; end--) {
    const attempt = slice.slice(0, end);
    try {
      return JSON.parse(attempt);
    } catch {
      // keep shrinking from the end until it parses
    }
  }
  return null;
}

/** Same contract as complete(), but with `data` (parsed JSON) instead of `text`. */
export async function aiJson(args) {
  const { text, blocked, reason } = await complete(args);
  if (!text) return { data: null, blocked, reason };
  const data = extractJson(text);
  if (process.env.AI_DEBUG) console.log("[ai:debug] raw:", JSON.stringify(text), "parsed:", JSON.stringify(data));
  if (!data) return { data: null, blocked: false, reason: "Couldn't understand the AI's response — try again or use manual entry." };
  return { data, blocked: false, reason: null };
}

export { complete as aiComplete };
