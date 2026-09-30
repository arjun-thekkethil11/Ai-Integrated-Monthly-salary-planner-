import "./env.js";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import settingsRouter from "./routes/settings.js";
import expensesRouter from "./routes/expenses.js";
import pastMonthsRouter from "./routes/pastMonths.js";
import analyticsRouter from "./routes/analytics.js";
import budgetRouter from "./routes/budget.js";
import plannerRouter from "./routes/planner.js";
import categoriesRouter from "./routes/categories.js";
import aiRouter from "./routes/ai.js";
import snapshotRouter from "./routes/snapshot.js";
import remindersRouter from "./routes/reminders.js";
import { isAiEnabled, aiModel } from "./lib/ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
// Bumped limit to comfortably fit base64-encoded screenshots from the
// AI photo-scan features (Expenses & Past Months).
app.use(express.json({ limit: "15mb" }));

app.use("/api/settings", settingsRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/past-months", pastMonthsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/budget", budgetRouter);
app.use("/api/planner", plannerRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/ai", aiRouter);
app.use("/api/snapshot", snapshotRouter);
app.use("/api/reminders", remindersRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Serve the built client in production (npm run build -> npm start).
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Monthly Planner API listening on http://localhost:${PORT}`);
  console.log(isAiEnabled() ? `AI features enabled (model: ${aiModel()})` : "AI features disabled — add OPENAI_API_KEY in server/.env to enable them");
});
