import "../env.js";
import OpenAI from "openai";
import { checkAndConsumeAiQuota, getAiLimits } from "./aiGuardrail.js";

let client = null;

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
    });
  }
  return client;
}

/**
 * Ask the model for a chat completion. Never throws — always resolves to
 * { text, blocked, reason }. `blocked` means the free-tier guardrail
 * stopped the call before it was made (no tokens spent); `reason` is a
 * human-readable message safe to show the user in either case (blocked, or
 * any other failure).
 */
async function complete({ system, user, images = [], temperature = 0.4, maxTokens = 1500, kind = "text" }) {
  const c = getClient();
  if (!c) return { text: null, blocked: false, reason: "AI isn't configured." };

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

  try {
    const res = await c.chat.completions.create({
      model: aiModel(),
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    });
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
