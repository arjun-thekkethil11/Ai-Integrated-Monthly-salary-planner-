import { Router } from "express";
import { isAiEnabled, aiModel, getAiLimits } from "../lib/ai.js";
import { parseExpenseWithAI, parseExpensesFromImage, parseMonthSummaryFromImage, generateAiInsights } from "../lib/aiFeatures.js";
import { getSettings } from "./settings.js";
import { getCurrentBudget } from "./budget.js";
import { categoryBreakdown, monthlyTrend } from "../lib/insights.js";
import { db } from "../db.js";
import { monthKey } from "../lib/dates.js";
import { round2 } from "../lib/budget.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ enabled: isAiEnabled(), model: isAiEnabled() ? aiModel() : null, limits: getAiLimits() });
});

router.post("/parse-expense", async (req, res) => {
  if (!isAiEnabled()) {
    return res.status(501).json({ error: "AI isn't configured. Add OPENAI_API_KEY in server/.env to enable this." });
  }
  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }
  const { data, blocked, reason } = await parseExpenseWithAI({ text, today: new Date() });
  if (blocked) return res.status(429).json({ error: reason, blocked: true });
  if (!data) return res.status(502).json({ error: reason || "Couldn't understand that — try rephrasing, or use the manual form." });
  res.json(data);
});

router.post("/parse-expense-image", async (req, res) => {
  if (!isAiEnabled()) {
    return res.status(501).json({ error: "AI isn't configured. Add OPENAI_API_KEY in server/.env to enable this." });
  }
  const { image } = req.body || {};
  if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
    return res.status(400).json({ error: "image (data URL) is required" });
  }
  const { data, blocked, reason } = await parseExpensesFromImage({ imageDataUrl: image, today: new Date() });
  if (blocked) return res.status(429).json({ error: reason, blocked: true });
  if (!data) return res.status(502).json({ error: reason || "Couldn't read that screenshot — try a clearer one, or add manually." });
  res.json({ transactions: data });
});

router.post("/parse-month-image", async (req, res) => {
  if (!isAiEnabled()) {
    return res.status(501).json({ error: "AI isn't configured. Add OPENAI_API_KEY in server/.env to enable this." });
  }
  const { image } = req.body || {};
  if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
    return res.status(400).json({ error: "image (data URL) is required" });
  }
  const { data, blocked, reason } = await parseMonthSummaryFromImage({ imageDataUrl: image });
  if (blocked) return res.status(429).json({ error: reason, blocked: true });
  if (!data) return res.status(502).json({ error: reason || "Couldn't read a summary from that screenshot — try a clearer one, or add manually." });
  res.json(data);
});

router.post("/insights", async (_req, res) => {
  if (!isAiEnabled()) {
    return res.json({ enabled: false, insights: [] });
  }
  const settings = getSettings();
  const { budget, expensesInCycle } = getCurrentBudget();
  const breakdown = categoryBreakdown(expensesInCycle);

  const pastMonths = db.prepare("SELECT * FROM past_months ORDER BY month ASC").all();
  const currentMonthKey = monthKey(new Date());
  const currentMonthSpentRow = db
    .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date LIKE ?")
    .get(`${currentMonthKey}%`);
  const trend = monthlyTrend(pastMonths, currentMonthKey, settings.monthly_salary, round2(currentMonthSpentRow.total));

  const { data, blocked, reason } = await generateAiInsights({ settings, budget, breakdown, trend });
  if (blocked) return res.status(429).json({ enabled: true, insights: [], error: reason, blocked: true });
  res.json({ enabled: true, insights: data || [], error: data ? null : reason });
});

export default router;
