'use strict';
const express  = require('express');
const multer   = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { v4: uuid } = require('uuid');
const db = require('../db/db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── GET /api/stats ────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  res.json(db.stats());
});

// ── GET /api/projects ─────────────────────────────────────────────────────────
router.get('/projects', (req, res) => {
  res.json(db.projects());
});

// ── GET /api/issues ───────────────────────────────────────────────────────────
router.get('/issues', (req, res) => {
  const { project, status, severity, category, search } = req.query;
  res.json(db.list({ project, status, severity, category, search }));
});

// ── POST /api/issues ──────────────────────────────────────────────────────────
router.post('/issues', (req, res) => {
  const { title, description = '', reporter = 'Unknown', project = 'General',
          source = 'manual', status = 'open', severity = 'medium',
          category = '', root_cause = '' } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const issue = {
    id: 'i-' + uuid().slice(0, 8),
    title: title.trim(), description, reporter, project,
    source, status, severity, category, root_cause,
  };
  db.insert(issue);
  res.status(201).json(db.get(issue.id));
});

// ── PATCH /api/issues/:id ─────────────────────────────────────────────────────
router.patch('/issues/:id', (req, res) => {
  const issue = db.get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Not found' });
  db.update(req.params.id, req.body);
  res.json(db.get(req.params.id));
});

// ── DELETE /api/issues/:id ────────────────────────────────────────────────────
router.delete('/issues/:id', (req, res) => {
  const issue = db.get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Not found' });
  db.delete(req.params.id);
  res.json({ ok: true });
});

// ── POST /api/issues/import-csv ───────────────────────────────────────────────
router.post('/issues/import-csv', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let rows;
  try {
    rows = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
  }

  const issues = rows.map(r => ({
    id:          'i-' + uuid().slice(0, 8),
    title:       r.title || r.Title || r.issue || r.Issue || 'Untitled',
    description: r.description || r.Description || r.desc || '',
    reporter:    r.reporter || r.Reporter || r.name || r.Name || 'CSV Import',
    project:     r.project || r.Project || req.body.project || 'General',
    source:      'csv',
    status:      r.status || r.Status || 'open',
    severity:    (r.severity || r.Severity || r.priority || 'medium').toLowerCase(),
    category:    r.category || r.Category || r.type || '',
    root_cause:  r.root_cause || r['root cause'] || r.rootCause || '',
  }));

  db.bulkInsert(issues);
  res.json({ imported: issues.length, issues });
});

// ── GET /api/issues/export-csv ────────────────────────────────────────────────
router.get('/issues/export-csv', (req, res) => {
  const issues = db.list(req.query);
  const csv = stringify(issues, {
    header: true,
    columns: ['id','title','description','reporter','project','source','status','severity','category','root_cause','created_at'],
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="issues-${Date.now()}.csv"`);
  res.send(csv);
});

// ── GET /api/sprints ──────────────────────────────────────────────────────────
router.get('/sprints', (req, res) => {
  res.json(db.sprints(req.query.project));
});

// ── GET /api/report ───────────────────────────────────────────────────────────
// Generates a real Markdown report from live DB data
router.get('/report', (req, res) => {
  const stats   = db.stats();
  const issues  = db.list({ status: 'open' });
  const sprints = db.sprints('Phoenix');
  const now     = new Date().toLocaleDateString('en-IN', { dateStyle: 'long' });
  const projects= [...new Set(issues.map(i => i.project))].join(', ');

  const issueRows = issues.slice(0, 20).map((iss, i) =>
    `| ${i+1} | ${iss.title} | ${iss.project} | ${iss.severity} | ${iss.category || '—'} | ${iss.status} |`
  ).join('\n');

  const catMap = {};
  issues.forEach(i => { catMap[i.category || 'other'] = (catMap[i.category || 'other'] || 0) + 1; });
  const topCats = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0,5)
    .map(([cat, n]) => `- **${cat}**: ${n} issue${n>1?'s':''}`).join('\n');

  const md = `# Project Issues Intelligence Report
**Generated:** ${now}  |  **Projects:** ${projects}  |  **Powered by IssueAI**

---

## 1. Executive Summary

This report covers **${stats.total} total issues** across ${stats.byProj.length} project(s). Currently **${stats.open} issues are open**, including **${stats.critical} critical** requiring immediate attention. Team health score is estimated at **${stats.health}/10** based on issue density and severity distribution.

---

## 2. Key Metrics

| Metric | Value |
|--------|-------|
| Total Issues | ${stats.total} |
| Open | ${stats.open} |
| Resolved | ${stats.resolved} |
| Critical (open) | ${stats.critical} |
| Team Health Score | ${stats.health} / 10 |
| Projects Tracked | ${stats.byProj.length} |

---

## 3. Issues by Category

${topCats}

---

## 4. Issues by Project

${stats.byProj.map(p => `- **${p.project}**: ${p.c} issues`).join('\n')}

---

## 5. Open Issue Register (Top 20 by Severity)

| # | Title | Project | Severity | Category | Status |
|---|-------|---------|----------|----------|--------|
${issueRows}

---

## 6. Recommendations

${stats.critical > 0 ? `- 🔴 **Immediate:** ${stats.critical} critical issue(s) must be resolved before next release` : ''}
- Review and assign ownership for all high-severity open issues
- Establish a PR review SLA to reduce delivery bottlenecks
- Consider adding automated security scanning (SAST) to CI pipeline
- Ensure staging environment is refreshed before each release cycle

---

*Report generated by IssueAI · Open Source Project Intelligence Platform*
`;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="issueai-report-${Date.now()}.md"`);
  res.send(md);
});

module.exports = router;
