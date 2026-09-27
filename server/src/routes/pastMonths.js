import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { round2 } from "../lib/budget.js";

const router = Router();

router.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM past_months ORDER BY month DESC").all();
  res.json(
    rows.map((r) => ({
      ...r,
      category_breakdown: r.category_breakdown ? JSON.parse(r.category_breakdown) : null,
    }))
  );
});

router.post("/", (req, res) => {
  const { month, salary, total_spent, notes, category_breakdown } = req.body || {};
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: "month is required in YYYY-MM format" });
  }
  const sal = Number(salary) || 0;
  const spent = Number(total_spent) || 0;
  const id = randomUUID();

  db.prepare(
    `INSERT INTO past_months (id, month, salary, total_spent, savings, notes, category_breakdown)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET salary = excluded.salary, total_spent = excluded.total_spent,
       savings = excluded.savings, notes = excluded.notes, category_breakdown = excluded.category_breakdown`
  ).run(id, month, sal, spent, round2(sal - spent), notes || null, category_breakdown ? JSON.stringify(category_breakdown) : null);

  const row = db.prepare("SELECT * FROM past_months WHERE month = ?").get(month);
  res.status(201).json({ ...row, category_breakdown: row.category_breakdown ? JSON.parse(row.category_breakdown) : null });
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM past_months WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  const { salary, total_spent, notes, category_breakdown } = req.body || {};
  const sal = salary != null ? Number(salary) : existing.salary;
  const spent = total_spent != null ? Number(total_spent) : existing.total_spent;
  const breakdown = category_breakdown !== undefined ? (category_breakdown ? JSON.stringify(category_breakdown) : null) : existing.category_breakdown;

  db.prepare(`UPDATE past_months SET salary = ?, total_spent = ?, savings = ?, notes = ?, category_breakdown = ? WHERE id = ?`).run(
    sal,
    spent,
    round2(sal - spent),
    notes != null ? notes : existing.notes,
    breakdown,
    req.params.id
  );
  const row = db.prepare("SELECT * FROM past_months WHERE id = ?").get(req.params.id);
  res.json({ ...row, category_breakdown: row.category_breakdown ? JSON.parse(row.category_breakdown) : null });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM past_months WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
