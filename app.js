/* ── IssueAI Frontend ──────────────────────────────────────────────────── */
'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  issues: [],
  stats: {},
  sprints: [],
  filter: { sev: 'all', status: 'all', project: 'all' },
  search: '',
  currentTab: 'issues',
};

// ── Avatar colours pool ───────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'linear-gradient(135deg,#6c63ff,#26c6b0)',
  'linear-gradient(135deg,#ff9933,#ff4d4d)',
  'linear-gradient(135deg,#26c6b0,#4d9fff)',
  'linear-gradient(135deg,#4d9fff,#6c63ff)',
  'linear-gradient(135deg,#ff4d4d,#ff9933)',
  'linear-gradient(135deg,#26c6b0,#2ecc8a)',
  'linear-gradient(135deg,#6c63ff,#ff4d4d)',
  'linear-gradient(135deg,#2ecc8a,#4d9fff)',
];
const avatarCache = {};
function avatarColor(name) {
  if (!avatarCache[name]) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    avatarCache[name] = AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }
  return avatarCache[name];
}
function initials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch('/api' + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  const icon = type === 'ok' ? '✓' : type === 'err' ? '✕' : 'ℹ';
  const color = type === 'ok' ? '#2ecc8a' : type === 'err' ? '#ff4d4d' : '#4d9fff';
  el.innerHTML = `<span style="color:${color};margin-right:8px;font-weight:700">${icon}</span>${msg}`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(title, html, onSubmit) {
  const overlay = document.getElementById('modal-overlay');
  const modal   = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-title">
      ${title}
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div id="modal-content">${html}</div>
  `;
  overlay.classList.remove('hidden');
  if (onSubmit) {
    const form = modal.querySelector('form');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await onSubmit(new FormData(form));
    });
  }
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ── Tab navigation ────────────────────────────────────────────────────────────
const TAB_TITLES = {
  dashboard: 'Dashboard', issues: 'Issues', ingest: 'Ingest Data',
  analysis: 'AI Analysis', patterns: 'Pattern Intelligence', document: 'Documents',
};
function goTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
  document.querySelectorAll('.tab-panels > div').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('page-title').textContent = TAB_TITLES[tab] || tab;
  state.currentTab = tab;
  if (tab === 'dashboard')  renderDashboard();
  if (tab === 'issues')     renderIssuesTable();
  if (tab === 'analysis')   renderAnalysis();
  if (tab === 'patterns')   renderPatterns();
  if (tab === 'document')   renderDocument();
}
document.querySelectorAll('.nav-item[data-tab]').forEach(el => {
  el.addEventListener('click', () => goTab(el.dataset.tab));
});
document.querySelectorAll('[data-go]').forEach(el => {
  el.addEventListener('click', () => goTab(el.dataset.go));
});

// ── Load all data ─────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const [issues, stats, sprints] = await Promise.all([
      api('GET', '/issues'),
      api('GET', '/stats'),
      api('GET', '/sprints?project=Phoenix'),
    ]);
    state.issues  = issues;
    state.stats   = stats;
    state.sprints = sprints;

    // Update nav badge
    const badge = document.getElementById('nav-badge-issues');
    if (badge) badge.textContent = stats.open || issues.length;

    // Inject project filter pills
    buildProjectPills(stats.byProj || []);

    renderIssuesTable();
    if (state.currentTab === 'dashboard') renderDashboard();
  } catch (e) {
    toast('Failed to load data: ' + e.message, 'err');
  }
}

// ── Project pills ─────────────────────────────────────────────────────────────
function buildProjectPills(byProj) {
  const container = document.getElementById('proj-pills');
  if (!container) return;
  container.innerHTML = byProj.map(p =>
    `<button class="pill" data-proj="${p.project}">${p.project}</button>`
  ).join('');
  container.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const all = [...document.querySelectorAll('#proj-pills .pill')];
      all.forEach(p => p.classList.remove('active'));
      if (state.filter.project === pill.dataset.proj) {
        state.filter.project = 'all';
      } else {
        state.filter.project = pill.dataset.proj;
        pill.classList.add('active');
      }
      renderIssuesTable();
    });
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  const s = state.stats;
  if (!s || !s.total) return;

  // KPIs
  setKPI('kpi-critical', s.critical,  s.critical);
  setKPI('kpi-open',     s.open,      s.open);
  setKPI('kpi-health',   s.health,    s.health);
  setKPI('kpi-resolved', s.resolved,  s.resolved);
  document.getElementById('kpi-open-sub').textContent = `${(s.byProj||[]).length} projects`;
  document.getElementById('kpi-resolved-sub').textContent = `of ${s.total} total`;

  // Category bar chart
  const cats = (s.byCat || []).slice(0, 6);
  const maxC = cats[0]?.c || 1;
  const catGrads = {
    technical:   'linear-gradient(90deg,#6c63ff,#8b85ff)',
    process:     'linear-gradient(90deg,#ff9933,#ffb84d)',
    security:    'linear-gradient(90deg,#ff4d4d,#ff7a7a)',
    environment: 'linear-gradient(90deg,#26c6b0,#4de0ce)',
    quality:     'linear-gradient(90deg,#4d9fff,#7ab8ff)',
  };
  document.getElementById('cat-chart').innerHTML = cats.map(c => `
    <div class="bar-row">
      <div class="bar-label">${c.category || 'other'}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((c.c/maxC)*90+10)}%;background:${catGrads[c.category]||'var(--bg4)'};">${c.c}</div></div>
      <div class="bar-num">${c.c}</div>
    </div>`).join('');

  // Donut
  renderDonut(s.bySev || []);

  // Project bar chart
  const projs = (s.byProj || []).slice(0, 5);
  const maxP = projs[0]?.c || 1;
  const projGrads = [
    'linear-gradient(90deg,#6c63ff,#8b85ff)',
    'linear-gradient(90deg,#26c6b0,#4de0ce)',
    'linear-gradient(90deg,#ff9933,#ffb84d)',
    'linear-gradient(90deg,#4d9fff,#7ab8ff)',
    'linear-gradient(90deg,#2ecc8a,#4de0ce)',
  ];
  document.getElementById('proj-chart').innerHTML = projs.map((p, i) => `
    <div class="bar-row">
      <div class="bar-label">${p.project}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((p.c/maxP)*85+10)}%;background:${projGrads[i%projGrads.length]};">${p.c}</div></div>
      <div class="bar-num">${p.c}</div>
    </div>`).join('');
}

function setKPI(id, val, bgVal) {
  const el = document.getElementById(id);
  const bg = document.getElementById(id + '-bg');
  if (el) el.textContent = val;
  if (bg) bg.textContent = bgVal;
}

function renderDonut(bySev) {
  const SEV = [
    { key: 'critical', color: '#ff4d4d', label: 'Critical' },
    { key: 'high',     color: '#ff9933', label: 'High' },
    { key: 'medium',   color: '#4d9fff', label: 'Medium' },
    { key: 'low',      color: '#2ecc8a', label: 'Low' },
  ];
  const map = {};
  bySev.forEach(s => { map[s.severity] = s.c; });
  const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
  const C = 2 * Math.PI * 40; // circumference

  let offset = 0;
  const segments = SEV.map(s => {
    const count = map[s.key] || 0;
    const dash  = (count / total) * C;
    const seg   = { ...s, count, dash, offset };
    offset += dash;
    return seg;
  });

  const svg = document.getElementById('donut-svg');
  svg.innerHTML = `<circle cx="55" cy="55" r="40" fill="none" stroke="#1a1e28" stroke-width="18"/>` +
    segments.map(s => s.count ? `<circle cx="55" cy="55" r="40" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${s.dash.toFixed(1)} ${(C - s.dash).toFixed(1)}" stroke-dashoffset="${(-s.offset).toFixed(1)}" transform="rotate(-90 55 55)"/>` : '').join('') +
    `<text x="55" y="50" text-anchor="middle" fill="#e8eaf0" font-size="14" font-family="Syne,sans-serif" font-weight="800">${total}</text>
     <text x="55" y="63" text-anchor="middle" fill="#555e78" font-size="9">issues</text>`;

  document.getElementById('donut-legend').innerHTML = SEV.map(s => `
    <div class="legend-row">
      <div class="legend-dot" style="background:${s.color}"></div>
      ${s.label}
      <div class="legend-val">${map[s.key] || 0}</div>
    </div>`).join('');
}

// ── Issues table ──────────────────────────────────────────────────────────────
function sevClass(s) {
  return { critical: 'sev-critical', high: 'sev-high', medium: 'sev-medium', low: 'sev-low' }[s] || 'sev-low';
}
function statusColor(s) {
  return { open: 'var(--red)', resolved: 'var(--green)', 'in review': 'var(--yellow)' }[s] || 'var(--text3)';
}

function filteredIssues() {
  const { sev, status, project } = state.filter;
  const search = state.search.toLowerCase();
  return state.issues.filter(i => {
    if (sev !== 'all' && i.severity !== sev) return false;
    if (status !== 'all' && i.status !== status) return false;
    if (project !== 'all' && i.project.toLowerCase() !== project.toLowerCase()) return false;
    if (search && !`${i.title} ${i.reporter} ${i.project} ${i.description}`.toLowerCase().includes(search)) return false;
    return true;
  });
}

function renderIssuesTable() {
  const tbody  = document.getElementById('issues-tbody');
  const issues = filteredIssues();

  if (!issues.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><big>◈</big>No issues match your filters</div></td></tr>`;
    return;
  }

  tbody.innerHTML = issues.map((iss, idx) => `
    <tr data-id="${iss.id}">
      <td style="color:var(--text3);font-family:var(--font-mono);font-size:11px">${String(idx + 1).padStart(2, '0')}</td>
      <td style="max-width:280px">
        <span style="font-weight:500;cursor:pointer;color:var(--text)" onclick="editIssue('${iss.id}')">${esc(iss.title)}</span>
        ${iss.source === 'teams' ? '<span style="font-size:9px;color:var(--text3);margin-left:6px;font-family:var(--font-mono)">TEAMS</span>' : ''}
        ${iss.source === 'csv'   ? '<span style="font-size:9px;color:var(--text3);margin-left:6px;font-family:var(--font-mono)">CSV</span>' : ''}
      </td>
      <td style="color:var(--accent2)">${esc(iss.project)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div class="r-avatar" style="background:${avatarColor(iss.reporter)}">${initials(iss.reporter)}</div>
          <span style="color:var(--text2);font-size:12px">${esc(iss.reporter)}</span>
        </div>
      </td>
      <td><span class="sev-badge ${sevClass(iss.severity)}">● ${iss.severity}</span></td>
      <td>${iss.category ? `<span class="cat-tag">${esc(iss.category)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
      <td style="font-size:11px;color:var(--text2);max-width:200px">${esc(iss.root_cause) || '<span style="color:var(--text3)">—</span>'}</td>
      <td>
        <span class="status-dot" style="background:${statusColor(iss.status)}"></span>
        <span style="color:var(--text2);font-size:12px">${iss.status}</span>
      </td>
      <td>
        <div style="display:flex;gap:4px">
          ${iss.status !== 'resolved'
            ? `<button class="action-btn resolve" onclick="resolveIssue('${iss.id}')">✓</button>`
            : `<button class="action-btn" onclick="reopenIssue('${iss.id}')">↺</button>`}
          <button class="action-btn delete" onclick="deleteIssue('${iss.id}')">✕</button>
        </div>
      </td>
    </tr>`).join('');
}

// ── Filter pills ──────────────────────────────────────────────────────────────
document.getElementById('filter-pills').addEventListener('click', e => {
  const pill = e.target.closest('[data-filter]');
  if (!pill) return;
  document.querySelectorAll('#filter-pills .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  const f = pill.dataset.filter;
  if (f === 'all')      { state.filter.sev = 'all'; state.filter.status = 'all'; }
  else if (f === 'open')     { state.filter.status = 'open'; state.filter.sev = 'all'; }
  else if (f === 'resolved') { state.filter.status = 'resolved'; state.filter.sev = 'all'; }
  else if (f === 'critical') { state.filter.sev = 'critical'; state.filter.status = 'all'; }
  renderIssuesTable();
});

// ── Search ────────────────────────────────────────────────────────────────────
document.getElementById('global-search').addEventListener('input', e => {
  state.search = e.target.value;
  if (state.currentTab === 'issues') renderIssuesTable();
});

// ── Issue actions ─────────────────────────────────────────────────────────────
async function resolveIssue(id) {
  try {
    await api('PATCH', `/issues/${id}`, { status: 'resolved' });
    const i = state.issues.find(x => x.id === id);
    if (i) i.status = 'resolved';
    renderIssuesTable();
    await refreshStats();
    toast('Issue marked resolved');
  } catch (e) { toast(e.message, 'err'); }
}

async function reopenIssue(id) {
  try {
    await api('PATCH', `/issues/${id}`, { status: 'open' });
    const i = state.issues.find(x => x.id === id);
    if (i) i.status = 'open';
    renderIssuesTable();
    await refreshStats();
    toast('Issue reopened');
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteIssue(id) {
  if (!confirm('Delete this issue? This cannot be undone.')) return;
  try {
    await api('DELETE', `/issues/${id}`);
    state.issues = state.issues.filter(x => x.id !== id);
    renderIssuesTable();
    await refreshStats();
    toast('Issue deleted');
  } catch (e) { toast(e.message, 'err'); }
}

function editIssue(id) {
  const iss = state.issues.find(x => x.id === id);
  if (!iss) return;
  openModal('Edit Issue', `
    <form id="edit-form">
      <div class="form-grid">
        <div class="form-group form-full"><label>Title</label><input name="title" value="${esc(iss.title)}" required/></div>
        <div class="form-group form-full"><label>Description</label><textarea name="description">${esc(iss.description)}</textarea></div>
        <div class="form-group"><label>Reporter</label><input name="reporter" value="${esc(iss.reporter)}"/></div>
        <div class="form-group"><label>Project</label>
          <select name="project">${['Phoenix','Atlas','Horizon','General'].map(p => `<option ${p===iss.project?'selected':''}>${p}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Severity</label>
          <select name="severity">${['critical','high','medium','low'].map(s => `<option ${s===iss.severity?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Status</label>
          <select name="status">${['open','in review','resolved','wontfix'].map(s => `<option ${s===iss.status?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Category</label>
          <select name="category">${['','technical','process','security','quality','environment','other'].map(c => `<option ${c===iss.category?'selected':''}>${c}</option>`).join('')}</select>
        </div>
        <div class="form-group form-full"><label>Root Cause</label><input name="root_cause" value="${esc(iss.root_cause)}"/></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button type="submit" class="btn btn-primary">Save Changes</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `);
  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    try {
      const updated = await api('PATCH', `/issues/${id}`, data);
      const idx = state.issues.findIndex(x => x.id === id);
      if (idx >= 0) state.issues[idx] = updated;
      renderIssuesTable();
      await refreshStats();
      closeModal();
      toast('Issue updated');
    } catch (err) { toast(err.message, 'err'); }
  });
}

// ── Add Issue form ────────────────────────────────────────────────────────────
function bindAddIssueBtn(btnId) {
  document.getElementById(btnId)?.addEventListener('click', () => {
    goTab('ingest');
    setTimeout(() => {
      document.getElementById('manual-form-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  });
}
bindAddIssueBtn('btn-add-issue');
bindAddIssueBtn('btn-add-issue2');

document.getElementById('btn-open-form')?.addEventListener('click', () => {
  document.getElementById('manual-form-section')?.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('issue-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd     = new FormData(e.target);
  const data   = Object.fromEntries(fd);
  const status = document.getElementById('form-status');
  try {
    status.textContent = 'Saving…';
    const issue = await api('POST', '/issues', data);
    state.issues.unshift(issue);
    await refreshStats();
    e.target.reset();
    status.textContent = '';
    toast('Issue saved successfully');
  } catch (err) {
    status.textContent = err.message;
    toast(err.message, 'err');
  }
});

document.getElementById('btn-form-reset')?.addEventListener('click', () => {
  document.getElementById('issue-form')?.reset();
  document.getElementById('form-status').textContent = '';
});

// ── CSV Upload ────────────────────────────────────────────────────────────────
document.getElementById('csv-upload')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  toast('Uploading CSV…', 'info');
  try {
    const fd = new FormData();
    fd.append('file', file);
    const result = await fetch('/api/issues/import-csv', { method: 'POST', body: fd });
    if (!result.ok) throw new Error('Upload failed');
    const data = await result.json();
    state.issues = [...data.issues, ...state.issues];
    await refreshStats();
    toast(`Imported ${data.imported} issues from CSV`);
  } catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
});

// ── Export CSV ────────────────────────────────────────────────────────────────
document.getElementById('btn-export')?.addEventListener('click', () => {
  const url = new URL('/api/issues/export-csv', location.href);
  const { sev, status, project } = state.filter;
  if (sev !== 'all')     url.searchParams.set('severity', sev);
  if (status !== 'all')  url.searchParams.set('status', status);
  if (project !== 'all') url.searchParams.set('project', project);
  if (state.search)      url.searchParams.set('search', state.search);
  const a = document.createElement('a');
  a.href = url.toString();
  a.download = 'issues.csv';
  a.click();
  toast('CSV download started');
});

// ── Teams mock ingest ─────────────────────────────────────────────────────────
document.getElementById('btn-teams-ingest')?.addEventListener('click', async () => {
  const mockIssues = [
    { title: 'Teams: Deployment pipeline failing on feature branch merges', reporter: 'Shreya Iyer', project: 'Phoenix', severity: 'high', category: 'technical', description: 'Raised in #phoenix-dev. Pipeline fails silently on merge.' },
    { title: 'Teams: Redis cache eviction causing session drops', reporter: 'Manish Kapoor', project: 'Atlas', severity: 'high', category: 'technical', description: 'Cache eviction policy too aggressive under load.' },
    { title: 'Teams: Sprint planning meeting not reflected in backlog', reporter: 'Ananya Roy', project: 'Horizon', severity: 'medium', category: 'process', description: 'Jira not updated after sprint planning on Monday.' },
  ];
  try {
    const btn = document.getElementById('btn-teams-ingest');
    btn.disabled = true; btn.textContent = 'Syncing…';
    for (const iss of mockIssues) {
      const created = await api('POST', '/issues', { ...iss, source: 'teams', status: 'open' });
      state.issues.unshift(created);
    }
    await refreshStats();
    toast(`Ingested ${mockIssues.length} issues from Teams`);
  } catch (e) { toast(e.message, 'err'); }
  const btn = document.getElementById('btn-teams-ingest');
  if (btn) { btn.disabled = false; btn.textContent = '↓ Ingest Mock Data'; }
});

// ── AI Classify simulation ────────────────────────────────────────────────────
const AI_STEPS = [
  'Connecting to AI engine…',
  'Reading issue titles and descriptions…',
  'Assigning category tags…',
  'Evaluating severity scores…',
  'Generating root cause hypotheses…',
  'Computing team health score…',
  'Analysis complete ✓',
];

document.getElementById('btn-classify')?.addEventListener('click', () => {
  runAIAnimation(() => {
    toast('Classification complete — all issues categorised');
    renderDashboard();
  });
});

document.getElementById('btn-run-analysis')?.addEventListener('click', () => {
  runAIAnimation(() => {
    toast('Analysis complete');
    renderAnalysis();
  });
});

function runAIAnimation(onDone) {
  const bar     = document.getElementById('ai-status');
  const fill    = document.getElementById('prog-fill');
  const text    = document.getElementById('ai-status-text');
  const counter = document.getElementById('ai-counter');
  const total   = state.issues.length || 18;

  bar.classList.remove('hidden');
  goTab('dashboard');

  let step = 0;
  const tick = () => {
    if (step >= AI_STEPS.length) {
      setTimeout(() => bar.classList.add('hidden'), 1000);
      onDone && onDone();
      return;
    }
    text.textContent    = AI_STEPS[step];
    fill.style.width    = `${Math.round((step / (AI_STEPS.length - 1)) * 100)}%`;
    counter.textContent = `${Math.min(total, Math.round((step / AI_STEPS.length) * total))} / ${total}`;
    step++;
    setTimeout(tick, 550 + Math.random() * 300);
  };
  tick();
}

// ── Analysis tab ──────────────────────────────────────────────────────────────
function renderAnalysis() {
  const s = state.stats;
  if (!s.total) { loadAll(); return; }

  document.getElementById('health-score').textContent = s.health;
  document.getElementById('analysis-title').textContent = 'AI Analysis · Sprint 14';
  document.getElementById('analysis-summary-text').innerHTML =
    `Analysed <strong>${s.total}</strong> issues across <strong>${(s.byProj||[]).length}</strong> project(s). ` +
    `Currently <strong style="color:var(--red)">${s.critical} critical</strong> and ` +
    `<strong style="color:var(--orange)">${(s.bySev||[]).find(x=>x.severity==='high')?.c||0} high</strong> severity issues are open. ` +
    `Team health score is <strong style="color:${parseFloat(s.health) >= 7 ? 'var(--green)' : parseFloat(s.health) >= 4 ? 'var(--yellow)' : 'var(--red)'}">` +
    `${s.health}/10</strong> based on issue density and severity distribution.`;

  // Metrics row
  document.getElementById('analysis-metrics').innerHTML = [
    { label: 'total', val: s.total, color: 'var(--text)' },
    { label: 'open', val: s.open, color: 'var(--orange)' },
    { label: 'critical', val: s.critical, color: 'var(--red)' },
    { label: 'resolved', val: s.resolved, color: 'var(--green)' },
  ].map(m => `
    <div>
      <div style="font-size:28px;font-weight:800;font-family:var(--font-display);color:${m.color}">${m.val}</div>
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-top:2px">${m.label}</div>
    </div>`).join('');

  // Grid
  const grid = document.getElementById('analysis-grid');
  grid.style.display = 'grid';

  const cats = (s.byCat || []).slice(0, 5);
  const maxC = cats[0]?.c || 1;
  const catGrads = {
    technical:'linear-gradient(90deg,#6c63ff,#8b85ff)',process:'linear-gradient(90deg,#ff9933,#ffb84d)',
    security:'linear-gradient(90deg,#ff4d4d,#ff7a7a)',quality:'linear-gradient(90deg,#4d9fff,#7ab8ff)',
    environment:'linear-gradient(90deg,#26c6b0,#4de0ce)',
  };
  document.getElementById('analysis-cats').innerHTML = cats.map(c => `
    <div class="pattern-item" style="border-left-color:${catGrads[c.category]?.split(',')[1]?.split(')')[0]||'var(--accent)'}">
      <div class="pattern-title">${c.category || 'other'}</div>
      <div class="pattern-sub">${c.c} issue${c.c !== 1 ? 's' : ''}</div>
      <div style="margin-top:6px;background:var(--bg4);border-radius:3px;height:4px;overflow:hidden">
        <div style="height:100%;width:${Math.round((c.c/maxC)*100)}%;background:${catGrads[c.category]||'var(--accent)'};border-radius:3px"></div>
      </div>
    </div>`).join('');

  const projs = (s.byProj || []);
  const maxP  = projs[0]?.c || 1;
  document.getElementById('analysis-projs').innerHTML = projs.map(p => `
    <div class="pattern-item">
      <div class="pattern-title">${p.project}</div>
      <div class="pattern-sub">${p.c} total issues</div>
      <div style="margin-top:6px;background:var(--bg4);border-radius:3px;height:4px;overflow:hidden">
        <div style="height:100%;width:${Math.round((p.c/maxP)*100)}%;background:var(--accent);border-radius:3px"></div>
      </div>
    </div>`).join('');

  // Recommendations
  const recos = buildRecommendations(s);
  const recoCard = document.getElementById('analysis-reco-card');
  recoCard.style.display = 'block';
  document.getElementById('reco-grid').innerHTML = recos.map(r => `
    <div class="reco-card" style="border-top:2px solid ${r.color}">
      <div class="reco-prio" style="color:${r.color}">${r.priority}</div>
      <div class="reco-action">${r.action}</div>
      <div class="reco-rationale">${r.rationale}</div>
    </div>`).join('');
}

function buildRecommendations(s) {
  const recs = [];
  if (s.critical > 0) recs.push({ priority: 'Immediate', color: 'var(--red)',
    action: `Resolve ${s.critical} critical issue${s.critical > 1 ? 's' : ''}`,
    rationale: `${s.critical} critical issue${s.critical > 1 ? 's are' : ' is'} blocking safe release. Patch before next deployment.` });

  const secCount = (s.byCat||[]).find(c => c.category === 'security')?.c || 0;
  if (secCount > 0) recs.push({ priority: 'Short term', color: 'var(--orange)',
    action: 'Add SAST scanning to CI pipeline',
    rationale: `${secCount} security issue${secCount > 1 ? 's' : ''} detected. Automated scanning would catch these before merge.` });

  const procCount = (s.byCat||[]).find(c => c.category === 'process')?.c || 0;
  if (procCount > 1) recs.push({ priority: 'Short term', color: 'var(--orange)',
    action: 'Introduce PR review SLA and CODEOWNERS',
    rationale: `${procCount} process issues indicate review bottlenecks. A 24h SLA and auto-assignment will unblock velocity.` });

  if (recs.length < 3) recs.push({ priority: 'Long term', color: 'var(--green)',
    action: 'Establish sprint retrospective cadence',
    rationale: 'Regular retrospectives prevent issues from becoming entrenched patterns across sprints.' });

  return recs.slice(0, 3);
}

// ── Patterns tab ──────────────────────────────────────────────────────────────
function renderPatterns() {
  renderVelocityChart();
  renderSprintTable();
  renderCompositionChart();
}

// Sub-tab nav
document.querySelectorAll('[data-psub]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-psub]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.psub').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    const panel = document.getElementById('psub-' + btn.dataset.psub);
    if (panel) { panel.classList.remove('hidden'); panel.classList.add('active'); }
  });
});

document.getElementById('pattern-project-select')?.addEventListener('change', async (e) => {
  const sprints = await api('GET', `/sprints?project=${e.target.value}`);
  state.sprints = sprints;
  renderVelocityChart();
  renderSprintTable();
  renderCompositionChart();
});

function renderVelocityChart() {
  const sprints = state.sprints;
  const wrap    = document.getElementById('velocity-chart-wrap');
  if (!wrap || !sprints.length) return;

  const maxV = 10;
  wrap.innerHTML = `<div class="vel-bar-wrap" style="height:120px">${
    sprints.map(s => {
      const pct   = (s.velocity_score / maxV) * 100;
      const color = s.velocity_score >= 7 ? 'var(--green)' : s.velocity_score >= 4 ? 'var(--yellow)' : 'var(--red)';
      return `
        <div class="vel-bar-col">
          <div class="vel-bar-val" style="color:${color}">${s.velocity_score}</div>
          <div class="vel-bar-fill" style="height:${pct}%;background:${color};width:100%;border-radius:4px 4px 0 0;min-height:4px"></div>
          <div class="vel-bar-label">${s.sprint_label.replace('Sprint ', 'S')}</div>
        </div>`;
    }).join('')
  }</div>`;

  // KPIs below
  const last = sprints[sprints.length - 1] || {};
  const prev = sprints[sprints.length - 2] || {};
  const trend = last.velocity_score > (prev.velocity_score || 0) ? '↑' : last.velocity_score < (prev.velocity_score || 0) ? '↓' : '→';
  const trendColor = trend === '↑' ? 'var(--green)' : trend === '↓' ? 'var(--red)' : 'var(--text3)';
  document.getElementById('pattern-kpis').innerHTML = `
    <div class="kpi-card green"><div class="kpi-label">Latest Velocity</div><div class="kpi-value green">${last.velocity_score || '—'}</div><div class="kpi-sub">/ 10 score</div><div class="kpi-bg-num">${last.velocity_score || ''}</div></div>
    <div class="kpi-card ${trend === '↑' ? 'green' : 'red'}"><div class="kpi-label">Trend</div><div class="kpi-value ${trend === '↑' ? 'green' : 'red'}" style="color:${trendColor}">${trend}</div><div class="kpi-sub">vs prev sprint</div></div>
    <div class="kpi-card orange"><div class="kpi-label">Critical (latest)</div><div class="kpi-value orange">${last.critical || 0}</div><div class="kpi-sub">in ${last.sprint_label || '—'}</div><div class="kpi-bg-num">${last.critical || 0}</div></div>
    <div class="kpi-card accent"><div class="kpi-label">Sprints Tracked</div><div class="kpi-value accent">${sprints.length}</div><div class="kpi-sub">${sprints[0]?.sprint_label || '—'} → now</div></div>
  `;
}

function renderCompositionChart() {
  const sprints = state.sprints;
  const wrap    = document.getElementById('composition-chart-wrap');
  if (!wrap || !sprints.length) return;

  const maxT = Math.max(...sprints.map(s => s.total_issues)) || 1;
  wrap.innerHTML = `<div class="comp-bar-wrap" style="height:140px">${
    sprints.map(s => {
      const ch = Math.round((s.critical / maxT) * 120);
      const hh = Math.round((s.high     / maxT) * 120);
      return `
        <div class="comp-bar-col">
          <div style="font-size:9px;font-family:var(--font-mono);color:var(--text3)">${s.total_issues}</div>
          <div class="comp-stacked" style="height:${Math.round((s.total_issues/maxT)*120)}px;min-height:4px">
            <div style="height:${ch}px;background:var(--red);min-height:${s.critical?4:0}px"></div>
            <div style="height:${hh}px;background:var(--orange);min-height:${s.high?4:0}px"></div>
            <div style="flex:1;background:var(--blue);opacity:.5"></div>
          </div>
          <div class="vel-bar-label">${s.sprint_label.replace('Sprint ', 'S')}</div>
        </div>`;
    }).join('')
  }</div>
  <div style="display:flex;gap:14px;margin-top:8px;font-size:10px;color:var(--text3)">
    <span><span style="color:var(--red)">■</span> Critical</span>
    <span><span style="color:var(--orange)">■</span> High</span>
    <span><span style="color:var(--blue);opacity:.6">■</span> Medium+Low</span>
  </div>`;
}

function renderSprintTable() {
  const tbody = document.getElementById('sprint-tbody');
  if (!tbody) return;
  const sprints = [...state.sprints].reverse();
  if (!sprints.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><big>◉</big>No sprint data loaded</div></td></tr>`;
    return;
  }
  const velColor = v => v >= 7 ? 'var(--green)' : v >= 4 ? 'var(--yellow)' : 'var(--red)';
  tbody.innerHTML = sprints.map(s => `
    <tr>
      <td style="font-family:var(--font-mono);color:var(--accent2)">${s.sprint_label}</td>
      <td style="font-family:var(--font-mono)">${s.total_issues}</td>
      <td style="font-family:var(--font-mono);color:${s.critical > 2 ? 'var(--red)' : 'var(--text)'};font-weight:${s.critical > 2 ? 700 : 400}">${s.critical}</td>
      <td style="font-family:var(--font-mono);color:var(--orange)">${s.high}</td>
      <td style="font-family:var(--font-mono);color:var(--blue)">${s.medium}</td>
      <td style="font-family:var(--font-mono);color:var(--text2)">${s.low}</td>
      <td style="font-family:var(--font-mono);color:var(--green)">${s.resolved}</td>
      <td>${s.top_category ? `<span class="cat-tag">${s.top_category}</span>` : '—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div style="width:50px;height:5px;background:var(--bg4);border-radius:3px;overflow:hidden">
            <div style="width:${(s.velocity_score/10)*100}%;height:100%;background:${velColor(s.velocity_score)};border-radius:3px"></div>
          </div>
          <span style="font-family:var(--font-mono);font-size:11px;color:${velColor(s.velocity_score)}">${s.velocity_score}</span>
        </div>
      </td>
    </tr>`).join('');
}

// ── Document tab ──────────────────────────────────────────────────────────────
function renderDocument() {
  const s   = state.stats;
  if (!s.total) return;
  const now = new Date().toLocaleDateString('en-IN', { dateStyle: 'long' });
  document.getElementById('doc-filename').textContent = `issueai-report-${now.replace(/ /g,'-')}.md`;
  document.getElementById('doc-meta').textContent = `Generated ${now} · ${s.total} issues · Live data`;
  document.getElementById('btn-download-report').href = '/api/report';

  // Render preview in doc-body
  const issues = state.issues.filter(i => i.status === 'open').slice(0, 8);
  document.getElementById('doc-body').innerHTML = `
    <div class="md-h1">Project Issues Intelligence Report</div>
    <div class="md-p"><strong>Generated:</strong> ${now} &nbsp;|&nbsp; <strong>Projects:</strong> ${(s.byProj||[]).map(p=>p.project).join(', ')} &nbsp;|&nbsp; <strong>Total Issues:</strong> ${s.total}</div>

    <div class="md-h2">1. Executive Summary</div>
    <div class="md-p">This report covers <strong>${s.total} total issues</strong> across ${(s.byProj||[]).length} project(s). Currently <strong style="color:var(--red)">${s.open} issues are open</strong> including <strong style="color:var(--red)">${s.critical} critical</strong> requiring immediate attention. Team health score is <strong>${s.health}/10</strong>.</div>

    <div class="md-h2">2. Key Metrics</div>
    <table class="md-table">
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total Issues</td><td>${s.total}</td></tr>
      <tr><td>Open</td><td>${s.open}</td></tr>
      <tr><td>Critical (open)</td><td><span class="md-badge c">${s.critical}</span></td></tr>
      <tr><td>Resolved</td><td>${s.resolved}</td></tr>
      <tr><td>Team Health Score</td><td>${s.health} / 10</td></tr>
    </table>

    <div class="md-h2">3. Top Open Issues</div>
    <table class="md-table">
      <tr><th>#</th><th>Title</th><th>Project</th><th>Severity</th><th>Category</th></tr>
      ${issues.map((i, idx) => `
        <tr>
          <td>${idx+1}</td>
          <td>${esc(i.title)}</td>
          <td>${esc(i.project)}</td>
          <td><span class="md-badge ${i.severity[0]}">${i.severity}</span></td>
          <td>${i.category || '—'}</td>
        </tr>`).join('')}
    </table>

    <div class="md-h2">4. Recommendations</div>
    <ul class="md-ul">
      ${s.critical > 0 ? `<li><strong>Immediate:</strong> Resolve ${s.critical} critical issue${s.critical>1?'s':''} before next release</li>` : ''}
      <li><strong>Short term:</strong> Add automated security scanning (SAST) to CI pipeline</li>
      <li><strong>Short term:</strong> Enforce PR review SLA and introduce CODEOWNERS</li>
      <li><strong>Long term:</strong> Run retrospectives to prevent issues becoming recurring patterns</li>
    </ul>

    <div style="margin-top:24px;padding-top:14px;border-top:1px solid var(--border);font-size:11px;color:var(--text3)">
      <em>Report generated by IssueAI · Open Source Project Intelligence · <a href="/api/report" download style="color:var(--accent)">Download full .md</a></em>
    </div>
  `;
}

// ── Copy report ───────────────────────────────────────────────────────────────
document.getElementById('btn-copy-report')?.addEventListener('click', async () => {
  try {
    const res  = await fetch('/api/report');
    const text = await res.text();
    await navigator.clipboard.writeText(text);
    toast('Report copied to clipboard');
  } catch (e) { toast('Copy failed — try Download instead', 'err'); }
});

// ── Refresh stats ─────────────────────────────────────────────────────────────
async function refreshStats() {
  state.stats = await api('GET', '/stats');
  const badge = document.getElementById('nav-badge-issues');
  if (badge) badge.textContent = state.stats.open || state.issues.length;
  if (state.currentTab === 'dashboard') renderDashboard();
}

// ── HTML escape ───────────────────────────────────────────────────────────────
function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  await loadAll();
  // Animate bar fills
  setTimeout(() => {
    document.querySelectorAll('.bar-fill').forEach(b => {
      const w = b.style.width;
      b.style.width = '0';
      requestAnimationFrame(() => { setTimeout(() => { b.style.width = w; }, 50); });
    });
  }, 200);
})();
