/* ── Rank Tracker Frontend App ── */

// ─── API Client ──────────────────────────────────────────────
const api = {
  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  },
  // Auth
  signup:  (e, p)       => api.request('POST', '/api/auth/signup', { email: e, password: p }),
  login:   (e, p)       => api.request('POST', '/api/auth/login',  { email: e, password: p }),
  logout:  ()           => api.request('POST', '/api/auth/logout'),
  me:      ()           => api.request('GET',  '/api/auth/me'),
  // Projects
  listProjects:  ()     => api.request('GET',  '/api/projects'),
  createProject: (n, d) => api.request('POST', '/api/projects', { name: n, domain: d }),
  deleteProject: (id)   => api.request('DELETE',`/api/projects/${id}`),
  getProject:    (id)   => api.request('GET',  `/api/projects/${id}`),
  // Keywords
  listKeywords:  (pid)     => api.request('GET',  `/api/projects/${pid}/keywords`),
  addKeyword:    (pid, kw, se) => api.request('POST', `/api/projects/${pid}/keywords`, { keyword: kw, search_engine: se || 'google' }),
  deleteKeyword: (pid, kid) => api.request('DELETE',`/api/projects/${pid}/keywords/${kid}`),
  // Rank checks
  listRankChecks: (pid, kid) => api.request('GET', `/api/projects/${pid}/keywords/${kid}/rank-checks`),
};

// ─── State ──────────────────────────────────────────────────
let state = {
  user: null,
  projects: [],
  currentView: 'auth',
  currentProject: null,
  keywords: [],
};

// ─── Helpers ────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function toast(msg, type = 'success') {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3000);
}

function rankClass(pos) {
  if (pos === null || pos === undefined) return 'na';
  if (pos <= 3) return 'high';
  if (pos <= 10) return 'mid';
  return 'low';
}

// ─── Render ─────────────────────────────────────────────────
function render() {
  const app = $('#app');
  if (!state.user) {
    app.innerHTML = renderAuth();
    bindAuth();
    return;
  }
  app.innerHTML = renderHeader() + renderBody();
  bindHeader();
}

function renderHeader() {
  return `<div class="header">
    <h1>Rank Tracker</h1>
    <div class="header-right">
      <span>${escapeHtml(state.user.email)}</span>
      <button class="btn btn-sm" id="logout-btn">Log out</button>
    </div>
  </div>`;
}

function renderBody() {
  if (state.currentProject) {
    return renderProjectDetail();
  }
  return renderProjectList();
}

// ─── Auth View ──────────────────────────────────────────────
function renderAuth() {
  return `<div class="auth-view">
    <div class="card">
      <h2>Sign In</h2>
      <div class="auth-error" id="auth-error"></div>
      <form id="auth-form">
        <div class="form-group">
          <label for="auth-email">Email</label>
          <input type="email" id="auth-email" required autocomplete="email">
        </div>
        <div class="form-group">
          <label for="auth-password">Password</label>
          <input type="password" id="auth-password" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%" id="auth-submit">Sign In</button>
      </form>
      <div class="auth-toggle">
        <span id="auth-toggle-text">Don't have an account? </span><a id="auth-toggle-link">Sign Up</a>
      </div>
    </div>
  </div>`;
}

function bindAuth() {
  const form = $('#auth-form');
  const toggleLink = $('#auth-toggle-link');
  const toggleText = $('#auth-toggle-text');
  const errorEl = $('#auth-error');
  const submitBtn = $('#auth-submit');
  let isLogin = true;

  function toggleMode() {
    isLogin = !isLogin;
    submitBtn.textContent = isLogin ? 'Sign In' : 'Sign Up';
    toggleText.textContent = isLogin ? "Don't have an account? " : 'Already have an account? ';
    toggleLink.textContent = isLogin ? 'Sign Up' : 'Sign In';
    errorEl.style.display = 'none';
  }

  toggleLink.addEventListener('click', toggleMode);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    try {
      const user = isLogin
        ? await api.login(email, password)
        : await api.signup(email, password);
      state.user = user;
      await loadProjects();
      render();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isLogin ? 'Sign In' : 'Sign Up';
    }
  });
}

// ─── Project List ───────────────────────────────────────────
function renderProjectList() {
  let html = `<div class="projects-header">
    <h2>Projects</h2>
  </div>`;

  // Add project form
  html += `<form class="add-project-form" id="add-project-form">
    <input type="text" id="project-name" placeholder="Project name" required>
    <input type="text" id="project-domain" placeholder="Domain (e.g. example.com)" required>
    <button type="submit" class="btn btn-primary">Add</button>
  </form>`;

  if (state.projects.length === 0) {
    html += `<div class="card empty-state">No projects yet. Create one above.</div>`;
  } else {
    for (const p of state.projects) {
      html += `<div class="card project-card" data-id="${p.id}">
        <div class="project-info">
          <h3>${escapeHtml(p.name)}</h3>
          <div class="domain">${escapeHtml(p.domain)}</div>
        </div>
        <div class="project-actions">
          <button class="btn btn-sm view-project-btn" data-id="${p.id}">Open</button>
          <button class="btn btn-sm btn-danger delete-project-btn" data-id="${p.id}">Delete</button>
        </div>
      </div>`;
    }
  }

  return html;
}

function bindProjectList() {
  // Add project
  const form = $('#add-project-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#project-name').value.trim();
      const domain = $('#project-domain').value.trim();
      if (!name || !domain) return;
      try {
        await api.createProject(name, domain);
        await loadProjects();
        render();
        toast('Project created');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // View project
  for (const btn of $$('.view-project-btn')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openProject(btn.dataset.id);
    });
  }

  // Delete project
  for (const btn of $$('.delete-project-btn')) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this project and all its keywords?')) return;
      try {
        await api.deleteProject(btn.dataset.id);
        await loadProjects();
        render();
        toast('Project deleted');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // Click card body to open
  for (const card of $$('.project-card')) {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.project-actions')) return;
      openProject(card.dataset.id);
    });
  }
}

async function openProject(id) {
  try {
    const project = await api.getProject(id);
    const keywords = await api.listKeywords(id);
    state.currentProject = project;
    state.keywords = keywords;
    render();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Project Detail ─────────────────────────────────────────
function renderProjectDetail() {
  const p = state.currentProject;
  let html = `<a class="back-link" id="back-link">← Back to projects</a>`;

  // Header
  html += `<div class="project-detail-header">
    <div>
      <h2>${escapeHtml(p.name)}</h2>
      <div class="project-detail-meta">${escapeHtml(p.domain)}</div>
    </div>
  </div>`;

  // Add keyword form
  html += `<form class="add-keyword-form" id="add-keyword-form">
    <input type="text" id="keyword-text" placeholder="Keyword" required>
    <input type="text" id="keyword-engine" placeholder="Search engine (e.g. google)" value="google">
    <button type="submit" class="btn btn-primary">Add</button>
  </form>`;

  // Keywords list
  if (state.keywords.length === 0) {
    html += `<div class="card empty-state">No keywords yet. Add one above.</div>`;
  } else {
    html += `<div class="card" style="padding:0">`;
    for (const kw of state.keywords) {
      const latest = kw.last_rank;
      const rc = rankClass(latest);
      html += `<div class="keyword-row">
        <div>
          <span class="keyword-name">${escapeHtml(kw.keyword)}</span>
          <span class="keyword-engine">${escapeHtml(kw.search_engine)}</span>
        </div>
        <div class="keyword-right">
          <div class="keyword-rank ${rc}">${latest !== null && latest !== undefined ? latest : '—'}</div>
          <div class="keyword-actions">
            <button class="btn btn-sm btn-icon rank-history-btn" data-pid="${p.id}" data-kid="${kw.id}">History</button>
            <button class="btn btn-sm btn-icon btn-danger delete-keyword-btn" data-pid="${p.id}" data-kid="${kw.id}">✕</button>
          </div>
        </div>
      </div>`;
      // Append sparkline data after the row — we'll inject it via JS after render
    }
    html += `</div>`;
  }

  return html;
}

function bindProjectDetail() {
  const b = $('#back-link');
  if (b) b.addEventListener('click', () => {
    state.currentProject = null;
    state.keywords = [];
    render();
  });

  // Add keyword
  const form = $('#add-keyword-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const keyword = $('#keyword-text').value.trim();
      const engine = $('#keyword-engine').value.trim() || 'google';
      if (!keyword) return;
      try {
        await api.addKeyword(state.currentProject.id, keyword, engine);
        state.keywords = await api.listKeywords(state.currentProject.id);
        render();
        toast('Keyword added');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // Delete keyword
  for (const btn of $$('.delete-keyword-btn')) {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this keyword and all its rank history?')) return;
      try {
        await api.deleteKeyword(btn.dataset.pid, btn.dataset.kid);
        state.keywords = await api.listKeywords(state.currentProject.id);
        render();
        toast('Keyword deleted');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // Rank history — also fetch to enrich with latest rank + sparkline
  for (const btn of $$('.rank-history-btn')) {
    btn.addEventListener('click', async () => {
      await showRankHistory(btn.dataset.pid, btn.dataset.kid);
    });
  }
}

// ─── Rank History Modal ─────────────────────────────────────
async function showRankHistory(projectId, keywordId) {
  // Find the keyword from state
  const kw = state.keywords.find(k => String(k.id) === String(keywordId));
  const label = kw ? `${kw.keyword} (${kw.search_engine})` : 'Keyword';

  try {
    const checks = await api.listRankChecks(projectId, keywordId);

    // Build modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal">
      <button class="close-btn" id="modal-close">✕</button>
      <h3>Rank History</h3>
      <div class="modal-sub">${escapeHtml(label)} — last ${checks.length} check${checks.length !== 1 ? 's' : ''}</div>
      <div id="modal-body"></div>
    </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    $('#modal-close').addEventListener('click', close);

    const body = $('#modal-body');

    if (checks.length === 0) {
      body.innerHTML = `<div class="empty-state">No rank checks recorded yet.</div>`;
      return;
    }

    // Sparkline at top
    const reversed = [...checks].reverse(); // chronological
    const positions = reversed.map(c => c.position);
    const maxPos = Math.max(...positions.filter(p => p !== null), 10);
    const minPos = Math.min(...positions.filter(p => p !== null), 1);
    const range = Math.max(maxPos - minPos, 1);

    let sparkHtml = '<div style="display:flex;align-items:flex-end;gap:3px;height:40px;margin-bottom:20px">';
    for (const pos of positions) {
      const h = pos !== null ? Math.max(4, ((maxPos - pos + minPos) / range) * 36) : 4;
      sparkHtml += `<div class="sparkline-bar ${rankClass(pos)}" style="height:${h}px;width:8px"></div>`;
    }
    sparkHtml += '</div>';
    body.innerHTML = sparkHtml;

    // Table
    let tableHtml = `<table class="rank-history-table">
      <thead><tr><th>Position</th><th>Search Engine</th><th>Checked At</th></tr></thead>
      <tbody>`;
    for (const c of checks) {
      const posDisplay = c.position !== null ? c.position : '—';
      const posCls = rankClass(c.position);
      tableHtml += `<tr>
        <td><span class="keyword-rank ${posCls}" style="display:inline">${posDisplay}</span></td>
        <td>${escapeHtml(c.search_engine)}</td>
        <td style="color:var(--text-muted)">${escapeHtml(c.checked_at || '')}</td>
      </tr>`;
    }
    tableHtml += `</tbody></table>`;
    body.innerHTML += tableHtml;

  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Loading ─────────────────────────────────────────────────
async function tryAutoLogin() {
  try {
    const user = await api.me();
    state.user = user;
    await loadProjects();
    return true;
  } catch {
    return false;
  }
}

async function loadProjects() {
  try {
    state.projects = await api.listProjects();
  } catch {
    // Not critical
  }
}

function bindHeader() {
  const btn = $('#logout-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      await api.logout();
      state.user = null;
      state.projects = [];
      state.currentProject = null;
      state.keywords = [];
      render();
    });
  }
}

// ─── Main ────────────────────────────────────────────────────
async function init() {
  render();
  const loggedIn = await tryAutoLogin();
  if (loggedIn) render();
}

// Re-bind after every render via MutationObserver
const observer = new MutationObserver(() => {
  // Bind based on current view
  if (state.user) {
    bindHeader();
    if (state.currentProject) {
      bindProjectDetail();
    } else {
      bindProjectList();
    }
  }
});
observer.observe($('#app'), { childList: true, subtree: true });

init();