/* =========================================================
   ULB AUDIT MANAGEMENT SYSTEM
   Main Application JavaScript
   ========================================================= */


/* =========================================================
   1. DOM HELPERS
   ========================================================= */

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => [
  ...document.querySelectorAll(selector)
];


/* =========================================================
   2. APPLICATION STATE
   ========================================================= */

const state = {
  user: null,
  companyName: '',

  view: 'dashboard',
  lang: 'en',

  districts: [],
  ulbs: [],
  audits: [],
  form2: [],
  users: [],
  logs: [],

  ulb: '',
  fy: '2026',
  month: new Date().getMonth() + 1,
  contextLoadSeq: 0,

  // Checklist state
  checklistId: null,
  checklistTab: 'A',
  checklistDraft: null
};

// A module with access=true and mode=read is view-only. Admin users retain full access.
function canEditFeature(feature) {
  if (state.user?.role === 'admin') return true;
  const permission = state.user?.permissions?.[feature];
  return Boolean(permission?.access && permission.mode === 'full');
}


/* =========================================================
   3. CONSTANTS
   ========================================================= */

const months = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const t = {
  en: {
    dashboard: 'Dashboard',
    register: 'Audit Register',
    queries: 'Form-2 Queries',
    reports: 'Reports D-1 to D-7',
    attendance: 'Attendance',
    admin: 'Admin',
    users: 'User Management',
    ulbs: 'ULB Master',
    checklists: 'Checklists',
    logs: 'Audit Trail',
    company: 'Company Details',
    logout: 'Logout'
  },

  hi: {
    dashboard: 'डैशबोर्ड',
    register: 'ऑडिट रजिस्टर',
    queries: 'फॉर्म-2 प्रश्न',
    reports: 'रिपोर्ट D-1 से D-7',
    attendance: 'उपस्थिति',
    admin: 'एडमिन',
    users: 'यूज़र प्रबंधन',
    ulbs: 'ULB मास्टर',
    logs: 'ऑडिट ट्रेल',
    company: 'कंपनी विवरण',
    logout: 'लॉगआउट'
  }
};


/* =========================================================
   4. API / NETWORK HELPERS
   ========================================================= */

async function api(path, opts = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    },
    ...opts
  });

  const contentType =
    response.headers.get('content-type') || '';

  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(
      data.error ||
      data ||
      'Request failed'
    );
  }

  return data;
}


/* =========================================================
   5. GENERAL UTILITIES
   ========================================================= */

function toast(message, bad = false) {
  const element = document.createElement('div');

  element.textContent = message;

  element.style = `
    position: fixed;
    right: 15px;
    bottom: 15px;
    z-index: 99;
    background: ${bad ? '#b42318' : '#163b65'};
    color: white;
    padding: 12px 16px;
    border-radius: 9px;
    box-shadow: 0 8px 25px #0003;
  `;

  document.body.appendChild(element);

  setTimeout(() => element.remove(), 2800);
}


function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char])
  );
}


function money(value) {
  return Number(value || 0).toLocaleString(
    'en-IN',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );
}


function pill(value) {
  if (
    value === 'Y' ||
    value === 'Audited' ||
    value === 'OK'
  ) {
    return `<span class="pill ok">${value}</span>`;
  }

  if (
    value === 'N' ||
    value === 'Pending' ||
    value === 'OUTSIDE_GEOFENCE'
  ) {
    return `<span class="pill bad">${value}</span>`;
  }

  return `
    <span class="pill warn">
      ${value || '-'}
    </span>
  `;
}


function modal(html) {
  const element = document.createElement('div');

  element.className = 'modal';
  element.id = 'modal';

  element.innerHTML = `
    <div class="modal-card">
      ${html}
    </div>
  `;

  document.body.appendChild(element);
}


function closeModal() {
  $('#modal')?.remove();
}


function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}


/* =========================================================
   6. APPLICATION BOOTSTRAP
   ========================================================= */

async function boot() {
  const response = await api('/api/me');

  state.user = response.user;

  if (!state.user) {
    return renderLogin();
  }

  await loadMasters();
  try {
    const brand = await api('/api/company-brand');
    state.companyName = String(brand.companyName || '').trim();
  } catch (error) {
    state.companyName = '';
  }
  renderApp();
}


async function loadMasters() {
  state.districts = await api('/api/districts');
  state.ulbs = await api('/api/ulbs');

  if (!state.ulb && state.ulbs[0]) {
    state.ulb = state.ulbs[0].id;
  }

  await loadRows();
}


async function loadRows() {
  const seq = ++state.contextLoadSeq;
  const context = {
    ulb: String(state.ulb || ''),
    fy: String(state.fy || ''),
    month: String(state.month || '')
  };
  const query = new URLSearchParams(context);

  const [audits, form2] = await Promise.all([
    api('/api/audits?' + query),
    api('/api/form2?ulb=' + encodeURIComponent(context.ulb))
  ]);

  // Ignore responses for a context the user has already changed.
  if (seq !== state.contextLoadSeq ||
      context.ulb !== String(state.ulb || '') ||
      context.fy !== String(state.fy || '') ||
      context.month !== String(state.month || '')) return;

  state.audits = audits;
  state.form2 = form2;
}


/* =========================================================
   7. AUTHENTICATION
   ========================================================= */

function renderLogin() {
  document.body.innerHTML = `
    <div class="login">
      <div class="login-card">

        <div class="logo">
          ULB Audit Management System
        </div>

        <div class="sub">
          Pre-Audit / Internal Audit •
          Responsive Web Application
        </div>

        <form id="loginForm">

          <div class="field">
            <label>
              Registered Mobile Number
            </label>

            <input
              name="mobile"
              value="9999999999"
              required
            >
          </div>

          <div class="field">
            <label>Password</label>

            <input
              type="password"
              name="password"
              value="Admin@123"
              required
            >
          </div>

          <button
            class="btn"
            style="width:100%"
          >
            Login
          </button>

        </form>

        <p
          class="muted"
          style="font-size:12px;margin-top:15px"
        >
          Demo admin:
          9999999999 / Admin@123
        </p>

      </div>
    </div>
  `;

  $('#loginForm').onsubmit = async (event) => {
    event.preventDefault();

    const formData = new FormData(event.target);

    try {
      const response = await api(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            mobile: formData.get('mobile'),
            password: formData.get('password')
          })
        }
      );

      state.user = response.user;

      await loadMasters();
      renderApp();

    } catch (error) {
      toast(error.message, true);
    }
  };
}


async function logout() {
  await api(
    '/api/auth/logout',
    { method: 'POST' }
  );

  state.user = null;

  renderLogin();
}


function toggleLang() {
  state.lang =
    state.lang === 'en'
      ? 'hi'
      : 'en';

  renderApp();
}


/* =========================================================
   8. APPLICATION LAYOUT / NAVIGATION
   ========================================================= */

function nav(view, label) {
  const perms=state.user?.permissions||{};
  const feature=view==='users'||view==='ulbs'||view==='logs'||view==='company'?'admin':view;
  if(state.user?.role!=='admin' && Object.keys(perms).length && !perms[feature]?.access) return '';
  const icons = { dashboard: '', register: '', queries: '', reports: '', checklists: '', attendance: '', users: '', ulbs: '', logs: '', company: '' };
  return `
    <button class="${state.view === view ? 'active' : ''}" onclick="go('${view}')" aria-current="${state.view === view ? 'page' : 'false'}">
      <span class="nav-icon" aria-hidden="true">${icons[view] || '•'}</span>
      <span class="nav-label">${label}</span>
      ${state.view === view ? '<span class="nav-active-mark" aria-hidden="true"></span>' : ''}
    </button>
  `;
}


function renderApp() {
  document.body.innerHTML = `
    <div class="shell">

      <aside
        class="sidebar"
        id="side"
      >

        <div class="brand">
          <div class="brand-mark" aria-hidden="true">UA</div>
          <div class="brand-copy"><strong>ULB Audit Desk</strong><span>Pre / Internal Audit · CG</span></div>
        </div>

        <nav class="nav">

          ${nav(
            'dashboard',
            t[state.lang].dashboard
          )}
          ${nav(
            'checklists',
            t[state.lang].checklists
          )}

          ${nav(
            'register',
            t[state.lang].register
          )}

          ${nav(
            'queries',
            t[state.lang].queries
          )}

          ${nav(
            'reports',
            t[state.lang].reports
          )}

          ${nav(
            'd4567',
            'D4,5,6,7'
          )}

          ${nav(
            'attendance',
            t[state.lang].attendance
          )}

          ${
            (state.user.role === 'admin' || state.user?.permissions?.admin?.access)
              ? `
                <div
                  style="
                    padding:14px 7px 5px;
                    font-size:10px;
                    text-transform:uppercase;
                    opacity:.55
                  "
                >
                  ${t[state.lang].admin}
                </div>

                ${nav(
                  'users',
                  t[state.lang].users
                )}

                ${nav(
                  'ulbs',
                  t[state.lang].ulbs
                )}


                ${nav(
                  'logs',
                  t[state.lang].logs
                )}

                ${nav(
                  'company',
                  t[state.lang].company
                )}
              `
              : ''
          }

        </nav>
        <div class="sidebar-profile">
          <!--<div class="sidebar-avatar">${esc((state.user.name || 'A').trim().charAt(0).toUpperCase())}</div>-->
          <div class="sidebar-profile-copy"><strong>${esc(state.user.name)}</strong><br><span>${esc(state.user.role)}</span></div>
          <span class="profile-status" title="Signed in"></span>
        </div>
      </aside>


      <main class="main">

        <header class="top">

          <div class="top-left">
            <button class="btn secondary mobile-menu" aria-label="Toggle navigation" onclick="$('#side').classList.toggle('open')">☰</button>
            <div class="top-breadcrumb"><span id="topCompanyName">${esc(state.companyName || 'ULB AUDIT DESK')}</span><br><strong>${esc((t[state.lang] && t[state.lang][state.view]) || state.view || 'Workspace')}</strong></div>
          </div>


          <div class="actions">

            <button
              class="btn secondary sm"
              onclick="toggleLang()"
            >
              ${
                state.lang === 'en'
                  ? 'हिन्दी'
                  : 'English'
              }
            </button>

            <button
              class="btn secondary sm"
              onclick="logout()"
            >
              ${t[state.lang].logout}
            </button>

          </div>

        </header>


        <section
          class="content"
          id="content"
        ></section>

      </main>

    </div>
  `;

  renderView();
}


async function go(v){
  const perms=state.user?.permissions||{};
  const feature=v==='users'||v==='ulbs'||v==='logs'||v==='company'?'admin':v;
  if(state.user?.role!=='admin' && Object.keys(perms).length && !perms[feature]?.access){toast('You do not have access to this module.',true);return;}
  state.view=v;
  $('#side').classList.remove('open');
  renderApp();
}


async function renderView() {
  const content = $('#content');

  if (!content) return;
  const adminView=['users','ulbs','logs','company'].includes(state.view);
  if(adminView && state.user?.role!=='admin' && !state.user?.permissions?.admin?.access){state.view='dashboard';return dashboard(content);}

  if (state.view === 'dashboard') {
    return dashboard(content);
  }

  if (state.view === 'register') {
    return register(content);
  }

  if (state.view === 'queries') {
    await loadRows();
    return queries(content);
  }

  if (state.view === 'reports') {
    return reports(content);
  }

  if (state.view === 'd4567') {
    return d4567Page(content);
  }

  if (['d4','d5','d6','d7'].includes(state.view)) {
    return d4567DetailPage(content, state.view.toUpperCase());
  }

  if (state.view === 'attendance') {
    return attendance(content);
  }

  if (state.view === 'company') {
    if (state.user.role !== 'admin' && !state.user?.permissions?.admin?.access) { state.view='dashboard'; return dashboard(content); }
    return companyDetails(content);
  }

  if (state.view === 'users') {
    return users(content);
  }

  if (state.view === 'ulbs') {
    return ulbs(content);
  }

  if (state.view === 'checklists') {
    return checklists(content);
  }

  if (state.view === 'checklist-detail') {
    const checklist =
      state.checklistDraft ||
      await api(
        '/api/checklist-records/' +
        state.checklistId
      );

    state.checklistDraft = checklist;

    return checklistDetailView(
      content,
      checklist
    );
  }

  if (state.view === 'logs') {
    return logs(content);
  }
}


/* =========================================================
   9. SHARED CONTEXT / FILTER BAR
   ========================================================= */

function contextBar() {
  return `
    <div class="toolbar">

      <div class="field">
        <label>District</label>

        <select
          id="district"
          onchange="filterDistrict()"
        >
          ${state.districts.map(d => `
            <option
              value="${d.id}"
              ${
                state.ulbs.find(
                  x => x.id === state.ulb
                )?.district_id === d.id
                  ? 'selected'
                  : ''
              }
            >
              ${esc(d.name)}
            </option>
          `).join('')}
        </select>
      </div>


      <div class="field">
        <label>ULB</label>

        <select
          id="ulb"
          onchange="changeContext()"
        >
          ${state.ulbs
            .filter(x => x.active)
            .map(x => `
              <option
                value="${x.id}"
                ${x.id === state.ulb ? 'selected' : ''}
              >
                ${esc(x.name)}
              </option>
            `)
            .join('')}
        </select>
      </div>


      <div class="field">
        <label>Financial Year</label>

        <select
          id="fy"
          onchange="changeContext()"
        >
          ${[
            '2025-26',
            '2026-27',
            '2027-28'
          ].map(x => `
            <option
              ${x === state.fy ? 'selected' : ''}
            >
              ${x}
            </option>
          `).join('')}
        </select>
      </div>


      <div class="field">
        <label>Month</label>

        <select
          id="month"
          onchange="changeContext()"
        >
          ${months.slice(1).map(
            (month, index) => `
              <option
                value="${index + 1}"
                ${
                  Number(state.month) === index + 1
                    ? 'selected'
                    : ''
                }
              >
                ${month}
              </option>
            `
          ).join('')}
        </select>
      </div>

    </div>
  `;
}


async function filterDistrict() {
  const districtId = $('#district').value;

  const availableUlbs = state.ulbs.filter(
    ulb =>
      ulb.active &&
      ulb.district_id === districtId
  );

  if (availableUlbs[0]) {
    state.ulb = availableUlbs[0].id;
    const ulbSelect = $('#ulb');
    if (ulbSelect) ulbSelect.value = state.ulb;
    await changeContext();
  }
}


async function changeContext() {
  const ulbSelect = $('#ulb');
  const fySelect = $('#fy');
  const monthSelect = $('#month');
  if (ulbSelect) state.ulb = ulbSelect.value;
  if (fySelect) state.fy = fySelect.value;
  if (monthSelect) state.month = Number(monthSelect.value);

  await loadRows();
  renderView();
}


/* =========================================================
   10. DASHBOARD
   ========================================================= */

async function dashboard(content) {
  content.innerHTML = `<div class="dashboard-loading card">Loading dashboard...</div>`;

  try {
    const query = new URLSearchParams({
      ulb: state.ulb || '',
      fy: state.fy || '',
      month: state.month || ''
    });
    const data = await api(`/api/dashboard?${query}`);
    const monthLabel = months[Number(state.month)] || months[state.month] || '';
    const ulbName = state.ulbs.find(x => x.id === state.ulb)?.name || 'All assigned ULBs';
    const districts = Array.isArray(data.district_progress) ? data.district_progress : [];
    const recent = Array.isArray(data.recent_checklists) ? data.recent_checklists : [];

    const cards = [
      { label: 'ULBs', value: data.assigned_ulbs ?? 0, icon: '▦', tone: 'blue' },
      { label: 'CHECKLISTS', value: data.checklist_count ?? 0, icon: '☑', tone: 'purple' },
      { label: 'DRAFTS', value: data.draft_count ?? 0, icon: '▤', tone: 'orange' },
      { label: 'QUERIES', value: data.pending_form2 ?? 0, icon: '▱', tone: 'green' },
      { label: 'APPROVED, UNPAID', value: data.bills_not_paid ?? 0, icon: '!', tone: 'pink' },
      { label: 'PASSED (₹)', value: money(data.passed_total ?? 0), icon: '₹', tone: 'mint' }
    ];

    content.innerHTML = `
      <section class="dashboard-page">
        <header class="dashboard-heading">
          <div class="dashboard-greeting">
            <div class="dashboard-wave">👋</div>
            <div>
              <h1>Namaste, ${esc(state.user?.name || 'Admin')}</h1>
              <p>${esc(ulbName)} · Audit overview</p>
            </div>
          </div>
          <label class="dashboard-month">
            <span>▦</span>
            <select aria-label="Dashboard month" onchange="state.month=Number(this.value); renderView()">
              ${Object.entries(months).map(([key, value]) => `<option value="${esc(key)}" ${String(key) === String(state.month) ? 'selected' : ''}>${esc(value)} ${esc(state.fy || '')}</option>`).join('')}
            </select>
          </label>
        </header>

        <div class="dashboard-stat-grid">
          ${cards.map(card => `
            <div class="dashboard-stat ${card.tone}">
              <div class="dashboard-stat-icon">${card.icon}</div>
              <div class="dashboard-stat-copy">
                <div class="dashboard-stat-label">${card.label}</div>
                <div class="dashboard-stat-value">${esc(card.value)}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="dashboard-panels">
          <section class="dashboard-panel district-panel">
            <div class="dashboard-panel-heading">
              <h2><span class="panel-heading-icon">▥</span> District progress</h2>
            </div>
            <div class="dashboard-table-wrap">
              <table class="dashboard-table">
                <thead><tr><th>DISTRICT</th><th>ULBS</th><th>CHECKLISTS</th><th>APPROVED</th><th>QUERIES</th><th>PASSED ₹</th></tr></thead>
                <tbody>
                  ${districts.length ? districts.map(row => `
                    <tr>
                      <td>${esc(row.district)}</td>
                      <td>${esc(row.ulbs)}</td>
                      <td>${esc(row.checklists)}</td>
                      <td class="positive">${esc(row.approved)}</td>
                      <td class="query-count">${esc(row.queries)}</td>
                      <td class="amount-cell">${esc(money(row.passed))}</td>
                    </tr>`).join('') : `<tr><td colspan="6" class="dashboard-empty">No district data available</td></tr>`}
                </tbody>
              </table>
            </div>
          </section>

          <section class="dashboard-panel recent-panel">
            <div class="dashboard-panel-heading">
              <h2><span class="panel-heading-icon">◷</span> Recent checklists</h2>
              <button class="dashboard-circle-button" title="View all checklists" onclick="go('checklists')">→</button>
            </div>
            <div class="dashboard-recent-list">
              ${recent.length ? recent.map(row => `
                <button class="dashboard-recent-row" onclick="openChecklist('${esc(row.id)}')">
                  <span class="dashboard-recent-icon">▤</span>
                  <span class="dashboard-recent-copy">
                    <strong>${esc(row.checklist_no || 'Checklist')}</strong>
                    <small>${esc(row.work || row.party || row.type || 'Checklist')} · ${esc(row.ulb_name || 'ULB')}</small>
                  </span>
                  <span class="dashboard-status ${String(row.status).toLowerCase() === 'final' ? 'final' : 'draft'}">${esc(row.status || 'Draft')}</span>
                </button>
              `).join('') : `<div class="dashboard-empty">No checklists yet</div>`}
            </div>
          </section>
        </div>
      </section>
    `;
  } catch (error) {
    content.innerHTML = `<div class="card warning-box">Unable to load dashboard: ${esc(error.message || 'Please try again.')}</div>`;
  }
}


function stat(label, value) {
  return `
    <div class="card">
      <div class="muted">
        ${label}
      </div>

      <div class="stat">
        ${value}
      </div>
    </div>
  `;
}


/* =========================================================
   11. AUDIT REGISTER
   ========================================================= */

function register(content) {
  const readOnly=state.user?.role!=='admin' && state.user?.permissions?.register?.mode!=='full';
  content.innerHTML = `
    <section class="register-page">
      <header class="module-heading register-heading">
        <div class="module-heading-main">
          <div class="module-icon" aria-hidden="true">▤</div>
          <div>
            <h1>Internal Audit Register</h1>
            <p>Auto-filled from finalised checklists. Add cheque details as payments are issued.</p>
          </div>
        </div>
        <div class="module-heading-actions">
          ${readOnly?'':`<button class="btn register-add-btn" onclick="auditModal()"><span aria-hidden="true">＋</span> Add row (no checklist)</button>`}
          <button class="btn secondary" onclick="downloadAuditCsv()">
            <span aria-hidden="true">⇩</span> Export CSV
          </button>
        </div>
      </header>

      <section class="register-table-panel">
        <div class="register-table-scroll">
          <table class="table register-table">
            <thead>
              <tr>
                <th>Sr.</th>
                <th>Checklist No.</th>
                <th>File Recd.</th>
                <th>Audit Date</th>
                <th>Scheme / Fund</th>
                <th>Nature of Work</th>
                <th>Contractor</th>
                <th>Amount</th>
                <th>Appr.</th>
                <th>Query Sheet</th>
                <th>Proposed Net</th>
                <th>Passed Net</th>
                <th>Cheque</th>
                <th>Query / Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                state.audits.map((row, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>
                      <span class="register-checklist-no">${esc(row.checklist_no || '—')}</span>
                    </td>
                    <td>${esc(row.file_received_date || '—')}</td>
                    <td>${esc(row.audit_date || '—')}</td>
                    <td>${esc(row.scheme_fund || '—')}</td>
                    <td>${esc(row.nature_work || '—')}</td>
                    <td>${esc(row.party || '—')}</td>
                    <td class="register-money">${money(row.amount)}</td>
                    <td>${pill(row.payment_approved)}</td>
                    <td>
                      ${row.form2_number
                        ? `<span class="register-query-tag">${esc(row.form2_number)}</span>`
                        : (row.query_text ? `<span class="register-query-tag">Query</span>` : '<span class="register-dash">—</span>')}
                    </td>
                    <td class="register-money">${money(row.proposed_payment)}</td>
                    <td class="register-money">${money(row.payment_passed)}</td>
                    <td>${pill(row.cheque_issued)}</td>
                    <td class="register-remarks">${esc(row.query_text || row.remarks || '—')}</td>
                    <td>
                      <div class="register-row-actions">
                        ${readOnly?'':`<button class="btn secondary sm" onclick='editAudit(${JSON.stringify(row)})'>Edit</button><button class="btn secondary sm" onclick='deleteAudit(${JSON.stringify(row.id)})'>Delete</button>`}
                      </div>
                    </td>
                  </tr>
                `).join('') ||
                `<tr><td colspan="15" class="empty register-empty">No records for this month.</td></tr>`
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="10" class="register-total-label">TOTAL</td>
                <td class="register-money">${money(state.audits.reduce((sum, row) => sum + Number(row.proposed_payment || 0), 0))}</td>
                <td class="register-money">${money(state.audits.reduce((sum, row) => sum + Number(row.payment_passed || 0), 0))}</td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </section>
  `;
}

function auditModal(row = {}) {
  modal(`
    <h2>${row.id ? 'Edit' : 'New'} Audit Register Row</h2>
    <form id="auditForm">
      <div class="form-grid two">
        ${input('file_received_date','Received Date of Files by Internal Auditor',row.file_received_date,'date',true)}
        ${input('audit_date','Date of Audit',row.audit_date,'date',true)}
        ${input('scheme_fund','Name of Scheme / Fund',row.scheme_fund,'text',true)}
        ${input('nature_work','Nature of Work',row.nature_work,'text',true)}
        ${input('party','Contractor',row.party,'text',true)}
        ${input('proposed_payment','Proposed for Payment (Net Amt.)',row.proposed_payment,'number',true)}
        ${input('payment_passed','Passed for Payment (Net Amt.)',row.payment_passed,'number',true)}
        <div class="field">
          <label>Cheque Issued</label>
          <input type="hidden" id="auditChequeIssuedValue" name="cheque_issued" value="${String(row.cheque_issued || 'N').toUpperCase() === 'Y' ? 'Y' : 'N'}">
          <div class="actions" role="group" aria-label="Cheque Issued">
            <button type="button" id="auditChequeIssuedYes" class="btn ${String(row.cheque_issued || '').toUpperCase() === 'Y' ? 'ok' : 'secondary'}">Yes</button>
            <button type="button" id="auditChequeIssuedNo" class="btn ${String(row.cheque_issued || 'N').toUpperCase() === 'N' ? 'bad' : 'secondary'}">No</button>
          </div>
        </div>
        <div class="field" id="auditPaymentModeField" ${String(row.cheque_issued || '').toUpperCase() === 'Y' ? '' : 'hidden'}>
          <label for="auditPaymentMode">Mode of Payment</label>
          <select id="auditPaymentMode" name="payment_mode">
            <option value="">Select…</option>
            <option value="Cheque" ${String(row.payment_mode || '') === 'Cheque' ? 'selected' : ''}>Cheque</option>
            <option value="Online (NEFT/RTGS)" ${String(row.payment_mode || '') === 'Online (NEFT/RTGS)' ? 'selected' : ''}>Online (NEFT/RTGS)</option>
          </select>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label>Query Details</label>
          <textarea name="query_text" rows="4">${esc(row.query_text || row.remarks || '')}</textarea>
        </div>
      </div>
      <div id="sameWarn"></div>
      <div class="actions">
        <button class="btn">Save</button>
        <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `);

  const chequeIssuedValue = $('#auditChequeIssuedValue');
  const paymentModeField = $('#auditPaymentModeField');
  const paymentModeSelect = $('#auditPaymentMode');
  const setChequeIssued = (value) => {
    chequeIssuedValue.value = value;
    $('#auditChequeIssuedYes').className = `btn ${value === 'Y' ? 'ok' : 'secondary'}`;
    $('#auditChequeIssuedNo').className = `btn ${value === 'N' ? 'bad' : 'secondary'}`;
    paymentModeField.hidden = value !== 'Y';
    paymentModeSelect.required = value === 'Y';
    if (value !== 'Y') paymentModeSelect.value = '';
  };
  // Apply visibility and validation rules to existing rows as well as new rows.
  setChequeIssued(chequeIssuedValue.value);
  $('#auditChequeIssuedYes').onclick = () => setChequeIssued('Y');
  $('#auditChequeIssuedNo').onclick = () => setChequeIssued('N');

  $('#auditForm').onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    data.ulb_id = row.ulb_id || state.ulb;
    data.financial_year = row.financial_year || state.fy;
    data.month = row.month || state.month;
    data.scheme_fund = data.scheme_fund || '';
    // Audit Registry query details and remarks share one stored query text.
    data.query_text = String(data.query_text ?? data.remarks ?? '');
    data.remarks = data.query_text;
    if (data.cheque_issued === 'Y' && !String(data.payment_mode || '').trim()) {
      paymentModeSelect.focus();
      toast('Please select Mode of Payment before saving.', true);
      return;
    }
    if (data.cheque_issued !== 'Y') data.payment_mode = '';
    for (const key of ['proposed_payment','payment_passed']) data[key] = Number(data[key] || 0);
    try {
      await api(row.id ? '/api/audits/' + row.id : '/api/audits', {
        method: row.id ? 'PATCH' : 'POST', body: JSON.stringify(data)
      });
      closeModal(); await loadRows(); register($('#content')); toast('Saved');
    } catch (error) { toast(error.message, true); }
  };
}

function input(
  name,
  label,
  value = '',
  type = 'text',
  required = false
) {
  return `
    <div class="field">

      <label>
        ${label}
      </label>

      <input
        name="${name}"
        type="${type === 'true' ? 'text' : type}"
        value="${esc(value)}"
        ${required ? 'required' : ''}
      >

    </div>
  `;
}


function select(
  name,
  label,
  value,
  options
) {
  return `
    <div class="field">

      <label>
        ${label}
      </label>

      <select name="${name}">

        ${options.map(option => `
          <option
            ${option === value ? 'selected' : ''}
          >
            ${option}
          </option>
        `).join('')}

      </select>

    </div>
  `;
}


function editAudit(row) {
  auditModal(row);
}

async function deleteAudit(id){
  if(!confirm('Are you sure you want to delete this Audit Register record?')){
    return;
  }

  try{
    await api('/api/audits/' + encodeURIComponent(id), {
      method:'DELETE'
    });

    await loadRows();
    register($('#content'));

    toast('Audit Register record deleted');
  }catch(err){
    toast(err.message, true);
  }
}


function downloadAuditCsv() {
  window.location =
    `/api/export/audits?ulb=${state.ulb}&fy=${state.fy}&month=${state.month}`;
}


/* =========================================================
   12. FORM-2 QUERY MANAGEMENT
   ========================================================= */

function queries(content) {
  content.innerHTML = `
    <div class="f2-page">
      <div class="f2-page-heading">
        <div>
          <div class="f2-eyebrow">AUDIT MANAGEMENT</div>
          <div class="title">Form-2 Query Sheets</div>
          <div class="muted">Manage query sheets, bill references and supporting documents.</div>
        </div>
        <button class="btn" onclick="form2Modal()">＋ New Query Sheet</button>
      </div>

      <div class="f2-summary">
        <div class="f2-stat"><span>Total Query Sheets</span><strong>${state.form2.length}</strong></div>
        <div class="f2-stat"><span>Verified</span><strong>${state.form2.filter(row => row.verified).length}</strong></div>
        <div class="f2-stat"><span>With Attachments</span><strong>${state.form2.filter(row => row.image_data).length}</strong></div>
      </div>

      <section class="f2-panel">
        <div class="f2-panel-head">
          <div>
            <h3>Query Sheet Register</h3>
            <p class="muted">Search records or filter by verification status.</p>
          </div>
          <div class="f2-filter-controls">
            <input id="f2-search" type="search" placeholder="Search query sheets…" aria-label="Search query sheets">
            <select id="f2-verified-filter" aria-label="Filter verification">
              <option value="all">All statuses</option>
              <option value="yes">Verified</option>
              <option value="no">Not verified</option>
            </select>
          </div>
        </div>

        <div class="table-wrap f2-table-wrap">
          <table class="table f2-table">
            <thead>
              <tr>
                <th>Query Sheet No.</th>
                <th>Checklist No.</th>
                <th>Date</th>
                <th>Bill / Invoice Reference</th>
                <th>Amount</th>
                <th>Party</th>
                <th>Query</th>
                <th>Verified</th>
                <th>Attachment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="f2-table-body">
              ${state.form2.map(row => {
                const searchable = [
                  row.form2_number, row.checklist_no, row.query_date, row.bill_invoice_reference,
                  row.amount, row.party_name, row.query_text
                ].filter(Boolean).join(' ').toLowerCase();
                const fileUrl = row.image_data || '';
                const fileName = esc(row.image_name || 'Form-2 attachment');
                const attachment = fileUrl && fileUrl.startsWith('data:image/')
                  ? `<a class="f2-attachment-preview" href="${fileUrl}" target="_blank" rel="noopener" title="Open ${fileName}"><img src="${fileUrl}" alt="Form-2 attachment preview" loading="lazy"><span>View image ↗</span></a>`
                  : fileUrl
                    ? `<a class="f2-file-link" href="${fileUrl}" target="_blank" rel="noopener" title="Open ${fileName}" download="${fileName}"><span>↗</span> View file</a>`
                    : row.image_name
                      ? `<span class="f2-no-file" title="${fileName}">File name saved, but attachment data is missing</span>`
                      : `<span class="f2-no-file">No file attached</span>`;
                return `
                  <tr data-search="${esc(searchable)}" data-verified="${row.verified ? 'yes' : 'no'}">
                    <td><strong>${esc(row.form2_number || '—')}</strong></td>
                    <td>${esc(row.checklist_no || '—')}</td>
                    <td>${esc(row.query_date || '—')}</td>
                    <td>${esc(row.bill_invoice_reference || '—')}</td>
                    <td class="f2-amount">${money(row.amount)}</td>
                    <td>${esc(row.party_name || '—')}</td>
                    <td class="f2-query-cell" title="${esc(row.query_text || '')}">${esc(row.query_text || '—')}</td>
                    <td>${pill(row.verified ? 'YES' : 'NO')}</td>
                    <td>${attachment}</td>
                    <td><button class="btn btn-sm" onclick="viewForm2Query('${esc(row.id)}')">View Query</button></td>
                  </tr>`;
              }).join('') || `
                <tr><td colspan="10" class="empty f2-empty">
                  <div class="f2-empty-icon">▤</div>
                  <strong>No query sheets yet</strong>
                  <p>Add a Form-2 query sheet to see it listed here.</p>
                </td></tr>`
              }
              <tr id="f2-no-results" hidden><td colspan="10" class="empty">No matching query sheets found.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="f2-table-footer"><span id="f2-visible-count">${state.form2.length} record${state.form2.length === 1 ? '' : 's'}</span><span>Form-2 Query Management</span></div>
      </section>
    </div>
  `;

  const search = document.getElementById('f2-search');
  const status = document.getElementById('f2-verified-filter');
  const filterRows = () => {
    const query = (search.value || '').trim().toLowerCase();
    const verified = status.value;
    const rows = [...document.querySelectorAll('#f2-table-body tr[data-search]')];
    let visible = 0;
    rows.forEach(row => {
      const matches = row.dataset.search.includes(query) &&
        (verified === 'all' || row.dataset.verified === verified);
      row.hidden = !matches;
      if (matches) visible++;
    });
    const noResults = document.getElementById('f2-no-results');
    if (noResults) noResults.hidden = visible > 0 || rows.length === 0;
    const count = document.getElementById('f2-visible-count');
    if (count) count.textContent = `${visible} record${visible === 1 ? '' : 's'}`;
  };
  search.addEventListener('input', filterRows);
  status.addEventListener('change', filterRows);
}

async function viewForm2Query(queryId) {
  try {
    const query = state.form2.find(x => String(x.id) === String(queryId));
    if (!query) throw new Error('Query record not found. Refresh the page and try again');
    let checklist = null;
    const checklistId = query.checklist_record_id || query.audit_register_id || '';
    if (checklistId) {
      try { checklist = await api(`/api/checklist-records/${encodeURIComponent(checklistId)}`); } catch (_) {}
    }
    if (!checklist && query.checklist_no) {
      const records = await api('/api/checklist-records');
      checklist = (records || []).find(x => String(x.checklist_no || '') === String(query.checklist_no)) || null;
    }
    const docs = await api(`/api/query-documents?checklistRecordId=${encodeURIComponent(checklist?.id || '')}&checklistNumber=${encodeURIComponent(query.checklist_no || '')}`);
    const linkedDocs = Array.isArray(docs) ? docs : [];
    const prettyLabel = key => String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const valueMarkup = (value) => {
      if (value === null || value === undefined || value === '') return '<span class="f2-detail-empty">—</span>';
      if (typeof value === 'boolean') return `<span class="f2-detail-value">${value ? 'Yes' : 'No'}</span>`;
      if (Array.isArray(value)) {
        if (!value.length) return '<span class="f2-detail-empty">—</span>';
        return `<div class="f2-detail-list">${value.map((item, i) => `<article class="f2-detail-item"><h4>${typeof item === 'object' && item ? esc(item.name || item.title || `Item ${i + 1}`) : `Item ${i + 1}`}</h4>${valueMarkup(item)}</article>`).join('')}</div>`;
      }
      if (typeof value === 'object') {
        const entries = Object.entries(value).filter(([k,v]) => !['id','created_at','updated_at','created_by','updated_by'].includes(k) && v !== undefined);
        if (!entries.length) return '<span class="f2-detail-empty">—</span>';
        return `<dl class="f2-detail-fields">${entries.map(([k,v]) => `<div class="f2-detail-field"><dt>${esc(prettyLabel(k))}</dt><dd>${valueMarkup(v)}</dd></div>`).join('')}</dl>`;
      }
      const str = String(value);
      return `<span class="f2-detail-value">${esc(str)}</span>`;
    };
    const sectionName = key => prettyLabel(key.replace(/^(section|sec)_?/i, 'Section '));
    const checklistMarkup = checklist
      ? Object.entries(checklist).filter(([key]) => !['id','query_form','created_at','updated_at','created_by','updated_by'].includes(key)).map(([key,value]) => `<section class="f2-detail-section"><h3>${esc(sectionName(key))}</h3>${valueMarkup(value)}</section>`).join('')
        + (checklist.query_form ? `<section class="f2-detail-section"><h3>G. Queries Form</h3>${valueMarkup(checklist.query_form)}</section>` : '')
      : `<section class="f2-detail-section"><h3>Checklist</h3><p>Linked checklist data could not be found for this query.</p></section>`;
    const attachments = [];
    if (query.image_data) attachments.push({name:query.image_name || 'Form-2 attachment',url:query.image_data,mime:(query.image_data.match(/^data:([^;,]+)/)||[])[1]||''});
    linkedDocs.forEach(doc => attachments.push({name:doc.original_filename || 'Saved attachment',url:doc.view_url,mime:doc.image_format ? `image/${doc.image_format}` : ''}));
    const attachmentMarkup = attachments.length ? attachments.map(file => {
      const isImage = /^image\//i.test(file.mime) || /^data:image\//i.test(file.url);
      const isPdf = /pdf/i.test(file.mime) || /\.pdf(?:$|\?)/i.test(file.name);
      const url = file.url;
      if (!url) return `<div class="f2-detail-attachment"><strong>${esc(file.name)}</strong><p class="f2-detail-empty">Attachment is missing or inaccessible.</p></div>`;
      return `<div class="f2-detail-attachment"><strong>${esc(file.name)}</strong>${isImage ? `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${esc(file.name)}" class="f2-detail-image"></a>` : isPdf ? `<iframe title="${esc(file.name)}" src="${url}" class="f2-detail-pdf"></iframe>` : `<p>Preview unavailable for this file type.</p>`}<a class="btn btn-sm" href="${url}" download="${esc(file.name)}">Download</a></div>`;
    }).join('') : '<p>No saved attachments are linked to this query.</p>';
    const queryFields = {form2_number:query.form2_number,checklist_no:query.checklist_no,query_date:query.query_date,bill_invoice_reference:query.bill_invoice_reference,amount:query.amount,party_name:query.party_name,query_text:query.query_text,verified:query.verified};
    modal(`<div class="modal-head f2-view-head"><h2>View Query — ${esc(query.form2_number || query.checklist_no || '')}</h2><button class="btn" onclick="closeModal()">Close</button></div>
      <div class="f2-query-details"><section class="f2-detail-section"><h3>Form-2 Query</h3>${valueMarkup(queryFields)}</section>${checklistMarkup}<section class="f2-detail-section"><h3>Attachments</h3><div class="f2-detail-gallery">${attachmentMarkup}</div></section></div>`);
  } catch (error) { toast(error.message || 'Unable to open query details'); }
}

function form2Modal() {
  const options =
    state.audits.filter(
      row => row.payment_approved === 'N'
    );

  modal(`
    <h2>
      FORM-2 Query
    </h2>

    <p class="muted">
      Upload a Form-2 image and enter/confirm
      the extracted fields. This local build
      stores the image; connect a production OCR
      provider to automate extraction.
    </p>

    <form id="f2">

      <div class="field">

        <label>
          Audit Register Row
        </label>

        <select name="audit_register_id">

          ${options.map(row => `
            <option value="${row.id}">
              ${esc(row.voucher_no)}
              —
              ${esc(row.party)}
            </option>
          `).join('')}

        </select>

      </div>


      <div class="form-grid">

        ${input(
          'form2_number',
          'Query Sheet Serial No.'
        )}

        ${input(
          'query_date',
          'Date',
          '',
          'date'
        )}

        ${input(
          'bill_invoice_reference',
          'Bill/Invoice Reference'
        )}

        ${input(
          'amount',
          'Amount',
          '',
          'number'
        )}

        ${input(
          'party_name',
          'Contractor/Vendor'
        )}

      </div>


      <div class="field">

        <label>
          Query
        </label>

        <textarea
          name="query_text"
          required
        ></textarea>

      </div>


      <div class="field">

        <label>
          Form-2 Image
        </label>

        <input
          type="file"
          id="f2img"
          accept="
            image/png,
            image/jpeg,
            application/pdf
          "
        >

      </div>


      <div class="actions">

        <button class="btn">
          Save
        </button>

        <button
          type="button"
          class="btn secondary"
          onclick="closeModal()"
        >
          Cancel
        </button>

      </div>

    </form>
  `);

  $('#f2').onsubmit = async (event) => {
    event.preventDefault();

    const formData =
      new FormData(event.target);

    const data =
      Object.fromEntries(formData.entries());

    data.ulb_id = state.ulb;
    data.verified = true;
    data.ai_extracted = false;
    data.confidence = 0;
    data.amount = Number(
      data.amount || 0
    );

    const file =
      $('#f2img').files[0];

    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        return toast(
          'Image/file must be below 5 MB',
          true
        );
      }

      data.image_name = file.name;
      data.image_data =
        await fileToDataUrl(file);
    }

    try {
      await api(
        '/api/form2',
        {
          method: 'POST',
          body: JSON.stringify(data)
        }
      );

      closeModal();

      await loadRows();

      queries($('#content'));

      toast('Form-2 saved');

    } catch (error) {
      toast(error.message, true);
    }
  };
}


/* =========================================================
   D4-D7 PAGE
   ========================================================= */

function d4567Page(content) {
  const sections = [
    { code: 'D4', title: 'Irregularities + Revenue', desc: 'Review recorded irregularities and revenue observations.' },
    { code: 'D5', title: 'Statutory Deductions / Compliance', desc: 'Summarize statutory deductions and compliance matters.' },
    { code: 'D6', title: 'Unpaid / Paid-Un-audited / Advances / FD', desc: 'Review unpaid bills, unaudited payments, advances and fixed deposits.' },
    { code: 'D7', title: 'Major Observations / Red Flags', desc: 'Highlight major audit observations and red flags.' }
  ];
  content.innerHTML = `
    <section class="d-reports-page d4567-page">
      <div class="d-reports-heading"><div>
        <div class="d-reports-eyebrow">REPORTING CENTRE</div>
        <h1 class="d-reports-title"><span class="d-reports-title-icon">▤</span> D4,5,6,7</h1>
        <p class="d-reports-subtitle">Choose a report to open its dedicated page.</p>
      </div></div>
      <div class="d4567-sections">
        ${sections.map(section => `
          <button type="button" class="d4567-card d4567-link-card" onclick="go('${section.code.toLowerCase()}')">
            <header class="d4567-card-head"><span class="d4567-code">${section.code}</span><div><h2>${esc(section.title)}</h2><p>${esc(section.desc)}</p></div><span class="d4567-open-arrow" aria-hidden="true">›</span></header>
          </button>`).join('')}
      </div>
    </section>`;
}

function d567MonthRange(value){
 const parts=String(value||'').split('-').map(Number),year=parts[0],month=parts[1];
 if(!year||!month)return '';
 const lastDay=new Date(year,month,0).getDate(),pad=n=>String(n).padStart(2,'0');
 return `01.${pad(month)}.${year}-${pad(lastDay)}.${pad(month)}.${year}`;
}
function d567MonthChanged(value){
 if(!value)return;
 const [year,month]=value.split('-').map(Number);
 state.fy=String(year);state.month=month;
 const range=d567MonthRange(value);
 document.querySelectorAll('[data-d5-period-title]').forEach(el=>el.textContent=el.dataset.baseTitle+' ('+range+')');
 d4567Load('D5');
}
function d4567DetailPage(content, code) {
  const details = {
    D4: { title: 'Irregularities + Revenue', desc: 'Major and minor irregularities, and revenue receipts.' },
    D5: { title: 'Statutory Deductions / Compliance', desc: 'Summarize statutory deductions and compliance matters.' },
    D6: { title: 'Unpaid / Paid-Un-audited / Advances / FD', desc: 'Review unpaid bills, unaudited payments, advances and fixed deposits.' },
    D7: { title: 'Major Observations / Red Flags', desc: 'Highlight major audit observations and red flags.' }
  };
  const detail = details[code];
  const codes = ['D4','D5','D6','D7'];
  const subnav = `<nav class="d4567-subnav" aria-label="D4 to D7 pages">
    ${codes.map(c => `<button type="button" class="d4567-subnav-btn ${c===code?'active':''}" ${c===code?'aria-current="page"':''} onclick="go('${c.toLowerCase()}')">${c}</button>`).join('')}
    <button type="button" class="d4567-back-btn" onclick="go('d4567')">← All D4–D7 reports</button></nav>`;
  if (code === 'D4') {
    content.innerHTML = `<section class="d-reports-page d4567-page d4-pdf-layout">
      <div class="d-reports-heading"><div><div class="d-reports-eyebrow">REPORTING CENTRE / D4</div>
      <h1 class="d-reports-title">D4 — Irregularities</h1>
      <p class="d-reports-subtitle">Monthly report · Annexure D-4</p></div></div>
      ${subnav}
      <div class="d4-savebar"><button class="btn primary" type="button" onclick="d4567Save()">Save D4</button><span id="d4567-save-status"></span></div>
      <div class="d4-toolbar"><label>District / ULB <input id="d4-ulb" value="${esc(state.ulbName || '')}" placeholder="ULB name"></label><label>Reporting month <input id="d4-month" type="month" value="${String(state.fy||new Date().getFullYear())}-${String(state.month||new Date().getMonth()+1).padStart(2,'0')}" onchange="d4MonthChanged(this.value)"></label></div>
      <section class="d4567-card d4-block"><h2>Major Irregularities</h2><div class="d4-table-wrap"><table class="d4-table"><thead><tr><th>#</th><th>IRREGULARITY &amp; CORRECTIVE ACTION</th><th></th></tr></thead><tbody id="d4-major"></tbody></table></div><button class="btn secondary d4-add" type="button" onclick="d4AddRow('major')">＋ Add row</button></section>
      <section class="d4567-card d4-block"><h2>Minor Irregularities</h2><div class="d4-table-wrap"><table class="d4-table"><thead><tr><th>#</th><th>IRREGULARITY &amp; CORRECTIVE ACTION</th><th></th></tr></thead><tbody id="d4-minor"></tbody></table><p id="d4-minor-empty" class="d4-empty">No rows yet</p></div><button class="btn secondary d4-add" type="button" onclick="d4AddRow('minor')">＋ Add row</button></section>
      <section class="d4567-card d4-block"><h2>Revenue: Receipts during the financial year [₹ In Lacs]</h2><div class="d4-table-wrap"><table class="d4-table d4-revenue"><thead><tr><th>HEAD</th><th>TARGET</th><th>TILL LAST MONTH</th><th>CURRENT MONTH</th><th>CUMULATIVE</th><th>COLLECTION %</th></tr></thead><tbody>
      ${['Property Tax','Samekit Tax','Water Tax','Other Taxes'].map((name,i)=>`<tr><td>${name}</td><td>${i===0?`<span class="d4-target-value">255</span> <small>from 2026-10</small> <button type="button" class="btn secondary sm" onclick="d4SetTarget(this)">Change</button>`:`<span class="d4-target-value">-</span> <button type="button" class="btn secondary sm" onclick="d4SetTarget(this)">Set</button>`}</td><td><input class="d4-till-last" type="number" min="0" step="0.01" aria-label="${name} till last month" value="0.00" oninput="d4ManualCarry(this)"></td><td><input class="d4-current-month" type="number" min="0" step="0.01" aria-label="${name} current month" oninput="d4Calc(this);d4ScheduleCarryRefresh()"></td><td class="d4-cumulative">0.00</td><td class="d4-percent">${i===0?'0.00%':'-'}</td></tr>`).join('')}
      </tbody></table></div><p class="d4-note">Targets are locked once set. Only admin can change a target, effective from a chosen month onward; earlier months keep the old target.</p></section>
    </section>`;
    ['major','minor'].forEach(kind=>d4RenderRows(kind));
    d4567Load('D4');
    return;
  }
  if (['D5','D6','D7'].includes(code)) {
    const cfg = {
      D5: [
        {id:'d5-deductions', title:'Details of Statutory deduction [In ₹]', fields:['PARTICULARS','PAYMENT DUE','DEPOSIT DATE','DEDUCTED','DEPOSITED','INTEREST','REMARKS'], rows:[['TDS 393','','','','','',''],['TDS 392','','','','','',''],['GST (TDS)','','','','','',''],['LWF','','','','','',''],['Royalty','','','','','','']]},
        {id:'d5-compliances', title:'Details of Statutory Compliances', fields:['PARTICULAR','DUE DATE OF FILING','ACTUAL DATE FILED','DEMAND AFTER FILING','NOTICE DETAILS','PENALTY','REMARKS'], rows:[['TDS-IT','','','','','',''],['GST(TDS)','','','','','','']]},
        {id:'d5-liabilities', title:'Details of other Liabilities [₹ In Lacs]', fields:['PARTICULAR','DUE DATE','DEPOSIT DATE','OUTSTANDING','DEPOSITED','INTEREST','REMARKS'], rows:[['Electricity Bill','','','','','',''],['Telephone Bill','','','','','','']]},
      ],
      D6: [
        {id:'d6-paid-unaudited',title:'Bills not Audited but Paid by ULB',fields:['DATE','PARTICULAR','VOUCHER NO.','AMOUNT','REMARK'],rows:[]},
        {id:'d6-advances',title:'Advances paid by ULB',fields:['DATE','PARTICULAR / EMPLOYEE','VOUCHER NO.','AMOUNT','REMARK'],rows:[]},
        {id:'d6-fds',title:'Fixed Deposits',fields:['FD NO.','BANK','FUND','AMOUNT','INVESTED','MATURITY','RATE %'],rows:[],dateLabel:'FD details as on'},
        {id:'d6-revenue',title:'Revenue Details (reconciliation)',fields:['DATE','RECEIPT BOOK','CASHIER CASH BOOK','BANK STATEMENT'],rows:[]}
      ],
      D7: [{id:'d7-observations',title:'Major Observations / Red Flag Issues / Suggestions',fields:['OBSERVATION','FLAG TYPE','SUGGESTIONS, IF ANY'],rows:[]}]
    }[code];
    content.innerHTML = `<section class="d-reports-page d4567-page d4-pdf-layout"><div class="d-reports-heading"><div><div class="d-reports-eyebrow">REPORTING CENTRE / ${code}</div><h1 class="d-reports-title">${code} — ${esc(detail.title)}</h1><p class="d-reports-subtitle">Monthly report · Annexure ${code}</p></div></div>${subnav}<div class="d4-savebar"><button class="btn primary" type="button" onclick="d4567Save()">Save ${code}</button><span id="d4567-save-status"></span></div>${code==='D5'?`<div class="d4-toolbar"><label>Reporting month <input id="d5-month" type="month" value="${String(state.fy||new Date().getFullYear())}-${String(state.month||new Date().getMonth()+1).padStart(2,'0')}" onchange="d567MonthChanged(this.value)"></label></div>`:''}
      ${cfg.map(section=>`<section class="d4567-card d4-block"><h2 ${code==='D5'?'data-d5-period-title data-base-title="'+esc(section.title)+'"':''}>${esc(section.title)}${code==='D5'?' ('+d567MonthRange(String(state.fy||new Date().getFullYear())+'-'+String(state.month||new Date().getMonth()+1).padStart(2,'0'))+')':''}</h2>${section.dateLabel?`<label class="d567-date">${section.dateLabel}<input type="date" aria-label="${section.dateLabel}"></label>`:''}${section.note?`<p class="d4-note">${esc(section.note)}</p>`:''}<div class="d4-table-wrap"><table class="d4-table d567-table"><thead><tr><th>#</th>${section.fields.map(f=>`<th>${esc(f)}</th>`).join('')}<th></th></tr></thead><tbody id="${section.id}"></tbody></table><p class="d4-empty" id="${section.id}-empty">No rows yet</p></div><button class="btn secondary d4-add" type="button" onclick="d567AddRow('${section.id}')">＋ ${code==='D7'?'Add observation':section.id==='d5-unpaid-other'?'Add other unpaid bill':'Add row'}</button></section>`).join('')}</section>`;
    d567Sections = cfg;
    cfg.forEach(section=>d567Render(section));
    d4567Load(code);
    return;
  }
  content.innerHTML = `<section class="d-reports-page d4567-page"><div class="d-reports-heading"><div><div class="d-reports-eyebrow">REPORTING CENTRE / D4,5,6,7</div><h1 class="d-reports-title">${code} — ${esc(detail.title)}</h1><p class="d-reports-subtitle">${esc(detail.desc)}</p></div></div>${subnav}</section>`;
}
let d567Sections=[];
function d567Render(section){
 const body=document.getElementById(section.id); if(!body)return;
 body.innerHTML=section.rows.map((row,i)=>{
   const cells=section.fields.map((field,j)=>{
     const dateFields=['PAYMENT DUE','DEPOSIT DATE','DUE DATE OF FILING','ACTUAL DATE FILED','DATE','DATE APPROVED','INVESTED','MATURITY'];
     const type=dateFields.includes(field)?'date':'text';
     return `<td><input type="${type}" value="${esc(row[j]||'')}" aria-label="${esc(field)} ${i+1}"></td>`;
   }).join('');
   return `<tr><td>${i+1}</td>${cells}<td><button class="btn secondary sm" type="button" aria-label="Remove row" onclick="d567RemoveRow('${section.id}',${i})">✕</button></td></tr>`;
 }).join('');
 const empty=document.getElementById(section.id+'-empty'); if(empty)empty.style.display=section.rows.length?'none':'block';
}
function d567AddRow(id){const section=d567Sections.find(x=>x.id===id);if(!section)return;section.rows.push(section.fields.map(()=>''));d567Render(section);}
function d567RemoveRow(id,i){const section=d567Sections.find(x=>x.id===id);if(!section)return;section.rows.splice(i,1);d567Render(section);}

let d4Rows={major:[{text:''}],minor:[]};
function d4RenderRows(kind){
 const body=document.getElementById('d4-'+kind); if(!body)return;
 body.innerHTML=d4Rows[kind].map((r,i)=>`<tr><td>${i+1}</td><td><textarea aria-label="${kind} irregularity ${i+1}" rows="2" oninput="d4Rows['${kind}'][${i}].text=this.value">${esc(r.text)}</textarea></td><td><button class="btn secondary sm" type="button" aria-label="Remove row" onclick="d4RemoveRow('${kind}',${i})">✕</button></td></tr>`).join('');
 const empty=document.getElementById('d4-minor-empty'); if(empty)empty.style.display=d4Rows.minor.length?'none':'block';
}
function d4AddRow(kind){d4Rows[kind].push({text:''});d4RenderRows(kind);}
function d4RemoveRow(kind,i){d4Rows[kind].splice(i,1);d4RenderRows(kind);}
let d4CarryTimer=null;
let d4SavedCarryOverrides=null;
function d4MonthChanged(value){
 if(!value)return;
 const [year,month]=value.split('-').map(Number);
 state.fy=String(year);state.month=month;
 d4SavedCarryOverrides=null;
 d4567Load('D4');
}
function d4ScheduleCarryRefresh(){
 if(d4CarryTimer)clearTimeout(d4CarryTimer);
 d4CarryTimer=setTimeout(()=>d4RefreshCarry(),250);
}
async function d4RefreshCarry(){
 const table=document.querySelector('.d4-revenue tbody');if(!table)return;
 const selectedYear=Number(state.fy),selectedMonth=Number(state.month);
 const sums=[0,0,0,0];
 // Indian financial year: April to March. The month picker stores calendar year/month.
 // For Jan-Mar, earlier FY months are Apr-Dec of the previous calendar year.
 const fyStartYear=selectedMonth>=4?selectedYear:selectedYear-1;
 const months=[];
 for(let year=fyStartYear,month=4; ; ){
  if(year===selectedYear&&month>=selectedMonth)break;
  months.push({year,month});
  month++;if(month>12){month=1;year++;}
  if(year>selectedYear || (year===selectedYear&&month>=selectedMonth))break;
 }
 for(const period of months){
  try{
   const params=new URLSearchParams({code:'D4',ulb:state.ulb,fy:String(period.year),month:String(period.month)});
   const response=await fetch('/api/annexures?'+params.toString());if(!response.ok)continue;
   const result=await response.json(),data=result.data?.data;
   (data?.revenue||[]).forEach((item,i)=>{const raw=item.values?.[0]??item.values?.[1]??0;const value=Number(raw);if(Number.isFinite(value))sums[i]+=value;});
  }catch(e){/* skip unavailable saved month */}
 }
 [...table.querySelectorAll('tr')].forEach((row,i)=>{
  const carry=row.querySelector('.d4-till-last');
  // Carry-forward is derived only from saved CURRENT MONTH collections before the selected month.
  // Never reuse this month's saved tillLast value: it may be stale (e.g. an October value in December).
  const savedManual=d4SavedCarryOverrides?.[i];
  const carryAmount=savedManual!==null&&savedManual!==undefined&&savedManual!==''?Number(savedManual):sums[i];
  if(carry)carry.value=(Number.isFinite(carryAmount)?carryAmount:0).toFixed(2);
  const carryValue=Number(carry?.value||0);
  const current=Number(row.querySelector('.d4-current-month')?.value||0);
  const total=(Number.isFinite(carryValue)?carryValue:0)+(Number.isFinite(current)?current:0);
  row.querySelector('.d4-cumulative').textContent=total.toFixed(2);
  const targetText=row.querySelector('.d4-target-value')?.textContent||'';
  const target=Number(targetText);
  row.querySelector('.d4-percent').textContent=Number.isFinite(target)&&target>0?(total/target*100).toFixed(2)+'%':'-';
 });
}
function d4ManualCarry(input){
 const row=input.closest('tr');
 const index=[...document.querySelectorAll('.d4-revenue tbody tr')].indexOf(row);
 if(index>=0){if(!Array.isArray(d4SavedCarryOverrides))d4SavedCarryOverrides=[];d4SavedCarryOverrides[index]=input.value;}
 d4Calc(input);
}
function d4Calc(input){
 const row=input.closest('tr');
 const carry=Number(row.querySelector('.d4-till-last')?.value||0);
 const current=Number(row.querySelector('.d4-current-month')?.value||0);
 const total=(Number.isFinite(carry)?carry:0)+(Number.isFinite(current)?current:0);
 row.querySelector('.d4-cumulative').textContent=total.toFixed(2);
 const target=Number(row.querySelector('.d4-target-value')?.textContent||'');
 row.querySelector('.d4-percent').textContent=Number.isFinite(target)&&target>0?(total/target*100).toFixed(2)+'%':'-';
}
function d4SetTarget(button){
 if(state.user?.role!=='admin'&&!state.user?.permissions?.admin?.access){toast('Only admin can change revenue targets.',true);return;}
 const value=prompt('Enter target (₹ in lacs):'); if(value===null||value.trim()===''||!Number.isFinite(Number(value)))return;
 button.parentElement.querySelector('.d4-target-value').textContent=Number(value).toFixed(2);
}
async function d4567Load(code){
 const status=document.getElementById('d4567-save-status');
 try{
  const params=new URLSearchParams({code,ulb:state.ulb,fy:state.fy,month:String(state.month)});
  const response=await fetch('/api/annexures?'+params.toString());const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Could not load annexure');
  const saved=result.data?.data;
  if(code==='D4'){
   if(!saved){
    d4Rows={major:[{text:''}],minor:[]};
    ['major','minor'].forEach(kind=>d4RenderRows(kind));
    document.querySelectorAll('.d4-revenue tbody tr').forEach(row=>{
     const carry=row.querySelector('.d4-till-last');if(carry)carry.value='0.00';
     const current=row.querySelector('.d4-current-month');if(current)current.value='';
    });
    d4SavedCarryOverrides=null;
    await d4RefreshCarry();
    if(status)status.textContent='No saved entries for this month';
    return;
   }
   d4SavedCarryOverrides=(saved.revenue||[]).map(item=>item.tillLast??null);
   d4Rows={major:Array.isArray(saved.major)?saved.major:[{text:''}],minor:Array.isArray(saved.minor)?saved.minor:[]};
   ['major','minor'].forEach(kind=>d4RenderRows(kind));
   (saved.revenue||[]).forEach((item,i)=>{const row=document.querySelectorAll('.d4-revenue tbody tr')[i];if(!row)return;
    const target=row.querySelector('.d4-target-value');if(target&&item.target!==undefined)target.textContent=item.target;
    const current=row.querySelector('.d4-current-month');if(current)current.value=item.values?.[0]??item.values?.[1]??'';
   });
   await d4RefreshCarry();
  }else d567Sections.forEach(section=>{if(Array.isArray(saved[section.id]))section.rows=saved[section.id];d567Render(section);});
  if(status)status.textContent='Loaded saved entries';
 }catch(e){if(status)status.textContent='Load failed: '+e.message;}
}
async function d4567Save(){
 const code=(state.view||'').toUpperCase();if(!['D4','D5','D6','D7'].includes(code))return;
 const status=document.getElementById('d4567-save-status');const button=document.querySelector('.d4-savebar button');const data={};
 if(code==='D4'){
  data.major=[...document.querySelectorAll('#d4-major textarea')].map(x=>({text:x.value}));data.minor=[...document.querySelectorAll('#d4-minor textarea')].map(x=>({text:x.value}));
  data.revenue=[...document.querySelectorAll('.d4-revenue tbody tr')].map(row=>({target:row.querySelector('.d4-target-value')?.textContent||'-',tillLast:row.querySelector('.d4-till-last')?.value||'0',values:[row.querySelector('.d4-current-month')?.value||'']}));
 }else d567Sections.forEach(section=>{section.rows=[...document.querySelectorAll('#'+section.id+' tr')].map(row=>[...row.querySelectorAll('input')].map(x=>x.value));data[section.id]=section.rows;});
 try{
  if(button){button.disabled=true;button.textContent='Saving…';}
  const response=await fetch('/api/annexures',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,ulb:state.ulb,fy:state.fy,month:String(state.month),data})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save annexure');
  if(status)status.textContent='Saved successfully';toast(code+' saved');if(code==='D4'){d4SavedCarryOverrides=[...document.querySelectorAll('.d4-revenue tbody tr')].map(row=>row.querySelector('.d4-till-last')?.value||'0');await d4RefreshCarry();}
 }catch(e){if(status)status.textContent='Save failed: '+e.message;toast(e.message,true);}
 finally{if(button){button.disabled=false;button.textContent='Save '+code;}}
}

/* =========================================================
   13. REPORTS D-1 TO D-7
   ========================================================= */

let selectedMonthlyReport = 'D1';

function reports(content) {
  const reportList = [
    { code: 'D1', name: 'Audit Letter', detail: 'Official audit letter for the selected ULB and reporting period.', icon: '✉', formats: ['PDF', 'Word'], fields: ['ULB and reporting period', 'Audit letter reference', 'Audit authority and date', 'Subject and official remarks'] },
    { code: 'D2', name: 'Work Progress Report', detail: 'Track audit work progress and completion for the month.', icon: '↗', formats: ['PDF', 'Word', 'CSV'], fields: ['Vouchers on opening date', 'Received during period', 'Audited during period', 'Pending on closing date', 'Checklist-wise progress'] },
    { code: 'D3', name: 'Completion Certificate', detail: 'Generate the audit completion certificate.', icon: '✓', formats: ['PDF', 'Word'], fields: ['Audit period covered', 'Completion status', 'Pending items / exceptions', 'Authorized signatory'] },
    { code: 'D4', name: 'Irregularities + Revenue', detail: 'Review recorded irregularities and revenue observations.', icon: '₹', formats: ['PDF', 'Word', 'CSV'], fields: ['Observation / irregularity', 'Amount proposed and passed', 'Revenue observations', 'Recovery and remarks'] },
    { code: 'D5', name: 'Statutory Deductions / Compliance', detail: 'Summarize statutory deductions and compliance matters.', icon: '§', formats: ['PDF', 'Word', 'CSV'], fields: ['Deduction / compliance category', 'Applicable amount', 'Deducted / deposited', 'Shortfall and remarks'] },
    { code: 'D6', name: 'Unpaid / Paid-Un-audited / Advances / FD', detail: 'Review unpaid bills, unaudited payments, advances and fixed deposits.', icon: '▤', formats: ['PDF', 'Word', 'CSV'], fields: ['Unpaid bills', 'Paid but unaudited bills', 'Advances outstanding', 'Fixed deposits and maturity'] },
    { code: 'D7', name: 'Major Observations / Red Flags', detail: 'Highlight major audit observations and red flags.', icon: '⚑', formats: ['PDF', 'Word', 'CSV'], fields: ['High-risk observation', 'Amount / exposure', 'Responsible party', 'Action required and current status'] }
  ];
  const selected = reportList.find(x => x.code === selectedMonthlyReport) || reportList[0];
  const monthName = months[Number(state.month)] || '';
  const ulbName = (state.ulbs || []).find(x => x.id === state.ulb)?.name || 'Selected ULB';

  content.innerHTML = `
    <section class="d-reports-page d-reports-workspace">
      <div class="d-reports-heading">
        <div>
          <div class="d-reports-eyebrow">REPORTING CENTRE</div>
          <h1 class="d-reports-title"><span class="d-reports-title-icon">▤</span> Monthly Report <span class="d-reports-range">Annexures D-1 to D-7</span></h1>
          <p class="d-reports-subtitle">Select an annexure to review its summary and open the full report preview.</p>
        </div>
      </div>

      <nav class="d-report-tabs" aria-label="Monthly report annexures">
        ${reportList.map(report => `<button type="button" class="d-report-tab ${report.code === selected.code ? 'active' : ''}" aria-pressed="${report.code === selected.code}" onclick="selectMonthlyReport('${report.code}')"><span>${report.code.replace('D','D-')}</span><small>${esc(report.name.replace(' / Compliance','').replace(' / Advances / FD',''))}</small></button>`).join('')}
      </nav>

      <section class="d-report-preview-panel">
        <div class="d-report-preview-heading">
          <div class="d-report-preview-symbol d-report-icon-${selected.code.toLowerCase()}">${selected.icon}</div>
          <div class="d-report-preview-title">
            <div class="d-reports-eyebrow">${selected.code.replace('D','ANNEXURE D-')}</div>
            <h2>${esc(selected.name)}</h2>
            <p>${esc(selected.detail)}</p>
          </div>
          <span class="d-report-code">${selected.code.replace('D','D-')}</span>
        </div>

        <div class="d-report-preview-meta">
          <div><small>ULB</small><strong>${esc(ulbName)}</strong></div>
          <div><small>FINANCIAL YEAR</small><strong>${esc(state.fy)}</strong></div>
          <div><small>MONTH</small><strong>${esc(monthName)}</strong></div>
        </div>

        <div class="d-report-live-preview-wrap">
          <div class="d-report-live-preview-toolbar">
            <div class="d-report-live-preview-copy"><strong>Live data preview</strong><span>Showing records for the selected ULB and reporting period</span></div>
            <div class="d-report-edit-controls">
              ${canEditFeature('reports') ? `<button type="button" class="btn secondary" id="report-edit-toggle" onclick="toggleReportEdit()">Edit preview</button><button type="button" class="btn" id="report-edit-save" onclick="saveReportEdit()" hidden>Save changes</button><button type="button" class="btn secondary" id="report-edit-cancel" onclick="cancelReportEdit()" hidden>Cancel</button>` : ''}
            </div>
          </div>
          <p class="d-report-edit-status" id="report-edit-status" aria-live="polite">${canEditFeature('reports') ? 'You can edit the displayed report and save your changes for this ULB, financial year and month.' : 'Read-only access: report editing is disabled.'}</p>
          <div class="d-report-word-toolbar" id="report-word-toolbar" hidden aria-label="Document editing toolbar">
            <button type="button" title="Undo" onclick="reportCommand('undo')">↶</button><button type="button" title="Redo" onclick="reportCommand('redo')">↷</button>
            <select title="Font family" onchange="reportCommand('fontName',this.value)"><option value="Arial">Arial</option><option value="Calibri">Calibri</option><option value="Times New Roman">Times New Roman</option><option value="Georgia">Georgia</option><option value="Courier New">Courier New</option></select>
            <select title="Font size" onchange="reportFontSize(this.value)"><option value="3">12 pt</option><option value="1">8 pt</option><option value="2">10 pt</option><option value="4">14 pt</option><option value="5">18 pt</option><option value="6">24 pt</option><option value="7">36 pt</option></select>
            <button type="button" title="Bold" onclick="reportCommand('bold')"><b>B</b></button><button type="button" title="Italic" onclick="reportCommand('italic')"><i>I</i></button><button type="button" title="Underline" onclick="reportCommand('underline')"><u>U</u></button>
            <label title="Text color">Text <input type="color" onchange="reportCommand('foreColor',this.value)"></label><label title="Highlight">Highlight <input type="color" value="#ffff00" onchange="reportCommand('hiliteColor',this.value)"></label>
            <button type="button" title="Align left" onclick="reportCommand('justifyLeft')">≡</button><button type="button" title="Center" onclick="reportCommand('justifyCenter')">≣</button><button type="button" title="Align right" onclick="reportCommand('justifyRight')">☰</button>
            <button type="button" title="Bulleted list" onclick="reportCommand('insertUnorderedList')">• List</button><button type="button" title="Numbered list" onclick="reportCommand('insertOrderedList')">1. List</button>
            <button type="button" title="Insert table" onclick="reportInsertTable()">＋ Table</button><button type="button" title="Insert link" onclick="reportInsertLink()">Link</button><button type="button" title="Insert image" onclick="reportInsertImage()">Image</button>
            <span class="report-table-tools" id="report-table-tools" hidden><button type="button" onclick="reportTableAction('rowAbove')">＋ Row</button><button type="button" onclick="reportTableAction('rowBelow')">Row ↓</button><button type="button" onclick="reportTableAction('deleteRow')">− Row</button><button type="button" onclick="reportTableAction('colBefore')">＋ Col</button><button type="button" onclick="reportTableAction('colAfter')">Col →</button><button type="button" onclick="reportTableAction('deleteCol')">− Col</button><button type="button" onclick="reportTableAction('merge')">Merge cells</button><button type="button" onclick="reportTableAction('split')">Split cell</button><label>Cell color <input type="color" onchange="reportTableCellColor(this.value)"></label><select title="Cell vertical alignment" onchange="reportTableVertical(this.value)"><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></span>
          </div>
          <iframe
            class="d-report-live-preview"
            title="${esc(selected.code.replace('D','D-'))} ${esc(selected.name)} data preview"
            src="/api/reports/${selected.code}?${reportParams().toString()}"
            loading="lazy"
          ></iframe>
        </div>

        <div class="d-report-preview-actions">
          <div class="d-report-format-list">${selected.formats.map(format => `<span>${format}</span>`).join('')}</div>
          <div class="d-report-action-buttons">
            <button class="btn d-report-preview" onclick="openReport('${selected.code}')">Open full preview / Print <span>↗</span></button>
            <button class="btn secondary" onclick="downloadReport('${selected.code}', 'doc')">Export DOCX</button>
            ${selected.formats.includes('CSV') ? `<button class="btn secondary" onclick="downloadReport('${selected.code}', 'csv')">Export CSV</button>` : ''}
          </div>
        </div>
      </section>
      <div class="d-reports-note"><span class="d-reports-note-icon">i</span><div><strong>Review before submission</strong><p>This panel is a compact preview of the selected annexure. Use “Open full preview / Print” to generate the complete report from the existing reporting endpoint.</p></div></div>
    </section>
  `;
}

function selectMonthlyReport(code) {
  selectedMonthlyReport = code;
  const content = document.getElementById('content');
  if (content) reports(content);
}

function reportParams() {
  const startYear =
    state.fy.split('-')[0];

  const month =
    String(state.month).padStart(2, '0');

  return new URLSearchParams({
    ulb: state.ulb,
    fy: state.fy,
    month: state.month,

    startDate:
      `${startYear}-${month}-01`,

    endDate:
      `${startYear}-${month}-${new Date(
        startYear,
        state.month,
        0
      ).getDate()}`
  });
}


let reportEditOriginal = null;
let reportEditActive = false;
let reportSavedRange = null;

function reportPreviewFrame() {
  return document.querySelector('.d-report-live-preview');
}

function toggleReportEdit() {
  if (!canEditFeature('reports')) { toast('Read-only access: you cannot edit reports.', true); return; }
  const frame = reportPreviewFrame();
  if (!frame || !frame.contentDocument || !frame.contentDocument.body) { toast('Report preview is still loading. Please try again.', true); return; }
  if (!reportEditActive) {
    reportEditOriginal = frame.contentDocument.documentElement.outerHTML;
    const doc=frame.contentDocument; doc.body.contentEditable='true'; doc.body.focus();
    // Enable browser-native editing commands in the report iframe.
    try { doc.execCommand('styleWithCSS',false,true); doc.execCommand('defaultParagraphSeparator',false,'p'); } catch (_) {}
    doc.addEventListener('selectionchange', ()=>{reportRememberSelection();reportUpdateTableTools();});
    doc.addEventListener('keydown', reportEditorKeydown);
    reportEditActive = true;
    document.getElementById('report-edit-toggle').hidden = true;
    document.getElementById('report-edit-save').hidden = false;
    document.getElementById('report-edit-cancel').hidden = false;
    document.getElementById('report-word-toolbar').hidden = false;
    document.getElementById('report-edit-status').textContent = 'Editing enabled. Use the toolbar for formatting and table operations, then Save changes.';
  }
}
function reportRememberSelection(){const d=reportPreviewFrame()?.contentDocument,sel=d?.getSelection();if(sel&&sel.rangeCount)reportSavedRange=sel.getRangeAt(0).cloneRange();}
function reportRestoreSelection(){const d=reportPreviewFrame()?.contentDocument;if(!d||!reportSavedRange)return;try{const sel=d.getSelection();sel.removeAllRanges();sel.addRange(reportSavedRange);}catch(_){}}
function reportCommand(command,value=null){const d=reportPreviewFrame()?.contentDocument;if(!d)return;reportRestoreSelection();try{d.execCommand(command,false,value);}catch(e){toast('This formatting command is not supported by this browser.',true)}reportRememberSelection();reportUpdateTableTools();}
function reportFontSize(value){reportCommand('fontSize',value);}
function reportInsertLink(){const url=prompt('Enter link URL:');if(url)reportCommand('createLink',url);}
function reportInsertImage(){const url=prompt('Enter image URL:');if(url)reportCommand('insertImage',url);}
function reportInsertTable(){const r=Math.max(1,Math.min(30,Number(prompt('Number of rows?', '3'))||3));const c=Math.max(1,Math.min(15,Number(prompt('Number of columns?', '3'))||3));const d=reportPreviewFrame()?.contentDocument;if(!d)return;let html='<table style="width:100%;border-collapse:collapse"><tbody>';for(let i=0;i<r;i++){html+='<tr>';for(let j=0;j<c;j++)html+='<td style="border:1px solid #222;padding:6px;min-width:35px"><p><br></p></td>';html+='</tr>';}html+='</tbody></table><p><br></p>';d.body.focus();d.execCommand('insertHTML',false,html);reportUpdateTableTools();}
function reportSelectedCell(){const d=reportPreviewFrame()?.contentDocument;if(!d)return null;const sel=d.getSelection();let n=sel?.anchorNode;if(n&&n.nodeType===3)n=n.parentElement;return n?.closest?.('td,th')||null;}
function reportUpdateTableTools(){const t=document.getElementById('report-table-tools');if(t)t.hidden=!(reportSelectedCell()||(reportSavedRange&&reportSavedRange.startContainer?.parentElement?.closest?.('td,th')));}
function reportEditorKeydown(e){if(e.key==='Tab'){const cell=reportSelectedCell();if(!cell)return; e.preventDefault();const cells=[...cell.closest('table').querySelectorAll('td,th')];let idx=cells.indexOf(cell)+(e.shiftKey?-1:1);if(idx<0)idx=0;if(idx>=cells.length){const row=cell.parentElement,cols=row.children.length;const nr=row.parentElement.insertRow();for(let i=0;i<cols;i++){const c=nr.insertCell();c.style.border='1px solid #222';c.innerHTML='<p><br></p>';}idx=cells.length;}const target=[...cell.closest('table').querySelectorAll('td,th')][idx];if(target){target.focus();const d=target.ownerDocument,range=d.createRange();range.selectNodeContents(target);range.collapse(true);d.getSelection().removeAllRanges();d.getSelection().addRange(range);}return;}if(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key==='ArrowDown'||e.key==='ArrowUp')setTimeout(reportUpdateTableTools,0);}
function reportTableAction(action) {
  reportRestoreSelection(); const cell=reportSelectedCell() || (reportSavedRange?.startContainer?.parentElement?.closest?.('td,th'));  if(!cell) return;
  const row=cell.parentElement, table=cell.closest('table');
  const idx=[...row.children].indexOf(cell), rowIndex=[...table.rows].indexOf(row);
  if(action==='rowAbove'||action==='rowBelow') {
    const nr=table.insertRow(rowIndex+(action==='rowBelow'?1:0));
    for(let i=0;i<row.children.length;i++){const c=nr.insertCell();c.style.cssText=row.children[i].style.cssText;c.innerHTML='<p><br></p>';}
  } else if(action==='deleteRow') {
    if(table.rows.length>1)table.deleteRow(rowIndex);
  } else if(action==='colBefore'||action==='colAfter') {
    for(const tr of table.rows){const c=tr.insertCell(idx+(action==='colAfter'?1:0));c.style.cssText=cell.style.cssText;c.innerHTML='<p><br></p>';}
  } else if(action==='deleteCol') {
    if(row.children.length>1)for(const tr of table.rows)if(tr.cells[idx])tr.deleteCell(idx);
  } else if(action==='split') {
    const span=Number(cell.colSpan||1);
    if(span>1){cell.colSpan=1;for(let i=1;i<span;i++){const c=row.insertCell(idx+i);c.innerHTML='<p><br></p>';}}
    else {const rs=Number(cell.rowSpan||1);if(rs>1){cell.rowSpan=1;for(let i=1;i<rs;i++){const tr=table.insertRow(rowIndex+i),c=tr.insertCell(idx);c.innerHTML='<p><br></p>';}}}
  } else if(action==='merge') {
    const next=cell.nextElementSibling;
    if(next&&next.tagName===cell.tagName){cell.colSpan=(cell.colSpan||1)+(next.colSpan||1);cell.innerHTML+=(cell.innerHTML&&next.innerHTML?'<br>':'')+next.innerHTML;next.remove();}
  }
  reportUpdateTableTools();
}
function reportTableCellColor(color){reportRestoreSelection();const c=reportSelectedCell()||(reportSavedRange?.startContainer?.parentElement?.closest?.('td,th'));if(c)c.style.backgroundColor=color;}
function reportTableVertical(value){reportRestoreSelection();const c=reportSelectedCell()||(reportSavedRange?.startContainer?.parentElement?.closest?.('td,th'));if(c)c.style.verticalAlign=value;}

function resetReportEditControls(message) {
  reportEditActive = false;
  reportEditOriginal = null;
  reportSavedRange = null;
  const toggle = document.getElementById('report-edit-toggle');
  const save = document.getElementById('report-edit-save');
  const cancel = document.getElementById('report-edit-cancel');
  if (toggle) toggle.hidden = false;
  if (save) save.hidden = true;
  if (cancel) cancel.hidden = true;
  const toolbar=document.getElementById('report-word-toolbar'); if(toolbar) toolbar.hidden=true;
  const tableTools=document.getElementById('report-table-tools'); if(tableTools) tableTools.hidden=true;
  const status = document.getElementById('report-edit-status');
  if (status && message) status.textContent = message;
}

function cancelReportEdit() {
  const frame = reportPreviewFrame();
  if (frame && frame.contentDocument && reportEditOriginal) {
    frame.contentDocument.open();
    frame.contentDocument.write(reportEditOriginal);
    frame.contentDocument.close();
  }
  resetReportEditControls('Changes discarded. The saved report preview is unchanged.');
}

async function saveReportEdit() {
  if (!canEditFeature('reports')) { toast('Read-only access: you cannot save report edits.', true); return; }
  const frame = reportPreviewFrame();
  if (!frame || !frame.contentDocument || !frame.contentDocument.documentElement) {
    toast('Report preview is unavailable.', true);
    return;
  }
  const html = frame.contentDocument.documentElement.outerHTML.replace(/\scontenteditable=([\"'])true\1/gi, '');
  const button = document.getElementById('report-edit-save');
  if (button) { button.disabled = true; button.textContent = 'Saving…'; }
  try {
    const params = reportParams();
    params.set('report', selectedMonthlyReport);
    const response = await fetch('/api/reports/edit', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({report: selectedMonthlyReport, ulb: state.ulb, fy: state.fy, month: state.month, html})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save report edits');
    frame.contentDocument.body.contentEditable = 'false';
    resetReportEditControls('Changes saved. Full preview and DOC export use your edits; CSV remains a raw data export.');
    toast('Report preview changes saved');
  } catch (error) {
    toast(error.message || 'Could not save report edits', true);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Save changes'; }
  }
}

function openReport(report) {
  window.open(
    '/api/reports/' +
    report +
    '?' +
    reportParams().toString(),
    '_blank'
  );
}


function downloadReport(report, format) {
  window.location =
    '/api/reports/' +
    report +
    '?' +
    reportParams().toString() +
    '&format=' +
    format;
}


/* =========================================================
   14. ATTENDANCE
   ========================================================= */

function attendance(content) {
  content.innerHTML = `
    <div class="title">
      Attendance – Check-In / Check-Out
    </div>

    <div class="muted">
      Attendance uses server time.
      GPS is captured when browser permission
      is available.
    </div>

    ${contextBar()}


    <div
      class="card"
      style="margin-top:12px"
    >

      <div class="actions">

        <button
          class="btn ok"
          onclick="markAttendance('in')"
        >
          Check-In
        </button>

        <button
          class="btn bad"
          onclick="markAttendance('out')"
        >
          Check-Out
        </button>

      </div>

      <div
        id="gpsStatus"
        class="muted"
        style="margin-top:10px"
      >
        Location not requested.
      </div>

    </div>


    <div
      class="table-wrap"
      style="margin-top:12px"
    >

      <table
        class="table"
        style="min-width:750px"
      >

        <thead>
          <tr>
            <th>Type</th>
            <th>Server Time</th>
            <th>GPS</th>
            <th>Accuracy</th>
            <th>Status</th>
            <th>Distance</th>
          </tr>
        </thead>

        <tbody id="attRows"></tbody>

      </table>

    </div>
  `;

  loadAttendanceRows();
}


async function loadAttendanceRows() {
  const attendanceRows =
    await api('/api/attendance');

  $('#attRows').innerHTML =
    attendanceRows.reverse()
      .map(row => `
        <tr>

          <td>
            ${row.type}
          </td>

          <td>
            ${new Date(
              row.timestamp_server
            ).toLocaleString()}
          </td>

          <td>
            ${row.latitude ?? '-'},
            ${row.longitude ?? '-'}
          </td>

          <td>
            ${row.accuracy ?? '-'}
          </td>

          <td>
            ${pill(row.status)}
          </td>

          <td>
            ${
              row.distance_m
                ? Math.round(row.distance_m) + ' m'
                : '-'
            }
          </td>

        </tr>
      `)
      .join('') ||
    `
      <tr>
        <td
          colspan="6"
          class="empty"
        >
          No attendance yet.
        </td>
      </tr>
    `;
}


function markAttendance(type) {
  $('#gpsStatus').textContent =
    'Requesting location…';

  if (!navigator.geolocation) {
    return toast(
      'Geolocation is not available in this browser',
      true
    );
  }

  navigator.geolocation.getCurrentPosition(
    async position => {
      try {
        const response =
          await api(
            '/api/attendance',
            {
              method: 'POST',
              body: JSON.stringify({
                type,
                ulb_id: state.ulb,
                latitude:
                  position.coords.latitude,
                longitude:
                  position.coords.longitude,
                accuracy:
                  position.coords.accuracy,
                device_info:
                  navigator.userAgent
              })
            }
          );

        $('#gpsStatus').textContent =
          `Saved: ${response.status}`;

        loadAttendanceRows();

        toast('Attendance saved');

      } catch (error) {
        toast(error.message, true);
      }
    },

    () => {
      toast(
        'Location permission is required for attendance',
        true
      );

      $('#gpsStatus').textContent =
        'Location permission denied/unavailable.';
    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}


/* =========================================================
   COMPANY DETAILS (ADMIN)
   ========================================================= */
async function companyDetails(content) {
  content.innerHTML = `
    <div class="title">Company Details</div>
    <div class="muted">Manage the company profile and authorized signatory used by the audit application.</div>
    <div class="card" style="margin-top:12px">
      <div id="companyDetailsStatus" class="muted" role="status">Loading company details…</div>
      <form id="companyDetailsForm" hidden>
        <h3>Company Information</h3>
        <div class="form-grid">
          <div class="field"><label for="cd_companyName">Company Name *</label><input id="cd_companyName" name="companyName" required maxlength="180"></div>
          <div class="field"><label for="cd_companyAddress">Company Address</label><input id="cd_companyAddress" name="companyAddress" maxlength="500"></div>
          <div class="field"><label for="cd_companyEmail">Company Email</label><input id="cd_companyEmail" name="companyEmail" type="email" maxlength="180"></div>
          <div class="field"><label for="cd_companyPhone">Company Phone Number</label><input id="cd_companyPhone" name="companyPhone" type="tel" maxlength="30" pattern="[+()\\-\\s.\\d]{7,20}"></div>
          <div class="field"><label for="cd_frNo">F.R.No.</label><input id="cd_frNo" name="frNo" maxlength="80"></div>
        </div>
        <h3 style="margin-top:22px">Authorized Signatory Details</h3>
        <div class="form-grid">
          <div class="field"><label for="cd_signatoryName">Full Name *</label><input id="cd_signatoryName" name="signatoryName" required maxlength="180"></div>
          <div class="field"><label for="cd_signatoryDesignation">Designation *</label><input id="cd_signatoryDesignation" name="signatoryDesignation" required maxlength="120"></div>
          <div class="field"><label for="cd_signatoryEmail">Email Address</label><input id="cd_signatoryEmail" name="signatoryEmail" type="email" maxlength="180"></div>
          <div class="field"><label for="cd_signatoryPhone">Contact Number</label><input id="cd_signatoryPhone" name="signatoryPhone" type="tel" maxlength="30" pattern="[+()\\-\\s.\\d]{7,20}"></div>
          <div class="field"><label for="cd_mshipNo">M’Ship No.</label><input id="cd_mshipNo" name="mshipNo" maxlength="80"></div>
        </div>
        <h3 style="margin-top:22px">Cluster Details</h3>
        <div class="form-grid">
          <div class="field"><label for="cd_clusterNo">Cluster No.</label><input id="cd_clusterNo" name="clusterNo" maxlength="80"></div>
          <div class="field"><label for="cd_clusterName">Cluster Name</label><input id="cd_clusterName" name="clusterName" maxlength="180"></div>
          <div class="field"><label for="cd_clusterRecipient">Designation / Recipient *</label><input id="cd_clusterRecipient" name="clusterRecipient" required maxlength="180" placeholder="The Joint Director"></div>
          <div class="field"><label for="cd_clusterDepartment">Department *</label><input id="cd_clusterDepartment" name="clusterDepartment" required maxlength="250" placeholder="Urban Administration & Development Department"></div>
        </div>
        <div class="actions" style="margin-top:20px">
          <button type="button" class="btn" id="companyEditBtn">Edit</button>
          <button type="submit" class="btn ok" id="companySaveBtn" hidden>Save Changes</button>
          <button type="button" class="btn secondary" id="companyCancelBtn" hidden>Cancel</button>
        </div>
      </form>
    </div>
  `;
  const status=$('#companyDetailsStatus'), form=$('#companyDetailsForm');
  const fields=['companyName','companyAddress','companyEmail','companyPhone','frNo','clusterNo','clusterName','clusterRecipient','clusterDepartment','signatoryName','signatoryDesignation','signatoryEmail','signatoryPhone','mshipNo'];
  let saved={};
  const setEditing=editing=>{
    fields.forEach(name=>form.elements[name].disabled=!editing);
    $('#companyEditBtn').hidden=editing;
    $('#companySaveBtn').hidden=!editing;
    $('#companyCancelBtn').hidden=!editing;
  };
  const fill=data=>fields.forEach(name=>form.elements[name].value=data[name]||'');
  try{
    saved=await api('/api/company-details');
    fill(saved); form.hidden=false; status.textContent='';
    setEditing(false);
    $('#companyEditBtn').onclick=()=>{fill(saved);setEditing(true);form.elements.companyName.focus();};
    $('#companyCancelBtn').onclick=()=>{fill(saved);setEditing(false);};
    form.onsubmit=async event=>{
      event.preventDefault();
      if(!form.reportValidity())return;
      const button=$('#companySaveBtn');button.disabled=true;button.textContent='Saving…';
      const data=Object.fromEntries(fields.map(name=>[name,form.elements[name].value.trim()]));
      try{
        const result=await api('/api/company-details',{method:'PUT',body:JSON.stringify(data)});
        saved=result.companyDetails||data;fill(saved);setEditing(false);state.companyName=saved.companyName||'ULB AUDIT DESK';const brand=$('#topCompanyName');if(brand)brand.textContent=state.companyName;
        status.textContent='Company details saved successfully.';
        toast('Company details saved');
      }catch(error){status.textContent=error.message||'Could not save company details.';toast(status.textContent,true);}
      finally{button.disabled=false;button.textContent='Save Changes';}
    };
  }catch(error){status.textContent=error.message||'Could not load company details.';status.className='error';}
}


/* =========================================================
   15. USER MANAGEMENT
   ========================================================= */

async function users(content) {
  if (state.user.role !== 'admin') {
    return;
  }

  content.innerHTML = `
    <div class="title">
      User Management
    </div>

    <div class="muted">
      Admin-only controls.
      No staff limit is enforced by this application.
    </div>

    <div
      class="actions"
      style="margin:12px 0"
    >

      <button
        class="btn"
        onclick="userModal()"
      >
        + Add New Member
      </button>

      <input
        id="userSearch"
        placeholder="Search name or mobile"
        oninput="renderUsers()"
        style="
          padding:9px;
          border:1px solid #ccd5df;
          border-radius:8px
        "
      >

    </div>


    <div class="table-wrap">

      <table
        class="table"
        style="min-width:850px"
      >

        <thead>
          <tr>
            <th>Name</th>
            <th>Mobile</th>
            <th>Role</th>
            <th>Status</th>
            <th>Joined</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody id="userRows"></tbody>

      </table>

    </div>
  `;

  state.users =
    await api('/api/users');

  renderUsers();
}


function renderUsers() {
  const query =
    ($('#userSearch')?.value || '')
      .toLowerCase();

  $('#userRows').innerHTML =
    state.users
      .filter(user =>
        (
          user.name +
          user.mobile
        )
          .toLowerCase()
          .includes(query)
      )
      .map(user => `
        <tr>

          <td>
            ${esc(user.name)}
          </td>

          <td>
            ${esc(user.mobile)}
          </td>

          <td>
            ${esc(user.role)}
          </td>

          <td>
            ${pill(
              user.active
                ? 'Active'
                : 'Inactive'
            )}
          </td>

          <td>
            ${new Date(
              user.created_at
            ).toLocaleDateString()}
          </td>

          <td class="actions">

            <button
              class="btn secondary sm"
              onclick="
                toggleUser('${user.id}')
              "
            >
              ${
                user.active
                  ? 'Deactivate'
                  : 'Activate'
              }
            </button>

            <button class="btn secondary sm" onclick="editUserModal('${user.id}')">Edit Permissions</button>

            <button
              class="btn secondary sm"
              onclick="
                resetUser('${user.id}')
              "
            >
              Reset Password
            </button>

            ${
              user.id !== state.user.id
                ? `
                  <button
                    class="btn bad sm"
                    onclick="
                      deleteUser('${user.id}')
                    "
                  >
                    Delete Permanently
                  </button>
                `
                : ''
            }

          </td>

        </tr>
      `)
      .join('');
}


async function userModal(editId=null) {
  const editing=Boolean(editId);
  const existing=editing?state.users.find(x=>x.id===editId):null;
  if(editing&&!existing){toast("User not found",true);return;}
  let districts=[], ulbs=[];
  try { [districts,ulbs]=await Promise.all([api('/api/districts'),api('/api/ulbs')]); }
  catch(error){toast(error.message||'Could not load ULB list',true);return;}
  modal(`<div class="um-modal-head"><h2>${editing?'Edit User Access':'Add New Member &amp; Assign Access Permissions'}</h2><button type="button" class="btn secondary" onclick="closeModal()">×</button></div>
  <form id="userForm" class="um-form">
    <section class="um-section"><h3>♙ Member Details</h3><div class="um-grid">
      <label>First Name &amp; Last Name<input name="name" required maxlength="120" placeholder="Enter full name" value="${esc(existing?.name||'')}" ${editing?'readonly':''}></label>
      <label>Mobile / Username<input name="mobile" required maxlength="40" placeholder="Enter mobile or username" value="${esc(existing?.mobile||'')}" ${editing?'readonly':''}></label>
      ${editing?'':'<label>Password<input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="Password"></label>'}
      <label>Role<select name="role">${[['user','Member'],['auditor','Auditor'],['verifier','Verifier'],['district','District'],['admin','Admin']].map(([v,l])=>`<option value="${v}" ${existing?.role===v?'selected':''}>${l}</option>`).join('')}</select></label>
    </div></section>
    <section class="um-section"><h3>▦ ULB Context</h3><div class="um-grid um-ulb-grid">
      <label>Select ULB Name<select id="umUlbSelect"><option value="">Choose a ULB…</option>${ulbs.filter(x=>x.active!==false).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
      <div class="um-assigned"><span>Assigned ULB</span><div id="umAssigned" class="um-chiplist">No ULB assigned</div><button type="button" class="btn secondary" id="umAddUlb">Add / Select</button></div>
    </div><p class="muted">Select one or more ULBs. Admin members can access all ULBs.</p></section>
    <section class="um-section"><h3>Access &amp; Feature Permissions</h3><div class="um-perm-wrap"><table class="um-perm"><thead><tr><th>Feature / Module</th><th>Access</th><th>Read Only</th><th>Full Access</th></tr></thead><tbody>
      ${[['dashboard','Dashboard'],['checklists','Checklist'],['register','Audit Register'],['queries','Form-2 Queries'],['reports','Report D-1 to D-7'],['attendance','Attendance'],['admin','Admin']].map(([key,label])=>`<tr data-feature="${key}"><td>${label}</td><td><input type="checkbox" class="um-access" aria-label="${label} access" ${key==='dashboard'?'':'checked'}></td><td><label class="um-option"><input type="radio" name="perm_${key}" value="read" ${key==='dashboard'?'':'checked'}> Read only</label></td><td><label class="um-option"><input type="radio" name="perm_${key}" value="full" ${key==='dashboard'?'':'checked'}> Full Access</label></td></tr>`).join('')}
    </tbody></table></div></section>
    <div class="um-footer"><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn ok" id="umCreate">${editing?'Save Changes':'Create Member &amp; Set Permissions'}</button></div>
  </form>`);
  const assigned=new Set((existing?.ulb_ids||[]).map(String)); const form=$('#userForm');
  const paint=()=>{$('#umAssigned').innerHTML=assigned.size?[...assigned].map(id=>{const x=ulbs.find(u=>String(u.id)===String(id));return `<span class="um-chip">${esc(x?.name||'ULB')} <button type="button" aria-label="Remove ${esc(x?.name||'ULB')}" data-remove-ulb="${esc(id)}">×</button></span>`}).join(''):'No ULB assigned';};
  paint();
  $('#umAddUlb').onclick=()=>{const id=$('#umUlbSelect').value;if(!id){toast('Select a ULB first',true);return;}assigned.add(id);paint();};
  $('#umAssigned').onclick=e=>{const b=e.target.closest('[data-remove-ulb]');if(b){assigned.delete(b.dataset.removeUlb);paint();}};
  form.querySelectorAll('tr[data-feature]').forEach(row=>{const key=row.dataset.feature,prior=existing?.permissions?.[key],access=row.querySelector('.um-access'), radios=row.querySelectorAll('input[type=radio]');if(existing){access.checked=Boolean(prior?.access);radios.forEach(r=>r.checked=access.checked&&r.value===(prior?.mode||'read'));}const sync=()=>{radios.forEach(r=>r.disabled=!access.checked);if(!access.checked)radios.forEach(r=>r.checked=false);else if(![...radios].some(r=>r.checked))radios[0].checked=true;};access.addEventListener('change',sync);sync();});
  form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;const permissions={};form.querySelectorAll('tr[data-feature]').forEach(row=>{const key=row.dataset.feature,access=row.querySelector('.um-access').checked,chosen=row.querySelector(`input[name="perm_${key}"]:checked`);permissions[key]={access,mode:access?(chosen?.value||'read'):'none'};});
    const data=Object.fromEntries(new FormData(form));data.ulb_ids=[...assigned];data.permissions=permissions;
    const button=$('#umCreate');button.disabled=true;button.textContent='Creating…';try{await api(editing?('/api/users/'+editId):'/api/users',{method:editing?'PATCH':'POST',body:JSON.stringify(editing?{action:'update',ulb_ids:data.ulb_ids,permissions:data.permissions,role:data.role}:data)});closeModal();await users($('#content'));toast(editing?'User access updated':'Member created with permissions');}catch(error){toast(error.message||'Could not save user',true);}finally{button.disabled=false;button.textContent=editing?'Save Changes':'Create Member & Set Permissions';}};
}

function editUserModal(id){return userModal(id);}

async function toggleUser(id) {
  try {
    await api(
      '/api/users/' + id,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'toggle'
        })
      }
    );

    await users($('#content'));

    toast('Status updated');

  } catch (error) {
    toast(error.message, true);
  }
}


async function resetUser(id) {
  const password =
    prompt('New temporary password:');

  if (!password) return;

  try {
    await api(
      '/api/users/' + id,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'reset',
          password
        })
      }
    );

    toast('Password reset');

  } catch (error) {
    toast(error.message, true);
  }
}


async function deleteUser(id) {
  if (
    !confirm(
      'Are you sure you want to permanently delete this user?'
    )
  ) {
    return;
  }

  try {
    await api(
      '/api/users/' + id,
      {
        method: 'DELETE'
      }
    );

    await users($('#content'));

    toast('User deleted');

  } catch (error) {
    toast(error.message, true);
  }
}


/* =========================================================
   16. ULB MASTER
   ========================================================= */

async function ulbs(content) {
  content.innerHTML = `
    <div class="title">
      ULB Master
    </div>

    <div class="muted">
      Replace seeded placeholders with official
      ULB names/codes. Names are reused exactly
      in reports.
    </div>

    <div
      class="actions"
      style="margin:12px 0"
    >
      <button
        class="btn"
        onclick="ulbModal()"
      >
        + Add ULB
      </button>
    </div>


    <div class="table-wrap">

      <table
        class="table"
        style="min-width:950px"
      >

        <thead>
          <tr>
            <th>District</th>
            <th>ULB Name</th>
            <th>Code</th>
            <th>Latitude</th>
            <th>Longitude</th>
            <th>Geofence m</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>

          ${state.ulbs.map(ulb => {

            const district =
              state.districts.find(
                d =>
                  d.id === ulb.district_id
              );

            return `
              <tr>

                <td>
                  ${esc(district?.name)}
                </td>

                <td>
                  ${esc(ulb.name)}
                </td>

                <td>
                  ${esc(ulb.code)}
                </td>

                <td>
                  ${ulb.latitude ?? ''}
                </td>

                <td>
                  ${ulb.longitude ?? ''}
                </td>

                <td>
                  ${ulb.geofence_radius}
                </td>

                <td>
                  ${pill(
                    ulb.active
                      ? 'Active'
                      : 'Inactive'
                  )}
                </td>

                <td>

                  <button
                    class="btn secondary sm"
                    onclick='ulbModal(${JSON.stringify(ulb)})'
                  >
                    Edit
                  </button>

                </td>

              </tr>
            `;

          }).join('')}

        </tbody>

      </table>

    </div>
  `;
}


function ulbModal(ulb = {}) {
  const districtOptions =
    state.districts
      .map(district => `
        <option
          value="${district.id}"
          ${
            district.id === (
              ulb.district_id ||
              state.districts[0]?.id
            )
              ? 'selected'
              : ''
          }
        >
          ${esc(district.name)}
        </option>
      `)
      .join('');

  modal(`
    <h2>
      ${ulb.id ? 'Edit' : 'Add'} ULB
    </h2>

    <form id="ulbForm">

      <div class="form-grid">

        <div class="field">
          <label>District</label>

          <select name="district_id">
            ${districtOptions}
          </select>
        </div>

        ${input(
          'name',
          'ULB Name',
          ulb.name,
          'text',
          true
        )}

        ${input(
          'code',
          'ULB Code',
          ulb.code
        )}

        ${input(
          'latitude',
          'Latitude',
          ulb.latitude ?? '',
          'number'
        )}

        ${input(
          'longitude',
          'Longitude',
          ulb.longitude ?? '',
          'number'
        )}

        ${input(
          'geofence_radius',
          'Geofence Radius (m)',
          ulb.geofence_radius || 200,
          'number'
        )}

        ${select(
          'active',
          'Status',
          ulb.active === false
            ? 'false'
            : 'true',
          ['true', 'false']
        )}

      </div>


      <div class="actions">

        <button class="btn">
          Save
        </button>

        <button
          type="button"
          class="btn secondary"
          onclick="closeModal()"
        >
          Cancel
        </button>

      </div>

    </form>
  `);

  $('#ulbForm').onsubmit =
    async event => {
      event.preventDefault();

      const data =
        Object.fromEntries(
          new FormData(event.target)
        );

      data.active =
        data.active === 'true';

      data.latitude =
        data.latitude === ''
          ? null
          : Number(data.latitude);

      data.longitude =
        data.longitude === ''
          ? null
          : Number(data.longitude);

      data.geofence_radius =
        Number(
          data.geofence_radius || 200
        );

      try {
        await api(
          ulb.id
            ? '/api/ulbs/' + ulb.id
            : '/api/ulbs',
          {
            method: ulb.id
              ? 'PATCH'
              : 'POST',
            body: JSON.stringify(data)
          }
        );

        closeModal();

        state.ulbs =
          await api('/api/ulbs');

        await ulbs($('#content'));

        toast('ULB saved');

      } catch (error) {
        toast(error.message, true);
      }
    };
}


/* =========================================================
   17. OFFICIAL CHECKLIST DEFINITIONS
   ========================================================= */

const CATEGORY_FORM_DATA = {
  Contractor: {
    title: 'Checklist for Payment of Contractor',
    fields: ['Checklist Date|date','Prepared by','Technical Approval Status|technical_approval_status','Technical Approval No.|technical_approval_no','Technical Approval Date|technical_approval_date|date','Technical Approval Rs.|technical_approval_rs|number','Technical Approval Approved By Name|technical_approval_approved_by_name','Technical Approval Approved By Designation|technical_approval_approved_by_designation','Tender Inviting Approval No.','Tender Inviting Approval Date|date','Tender Inviting Approval Rs.|number','Tender Inviting Approval Approved By (Name & Desig.)','Document Verification as per NIT|yn','Tender Published in, Dated & Bid Due Date','No. of Participants|number','Tender Committee Approval No. & Date & Value','Headed by','Financial Approval No.','Financial Approval Date|date','Financial Approval Rs.|number','Financial Approval Approved By (Name & Desig.)','Percentage of Above / Below from SOR','EMD / TDR|yn','Additional Performance Guarantee (APS) Details if Applicable','Date of Commencement - Actual|date','Date of Work Completion - Actual|date','Extended Date of Completion & Reason|area','Measurement Book No & Page No.','Penal Provision as per Agreement','Availability of Fund as per Letter (No. / Date / Rs.)','Bill No. & Type','Work Completion Certificate|yn','Quality Test Report - Date of Casting and Date of Testing','Mining Clearance Certificate|yn','Previous Bill No.','Previous Note Sheet No.','Previous Bill Amount|number','Previous Gross Payment|number','Previous Deduction|number','Previous Net Payment|number','Comment on Previous Payment (if any)|area','Date of Bill Received and From','Date of Bill Forwarded and To','Result|select:Pass,Pass with Objection,Return,Reject','Major Clause in Note Sheet|area','Reason|area'],
    checks: ['Whether measurement book signed by the Sub-engineer of ULB','Whether measurement book signed by the Assistant-engineer of ULB','Whether measurement book signed by the Executive-engineer of ULB','Please check detailed calculation of MB with SOR. If mistakes found: revised claim less than actual amount, proceed with revised value; if revised claim is more than actual, return it to concerned engineer.','Received by DC(f) and forwarded to Accounts officer','Prepare Calculation in Prescribed excel sheet','Whether Above/Below quoted in bid is added and deducted from bill amount','Refer Note Sheet','Compare gross amount as approved in Voucher from excel sheet','Gross amount approved by Sub Engineer','Same amount approved by Assistant Engineer','Same amount approved by Executive Engineer','Same Amount forwarded by Commissioner','Deduction'],
    deductions: ['Security Deposit','Performance Deposit','Royalty/ Mining Cess','Income Tax','GST','Labor Welfare Fund','Penalty/ LD','Recovery of Advance','Recovery of Material','under/ over payment in last bill','Difference in Amount as per agreement and total invoice till date'],
    books: ['Measurement book- Sign and Stamp on rectified places','Memo and Mode of Payment in measurement book','Cheque issue register','Cash Book','Grant Register','Work Register Entry done or not','Budget Control Register','Time limit for completion of Works'],
    docs: ['Quality Test Report as per Agreement','Work Completion Certificate','Clearance Certificate from Mining Department','Tax Invoice from Contractor','Invoice of Bitumin Bill of Bharat Petroleum/Hindusthan Petroleum with Consumption details in Bill for BT work','Geotagged and Signed Photograph of Work - Before Started, During Work, Complete Photograph','Revised Estimate if not produced then payment as per Estimate']
  },
  Consultancy: {
    title:'Checklist for Payment of Consultancy',
    fields:['Month - Financial Year','Note Sheet No. & Date','Prepared by','Zone / Dept. / File No.','Mode of Selection|select:Open Tender,Limited Tender,Nomination,Other','Discretionary Power of','Name of Service','Details of Service|area','Estimated Amount|number','Source of Fund','Admin Approval No.','Admin Approval Date|date','Admin Approval Rs.|number','Admin Approval Approved By (Name & Desig.)','Tender Published in and Dated','No. of Participants|number','Tender Committee Approval No.','Tender Committee Approval Date|date','Value Approved by Tender Committee|number','Headed by','Selected Consultant Name','Reason for Selection|area','PAN No.','TIN / GSTIN No.','Agreement No. and Date','Agreement Value|number','Work Order No. & Date','Bill No.','Bill Amount|number','Penal Provision as per Agreement','Previous Bill No.','Previous Note Sheet No.','Previous Bill Amount|number','Previous Gross Payment|number','Previous Deduction|number','Previous Net Payment|number','Comment on Previous Payment (if any)|area'],
    checks:['Whether Bill approved by appropriate authority?','Whether deliverables submitted by consultant are as per agreement; mention details of authority that reviewed the deliverables','If payment is attendance based, whether proper attendance register maintained and approved by concerned authority','Whether earnest Money/Security Deposit is the prescribed percentage or more of the estimated Consideration value'],
    deductions:['Security Deposit','GST','Income Tax','Penalty/ LD','Advance adjusted','under/ over payment in last bill','Difference in Amount as per agreement and total invoice till date'],
    books:['Cheque issue register','Cash Book'], docs:['Invoice','Attendance register if payment is attendance-based','Agreed deliverables / service acceptance records']
  },
  Manpower: {
    title:'Checklist for Payment of Manpower Services',
    fields:['Month - Financial Year','Checklist Date|date','Prepared by','Zone / Dept. / File No.','Item Availability in GEM / Non Availability Report','Mode of Purchase|select:GeM,Open Tender,Limited Tender,Quotation,Other','Name of Service Item & Vendor Name|area','Detail of EPF and ESIC, Labour Licence|area','Estimated Amount or Rate Contract|number','Source of Fund','Financial Approval No.','Financial Approval Date|date','Financial Approval Rs.|number','Financial Approval Approved By (Name & Desig.)','Tender Published in and Dated','No. of Participants|number','Tender Committee Approval No.','Tender Committee Approval Date|date','Value Approved by Tender Committee|number','Tender Committee Headed by','Reason for Selection|area','PAN No.','TIN / GSTIN No.','Purchase Order No. & Date','Demand Raised By','Approved By','Received By','Date of Supply (as per PO)|date','Actual Date of Supply|date','Extended Date of Supply & Reason|area','Attendance Verified by','EPF and ESIC paid timely or not|yn','Issue Date & Receiver Name','Penal Provision as per Agreement','Bill No. & Type','Scheme from which Fund Allocated','Grant Type','Remaining Fund in Scheme after Payment|number','Previous Bill No.','Previous Note Sheet No.','Previous Bill Amount|number','Previous Gross Payment|number','Previous Deduction|number','Previous Net Payment|number','Comment on Previous Payment (if any)|area'],
    checks:['Whether copy of agreements/PO/tender for purchases more than Rs.1 lakh was inspected by the Auditor','Whether comparative statements prepared and approved by appropriate authority','Whether earnest Money/Security Deposit is 3% or more of the estimated purchase value','Whether Industries registered as Small-Scale Industrial Units were given priority as per rules','If yes then whether they are given exemption from EMD / Security Deposit','Whether payment is likely to be made within 20 days of invoice/goods received','Whether in case of late payment without reason, interest at prevailing bank rate to be paid alongwith payment','Whether attendance system is proper','Prepare Calculation in Prescribed excel sheet'],
    deductions:['Security Deposit','Income Tax','Penalty/ LD','Advance adjusted','under/ over payment in last bill','Difference in Amount as per agreement and total invoice till date'],
    books:['Cheque issue register','Cash Book','Grant Register','Attendance / muster register','Budget Control Register'], docs:['Agreement / PO / tender','Invoice / bill','Attendance records','EPF and ESIC payment proof','Labour licence','Service delivery / issue records']
  },
  'Store Purchase': {
    title:'Checklist for Payment of Store Procurement / Purchase Bill',
    fields:['Month - Financial Year','Checklist Date|date','Prepared by','Zone / Dept. / File No.','Item Availability in GEM / Non Availability Report','Mode of Purchase|select:GeM,Open Tender,Limited Tender,Quotation,Other','Name of Store Item & Vendor Name|area','Detail of Inventories|area','Estimated Amount or Rate Contract|number','Source of Fund','Financial Approval No.','Financial Approval Date|date','Financial Approval Rs.|number','Financial Approval Approved By (Name & Desig.)','Tender Published in and Dated','No. of Participants|number','Tender Committee Approval No.','Tender Committee Approval Date|date','Value Approved by Tender Committee|number','Tender Committee Headed by','Reason for Selection|area','PAN No.','TIN / GSTIN No.','Purchase Order No. & Date','Demand Raised By','Approved By','Received By','Date of Supply (as per PO)|date','Actual Date of Supply|date','Extended Date of Supply & Reason|area','Acknowledgement of Store Keeper with Date','Page No. of Store Book','Issue Date & Receiver Name','Penal Provision as per Agreement','Bill No. & Type','Scheme from which Fund Allocated','Grant Type','Remaining Fund in Scheme after Payment|number','Previous Bill No.','Previous Note Sheet No.','Previous Bill Amount|number','Previous Gross Payment|number','Previous Deduction|number','Previous Net Payment|number','Comment on Previous Payment (if any)|area'],
    checks:['Whether copy of agreements/PO/tender for purchases more than Rs.1 lakh was inspected by the Auditor','Whether comparative statements prepared and approved by appropriate authority','Whether earnest Money/Security Deposit is 3% or more of the estimated purchase value','Whether Industries registered as Small-Scale Industrial Units were given priority as per rules','If yes then whether they are given exemption from EMD / Security Deposit','Whether important plant & machinery purchased from supplier registered with DGA&D','Whether payment is likely to be made within 20 days of invoice/goods received','Whether in case of late payment without reason, interest at prevailing bank rate to be paid alongwith payment','Whether physical verification of inventories are proper','Prepare Calculation in Prescribed excel sheet'],
    deductions:['Security Deposit','Income Tax','Penalty/ LD','Advance adjusted','under/ over payment in last bill','Difference in Amount as per agreement and total invoice till date'],
    books:['Cheque issue register','Cash Book','Grant Register','Inventory / Stock Register','Budget Control Register'], docs:['Invoice','Purchase Order / agreement','Goods receipt / store acknowledgement','Inventory entry / stock record']
  },
  'Employee Advance': {
    title:'Checklist for Advances to Employees',
    fields:['Financial Year','Zone / Deptt.','Note Sheet No.','Ledger A/c No.','Advance subsequently disallowed|yn','Name of Employee','PAN No. of Employee','Designation of Employee','Advance Requested|number','Advance Sanctioned|number','Date of Sanction|date','Mode of Payment','Date of Payment|date','No. of Instalments for Recovery|number','Amount of Instalment|number','Total O/s Advance against Employee as on Date|number','Purpose|area','Total Advance Repayment O/s as on Date|number','Approved By','Advance Type|select:Official Use,GPF/CPF,General Fund (Personal Use)'],
    checks:['ADVANCE FOR OFFICIAL USE|heading','A1|Whether application received from employee','A2|Whether expenses is for official work','A3|Whether notesheet signed by Department Head','A4|Whether notesheet signed by sanctioning authority','A5|Whether notesheet signed by DC(F)/ Account Officer','ADVANCE AGAINST GPF/CPF|heading','B1|Whether application received from employee','B2|Whether advance given only for purposes under Rules','B3|Whether all conditions of act complied with','B4|Whether notesheet signed by Department Head','B5|Whether balance checked in Ledger of applicant','B6|Whether notesheet signed by DC(F)/ Account Officer','B7|Whether amount sanctioned does not exceed lower of 3 months pay or 50% of credited balance in GPF/CPF A/c','B8|Whether notesheet signed by sanctioning authority','ADVANCE AGAINST GENERAL FUND (PERSONAL USE)|heading','C1|Whether application received from employee','C2|Whether notesheet signed by Department Head','C3|Whether notesheet signed by sanctioning authority','C4|Whether notesheet signed by Accounts Officer'],
    deductions:[], books:[], docs:[]
  },
  'Misc. Expenses': { title:'Checklist for Miscellaneous Expenses / Contingency', fields:[], checks:['Expenditure is supported by proper sanction of the competent authority.','The expenditure is necessary, permissible and connected with ULB functions.','Original bill / voucher and supporting documents are available.','Payment has been made to the proper person and properly acknowledged.','Rates / charges have been checked for reasonableness.','The expenditure is correctly classified under the relevant account head.','Required recoveries / statutory deductions have been checked.','Vouchers and sub-vouchers have been scrutinised and cancelled / defaced after payment where prescribed.','Payment advice and payment voucher are complete and authorised.','Any recoverable amount / advance has been recorded and followed up.'], deductions:[], books:[], docs:[] }
};
// A. Register details has its own category mapping. These are only the
// existing A-register fields; this intentionally does not read B fields.
const A_REGISTER_CATEGORY_FIELDS = {
  Contractor: ['file_received_date|File Received Date|date','audit_date|Audit Date|date','nature_work|Nature of Work/Service|text','party|Name of Contractor / Vendor / Employee','pan_no|PAN No.','tin_gstin_no|GSTIN No.','scheme_fund|Name of Scheme / Fund','bill_amount|Bill Amount (Gross) ₹|number','estimate_prepared_by_name|Estimate prepared by|text','estimate_prepared_by_authority|Estimate prepared by Authority|text','work_order_no|Work Order No.|text','work_order_date|Work Order Date|date','work_order_value|Work Order Value|number','date_of_commencement_as_per_wo|Date of Commencement - As per WO|date','date_of_work_completion_schedule|Date of Work Completion - Schedule|date','agreement_no|Agreement No.|text','agreement_date|Agreement Date|date','agreement_value|Agreement Value|number','constitution|Constitution|select:Proprietorship Firm,Partnership Firm,Private Limited Company,Public Limited Company,LLP,AOP,Trust,Other'],
  Consultancy: ['voucher_no|Voucher No.','file_received_date|File Received Date|date','audit_date|Audit Date|date','nature_work|Nature of Work|area','party|Name of Contractor / Vendor / Employee','pan_no|PAN No.','tin_gstin_no|GSTIN No.','scheme_fund|Name of Scheme / Fund','bill_amount|Bill Amount (Gross) ₹|number','constitution|Constitution|select:Proprietorship Firm,Partnership Firm,Private Limited Company,Public Limited Company,LLP,AOP,Trust,Other','agreement_no|Agreement No.|text','agreement_date|Date|date','agreement_value|Value|number'],
  Manpower: ['voucher_no|Voucher No.','file_received_date|File Received Date|date','audit_date|Audit Date|date','nature_work|Nature of Work|area','party|Name of Contractor / Vendor / Employee','pan_no|PAN No.','tin_gstin_no|GSTIN No.','scheme_fund|Name of Scheme / Fund','bill_amount|Bill Amount (Gross) ₹|number','constitution|Constitution|select:Proprietorship Firm,Partnership Firm,Private Limited Company,Public Limited Company,LLP,AOP,Trust,Other','work_order_no|Work Order No.|text','work_order_date|Date|date','work_order_value|Value|number'],
  'Store Purchase': ['voucher_no|Voucher No.','file_received_date|File Received Date|date','audit_date|Audit Date|date','nature_work|Nature of Work|area','party|Name of Contractor / Vendor / Employee','pan_no|PAN No.','tin_gstin_no|GSTIN No.','scheme_fund|Name of Scheme / Fund','bill_amount|Bill Amount (Gross) ₹|number','constitution|Constitution|select:Proprietorship Firm,Partnership Firm,Private Limited Company,Public Limited Company,LLP,AOP,Trust,Other'],
  'Employee Advance': ['voucher_no|Voucher No.','file_received_date|File Received Date|date','audit_date|Audit Date|date','party|Name of Contractor / Vendor / Employee','scheme_fund|Name of Scheme / Fund','bill_amount|Bill Amount (Gross) ₹|number','constitution|Constitution|select:Proprietorship Firm,Partnership Firm,Private Limited Company,Public Limited Company,LLP,AOP,Trust,Other'],
  'Misc. Expenses': ['voucher_no|Voucher No.','file_received_date|File Received Date|date','audit_date|Audit Date|date','nature_work|Nature of Work|area','party|Name of Contractor / Vendor / Employee','scheme_fund|Name of Scheme / Fund','bill_amount|Bill Amount (Gross) ₹|number','constitution|Constitution|select:Proprietorship Firm,Partnership Firm,Private Limited Company,Public Limited Company,LLP,AOP,Trust,Other']
};

const OFFICIAL_CHECKLISTS = CATEGORY_FORM_DATA;
const DEFAULT_DEDUCTIONS = CATEGORY_FORM_DATA.Contractor.deductions;
const DEFAULT_BOOKS = CATEGORY_FORM_DATA.Contractor.books;
const DEFAULT_DOCS = CATEGORY_FORM_DATA.Contractor.docs;

/* =========================================================
   18. CHECKLIST HELPERS
   ========================================================= */

function ulbName(id) {
  return (
    state.ulbs.find(
      ulb => ulb.id === id
    )?.name || ''
  );
}


function districtName(id) {
  return (
    state.districts.find(
      district => district.id === id
    )?.name || ''
  );
}


function checklistTypes() {
  return Object.keys(
    OFFICIAL_CHECKLISTS
  );
}


function checklistSeedChecks(type, existing = []) {
  const map = new Map(existing.map(item => [item.code, item]));
  return (OFFICIAL_CHECKLISTS[type]?.checks || []).map((raw, index) => {
    const parts = raw.split('|');
    const isHeading = (parts.length === 1 && raw === raw.toUpperCase() && !/^\d/.test(raw)) || parts[1] === 'heading';
    const code = isHeading ? `H${index}` : (parts.length > 1 ? parts[0] : (type === 'Contractor' ? (index < 3 ? `1.${index + 1}` : String(index - 1)) : String(index + 1)));
    const text = parts[1] === 'heading' ? parts[0] : (isHeading ? raw : (parts.length > 1 ? parts.slice(1).join('|') : raw));
    return map.get(code) || existing[index] || { code, text, status: '', remark: '', heading: isHeading };
  });
}

function checklistSeedRecord(type) {
  return {
    type,

    register: {
      voucher_no: '',
      voucher_date: '',
      file_received_date:
        new Date()
          .toISOString()
          .slice(0, 10),
      audit_date:
        new Date()
          .toISOString()
          .slice(0, 10),
      scheme_fund: '',
      party: '',
      bill_amount: '',
      nature_work: ''
    },

    file_details: {
      month_fy:
        `${months[state.month]} ${state.fy}`,

      checklist_date:
        new Date()
          .toISOString()
          .slice(0, 10),

      prepared_by:
        state.user?.name || '',

      zone_dept_file_no: '',
      work_contractor: '',
      head_expenses: '',
      grant_type: '',
      estimated_amount: '',
      estimate_prepared_by: '',

      technical_approval_no: '',
      technical_approval_date: '',
      technical_approval_rs: '',
      technical_approval_by: '',

      tender_approval_no: '',
      tender_approval_date: '',
      tender_approval_rs: '',
      tender_approval_by: '',

      document_verification: '',
      tender_published_date: '',
      participants: '',
      financial_approval_no: '',
      tender_committee: '',
      headed_by: ''
    },

    checks:
      checklistSeedChecks(type),

    deductions:
      (OFFICIAL_CHECKLISTS[type].deductions || []).map((head, index) => ({ code: String(index + 1), head, rate: '', amount: '', remark: '' })),

    books: {
      accounts:
        (OFFICIAL_CHECKLISTS[type].books || []).map(label => ({
          label,
          checked: false
        })),

      documents:
        (OFFICIAL_CHECKLISTS[type].docs || []).map(label => ({
          label,
          checked: false
        }))
    },

    result_details: {
      amount_approved: '',
      query_sheet_no: '',
      payment_passed: '',
      remarks: ''
    },

    query_form: {
      form2_number: '',
      query_date: new Date().toISOString().slice(0, 10),
      bill_invoice_reference: '',
      amount: '',
      party_name: '',
      query_text: ''
    },

    result: '-',
    net_eligible: 0,

    party: '',
    work: '',
    amount: 0,
    audit_date: '',
    file_received_date: ''
  };
}


/* =========================================================
   19. CHECKLIST LIST / SEARCH
   ========================================================= */

let checklistListTimer = null;


function checklistListFilters() {
  return `
    <div
      class="form-grid three"
      style="margin-top:16px"
    >

      <div class="field">

        <label>
          District
        </label>

        <select
          id="clDistrict"
          onchange="loadChecklistList()"
        >

          <option value="">
            All Districts
          </option>

          ${state.districts.map(
            district => `
              <option value="${district.id}">
                ${esc(district.name)}
              </option>
            `
          ).join('')}

        </select>

      </div>


      <div class="field">

        <label>
          ULB
        </label>

        <select
          id="clUlb"
          onchange="loadChecklistList()"
        >

          <option value="">
            All ULBs
          </option>

          ${state.ulbs
            .filter(ulb => ulb.active)
            .map(ulb => `
              <option value="${ulb.id}">
                ${esc(ulb.name)}
              </option>
            `)
            .join('')}

        </select>

      </div>


      <div class="field">

        <label>
          Search
        </label>

        <input
          id="clSearch"
          placeholder="
            Checklist no., party, work, voucher...
          "
          oninput="debouncedChecklistList()"
        >

      </div>

    </div>
  `;
}


function debouncedChecklistList() {
  clearTimeout(
    checklistListTimer
  );

  checklistListTimer =
    setTimeout(
      loadChecklistList,
      250
    );
}


async function checklists(content) {
  content.innerHTML = `
    <div class="card">
      Loading Checklists...
    </div>
  `;

  await loadChecklistList();
}


async function loadChecklistList() {
  const content = $('#content');
  if (!content) return;

  try {
    const query = new URLSearchParams();
    if ($('#clDistrict')?.value) query.set('district_id', $('#clDistrict').value);
    if ($('#clUlb')?.value) query.set('ulb_id', $('#clUlb').value);
    if ($('#clSearch')?.value) query.set('q', $('#clSearch').value);

    const rows = await api('/api/checklist-records?' + query);

    content.innerHTML = `
      <section class="checklists-page">
        <header class="module-heading checklist-heading">
          <div class="module-heading-main">
            <div class="module-icon" aria-hidden="true">☑</div>
            <div>
              <h1>Checklists</h1>
              <p>Every saved checklist flows into the Internal Audit Register once finalised.</p>
            </div>
          </div>
          <div class="module-heading-actions">
            <button class="btn checklist-new-btn" onclick="newChecklistModal()">
              <span aria-hidden="true">＋</span> New checklist
            </button>
          </div>
        </header>

        <div class="checklist-filters">
          ${checklistListFilters()}
        </div>

        <section class="checklist-table-panel">
          <div class="checklist-table-scroll">
            <table class="table checklist-table">
              <thead>
                <tr>
                  <th>CHECKLIST NO.</th>
                  <th>TYPE</th>
                  <th>ULB</th>
                  <th>WORK / PARTY</th>
                  <th>AUDIT DATE</th>
                  <th>NET ₹</th>
                  <th>RESULT</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(row => `
                  <tr class="checklist-click-row" onclick="openChecklist('${String(row.id).replace(/'/g, "\\'")}')">
                    <td><span class="checklist-number">${esc(row.checklist_no || '—')}</span></td>
                    <td><span class="checklist-type">${esc(row.type || '—')}</span></td>
                    <td>
                      <span class="checklist-ulb">${esc(ulbName(row.ulb_id))}</span>
                      <small class="checklist-district">${esc(districtName(row.district_id))}</small>
                    </td>
                    <td>
                      <span class="checklist-work">${esc(row.work || row.register?.nature_work || '—')}</span>
                      <small class="checklist-party">${esc(row.party || row.register?.party || '')}</small>
                    </td>
                    <td class="checklist-date">${esc(row.audit_date || row.register?.audit_date || '—')}</td>
                    <td class="checklist-money">${money(row.net_eligible || 0)}</td>
                    <td><span class="checklist-result ${String(row.result || '').toLowerCase() === 'approved' ? 'approved' : String(row.result || '').toLowerCase() === 'query' ? 'query' : 'neutral'}">${esc(row.result || '—')}</span></td>
                    <td><span class="checklist-status ${String(row.status || 'Draft').toLowerCase() === 'final' ? 'final' : 'draft'}">${esc(row.status || 'Draft')}</span></td>
                    <td><button class="btn btn-small checklist-duplicate-btn" type="button" onclick="event.stopPropagation(); duplicateChecklist('${String(row.id).replace(/'/g, "\\'")}')">Duplicate</button></td>
                  </tr>
                `).join('') || `<tr><td colspan="8" class="empty checklist-empty">No checklists found.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    `;
  } catch (error) {
    content.innerHTML = `<div class="card"><b>Unable to load checklists</b><p>${esc(error.message)}</p></div>`;
  }
}

async function duplicateChecklist(id) {
  try {
    const copy = await api(`/api/checklist-records/${encodeURIComponent(id)}/duplicate`, { method: 'POST', body: '{}' });
    toast(`Checklist duplicated as ${copy.checklist_no}`);
    await loadChecklistList();
  } catch (error) {
    toast(error.message || 'Unable to duplicate checklist', true);
  }
}

/* =========================================================
   20. CREATE NEW CHECKLIST
   ========================================================= */

function newChecklistModal() {
  modal(`
    <h2>
      New checklist
    </h2>


    <div class="field">

      <label>
        ULB
      </label>

      <select id="newClUlb">

        ${state.ulbs
          .filter(ulb => ulb.active)
          .map(ulb => `
            <option
              value="${ulb.id}"
              ${
                ulb.id === state.ulb
                  ? 'selected'
                  : ''
              }
            >
              ${esc(ulb.name)}
            </option>
          `)
          .join('')}

      </select>

    </div>


    <div
      id="newClTypes"
      style="margin-top:12px"
    >

      ${checklistTypes()
        .map(
          (type, index) => `
            <button
              type="button"
              class="card"
              style="
                display:block;
                width:100%;
                text-align:left;
                margin:8px 0;
                padding:12px;
                border:1px solid #d7dee8;
                background:
                  ${index === 0
                    ? '#fff8e8'
                    : 'white'};
              "
              onclick="
                selectNewChecklistType(
                  '${type.replace(
                    /'/g,
                    "\\'"
                  )}'
                )
              "
            >

              <b>
                ${esc(type)}
              </b>

              <div class="muted">
                ${esc(
                  OFFICIAL_CHECKLISTS[type]
                    .title
                )}
              </div>

            </button>
          `
        )
        .join('')}

    </div>


    <div
      class="actions"
      style="justify-content:flex-end"
    >

      <button
        class="btn"
        onclick="createNewChecklist()"
      >
        Create & open
      </button>

      <button
        class="btn secondary"
        onclick="closeModal()"
      >
        Cancel
      </button>

    </div>
  `);

  window.newChecklistType =
    checklistTypes()[0];
}


function selectNewChecklistType(type) {
  window.newChecklistType = type;

  $$('#newClTypes .card')
    .forEach((element, index) => {
      element.style.background =
        index ===
        checklistTypes().indexOf(type)
          ? '#fff8e8'
          : 'white';
    });
}


async function createNewChecklist() {
  const type =
    window.newChecklistType ||
    'Contractor';

  const ulb =
    $('#newClUlb').value;

  try {
    const seed =
      checklistSeedRecord(type);

    const checklist =
      await api(
        '/api/checklist-records',
        {
          method: 'POST',
          body: JSON.stringify({
            ulb_id: ulb,
            type,
            financial_year:
              state.fy,
            month:
              Number(state.month),

            register:
              seed.register,

            file_details:
              seed.file_details,

            checks:
              seed.checks,

            deductions:
              seed.deductions,

            books:
              seed.books,

            result_details:
              seed.result_details
          })
        }
      );

    closeModal();

    openChecklist(
      checklist.id
    );

  } catch (error) {
    toast(error.message, true);
  }
}


async function openChecklist(id) {
  state.checklistId = id;
  state.checklistTab = 'A';

  state.checklistDraft =
    await api(
      '/api/checklist-records/' +
      id
    );

  state.view =
    'checklist-detail';

  await renderView();
}


/* =========================================================
   21. CHECKLIST DETAIL HELPERS
   ========================================================= */

function clField(
  name,
  label,
  value = '',
  type = 'text',
  wide = false
) {
  return `
    <div
      class="field"
      style="
        ${wide
          ? 'grid-column:1/-1'
          : ''}
      "
    >

      <label>
        ${esc(label)}
      </label>

      <input
        name="${esc(name)}"
        type="${type}"
        value="${esc(value)}"
      >

    </div>
  `;
}


function clArea(
  name,
  label,
  value = '',
  wide = true
) {
  return `
    <div
      class="field"
      style="
        ${wide
          ? 'grid-column:1/-1'
          : ''}
      "
    >

      <label>
        ${esc(label)}
      </label>

      <textarea
        name="${esc(name)}"
      >${esc(value)}</textarea>

    </div>
  `;
}


function clSelect(name, label, value = '', options = ['Y', 'N'], wide = false) {
  return `
    <div class="field" style="${wide ? 'grid-column:1/-1' : ''}">
      <label>${esc(label)}</label>
      <select name="${esc(name)}">
        <option value="">Select…</option>
        ${options.map(option => `<option value="${esc(option)}" ${String(value ?? '') === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}
      </select>
    </div>
  `;
}


function checklistHasNoAnswer(checklist = state.checklistDraft) {
  return (checklist?.checks || []).some(check =>
    String(check.status || '').toUpperCase() === 'N'
  );
}

function checklistAllRequiredChecksCompleted(checklist = state.checklistDraft) {
  const checks = checklist?.checks || [];
  return checks.length > 0 && checks.every(check =>
    ['Y', 'N', 'NA'].includes(String(check.status || '').trim().toUpperCase())
  );
}

function checklistResultQuerySheetDisabled(checklist = state.checklistDraft) {
  // In Section F, hide the Query Sheet No. once the amount is approved,
  // unless at least one Section C check is explicitly marked No.
  // Do not require checklistAllRequiredChecksCompleted here: older/saved
  // checklist records can contain status values that are not normalized,
  // even when the visible Yes buttons are selected.
  const approved = String(checklist?.result_details?.amount_approved || '').trim().toUpperCase();
  const hasNo = (checklist?.checks || []).some(check => {
    const status = String(check?.status ?? check?.answer ?? '').trim().toUpperCase();
    return status === 'N' || status === 'NO';
  });
  return approved === 'Y' && !hasNo;
}

function ensureChecklistQuerySheetNumber(checklist = state.checklistDraft) {
  if (!checklist) return '';
  checklist.query_form = checklist.query_form || {};
  checklist.result_details = checklist.result_details || {};
  const existing = String(
    checklist.query_form.form2_number ||
    checklist.result_details.query_sheet_no ||
    ''
  ).trim();
  // Assign a stable number only when a query is required; reuse it on edits/saves.
  const number = existing || (checklistNeedsQueries(checklist)
    ? `${checklist.checklist_no || 'CL'}-Q1`
    : '');
  if (number) {
    checklist.query_form.form2_number = number;
    checklist.result_details.query_sheet_no = number;
  }
  return number;
}

function checklistAmountNotApproved(checklist = state.checklistDraft) {
  return String(checklist?.result_details?.amount_approved || '').toUpperCase() === 'N';
}

function checklistNeedsQueries(checklist = state.checklistDraft) {
  return checklistHasNoAnswer(checklist) || checklistAmountNotApproved(checklist);
}

function clearChecklistQueriesWhenFullyApproved(checklist = state.checklistDraft) {
  if (!checklist) return false;
  const checks = checklist.checks || [];
  const allChecksYes = checks.length > 0 && checks.every(check =>
    String(check?.status ?? check?.answer ?? '').trim().toUpperCase() === 'Y'
  );
  const amountApproved = String(checklist.result_details?.amount_approved || '').trim().toUpperCase() === 'Y';
  if (!allChecksYes || !amountApproved) return false;

  // Query data belongs to this checklist. Clear it only when every check is
  // explicitly Yes and the amount is approved; never mutate the source record.
  checklist.query_form = {
    ...(checklist.query_form || {}),
    form2_number: '',
    query_date: '',
    bill_invoice_reference: '',
    amount: '',
    party_name: '',
    query_text: ''
  };
  checklist.result_details = {
    ...(checklist.result_details || {}),
    query_sheet_no: '',
    remarks: ''
  };
  checklist.result = 'Clear';
  return true;
}

function checklistQueryFormValid(query = {}) {
  return ['form2_number', 'query_date', 'bill_invoice_reference', 'amount', 'party_name', 'query_text']
    .every(key => String(query[key] ?? '').trim() !== '');
}

function clTabs() {
  const tabs = [
    'A|Register details',
    'B|File details',
    'C|Checks',
    'D|Deductions',
    'E|Books & documents',
    'F|Result',
    ...(checklistNeedsQueries(state.checklistDraft) ? ['G|Queries Form'] : [])
  ];

  return tabs
    .map(item => {

      const [
        key,
        label
      ] = item.split('|');

      return `
        <button
          type="button"
          class="${
            state.checklistTab === key
              ? 'btn'
              : 'btn secondary'
          }"
          style="
            border-radius:
              8px 8px 0 0
          "
          onclick="
            switchChecklistTab('${key}')
          "
        >
          ${key}. ${label}
        </button>
      `;
    })
    .join('');
}


function checklistHeader(checklist) {
  return `
    <div class="card">

      <div class="muted">
        ${esc(
          OFFICIAL_CHECKLISTS[
            checklist.type
          ]?.title ||
          'Checklist'
        )}
      </div>

      <div
        style="
          font-size:16px;
          font-weight:700;
          color:#c65a00;
          margin-top:4px
        "
      >
        ${esc(
          checklist.checklist_no
        )}
      </div>

      <div class="muted">

        ${esc(
          ulbName(
            checklist.ulb_id
          )
        )}

        •

        ${esc(
          districtName(
            checklist.district_id
          )
        )}

        <span
          class="pill ${
            checklist.status === 'Final'
              ? 'ok'
              : 'warn'
          }"
          style="margin-left:6px"
        >
          ${esc(checklist.status)}
        </span>

        <span
          style="color:#15803d"
        >
          ✓ Saved
        </span>

      </div>


      <div
        class="actions"
        style="
          justify-content:flex-end;
          margin-top:-25px
        "
      >

        <b
          style="margin-right:14px"
        >
          NET ELIGIBLE<br>

          <span
            style="
              color:#078c63;
              font-size:18px
            "
          >
            ₹ ${money(
              checklist.net_eligible || 0
            )}
          </span>
        </b>


        <button
          class="btn secondary"
          onclick="
            downloadChecklistDoc(
              '${checklist.id}'
            )
          "
        >
          ⇩ DOC
        </button>


        <button
          class="btn secondary"
          onclick="
            deleteChecklist(
              '${checklist.id}'
            )
          "
        >
          🗑
        </button>


        <button
          class="btn"
          onclick="
            finalizeChecklist(
              '${checklist.id}'
            )
          "
        >
          ✓ Finalise
        </button>

      </div>

    </div>
  `;
}


/* =========================================================
   22. CHECKLIST DETAIL VIEW
   ========================================================= */

function checklistDetailView(
  content,
  checklist
) {
  content.innerHTML = `
    <div
      class="muted"
      style="
        margin-bottom:10px;
        cursor:pointer
      "
      onclick="go('checklists')"
    >
      ← Checklists
    </div>

    ${checklistHeader(checklist)}

    <div
      style="
        display:flex;
        gap:2px;
        margin-top:22px;
        flex-wrap:wrap
      "
    >
      ${clTabs()}
    </div>

    <div
      class="card"
      style="
        border-top-left-radius:0
      "
    >
      ${checklistTabHtml(checklist)}
    </div>


    <div
      class="actions"
      style="
        justify-content:flex-end;
        margin-top:12px
      "
    >

      <button
        class="btn secondary"
        onclick="saveChecklistTab()"
      >
        Save draft
      </button>

      ${
        state.checklistTab !== 'F'
          ? `
            <button
              class="btn"
              onclick="
                switchChecklistTab(
                  '${String.fromCharCode(
                    state.checklistTab
                      .charCodeAt(0) + 1
                  )}'
                )
              "
            >
              Next →
            </button>
          `
          : ''
      }

    </div>
  `;

  // Saved query-image thumbnails are loaded only when Section G is rendered.
  if (state.checklistTab === 'G') {
    loadChecklistQueryImageThumbnails(checklist).catch(error => {
      console.warn('Could not load saved query images:', error);
      const target = document.getElementById('cl-query-saved-images');
      if (target) target.innerHTML = '<div class="query-saved-images-heading">Saved query images</div><p class="query-saved-images-empty">Saved images could not be loaded. Please refresh or try again.</p>';
    });
  }
}


/* =========================================================
   23. CHECKLIST TABS
   ========================================================= */

function checklistTabHtml(checklist) {
  const data =
    state.checklistDraft ||
    checklist;


  /* -------------------------------------------------------
     TAB A — REGISTER DETAILS
     ------------------------------------------------------- */

  if (state.checklistTab === 'A') {
    const fields = A_REGISTER_CATEGORY_FIELDS[data.type] || A_REGISTER_CATEGORY_FIELDS.Contractor;
    const controls = fields.map(raw => {
      const [key, label, spec = 'text'] = raw.split('|');
      const value = data.register?.[key] ?? '';
      if (spec === 'area') return clArea(key, label, value);
      if (spec.startsWith('select:')) return clSelect(key, label, value, spec.slice(7).split(','));
      return clField(key, label, value, spec === 'date' || spec === 'number' ? spec : 'text');
    }).join('');
    return `<div class="contractor-style-scope contractor-tab-a"><form id="clForm" class="form-grid three"><div class="checklist-section-heading contractor-style-title" style="grid-column:1/-1;font-weight:700">${esc(OFFICIAL_CHECKLISTS[data.type]?.title || data.type)}</div>${controls}</form></div>`;
  }

  /* -------------------------------------------------------
     TAB B — FILE DETAILS
     ------------------------------------------------------- */

  if (state.checklistTab === 'B') {
    const file = data.file_details || {};

    // Contractor B. File details: layout based on the supplied Contractor File Details design.
    // All controls use the existing file_details keys so saved checklist data remains compatible.
    if (data.type === 'Contractor') {
      const saved = (key) => file[key] ?? '';
      const section = (title, subtitle, body) => `<section class="contractor-design-section" style="grid-column:1/-1;margin:0 0 24px;background:#fff;border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:all .2s"><header class="contractor-design-header"><span class="contractor-design-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div></header><div class="contractor-design-body">${body}</div></section>`;
      const statusGroup = (key, title, options = ['Yes','No','NA'], details = '') => {
        const status = saved(key);
        const detailId = `${key}Details`;
        const buttons = `<div class="contractor-approval-row"><label class="contractor-approval-label">${esc(title)}</label><div class="contractor-status-buttons" style="display:flex;gap:0;flex-wrap:wrap">${options.map(option => {
          const active = status === option;
          return `<label class="choice-button ${active ? 'selected' : ''}" style="display:inline-flex;align-items:center;justify-content:center;min-width:42px;border:1px solid ${active ? '#16a34a' : '#cbd5e1'};background:${active ? '#ecfdf5' : '#fff'};color:${active ? '#15803d' : '#1f2937'};border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:${active ? '600' : '400'}"><input type="radio" name="${esc(key)}" value="${esc(option)}" ${active ? 'checked' : ''} style="position:absolute;opacity:0;width:1px;height:1px" onchange="(function(el){var box=document.getElementById('${detailId}');if(box){box.hidden=el.value!=='Yes';box.style.setProperty('display',el.value==='Yes'?'grid':'none','important');}var group=el.closest('.contractor-status-buttons');if(group){group.querySelectorAll('.choice-button').forEach(function(btn){var input=btn.querySelector('input'),active=input.checked;btn.classList.toggle('selected',active);btn.style.borderColor=active?'#16a34a':'#cbd5e1';btn.style.background=active?'#ecfdf5':'#fff';btn.style.color=active?'#15803d':'#1f2937';btn.style.fontWeight=active?'600':'400';});}})(this)">${esc(option)}</label>`;
        }).join('')}</div></div>`;
        if (!details) return buttons;
        return buttons + `<div id="${detailId}" class="form-grid three contractor-detail-expand" ${status === 'Yes' ? '' : 'hidden'} style="grid-column:1/-1;display:${status === 'Yes' ? 'grid' : 'none'}${status === 'Yes' ? '' : ' !important'}">${details}</div>`;
      };
      const approval = (prefix, title, label) => statusGroup(`${prefix}_status`, title, ['Yes','No','NA'],
        clField(`${prefix}_no`, `${label} No.`, saved(`${prefix}_no`)) +
        clField(`${prefix}_date`, `${label} Date`, saved(`${prefix}_date`), 'date') +
        clField(`${prefix}_rs`, `${label} Amount (Rs.)`, saved(`${prefix}_rs`), 'number') +
        clField(`${prefix}_approved_by_name`, 'Approved By Name', saved(`${prefix}_approved_by_name`)) +
        clField(`${prefix}_approved_by_designation`, 'Approved By Designation', saved(`${prefix}_approved_by_designation`)));
      const sorBaseField = clField('sor_base_value', 'Base Value (Rs.)', saved('sor_base_value'), 'number').replace('<input', '<input oninput="calculateContractorSorBid()"');
      const sorPctField = clField('sor_percentage', 'SOR Percentage (%)', saved('sor_percentage'), 'number').replace('<input', '<input step="0.01" oninput="calculateContractorSorBid()"');
      const sorOptionField = `<div class="field"><label>SOR Option</label><select name="sor_option" onchange="calculateContractorSorBid()"><option value="">Select...</option>${['Above','Below'].map(v => `<option value="${v}" ${saved('sor_option')===v?'selected':''}>${v}</option>`).join('')}</select></div>`;
      const computedBidField = clField('computed_bid_value', 'Computed Bid Value (Rs.)', saved('computed_bid_value'), 'number').replace('<input', '<input readonly');
      const fields = [
        section('B. File Details', 'Contractor approvals, bidding, execution and compliance records',
          clField('prepared_by', 'Prepared by', saved('prepared_by'), 'text', true)),
        section('1. Approvals & Clearances', 'Set approval status to reveal related entry fields',
          approval('technical_approval', 'Technical Approval', 'Technical Approval') +
          approval('tender_inviting_approval', 'Tender Inviting Approval', 'Tender Approval') +
          approval('tender_committee_approval', 'Tender Committee Approval', 'Tender Committee Approval') +
          approval('financial_approval', 'Financial Approval', 'Financial Approval')),
        section('2. Schedule of Rates (SOR) & Bidding', 'Bid value fields',
          sorBaseField + sorPctField + sorOptionField + computedBidField),
        section('3. Guarantees & Penalties', 'Financial securities and agreement provisions',
          statusGroup('emd_tdr_available', 'EMD / TDR Available') +
          statusGroup('aps_details_applicable', 'Additional Performance Guarantee (APG) Details if Applicable',
            ['Yes','No','NA'], clField('apg_amount', 'APG Amount (Rs.)', saved('apg_amount'), 'number') + clField('apg_validity_date', 'APG Validity Date', saved('apg_validity_date'), 'date')) +
          statusGroup('penal_provision_status', 'Penal Provision as per Agreement')),
        section('4. Timeline & Execution', 'Key milestones and date extensions',
          statusGroup('extended_completion_applicable', 'Extended Date of Completion & Reason', ['Yes','NA'],
            clField('extended_completion_date', 'Extended Date', saved('extended_completion_date'), 'date') +
            clField('extended_completion_reason', 'Reason for Extension', saved('extended_completion_reason'))) +
          clField('actual_commencement_date', 'Date of Commencement - Actual', saved('actual_commencement_date'), 'date') +
          clField('actual_completion_date', 'Date of Work Completion - Actual', saved('actual_completion_date'), 'date')),
        section('5. Documentation & Financials', 'Measurement books, fund availability letter and bill entries',
          clField('measurement_book_no', 'Measurement Book No.', saved('measurement_book_no')) +
          clField('measurement_book_page_no', 'Page No.', saved('measurement_book_page_no')) +
          `<div class="contractor-subsection" style="grid-column:1/-1;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><h4 style="font-size:13px;font-weight:700;margin:0 0 12px">Availability of Fund as per Letter</h4><div class="form-grid three">${clField('fund_letter_no', 'No.', saved('fund_letter_no'))}${clField('fund_letter_date', 'Date', saved('fund_letter_date'), 'date')}${clField('fund_letter_rs', 'Amount (Rs.)', saved('fund_letter_rs'), 'number')}</div></div>` +
          `<div class="contractor-subsection" style="grid-column:1/-1;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><h4 style="font-size:13px;font-weight:700;margin:0 0 12px">Bill Details</h4><div class="form-grid three">${clField('bill_no', 'Bill No.', saved('bill_no'))}<div class="field"><label>Bill Type</label><select name="bill_type"><option value="">Select...</option>${['RA bill','Final'].map(v => `<option value="${v}" ${saved('bill_type')===v?'selected':''}>${v}</option>`).join('')}</select></div>${clField('bill_amount', 'Bill Amount (Rs.)', saved('bill_amount'), 'number')}</div></div>`),
        section('6. Quality & Mining Clearances', 'Testing reports and material royalty certificates',
          statusGroup('quality_test_report_status', 'Quality Test Report Available', ['Yes','No','NA'],
            clField('quality_report_date', 'Date of Report', saved('quality_report_date'), 'date') +
            clField('quality_testing_date', 'Date of Testing', saved('quality_testing_date'), 'date')) +
          statusGroup('mining_clearance_status', 'Mining Clearance Certificate', ['Yes','No','NA'],
            clField('mining_certificate_date', 'Date of Certificate', saved('mining_certificate_date'), 'date') +
            clField('mining_royalty_certificate_amount', 'Amount of Royalty (Rs.)', saved('mining_royalty_certificate_amount'), 'number') +
            clField('royalty_bill_amount', 'Royalty Bill No. / Ref', saved('royalty_bill_amount')) +
            clField('tcs_excess_royalty', 'TCS (2% of excess royalty)', saved('tcs_excess_royalty'), 'number')))
      ].join('');
      window.calculateContractorSorBid = function() {
        const form = document.getElementById('clForm');
        if (!form) return;
        const base = parseFloat(form.elements.sor_base_value?.value) || 0;
        const pct = parseFloat(form.elements.sor_percentage?.value) || 0;
        const option = form.elements.sor_option?.value;
        let result = base;
        if (base > 0 && pct > 0) result = option === 'Above' ? base * (1 + pct / 100) : option === 'Below' ? base * (1 - pct / 100) : base;
        if (form.elements.computed_bid_value) form.elements.computed_bid_value.value = base > 0 ? result.toFixed(2) : '';
      };
      return `<form id="clForm" class="form-grid three contractor-file-details-grid">${fields}</form>`;
    }
    const fields = OFFICIAL_CHECKLISTS[data.type]?.fields || [];
    const approvalStatus = file.technical_approval_status || '';
    const controls = fields.filter(raw => !raw.startsWith('Technical Approval No.|') && !raw.startsWith('Technical Approval Date|') && !raw.startsWith('Technical Approval Rs.|') && !raw.startsWith('Technical Approval Approved By Name|') && !raw.startsWith('Technical Approval Approved By Designation|')).map(raw => {
      const [label, spec = 'text'] = raw.split('|');
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const value = file[key] ?? '';
      if (spec === 'technical_approval_status') {
        return `<div class="field" style="grid-column:1/-1"><label>${esc(label)}</label><div class="technical-approval-choice" style="display:flex;flex-direction:row;align-items:center;gap:10px;flex-wrap:wrap">${['Yes','No','NA'].map(choice => `<label class="choice-button ${approvalStatus === choice ? 'selected' : ''}" style="display:inline-flex;align-items:center;justify-content:center;min-width:42px;border:1px solid ${approvalStatus === choice ? '#16a34a' : '#cbd5e1'};background:${approvalStatus === choice ? '#ecfdf5' : '#fff'};color:${approvalStatus === choice ? '#15803d' : '#1f2937'};border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:${approvalStatus === choice ? '600' : '400'}"><input type="radio" style="position:absolute;opacity:0;width:1px;height:1px" name="${key}" value="${choice}" ${approvalStatus === choice ? 'checked' : ''} onchange="(function(el){var box=document.getElementById('technicalApprovalFields');if(box){box.style.display=el.value==='Yes'?'':'none';box.hidden=el.value!=='Yes';}var group=el.closest('.technical-approval-choice');if(group){group.querySelectorAll('.choice-button').forEach(function(btn){var active=btn.querySelector('input').checked;btn.classList.toggle('selected',active);btn.style.borderColor=active?'#16a34a':'#cbd5e1';btn.style.background=active?'#ecfdf5':'#fff';btn.style.color=active?'#15803d':'#1f2937';btn.style.fontWeight=active?'600':'400';});}})(this)">${choice}</label>`).join('')}</div></div>`;
      }
      if (spec === 'area') return clArea(key, label, value);
      if (spec === 'yn') return clSelect(key, label, value, ['Y','N']);
      if (spec.startsWith('select:')) return clSelect(key, label, value, spec.slice(7).split(','));
      return clField(key, label, value, spec === 'number' || spec === 'date' ? spec : 'text');
    }).join('');
    const approvalDetails = [
      clField('technical_approval_no','Technical Approval No.',file.technical_approval_no || ''),
      clField('technical_approval_date','Technical Approval Date',file.technical_approval_date || '', 'date'),
      clField('technical_approval_rs','Technical Approval Rs.',file.technical_approval_rs || '', 'number'),
      clField('technical_approval_approved_by_name','Technical Approval Approved By Name',file.technical_approval_approved_by_name || ''),
      clField('technical_approval_approved_by_designation','Technical Approval Approved By Designation',file.technical_approval_approved_by_designation || '')
    ].join('');
    const approvalFields = `<div id="technicalApprovalFields" class="form-grid three" style="display:${approvalStatus === 'Yes' ? 'grid' : 'none'}" ${approvalStatus === 'Yes' ? '' : 'hidden'}>${approvalDetails}</div>`;
    return `<form id="clForm" class="form-grid three">${controls}${approvalFields}</form>`;
  }

  /* -------------------------------------------------------
     TAB C — CHECKS
     ------------------------------------------------------- */

  if (state.checklistTab === 'C') {
    return `
      <div>

        ${(data.checks || [])
          .map(
            (check, index) => check.heading ? `
              <div class="checklist-section-heading" style="padding:10px 0;font-weight:700;color:#9a5b24">${esc(check.text)}</div>
            ` : `
              <div class="checklist-point-row"
                style="
                  display:grid;
                  grid-template-columns:55px minmax(0, 1fr) 320px;
                  gap:12px;
                  align-items:center;
                  padding:12px 0;
                  border-bottom:1px solid #e8edf3;
                  min-width:0;
                "
              >

                <div class="muted">
                  ${esc(check.code)}
                </div>

                <div>
                  ${esc(check.text)}
                </div>

                <div class="checklist-response-wrap"
                  style="display:flex;gap:8px;align-items:center;min-width:0;"
                >

                  <div class="check-answer-group" role="group" aria-label="Check response">
                    <button type="button" class="check-answer ${check.status === 'Y' ? 'selected yes' : ''}" data-check-status="${index}" data-status-value="Y" onclick="setChecklistCheckStatus(${index}, 'Y')">Yes</button>
                    <button type="button" class="check-answer ${check.status === 'N' ? 'selected no' : ''}" data-check-status="${index}" data-status-value="N" onclick="setChecklistCheckStatus(${index}, 'N')">No</button>
                    <button type="button" class="check-answer ${check.status === 'NA' ? 'selected na' : ''}" data-check-status="${index}" data-status-value="NA" onclick="setChecklistCheckStatus(${index}, 'NA')">NA</button>
                  </div>


                  <input
                    class="checklist-point-remark"
                    data-check-remark="${index}"
                    placeholder="Remark (if N)"
                    value="${esc(
                      check.remark || ''
                    )}"
                  >

                </div>

              </div>
            `
          )
          .join('')}

      </div>
    `;
  }


  /* -------------------------------------------------------
     TAB D — DEDUCTIONS
     ------------------------------------------------------- */

  if (state.checklistTab === 'D') {
    return `
      <div class="contractor-style-scope contractor-tab-d"><div class="table-wrap">

        <table class="table">

          <thead>
            <tr>
              <th>S.NO</th>
              <th>HEAD</th>
              <th>RATE %</th>
              <th>AMOUNT ₹</th>
              <th>REMARK</th>
            </tr>
          </thead>

          <tbody>

            <tr>
              <td>1.1</td>
              <td>Gross Amount as approved by Accounts</td>
              <td></td>
              <td>
                <input type="number" value="${esc(data.register?.bill_amount ?? data.amount ?? '')}" readonly aria-label="Gross Amount as approved by Accounts">
              </td>
              <td></td>
            </tr>

            ${(data.deductions || [])
              .map(
                (deduction, index) => `
                  <tr>

                    <td>
                      ${esc(deduction.code)}
                    </td>

                    <td>
                      ${esc(deduction.head || DEFAULT_DEDUCTIONS[index] || '')}
                    </td>

                    <td>
                      <input
                        data-ded-rate="${index}"
                        value="${esc(
                          deduction.rate || ''
                        )}"
                      >
                    </td>

                    <td>
                      <input
                        type="number"
                        data-ded-amount="${index}"
                        value="${esc(
                          deduction.amount || ''
                        )}"
                      >
                    </td>

                    <td>
                      <input
                        data-ded-remark="${index}"
                        value="${esc(
                          deduction.remark || ''
                        )}"
                      >
                    </td>

                  </tr>
                `
              )
              .join('')}


            <tr>

              <td colspan="3">
                <b>
                  Net Amount eligible for payment
                </b>
              </td>

              <td>
                <b id="clNet">
                  ₹ ${money(
                    calculateNet(data)
                  )}
                </b>
              </td>

              <td></td>

            </tr>

          </tbody>

        </table>

      </div></div>
    `;
  }


  /* -------------------------------------------------------
     TAB E — BOOKS & DOCUMENTS
     ------------------------------------------------------- */

  if (state.checklistTab === 'E') {
    return `
      <div class="contractor-style-scope contractor-tab-e"><div class="form-grid two">

        <div class="contractor-style-card">

          <h3>
            C. Books / records to be checked
          </h3>

          ${(data.books?.accounts || [])
            .map(
              (item, index) => `
                <label
                  style="
                    display:block;
                    margin:10px 0
                  "
                >

                  <input
                    type="checkbox"
                    data-book-account="${index}"
                    ${item.checked ? 'checked' : ''}
                  >

                  ${esc(item.label || DEFAULT_BOOKS[index] || '')}

                </label>
              `
            )
            .join('')}

        </div>


        <div class="contractor-style-card">

          <h3>
            D. Documents to be collected / verified
          </h3>

          ${(data.books?.documents || [])
            .map(
              (item, index) => `
                <label
                  style="
                    display:block;
                    margin:10px 0
                  "
                >

                  <input
                    type="checkbox"
                    data-book-doc="${index}"
                    ${item.checked ? 'checked' : ''}
                  >

                  ${esc(item.label || DEFAULT_DOCS[index] || '')}

                </label>
              `
            )
            .join('')}

        </div>

      </div></div>
    `;
  }


  /* -------------------------------------------------------
     TAB G — CONDITIONAL QUERIES FORM
     ------------------------------------------------------- */

  if (state.checklistTab === 'G') {
    const query = data.query_form || {};
    const unifiedQueryText = String(data.result_details?.remarks ?? query.query_text ?? '');
    const defaultParty = data.register?.party || data.party || data.file_details?.work_contractor || '';
    return `
      <div class="contractor-style-scope contractor-tab-g"><section class="checklist-query-form">
        <div class="query-form-heading">
          <div>
            <div class="eyebrow">FORM-2 · QUERY DETAILS</div>
            <h3>G. Queries Form</h3>
            <p class="muted">Upload a query image, extract text with the configured OCR engine, translate Hindi text into English when needed, then review before saving.</p>
          </div>
        </div>
        <div class="query-form-layout">
          <aside class="query-ocr-panel">
            <div class="query-image-preview" id="cl-query-image-preview">
              <span class="query-image-placeholder">Document preview</span>
            </div>
            <label class="query-upload-label" for="cl-query-image">Upload query document</label>
            <input id="cl-query-image" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp">
            <p class="muted query-help">JPG, JPEG, PNG or WEBP · Maximum 7 MB</p>
            <div class="query-action-buttons">
              <button type="button" class="btn query-save-document-button" id="cl-query-save-document-btn" onclick="saveChecklistQueryDocument()">Add Image</button>
            </div>
            <div id="cl-query-ocr-status" class="query-ocr-status" role="status" aria-live="polite"></div>
          </aside>
          <div class="query-fields-panel">
            <div class="query-fields-top">
              <div class="field">
                <label>Checklist Number</label>
                <input value="${esc(data.checklist_no || '')}" readonly>
              </div>
              <div class="field">
                <label>Query Sheet Serial No. (auto)</label>
                <input name="form2_number" value="${esc(query.form2_number || data.result_details?.query_sheet_no || `${data.checklist_no || 'CL'}-Q1`)}" readonly>
              </div>
              <div class="field">
                <label>ULB</label>
                <input value="${esc(ulbName(data.ulb_id) || '')}" readonly>
              </div>
              <div class="field">
                <label>Query Date *</label>
                <input name="query_date" type="date" required value="${esc(query.query_date || new Date().toISOString().slice(0,10))}">
              </div>
              <div class="field">
                <label>Bill / Invoice Reference *</label>
                <input name="bill_invoice_reference" required value="${esc(query.bill_invoice_reference || data.register?.voucher_no || '')}" data-ai-field="bill_invoice_reference">
              </div>
              <div class="field">
                <label>Amount (₹) *</label>
                <input name="amount" type="number" min="0" step="0.01" required value="${esc(query.amount ?? data.register?.bill_amount ?? '')}" data-ai-field="amount">
              </div>
              <div class="field query-full-width">
                <label>Party / Contractor *</label>
                <input name="party_name" required value="${esc(query.party_name || defaultParty)}" data-ai-field="party_name">
              </div>
              <div class="field query-full-width">
                <label>Query Details *</label>
                <textarea name="query_text" required rows="7" data-ai-field="query_text">${esc(query.query_text || '')}</textarea>
              </div>
              <div id="cl-query-saved-images" class="query-saved-images query-full-width" aria-live="polite">
                <div class="query-saved-images-heading">Saved query images</div>
                <p class="muted query-saved-images-empty">Loading saved images…</p>
              </div>
              <div class="query-full-width query-ai-action-after-images">
                <button type="button" class="btn query-ai-button" id="cl-query-extract-btn" onclick="extractChecklistQueryWithGemini()">✦ Extract Details with AI</button>
              </div>
              <p class="query-review-note query-full-width">AI-filled fields are marked after extraction. Review all values before saving; unclear or missing values are left blank.</p>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /* -------------------------------------------------------
     TAB F — RESULT
     ------------------------------------------------------- */

  if (state.checklistTab === 'F') {
    const result = data.result_details || {};
    const approved = String(result.amount_approved || '').toUpperCase();
    const paymentDisabled = approved !== 'Y';
    const querySheetNo = ensureChecklistQuerySheetNumber(data);
    const querySheetDisabled = checklistResultQuerySheetDisabled(data);
    return `
      <div class="contractor-style-scope contractor-tab-f"><form id="clForm" class="form-grid three" onsubmit="return false">
        <div class="field" style="grid-column:1/-1">
          <label>Amount Approved (Y/N)</label>
          <div class="check-answer-group" role="group" aria-label="Amount Approved">
            <button type="button" class="check-answer ${approved === 'Y' ? 'selected yes' : ''}" onclick="setChecklistAmountApproved('Y')" ${checklistHasNoAnswer(data) ? 'disabled aria-disabled="true" title="Cannot approve while any C. Checks item is No"' : ''}>Yes</button>
            <button type="button" class="check-answer ${approved === 'N' ? 'selected no' : ''}" onclick="setChecklistAmountApproved('N')">No</button>
          </div>
          <input type="hidden" name="amount_approved" value="${esc(approved)}">
        </div>
        ${querySheetDisabled ? '' : `
          <div class="field">
            <label for="clQuerySheetNo">Query Sheet No.</label>
            <input id="clQuerySheetNo" name="query_sheet_no" value="${esc(querySheetNo)}" readonly aria-readonly="true">
            <small class="muted">Automatically assigned when a query is required.</small>
          </div>
        `}
        <div class="field">
          <label for="clPaymentPassed">Payment Passed (Net Amt.) ₹</label>
          <input id="clPaymentPassed" name="payment_passed" type="number" min="0" step="0.01"
            value="${esc(paymentDisabled ? '' : (result.payment_passed ?? ''))}"
            oninput="validateChecklistPaymentPassed()"
            ${paymentDisabled ? 'disabled aria-disabled="true" placeholder="Select Yes to enable"' : ''}>
          <small id="clPaymentPassedError" class="validation-message" role="alert"></small>
          ${paymentDisabled ? '<small class="muted">Disabled unless Amount Approved is Yes.</small>' : ''}
        </div>
        <div class="card" style="grid-column:1/-1;background:#f7fafc">
          <span class="muted">Proposed for Payment (Net Amt.) is calculated from deductions:</span>
          <b>₹ ${money(calculateNet(data))}</b>
        </div>
      </form></div>
    `;
  }

  return '';
}


/* =========================================================
   24. CHECKLIST CALCULATIONS
   ========================================================= */

async function loadChecklistQueryImageThumbnails(checklist = state.checklistDraft) {
  const container = document.getElementById('cl-query-saved-images');
  if (!container || !checklist) return;
  const checklistRecordId = String(checklist.id || '');
  const checklistNumber = String(checklist.checklist_no || '');
  const query = new URLSearchParams();
  if (checklistRecordId) query.set('checklistRecordId', checklistRecordId);
  if (checklistNumber) query.set('checklistNumber', checklistNumber);
  container.innerHTML = '<div class="query-saved-images-heading">Saved query images</div><p class="query-saved-images-empty">Loading saved images…</p>';
  const documents = await api(`/api/query-documents?${query.toString()}`);
  // Avoid painting a response into a different checklist after rapid navigation.
  if (document.getElementById('cl-query-saved-images') !== container) return;
  if (!Array.isArray(documents) || documents.length === 0) {
    container.innerHTML = '<div class="query-saved-images-heading">Saved query images</div><p class="query-saved-images-empty">No saved images for this checklist yet.</p>';
    return;
  }
  container.innerHTML = `
    <div class="query-saved-images-heading">Saved query images (${documents.length})</div>
    <div class="query-saved-images-grid">
      ${documents.map(doc => `
        <div class="query-saved-image-card">
          <button type="button" class="query-saved-image-delete" aria-label="Delete ${esc(doc.original_filename || 'saved image')}" title="Delete image" onclick="deleteChecklistQueryImage('${esc(doc.id)}', this)">×</button>
          <a class="query-saved-image-open" href="${esc(doc.view_url || '')}" target="_blank" rel="noopener noreferrer" title="Open ${esc(doc.original_filename || 'saved image')}">
            <img src="${esc(doc.view_url || '')}" alt="${esc(doc.original_filename || 'Saved query image')}" loading="lazy">
            <span class="query-saved-image-name">${esc(doc.original_filename || 'Saved image')}</span>
            <span class="query-saved-image-meta">${esc(formatFileSize(doc.final_size_bytes || 0))}${doc.uploaded_at ? ` · ${esc(new Date(doc.uploaded_at).toLocaleDateString())}` : ''}</span>
          </a>
        </div>
      `).join('')}
    </div>`;
}


async function deleteChecklistQueryImage(documentId, button) {
  if (!documentId || button?.disabled) return;
  if (!window.confirm('Delete this saved image? This cannot be undone.')) return;
  const originalText = button?.textContent || '×';
  if (button) { button.disabled = true; button.textContent = '…'; }
  try {
    await api(`/api/query-documents/${encodeURIComponent(documentId)}/delete`, { method: 'DELETE' });
    toast('Saved image deleted.');
    await loadChecklistQueryImageThumbnails(state.checklistDraft);
  } catch (error) {
    toast(`Unable to delete image: ${error.message}`, true);
    if (button) { button.disabled = false; button.textContent = originalText; }
  }
}

async function extractChecklistQueryWithGemini() {
  const button = document.getElementById('cl-query-extract-btn');
  const status = document.getElementById('cl-query-ocr-status');
  const checklist = state.checklistDraft;
  if (!checklist?.id && !checklist?.checklist_no) {
    const message = 'Save this checklist before extracting query details.';
    if (status) status.textContent = message;
    toast(message, true);
    return;
  }
  if (button?.disabled) return;
  button.disabled = true;
  button.textContent = 'Extracting…';
  if (status) status.textContent = 'Loading saved query images…';
  try {
    const params = new URLSearchParams();
    if (checklist.id) params.set('checklistRecordId', String(checklist.id));
    if (checklist.checklist_no) params.set('checklistNumber', String(checklist.checklist_no));
    const documents = await api(`/api/query-documents?${params.toString()}`);
    if (!Array.isArray(documents) || documents.length === 0) {
      const message = 'Please save at least one query image before extracting details.';
      if (status) status.textContent = message;
      toast(message, true);
      return;
    }
    const initialFieldValues = {};
    ['query_date','bill_invoice_reference','amount','party_name','query_text'].forEach(name => {
      const field = document.querySelector(`.query-fields-panel [name="${name}"]`);
      initialFieldValues[name] = field ? field.value : '';
    });
    if (status) status.textContent = `Extracting from ${documents.length} saved image(s) with the configured OCR engine…`;
    const results = [];
    for (let index = 0; index < documents.length; index++) {
      const doc = documents[index];
      if (status) status.textContent = `Extracting saved image ${index + 1} of ${documents.length}…`;
      if (!doc.view_url) throw new Error(`Saved image ${doc.original_filename || index + 1} has no file reference.`);
      const response = await fetch(doc.view_url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Could not access saved image ${doc.original_filename || index + 1} (HTTP ${response.status}).`);
      const blob = await response.blob();
      if (!blob.size) throw new Error(`Saved image ${doc.original_filename || index + 1} is empty.`);
      const mimeType = blob.type || ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[String(doc.image_format || '').toLowerCase()] || '');
      if (!['image/jpeg','image/png','image/webp'].includes(mimeType)) throw new Error(`Saved image ${doc.original_filename || index + 1} has an unsupported image type.`);
      const imageData = await fileToDataUrl(new File([blob], doc.original_filename || 'saved-query-image', {type:mimeType}));
      results.push(await api('/api/query/ocr-extract', {
        method: 'POST',
        body: JSON.stringify({ mimeType, imageData, checklistNumber: checklist.checklist_no || '' })
      }));
    }
    const fieldKeys = ['query_date','bill_invoice_reference','amount','party_name'];
    const merged = {};
    fieldKeys.forEach(key => {
      merged[key] = results.map(result => result.fields?.[key]).find(value => value !== null && value !== undefined && String(value).trim()) || '';
    });
    const texts = results.map(result => String(result.fields?.query_text || result.text || '').trim()).filter(Boolean);
    merged.query_text = [...new Set(texts)].join('\n\n');
    let populated = 0;
    Object.entries(merged).forEach(([name, value]) => {
      const field = document.querySelector(`.query-fields-panel [name="${name}"]`);
      if (!field || field.value !== initialFieldValues[name] || value === null || value === undefined || !String(value).trim()) return;
      // Don't overwrite values already entered by the user before extraction.
      if (String(initialFieldValues[name] || '').trim()) return;
      field.value = String(value);
      field.dataset.aiPopulated = 'true';
      field.classList.add('ai-populated-field');
      populated++;
    });
    const translationWarning = results.map(result => result.translationWarning).filter(Boolean).join(' ');
    const providers = [...new Set(results.map(result => result.provider).filter(Boolean))].join(', ');
    const message = `Extraction complete from ${documents.length} saved image(s)${providers ? ` using ${providers}` : ''}. ${populated} field(s) populated; review before saving.${translationWarning ? ` ${translationWarning}` : ''}`;
    if (status) status.textContent = message;
    toast(translationWarning ? `OCR completed; translation needs review: ${translationWarning}` : message, !!translationWarning);
  } catch (error) {
    if (status) status.textContent = `Extraction failed: ${error.message}`;
    toast(`OCR processing failed: ${error.message}`, true);
  } finally {
    if (button) { button.disabled = false; button.textContent = '✦ Extract Details with AI'; }
  }
}

function formatFileSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function saveChecklistQueryDocument() {
  const input = document.getElementById('cl-query-image');
  const button = document.getElementById('cl-query-save-document-btn');
  const status = document.getElementById('cl-query-ocr-status');
  const file = input?.files?.[0];
  if (!file) {
    if (status) status.textContent = 'Choose a JPG, PNG or WEBP image before saving.';
    toast('Choose an image before saving.', true);
    return;
  }
  const allowed = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp']
  };
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowed[file.type] || !allowed[file.type].includes(extension)) {
    if (status) status.textContent = 'Unsupported image. Choose JPG, JPEG, PNG or WEBP only.';
    toast('Only JPG, JPEG, PNG and WEBP images are allowed.', true);
    input.value = '';
    return;
  }
  if (file.size > 7 * 1024 * 1024) {
    if (status) status.textContent = 'Image must be 7 MB or smaller.';
    toast('Image must be 7 MB or smaller.', true);
    return;
  }
  if (button?.disabled) return;
  const aiButton = document.getElementById('cl-query-extract-btn');
  button.disabled = true;
  button.textContent = 'Saving…';
  if (status) status.textContent = 'Validating, optimizing and saving the image securely…';
  try {
    const imageData = await fileToDataUrl(file);
    const fieldValue = name => document.querySelector(`.query-fields-panel [name="${name}"]`)?.value?.trim() || '';
    const response = await api('/api/query-documents', {
      method: 'POST',
      body: JSON.stringify({
        mimeType: file.type,
        originalName: file.name,
        imageData,
        checklistRecordId: state.checklistDraft?.id || '',
        checklistNumber: state.checklistDraft?.checklist_no || '',
        fields: {
          form2_number: fieldValue('form2_number'),
          query_date: fieldValue('query_date'),
          bill_invoice_reference: fieldValue('bill_invoice_reference'),
          amount: fieldValue('amount'),
          party_name: fieldValue('party_name'),
          query_text: fieldValue('query_text')
        }
      })
    });
    const d = response.document || {};
    const savedBytes = Number(d.final_size_bytes || 0);
    const originalBytes = Number(d.original_size_bytes || file.size);
    const saved = Math.max(0, Number(d.space_saved_bytes || 0));
    const savedPct = originalBytes ? Math.round(saved / originalBytes * 100) : 0;
    const link = d.view_url ? ` <a href="${esc(d.view_url)}" target="_blank" rel="noopener">View saved image</a>` : '';
    const message = `Image saved successfully. Original: ${formatFileSize(originalBytes)}; saved: ${formatFileSize(savedBytes)}; space saved: ${formatFileSize(saved)} (${savedPct}%).`;
    if (status) status.innerHTML = `${esc(message)}${link}`;
    toast('Document saved successfully.');
    await loadChecklistQueryImageThumbnails(state.checklistDraft);
  } catch (error) {
    if (status) status.textContent = `Save failed: ${error.message}`;
    toast(`Unable to save document: ${error.message}`, true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Save Document';
    }
  }
}

function calculateNet(data) {
  const gross = Number(data.register?.bill_amount ?? data.amount ?? 0) || 0;
  const deductions = (data.deductions || []).reduce(
    (total, item) => total + Math.max(0, Number(item.amount || 0) || 0),
    0
  );
  return Math.max(gross - deductions, 0);
}

function checklistGrossAmount(data) {
  return Math.max(0, Number(data?.register?.bill_amount ?? data?.amount ?? 0) || 0);
}

function roundDeduction(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function recalculateChecklistDeduction(index, editedField) {
  const data = state.checklistDraft;
  if (!data || !Array.isArray(data.deductions)) return;
  const deduction = data.deductions[index];
  if (!deduction) return;
  const gross = checklistGrossAmount(data);
  const rateInput = document.querySelector(`[data-ded-rate="${index}"]`);
  const amountInput = document.querySelector(`[data-ded-amount="${index}"]`);
  let rate = Math.max(0, Number(rateInput?.value || 0) || 0);
  let amount = Math.max(0, Number(amountInput?.value || 0) || 0);

  if (editedField === 'rate') {
    amount = roundDeduction(gross * rate / 100);
  } else if (editedField === 'amount') {
    rate = gross > 0 ? roundDeduction(amount / gross * 100) : 0;
  }
  deduction.rate = rateInput?.value === '' && editedField === 'rate' ? '' : String(roundDeduction(rate));
  deduction.amount = amountInput?.value === '' && editedField === 'amount' ? '' : roundDeduction(amount);
  if (rateInput) rateInput.value = deduction.rate;
  if (amountInput) amountInput.value = deduction.amount === '' ? '' : String(deduction.amount);
  const net = document.getElementById('clNet');
  if (net) net.textContent = `₹ ${money(calculateNet(data))}`;
  data.net_eligible = calculateNet(data);
  validateChecklistPaymentPassed();
}



function validateChecklistPaymentPassed() {
  const data = state.checklistDraft;
  const input = document.getElementById('clPaymentPassed');
  const error = document.getElementById('clPaymentPassedError');
  if (!data || !input || input.disabled) { if (error) error.textContent = ''; return true; }
  const raw = input.value.trim();
  const value = raw === '' ? 0 : Number(raw);
  const limit = Math.max(0, Number(calculateNet(data)) || 0);

  // Immediately clear an over-limit value so the user can enter a valid amount.
  if (Number.isFinite(value) && value > limit + 0.000001) {
    input.value = '';
    data.result_details = data.result_details || {};
    data.result_details.payment_passed = '';
    if (error) error.textContent = `Amount exceeded the NET ELIGIBLE limit of ₹${money(limit)} and was cleared. Enter a correct amount.`;
    input.setCustomValidity('');
    return true;
  }

  const invalid = !Number.isFinite(value) || value < 0;
  if (error) error.textContent = invalid ? 'Enter a valid non-negative Payment Passed amount.' : '';
  input.setCustomValidity(invalid ? (error?.textContent || 'Invalid Payment Passed amount.') : '');
  if (!invalid) {
    data.result_details = data.result_details || {};
    data.result_details.payment_passed = raw === '' ? '' : value;
  }
  return !invalid;
}

/* =========================================================
   25. CHECKLIST SAVE / NAVIGATION
   ========================================================= */

function setChecklistAmountApproved(value) {
  const data = state.checklistDraft;
  if (!data) return;
  if (value === 'Y' && checklistHasNoAnswer(data)) { toast('Amount cannot be approved while any C. Checks item is No.', true); return; }
  data.result_details = data.result_details || {};
  data.result_details.amount_approved = value;
  clearChecklistQueriesWhenFullyApproved(data);
  if (value === 'N') {
    // A disabled payment field must not retain or submit a stale amount.
    data.result_details.payment_passed = '';
    if (!data.query_form) data.query_form = {};
  }
  data.result = value === 'N' ? 'Query' : 'Clear';
  checklistDetailView($('#content'), data);
}

async function switchChecklistTab(tab) {
  if (!state.checklistDraft || tab === state.checklistTab) return;

  // Finalized checklists are read-only. Allow section navigation without
  // sending PATCH requests that the server correctly rejects.
  if (state.checklistDraft.status === 'Final') {
    state.checklistTab = tab;
    checklistDetailView($('#content'), state.checklistDraft);
    return;
  }

  // For drafts, save the current section in the background while allowing
  // immediate navigation.
  const savePromise = saveChecklistTab(false);
  state.checklistTab = tab;
  checklistDetailView($('#content'), state.checklistDraft);

  try {
    await savePromise;
  } catch (error) {
    toast('Section changed, but saving failed. Please click Save draft.', true);
    console.error('Checklist background save failed:', error);
  }
}


async function saveChecklistTab(
  showToast = true
) {
  const data =
    state.checklistDraft;

  if (!data) return;

  // The server rejects edits to finalized checklists. Avoid a doomed PATCH
  // request and tell the user why manual saving is unavailable.
  if (state.checklistTab === 'F' && !validateChecklistPaymentPassed()) {
    if (showToast) toast(document.getElementById('clPaymentPassedError')?.textContent || 'Payment Passed exceeds NET ELIGIBLE.', true);
    return;
  }

  if (data.status === 'Final') {
    if (showToast) {
      toast('This checklist is finalized and cannot be edited. Reopen it first if changes are required.', true);
    }
    return;
  }


  /* -------------------------------------------------------
     TAB A
     ------------------------------------------------------- */

  if (state.checklistTab === 'A') {
    const formData =
      new FormData($('#clForm'));

    const registerEntries = Object.fromEntries(formData.entries());
    data.register = {
      ...data.register,
      ...registerEntries
    };

    data.party =
      data.register.party;

    data.work =
      data.register.nature_work;

    data.amount =
      Number(
        data.register.bill_amount || 0
      );

    data.audit_date =
      data.register.audit_date;

    data.file_received_date =
      data.register.file_received_date;
  }


  /* -------------------------------------------------------
     TAB B
     ------------------------------------------------------- */

  else if (
    state.checklistTab === 'B'
  ) {
    const formData =
      new FormData($('#clForm'));

    data.file_details = {
      ...data.file_details,
      ...Object.fromEntries(
        formData.entries()
      )
    };
  }


  /* -------------------------------------------------------
     TAB C
     ------------------------------------------------------- */

  else if (
    state.checklistTab === 'C'
  ) {
    data.checks =
      data.checks.map(
        (check, index) => ({
          ...check,

          status:
            $(
              `[data-check-status="${index}"].selected`
            )?.dataset.statusValue || check.status || '',

          remark:
            $(
              `[data-check-remark="${index}"]`
            )?.value || ''
        })
      );
  }


  /* -------------------------------------------------------
     TAB G — QUERIES FORM
     ------------------------------------------------------- */

  else if (state.checklistTab === 'G') {
    const form = $('.query-fields-panel');
    if (!form) {
      // During background autosave/navigation, Section G may not be mounted
      // (for example, after switching tabs). Do not block the save merely
      // because the query panel is absent. Finalization performs strict
      // query-form validation separately.
      if (showToast && checklistNeedsQueries(data)) {
        throw new Error('Queries Form is required because a check is marked No.');
      }
    } else {
      // clQueryForm is a DIV container, not a <form>. Serialize its named
      // controls directly instead of passing the DIV to FormData().
      const queryValues = {};
      form.querySelectorAll('input[name], textarea[name], select[name]').forEach((field) => {
        if (field.disabled) return;
        if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) return;
        queryValues[field.name] = field.value;
      });
      data.query_form = {
        ...(data.query_form || {}),
        ...queryValues
      };
      // Query Sheet No. is generated once from the checklist number and then reused.
      data.query_form.form2_number = String(
        data.query_form.form2_number || data.result_details?.query_sheet_no || `${data.checklist_no || 'CL'}-Q1`
      );
      data.query_form.amount = String(data.query_form.amount ?? '');
      // F. Result and G. Queries Form share one unified query text.
      const unifiedQueryText = String(data.query_form.query_text ?? data.result_details?.remarks ?? '');
      data.query_form.query_text = unifiedQueryText;
      data.result_details = {
        ...(data.result_details || {}),
        remarks: unifiedQueryText,
        query_sheet_no: data.query_form.form2_number
      };
    }
  }


  /* -------------------------------------------------------
     TAB D
     ------------------------------------------------------- */

  else if (
    state.checklistTab === 'D'
  ) {
    data.deductions =
      data.deductions.map(
        (deduction, index) => ({
          ...deduction,

          rate:
            $(
              `[data-ded-rate="${index}"]`
            )?.value || '',

          amount:
            Number(
              $(
                `[data-ded-amount="${index}"]`
              )?.value || 0
            ),

          remark:
            $(
              `[data-ded-remark="${index}"]`
            )?.value || ''
        })
      );
  }


  /* -------------------------------------------------------
     TAB E
     ------------------------------------------------------- */

  else if (
    state.checklistTab === 'E'
  ) {
    data.books.accounts =
      data.books.accounts.map(
        (item, index) => ({
          ...item,

          checked:
            !!$(
              `[data-book-account="${index}"]`
            )?.checked
        })
      );

    data.books.documents =
      data.books.documents.map(
        (item, index) => ({
          ...item,

          checked:
            !!$(
              `[data-book-doc="${index}"]`
            )?.checked
        })
      );
  }


  /* -------------------------------------------------------
     TAB F
     ------------------------------------------------------- */

  else if (
    state.checklistTab === 'F'
  ) {
    const formData =
      new FormData($('#clForm'));

    data.result_details = {
      ...data.result_details,
      ...Object.fromEntries(formData.entries())
    };
    data.result_details.amount_approved =
      String(data.result_details.amount_approved || '').toUpperCase();
    // Keep G. Queries Form aligned with the same query text.
    data.query_form = {
      ...(data.query_form || {}),
      query_text: String(data.result_details.remarks ?? '')
    };
    // Preserve/assign the linked Query Sheet No. consistently across saves.
    const savedQuerySheetNo = ensureChecklistQuerySheetNumber(data);
    if (savedQuerySheetNo) data.result_details.query_sheet_no = savedQuerySheetNo;
    if (data.result_details.amount_approved !== 'Y') {
      data.result_details.payment_passed = '';
    }
    data.result =
      data.result_details.amount_approved === 'N'
        ? 'Query'
        : data.result_details.amount_approved === 'Y'
          ? 'Clear'
          : '-';
  }


  data.net_eligible =
    calculateNet(data);


  await api(
    '/api/checklist-records/' +
    data.id,
    {
      method: 'PATCH',

      body: JSON.stringify({
        register:
          data.register,

        file_details:
          data.file_details,

        checks:
          data.checks,

        deductions:
          data.deductions,

        books:
          data.books,

        result_details:
          data.result_details,

        query_form:
          data.query_form,

        result:
          data.result,

        net_eligible:
          data.net_eligible,

        party:
          data.party,

        work:
          data.work,

        amount:
          data.amount,

        audit_date:
          data.audit_date,

        file_received_date:
          data.file_received_date
      })
    }
  );

  if (showToast) {
    toast('Checklist saved');
  }
}


/* =========================================================
   26. CHECKLIST FINALIZE / DELETE / DOWNLOAD
   ========================================================= */

async function finalizeChecklist(id) {
  const draft = state.checklistDraft;
  if (draft && state.checklistTab === 'G' && $('.query-fields-panel')) {
    const queryRoot = $('.query-fields-panel');
    const queryValues = {};
    queryRoot.querySelectorAll('input[name], textarea[name], select[name]').forEach((field) => {
      queryValues[field.name] = field.value;
    });
    draft.query_form = {
      ...(draft.query_form || {}),
      ...queryValues,
      form2_number: queryValues.form2_number || draft.result_details?.query_sheet_no || `${draft.checklist_no || 'CL'}-Q1`
    };
    const unifiedQueryText = String(draft.query_form.query_text ?? draft.result_details?.remarks ?? '');
    draft.query_form.query_text = unifiedQueryText;
    draft.result_details = {
      ...(draft.result_details || {}),
      remarks: unifiedQueryText,
      query_sheet_no: draft.query_form.form2_number
    };
  }
  if (draft && checklistNeedsQueries(draft)) {
    // Capture current Section C values before validating the query requirement.
    if (state.checklistTab === 'C') {
      draft.checks = (draft.checks || []).map((check, index) => ({
        ...check,
        status: $(`[data-check-status="${index}"].selected`)?.dataset.statusValue || check.status || '',
        remark: $(`[data-check-remark="${index}"]`)?.value || check.remark || ''
      }));
    }
    if (!checklistQueryFormValid(draft.query_form)) {
      toast('Complete Section G. Queries Form before finalizing: query number, date, bill reference, amount, party and query details are required.', true);
      state.checklistTab = 'G';
      checklistDetailView($('#content'), draft);
      return;
    }
  }

  if (
    !confirm(
      'Finalize this checklist? After finalization it will be pushed to the Audit Register.'
    )
  ) {
    return;
  }

  try {
    await saveChecklistTab(false);

    const checklist =
      await api(
        '/api/checklist-records/' +
        id +
        '/finalize',
        {
          method: 'POST'
        }
      );

    state.checklistDraft =
      checklist;

    toast(
      'Checklist finalized and sent to Audit Register'
    );

    await renderView();

  } catch (error) {
    toast(error.message, true);
  }
}


async function deleteChecklist(id) {
  if (
    !confirm(
      'Delete this draft checklist?'
    )
  ) {
    return;
  }

  try {
    await api(
      '/api/checklist-records/' +
      id,
      {
        method: 'DELETE'
      }
    );

    toast('Checklist deleted');

    go('checklists');

  } catch (error) {
    toast(error.message, true);
  }
}


function downloadChecklistDoc(id) {
  window.open(
    '/api/checklist-records/' +
    id +
    '/doc',
    '_blank'
  );
}


/* =========================================================
   27. AUDIT TRAIL / LOGS
   ========================================================= */

async function logs(content) {
  const logRows =
    await api('/api/audit-logs');

  content.innerHTML = `
    <div class="title">
      Audit Trail / Change History
    </div>

    <div class="muted">
      Latest 500 logged actions.
    </div>


    <div
      class="table-wrap"
      style="margin-top:12px"
    >

      <table class="table">

        <thead>
          <tr>
            <th>Date/Time</th>
            <th>User</th>
            <th>Entity</th>
            <th>Record</th>
            <th>Action</th>
            <th>Old</th>
            <th>New</th>
          </tr>
        </thead>


        <tbody>

          ${logRows.map(row => `
            <tr>

              <td>
                ${new Date(
                  row.timestamp
                ).toLocaleString()}
              </td>

              <td>
                ${esc(
                  state.users.find(
                    user =>
                      user.id === row.user_id
                  )?.name ||
                  row.user_id ||
                  ''
                )}
              </td>

              <td>
                ${esc(row.entity)}
              </td>

              <td>
                ${esc(row.record_id)}
              </td>

              <td>
                ${esc(row.action)}
              </td>

              <td>
                <pre
                  style="
                    white-space:pre-wrap
                  "
                >${esc(
                  JSON.stringify(
                    row.old_value
                  )
                )}</pre>
              </td>

              <td>
                <pre
                  style="
                    white-space:pre-wrap
                  "
                >${esc(
                  JSON.stringify(
                    row.new_value
                  )
                )}</pre>
              </td>

            </tr>
          `).join('')}

        </tbody>

      </table>

    </div>
  `;
}


document.addEventListener('change', event => {
  if (event.target?.id === 'cl-query-image') {
    const file = event.target.files?.[0];
    const preview = document.getElementById('cl-query-image-preview');
    const status = document.getElementById('cl-query-ocr-status');
    if (!file || !preview) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const validImage = (file.type === 'image/jpeg' && ['.jpg','.jpeg'].includes(ext)) ||
      (file.type === 'image/png' && ext === '.png') ||
      (file.type === 'image/webp' && ext === '.webp');
    if (!validImage) {
      event.target.value = '';
      preview.innerHTML = '<span class="query-image-placeholder">Only JPG, JPEG, PNG and WEBP images are supported.</span>';
      if (status) status.textContent = 'Unsupported file type. Select a JPG, PNG or WEBP image.';
      toast('Only JPG, JPEG, PNG and WEBP images are allowed.', true);
      return;
    }
    if (file.size > 7 * 1024 * 1024) {
      event.target.value = '';
      preview.innerHTML = '<span class="query-image-placeholder">Image must be 7 MB or smaller.</span>';
      if (status) status.textContent = 'Image must be 7 MB or smaller.';
      toast('Image must be 7 MB or smaller.', true);
      return;
    }
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => { preview.innerHTML = `<img alt="Selected query document preview" src="${reader.result}">`; };
      reader.readAsDataURL(file);
    } else {
      preview.innerHTML = `<span class="query-image-placeholder">Unsupported file selected<br><b>${esc(file.name)}</b></span>`;
    }
    if (status) status.textContent = '';
  }
});

/* =========================================================
   28. CHECKLIST EVENT HANDLERS
   ========================================================= */
document.addEventListener('input', event => {
  const rate = event.target?.dataset?.dedRate;
  const amount = event.target?.dataset?.dedAmount;
  if (rate !== undefined) recalculateChecklistDeduction(Number(rate), 'rate');
  else if (amount !== undefined) recalculateChecklistDeduction(Number(amount), 'amount');
});


document.addEventListener(
  'change',
  event => {
    if (
      event.target.matches(
        '#checklistForm input[type=radio]'
      )
    ) {
      updateChecklistSummary();
    }
  }
);


/* =========================================================
   29. LEGACY / BASIC CHECKLIST SUMMARY
   ========================================================= */

function setChecklistCheckStatus(index, value) {
  if (!state.checklistDraft || !state.checklistDraft.checks) return;
  const check = state.checklistDraft.checks[index];
  if (!check) return;
  check.status = value;
  clearChecklistQueriesWhenFullyApproved(state.checklistDraft);
  const row = document.querySelector(`[data-check-status="${index}"]`)?.parentElement;
  if (row) {
    row.querySelectorAll('.check-answer').forEach(button => button.classList.remove('selected', 'yes', 'no', 'na'));
    const selected = row.querySelector(`[data-status-value="${value}"]`);
    if (selected) selected.classList.add('selected', value === 'Y' ? 'yes' : value === 'N' ? 'no' : 'na');
  }
  // Refresh tabs immediately so Section G appears/disappears as the No answers change.
  const currentTab = state.checklistTab;
  if (currentTab === 'C') {
    checklistDetailView($('#content'), state.checklistDraft);
  }
  saveChecklistTab(false).catch(error => {
    console.error('Checklist autosave failed:', error);
    toast('Could not save check response. Please use Save draft.', true);
  });
}

function checklistDataForForm() {
  const output = [];

  $$('#checklistForm [data-check-item]')
    .forEach(element => {

      const key =
        element.dataset.checkItem;

      let item =
        output.find(
          row => row.key === key
        );

      if (!item) {
        const parts =
          key.split('::');

        item = {
          key,
          category: parts[0],
          item:
            parts
              .slice(1)
              .join('::'),
          status: '',
          remark: ''
        };

        output.push(item);
      }

      if (
        element.type === 'radio' &&
        element.checked
      ) {
        item.status =
          element.value;
      }

      if (
        element.dataset.remark === 'true'
      ) {
        item.remark =
          element.value;
      }
    });

  return output;
}


function updateChecklistSummary() {
  const element =
    $('#checklistSummary');

  if (!element) return;

  const values =
    checklistDataForForm();

  element.textContent =
    `YES: ${
      values.filter(
        x => x.status === 'YES'
      ).length
    } • NO: ${
      values.filter(
        x => x.status === 'NO'
      ).length
    } • N/A: ${
      values.filter(
        x => x.status === 'N/A'
      ).length
    } • Pending: ${
      values.filter(
        x => !x.status
      ).length
    }`;
}


/* =========================================================
   30. APPLICATION START
   ========================================================= */

boot().catch(error => {
  console.error(error);

  renderLogin();
});
