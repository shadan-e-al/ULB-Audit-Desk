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

  view: 'dashboard',
  lang: 'en',

  districts: [],
  ulbs: [],
  audits: [],
  form2: [],
  users: [],
  logs: [],

  ulb: '',
  fy: '2026-27',
  month: new Date().getMonth() + 1,

  // Checklist state
  checklistId: null,
  checklistTab: 'A',
  checklistDraft: null
};


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
  const query = new URLSearchParams({
    ulb: state.ulb,
    fy: state.fy,
    month: state.month
  });

  state.audits = await api(
    '/api/audits?' + query
  );

  state.form2 = await api(
    '/api/form2?ulb=' +
    encodeURIComponent(state.ulb)
  );
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
  const icons = { dashboard: '▦', register: '▤', queries: '▧', reports: '▥', checklists: '☑', attendance: '◷', users: '♙', ulbs: '⌂', logs: '◴' };
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
            'checklists',
            t[state.lang].checklists
          )}

          ${nav(
            'attendance',
            t[state.lang].attendance
          )}

          ${
            state.user.role === 'admin'
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
              `
              : ''
          }

        </nav>
        <div class="sidebar-profile">
          <div class="sidebar-avatar">${esc((state.user.name || 'A').trim().charAt(0).toUpperCase())}</div>
          <div class="sidebar-profile-copy"><strong>${esc(state.user.name)}</strong><span>${esc(state.user.role)}</span></div>
          <span class="profile-status" title="Signed in"></span>
        </div>
      </aside>


      <main class="main">

        <header class="top">

          <div class="top-left">
            <button class="btn secondary mobile-menu" aria-label="Toggle navigation" onclick="$('#side').classList.toggle('open')">☰</button>
            <div class="top-breadcrumb"><span>ULB AUDIT DESK</span><strong>${esc((t[state.lang] && t[state.lang][state.view]) || state.view || 'Workspace')}</strong></div>
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
  state.view=v;
  $('#side').classList.remove('open');
  renderApp();
}


async function renderView() {
  const content = $('#content');

  if (!content) return;

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

  if (state.view === 'attendance') {
    return attendance(content);
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

    await changeContext();
  }
}


async function changeContext() {
  state.ulb = $('#ulb').value;
  state.fy = $('#fy').value;
  state.month = Number($('#month').value);

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
          <button class="btn register-add-btn" onclick="auditModal()">
            <span aria-hidden="true">＋</span> Add row (no checklist)
          </button>
          <button class="btn secondary" onclick="downloadAuditCsv()">
            <span aria-hidden="true">⇩</span> Export CSV
          </button>
        </div>
      </header>

      <div class="register-filters">
        ${contextBar()}
      </div>

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
                        <button class="btn secondary sm" onclick='editAudit(${JSON.stringify(row)})'>Edit</button>
                        <button class="btn secondary sm" onclick='deleteAudit(${JSON.stringify(row.id)})'>Delete</button>
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
    <h2>
      ${row.id ? 'Edit' : 'New'}
      Audit Register Row
    </h2>

    <form id="auditForm">

      <div class="form-grid three">

        ${input(
          'checklist_no',
          'Checklist No.',
          row.checklist_no
        )}

        ${input(
          'voucher_no',
          'Voucher / Bill No.',
          row.voucher_no,
          true
        )}

        ${input(
          'voucher_date',
          'Voucher Date',
          row.voucher_date,
          'date'
        )}

        ${input(
          'file_received_date',
          'File Received Date',
          row.file_received_date,
          'date'
        )}

        ${input(
          'audit_date',
          'Audit Date',
          row.audit_date,
          'date'
        )}

        ${input(
          'scheme_fund',
          'Name of Scheme / Fund',
          row.scheme_fund,
          true
        )}

        ${input(
          'nature_work',
          'Nature of Work',
          row.nature_work,
          true
        )}

        ${input(
          'party',
          'Name of Contractor / Vendor',
          row.party,
          true
        )}

        ${input(
          'amount',
          'Amount',
          row.amount,
          'number'
        )}

        ${input(
          'proposed_payment',
          'Proposed for Payment (Net Amt.)',
          row.proposed_payment,
          'number'
        )}

        ${select(
          'payment_approved',
          'Payment Approved',
          row.payment_approved || 'N',
          ['Y', 'N']
        )}

        ${select(
          'audit_status',
          'Audit Status',
          row.audit_status || 'Pending',
          ['Pending', 'Audited']
        )}

        ${input(
          'payment_passed',
          'Payment Passed (Net Amt.)',
          row.payment_passed,
          'number'
        )}

        ${select(
          'cheque_issued',
          'Cheque Issued',
          row.cheque_issued || 'N',
          ['Y', 'N']
        )}

        ${input(
          'cheque_no',
          'Cheque No.',
          row.cheque_no
        )}

        ${input(
          'cheque_date',
          'Cheque Date',
          row.cheque_date,
          'date'
        )}

        ${input(
          'payment_date',
          'Payment Date',
          row.payment_date,
          'date'
        )}

        ${input(
          'payment_mode',
          'Payment Mode',
          row.payment_mode
        )}

        ${input(
          'payment_reference',
          'Payment Reference',
          row.payment_reference
        )}

        ${input(
          'backoffice_update_date',
          'Back Office Update Date',
          row.backoffice_update_date,
          'date'
        )}

        ${input(
          'form2_number',
          'Form-2 Number',
          row.form2_number
        )}

        <div
          class="field"
          style="grid-column:1/-1"
        >
          <label>
            Query / Remarks
          </label>

          <textarea name="query_text">
            ${esc(
              row.query_text ||
              row.remarks ||
              ''
            )}
          </textarea>
        </div>

      </div>

      <div id="sameWarn"></div>

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

  $('#auditForm').onsubmit = async (event) => {
    event.preventDefault();

    const formData =
      new FormData(event.target);

    const data =
      Object.fromEntries(formData.entries());

    data.ulb_id = state.ulb;
    data.financial_year = state.fy;
    data.month = state.month;

    for (const key of [
      'amount',
      'proposed_payment',
      'payment_passed'
    ]) {
      data[key] = Number(data[key] || 0);
    }

    if (data.payment_approved === 'N') {
      data.cheque_issued = 'N';
    }

    try {
      await api(
        row.id
          ? '/api/audits/' + row.id
          : '/api/audits',
        {
          method: row.id ? 'PATCH' : 'POST',
          body: JSON.stringify(data)
        }
      );

      closeModal();

      await loadRows();

      register($('#content'));

      toast('Saved');

    } catch (error) {
      toast(error.message, true);
    }
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

      ${contextBar()}

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
                  </tr>`;
              }).join('') || `
                <tr><td colspan="9" class="empty f2-empty">
                  <div class="f2-empty-icon">▤</div>
                  <strong>No query sheets yet</strong>
                  <p>Add a Form-2 query sheet to see it listed here.</p>
                </td></tr>`
              }
              <tr id="f2-no-results" hidden><td colspan="9" class="empty">No matching query sheets found.</td></tr>
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

      <div class="d-reports-context d-reports-period-bar">
        <div class="d-reports-context-icon">▦</div>
        <div class="d-reports-context-copy">
          <strong>Reporting period</strong>
          <span>All seven annexures use the selected ULB and month.</span>
        </div>
        <div class="d-reports-period-controls">
          <label>ULB
            <select id="ulb" onchange="changeContext()">
              ${(state.ulbs || []).filter(x => x.active).map(x => `<option value="${esc(x.id)}" ${x.id === state.ulb ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
            </select>
          </label>
          <label>Financial year
            <select id="fy" onchange="changeContext()">
              ${['2025-26','2026-27','2027-28'].map(x => `<option value="${x}" ${x === state.fy ? 'selected' : ''}>${x}</option>`).join('')}
            </select>
          </label>
          <label>Month
            <select id="month" onchange="changeContext()">
              ${months.slice(1).map((month, index) => `<option value="${index + 1}" ${Number(state.month) === index + 1 ? 'selected' : ''}>${month}</option>`).join('')}
            </select>
          </label>
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
            <strong>Live data preview</strong>
            <span>Showing records for the selected ULB and reporting period</span>
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


function userModal() {
  modal(`
    <h2>
      Add New Member
    </h2>

    <form id="userForm">

      <div class="form-grid">

        ${input(
          'name',
          'Name',
          '',
          'text',
          true
        )}

        ${input(
          'mobile',
          'Mobile / Username',
          '',
          'text',
          true
        )}

        ${input(
          'password',
          'Temporary Password',
          '',
          'text',
          true
        )}

        ${select(
          'role',
          'Role',
          'user',
          [
            'user',
            'auditor',
            'verifier',
            'district'
          ]
        )}

      </div>


      <div class="actions">

        <button class="btn">
          Create
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

  $('#userForm').onsubmit =
    async event => {
      event.preventDefault();

      const data =
        Object.fromEntries(
          new FormData(event.target)
        );

      try {
        await api(
          '/api/users',
          {
            method: 'POST',
            body: JSON.stringify(data)
          }
        );

        closeModal();

        await users($('#content'));

        toast('User created');

      } catch (error) {
        toast(error.message, true);
      }
    };
}


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

const OFFICIAL_CHECKLISTS = {

  Contractor: {
    title:
      'Checklist for Payment of Contractor',

    checks: [
      'Whether measurement book signed by the Sub-engineer of ULB',
      'Whether measurement book signed by the Assistant-engineer of ULB',
      'Whether measurement book signed by the Executive-engineer of ULB',
      'Please check detailed calculation of MB with SOR. If mistakes found: 1. whether revised claim is less than actual amount, then proceed with revised value. 2. If revised claim is more than actual, return it to concerned engineer.',
      'Received by DC(f) and forwarded to Accounts officer',
      'Prepare Calculation in Prescribed excel sheet',
      'Whether Above/Below quoted in bid is added and deducted from bill amount',
      'Refer Note Sheet',
      'Compare gross amount as approved in Voucher from excel sheet',
      'Gross amount approved by Sub Engineer',
      'Same amount approved by Assistant Engineer',
      'Same amount approved by Executive Engineer',
      'Same Amount forwarded by Commissioner',
      'Deduction'
    ]
  },


  Consultancy: {
    title:
      'Checklist for Payment of Consultancy',

    checks: [
      'Administrative sanction / approval for the consultancy expenditure is available.',
      'Agreement / contract / work order is available with scope and terms of engagement.',
      'Procurement / selection process and approval of the competent authority are available as applicable.',
      'Specified deliverables / services are supported by records or acceptance evidence.',
      'Consultant bill / invoice is supported by the agreement and relevant documents.',
      'Rates / fees paid agree with the approved agreement or sanctioned terms.',
      'Payment is supported by a complete voucher and authorised scrutiny / pay order.',
      'Statutory deductions / recoveries applicable to the payment have been checked.',
      'Payment advice and payment voucher have been prepared from the supporting records.',
      'Any advance / recovery due from the consultant has been adjusted or recorded.'
    ]
  },


  Manpower: {
    title:
      'Checklist for Payment of Manpower / Service Provider',

    checks: [
      'Sanction / approval for engagement of manpower or service is available.',
      'Agreement / work order and approved terms / rates are available.',
      'Selection / procurement process has followed the applicable procedure.',
      'Attendance / deployment / muster records supporting the bill are available.',
      'Number of persons / days / units billed agrees with supporting records.',
      'Rates paid agree with the approved agreement / sanctioned terms.',
      'Statutory deductions and recoveries have been checked before payment.',
      'Bill, voucher and supporting documents bear evidence of due scrutiny.',
      'Payment has been made to the proper person / agency and properly acknowledged.',
      'Payment advice and payment voucher have been prepared in the prescribed manner.'
    ]
  },


  'Store Purchase': {
    title:
      'Checklist for Store Procurement / Purchase Bill',

    checks: [
      'Purchase requirement and sanction are approved by the competent authority.',
      'Specifications and quantity of each article are clearly identified.',
      'Quotation / tender process has followed the applicable procurement procedure.',
      'Tender / quotation documents contain the required specifications and conditions.',
      'Comparative statement and approval of the competent authority / committee are available.',
      'Supplier / contractor eligibility and capacity were considered before acceptance.',
      'Rate accepted is supported by tender / quotation and is reasonable with reference to market conditions.',
      'Written contract / agreement or written understanding as to price is available where required.',
      'Goods received are accepted and quality / specifications conform to the order.',
      'Goods paid for are entered in the relevant stock / inventory register.',
      'Sub-vouchers agree with inventory and subsidiary records.',
      'Supplier payment is made only after acceptance of material and processing of the bill.',
      'Payment voucher and supporting documents are complete and properly authorised.'
    ]
  },


  'Employee Advance': {
    title:
      'Checklist for Employee Advance / Recovery',

    checks: [
      'Advance is supported by sanction of the competent authority.',
      'Purpose and admissibility of the advance are recorded.',
      'Advance has been entered in the prescribed advance / loan register or equivalent record.',
      'Payment has been made to the proper employee and properly acknowledged.',
      'Previous outstanding advance / recovery position has been checked.',
      'Adjustment / settlement of the advance is supported by vouchers and relevant records.',
      'Recoveries due from the employee have been correctly calculated and recorded.',
      'Outstanding advances are reviewed and long-pending balances are followed up.',
      'Accounting classification and supporting journal / payment entries are correct.'
    ]
  },


  'Misc. Expenses': {
    title:
      'Checklist for Miscellaneous Expenses / Contingency',

    checks: [
      'Expenditure is supported by proper sanction of the competent authority.',
      'The expenditure is necessary, permissible and connected with ULB functions.',
      'Original bill / voucher and supporting documents are available.',
      'Payment has been made to the proper person and properly acknowledged.',
      'Rates / charges have been checked for reasonableness.',
      'The expenditure is correctly classified under the relevant account head.',
      'Required recoveries / statutory deductions have been checked.',
      'Vouchers and sub-vouchers have been scrutinised and cancelled / defaced after payment where prescribed.',
      'Payment advice and payment voucher are complete and authorised.',
      'Any recoverable amount / advance has been recorded and followed up.'
    ]
  }

};


const DEFAULT_DEDUCTIONS = [
  'Security Deposit',
  'Performance Deposit',
  'Royalty/ Mining Cess',
  'Income Tax',
  'GST',
  'Labor Welfare Fund',
  'Penalty/ LD',
  'Recovery of Advance',
  'Recovery of Material',
  'under/ over payment in last bill',
  'Difference in Amount as per agreement and total invoice till date'
];


const DEFAULT_BOOKS = [
  'Measurement book- Sign and Stamp on rectified places',
  'Memo and Mode of Payment in measurement book',
  'Cheque issue register',
  'Cash Book',
  'Grant Register',
  'Work Register Entry done or not',
  'Budget Control Register',
  'Time limit for completion of Works'
];


const DEFAULT_DOCS = [
  'Quality Test Report as per Agreement',
  'Work Completion Certificate',
  'Clearance Certificate from Mining Department',
  'Tax Invoice from Contractor',
  'Invoice of Bitumin Bill of Bharat Petroleum/Hindusthan Petroleum with Consumption details in Bill for BT work',
  'Geotagged and Signed Photograph of Work - Before Started, During Work, Complete Photograph',
  'Revised Estimate if not produced then payment as per Estimate'
];


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


function checklistSeedChecks(
  type,
  existing = []
) {
  const map = new Map(
    existing.map(
      item => [item.code, item]
    )
  );

  return OFFICIAL_CHECKLISTS[type].checks
    .map((text, index) => {

      const code =
        type === 'Contractor'
          ? (index < 3 ? `1.${index + 1}` : String(index - 1))
          : String(index + 1);

      return (
        map.get(code) || existing[index] || {
          code,
          text,
          status: '',
          remark: ''
        }
      );
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
      DEFAULT_DEDUCTIONS.map(
        (head, index) => ({
          code: String(index + 1),
          head,
          rate: '',
          amount: '',
          remark: ''
        })
      ),

    books: {
      accounts:
        DEFAULT_BOOKS.map(label => ({
          label,
          checked: false
        })),

      documents:
        DEFAULT_DOCS.map(label => ({
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
    return `
      <form
        id="clForm"
        class="form-grid three"
      >

        ${clField(
          'voucher_no',
          'Voucher No.',
          data.register?.voucher_no
        )}

        ${clField(
          'file_received_date',
          'File Received Date',
          data.register?.file_received_date,
          'date'
        )}

        ${clField(
          'audit_date',
          'Audit Date',
          data.register?.audit_date,
          'date'
        )}

        ${clField(
          'scheme_fund',
          'Name of Scheme / Fund',
          data.register?.scheme_fund
        )}

        ${clField(
          'party',
          'Name of Contractor / Vendor / Employee',
          data.register?.party
        )}

        ${clField(
          'bill_amount',
          'Bill Amount (Gross) ₹',
          data.register?.bill_amount,
          'number'
        )}

        ${clArea(
          'nature_work',
          'Nature of Work',
          data.register?.nature_work
        )}

      </form>
    `;
  }


  /* -------------------------------------------------------
     TAB B — FILE DETAILS
     ------------------------------------------------------- */

  if (state.checklistTab === 'B') {
    const file = data.file_details || {};

    return `
      <form id="clForm" class="form-grid three">
        ${clField('month_fy', 'Month - Financial Year', file.month_fy)}
        ${clField('checklist_date', 'Checklist Date', file.checklist_date, 'date')}
        ${clField('prepared_by', 'Prepared by', file.prepared_by)}
        ${clField('zone_dept_file_no', 'Zone / Dept. / File No.', file.zone_dept_file_no)}
        ${clArea('work_contractor', 'Name of Work & Contractor Name', file.work_contractor)}
        ${clField('head_expenses', 'Head of Expenses', file.head_expenses)}
        ${clField('grant_type', 'Grant Type', file.grant_type)}
        ${clField('estimated_amount', 'Estimated Amount', file.estimated_amount, 'number')}
        ${clField('estimate_prepared_by', 'Estimate Prepared by (Name & Authority)', file.estimate_prepared_by)}
        ${clField('technical_approval_no', 'Technical Approval No.', file.technical_approval_no)}
        ${clField('technical_approval_date', 'Technical Approval Date', file.technical_approval_date, 'date')}
        ${clField('technical_approval_rs', 'Technical Approval Rs.', file.technical_approval_rs, 'number')}
        ${clField('technical_approval_by', 'Technical Approval Approved By (Name & Desig.)', file.technical_approval_by)}
        ${clField('tender_approval_no', 'Tender Inviting Approval No.', file.tender_approval_no)}
        ${clField('tender_approval_date', 'Tender Inviting Approval Date', file.tender_approval_date, 'date')}
        ${clField('tender_approval_rs', 'Tender Inviting Approval Rs.', file.tender_approval_rs, 'number')}
        ${clField('tender_approval_by', 'Tender Inviting Approval Approved By (Name & Desig.)', file.tender_approval_by)}
        ${clSelect('document_verification', 'Document Verification as per NIT', file.document_verification)}
        ${clField('tender_published_date', 'Tender Published in, Dated & Bid Due Date', file.tender_published_date)}
        ${clField('participants', 'No. of Participants', file.participants, 'number')}
        ${clField('tender_committee', 'Tender Committee Approval No. & Date & Value', file.tender_committee)}
        ${clField('headed_by', 'Headed by', file.headed_by)}
        ${clField('financial_approval_no', 'Financial Approval No.', file.financial_approval_no)}
        ${clField('financial_approval_date', 'Financial Approval Date', file.financial_approval_date, 'date')}
        ${clField('financial_approval_rs', 'Financial Approval Rs.', file.financial_approval_rs, 'number')}
        ${clField('financial_approval_by', 'Financial Approval Approved By (Name & Desig.)', file.financial_approval_by)}
        ${clField('reason_selection', 'Reason for Selection', file.reason_selection)}
        ${clField('pan_no', 'PAN No.', file.pan_no)}
        ${clField('tin_gstin_no', 'TIN / GSTIN No.', file.tin_gstin_no)}
        ${clField('sor_percentage', 'Percentage of Above / Below from SOR', file.sor_percentage)}
        ${clField('work_order_no_date_value', 'Work Order No. & Date & Value', file.work_order_no_date_value)}
        ${clField('agreement_no_date_value', 'Agreement No. & Date & Value', file.agreement_no_date_value)}
        ${clSelect('emd_tdr', 'EMD / TDR', file.emd_tdr)}
        ${clField('aps_details', 'Additional Performance Guarantee (APS) Details if Applicable', file.aps_details)}
        ${clField('commencement_as_per_wo', 'Date of Commencement - As per WO', file.commencement_as_per_wo, 'date')}
        ${clField('commencement_actual', 'Date of Commencement - Actual', file.commencement_actual, 'date')}
        ${clField('completion_schedule', 'Date of Work Completion - Schedule', file.completion_schedule, 'date')}
        ${clField('completion_actual', 'Date of Work Completion - Actual', file.completion_actual, 'date')}
        ${clArea('extended_completion_reason', 'Extended Date of Completion & Reason', file.extended_completion_reason, false)}
        ${clField('measurement_book_no_page', 'Measurement Book No & Page No.', file.measurement_book_no_page)}
        ${clField('penal_provision', 'Penal Provision as per Agreement', file.penal_provision)}
        ${clField('fund_availability_letter', 'Availability of Fund as per Letter (No. / Date / Rs.)', file.fund_availability_letter)}
        ${clField('remaining_scheme_balance', 'Remaining Balance in the Scheme', file.remaining_scheme_balance)}
        ${clField('bill_no_type', 'Bill No. & Type', file.bill_no_type)}
        ${clSelect('work_completion_certificate', 'Work Completion Certificate', file.work_completion_certificate)}
        ${clField('quality_test_report_dates', 'Quality Test Report - Date of Casting and Date of Testing', file.quality_test_report_dates)}
        ${clSelect('mining_clearance_certificate', 'Mining Clearance Certificate', file.mining_clearance_certificate)}
        ${clField('previous_bill_no', 'Previous Bill No.', file.previous_bill_no)}
        ${clField('previous_note_sheet_no', 'Previous Note Sheet No.', file.previous_note_sheet_no)}
        ${clField('previous_bill_amount', 'Previous Bill Amount', file.previous_bill_amount, 'number')}
        ${clField('previous_gross_payment', 'Previous Gross Payment', file.previous_gross_payment, 'number')}
        ${clField('previous_deduction', 'Previous Deduction', file.previous_deduction, 'number')}
        ${clField('previous_net_payment', 'Previous Net Payment', file.previous_net_payment, 'number')}
        ${clArea('previous_payment_comment', 'Comment on Previous Payment (if any)', file.previous_payment_comment)}
        ${clField('bill_received_date_from', 'Date of Bill Received and From', file.bill_received_date_from)}
        ${clField('bill_forwarded_date_to', 'Date of Bill Forwarded and To', file.bill_forwarded_date_to)}
        ${clSelect('result', 'Result', file.result, ['Select…', 'Pass', 'Pass with Objection', 'Return', 'Reject'])}
        ${clArea('major_clause_note_sheet', 'Major Clause in Note Sheet', file.major_clause_note_sheet)}
        ${clArea('reason', 'Reason', file.reason)}
      </form>
    `;
  }


  /* -------------------------------------------------------
     TAB C — CHECKS
     ------------------------------------------------------- */

  if (state.checklistTab === 'C') {
    return `
      <div>

        ${(data.checks || [])
          .map(
            (check, index) => `
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
      <div class="table-wrap">

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
                      ${esc(DEFAULT_DEDUCTIONS[index] || deduction.head)}
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

      </div>
    `;
  }


  /* -------------------------------------------------------
     TAB E — BOOKS & DOCUMENTS
     ------------------------------------------------------- */

  if (state.checklistTab === 'E') {
    return `
      <div class="form-grid two">

        <div>

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

                  ${esc(DEFAULT_BOOKS[index] || item.label)}

                </label>
              `
            )
            .join('')}

        </div>


        <div>

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

                  ${esc(DEFAULT_DOCS[index] || item.label)}

                </label>
              `
            )
            .join('')}

        </div>

      </div>
    `;
  }


  /* -------------------------------------------------------
     TAB G — CONDITIONAL QUERIES FORM
     ------------------------------------------------------- */

  if (state.checklistTab === 'G') {
    const query = data.query_form || {};
    const defaultParty = data.register?.party || data.party || data.file_details?.work_contractor || '';
    return `
      <section class="checklist-query-form">
        <div class="query-form-heading">
          <div>
            <div class="eyebrow">FORM-2 · QUERY DETAILS</div>
            <h3>G. Queries Form</h3>
            <p class="muted">Upload a query document, extract details with Google Cloud Vision, then review and correct before saving.</p>
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
              <button type="button" class="btn query-ai-button" id="cl-query-extract-btn" onclick="extractChecklistQueryWithGemini()">✦ Extract Details with AI</button>
              <button type="button" class="btn query-save-document-button" id="cl-query-save-document-btn" onclick="saveChecklistQueryDocument()">Save Document</button>
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
                <textarea name="query_text" required rows="7" data-ai-field="query_text">${esc(query.query_text || (data.checks || []).filter(c => c.status === 'N').map(c => `${c.code}: ${c.text}${c.remark ? ' — ' + c.remark : ''}`).join('\n'))}</textarea>
              </div>
              <div id="cl-query-saved-images" class="query-saved-images query-full-width" aria-live="polite">
                <div class="query-saved-images-heading">Saved query images</div>
                <p class="muted query-saved-images-empty">Loading saved images…</p>
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
      <form id="clForm" class="form-grid three" onsubmit="return false">
        <div class="field" style="grid-column:1/-1">
          <label>Amount Approved (Y/N)</label>
          <div class="check-answer-group" role="group" aria-label="Amount Approved">
            <button type="button" class="check-answer ${approved === 'Y' ? 'selected yes' : ''}" onclick="setChecklistAmountApproved('Y')">Yes</button>
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
            ${paymentDisabled ? 'disabled aria-disabled="true" placeholder="Select Yes to enable"' : ''}>
          ${paymentDisabled ? '<small class="muted">Disabled unless Amount Approved is Yes.</small>' : ''}
        </div>
        ${clArea('remarks','Remarks or Queries (if not approved)',result.remarks)}
        <div class="card" style="grid-column:1/-1;background:#f7fafc">
          <span class="muted">Proposed for Payment (Net Amt.) is calculated from deductions:</span>
          <b>₹ ${money(calculateNet(data))}</b>
        </div>
      </form>
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
  const fileInput = document.getElementById('cl-query-image');
  const button = document.getElementById('cl-query-extract-btn');
  const status = document.getElementById('cl-query-ocr-status');
  const file = fileInput?.files?.[0];
  if (!file) {
    if (status) status.textContent = 'Choose a JPG, PNG or WEBP image first.';
    toast('Choose a query image first.', true);
    return;
  }
  const allowed = ['image/jpeg','image/png','image/webp'];
  if (!allowed.includes(file.type)) {
    toast('Supported formats: JPG, PNG or WEBP.', true);
    return;
  }
  if (file.size > 7 * 1024 * 1024) {
    toast('File must be 7 MB or smaller.', true);
    return;
  }
  if (button?.disabled) return;
  button.disabled = true;
  button.textContent = 'Extracting…';
  if (status) status.textContent = 'Uploading securely to Google Cloud Vision for handwriting OCR…';
  try {
    const dataUrl = await fileToDataUrl(file);
    const result = await api('/api/vision/query-extract', {
      method: 'POST',
      body: JSON.stringify({
        mimeType: file.type,
        imageData: dataUrl,
        checklistNumber: state.checklistDraft?.checklist_no || ''
      })
    });
    const q = result.fields || {};
    const mapping = {
      query_date: q.query_date,
      bill_invoice_reference: q.bill_invoice_reference,
      amount: q.amount,
      party_name: q.party_name,
      query_text: q.query_text || result.text || ''
    };
    let populated = 0;
    Object.entries(mapping).forEach(([name, value]) => {
      const field = document.querySelector(`.query-fields-panel [name="${name}"]`);
      if (!field) return;
      // Do not replace a user's existing value with an empty/uncertain AI result.
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        field.value = String(value);
        field.dataset.aiPopulated = 'true';
        field.classList.add('ai-populated-field');
        populated++;
      }
    });
    const preview = document.getElementById('cl-query-image-preview');
    if (preview && file.type.startsWith('image/')) {
      preview.innerHTML = `<img alt="Selected query document preview" src="${dataUrl}">`;
    } else if (preview) {
      preview.innerHTML = `<span class="query-image-placeholder">Unsupported file selected<br><b>${esc(file.name)}</b></span>`;
    }
    if (status) status.textContent = populated
      ? `Extraction complete. ${populated} field(s) populated; review highlighted fields before saving.`
      : 'OCR text was captured in Query Text. Please review it and fill any missing fields manually.';
    toast(populated ? 'AI extraction complete — review the highlighted fields.' : 'OCR text captured; review Query Text and complete any missing fields.', !populated);
  } catch (error) {
    if (status) status.textContent = `Extraction failed: ${error.message}`;
    toast(`Google Cloud Vision OCR failed: ${error.message}`, true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '✦ Extract Details with AI';
    }
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
  const gross =
    Number(
      data.register?.bill_amount ||
      data.amount ||
      0
    );

  const deductions =
    (data.deductions || [])
      .reduce(
        (total, item) =>
          total +
          Number(item.amount || 0),
        0
      );

  return Math.max(
    gross - deductions,
    0
  );
}


/* =========================================================
   25. CHECKLIST SAVE / NAVIGATION
   ========================================================= */

function setChecklistAmountApproved(value) {
  const data = state.checklistDraft;
  if (!data) return;
  data.result_details = data.result_details || {};
  data.result_details.amount_approved = value;
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

    data.register = {
      ...data.register,
      ...Object.fromEntries(
        formData.entries()
      )
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
    const form = $('#clQueryForm');
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
      data.result_details = {
        ...(data.result_details || {}),
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
  if (draft && state.checklistTab === 'G' && $('#clQueryForm')) {
    const queryRoot = $('#clQueryForm');
    const queryValues = {};
    queryRoot.querySelectorAll('input[name], textarea[name], select[name]').forEach((field) => {
      queryValues[field.name] = field.value;
    });
    draft.query_form = {
      ...(draft.query_form || {}),
      ...queryValues,
      form2_number: queryValues.form2_number || draft.result_details?.query_sheet_no || `${draft.checklist_no || 'CL'}-Q1`
    };
    draft.result_details = {
      ...(draft.result_details || {}),
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
