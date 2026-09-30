import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { autoCategorize } from "../lib/categorize.js";
import { adjustCurrentBalance } from "../lib/balance.js";
import { toISODate } from "../lib/dates.js";

const router = Router();

router.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM reminders ORDER BY status ASC, due_date ASC, created_at ASC").all();
  res.json(rows);
});

router.post("/", (req, res) => {
  const { itemName, amount, dueDate, category } = req.body || {};
  const name = String(itemName || "").trim();
  const amt = Number(amount);
  if (!name) return res.status(400).json({ error: "What do you want to buy?" });
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ error: "dueDate is required (YYYY-MM-DD)" });

  const finalCategory = category && String(category).trim() ? category : autoCategorize(name);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO reminders (id, item_name, amount, due_date, category, status) VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(id, name, amt, dueDate, finalCategory);

  res.status(201).json(db.prepare("SELECT * FROM reminders WHERE id = ?").get(id));
});

// Ticking a reminder off logs the real expense it stood for — same money,
// same category, dated today (the day it actually got bought) — then marks
// the reminder done instead of deleting it outright, so it stays visible as
// a completed line until the user clears it.
router.post("/:id/complete", (req, res) => {
  const reminder = db.prepare("SELECT * FROM reminders WHERE id = ?").get(req.params.id);
  if (!reminder) return res.status(404).json({ error: "not found" });
  if (reminder.status === "done") {
    return res.json({ reminder, expense: db.prepare("SELECT * FROM expenses WHERE id = ?").get(reminder.completed_expense_id) || null });
  }

  const expenseId = randomUUID();
  const today = toISODate(new Date());
  db.prepare(
    `INSERT INTO expenses (id, amount, category, description, date, auto_categorized, recurring) VALUES (?, ?, ?, ?, ?, 0, 0)`
  ).run(expenseId, reminder.amount, reminder.category || autoCategorize(reminder.item_name), reminder.item_name, today);
  adjustCurrentBalance(-Number(reminder.amount));

  db.prepare(
    `UPDATE reminders SET status = 'done', completed_expense_id = ?, completed_at = datetime('now') WHERE id = ?`
  ).run(expenseId, reminder.id);

  res.json({
    reminder: db.prepare("SELECT * FROM reminders WHERE id = ?").get(reminder.id),
    expense: db.prepare("SELECT * FROM expenses WHERE id = ?").get(expenseId),
  });
});

router.put("/:id", (req, res) => {
  const reminder = db.prepare("SELECT * FROM reminders WHERE id = ?").get(req.params.id);
  if (!reminder) return res.status(404).json({ error: "not found" });
  if (reminder.status === "done") {
    return res.status(400).json({ error: "This one is already bought — edit the expense instead." });
  }

  const { itemName, amount, dueDate } = req.body || {};
  const name = itemName != null ? String(itemName).trim() : reminder.item_name;
  const amt = amount != null ? Number(amount) : reminder.amount;
  const due = dueDate || reminder.due_date;
  if (!name) return res.status(400).json({ error: "What do you want to buy?" });
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return res.status(400).json({ error: "dueDate is required (YYYY-MM-DD)" });

  const category = name !== reminder.item_name ? autoCategorize(name) : reminder.category;
  db.prepare(`UPDATE reminders SET item_name = ?, amount = ?, due_date = ?, category = ? WHERE id = ?`).run(name, amt, due, category, reminder.id);
  res.json(db.prepare("SELECT * FROM reminders WHERE id = ?").get(reminder.id));
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM reminders WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
