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

### AI (optional)

Copy `server/.env.example` to `server/.env` and set `OPENAI_API_KEY`. Default is Gemini. Restart the server.

### Render

Blueprint deploy via `render.yaml` (free plan). Paste `OPENAI_API_KEY` in the dashboard.

Free instances wipe local disk on restart — data will reset. For persistence, use a paid plan and a disk at `server/data`.
