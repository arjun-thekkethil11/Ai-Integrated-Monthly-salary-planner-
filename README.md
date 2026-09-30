# Finly

Monthly salary planner — expenses, daily/weekly budget, analytics, and a purchase planner.

Requires **Node 22.5+**.

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build
npm start            # http://localhost:4000
```

Data lives in `server/data/planner.db` (gitignored).

The free Render instance clears that file whenever it sleeps or restarts. Finly keeps a copy in this browser and writes it back the next time you open the app, so salary, expenses, past months, and planner goals return. Use the same browser — a different device does not have that copy. Anything already wiped before this backup existed cannot be recovered.

### AI (optional)

Copy `server/.env.example` to `server/.env` and set `OPENAI_API_KEY`. Default is Gemini. Restart the server.

### Render

Blueprint via `render.yaml`, or a Web Service with:

- Build: `npm install --include=dev && npm run build`
- Start: `npm run start -w server`
- Health: `/api/health`
- Also set `NODE_OPTIONS=--experimental-sqlite` (Node 22 needs this for `node:sqlite`)

Paste `OPENAI_API_KEY` in the dashboard. Do not skip `--include=dev` — Vite/TypeScript live in `devDependencies`.

Free instances wipe local disk on restart. This browser keeps a copy and restores it on the next visit. For a copy that survives on every device, use a paid plan and a disk at `server/data`.
