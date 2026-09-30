// Loads server/.env regardless of the process's current working directory
// (important since this app can be started as `node server/src/index.js`
// from the repo root, or via `npm run dev -w server` from inside server/).
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// This app's salary cycles, "today", and day boundaries only make sense in
// the user's own timezone. Every date helper (server/src/lib/dates.js)
// deliberately reads LOCAL calendar fields (getFullYear/getMonth/getDate)
// from `new Date()` — but "local" means the Node process's timezone. Cloud
// hosts (Render, etc.) run in UTC by default, so without this, "today" on
// the server lags real IST time by up to 5.5 hours (e.g. it's still
// "yesterday" server-side from 12:00am-5:30am IST) — expenses, salary-cycle
// day counts, and the purchase planner would quietly use the wrong day.
// Set this before any other module constructs a Date. Respects an explicit
// TZ from the hosting platform if one is already set.
if (!process.env.TZ) {
  process.env.TZ = "Asia/Kolkata";
}
