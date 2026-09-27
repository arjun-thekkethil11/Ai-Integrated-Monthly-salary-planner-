import { Router } from "express";
import { CATEGORIES } from "../lib/categorize.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json(CATEGORIES);
});

export default router;
