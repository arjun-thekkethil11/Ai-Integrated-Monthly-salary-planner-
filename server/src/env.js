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
