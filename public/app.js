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
  fy: (() => { try { return localStorage.getItem('ulb_selected_financial_year') || '2026-27'; } catch (_) { return '2026-27'; } })(),
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


function formatDateDMY(value) {
  if (value === null || value === undefined || value === '') return '—';
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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

  const [audits, form2, miniChecklists] = await Promise.all([
    api('/api/audits?' + query),
    api('/api/form2'),
    api('/api/mini-checklists?ulb=' + encodeURIComponent(context.ulb))
  ]);

  // Ignore responses for a context the user has already changed.
  if (seq !== state.contextLoadSeq ||
      context.ulb !== String(state.ulb || '') ||
      context.fy !== String(state.fy || '') ||
      context.month !== String(state.month || '')) return;

  const miniRows = (miniChecklists || []).filter(m => {
    if (context.ulb && String(m.ulb_id) !== context.ulb) return false;
    const d = String(m.audit_date || m.file_received_date || '');
    if (context.month && d.length >= 7 && Number(d.slice(5, 7)) !== Number(context.month)) return false;
    return true;
  }).map(m => ({
    ...m, id: m.id, checklist_no: m.checklist_no, amount: m.proposed_payment,
    financial_year: m.financial_year || (m.audit_date ? `${String(m.audit_date).slice(0,4)}-${String(Number(String(m.audit_date).slice(0,4))+1).slice(-2)}` : ''),
    month: m.month || (m.audit_date ? Number(String(m.audit_date).slice(5,7)) : undefined),
    cheque_issued: 'N', query_text: '', remarks: 'Mini Checklist',
    is_mini_checklist: true
  }));
  const miniById = new Map((miniChecklists || []).map(m => [String(m.id), m]));
  const auditRows = (audits || []).map(a => {
    const m = a.mini_checklist_id ? miniById.get(String(a.mini_checklist_id)) : null;
    return m ? {...a, ...m, id:a.id, mini_checklist_id:m.id, is_mini_checklist:true, future_checklist:m.future_checklist, created_as_main_checklist:m.created_as_main_checklist, amount:a.amount} : a;
  });
  // Include every saved Mini Checklist even if an older record missed its Audit Register row.
  const linkedMiniIds = new Set(auditRows.filter(a=>a.mini_checklist_id).map(a=>String(a.mini_checklist_id)));
  const missingMiniRows = miniRows.filter(m=>!linkedMiniIds.has(String(m.id))).map(m=>({...m, id:`mini:${m.id}`, mini_checklist_id:m.id, is_mini_checklist:true, future_checklist:m.future_checklist, created_as_main_checklist:m.created_as_main_checklist, audit_status:'Audited', remarks:'Mini Checklist'}));
  state.audits = [...auditRows, ...missingMiniRows];
  state.form2 = form2;
}


/* =========================================================
   7. AUTHENTICATION
   ========================================================= */

function renderLogin() {
  document.body.innerHTML = `
    <main class="login-modern">
      <section class="login-showcase">
        <div class="login-glow login-glow-blue"></div>
        <div class="login-glow login-glow-gold"></div>
        <div class="login-brand">
          <div class="login-brand-mark"><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20 5v6.2c0 5-3.4 8.6-8 10.3-4.6-1.7-8-5.3-8-10.3V5l8-2.5Z"/><path d="m8.2 11.8 2.4 2.4 5.2-5.1"/></svg></div>
          <div><strong>ULB Audit Desk</strong><span>INTERNAL AUDIT PORTAL</span></div>
          <div class="login-system-pill"><i></i> Secure staff portal</div>
        </div>
        <div class="login-showcase-content">
          <div class="login-kicker">CHHATTISGARH · URBAN LOCAL BODIES</div>
          <h1>Pre-Audit &amp; Internal Audit,<br><em>from voucher to monthly report.</em></h1>
          <p>One secure workspace for Checklists, Audit Registers, Form-2 Queries, Attendance and Monthly Annexure reporting.</p>
          <div class="login-feature-grid">
            <div class="login-feature"><b><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="13" height="16" rx="2"/><path d="M4 7v13a2 2 0 0 0 2 2h11M10 8h7M10 12h7M10 16h4"/></svg></b><strong>Digital Checklists</strong><span>Structured audit workflow</span></div>
            <div class="login-feature"><b><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6a1.5 1.5 0 0 0-1.5-2h-3A1.5 1.5 0 0 0 9 4.5ZM9 10h6M9 14h6M9 18h3"/></svg></b><strong>Form-2 Queries</strong><span>Track and resolve queries</span></div>
            <div class="login-feature"><b><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M7 15l5-5 4 3 5-7M16 6h5v5"/></svg></b><strong>Monthly Annexures</strong><span>Organised reporting</span></div>
          </div>
        </div>
        <div class="login-showcase-footer"><span>© 2026 ULB Audit Desk</span><span>Authorised access only</span></div>
      </section>

      <section class="login-entry">
        <div class="login-entry-inner">
          <div class="login-mobile-brand"><span><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20 5v6.2c0 5-3.4 8.6-8 10.3-4.6-1.7-8-5.3-8-10.3V5l8-2.5Z"/><path d="m8.2 11.8 2.4 2.4 5.2-5.1"/></svg></span> ULB Audit Desk</div>
          <div class="login-entry-icon"><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20 5v6.2c0 5-3.4 8.6-8 10.3-4.6-1.7-8-5.3-8-10.3V5l8-2.5Z"/><path d="m8.2 11.8 2.4 2.4 5.2-5.1"/></svg></div>
          <div class="login-entry-heading"><h2>Welcome back</h2><p>Sign in with your registered staff account.</p></div>
          <div id="loginAlert" class="login-alert" role="alert" aria-live="polite" hidden></div>
          <form id="loginForm" class="login-modern-form" autocomplete="on">
            <div class="login-field">
              <label for="loginMobile">Registered mobile number</label>
              <div class="login-input-wrap"><span aria-hidden="true"><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h3l2 5-2 1.5a15 15 0 0 0 4.5 4.5L16 12l5 2v3c0 1.1-.9 2-2 2C10.7 19 5 13.3 5 5c0-1.1.9-2 2-2Z"/></svg></span><input id="loginMobile" name="mobile" type="tel" inputmode="numeric" autocomplete="username" maxlength="10" pattern="[0-9]{10}" placeholder="Enter 10-digit mobile number" required></div>
            </div>
            <div class="login-field">
              <label for="loginPassword">Password</label>
              <div class="login-input-wrap"><span aria-hidden="true"><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3"/></svg></span><input id="loginPassword" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required><button type="button" id="loginPasswordToggle" class="login-password-toggle" aria-label="Show password"><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg></button></div>
            </div>
            <button id="loginSubmit" class="login-submit" type="submit"><span>Sign in securely</span><b aria-hidden="true"><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></b></button>
          </form>
          <div class="login-notice"><b><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg> Account access</b><span>Accounts are created and managed by the administrator. If you need access or have forgotten your password, contact your District Audit Lead.</span></div>
          <p class="login-entry-foot">Your session is protected by server-side authentication.</p>
        </div>
      </section>
    </main>
  `;

  const form = $('#loginForm');
  const mobile = $('#loginMobile');
  const password = $('#loginPassword');
  const submit = $('#loginSubmit');
  const alert = $('#loginAlert');
  mobile.addEventListener('input', () => { mobile.value = mobile.value.replace(/[^0-9]/g, '').slice(0, 10); });
  $('#loginPasswordToggle').onclick = () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    $('#loginPasswordToggle').innerHTML = show ? '<svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.2A10 10 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15 15 0 0 1-3 3.6M6.2 6.8C3.8 8.4 2.5 12 2.5 12s3.4 6 9.5 6c1 0 1.9-.2 2.7-.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>' : '<svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>'; 
    $('#loginPasswordToggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    alert.hidden = true;
    if (!form.reportValidity()) return;
    submit.disabled = true;
    submit.innerHTML = '<span>Verifying credentials…</span><b class="login-spinner"></b>';
    try {
      const response = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ mobile: mobile.value, password: password.value })
      });
      state.user = response.user;
      await loadMasters();
      renderApp();
    } catch (error) {
      alert.textContent = error.message || 'Unable to sign in. Check your details and try again.';
      alert.hidden = false;
      password.value = '';
      password.focus();
    } finally {
      if ($('#loginSubmit')) {
        submit.disabled = false;
        submit.innerHTML = '<span>Sign in securely</span><b aria-hidden="true"><svg class="login-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></b>'; 
      }
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

function nav(view, label, options = {}) {
  const perms = state.user?.permissions || {};
  const feature = ['users', 'ulbs', 'logs', 'company', 'settings'].includes(view) ? 'admin' : view;
  if (state.user?.role !== 'admin' && Object.keys(perms).length && !perms[feature]?.access) return '';

  // Inline Lucide-compatible SVGs keep the sidebar icons crisp without adding a runtime dependency.
  const icons = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    checklists: '<path d="M9 11l2 2 4-4"/><path d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><path d="M15 3h6v6"/><path d="M10 5h2"/>',
    register: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    queries: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    reports: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    d4567: '<path d="M4 19V5M4 19h17"/><path d="m7 15 4-5 3 2 5-7"/>',
    attendance: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="m17 11 2 2 4-4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6M17 11h6"/>',
    ulbs: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10 21v-3h4v3"/>',
    logs: '<path d="M3 3v5h5"/><path d="M3.5 15a9 9 0 1 0 .5-7"/><path d="M12 7v5l3 2"/>',
    company: '<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h2M9 11h2M9 15h2M15 7h.01M15 11h.01M15 15h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L8 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6.7v-2.4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L8 8.6l1.7-1.7.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h2.4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1Z"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'
  };
  const colors = { dashboard: '#2563eb', checklists: '#10b981', register: '#8b5cf6', queries: '#f59e0b', reports: '#f43f5e', d4567: '#f43f5e', attendance: '#14b8a6' };
  const icon = `<svg class="nav-svg" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="${colors[view] || '#64748b'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[view] || icons.company}</svg>`;
  const active = state.view === view;
  const count = options.count;
  return `
    <button class="nav-link ${active ? 'active' : ''}" onclick="go('${view}')" aria-current="${active ? 'page' : 'false'}">
      <span class="nav-link-main">${icon}<span class="nav-label">${label}</span></span>
      ${count !== undefined ? `<span class="nav-count ${view === 'checklists' ? 'nav-count-green' : ''}">${esc(String(count))}</span>` : ''}
    </button>
  `;
}

function renderApp() {
  document.body.innerHTML = `
    <div class="shell">

      <aside class="sidebar" id="side">
        <div class="sidebar-top">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg></div>
            <div class="brand-copy"><strong>ULB Audit Desk <span class="brand-tag">CG</span></strong><span>Internal Audit Portal</span></div>
          </div>

          <nav class="nav" aria-label="Main navigation">
            <div class="nav-section">
              <div class="nav-section-title">Main Navigation</div>
              ${nav('dashboard', t[state.lang].dashboard)}
              ${nav('checklists', t[state.lang].checklists, { count: state.audits?.length ?? 0 })}
              ${nav('register', t[state.lang].register)}
              ${nav('queries', t[state.lang].queries, { count: state.form2?.length ?? 0 })}
              ${nav('reports', t[state.lang].reports)}
              ${nav('d4567', 'Data Entry D4-7')}
              ${nav('attendance', t[state.lang].attendance)}
            </div>

            ${(state.user.role === 'admin' || state.user?.permissions?.admin?.access) ? `
              <div class="nav-section nav-admin-section">
                <div class="nav-section-title">${t[state.lang].admin === 'Admin' ? 'Administrative' : t[state.lang].admin}</div>
                ${nav('users', t[state.lang].users)}
                ${nav('ulbs', t[state.lang].ulbs)}
                ${nav('logs', t[state.lang].logs)}
                ${nav('company', t[state.lang].company)}
                ${nav('settings', 'Settings')}
              </div>
            ` : ''}
          </nav>
        </div>

        <div class="sidebar-profile">
          <div class="sidebar-avatar" aria-hidden="true">${esc((state.user.name || 'A').trim().charAt(0).toUpperCase())}</div>
          <div class="sidebar-profile-copy"><strong>${esc(state.user.name)}</strong><span>${esc(state.user.role)}</span></div>
          <button class="sidebar-logout" type="button" title="Logout" aria-label="Logout" onclick="logout()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg></button>
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
  const feature=v==='users'||v==='ulbs'||v==='logs'||v==='company'||v==='settings'?'admin':v;
  if(state.user?.role!=='admin' && Object.keys(perms).length && !perms[feature]?.access){toast('You do not have access to this module.',true);return;}
  state.view=v;
  $('#side').classList.remove('open');
  renderApp();
}


async function renderView() {
  const content = $('#content');

  if (!content) return;
  const adminView=['users','ulbs','logs','company','settings'].includes(state.view);
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

  if (state.view === 'settings') {
    return await financialYearSettings(content);
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


function financialYearOptions(){
  const start=2020, end=2045;
  return Array.from({length:end-start+1},(_,i)=>`${start+i}-${String(start+i+1).slice(-2)}`);
}
async function financialYearSettings(content){
  const years=financialYearOptions();
  let settings={};
  try{settings=await api('/api/system-settings');}catch(e){console.warn('Could not load system settings',e);}
  const defaults={userPermissions:{defaultRole:'user',sessionHours:8},reports:{dateFormat:'DD/MM/YYYY',pageSize:'A4',defaultExport:'PDF',includeCompanyHeader:true},backup:{reminderEnabled:false,reminderFrequency:'weekly',retainCount:10},ai:{ocrProvider:'google-vision',autoTranslateHindi:true,imageCompression:true},notifications:{pendingQueries:true,overduePayments:true,auditDeadlines:true,systemAlerts:true}};
  settings={...defaults,...settings,userPermissions:{...defaults.userPermissions,...settings.userPermissions},reports:{...defaults.reports,...settings.reports},backup:{...defaults.backup,...settings.backup},ai:{...defaults.ai,...settings.ai},notifications:{...defaults.notifications,...settings.notifications}};
  content.innerHTML=`<section class="fy-settings-page system-settings-page">
    <div class="fy-settings-header"><div><div class="fy-settings-eyebrow">SYSTEM PREFERENCES</div><h1>Settings</h1><p>Manage shared configuration for the ULB Audit Management System.</p></div><button class="btn primary" type="button" onclick="saveSystemSettings()">Save Settings</button></div>
    <div class="settings-section-grid">
      <section class="fy-settings-card settings-wide"><div class="fy-settings-icon">⚙</div><div class="fy-settings-copy"><h2>Financial Year</h2><p>Select the active financial year used across Dashboard, Audit Register, Checklists and Reports.</p></div><label class="fy-settings-label" for="active-financial-year">Active Financial Year</label><select id="active-financial-year" class="fy-settings-select">${years.map(y=>`<option value="${y}" ${y===state.fy?'selected':''}>${y}</option>`).join('')}</select><div class="fy-settings-current">Currently selected: <strong id="fy-current-label">${esc(state.fy)}</strong></div><div class="fy-settings-actions"><button class="btn primary" type="button" onclick="saveFinancialYearSetting()">Save Financial Year</button><span id="fy-settings-status" role="status"></span></div></section>
      <section class="fy-settings-card"><div class="fy-settings-icon">♙</div><div class="fy-settings-copy"><h2>User & Permission Settings</h2><p>Manage users, module access and Read Only / Full permissions.</p></div><label class="fy-settings-label">Default role for new users</label><select class="fy-settings-select" id="set-default-role"><option value="user" ${settings.userPermissions.defaultRole==='user'?'selected':''}>User</option><option value="auditor" ${settings.userPermissions.defaultRole==='auditor'?'selected':''}>Auditor</option><option value="verifier" ${settings.userPermissions.defaultRole==='verifier'?'selected':''}>Verifier</option><option value="district" ${settings.userPermissions.defaultRole==='district'?'selected':''}>District</option></select><label class="fy-settings-label settings-label-gap">Session duration (hours)</label><input class="fy-settings-select" id="set-session-hours" type="number" min="1" max="24" value="${settings.userPermissions.sessionHours}"><button class="btn secondary settings-shortcut" type="button" onclick="go('users')">Open User Management</button></section>
      <section class="fy-settings-card"><div class="fy-settings-icon">▤</div><div class="fy-settings-copy"><h2>Reports & Export Settings</h2><p>Set default formats for reports and exported documents.</p></div><label class="fy-settings-label">Date format</label><input class="fy-settings-select" id="set-date-format" value="DD/MM/YYYY" readonly><p class="settings-note">The system uses DD/MM/YYYY consistently across all pages and reports.</p><label class="fy-settings-label settings-label-gap">Page size</label><select class="fy-settings-select" id="set-page-size"><option ${settings.reports.pageSize==='A4'?'selected':''}>A4</option><option ${settings.reports.pageSize==='Letter'?'selected':''}>Letter</option></select><label class="fy-settings-label settings-label-gap">Default export</label><select class="fy-settings-select" id="set-export"><option ${settings.reports.defaultExport==='PDF'?'selected':''}>PDF</option><option ${settings.reports.defaultExport==='Excel'?'selected':''}>Excel</option></select><label class="settings-check"><input type="checkbox" id="set-company-header" ${settings.reports.includeCompanyHeader?'checked':''}> Include company header in reports</label></section>
      <section class="fy-settings-card"><div class="fy-settings-icon">▣</div><div class="fy-settings-copy"><h2>Backup & Data Management</h2><p>Configure backup reminders and retention preferences. Actual backups remain managed by the server backup process.</p></div><label class="settings-check"><input type="checkbox" id="set-backup-reminder" ${settings.backup.reminderEnabled?'checked':''}> Enable backup reminder</label><label class="fy-settings-label settings-label-gap">Reminder frequency</label><select class="fy-settings-select" id="set-backup-frequency"><option value="daily" ${settings.backup.reminderFrequency==='daily'?'selected':''}>Daily</option><option value="weekly" ${settings.backup.reminderFrequency==='weekly'?'selected':''}>Weekly</option><option value="monthly" ${settings.backup.reminderFrequency==='monthly'?'selected':''}>Monthly</option></select><label class="fy-settings-label settings-label-gap">Keep last (retention preference)</label><input class="fy-settings-select" id="set-backup-retain" type="number" min="1" max="100" value="${settings.backup.retainCount}"><div class="settings-backup-actions"><button class="btn primary" type="button" onclick="backupSystemData()">Create Full Backup</button><button class="btn secondary" type="button" onclick="downloadCompleteExcelBackup()">Complete Backup in Excel</button></div><p class="settings-note">Full Backup saves the database and uploaded files on the server. Excel Backup downloads all database collections as separate worksheets.</p><span id="backup-action-status" role="status" class="settings-backup-status"></span></section>
      <section class="fy-settings-card"><div class="fy-settings-icon">✦</div><div class="fy-settings-copy"><h2>AI & OCR Settings</h2><p>Choose the preferred OCR provider and document processing options.</p></div><label class="fy-settings-label">Preferred OCR provider</label><select class="fy-settings-select" id="set-ocr-provider"><option value="google-vision" ${settings.ai.ocrProvider==='google-vision'?'selected':''}>Google Cloud Vision</option><option value="gemini" ${settings.ai.ocrProvider==='gemini'?'selected':''}>Google Gemini</option></select><label class="settings-check"><input type="checkbox" id="set-translate-hindi" ${settings.ai.autoTranslateHindi?'checked':''}> Enable Hindi-to-English translation preference</label><label class="settings-check"><input type="checkbox" id="set-image-compression" ${settings.ai.imageCompression?'checked':''}> Compress uploaded images</label><p class="settings-note">API credentials remain in server environment variables and are never displayed here.</p></section>
      <section class="fy-settings-card"><div class="fy-settings-icon">♧</div><div class="fy-settings-copy"><h2>Notifications</h2><p>Choose which system events should be included in notification preferences.</p></div><label class="settings-check"><input type="checkbox" id="set-notify-queries" ${settings.notifications.pendingQueries?'checked':''}> Pending Form-2 queries</label><label class="settings-check"><input type="checkbox" id="set-notify-payments" ${settings.notifications.overduePayments?'checked':''}> Overdue / unpaid bills</label><label class="settings-check"><input type="checkbox" id="set-notify-deadlines" ${settings.notifications.auditDeadlines?'checked':''}> Audit deadlines</label><label class="settings-check"><input type="checkbox" id="set-notify-system" ${settings.notifications.systemAlerts?'checked':''}> System alerts</label><p class="settings-note">These preferences are stored centrally. Delivery channels and automatic reminders can be connected separately.</p></section>
    </div>
    <div class="settings-savebar"><span id="system-settings-status" role="status" aria-live="polite">Changes are saved only after you click Save Settings.</span><button class="btn primary" type="button" onclick="saveSystemSettings()">Save Settings</button></div>
  </section>`;
}
async function backupSystemData(){
  const status=$('#backup-action-status');const buttons=[...document.querySelectorAll('.settings-backup-actions button')];
  buttons.forEach(b=>b.disabled=true);if(status)status.textContent='Creating server backup...';
  try{const result=await api('/api/system-backup',{method:'POST',body:JSON.stringify({})});if(!result?.ok)throw new Error(result?.error||'Backup was not confirmed.');if(status)status.textContent=`Backup created successfully: ${result.backup}`;toast('Full backup created successfully.');}
  catch(e){if(status)status.textContent='Backup failed: '+(e.message||'Unknown error');toast(e.message||'Backup failed.',true);}
  finally{buttons.forEach(b=>b.disabled=false);}
}
function downloadCompleteExcelBackup(){
  const status=$('#backup-action-status');if(status)status.textContent='Preparing complete Excel backup...';
  window.location.href='/api/system-backup/excel';
  if(status)status.textContent='Excel backup download requested.';
}

async function saveSystemSettings(){
  const val=id=>document.getElementById(id)?.value ?? '';
  const checked=id=>!!document.getElementById(id)?.checked;
  const status=$('#system-settings-status');
  const saveButtons=[...document.querySelectorAll('.system-settings-page button[onclick*=saveSystemSettings]')];
  const settings={userPermissions:{defaultRole:val('set-default-role'),sessionHours:Number(val('set-session-hours'))},reports:{dateFormat:val('set-date-format'),pageSize:val('set-page-size'),defaultExport:val('set-export'),includeCompanyHeader:checked('set-company-header')},backup:{reminderEnabled:checked('set-backup-reminder'),reminderFrequency:val('set-backup-frequency'),retainCount:Number(val('set-backup-retain'))},ai:{ocrProvider:val('set-ocr-provider'),autoTranslateHindi:checked('set-translate-hindi'),imageCompression:checked('set-image-compression')},notifications:{pendingQueries:checked('set-notify-queries'),overduePayments:checked('set-notify-payments'),auditDeadlines:checked('set-notify-deadlines'),systemAlerts:checked('set-notify-system')}};
  if(!settings.userPermissions.defaultRole||!settings.reports.dateFormat||!settings.reports.pageSize||!settings.reports.defaultExport||!settings.backup.reminderFrequency||!settings.ai.ocrProvider){if(status)status.textContent='Please check all settings fields before saving.';toast('Some settings fields are missing. Please review the page.',true);return;}
  saveButtons.forEach(b=>{b.disabled=true;b.dataset.originalText=b.textContent;b.textContent='Saving...';});
  if(status)status.textContent='Saving settings to the server...';
  try{
    const result=await api('/api/system-settings',{method:'PUT',body:JSON.stringify(settings)});
    if(!result||result.ok!==true)throw new Error(result?.error||'The server did not confirm that settings were saved.');
    if(status)status.textContent='Saved successfully. Your settings are stored centrally.';
    toast('Settings saved successfully.');
  }catch(e){
    const message=e?.message||'Could not save settings.';
    if(status)status.textContent='Save failed: '+message;
    toast(message,true);
  }finally{saveButtons.forEach(b=>{b.disabled=false;b.textContent=b.dataset.originalText||'Save Settings';});}
}
async function saveFinancialYearSetting(){
  const select=$('#active-financial-year'); if(!select)return;
  const value=select.value;
  if(!/^\d{4}-\d{2}$/.test(value)){toast('Please select a valid financial year.',true);return;}
  state.fy=value;
  try{localStorage.setItem('ulb_selected_financial_year',value);}catch(_){ }
  const label=$('#fy-current-label');if(label)label.textContent=value;
  const status=$('#fy-settings-status');if(status)status.textContent='Financial year saved successfully.';
  toast(`Financial year set to ${value}`);
  await loadRows();
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
          ${financialYearOptions().map(x => `
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

    // Dashboard metric icons use the same clean, outlined icon language as the navbar.
    const dashboardIcon = (name) => {
      const paths = {
        ulbs: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
        checklists: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3.5h6M8 11l2 2 5-5M8 17h8"/>',
        drafts: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
        queries: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.4 1.6c-1.2 1.1-2 1.4-2 3M12 17h.01"/>',
        unpaid: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
        passed: '<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-3 .9-3 2.2s1.2 2 3 2.3 3 .9 3 2.2-1.3 2.3-3 2.3c-1.2 0-2.4-.4-3.1-1.2M12 5.5v13"/>'
      };
      return `<svg class="dashboard-metric-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
    };
    const dashboardSmallIcon = (name) => {
      const paths = {
        district: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
        checklist: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3.5h6M8 11l2 2 5-5M8 17h8"/>'
      };
      return `<svg class="dashboard-small-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
    };
    const cards = [
      { label: 'ULBs', value: data.assigned_ulbs ?? 0, icon: dashboardIcon('ulbs'), tone: 'blue' },
      { label: 'CHECKLISTS', value: data.checklist_count ?? 0, icon: dashboardIcon('checklists'), tone: 'purple' },
      { label: 'DRAFTS', value: data.draft_count ?? 0, icon: dashboardIcon('drafts'), tone: 'orange' },
      { label: 'QUERIES', value: data.pending_form2 ?? 0, icon: dashboardIcon('queries'), tone: 'green' },
      { label: 'APPROVED, UNPAID', value: data.bills_not_paid ?? 0, icon: dashboardIcon('unpaid'), tone: 'pink' },
      { label: 'PASSED (₹)', value: money(data.passed_total ?? 0), icon: dashboardIcon('passed'), tone: 'mint' }
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
              ${Object.entries(months).filter(([key])=>Number(key)>0).map(([key, value]) => `<option value="${esc(key)}" ${String(key) === String(state.month) ? 'selected' : ''}>${esc(value)}</option>`).join('')}
            </select>
            <button type="button" class="dashboard-fy-link" onclick="go('settings')" title="Change financial year">FY ${esc(state.fy)} ⚙</button>
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
              <h2><span class="panel-heading-icon district-heading-icon">${dashboardSmallIcon('district')}</span> District progress</h2>
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
              <h2><span class="panel-heading-icon recent-heading-icon">${dashboardSmallIcon('checklist')}</span> Recent checklists</h2>
              <button class="dashboard-circle-button" title="View all checklists" onclick="go('checklists')">→</button>
            </div>
            <div class="dashboard-recent-list">
              ${recent.length ? recent.map(row => `
                <button class="dashboard-recent-row" onclick="openChecklist('${esc(row.id)}')">
                  <span class="dashboard-recent-icon">${dashboardSmallIcon('checklist')}</span>
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

let registerSortOrder = 'new';
let checklistSortOrder = 'new';

function recordSortTimestamp(row) {
  const raw = row?.created_at || row?.createdAt || row?.audit_date || row?.file_received_date || row?.date || '';
  if (!raw) return 0;
  const value = String(raw);
  // ISO date/time strings are parsed consistently; DD/MM/YYYY is also supported.
  let date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) date = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function sortTableBody(tableSelector, order, rowSelector = 'tr[data-sort-date]') {
  const tbody = $(`${tableSelector} tbody`);
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll(rowSelector));
  rows.sort((a, b) => {
    const diff = Number(a.dataset.sortDate || 0) - Number(b.dataset.sortDate || 0);
    return order === 'old' ? diff : -diff;
  });
  rows.forEach(row => tbody.appendChild(row));
}

function sortAuditRegisterRows() {
  sortTableBody('.register-table', registerSortOrder);
  const rows = $$('.register-table tbody tr[data-register-type]');
  rows.forEach((row, index) => { if (row.cells[0]) row.cells[0].textContent = String(index + 1); });
}

function changeRegisterSort(value) {
  registerSortOrder = value === 'old' ? 'old' : 'new';
  sortAuditRegisterRows();
}

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

          <button class="btn primary" onclick="startMiniChecklist()">Mini Checklist</button>
          <button class="btn secondary" onclick="downloadAuditCsv()">
            <span aria-hidden="true">⇩</span> Export CSV
          </button>
        </div>
      </header>

      <section class="register-filters" aria-label="Audit Register filters">
        <label class="register-filter">
          <span>ULB</span>
          <select id="register-ulb-filter" onchange="registerContextChanged('ulb', this.value)">
            <option value="" ${!state.ulb ? 'selected' : ''}>All ULBs</option>
            ${state.ulbs.map(ulb => `<option value="${esc(ulb.id)}" ${String(state.ulb)===String(ulb.id)?'selected':''}>${esc(ulb.name)}</option>`).join('')}
          </select>
        </label>
        <label class="register-filter">
          <span>Month</span>
          <select id="register-month-filter" onchange="registerContextChanged('month', this.value)">
            ${months.slice(1).map((month, index) => `<option value="${index+1}" ${Number(state.month)===index+1?'selected':''}>${month}</option>`).join('')}
          </select>
        </label>
        <label class="register-filter register-search-filter">
          <span>Search Scheme / Fund / Nature of Work / Contractor</span>
          <input id="register-search" type="search" placeholder="Search by scheme, work or contractor…" oninput="filterAuditRegisterRows()" autocomplete="off">
        </label>
        <label class="register-filter">
          <span>Checklist Type</span>
          <select id="register-type-filter" onchange="filterAuditRegisterRows()">
            <option value="all">All Checklists</option>
            <option value="mini">Mini Checklist</option>
            <option value="full">Checklist</option>
            <option value="mini-create">Checklist for Creating</option>
          </select>
        </label>
        <label class="register-filter">
          <span>Sort by</span>
          <select id="register-sort-order" class="sort-order-dropdown" aria-label="Sort Audit Register" onchange="changeRegisterSort(this.value)">
            <option value="new" ${registerSortOrder==='new'?'selected':''}>New First</option>
            <option value="old" ${registerSortOrder==='old'?'selected':''}>Old First</option>
          </select>
        </label>
      </section>

      <section class="register-table-panel">
        <div class="register-table-scroll">
          <table class="table register-table">
            <thead>
              <tr>
                <th>Sr.</th>
                <th>Checklist No.</th>
                <th>File Recd.</th>
                <th>Audit Date</th>
                <th title="Scheme / Fund · Nature of Work · Contractor">Scheme / Work / Contractor</th>
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
                  <tr data-sort-date="${recordSortTimestamp(row)}" data-register-type="${row.is_mini_checklist ? 'mini' : 'full'}" data-register-mini-create="${row.is_mini_checklist && String(row.future_checklist || '').toLowerCase() === 'yes' && !row.created_as_main_checklist ? 'yes' : 'no'}" data-register-search="${esc([row.scheme_fund, row.nature_work, row.party].filter(Boolean).join(' ').toLowerCase())}">
                    <td>${index + 1}</td>
                    <td>
                      <span class="register-checklist-no">${esc(row.checklist_no || '—')}</span>
                    </td>
                    <td>${esc(formatDateDMY(row.file_received_date))}</td>
                    <td>${esc(formatDateDMY(row.audit_date))}</td>
                    <td class="register-combined-details">
                      <div><span>Scheme / Fund</span><strong>${esc(row.scheme_fund || '—')}</strong></div>
                      <div><span>Nature of Work</span><strong>${esc(row.nature_work || '—')}</strong></div>
                      <div><span>Contractor</span><strong>${esc(row.party || '—')}</strong></div>
                    </td>
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
                        ${readOnly?'':(row.is_mini_checklist ? `<button class="btn secondary sm" onclick='editAudit(${JSON.stringify(row)})'>Edit</button><button class="btn secondary sm" onclick="deleteMiniChecklist('${String(row.mini_checklist_id||row.id).replace(/'/g, "\\'")}')">Delete</button>${row.future_checklist==='Yes'&&!row.created_as_main_checklist?`<button class="btn primary sm" onclick="createMainFromMini('${String(row.mini_checklist_id||row.id).replace(/'/g, "\\'")}')">Create Checklist</button>`:''}`:`<button class="btn secondary sm" onclick='editAudit(${JSON.stringify(row)})'>Edit</button><button class="btn secondary sm" onclick='deleteAudit(${JSON.stringify(row.id)})'>Delete</button>`)}
                      </div>
                    </td>
                  </tr>
                `).join('') ||
                `<tr><td colspan="13" class="empty register-empty">No records for this month.</td></tr>`
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="8" class="register-total-label">TOTAL</td>
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
  sortAuditRegisterRows();
  filterAuditRegisterRows();
}

function filterAuditRegisterRows(){
  const search = String($('#register-search')?.value || '').trim().toLowerCase();
  const type = $('#register-type-filter')?.value || 'all';
  const rows = $$('#content .register-table tbody tr[data-register-type]');
  let visible = 0;
  rows.forEach(row => {
    const matchesSearch = !search || String(row.dataset.registerSearch || '').includes(search);
    const matchesType = type === 'all'
      || row.dataset.registerType === type
      || (type === 'mini-create' && row.dataset.registerMiniCreate === 'yes');
    const show = matchesSearch && matchesType;
    row.hidden = !show;
    if (show) visible++;
  });
  const empty = $$('#content .register-table tbody tr').find(row => !row.dataset.registerType);
  if (empty) empty.hidden = rows.length > 0 && visible > 0;
  let noMatch = $('#register-filter-no-match');
  const tbody = $('#content .register-table tbody');
  if (tbody && rows.length && visible === 0) {
    if (!noMatch) {
      noMatch = document.createElement('tr');
      noMatch.id = 'register-filter-no-match';
      noMatch.innerHTML = '<td colspan="15" class="empty register-empty">No records match your search or checklist filter.</td>';
      tbody.appendChild(noMatch);
    }
    noMatch.hidden = false;
  } else if (noMatch) noMatch.hidden = true;
}

function returnToAuditRegister(){
  state.view = 'register';
  const content = $('#content');
  if (content) register(content);
}

async function startMiniChecklist(){
  const options=state.ulbs.filter(x=>x.active!==false).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  modal(`<h2>Mini Checklist</h2><form id="miniStartForm"><div class="field"><label for="miniUlb">Select ULB</label><select id="miniUlb" required><option value="">Choose ULB…</option>${options}</select></div><div class="field"><label>Will you create a checklist for this mini checklist in the future?</label><div class="check-answer-group mini-shared-answer-style" role="group" aria-label="Create a checklist in future"><span class="mini-toggle-indicator" aria-hidden="true"></span><label class="check-answer mini-future-choice selected yes"><input type="radio" name="future" value="Yes" required checked> Yes</label><label class="check-answer mini-future-choice"><input type="radio" name="future" value="No" required> No</label></div></div><div class="actions"><button class="btn primary">Next</button><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button></div></form>`);
  $('#modal')?.classList.add('mini-start-modal');
  const futureChoices=$$('#miniStartForm .mini-future-choice');
  const toggleIndicator=$('#miniStartForm .mini-toggle-indicator');
  const syncFutureChoices=()=>{
    futureChoices.forEach((label,index)=>{const input=label.querySelector('input');label.classList.toggle('selected',input.checked);label.classList.toggle('yes',input.checked&&input.value==='Yes');label.classList.toggle('no',input.checked&&input.value==='No');});
    const selected=$('#miniStartForm input[name="future"]:checked');
    if(toggleIndicator)toggleIndicator.style.transform=selected?.value==='No'?'translateX(100%)':'translateX(0)';
  };
  $$('#miniStartForm input[name="future"]').forEach(input=>input.addEventListener('change',syncFutureChoices));
  syncFutureChoices();
  $('#miniStartForm').onsubmit=async e=>{
    e.preventDefault();
    const ulb=state.ulbs.find(x=>String(x.id)===$('#miniUlb').value);
    const future=$('#miniStartForm').querySelector('input[name="future"]:checked')?.value;
    if(!ulb||!future)return;
    try {
      const [rows,audits]=await Promise.all([api('/api/mini-checklists'),api('/api/audits')]);
      const code=String(ulb.code||'').trim().toUpperCase();
      if(!code)throw new Error('Selected ULB has no master code.');
      const monthCode=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][new Date().getMonth()];
      const prefix=`${code}/${monthCode}/`;
      const used=new Set([...(rows||[]),...(audits||[])].map(r=>String(r.checklist_no||'')));
      let next=1;
      for(const r of [...(rows||[]),...(audits||[])]){const n=String(r.checklist_no||'');if(n.startsWith(prefix)){const v=Number(n.slice(prefix.length));if(Number.isInteger(v)&&v>=next)next=v+1;}}
      let checklistNo;do{checklistNo=`${prefix}${String(next).padStart(2,'0')}`;if(used.has(checklistNo))next++;else break;}while(true);
      closeModal(); miniChecklistForm(ulb,future,checklistNo);
    } catch(err) { toast(err.message||'Could not prepare Mini Checklist',true); }
  };
}
function miniChecklistForm(ulb,future,checklistNo,existing=null){
  const content=$('#content');if(!content)return;
  // Use the browser's local calendar date (not UTC) as the editable default.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  content.innerHTML=`<section class="register-page mini-checklist-page"><header class="module-heading register-heading"><div class="module-heading-main"><div class="module-icon" aria-hidden="true">▤</div><div><h1>Mini Checklist</h1><p>Enter the mini checklist details below.</p></div></div><div class="module-heading-actions"><button class="btn secondary" onclick="returnToAuditRegister()">Cancel</button></div></header><section class="register-table-panel mini-form-panel"><form id="miniForm"><div class="form-grid two">
  <div class="field"><label>Checklist No.</label><input name="checklist_no_display" value="${esc(checklistNo)}" readonly></div>
  <div class="field"><label>ULB Name</label><input value="${esc(ulb.name)}" readonly></div>
  ${input('file_received_date','Received Date of Files by Internal Auditor',today,'date',true)}
  ${input('audit_date','Date of Audit',today,'date',true)}
  ${input('scheme_fund','Name of Scheme / Fund','','text',true)}
  ${input('nature_work','Nature of Work','','text',true)}
  ${input('party','Contractor','','text',true)}
  ${input('proposed_payment','Proposed for Payment (Net Amt.)','','number',true)}
  <div id="miniPaymentPassedField" style="display:none">
    ${input('payment_passed','Passed for Payment (Net Amt.)','','number',true)}
  </div>
  <div class="field"><label>Amount Approved (Y/N)</label><input type="hidden" id="miniPaymentApprovedValue" name="payment_approved" value=""><div class="check-answer-group mini-approval-actions" role="group" aria-label="Amount Approved"><label class="check-answer" id="miniPaymentApprovedYesWrap"><input type="radio" name="miniPaymentApprovedChoice" value="Y"> Yes</label><label class="check-answer" id="miniPaymentApprovedNoWrap"><input type="radio" name="miniPaymentApprovedChoice" value="N"> No</label></div></div>
  </div><section id="miniQueriesSection" class="checklist-query-form" style="display:none;margin-top:22px"><div class="query-form-heading"><div><div class="eyebrow">FORM-2 · QUERY DETAILS</div><h3>G. Queries Form</h3><p class="muted">Required when Amount Approved is NO, matching the main checklist workflow.</p></div></div><div class="form-grid two"><div class="field"><label>Checklist Number</label><input value="${esc(checklistNo)}" readonly></div><div class="field"><label>Query Sheet Serial No. (auto)</label><input name="form2_number" value="${esc(existing?.query_form?.form2_number || `${checklistNo}-Q1`)}" readonly></div><div class="field"><label>Query Date *</label><input name="query_date" type="date" lang="en-GB" value="${esc(existing?.query_form?.query_date || new Date().toISOString().slice(0,10))}"></div><div class="field" style="grid-column:1/-1"><label>Query Details *</label><textarea name="query_text" rows="5">${esc(existing?.query_form?.query_text || '')}</textarea></div></div><div class="mini-query-ocr query-full-width"><div class="field"><label for="mini-query-image">Upload query image (JPG, PNG, WEBP; max 7 MB)</label><input id="mini-query-image" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"></div><div class="actions"><button type="button" class="btn secondary" onclick="saveMiniQueryImage()">Save Document</button><button type="button" class="btn primary" onclick="extractMiniQueryWithAI()">✦ Extract Details with AI</button></div><p id="mini-query-ocr-status" class="muted" role="status"></p><div id="mini-query-saved-images"></div></div></section><div class="actions"><button class="btn primary">Save & Finalize Mini Checklist</button><button type="button" class="btn secondary" onclick="returnToAuditRegister()">Cancel</button></div></form></section></section>`;
  if(existing){ for(const [k,v] of Object.entries({file_received_date:existing.file_received_date,audit_date:existing.audit_date,scheme_fund:existing.scheme_fund,nature_work:existing.nature_work,party:existing.party,proposed_payment:existing.proposed_payment,payment_passed:existing.payment_passed})) { const el=$(`#miniForm [name="${k}"]`); if(el)el.value=v||today; } }
  const approvedValue=$('#miniPaymentApprovedValue');
  const setMiniApproved=(value)=>{
    approvedValue.value=value;
    const yesWrap=$('#miniPaymentApprovedYesWrap'), noWrap=$('#miniPaymentApprovedNoWrap');
    yesWrap.classList.toggle('selected',value==='Y');
    yesWrap.classList.toggle('yes',value==='Y');
    noWrap.classList.toggle('selected',value==='N');
    noWrap.classList.toggle('no',value==='N');
    yesWrap.querySelector('input').checked=value==='Y';
    noWrap.querySelector('input').checked=value==='N';
    const paymentPassedField=$('#miniPaymentPassedField');
    const paymentPassedInput=$('#miniForm [name="payment_passed"]');
    if(paymentPassedField)paymentPassedField.style.display=value==='Y'?'':'none';
    if(paymentPassedInput){
      paymentPassedInput.required=value==='Y';
      paymentPassedInput.disabled=value!=='Y';
      if(value!=='Y')paymentPassedInput.value='';
    }
    const querySection=$('#miniQueriesSection');
    if(querySection){querySection.style.display=value==='N'?'block':'none';querySection.querySelectorAll('[name="form2_number"],[name="query_date"],[name="bill_invoice_reference"],[name="query_amount"],[name="party_name"],[name="query_text"]').forEach(el=>{el.required=value==='N';});}
  };
  if(existing)setMiniApproved(existing.payment_approved);
  loadMiniQueryImages();
  $('#miniPaymentApprovedYesWrap').onclick=()=>setMiniApproved('Y');
  $('#miniPaymentApprovedNoWrap').onclick=()=>setMiniApproved('N');
  if(existing && existing.payment_approved==='N')setMiniApproved('N');
  const form=$('#miniForm');form.onsubmit=async e=>{
    e.preventDefault();if(!approvedValue.value){toast('Please select Amount Approved: YES or NO.',true);return;}const fd=new FormData(form);const payload=Object.fromEntries(fd.entries());
    payload.ulb_id=ulb.id;payload.future_checklist=future;payload.financial_year=state.fy;payload.month=Number(state.month);payload.proposed_payment=Number(payload.proposed_payment);payload.payment_passed=Number(payload.payment_passed);delete payload.checklist_no_display;
    if(payload.payment_approved==='N'){
      payload.query_form={form2_number:payload.form2_number,query_date:payload.query_date,query_text:payload.query_text};
      for(const key of ['form2_number','query_date','query_text'])delete payload[key];
      if(!payload.query_form.form2_number||!payload.query_form.query_date||!payload.query_form.query_text.trim()){toast('Complete G. Queries Form before saving when Amount Approved is NO.',true);return;}
    }else{payload.query_form=null;}

    if(!Number.isFinite(payload.proposed_payment)||payload.proposed_payment<0||!Number.isFinite(payload.payment_passed)||payload.payment_passed<0){toast('Enter valid non-negative payment amounts.',true);return;}
    try {
      const savedMini=existing ? await api('/api/mini-checklists/'+encodeURIComponent(existing.id),{method:'PATCH',body:JSON.stringify(payload)}) : await api('/api/mini-checklists',{method:'POST',body:JSON.stringify(payload)});
      state.ulb=String(ulb.id); await loadRows(); state.view='register'; register($('#content'));
      toast('Mini Checklist saved and added to Audit Register.');
    } catch(err){toast(err.message||'Could not save Mini Checklist',true);}
  };
}

async function miniQueryFileData(){
  const input=$('#mini-query-image'), file=input?.files?.[0];
  if(!file)throw new Error('Choose a JPG, PNG or WEBP image first.');
  const allowed={'image/jpeg':['.jpg','.jpeg'],'image/png':['.png'],'image/webp':['.webp']};
  const ext=file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if(!allowed[file.type]||!allowed[file.type].includes(ext))throw new Error('Only JPG, JPEG and WEBP images are allowed.');
  if(file.size>7*1024*1024)throw new Error('Image must be 7 MB or smaller.');
  return {file,imageData:await fileToDataUrl(file)};
}
async function saveMiniQueryImage(){
  const status=$('#mini-query-ocr-status');
  try{
    const {file,imageData}=await miniQueryFileData();
    const qv=n=>$('#miniForm [name="'+n+'"]')?.value||'';
    const payload={mimeType:file.type,originalName:file.name,imageData,checklistNumber:$('#miniForm [name="checklist_no_display"]')?.value||'',fields:{form2_number:qv('form2_number'),query_date:qv('query_date'),bill_invoice_reference:qv('bill_invoice_reference'),amount:qv('query_amount'),party_name:qv('party_name'),query_text:qv('query_text')}};
    await api('/api/query-documents',{method:'POST',body:JSON.stringify(payload)});
    if(status)status.textContent='Query image saved. You can now extract details with AI.';
    await loadMiniQueryImages();toast('Query image saved.');
  }catch(e){if(status)status.textContent=e.message;toast(e.message,true);}
}
async function extractMiniQueryWithAI(){
  const status=$('#mini-query-ocr-status');
  try{
    const {file,imageData}=await miniQueryFileData();
    if(status)status.textContent='Extracting query details with the configured OCR/AI service…';
    const result=await api('/api/query/ocr-extract',{method:'POST',body:JSON.stringify({mimeType:file.type,imageData,checklistNumber:$('#miniForm [name="checklist_no_display"]')?.value||''})});
    const fields=result.fields||{};
    const map={query_date:'query_date',bill_invoice_reference:'bill_invoice_reference',amount:'query_amount',party_name:'party_name',query_text:'query_text'};
    for(const [key,name] of Object.entries(map)){const el=$('#miniForm [name="'+name+'"]');const value=fields[key];if(el&&value!==undefined&&value!==null&&String(value).trim()){el.value=String(value);el.classList.add('ai-populated-field');}}
    if(status)status.textContent=result.translationWarning||'AI extraction complete. Review the extracted details before saving.';
    toast('AI extraction complete. Review the fields.');
  }catch(e){if(status)status.textContent=e.message;toast(e.message||'AI extraction failed.',true);}
}
async function loadMiniQueryImages(){
  const box=$('#mini-query-saved-images');if(!box)return;
  try{const no=$('#miniForm [name="checklist_no_display"]')?.value||'';const docs=await api('/api/query-documents?checklistNumber='+encodeURIComponent(no));box.innerHTML=docs.length?'<p class="muted">Saved query images: '+docs.map(d=>'<a target="_blank" rel="noopener" href="'+esc(d.view_url)+'">'+esc(d.original_filename)+'</a>').join(' · ')+'</p>':'<p class="muted">No saved query images yet.</p>';}catch(e){box.innerHTML='';}
}

async function editMiniChecklist(id){
  try{
    const rows=await api('/api/mini-checklists');
    const row=rows.find(x=>String(x.id)===String(id));
    if(!row)throw new Error('Mini Checklist not found');
    const ulb=state.ulbs.find(x=>String(x.id)===String(row.ulb_id));
    if(!ulb)throw new Error('ULB not found');
    miniChecklistForm(ulb,row.future_checklist,row.checklist_no,row);
  }catch(e){toast(e.message||'Unable to edit Mini Checklist',true);}
}
async function deleteMiniChecklist(id){
  if(!confirm('Delete this Mini Checklist?'))return;
  try{await api('/api/mini-checklists/'+encodeURIComponent(id),{method:'DELETE'});await loadRows();register($('#content'));toast('Mini Checklist deleted.');}
  catch(e){toast(e.message||'Unable to delete Mini Checklist',true);}
}
async function createMainFromMini(id){
  try {
    const rows = await api('/api/mini-checklists');
    const mini = rows.find(row => String(row.id) === String(id));
    if (!mini) throw new Error('Mini Checklist not found');
    if (mini.future_checklist !== 'Yes') throw new Error('This Mini Checklist was not marked for future checklist creation');
    newChecklistModal(String(id), String(mini.ulb_id));
  } catch (e) { toast(e.message || 'Unable to open New Checklist workflow', true); }
}

async function registerContextChanged(key, value) {
  if (key === 'ulb') state.ulb = value;
  if (key === 'month') state.month = Number(value);
  try {
    await loadRows();
    const content = $('#content');
    if (state.view === 'register' && content) register(content);
  } catch (error) {
    toast('Could not load Audit Register records: ' + error.message, true);
  }
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
        <div class="field" id="auditVoucherNoField" ${String(row.cheque_issued || '').toUpperCase() === 'Y' ? '' : 'hidden'}>
          <label for="auditVoucherNo">Voucher No.</label>
          <input id="auditVoucherNo" name="voucher_no" type="text" value="${esc(row.voucher_no || '')}" ${String(row.cheque_issued || '').toUpperCase() === 'Y' ? '' : 'disabled'}>
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
  const voucherNoField = $('#auditVoucherNoField');
  const voucherNoInput = $('#auditVoucherNo');
  const setChequeIssued = (value) => {
    chequeIssuedValue.value = value;
    $('#auditChequeIssuedYes').className = `btn ${value === 'Y' ? 'ok' : 'secondary'}`;
    $('#auditChequeIssuedNo').className = `btn ${value === 'N' ? 'bad' : 'secondary'}`;
    paymentModeField.hidden = value !== 'Y';
    paymentModeSelect.required = value === 'Y';
    voucherNoField.hidden = value !== 'Y';
    voucherNoInput.disabled = value !== 'Y';
    if (value !== 'Y') {
      paymentModeSelect.value = '';
      voucherNoInput.value = '';
    }
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
    if (data.cheque_issued !== 'Y') {
      data.payment_mode = '';
      data.voucher_no = '';
    }
    for (const key of ['proposed_payment','payment_passed']) data[key] = Number(data[key] || 0);
    try {
      if (row.is_mini_checklist) {
        let miniId = String(row.mini_checklist_id || row.id || '').replace(/^mini:/, '');
        // Older Audit Register rows may carry the register/audit ID instead of the mini ID.
        // Resolve by stable mini ID first, then by the shared checklist number + ULB.
        const miniRowsResponse = await api('/api/mini-checklists?ulb=' + encodeURIComponent(data.ulb_id));
        const miniRows = Array.isArray(miniRowsResponse) ? miniRowsResponse : (miniRowsResponse.items || miniRowsResponse.rows || []);
        let mini = miniRows.find(item => String(item.id) === miniId);
        if (!mini) mini = miniRows.find(item => String(item.checklist_no || '') === String(row.checklist_no || '') && String(item.ulb_id || '') === String(data.ulb_id || ''));
        if (!mini) throw new Error('Could not find the saved Mini Checklist for this Audit Register row. Refresh the register and try again.');
        miniId = String(mini.id);
        await api('/api/mini-checklists/' + encodeURIComponent(miniId) + '/audit-row', {
          method: 'PATCH',
          body: JSON.stringify({
            file_received_date: data.file_received_date,
            audit_date: data.audit_date,
            scheme_fund: data.scheme_fund,
            nature_work: data.nature_work,
            party: data.party,
            proposed_payment: data.proposed_payment,
            payment_passed: data.payment_passed,
            query_text: data.query_text,
            remarks: data.remarks,
            cheque_issued: data.cheque_issued,
            voucher_no: data.voucher_no,
            payment_mode: data.payment_mode
          })
        });
      } else {
        await api(row.id ? '/api/audits/' + row.id : '/api/audits', {
          method: row.id ? 'PATCH' : 'POST', body: JSON.stringify(data)
        });
      }
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
        ${type === 'date' ? 'lang="en-GB" inputmode="numeric"' : ''}
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
  const rows = state.form2 || [];
  const verifiedCount = rows.filter(x => x.verified).length;
  const attachmentCount = rows.filter(x => x.image_data || x.image_name).length;
  content.innerHTML = `
    <div class="f2-page f2-redesign">
      <header class="f2-hero">
        <div><div class="f2-eyebrow">AUDIT MANAGEMENT / QUERY CONTROL</div><h1>Form-2 Queries</h1><p>Central register for audit queries, checklist details and supporting documents.</p></div>
        <button class="btn primary f2-create" onclick="form2Modal()"><span>＋</span> New Query</button>
      </header>
      <div class="f2-summary">
        <article class="f2-stat"><span>Total Query Sheets</span><strong>${rows.length}</strong><small>All accessible records</small></article>
        <article class="f2-stat"><span>Verified</span><strong>${verifiedCount}</strong><small>${rows.length ? Math.round(verifiedCount/rows.length*100) : 0}% of query sheets</small></article>
        <article class="f2-stat"><span>With Attachments</span><strong>${attachmentCount}</strong><small>Documents available / referenced</small></article>
      </div>
      <section class="f2-panel">
        <div class="f2-panel-head"><div><h3>Query Sheet Register</h3><p>Search, filter, inspect, edit or remove query sheets.</p></div>
          <div class="f2-filter-controls">
            <input id="f2-search" type="search" placeholder="Search number, checklist, party, bill or query…" aria-label="Search Form-2 queries">
            <select id="f2-ulb-filter" aria-label="Filter by ULB"><option value="all">All ULBs</option>${state.ulbs.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>
            <select id="f2-verified-filter" aria-label="Filter verification"><option value="all">All statuses</option><option value="yes">Verified</option><option value="no">Not verified</option></select>
          </div>
        </div>
        <div class="table-wrap f2-table-wrap"><table class="table f2-table"><thead><tr><th>Query Sheet No.</th><th>Checklist No.</th><th>ULB</th><th>Date</th><th>Bill Reference</th><th>Amount</th><th>Party</th><th>Status</th><th>Verification</th><th>Attachment</th><th>Actions</th></tr></thead>
        <tbody id="f2-table-body">${rows.map(row=>{
          const ulbName=state.ulbs.find(x=>String(x.id)===String(row.ulb_id))?.name || '—';
          const searchable=[row.form2_number,row.checklist_no,row.query_date,row.bill_invoice_reference,row.amount,row.party_name,row.query_text,ulbName].filter(Boolean).join(' ').toLowerCase();
          const file=row.image_data ? (row.image_data.startsWith('data:image/') ? `<a class="f2-attachment-preview" href="${row.image_data}" target="_blank" rel="noopener"><img src="${row.image_data}" alt="Attachment"><span>Open attachment ↗</span></a>` : `<a class="f2-file-link" href="${row.image_data}" target="_blank" rel="noopener">View file ↗</a>`) : `<span class="f2-no-file">${row.image_name?'Attachment reference saved':'No attachment'}</span>`;
          const isMini=Boolean(row.is_mini_checklist_query);
          const isDraft=Boolean(row.is_draft_checklist_query||isMini);
          const statusLabel=isMini?'MINI CHECKLIST':(isDraft?'DRAFT':'FINAL');
          return `<tr data-search="${esc(searchable)}" data-verified="${row.verified?'yes':'no'}" data-ulb="${esc(row.ulb_id||'')}"><td><strong>${esc(row.form2_number||'—')}</strong></td><td>${esc(row.checklist_no||'—')}</td><td>${esc(ulbName)}</td><td>${esc(formatDateDMY(row.query_date))}</td><td>${esc(row.bill_invoice_reference||'—')}</td><td class="f2-amount">${money(row.amount)}</td><td>${esc(row.party_name||'—')}</td><td>${pill(statusLabel)}</td><td>${pill(row.verified?'YES':'NO')}</td><td>${file}</td><td><div class="f2-row-actions"><button class="btn btn-sm" onclick="viewForm2Query('${esc(row.id)}')">View</button>${isDraft?`<span class="muted">${isMini?'Manage in Mini Checklist':'Complete checklist to finalize'}</span>`:`<button class="btn btn-sm secondary" onclick="form2Modal('${esc(row.id)}')">Edit</button><button class="btn btn-sm danger" onclick="deleteForm2Query('${esc(row.id)}')">Delete</button>`}</div></td></tr>`;
        }).join('') || `<tr><td colspan="11" class="empty f2-empty"><div class="f2-empty-icon">▤</div><strong>No query sheets found</strong><p>Create a new Form-2 query sheet to get started.</p></td></tr>`}<tr id="f2-no-results" hidden><td colspan="11" class="empty">No matching query sheets found.</td></tr></tbody></table></div>
        <footer class="f2-table-footer"><span id="f2-visible-count">${rows.length} record${rows.length===1?'':'s'}</span><span>Form-2 Query Management</span></footer>
      </section>
    </div>`;
  const search=$('#f2-search'), status=$('#f2-verified-filter'), ulb=$('#f2-ulb-filter');
  const filter=()=>{const q=(search.value||'').trim().toLowerCase();let n=0;$$('#f2-table-body tr[data-search]').forEach(r=>{const show=r.dataset.search.includes(q)&&(status.value==='all'||r.dataset.verified===status.value)&&(ulb.value==='all'||r.dataset.ulb===ulb.value);r.hidden=!show;if(show)n++;});$('#f2-no-results').hidden=n>0||rows.length===0;$('#f2-visible-count').textContent=`${n} record${n===1?'':'s'}`;};
  search.addEventListener('input',filter);status.addEventListener('change',filter);ulb.addEventListener('change',filter);
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

function form2Modal(queryId = null) {
  const existing = queryId ? (state.form2||[]).find(x=>String(x.id)===String(queryId)) : null;
  if (existing?.is_draft_checklist_query || existing?.is_mini_checklist_query) return toast(existing?.is_mini_checklist_query ? 'This query belongs to a Mini Checklist. Edit it in the Mini Checklist record.' : 'This query belongs to a draft checklist. Edit it in the checklist and save the draft.', true);
  if (queryId && !existing) return toast('Form-2 query not found. Refresh and try again.', true);
  const ulbOptions=state.ulbs.map(x=>`<option value="${esc(x.id)}" ${String(existing?.ulb_id||state.ulb)===String(x.id)?'selected':''}>${esc(x.name)}</option>`).join('');
  const auditOptions=state.audits.filter(x=>!existing?.audit_register_id || String(x.id)===String(existing.audit_register_id)).map(x=>`<option value="${esc(x.id)}" ${String(existing?.audit_register_id||'')===String(x.id)?'selected':''}>${esc(x.voucher_no||x.checklist_no||'Audit')} — ${esc(x.party||'')}</option>`).join('');
  modal(`<div class="f2-modal-head"><div><div class="f2-eyebrow">FORM-2 QUERY MANAGEMENT</div><h2>${existing?'Edit Query Sheet':'Create Query Sheet'}</h2><p class="muted">Enter query particulars and attach the supporting document.</p></div><button type="button" class="btn secondary" onclick="closeModal()">✕</button></div>
    <form id="f2" class="f2-edit-form">
      <div class="f2-form-grid">
        <div class="field"><label>ULB *</label><select name="ulb_id" required>${ulbOptions}</select></div>
        <div class="field"><label>Linked Audit Register Row</label><select name="audit_register_id"><option value="">Not linked</option>${auditOptions}</select></div>
        <div class="field"><label>Query Sheet Serial No. *</label><input name="form2_number" required value="${esc(existing?.form2_number||'')}"></div>
        <div class="field"><label>Query Date *</label><input name="query_date" type="date" lang="en-GB" required value="${esc(existing?.query_date||new Date().toISOString().slice(0,10))}"></div>
        <div class="field"><label>Bill / Invoice Reference *</label><input name="bill_invoice_reference" required value="${esc(existing?.bill_invoice_reference||'')}"></div>
        <div class="field"><label>Amount (₹) *</label><input name="amount" type="number" min="0" step="0.01" required value="${esc(existing?.amount??'')}"></div>
        <div class="field"><label>Contractor / Vendor *</label><input name="party_name" required value="${esc(existing?.party_name||'')}"></div>
        <div class="field"><label>Verification Status</label><select name="verified"><option value="false" ${!existing?.verified?'selected':''}>Not verified</option><option value="true" ${existing?.verified?'selected':''}>Verified</option></select></div>
        <div class="field f2-form-wide"><label>Query Details *</label><textarea name="query_text" rows="5" required>${esc(existing?.query_text||'')}</textarea></div>
        <div class="field f2-form-wide"><label>Supporting Attachment (JPG, PNG or PDF; max 7 MB)</label><input type="file" id="f2img" accept="image/png,image/jpeg,application/pdf"><small class="muted">${existing?.image_name?`Current file: ${esc(existing.image_name)}. Choose a new file to replace it.`:'No attachment uploaded yet.'}</small></div>
      </div>
      <div class="actions f2-modal-actions"><button class="btn primary" type="submit">${existing?'Save Changes':'Save Query Sheet'}</button><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button></div>
    </form>`);
  $('#f2').onsubmit=async event=>{
    event.preventDefault();const form=new FormData(event.target);const data=Object.fromEntries(form.entries());
    data.verified=data.verified==='true';data.amount=Number(data.amount||0);data.audit_register_id=data.audit_register_id||null;
    const file=$('#f2img').files[0];if(file){if(file.size>7*1024*1024)return toast('Attachment must be below 7 MB.',true);data.image_name=file.name;data.image_data=await fileToDataUrl(file);}
    try{await api(existing?`/api/form2/${encodeURIComponent(existing.id)}`:'/api/form2',{method:existing?'PATCH':'POST',body:JSON.stringify(data)});closeModal();await loadRows();queries($('#content'));toast(existing?'Form-2 query updated':'Form-2 query saved');}catch(error){toast(error.message,true);}
  };
}

async function deleteForm2Query(queryId){
  const row=(state.form2||[]).find(x=>String(x.id)===String(queryId));if(!row)return toast('Form-2 query not found.',true);if(row.is_draft_checklist_query)return toast('This query belongs to a draft checklist. Edit it in the checklist instead.',true);
  if(!confirm(`Delete Form-2 query ${row.form2_number||''}? This removes the query-sheet record but does not delete its linked checklist.`))return;
  try{await api(`/api/form2/${encodeURIComponent(queryId)}`,{method:'DELETE'});await loadRows();queries($('#content'));toast('Form-2 query deleted');}catch(error){toast(error.message,true);}
}


/* =========================================================
   D4-D7 PAGE
   ========================================================= */


/* Data Entry D4 — editable irregularity tables */
let d4Rows = {major:[{text:''}],minor:[]};
let d4MajorExtraTables = [];
let d4SavedCarryOverrides = null;
let d4CarryRefreshTimer = null;
function d4Calc(input){
 const row=input?.closest('tr');if(!row)return;
 const carry=Number(row.querySelector('.d4-till-last')?.value)||0;
 const current=Number(row.querySelector('.d4-current-month')?.value)||0;
 const cumulative=carry+current;
 const out=row.querySelector('.d4-cumulative');if(out)out.textContent=cumulative.toFixed(2);
 const targetText=row.querySelector('.d4-target-value')?.textContent||'';
 const target=Number(String(targetText).replace(/[^0-9.-]/g,''));
 const percent=row.querySelector('.d4-percent');if(percent)percent.textContent=target>0?(cumulative/target*100).toFixed(2)+'%':'-';
}
function d4ManualCarry(input){d4Calc(input);}
function d4ScheduleCarryRefresh(){
 if(d4CarryRefreshTimer)clearTimeout(d4CarryRefreshTimer);
 d4CarryRefreshTimer=setTimeout(()=>{d4RefreshCarry().catch(error=>console.warn('D4 carry refresh:',error));},250);
}
async function d4RefreshCarry(){
 const rows=[...document.querySelectorAll('.d4-revenue tbody tr')];
 if(!rows.length)return;
 const month=Number(state.month)||4;
 const startYear=d4567FyStartYear();
 const currentYear=month>=4?startYear:startYear+1;
 const totals=[0,0,0,0];
 for(let m=4;m<month;m++){
  const params=new URLSearchParams({code:'D4',ulb:state.ulb,fy:state.fy,month:String(m)});
  const response=await fetch('/api/annexures?'+params.toString());
  if(!response.ok)continue;
  const result=await response.json();
  (result.data?.data?.revenue||[]).forEach((item,i)=>{if(i<totals.length){const values=item.values||[];totals[i]+=Number(values[0]??values[1]??0)||0;}});
 }
 // For January–March, include the previous financial year's April–March months already saved under that FY only when applicable.
 if(month<4){
  for(let m=4;m<=12;m++){
   const params=new URLSearchParams({code:'D4',ulb:state.ulb,fy:state.fy,month:String(m)});
   const response=await fetch('/api/annexures?'+params.toString());if(!response.ok)continue;
   const result=await response.json();(result.data?.data?.revenue||[]).forEach((item,i)=>{if(i<totals.length)totals[i]+=Number((item.values||[])[0]??(item.values||[])[1]??0)||0;});
  }
 }
 rows.forEach((row,i)=>{
  const carry=row.querySelector('.d4-till-last');
  if(carry){const override=d4SavedCarryOverrides?.[i];carry.value=override!==undefined&&override!==null?String(override):totals[i].toFixed(2);}
  const current=row.querySelector('.d4-current-month');d4Calc(current||carry);
 });
}
function d4MonthChanged(value){
 if(!value)return;
 const [year,month]=value.split('-').map(Number);
 if(year!==d4567CalendarYear(month)){toast('Please select a reporting month within the active financial year '+state.fy,true);return;}
 state.month=month;d4SavedCarryOverrides=null;d4567Load('D4');
}
function d4SetTarget(button){
 const row=button?.closest('tr');const target=row?.querySelector('.d4-target-value');if(!target)return;
 const current=target.textContent==='-'?'':target.textContent;
 const value=prompt('Enter annual target (₹ in lacs):',current);if(value===null)return;
 const numeric=Number(String(value).replace(/[,₹\s]/g,''));if(!Number.isFinite(numeric)||numeric<0){toast('Please enter a valid non-negative target.',true);return;}
 target.textContent=numeric?numeric.toString():'-';d4Calc(row.querySelector('.d4-current-month'));
}
function d4RenderRows(kind){
 const body=document.getElementById('d4-'+kind);if(!body)return;
 const rows=d4Rows[kind]||[];
 body.innerHTML=rows.map((row,i)=>`<tr><td>${i+1}</td><td><textarea rows="2" aria-label="${kind} irregularity ${i+1}" oninput="d4Rows.${kind}[${i}].text=this.value">${esc(row.text||'')}</textarea></td><td><button class="btn secondary sm" type="button" onclick="d4RemoveRow('${kind}',${i})">✕</button></td></tr>`).join('');
 const empty=document.getElementById('d4-'+kind+'-empty');if(empty)empty.style.display=rows.length?'none':'block';
}
function d4AddRow(kind){if(!d4Rows[kind])d4Rows[kind]=[];d4Rows[kind].push({text:''});d4RenderRows(kind);}
function d4RemoveRow(kind,index){if(!d4Rows[kind])return;d4Rows[kind].splice(index,1);d4RenderRows(kind);}
function d4NormalizeMajorTable(table){
 const rows=Array.isArray(table.rows)?table.rows:[];
 const columns=Array.isArray(table.columns)&&table.columns.length?table.columns:
   (rows.some(r=>Array.isArray(r.cells))?['Particulars','Details','Remarks']:['Particulars','Details','Remarks']);
 return {title:table.title||'Additional Major Irregularities',columns,
   rows:rows.map(r=>Array.isArray(r.cells)?{cells:columns.map((_,i)=>r.cells[i]??'')}:
     {cells:[r.text||'', '', ''].slice(0,columns.length)})};
}
function d4RenderExtraTables(){
 const host=document.getElementById('d4-major-extra-tables');if(!host)return;
 d4MajorExtraTables=d4MajorExtraTables.map(d4NormalizeMajorTable);
 host.innerHTML=d4MajorExtraTables.map((table,ti)=>`<section class="d4567-card d4-block d4-extra-table"><div class="d4-section-heading"><input class="d4-extra-title" value="${esc(table.title)}" aria-label="Additional table title" oninput="d4MajorExtraTables[${ti}].title=this.value"><button class="btn secondary sm" type="button" onclick="d4RemoveMajorTable(${ti})">Remove table</button></div><div class="d4-table-wrap"><table class="d4-table d4-excel-table"><thead><tr><th class="d4-excel-index">#</th>${table.columns.map((col,ci)=>`<th><input class="d4-excel-heading" aria-label="Column ${ci+1} heading" value="${esc(col)}" oninput="d4MajorExtraTables[${ti}].columns[${ci}]=this.value"><button class="d4-excel-remove-col" type="button" title="Remove column" onclick="d4RemoveExtraMajorColumn(${ti},${ci})">×</button></th>`).join('')}<th class="d4-excel-actions"></th></tr></thead><tbody>${table.rows.map((row,ri)=>`<tr><td class="d4-excel-index">${ri+1}</td>${table.columns.map((_,ci)=>`<td><textarea rows="2" aria-label="Row ${ri+1}, column ${ci+1}" oninput="d4MajorExtraTables[${ti}].rows[${ri}].cells[${ci}]=this.value">${esc(row.cells[ci]||'')}</textarea></td>`).join('')}<td class="d4-excel-actions"><button class="btn secondary sm" type="button" onclick="d4RemoveExtraMajorRow(${ti},${ri})">✕</button></td></tr>`).join('')}</tbody></table></div><div class="d4-excel-controls"><button class="btn secondary sm" type="button" onclick="d4AddExtraMajorRow(${ti})">＋ Add row</button><button class="btn secondary sm" type="button" onclick="d4AddExtraMajorColumn(${ti})">＋ Add column</button></div></section>`).join('');
}
function d4AddMajorTable(){d4MajorExtraTables.push({title:'Additional Major Irregularities',columns:['Particulars','Details','Remarks'],rows:[{cells:['','','']}]});d4RenderExtraTables();}
function d4RemoveMajorTable(index){d4MajorExtraTables.splice(index,1);d4RenderExtraTables();}
function d4AddExtraMajorRow(tableIndex){const t=d4MajorExtraTables[tableIndex];t.rows.push({cells:t.columns.map(()=> '')});d4RenderExtraTables();}
function d4RemoveExtraMajorRow(tableIndex,rowIndex){d4MajorExtraTables[tableIndex].rows.splice(rowIndex,1);d4RenderExtraTables();}
function d4AddExtraMajorColumn(tableIndex){const t=d4MajorExtraTables[tableIndex];t.columns.push('New column');t.rows.forEach(r=>r.cells.push(''));d4RenderExtraTables();}
function d4RemoveExtraMajorColumn(tableIndex,columnIndex){const t=d4MajorExtraTables[tableIndex];if(t.columns.length<=1){toast('A table must have at least one column',true);return;}t.columns.splice(columnIndex,1);t.rows.forEach(r=>r.cells.splice(columnIndex,1));d4RenderExtraTables();}

function d4567Page(content) {
  const sections = [
    { code: 'D4', title: 'Irregularities + Revenue', desc: 'Review recorded irregularities and revenue observations.' },
    { code: 'D5', title: 'Statutory Deductions / Compliance', desc: 'Summarize statutory deductions and compliance matters.' },
    { code: 'D6', title: 'Unpaid / Paid-Un-audited / Advances / FD', desc: 'Review unpaid bills, unaudited payments, advances and fixed deposits.' },
    { code: 'D7', title: 'D7 Data Entry', desc: 'D7 data entry page.' }
  ];
  content.innerHTML = `
    <section class="d-reports-page d4567-page">
      <div class="d-reports-heading"><div>
        <div class="d-reports-eyebrow">REPORTING CENTRE</div>
        <h1 class="d-reports-title"><span class="d-reports-title-icon">▤</span> Data Entry D4-7</h1>
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

function d4567FyStartYear(){
 const match=String(state.fy||'').match(/^(\d{4})-\d{2}$/);
 return match?Number(match[1]):Number(state.fy)||new Date().getFullYear();
}
function d4567CalendarYear(month){
 const start=d4567FyStartYear();
 return Number(month)>=4?start:start+1;
}
function d4567ReportingMonthValue(){
 const month=Number(state.month)||4;
 return `${d4567CalendarYear(month)}-${String(month).padStart(2,'0')}`;
}
function d4567ReportingMonthBounds(){
 const start=d4567FyStartYear();
 return {min:`${start}-04`,max:`${start+1}-03`};
}
function d567MonthRange(value){
 const parts=String(value||'').split('-').map(Number),year=parts[0],month=parts[1];
 if(!year||!month)return '';
 const lastDay=new Date(year,month,0).getDate(),pad=n=>String(n).padStart(2,'0');
 return `01.${pad(month)}.${year}-${pad(lastDay)}.${pad(month)}.${year}`;
}
function d4567UlbChanged(value){
 if(!value)return;
 state.ulb=value;
 const selected=(state.ulbs||[]).find(x=>String(x.id)===String(value));
 if(selected)state.ulbName=selected.name;
 const code=String(state.view||'').toUpperCase();
 if(code==='D4')d4567Load('D4');
 else if(['D5','D6','D7'].includes(code))d4567Load(code);
}
function d567MonthChanged(value){
 if(!value)return;
 const [year,month]=value.split('-').map(Number);
 const expectedYear=d4567CalendarYear(month);
 if(year!==expectedYear){toast('Please select a reporting month within the active financial year '+state.fy,true);return;}
 state.month=month;
 const range=d567MonthRange(value);
 document.querySelectorAll('[data-d5-period-title]').forEach(el=>el.textContent=el.dataset.baseTitle+' ('+range+')');
 const code=String(state.view||'').toUpperCase();if(['D5','D6','D7'].includes(code))d4567Load(code);
}
function d4567DetailPage(content, code) {
  const details = {
    D4: { title: 'Irregularities + Revenue', desc: 'Major and minor irregularities, and revenue receipts.' },
    D5: { title: 'Statutory Deductions / Compliance', desc: 'Summarize statutory deductions and compliance matters.' },
    D6: { title: 'Unpaid / Paid-Un-audited / Advances / FD', desc: 'Review unpaid bills, unaudited payments, advances and fixed deposits.' },
    D7: { title: 'D7 Data Entry', desc: 'D7 data entry page.' }
  };
  const detail = details[code];
  const codes = ['D4','D5','D6','D7'];
  const subnav = `<nav class="d4567-subnav" aria-label="D4 to D7 pages">
    ${codes.map(c => `<button type="button" class="d4567-subnav-btn ${c===code?'active':''}" ${c===code?'aria-current="page"':''} onclick="go('${c.toLowerCase()}')">${c}</button>`).join('')}
    <button type="button" class="d4567-back-btn" onclick="go('d4567')">← All Data Entry D4-7</button></nav>`;
  if (code === 'D4') {
    content.innerHTML = `<section class="d-reports-page d4567-page d4-pdf-layout">
      <div class="d-reports-heading"><div><div class="d-reports-eyebrow">REPORTING CENTRE / D4</div>
      <h1 class="d-reports-title">D4 — Irregularities</h1>
      <p class="d-reports-subtitle">Monthly report · Annexure D-4</p></div></div>
      ${subnav}
      <div class="d4-savebar"><button class="btn primary" type="button" onclick="d4567Save()">Save D4</button><span id="d4567-save-status"></span></div>
      <div class="d4-toolbar"><label>ULB <select id="d4567-ulb" onchange="d4567UlbChanged(this.value)">${state.ulbs.filter(x=>x.active).map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(state.ulb)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>Reporting month <input id="d4-month" type="month" value="${d4567ReportingMonthValue()}" min="${d4567ReportingMonthBounds().min}" max="${d4567ReportingMonthBounds().max}" onchange="d4MonthChanged(this.value)"></label></div>
      <section class="d4567-card d4-block"><div class="d4-section-heading"><h2>Major Irregularities</h2><button class="btn secondary d4-add" type="button" onclick="d4AddMajorTable()">＋ Add Table</button></div><div class="d4-table-wrap"><table class="d4-table"><thead><tr><th>#</th><th>IRREGULARITY &amp; CORRECTIVE ACTION</th><th></th></tr></thead><tbody id="d4-major"></tbody></table></div><button class="btn secondary d4-add" type="button" onclick="d4AddRow('major')">＋ Add row</button><div id="d4-major-extra-tables"></div></section>
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
        {id:'d6-paid-unaudited',title:'List of Bills which were not Audited but Paid By ULB',fields:['DATE','PARTICULAR','VOUCHER NO.','AMOUNT','REMARK'],rows:[],bulkImport:true},
        {id:'d6-fds',title:'Fixed Deposits',fields:['FD NO.','BANK','FUND','AMOUNT','INVESTED','MATURITY','RATE %','REMARK'],rows:[],dateLabel:'FD details as on'},
        {id:'d6-revenue',title:'Revenue Details (reconciliation)',fields:['DATE','RECEIPT AS PER RECEIPT BOOK','RECEIPT AS PER CASHIER CASH BOOK','RECEIPT AS PER BANK STATEMENT','DIFFERENCE (IF ANY)'],rows:[],bulkImport:true}
      ],
      D7: []
    }[code];
    content.innerHTML = `<section class="d-reports-page d4567-page d4-pdf-layout"><div class="d-reports-heading"><div><div class="d-reports-eyebrow">REPORTING CENTRE / ${code}</div><h1 class="d-reports-title">${code} — ${esc(detail.title)}</h1><p class="d-reports-subtitle">Monthly report · Annexure ${code}</p></div></div>${subnav}<div class="d4-savebar"><button class="btn primary" type="button" onclick="d4567Save()">Save ${code}</button><span id="d4567-save-status"></span></div><div class="d4-toolbar"><label>ULB <select id="d4567-ulb" onchange="d4567UlbChanged(this.value)">${state.ulbs.filter(x=>x.active).map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(state.ulb)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>Reporting month <input id="d567-month" type="month" value="${d4567ReportingMonthValue()}" min="${d4567ReportingMonthBounds().min}" max="${d4567ReportingMonthBounds().max}" onchange="d567MonthChanged(this.value)"></label></div>
      ${cfg.map(section=>`<section class="d4567-card d4-block"><h2 ${code==='D5'?'data-d5-period-title data-base-title="'+esc(section.title)+'"':''}>${esc(section.title)}${code==='D5'?' ('+d567MonthRange(d4567ReportingMonthValue())+')':''}</h2>${section.dateLabel?`<label class="d567-date">${section.dateLabel}<input type="date" lang="en-GB" aria-label="${section.dateLabel}"></label>`:''}${section.note?`<p class="d4-note">${esc(section.note)}</p>`:''}${section.id==='d6-paid-unaudited'?`<div class="d6-fd-tools"><div><strong>Bulk import / export</strong><small>Download the Excel template, fill it in Excel, and upload the completed file.</small></div><div class="d6-fd-actions"><button class="btn secondary" type="button" onclick="d6DownloadPaidUnauditedTemplate()">↓ Download Excel Template</button><button class="btn secondary" type="button" onclick="d6ExportPaidUnaudited()">↑ Export current table</button><label class="btn secondary d6-fd-upload-label" for="d6-paid-unaudited-upload">↑ Upload completed file</label><input id="d6-paid-unaudited-upload" type="file" accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden onchange="d6UploadPaidUnauditedFile(this)"></div><span id="d6-paid-unaudited-import-status" class="d6-fd-import-status" aria-live="polite"></span></div>`:''}${section.id==='d6-revenue'?`<div class="d6-fd-tools"><div><strong>Bulk import / export</strong><small>Download the Excel template, fill in the receipt details, and upload the completed file.</small></div><div class="d6-fd-actions"><button class="btn secondary" type="button" onclick="d6DownloadRevenueTemplate()">↓ Download Excel Template</button><button class="btn secondary" type="button" onclick="d6ExportRevenue()">↑ Export current table</button><label class="btn secondary d6-fd-upload-label" for="d6-revenue-upload">↑ Upload completed file</label><input id="d6-revenue-upload" type="file" accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden onchange="d6UploadRevenueFile(this)"></div><span id="d6-revenue-import-status" class="d6-fd-import-status" aria-live="polite"></span></div>`:''}${section.id==='d6-fds'?`<div class="d6-fd-tools"><div><strong>Bulk import / export</strong><small>Download the Excel template, fill it in Excel, and upload it. INVESTED and MATURITY accept any date format.</small></div><div class="d6-fd-actions"><button class="btn secondary" type="button" onclick="d6DownloadFdTemplate()">↓ Download Excel Template</button><label class="btn secondary d6-fd-upload-label" for="d6-fd-upload">↑ Upload completed file</label><input id="d6-fd-upload" type="file" accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden onchange="d6UploadFdFile(this)"></div><span id="d6-fd-import-status" class="d6-fd-import-status" aria-live="polite"></span></div>`:''}<div class="d4-table-wrap"><table class="d4-table d567-table ${section.id==='d6-revenue'?'d6-revenue-table':''}"><thead><tr><th>${section.id==='d6-paid-unaudited'?'S. N.':'Sr. No.'}</th>${section.fields.map(f=>`<th>${esc(f)}</th>`).join('')}<th></th></tr></thead><tbody id="${section.id}"></tbody>${section.id==='d6-revenue'?'<tfoot id="d6-revenue-total"></tfoot>':''}</table><p class="d4-empty" id="${section.id}-empty">No rows yet</p></div><button class="btn secondary d4-add" type="button" onclick="d567AddRow('${section.id}')">＋ ${code==='D7'?'Add observation':section.id==='d5-unpaid-other'?'Add other unpaid bill':'Add row'}</button></section>`).join('')}</section>`;
    d567Sections = cfg;
    cfg.forEach(section=>d567Render(section));
    d4567Load(code);
    return;
  }
  content.innerHTML = `<section class="d-reports-page d4567-page"><div class="d-reports-heading"><div><div class="d-reports-eyebrow">REPORTING CENTRE / DATA ENTRY D4-7</div><h1 class="d-reports-title">${code} — ${esc(detail.title)}</h1><p class="d-reports-subtitle">${esc(detail.desc)}</p></div></div>${subnav}</section>`;
}
let d567Sections=[];
function d567Render(section){
 const body=document.getElementById(section.id); if(!body)return;
 body.innerHTML=section.rows.map((row,i)=>{
   const cells=section.fields.map((field,j)=>{
     const freeFormatFdDate=section.id==='d6-fds'&&['INVESTED','MATURITY'].includes(String(field).trim().toUpperCase());
     const dateFields=['PAYMENT DUE','DEPOSIT DATE','DUE DATE OF FILING','ACTUAL DATE FILED','DATE','DATE APPROVED','INVESTED','MATURITY'];
     const type=dateFields.includes(field)&&!freeFormatFdDate?'date':'text';
     const dateHint=freeFormatFdDate?' placeholder="e.g. 17/06/2026" title="Enter any date format, e.g. 17.06.2026, 17/06/2026, 17-06-2026, 2026-06-17, 2026/06/17, 2026.06.17, 06.17.2026, 06/17/2026 or 06-17-2026"':'';
     return `<td><input type="${type}"${dateHint} value="${esc(row[j]||'')}" aria-label="${esc(field)} ${i+1}" ${section.id==='d6-revenue'&&j>0?'oninput="d6RenderRevenueTotal()"':''}></td>`;
   }).join('');
   return `<tr><td>${i+1}</td>${cells}<td><button class="btn secondary sm" type="button" aria-label="Remove row" onclick="d567RemoveRow('${section.id}',${i})">✕</button></td></tr>`;
 }).join('');
 const empty=document.getElementById(section.id+'-empty'); if(empty)empty.style.display=section.rows.length?'none':'block';
 if(section.id==='d6-revenue')d6RenderRevenueTotal();
}
function d567AddRow(id){const section=d567Sections.find(x=>x.id===id);if(!section)return;section.rows.push(section.fields.map(()=>''));d567Render(section);}
function d567RemoveRow(id,i){const section=d567Sections.find(x=>x.id===id);if(!section)return;section.rows.splice(i,1);d567Render(section);}



function d6ExportPaidUnaudited(){
 const section=d567Sections.find(x=>x.id==='d6-paid-unaudited');if(!section)return;
 section.rows=[...document.querySelectorAll('#d6-paid-unaudited tr')].map(row=>[...row.querySelectorAll('input')].map(input=>input.value));
 const rows=[section.fields,...section.rows];
 if(window.XLSX){
  const ws=XLSX.utils.aoa_to_sheet(rows),wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Paid Unaudited Bills');
  XLSX.writeFile(wb,'D6_Paid_Unaudited_Bills_Export.xlsx');
 }else{
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');
  a.href=url;a.download='D6_Paid_Unaudited_Bills_Export.csv';a.click();URL.revokeObjectURL(url);
 }
 const status=document.getElementById('d6-paid-unaudited-import-status');if(status)status.textContent=`Exported ${section.rows.length} current row(s).`;
}
function d6DownloadPaidUnauditedTemplate(){
 const headers=['DATE','PARTICULAR','VOUCHER NO.','AMOUNT','REMARK'];
 const sample=['17/06/2026','Road repair bill','V-001','25000','Paid by ULB; not audited'];
 if(window.XLSX){
  const ws=XLSX.utils.aoa_to_sheet([headers,sample]);ws['!cols']=[{wch:16},{wch:30},{wch:18},{wch:16},{wch:32}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Paid Unaudited Bills');XLSX.writeFile(wb,'D6_Paid_Unaudited_Bills_Template.xlsx');
 }else{
  const csv=[headers,sample].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='D6_Paid_Unaudited_Bills_Template.csv';a.click();URL.revokeObjectURL(url);
 }
 const status=document.getElementById('d6-paid-unaudited-import-status');if(status)status.textContent='Template downloaded. Fill the rows and upload the completed workbook.';
}
async function d6UploadPaidUnauditedFile(input){
 const file=input?.files?.[0],status=document.getElementById('d6-paid-unaudited-import-status');
 const show=m=>{if(status)status.textContent=m;};if(!file)return;
 const section=d567Sections.find(x=>x.id==='d6-paid-unaudited');
 if(!section){show('Paid-but-unaudited bills table is not ready. Reload D6 and try again.');input.value='';return;}
 if(!canEditFeature('reports')){show('Read-only access: you cannot import rows.');input.value='';return;}
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 try{
  let rows;
  if(['xlsx','xls'].includes(ext)){
   if(!window.XLSX)throw new Error('Excel reader did not load. Refresh the page or save the workbook as CSV UTF-8.');
   const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),sheet=wb.Sheets[wb.SheetNames[0]];
   if(!sheet)throw new Error('The workbook has no worksheet.');
   rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
  }else if(['csv','txt'].includes(ext))rows=d6ParseCsv(await file.text());
  else throw new Error('Please upload .xlsx, .xls or .csv.');
  rows=(rows||[]).filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim()!==''));
  if(rows.length<2)throw new Error('No bill rows found. Fill at least one row below the headings.');
  const expected=['DATE','PARTICULAR','VOUCHER NO.','AMOUNT','REMARK'];
  const normalize=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
  const header=rows[0].map(normalize),idx=expected.map(h=>header.indexOf(h));
  if(idx.some(i=>i<0))throw new Error('Template headings do not match. Download the latest template and do not rename its headings.');
  const imported=rows.slice(1).map(r=>expected.map((_,j)=>String(r[idx[j]]??'').trim())).filter(r=>r.some(v=>v!==''));
  if(!imported.length)throw new Error('No completed bill rows found.');
  const bad=imported.findIndex(r=>r[3]!==''&&!Number.isFinite(Number(r[3].replace(/[₹,\\s]/g,''))));
  if(bad>=0)throw new Error('Amount must be numeric on worksheet row '+(bad+2)+'.');
  imported.forEach(r=>r[3]=r[3].replace(/[₹,\\s]/g,''));
  const existing=section.rows.filter(r=>r.some(v=>String(v??'').trim()!=='')).length;
  if(!confirm(`Import ${imported.length} bill row(s)? This will replace the ${existing} currently displayed row(s) for this ULB and reporting month.`))return;
  section.rows=imported;d567Render(section);show(`Loaded ${imported.length} bill row(s). Click Save D6 to store them.`);
 }catch(error){console.error('D6 paid-but-unaudited import:',error);show('Import failed: '+(error?.message||'Unable to read file.'));}
 finally{input.value='';}
}

function d6RevenueRowsFromTable(){
 const section=d567Sections.find(x=>x.id==='d6-revenue');
 if(!section)return [];
 return [...document.querySelectorAll('#d6-revenue tr')].map(row=>[...row.querySelectorAll('input')].map(input=>input.value));
}
function d6RevenueNumber(value){
 const cleaned=String(value??'').replace(/[₹,\s]/g,'').replace(/%/g,'');
 if(cleaned===''||cleaned==='-')return 0;
 const number=Number(cleaned);return Number.isFinite(number)?number:0;
}
function d6RenderRevenueTotal(){
 const foot=document.getElementById('d6-revenue-total');if(!foot)return;
 const rows=d6RevenueRowsFromTable(),totals=[1,2,3,4].map(index=>rows.reduce((sum,row)=>sum+d6RevenueNumber(row[index]),0));
 const money=value=>value.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 foot.innerHTML=`<tr><th colspan="2">TOTAL</th>${totals.map(value=>`<th>${money(value)}</th>`).join('')}<th></th></tr>`;
}
function d6DownloadRevenueTemplate(){
 const headers=['DATE','RECEIPT AS PER RECEIPT BOOK','RECEIPT AS PER CASHIER CASH BOOK','RECEIPT AS PER BANK STATEMENT','DIFFERENCE (IF ANY)'];
 const sample=['17/06/2026','100000','98000','99000','1000'];
 if(window.XLSX){
  const ws=XLSX.utils.aoa_to_sheet([headers,sample]);ws['!cols']=[{wch:16},{wch:28},{wch:34},{wch:34},{wch:24}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Revenue Reconciliation');XLSX.writeFile(wb,'D6_Revenue_Reconciliation_Template.xlsx');
 }else{
  const csv=[headers,sample].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='D6_Revenue_Reconciliation_Template.csv';a.click();URL.revokeObjectURL(url);
 }
 const status=document.getElementById('d6-revenue-import-status');if(status)status.textContent='Template downloaded. Fill the rows and upload the completed workbook.';
}
function d6ExportRevenue(){
 const section=d567Sections.find(x=>x.id==='d6-revenue');if(!section)return;
 section.rows=d6RevenueRowsFromTable();
 const rows=[['SR. NO.',...section.fields],...section.rows.map((row,i)=>[i+1,...row])];
 if(window.XLSX){
  const ws=XLSX.utils.aoa_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Revenue Reconciliation');
  XLSX.writeFile(wb,'D6_Revenue_Reconciliation_Export.xlsx');
 }else{
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='D6_Revenue_Reconciliation_Export.csv';a.click();URL.revokeObjectURL(url);
 }
}
async function d6UploadRevenueFile(input){
 const file=input?.files?.[0],status=document.getElementById('d6-revenue-import-status');if(!file)return;
 const show=message=>{if(status)status.textContent=message;};
 const section=d567Sections.find(x=>x.id==='d6-revenue');
 if(!section){show('Revenue Details table is not ready. Reload D6 and try again.');input.value='';return;}
 if(!canEditFeature('reports')){show('Read-only access: you cannot import Revenue Details.');input.value='';return;}
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 try{
  let rows;
  if(['xlsx','xls'].includes(ext)){
   if(!window.XLSX)throw new Error('Excel reader did not load. Refresh the page or save the workbook as CSV UTF-8.');
   const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),sheet=wb.Sheets[wb.SheetNames[0]];
   if(!sheet)throw new Error('The workbook has no worksheet.');
   rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
  }else if(['csv','txt'].includes(ext))rows=d6ParseCsv(await file.text());
  else throw new Error('Please upload .xlsx, .xls or .csv.');
  rows=(rows||[]).filter(row=>Array.isArray(row)&&row.some(v=>String(v??'').trim()!==''));
  if(rows.length<2)throw new Error('No revenue rows found. Fill at least one row below the headings.');
  const expected=['DATE','RECEIPT AS PER RECEIPT BOOK','RECEIPT AS PER CASHIER CASH BOOK','RECEIPT AS PER BANK STATEMENT','DIFFERENCE (IF ANY)'];
  const normalize=value=>String(value??'').trim().toUpperCase().replace(/\s+/g,' ');
  const headers=rows[0].map(normalize),indexes=expected.map(value=>headers.indexOf(value));
  if(indexes.some(index=>index<0))throw new Error('Template headings do not match. Download the latest Revenue Reconciliation template and do not rename its headings.');
  const imported=rows.slice(1).map(row=>expected.map((_,i)=>String(row[indexes[i]]??'').trim())).filter(row=>row.some(value=>value!==''));
  if(!imported.length)throw new Error('No completed revenue rows found.');
  for(let r=0;r<imported.length;r++)for(let c=1;c<5;c++){
   const value=imported[r][c].replace(/[₹,\s]/g,'');
   if(value!==''&&!Number.isFinite(Number(value)))throw new Error('Receipt amount / Difference must be numeric on worksheet row '+(r+2)+'.');
   imported[r][c]=value;
  }
  const existing=section.rows.filter(row=>row.some(value=>String(value??'').trim()!=='')).length;
  if(!confirm(`Import ${imported.length} revenue row(s)? This will replace the ${existing} currently displayed row(s) for this ULB and reporting month.`))return;
  section.rows=imported;d567Render(section);show(`Loaded ${imported.length} revenue row(s). Totals are calculated automatically. Click Save D6 to store them.`);
 }catch(error){console.error('D6 Revenue import:',error);show('Import failed: '+(error?.message||'Unable to read file.'));}
 finally{input.value='';}
}

function d6DownloadFdTemplate(){
 const headers=['FD NO.','BANK','FUND','AMOUNT','INVESTED','MATURITY','RATE %','REMARK'];
 const sample=['FD-001','Bank Name','General Fund','100000','2026-04-01','2027-04-01','7.25','Renewal due next year'];
 if(window.XLSX){
  const ws=XLSX.utils.aoa_to_sheet([headers,sample]);
  ws['!cols']=[{wch:16},{wch:22},{wch:20},{wch:16},{wch:16},{wch:16},{wch:12},{wch:32}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Fixed Deposits');
  XLSX.writeFile(wb,'D6_Fixed_Deposits_Template.xlsx');
  const status=document.getElementById('d6-fd-import-status');if(status)status.textContent='Excel template downloaded. Fill the rows and upload the .xlsx file.';
  return;
 }
 const csv=[headers,sample].map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='D6_Fixed_Deposits_Template.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 const status=document.getElementById('d6-fd-import-status');if(status)status.textContent='CSV template downloaded (Excel-compatible). Fill it and upload as CSV UTF-8.';
}
function d6ParseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;text=String(text||'').replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(quoted){if(ch==='"'&&next==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}else if(ch!=='\r')cell+=ch;}
 if(cell.length||row.length){row.push(cell);rows.push(row);}return rows.filter(r=>r.some(v=>String(v||'').trim()!==''));
}
async function d6UploadFdFile(input){
 const file=input?.files?.[0],status=document.getElementById('d6-fd-import-status');if(!file)return;
 const section=d567Sections.find(x=>x.id==='d6-fds');
 const show=message=>{if(status)status.textContent=message;};
 if(!section){show('Fixed Deposits table is not ready. Please reload D6 and try again.');input.value='';return;}
 if(!canEditFeature('reports')){show('Read-only access: you cannot import Fixed Deposits.');input.value='';return;}
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 if(!['xlsx','xls','csv','txt'].includes(ext)){show('Unsupported file. Please upload the downloaded .xlsx template or a .csv file.');input.value='';return;}
 try{
  let parsed;
  if(ext==='xlsx'||ext==='xls'){
   if(!window.XLSX)throw new Error('Excel reader did not load. Refresh the page and try again, or save the workbook as CSV UTF-8.');
   const buffer=await file.arrayBuffer();
   const workbook=XLSX.read(buffer,{type:'array',cellDates:false});
   const sheetName=workbook.SheetNames?.[0];
   if(!sheetName)throw new Error('The Excel workbook has no worksheet.');
   parsed=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:'',raw:false});
  }else parsed=d6ParseCsv(await file.text());
  parsed=(parsed||[]).filter(row=>Array.isArray(row)&&row.some(v=>String(v??'').trim()!==''));
  if(parsed.length<2)throw new Error('No data rows found. Fill at least one row below the column headings.');
  const expected=['FD NO.','BANK','FUND','AMOUNT','INVESTED','MATURITY','RATE %','REMARK'];
  const normalize=s=>String(s??'').trim().toUpperCase().replace(/\s+/g,' ');
  const header=parsed[0].map(normalize),indexes=expected.map(h=>header.indexOf(h));
  if(indexes.slice(0,7).some(i=>i<0))throw new Error('Column headings do not match the Fixed Deposits template. Please use the latest downloaded template without renaming its headings.');
  const imported=parsed.slice(1).map(row=>expected.map((_,j)=>indexes[j]<0?'':String(row[indexes[j]]??'').trim())).filter(row=>row.some(v=>v!==''));
  if(!imported.length)throw new Error('The worksheet contains headings but no filled Fixed Deposit rows.');
  let bad=imported.findIndex(row=>row[3]!==''&&!Number.isFinite(Number(row[3].replace(/[,₹\s]/g,''))));
  if(bad>=0)throw new Error('Amount must be numeric in Excel row '+(bad+2)+'.');
  bad=imported.findIndex(row=>row[6]!==''&&!Number.isFinite(Number(row[6].replace(/[%\s]/g,''))));
  if(bad>=0)throw new Error('Rate % must be numeric in Excel row '+(bad+2)+'.');
  imported.forEach(row=>{row[3]=row[3].replace(/[,₹\s]/g,'');row[6]=row[6].replace(/[%\s]/g,'');});
  const existing=section.rows.filter(row=>row.some(v=>String(v??'').trim()!=='')).length;
  if(!confirm(`Import ${imported.length} Fixed Deposit row(s)? This will replace the ${existing} existing row(s) currently shown for this ULB and reporting month.`))return;
  section.rows=imported;d567Render(section);
  show(`Successfully loaded ${imported.length} Fixed Deposit row(s) into the table. Now click “Save D6” to save them.`);
 }catch(error){console.error('D6 Fixed Deposits import error:',error);show('Import failed: '+(error?.message||'Could not read this file.'));}
 finally{input.value='';}
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
    d4Rows={major:[{text:''}],minor:[]};d4MajorExtraTables=[];
    ['major','minor'].forEach(kind=>d4RenderRows(kind));d4RenderExtraTables();
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
   d4Rows={major:Array.isArray(saved.major)?saved.major:[{text:''}],minor:Array.isArray(saved.minor)?saved.minor:[]};d4MajorExtraTables=Array.isArray(saved.majorTables)?saved.majorTables:[];
   ['major','minor'].forEach(kind=>d4RenderRows(kind));d4RenderExtraTables();
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
  data.major=[...document.querySelectorAll('#d4-major textarea')].map(x=>({text:x.value}));data.minor=[...document.querySelectorAll('#d4-minor textarea')].map(x=>({text:x.value}));data.majorTables=d4MajorExtraTables;
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
          <div class="d-report-hindi-action"><button type="button" class="btn" onclick="openHindiReports()">हिंदी में देखें · AI Hindi Preview</button><span>Open all seven annexures in Hindi on a new editable page.</span></div>
        </div>
      </div>

      <div class="d-report-period-toolbar">
        <label>ULB<select id="reports-ulb" onchange="reportsPeriodChanged('ulb',this.value)">${(state.ulbs||[]).filter(x=>x.active).map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(state.ulb)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label>Reporting Month<input id="reports-month" type="month" value="${d4567ReportingMonthValue()}" min="${d4567ReportingMonthBounds().min}" max="${d4567ReportingMonthBounds().max}" onchange="reportsPeriodChanged('month',this.value)"></label>
        <div class="d-report-period-fy"><small>FINANCIAL YEAR</small><strong>${esc(state.fy)}</strong></div>
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

function reportsPeriodChanged(type, value) {
  if (type === 'ulb') {
    if (!value) return;
    state.ulb = value;
    const selected = (state.ulbs || []).find(x => String(x.id) === String(value));
    if (selected) state.ulbName = selected.name;
  } else if (type === 'month') {
    if (!value) return;
    const parts = value.split('-').map(Number);
    const year = parts[0], month = parts[1];
    if (!year || !month || year !== d4567CalendarYear(month) || month < 1 || month > 12) {
      toast('Please select a reporting month within the active financial year ' + state.fy, true);
      reports(document.getElementById('content'));
      return;
    }
    state.month = month;
  }
  reports(document.getElementById('content'));
}

function openHindiReports() {
  const params = reportParams();
  window.open('/reports-hindi.html?' + params.toString(), '_blank', 'noopener');
}

function selectMonthlyReport(code) {
  selectedMonthlyReport = code;
  const content = document.getElementById('content');
  if (content) reports(content);
}

function reportParams() {
  const monthNumber = Number(state.month) || 4;
  const calendarYear = d4567CalendarYear(monthNumber);
  const startYear = String(calendarYear);

  const month =
    String(monthNumber).padStart(2, '0');

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

let attendanceMonthKey = new Date().toISOString().slice(0, 7);
let attendanceUserFilter = '';
let attendanceSelectedDate = '';

function attendance(content) {
  const isAdmin = state.user?.role === 'admin';
  content.innerHTML = `
    <div class="title">Attendance Management</div>
    <div class="muted">Calendar-based attendance, check-in/check-out history and monthly attendance sheet.</div>
    ${contextBar()}
    <section class="att-hero">
      <div><div class="att-eyebrow">ATTENDANCE OVERVIEW</div><h2>${isAdmin ? 'Team attendance' : 'My attendance'}</h2><p>${isAdmin ? 'Monitor attendance records for every active user.' : 'Your attendance calendar and punch history.'}</p></div>
      <div class="att-month-control"><button class="btn secondary" onclick="changeAttendanceMonth(-1)" aria-label="Previous month">‹</button><input id="attMonth" type="month" value="${attendanceMonthKey}" onchange="setAttendanceMonth(this.value)"><button class="btn secondary" onclick="changeAttendanceMonth(1)" aria-label="Next month">›</button></div>
    </section>
    <div class="att-stats" id="attStats">
      <div class="att-stat"><span>Present days</span><strong>—</strong><small>Unique user-days</small></div>
      <div class="att-stat"><span>Check-ins</span><strong>—</strong><small>IN punches</small></div>
      <div class="att-stat"><span>Check-outs</span><strong>—</strong><small>OUT punches</small></div>
      <div class="att-stat"><span>Exceptions</span><strong>—</strong><small>Outside geofence</small></div>
    </div>
    <div class="att-layout">
      <section class="card att-calendar-card">
        <div class="att-section-head"><div><h3>Monthly calendar</h3><p>Choose a day to view its attendance records.</p></div><span class="att-legend"><i></i> Attendance recorded</span></div>
        <div class="att-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
        <div class="att-calendar" id="attCalendar"></div>
      </section>
      <section class="card att-punch-card">
        <h3>${isAdmin ? 'Record your attendance' : 'Mark attendance'}</h3>
        <p>Server time is used. Location is captured when permission is available.</p>
        <div class="att-punch-actions"><button class="btn ok" onclick="markAttendance('in')">↘ Check-In</button><button class="btn bad" onclick="markAttendance('out')">↗ Check-Out</button></div>
        <div id="gpsStatus" class="muted att-gps">Location not requested.</div>
        <div class="att-tip">Tip: Check in when you start work and check out when you finish.</div>
      </section>
    </div>
    <section class="card att-sheet-card">
      <div class="att-section-head"><div><h3>${isAdmin ? 'All users attendance sheet' : 'My attendance sheet'}</h3><p>Detailed punch records for the selected month.</p></div><button class="btn secondary" onclick="exportAttendanceCSV()">↓ Export CSV</button></div>
      ${isAdmin ? `<div class="att-filters"><label>Filter by user<select id="attUserFilter" onchange="setAttendanceUser(this.value)"><option value="">All users</option></select></label><label>Selected date<input id="attDateFilter" type="date" value="${attendanceSelectedDate}" onchange="setAttendanceDate(this.value)"></label></div>` : `<div class="att-filters"><label>Selected date<input id="attDateFilter" type="date" value="${attendanceSelectedDate}" onchange="setAttendanceDate(this.value)"></label></div>`}
      <div id="attUserSummary"></div><div class="table-wrap"><table class="table att-table"><thead><tr>${isAdmin?'<th>User</th>':''}<th>Date & time</th><th>Type</th><th>ULB</th><th>GPS status</th><th>Distance</th><th>Accuracy</th></tr></thead><tbody id="attRows"><tr><td colspan="${isAdmin?7:6}" class="empty">Loading attendance…</td></tr></tbody></table></div>
      <div class="att-sheet-foot" id="attSheetFoot"></div>
    </section>`;
  loadAttendanceRows();
}

function changeAttendanceMonth(delta) {
  const [y,m] = attendanceMonthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  setAttendanceMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
}
function setAttendanceMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return;
  attendanceMonthKey = value; attendanceSelectedDate = '';
  const monthInput = document.getElementById('attMonth');
  if (monthInput) monthInput.value = value;
  const dateInput = document.getElementById('attDateFilter');
  if (dateInput) { dateInput.value=''; dateInput.min=value+'-01'; dateInput.max=value+'-31'; }
  loadAttendanceRows();
}
function setAttendanceUser(value) { attendanceUserFilter=value; attendanceSelectedDate=''; loadAttendanceRows(); }
function setAttendanceDate(value) { attendanceSelectedDate=value; renderAttendanceUserSummary(window.__attendanceRows || []); renderAttendanceSheet(window.__attendanceRows || []); }

async function loadAttendanceRows() {
  try {
    const qs = new URLSearchParams({month:attendanceMonthKey});
    if (attendanceUserFilter) qs.set('user_id',attendanceUserFilter);
    const rows = await api('/api/attendance?'+qs.toString());
    window.__attendanceUlbs = await api('/api/ulbs').catch(()=>[]);
    window.__attendanceRows = Array.isArray(rows) ? rows : [];
    const isAdmin = state.user?.role === 'admin';
    if (isAdmin) {
      const users = await api('/api/users');
      window.__attendanceUsers = users;
      const select = document.getElementById('attUserFilter');
      if (select) select.innerHTML = '<option value="">All users</option>' + users.map(u=>`<option value="${esc(u.id)}" ${u.id===attendanceUserFilter?'selected':''}>${esc(u.name||u.mobile||'User')}</option>`).join('');
    }
    renderAttendanceDashboard(window.__attendanceRows);
    renderAttendanceUserSummary(window.__attendanceRows);
    renderAttendanceSheet(window.__attendanceRows);
  } catch (error) { toast(error.message || 'Unable to load attendance', true); }
}

function renderAttendanceDashboard(rows) {
  const isAdmin = state.user?.role === 'admin';
  const uniqueDays = new Set(rows.filter(r=>r.type==='IN').map(r=>(isAdmin?r.user_id+'|':'')+String(r.timestamp_server||'').slice(0,10))).size;
  const ins=rows.filter(r=>r.type==='IN').length, outs=rows.filter(r=>r.type==='OUT').length;
  const exceptions=rows.filter(r=>r.status==='OUTSIDE_GEOFENCE').length;
  const stats=document.getElementById('attStats');
  if(stats) stats.innerHTML = [['Present days',uniqueDays,'Unique user-days'],['Check-ins',ins,'IN punches'],['Check-outs',outs,'OUT punches'],['Exceptions',exceptions,'Outside geofence']].map(([a,b,c])=>`<div class="att-stat"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('');
  const [year,month]=attendanceMonthKey.split('-').map(Number);
  const first=new Date(year,month-1,1), total=new Date(year,month,0).getDate();
  const offset=(first.getDay()+6)%7;
  const daysMap={};
  rows.forEach(r=>{const day=String(r.timestamp_server||'').slice(0,10); if(!day)return; (daysMap[day] ||= new Set()).add(r.user_id);});
  const calendar=document.getElementById('attCalendar');
  if(calendar) {
    let html='';
    for(let i=0;i<offset;i++) html+='<div class="att-day empty-day"></div>';
    for(let day=1;day<=total;day++){
      const key=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const count=daysMap[key]?.size||0;
      html+=`<button class="att-day ${count?'has-attendance':''} ${attendanceSelectedDate===key?'selected':''}" onclick="setAttendanceDate('${key}')"><b>${day}</b>${count?`<small>${count} ${isAdmin?'user'+(count===1?'':'s'):'record'+(count===1?'':'s')}</small>`:'<small>—</small>'}</button>`;
    }
    calendar.innerHTML=html;
  }
}

function renderAttendanceUserSummary(rows) {
  const el=document.getElementById('attUserSummary');
  if(!el || state.user?.role!=='admin') { if(el)el.innerHTML=''; return; }
  const users=(window.__attendanceUsers||[]).filter(u=>u.active!==false && (!attendanceUserFilter || u.id===attendanceUserFilter));
  const selected=attendanceSelectedDate;
  const records=selected?rows.filter(r=>String(r.timestamp_server||'').slice(0,10)===selected):rows;
  const summary=users.map(u=>{
    const own=records.filter(r=>r.user_id===u.id);
    const days=new Set(own.filter(r=>r.type==='IN').map(r=>String(r.timestamp_server||'').slice(0,10)));
    return {name:u.name||u.mobile, mobile:u.mobile||'', days:days.size, ins:own.filter(r=>r.type==='IN').length, outs:own.filter(r=>r.type==='OUT').length, exceptions:own.filter(r=>r.status==='OUTSIDE_GEOFENCE').length};
  });
  el.innerHTML=`<div class="att-summary-title">${selected?'Daily':'Monthly'} user-wise summary</div><div class="table-wrap"><table class="table att-table"><thead><tr><th>User</th><th>Present days</th><th>Check-ins</th><th>Check-outs</th><th>Exceptions</th><th>Attendance</th></tr></thead><tbody>${summary.map(x=>`<tr><td><strong>${esc(x.name)}</strong><small class="att-sub">${esc(x.mobile)}</small></td><td>${x.days}</td><td>${x.ins}</td><td>${x.outs}</td><td>${x.exceptions}</td><td><span class="att-type ${x.days?'in':'out'}">${x.days?'RECORDED':'NO RECORD'}</span></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No users found.</td></tr>'}</tbody></table></div>`;
}

function renderAttendanceSheet(rows) {
  const isAdmin=state.user?.role==='admin';
  const filtered=attendanceSelectedDate?rows.filter(r=>String(r.timestamp_server||'').slice(0,10)===attendanceSelectedDate):rows;
  const body=document.getElementById('attRows');
  if(!body)return;
  const ulbNames=window.__attendanceUlbs || [];
  body.innerHTML=filtered.slice().sort((a,b)=>String(b.timestamp_server).localeCompare(String(a.timestamp_server))).map(r=>{
    const ulb=ulbNames.find(x=>x.id===r.ulb_id)?.name||r.ulb_name||r.ulb_id||'—';
    return `<tr>${isAdmin?`<td><strong>${esc(r.user_name||'User')}</strong><small class="att-sub">${esc(r.user_mobile||'')}</small></td>`:''}<td>${new Date(r.timestamp_server).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</td><td><span class="att-type ${r.type==='IN'?'in':'out'}">${r.type==='IN'?'CHECK-IN':'CHECK-OUT'}</span></td><td>${esc(ulb)}</td><td>${pill(r.status||'OK')}</td><td>${r.distance_m!=null?Math.round(r.distance_m)+' m':'—'}</td><td>${r.accuracy!=null?Math.round(r.accuracy)+' m':'—'}</td></tr>`;
  }).join('') || `<tr><td colspan="${isAdmin?7:6}" class="empty">No attendance records for this selection.</td></tr>`;
  const foot=document.getElementById('attSheetFoot');
  if(foot)foot.textContent=`Showing ${filtered.length} of ${rows.length} attendance punches`;
}
async function exportAttendanceCSV() {
  const rows=window.__attendanceRows||[];
  const isAdmin=state.user?.role==='admin';
  const headers=[...(isAdmin?['User','Mobile']:[]),'Date & Time','Type','ULB','Status','Distance (m)','Accuracy (m)','Latitude','Longitude'];
  const values=rows.filter(r=>!attendanceSelectedDate||String(r.timestamp_server||'').slice(0,10)===attendanceSelectedDate).map(r=>[...(isAdmin?[r.user_name,r.user_mobile]:[]),r.timestamp_server,r.type,r.ulb_name||r.ulb_id,r.status,r.distance_m,r.accuracy,r.latitude,r.longitude]);
  const csv=[headers,...values].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`attendance-${attendanceMonthKey}.csv`;a.click();URL.revokeObjectURL(url);
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
            ${formatDateDMY(user.created_at)}
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


// Add additional newspaper entries in every category that has Tender Published.
window.addTenderNewspaper = function(button) {
  const hostId = button.getAttribute('data-newspaper-host');
  const fieldPrefix = button.getAttribute('data-newspaper-prefix');
  const host = document.getElementById(hostId);
  if (!host || !fieldPrefix) return;
  const index = host.querySelectorAll('.tender-newspaper-row').length + 2;
  const row = document.createElement('div');
  row.className = 'tender-newspaper-row';
  row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end;margin-top:10px;';
  const name = `${fieldPrefix}_${index}`;
  row.innerHTML = `<div class="form-group"><label for="${name}">Name of Newspaper</label><input class="form-control" type="text" id="${name}" name="${name}" value=""></div><div><button type="button" class="btn btn-secondary" onclick="this.closest('.tender-newspaper-row').remove()">Remove</button></div>`;
  host.appendChild(row);
};

/* =========================================================
   17. OFFICIAL CHECKLIST DEFINITIONS
   ========================================================= */

const CATEGORY_FORM_DATA = {
  Contractor: {
    title: 'Checklist for Payment of Contractor',
    fields: ['Checklist Date|date','Prepared by','Technical Approval Status|technical_approval_status','Technical Approval No.|technical_approval_no','Technical Approval Date|technical_approval_date|date','Technical Approval Rs.|technical_approval_rs|number','Technical Approval Approved By Name|technical_approval_approved_by_name','Technical Approval Approved By Designation|technical_approval_approved_by_designation','Tender Inviting Approval No.','Tender Inviting Approval Date|date','Tender Inviting Approval Rs.|number','Tender Inviting Approval Approved By (Name & Desig.)','Document Verification as per NIT|yn','Tender Published in, Dated & Bid Due Date','No. of Participants|number','Tender Committee Approval No. & Date & Value','Headed by','Financial Approval No.','Financial Approval Date|date','Financial Approval Rs.|number','Financial Approval Approved By (Name & Desig.)','Percentage of Above / Below from SOR','EMD / TDR|yn','Additional Performance Guarantee (APS) Details if Applicable','Date of Commencement - Actual|date','Date of Work Completion - Actual|date','Extended Date of Completion & Reason|area','Measurement Book No & Page No.','Penal Provision as per Agreement','Availability of Fund as per Letter (No. / Date / Rs.)','Bill No. & Type','Work Completion Certificate|yn','Quality Test Report - Date of Casting and Date of Testing','Mining Clearance Certificate|yn','Previous Bill No.','Previous Note Sheet No.','Previous Bill Amount|number','Previous Gross Payment|number','Previous Deduction|number','Previous Net Payment|number','Comment on Previous Payment (if any)|area','Date of Bill Received and From','Date of Bill Forwarded and To','Result|select:Pass,Pass with Objection,Return,Reject','Major Clause in Note Sheet|area','Reason|area'],
    checks: ['Whether measurement book signed by the Sub-engineer of ULB','Whether measurement book signed by the Assistant-engineer of ULB','Whether measurement book signed by the Executive-engineer of ULB','Please check detailed calculation of MB with SOR. If mistakes found: revised claim less than actual amount, proceed with revised value; if revised claim is more than actual, return it to concerned engineer.','Received by DC(f) and forwarded to Accounts officer','Prepare Calculation in Prescribed excel sheet','Whether Above/Below quoted in bid is added and deducted from bill amount','Refer Note Sheet','Compare gross amount as approved in Voucher from excel sheet','Gross amount approved by Sub Engineer','Same amount approved by Assistant Engineer','Same amount approved by Executive Engineer','Same Amount forwarded by Commissioner','Deduction'],
    deductions: ['Security Deposit','Performance Deposit','Royalty/ Mining Cess','Income Tax','GST','Labor Welfare Fund','Penalty/ LD','Recovery of Advance','Recovery of Material','under/ over payment in last bill','Difference in Amount as per agreement and total invoice till date','TCS'],
    books: ['Measurement book- Sign and Stamp on rectified places','Cheque issue register','Cash Book','Grant Register','Work Register Entry done or not','Budget Control Register','Time limit for completion of Works'],
    docs: ['Quality Test Report as per Agreement','Work Completion Certificate','Clearance Certificate from Mining Department','Tax Invoice from Contractor','Invoice of Bitumin Bill of Bharat Petroleum/Hindusthan Petroleum with Consumption details in Bill for BT work','Geotagged and Signed Photograph of Work - Before Started, During Work, Complete Photograph','Revised Estimate if not produced then payment as per Estimate']
  },
  Consultancy: {
    title:'Checklist for Payment of Consultancy',
    fields:['Month - Financial Year','Note Sheet No. & Date','Prepared by','Zone / Dept. / File No.','Mode of Selection|select:Open Tender,Limited Tender,Nomination,Other','Discretionary Power of','Name of Service','Details of Service|area','Estimated Amount|number','Source of Fund','Admin Approval No.','Admin Approval Date|date','Admin Approval Rs.|number','Admin Approval Approved By (Name & Desig.)','Tender Published in and Dated','No. of Participants|number','Tender Committee Approval No.','Tender Committee Approval Date|date','Value Approved by Tender Committee|number','Headed by','Selected Consultant Name','Reason for Selection|area','PAN No.','TIN / GSTIN No.','Agreement No. and Date','Agreement Value|number','Work Order No. & Date','Bill No.','Bill Amount|number','Penal Provision as per Agreement','Previous Bill No.','Previous Note Sheet No.','Previous Bill Amount|number','Previous Gross Payment|number','Previous Deduction|number','Previous Net Payment|number','Comment on Previous Payment (if any)|area'],
    checks:['Whether Bill approved by appropriate authority?','Whether deliverables submitted by consultant are as per agreement; mention details of authority that reviewed the deliverables','If payment is attendance based, whether proper attendance register maintained and approved by concerned authority','Whether earnest Money/Security Deposit is the prescribed percentage or more of the estimated Consideration value'],
    deductions:['Security Deposit','GST','Income Tax','Labor Welfare Fund','Penalty/ LD','Advance adjusted','under/ over payment in last bill','Difference in Amount as per agreement and total invoice till date'],
    books:['Cheque issue register','Cash Book'], docs:['Invoice','Attendance register if payment is attendance-based','Agreed deliverables / service acceptance records']
  },
  Manpower: {
    title:'Checklist for Payment of Manpower Services',
    fields:['Month - Financial Year','Checklist Date|date','Zone / Dept. / File No.','Item Availability in GEM / Non Availability Report','Mode of Purchase|select:GeM,Open Tender,Limited Tender,Quotation,Other','Name of Service Item & Vendor Name|area','Estimated Amount or Rate Contract|number','Source of Fund','Financial Approval No.','Financial Approval Date|date','Financial Approval Rs.|number','Financial Approval Approved By (Name & Desig.)','Tender Published in and Dated','No. of Participants|number','Tender Committee Approval No.','Tender Committee Approval Date|date','Value Approved by Tender Committee|number','Tender Committee Headed by','Reason for Selection|area','Purchase Order No. & Date','Demand Raised By','Approved By','Received By','Date of Supply (as per PO)|date','Actual Date of Supply|date','Extended Date of Supply & Reason|area','Attendance Verified by','EPF and ESIC paid timely or not|yn','Issue Date & Receiver Name','Penal Provision as per Agreement','Bill No. & Type','Scheme from which Fund Allocated','Grant Type','Remaining Fund in Scheme after Payment|number','Previous Bill No.','Previous Note Sheet No.','Previous Bill Amount|number','Previous Gross Payment|number','Previous Deduction|number','Previous Net Payment|number','Comment on Previous Payment (if any)|area'],
    checks:['Whether copy of agreements/PO/tender for purchases more than Rs.1 lakh was inspected by the Auditor','Whether comparative statements prepared and approved by appropriate authority','Whether earnest Money/Security Deposit is 3% or more of the estimated purchase value','Whether Industries registered as Small-Scale Industrial Units were given priority as per rules','If yes then whether they are given exemption from EMD / Security Deposit','Whether payment is likely to be made within 20 days of invoice/goods received','Whether in case of late payment without reason, interest at prevailing bank rate to be paid alongwith payment','Whether attendance system is proper','Prepare Calculation in Prescribed excel sheet'],
    deductions:['Security Deposit','Income Tax','GST','Labor Welfare Fund','Penalty/ LD','Advance adjusted','under/ over payment in last bill','Difference in Amount as per agreement and total invoice till date'],
    books:['Cheque issue register','Cash Book','Grant Register','Attendance / muster register','Budget Control Register'], docs:['Agreement / PO / tender','Invoice / bill','Attendance records','EPF and ESIC payment proof','Labour licence','Service delivery / issue records','Bank statement']
  },
  'Store Purchase': {
    title:'Checklist for Payment of Store Procurement / Purchase Bill',
    fields:['Month - Financial Year','Checklist Date|date','Zone / Dept. / File No.','Item Availability in GEM / Non Availability Report','Mode of Purchase|select:GeM,Open Tender,Limited Tender,Quotation,Other','Name of Store Item & Vendor Name|area','Detail of Inventories|area','Estimated Amount or Rate Contract|number','Source of Fund','Financial Approval No.','Financial Approval Date|date','Financial Approval Rs.|number','Financial Approval Approved By (Name & Desig.)','Tender Published in and Dated','No. of Participants|number','Tender Committee Approval No.','Tender Committee Approval Date|date','Value Approved by Tender Committee|number','Tender Committee Headed by','Reason for Selection|area','PAN No.','TIN / GSTIN No.','Purchase Order No. & Date','Demand Raised By','Approved By','Received By','Date of Supply (as per PO)|date','Actual Date of Supply|date','Extended Date of Supply & Reason|area','Acknowledgement of Store Keeper with Date','Page No. of Store Book','Issue Date & Receiver Name','Penal Provision as per Agreement','Bill No. & Type','Scheme from which Fund Allocated','Grant Type','Remaining Fund in Scheme after Payment|number','Previous Bill No.','Previous Note Sheet No.','Previous Bill Amount|number','Previous Gross Payment|number','Previous Deduction|number','Previous Net Payment|number','Comment on Previous Payment (if any)|area'],
    checks:['Whether copy of agreements/PO/tender for purchases more than Rs.1 lakh was inspected by the Auditor','Whether comparative statements prepared and approved by appropriate authority','Whether earnest Money/Security Deposit is 3% or more of the estimated purchase value','Whether Industries registered as Small-Scale Industrial Units were given priority as per rules','If yes then whether they are given exemption from EMD / Security Deposit','Whether important plant & machinery purchased from supplier registered with DGA&D','Whether payment is likely to be made within 20 days of invoice/goods received','Whether in case of late payment without reason, interest at prevailing bank rate to be paid alongwith payment','Whether physical verification of inventories are proper','Prepare Calculation in Prescribed excel sheet'],
    deductions:['Security Deposit','Income Tax','GST','Labor Welfare Fund','Penalty/ LD','Advance adjusted','under/ over payment in last bill','Difference in Amount as per agreement and total invoice till date'],
    books:['Cheque issue register','Cash Book','Grant Register','Inventory / Stock Register','Budget Control Register'], docs:['Invoice','Purchase Order / agreement','Goods receipt / store acknowledgement','Inventory entry / stock record']
  },
  'Employee Advance': {
    title:'Checklist for Advances to Employees',
    fields:['Financial Year','Zone / Deptt.','Note Sheet No.','Ledger A/c No.','Advance subsequently disallowed|yn','Name of Employee','Advance Requested|number','Advance Sanctioned|number','Date of Sanction|date','Mode of Payment','Date of Payment|date','No. of Instalments for Recovery|number','Amount of Instalment|number','Total O/s Advance against Employee as on Date|number','Purpose|area','Total Advance Repayment O/s as on Date|number','Approved By','Advance Type|select:Official Use,GPF/CPF,General Fund (Personal Use)'],
    checks:['ADVANCE FOR OFFICIAL USE|heading','A1|Whether application received from employee','A2|Whether expenses is for official work','A3|Whether notesheet signed by Department Head','A4|Whether notesheet signed by sanctioning authority','A5|Whether notesheet signed by DC(F)/ Account Officer','ADVANCE AGAINST GPF/CPF|heading','B1|Whether application received from employee','B2|Whether advance given only for purposes under Rules','B3|Whether all conditions of act complied with','B4|Whether notesheet signed by Department Head','B5|Whether balance checked in Ledger of applicant','B6|Whether notesheet signed by DC(F)/ Account Officer','B7|Whether amount sanctioned does not exceed lower of 3 months pay or 50% of credited balance in GPF/CPF A/c','B8|Whether notesheet signed by sanctioning authority','ADVANCE AGAINST GENERAL FUND (PERSONAL USE)|heading','C1|Whether application received from employee','C2|Whether notesheet signed by Department Head','C3|Whether notesheet signed by sanctioning authority','C4|Whether notesheet signed by Accounts Officer'],
    deductions:[], books:[], docs:[]
  },
  'Misc. Expenses': { title:'Checklist for Miscellaneous Expenses / Contingency', fields:[], checks:['Expenditure is supported by proper sanction of the competent authority.','The expenditure is necessary, permissible and connected with ULB functions.','Original bill / voucher and supporting documents are available.','Payment has been made to the proper person and properly acknowledged.','Rates / charges have been checked for reasonableness.','The expenditure is correctly classified under the relevant account head.','Required recoveries / statutory deductions have been checked.','Vouchers and sub-vouchers have been scrutinised and cancelled / defaced after payment where prescribed.','Payment advice and payment voucher are complete and authorised.','Any recoverable amount / advance has been recorded and followed up.'],
  deductions:['Income Tax','GST','Labor Welfare Fund'], books:[], docs:[] }
};
// A. Register details has its own category mapping. These are only the
// existing A-register fields; this intentionally does not read B fields.
const A_REGISTER_CATEGORY_FIELDS = {
  Contractor: ['prepared_by|Prepared by|text','file_received_date|File Received Date|date','audit_date|Audit Date|date','nature_work|Nature of Work/Service|text','party|Name of Contractor / Vendor / Employee','pan_no|PAN No.','tin_gstin_no|GSTIN No.','scheme_fund|Name of Scheme / Fund','estimated_amount|Estimated Amount|number','estimate_prepared_by_name|Estimate prepared by|text','estimate_prepared_by_authority|Estimate prepared by Authority|text','work_order_no|Work Order No.|text','work_order_date|Work Order Date|date','work_order_value|Work Order Value|number','date_of_commencement_as_per_wo|Date of Commencement - As per WO|date','date_of_work_completion_schedule|Date of Work Completion - Schedule|date','agreement_no|Agreement No.|text','agreement_date|Agreement Date|date','agreement_value|Agreement Value|number','constitution|Constitution|select:Proprietorship Firm,Partnership Firm,Private Limited Company,Public Limited Company,LLP,AOP,Trust,Other'],
  Consultancy: ['prepared_by|Prepared by|text','file_received_date|File Received Date|date','audit_date|Audit Date|date','nature_work|Nature of Work/Service|text','details_of_service|Details of Service|text','party|Name of Contractor / Vendor / Employee','pan_no|PAN|text','tin_gstin_no|GSTIN No.|text','scheme_fund|Name of Scheme / Fund','estimated_amount|Estimated Amount|number','work_order_no|Work Order No.|text','work_order_date|Work Order Date|date','work_order_value|Work Order Value|number','agreement_no|Agreement No.|text','agreement_date|Agreement Date|date','agreement_value|Agreement Value|number'],
  Manpower: ['prepared_by|Prepared by|text','file_received_date|File Received Date|date','audit_date|Audit Date|date','party|Name of Contractor / Vendor / Employee','pan_no|PAN No.','gstin_no|GSTIN No.','epf_details|Details of EPF|area','esic_details|Details of ESIC|area','labour_licence|Labour Licence|area','scheme_fund|Name of Scheme / Fund'],
  'Store Purchase': ['prepared_by|Prepared by|text','file_received_date|File Received Date|date','audit_date|Audit Date|date','nature_work|Nature of Work|area','party|Name of Contractor / Vendor / Employee','pan_no|PAN No.','tin_gstin_no|GSTIN No.','scheme_fund|Name of Scheme / Fund'],
  'Employee Advance': ['prepared_by|Prepared by|text','file_received_date|File Received Date|date','audit_date|Audit Date|date','party|Name of Contractor / Vendor / Employee','pan_no|PAN|text','designation_of_employee|Designation of Employee|text','scheme_fund|Name of Scheme / Fund'],
  'Misc. Expenses': ['prepared_by|Prepared by|text','file_received_date|File Received Date|date','audit_date|Audit Date|date','nature_work|Nature of Work|area','party|Name of Contractor / Vendor / Employee','pan_no|PAN|text','tin_gstin_no|GSTIN No.','scheme_fund|Name of Scheme / Fund','constitution|Constitution|select:Proprietorship Firm,Partnership Firm,Private Limited Company,Public Limited Company,LLP,AOP,Trust,Other']
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
let checklistListRequestId = 0;


function checklistListFilters() {
  return `
    <section class="checklist-filter-panel" aria-label="Checklist filters and sorting">
      <div class="checklist-filter-panel-heading">Filter &amp; Sort</div>
      <div class="form-grid four checklist-filter-grid">
        <div class="field">
          <label for="clSortOrder">Sort by</label>
          <select id="clSortOrder" class="sort-order-dropdown" aria-label="Sort Checklists" onchange="checklistSortOrder=this.value; loadChecklistList()">
            <option value="new" ${checklistSortOrder==='new'?'selected':''}>New First</option>
            <option value="old" ${checklistSortOrder==='old'?'selected':''}>Old First</option>
          </select>
        </div>

        <div class="field">
          <label for="clDistrict">District</label>
          <select id="clDistrict" onchange="window.checklistDistrictFilter=this.value; loadChecklistList()">
            <option value="">All Districts</option>
            ${state.districts.map(district => `
              <option value="${district.id}" ${String(window.checklistDistrictFilter||'')===String(district.id)?'selected':''}>${esc(district.name)}</option>
            `).join('')}
          </select>
        </div>

        <div class="field">
          <label for="clUlb">ULB</label>
          <select id="clUlb" onchange="window.checklistUlbFilter=this.value; loadChecklistList()">
            <option value="">All ULBs</option>
            ${state.ulbs.filter(ulb => ulb.active).map(ulb => `
              <option value="${ulb.id}" ${String(window.checklistUlbFilter||'')===String(ulb.id)?'selected':''}>${esc(ulb.name)}</option>
            `).join('')}
          </select>
        </div>

        <div class="field">
          <label for="clSearch">Search</label>
          <input id="clSearch" value="${esc(window.checklistSearchText||'')}" placeholder="Search checklist no., duplicate no., ULB, party, work order, voucher..." oninput="window.checklistSearchText=this.value; debouncedChecklistList()" autocomplete="off">
        </div>
      </div>
    </section>
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
  const requestId = ++checklistListRequestId;
  const searchWasFocused = document.activeElement?.id === 'clSearch';
  const searchSelectionStart = searchWasFocused ? $('#clSearch').selectionStart : null;
  const searchSelectionEnd = searchWasFocused ? $('#clSearch').selectionEnd : null;
  if ($('#clDistrict')) window.checklistDistrictFilter = $('#clDistrict').value;
  if ($('#clUlb')) window.checklistUlbFilter = $('#clUlb').value;
  if ($('#clSearch')) window.checklistSearchText = $('#clSearch').value;

  try {
    const query = new URLSearchParams();
    if (window.checklistDistrictFilter) query.set('district_id', window.checklistDistrictFilter);
    if (window.checklistUlbFilter) query.set('ulb_id', window.checklistUlbFilter);
    if (window.checklistSearchText) query.set('q', window.checklistSearchText.trim());

    const rows = await api('/api/checklist-records?' + query);
    if (requestId !== checklistListRequestId || !$('#content')) return;

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
                  <th>DUPLICATE NO.</th>
                  <th>TYPE</th>
                  <th>ULB</th>
                  <th>WORK / PARTY</th>
                  <th>WORK ORDER NO.</th>
                  <th>AUDIT DATE</th>
                  <th>NET ₹</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(row => `
                  <tr class="checklist-click-row" data-sort-date="${recordSortTimestamp(row)}" onclick="openChecklist('${String(row.id).replace(/'/g, "\\'")}')">
                    <td><span class="checklist-number">${esc(row.checklist_no || '—')}</span></td>
                    <td><span class="checklist-number">${esc(row.duplicate_no || '—')}</span></td>
                    <td><span class="checklist-type">${esc(row.type || '—')}</span></td>
                    <td>
                      <span class="checklist-ulb">${esc(ulbName(row.ulb_id))}</span>
                      <small class="checklist-district">${esc(districtName(row.district_id))}</small>
                    </td>
                    <td>
                      <span class="checklist-work">${esc(row.work || row.register?.nature_work || '—')}</span>
                      <small class="checklist-party">${esc(row.party || row.register?.party || '')}</small>
                    </td>
                    <td><span class="checklist-work-order">${esc(row.register?.work_order_no || row.work_order_no || '—')}</span></td>
                    <td class="checklist-date">${esc(formatDateDMY(row.audit_date || row.register?.audit_date))}</td>
                    <td class="checklist-money">${money(row.net_eligible || 0)}</td>
                    <td><span class="checklist-status ${String(row.status || 'Draft').toLowerCase() === 'final' ? 'final' : 'draft'}">${esc(row.status || 'Draft')}</span></td>
                    <td><button class="btn btn-small checklist-duplicate-btn" type="button" ${row.can_duplicate === false ? 'disabled title="This checklist has already been duplicated"' : ''} onclick="event.stopPropagation(); duplicateChecklist('${String(row.id).replace(/'/g, "\\'")}')">${row.can_duplicate === false ? 'Already Duplicated' : 'Duplicate'}</button></td>
                  </tr>
                `).join('') || `<tr><td colspan="10" class="empty checklist-empty">No checklists found.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    `;
    sortTableBody('.checklist-table', checklistSortOrder, 'tr[data-sort-date]');
    // loadChecklistList redraws the page; restore the search box so typing never loses focus.
    if (searchWasFocused) {
      const searchInput = $('#clSearch');
      if (searchInput) {
        searchInput.value = window.checklistSearchText || '';
        searchInput.focus({ preventScroll: true });
        if (searchSelectionStart !== null && searchSelectionEnd !== null) {
          const pos = Math.min(searchSelectionStart, searchInput.value.length);
          const end = Math.min(searchSelectionEnd, searchInput.value.length);
          searchInput.setSelectionRange(pos, end);
        }
      }
    }
  } catch (error) {
    content.innerHTML = `<div class="card"><b>Unable to load checklists</b><p>${esc(error.message)}</p></div>`;
  }
}

async function duplicateChecklist(id) {
  try {
    const copy = await api(`/api/checklist-records/${encodeURIComponent(id)}/duplicate`, { method: 'POST', body: '{}' });
    toast(`Checklist ${copy.checklist_no} created (Duplicate No. ${copy.duplicate_no || '—'})`);
    // Open the newly created copy immediately so the user can verify its
    // carried-forward Payment History in Contractor > Bill Details.
    await openChecklist(copy.id);
  } catch (error) {
    toast(error.message || 'Unable to duplicate checklist', true);
  }
}

/* =========================================================
   20. CREATE NEW CHECKLIST
   ========================================================= */

function newChecklistModal(miniId = null, lockedUlbId = null) {
  modal(`
    <h2>
      New checklist
    </h2>
    ${miniId ? '<p class="muted">This checklist will continue the saved Mini Checklist using its existing checklist number and information.</p>' : ''}


    <div class="field">

      <label>
        ULB
      </label>

      <select id="newClUlb" ${miniId ? 'disabled aria-disabled="true" title="ULB is locked to the Mini Checklist"' : ''}>

        ${state.ulbs
          .filter(ulb => ulb.active)
          .map(ulb => `
            <option
              value="${ulb.id}"
              ${
                String(ulb.id) === String(lockedUlbId || state.ulb)
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

  window.newChecklistType = checklistTypes()[0];
  window.newChecklistFromMiniId = miniId ? String(miniId) : null;
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
    let checklist;
    if (window.newChecklistFromMiniId) {
      checklist = await api('/api/mini-checklists/' + encodeURIComponent(window.newChecklistFromMiniId) + '/create-checklist', {
        method: 'POST', body: JSON.stringify({ type, ulb_id: ulb, seed: checklistSeedRecord(type) })
      });
      window.newChecklistFromMiniId = null;
    } else {
      const seed = checklistSeedRecord(type);
      checklist = await api('/api/checklist-records', {
        method: 'POST',
        body: JSON.stringify({ ulb_id: ulb, type, financial_year: state.fy, month: Number(state.month), register: seed.register, file_details: seed.file_details, checks: seed.checks, deductions: seed.deductions, books: seed.books, result_details: seed.result_details })
      });
    }
    closeModal();
    await openChecklist(checklist.id);
  } catch (error) {
    toast(error.message, true);
  }
}


async function openPaymentHistoryChecklist(checklistNo, ulbId = '') {
  const number = String(checklistNo || '').trim();
  if (!number) return;
  try {
    const params = new URLSearchParams({ q: number });
    if (ulbId) params.set('ulb_id', String(ulbId));
    const rows = await api('/api/checklist-records?' + params.toString());
    const matches = (Array.isArray(rows) ? rows : []).filter(row => String(row.checklist_no || '').trim() === number);
    const match = matches.find(row => !ulbId || String(row.ulb_id || '') === String(ulbId)) || matches[0];
    if (!match) {
      toast(`Checklist ${number} was not found. It may be a manual history entry or may belong to another ULB.`);
      return;
    }
    await openChecklist(match.id);
  } catch (error) {
    toast(error.message || `Unable to open checklist ${number}.`);
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

  // Backfill deduction rows introduced in newer checklist versions.
  // Older Contractor records may have been saved with only rows 1–11,
  // so rendering their saved deductions directly hid the new Other row.
  const draft = state.checklistDraft;
  // Backfill the newly added Manpower document checkbox for older saved checklists.
  // Preserve all existing document selections and append Bank statement only if absent.
  if (draft.type === 'Manpower') {
    draft.books = draft.books && typeof draft.books === 'object' ? draft.books : {};
    draft.books.documents = Array.isArray(draft.books.documents) ? draft.books.documents : [];
    const bankStatement = draft.books.documents.find(item =>
      String(item.label || '').trim().toLowerCase() === 'bank statement'
    );
    if (!bankStatement) {
      draft.books.documents.push({ label: 'Bank statement', checked: false });
    }
  }
  const deductionHeads = OFFICIAL_CHECKLISTS[draft.type]?.deductions || [];
  draft.deductions = Array.isArray(draft.deductions) ? draft.deductions : [];
  // Remove the legacy fixed 'Other' deduction row across categories; user-added rows remain editable/removable.
  draft.deductions = draft.deductions.filter(item => String(item.head || '').trim().toLowerCase() !== 'other');
  deductionHeads.forEach((head, index) => {
    const exists = draft.deductions.some((item) =>
      String(item.head || '').trim().toLowerCase() === head.toLowerCase()
    );
    if (!exists) {
      draft.deductions.push({
        code: String(index + 1),
        head,
        rate: '',
        amount: '',
        remark: ''
      });
    }
  });
  // Keep official row order while retaining any custom deduction rows already saved.
  draft.deductions.sort((a, b) => {
    const ai = deductionHeads.findIndex((head) => head.toLowerCase() === String(a.head || '').trim().toLowerCase());
    const bi = deductionHeads.findIndex((head) => head.toLowerCase() === String(b.head || '').trim().toLowerCase());
    if (ai < 0 && bi < 0) return 0;
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });
  // TCS must remain the final row, even when custom deduction rows exist.
  const tcsIndex = draft.deductions.findIndex(item => String(item.head || '').trim().toLowerCase() === 'tcs');
  if (tcsIndex >= 0) {
    const [tcsRow] = draft.deductions.splice(tcsIndex, 1);
    tcsRow.rate = '2';
    if (draft.file_details?.tcs_excess_royalty !== undefined && draft.file_details?.tcs_excess_royalty !== '') {
      tcsRow.amount = Number(draft.file_details.tcs_excess_royalty) || 0;
    }
    draft.deductions.push(tcsRow);
  }
  draft.deductions.forEach((item, index) => {
    item.code = String(index + 1);
  });

  state.view =
    'checklist-detail';

  await renderView();
}


/* =========================================================
   21. CHECKLIST DETAIL HELPERS
   ========================================================= */

function normalizeRaBillAmountNumeric(value) {
  const raw = String(value ?? '').replace(/\s*Cumulative\s*$/i, '').replace(/,/g, '').trim();
  if (!raw) return '';
  const number = Number(raw);
  return Number.isFinite(number) ? String(number) : '';
}
function formatRaBillAmountCumulativeText(value, currency = false) {
  const numeric = normalizeRaBillAmountNumeric(value);
  if (numeric === '') return '—';
  const amount = Number(numeric).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `${currency ? '₹ ' : ''}${amount} Cumulative`;
}

window.formatManualHistoryRaAmount = function(input, mode = 'input') {
  if (!input) return;
  const numeric = normalizeRaBillAmountNumeric(input.value);
  if (mode === 'focus') input.value = numeric;
  else if (mode === 'blur' && numeric !== '') input.value = formatRaBillAmountCumulativeText(numeric, false);
  else if (mode === 'input') input.value = input.value.replace(/\s*Cumulative\s*$/i, '').replace(/[^0-9.]/g, '');
};

window.formatRaBillAmountCumulativeInput = function(input, mode = 'input') {
  if (!input) return;
  const form = input.closest('form') || document;
  const hidden = form.querySelector('[name="ra_bill_amount"]');
  const numeric = normalizeRaBillAmountNumeric(input.value);
  if (hidden) hidden.value = numeric;
  if (mode === 'focus') {
    input.value = numeric;
  } else if (mode === 'blur' && numeric !== '') {
    input.value = `${numeric} Cumulative`;
  } else if (mode === 'input') {
    // Keep the editable value numeric while typing; append the suffix on blur.
    input.value = input.value.replace(/\s*Cumulative\s*$/i, '').replace(/[^0-9.]/g, '');
  }
  if (typeof window.calculateContractorRaFinalAmount === 'function') window.calculateContractorRaFinalAmount();
};

function formatRaNumberFromMbBookValue(value) {
  const raw = String(value == null ? '' : value).trim().replace(/^R+/i, '').trim();
  return raw ? `R${raw}` : '';
}

window.formatRaNumberFromMbBookBookInput = function(input) {
  if (!input) return;
  const start = input.selectionStart;
  const oldValue = input.value;
  const formatted = formatRaNumberFromMbBookValue(oldValue);
  if (formatted !== oldValue) {
    input.value = formatted;
    // Keep the caret at the end after adding the R prefix.
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
  }
};

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
        ${type === 'date' ? 'lang="en-GB" inputmode="numeric"' : ''}
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
  return ['form2_number', 'query_date', 'query_text']
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

      <button type="button" class="btn secondary" onclick="exportChecklistPdf()" title="Export all checklist sections as a printable PDF">Export PDF</button>
      <button type="button" class="btn secondary" onclick="exportChecklistExcel()" title="Export all checklist sections to an Excel-compatible workbook">Export Excel</button>

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

  // Duplicate checklists keep their source SOR values, but those fields are
  // read-only so the duplicate cannot change the original SOR basis.
  if (checklist.duplicated_from && state.checklistTab === 'B') {
    const form = document.getElementById('clForm');
    if (form) {
      ['sor_base_value', 'sor_percentage', 'sor_option', 'computed_bid_value'].forEach(name => {
        const field = form.querySelector(`[name="${name}"]`);
        if (!field) return;
        field.readOnly = true;
        field.disabled = false;
        field.setAttribute('aria-readonly', 'true');
        field.style.backgroundColor = '#f1f5f9';
        field.style.cursor = 'not-allowed';
      });
      const atParButton = form.querySelector('.sor-at-par-field button');
      if (atParButton) { atParButton.disabled = true; atParButton.style.cursor = 'not-allowed'; }
      const atParToggle = form.querySelector('[name="sor_at_par"]');
      if (atParToggle) atParToggle.disabled = true;
    }
  }

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
    // Highlight the requested key Register Details fields with a red border.
    // This is scoped to Section A only and does not change validation or saving.
    const redBorderFields = {
      Contractor: ['nature_work', 'scheme_fund', 'party', 'pan_no'],
      'Employee Advance': ['file_received_date', 'audit_date', 'party', 'scheme_fund', 'pan_no'],
      Manpower: ['file_received_date', 'audit_date', 'party', 'scheme_fund', 'pan_no'],
      Consultancy: ['file_received_date', 'audit_date', 'nature_work', 'scheme_fund', 'party', 'pan_no'],
      'Store Purchase': ['file_received_date', 'audit_date', 'nature_work', 'scheme_fund', 'party', 'pan_no'],
      'Misc. Expenses': ['file_received_date', 'audit_date', 'nature_work', 'scheme_fund', 'party', 'pan_no']
    };
    const redKeys = new Set(redBorderFields[data.type] || []);
    const controls = fields.map(raw => {
      const [key, label, spec = 'text'] = raw.split('|');
      const value = data.register?.[key] ?? (key === 'prepared_by' ? (data.file_details?.prepared_by ?? '') : '');
      let markup;
      if (spec === 'area') markup = clArea(key, label, value);
      else if (spec.startsWith('select:')) markup = clSelect(key, label, value, spec.slice(7).split(','));
      else markup = clField(key, label, value, spec === 'date' || spec === 'number' ? spec : 'text');
      if (redKeys.has(key)) markup = markup.replace('class="field"', 'class="field register-red-border"');
      return markup;
    }).join('');
    return `<div class="contractor-style-scope contractor-tab-a"><form id="clForm" class="form-grid three"><div class="checklist-section-heading contractor-style-title" style="grid-column:1/-1;font-weight:700">${esc(OFFICIAL_CHECKLISTS[data.type]?.title || data.type)}</div>${controls}</form></div>`;
  }

  /* -------------------------------------------------------
     TAB B — FILE DETAILS
     ------------------------------------------------------- */

  if (state.checklistTab === 'B') {
    const file = data.file_details || {};

    // Manpower B. File Details: fields and conditional details from the supplied form.
    if (data.type === 'Manpower') {
      const saved = (key) => file[key] ?? '';
      const panel = (title, body) => `<section class="contractor-design-section" style="grid-column:1/-1;margin:0 0 24px;background:#fff;border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,.04)"><h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 16px">${esc(title)}</h3><div class="form-grid three">${body}</div></section>`;
      const statusGroup = (key, title, details = '', showDetailsWhen = 'Yes') => {
        const status = saved(key), detailId = `${key}Details`;
        const buttons = `<div class="contractor-approval-row" style="grid-column:1/-1"><label class="contractor-approval-label">${esc(title)}</label><div class="contractor-status-buttons" style="display:flex;gap:0;flex-wrap:wrap">${['Yes','No','NA'].map(option => `<label class="choice-button ${status===option?'selected':''}" style="display:inline-flex;align-items:center;justify-content:center;min-width:42px;border:1px solid ${status===option?'#16a34a':'#cbd5e1'};background:${status===option?'#ecfdf5':'#fff'};color:${status===option?'#166534':'#334155'};padding:8px 14px;cursor:pointer"><input type="radio" name="${key}" value="${option}" ${status===option?'checked':''} style="position:absolute;opacity:0;width:1px;height:1px" onchange="(function(el){var box=document.getElementById('${detailId}');if(box){var show=el.value==='${showDetailsWhen}';box.hidden=!show;box.style.setProperty('display',show?'grid':'none','important');}var group=el.closest('.contractor-status-buttons');if(group){group.querySelectorAll('.choice-button').forEach(function(btn){var input=btn.querySelector('input'),active=input.checked;btn.classList.toggle('selected',active);btn.style.borderColor=active?'#16a34a':'#cbd5e1';btn.style.background=active?'#ecfdf5':'#fff';btn.style.color=active?'#166534':'#334155';});}})(this)"><span>${option}</span></label>`).join('')}</div></div>`;
        return buttons + (details ? `<div id="${detailId}" class="form-grid three contractor-detail-expand" ${status===showDetailsWhen?'':'hidden'} style="grid-column:1/-1;display:${status===showDetailsWhen?'grid':'none'}${status===showDetailsWhen?'':' !important'}">${details}</div>` : '');
      };
      const approvalDetails = (prefix, label) =>
        clField(`${prefix}_no`, `${label} No.`, saved(`${prefix}_no`)) +
        clField(`${prefix}_date`, `${label} Date`, saved(`${prefix}_date`), 'date') +
        clField(`${prefix}_amount`, `${label} Rs.`, saved(`${prefix}_amount`), 'number') +
        clField(`${prefix}_approved_by_name`, `${label} Approved By Name`, saved(`${prefix}_approved_by_name`)) +
        clField(`${prefix}_approved_by_designation`, `${label} Approved By Designation`, saved(`${prefix}_approved_by_designation`));
      const modeOptions = ['GEM','OPEN TENDER','LIMITED TENDER','QUOTATION','OTHER'];
      const modeOther = clField('manpower_mode_purchase_other','Other Mode of Purchase',saved('manpower_mode_purchase_other'));
      const form = [
        panel('1. Item Availability in GeM', statusGroup('manpower_item_availability_gem','Item Availability in GeM',
          statusGroup('manpower_non_availability_report','Non-Availability Report',''), 'No')),
        panel('2. Mode of Purchase & Source of Fund',
          clSelect('manpower_mode_of_purchase','Mode of Purchase',saved('manpower_mode_of_purchase'),modeOptions) +
          modeOther +
          clField('manpower_estimated_amount_rate_contract','Estimated Amount or Rate Contract',saved('manpower_estimated_amount_rate_contract')) +
          clField('manpower_source_of_fund','Source of Fund',saved('manpower_source_of_fund'))),
        panel('3. Financial Approval', statusGroup('manpower_financial_approval_status','Financial Approval',approvalDetails('manpower_financial_approval','Financial Approval'))),
        panel('4. Tender Published', statusGroup('manpower_tender_published_status','Tender Published',
          clField('manpower_tender_publication_date','Date of Published',saved('manpower_tender_publication_date'),'date') +
          clField('manpower_tender_newspaper_name','Name of Newspaper',saved('manpower_tender_newspaper_name')) + `<div id=\"manpower-newspaper-extra-rows\"></div><button type=\"button\" class=\"btn btn-secondary\" data-newspaper-host=\"manpower-newspaper-extra-rows\" data-newspaper-prefix=\"manpower_tender_newspaper_name\" onclick=\"addTenderNewspaper(this)\">+ Add Newspaper</button>`)),
        panel('5. Tender Committee Approval', statusGroup('manpower_tender_committee_approval_status','Tender Committee Approval',approvalDetails('manpower_tender_committee_approval','Tender Committee Approval'))),
        panel('6. Purchase Order',
          clField('manpower_purchase_order_no','No.',saved('manpower_purchase_order_no')) +
          clField('manpower_purchase_order_date','Date',saved('manpower_purchase_order_date'),'date')),
        panel('7. Supply & Verification',
          clField('manpower_demand_raised_by','Demand Raised By',saved('manpower_demand_raised_by')) +
          clField('manpower_approved_by','Approved By',saved('manpower_approved_by')) +
          clField('manpower_received_by','Received By',saved('manpower_received_by')) +
          clField('manpower_date_supply_as_per_po','Date of Supply (as per PO)',saved('manpower_date_supply_as_per_po'),'date') +
          clField('manpower_actual_date_supply','Actual Date of Supply',saved('manpower_actual_date_supply'),'date') +
          statusGroup('manpower_extended_date_supply_status','Extended Date of Supply',
            clField('manpower_extended_date_supply','Extended Date of Supply',saved('manpower_extended_date_supply'),'date') +
            clField('manpower_extended_date_reason','Reason',saved('manpower_extended_date_reason'))) +
          statusGroup('manpower_attendance_verified_by_status','Attendance Verified By') +
          statusGroup('manpower_epf_esic_status','EPF/ESIC')),
        panel('8. Panel Provision & Bill Details',
          statusGroup('manpower_panel_provision_status','Panel Provision as per Agreement') +
          `</div>`),
          panel('9. Bill Details', `<div class="contractor-subsection manpower-bill-details-box" style="grid-column:1/-1;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><div class="form-grid manpower-bill-fields"><div class="field"><label>Bill Type</label><select name="manpower_bill_type"><option value="">Select...</option>${['RA bill','Final'].map(v=>`<option value="${v}" ${saved('manpower_bill_type')===v?'selected':''}>${v}</option>`).join('')}</select></div>${clField('manpower_bill_no','Bill No.',saved('manpower_bill_no'))}${clField('bill_amount', 'Bill Amount (Rs.)', saved('bill_amount'), 'number').replace('<input', '<input min="0" step="0.01" oninput="updateChecklistGrossFromFileDetails(this.value)"')}</div></div>`),
        panel('10. Remaining Fund in Scheme after Payment',
          clField('manpower_amount_sanctioned','Amount Sanctioned',saved('manpower_amount_sanctioned'),'number').replace('<input', '<input min="0" step="0.01" oninput="updateRemainingFundBalance(\'manpower\')"') +
          clField('manpower_payment_till_date','Payment Till Date',saved('manpower_payment_till_date'),'number').replace('<input', '<input min="0" step="0.01" oninput="updateRemainingFundBalance(\'manpower\')"') +
          clField('manpower_remaining_balance','Remaining Balance',saved('manpower_remaining_balance'),'number').replace('<input', '<input readonly min="0" step="0.01"')),
      ].join('');
      return `<div class="contractor-style-scope contractor-tab-b"><form id="clForm" class="form-grid three contractor-file-details-grid">${form}</form></div>`;
    }

    // Consultancy B. File Details: fields sourced strictly from the attached consultancy form.
    if (data.type === 'Consultancy') {
      const saved = (key) => file[key] ?? '';
      const panel = (title, body) => `<section class="contractor-design-section" style="grid-column:1/-1;margin:0 0 24px;background:#fff;border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,.04)"><header class="contractor-design-header"><span class="contractor-design-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span><div><h3>${esc(title)}</h3></div></header><div class="contractor-design-body">${body}</div></section>`;
      const statusGroup = (key, title, details) => {
        const status = saved(key), detailId = `${key}Details`;
        const buttons = `<div class="contractor-approval-row"><label class="contractor-approval-label">${esc(title)}</label><div class="contractor-status-buttons" style="display:flex;gap:0;flex-wrap:wrap">${['Yes','No','NA'].map(option => { const active = status === option; return `<label class="choice-button ${active?'selected':''}" style="display:inline-flex;align-items:center;justify-content:center;min-width:42px;border:1px solid ${active?'#16a34a':'#cbd5e1'};background:${active?'#ecfdf5':'#fff'};color:${active?'#15803d':'#1f2937'};border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:${active?'600':'400'}"><input type="radio" name="${key}" value="${option}" ${active?'checked':''} style="position:absolute;opacity:0;width:1px;height:1px" onchange="(function(el){var box=document.getElementById('${detailId}');if(box){box.hidden=el.value!=='Yes';box.style.setProperty('display',el.value==='Yes'?'grid':'none','important');}var group=el.closest('.contractor-status-buttons');if(group)group.querySelectorAll('.choice-button').forEach(function(btn){var input=btn.querySelector('input'),a=input.checked;btn.classList.toggle('selected',a);btn.style.borderColor=a?'#16a34a':'#cbd5e1';btn.style.background=a?'#ecfdf5':'#fff';btn.style.color=a?'#15803d':'#1f2937';btn.style.fontWeight=a?'600':'400';});})(this)">${option}</label>`; }).join('')}</div></div>`;
        return buttons + `<div id="${detailId}" class="form-grid three contractor-detail-expand" ${status==='Yes'?'':'hidden'} style="grid-column:1/-1;display:${status==='Yes'?'grid':'none'}${status==='Yes'?'':' !important'}">${details}</div>`;
      };
      const approvalDetails = (prefix, label) => clField(`${prefix}_no`, `${label} No.`, saved(`${prefix}_no`)) + clField(`${prefix}_date`, `${label} Date`, saved(`${prefix}_date`), 'date') + clField(`${prefix}_amount`, `${label} Amount`, saved(`${prefix}_amount`), 'number') + clField(`${prefix}_approved_by_name`, `${label} Approved By Name`, saved(`${prefix}_approved_by_name`)) + clField(`${prefix}_approved_by_designation`, `${label} Approved By Designation`, saved(`${prefix}_approved_by_designation`));
      const form = [
        panel('1. Admin Approval', statusGroup('admin_approval_status','Admin Approval', approvalDetails('admin_approval','Admin Approval'))),
        panel('2. Tender Published', statusGroup('tender_published_status','Tender Published', clField('tender_publication_date','Date of Published',saved('tender_publication_date'),'date') + clField('tender_newspaper_name','Name of Newspaper',saved('tender_newspaper_name')) + `<div id=\"consultancy-newspaper-extra-rows\"></div><button type=\"button\" class=\"btn btn-secondary\" data-newspaper-host=\"consultancy-newspaper-extra-rows\" data-newspaper-prefix=\"consultancy_tender_newspaper_name\" onclick=\"addTenderNewspaper(this)\">+ Add Newspaper</button>`)),
        panel('3. Tender Committee Approval', statusGroup('tender_committee_approval_status','Tender Committee Approval', approvalDetails('tender_committee_approval','Tender Committee Approval'))),
        panel('4. Consultant Selection', clField('consultancy_no_of_participants','No. of Participants',saved('consultancy_no_of_participants'),'number') + clField('selected_consultant_name','Selected Consultant Name',saved('selected_consultant_name'))),
        panel('5. Penal Provision', statusGroup('penal_provision_status','Penal Provision as per Agreement','')),
        panel('6. Bill Details', `<div class="contractor-subsection consultancy-bill-details-box" style="grid-column:1/-1;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><div class="form-grid consultancy-bill-fields"><div class="field"><label>Bill Type</label><select name="consultancy_bill_type"><option value="">Select...</option>${['RA bill','Final'].map(v=>`<option value="${v}" ${saved('consultancy_bill_type')===v?'selected':''}>${v}</option>`).join('')}</select></div>${clField('consultancy_bill_no','Bill No.',saved('consultancy_bill_no'))}${clField('bill_amount', 'Bill Amount (Rs.)', saved('bill_amount'), 'number').replace('<input', '<input min="0" step="0.01" oninput="updateChecklistGrossFromFileDetails(this.value)"')}</div></div>`),
        panel('7. Remaining Fund in Scheme after Payment',
          clField('consultancy_amount_sanctioned','Amount Sanctioned',saved('consultancy_amount_sanctioned'),'number').replace('<input', '<input oninput="updateRemainingFundBalance(\'consultancy\')"') +
          clField('consultancy_payment_till_date','Payment Till Date',saved('consultancy_payment_till_date'),'number').replace('<input', '<input oninput="updateRemainingFundBalance(\'consultancy\')"') +
          clField('consultancy_remaining_balance','Remaining Balance',saved('consultancy_remaining_balance'),'number'))

      ].join('');
      return `<div class="contractor-style-scope contractor-tab-b"><form id="clForm" class="form-grid three contractor-file-details-grid">${form}</form></div>`;
    }

    // Store Purchase B. File Details: form fields from the supplied Store Purchase PDF.
    if (data.type === 'Store Purchase') {
      const saved = (key) => file[key] ?? '';
      const panel = (title, body) => `<section class="contractor-design-section" style="grid-column:1/-1;margin:0 0 24px;background:#fff;border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,.04)"><header class="contractor-design-header"><span class="contractor-design-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span><div><h3>${esc(title)}</h3></div></header><div class="contractor-design-body">${body}</div></section>`;
      const statusGroup = (key, title, details = '', showDetailsWhen = 'Yes') => {
        const status = saved(key), detailId = `${key}Details`;
        const buttons = `<div class="contractor-approval-row"><label class="contractor-approval-label">${esc(title)}</label><div class="contractor-status-buttons" style="display:flex;gap:0;flex-wrap:wrap">${['Yes','No','NA'].map(option => { const active = status === option; return `<label class="choice-button ${active?'selected':''}" style="display:inline-flex;align-items:center;justify-content:center;min-width:42px;border:1px solid ${active?'#16a34a':'#cbd5e1'};background:${active?'#ecfdf5':'#fff'};color:${active?'#15803d':'#1f2937'};border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:${active?'600':'400'}"><input type="radio" name="${key}" value="${option}" ${active?'checked':''} style="position:absolute;opacity:0;width:1px;height:1px" onchange="(function(el){var box=document.getElementById('${detailId}');if(box){var show=el.value==='${showDetailsWhen}';box.hidden=!show;box.style.setProperty('display',show?'grid':'none','important');}var group=el.closest('.contractor-status-buttons');if(group)group.querySelectorAll('.choice-button').forEach(function(btn){var input=btn.querySelector('input'),a=input.checked;btn.classList.toggle('selected',a);btn.style.borderColor=a?'#16a34a':'#cbd5e1';btn.style.background=a?'#ecfdf5':'#fff';btn.style.color=a?'#15803d':'#1f2937';btn.style.fontWeight=a?'600':'400';});})(this)">${option}</label>`; }).join('')}</div></div>`;
        return buttons + (details ? `<div id="${detailId}" class="form-grid three contractor-detail-expand" ${status===showDetailsWhen?'':'hidden'} style="grid-column:1/-1;display:${status===showDetailsWhen?'grid':'none'}${status===showDetailsWhen?'':' !important'}">${details}</div>` : '');
      };
      const approvalDetails = (prefix, label) => clField(`${prefix}_no`,`${label} No.`,saved(`${prefix}_no`)) + clField(`${prefix}_date`,`${label} Date`,saved(`${prefix}_date`),'date') + clField(`${prefix}_amount`,`${label} Rs.`,saved(`${prefix}_amount`),'number') + clField(`${prefix}_approved_by_name`,`${label} Approved By name`,saved(`${prefix}_approved_by_name`)) + clField(`${prefix}_approved_by_designation`,`${label} Approved By Designation`,saved(`${prefix}_approved_by_designation`));
      const modeOptions = ['GEM','OPEN TENDER','LIMITED TENDER','QUOTATION','OTHER'];
      const form = [
        panel('1. Item Availability in GeM', statusGroup('store_item_availability_gem','Item Availability in GeM', statusGroup('store_non_availability_report','Non-Availability Report'), 'No')),
        panel('2. Mode of Purchase & Source of Fund', clSelect('store_mode_of_purchase','Mode of Purchase',saved('store_mode_of_purchase'),modeOptions).replace('<select', `<select onchange=\"var f=this.form.elements.store_mode_other;var w=document.getElementById('storeModeOtherWrap');if(w)w.style.display=this.value==='OTHER'?'':'none';\"`) + `<div id=\"storeModeOtherWrap\" style=\"display:${saved('store_mode_of_purchase')==='OTHER'?'':'none'}\">${clField('store_mode_other','Other',saved('store_mode_other'))}</div>` + clField('store_estimated_amount_rate_contract','Estimated Amount or Rate Contract',saved('store_estimated_amount_rate_contract')) + clField('store_source_of_fund','Source of Fund',saved('store_source_of_fund'))),
        panel('3. Financial Approval', statusGroup('store_financial_approval_status','Financial Approval',approvalDetails('store_financial_approval','Financial Approval'))),
        panel('4. Tender Published', statusGroup('store_tender_published_status','Tender Published',clField('store_tender_publication_date','Date of Published',saved('store_tender_publication_date'),'date') + clField('store_tender_newspaper_name','Name of Newspaper',saved('store_tender_newspaper_name')) + `<div id=\"store-newspaper-extra-rows\"></div><button type=\"button\" class=\"btn btn-secondary\" data-newspaper-host=\"store-newspaper-extra-rows\" data-newspaper-prefix=\"store_tender_newspaper_name\" onclick=\"addTenderNewspaper(this)\">+ Add Newspaper</button>`)),
        panel('5. Tender Committee Approval', statusGroup('store_tender_committee_approval_status','Tender Committee Approval',approvalDetails('store_tender_committee_approval','Tender Committee Approval'))),
        panel('6. Purchase Order', clField('store_purchase_order_no','No.',saved('store_purchase_order_no')) + clField('store_purchase_order_date','Date',saved('store_purchase_order_date'),'date')),
        panel('7. Details of Inventory', `<div style="grid-column:1/-1;overflow-x:auto"><table class="store-inventory-table" style="width:100%;border-collapse:collapse;min-width:760px"><thead><tr>${['Sr. no.','HSN','Name','Quantity','Amount',''].map(h=>`<th style="text-align:left;padding:10px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:600">${h}</th>`).join('')}</tr></thead><tbody id="storeInventoryRows">${[0].map(i=>`<tr class="store-inventory-row">${[['sr_no','Sr. no.'],['hsn','HSN'],['name','Name'],['quantity','Quantity'],['amount','Amount']].map(([field,label])=>`<td style="padding:8px;border:1px solid #cbd5e1"><input aria-label="${label}" name="store_inventory_${i}_${field}" value="${esc(saved(`store_inventory_${i}_${field}`))}" ${field==='quantity'||field==='amount'?'type=number':''} style="width:100%;min-width:90px;box-sizing:border-box"></td>`).join('')}<td style="padding:8px;border:1px solid #cbd5e1;text-align:center"></td></tr>`).join('')}</tbody></table><button type="button" class="btn btn-secondary" style="margin-top:12px" onclick="(function(){var body=document.getElementById('storeInventoryRows');var i=body.querySelectorAll('.store-inventory-row').length;var tr=body.insertRow();tr.className='store-inventory-row';['sr_no','hsn','name','quantity','amount'].forEach(function(field){var td=tr.insertCell();td.style.padding='8px';td.style.border='1px solid #cbd5e1';var inp=document.createElement('input');inp.name='store_inventory_'+i+'_'+field;inp.setAttribute('aria-label',field);inp.style.cssText='width:100%;min-width:90px;box-sizing:border-box';if(field==='quantity'||field==='amount')inp.type='number';td.appendChild(inp);});var td=tr.insertCell();td.style.padding='8px';td.style.border='1px solid #cbd5e1';td.style.textAlign='center';var rm=document.createElement('button');rm.type='button';rm.className='btn btn-secondary';rm.textContent='Remove';rm.onclick=function(){tr.remove();};td.appendChild(rm);})();">+ Add row</button></div>`),
        panel('8. Supply & Acknowledgement', clField('store_date_supply_as_per_po','Date of Supply (as per PO)',saved('store_date_supply_as_per_po'),'date') + clField('store_actual_date_supply','Actual Date of Supply',saved('store_actual_date_supply'),'date') + statusGroup('store_extended_date_supply_status','Extended Date of Supply', clField('store_extended_date_supply','Extended Date of Supply',saved('store_extended_date_supply'),'date') + clField('store_extended_date_reason','Reason',saved('store_extended_date_reason'))) + statusGroup('store_acknowledgement_store_keeper_status','Acknowledgement of Store Keeper')),
        panel('9. Panel Provision & Bill Details', statusGroup('store_panel_provision_status','Panel Provision as per Agreement')),
        panel('10. Bill Details', `<div class="contractor-subsection store-bill-details-box" style="grid-column:1/-1;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><div class="form-grid store-bill-fields"><div class="field"><label>Bill Type</label><select name="store_bill_type"><option value="">Select...</option>${['RA bill','Final'].map(v=>`<option value="${v}" ${saved('store_bill_type')===v?'selected':''}>${v}</option>`).join('')}</select></div>${clField('store_bill_no','Bill No.',saved('store_bill_no'))}${clField('bill_amount', 'Bill Amount (Rs.)', saved('bill_amount'), 'number').replace('<input', '<input min="0" step="0.01" oninput="updateChecklistGrossFromFileDetails(this.value)"')}</div></div>`),
        panel('11. Remaining Fund in Scheme after Payment', clField('store_amount_sanctioned','Amount Sanctioned',saved('store_amount_sanctioned'),'number').replace('<input', '<input oninput="updateRemainingFundBalance(\'store\')"') + clField('store_payment_till_date','Payment Till Date',saved('store_payment_till_date'),'number').replace('<input', '<input oninput="updateRemainingFundBalance(\'store\')"') + clField('store_remaining_balance','Remaining Balance',saved('store_remaining_balance'),'number'))
      ].join('');
      return `<div class="contractor-style-scope contractor-tab-b"><form id="clForm" class="form-grid three contractor-file-details-grid">${form}</form></div>`;
    }


    // Employee Advance B. File Detail: fields sourced only from the supplied PDF,
    // using the existing Contractor B. File Detail visual style.
    if (data.type === 'Employee Advance') {
      const saved = (key) => file[key] ?? '';
      const panel = (title, body, extraStyle = '') => `<section class="contractor-design-section" style="grid-column:1/-1;margin:0 0 24px;background:#fff;border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,.04);${extraStyle}"><header class="contractor-design-header"><span class="contractor-design-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span><div><h3>${esc(title)}</h3></div></header><div class="contractor-design-body">${body}</div></section>`;
      const input = (key, label, type = 'text', placeholder = '') => `<div class="field"><label>${esc(label)}</label><input name="${key}" type="${type}" value="${esc(saved(key))}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ''}></div>`;
      const dropdown = (key, label, options, otherKey, otherLabel = 'Specify Other') => {
        const val = saved(key);
        return `<div class="field"><label>${esc(label)}</label><select name="${key}" onchange="const x=this.parentElement.querySelector('[data-other]');if(x)x.style.display=this.value==='OTHER'?'block':'none'"><option value="">Select...</option>${options.map(v=>`<option value="${esc(v)}" ${val===v?'selected':''}>${esc(v)}</option>`).join('')}</select><input data-other name="${otherKey}" type="text" value="${esc(saved(otherKey))}" placeholder="${esc(otherLabel)}" style="margin-top:8px;display:${val==='OTHER'?'block':'none'}"></div>`;
      };
      const form = [
        panel('1. Approval & Reference Details',
          input('employee_adv_approved_by','Approved By') +
          input('employee_adv_note_sheet_no','Note Sheet No') +
          input('employee_adv_zone_deptt','Zone / Deptt.') +
          input('employee_adv_ledger_ac_no','Ledger A/c No') +
          input('employee_adv_advance_requested_amount','Advance Requested Amount','number') +
          `<div class="field"><label> Advance Sanction Amount</label><input name="bill_amount" type="number" min="0" step="0.01" value="${esc(saved('bill_amount'))}" oninput="updateChecklistGrossFromFileDetails(this.value)"></div>` +
          input('employee_adv_date_sanction','Date of Sanction','date') +
          `<div class="field"><label>Advance subsequently disallowed</label><div class="contractor-status-buttons" style="display:flex;gap:8px;flex-wrap:wrap">${['YES','NO','NA'].map(v=>`<label class="choice-button ${saved('employee_adv_disallowed')===v?'selected':''}" style="display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 14px;cursor:pointer"><input type="radio" name="employee_adv_disallowed" value="${v}" ${saved('employee_adv_disallowed')===v?'checked':''}>${v}</label>`).join('')}</div></div>`
        ),
        panel('2. Mode of Payment & Recovery',
          dropdown('employee_adv_mode_payment','Mode of Payment',['ONLINE','NEFT','CHEQUE','OTHER'],'employee_adv_mode_payment_other','Enter other payment mode') +
          input('employee_adv_payment_date','Payment Date','date') +

          input('employee_adv_no_instalments_recovery','No. of Instalments for Recovery','number') +
          input('employee_adv_amount_instalment','Amount of Instalment','number')
        ),
        panel('3. Outstanding Advance',
          input('employee_adv_total_outstanding_as_on_date','Total O/s Advance against Employee as on Date','date') +
          input('employee_adv_total_repayment_outstanding_as_on_date','Total Advance Repayment O/s as on Date','date')
        ),
        panel('4. Advance Type',
          dropdown('employee_adv_mode_purchase','Mode of Purchase',['OFFICIAL USE','GPF/CPF','LIMITED TENDER','GPF/CPF','OTHER'],'employee_adv_mode_purchase_other','Enter other mode of purchase')
        ),
        panel('5. Purpose', `<div class="field" style="grid-column:1/-1"><label>Purpose</label><textarea name="employee_adv_purpose" rows="4">${esc(saved('employee_adv_purpose'))}</textarea></div>`)
      ].join('');
      return `<div class="contractor-style-scope contractor-tab-b"><form id="clForm" class="form-grid three contractor-file-details-grid">${form}</form></div>`;
    }

    // Misc. Expenses B. File Detail: fields taken from the supplied Misc. Expenses PDF.
    if (data.type === 'Misc. Expenses') {
      const saved = (key) => file[key] ?? '';
      const panel = (title, body) => `<section class="contractor-design-section" style="grid-column:1/-1;margin:0 0 24px;background:#fff;border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,.04)"><header class="contractor-design-header"><span class="contractor-design-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span><div><h3>${esc(title)}</h3></div></header><div class="contractor-design-body">${body}</div></section>`;
      const input = (key, label, type = 'text', placeholder = '') => `<div class="field"><label>${esc(label)}</label><input name="${key}" type="${type}" value="${esc(saved(key))}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ''}></div>`;
      const form = [
        panel('1. Work & Account Details', input('misc_exp_head_of_accounts','Head of accounts') + input('misc_exp_work_order_date','Work order date','date') + input('misc_exp_work_order_number','Work order number') + input('misc_exp_agreement_number','Agreement number') + input('misc_exp_agreement_date','Agreement date','date')),
        panel('2. Penal Provision as per Agreement', `<div class="field"><label>Penal Provision as per Agreement</label><div class="contractor-status-buttons" style="display:flex;gap:8px;flex-wrap:wrap">${['YES','NO','NA'].map(v=>`<label class="choice-button ${saved('misc_exp_penal_provision')===v?'selected':''}" style="display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 14px;cursor:pointer"><input type="radio" name="misc_exp_penal_provision" value="${v}" ${saved('misc_exp_penal_provision')===v?'checked':''}>${v}</label>`).join('')}</div></div>`),


        panel('3. Bill Details', `<div class="contractor-subsection store-bill-details-box" style="grid-column:1/-1;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><div class="form-grid store-bill-fields"><div class="field"><label>Bill Type</label><select name="store_bill_type"><option value="">Select...</option>${['RA bill','Final'].map(v=>`<option value="${v}" ${saved('store_bill_type')===v?'selected':''}>${v}</option>`).join('')}</select></div>${clField('store_bill_no','Bill         No.',saved('store_bill_no'))}${clField('bill_amount', 'Bill Amount (Rs.)', saved('bill_amount'), 'number').replace('<input', '<input min="0" step="0.01" oninput="updateChecklistGrossFromFileDetails(this.value)"')}</div></div>`),
        panel('4. Work Completion Details', input('misc_exp_work_completion_date','Work Completion date','date') + input('misc_exp_time_period','Time period')),
        panel('5. Measurement details', `<div class="field" style="grid-column:1/-1"><label>Measurement details</label><textarea name="misc_exp_measurement_details" rows="4">${esc(saved('misc_exp_measurement_details'))}</textarea></div>`)
      ].join('');
      return `<div class="contractor-style-scope contractor-tab-b"><form id="clForm" class="form-grid three contractor-file-details-grid">${form}</form></div>`;
    }

    // Contractor B. File details: layout based on the supplied Contractor File Details design.
    // All controls use the existing file_details keys so saved checklist data remains compatible.
    if (data.type === 'Contractor') {
      const saved = (key) => file[key] ?? '';
      const section = (title, subtitle, body) => `<section class="contractor-design-section" style="grid-column:1/-1;margin:0 0 24px;background:#fff;border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:all .2s"><header class="contractor-design-header"><span class="contractor-design-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div></header><div class="contractor-design-body">${body}</div></section>`;

      let paymentHistoryRows = Array.isArray(data.payment_history)
        ? data.payment_history
        : (Array.isArray(file.payment_history) ? file.payment_history : []);
      // Defensive fallback for duplicated Contractor records created from older
      // records whose payment_history array did not exist yet. Use duplicated_from
      // metadata (source date/checklist number), not the duplicate's created_at.
      if (!paymentHistoryRows.length && data.duplicated_from) {
        const billType = String(file.bill_type || '').trim();
        const isRaBill = billType.toLowerCase() === 'ra bill';
        // Payment fallback is deliberately limited to RA bill -> file.bill_amount.
        const amount = isRaBill ? (file.bill_amount ?? '') : '';
        const raAmount = file.ra_bill_amount ?? (isRaBill ? (file.bill_amount ?? '') : '');
        const hasDetails = [amount, raAmount, file.ra_number_mb_book, file.bill_no, file.final_bill_no].some(value => value !== '' && value != null);
        if (hasDetails) paymentHistoryRows = [{
          checklist_no: data.duplicated_from.checklist_no || '',
          date: data.duplicated_from.date || '',
          ra_bill_amount: raAmount,
          ra_number: file.ra_number_mb_book || file.ra_number || '',
          advance: file.advance_adjustment ?? file.advance_amount ?? '',
          payment: amount ?? '',
          payment_percent: ''
        }];
      }
      const currentSorValue = Number(saved('computed_bid_value')) || 0;
      // Payment History calculations are based on the bill type for each entry.
      // RA Bill payment = RA Bill Amount + Advance - the immediately previous RA Bill Amount.
      // ADVANCES payment = Advance only. The Advance column is never added to an RA Bill row's payment.
      const isAdvanceHistoryRow = row => String(row.bill_type || row.billType || '').trim().toLowerCase() === 'advances';
      let previousRaBillAmount = 0;
      paymentHistoryRows = paymentHistoryRows.map(row => {
        const raAmount = Number(row.ra_bill_amount) || 0;
        const advanceAmount = Number(row.advance) || 0;
        if (isAdvanceHistoryRow(row)) {
          return { ...row, payment: advanceAmount, payment_percent: currentSorValue > 0 ? Number(((raAmount / currentSorValue) * 100).toFixed(2)) : '' };
        }
        const calculatedPayment = raAmount + advanceAmount - previousRaBillAmount;
        previousRaBillAmount = raAmount;
        return { ...row, payment: calculatedPayment, payment_percent: currentSorValue > 0 ? Number(((raAmount / currentSorValue) * 100).toFixed(2)) : '' };
      });
      const historyPaymentValue = row => Number(row.payment) || 0;
      const historyPaymentDisplay = row => row.payment === '' || row.payment == null ? '' : historyPaymentValue(row);
      const paymentHistoryTotalPayment = paymentHistoryRows.reduce((sum, row) => sum + historyPaymentValue(row), 0);
      const paymentHistoryTotalAdvance = paymentHistoryRows.reduce((sum, row) => sum + (Number(row.advance) || 0), 0);
      const paymentHistoryTotalRaBill = paymentHistoryRows.reduce((sum, row) => sum + (Number(row.ra_bill_amount) || 0), 0);
      const latestRaBillAmountInHistory = [...paymentHistoryRows].reverse().find(row => !isAdvanceHistoryRow(row) && row.ra_bill_amount !== '' && row.ra_bill_amount != null);
      const paymentHistoryTotalPercent = currentSorValue > 0 && latestRaBillAmountInHistory ? (Number(latestRaBillAmountInHistory.ra_bill_amount) / currentSorValue) * 100 : 0;
      window.updateManualPaymentHistoryCalculation = function(row) {
        if (!row) return;
        const raRaw = row.querySelector('input[name^="manual_payment_history_ra_amount_"]')?.value ?? '';
        const advanceRaw = row.querySelector('input[name^="manual_payment_history_advance_"]')?.value ?? '';
        let previousRaAmount = 0;
        const historyRows = Array.from(document.querySelectorAll('#contractorPaymentHistoryBody tr[data-history-row]'));
        for (let i = historyRows.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(historyRows[i].getAttribute('data-history-row') || '{}');
            if (String(entry.bill_type || entry.billType || '').trim().toLowerCase() === 'advances') continue;
            if (entry.ra_bill_amount !== '' && entry.ra_bill_amount != null && Number.isFinite(Number(entry.ra_bill_amount))) {
              previousRaAmount = Number(entry.ra_bill_amount) || 0;
              break;
            }
          } catch (_) {}
        }
        const ra = Number(normalizeRaBillAmountNumeric(raRaw) || 0), advance = Number(advanceRaw || 0);
        const payment = row.querySelector('input[name^="manual_payment_history_payment_"]');
        if (payment) payment.value = ra + advance - previousRaAmount;
      };
      window.applyManualPreviousHistoryRow = function(button) {
        const row = button?.closest('.manual-payment-history-row');
        if (!row) return;
        const get = suffix => row.querySelector(`[name^="manual_payment_history_${suffix}_"]`)?.value ?? '';
        const checklistNo = get('checklist_no').trim();
        const particulars = get('particulars').trim();
        const raAmount = normalizeRaBillAmountNumeric(get('ra_amount'));
        const advance = get('advance');
        // Manual row follows the same running calculation as Payment History.
        const advanceValue = advance === '' ? 0 : Number(advance);
        if (raAmount === '' || !Number.isFinite(Number(raAmount)) || Number(raAmount) < 0 ||
            !Number.isFinite(advanceValue) || advanceValue < 0) {
          alert('Please enter valid RA Bill Amount and Advance values before applying.');
          return;
        }
        let previousRaAmount = 0;
        const existingHistoryRows = Array.from(document.querySelectorAll('#contractorPaymentHistoryBody tr[data-history-row]'));
        for (let i = existingHistoryRows.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(existingHistoryRows[i].getAttribute('data-history-row') || '{}');
            if (String(entry.bill_type || entry.billType || '').trim().toLowerCase() === 'advances') continue;
            if (entry.ra_bill_amount !== '' && entry.ra_bill_amount != null && Number.isFinite(Number(entry.ra_bill_amount))) {
              previousRaAmount = Number(entry.ra_bill_amount) || 0;
              break;
            }
          } catch (_) {}
        }
        const payment = Number(raAmount) + advanceValue - previousRaAmount;
        const paymentInput = row.querySelector('input[name^="manual_payment_history_payment_"]');
        if (paymentInput) paymentInput.value = payment;
        const sor = Number(document.querySelector('[name="computed_bid_value"]')?.value || 0);
        const percent = sor > 0 ? (Number(payment || 0) / sor) * 100 : null;
        const percentLabel = row.querySelector('.manual-history-percent');
        if (percentLabel) percentLabel.textContent = percent === null ? '—' : `${percent.toLocaleString('en-IN',{maximumFractionDigits:2})}%`;
        const manualEntry = {
          manual: true,
          checklist_no: checklistNo,
          particulars,
          date: '',
          ra_bill_amount: Number(raAmount),
          advance: advance === '' ? '' : Number(advance),
          payment,
          payment_percent: percent === null ? '' : Number(percent.toFixed(2))
        };
        const fmtManual = value => value === '' || value == null ? '—' : `₹ ${Number(value).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
        document.querySelector('#contractorPaymentHistoryBody .no-history-row')?.remove();
        const displayRow = document.createElement('tr');
        displayRow.setAttribute('data-history-row', JSON.stringify(manualEntry));
        displayRow.style.background = '#f0fdf4';
        displayRow.innerHTML = `<td style="border:1px solid #cbd5e1;padding:8px">Manual</td><td style="border:1px solid #cbd5e1;padding:8px">${esc(checklistNo||'—')}</td><td style="border:1px solid #cbd5e1;padding:8px">${esc(particulars||'—')}</td><td style="border:1px solid #cbd5e1;padding:8px">—</td><td style="border:1px solid #cbd5e1;padding:8px">${formatRaBillAmountCumulativeText(manualEntry.ra_bill_amount, true)}</td><td style="border:1px solid #cbd5e1;padding:8px">${fmtManual(manualEntry.advance)}</td><td style="border:1px solid #cbd5e1;padding:8px">${fmtManual(manualEntry.payment)}</td><td style="border:1px solid #cbd5e1;padding:8px">${percent === null ? '—' : `${percent.toLocaleString('en-IN',{maximumFractionDigits:2})}%`}</td>`;
        row.replaceWith(displayRow);
        const historyBody = document.getElementById('contractorPaymentHistoryBody');
        if (historyBody) {
          let totalPayment = 0, totalAdvance = 0, totalRaAmount = 0;
          historyBody.querySelectorAll('tr[data-history-row]').forEach(historyRow => {
            try {
              const item = JSON.parse(historyRow.getAttribute('data-history-row') || '{}');
              totalPayment += Number(item.payment) || 0;
              totalAdvance += Number(item.advance) || 0;
              totalRaAmount += Number(item.ra_bill_amount) || 0;
            } catch (_) {}
          });
          const sorValue = Number(document.querySelector('[name="computed_bid_value"]')?.value || 0);
          const totalCells = historyBody.querySelectorAll('tr.payment-history-total-row td');
          if (totalCells.length >= 4) {
            totalCells[1].textContent = `₹ ${totalAdvance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
            totalCells[2].textContent = `₹ ${totalPayment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
            const latestRaRow = Array.from(historyBody.querySelectorAll('tr[data-history-row]')).reverse().map(historyRow => { try { return JSON.parse(historyRow.getAttribute('data-history-row') || '{}'); } catch (_) { return {}; } }).find(item => String(item.bill_type || item.billType || '').trim().toLowerCase() !== 'advances' && item.ra_bill_amount !== '' && item.ra_bill_amount != null);
            totalCells[3].textContent = sorValue > 0 && latestRaRow ? `${((Number(latestRaRow.ra_bill_amount) / sorValue) * 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%` : '—';
          }
        }
      };
      window.addManualPreviousHistoryRow = function() {
        const body = document.getElementById('contractorPaymentHistoryBody');
        if (!body) return;
        body.querySelector('.no-history-row')?.remove();
        const index = body.querySelectorAll('.manual-payment-history-row').length;
        const row = document.createElement('tr');
        row.className = 'manual-payment-history-row';
        row.innerHTML = `<td style="border:1px solid #cbd5e1;padding:8px">Manual</td>
          <td style="border:1px solid #cbd5e1;padding:6px"><input type="text" name="manual_payment_history_checklist_no_${index}" placeholder="Checklist no." style="width:110px"></td>
          <td style="border:1px solid #cbd5e1;padding:6px"><input type="text" name="manual_payment_history_particulars_${index}" placeholder="Particulars" style="width:140px"></td>
          <td style="border:1px solid #cbd5e1;padding:8px">—</td>
          <td style="border:1px solid #cbd5e1;padding:6px"><input type="text" inputmode="decimal" name="manual_payment_history_ra_amount_${index}" placeholder="RA Bill Amount" style="width:145px" onfocus="window.formatManualHistoryRaAmount(this,'focus')" oninput="window.formatManualHistoryRaAmount(this,'input');window.updateManualPaymentHistoryCalculation(this.closest('.manual-payment-history-row'))" onblur="window.formatManualHistoryRaAmount(this,'blur')"></td>
          <td style="border:1px solid #cbd5e1;padding:6px"><input type="number" min="0" step="0.01" name="manual_payment_history_advance_${index}" placeholder="Advance" style="width:100px" oninput="window.updateManualPaymentHistoryCalculation(this.closest('.manual-payment-history-row'))"></td>
          <td style="border:1px solid #cbd5e1;padding:6px"><input type="number" min="0" step="0.01" name="manual_payment_history_payment_${index}" placeholder="Payment" style="width:100px" readonly title="Automatically equals RA Bill Amount"></td>
          <td style="border:1px solid #cbd5e1;padding:8px"><span class="manual-history-percent">Calculated on apply</span><button type="button" class="btn secondary sm" style="margin-top:5px" onclick="window.applyManualPreviousHistoryRow(this)">Apply</button></td>`;
        body.appendChild(row);
      };
      const paymentHistoryMarkup = `<div class="contractor-subsection" style="grid-column:1/-1;margin-top:18px;border:1px solid #e2e8f0;border-radius:10px;padding:14px;overflow-x:auto">
        <h4 style="font-size:13px;font-weight:700;margin:0 0 12px">Payment History</h4>
        <table style="width:100%;border-collapse:collapse;min-width:780px;font-size:12px">
          <thead><tr>${['Sr.no.','Checklist no.','Particulars','Date','RA Bill Amount','Advance','Payment','% of RA BILL'].map(label=>`<th style="border:1px solid #cbd5e1;padding:8px;text-align:left;background:#f8fafc">${label}</th>`).join('')}</tr></thead>
          <tbody id="contractorPaymentHistoryBody">${paymentHistoryRows.length ? paymentHistoryRows.map((row,index)=>{
            const rawDate=String(row.date||'');
            const dateText=formatDateDMY(rawDate);
            const fmt=value=>value===''||value==null?'—':`₹ ${Number(value).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
            const fmtRa=value=>formatRaBillAmountCumulativeText(value, true);
            const rowPayment = historyPaymentValue(row);
            const rowPercent = currentSorValue > 0 && row.ra_bill_amount !== '' && row.ra_bill_amount != null ? ((Number(row.ra_bill_amount) || 0) / currentSorValue) * 100 : null;
            const rowBillType = String(row.bill_type || row.billType || '').trim().toLowerCase();
            const rowAdvanceType = String(row.advance_type || row.advances_type || row.advancesType || '').trim().toLowerCase();
            const currentBillType = String(saved('bill_type') || '').trim().toLowerCase();
            const currentAdvanceType = String(saved('advances_type') || '').trim().toLowerCase();
            const savedAdvanceParticulars = String(row.advance_particulars || row.advance_type_particulars || row.particulars || ((currentBillType === 'advances' && currentAdvanceType === 'other') ? saved('advance_particulars') : '') || '').trim();
            const isHistoryRaBill = rowBillType === 'ra bill' || (!rowBillType && Boolean(row.ra_number_mb_book || row.ra_number));
            const isHistoryAdvanceOther = (rowBillType === 'advances' || (!rowBillType && currentBillType === 'advances')) && (rowAdvanceType === 'other' || (!rowAdvanceType && currentBillType === 'advances' && currentAdvanceType === 'other'));
            // Particulars is bill-type specific: RA Bill uses the MB book RA number;
            // Advances > OTHER uses that entry's saved Particulars. Never let one override the other.
            const particulars = isHistoryRaBill
              ? String(row.ra_number_mb_book || row.ra_number || '')
              : (isHistoryAdvanceOther ? savedAdvanceParticulars : '');
            if (row.manual) return `<tr data-history-row="${esc(JSON.stringify(row))}" style="background:#f0fdf4"><td style="border:1px solid #cbd5e1;padding:8px">Manual</td><td style="border:1px solid #cbd5e1;padding:8px"><button type="button" class="payment-history-checklist-link" style="border:0;background:none;padding:0;color:#075985;text-decoration:underline;cursor:pointer;font:inherit;font-weight:600" onclick="openPaymentHistoryChecklist(decodeURIComponent('${encodeURIComponent(String(row.checklist_no || '')).replace(/'/g, '%27')}'),decodeURIComponent('${encodeURIComponent(String(row.ulb_id || data.ulb_id || '')).replace(/'/g, '%27')}'))">${esc(row.checklist_no||'—')}</button></td><td style="border:1px solid #cbd5e1;padding:8px">${esc(row.particulars||particulars||'—')}</td><td style="border:1px solid #cbd5e1;padding:8px">${esc(dateText||'—')}</td><td style="border:1px solid #cbd5e1;padding:8px">${fmtRa(row.ra_bill_amount)}</td><td style="border:1px solid #cbd5e1;padding:8px">${fmt(row.advance)}</td><td style="border:1px solid #cbd5e1;padding:8px">${fmt(historyPaymentDisplay(row))}</td><td style="border:1px solid #cbd5e1;padding:8px">${rowPercent===null?'—':`${rowPercent.toLocaleString('en-IN',{maximumFractionDigits:2})}%`}</td></tr>`;
            return `<tr data-history-row="${esc(JSON.stringify(row))}"><td style="border:1px solid #cbd5e1;padding:8px">${index+1}</td><td style="border:1px solid #cbd5e1;padding:8px"><button type="button" class="payment-history-checklist-link" style="border:0;background:none;padding:0;color:#075985;text-decoration:underline;cursor:pointer;font:inherit;font-weight:600" onclick="openPaymentHistoryChecklist(decodeURIComponent('${encodeURIComponent(String(row.checklist_no || '')).replace(/'/g, '%27')}'),decodeURIComponent('${encodeURIComponent(String(row.ulb_id || data.ulb_id || '')).replace(/'/g, '%27')}'))">${esc(row.checklist_no||'—')}</button></td><td style="border:1px solid #cbd5e1;padding:8px">${esc(particulars||'—')}</td><td style="border:1px solid #cbd5e1;padding:8px">${esc(dateText||'—')}</td><td style="border:1px solid #cbd5e1;padding:8px">${fmtRa(row.ra_bill_amount)}</td><td style="border:1px solid #cbd5e1;padding:8px">${fmt(row.advance)}</td><td style="border:1px solid #cbd5e1;padding:8px">${fmt(historyPaymentDisplay(row))}</td><td style="border:1px solid #cbd5e1;padding:8px">${rowPercent===null?'—':`${rowPercent.toLocaleString('en-IN',{maximumFractionDigits:2})}%`}</td></tr>`;
          }).join('') : '<tr class="no-history-row"><td colspan="8" style="border:1px solid #cbd5e1;padding:12px;text-align:center;color:#64748b">No previous payment history.</td></tr>'}
          <tr class="payment-history-total-row" style="font-weight:700;background:#f8fafc"><td colspan="5" style="border:1px solid #cbd5e1;padding:8px;text-align:right">Total</td><td style="border:1px solid #cbd5e1;padding:8px">${`₹ ${paymentHistoryTotalAdvance.toLocaleString('en-IN',{maximumFractionDigits:2})}`}</td><td style="border:1px solid #cbd5e1;padding:8px">${`₹ ${paymentHistoryTotalPayment.toLocaleString('en-IN',{maximumFractionDigits:2})}`}</td><td style="border:1px solid #cbd5e1;padding:8px">${currentSorValue > 0 ? `${paymentHistoryTotalPercent.toLocaleString('en-IN',{maximumFractionDigits:2})}%` : '—'}</td></tr>
        </table>
        <button type="button" class="btn secondary" style="margin-top:10px" onclick="window.addManualPreviousHistoryRow()">+ Add Manual Previous History</button><div style="font-size:12px;color:#64748b;margin-top:6px">Click Apply on each manual row, then save the checklist to store the history.</div>
        <div style="font-size:12px;color:#64748b;margin-top:8px">Current SOR Value = Computed Bid Value (Rs.). % of RA BILL = Payment (Payment History) ÷ SOR Computed Bid Value (Rs.) × 100.</div>
      </div>`;
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
      const atParEnabled = ['true','1','yes','on'].includes(String(saved('sor_at_par') || '').toLowerCase());
      const sorAtParField = `<div class="field sor-at-par-field"><label>At Par</label><button type="button" class="btn btn-secondary" aria-pressed="${atParEnabled}" onclick="toggleContractorSorAtPar(this)" style="min-width:100px">${atParEnabled ? 'At Par: ON' : 'At Par: OFF'}</button><input type="checkbox" name="sor_at_par" value="yes" ${atParEnabled ? 'checked' : ''} onchange="calculateContractorSorBid()" style="display:none"></div>`;
      const computedBidField = clField('computed_bid_value', 'Computed Bid Value (Rs.)', saved('computed_bid_value'), 'number').replace('<input', '<input readonly');
      const fields = [
        section('B. File Details', 'Contractor approvals, bidding, execution and compliance records',
          ''),
        section('1. Approvals & Clearances', 'Set approval status to reveal related entry fields',
          approval('technical_approval', 'Technical Approval', 'Technical Approval') +
          approval('tender_inviting_approval', 'Tender Inviting Approval', 'Tender Approval') +
          approval('tender_committee_approval', 'Tender Committee Approval', 'Tender Committee Approval') +
          statusGroup('tender_published_status', 'Tender Published', ['Yes','No','NA'],
            clField('tender_publication_date', 'Date of Publication', saved('tender_publication_date'), 'date') +
            clField('tender_newspaper_name', 'Name of Newspaper', saved('tender_newspaper_name')) + `<div id="tender-newspaper-extra-rows"></div><button type="button" class="btn btn-secondary" data-newspaper-host="tender-newspaper-extra-rows" data-newspaper-prefix="tender_newspaper_name" onclick="addTenderNewspaper(this)">+ Add Newspaper</button>`) +
          approval('financial_approval', 'Financial Approval', 'Financial Approval')),
        section('2. Schedule of Rates (SOR) & Bidding', 'Bid value fields',
          sorBaseField + sorPctField + sorOptionField + sorAtParField + computedBidField),
        section('3. Guarantees & Penalties', 'Financial securities and agreement provisions',
          statusGroup('emd_tdr_available', 'EMD / TDR Available') +
          statusGroup('aps_details_applicable', 'Additional Performance Guarantee (APG) Details if Applicable',
            ['Yes','No','NA'], clField('apg_amount', 'APG Amount (Rs.)', saved('apg_amount'), 'number') + clField('apg_validity_date', 'APG Validity Date', saved('apg_validity_date'), 'date')) +
          statusGroup('penal_provision_status', 'Penal Provision as per Agreement')),
        section('4. Timeline & Execution', 'Key milestones and date extensions',

          clField('actual_commencement_date', 'Date of Commencement - Actual', saved('actual_commencement_date'), 'date') +
          clField('actual_completion_date', 'Date of Work Completion - Actual', saved('actual_completion_date'), 'date')+
          statusGroup('extended_completion_applicable', 'Extended Date of Completion & Reason', ['Yes','NA'],
            clField('extended_completion_date', 'Extended Date', saved('extended_completion_date'), 'date') +
            clField('extended_completion_reason', 'Reason for Extension', saved('extended_completion_reason')))),
        section('5. Documentation & Financials', 'Measurement books, fund availability letter and bill entries',
          clField('measurement_book_no', 'Measurement Book No.', saved('measurement_book_no')) +
          clField('measurement_book_page_no', 'Page No.', saved('measurement_book_page_no')) +
          `<div class="contractor-subsection" style="grid-column:1/-1;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><h4 style="font-size:13px;font-weight:700;margin:0 0 12px">Availability of Fund as per Letter</h4><div class="form-grid three">${clField('fund_letter_no', 'No.', saved('fund_letter_no'))}${clField('fund_letter_date', 'Date', saved('fund_letter_date'), 'date')}${clField('fund_letter_rs', 'Amount (Rs.)', saved('fund_letter_rs'), 'number')}</div></div>` +
          `<div class="contractor-subsection contractor-bill-details" style="grid-column:1/-1;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><h4 style="font-size:13px;font-weight:700;margin:0 0 12px">Bill Details</h4>
            <div class="form-grid three"><div class="field"><label>Bill Type</label><select name="bill_type" onchange="toggleContractorBillType(this.value)"><option value="">Select...</option>${['RA bill','ADVANCES','Final'].map(v => `<option value="${v}" ${saved('bill_type')===v?'selected':''}>${v}</option>`).join('')}</select></div></div>
            <div id="contractorRaBillPanel" class="form-grid three" style="margin-top:14px;${saved('bill_type')==='RA bill'?'':'display:none'}">
              ${clField('ra_number_mb_book','RA Number from MB book',formatRaNumberFromMbBookValue(saved('ra_number_mb_book'))).replace('<input','<input oninput="window.formatRaNumberFromMbBookBookInput(this)" onblur="window.formatRaNumberFromMbBookBookInput(this)"')}
              ${`<div class="field"><label>RA Bill Amount (Rs.)</label><input type="text" inputmode="decimal" id="raBillAmountCumulativeDisplay" value="${esc(saved('ra_bill_amount') !== '' ? `${saved('ra_bill_amount')} Cumulative` : '')}" placeholder="Enter amount" onfocus="formatRaBillAmountCumulativeInput(this,'focus')" oninput="formatRaBillAmountCumulativeInput(this,'input')" onblur="formatRaBillAmountCumulativeInput(this,'blur')"><input type="hidden" name="ra_bill_amount" value="${esc(saved('ra_bill_amount'))}"></div>`}
              ${clField('advance_adjustment','Advance Adjustment (Rs.)',saved('advance_adjustment'),'number').replace('<input','<input step="0.01" oninput="calculateContractorRaFinalAmount()" onblur="normalizeContractorAdvanceAdjustment(this)"')}
              ${clField('bill_amount','Final Amount (Rs.)',saved('bill_amount'),'number').replace('<input','<input readonly')}
              ${clField('bill_no','Bill No.',saved('bill_no'))}
              <div id="contractorRaBillPercentDisplay" style="grid-column:1/-1;padding:12px 16px;border:2px solid #dc2626;border-radius:10px;background:#fff7f7;color:#dc2626;font-size:30px;font-weight:800;text-align:center;line-height:1.2">0.00%</div>
              <div class="field" style="grid-column:1/-1;color:#64748b;font-size:12px">RA Bill Amount ÷ SOR Computed Bid Value (Rs.) × 100 = RA Bill %</div>
              <div class="field" style="grid-column:1/-1;color:#64748b;font-size:12px">RA Bill Amount − Advance Adjustment − Total of Payment History = Final Amount</div>
            </div>
            <div id="contractorAdvancesPanel" style="margin-top:14px;${saved('bill_type')==='ADVANCES'?'':'display:none'}">
              <div class="form-grid three"><div class="field"><label>Type</label><select name="advances_type" onchange="toggleContractorAdvanceType(this.value)"><option value="">Select...</option>${['OTHER','MOBILIZATION'].map(v=>`<option value="${v}" ${saved('advances_type')===v?'selected':''}>${v}</option>`).join('')}</select></div></div>
              <div id="contractorOtherAdvancePanel" class="form-grid three" style="margin-top:14px;${saved('advances_type')==='OTHER'?'':'display:none'}">${clField('advance_particulars','Particulars',saved('advance_particulars'))}${clField('advance_amount','Amount (Rs.)',saved('advance_amount') !== '' ? saved('advance_amount') : (saved('bill_type') === 'ADVANCES' && saved('advances_type') === 'OTHER' ? saved('bill_amount') : ''),'number').replace('<input','<input min="0" step="0.01" oninput="updateChecklistGrossFromFileDetails(this.value)"')}</div>
              <div id="contractorMobilizationPanel" class="form-grid three" style="margin-top:14px;${saved('advances_type')==='MOBILIZATION'?'':'display:none'}">${clField('mobilization_amount','Amount (Rs.)',saved('mobilization_amount') !== '' ? saved('mobilization_amount') : (saved('bill_type') === 'ADVANCES' && saved('advances_type') === 'MOBILIZATION' ? saved('bill_amount') : ''),'number').replace('<input','<input min="0" step="0.01" oninput="calculateContractorAdditionalBG(); updateChecklistGrossFromFileDetails(this.value)"')}${clField('additional_bg_available_amount','Additional BG Available — Amount (110% of above amount)',saved('additional_bg_available_amount'),'number').replace('<input','<input readonly')}${clField('bg_validity_date','BG Validity Date',saved('bg_validity_date'),'date')}</div>
            </div>
            <div id="contractorFinalBillPanel" class="form-grid three" style="margin-top:14px;${saved('bill_type')==='Final'?'':'display:none'}">${clField('final_bill_no','Bill No.',saved('final_bill_no'))}${clField('final_bill_amount','Amount (Rs.)',saved('final_bill_amount') !== '' ? saved('final_bill_amount') : (saved('bill_type') === 'Final' ? saved('bill_amount') : ''),'number').replace('<input','<input min="0" step="0.01" oninput="updateChecklistGrossFromFileDetails(this.value)"')}</div>
            ${paymentHistoryMarkup}
          </div>`),
        section('6. Quality & Mining Clearances', 'Testing reports and material royalty certificates',
          statusGroup('quality_test_report_status', 'Quality Test Report Available', ['Yes','No','NA'],
            clField('quality_report_date', 'Date of Report', saved('quality_report_date'), 'date') +
            clField('quality_testing_date', 'Date of Testing', saved('quality_testing_date'), 'date')) +
          statusGroup('mining_clearance_status', 'Mining Clearance Certificate', ['Yes','No','NA'],
            clField('mining_certificate_date', 'Date of Certificate', saved('mining_certificate_date'), 'date') +
            clField('mining_royalty_certificate_amount', 'Amount of Royalty (in clearance Certificate)', saved('mining_royalty_certificate_amount'), 'number') +
            clField('royalty_bill_amount', 'Royalty Bill No.', saved('royalty_bill_amount')) +
            clField('tcs_excess_royalty', 'TCS (2% of excess royalty)', saved('tcs_excess_royalty'), 'number')))
      ].join('');
      window.toggleContractorSorAtPar = function(button) {
        const form = document.getElementById('clForm');
        const toggle = form && form.querySelector('input[name="sor_at_par"]');
        if (!toggle) return;
        toggle.checked = !toggle.checked;
        button.textContent = toggle.checked ? 'At Par: ON' : 'At Par: OFF';
        button.setAttribute('aria-pressed', toggle.checked ? 'true' : 'false');
        window.calculateContractorSorBid();
      };
      window.calculateContractorSorBid = function() {
        const form = document.getElementById('clForm');
        if (!form) return;
        const baseInput = form.querySelector('[name="sor_base_value"]');
        const pctInput = form.querySelector('[name="sor_percentage"]');
        const optionInput = form.querySelector('[name="sor_option"]');
        const toggle = form.querySelector('input[name="sor_at_par"]');
        const resultInput = form.querySelector('[name="computed_bid_value"]');
        const base = parseFloat(baseInput?.value) || 0;
        const pct = parseFloat(pctInput?.value) || 0;
        const option = optionInput?.value;
        const atPar = !!toggle?.checked;
        let result = base;
        if (!atPar && base > 0 && pct > 0) result = option === 'Above' ? base * (1 + pct / 100) : option === 'Below' ? base * (1 - pct / 100) : base;
        if (resultInput) resultInput.value = base > 0 ? result.toFixed(2) : '';
        const button = form.querySelector('.sor-at-par-field button');
        if (button && toggle) {
          button.textContent = toggle.checked ? 'At Par: ON' : 'At Par: OFF';
          button.setAttribute('aria-pressed', toggle.checked ? 'true' : 'false');
        }
        if (window.updateContractorRaBillPercent) window.updateContractorRaBillPercent();
      };
      window.toggleContractorBillType = function(value) {
        const visibility = { contractorRaBillPanel: value === 'RA bill', contractorAdvancesPanel: value === 'ADVANCES' || value === 'Advances', contractorFinalBillPanel: value === 'Final' };
        Object.entries(visibility).forEach(([id, show]) => { const panel = document.getElementById(id); if (panel) { panel.style.display = show ? 'grid' : 'none'; if (id === 'contractorAdvancesPanel') panel.style.display = show ? 'block' : 'none'; } });
        const form = document.getElementById('clForm');
        if (form) {
          const raFinal = form.querySelector('#contractorRaBillPanel [name="bill_amount"]');
          const otherAmount = form.querySelector('#contractorOtherAdvancePanel [name="advance_amount"]');
          const mobAmount = form.querySelector('#contractorMobilizationPanel [name="mobilization_amount"]');
          const finalAmount = form.querySelector('#contractorFinalBillPanel [name="final_bill_amount"]');
          if (raFinal) raFinal.name = value === 'RA bill' ? 'bill_amount' : 'final_amount';
          if (otherAmount) otherAmount.name = value === 'ADVANCES' && form.querySelector('[name="advances_type"]')?.value === 'OTHER' ? 'bill_amount' : 'advance_amount';
          if (mobAmount) mobAmount.name = value === 'ADVANCES' && form.querySelector('[name="advances_type"]')?.value === 'MOBILIZATION' ? 'bill_amount' : 'mobilization_amount';
          if (finalAmount) finalAmount.name = value === 'Final' ? 'bill_amount' : 'final_bill_amount';
        }
        if (value === 'RA bill') window.calculateContractorRaFinalAmount();
        if (value === 'ADVANCES') window.toggleContractorAdvanceType(form?.querySelector('[name="advances_type"]')?.value || '');
      };
      window.toggleContractorAdvanceType = function(value) {
        const other = document.getElementById('contractorOtherAdvancePanel');
        const mob = document.getElementById('contractorMobilizationPanel');
        if (other) other.style.display = value === 'OTHER' ? 'grid' : 'none';
        if (mob) mob.style.display = value === 'MOBILIZATION' ? 'grid' : 'none';
        const form = document.getElementById('clForm');
        const otherAmount = form?.querySelector('#contractorOtherAdvancePanel [name="bill_amount"], #contractorOtherAdvancePanel [name="advance_amount"]');
        const mobAmount = form?.querySelector('#contractorMobilizationPanel [name="bill_amount"], #contractorMobilizationPanel [name="mobilization_amount"]');
        const billType = form?.querySelector('[name="bill_type"]')?.value;
        if (otherAmount) otherAmount.name = billType === 'ADVANCES' && value === 'OTHER' ? 'bill_amount' : 'advance_amount';
        if (mobAmount) mobAmount.name = billType === 'ADVANCES' && value === 'MOBILIZATION' ? 'bill_amount' : 'mobilization_amount';
        if (value === 'MOBILIZATION') window.calculateContractorAdditionalBG();
      };
      window.normalizeContractorAdvanceAdjustment = function(input) {
        if (!input) return;
        const raw = String(input.value ?? '').trim();
        if (raw === '') { window.calculateContractorRaFinalAmount(); return; }
        const amount = Number(raw);
        if (!Number.isFinite(amount)) return;
        input.value = amount === 0 ? '0' : String(-Math.abs(amount));
        window.calculateContractorRaFinalAmount();
      };
      window.updateContractorRaBillPercent = function() {
        const form = document.getElementById('clForm'); if (!form) return;
        const raAmount = Number(form.querySelector('[name="ra_bill_amount"]')?.value || 0);
        const sorValue = Number(form.querySelector('[name="computed_bid_value"]')?.value || 0);
        const display = form.querySelector('#contractorRaBillPercentDisplay');
        if (display) display.textContent = sorValue > 0 && form.querySelector('[name="ra_bill_amount"]')?.value !== '' ? `${((raAmount / sorValue) * 100).toFixed(2)}%` : '—';
      };
      window.calculateContractorRaFinalAmount = function() {
        const form = document.getElementById('clForm'); if (!form) return;
        window.updateContractorRaBillPercent();
        const amount = parseFloat(form.querySelector('[name="ra_bill_amount"]')?.value) || 0;
        const adjustmentInput = form.querySelector('[name="advance_adjustment"]');
        const adjustmentRaw = parseFloat(adjustmentInput?.value) || 0;
        // Advance Adjustment is always a deduction, even before blur normalizes its display.
        const adjustment = adjustmentRaw === 0 ? 0 : -Math.abs(adjustmentRaw);
        // Subtract only the latest RA Bill Amount shown in Payment History.
        // Do not sum payments or include Advance amounts in this deduction.
        let latestHistoryRaBillAmount = 0;
        const historyRows = Array.from(document.querySelectorAll('#contractorPaymentHistoryBody tr[data-history-row]'));
        for (let i = historyRows.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(historyRows[i].getAttribute('data-history-row') || '{}');
            const historyBillType = String(entry.bill_type || entry.billType || '').trim().toLowerCase();
            if (historyBillType === 'advances') continue;
            const historyRaAmount = Number(entry.ra_bill_amount);
            if (Number.isFinite(historyRaAmount) && entry.ra_bill_amount !== '' && entry.ra_bill_amount != null) {
              latestHistoryRaBillAmount = historyRaAmount;
              break;
            }
          } catch (_) {}
        }
        const output = form.querySelector('#contractorRaBillPanel [name="bill_amount"], #contractorRaBillPanel [name="final_amount"]');
        if (output) {
          const hasInput = form.querySelector('[name="ra_bill_amount"]')?.value !== '' || form.querySelector('[name="advance_adjustment"]')?.value !== '';
          // Final Amount = current RA Bill Amount + signed Advance Adjustment - latest RA Bill Amount from Payment History.
          // Advance Adjustment is stored/displayed as a negative value (e.g. -10000).
          output.value = hasInput ? Math.max(0, amount + adjustment - latestHistoryRaBillAmount).toFixed(2) : '';
          if (form.querySelector('[name="bill_type"]')?.value === 'RA bill' && output.value !== '') window.updateChecklistGrossFromFileDetails(output.value);
        }
      };
      window.calculateContractorAdditionalBG = function() {
        const form = document.getElementById('clForm'); if (!form) return;
        const amountInput = form.querySelector('#contractorMobilizationPanel [name="mobilization_amount"], #contractorMobilizationPanel [name="bill_amount"]');
        const output = form.querySelector('[name="additional_bg_available_amount"]');
        const amount = parseFloat(amountInput?.value);
        if (output) output.value = Number.isFinite(amount) && amountInput.value !== '' ? (amount * 1.1).toFixed(2) : '';
      };
      window.calculateMiningExcessRoyaltyTcs = function() {
        const form = document.getElementById('clForm');
        if (!form) return;
        const parseAmount = value => {
          const cleaned = String(value ?? '').replace(/,/g, '').replace(/[^0-9.\-]/g, '');
          const number = parseFloat(cleaned);
          return Number.isFinite(number) ? number : 0;
        };
        const royaltyBill = parseAmount(form.querySelector('[name="royalty_bill_amount"]')?.value);
        const certificateRoyalty = parseAmount(form.querySelector('[name="mining_royalty_certificate_amount"]')?.value);
        const output = form.querySelector('[name="tcs_excess_royalty"]');
        if (output) {
          output.readOnly = true;
          output.title = 'Automatically calculated as 2% of excess royalty';
          const excessRoyalty = Math.max(0, royaltyBill - certificateRoyalty);
          output.value = (excessRoyalty * 0.02).toFixed(2);
          // Keep the TCS deduction linked to the calculated value in B. File Details.
          const draft = state.checklistDraft;
          if (draft && draft.type === 'Contractor') {
            draft.file_details = draft.file_details || {};
            draft.file_details.tcs_excess_royalty = output.value;
            draft.deductions = Array.isArray(draft.deductions) ? draft.deductions : [];
            let tcs = draft.deductions.find(item => String(item.head || '').trim().toLowerCase() === 'tcs');
            if (!tcs) {
              tcs = { code: String(draft.deductions.length + 1), head: 'TCS', rate: '2', amount: output.value, remark: '' };
              draft.deductions.push(tcs);
            } else {
              tcs.rate = '2';
              tcs.amount = Number(output.value);
            }
            // Keep TCS as the final official deduction row.
            const tcsIndex = draft.deductions.indexOf(tcs);
            if (tcsIndex !== draft.deductions.length - 1) {
              draft.deductions.splice(tcsIndex, 1);
              draft.deductions.push(tcs);
            }
            draft.deductions.forEach((item, index) => { item.code = String(index + 1); });
            const tcsAmountInput = document.querySelector(`[data-ded-amount="${draft.deductions.indexOf(tcs)}"]`);
            if (tcsAmountInput) tcsAmountInput.value = output.value;
          }
        }
      };
      // Initialize calculated fields and the selected Bill Type panels.
      setTimeout(() => { window.toggleContractorBillType(document.querySelector('#clForm [name="bill_type"]')?.value || ''); window.calculateContractorSorBid(); window.calculateContractorRaFinalAmount(); window.calculateContractorAdditionalBG(); window.calculateMiningExcessRoyaltyTcs(); }, 0);
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
      <div class="contractor-style-scope contractor-tab-d">
        <div style="display:flex;justify-content:flex-end;margin:0 0 10px;">
          <button type="button" class="btn primary" onclick="addContractorDeductionRow()">+ Add Row</button>
        </div>
        <div class="table-wrap">

        <table class="table" id="contractorDeductionsTable">

          <thead>
            <tr>
              <th>S.NO</th>
              <th>HEAD</th>
              <th>RATE %</th>
              <th>AMOUNT ₹</th>
              <th>REMARK</th>
              <th>ACTION</th>
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
                        value="${esc(String(deduction.head || '').trim().toLowerCase() === 'tcs' ? (data.file_details?.tcs_excess_royalty ?? deduction.amount ?? '') : (deduction.amount ?? ''))}"
                        ${String(deduction.head || '').trim().toLowerCase() === 'tcs' ? 'readonly title="Linked to TCS (2% of excess royalty) in B. File Details"' : ''}
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
                    <td>
                      ${!deduction.head && index >= (OFFICIAL_CHECKLISTS[data.type]?.deductions || []).length ? `<button type="button" class="btn" onclick="removeChecklistDeductionRow(${index})">Remove</button>` : ''}
                    </td>

                  </tr>
                `
              )
              .join('')}


            <tr>

              <td colspan="4">
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

          ${((data.books?.accounts || [])
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => !/memo\s+and\s+mode\s+of\s+payment\s+in\s+measurement\s+book/i.test(String(item.label || '')))
            .map(({ item, index }) => `
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
            .join(''))}

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
                <input name="query_date" type="date" lang="en-GB" required value="${esc(query.query_date || new Date().toISOString().slice(0,10))}">
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
            <span class="query-saved-image-meta">${esc(formatFileSize(doc.final_size_bytes || 0))}${doc.uploaded_at ? ` · ${esc(formatDateDMY(doc.uploaded_at))}` : ''}</span>
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
    ['query_date','query_text'].forEach(name => {
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
    const fieldKeys = ['query_date'];
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
  const gross = checklistGrossAmount(data);
  const deductions = (data.deductions || []).reduce(
    (total, item) => total + Math.max(0, Number(item.amount || 0) || 0),
    0
  );
  return Math.max(gross - deductions, 0);
}

function checklistGrossAmount(data) {
  return Math.max(0, Number(data?.file_details?.bill_amount ?? data?.register?.bill_amount ?? data?.amount ?? 0) || 0);
}

// Keep the moved Bill Amount field in B. File Details connected to the
// legacy register amount used by payment and NET ELIGIBLE calculations.
function updateChecklistGrossFromFileDetails(value) {
  const data = state.checklistDraft;
  if (!data) return;
  const gross = Math.max(0, Number(value || 0) || 0);
  data.file_details = data.file_details || {};
  data.file_details.bill_amount = value === '' ? '' : String(gross);
  data.register = data.register || {};
  data.register.bill_amount = value === '' ? '' : gross;
  data.amount = value === '' ? '' : gross;
  data.net_eligible = calculateNet(data);
  const net = document.getElementById('clNet');
  if (net) net.textContent = `₹ ${money(data.net_eligible)}`;
  validateChecklistPaymentPassed();
}

function addContractorDeductionRow() {
  const data = state.checklistDraft;
  if (!data) return;
  if (!Array.isArray(data.deductions)) data.deductions = [];
  const index = data.deductions.length;
  const code = `D${index + 1}`;
  data.deductions.push({ code, head: '', rate: '', amount: '', remark: '' });
  const table = document.querySelector('#contractorDeductionsTable tbody');
  if (!table) return;
  const row = document.createElement('tr');
  row.innerHTML = `<td>${esc(code)}</td><td><input data-ded-head="${index}" value="" aria-label="Deduction head" placeholder="Enter deduction"></td><td><input data-ded-rate="${index}" value="" aria-label="Deduction rate percent"></td><td><input type="number" data-ded-amount="${index}" value="" aria-label="Deduction amount"></td><td><input data-ded-remark="${index}" value="" aria-label="Deduction remark"></td><td><button type="button" class="btn" onclick="removeChecklistDeductionRow(${index})">Remove</button></td>`;
  const netRow = table.querySelector('#clNet')?.closest('tr');
  if (netRow) table.insertBefore(row, netRow); else table.appendChild(row);
}

function removeChecklistDeductionRow(index) {
  const data = state.checklistDraft;
  if (!data || !Array.isArray(data.deductions) || index < 0 || index >= data.deductions.length) return;
  const baseCount = (OFFICIAL_CHECKLISTS[data.type]?.deductions || []).length;
  if (index < baseCount) return;
  data.deductions.splice(index, 1);
  data.deductions.forEach((item, i) => { item.code = `D${i + 1}`; });
  renderApp();
}

function roundDeduction(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function recalculateChecklistDeduction(index, editedField) {
  const data = state.checklistDraft;
  if (!data || !Array.isArray(data.deductions)) return;
  const deduction = data.deductions[index];
  if (!deduction) return;
  if (String(deduction.head || '').trim().toLowerCase() === 'tcs') {
    const linkedTcs = Number(data.file_details?.tcs_excess_royalty || 0) || 0;
    deduction.rate = '2';
    deduction.amount = roundDeduction(linkedTcs);
    const linkedInput = document.querySelector(`[data-ded-amount="${index}"]`);
    if (linkedInput) linkedInput.value = String(deduction.amount);
    return;
  }
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
    // Keep each Contractor Bill Details amount under its own key as well as
    // the shared bill_amount key, so the selected panel restores after reopen.
    if (data.type === 'Contractor') {
      const billType = String(data.file_details.bill_type || '');
      const advancesType = String(data.file_details.advances_type || '');
      const amount = data.file_details.bill_amount;
      if (billType === 'ADVANCES' && advancesType === 'MOBILIZATION' && amount !== undefined) {
        data.file_details.mobilization_amount = amount;
      } else if (billType === 'Final' && amount !== undefined) {
        data.file_details.final_bill_amount = amount;
      } else if (billType === 'ADVANCES' && advancesType === 'OTHER' && amount !== undefined) {
        data.file_details.advance_amount = amount;
      }
      // Persist manually added previous-payment rows independently from current bill details.
      const manualRows = Array.from(document.querySelectorAll('#contractorPaymentHistoryBody .manual-payment-history-row')).map(row => {
        const get = suffix => row.querySelector(`[name^="manual_payment_history_${suffix}_"]`)?.value ?? '';
        const date = row.querySelector('input[type="date"]')?.value || '';
        const raAmount = normalizeRaBillAmountNumeric(row.querySelector('input[name^="manual_payment_history_ra_amount_"]')?.value ?? '');
        const advance = row.querySelector('input[name^="manual_payment_history_advance_"]')?.value ?? '';
        const payment = row.querySelector('input[name^="manual_payment_history_payment_"]')?.value ?? '';
        return { manual: true, checklist_no: get('checklist_no').trim(), particulars: get('particulars').trim(), date, ra_bill_amount: raAmount, advance, payment: (Number(raAmount || 0) + Number(advance || 0)), payment_percent: '' };
      }).filter((row, index) => {
        const manualElement = document.querySelectorAll('#contractorPaymentHistoryBody .manual-payment-history-row')[index];
        return manualElement?.dataset.applied === 'true' && (row.date || row.ra_bill_amount !== '' || row.advance !== '' || row.payment !== '');
      });
      const renderedRows = Array.from(document.querySelectorAll('#contractorPaymentHistoryBody tr[data-history-row]')).map(row => {
        try { return JSON.parse(row.getAttribute('data-history-row') || '{}'); } catch (_) { return null; }
      }).filter(Boolean);
      const carriedRows = renderedRows.length
        ? renderedRows
        : (Array.isArray(data.payment_history) ? data.payment_history : []);
      let previousRaAmountForManual = 0;
      for (let i = carriedRows.length - 1; i >= 0; i--) {
        const entry = carriedRows[i] || {};
        if (String(entry.bill_type || entry.billType || '').trim().toLowerCase() === 'advances') continue;
        if (entry.ra_bill_amount !== '' && entry.ra_bill_amount != null && Number.isFinite(Number(entry.ra_bill_amount))) {
          previousRaAmountForManual = Number(entry.ra_bill_amount) || 0;
          break;
        }
      }
      const calculatedManualRows = manualRows.map(row => {
        const raAmount = Number(row.ra_bill_amount) || 0;
        const advanceAmount = Number(row.advance) || 0;
        const payment = raAmount + advanceAmount - previousRaAmountForManual;
        previousRaAmountForManual = raAmount;
        const sor = Number(data.file_details?.computed_bid_value || data.computed_bid_value || 0);
        return { ...row, payment, payment_percent: sor > 0 ? Number(((raAmount / sor) * 100).toFixed(2)) : '' };
      });
      data.payment_history = [...carriedRows, ...calculatedManualRows];
    }
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
      // Section G is optional for finalization. A checklist may be finalized
      // even when query details have not yet been entered.
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

          head: $(
            `[data-ded-head="${index}"]`
          )?.value?.trim() || deduction.head || DEFAULT_DEDUCTIONS[index] || '',

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

        payment_history:
          data.payment_history,

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
  if (draft && state.checklistTab === 'C') {
    // Capture current Section C values before finalization.
    draft.checks = (draft.checks || []).map((check, index) => ({
      ...check,
      status: $(`[data-check-status="${index}"].selected`)?.dataset.statusValue || check.status || '',
      remark: $(`[data-check-remark="${index}"]`)?.value || check.remark || ''
    }));
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
   CHECKLIST EXPORT — COMPLETE A–G PDF / EXCEL
   ========================================================= */
function checklistExportLabel(key) {
  const known = {
    checklist_no: 'Checklist Number', ulb_id: 'ULB', district_id: 'District',
    financial_year: 'Financial Year', status: 'Status', type: 'Checklist Type',
    created_at: 'Created At', updated_at: 'Last Updated', finalized_at: 'Finalized At',
    amount_approved: 'Amount Approved', query_sheet_no: 'Query Sheet No.',
    payment_passed: 'Payment Passed (Net Amt.) ₹', form2_number: 'Form-2 Number',
    query_date: 'Query Date', bill_invoice_reference: 'Bill / Invoice Reference',
    amount: 'Amount ₹', party_name: 'Name of Contractor / Party', query_text: 'Query Details',
    tcs_excess_royalty: 'TCS (2% of excess royalty)', payment_mode: 'Mode of Payment',
    cheque_issued: 'Cheque Issued', voucher_no: 'Voucher No.'
  };
  if (known[key]) return known[key];
  return String(key || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
}

function checklistExportValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(item => typeof item === 'object' ? Object.entries(item).map(([k,v]) => `${checklistExportLabel(k)}: ${checklistExportValue(v)}`).join('; ') : checklistExportValue(item)).join('; ');
  if (typeof value === 'object') return Object.entries(value).map(([k,v]) => `${checklistExportLabel(k)}: ${checklistExportValue(v)}`).join('; ');
  return String(value);
}

function checklistExportSections(data, attachments = []) {
  const sections = [];
  const ulb = (typeof ulbName === 'function' ? ulbName(data.ulb_id) : '') || data.ulb_name || '—';
  const district = (typeof districtName === 'function' ? districtName(data.district_id) : '') || '—';
  sections.push({ title: 'Checklist Summary', headers: ['Field', 'Details'], rows: [
    ['Checklist Number', data.checklist_no || '—'], ['Checklist Type', data.type || '—'],
    ['ULB', ulb], ['District', district], ['Financial Year', data.financial_year || '—'],
    ['Status', data.status || '—'], ['Created At', data.created_at || '—'],
    ['Last Updated', data.updated_at || '—']
  ]});

  const registerLabelMap = {};
  (A_REGISTER_CATEGORY_FIELDS[data.type] || []).forEach(raw => {
    const parts = raw.split('|');
    registerLabelMap[parts[0]] = parts[1] || parts[0];
  });
  const registerRows = Object.entries(data.register || {}).map(([key, value]) => [registerLabelMap[key] || checklistExportLabel(key), checklistExportValue(value)]);
  sections.push({ title: 'A. Register details', headers: ['Particulars', 'Details'], rows: registerRows.length ? registerRows : [['Details', '—']] });

  const file = data.file_details || {};
  const fileLabelMap = {};
  (OFFICIAL_CHECKLISTS[data.type]?.fields || []).forEach(raw => {
    const parts = raw.split('|');
    const label = parts[0];
    const explicitKey = parts.length > 2 ? parts[1] : '';
    const key = explicitKey || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    fileLabelMap[key] = label;
  });
  const fileRows = Object.entries(file).map(([key, value]) => [fileLabelMap[key] || checklistExportLabel(key), checklistExportValue(value)]);
  sections.push({ title: 'B. File details', headers: ['Particulars', 'Details'], rows: fileRows.length ? fileRows : [['Details', '—']] });

  const checkRows = (data.checks || []).map(item => [item.code || '', item.text || '', item.heading ? 'Section heading' : (item.status || 'Not answered'), item.remark || '']);
  sections.push({ title: 'C. Checks', headers: ['S. No.', 'Check / Particulars', 'Response', 'Remark'], rows: checkRows.length ? checkRows : [['—', 'No checks recorded', '—', '—']] });

  const deductionRows = [];
  deductionRows.push(['1.1', 'Gross Amount as approved by Accounts', '', checklistExportValue(data.register?.bill_amount ?? data.amount ?? ''), '']);
  (data.deductions || []).forEach((item, index) => {
    const isTcs = String(item.head || '').trim().toLowerCase() === 'tcs';
    const amount = isTcs ? (data.file_details?.tcs_excess_royalty ?? item.amount ?? '') : (item.amount ?? '');
    deductionRows.push([item.code || String(index + 1), item.head || DEFAULT_DEDUCTIONS[index] || '', item.rate || '', checklistExportValue(amount), item.remark || '']);
  });
  deductionRows.push(['', 'Net Amount eligible for payment', '', checklistExportValue(typeof calculateNet === 'function' ? calculateNet(data) : data.net_eligible), '']);
  sections.push({ title: 'D. Deductions', headers: ['S. No.', 'Head', 'Rate %', 'Amount ₹', 'Remark'], rows: deductionRows });

  const bookRows = [];
  (data.books?.accounts || []).forEach((item, index) => bookRows.push([`Books / records ${index + 1}`, item.label || '', item.checked ? 'Yes' : 'No']));
  (data.books?.documents || []).forEach((item, index) => bookRows.push([`Documents ${index + 1}`, item.label || '', item.checked ? 'Yes' : 'No']));
  sections.push({ title: 'E. Books & documents', headers: ['Category / S. No.', 'Book / Document', 'Checked / Verified'], rows: bookRows.length ? bookRows : [['—', 'No books or documents recorded', '—']] });

  const resultRows = Object.entries(data.result_details || {}).map(([key, value]) => [checklistExportLabel(key), checklistExportValue(value)]);
  resultRows.push(['Proposed for Payment (Net Amt.) ₹', checklistExportValue(typeof calculateNet === 'function' ? calculateNet(data) : data.net_eligible)]);
  sections.push({ title: 'F. Result', headers: ['Particulars', 'Details'], rows: resultRows });

  const queryRows = Object.entries(data.query_form || {}).filter(([key]) => !['document_ids'].includes(key)).map(([key, value]) => [checklistExportLabel(key), checklistExportValue(value)]);
  if (!queryRows.length) queryRows.push(['Query Form Details', 'No query form details recorded']);
  attachments.forEach((doc, index) => {
    queryRows.push([`Attachment ${index + 1}`, `${doc.original_filename || 'Query attachment'} | Uploaded: ${doc.uploaded_at || '—'} | ${doc.view_url || ''}`]);
  });
  sections.push({ title: 'G. Queries Form details', headers: ['Particulars', 'Details'], rows: queryRows });

  // Payment History is a standalone section in both PDF and Excel exports.
  // Recalculate the displayed payment using the same rules as the Contractor UI.
  const historySource = Array.isArray(data.payment_history) ? data.payment_history
    : (Array.isArray(data.file_details?.payment_history) ? data.file_details.payment_history : []);
  const sorValue = Number(data.file_details?.computed_bid_value ?? data.file_details?.computedBidValue ?? 0) || 0;
  let previousRaBillAmount = 0;
  const historyRows = historySource.map((item, index) => {
    const row = item || {};
    const billType = String(row.bill_type || row.billType || '').trim().toLowerCase();
    const isAdvance = billType === 'advances';
    const raAmount = Number(row.ra_bill_amount) || 0;
    const advance = Number(row.advance) || 0;
    let payment;
    if (isAdvance) payment = advance;
    else { payment = raAmount + advance - previousRaBillAmount; previousRaBillAmount = raAmount; }
    const particulars = row.particulars || row.ra_number_mb_book || row.ra_number || row.advance_particulars || row.advance_type_particulars || '';
    const percent = sorValue > 0 && row.ra_bill_amount !== '' && row.ra_bill_amount != null ? (raAmount / sorValue) * 100 : null;
    return [row.checklist_no || '—', particulars || '—', row.date || '—', row.bill_type || row.billType || '—', row.ra_bill_amount === '' || row.ra_bill_amount == null ? '—' : raAmount, row.advance === '' || row.advance == null ? '—' : advance, payment, percent == null ? '—' : `${percent.toFixed(2)}%`];
  });
  const historyAdvanceTotal = historySource.reduce((sum, row) => sum + (Number(row?.advance) || 0), 0);
  const historyPaymentTotal = historyRows.reduce((sum, row) => sum + (typeof row[6] === 'number' ? row[6] : 0), 0);
  const latestRa = [...historySource].reverse().find(row => String(row?.bill_type || row?.billType || '').trim().toLowerCase() !== 'advances' && row?.ra_bill_amount !== '' && row?.ra_bill_amount != null);
  const historyTotalPercent = sorValue > 0 && latestRa ? `${((Number(latestRa.ra_bill_amount) || 0) / sorValue * 100).toFixed(2)}%` : '—';
  historyRows.push(['', 'TOTAL', '', '', '', historyAdvanceTotal, historyPaymentTotal, historyTotalPercent]);
  sections.push({ title: 'Payment History', headers: ['Checklist No.', 'Particulars', 'Date', 'Bill Type', 'RA Bill Amount ₹', 'Advance ₹', 'Payment ₹', '% of RA Bill'], rows: historyRows.length > 1 ? historyRows : [['—', 'No payment history recorded', '—', '—', '—', '—', '—', '—']] });
  return sections;
}

async function prepareChecklistExport() {
  const data = state.checklistDraft;
  if (!data) throw new Error('Open a checklist before exporting.');
  // Capture any edits currently visible in the active section before exporting.
  if (data.status !== 'Final') {
    try { await saveChecklistTab(false); } catch (error) { console.warn('Could not save current checklist section before export:', error); }
  }
  let attachments = [];
  try {
    const params = new URLSearchParams();
    if (data.id) params.set('checklistRecordId', data.id);
    if (data.checklist_no) params.set('checklistNumber', data.checklist_no);
    attachments = await api(`/api/query-documents?${params.toString()}`);
    if (!Array.isArray(attachments)) attachments = [];
  } catch (error) {
    console.warn('Query attachment metadata could not be loaded for export:', error);
  }
  return { data: state.checklistDraft || data, sections: checklistExportSections(state.checklistDraft || data, attachments) };
}

function checklistExportFilename(data, extension) {
  const raw = data?.checklist_no || `Checklist-${data?.type || 'ULB'}`;
  return String(raw).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') + '-Complete-Checklist.' + extension;
}

function checklistExportHtml(data, sections, forPrint = false) {
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const ulb = (typeof ulbName === 'function' ? ulbName(data.ulb_id) : '') || data.ulb_name || '—';
  const sectionHtml = sections.map(section => `<section class="export-section"><h2>${escapeHtml(section.title)}</h2><table><thead><tr>${section.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.checklist_no || 'Checklist')} - Complete Checklist</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:10pt;margin:20px;line-height:1.35}h1{font-size:19pt;margin:0 0 5px;color:#163b65}h2{font-size:12pt;background:#eaf1f8;border:1px solid #a9bfd5;padding:7px;margin:18px 0 6px;break-after:avoid}p.meta{margin:3px 0 14px;color:#334155}table{width:100%;border-collapse:collapse;margin:0 0 12px;table-layout:auto;break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #aab4c0;padding:5px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f1f5f9;font-weight:700}td{white-space:pre-wrap}.export-section{break-inside:auto}.footer{margin-top:20px;color:#64748b;font-size:8pt}@media print{body{margin:0}.no-print{display:none!important}h2{print-color-adjust:exact;-webkit-print-color-adjust:exact}th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body>
    <h1>${escapeHtml(OFFICIAL_CHECKLISTS[data.type]?.title || 'ULB Audit Checklist')}</h1><p class="meta"><b>Checklist No.:</b> ${escapeHtml(data.checklist_no || '—')} &nbsp; | &nbsp; <b>Type:</b> ${escapeHtml(data.type || '—')} &nbsp; | &nbsp; <b>ULB:</b> ${escapeHtml(ulb)} &nbsp; | &nbsp; <b>Status:</b> ${escapeHtml(data.status || '—')}</p>
    ${sectionHtml}<p class="footer">Generated from ULB Audit Management System · ${escapeHtml(`${formatDateDMY(new Date())} ${new Date().toLocaleTimeString('en-GB')}`)}</p>${forPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});</script>' : ''}</body></html>`;
}

async function exportChecklistPdf() {
  // Open synchronously from the click so browsers do not block the print window.
  const printWindow = window.open('', '_blank');
  if (!printWindow) { toast('Please allow pop-ups to export the checklist PDF.', true); return; }
  printWindow.document.open();
  printWindow.document.write('<!doctype html><title>Preparing checklist PDF…</title><p style="font-family:Arial;padding:24px">Preparing all checklist sections…</p>');
  printWindow.document.close();
  try {
    const { data, sections } = await prepareChecklistExport();
    printWindow.document.open();
    printWindow.document.write(checklistExportHtml(data, sections, true));
    printWindow.document.close();
    toast('Checklist prepared. Choose “Save as PDF” in the print dialog.');
  } catch (error) {
    printWindow.close();
    toast(error.message || 'Could not export checklist PDF.', true);
  }
}

function checklistExcelXmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function checklistExcelCell(value, style = 'Body') {
  if (value === null || value === undefined || value === '') value = '—';
  const numeric = typeof value === 'number' && Number.isFinite(value);
  return `<Cell ss:StyleID="${style}"><Data ss:Type="${numeric ? 'Number' : 'String'}">${checklistExcelXmlEscape(value)}</Data></Cell>`;
}

function checklistExcelWorkbook(data, sections) {
  const ulb = (typeof ulbName === 'function' ? ulbName(data.ulb_id) : '') || data.ulb_name || '—';
  const safeSheetName = (name, index) => {
    let out = String(name || `Section ${index + 1}`).replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31);
    return out || `Section ${index + 1}`;
  };
  const uniqueNames = new Set();
  const sheets = sections.map((section, index) => {
    let name = safeSheetName(section.title, index);
    const base = name;
    let suffix = 2;
    while (uniqueNames.has(name.toLowerCase())) { const tail = ` ${suffix++}`; name = base.slice(0, 31 - tail.length) + tail; }
    uniqueNames.add(name.toLowerCase());
    const headers = section.headers || [];
    const rows = section.rows || [];
    const columnCount = Math.max(1, headers.length, ...rows.map(row => row.length));
    const titleRow = `<Row ss:Height="28"><Cell ss:StyleID="Title" ss:MergeAcross="${columnCount - 1}"><Data ss:Type="String">${checklistExcelXmlEscape(section.title)}</Data></Cell></Row>`;
    const metaRow = `<Row ss:Height="22"><Cell ss:StyleID="Meta" ss:MergeAcross="${columnCount - 1}"><Data ss:Type="String">${checklistExcelXmlEscape(`Checklist: ${data.checklist_no || '—'} | ULB: ${ulb} | Type: ${data.type || '—'} | Financial Year: ${data.financial_year || '—'}`)}</Data></Cell></Row>`;
    const blankRow = '<Row/>';
    const headerRow = `<Row ss:Height="30">${headers.map(value => checklistExcelCell(value, 'Header')).join('')}</Row>`;
    const dataRows = rows.map((row, ri) => {
      const isTotal = row.some(cell => String(cell ?? '').trim().toUpperCase() === 'TOTAL' || String(cell ?? '').includes('Net Amount eligible for payment'));
      return `<Row ss:AutoFitHeight="1">${Array.from({length: columnCount}, (_, ci) => checklistExcelCell(row[ci] ?? '', isTotal ? 'Total' : (ri % 2 ? 'BodyAlt' : 'Body'))).join('')}</Row>`;
    }).join('');
    const widths = Array.from({length: columnCount}, (_, ci) => {
      const headerLen = String(headers[ci] || '').length;
      const samples = rows.slice(0, 100).map(row => String(row[ci] ?? '')).concat([String(headers[ci] || '')]);
      const maxLen = Math.max(headerLen, ...samples.map(v => v.length));
      const width = Math.max(12, Math.min(ci === 0 ? 28 : 44, maxLen * 1.05 + 3));
      return `<Column ss:Width="${width * 5.8}"/>`;
    }).join('');
    const autoFilter = rows.length ? `<AutoFilter x:Range="R4C1:R${Math.max(4, rows.length + 4)}C${columnCount}"/>` : '';
    return `<Worksheet ss:Name="${checklistExcelXmlEscape(name)}"><Table ss:DefaultColumnWidth="90">${widths}${titleRow}${metaRow}${blankRow}${headerRow}${dataRows}${autoFilter}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane><Panes><Pane><Number>3</Number><ActiveRow>4</ActiveRow><ActiveCol>1</ActiveCol></Pane></Panes><PageSetup><Layout x:Orientation="Landscape"/></PageSetup><FitToPage/><Print><FitWidth>1</FitWidth><FitHeight>0</FitHeight><ValidPrinterInfo/><PaperSizeIndex>9</PaperSizeIndex><HorizontalResolution>600</HorizontalResolution><VerticalResolution>600</VerticalResolution></Print></WorksheetOptions></Worksheet>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>${checklistExcelXmlEscape(data.checklist_no || 'ULB Checklist')}</Title><Subject>Complete ULB Audit Checklist Export</Subject><Author>ULB Audit Management System</Author><Created>${new Date().toISOString()}</Created></DocumentProperties><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style><Style ss:ID="Title"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#163B65" ss:Pattern="Solid"/></Style><Style ss:ID="Meta"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#163B65"/><Interior ss:Color="#EAF1F8" ss:Pattern="Solid"/></Style><Style ss:ID="Header"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#315B82" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#AAB4C0"/></Borders></Style><Style ss:ID="Body"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style><Style ss:ID="BodyAlt"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10"/><Interior ss:Color="#F4F7FB" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style><Style ss:ID="Total"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#163B65"/><Interior ss:Color="#DCE8F4" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#315B82"/></Borders></Style></Styles>${sheets}</Workbook>`;
}

async function exportChecklistExcel() {
  try {
    const { data, sections } = await prepareChecklistExport();
    // Use a real multi-worksheet Excel XML workbook instead of a print-layout HTML table.
    // Each A–G section and Payment History gets its own formatted, filterable worksheet.
    const workbook = checklistExcelWorkbook(data, sections);
    const blob = new Blob(['\ufeff', workbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = checklistExportFilename(data, 'xls');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Optimized Excel workbook downloaded with separate sheets and Payment History.');
  } catch (error) {
    toast(error.message || 'Could not export checklist to Excel.', true);
  }
}
window.exportChecklistPdf = exportChecklistPdf;
window.exportChecklistExcel = exportChecklistExcel;


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
  if (event.target?.form?.id === 'clForm' && ['royalty_bill_amount', 'mining_royalty_certificate_amount'].includes(event.target.name)) {
    window.calculateMiningExcessRoyaltyTcs?.();
  }
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


// Shared Remaining Fund calculator. Resolve fields globally because checklist
// sections can be rendered/replaced dynamically and may not be inside #clForm
// at the exact moment an input event fires.
window.updateRemainingFundBalance = function(prefix) {
  const updateGroup = (key) => {
    const findField = (suffix) => {
      const name = `${key}_${suffix}`;
      return Array.from(document.querySelectorAll('input[name]')).find(el => el.name === name) || null;
    };
    const sanctioned = findField('amount_sanctioned');
    const paid = findField('payment_till_date');
    const balance = findField('remaining_balance');
    if (!sanctioned || !paid || !balance) return false;

    const aText = String(sanctioned.value ?? '').trim();
    const bText = String(paid.value ?? '').trim();
    if (aText === '' && bText === '') {
      balance.value = '';
    } else {
      const a = aText === '' ? 0 : Number(aText);
      const b = bText === '' ? 0 : Number(bText);
      balance.value = Number.isFinite(a) && Number.isFinite(b) ? (a - b).toFixed(2) : '';
    }
    balance.dispatchEvent(new Event('input', { bubbles: true }));
    balance.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  if (prefix) {
    updateGroup(prefix);
    return;
  }
  ['manpower', 'consultancy', 'store'].forEach(updateGroup);
};

function handleRemainingFundInput(event) {
  const field = event.target;
  if (!field || !field.name) return;
  const suffix = field.name.endsWith('_amount_sanctioned') ? '_amount_sanctioned' :
    field.name.endsWith('_payment_till_date') ? '_payment_till_date' : null;
  if (!suffix) return;
  window.updateRemainingFundBalance(field.name.slice(0, -suffix.length));
}
document.addEventListener('input', handleRemainingFundInput);
document.addEventListener('change', handleRemainingFundInput);
