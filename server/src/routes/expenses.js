import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { autoCategorize } from "../lib/categorize.js";

const router = Router();

router.get("/", (req, res) => {
  const { from, to, month, limit } = req.query;
  let sql = "SELECT * FROM expenses";
  const clauses = [];
  const params = [];

  if (month) {
    clauses.push("date LIKE ?");
    params.push(`${month}%`);
  }
  if (from) {
    clauses.push("date >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("date <= ?");
    params.push(to);
  }
  if (clauses.length) sql += " WHERE " + clauses.join(" AND ");
  sql += " ORDER BY date DESC, created_at DESC";
  if (limit) sql += ` LIMIT ${Math.max(1, Math.min(1000, Number(limit) || 100))}`;

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.post("/", (req, res) => {
  const { amount, description = "", date, category } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  if (!date) {
    return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
  }

  const finalCategory = category && category.trim() ? category : autoCategorize(description);
  const autoCategorized = !category || !category.trim();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO expenses (id, amount, category, description, date, auto_categorized) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, amt, finalCategory, description, date, autoCategorized ? 1 : 0);

  const row = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
  res.status(201).json(row);
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM expenses WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });

  const { amount, description, date, category } = req.body || {};
  const next = {
    amount: amount != null ? Number(amount) : existing.amount,
    description: description != null ? description : existing.description,
    date: date || existing.date,
    category: category || existing.category,
  };

  db.prepare(`UPDATE expenses SET amount = ?, description = ?, date = ?, category = ?, auto_categorized = 0 WHERE id = ?`).run(
    next.amount,
    next.description,
    next.date,
    next.category,
    req.params.id
  );

  res.json(db.prepare("SELECT * FROM expenses WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM expenses WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

router.post("/categorize-preview", (req, res) => {
  const { description = "" } = req.body || {};
  res.json({ category: autoCategorize(description) });
});

export default router;
