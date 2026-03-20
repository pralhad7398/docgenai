# IssueAI — Project Intelligence Platform

Open-source. Zero paid services. Runs in one command.

## Tech stack

| Layer | Technology | License |
|-------|-----------|---------|
| Server | Node.js 20 + Express | MIT |
| Database | SQLite (better-sqlite3) | MIT |
| CSV parsing | csv-parse + csv-stringify | MIT |
| Frontend | Vanilla HTML/CSS/JS | — |
| Fonts | Google Fonts (Syne, DM Sans, DM Mono) | OFL |
| Deploy | Docker / Railway / Render (free tiers) | — |

---

## Run locally (60 seconds)

```bash
git clone <your-repo>
cd issueai
npm install
npm start
# → http://localhost:3000
```

Node 18+ required. That's it — SQLite DB is created automatically with 18 seed issues.

---

## Deploy to Railway (free tier, 5 minutes)

1. Push this repo to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub repo
3. Select this repo — Railway auto-detects Node.js
4. Click Deploy. Done.

Your app will be live at a `*.railway.app` URL in ~2 minutes.

---

## Deploy to Render (free tier)

1. Push to GitHub
2. Go to https://render.com → New → Web Service → Connect repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add a persistent disk mounted at `/app/data` (free plan: 1GB)
6. Deploy

---

## Deploy with Docker

```bash
docker compose up -d
# → http://localhost:3000
```

Data persists in a named Docker volume (`db_data`).

---

## What works (live functionality)

| Feature | Status |
|---------|--------|
| View all issues with filters (severity, status, project) | ✅ Live |
| Search issues by title, reporter, description | ✅ Live |
| Add issue via manual form | ✅ Live — saves to SQLite |
| Edit any issue (click title) | ✅ Live — modal editor |
| Resolve / reopen / delete issues | ✅ Live — one click |
| Import issues from CSV upload | ✅ Live — any CSV |
| Export filtered issues to CSV | ✅ Live — download |
| Dashboard with live charts (category, severity, project) | ✅ Live from DB |
| AI Analysis tab (stats, recommendations) | ✅ Live from DB |
| Pattern Intelligence — velocity trend, sprint table | ✅ Live sprint data |
| Document tab — report preview + download | ✅ Live .md generation |
| Teams ingest (mock) | ✅ Live — adds real issues |

---

## CSV format (for import)

```
title,description,reporter,project,severity,status,category,root_cause
"API timeout on prod","Happens at peak load","Ravi Kumar","Phoenix","high","open","technical","Connection pool exhausted"
```

Only `title` is required. All other columns are optional.

---

## Add AI classification later (optional)

When you're ready to add real AI, set `ANTHROPIC_API_KEY` in your environment and call the classify endpoint. The DB schema already has `category` and `root_cause` columns ready.

---

## Project structure

```
issueai/
├── server.js           ← Express entry point
├── package.json
├── Dockerfile
├── docker-compose.yml
├── railway.json
├── db/
│   └── db.js           ← SQLite schema + all queries + seed data
├── routes/
│   └── api.js          ← REST endpoints
└── public/
    ├── index.html      ← Single-page app
    ├── css/app.css     ← Full design system
    └── js/app.js       ← All frontend logic
```
