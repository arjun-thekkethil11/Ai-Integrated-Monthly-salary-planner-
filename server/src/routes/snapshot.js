import { Router } from "express";
import { readSnapshot, restoreSnapshot } from "../lib/snapshot.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json(readSnapshot());
});

router.post("/restore", (req, res) => {
  try {
    res.json(restoreSnapshot(req.body || {}));
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || "Could not restore saved data" });
  }
});

export default router;
