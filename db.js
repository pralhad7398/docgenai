'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'issueai.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS issues (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    reporter    TEXT DEFAULT 'Unknown',
    project     TEXT DEFAULT 'General',
    source      TEXT DEFAULT 'manual',
    status      TEXT DEFAULT 'open',
    severity    TEXT DEFAULT 'medium',
    category    TEXT DEFAULT '',
    root_cause  TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now','localtime')),
    updated_at  TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sprint_snapshots (
    id            TEXT PRIMARY KEY,
    sprint_label  TEXT NOT NULL,
    project       TEXT NOT NULL,
    period_start  TEXT NOT NULL,
    period_end    TEXT NOT NULL,
    total_issues  INTEGER DEFAULT 0,
    critical      INTEGER DEFAULT 0,
    high          INTEGER DEFAULT 0,
    medium        INTEGER DEFAULT 0,
    low           INTEGER DEFAULT 0,
    resolved      INTEGER DEFAULT 0,
    top_category  TEXT DEFAULT '',
    velocity_score REAL DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_issues_project  ON issues(project);
  CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
  CREATE INDEX IF NOT EXISTS idx_issues_status   ON issues(status);
  CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);
  CREATE INDEX IF NOT EXISTS idx_snap_project    ON sprint_snapshots(project, period_start);
`);

// ── Seed data (only if DB is empty) ──────────────────────────────────────────
const count = db.prepare('SELECT COUNT(*) as c FROM issues').get().c;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO issues (id,title,description,reporter,project,source,status,severity,category,root_cause)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);
  const seed = db.transaction(() => {
    const issues = [
      ['i-001','Auth service returns 200 on invalid token','Token validation bypass introduced in v2.3 refactor. Confirmed via internal pentest.','Arjun Verma','Horizon','teams','open','critical','security','Security regression in v2.3 — token validation logic removed during refactor'],
      ['i-002','Prod DB migration ran twice — data duplication','Migration script ran twice during blue-green deploy. Orders table has duplicate rows.','Kiran Rao','Atlas','teams','open','critical','process','No idempotency check in migration runner script'],
      ['i-003','API gateway 504 timeouts on peak load','Gateway returns 504 after 30s during peak hours (9-11am, 5-7pm). Affects all projects.','Ravi Kumar','Phoenix','teams','open','high','technical','Connection pool exhaustion under concurrent upstream requests'],
      ['i-004','Unit tests skipped in CI pipeline','Test step silently passes even when tests fail. Regression introduced after pipeline refactor.','Aditya Singh','Phoenix','teams','open','high','quality','Test step misconfigured — exit code not checked after pipeline refactor in Sprint 13'],
      ['i-005','Memory leak in background worker process','Worker process grows ~200MB/hour under load. Requires restart every 6-8 hours.','Suresh Menon','Atlas','teams','open','high','technical','Event listener not removed on job completion — accumulates across job queue'],
      ['i-006','Sprint velocity dropped 25% — 3 sprints running','Team completing only 75% of committed points. Trend started Sprint 12.','Priya Sharma','Phoenix','manual','open','medium','process','Excessive unplanned critical work consuming planned capacity; PR bottlenecks adding delay'],
      ['i-007','OAuth token refresh failing silently','Refresh fails with no user-visible error. Session expires without warning or retry.','Meera Joshi','Horizon','teams','open','high','security','Missing error handler on token refresh callback — failure swallowed silently'],
      ['i-008','PR reviews averaging 4+ days — blocking releases','No CODEOWNERS file. Reviewers must be manually assigned. Average wait: 4.2 days.','Rahul Desai','Phoenix','manual','open','low','process','No review ownership policy; reviewers unassigned by default across all repos'],
      ['i-009','Staging environment out of sync with prod','Staging DB snapshot 3 weeks old. QA signing off features against stale data.','Kiran Rao','Phoenix','manual','open','medium','environment','No automated staging refresh pipeline — manual process skipped for 3 sprints'],
      ['i-010','Rate limiting not enforced on public API','All public endpoints lack rate limiting. Discovered via security audit.','Arjun Verma','Atlas','teams','open','critical','security','Security audit gap — rate limiting omitted from API gateway config during v2.4 migration'],
      ['i-011','No rollback plan for v2.4 release','Release notes drafted but no rollback runbook. DB schema changes not reversible.','Priya Sharma','Phoenix','manual','open','medium','process','Release planning process lacks mandatory rollback runbook requirement'],
      ['i-012','Dev environment setup takes 4+ hours','40-step Confluence doc is 6 months stale. New joiners blocked on first day.','Suresh Pillai','Horizon','manual','open','medium','environment','No automation for dev setup; documentation not maintained alongside code changes'],
      ['i-013','Log aggregation missing for new services','3 services launched in Sprint 13 have no centralised logging. Debugging requires SSH.','Rahul Desai','Atlas','teams','open','medium','environment','Logging setup not part of service launch checklist; skipped under time pressure'],
      ['i-014','Flaky integration tests block deployments','5 tests fail at ~15% rate randomly. Devs retry pipelines instead of fixing root cause.','Amit Shah','Phoenix','teams','open','medium','quality','Test isolation failures — shared state between tests causes non-deterministic failures'],
      ['i-015','API docs outdated by 2 sprints','3 breaking changes undocumented since v2.1. Consumers building against wrong contracts.','Meera Joshi','Atlas','manual','open','low','process','No doc update requirement in PR checklist; documentation treated as optional'],
      ['i-016','Deployment blocked — missing env config','v2.4 deploy failed: PAYMENT_GATEWAY_SECRET not set in prod. Delayed release 6 hours.','Neha Patil','Phoenix','teams','resolved','critical','environment','Config not promoted from staging to prod deployment checklist'],
      ['i-017','No monitoring on payment service','Payment failures go undetected for hours. Discovered via customer support tickets.','Deepa Mehta','Atlas','teams','open','high','environment','No alerts configured on payments pod; monitoring skipped during service extraction'],
      ['i-018','Onboarding docs reference deprecated tooling','New engineers told to install tools removed 2 quarters ago. Causes confusion day 1.','Deepa Mehta','Horizon','manual','resolved','low','process','Onboarding docs not reviewed when tooling changes; no ownership assigned'],
    ];
    for (const row of issues) insert.run(...row);
  });
  seed();

  // Seed sprint snapshots
  const snapInsert = db.prepare(`
    INSERT INTO sprint_snapshots (id,sprint_label,project,period_start,period_end,total_issues,critical,high,medium,low,resolved,top_category,velocity_score)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const snaps = db.transaction(() => {
    const rows = [
      ['sp-ph-10','Sprint 10','Phoenix','2025-10-01','2025-10-14', 7,1,2,3,1,4,'technical',8.5],
      ['sp-ph-11','Sprint 11','Phoenix','2025-10-15','2025-10-28', 8,1,3,2,2,5,'technical',8.2],
      ['sp-ph-12','Sprint 12','Phoenix','2025-10-29','2025-11-11',10,2,3,4,1,4,'process',7.5],
      ['sp-ph-13','Sprint 13','Phoenix','2025-11-12','2025-11-25',11,2,4,3,2,3,'security',7.0],
      ['sp-ph-14','Sprint 14','Phoenix','2025-11-26','2025-12-09',18,4,6,5,3,8,'security',6.4],
      ['sp-at-10','Sprint 10','Atlas','2025-10-01','2025-10-14', 5,0,2,2,1,3,'technical',8.8],
      ['sp-at-11','Sprint 11','Atlas','2025-10-15','2025-10-28', 6,1,2,2,1,4,'technical',8.0],
      ['sp-at-12','Sprint 12','Atlas','2025-10-29','2025-11-11', 7,1,3,2,1,4,'process',7.6],
      ['sp-at-13','Sprint 13','Atlas','2025-11-12','2025-11-25', 8,2,3,2,1,3,'security',7.1],
      ['sp-at-14','Sprint 14','Atlas','2025-11-26','2025-12-09',10,3,4,2,1,5,'security',6.2],
    ];
    for (const r of rows) snapInsert.run(...r);
  });
  snaps();
}

// ── Query helpers ─────────────────────────────────────────────────────────────
const q = {
  // Issues
  list({ project, status, severity, category, search, limit = 500 } = {}) {
    let sql = 'SELECT * FROM issues WHERE 1=1';
    const p = [];
    if (project && project !== 'all')  { sql += ' AND LOWER(project)=LOWER(?)';  p.push(project); }
    if (status  && status  !== 'all')  { sql += ' AND status=?';   p.push(status); }
    if (severity && severity !== 'all'){ sql += ' AND severity=?'; p.push(severity); }
    if (category && category !== 'all'){ sql += ' AND category=?'; p.push(category); }
    if (search) {
      sql += ' AND (LOWER(title) LIKE ? OR LOWER(reporter) LIKE ? OR LOWER(description) LIKE ?)';
      const s = `%${search.toLowerCase()}%`;
      p.push(s, s, s);
    }
    sql += ' ORDER BY CASE severity WHEN "critical" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 ELSE 4 END, created_at DESC LIMIT ?';
    p.push(limit);
    return db.prepare(sql).all(...p);
  },

  get(id) { return db.prepare('SELECT * FROM issues WHERE id=?').get(id); },

  insert(issue) {
    return db.prepare(`
      INSERT INTO issues (id,title,description,reporter,project,source,status,severity,category,root_cause)
      VALUES (@id,@title,@description,@reporter,@project,@source,@status,@severity,@category,@root_cause)
    `).run(issue);
  },

  update(id, fields) {
    const allowed = ['title','description','reporter','project','status','severity','category','root_cause'];
    const sets = Object.keys(fields).filter(k => allowed.includes(k)).map(k => `${k}=@${k}`);
    if (!sets.length) return;
    db.prepare(`UPDATE issues SET ${sets.join(',')}, updated_at=datetime('now','localtime') WHERE id=@id`)
      .run({ id, ...fields });
  },

  delete(id) { db.prepare('DELETE FROM issues WHERE id=?').run(id); },

  bulkInsert(rows) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO issues (id,title,description,reporter,project,source,status,severity,category,root_cause)
      VALUES (@id,@title,@description,@reporter,@project,@source,@status,@severity,@category,@root_cause)
    `);
    const tx = db.transaction((rows) => { for (const r of rows) stmt.run(r); });
    tx(rows);
  },

  // Stats for dashboard
  stats() {
    const total   = db.prepare("SELECT COUNT(*) as c FROM issues").get().c;
    const open    = db.prepare("SELECT COUNT(*) as c FROM issues WHERE status='open'").get().c;
    const resolved= db.prepare("SELECT COUNT(*) as c FROM issues WHERE status='resolved'").get().c;
    const critical= db.prepare("SELECT COUNT(*) as c FROM issues WHERE severity='critical' AND status='open'").get().c;
    const bySev   = db.prepare("SELECT severity, COUNT(*) as c FROM issues WHERE status='open' GROUP BY severity ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END").all();
    const byCat   = db.prepare("SELECT category, COUNT(*) as c FROM issues WHERE category!='' GROUP BY category ORDER BY c DESC LIMIT 8").all();
    const byProj  = db.prepare("SELECT project, COUNT(*) as c FROM issues GROUP BY project ORDER BY c DESC").all();
    const health  = Math.max(0, Math.min(10, 10 - critical * 2 - (open - resolved) * 0.1)).toFixed(1);
    return { total, open, resolved, critical, bySev, byCat, byProj, health };
  },

  // Sprint data
  sprints(project) {
    const sql = project
      ? "SELECT * FROM sprint_snapshots WHERE project=? ORDER BY period_start ASC"
      : "SELECT * FROM sprint_snapshots ORDER BY project, period_start ASC";
    return project ? db.prepare(sql).all(project) : db.prepare(sql).all();
  },

  projects() {
    return db.prepare("SELECT DISTINCT project FROM issues ORDER BY project").all().map(r => r.project);
  },
};

module.exports = q;
