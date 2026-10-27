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
    dashboard: 'à¤¡à¥ˆà¤¶à¤¬à¥‹à¤°à¥à¤¡',
    register: 'à¤‘à¤¡à¤¿à¤Ÿ à¤°à¤œà¤¿à¤¸à¥à¤Ÿà¤°',
    queries: 'à¤«à¥‰à¤°à¥à¤®-2 à¤ªà¥à¤°à¤¶à¥à¤¨',
    reports: 'à¤°à¤¿à¤ªà¥‹à¤°à¥à¤Ÿ D-1 à¤¸à¥‡ D-7',
    attendance: 'à¤‰à¤ªà¤¸à¥à¤¥à¤¿à¤¤à¤¿',
    admin: 'à¤à¤¡à¤®à¤¿à¤¨',
    users: 'à¤¯à¥‚à¤œà¤¼à¤° à¤ªà¥à¤°à¤¬à¤‚à¤§à¤¨',
    ulbs: 'ULB à¤®à¤¾à¤¸à¥à¤Ÿà¤°',
    logs: 'à¤‘à¤¡à¤¿à¤Ÿ à¤Ÿà¥à¤°à¥‡à¤²',
    company: 'à¤•à¤‚à¤ªà¤¨à¥€ à¤µà¤¿à¤µà¤°à¤£',
    logout: 'à¤²à¥‰à¤—à¤†à¤‰à¤Ÿ'
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
          Pre-Audit / Internal Audit â€¢
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
      <span class="nav-icon" aria-hidden="true">${icons[view] || 'â€¢'}</span>
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
          <div class="brand-copy"><strong>ULB Audit Desk</strong><span>Pre / Internal Audit Â· CG</span></div>
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
            <button class="btn secondary mobile-menu" aria-label="Toggle navigation" onclick="$('#side').classList.toggle('open')">â˜°</button>
            <div class="top-breadcrumb"><span id="topCompanyName">${esc(state.companyName || 'ULB AUDIT DESK')}</span><br><strong>${esc((t[state.lang] && t[state.lang][state.view]) || state.view || 'Workspace')}</strong></div>
          </div>


          <div class="actions">

            <button
              class="btn secondary sm"
              onclick="toggleLang()"
            >
              ${
                state.lang === 'en'
                  ? 'à¤¹à¤¿à¤¨à¥à¤¦à¥€'
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
      {
  "users": [
    {
      "id": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "mobile": "9999999999",
      "name": "System Administrator",
      "role": "admin",
      "active": true,
      "password_hash": "pbkdf2$120000$47865dd37e8f5e18d43684b8e658cb6e$b587da9b64e5d5485a220439c9ccd040f78772ed6baf5fc65943ac0ec08415117f4d5675db4b3b0c283efd5d6981c709649fe0928ae7b589a9696bfabe87f0f8",
      "created_at": "2026-10-08T08:19:57.431Z"
    }
  ],
  "districts": [
    {
      "id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon",
      "active": true
    },
    {
      "id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod",
      "active": true
    },
    {
      "id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha",
      "active": true
    },
    {
      "id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara",
      "active": true
    },
    {
      "id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg",
      "active": true
    }
  ],
  "ulbs": [
    {
      "id": "19a4737a-b927-4680-8fe4-d83c06042b8f",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 01",
      "code": "RAJ-01",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "06bcf8f8-c3dc-4888-8baa-b50047eee3ea",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 02",
      "code": "RAJ-02",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "ae4b5c60-959c-4dda-aff7-a8e734f1994f",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 03",
      "code": "RAJ-03",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "ab2beb2f-9723-41aa-b2b5-3ae0e4fe59f6",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 04",
      "code": "RAJ-04",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "9495bade-08d1-4a27-a56c-39745ab7b62a",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 05",
      "code": "RAJ-05",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "4a680aee-5a2a-499c-b9d7-37c238fdaf96",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 06",
      "code": "RAJ-06",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "c02c2034-e5d3-4cff-a59b-a978367e5044",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 07",
      "code": "RAJ-07",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "8cccf7ac-c8fa-4f0c-a439-0e67f5b309aa",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 08",
      "code": "RAJ-08",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "353ef10a-9dae-4fad-8345-15f5a9ab5190",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 09",
      "code": "RAJ-09",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "9b25b427-0ab8-412a-90cc-6fbece9ac5a4",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 01",
      "code": "BAL-01",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "9565dac4-84a4-4fa1-a2e0-0f5dff0201c0",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 02",
      "code": "BAL-02",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "43c3cc33-fbbf-4b0a-8a9a-690959e8e669",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 03",
      "code": "BAL-03",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "975de598-7b4a-468b-94c5-fc199ec4f43e",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 04",
      "code": "BAL-04",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "be2ca441-5290-49af-a7da-4f061fd9e2ba",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 05",
      "code": "BAL-05",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "e5a44acc-bc43-413b-af06-8ba339781cb9",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 06",
      "code": "BAL-06",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "27c613e2-0c2e-4e2b-af2a-8d9e25567994",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 07",
      "code": "BAL-07",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "7e7fb45e-933b-44c2-a7e8-ead626c8084a",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 08",
      "code": "BAL-08",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "f4eea35a-b96c-4b1b-8e18-76e4dfe38f26",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 09",
      "code": "BAL-09",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "bdb38b57-112c-49fa-8fc0-d4edd0081fea",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 01",
      "code": "KAW-01",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "ed11213d-9145-45d6-ae48-453abd97c693",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 02",
      "code": "KAW-02",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "424c7e26-b59e-4739-802b-f8d8618f96a0",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 03",
      "code": "KAW-03",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "c18c30ae-815c-4a5c-986a-244b75bc7c9a",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 04",
      "code": "KAW-04",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "138f7b4f-5fad-4c28-a5ab-9c2bce9b505c",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 05",
      "code": "KAW-05",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "b6a71182-0ad1-4e2d-90b5-441f035ece56",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 06",
      "code": "KAW-06",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "9e422161-6e94-4292-b00f-f4124ce630f8",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 07",
      "code": "KAW-07",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "ced3e09c-436f-482a-ae79-ee87652c920d",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 08",
      "code": "KAW-08",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "5d94fcd7-0e8b-4a34-ac8a-221213dbead3",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 01",
      "code": "BEM-01",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "4926122b-2bd4-48af-b153-bd401f6a0280",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 02",
      "code": "BEM-02",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "e65a2364-c71a-4862-915b-b95d5b540588",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 03",
      "code": "BEM-03",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "3a7cb174-87e1-41c4-ae42-092b58a84068",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 04",
      "code": "BEM-04",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "8fadc846-de65-4bd0-b467-b350fa234760",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 05",
      "code": "BEM-05",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "7bf183a8-2307-45fa-9f44-984bec6f241f",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 06",
      "code": "BEM-06",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "f6c2f604-6a5c-4765-abb9-1a599a2df9d1",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 07",
      "code": "BEM-07",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "59adf61a-4f32-402f-981d-15a3f158bb9a",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 08",
      "code": "BEM-08",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "5151e4c2-3b1f-4e7c-9e96-7c3b42d07004",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 09",
      "code": "BEM-09",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "54dd3a98-c81d-4d20-9f1d-bef6157cf777",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 10",
      "code": "BEM-10",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "6211f051-4096-4b53-b85c-92a55a6e1d20",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 11",
      "code": "BEM-11",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "a994cd3f-e713-49a4-8623-4dc7cd33a667",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 01",
      "code": "DUR-01",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "328cd2cd-108e-45d9-a6a4-2c93bd41d7e2",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 02",
      "code": "DUR-02",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "63eed8d1-c32c-47be-abfb-033d38ce48be",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 03",
      "code": "DUR-03",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "e5149743-08dd-4ccd-ae5b-b5082d36b366",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 04",
      "code": "DUR-04",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "4f5fb4ec-8ebe-4e7f-946f-eb2585c6e377",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 05",
      "code": "DUR-05",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "29404306-ddb0-43e6-976b-27f09ac2b54d",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 06",
      "code": "DUR-06",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "bb505678-d04b-4f41-b0e8-4277187be460",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 07",
      "code": "DUR-07",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "128e1dc8-3570-414a-8eb3-e2d347478635",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 08",
      "code": "DUR-08",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "3f629004-d8b4-4264-b3d2-5c05b17c2058",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 09",
      "code": "DUR-09",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "ee4ef430-91ce-43ed-9fc2-8bb25590699d",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 10",
      "code": "DUR-10",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "42a3851a-6e10-43bc-8ab2-f8cc22ad5238",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 11",
      "code": "DUR-11",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    }
  ],
  "audits": [
    {
      "id": "21c310e2-2235-4858-b48d-bc1dcae338ef",
      "checklist_record_id": "8b457767-8a34-4da1-a411-35cdb30cd54f",
      "ulb_id": "19a4737a-b927-4680-8fe4-d83c06042b8f",
      "financial_year": "2026",
      "month": 10,
      "checklist_no": "RAJ-01/OCT/01",
      "voucher_no": "",
      "voucher_date": "",
      "file_received_date": "2026-10-26",
      "audit_date": "2026-10-26",
      "scheme_fund": "",
      "nature_work": "",
      "party": "",
      "amount": 4518,
      "payment_approved": "N",
      "proposed_payment": 4518,
      "payment_passed": 0,
      "cheque_issued": "N",
      "audit_status": "Audited",
      "query_status": "",
      "form2_number": "RAJ-01/OCT/01-Q1",
      "query_text": "",
      "remarks": "",
      "updated_by": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "updated_at": "2026-10-26T21:37:50.598Z",
      "created_by": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "created_at": "2026-10-26T21:37:50.598Z"
    },
    {
      "id": "7058323d-b8ad-4329-afb8-3be893a85920",
      "checklist_record_id": "6547b630-44a6-4173-ac4a-ba75a6f658e2",
      "ulb_id": "19a4737a-b927-4680-8fe4-d83c06042b8f",
      "financial_year": "2026",
      "month": 10,
      "checklist_no": "RAJ-01/OCT/08",
      "voucher_no": "",
      "voucher_date": "",
      "file_received_date": "2026-10-26",
      "audit_date": "2026-10-26",
      "scheme_fund": "",
      "nature_work": "",
      "party": "",
      "amount": 4518,
      "payment_approved": "N",
      "proposed_payment": 4518,
      "payment_passed": 0,
      "cheque_issued": "N",
      "audit_status": "Audited",
      "query_status": "Pending",
      "form2_number": "RAJ-01/OCT/01-Q1",
    8”uÖ]# µHu«‘­®âh%·‘SDqK&¢Â¥q¡Ü˜¼#9´7dÄ’PÉCY«
ÑÆ LÜ!ÚmkîICCQñêî|Ùçİo[<)'~«P…ß*æ~«<ğZ;âºÕÔ#z¶ænlÆ†pÂ	.2„3WbmhRkÛGÊå92Ä¢7eˆ5â4WYÄ¹pnßŞÂvj	dej–ïÆ¹‚^×@n`œ!¥(ô{2¤£/]bïº	¢QŒ(A”"Êåˆ¦ˆ
D%¢
ÑÑÑÑÑ
Ñ%¢5¢+D×ˆnm,BÒQON986ı|Ñ9òXQsïÂŞ( H$’ÉL@J 9%K k W@®Ü Ù‚z@} ä.€¦šéÇGÔ–â¢- ¬‘“Ÿ¥˜H=0‘zÀ˜xu
>}`#[éD%¢
ÑÆ @J¾‰ VìÁMG“ÀG4vGklb¬HSùÚòÂkíÈ3¿ULËÜo3²ö[ÅdlTkX(õå¤—&6Z•¹7ftZSú&M¸`F†¸zÀØĞÿš¨À„íÆ#e¹Å_Õ{»ø#Îi•Ê-şÚÊ-şš°KÓÉÊÔD`ms½®ÜÀ8CpİuHÙš»rmcH`!e;ó]-]ı`‘£EˆbD	¢Q†(G4ET *Uˆfˆæˆˆ–ˆVˆ.­]!ºFtƒhcê‡®üÇ¦ŸõC×œ}úüÚ|;AKŞFãÚ’
›ò:âAebŒxCF@b 	H$2R )T†`1îzjÌ‰âî~+Ë&ãuDN½Ö®¬~«ÈôUíƒ9O®gæÆ‘4‹ŞÙP×Ó‚¿pÄ\[ÒX(²Û¢|MŒQ“b„(¶ˆswj‘{TÑ.³F\tr‹ê´¦¿`¥©ÆÑ®¨w%Y]QHÀrb$VÑÕ¤G[Š/-½K6âKë~K{ÊÄ¹´T&ã®9qTP¨VZ~¾câ´¡d#vL÷8¦ôB#Ç´àw5y³*O¬‘›L?N'•±
x£Š³ãÍ±Öd*]Ì½f{0QK‚F'À6¢Ø"®}	¢Q†(G4ET *UaÆïyš6ú‘¯£™hk{Š«¶	¢ÈC^éyƒ×JÍ½çMC8à H$’R§ğ:qLáW@¯Hdddd	däÈÈ•!XšÔæw7‰İ5÷J“Ÿ&D½½›^E¢N&¢H¥‘£3cRow3Cê\WeÃ©VTÑUà"ÂÕË€‰pu0®^ÌLT	½ ¿³×¾Ôö´×¸4-â3A!Š%ˆRD™EüØ2µˆı*,b¿JD¢¢9¢¢%¢¢KDkDWÒ£pÇ¦ŒŠ‚ù¶nïˆˆª¹Ÿà´¬rœ$‘éÅ61H
$’™)€”@* 3CIçˆvêIí4V„w²–‰±#é¤±Msï=©ªÍ ªp6È£ˆÒQµ³¢`fP`ó+õô7dIO«-oóÄ›lb­EˆbD‰Aô™–u=E”aÇÑQa×ÏQe{?³(°…Ê<¶M)KzZ3Ò|‡€
kÅ)¥‡|ñ¢D`3‡ê×u)úÒÓâovlïÛ	H$’ÉañRÂş”Ğ«22² ²²2÷ßÓš¾š»•|¬H³íz¢LÇÆWMâÛ‹š‚}f/ÂZ |]‘1æÍ8l#\[L„7Ë€‰¸ĞÊ˜`é{ê™‚ô¶ZÿRÛû
Â"ŞQ„(6ÈÉ	Z¥h•Y+V…Eœ}J‹Ø¯
ÑÑÜ Ç¯¢%¢•SMßSÇï†9®í)Ì¼RDsDDKyÙ§ïÉGgûÀQ[myÑr²H$’É€ä@¦@
 %
ÈÈÈÂ@öñ¤œ>8ë»§q=qd“ø­âÜ$U­êœ ):¹o/c¦ÆşMQ#GgTş¨â±lf;¸7"¿9·F\&§jßİ_úZÉºêÅ"ÍQ„(F” JrÒ@†V9¢©E†Qi{_!šYÄ;ohaQ ñx
ùİ0§êG–jµqâ™ZÄ‚¦@4³ˆqæò']£õ(n\ÿŠÓO<Ú†M$’É€ä@¦@
 ¥!„á	Nç¶µŠt5ûlÕê¥„Ø·—7Æ^İ4ZDY§ldÕmîÚ²cj;¼•
kÄSZH	GÄp_‹aObˆ:in¨/¸R6²7T„—ĞÎéğš»B21Ä¿´m)5—6(pé¿©ÀèwÌõä³Ò[Ä©d‚(B#Jr²^Š(Ã9¢)¢‘úav}C˜¼O5%µ½—¼Ry9hpDüÔÜ;V1„3ÎH$’ Id@r S Hdddaæ²’%'×š»;f¬ïRñd’û7åJjŒ¹’û£
I5û+£ÎqÔ…A]êÊõ‰ó;ÏI”+¹»ÔX1ŠĞ*F”XÄi5E”YÄÃçˆ¦ˆ
D%¢
ÑÌ"ökhaQ`Ç»rå0SZ5§£WJP{‚RsKá016¼±# 1HjH`“¨Bm7‰ëœ.à\ÑÆ"¼I„¦Tk]ğÙF”œ8`"
v0»15&õú¯O¢rCŞşÙzW *UòÓ³+ÜĞI14Á=;t‹º3DÍİ5Q„£/}bcÿfŠJŒ‘“¢Rƒ¹%ßuLWB^“!vLèÀXµÒ²xÇ1mä9¦QÀ1·à’cïe¹¡²§‚ëh‹8çLEˆb‹8u$ˆR‹0uİzş†ïœ:†n	s§Aq/uÔ–ŞSH$’É€ä@¦†`ÂQï|	%œš»K~\¿Æ¾¤/bcï®>‘p’€‰H8iÀD$œ©1á„SòfÂ©ØÈ&œ¢9¢…‡¼„3¥Ç’š»¡›Ø>GjÑPWw_iöõ@<¹dÆşÍ}#g_O
8¦êG u]q#Â‰	ÍŒı›ß¶É­oä©AÇdù¡ÌòEØ1±3cÿczPú4Ñ.š©é‡©5wWÃDvL¬ïÌØ“cöš¹EÜP™º™8Ê¶ïÈNz›–LÈ9	Q„(F” JeˆrDS‹œL®_¦ßmõ¸{ùV¿Êë•^7öã‰"LßRşü©Áúb4ñ£œ&‘‚+[ÎÏF*ÔØBg™#uT‰-ÅpD¯’	ğv¤~KhétFêç]¡–ÔòŒ¾8Rß,Ä>IçãH}õ[HƒŒ”Äµ´©¥\ábºÚÇÔRïzÑgL¾©/Pâuè›v£ˆ¾"‡-ÉpD/ò	pŠšú1 …¢¦~_hé©ƒ›@Ëàl¤ÎU°…¢Fêœ	[èá’ú„fšGêùûõıÍPË€Zê‡5ú$µc@¾©“5ÎéÉë =º}êO}N›Ñ[çÔ+öŠíË·û§×“z-½ıî•‘ı~ºúoza^MIü¾?Ğ»çì¿¾Óûwô’Ÿ³¤’¾î÷ûºˆyußç“×Ûí½´Omí_îé5€õÛÿ.ZôšBj{ŞÑÕF÷w­—ô®^q§ÍË
?ÿ_    ÿÿ PK     ! ĞNÒ  )4     xl/styles.xmlÌ[Ûâ8}_iÿ!Ê;H‹0ºi¤ÙÕJİ#ík ,å‚’0³Úß²sÇ88MBàc—OÕ©*_âÌ¾=Wú‰Â¾%kOª,!l°¿µäËÁT–¢Øö7¶øÈ’O(’¿ÌÿmÅ'½ïŠ%áG–¼‹ãı³¢Dëòìè)Ø#şq‚Ğ³c¸·J´‘½‰H#ÏUtU+}y>s?¤upğc@¡¦%óYôKúi»P¤ÉÊ|¶Ü ”bHh‰o{(©ñb»xbRÍ±=ì’bPHi=ûAH
ÒgÒó|¶"µîÔ×¥~ÂíÊ’—ğQáCĞµ¥XŞ•Z1 Pcbïú4™æt¬Çã‰:³,‰wÇ@ëÇe+ÁH©Fª1ªšım$ıøFJ§®øoNs½‰u y2ÑÈg25‡ÕŞZŒ u+w­Ôf]ôEå±ëæ¹iHRÌg{;Qè/áFJ¯?N{HL>$JbY%©w¥ö6´Ošnˆ7ˆoŠíM‡yê ÉƒˆY¥`ƒhcÉcj"¥8G1‚« ÜÀ e`]‡’²ùÌENbC¼İ‘ß8Ø“N‚8<¸Ø`{ø¶—JÖ"û%-aô€Â’ãMô	QçĞHÅ´¡ú…"T gˆ…ê'Êµ¯[b=!]A%"ŠˆcÜC|ğ H®ús•ó+íJ¬C»k¡u™ËNºÈ8º"œeéJƒf
¢(e“Äúğ-œ¯2£
öUhÜ¤Aá|Eˆ&²LiøFrM:êEPìÓ
¶U[PCCÖ®vL+¹¶P}QĞW¸ªÅ$Ú‡à›Íš|.ÅÕêX²{ƒ„4.<R¨z3$B"›ç±Ú®Mº¸Q	¡æ¢N¸)aBBjsu…ÚÕIçÃ0½^#×}'óà¿|­ÁìáèHşÁ[zñ7˜¦ÃZ˜lId—°®H/“étrè”²´DvIì„l4—+¼ƒ¦­59o-Ùû½{ZĞÕÙ¢Iî¿ºxë{ˆîí :Ø©In¥]â_ 3ÙâYÃÿ(Ù™9:ÍUĞù ÀfMU¶*mÔª4£UiãV¥MZ•{™[;Ö'85[•›”m‚ƒÎVÅ}.ÀíÉvÅ…¼sn	AÛM|C¬ôg–£ªºL{<³ô‰	\¶U5AË“Å¤'Ékd“UÈ«ï1N±„ué6ÄTÏÌZcF ¢5Y%J by‚sh€¸ôYo‡Q¢5\<7dF¢Ì^Æ%lf\jQ6ôYAy²ÛŸ¨ZiéRãhh`²2“%²±MFFú DùÌ<Vkwz§1	´H75±^ŠO¸,âSkw‚§1qu:&”n§ƒêÕè¹IœÖî2@gé6t|]Dà"7Ãbf­÷KW<Hi÷ƒÄóSu?HÜ¼p©ğÅûyPX×ûÙ…GUÍƒô€İ#q0Ú^œ¥ôHÒZ©G_âe"†¸.3CU rºóÂG‹#$Æ.÷&À/.ZIcæ~˜xËRfò[…Ôæ^	³:¨BèÒŸy˜Fÿ˜u@ÿ˜$Ü?¤Œ°Ï½Ù5jÿÌu˜¤B{ÿôYl‡ÔîØğlÖb¢lO‡)ª>ŞäˆI·äñV1ˆjöÈxşÀn¹µCô <õ/-¨,ÈHäEKş“¼…á–ÖÇ«váôşÌ¿8T 27Çâ˜=RÛ+xÙƒ`È{›mcÜø#ÿÓ’‹ë?è	IğÅ´Ö_øgS–\\'‡ŠÁ``fˆÂïœ†_ébKş÷m11_ß–ú`ª.¦ƒÑÓX¼ŒÑËâõuiªºúòèD^?y>j#æ¯Ã 
œøig•ÇÁkÄ¾„b*fö
y\¨¦Ê¦àß‹2K.İ$ğéÙm€]Ænêcõ«¡©ƒåPÕ£±=LÇCc°44ıu<Z¼K£„İøvMU4­ o<ÇØC.ö3®2†Ê¥@ÜÖ(¡dL(QşÏü   ÿÿ PK     ! é¦%¸‚  S     xl/theme/theme1.xmlìYOoÛ6¿Øw tom'¶uŠØ±›­MÄn‡i™–XS¢@ÒI}Úã€Ãºa—»í0l+Ğ»tŸ&[‡­úöHJ²ËKÒÖÕ‡D"|ÿßã#uõÚƒˆ¡C"$åqÛ«]®zˆÄ>Ó8h{w†ıK’
ÇcÌxLÚŞœHïÚÖûï]Å›*$A°>–›¸í…J%›•ŠôaËË<!1ÌM¸ˆ°‚WTÆİˆUÖªÕf%Â4öPŒ# {{2¡>ACMÒÛÊˆ÷¼ÆJêŸ‰&Mœ;Ö4BÎe—	tˆYÛ>c~4$”‡–
&Ú^Õü¼ÊÖÕ
ŞL1µbma]ßüÒué‚ñtÍğÁ(gZë×[WvrúÀÔ2®×ëu{µœ`ßM­,EšõşF­“Ñ,€ìã2ínµQ­»øıõ%™[N§ÑJe±DÈ>Ö—ğÕf}{ÍÁÅ7–ğõÎv·ÛtğdñÍ%|ÿJ«Ywñ2O—ĞÚ¡ı~J=‡L8Û-…o |£šÂ(ˆ†<º4‹	ÕªX‹ğ}.ú Ğ@†‘š'd‚}ˆâ.F‚bÍ o\˜±C¾\Ò¼ôMTÛû0Áz¯ÿêùSôêù“ã‡ÏştüèÑñÃ--gá.ƒâÂ—ß~öç×£?~óòñåxYÄÿúÃ'¿üüy92h!Ñ‹/ŸüöìÉ‹¯>ıı»Ç%ğmGEøFD¢[äğt3†q%'#q¾ÃSgv	é
à­9fe¸qwW@ñ(^Ÿİwd„b¦h	çaä ÷8g.JpCó*Xx8‹ƒræbVÄ`|XÆ»‹cÇµ½YU3JÇöİ8bî3+˜(¤çø”íîQêØuú‚K>QèELKM2¤#'‹vi~™—é®vl³wu8+Óz‡ºHHÌJ„æ˜ñ:)•‘âˆ~«°LÈÁ\øE\O*ğt@G½1‘²lÍmúœ~C½*uû›G.R(:-£ys^Dîği7ÄQR†Ğ8,b?SQŒö¹*ƒïq7Cô;øÇ+İ}—Çİ§‚;4pDZˆ™	íK(ÔNıhüwÅ˜Q¨Æ6Şã¶·[SYJì(Á«pÿÁÂ»ƒgñ>X_ŞxŞÕİwu×{ëëîª\>kµ]X¨½ºy°}±é’£•Mò„26PsFnJÓ'KØ,Æ}ÔëÌ‘ä‡¦$„Ç´¸;¸@`³	®>¢*„8»æi"LI%\ÂÙÎ—ÒÖxèÓ•=6ô™ÁÖ‰ÕÛáu=œr2fË	Ìù3c´®	œ•Ùú•”(¨ı:ÌjZ¨3s«ÑL©s¸å*ƒ—UƒÁÜšĞ… è]ÀÊM8¢kÖp6ÁŒŒµİíœ¹Åxá"]$C<&©´ŞË>ª'e±b. vJ|¤Ïy§X­À­¥É¾·³8©È®¾‚]æ½7ñRÁ/é¼=‘,.&'‹ÑQÛk5ÖòqÒö&p¬…Ç(¯KİøaÀİ¯„ûS“ÙdùÂ›­L17	jpSaí¾¤°S!Õ–¡3•† ‹5'+ÿZÌzQ
ØH)Ö7 ş5)À®kÉdB|UtvaDÛÎ¾¦¥”Ïƒp|„Fl&0¸_‡*è3¦n'LEĞ/p•¦­m¦Üâœ&]ñËàì8fIˆÓr«S4Ëd7yœË`Ş
ân¥²åÎ¯ŠIùR¥Æÿ3Uô~×ëcínrF:_Û*äP…’ú}ƒ©-pÓTpŸlşr¨ÿÛœ³4LZÃ©OĞ 	
û‘
!ûP–LôB¬–î]–$K	™ˆ*ˆ++öˆ6Ô5°©÷v…ê¦š¤eÀàNÆŸûfĞ(ĞMN1ßœ’ï½6şéÎÇ&3(åÖaÓĞdöÏE,ÙUíz³<Û{‹Šè‰E›UÏ²˜¶‚Všö¯)Â9·Z[±–4^kdÂ—5†Á¼!JàÒé?°ÿQá3ûqBo¨C~ µÁ·MÂ¢ú’m<.vp“´Á¤IYÓ¦­“¶Z¶Y_p§›ó=al-ÙYü}NcçÍ™ËÎÉÅ‹4vjaÇÖvl¥©Á³'S†&ÙAÆ8Æ|Õ*~xâ£ûàè¸âŸ1%M0Ág%¡õ˜<€ä·ÍÒ­¿   ÿÿ PK     ! ÔÁw §  c     xl/sharedStrings.xml¬XİoÛ6°ÿá` [‚!qÛÃĞ%*d[NŒÙ²c+²7Zbb­©‰”Sÿ÷;J–ki×{”xß¿;òæÓ×<ƒ5/U*ÅmçİõÛpË$/·Çhxõ{”f"a™ü¶³áªóÉûñ‡¥4 ¯P·•ÖÅÇnWÅ+3u-.ğäY–9ÓøY¾tUQr–¨ç:Ïºïß¾ı­›³Tt –•Ğ·ïí@%Ò+Şoş¼ûğ¡ãİ¨Ô»Ñ^Äã•Hc–_¥\³ì¦«½›®9m(‚ıN­?>ıc†P^ŸA5`šŸA6WT˜	ÙGU°C‰1Q¼\óÃÁ­§<ŞË9ØêDÂK‰uª1YGCñš®œÛÁC·w‡4ç»vÈ×ØqÜ¯cª¥ôe§Zs¾óöXX”ÎÌ{"Ñv00¥ÇDÓĞÄSÁDœ¨v›Â•U•Ë+Ù\›ÜIqpRß¬ô|‡gÀUú"˜F0"&œĞïØ5Â¾­'Ù(øôæ	ÎÅtNè1Åñ«²Ğ#»y¹;„O@	€°W™3$æ¸àeÌ…f/.Ş\R}ÔC:JcN§…+äƒR‰|¥©pWƒ¿”k¥z<“¯T#vPQiƒiŸÑ˜ºÑ`şš¥[f4\GLHÄB)°uf¼¬çˆ9ÜU¬d^Œ?[\Â€k”ª }6™Ìp° «Rƒ¯Ú´p¦i@>ƒ±:ãF>üÄòâ˜s¦ì:=à#»Í œªä9¦zR~Áf¦Ö¸afÒîÀµ¯c€£25s˜2uşKÉk5Ä,oæ4KõÆ¸:¬DÒ29nI8Üö %ç^‡”ˆô ÚK³Ìå_o4Cô4ˆ·Y0÷a‰’±g°ˆştKğs³”Pß¼½ÊÀäÅM¯Àue	Şÿ%Ë/ûµtŒ>IºyŞİl6ÔìnòqÜÀæ¼¥¦$­a§O Ü(ó$fŸègÜ´öOŸ—:}Æ6±wVÑ	’¹Ü°Í5¹¤ª¶qÅŠÛR]¤b—bÙ¢ş.Ş¿1ÕÊ¿Æ\)(Ee£„¨vç÷[Ğ+.3„.‰d‹y…W+DHRÂkŠhêŸ¬ÒÄFí
0«–&Ä‚]A4ç+› 4kúòWÜ±©Óox>c˜Ÿ8-ãèàö<ã±Ú¾ªÊp‘×`äQîpŒ4Ï[n°Ós‡ÿÎâÆ`†Óÿ)–nûB)® «©wj7‘˜¨ªŒW8a‰ùŞ]0¡¿¦³ „(5ÃÇ£É(
GN§‘¦¡%1º·d¹İ YÏãzÈ™À†ßà­aØƒ [oY˜à¶—J˜›…ùÖ%‹-hXHBòÄH·=mØ`ZšáñxéÃq1g¦ÈñºBÏ÷ö,z4ç1O×N®Yè\lGØlj÷w·»1İ0PMSÙÔÂVî©InL rÜj7­Ó/ÓW?óaµöòzÁlØ£>ÑïÍ˜à¸İœ=Ùç˜œÏë™ı»0·tìÙì›3¶©×+è¯˜ÀeBK¢ñˆÍ@\ f!BÎbkÕEf®×>‹í›=–Õ¡#lŞœp£·-¡¾Yyqu¹ó¹6"1½rq{	x·%¸o÷G¬¢T¬±/e¹¡ş{÷BBïáÑ£Qôd™>™>†ı»(¯…ı>ñ%ó“§á+,+­­Õí“ò5ãÉK³Å˜A¿8üÉ¹Y‰Š#Bê×wA‡½0@¸ĞiŞßXBĞÅÅ¼ĞúšQ¸¼vc›óˆÉº®’9Ç÷$eÀ‘Êô·mÓóúlK‡·üªZ*£DhÄ¨$UÌìö$ß ¦İ¨´i8…Vi„ÁĞ*€ş}ğğH)İA˜ùO“ Œ`àGåÿAL·kÄHà;_fà@ÕƒÁotöÈiÍ3¾=µÔ£H¢(˜v´‘b/ˆC¸?x‰’¼‹! ãÍÄ±^ÃÜ2âLß‚”w”Ë„ép8êü1<.ì Ü!ÆögCj;»BÚKÂ=>`šÁÁâúÍÒÚ´ê½^ÖRTùÒÚÖÜîqÕPDÙ]ÙÀ)ÔûvnØ	÷	•{—Y—^7çşEµ]ŠÏR¥8qFRi·âÔìEà>ûaßzÅuÛ÷¹°1<—2‡I–æÚLLñ¬¾@ÖKÛòò“p­7UO)êëáv­"gn³P <ïÙÑÅGrï?   ÿÿ PK     !  ¡~÷;  ³     xl/worksheets/sheet7.xmlŒ˜[s«6Çß;ÓïÀğ^cÀöI<ÆgÚæØæŞééå™`ÙfbƒJrÎ·ïêHZÒéK‚Ú]é¯]	¡Íço·«õFÚ®jêÀvgsÛ"uÙ«úØş±ûéÁ¶:ZÔÇâÚÔ$°¿“Îş¼ıñ‡Í{Ó¾tB¨ê.°/”Ş×Ó•r+ºYs'5´œšöVPøÙîŞ’âÈnWÇ›ÏWÎ­¨j[DX·ÿ'Fs:U%yjÊ×©©Ò’kAaüİ¥ºwövs¬ 	²Zr
ì'o{¶³İğ®ÿªÈ{§<[´xşJ®¤¤ä3`[´¹'äD%×k`ÿüÉ¶˜Ôç¦ya!ØÌ¡{°>Š’VoDX‡®Óõï–=CŸÎĞ©úÜ`Ç§ç·Ö:’Sñz¥¿7ïR/F²dîes[økİ*HĞÒ¶nÅ7şÿ½:Ò˜y3ïaé.W´•¯mnËŞ½ÀñTĞb»i›w¦šô^°Ä-ÖĞ•%ºœ}‚Gz©Ê—_6B:øºŠ…yb˜‡•/¬°3ÁŞ„&ˆL› 1Aj‚Ì¹ Ÿø4ÈAébZ)ÃÍI( sÄ*îm»xÜ8oáRNC¨5>è‘å±Õ|ééæ©0_¨6«…n“I›1¹ HdXÍ|ŸH†Uy¹ Ø5íÏ°æ/ ö‡¥öÿQåõãbæP‰ó¡ ¾HÂ‹“gb‡È‘"¡ Ş9B$F^	")""¹$bKP‹Í…çƒéèW7«æß¬·4ÒŠÄ÷õ"Ù÷F¼JmÆ~ ûŞñÖ7¼†Z_ÎÍ°ÌŒ&Ô±5¦l3CX±ö´°®o,“½+­&â²âŠ+Š^‹»tÍáJ£‰°,M"ìŠíŠÃpEúü±Tö®@«Çÿ˜˜ÃhÔo¡DşX½F1F	F)FFy&ä²—û”\ÆÛ÷‡5·wZ[Ö£££££££\"¶923)qCœ@š¸uïúæ&ÏûlÅ1Â(–Š²¯‚¤Gc¤=âiâÛZ†cåMè…}lR/çº^‰”a0
1Š0Š1J0J1Ê0Ê%š7î’ÚÂô7Ä	¤‰’Ì…±‹…2–âaK¤&³GJ2{¤$ÇÊ%šÒ;nÇº^±Óª+ÓHö£££££££\¢)qãKA'¶{Mœ@š¸©É4öøĞ¬ú5aK¤%S8.ÕdJ¤&…Ïe¬)½ãËJ×+ŞCš^4½…ì$ U¯XEÅ%¥eåM‰“º8q|ÔÄ	¤ûÀ>Z„5™Æù7­Æd=Š¥•–La¥%S"5™(V.cMé¿º^qÜÕô
¤éE(ôŠ0Š1J0J1Ê0Ê%š÷ÁùÇ“çå@ ‘&N‰à¨0œİ…q±c„Q,‘–L^K¦Dj2‡Aô…‘ËXSz?8 Áu­Œ_Sû¶ŒBŒ"ŒbŒŒRŒ2ŒØÍªò+®Ä×ş´g~9ÑYeóZ³ozµW$0İë¦	¦Ìlq×ìh2Ñâ¹àÃ·IÓÇó¡…×
jYBŸU£¾_Öìó÷“.Öğq‹9|š€Ï<Šµ€–iZ¦Fçù5;®C?În^îÅ™¤E{®êÎºÂ­ÜşÌ ÂZqGÃŸá¾ˆSØE
÷/ı¯Üv¸™ÏàmqjÚÿ€NXÜ¯„¾Ş­¦­à&‹_`ö½ii[TzXWÇÀnÃ#Ÿg¸nÛş  ÿÿ PK     ! 4‡†T
  1-     xl/worksheets/sheet5.xml”šİ“Ú8Àß¯êşÊïó1‰k˜­Ú`ìî;Ëxf¨0xH²÷ß_KêvKj“ì>eòSH-©Õ2zøå¯·cï[}¾šÓ4|¸zõiß<N/Óà÷ß’ÿ|z—ëîô´;6§zü¯¾¿<şû_ß›ó—Ëk]_{`át™¯×ë{Ôï_ö¯õÛîò¡y¯OĞòÜœßvWøïù¥y?×»'­ôvì‡ww“şÛîp
Œ…èüwl4ÏÏ‡}=kö_ßêÓÕ9×Çİúy=¼_‚Çí¡:?>¼ï^êm}ıı½:÷×ßš
 Œ2è?>ô[©§˜Rãïëçiğ9Œ¶ãP‰h‰?õ÷‹õwOüÏ¦ù¢²§ip§<ÖÇz¯ºĞÛÁ?ßêÏõñ8²Á‚÷_mşÊÁ={VêÔÛG¢~ªŸw_×Mó}^^^¯ĞïqÛ«Ùîº{|87ß{µ¼¼ïÔ£Á§ gd?ÜƒŞõõ°ÿòk£”•.*]…Ç‡½2óYái h03`¢45ˆ}ø 5@S«d°ÑÜWYø ğAi ]ÀF+_eíƒ¶˜¸´ÁQsfE“‚£ğ4øØÆbfÀÌ@tÕ²ûö8Ü=ô¿Á¬î)`­…0$5$ä0g†°¯¼U²}\_‹Vˆ|‚”†X¾V†°¯ªU²}…®¯u+D¾6‚l1¾úv„a]vEXa'Â?µ1[’ ¹kIj+eğs,»´Âv$l·4„í®`»•–İ5Za»$lwkˆ¶ëDiâFéÖ®¦õ©Äa—³á½ñÍö$$E¢ ÙÁHØr.´‚‚”HØò
	[®„ÖZ [$Ú²CuxY{ùVacf„ìi+Ppv2£¼ec$>Hà$–ÀI,÷U>(|PÀFW°ÑÊWYû`ãƒ­23ÂâêŒæÎÎEâ%Ç¡›Db–¢,’H”"²rV†ˆ·^ÎzvÖ¹,E‰JD–Ã"vX±ípì:\³9ÜH´EÔ‘)ƒWÜ¸!Vò‰µò4°³%!Şq)"ÎklNjÑÛ³n"‚kz0âMQ/ÇR¸[	w©ıÈİš„Øİ†»Û"’Ùuğ7‹&Ê ZŞÍ¯„¬+Q"QJˆ3aFˆ'&'Äæ•„ØüŠ›¯±ùµD‰¶„d¶¨’ê¥[] [m´MíÀ9Ó’Ó€g;$$EÂùÑ”äv*Ï…ÖBBÒ¶ì9P¤;Ah‡dÎyŞU3-	Cr+È‰›Bb–¢’H”"²rV†h|omÚÁàŞ5Ÿ“v!Q!QIHÈ€:»&ÕÓvChÚ¼2örh<0BNCÄË9E);ùîr”<Õzókè¯ô-:D¼ƒ­´;ã†&ƒC¼qUk’÷²"Ş·1\+µ£D¢”§…ŒÇ1'Ä¶©»­îDGZPõD»nÖ7Va¡ShLàn¥+ÑÏšÛ›w†„Wo,H"H*È\L	'“	§©Rh-Y	R!‘W¨ÎT+tm ÌYkm%-	+f÷à£»Ûc–j“	¢‘}Ø½’4GÄ®@â&œĞ3U’OÙR¢•D!™pBç,·–‹âv•”hIX@°¾¬(}r£”’ï”‘=Zßx‰2V	¶Ddå®!Şs•mÜI¡s ŞŞ9í²Pòî€qz_)RíÂbØ(Ú6ŠUZ;%êA‘Eh)ÑJ¢ŠL¡:ù­ÿ³©åİ!cíàÌqè%úõœ!E=dwœ#İZ_ş‘„†Œ!TíúºË…FmÔæ¨§–x«÷Ñ›¥…ì)AK­¡eìÍed˜¬„L…¤#ÿ¨3Ôšv¡)nG=‡ÊC»s¾L‰2nÁz÷ˆ%KÑ¢ZIT!‚@Ê-uuõÙPvÎÄ#ËÉ™¡wŞ'¡‘ræÔ/RRâ9ÍÙñ{P¢Œ“|ı‹Õ’„ì)4–Fœ+Ûç#LÊOjPÉ»5!Şç±D‰D©Ds‰2‰rBœ‘
BvşÁ®r¿–$Åh%QEHæŸ¡WzÜŠ¬:,V†7ÎhÍb	Ïc,H"HŠ„Ë	O~.´‚‚”Hä¶z*!èí¿^®Í[û{D[˜i¸ÊØEÄ ô*ùIqÇc‰‰RB¹ŒëÑ»<å$Å•„dzªc°M/Ÿ8æx´Ò‹–„ï/vıÄ“-!ÄNq.É°»œÔ~änABì® ÄîJDÚ“K†`Üü­İAç„–ws	!Ş ±D‰D)!N	!N	9!6¿¨¨$Ô‘ÔAfÍø­A[)A¥gK£%íy=ÂÓ’’
2$$GÒ±İÂZÒ&½ò›1áB¯Û:åŞ;Àc¢<AälqÉ !^ˆ9¢…èÜ)­.›o×ÜåÊquœy°÷$%)^\9"é{äì[s»(JLìpBïR–¢”]Š"êğí6–oÿB˜ŒqÆ}ï›„¬a#êpí
–kÿ"”Œq\w¥lßuø¾‘tábåÖ¡	§Z8	qµ6Gôã
…:ú÷ó¢Ú^EˆW,Q"Q*Ñ\¢L¢œÌxPW:ùëç¾ú;”ñ4wŠ $VÆ$$d.H&H.ÈBBR¥ +A*AÖ‚lÙ"‘9y¤†#Ds;ÉÌ¸_~BïÒ¹E©¥{#ùüä¿EÒaâF2ùÉx†Šl:bB¼î‰R‰æeå-$*$*%ZJ´’¨’h-Ñ†g¿-"_•H»Ö‚æÎZ@õÅwCˆsİQ‡£§ËØ?]fH†|VÇ„xg'¥Í%Ê$Ê%ZHTHTJ´”h%Q%ÑZ¢!¾ŸmuÄWoÖ¦¾•W){BIà„x»Ä%¥Í%Ê$Ê%ZHTHTJ´”h%Q%ÑZ¢DêÙ—u¢™g~æ¹Ü[}~ÑOó.½}óõ,¬ßÇ‡›÷P1Fª„ä·Œî"U­uµ EÏ‰Ğ	¡EwH´¡EïT¯e6Fê(ı|‚5¸›Ê¸GêÖ*[àb©Kl²¬éZÙëA"õ‰´C'C‹Şö|ÿÔ×í.{ĞÑDèL@GgÑr-]:IqƒÈÒü¢©G»Z&ĞÒå~&…w™]:Is
õ ´?#@K×Há7HıP!ufƒ;èA×Ú™ĞÒ¥¯Z"õ@EZƒĞÒ¥S¢M§<«€–.„­+³QÏ;¼"xZØÁÇ¼›“¼E›.ùjm´|¿|xi«í–»óËátéëgØ¥w :›7°úïkó®)”©6Wø"Eÿ{…÷Å5<e½û ƒç¦¹Ò Søøë{ï²ßáğÔ›óë×ÃÓàÏœ¡í½oÑáiœ³'¯~ûØùñÿ   ÿÿ PK     ! CÃâ       xl/worksheets/sheet6.xml”™Is£F€ï©Ê ¸Ç y¡$MU%ÀåJfrg$dQ#	°=ù÷y½ÑËkÇÎÉÖÇ[zyKC/¾ü<½×ºë›ö¼ôƒ«©ïÕçm»kÎÏKÿÛWòÛ­ïõCuŞUÇö\/ıêŞÿ²úõ—Å[Ûıèu=x`áÜ/ıÃ0\âÉ¤ßêSÕ_µ—úOömwªøÙ=OúKWW;¦t:NÂéôzrªš³Ï-Äİgl´û}³­“vûrªÏ7ÒÕÇj€ñ÷‡æÒû«óğÔ­—ê¹ş³¾]:oß_Û' 0K²ZLF©]¦èü½®Ş/ıû0~Œn©“ø«©ßzíNü{Ûş Ö»¥?¥ëc½¥Cğ*øóZß×ÇãÒßÜÁÚıÍŒnîââN¹¥ºrºÂVF»«÷ÕËqø£}{¨›çÃ ƒCJª¡Z-ºöÍƒ%ÁÇ¥¢ÅAä{\öêfî{Ã¡Ùşø½¥ÊTW(€Œ®°Zl©™{Š—>sÂ@ÂÁ5Õd µ±AÆÁ›'x]ÎÜ.)^úl©¹K®ÁŒ™îäë*ˆ¦‹É+¬ÕVc’#ˆdœ„lğ}$°*®ÉSlŒ„ƒˆmŸ='³h\"Èt$'|Ÿu¯×¦×÷öHn‡=S†AØ6òá BÉ	Ñ~Ü|n<*fhĞ‚L”b#f8ĞbÆÄ,fØÌÖ¨@ÜØ*¹
”à@¤	é˜ÅÆös`bhâ(4""'<ùô8QAÏŠÄÒ·|¦¯Y†jBÇjÒ{©û2‚"É9mÆy2‡@3p>7Ç’
!=$R!›	¤2h-ˆ6uA´4Ë¥%5¯B"e¼gZ˜Sı(Õ˜¼™kiÉ†Á(“ˆåßl‰ÔĞ7)ó9FF¥D8ƒÿİh£p%ãFF¢¥4"‘L-«ÑÒiåˆˆ”‚àÔhÍwä6ãfıByEv”R2Áˆ0¥å\&àÈáFéég¦Ã\II‡F¥@Ö÷ğ®¤Ò.a’p^P¹™
dä4×›©ØÍ„”Ò[¢ŒoùÏ’cw…DÊ])#ËigÓöúÃ,PÙNÔ.SŒF™Dz–#ó)¥g9òX`©R"G–]¢óÃ“^@Ûà¸L38O±ªtÏ¸™åvM…ŒÊ{‚H&ˆ#i+r9æ-j3ÛËÌJ¼$BÊuŠÁ(“ˆ£Ñ C£ª…`Ü¨‚@hµâÔ!bˆCÄše&Dpl‡F{›åf2y³ƒI¤‚/Åˆ`”I„ƒ/4ZÌû£‚Ò%^3B£ÅhkÎ_T#H˜$eÆ“LŠA$Cä‘5"DrD
DJDÁ¡Ò¶á}ÆÍPÉ1Èfwf7H…üLD»G%$[ÆEÊê­iu-T`ä†üÜ
äB:Ğ^[«”BjKrD·Ñ¤´¨°›TŠö7Îgn½%$àQ ‡kZ];Ãë²ja)4Wz¶®­2@”rÍõ®?YºÇœ¦òVN¤¶."e=%H}Ñ+æ•=Jä(,Vú¸«…ï4Æ®&ˆ^XxoQ„ ™LíìŠ,oVHH).Ñ;ı‰q£hb½-ÚohJJn0Á(ˆ%ùûŠ@*6JO¥aİ˜u%WRÒaQ)wh4èÈjz27€JÂ.CuPeÍŸé§YaI?Í
ÄÒULŸëéÓçD;*çÒ’ö†*‘J¨R7nNÕİI}oûÒíiüÜóÓ>ßBµÍÊ	¤UŒF™DÚIV"5‘DÊ|QQ)ÎùHï‘PÄ><ÈFz×¸Ï±/ˆÊï‚H&ˆ#/õ–¡ùµ;Fqb¥åµ™%©’’YB0Êre	-ø²ƒiÃá}@Emq¢Em*‘\ÊH	pƒâºë÷¶lSş>ŸiäLf"WÅQŠÁ(“H‹#şí?Õİ3ûŞŞ{ÛöåEN±«ÅˆùGı$šÆ´ÂpĞ“ °QYO öÅ´ŒaMÀ—DXcñgYKf1|¨vØ’7¶ü<†/Ìù FÅÖÖˆnÀ7‹bûÉ]LØÚ<€AÁ——xq=¹îbúª…uàÌÓ#)~çÈ˜ñ8ækp
ƒ'®•„O06—NkCÜk:„ëLÆE€kzCTVİssî½c½‡è™^AtüÎ…ı?´F¡}o(Ñò×.³j¸:™^Á+Í¾mù¦)n^.^¿­pçt'¶kàÎŠ]U-ı#Ü©Á³KŞâf·ô»õEÔd¼Y[ı  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings5.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings4.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings2.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings3.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     ! ÏàG´Á  ,  '   xl/printerSettings/printerSettings7.binìT1kÛ`}¶’ÆõÒ
Y2„©ØÔÆrÛ­1–’ºH•dã%ƒ‰U¸’‘BbR(ıı!3fìÈÜ¡”ü€,íûT…“Ás'î»{ïÎgùlD8BŠ3úGdØ†K!ÎóŒ¬bìã!+­hO®á>×^– ŸÕ¤2f|†a¹Ì8,k<-„œ–ñLòŸ\©èW±LWñ7í çëE)FïCWØÕjoçŸÿ­-æ«9ñ4ŸµXü8¸{¯–¹í›|;x¯z×q9xÿ’š<;¨ÃÄ+´ÈÕé^ó©³§EŞdÖ Ö‰›Œ]¢Ú9:çDÏôËB?Òp¦2w4S?:a™A`zpÒ(Œ³Q%1\Ç¼N/€Î’ÉqÎ1u¦*k¢›L’ÔNÆáßLıâ{«m İ°ïîş­:İÙbù]£ß–œŠşãÄşz³önó²ıå;9«¨¡Â¤0Õ«ğ‹"*¼G(¼Ş?á9Æ'î µYúÜ7j¸1›á„õc6/v:¬ÅKöv9ãSÎ÷ù	õ}j“eäÄDQ@DQ@DQ@DQ@XF?   ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings6.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings1.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     ! Nx›a  œ   docProps/core.xml ¢(                                                                                                                                                                                                                                                                  Œ’ËnÂ0D÷•ú–÷‰@X!H}°‚‚Ôô¡î,ûQ'²İş¾&$Ô.º´gîñÌ•ãÙ¾ÈÑ7h“•jŠŸbJ”2SÛ)~IçŞ#c¹’</Lñ%·7±¨˜(5¬uY¶äHÊ0QMñÎÚŠbÄ
n|çPNÜ”ºàÖõ–T\|ò-Ò)ÀrÉ-'G WõDÜ"¥è‘Õ—Î€r(@YC? g¯]˜?åÂYdöP¹NmÜK¶'±wïMÖëºöëAÃåÈûrñÜTõ2uÜ• œÄR0¡ÛR'ôˆĞ
½¢UL.î;Ì¹±K·îMòîpmı-wk)2	i8òê…QJ'ŒR6œ|Ä¤ëL.JÓü”$r]Ø©y§¼îÒ9>óÂ4±aÄcÇë\M÷j,Úàÿ!Ò`Ì¢ˆÑè‚Ø’&ôõJ~   ÿÿ PK     ! lL“¹Â  ¹   docProps/app.xml ¢(                                                                                                                                                                                                                                                                  œ“QoÚ0Çß'í;D~/¨Z'd\!š©“Æ@$¥Ï®s!V;²¯ìÓÏI$OËÓùşçËÏŸÙã±ÒQÎ+kd:‰IFÚ\™Ã‚¼d?î¾“È£0¹ĞÖÀ‚œÀ“GşõÛ:[ƒC>
-Œ_±Sêe	•ğ“ › ÖUÃÒ¨-
%áÉÊ
ÒY£pD09äwõ¥!é;Îüß¦¹•-Ÿßg§: s¶¬k­¤ÀpJ¾VÒYoŒ’£ÍèPd.ùáxÌèpÉR)4¬Bc^íÑk‚=ƒhMÛ
å<gÎh]äÕŸ`ÛŒDoÂC‹³ pJXmY¿èb]{tüÕºw_ g4ôÉ.ÖcuÏº‚ŒÛ=HÆˆ™B~Sl…ÃÄCâ¡çíq¤5èDwÀ!ä7MvûŸ«ä¦¶^şŞn^“İM1Í6»ÛÛ’ªÖö-óFÜ¿ü­õ±çZ+/'á^Ãìyùw)I[k§Ãİ#“>ÙòK™wÿRgöI œ¯}œdi)äaRÎú5ÁÃ;İ6Y•Â ?×ü+´Cºï_"ŸÎ&qøºÙ<ç½¾9ş  ÿÿ PK-      ! íú¢  4                   [Content_Types].xmlPK-      ! µU0#õ   L               ±  _rels/.relsPK-      ! ÉöT‰'  	                 xl/_rels/workbook.xml.relsPK-      ! ¯Ù¹N¼  S               	  xl/workbook.xmlPK-      ! –6"ğ[  wP               í
  xl/worksheets/sheet4.xmlPK-      ! ³XG‹  '               ~  xl/worksheets/sheet2.xmlPK-      ! ;m2KÁ   B  #             A$  xl/worksheets/_rels/sheet1.xml.relsPK-      ! Ä,Â   B  #             C%  xl/worksheets/_rels/sheet2.xml.relsPK-      ! 4¡	’Â   B  #             F&  xl/worksheets/_rels/sheet3.xml.relsPK-      ! C–£Â   B  #             I'  xl/worksheets/_rels/sheet4.xml.relsPK-      ! dó4"Â   B  #             L(  xl/worksheets/_rels/sheet5.xml.relsPK-      ! LZ*zÂ   B  #             O)  xl/worksheets/_rels/sheet6.xml.relsPK-      ! k?ûÃ   B  #             R*  xl/worksheets/_rels/sheet7.xml.relsPK-      ! àñ—"<  "K               V+  xl/worksheets/sheet3.xmlPK-      ! ºNÈ  ñP               È:  xl/worksheets/sheet1.xmlPK-      ! ĞNÒ  )4               K  xl/styles.xmlPK-      ! é¦%¸‚  S               RQ  xl/theme/theme1.xmlPK-      ! ÔÁw §  c               X  xl/sharedStrings.xmlPK-      !  ¡~÷;  ³               Ş^  xl/worksheets/sheet7.xmlPK-      ! 4‡†T
  1-               Od  xl/worksheets/sheet5.xmlPK-      ! CÃâ                 Ùn  xl/worksheets/sheet6.xmlPK-      !  .À©Ã  ,  '             ñu  xl/printerSettings/printerSettings5.binPK-      !  .À©Ã  ,  '             ùw  xl/printerSettings/printerSettings4.binPK-      !  .À©Ã  ,  '             z  xl/printerSettings/printerSettings2.binPK-      !  .À©Ã  ,  '             	|  xl/printerSettings/printerSettings3.binPK-      ! ÏàG´Á  ,  '             ~  xl/printerSettings/printerSettings7.binPK-      !  .À©Ã  ,  '             €  xl/printerSettings/printerSettings6.binPK-      !  .À©Ã  ,  '             ‚  xl/printerSettings/printerSettings1.binPK-      ! Nx›a  œ               '„  docProps/core.xmlPK-      ! lL“¹Â  ¹               ¿†  docProps/app.xmlPK      ®  ·‰                                                                                                                                                                                                                                                                                                                                                                                                          d4-add" type="button" onclick="d4AddRow('minor')">ï¼‹ Add row</button></section>
      <section class="d4567-card d4-block"><h2>Revenue: Receipts during the financial year [â‚¹ In Lacs]</h2><div class="d4-table-wrap"><table class="d4-table d4-revenue"><thead><tr><th>HEAD</th><th>TARGET</th><th>TILL LAST MONTH</th><th>CURRENT MONTH</th><th>CUMULATIVE</th><th>COLLECTION %</th></tr></thead><tbody>
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
        {id:'d5-deductions', title:'Details of Statutory deduction [In â‚¹]', fields:['PARTICULARS','PAYMENT DUE','DEPOSIT DATE','DEDUCTED','DEPOSITED','INTEREST','REMARKS'], rows:[['TDS 393','','','','','',''],['TDS 392','','','','','',''],['GST (TDS)','','','','','',''],['LWF','','','','','',''],['Royalty','','','','','','']]},
        {id:'d5-compliances', title:'Details of Statutory Compliances', fields:['PARTICULAR','DUE DATE OF FILING','ACTUAL DATE FILED','DEMAND AFTER FILING','NOTICE DETAILS','PENALTY','REMARKS'], rows:[['TDS-IT','','','','','',''],['GST(TDS)','','','','','','']]},
        {id:'d5-liabilities', title:'Details of other Liabilities [â‚¹ In Lacs]', fields:['PARTICULAR','DUE DATE','DEPOSIT DATE','OUTSTANDING','DEPOSITED','INTEREST','REMARKS'], rows:[['Electricity Bill','','','','','',''],['Telephone Bill','','','','','','']]},
      ],
      D6: [
        {id:'d6-paid-unaudited',title:'Bills not Audited but Paid by ULB',fields:['DATE','PARTICULAR','VOUCHER NO.','AMOUNT','REMARK'],rows:[]},
        {id:'d6-advances',title:'Advances paid by ULB',fields:['DATE','PARTICULAR / EMPLOYEE','VOUCHER NO.','AMOUNT','REMARK'],rows:[]},
        {id:'d6-fds',title:'Fixed Deposits',fields:['FD NO.','BANK','FUND','AMOUNT','INVESTED','MATURITY','RATE %'],rows:[],dateLabel:'FD details as on'},
        {id:'d6-revenue',title:'Revenue Details (reconciliation)',fields:['DATE','RECEIPT BOOK','CASHIER CASH BOOK','BANK STATEMENT'],rows:[]}
      ],
      D7: [{id:'d7-observations',title:'Major Observations / Red Flag Issues / Suggestions',fields:['OBSERVATION','FLAG TYPE','SUGGESTIONS, IF ANY'],rows:[]}]
    }[code];
    content.innerHTML = `<section class="d-reports-page d4567-page d4-pdf-layout"><div class="d-reports-heading"><div><div class="d-reports-eyebrow">REPORTING CENTRE / ${code}</div><h1 class="d-reports-title">${code} â€” ${esc(detail.title)}</h1><p class="d-reports-subtitle">Monthly report Â· Annexure ${code}</p></div></div>${subnav}<div class="d4-savebar"><button class="btn primary" type="button" onclick="d4567Save()">Save ${code}</button><span id="d4567-save-status"></span></div>${code==='D5'?`<div class="d4-toolbar"><label>Reporting month <input id="d5-month" type="month" value="${String(state.fy||new Date().getFullYear())}-${String(state.month||new Date().getMonth()+1).padStart(2,'0')}" onchange="d567MonthChanged(this.value)"></label></div>`:''}
      ${cfg.map(section=>`<section class="d4567-card d4-block"><h2 ${code==='D5'?'data-d5-period-title data-base-title="'+esc(section.title)+'"':''}>${esc(section.title)}${code==='D5'?' ('+d567MonthRange(String(state.fy||new Date().getFullYear())+'-'+String(state.month||new Date().getMonth()+1).padStart(2,'0'))+')':''}</h2>${section.dateLabel?`<label class="d567-date">${section.dateLabel}<input type="date" aria-label="${section.dateLabel}"></label>`:''}${section.note?`<p class="d4-note">${esc(section.note)}</p>`:''}<div class="d4-table-wrap"><table class="d4-table d567-table"><thead><tr><th>#</th>${section.fields.map(f=>`<th>${esc(f)}</th>`).join('')}<th></th></tr></thead><tbody id="${section.id}"></tbody></table><p class="d4-empty" id="${section.id}-empty">No rows yet</p></div><button class="btn secondary d4-add" type="button" onclick="d567AddRow('${section.id}')">ï¼‹ ${code==='D7'?'Add observation':section.id==='d5-unpaid-other'?'Add other unpaid bill':'Add row'}</button></section>`).join('')}</section>`;
    d567Sections = cfg;
    cfg.forEach(section=>d567Render(section));
    d4567Load(code);
    return;
  }
  content.innerHTML = `<section class="d-reports-page d4567-page"><div class="d-reports-heading"><div><div class="d-reports-eyebrow">REPORTING CENTRE / D4,5,6,7</div><h1 class="d-reports-title">${code} â€” ${esc(detail.title)}</h1><p class="d-reports-subtitle">${esc(detail.desc)}</p></div></div>${subnav}</section>`;
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
   return `<tr><td>${i+1}</td>${cells}<td><button class="btn secondary sm" type="button" aria-label="Remove row" onclick="d567RemoveRow('${section.id}',${i})">âœ•</button></td></tr>`;
 }).join('');
 const empty=document.getElementById(section.id+'-empty'); if(empty)empty.style.display=section.rows.length?'none':'block';
}
function d567AddRow(id){const section=d567Sections.find(x=>x.id===id);if(!section)return;section.rows.push(section.fields.map(()=>''));d567Render(section);}
function d567RemoveRow(id,i){const section=d567Sections.find(x=>x.id===id);if(!section)return;section.rows.splice(i,1);d567Render(section);}

let d4Rows={major:[{text:''}],minor:[]};
function d4RenderRows(kind){
 const body=document.getElementById('d4-'+kind); if(!body)return;
 body.innerHTML=d4Rows[kind].map((r,i)=>`<tr><td>${i+1}</td><td><textarea aria-label="${kind} irregularity ${i+1}" rows="2" oninput="d4Rows['${kind}'][${i}].text=this.value">${esc(r.text)}</textarea></td><td><button class="btn secondary sm" type="button" aria-label="Remove row" onclick="d4RemoveRow('${kind}',${i})">âœ•</button></td></tr>`).join('');
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
 const value=prompt('Enter target (â‚¹ in lacs):'); if(value===null||value.trim()===''||!Number.isFinite(Number(value)))return;
 button.parentElement.querySelector('.d4-target-value').textContent=Number(value).toFixed(2);
}
async function d4567Load(cPK     ! íú¢  4   Ş[Content_Types].xml ¢Ú(                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ÌUËNÃ0¼#ñ‘¯¨qË[¨)G@jù o«‰my·¥ı{6)(*…6EpI”‡gfwÇãîõ¬È£)4Î&¢·E6uÚØQ"÷­K!)«Uî,$b(®{‡İÁÜF¼Úb"2"%%¦
cçÁò—¡…"~#éU:V#Çíö¹L%°Ô¢Côº·0T“œ¢»¿^(y1VD7‹ÿJªD(ïs“*b¡rjõ'’–M
Ú¥“‚¡cô”Æ€Š<öÁ0cè†Böº\t0¢'èAÌ g¹$® ×NÌ54Q•(_"ÍsÀÆT«õ.@¿a~ua\5eu;ß³ˆK¿­cİä¸İ¨ßóÊÊ“˜ËJ×0löÒf”|qn¼çÆTSeìR÷›¢ä»SN÷,¤ÆßRÇÙ_èàˆy
Î£ä@jÌeâiĞ-ÏÈ@í¡Îâ¸±†ÕèØu'ÿDGóÔŞ­˜© ºO|ÒŒöç±7í‘Ú›©°ı@–™V®^ãHYù½7   ÿÿ PK     ! µU0#õ   L   Î_rels/.rels ¢Ê(                                                                                                                                                                                                                                                                                                                                                                                                                                                                        Œ’ÏNÃ0ÆïH¼CäûênH¡¥»LH»!TÀ$îµ£$@÷ö„‚JcÛÑöçÏ?[ŞîæiTb/NÃº(A±3b{×jx­ŸV b"giÇaWİŞl_x¤”›b×û¨²‹‹º”ü#b4Oñìr¥‘0QÊahÑ“¨eÜ”å=†¿P-<ÕÁj{ª>ú<ù²·4Mox/æ}b—NŒ@;ËvåCf©ÏÛ¨šBËIƒóœÓÉû"c&Ú\Oôÿ¶8q"K‰ĞHàó<ßŠs@ëë.Ÿh©ø½Î<â§„áMdøaÁÅT_   ÿÿ PK     ! ÉöT‰'  	   xl/_rels/workbook.xml.rels ¢(                                                                                                                                                                                                                                                                  ¼ÔÍnƒ0ğû¤½Ê}hK·©¡—jR¯[÷ ˜§ÛxûY¬ƒ!UÙqŒ#şş)ÂŞí¿šÚû ƒ•V‚…~À<P©Î*Uö~zyxdZ©2Yk‚u€lŸÜßí^¡––>Â²jÑ£…‚•Ö¶ÏœcZB#Ñ×-(ºÉµi¤¥£)x+Ó³,€GAsó7ƒ%“Lï˜	fõ?u-uş?[çy•ÂA§—”½Ñ‚[rJS€¬?şCŸ Œß6¬æ4|jsÆÀ¡„¼¿Y¹0Û…1[&Z¹0áÂç?/Œ‰]/³Y³qaBÚ1ó4–Ò@öfm,¤àëhOÊ.ÍzNÌ0È#d(]g{íÂ<Í‰AÛÕ´­Ç'éÏ¿íùd'ß   ÿÿ PK     ! ¯Ù¹N¼  S     xl/workbook.xmlŒSËnÛ0¼È?¼ÇzÄÖ°¤­ŠúÇ>3äÊ"B‘I[ößwE#íSOärggwF«Ùı¡QdÖI£šRJ@s#¤Şômõçö;%Î3-˜2
zGïç7ßf±ïÆ|$Ğ® µ÷í4I¯¡an`ZĞ˜©Œm˜ÇĞn×Z`ÂÕ ¾QI¦ã¤aRÓÃÔş‡©*Éá·á»´?‘XPÌãø®–­£óY%¬OŠkÛ'ÖàÜE‰bÎ—Bzbh:¸x°»öçNª>;J'4™ŸE¾X" b;åW(ï“ıÊ‡y>î‘½k	û*êCrØH-LWĞÛ,Go—a’)|]Ğ<Ü!äôöä¶öØ!›Œñ‘q/÷°bïí’¨_pû†“è —í-Kğûõ–/PVF‰J¼Ø…Èú©ã’×r¹^ü*#8zt†ç×ğÇ‡§—çM¹Œğ£w]=/còq^ƒË¦Uæ@ÄiQ“IT7º®{”HyÀås¸¨_Êq‹ÏR‚Ê{Ğ›³O?"tØƒ$¤ĞcÎÇeè`h>šäaŠäó˜ÿ  ÿÿ PK     ! –6"ğ[  wP     xl/worksheets/sheet4.xmlŒœ[S#9²ÇßOÄ~ÂïÛà+àhz#N»î¾âà7ÜİÄ æ€{z÷ÛŸT)U)å_î™—ú§TJJI™)U¹>ÿë?/Ï'îŞ?ö¯W­ö§³ÖÉîõaÿøôúıªµ^¥ÿ¼h|î_ïŸ÷¯»«Öw­}ùÇÿ|şµÿããÇnw8!¯W­‡ÃÛğôôãáÇîåşãÓşm÷J%ßöï/÷úçû÷Ó·÷İıc]éåù´sv68}¹zmYÃ÷¿£cÿíÛÓÃn´øù²{=X%ï»çûõÿãÇÓÛGëËçº…ùû—Ïo÷ßwËİaı6?ùötXíçh”­Ó/ŸO©Ç'ReÆò¾ûvÕúÚn/zF¤–Ø<í~}xŸ˜ÿ{¿ÿÃW­3Óâîy÷`ºprOÿûs÷u÷ü|Õªd»ÿ«•ÒŸM›¦¢kß×Ö¦¢®>î¾İÿ|>\ïå»§ï?Ôã¾©ş°¦ĞO^ÌduZ'/÷ÿ±üzz<ü¸jõ?·Ï.»çıÖÉÃÏÃşåÆòzÈMÍu¬®işàšíŞ§‹~¿7¸ˆ×=µ×&İî¿|~ßÿ:¡)£N|¼İ›Ğu¶»ŸŒ–Ã§‡?şwoúoºÏºaQóÕ`ê=NFÔv«%R2r
J*ÆL4˜j0Ó`®ÁBƒk–¬4Xk°ÑàFƒ[î4ØZp^¯Vš°fÖzñY3øªu!³fAûœfÿªe6ãŸ_ÎÛŸOÿ¤ÿÀS±Œ'¢$r”è„:
”è†••è´½fÎ•–q#cv—Yu S 3 [K.Áj´	üÍáÖºÁ¾Õ¶`}ã@¼Íåêì×s+Cl­4*§9Š)78PnoG5]	J(C§(¡{i%°—&şDL`°ßË­Xÿ2¬Ì?9ÓqòWg²¢™XjÖH$’É@J 1	)9k K + k  7@nÜÙ2éÀF£	–É±i–0Ô¦[X5/Id@r ’Iík‡4f"qµ¦@f@æ@L¤­%ikµÖ@6¾S?f˜%jbÃıÍ;ª%iÛ‘?Öz"BÎ[§Œzä›z]åY2'$Ã*ÕŞ‚Í¬û4‘æD÷…ò|P´d"!qU¤äÆWÑDäˆlÛH-í¤Lú´cœ÷C#fN¨ŞBõĞKF¾1´î	Ë¡í§É¾˜!š;$Æ_0’ö–Ld,+&4×ŞÚ!éùÆ×ÍdÏhÇÜóúmÀ¥)“Ğ˜mL[­/]*¹nÌÄ)‡$¦LÍÍ-’>,ã­’×ˆ6ÕºBƒÉdè`nå”Ih¸sm8[-0Ü±¨}$	ª¹ïER&aÓºi›MËŒ?ò—Q³\l²â/Kú´qdï]ê¦YH6Q^·@‡(?»º8ë•,T¯©pVTrô—ËÜ&IŞRµÉÂH¥ˆ2D9¢QéPd‘™ğş7v­ñ
ûn‚jq&â¬ )H¤ R©€ŒL€LÌ€Ì,€\YYYÙ ¹räÈ–	2Í6ğ@3†û[}TKª„¡­·ºòö¤ŠßyDDEæ""¢2ŒŠEÌÿšİ?P‘w,B.¤MMÍm¡GèI¹jî[pË$¢âHÂÑÑIÁÈf¼måíò ´£|Ú$,UÓ²KÕŒlÂR5[SJ‹%20•4«KÿQÇ	©	“n“¤L<_îdÈ‹5Vé«UP¸j¢©tHÂõÄ!êG£j òá©Ÿ6sÈË¶ÉX®™H–@VNQ3Şè¹Z·@î@Ï–Idz¤bl™DT¨Tá¯â¡¹¯T§}‡¼xˆ(E”!ÊˆJD¢1¢	¢)¢¢9¢¢kDKD+DkDD7ˆnİ!Ú:„ùCG¥kÇ¦ßËTÕ¸›É6u,‘½– Id@r Hddd
dddäÈÈ
ÈÈÈ[ w@¶L"ùƒJ ›é´÷F’¯:–}¼sBV*ˆ¨hUDDTÈªXÄDuq÷*rŒEHò;
ªçĞ¥fˆ¶ŒĞƒv$Ô5ò&G’¸.$q†ÈxÕ1KUn·em‘æd@]}Á3bÒ%#6½Ğñ:a¡DËÔ!‰×¹¨rQ8)©X:$·Œ"ÃPYØ1_æ–x×f=şÑÎ!Y	¢Q†(wH<b¨DT9$#š8$îuŠh†hî¨_ ºF´D´B´F´AtƒèÑ¢­CÊº*Wı‹éÏky:Éj+•ˆ&I;E4PpÑ=’µÕ<83‘)N€¤@2 9H	¤22222² rd	dddäÈ-; [&A»*ƒnÜ‹Í”½ZKê¸
l™ò<¬ A#"ª¡ŠE~AEÈyé	¢)¢¢-£ˆãVIhcA{ù'Üv-‰¨8’•vm**F†4±«­ˆyXªò‰IXªrŸEXªbó&(í¨v·¦4z7¡6v¿Ss?»1‘SkÂD\ÊD<Wîd~ÑWM4•ˆ*‡$VOúí¡Ü	‰››9$±sÁH†wÍD:µ²rŠšlozn Ö-;Ğ³e‚K±§òÁ¿ˆC_kyò
b¶‘C¢D)¢Q¨@T"ªMMÍÍ-]#Z"Z!Z#Ú ºAt‹èÑÖ!LCz*—?6ıäOùí®Ş‘ô»æA>ÀD6J$’É@J Œ€”é>Ê²såµHà®˜˜»­Æ_èÅB‘M¦’½¦Ãıv*ó ;êY{GÒ°šû*F†4}ì© °¼÷Ü5uHœUêP¡£pÈMCú\U:!ñŞ£ˆ}TRâMIğac7¼Öë1ò ¥2D9¢Q‰¨r(²ÏTÒpl„Ş>;’#ôlì•X3bâï3+#$™H¤ R©€ŒL€LÌ€Ì,˜DötwĞº”—T›5cDÂbI°§Ûg*}]ô¬.ZóZr.½	Y¿mñµæ~C&÷õTÀMJßsÚl¹ö™Ú˜	Kõ©Ë”Ê¶S‘rYr†(äëR.¯)§«DT1Å¼~©¬rì¤dO×4õ¾.åæf"åú5G´`™˜ ÈywLôšYVÒç„	Å×tŠ(C”#*•ˆ*FO;$ıš8$ıš:]~TÓO¡fNH¼ÉÜ!qBFSáÖ3¥áş6™w+”)-	L	(ãzT¨@T"ª¦´-ÒZqó9qR¾)¹_¿7%ù¦dä›Ò¢ˆ)MrĞ¼>á™Ò&rl\ô-‰¨Òj¨v”æmşÆ‘pb,1·òŞöUGÆ¤ÏR¡óQ×º–Šô,È\Ïèç¤ÖÿAÓMÌúğD)¢Q¨@T"ªMMÍÍ-ªWcpw×²ã6¥…ÍÙ}?È:¼%YG-yÕ’¥œ I™Ôñº9YíÔ*T¾p€&8Çv„Úæ9r³b/Ô‚™0iüt/A”2¢‡’nûçÚÕB/PU‰¨b„ÛÁÄÊØÈjNÇ,¿m{XˆÎ#®Ï‰CrnOÕmÛÙù;Ê§I”—‰òÊWLÙ@å<^ªİçµ|xáàxäQê8éÜ!égáè*Uá¨LáØpd‹Œ{¬Ùšh&²ò )H¤ R©˜Èî˜0‘Í;…Z3 s &¢yÉÄÛŠ+DkDD7
—ŠŸŞ\¹¨2Ğ¡tÄ$8%\¨W¡*’­4ab<pãè‡{á‹ŸS'%S<C4G´pHbş’Q`C;­Qjƒè&@¡ÉñDW¯á~ÖP,ñm¢e¦,C.AŒšhQšyDDSĞ™¥«$«p…hhƒè&@¡¹TVÓ¬3›ªÈôD#\ª·éSJæ5‰g#¤İ~ê„äÊ%µª³má*ˆ?,¯Y1ò'R÷~2K&ŞÚ[!Z#Ú º	Phß¿™á4v7ò*š0’ ¥ˆ2D9¢Q‰¨rHÌ>qH&gêtu†hhá¨_:ä¯¶ 5Jmİ(œ•Oz.7ˆö^x<’Òl¶&ÁgÄD|g$’1‘1LDs	µ* c  S 3 s  ×@–@VLêqSp~$“¬9¹šôÆ¥\ª;™‘òŒŒ(E”9$®`$¤4¤i»§‚cÅòæE#¤û5!—êNC­*/ŸqÙB‹@¾¯‚Ëµk€BiÓ}G²tB²†VŒj¯Î‡J€k:7Ü #&şø•O""j iDDEÇŒEÄÃLd®*&æ±Jc‡¾
Scr³±òu‡vP™sc{£&Mgç–øİÓ2Ë„İSÖ‹tÏÓvO¥éÇ<WÓm#F–sF²ÖD)¢Ì!q×…CJ‡D}…hŒh‚hÊˆ~¸á,3C4ÇŠD×ˆ–ˆVÕc-<M?3ÌQ,)­yp¤bâ»3›”
IA&’)€”@* c  S 3 s  ×@–@VL"QÄ¤|‘Së¹NGL(ñGq©îçW,ñ&‰µcsñ
£sKü“QD«JCšMk¯µDkrN¤ño—êKfJi“?GÖÁ wB²¤
‡üø`UEúz$:·	ôuÅU\	ù5÷CLbˆWİe,ÿûá:!o¸yÃeékÍ·vìc´WL"*ŒoÖŒ§BG‰ä‚ˆW¥™)Õ³{©²’Ü	ùÃåz2ÜŠ¥‚×ÕÚg*\®X*2¢ øx#²Å[–DT^”¦Y‰^´±7ßHÑG’ê&&A”"Êåˆ
D%¢
ÑÑÑÑÑÑÑ5¢%¢•C^H³¡²ßSzÙ½¯?õqò°ÿùJëRÛ/Ÿl¿NE¿¯fösPPÒ¡’Z9”t©¤¾U%ô»ş¡ù‰>EuUB¿ÀšŸÜc	ı4´Õ—ªı ›Jê•%çTR‡U’wzCó8l‡~74?hÃzshŞÂÇzh^³•\ÍK}XBïõÍ;zXBoÃÍë/XBï¸Í+,XB ‡æY2–ĞQahNXBÉóĞäÆ±’•ÄÆC±fhâÖù:8šû|,É©Ä\Æc	] Íı–Ğ%Õ‰•ĞæĞ\4b
Ã‚<z¬¤C%±ñĞË	CóÖ¡W†æ­,¡†æ ,ùJ¶6gL,¡c#Y4VBOæ©±¾Ñ£wêA¬„­Sb%ôğœÖA¬$éÓn¤›:ì=—¦vb%ôà™Ú‰•L©dnKN›­E_‰3Ÿ¾›Ü¿zı8yŞ}#orö‰2¢wû=¹úïÃş­¦”áş{ oÅ¹ı ¯ôíèCGgŸ(z|ÛïîÔeş¤ŞÏ·“‡ûgú˜y©iÿşDã«¿ÁwÕz¦RÙÛZ>=^µŞ‹ÇzN›O~ù   ÿÿ PK     ! ³XG‹  '     xl/worksheets/sheet2.xml”š]sâ:†ï·jÿåûÉP!§vÆl¾!ñ‡8	5€9àLÎşûm}Y²^S™½™!º¥–ZênÛzøãïÃ¾ò+9_vé±ãÔnnJrÜ¦¯»ã{ÇY.¼İ;•K¶9¾nöé1é8ÿM.ÎÿüÇÃWzşyùH’¬B=/ç#ËNíjõ²ıH›ËMzJÔò–›Œş<¿W/§s²yåJ‡}µ~{Ûª6»£#zhŸ§ôím·Mºéöó3ÑÉ9Ùo2²ÿò±;]œÇ>ÂäüøpÚ¼'ó$[&çÊÛ.[¤4K§úøPÍ¥^wÔ›åœ¼uœ§z;vï™—Xí’¯‹ñ»’¥§Qò–=%û}Çùw½îTØRü™¦?™hğÚqn™É>Ù2£*úïW"ÄŸ\—–ó/1ë¶#÷NÛÂÔ•]æ¨_BšÂkò¶ùÜg³ôËOvïÍ¤ÉÔ·é,¤+‡s"™tØü-~|í^³Ó¼¹«İşpïšNeûyÉÒÃZp¾¹f½%5Ù©YkÜÜ7›Ö}¹nUÎ—ª»É6çô«B®$#.§Ûn›u'Ì½a½d»íÏÿ¤Ì~f¾T`+c(Ğ„X7O“ı|thå gÏ}ø6l0°ÁĞ#„6ˆl0¶ÁÄSÌl0·ÁÂK¬l°¶Á³^l v+9,÷Z£Ükw~Š¸»ÔîÈû‡Ò_wµ‡ê/Úğ[éê¾”1D,	%êÅ>”p‹C!Q¯ÃÜY½ŒrvºØ®D@Æ@bA~°½Z5WAÙ^gØ\µX Ô§óT¦Ï°©ß% —ÛZˆXHcçä£²Î.t.€¹–»z(a-´‡¶•B­dy©$\0lZ€ú?Šú×â“
CLœâÕmvº’ˆÊöHˆ¤Ä  	D@Æ@&@¦@f@æ@@–@V@Ö@¼ ‰%©ÃA#‡¶É57ë4T£]¶±8/$"IŒLÄÒâ	€€Œ€„@" c  S 3 s  K + k Ï@^€Ä’`~bÅP©;7E—KÒ§€“ÇÌV«˜<úJÈ±‚_"bE½ DÄ
{C)RHS­fÑš‘Êó¢ÑQ,ÊKı%‘–sscIJº`y°¬‘2¡FD¯ş]q¾~±õ¾Ø³VriÉğWÒ-UÏöÄ¥x’[Ñ´V½'Õn<…tzğ%¢®”o%¥
iÅX¢’iXYÿZ,S)«&¼™³2’"Q‘¯.ÍDDC…´#D¡B:¼FˆÆˆ&
éî§ˆfˆæˆˆ–ˆVˆÖˆ½ Š*Ie¬2Ñ7î÷Y c%‹Şm¢¢P¡F¾s#Dã*·µ+¥çÅ*Š3íâ”ÑÄÒâ	€€Œ€„@" c  S 3 s  K + k Ï@^€Ä’”dPV\û./¢è2ƒ·,ÃÌZ³[¿&…ŒE ƒ¢ˆ5ĞPôMıŠÒ¡ÖS(B4FK„»n¡j9/dPIJº¸R•²ÙË˜Â|kbô‹­Vf‹­Ví3-¶Z¹yUh­[ãÆ¬µ47³÷ge»‹ssmº’ğÀÈŸÉ{’è çI¢#—¯dÈÏW3z ÔtODC…t®*T-ÖÜ#%¤ƒÚX!;§ééÍ$ÑFÍ,TGùö]A?kĞzòıÄ’”lE«ü&=ÕÅ«#³QHŸº"Q‘(@4@4D4B"ŠMMÍÍ--­­=#zA+„eHUÙF:¸æ~
êMğ•ò».Šm}º’èƒÒâéñ@’ğ|ÇÃÉHmOZ1	)9%µ$˜ÇÙKxÓqy	Fç’ôŸBs3[?Š™¤/…š:ú
éc(¤ÃÚ@"XäÂÛ„R¦`ÁİmÑ‚‰ê[[0UH[0SH[°–¨$´ı%öS]–ØÚ‚®BÚ‚"Q‘(@4PHOp¤¶+THÛ!#š š"š!š#Z Z"Z!Z+T¬‡ßG¬äû –ŸQ"ê°Ğ­b†)›x Óâ	€€Œ€„@" c I0t¸W
XÎE#yÌhX%¹/å©Ìe¬Ú?(±jÿA‰ˆ5P(E´‡" I0
¸V­}mK©Âå‹ßÒ§­‡ÈCÔGäKDêy$@4@Å!¢¢P!½¿#Dc…ô„&
á™t­šş›ô¹<- N	¢P!]GTxÁ¿³«CN/s_‰bTO¶Ë%;Ş*= >H d dd$IRrPÍâÌœ¶x5jäx×|diXÉ½ÇZéq­aT×:dRÓ/öj½ ¤‚ŞCÃ‚|Ó:è#5€ijËzº
•vi$QÉÉ6+QsyD%ª—§ç
Ò0K ¦U€xZH-@$QÉĞfõem×>=WâĞV˜ô´Zè•mV54ô7Çñ‰î¤ğ‡:àtÒ®ë!òõùâ™Ñ@T"!
±K6|B%‘Ê¬´W|ºÿÃ5Ìˆd"kÄ"qëåœßù%ŸKe›~)¿ÑïãCÅİ"ªYÛ¬"%§Y-İZ³Í>#`UÚmVGcíÒ6Û„e--j)×iPAbY@Ç­ÍNöFß2ÚìKEIK½ŞfïE°…^´Ùkj©æÑ-%v%+ÜœßwÇKeO×¨è¶Ô¹ç,î3ñßtÁŠS:‚¦İUR}Ğí±„>´ßŞPKÓLıAƒÈ«^Ÿ§Êe»ÙÓ%¯&Å®ô¼£KbünXÇÙÓ%6j;%4Z{÷ÚqÎÁ+ßÏÕü*Ûãÿ   ÿÿ PK     ! ;m2KÁ   B  #   xl/worksheets/_rels/sheet1.xml.rels„ÁŠÂ0E÷şCx{“Ö…CS7"¸UçbúÚÛ—÷ı{³eÀååpÏå6›û<©f‘,Ôº…äch°ğ{Ú-¿A±8êÜ	-<aÓ.¾šNNJ‰ÇX±…Q$ıÃ~ÄÙ±	©>æÙI‰y0Éù‹Ğ¬ªjmò_´/Nµï,ä}Wƒ:=RYşì}<n£¿ÎHòÏ„I9`>¢H9ÈEíò€bAëwök}¦mÌËóö	  ÿÿ PK     ! Ä,Â   B  #   xl/worksheets/_rels/sheet2.xml.rels„ÁjÃ0Dï…üƒØ{$;‡PŠ%_J!×&ı E^Û¢öJh·%ùûèØ„BÃcŞ0]Yõ‹…c"­n@!…4Dš,|>¶¯ X<~I„®ÈĞ»ÍK÷‰‹—Zâ9fVÕBlaÉoÆp˜qõ¬SFªdLeõRc™LöáÛOhvM³7å¯ÜSå0´ N×\—Ÿ»Ó8Æ€ï)ü¬HòÏ„É%’`9¢H=ÈUíË„bAëGö˜wú	ŒëÌİsw  ÿÿ PK     ! 4¡	’Â   B  #   xl/worksheets/_rels/sheet3.xml.rels„ÁjÃ0DïüƒØ{$'…R‚å\B ×6ı U^Ë"öJh·¥ùûêX›BÃcŞ0íé{Ô‰,ìu
É§>R°ğ~»ì^@±8êİ”-<áÔm7í+NNj‰Ç˜YU±…Q$a?âìX§ŒTÉÊì¤ÆLvşîšCÓ<›òÛİÂ©®½…rí÷ n\—ÿw§aˆÏÉÎHòÇ„É%’`yC‘z«Ú•€bAë5[ç'ı	L×šÅóî  ÿÿ PK     ! C–£Â   B  #   xl/worksheets/_rels/sheet4.xml.rels„ÁjÃ0DïüƒØ{$'”R‚å\B ×6ı U^Ë"öJh·¥ùûêX›BÃcŞ0íé{Ô‰,ìu
É§>R°ğ~»ì^@±8êİ”-<áÔm7í+NNj‰Ç˜YU±…Q$a?âìX§ŒTÉÊì¤ÆLvşîšCÓ<›òÛİÂ©®½…rí÷ n\—ÿw§aˆÏÉÎHòÇ„É%’`yC‘z«Ú•€bAë5[ç'ı	L×šÅóî  ÿÿ PK     ! dó4"Â   B  #   xl/worksheets/_rels/sheet5.xml.rels„ÁjÃ0DïüƒØ{$'ĞR‚å\B ×6ı U^Ë"öJh·¥ùûêX›BÃcŞ0íé{Ô‰,ìu
É§>R°ğ~»ì^@±8êİ”-<áÔm7í+NNj‰Ç˜YU±…Q$a?âìX§ŒTÉÊì¤ÆLvşîšCÓ<›òÛİÂ©®½…rí÷ n\—ÿw§aˆÏÉÎHòÇ„É%’`yC‘z«Ú•€bAë5[ç'ı	L×šÅóî  ÿÿ PK     ! LZ*zÂ   B  #   xl/worksheets/_rels/sheet6.xml.rels„ÁjÃ0Dï…üƒØ{$§SŠå\J ×&ı U^Û¢öJh7!şûèX›BÃcŞ0Íñ1Oê™C$]Bò±4Xøºöo XunŠ„d8¶»—æ''¥ÄcH¬Š…ØÂ(’Şa?âìXÇ„THóì¤Ä<˜äüĞ¼VUmòo´+§:wò¹;€º.©,ÿï}<~D›‘ä	“r Á|A‘r‹ÚåÅ‚Ö[¶Íµş¦mÌêyû  ÿÿ PK     ! k?ûÃ   B  #   xl/worksheets/_rels/sheet7.xml.rels„ÁjÃ0DïüƒØ{$'‡¶Ë¹„@®múª¼–Eì•ĞnKó÷Õ±6…‡Ç¼aÚÓ÷<©/,YØë’O}¤`áıvÙ½€bqÔ»)Zx Ã©ÛnÚWœœÔ1³ªb£H>Ã~ÄÙ±N©’!•ÙI%˜ìüİ4‡¦y2å·º…S]{åÚïAİ¹.ÿïNÃ=“ÿœ‘ä	“K$Áò†"õ Wµ+Å‚Ök¶ÎÏú#˜®5‹çİ   ÿÿ PK     ! àñ—"<  "K     xl/worksheets/sheet3.xmlŒœÛR#9†ï7bßğı6ø8€‰™¶Ëup¹|(Ûà;˜nb ³àî}û•JÊJ)yºofèO™©sfJU®«ßş~y>ù¾{ÿxÚ¿^7šŸÎ'»×ûıÃÓë—ëÆ²ŒşsÑ8ù8l_¶Ïû×İuã»Æo7ÿş×Õıû__w»Ã‰²ğúqİøz8¼õOO?î¿î^¶Ÿöo»WUò¸ÙÔ?ß¿œ~¼½ï¶•ÒËóiëì¬wú²}zmı÷_±±||ºßö÷ß^v¯cä}÷¼=¨ö|}zûhÜ\U5LßOT7v“í‹jõB7´©ŠŞ¶_v‹İaù¦ŠŸå~ª€êwãôæêÔêİ\=<)ãzDNŞw×Ï­şæ¼£E*‰ÕÓîÇ‡ó÷‰Š?÷û¿tAòpİ8ÓmØ=ïîu£N¶êßwŸwÏÏ×?Zj4ÿ[ı£Õÿı÷ó.W¬µ©nQ5‚ª½»Çí·çÃ|ÿ#Ş=}ùzPÍ®Ôï÷Ïª9ê¿'/OzU/Û¿Í?_¯İOçÍ³Ë¶ªîäşÛÇaÿ²6¼êw­ÙêYMı‡Õlv>]t»ŞEX÷ÔT^Ë`{ØŞ\½ïœ¨™Ô}ÛêuÑîks¦¹Ÿ´•Ã×§û¿şØëöëŞ[…¶¯ :¤Í|ÖXµ_V``@¯C	"	FÄ$¤dŒ%È%˜HPH0•`&Á\‚…¥K	V¬%¸•àN‚çÕjUVÏZ'<k_7.êIĞ<W³İĞ{ôûÍyóêô»Zğ÷vfGVÆ1J´|	J´}‰ÌH´šN5çÂÊ¸–¡U—™ )€l¹„QS›Àİ´Ö5vGmc ê«ıÒ×ØÕ(ÀÃ-bc¤Ñ¸š£q=ã¸ã(¦kˆb #”­4ØJ–ÿBC¨±ÛÊ¨éëóOdW‹+uÆ+ÚãAµ«‰€Œ€Ä@ )ÈHd¤ 222² RYYY¹rdcI6šš0o™›fCMµ C«â^ ²Ä‰D@" # 1HjIå«08¶„cZ )™%\×Â®«­%•kçÔ:A	±æîæT’jÛ)'À~¬ã;ô!‘·,ê(ÿ[ëµ…g‘w+µ¨òv˜e›r®m_Ï7CK8$–ACÂA®\Cş êˆp€M©¹È’®Ú
õ`œwıA‘Pµ…ª®§¹ƒ!mçVF4ı„ï‹Ñ”şÌ"®oa	÷¥´Dõ…ê[â–¯\Kş é€ìÚ1w@^¿i87 ²ÄÌL£Öå&¥V;7¶Ä	)9!)D¢)¢!nÃ‚^Iˆk\"Zªlùz$“Q+G–øw.Î¨yw,jI‚*îz‘È¿êYµI‡¼ªeHÚ¹Ë¨^.&Yq—‹!]µqxï]Êª­o¢¸ªA¢ÜìêâÌ×K­Pµ¦üYÉÑO—¹I’œ¥8hZÄcˆ(B4B#J¥„‹L‡÷_ØµÄ["ìÓUÜâ–°³‰€Œ€Ä@ )ÈHd¤ 222² RYYY¹rdc	2õ6p@=š»[}PIŠ„¡)·:	9{RÄï8 ""sFfEôÿêİß‘wÌBÒrDD¢EèZGR®Š»#¸±$`âHÂÑ’IÁ@“º¿Máíb¯´%|Zî—Ši™ù¥bFV~©˜Œ.U‹%Ğ1‘Ô«KÿAË©CKÚu:Yâør’Q^¬•®X	©±¥”‡ëœjGmª'òá		±O+9Ù–EÜ—¹%Ü‚’Õı]5hİ¹;KÓs$ÅhÉccIÀ„H~õ}¥8írâ!¢ÑQŒ(A”"Êåˆ&ˆ
DSD3DsDD%¢%¢¢5¢[Dwˆ6„0h‰tíØô;ùƒH j—`²"ŞFƒ–!¼×†@" # 1H
$2’™ )€LÌ€Ì,€”@–@V@Ö@nÜÙXÈDYO§¹7â|}Ğ2Ä»pèÉã	9NXª8 "¢U!+³":ª³»‘cÌBœ?˜^(=B”*m,BÚ>’PWÜË,	˜8’Äµ!‰Ó„û+Îˆ±_*r»µ¨şHÔ–<KÚjëVÈx=´B–!×1›¢‰HHŠSB¬¸±(Ğ‘…óe´ÄÛ&ëqv„xuEˆFˆbBìD)¢Œ7bŒ('Äîu‚¨@4%ÄægˆæˆˆJDKD+DkD·ˆîma(k‹\õ'ÓWòê<Ä«-A”"Ê	q;ATxÈ»‚hÉÚ*îÀ-á)‰€Œ€Ä@ )ÈHd¤ 222² RYYY¹rdc	FĞ¶È k÷b2e'‚V’ò.Ûˆ„+#h@DFĞ€ˆ¨(³"ÿAYˆ¼th‚¨@´±(à¸EZ ¹üãÜ´	˜8’•¶MÊ&šÔ±«)ˆ±_*ò‰Ü/¹ÏÌ/±yå•¶D½]<ëPºß©¸›],áSëĞvp‘%ì¹b’ù§ˆ[Je„8Vç„şñPNBìæ
B;gq÷æ–p£@J2Tg{+°³­[ w`gc	.ÅÈ‡>WòÊ+ğ°qˆ"ŠÅˆD)¢ÑQh‚¨@4E4C4G´@T"Z"Z!Z#ºEt‡hCÓÈåM¿ò§öí®Î‘ô»â^>`	o”!ÈH$’É,Á¨2}ÏG9]&W^‰xîÊ}·U»ã£¬P`“‰d¯®Gs·L?èzÖÎ‘4¬â®‰&u;"(­¼óÜ5"ÄÎ*ömˆĞ‘‚Èº"y®JIˆ½wfQ`|DRâL‰÷a=nx­×±ÈuB€"”!Š%ˆRD¡À>IÃ±:ûìHĞ1±—cÍÀwŸ&‘•©vCõR@v°“ÉÀNv& U ™‚9ØY€V	d	vÖ`ç´î€l\;Şñ§s$£©¸z®ën¶‘'¬º„¢|tˆ("S<]#”ŠIÊ«PìîõRD™â
Ç(•“”W¡pÔ+MÉW8'äYYèM•ˆ–dŠ­¯	yÖÅÓ-šºC´±–~!”ëV\Bg‡Z¤âC½qYTÕdö(šJHM¥„ØT¦r45!=6UbSS05gSÇİÿ‚,±ñ’_‚ñõ¯¿%Klüß¸Æ½=İıÅ¤‡ÂM%ïç¼„œpƒ("äDVBÜÎ„ÛJe„ØVNˆmM±­Ñ”Ûšb[Bl«D´$Ä¶Ö„ØÖ-!¶u‡hC¨²åO™È:?õ›:ÁíiîQİİi»a¥{İ`‰$@R ™%"rK¸…Ğ*€LÌ,aËKØr	ZK + kK*Ëş4‰D×™¦z3ÉœwĞ5ÄÏ­ÅË™bç˜[Â—%Kº*ï«óÒKq×T°ùâ)¢™EêQ$I-,âúJÖsê‡‚%‘¥¢µE¦>HU®cÍİÄ?S§>;Tñ#·„›<±Ä}.#îëŠ€ˆÃi@Dt{fEx¾–pcÊ€Ñ˜e@D4fY[‘@×Gç…´z‘š£·uà/*ñ²ËP—ªÉĞû¢^yòD‘Ÿˆbßªè|B
ìGSBìm3‹x¤sK¸õ3Y€ÌÚ•ñWà/]êÁ3×îQ×"vÿCD¢¢Q‚(E”â±Ë	ñOqSDSD3Bl~AˆÍ—„ØüÑ
ÑšP 6Š“¢ãt½Ó³ò?ö§{äPSqïÇvƒC ‘%yK8ò¤ •ÉL€@¦@f@æ@@JK0îõœ*®T-ÿÚ/\ÊS"	9ƒŒ(B4"Ä=±ˆIªI]wG†U+¯¯k!ùûŠ1Q›øVÅÉª°
¼Æg|W¸ğ9U ºòm¸	ñ*-B¿Ş>¹¦Š»As`‰Ûá†‡Ñ( "bĞÈŠ°›N,á¹Ê,ÑW—õ8tE¬³ÍFéÚö\wO¤Íõ8hîÃ¨’´/UVÉCb‰Û<£å7OŒÖØª)!nÑL“ÈÑy®ºÙ&Sw#KÏ"^kCD¢!ngBˆİuJˆÍgˆÆˆrD‹ÔËÑ42¢)*ÎÍ-•„0fô'êGbFÏËCõã«eò¹â^Ì°Äug&3eÌH$’É€Œä@&@
 S 3 s  ¥%(âe£ÎC6Ú3Ä{»íR\–V(°í¼„Î©Çdi¼ã=›·q$/-
XõÒÇª¹Œf«Ã"µ»WŠ#]ª|“÷“?bâ%•rãƒ1h«— 9mÕÜõ‹eÏ4qî…|6Qq×ÄPî®¸ãYùî.	9İ%ät×¢@[½pè´Us·­å¹!^$qLÈH2<W„»+Rƒ‘.•³{)²’˜„ÜîZ=înf¥¼WBšg"\–V*Ğ#/ø8=2…×kynHÀ„çEÕ4ù6ùJõéİy7~â 3D!!Š%ˆRD¢1¢ÑQhŠh†hh¨$ä„4óµóÍ’—İû—ê-ê›1ß^Õ:T¯àİ\ÕØ|Fù˜¾ö*Ë’ó³~¢öQ¨¤¥Jªj…ºwêë;$ÔùÜ;ëë,K2U¢ój,Qw	}}U€%ê> ¯/ °D%Ğ}c‰J)U=Õâ­Îz-UêºàïëËz´¦nçûú¦K>«’a°$V%úê¨g}ıÄKÔÍZ_ß’a‰úr_ÿäKÔ/Šûú'ÄX¢y÷õCn,QO²ûúA5–¨~ûúuŞPÉe_¿<„%êı¡¾~KâV§¯„%ê‡@}ı£,Q?}ïë_¶‡JÚª$ÔSõ£fU¶ÖU%¡ª·¤ûúçP==¥ZoQó\•˜¦^VêËEú›LùöıËÓëÇÉóîQí¾³O*ƒx7ß8ªş>ìß*ª2Â?÷õı"ú×WõA©úøÆÙ'åm÷ûıC5Ì~ëéÛÛÉÇıöY}åI?hß¿?©ïFUŸ‹ºn<«ïZ©²·ª­ÿôpİxOªUZİêæÿ   ÿÿ PK     ! ºNÈ  ñP     xl/worksheets/sheet1.xml”œÛrÛ8†ï·jßÁ¥û­³£Š3µ‰G‘ÔÉ²­;­$®±-¯­$³o¿`ıCöÌÍŒó¡6@÷OHâ§ßş||8ù¹{y½ß?]´ÚÎZ'»§ÛıİıÓ·‹Öå*ú×yëäõ°}ºÛ>ìŸv­ÿí^[¿}şç?>ıÚ¿üñú}·;œĞO¯­ï‡Ãóèôôõöûîqûúaÿ¼{¢–¯û—Çíşùòíôõùe·½«;=>œvÎÎ§Ûû§–aôòWÆØız»ïo<îz—İÃö@ş¿~¿~m}şT_aörB·±+·äõR9Ú¦¦çí·İrw¸|¦æ¯÷‡Õ~F€î»uúùÓ©é÷ùÓİ=®"rò²ûzÑúÒmÎk“Úb}¿ûõj®¢ş>9ìŸ§»¯‡/»‡‡‹Ö¿ûƒÖ‰
Îïûıª9½»h)¯v»[åæÉ–ş÷s§Í¿ô‡àÿêëô‡£ràø¢º[¿Ü«FuPéîv_·?‹ı¯dwÿíûî¤¯nåvÿ@ÒOïÕ´vZ'Û?õ¿îïß/ZıÃöÙÇî°ß:¹ıñzØ?^i^_¾éÙ¡›©{ª?LÏvïÃy¿ßœ‡ûê‹×¡oÛÏŸ^ö¿NhrÉ‰×ç­Z*İ‘N»ûArø~ûÇöÊå¾éĞõ;Ğ©a¾(Lş×÷©ÀXƒA&DÄ$¤däL%($(%¨$˜I0—`!ÁR‚•—¬%¸’àZ‚	6UÔOiÂšYë…gMá‹Öy3IcÚ´üiÚÕ¶ıùùìÓéOíÖÌtlL‹¶o‘ EÇ·HÑ¢ë[äÚ¢Óv.3èû6ÓÆFm.µè
 %
ÈF“4ÚîŞ°K]a7h°?m§P…İşcM´{ş=&n›¸ÿÂmøıænÛĞo[»mÑqCäŞŒÊˆN¢°ÁPØ»:Í’šhĞm@¤A¯‰±øè„¡/î55x˜Ì³fœÂšÎ&œÏÒØp^ªáÔ5×„oa¡_{)ÁÊÒø²–c\É.×ÜÈ16àT¨ê˜
…İ©Øh€ı)Ğnÿc9ßN±2§À¢«’Úx H$’ÉL@J 9%K k W@®Ü ÙR¯V/åÓ„ı¥iæÒŞ¦lë.» jîwCxM€D@b 	H$2R )T@f@æ@@–@V@.¬\¹rdcÖ|%0ƒÓ©¸›(Æµ%mqJ8Mæ<÷‹FlmY÷&²ğLdå7&o—~6jj?¢Q…hcæÉ¶RSD[s7€CC(mBkGyµİ²õÑ~â5¶…"+üV1+s¿ULÈÚkíˆª»Q­´T÷uDÑ“\[šp5.§‘!$°6”İš	šÀvã‘2‹¸X¹ñY`8£U9ÂÀ ¾—…!ìÁÈÊÄâ Æ¹‚^×@n`œ!éQ*ÎYvï•ø¶V}n·È)òˆ"D1¢Ä"eŠ(C”[ÄNLñä•ˆ*D3‹xø9¢¢%¢¢KDkDWˆ®İ ÚX(ıJ9şõéOTâW—qŠ(CTXÄ;·DTyÈ×(G¤l[KW^/cCxŠ'@" 1H
$’™)€”@* 3 s  K + —@Ö@®€\¹²1$ 8”uÖ]# µHu«‘­®âh%·‘SDqK&¢Â¥q¡Ü˜¼#9´7dÄ’PÉCY«
ÑÆ LÜ!ÚmkîICCQñêî|Ùçİo[<)'~«P…ß*æ~«<ğZ;âºÕÔ#z¶ænlÆ†pÂ	.2„3WbmhRkÛGÊå92Ä¢7eˆ5â4WYÄ¹pnßŞÂvj	dej–ïÆ¹‚^×@n`œ!¥(ô{2¤£/]bïº	¢QŒ(A”"Êåˆ¦ˆ
D%¢
ÑÑÑÑÑ
Ñ%¢5¢+D×ˆnm,BÒQON986ı|Ñ9òXQsïÂŞ( H$’ÉL@J 9%K k W@®Ü Ù‚z@} ä.€¦šéÇGÔ–â¢- ¬‘“Ÿ¥˜H=0‘zÀ˜xu
>}`#[éD%¢
ÑÆ @J¾‰ VìÁMG“ÀG4vGklb¬HSùÚòÂkíÈ3¿ULËÜo3²ö[ÅdlTkX(õå¤—&6Z•¹7ftZSú&M¸`F†¸zÀØĞÿš¨À„íÆ#e¹Å_Õ{»ø#Îi•Ê-şÚÊ-şš°KÓÉÊÔD`ms½®ÜÀ8CpİuHÙš»rmcH`!e;ó]-]ı`‘£EˆbD	¢Q†(G4ET *Uˆfˆæˆˆ–ˆVˆ.­]!ºFtƒhcê‡®üÇ¦ŸõC×œ}úüÚ|;AKŞFãÚ’
›ò:âAebŒxCF@b 	H$2R )T†`1îzjÌ‰âî~+Ë&ãuDN½Ö®¬~«ÈôUíƒ9O®gæÆ‘4‹ŞÙP×Ó‚¿pÄ\[ÒX(²Û¢|MŒQ“b„(¶ˆswj‘{TÑ.³F\tr‹ê´¦¿`¥©ÆÑ®¨w%Y]QHÀrb$VÑÕ¤G[Š/-½K6âKë~K{ÊÄ¹´T&ã®9qTP¨VZ~¾câ´¡d#vL÷8¦ôB#Ç´àw5y³*O¬‘›L?N'•±
x£Š³ãÍ±Öd*]Ì½f{0QK‚F'À6¢Ø"®}	¢Q†(G4ET *UaÆïyš6ú‘¯£™hk{Š«¶	¢ÈC^éyƒ×JÍ½çMC8à H$’R§ğ:qLáW@¯Hdddd	däÈÈ•!XšÔæw7‰İ5÷J“Ÿ&D½½›^E¢N&¢H¥‘£3cRow3Cê\WeÃ©VTÑUà"ÂÕË€‰pu0®^ÌLT	½ ¿³×¾Ôö´×¸4-â3A!Š%ˆRD™EüØ2µˆı*,b¿JD¢¢9¢¢%¢¢KDkDWÒ£pÇ¦ŒŠ‚ù¶nïˆˆª¹Ÿà´¬rœ$‘éÅ61H
$’™)€”@* 3CIçˆvêIí4V„w²–‰±#é¤±Msï=©ªÍ ªp6È£ˆÒQµ³¢`fP`ó+õô7dIO«-oóÄ›lb­EˆbD‰Aô™–u=E”aÇÑQa×ÏQe{?³(°…Ê<¶M)KzZ3Ò|‡€
kÅ)¥‡|ñ¢D`3‡ê×u)úÒÓâovlïÛ	H$’ÉañRÂş”Ğ«22² ²²2÷ßÓš¾š»•|¬H³íz¢LÇÆWMâÛ‹š‚}f/ÂZ |]‘1æÍ8l#\[L„7Ë€‰¸ĞÊ˜`é{ê™‚ô¶ZÿRÛû
Â"ŞQ„(6ÈÉ	Z¥h•Y+V…Eœ}J‹Ø¯
ÑÑÜ Ç¯¢%¢•SMßSÇï†9®í)Ì¼RDsDDKyÙ§ïÉGgûÀQ[myÑr²H$’É€ä@¦@
 %
ÈÈÈÂ@öñ¤œ>8ë»§q=qd“ø­âÜ$U­êœ ):¹o/c¦ÆşMQ#GgTş¨â±lf;¸7"¿9·F\&§jßİ_úZÉºêÅ"ÍQ„(F” JrÒ@†V9¢©E†Qi{_!šYÄ;ohaQ ñx
ùİ0§êG–jµqâ™ZÄ‚¦@4³ˆqæò']£õ(n\ÿŠÓO<Ú†M$’É€ä@¦@
 ¥!„á	Nç¶µŠt5ûlÕê¥„Ø·—7Æ^İ4ZDY§ldÕmîÚ²cj;¼•
kÄSZH	GÄp_‹aObˆ:in¨/¸R6²7T„—ĞÎéğš»B21Ä¿´m)5—6(pé¿©ÀèwÌõä³Ò[Ä©d‚(B#Jr²^Š(Ã9¢)¢‘úav}C˜¼O5%µ½—¼Ry9hpDüÔÜ;V1„3ÎH$’ Id@r S Hdddaæ²’%'×š»;f¬ïRñd’û7åJjŒ¹’û£
I5û+£ÎqÔ…A]êÊõ‰ó;ÏI”+¹»ÔX1ŠĞ*F”XÄi5E”YÄÃçˆ¦ˆ
D%¢
ÑÌ"ökhaQ`Ç»rå0SZ5§£WJP{‚RsKá016¼±# 1HjH`“¨Bm7‰ëœ.à\ÑÆ"¼I„¦Tk]ğÙF”œ8`"
v0»15&õú¯O¢rCŞşÙzW *UòÓ³+ÜĞI14Á=;t‹º3DÍİ5Q„£/}bcÿfŠJŒ‘“¢Rƒ¹%ßuLWB^“!vLèÀXµÒ²xÇ1mä9¦QÀ1·à’cïe¹¡²§‚ëh‹8çLEˆb‹8u$ˆR‹0uİzş†ïœ:†n	s§Aq/uÔ–ŞSH$’É€ä@¦†`ÂQï|	%œš»K~\¿Æ¾¤/bcï®>‘p’€‰H8iÀD$œ©1á„SòfÂ©ØÈ&œ¢9¢…‡¼„3¥Ç’š»¡›Ø>GjÑPWw_iöõ@<¹dÆşÍ}#g_O
8¦êG u]q#Â‰	ÍŒı›ß¶É­oä©AÇdù¡ÌòEØ1±3cÿczPú4Ñ.š©é‡©5wWÃDvL¬ïÌØ“cöš¹EÜP™º™8Ê¶ïÈNz›–LÈ9	Q„(F” JeˆrDS‹œL®_¦ßmõ¸{ùV¿Êë•^7öã‰"LßRşü©Áúb4ñ£œ&‘‚+[ÎÏF*ÔØBg™#uT‰-ÅpD¯’	ğv¤~KhétFêç]¡–ÔòŒ¾8Rß,Ä>IçãH}õ[HƒŒ”Äµ´©¥\ábºÚÇÔRïzÑgL¾©/Pâuè›v£ˆ¾"‡-ÉpD/ò	pŠšú1 …¢¦~_hé©ƒ›@Ëàl¤ÎU°…¢Fêœ	[èá’ú„fšGêùûõıÍPË€Zê‡5ú$µc@¾©“5ÎéÉë =º}êO}N›Ñ[çÔ+öŠíË·û§×“z-½ıî•‘ı~ºúoza^MIü¾?Ğ»çì¿¾Óûwô’Ÿ³¤’¾î÷ûºˆyußç“×Ûí½´Omí_îé5€õÛÿ.ZôšBj{ŞÑÕF÷w­—ô®^q§ÍË
?ÿ_    ÿÿ PK     ! è¦Hûd  "9     xl/styles.xmlÌ[Yâ8~_iÿC”w:„£Eİ4Òìj¥î‘ö5€‘r ÄôÀŒö¿oÙ¹1$„~hc—¿ª¯ª|`O¿<WúDaä¾)kOª,!¬cÊ?>½±,EØò×–øÈ”(’¿Ìşücá£‹Ş·a	Dø‘)o1Ş=+J´Ú"ÏŠ‚òá;=Ãk¸Q¢]ˆ¬uDy®¢«êPñ,Ç—gS;ğq$­‚½…”Ì¦Ñ/éÓr¡H“•Ùt¸A(aHh‰oy(®ñb¹Î2tH5Ûò÷ë¤€BJêy„¤P!}Æ=Ï¦KRëN}ë'Ü,My*ütM)–uF¥–Tc‡Ø»§>õ“Éx¨‡Ã‘:ê£I+Xï*ÖŠ>V€‘PßTcP6û;ÚHúñ”2N]òßŒæjë@óh¤‘¿ÑxÒ/÷Ö`Ñ¨+Y¹½h¥6k¯¯
ËÖĞé<YlLÖY•Ôhw8ãºYZí“¬
³éÎÂ…ş^¤äùã¸ƒœêC'N¡Äõ.ÔŞ„ÖQÓñQà:k‚bóB3y–õHŞ#b–É¿F´6å!eW) ÎÀQŒ ã2×0~¥ƒ‡N¸l6u‘Alèl¶ä;ÒI€qàÁÃÚ±6o¹ğ¨¤-ÒOÒ>ãLoéûØ)4R1éA¨>ÅB¡UÈ)b¡ú±rÍë[OB[BÈ‡€"âÁ÷ĞÚÙ{$ı¹Ìù…vÖ¡İ¥Ğ:Ïe+]¤]Î²t¡A=…Q²Il}ø/œ¯R£
ö•k\§Aá|Eˆ&²TiøF2MZêEPìÓ
¶U[PCCÚ®rL+¸¶P}QĞ¸ªÄ$Ú‡à›Íš\—â*u,Ø½FBç)T½!‘ŒÍ³XmO×:]Ü¨„PsQ'Ü”0!¡9µ™ºBíªÀ$óa˜^¯ë¾“yğ¿v6ÇÖ`öp°%ï-<ü¦é°Œ'»)é#¬+’Çx:¿ :¥(-–];_%W:ØYuQirÖZ²v;÷8§«	²»¿uï!º-è`“)~•¶AèüÉîÔ
¾Gñ¦ÒÁ®olVW¥~£ÒJ3•6lTÚ¨Qi°mšºå©c]Áé¤Qi„kƒà`o¶Qq×…¸=Ù®8“wNÀ- hÛ‰oˆ•®!ğ¬ÀrT6C›ig–.1ËÖ£ª"hy²˜ôÄ3y…l2°
yõ=Æ)–°6İÒ€˜ê©Y+ÌT4&«@	@,NpN—üLÅÃa”hÏ™‘(µWq‰'›—”}–)ìæ'j ÖYZ:„T;jX…¬Ìd‰ll“‘‘şv£\3ÕšŞiLÍÓME¬âóøÔšàiL\İ†	¥›Äé z9zn§5»Ğ™@º_×Q ¸ˆãÍ°˜YëıÒCÚı qç|§Tİ7/œBÊ}ñ~Ş–Ãõ~váQÕ¡Có = CwHŒ¶gg)Çƒô€VêĞ—x™ˆ!®ÍLÄÁPÕ†œ6AÀ¼ğÑâˆ‰±Ëı†	ğ‹³VÒ‡¹&Ş²”™ü–!5¹WÂƒÀ¬ÊÚôg$f…Ñ=$fĞ=$&	wé#¬ÃDÄsovÚ=s-féghí>Ğş–Û!•;6<›5˜(ÁÓbŠª…79b’Ã-y¼Dƒ9¢Š=2?°[nİÇĞM˜®±³‹YÃUıñœŠ¡°F7HàúÁ-6¸ÏNìëÅµT‡#!×P{yRh~K‹‹¢bûşzôœ*L*KÊIä•)ÿM®Ÿ¹…İµåŞqáÚSvb(?’2×‡ü½€­%Ür#ÇŸ²^@ß5²­½‹?²/M9ş‹¯†‘,©õó`*Â”óçïäJ¤6H0†à|JûĞ1åßoóÑäõm¡÷Æê|Üô‘Ñ›ó×1x™¿¾.&ª®¾ü:‘{wÏmÀÜ½óœUDŸVpÓ!°mg…ØÛwe’Ş¿!Ï‘µÂDÙü{^fÊ…—>½ù°‹Ø'úPıjhjoÑWµŞ`h{ãaßè-MæoÆÂ(`7®Ã®©Š¦åàgìxÈuü”«”¡b)¯J()J”]nœı  ÿÿ PK     ! é¦%¸‚  S     xl/theme/theme1.xmlìYOoÛ6¿Øw tom'¶uŠØ±›­MÄn‡i™–XS¢@ÒI}Úã€Ãºa—»í0l+Ğ»tŸ&[‡­úöHJ²ËKÒÖÕ‡D"|ÿßã#uõÚƒˆ¡C"$åqÛ«]®zˆÄ>Ó8h{w†ıK’
ÇcÌxLÚŞœHïÚÖûï]Å›*$A°>–›¸í…J%›•ŠôaËË<!1ÌM¸ˆ°‚WTÆİˆUÖªÕf%Â4öPŒ# {{2¡>ACMÒÛÊˆ÷¼ÆJêŸ‰&Mœ;Ö4BÎe—	tˆYÛ>c~4$”‡–
&Ú^Õü¼ÊÖÕ
ŞL1µbma]ßüÒué‚ñtÍğÁ(gZë×[WvrúÀÔ2®×ëu{µœ`ßM­,EšõşF­“Ñ,€ìã2ínµQ­»øıõ%™[N§ÑJe±DÈ>Ö—ğÕf}{ÍÁÅ7–ğõÎv·ÛtğdñÍ%|ÿJ«Ywñ2O—ĞÚ¡ı~J=‡L8Û-…o |£šÂ(ˆ†<º4‹	ÕªX‹ğ}.ú Ğ@†‘š'd‚}ˆâ.F‚bÍ o\˜±C¾\Ò¼ôMTÛû0Áz¯ÿêùSôêù“ã‡ÏştüèÑñÃ--gá.ƒâÂ—ß~öç×£?~óòñåxYÄÿúÃ'¿üüy92h!Ñ‹/ŸüöìÉ‹¯>ıı»Ç%ğmGEøFD¢[äğt3†q%'#q¾ÃSgv	é
à­9fe¸qwW@ñ(^Ÿİwd„b¦h	çaä ÷8g.JpCó*Xx8‹ƒræbVÄ`|XÆ»‹cÇµ½YU3JÇöİ8bî3+˜(¤çø”íîQêØuú‚K>QèELKM2¤#'‹vi~™—é®vl³wu8+Óz‡ºHHÌJ„æ˜ñ:)•‘âˆ~«°LÈÁ\øE\O*ğt@G½1‘²lÍmúœ~C½*uû›G.R(:-£ys^Dîği7ÄQR†Ğ8,b?SQŒö¹*ƒïq7Cô;øÇ+İ}—Çİ§‚;4pDZˆ™	íK(ÔNıhüwÅ˜Q¨Æ6Şã¶·[SYJì(Á«pÿÁÂ»ƒgñ>X_ŞxŞÕİwu×{ëëîª\>kµ]X¨½ºy°}±é’£•Mò„26PsFnJÓ'KØ,Æ}ÔëÌ‘ä‡¦$„Ç´¸;¸@`³	®>¢*„8»æi"LI%\ÂÙÎ—ÒÖxèÓ•=6ô™ÁÖ‰ÕÛáu=œr2fË	Ìù3c´®	œ•Ùú•”(¨ı:ÌjZ¨3s«ÑL©s¸å*ƒ—UƒÁÜšĞ… è]ÀÊM8¢kÖp6ÁŒŒµİíœ¹Åxá"]$C<&©´ŞË>ª'e±b. vJ|¤Ïy§X­À­¥É¾·³8©È®¾‚]æ½7ñRÁ/é¼=‘,.&'‹ÑQÛk5ÖòqÒö&p¬…Ç(¯KİøaÀİ¯„ûS“ÙdùÂ›­L17	jpSaí¾¤°S!Õ–¡3•† ‹5'+ÿZÌzQ
ØH)Ö7 ş5)À®kÉdB|UtvaDÛÎ¾¦¥”Ïƒp|„Fl&0¸_‡*è3¦n'LEĞ/p•¦­m¦Üâœ&]ñËàì8fIˆÓr«S4Ëd7yœË`Ş
ân¥²åÎ¯ŠIùR¥Æÿ3Uô~×ëcínrF:_Û*äP…’ú}ƒ©-pÓTpŸlşr¨ÿÛœ³4LZÃ©OĞ 	
û‘
!ûP–LôB¬–î]–$K	™ˆ*ˆ++öˆ6Ô5°©÷v…ê¦š¤eÀàNÆŸûfĞ(ĞMN1ßœ’ï½6şéÎÇ&3(åÖaÓĞdöÏE,ÙUíz³<Û{‹Šè‰E›UÏ²˜¶‚Všö¯)Â9·Z[±–4^kdÂ—5†Á¼!JàÒé?°ÿQá3ûqBo¨C~ µÁ·MÂ¢ú’m<.vp“´Á¤IYÓ¦­“¶Z¶Y_p§›ó=al-ÙYü}NcçÍ™ËÎÉÅ‹4vjaÇÖvl¥©Á³'S†&ÙAÆ8Æ|Õ*~xâ£ûàè¸âŸ1%M0Ág%¡õ˜<€ä·ÍÒ­¿   ÿÿ PK     ! d£ø  c     xl/sharedStrings.xml¬YÍnã6¾è;l› Hœ,¶‹b›¨m91Ë­l‘½Ñ«+‘®H9ë§è±ï×'éP?ŞxH{}èÑâÌp~¿™¡¯~û’g°æ…J¥¸î\_t€‹X&©x¾î<DÃ³_: 4	Ë¤à×Wß¼ï¿»RJò
uİYj½úĞíªxÉs¦ÎåŠ<y’EÎ4ş,»jUp–¨%ç:Ïºo/.Şws–ŠÄ²úºóîİû”"ı«äıúËåÏo;Ş•J½+íE<^Š4fø«U!×,»êjïªkNkŠÇ`N?…ë‹O¿Ø‚!”çGP˜æGÍf\öA­XŒ®DŸ(^¬yÇa`c)O ·Áröu"áŒÄ:Õ¬½®‰xE×zÎmà.‰Ûº]šãMÛå«õØo×>URú2ÏS­9ßZ»Ï-Jgd÷‰=à‡hÛÒ}¢©h`‡©`"Nd»MáŠªƒÊe•ƒl¦ˆNî 88©mVx¾Á3à*}L#tè·láµ®Ù(øìÔæÎùdFè1Åñ«´Ğ#«y±=„O@	€°—™Ó%æxÅ‹˜Í9œ¼9¥÷ÕRwé(9¬\.r•È
w6ø¹¶QªÇ3ùBoÄ
Z•Ú`@šÀG§7Æƒn4˜¿fiÆu×’±P
,)/ªş#b7%+º=äOç§0à¥*HŸL$3l,x•©ÁmJ8S4 ŸÀhq#~`ùêW˜q¦ì<İá#–»Õ£œ²à9†zR~Æb¦Ú¸ajÂîÀµ)¯|€­25}˜2yşsÁ«kˆZ^ãæ4KõÆ˜:,EÒ2İqÜ‚p¸õAMS¼r)é9@´—f™Ë¾Şèî¢Çi@d¸Õ‚™”Dˆ=ƒEô£[‚Ÿ›¡„Úæ½Ê^\GğüX—–à-ñ²øü:—öÑ'I7Ï»›Í†ª}ÂMœ"ØŒ¯d¡)I«ØáS# 'Ê<N…™'ú7eƒõÓç…NŸ°Lì™§½è ÉLnX†êšXÒ«¿bÆ5T'©€Øu±…lQ'oß˜lå_b®õEe}	¹ÚgDœoA/¹@üÍºŒ'’/ò®–ˆ ‘¤€—Ñ<Õ?*X¦‰ Í0-&DƒmBÔçK› 4cÚòœ±€©Sox>eŸ8]!ÆÑÆíÍyÆcµ})T™á ¯ÁÈ%¢Üîi·\c†ç¿ÅÎ'ÿ“/İú…Rœí@WïT=o,1:ÆQe/±Ãõ½›`L?M¦AQ«‡ßÆ£(ì9½˜D~4š„–ÄèÖ’å6 dÕ« g~ƒ[Â°–0nYà¶–
˜™†…ñÖ‹-h˜KtBåòDI·>­Û`R˜ƒğx\ú°]Ì˜Ir\Wèù«9‹ÍxÌÓµ“«E–y‰-z'M›Nìú®àvÛ¦kzÓNW6¹ĞÈ=ÔÉ
DÛAõ @ã¦õ±›â2mpõ#/V+ë)¯L‡İ`>ê“û½)§›£;ûƒSãyÕÓ±~çfKçÀÌ¼9e›jì8ƒş’	&´$7î±¢nˆs´ÃDhÃQlíu‘éëU„bûjDe•ë›7ãÜè×¦$ÔW-OÎN·6WJ$¦VN®Owq[‚Ûøv~Ä,JÅëRj¿w;· ôÇt`ñîü0E–êãÉCÑ¯óâ\Øï?Q2?I°¾À¢ÔÚPİ6ùñg!_2<×SŒ©´‹Ãïœ›Ñ‘\±GHõ:ãNèP¢£çæ:"Íû„)]ÌWZŸÓÃ;£¯İØæÜ£G²®²dÆñ=Ip¤2ı†¢M`z¾EŸ&uèyË¯Ê…2—•¤Š™™ÁîäÛT—•6	ïF¡•a0´ Ü?PJ·¦şã8#øQ`Ù¿ãÓfŒ	|çË¨ªñ 8ãFg·œ¶Ñ<áÛSËA-Š$Š‚IWAë)öŒ8„óS€K”Üà.†€›‰c½š¹eÄŞ€”·—Ëí„Ép8êü;x˜ÛN¸AŒíO‡Twlw+i	·ø€i‹«7KkÒªæzYuHQækZs+øŠ«‚"ªÌve§Pïë¹a'Ü®|µÌºîus¾^TÛ¡ø¨+£;ÂH*­Rtß„[X9
™Ã¸³“Ë<$«VÄ*%éa›@~ò'î&¯)Eµ 6ƒ9s«…—0ÕÃM<©v„FEy<Çúêùƒ~Ø·ß²ÇÜxGŸœse=ıãQa¥ä¿ÿüMÌò°5´O$½›v¶·W<<ÃWªi7Îm0àäòò¢ZÁXõøÃª©àÕ€ÖÅ?	¼ÿ   ÿÿ PK     ! ÏáşÖ7  V#     xl/worksheets/sheet7.xmlŒšYsÛ6€ß;Óÿ á{-“"¥Dc¹Ó6µx³Óó™‘h[IT):Nÿ}Øq,R÷%‘?,{àX¼ûşËé8ûÜ×CŞáÍm0ëÎ»~8?m‚?~øî]0»íyßûs·	şé®Á÷÷ß~s÷ÚŸ®Ï]7Î@Ãùº	Çñ²Ï¯»çîÔ^oúKw†–Ç~8µ#ü9<Í¯—¡k÷²Óé8no—óS{8¨a=üıããa×}èw/§î<¢’¡;¶#Ø}>\®Áıİş mÂ¡ÙĞ=n‚ÑºI–ÁüşNıç¡{½¿gcûñ·îØíÆnfc)»Çñ§îxÜ?,â`&|ıØ÷ŸD×„na«ì"iwãás‡âM¼ş-Ç¿aĞù4ªù[Yğ ãóË0ÛwíËqüµM»ÃÓó¦$¢û®?‚,ü;; CI0;µ_äÿ¯‡ıøbÑMô.	“em»—ëØŸş¢9<*F|hÇöşnè_gë½´"sñ†šá7+ø9>vŸ~ì…BuXØÀ(¡æƒÀÂa« ?#—àÁ[¤.È\» pAé‚Êµ+&pròRn†Fy*ğ&x§= 1Sîó}üşnş2¼#éÌj|g7æ¨j¡u•¦xÙâŠÇ¦Ì2¶ej’Ñ‰h¼gîA†}î	lº× àı—şş[ığş+»ÿ×f
»‡™(Î0"rrâcdËHÊH†$ÒšsF
Ö«d¤b¤f¤!±l„°å˜é0Â¡V”kæßo$dM’ÅÂ$[%$gÉÜœó¡³ĞØ’Ãú†}mšëÉ­«Vt!wbÛÌ¤×¥6ŒW/IyôŠÉíÓ‹“ŞÒ›„®Zò¨iBµK±+NæbúVâxP+G…z^¦!õÓS,#dHå•UÕ5
yÜ§»Ï]Á7Áb1íuÛÑRoY)GG9GG%GG5G!8¦ÅYkÍè÷_qNpÇ9D+˜ÆSzÃØÙ´Ó¥ †ÔÂ‘Ê´”:s
BX"È=¬THOŸJ!™9)Us]!O`kóæWr;„Ìür”q”sTpTrTqTsÔò9§7Nk­F‚;Î!z#¿ÔÑÉ¯{®k©)¿„Ìü*däW!#¿\WCÈ½iÛ!ÀıØ\¿"+¿e\*ç¨à¨ä¨â¨æ¨!äsN¶sx(XÎ!z+¿(eç7vÎ²,š¤t~*HÊÊ/J%f~	™ùeºÒå>åìàf… ‘•_†2QBÀÚ0¤r
J*jB>çtj;‡u§å¢·ò‹RN~Ã?×$7$eå¥¬ü2óËt5¤Ë]JÛ!ÀÒÙ
"#siÄPÆQÎQÁQÉQÅQÍQCÈçÜWj©ˆÊ$£¸ ôV~±£“_ç®”‘.#P9G!+¿¨ŞÊ/!3¿“j{hH—/_©¯"ª¯ôem«¾7§eå•UÕ5
ñ[2T°ŞâBr¸°A ŒbJßD¬"¦¸¡$
nÉA	”\†çÎ»%©ÿ¼ó¤Jˆßy c¾Á·’;w•S¤JHÎÛ'±LUõäÓvA»…y•
ã¥}9I•”G¯5›&½)<F;Ú
B9ÅÊ57#¡¥¼ËR2'dÜD
J*j…<V‹ª™G#]`5ÙQ)#d.]
J*jBu[u²¬äY˜'SdÙ½ #)g_ZÙyÍµ”ò· dnB
E„BÆ&DÈç‰µ(OXQœÅˆÌhsTpTrTqTòÙhU­†X¾í©jÕ9q†åñ$¤ƒÈ
6!3Ø„Ì`#ò9âß¼Òk<XÉjôL!½½ç•UÕ
ñ]:öoF©ä0µ¡†0¦¶³eJJêÅ]ƒ¹kpTrTqT+ÄwXÔ6]Crër—²æ1«Œ
.UrTqTò¥_”ÜÆmÌJ„”Ğ[S{ê¨sÂ§ö$¤&WAÚ­©Rf1£¤Ì©R>ßügÍ6Æ³ÆvJÈÜÈ¹TÎQÁQÉQÅQMÈg¶>lVëpÚZ¶16–ÙˆŞJÉÔQ§$tŸ½æ\}ÁQÉQÅQMÈãäWÍ7Ó¹Tr{M2üÍ9*8*9ª8ª	ùlÔçm#?`nº1Bò”zÌºo-¥V@ÉQÅÕ×„|f‹=—²m6íıF‘¹™Ùˆ *Ê ‚¤`D…J…ôú«¸®šÏF}ÚØ6ÒicÚˆÈJ?CEÂPÉQÅQMÈg£®¨mñ¹ƒ¹G$ˆ,9éwĞÔ¤th§
U\}MÈg¶>$m³±b·ÌFd™(ÿ¦£4q^e¢Št8¨•‰¥BzÚT„í5!ŸÕúŒ´­ÆÓÏ,?àı·}a”•UÕ
å¾öÆ7Î§nx’/È¯³]ÿr† ÁS¿û»	ã{ú<‰×%äâÃZh‘ùvZŠ8ZWPìñ>Pà¬EùÂ[à¸„>ÒTG[D0O[„Ğ"³Ó$¬+xÀÇÛéZ\>}-1´ø<…;"´ø¬†[ŞZ\â¸6¸F€?r¹¶…ï×â‚§O‚Õ~Ğâ³‰A‹Ï6x÷¸¯ù8U¼†ÓœÃkEèá‹ôCC‹¿ÏZ¤eóÉQø6âÒ>uU;<Î×Ù>Ü€ï3n ®ğ+
ù>éÖàÇ~„/$Ô_ÏğAJ-ÜŞÀ^øØ÷£úLzëÆ—Ë¬ğ±‰üÆd\úaÚÃ#¬ûM0d{éù|ú"æş_   ÿÿ PK     ! 4‡†T
  1-     xl/worksheets/sheet5.xml”šİ“Ú8Àß¯êşÊïó1‰k˜­Ú`ìî;Ëxf¨0xH²÷ß_KêvKj“ì>eòSH-©Õ2zøå¯·cï[}¾šÓ4|¸zõiß<N/Óà÷ß’ÿ|z—ëîô´;6§zü¯¾¿<şû_ß›ó—Ëk]_{`át™¯×ë{Ôï_ö¯õÛîò¡y¯OĞòÜœßvWøïù¥y?×»'­ôvì‡ww“şÛîp
Œ…èüwl4ÏÏ‡}=kö_ßêÓÕ9×Çİúy=¼_‚Çí¡:?>¼ï^êm}ıı½:÷×ßš
 Œ2è?>ô[©§˜Rãïëçiğ9Œ¶ãP‰h‰?õ÷‹õwOüÏ¦ù¢²§ip§<ÖÇz¯ºĞÛÁ?ßêÏõñ8²Á‚÷_mşÊÁ={VêÔÛG¢~ªŸw_×Mó}^^^¯ĞïqÛ«Ùîº{|87ß{µ¼¼ïÔ£Á§ gd?ÜƒŞõõ°ÿòk£”•.*]…Ç‡½2óYái h03`¢45ˆ}ø 5@S«d°ÑÜWYø ğAi ]ÀF+_eíƒ¶˜¸´ÁQsfE“‚£ğ4øØÆbfÀÌ@tÕ²ûö8Ü=ô¿Á¬î)`­…0$5$ä0g†°¯¼U²}\_‹Vˆ|‚”†X¾V†°¯ªU²}…®¯u+D¾6‚l1¾úv„a]vEXa'Â?µ1[’ ¹kIj+eğs,»´Âv$l·4„í®`»•–İ5Za»$lwkˆ¶ëDiâFéÖ®¦õ©Äa—³á½ñÍö$$E¢ ÙÁHØr.´‚‚”HØò
	[®„ÖZ [$Ú²CuxY{ùVacf„ìi+Ppv2£¼ec$>Hà$–ÀI,÷U>(|PÀFW°ÑÊWYû`ãƒ­23ÂâêŒæÎÎEâ%Ç¡›Db–¢,’H”"²rV†ˆ·^ÎzvÖ¹,E‰JD–Ã"vX±ípì:\³9ÜH´EÔ‘)ƒWÜ¸!Vò‰µò4°³%!Şq)"ÎklNjÑÛ³n"‚kz0âMQ/ÇR¸[	w©ıÈİš„Øİ†»Û"’Ùuğ7‹&Ê ZŞÍ¯„¬+Q"QJˆ3aFˆ'&'Äæ•„ØüŠ›¯±ùµD‰¶„d¶¨’ê¥[] [m´MíÀ9Ó’Ó€g;$$EÂùÑ”äv*Ï…ÖBBÒ¶ì9P¤;Ah‡dÎyŞU3-	Cr+È‰›Bb–¢’H”"²rV†h|omÚÁàŞ5Ÿ“v!Q!QIHÈ€:»&ÕÓvChÚ¼2örh<0BNCÄË9E);ùîr”<Õzókè¯ô-:D¼ƒ­´;ã†&ƒC¼qUk’÷²"Ş·1\+µ£D¢”§…ŒÇ1'Ä¶©»­îDGZPõD»nÖ7Va¡ShLàn¥+ÑÏšÛ›w†„Wo,H"H*È\L	'“	§©Rh-Y	R!‘W¨ÎT+tm ÌYkm%-	+f÷à£»Ûc–j“	¢‘}Ø½’4GÄ®@â&œĞ3U’OÙR¢•D!™pBç,·–‹âv•”hIX@°¾¬(}r£”’ï”‘=Zßx‰2V	¶Ddå®!Şs•mÜI¡s ŞŞ9í²Pòî€qz_)RíÂbØ(Ú6ŠUZ;%êA‘Eh)ÑJ¢ŠL¡:ù­ÿ³©åİ!cíàÌqè%úõœ!E=dwœ#İZ_ş‘„†Œ!TíúºË…FmÔæ¨§–x«÷Ñ›¥…ì)AK­¡eìÍed˜¬„L…¤#ÿ¨3Ôšv¡)nG=‡ÊC»s¾L‰2nÁz÷ˆ%KÑ¢ZIT!‚@Ê-uuõÙPvÎÄ#ËÉ™¡wŞ'¡‘ræÔ/RRâ9ÍÙñ{P¢Œ“|ı‹Õ’„ì)4–Fœ+Ûç#LÊOjPÉ»5!Şç±D‰D©Ds‰2‰rBœ‘
BvşÁ®r¿–$Åh%QEHæŸ¡WzÜŠ¬:,V†7ÎhÍb	Ïc,H"HŠ„Ë	O~.´‚‚”Hä¶z*!èí¿^®Í[û{D[˜i¸ÊØEÄ ô*ùIqÇc‰‰RB¹ŒëÑ»<å$Å•„dzªc°M/Ÿ8æx´Ò‹–„ï/vıÄ“-!ÄNq.É°»œÔ~änABì® ÄîJDÚ“K†`Üü­İAç„–ws	!Ş ±D‰D)!N	!N	9!6¿¨¨$Ô‘ÔAfÍø­A[)A¥gK£%íy=ÂÓ’’
2$$GÒ±İÂZÒ&½ò›1áB¯Û:åŞ;Àc¢<AälqÉ !^ˆ9¢…èÜ)­.›o×ÜåÊquœy°÷$%)^\9"é{äì[s»(JLìpBïR–¢”]Š"êğí6–oÿB˜ŒqÆ}ï›„¬a#êpí
–kÿ"”Œq\w¥lßuø¾‘tábåÖ¡	§Z8	qµ6Gôã
…:ú÷ó¢Ú^EˆW,Q"Q*Ñ\¢L¢œÌxPW:ùëç¾ú;”ñ4wŠ $VÆ$$d.H&H.ÈBBR¥ +A*AÖ‚lÙ"‘9y¤†#Ds;ÉÌ¸_~BïÒ¹E©¥{#ùüä¿EÒaâF2ùÉx†Šl:bB¼î‰R‰æeå-$*$*%ZJ´’¨’h-Ñ†g¿-"_•H»Ö‚æÎZ@õÅwCˆsİQ‡£§ËØ?]fH†|VÇ„xg'¥Í%Ê$Ê%ZHTHTJ´”h%Q%ÑZ¢!¾ŸmuÄWoÖ¦¾•W){BIà„x»Ä%¥Í%Ê$Ê%ZHTHTJ´”h%Q%ÑZ¢DêÙ—u¢™g~æ¹Ü[}~ÑOó.½}óõ,¬ßÇ‡›÷P1Fª„ä·Œî"U­uµ EÏ‰Ğ	¡EwH´¡EïT¯e6Fê(ı|‚5¸›Ê¸GêÖ*[àb©Kl²¬éZÙëA"õ‰´C'C‹Şö|ÿÔ×í.{ĞÑDèL@GgÑr-]:IqƒÈÒü¢©G»Z&ĞÒå~&…w™]:Is
õ ´?#@K×Há7HıP!ufƒ;èA×Ú™ĞÒ¥¯Z"õ@EZƒĞÒ¥S¢M§<«€–.„­+³QÏ;¼"xZØÁÇ¼›“¼E›.ùjm´|¿|xi«í–»óËátéëgØ¥w :›7°úïkó®)”©6Wø"Eÿ{…÷Å5<e½û ƒç¦¹Ò Søøë{ï²ßáğÔ›óë×ÃÓàÏœ¡í½oÑáiœ³'¯~ûØùñÿ   ÿÿ PK     ! O—fâ  ¡     xl/worksheets/sheet6.xml”™Is£F€ï©Ê ¸Ç y¡$MU%ÀåJfrg$dQ#	°=ù÷y½ÑËkÇÎÉÖÇ[zyKC/¾ü<½×ºë›ö¼ôƒ«©ïÕçm»kÎÏKÿÛWòÛ­ïõCuŞUÇö\/ıêŞÿ²úõ—Å[Ûıèu=x`áÜ/ıÃ0\âÉ¤ßêSÕ_µ—úOömwªøÙ=OúKWW;¦t:NÂéôzrªš³Ï-Äİgl´û}³­“vûrªÏ7ÒÕÇj€ñ÷‡æÒû«óğÔ­—ê¹ş³¾]:oß_Û' 0K²ZLF©]¦èü½®Ş/ıû0~Œn©“ø«©ßzíNü{Ûş Ö»¥?¥ëc½¥Cğ*øóZß×ÇãÒßsX¼¿™Uø?.à÷è™ªËQè>[0ğ®ŞW/Çáöí¡nŒ›©³Q%ÕP­]ûæÁª…àåRÑ=ˆâ ò=.{uŞ‡C³ıñ{K•©k¡ 2ºÂj±¥fî)^úÌ		×T“ÔÄ7làmt9s»¤xé³Õæ.9¸30fº™¯« š.&¯°V[9ŒQHŒ ’q²ÁOô‘Ğ=ÑVKNbc$DwjöœÌ¢‘A¦#É8aJ†×kÓë{{$GCÅaÏ”áD¶|3!ˆd‚„h?n>73´8–b#f8ĞbÆÄ,fØÌÖ¨@ÜØ*¹
”à@¼sÏƒbcû9°1´q‘Œˆ|zœ¨ ßŒJzĞ¦¯|’¾
DJNA‘äÜ>Æy2‡@3p>7Ç’
!=$R!›	¤2h-ˆ6uA´4Ë¥%•g…DÊx)Î´ 0§úQª1y3×$Ò’#‚Q&Ë7¾Ù©¡o$RæsŒ
ŒJ‰p:ÿ»ĞFáJhÆŒDKiD"™ ZV¢¥5ÒÊ))Á©Ğšï¨QŒ›A>öäAÙQ>JÉ”#Â”‰2ôG7JOw83æJJZ/0*re9í>®à]I¥]ÂN&p^P¹™
dä4×›©ØÍ„”Ò[¢Œóc„Ğ•»£Ç#Z„5w¥îÎè§ílÚT?ÌrÑ	ÕTf_¥aŠÁ(“HÏrd~#¥”ù££R"G–]¢óÃ“^@Ûà¸L38O±ªtÏ¸™åvM…ŒÊ{‚H&ˆ#i+r9æ-j3ÛËÌJ¼$BÊuŠÁ(“ˆ£/¡Ñ ÕB0nÔA ‹Œ´Zqê±NÄ!bÍ2"¸ƒ…F{›åf2y³ƒI¤‚/Åˆ`”I„ƒ/4ZÌû£‚Ò%ßKŒ£­9IP 	9Ñö‚H†È"kD6ˆäˆˆ”ˆ<
‚C?¤mÃúŒ›¡’cÍîÌn
ù™‰v"JH¶ŒŠ”Õ[ÓêZ(¨ÀÈù¹È…t ½¶W)…Ô–>
äˆnZå]ËÃ«¿ê#i(úŞ8Ÿ¹õ.H”\€G®¦¡$¯ŞºkNf†k«èÀ¬_©>ğ(Ãõ'K÷˜ÓTŞÊiÔÖ¥!B££ ÉU[c´ÁŠ9FF%F9
‹Õ£>îjá;Í…q£«	¢Ş[!H&D;»"Ë¤•#R R
‚‹FôNbÜ(‚Xo¦öš’’L0ÊÒÏ®©\Ø(=•†AtcÖ•\II‡F¥@³kd5=™Œ›@%?8^¦BM?ÍJ¤b>ˆ¥+]Cî6‚hGå\ZRo…DÊx)®‘»“úŞö¥ÚÓø¹Êöùn\ªmVfĞ<ÉbD0Ê$Rl-‘šÈF"UxrŒ
ŒJ‰pÎGz„"öáA6Ò»ÆÍxeØÈxAT~§ˆD2Ay©·Í¯İ1’ˆ+-¯Í,I•”Ì‚Q&+KhÁ—ÍSï*i“ˆ-jSŒ”àRÚW&¤Q«—iĞ{gËÆ0åïğ™FÎ4¯ê,rU¥Œ2‰´8âŸïùgğSİ=³Oî½·m_ÎpV€Sìj1bş]?‰¦1­0ô$€'lTÖ¨}1-cXÊ<qé@$€5–µdÃ‡j‡­»¾åaÌcøÂŒù&€Qñ…µ=D7à›E±ıä.&N
¾(¸¼ÌÀ‹ëÉ}pÓW-¬gÖ˜Iñ8GÆô˜ˆŸÀ1t\óLCXIÖl´ÛëIkCÜk70¾'À&£ÜìĞK¢²ê›sïë=DÏô
Â»ãw.ìÿ¡½0
5è{;@‰–¿pŸUÃÕÉô
^`öm;ÈàD\>½\¼~[áÚéNm×Àµ»­ZúG¸Vƒg—¼ÅÍnéwë‹¨Éx¹¶ú  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings5.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings4.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings2.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings3.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     ! ÏàG´Á  ,  '   xl/printerSettings/printerSettings7.binìT1kÛ`}¶’ÆõÒ
Y2„©ØÔÆrÛ­1–’ºH•dã%ƒ‰U¸’‘BbR(ıı!3fìÈÜ¡”ü€,íûT…“Ás'î»{ïÎgùlD8BŠ3úGdØ†K!ÎóŒ¬bìã!+­hO®á>×^– ŸÕ¤2f|†a¹Ì8,k<-„œ–ñLòŸ\©èW±LWñ7í çëE)FïCWØÕjoçŸÿ­-æ«9ñ4ŸµXü8¸{¯–¹í›|;x¯z×q9xÿ’š<;¨ÃÄ+´ÈÕé^ó©³§EŞdÖ Ö‰›Œ]¢Ú9:çDÏôËB?Òp¦2w4S?:a™A`zpÒ(Œ³Q%1\Ç¼N/€Î’ÉqÎ1u¦*k¢›L’ÔNÆáßLıâ{«m İ°ïîş­:İÙbù]£ß–œŠşãÄşz³önó²ıå;9«¨¡Â¤0Õ«ğ‹"*¼G(¼Ş?á9Æ'î µYúÜ7j¸1›á„õc6/v:¬ÅKöv9ãSÎ÷ù	õ}j“eäÄDQ@DQ@DQ@DQ@XF?   ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings6.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings1.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     ! õœ_  œ   docProps/core.xml ¢(                                                                                                                                                                                                                                                                  Œ’]o‚0…ï—ì?4½‡*Ñ0Ù‡W:MÆ>²»¦}U2(¤í†şûUÄl»lÏyŸó¦ÑüPäè”ÎJcßõ0ÉK‘É]Œ_Ò…3ÅH&ËK	1>‚Æóäö&âå¥‚*+P&,IjÊ«ï©(!šï¡`ÚµiÅm©
fìQíHÅø'Û	</$&˜aätªˆ[¤à=²úRyœ@H£‰ïúäâ5 
ıç@£œEf•íÔÆ²?‹½û ³ŞX×µ[š6¿OŞWËç¦ª“ÉÓ®8à$œrÌ”*Y¢Gô„Öè­#2¸?í0gÚ¬ìº·ˆ»ãµõ·ÜMlT&ˆ$ğ‚Ğñ='˜¤ŞŒzÏ>"ÒÎu&¥i~ÎÙ.ôÜ¼SŞF÷é_xAê‡t<¡£©åu®¦}µmğÿÃÔ·	C‰ iB_ÿ§ä  ÿÿ PK     ! lL“¹Â  ¹   docProps/app.xml ¢(                                                                                                                                                                                                                                                                  œ“QoÚ0Çß'í;D~/¨Z'd\!š©“Æ@$¥Ï®s!V;²¯ìÓÏI$OËÓùşçËÏŸÙã±ÒQÎ+kd:‰IFÚ\™Ã‚¼d?î¾“È£0¹ĞÖÀ‚œÀ“GşõÛ:[ƒC>
-Œ_±Sêe	•ğ“ › ÖUÃÒ¨-
%áÉÊ
ÒY£pD09äwõ¥!é;Îüß¦¹•-Ÿßg§: s¶¬k­¤ÀpJ¾VÒYoŒ’£ÍèPd.ùáxÌèpÉR)4¬Bc^íÑk‚=ƒhMÛ
å<gÎh]äÕŸ`ÛŒDoÂC‹³ pJXmY¿èb]{tüÕºw_ g4ôÉ.ÖcuÏº‚ŒÛ=HÆˆ™B~Sl…ÃÄCâ¡çíq¤5èDwÀ!ä7MvûŸ«ä¦¶^şŞn^“İM1Í6»ÛÛ’ªÖö-óFÜ¿ü­õ±çZ+/'á^Ãìyùw)I[k§Ãİ#“>ÙòK™wÿRgöI œ¯}œdi)äaRÎú5ÁÃ;İ6Y•Â ?×ü+´Cºï_"ŸÎ&qøºÙ<ç½¾9ş  ÿÿ PK-      ! íú¢  4                   [Content_Types].xmlPK-      ! µU0#õ   L               ±  _rels/.relsPK-      ! ÉöT‰'  	                 xl/_rels/workbook.xml.relsPK-      ! ¯Ù¹N¼  S               	  xl/workbook.xmlPK-      ! –6"ğ[  wP               í
  xl/worksheets/sheet4.xmlPK-      ! ³XG‹  '               ~  xl/worksheets/sheet2.xmlPK-      ! ;m2KÁ   B  #             A$  xl/worksheets/_rels/sheet1.xml.relsPK-      ! Ä,Â   B  #             C%  xl/worksheets/_rels/sheet2.xml.relsPK-      ! 4¡	’Â   B  #             F&  xl/worksheets/_rels/sheet3.xml.relsPK-      ! C–£Â   B  #             I'  xl/worksheets/_rels/sheet4.xml.relsPK-      ! dó4"Â   B  #             L(  xl/worksheets/_rels/sheet5.xml.relsPK-      ! LZ*zÂ   B  #             O)  xl/worksheets/_rels/sheet6.xml.relsPK-      ! k?ûÃ   B  #             R*  xl/worksheets/_rels/sheet7.xml.relsPK-      ! àñ—"<  "K               V+  xl/worksheets/sheet3.xmlPK-      ! ºNÈ  ñP               È:  xl/worksheets/sheet1.xmlPK-      ! è¦Hûd  "9               K  xl/styles.xmlPK-      ! é¦%¸‚  S               œQ  xl/theme/theme1.xmlPK-      ! d£ø  c               OX  xl/sharedStrings.xmlPK-      ! ÏáşÖ7  V#               y_  xl/worksheets/sheet7.xmlPK-      ! 4‡†T
  1-               æg  xl/worksheets/sheet5.xmlPK-      ! O—fâ  ¡               pr  xl/worksheets/sheet6.xmlPK-      !  .À©Ã  ,  '             ˆy  xl/printerSettings/printerSettings5.binPK-      !  .À©Ã  ,  '             {  xl/printerSettings/printerSettings4.binPK-      !  .À©Ã  ,  '             ˜}  xl/printerSettings/printerSettings2.binPK-      !  .À©Ã  ,  '                xl/printerSettings/printerSettings3.binPK-      ! ÏàG´Á  ,  '             ¨  xl/printerSettings/printerSettings7.binPK-      !  .À©Ã  ,  '             ®ƒ  xl/printerSettings/printerSettings6.binPK-      !  .À©Ã  ,  '             ¶…  xl/printerSettings/printerSettings1.binPK-      ! õœ_  œ               ¾‡  docProps/core.xmlPK-      ! lL“¹Â  ¹               TŠ  docProps/app.xmlPK      ®  L                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    >
    <div class="um-footer"><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn ok" id="umCreate">${editing?'Save Changes':'Create Member &amp; Set Permissions'}</button></div>
  </form>`);
  const assigned=new Set((existing?.ulb_ids||[]).map(String)); const form=$('#userForm');
  const paint=()=>{$('#umAssigned').innerHTML=assigned.size?[...assigned].map(id=>{const x=ulbs.find(u=>String(u.id)===String(id));return `<span class="um-chip">${esc(x?.name||'ULB')} <button type="button" aria-label="Remove ${esc(x?.name||'ULB')}" data-remove-ulb="${esc(id)}">Ã—</button></span>`}).join(''):'No ULB assigned';};
  paint();
  $('#umAddUlb').onclick=()=>{const id=$('#umUlbSelect').value;if(!id){toast('Select a ULB first',true);return;}assigned.add(id);paint();};
  $('#umAssigned').onclick=e=>{const b=e.target.closest('[data-remove-ulb]');if(b){assigned.delete(b.dataset.removeUlb);paint();}};
  form.querySelectorAll('tr[data-feature]').forEach(row=>{const key=row.dataset.feature,prior=existing?.permissions?.[key],access=row.querySelector('.um-access'), radios=row.querySelectorAll('input[type=radio]');if(existing){access.checked=Boolean(prior?.access);radios.forEach(r=>r.checked=access.checked&&r.value===(prior?.mode||'read'));}const sync=()=>{radios.forEach(r=>r.disabled=!access.checked);if(!access.checked)radios.forEach(r=>r.checked=false);else if(![...radios].some(r=>r.checked))radios[0].checked=true;};access.addEventListener('change',sync);sync();});
  form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;const permissions={};form.querySelectorAll('tr[data-feature]').forEach(row=>{const key=row.dataset.feature,access=row.querySelector('.um-access').checked,chosen=row.querySelector(`input[name="perm_${key}"]:checked`);permissions[key]={access,mode:access?(chosen?.value||'read'):'none'};});
    const data=Object.fromEntries(new FormData(form));data.ulb_ids=[...assigned];data.permissions=permissions;
    const button=$('#umCreate');button.disabled=true;button.textContent='Creatingâ€¦';try{await api(editing?('/api/users/'+editId):'/api/users',{method:editing?'PATCH':'POST',body:JSON.stringify(editing?{action:'update',ulb_ids:data.ulb_ids,permissions:data.permissions,role:data.role}:data)});closeModal();await users($('#content'));toast(editing?'User access updated':'Member created with permissions');}catch(error){toast(error.message||'Could not save user',true);}finally{button.disabled=false;button.textContent=editing?'Save Changes':'Create Member & Set Permissions';}};
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
    fields: ['Checklist Date|date','Prepared by','Technical Approval Status|technical_approval_status','Technical Approval No.|technical_approval_no','Technical Approval Date|technPK     ! íú¢  4   Ş[Content_Types].xml ¢Ú(                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ÌUËNÃ0¼#ñ‘¯¨qË[¨)G@jù o«‰my·¥ı{6)(*…6EpI”‡gfwÇãîõ¬È£)4Î&¢·E6uÚØQ"÷­K!)«Uî,$b(®{‡İÁÜF¼Úb"2"%%¦
cçÁò—¡…"~#éU:V#Çíö¹L%°Ô¢Côº·0T“œ¢»¿^(y1VD7‹ÿJªD(ïs“*b¡rjõ'’–M
Ú¥“‚¡cô”Æ€Š<öÁ0cè†Böº\t0¢'èAÌ g¹$® ×NÌ54Q•(_"ÍsÀÆT«õ.@¿a~ua\5eu;ß³ˆK¿­cİä¸İ¨ßóÊÊ“˜ËJ×0löÒf”|qn¼çÆTSeìR÷›¢ä»SN÷,¤ÆßRÇÙ_èàˆy
Î£ä@jÌeâiĞ-ÏÈ@í¡Îâ¸±†ÕèØu'ÿDGóÔŞ­˜© ºO|ÒŒöç±7í‘Ú›©°ı@–™V®^ãHYù½7   ÿÿ PK     ! µU0#õ   L   Î_rels/.rels ¢Ê(                                                                                                                                                                                                                                                                                                                                                                                                                                                                        Œ’ÏNÃ0ÆïH¼CäûênH¡¥»LH»!TÀ$îµ£$@÷ö„‚JcÛÑöçÏ?[ŞîæiTb/NÃº(A±3b{×jx­ŸV b"giÇaWİŞl_x¤”›b×û¨²‹‹º”ü#b4Oñìr¥‘0QÊahÑ“¨eÜ”å=†¿P-<ÕÁj{ª>ú<ù²·4Mox/æ}b—NŒ@;ËvåCf©ÏÛ¨šBËIƒóœÓÉû"c&Ú\Oôÿ¶8q"K‰ĞHàó<ßŠs@ëë.Ÿh©ø½Î<â§„áMdøaÁÅT_   ÿÿ PK     ! ÉöT‰'  	   xl/_rels/workbook.xml.rels ¢(                                                                                                                                                                                                                                                                  ¼ÔÍnƒ0ğû¤½Ê}hK·©¡—jR¯[÷ ˜§ÛxûY¬ƒ!UÙqŒ#şş)ÂŞí¿šÚû ƒ•V‚…~À<P©Î*Uö~zyxdZ©2Yk‚u€lŸÜßí^¡––>Â²jÑ£…‚•Ö¶ÏœcZB#Ñ×-(ºÉµi¤¥£)x+Ó³,€GAsó7ƒ%“Lï˜	fõ?u-uş?[çy•ÂA§—”½Ñ‚[rJS€¬?şCŸ Œß6¬æ4|jsÆÀ¡„¼¿Y¹0Û…1[&Z¹0áÂç?/Œ‰]/³Y³qaBÚ1ó4–Ò@öfm,¤àëhOÊ.ÍzNÌ0È#d(]g{íÂ<Í‰AÛÕ´­Ç'éÏ¿íùd'ß   ÿÿ PK     ! ¯Ù¹N¼  S     xl/workbook.xmlŒSËnÛ0¼È?¼ÇzÄÖ°¤­ŠúÇ>3äÊ"B‘I[ößwE#íSOärggwF«Ùı¡QdÖI£šRJ@s#¤Şômõçö;%Î3-˜2
zGïç7ßf±ïÆ|$Ğ® µ÷í4I¯¡an`ZĞ˜©Œm˜ÇĞn×Z`ÂÕ ¾QI¦ã¤aRÓÃÔş‡©*Éá·á»´?‘XPÌãø®–­£óY%¬OŠkÛ'ÖàÜE‰bÎ—Bzbh:¸x°»öçNª>;J'4™ŸE¾X" b;åW(ï“ıÊ‡y>î‘½k	û*êCrØH-LWĞÛ,Go—a’)|]Ğ<Ü!äôöä¶öØ!›Œñ‘q/÷°bïí’¨_pû†“è —í-Kğûõ–/PVF‰J¼Ø…Èú©ã’×r¹^ü*#8zt†ç×ğÇ‡§—çM¹Œğ£w]=/còq^ƒË¦Uæ@ÄiQ“IT7º®{”HyÀås¸¨_Êq‹ÏR‚Ê{Ğ›³O?"tØƒ$¤ĞcÎÇeè`h>šäaŠäó˜ÿ  ÿÿ PK     ! –6"ğ[  wP     xl/worksheets/sheet4.xmlŒœ[S#9²ÇßOÄ~ÂïÛà+àhz#N»î¾âà7ÜİÄ æ€{z÷ÛŸT)U)å_î™—ú§TJJI™)U¹>ÿë?/Ï'îŞ?ö¯W­ö§³ÖÉîõaÿøôúıªµ^¥ÿ¼h|î_ïŸ÷¯»«Öw­}ùÇÿ|şµÿããÇnw8!¯W­‡ÃÛğôôãáÇîåşãÓşm÷J%ßöï/÷úçû÷Ó·÷İıc]éåù´sv68}¹zmYÃ÷¿£cÿíÛÓÃn´øù²{=X%ï»çûõÿãÇÓÛGëËçº…ùû—Ïo÷ßwËİaı6?ùötXíçh”­Ó/ŸO©Ç'ReÆò¾ûvÕúÚn/zF¤–Ø<í~}xŸ˜ÿ{¿ÿÃW­3Óâîy÷`ºprOÿûs÷u÷ü|Õªd»ÿ«•ÒŸM›¦¢kß×Ö¦¢®>î¾İÿ|>\ïå»§ï?Ôã¾©ş°¦ĞO^ÌduZ'/÷ÿ±üzz<ü¸jõ?·Ï.»çıÖÉÃÏÃşåÆòzÈMÍu¬®işàšíŞ§‹~¿7¸ˆ×=µ×&İî¿|~ßÿ:¡)£N|¼İ›Ğu¶»ŸŒ–Ã§‡?şwoúoºÏºaQóÕ`ê=NFÔv«%R2r
J*ÆL4˜j0Ó`®ÁBƒk–¬4Xk°ÑàFƒ[î4ØZp^¯Vš°fÖzñY3øªu!³fAûœfÿªe6ãŸ_ÎÛŸOÿ¤ÿÀS±Œ'¢$r”è„:
”è†••è´½fÎ•–q#cv—Yu S 3 [K.Áj´	üÍáÖºÁ¾Õ¶`}ã@¼Íåêì×s+Cl­4*§9Š)78PnoG5]	J(C§(¡{i%°—&şDL`°ßË­Xÿ2¬Ì?9ÓqòWg²¢™XjÖH$’É@J 1	)9k K + k  7@nÜÙ2éÀF£	–É±i–0Ô¦[X5/Id@r ’Iík‡4f"qµ¦@f@æ@L¤­%ikµÖ@6¾S?f˜%jbÃıÍ;ª%iÛ‘?Öz"BÎ[§Œzä›z]åY2'$Ã*ÕŞ‚Í¬û4‘æD÷…ò|P´d"!qU¤äÆWÑDäˆlÛH-í¤Lú´cœ÷C#fN¨ŞBõĞKF¾1´î	Ë¡í§É¾˜!š;$Æ_0’ö–Ld,+&4×ŞÚ!éùÆ×ÍdÏhÇÜóúmÀ¥)“Ğ˜mL[­/]*¹nÌÄ)‡$¦LÍÍ-’>,ã­’×ˆ6ÕºBƒÉdè`nå”Ih¸sm8[-0Ü±¨}$	ª¹ïER&aÓºi›MËŒ?ò—Q³\l²â/Kú´qdï]ê¦YH6Q^·@‡(?»º8ë•,T¯©pVTrô—ËÜ&IŞRµÉÂH¥ˆ2D9¢QéPd‘™ğş7v­ñ
ûn‚jq&â¬ )H¤ R©€ŒL€LÌ€Ì,€\YYYÙ ¹räÈ–	2Í6ğ@3†û[}TKª„¡­·ºòö¤ŠßyDDEæ""¢2ŒŠEÌÿšİ?P‘w,B.¤MMÍm¡GèI¹jî[pË$¢âHÂÑÑIÁÈf¼måíò ´£|Ú$,UÓ²KÕŒlÂR5[SJ‹%20•4«KÿQÇ	©	“n“¤L<_îdÈ‹5Vé«UP¸j¢©tHÂõÄ!êG£j òá©Ÿ6sÈË¶ÉX®™H–@VNQ3Şè¹Z·@î@Ï–Idz¤bl™DT¨Tá¯â¡¹¯T§}‡¼xˆ(E”!ÊˆJD¢1¢	¢)¢¢9¢¢kDKD+DkDD7ˆnİ!Ú:„ùCG¥kÇ¦ßËTÕ¸›É6u,‘½– Id@r Hddd
dddäÈÈ
ÈÈÈ[ w@¶L"ùƒJ ›é´÷F’¯:–}¼sBV*ˆ¨hUDDTÈªXÄDuq÷*rŒEHò;
ªçĞ¥fˆ¶ŒĞƒv$Ô5ò&G’¸.$q†ÈxÕ1KUn·em‘æd@]}Á3bÒ%#6½Ğñ:a¡DËÔ!‰×¹¨rQ8)©X:$·Œ"ÃPYØ1_æ–x×f=şÑÎ!Y	¢Q†(wH<b¨DT9$#š8$îuŠh†hî¨_ ºF´D´B´F´AtƒèÑ¢­CÊº*Wı‹éÏky:Éj+•ˆ&I;E4PpÑ=’µÕ<83‘)N€¤@2 9H	¤22222² rd	dddäÈ-; [&A»*ƒnÜ‹Í”½ZKê¸
l™ò<¬ A#"ª¡ŠE~AEÈyé	¢)¢¢-£ˆãVIhcA{ù'Üv-‰¨8’•vm**F†4±«­ˆyXªò‰IXªrŸEXªbó&(í¨v·¦4z7¡6v¿Ss?»1‘SkÂD\ÊD<Wîd~ÑWM4•ˆ*‡$VOúí¡Ü	‰››9$±sÁH†wÍD:µ²rŠšlozn Ö-;Ğ³e‚K±§òÁ¿ˆC_kyò
b¶‘C¢D)¢Q¨@T"ªMMÍÍ-]#Z"Z!Z#Ú ºAt‹èÑÖ!LCz*—?6ıäOùí®Ş‘ô»æA>ÀD6J$’É@J Œ€”é>Ê²såµHà®˜˜»­Æ_èÅB‘M¦’½¦Ãıv*ó ;êY{GÒ°šû*F†4}ì© °¼÷Ü5uHœUêP¡£pÈMCú\U:!ñŞ£ˆ}TRâMIğac7¼Öë1ò ¥2D9¢Q‰¨r(²ÏTÒpl„Ş>;’#ôlì•X3bâï3+#$™H¤ R©€ŒL€LÌ€Ì,˜DötwĞº”—T›5cDÂbI°§Ûg*}]ô¬.ZóZr.½	Y¿mñµæ~C&÷õTÀMJßsÚl¹ö™Ú˜	Kõ©Ë”Ê¶S‘rYr†(äëR.¯)§«DT1Å¼~©¬rì¤dO×4õ¾.åæf"åú5G´`™˜ ÈywLôšYVÒç„	Å×tŠ(C”#*•ˆ*FO;$ıš8$ıš:]~TÓO¡fNH¼ÉÜ!qBFSáÖ3¥áş6™w+”)-	L	(ãzT¨@T"ª¦´-ÒZqó9qR¾)¹_¿7%ù¦dä›Ò¢ˆ)MrĞ¼>á™Ò&rl\ô-‰¨Òj¨v”æmşÆ‘pb,1·òŞöUGÆ¤ÏR¡óQ×º–Šô,È\Ïèç¤ÖÿAÓMÌúğD)¢Q¨@T"ªMMÍÍ-ªWcpw×²ã6¥…ÍÙ}?È:¼%YG-yÕ’¥œ I™Ôñº9YíÔ*T¾p€&8Çv„Úæ9r³b/Ô‚™0iüt/A”2¢‡’nûçÚÕB/PU‰¨b„ÛÁÄÊØÈjNÇ,¿m{XˆÎ#®Ï‰CrnOÕmÛÙù;Ê§I”—‰òÊWLÙ@å<^ªİçµ|xáàxäQê8éÜ!égáè*Uá¨LáØpd‹Œ{¬Ùšh&²ò )H¤ R©˜Èî˜0‘Í;…Z3 s &¢yÉÄÛŠ+DkDD7
—ŠŸŞ\¹¨2Ğ¡tÄ$8%\¨W¡*’­4ab<pãè‡{á‹ŸS'%S<C4G´pHbş’Q`C;­Qjƒè&@¡ÉñDW¯á~ÖP,ñm¢e¦,C.AŒšhQšyDDSĞ™¥«$«p…hhƒè&@¡¹TVÓ¬3›ªÈôD#\ª·éSJæ5‰g#¤İ~ê„äÊ%µª³má*ˆ?,¯Y1ò'R÷~2K&ŞÚ[!Z#Ú º	Phß¿™á4v7ò*š0’ ¥ˆ2D9¢Q‰¨rHÌ>qH&gêtu†hhá¨_:ä¯¶ 5Jmİ(œ•Oz.7ˆö^x<’Òl¶&ÁgÄD|g$’1‘1LDs	µ* c  S 3 s  ×@–@VLêqSp~$“¬9¹šôÆ¥\ª;™‘òŒŒ(E”9$®`$¤4¤i»§‚cÅòæE#¤û5!—êNC­*/ŸqÙB‹@¾¯‚Ëµk€BiÓ}G²tB²†VŒj¯Î‡J€k:7Ü #&şø•O""j iDDEÇŒEÄÃLd®*&æ±Jc‡¾
Scr³±òu‡vP™sc{£&Mgç–øİÓ2Ë„İSÖ‹tÏÓvO¥éÇ<WÓm#F–sF²ÖD)¢Ì!q×…CJ‡D}…hŒh‚hÊˆ~¸á,3C4ÇŠD×ˆ–ˆVÕc-<M?3ÌQ,)­yp¤bâ»3›”
IA&’)€”@* c  S 3 s  ×@–@VL"QÄ¤|‘Së¹NGL(ñGq©îçW,ñ&‰µcsñ
£sKü“QD«JCšMk¯µDkrN¤ño—êKfJi“?GÖÁ wB²¤
‡üø`UEúz$:·	ôuÅU\	ù5÷CLbˆWİe,ÿûá:!o¸yÃeékÍ·vìc´WL"*ŒoÖŒ§BG‰ä‚ˆW¥™)Õ³{©²’Ü	ùÃåz2ÜŠ¥‚×ÕÚg*\®X*2¢ øx#²Å[–DT^”¦Y‰^´±7ßHÑG’ê&&A”"Êåˆ
D%¢
ÑÑÑÑÑÑÑ5¢%¢•C^H³¡²ßSzÙ½¯?õqò°ÿùJëRÛ/Ÿl¿NE¿¯fösPPÒ¡’Z9”t©¤¾U%ô»ş¡ù‰>EuUB¿ÀšŸÜc	ı4´Õ—ªı ›Jê•%çTR‡U’wzCó8l‡~74?hÃzshŞÂÇzh^³•\ÍK}XBïõÍ;zXBoÃÍë/XBï¸Í+,XB ‡æY2–ĞQahNXBÉóĞäÆ±’•ÄÆC±fhâÖù:8šû|,É©Ä\Æc	] Íı–Ğ%Õ‰•ĞæĞ\4b
Ã‚<z¬¤C%±ñĞË	CóÖ¡W†æ­,¡†æ ,ùJ¶6gL,¡c#Y4VBOæ©±¾Ñ£wêA¬„­Sb%ôğœÖA¬$éÓn¤›:ì=—¦vb%ôà™Ú‰•L©dnKN›­E_‰3Ÿ¾›Ü¿zı8yŞ}#orö‰2¢wû=¹úïÃş­¦”áş{ oÅ¹ı ¯ôíèCGgŸ(z|ÛïîÔeş¤ŞÏ·“‡ûgú˜y©iÿşDã«¿ÁwÕz¦RÙÛZ>=^µŞ‹ÇzN›O~ù   ÿÿ PK     ! ³XG‹  '     xl/worksheets/sheet2.xml”š]sâ:†ï·jÿåûÉP!§vÆl¾!ñ‡8	5€9àLÎşûm}Y²^S™½™!º¥–ZênÛzøãïÃ¾ò+9_vé±ãÔnnJrÜ¦¯»ã{ÇY.¼İ;•K¶9¾nöé1é8ÿM.ÎÿüÇÃWzşyùH’¬B=/ç#ËNíjõ²ıH›ËMzJÔò–›Œş<¿W/§s²yåJ‡}µ~{Ûª6»£#zhŸ§ôím·Mºéöó3ÑÉ9Ùo2²ÿò±;]œÇ>ÂäüøpÚ¼'ó$[&çÊÛ.[¤4K§úøPÍ¥^wÔ›åœ¼uœ§z;vï™—Xí’¯‹ñ»’¥§Qò–=%û}Çùw½îTØRü™¦?™hğÚqn™É>Ù2£*úïW"ÄŸ\—–ó/1ë¶#÷NÛÂÔ•]æ¨_BšÂkò¶ùÜg³ôËOvïÍ¤ÉÔ·é,¤+‡s"™tØü-~|í^³Ó¼¹«İşpïšNeûyÉÒÃZp¾¹f½%5Ù©YkÜÜ7›Ö}¹nUÎ—ª»É6çô«B®$#.§Ûn›u'Ì½a½d»íÏÿ¤Ì~f¾T`+c(Ğ„X7O“ı|thå gÏ}ø6l0°ÁĞ#„6ˆl0¶ÁÄSÌl0·ÁÂK¬l°¶Á³^l v+9,÷Z£Ükw~Š¸»ÔîÈû‡Ò_wµ‡ê/Úğ[éê¾”1D,	%êÅ>”p‹C!Q¯ÃÜY½ŒrvºØ®D@Æ@bA~°½Z5WAÙ^gØ\µX Ô§óT¦Ï°©ß% —ÛZˆXHcçä£²Î.t.€¹–»z(a-´‡¶•B­dy©$\0lZ€ú?Šú×â“
CLœâÕmvº’ˆÊöHˆ¤Ä  	D@Æ@&@¦@f@æ@@–@V@Ö@¼ ‰%©ÃA#‡¶É57ë4T£]¶±8/$"IŒLÄÒâ	€€Œ€„@" c  S 3 s  K + k Ï@^€Ä’`~bÅP©;7E—KÒ§€“ÇÌV«˜<úJÈ±‚_"bE½ DÄ
{C)RHS­fÑš‘Êó¢ÑQ,ÊKı%‘–sscIJº`y°¬‘2¡FD¯ş]q¾~±õ¾Ø³VriÉğWÒ-UÏöÄ¥x’[Ñ´V½'Õn<…tzğ%¢®”o%¥
iÅX¢’iXYÿZ,S)«&¼™³2’"Q‘¯.ÍDDC…´#D¡B:¼FˆÆˆ&
éî§ˆfˆæˆˆ–ˆVˆÖˆ½ Š*Ie¬2Ñ7î÷Y c%‹Şm¢¢P¡F¾s#Dã*·µ+¥çÅ*Š3íâ”ÑÄÒâ	€€Œ€„@" c  S 3 s  K + k Ï@^€Ä’”dPV\û./¢è2ƒ·,ÃÌZ³[¿&…ŒE ƒ¢ˆ5ĞPôMıŠÒ¡ÖS(B4FK„»n¡j9/dPIJº¸R•²ÙË˜Â|kbô‹­Vf‹­Ví3-¶Z¹yUh­[ãÆ¬µ47³÷ge»‹ssmº’ğÀÈŸÉ{’è çI¢#—¯dÈÏW3z ÔtODC…t®*T-ÖÜ#%¤ƒÚX!;§ééÍ$ÑFÍ,TGùö]A?kĞzòıÄ’”lE«ü&=ÕÅ«#³QHŸº"Q‘(@4@4D4B"ŠMMÍÍ--­­=#zA+„eHUÙF:¸æ~
êMğ•ò».Šm}º’èƒÒâéñ@’ğ|ÇÃÉHmOZ1	)9%µ$˜ÇÙKxÓqy	Fç’ôŸBs3[?Š™¤/…š:ú
éc(¤ÃÚ@"XäÂÛ„R¦`ÁİmÑ‚‰ê[[0UH[0SH[°–¨$´ı%öS]–ØÚ‚®BÚ‚"Q‘(@4PHOp¤¶+THÛ!#š š"š!š#Z Z"Z!Z+T¬‡ßG¬äû –ŸQ"ê°Ğ­b†)›x Óâ	€€Œ€„@" c I0t¸W
XÎE#yÌhX%¹/å©Ìe¬Ú?(±jÿA‰ˆ5P(E´‡" I0
¸V­}mK©Âå‹ßÒ§­‡ÈCÔGäKDêy$@4@Å!¢¢P!½¿#Dc…ô„&
á™t­šş›ô¹<- N	¢P!]GTxÁ¿³«CN/s_‰bTO¶Ë%;Ş*= >H d dd$IRrPÍâÌœ¶x5jäx×|diXÉ½ÇZéq­aT×:dRÓ/öj½ ¤‚ŞCÃ‚|Ó:è#5€ijËzº
•vi$QÉÉ6+QsyD%ª—§ç
Ò0K ¦U€xZH-@$QÉĞfõem×>=WâĞV˜ô´Zè•mV54ô7Çñ‰î¤ğ‡:àtÒ®ë!òõùâ™Ñ@T"!
±K6|B%‘Ê¬´W|ºÿÃ5Ìˆd"kÄ"qëåœßù%ŸKe›~)¿ÑïãCÅİ"ªYÛ¬"%§Y-İZ³Í>#`UÚmVGcíÒ6Û„e--j)×iPAbY@Ç­ÍNöFß2ÚìKEIK½ŞfïE°…^´Ùkj©æÑ-%v%+ÜœßwÇKeO×¨è¶Ô¹ç,î3ñßtÁŠS:‚¦İUR}Ğí±„>´ßŞPKÓLıAƒÈ«^Ÿ§Êe»ÙÓ%¯&Å®ô¼£KbünXÇÙÓ%6j;%4Z{÷ÚqÎÁ+ßÏÕü*Ûãÿ   ÿÿ PK     ! ;m2KÁ   B  #   xl/worksheets/_rels/sheet1.xml.rels„ÁŠÂ0E÷şCx{“Ö…CS7"¸UçbúÚÛ—÷ı{³eÀååpÏå6›û<©f‘,Ôº…äch°ğ{Ú-¿A±8êÜ	-<aÓ.¾šNNJ‰ÇX±…Q$ıÃ~ÄÙ±	©>æÙI‰y0Éù‹Ğ¬ªjmò_´/Nµï,ä}Wƒ:=RYşì}<n£¿ÎHòÏ„I9`>¢H9ÈEíò€bAëwök}¦mÌËóö	  ÿÿ PK     ! Ä,Â   B  #   xl/worksheets/_rels/sheet2.xml.rels„ÁjÃ0Dï…üƒØ{$;‡PŠ%_J!×&ı E^Û¢öJh·%ùûèØ„BÃcŞ0]Yõ‹…c"­n@!…4Dš,|>¶¯ X<~I„®ÈĞ»ÍK÷‰‹—Zâ9fVÕBlaÉoÆp˜qõ¬SFªdLeõRc™LöáÛOhvM³7å¯ÜSå0´ N×\—Ÿ»Ó8Æ€ï)ü¬HòÏ„É%’`9¢H=ÈUíË„bAëGö˜wú	ŒëÌİsw  ÿÿ PK     ! 4¡	’Â   B  #   xl/worksheets/_rels/sheet3.xml.rels„ÁjÃ0DïüƒØ{$'…R‚å\B ×6ı U^Ë"öJh·¥ùûêX›BÃcŞ0íé{Ô‰,ìu
É§>R°ğ~»ì^@±8êİ”-<áÔm7í+NNj‰Ç˜YU±…Q$a?âìX§ŒTÉÊì¤ÆLvşîšCÓ<›òÛİÂ©®½…rí÷ n\—ÿw§aˆÏÉÎHòÇ„É%’`yC‘z«Ú•€bAë5[ç'ı	L×šÅóî  ÿÿ PK     ! C–£Â   B  #   xl/worksheets/_rels/sheet4.xml.rels„ÁjÃ0DïüƒØ{$'”R‚å\B ×6ı U^Ë"öJh·¥ùûêX›BÃcŞ0íé{Ô‰,ìu
É§>R°ğ~»ì^@±8êİ”-<áÔm7í+NNj‰Ç˜YU±…Q$a?âìX§ŒTÉÊì¤ÆLvşîšCÓ<›òÛİÂ©®½…rí÷ n\—ÿw§aˆÏÉÎHòÇ„É%’`yC‘z«Ú•€bAë5[ç'ı	L×šÅóî  ÿÿ PK     ! dó4"Â   B  #   xl/worksheets/_rels/sheet5.xml.rels„ÁjÃ0DïüƒØ{$'ĞR‚å\B ×6ı U^Ë"öJh·¥ùûêX›BÃcŞ0íé{Ô‰,ìu
É§>R°ğ~»ì^@±8êİ”-<áÔm7í+NNj‰Ç˜YU±…Q$a?âìX§ŒTÉÊì¤ÆLvşîšCÓ<›òÛİÂ©®½…rí÷ n\—ÿw§aˆÏÉÎHòÇ„É%’`yC‘z«Ú•€bAë5[ç'ı	L×šÅóî  ÿÿ PK     ! LZ*zÂ   B  #   xl/worksheets/_rels/sheet6.xml.rels„ÁjÃ0Dï…üƒØ{$§SŠå\J ×&ı U^Û¢öJh7!şûèX›BÃcŞ0Íñ1Oê™C$]Bò±4Xøºöo XunŠ„d8¶»—æ''¥ÄcH¬Š…ØÂ(’Şa?âìXÇ„THóì¤Ä<˜äüĞ¼VUmòo´+§:wò¹;€º.©,ÿï}<~D›‘ä	“r Á|A‘r‹ÚåÅ‚Ö[¶Íµş¦mÌêyû  ÿÿ PK     ! k?ûÃ   B  #   xl/worksheets/_rels/sheet7.xml.rels„ÁjÃ0DïüƒØ{$'‡¶Ë¹„@®múª¼–Eì•ĞnKó÷Õ±6…‡Ç¼aÚÓ÷<©/,YØë’O}¤`áıvÙ½€bqÔ»)Zx Ã©ÛnÚWœœÔ1³ªb£H>Ã~ÄÙ±N©’!•ÙI%˜ìüİ4‡¦y2å·º…S]{åÚïAİ¹.ÿïNÃ=“ÿœ‘ä	“K$Áò†"õ Wµ+Å‚Ök¶ÎÏú#˜®5‹çİ   ÿÿ PK     ! àñ—"<  "K     xl/worksheets/sheet3.xmlŒœÛR#9†ï7bßğı6ø8€‰™¶Ëup¹|(Ûà;˜nb ³àî}û•JÊJ)yºofèO™©sfJU®«ßş~y>ù¾{ÿxÚ¿^7šŸÎ'»×ûıÃÓë—ëÆ²ŒşsÑ8ù8l_¶Ïû×İuã»Æo7ÿş×Õıû__w»Ã‰²ğúqİøz8¼õOO?î¿î^¶Ÿöo»WUò¸ÙÔ?ß¿œ~¼½ï¶•ÒËóiëì¬wú²}zmı÷_±±||ºßö÷ß^v¯cä}÷¼=¨ö|}zûhÜ\U5LßOT7v“í‹jõB7´©ŠŞ¶_v‹İaù¦ŠŸå~ª€êwãôæêÔêİ\=<)ãzDNŞw×Ï­şæ¼£E*‰ÕÓîÇ‡ó÷‰Š?÷û¿tAòpİ8ÓmØ=ïîu£N¶êßwŸwÏÏ×?Zj4ÿ[ı£Õÿı÷ó.W¬µ©nQ5‚ª½»Çí·çÃ|ÿ#Ş=}ùzPÍ®Ôï÷Ïª9ê¿'/OzU/Û¿Í?_¯İOçÍ³Ë¶ªîäşÛÇaÿ²6¼êw­ÙêYMı‡Õlv>]t»ŞEX÷ÔT^Ë`{ØŞ\½ïœ¨™Ô}ÛêuÑîks¦¹Ÿ´•Ã×§û¿şØëöëŞ[…¶¯ :¤Í|ÖXµ_V``@¯C	"	FÄ$¤dŒ%È%˜HPH0•`&Á\‚…¥K	V¬%¸•àN‚çÕjUVÏZ'<k_7.êIĞ<W³İĞ{ôûÍyóêô»Zğ÷vfGVÆ1J´|	J´}‰ÌH´šN5çÂÊ¸–¡U—™ )€l¹„QS›Àİ´Ö5vGmc ê«ıÒ×ØÕ(ÀÃ-bc¤Ñ¸š£q=ã¸ã(¦kˆb #”­4ØJ–ÿBC¨±ÛÊ¨éëóOdW‹+uÆ+ÚãAµ«‰€Œ€Ä@ )ÈHd¤ 222² RYYY¹rdcI6šš0o™›fCMµ C«â^ ²Ä‰D@" # 1HjIå«08¶„cZ )™%\×Â®«­%•kçÔ:A	±æîæT’jÛ)'À~¬ã;ô!‘·,ê(ÿ[ëµ…g‘w+µ¨òv˜e›r®m_Ï7CK8$–ACÂA®\Cş êˆp€M©¹È’®Ú
õ`œwıA‘Pµ…ª®§¹ƒ!mçVF4ı„ï‹Ñ”şÌ"®oa	÷¥´Dõ…ê[â–¯\Kş é€ìÚ1w@^¿i87 ²ÄÌL£Öå&¥V;7¶Ä	)9!)D¢)¢!nÃ‚^Iˆk\"Zªlùz$“Q+G–øw.Î¨yw,jI‚*îz‘È¿êYµI‡¼ªeHÚ¹Ë¨^.&Yq—‹!]µqxï]Êª­o¢¸ªA¢ÜìêâÌ×K­Pµ¦üYÉÑO—¹I’œ¥8hZÄcˆ(B4B#J¥„‹L‡÷_ØµÄ["ìÓUÜâ–°³‰€Œ€Ä@ )ÈHd¤ 222² RYYY¹rdc	2õ6p@=š»[}PIŠ„¡)·:	9{RÄï8 ""sFfEôÿêİß‘wÌBÒrDD¢EèZGR®Š»#¸±$`âHÂÑ’IÁ@“º¿Máíb¯´%|Zî—Ši™ù¥bFV~©˜Œ.U‹%Ğ1‘Ô«KÿAË©CKÚu:Yâør’Q^¬•®X	©±¥”‡ëœjGmª'òá		±O+9Ù–EÜ—¹%Ü‚’Õı]5hİ¹;KÓs$ÅhÉccIÀ„H~õ}¥8írâ!¢ÑQŒ(A”"Êåˆ&ˆ
DSD3DsDD%¢%¢¢5¢[Dwˆ6„0h‰tíØô;ùƒH j—`²"ŞFƒ–!¼×†@" # 1H
$2’™ )€LÌ€Ì,€”@–@V@Ö@nÜÙXÈDYO§¹7â|}Ğ2Ä»pèÉã	9NXª8 "¢U!+³":ª³»‘cÌBœ?˜^(=B”*m,BÚ>’PWÜË,	˜8’Äµ!‰Ó„û+Îˆ±_*r»µ¨şHÔ–<KÚjëVÈx=´B–!×1›¢‰HHŠSB¬¸±(Ğ‘…óe´ÄÛ&ëqv„xuEˆFˆbBìD)¢Œ7bŒ('Äîu‚¨@4%ÄægˆæˆˆJDKD+DkD·ˆîma(k‹\õ'ÓWòê<Ä«-A”"Ê	q;ATxÈ»‚hÉÚ*îÀ-á)‰€Œ€Ä@ )ÈHd¤ 222² RYYY¹rdc	FĞ¶È k÷b2e'‚V’ò.Ûˆ„+#h@DFĞ€ˆ¨(³"ÿAYˆ¼th‚¨@´±(à¸EZ ¹üãÜ´	˜8’•¶MÊ&šÔ±«)ˆ±_*ò‰Ü/¹ÏÌ/±yå•¶D½]<ëPºß©¸›],áSëĞvp‘%ì¹b’ù§ˆ[Je„8Vç„şñPNBìæ
B;gq÷æ–p£@J2Tg{+°³­[ w`gc	.ÅÈ‡>WòÊ+ğ°qˆ"ŠÅˆD)¢ÑQh‚¨@4E4C4G´@T"Z"Z!Z#ºEt‡hCÓÈåM¿ò§öí®Î‘ô»â^>`	o”!ÈH$’É,Á¨2}ÏG9]&W^‰xîÊ}·U»ã£¬P`“‰d¯®Gs·L?èzÖÎ‘4¬â®‰&u;"(­¼óÜ5"ÄÎ*ömˆĞ‘‚Èº"y®JIˆ½wfQ`|DRâL‰÷a=nx­×±ÈuB€"”!Š%ˆRD¡À>IÃ±:ûìHĞ1±—cÍÀwŸ&‘•©vCõR@v°“ÉÀNv& U ™‚9ØY€V	d	vÖ`ç´î€l\;Şñ§s$£©¸z®ën¶‘'¬º„¢|tˆ("S<]#”ŠIÊ«PìîõRD™â
Ç(•“”W¡pÔ+MÉW8'äYYèM•ˆ–dŠ­¯	yÖÅÓ-šºC´±–~!”ëV\Bg‡Z¤âC½qYTÕdö(šJHM¥„ØT¦r45!=6UbSS05gSÇİÿ‚,±ñ’_‚ñõ¯¿%Klüß¸Æ½=İıÅ¤‡ÂM%ïç¼„œpƒ("äDVBÜÎ„ÛJe„ØVNˆmM±­Ñ”Ûšb[Bl«D´$Ä¶Ö„ØÖ-!¶u‡hC¨²åO™È:?õ›:ÁíiîQİİi»a¥{İ`‰$@R ™%"rK¸…Ğ*€LÌ,aËKØr	ZK + kK*Ëş4‰D×™¦z3ÉœwĞ5ÄÏ­ÅË™bç˜[Â—%Kº*ï«óÒKq×T°ùâ)¢™EêQ$I-,âúJÖsê‡‚%‘¥¢µE¦>HU®cÍİÄ?S§>;Tñ#·„›<±Ä}.#îëŠ€ˆÃi@Dt{fEx¾–pcÊ€Ñ˜e@D4fY[‘@×Gç…´z‘š£·uà/*ñ²ËP—ªÉĞû¢^yòD‘Ÿˆbßªè|B
ìGSBìm3‹x¤sK¸õ3Y€ÌÚ•ñWà/]êÁ3×îQ×"vÿCD¢¢Q‚(E”â±Ë	ñOqSDSD3Bl~AˆÍ—„ØüÑ
ÑšP 6Š“¢ãt½Ó³ò?ö§{äPSqïÇvƒC ‘%yK8ò¤ •ÉL€@¦@f@æ@@JK0îõœ*®T-ÿÚ/\ÊS"	9ƒŒ(B4"Ä=±ˆIªI]wG†U+¯¯k!ùûŠ1Q›øVÅÉª°
¼Æg|W¸ğ9U ºòm¸	ñ*-B¿Ş>¹¦Š»As`‰Ûá†‡Ñ( "bĞÈŠ°›N,á¹Ê,ÑW—õ8tE¬³ÍFéÚö\wO¤Íõ8hîÃ¨’´/UVÉCb‰Û<£å7OŒÖØª)!nÑL“ÈÑy®ºÙ&Sw#KÏ"^kCD¢!ngBˆİuJˆÍgˆÆˆrD‹ÔËÑ42¢)*ÎÍ-•„0fô'êGbFÏËCõã«eò¹â^Ì°Äug&3eÌH$’É€Œä@&@
 S 3 s  ¥%(âe£ÎC6Ú3Ä{»íR\–V(°í¼„Î©Çdi¼ã=›·q$/-
XõÒÇª¹Œf«Ã"µ»WŠ#]ª|“÷“?bâ%•rãƒ1h«— 9mÕÜõ‹eÏ4qî…|6Qq×ÄPî®¸ãYùî.	9İ%ät×¢@[½pè´Us·­å¹!^$qLÈH2<W„»+Rƒ‘.•³{)²’˜„ÜîZ=înf¥¼WBšg"\–V*Ğ#/ø8=2…×kynHÀ„çEÕ4ù6ùJõéİy7~â 3D!!Š%ˆRD¢1¢ÑQhŠh†hh¨$ä„4óµóÍ’—İû—ê-ê›1ß^Õ:T¯àİ\ÕØ|Fù˜¾ö*Ë’ó³~¢öQ¨¤¥Jªj…ºwêë;$ÔùÜ;ëë,K2U¢ój,Qw	}}U€%ê> ¯/ °D%Ğ}c‰J)U=Õâ­Îz-UêºàïëËz´¦nçûú¦K>«’a°$V%úê¨g}ıÄKÔÍZ_ß’a‰úr_ÿäKÔ/Šûú'ÄX¢y÷õCn,QO²ûúA5–¨~ûúuŞPÉe_¿<„%êı¡¾~KâV§¯„%ê‡@}ı£,Q?}ïë_¶‡JÚª$ÔSõ£fU¶ÖU%¡ª·¤ûúçP==¥ZoQó\•˜¦^VêËEú›LùöıËÓëÇÉóîQí¾³O*ƒx7ß8ªş>ìß*ª2Â?÷õı"ú×WõA©úøÆÙ'åm÷ûıC5Ì~ëéÛÛÉÇıöY}åI?hß¿?©ïFUŸ‹ºn<«ïZ©²·ª­ÿôpİxOªUZİêæÿ   ÿÿ PK     ! ºNÈ  ñP     xl/worksheets/sheet1.xml”œÛrÛ8†ï·jßÁ¥û­³£Š3µ‰G‘ÔÉ²­;­$®±-¯­$³o¿`ıCöÌÍŒó¡6@÷OHâ§ßş||8ù¹{y½ß?]´ÚÎZ'»§ÛıİıÓ·‹Öå*ú×yëäõ°}ºÛ>ìŸv­ÿí^[¿}şç?>ıÚ¿üñú}·;œĞO¯­ï‡Ãóèôôõöûîqûúaÿ¼{¢–¯û—Çíşùòíôõùe·½«;=>œvÎÎ§Ûû§–aôòWÆØız»ïo<îz—İÃö@ş¿~¿~m}şT_aörB·±+·äõR9Ú¦¦çí·İrw¸|¦æ¯÷‡Õ~F€î»uúùÓ©é÷ùÓİ=®"rò²ûzÑúÒmÎk“Úb}¿ûõj®¢ş>9ìŸ§»¯‡/»‡‡‹Ö¿ûƒÖ‰
Îïûıª9½»h)¯v»[åæÉ–ş÷s§Í¿ô‡àÿêëô‡£ràø¢º[¿Ü«FuPéîv_·?‹ı¯dwÿíûî¤¯nåvÿ@ÒOïÕ´vZ'Û?õ¿îïß/ZıÃöÙÇî°ß:¹ıñzØ?^i^_¾éÙ¡›©{ª?LÏvïÃy¿ßœ‡ûê‹×¡oÛÏŸ^ö¿NhrÉ‰×ç­Z*İ‘N»ûArø~ûÇöÊå¾éĞõ;Ğ©a¾(Lş×÷©ÀXƒA&DÄ$¤däL%($(%¨$˜I0—`!ÁR‚•—¬%¸’àZ‚	6UÔOiÂšYë…gMá‹Öy3IcÚ´üiÚÕ¶ıùùìÓéOíÖÌtlL‹¶o‘ EÇ·HÑ¢ë[äÚ¢Óv.3èû6ÓÆFm.µè
 %
ÈF“4ÚîŞ°K]a7h°?m§P…İşcM´{ş=&n›¸ÿÂmøıænÛĞo[»mÑqCäŞŒÊˆN¢°ÁPØ»:Í’šhĞm@¤A¯‰±øè„¡/î55x˜Ì³fœÂšÎ&œÏÒØp^ªáÔ5×„oa¡_{)ÁÊÒø²–c\É.×ÜÈ16àT¨ê˜
…İ©Øh€ı)Ğnÿc9ßN±2§À¢«’Úx H$’ÉL@J 9%K k W@®Ü ÙR¯V/åÓ„ı¥iæÒŞ¦lë.» jîwCxM€D@b 	H$2R )T@f@æ@@–@V@.¬\¹rdcÖ|%0ƒÓ©¸›(Æµ%mqJ8Mæ<÷‹FlmY÷&²ğLdå7&o—~6jj?¢Q…hcæÉ¶RSD[s7€CC(mBkGyµİ²õÑ~â5¶…"+üV1+s¿ULÈÚkíˆª»Q­´T÷uDÑ“\[šp5.§‘!$°6”İš	šÀvã‘2‹¸X¹ñY`8£U9ÂÀ ¾—…!ìÁÈÊÄâ Æ¹‚^×@n`œ!éQ*ÎYvï•ø¶V}n·È)òˆ"D1¢Ä"eŠ(C”[ÄNLñä•ˆ*D3‹xø9¢¢%¢¢KDkDWˆ®İ ÚX(ıJ9şõéOTâW—qŠ(CTXÄ;·DTyÈ×(G¤l[KW^/cCxŠ'@" 1H
$’™)€”@* 3 s  K + —@Ö@®€\¹²1$ 8”uÖ]# µHu«‘­®âh%·‘SDqK&¢Â¥q¡Ü˜¼#9´7dÄ’PÉCY«
ÑÆ LÜ!ÚmkîICCQñêî|Ùçİo[<)'~«P…ß*æ~«<ğZ;âºÕÔ#z¶ænlÆ†pÂ	.2„3WbmhRkÛGÊå92Ä¢7eˆ5â4WYÄ¹pnßŞÂvj	dej–ïÆ¹‚^×@n`œ!¥(ô{2¤£/]bïº	¢QŒ(A”"Êåˆ¦ˆ
D%¢
ÑÑÑÑÑ
Ñ%¢5¢+D×ˆnm,BÒQON986ı|Ñ9òXQsïÂŞ( H$’ÉL@J 9%K k W@®Ü Ù‚z@} ä.€¦šéÇGÔ–â¢- ¬‘“Ÿ¥˜H=0‘zÀ˜xu
>}`#[éD%¢
ÑÆ @J¾‰ VìÁMG“ÀG4vGklb¬HSùÚòÂkíÈ3¿ULËÜo3²ö[ÅdlTkX(õå¤—&6Z•¹7ftZSú&M¸`F†¸zÀØĞÿš¨À„íÆ#e¹Å_Õ{»ø#Îi•Ê-şÚÊ-şš°KÓÉÊÔD`ms½®ÜÀ8CpİuHÙš»rmcH`!e;ó]-]ı`‘£EˆbD	¢Q†(G4ET *Uˆfˆæˆˆ–ˆVˆ.­]!ºFtƒhcê‡®üÇ¦ŸõC×œ}úüÚ|;AKŞFãÚ’
›ò:âAebŒxCF@b 	H$2R )T†`1îzjÌ‰âî~+Ë&ãuDN½Ö®¬~«ÈôUíƒ9O®gæÆ‘4‹ŞÙP×Ó‚¿pÄ\[ÒX(²Û¢|MŒQ“b„(¶ˆswj‘{TÑ.³F\tr‹ê´¦¿`¥©ÆÑ®¨w%Y]QHÀrb$VÑÕ¤G[Š/-½K6âKë~K{ÊÄ¹´T&ã®9qTP¨VZ~¾câ´¡d#vL÷8¦ôB#Ç´àw5y³*O¬‘›L?N'•±
x£Š³ãÍ±Öd*]Ì½f{0QK‚F'À6¢Ø"®}	¢Q†(G4ET *UaÆïyš6ú‘¯£™hk{Š«¶	¢ÈC^éyƒ×JÍ½çMC8à H$’R§ğ:qLáW@¯Hdddd	däÈÈ•!XšÔæw7‰İ5÷J“Ÿ&D½½›^E¢N&¢H¥‘£3cRow3Cê\WeÃ©VTÑUà"ÂÕË€‰pu0®^ÌLT	½ ¿³×¾Ôö´×¸4-â3A!Š%ˆRD™EüØ2µˆı*,b¿JD¢¢9¢¢%¢¢KDkDWÒ£pÇ¦ŒŠ‚ù¶nïˆˆª¹Ÿà´¬rœ$‘éÅ61H
$’™)€”@* 3CIçˆvêIí4V„w²–‰±#é¤±Msï=©ªÍ ªp6È£ˆÒQµ³¢`fP`ó+õô7dIO«-oóÄ›lb­EˆbD‰Aô™–u=E”aÇÑQa×ÏQe{?³(°…Ê<¶M)KzZ3Ò|‡€
kÅ)¥‡|ñ¢D`3‡ê×u)úÒÓâovlïÛ	H$’ÉañRÂş”Ğ«22² ²²2÷ßÓš¾š»•|¬H³íz¢LÇÆWMâÛ‹š‚}f/ÂZ |]‘1æÍ8l#\[L„7Ë€‰¸ĞÊ˜`é{ê™‚ô¶ZÿRÛû
Â"ŞQ„(6ÈÉ	Z¥h•Y+V…Eœ}J‹Ø¯
ÑÑÜ Ç¯¢%¢•SMßSÇï†9®í)Ì¼RDsDDKyÙ§ïÉGgûÀQ[myÑr²H$’É€ä@¦@
 %
ÈÈÈÂ@öñ¤œ>8ë»§q=qd“ø­âÜ$U­êœ ):¹o/c¦ÆşMQ#GgTş¨â±lf;¸7"¿9·F\&§jßİ_úZÉºêÅ"ÍQ„(F” JrÒ@†V9¢©E†Qi{_!šYÄ;ohaQ ñx
ùİ0§êG–jµqâ™ZÄ‚¦@4³ˆqæò']£õ(n\ÿŠÓO<Ú†M$’É€ä@¦@
 ¥!„á	Nç¶µŠt5ûlÕê¥„Ø·—7Æ^İ4ZDY§ldÕmîÚ²cj;¼•
kÄSZH	GÄp_‹aObˆ:in¨/¸R6²7T„—ĞÎéğš»B21Ä¿´m)5—6(pé¿©ÀèwÌõä³Ò[Ä©d‚(B#Jr²^Š(Ã9¢)¢‘úav}C˜¼O5%µ½—¼Ry9hpDüÔÜ;V1„3ÎH$’ Id@r S Hdddaæ²’%'×š»;f¬ïRñd’û7åJjŒ¹’û£
I5û+£ÎqÔ…A]êÊõ‰ó;ÏI”+¹»ÔX1ŠĞ*F”XÄi5E”YÄÃçˆ¦ˆ
D%¢
ÑÌ"ökhaQ`Ç»rå0SZ5§£WJP{‚RsKá016¼±# 1HjH`“¨Bm7‰ëœ.à\ÑÆ"¼I„¦Tk]ğÙF”œ8`"
v0»15&õú¯O¢rCŞşÙzW *UòÓ³+ÜĞI14Á=;t‹º3DÍİ5Q„£/}bcÿfŠJŒ‘“¢Rƒ¹%ßuLWB^“!vLèÀXµÒ²xÇ1mä9¦QÀ1·à’cïe¹¡²§‚ëh‹8çLEˆb‹8u$ˆR‹0uİzş†ïœ:†n	s§Aq/uÔ–ŞSH$’É€ä@¦†`ÂQï|	%œš»K~\¿Æ¾¤/bcï®>‘p’€‰H8iÀD$œ©1á„SòfÂ©ØÈ&œ¢9¢…‡¼„3¥Ç’š»¡›Ø>GjÑPWw_iöõ@<¹dÆşÍ}#g_O
8¦êG u]q#Â‰	ÍŒı›ß¶É­oä©AÇdù¡ÌòEØ1±3cÿczPú4Ñ.š©é‡©5wWÃDvL¬ïÌØ“cöš¹EÜP™º™8Ê¶ïÈNz›–LÈ9	Q„(F” JeˆrDS‹œL®_¦ßmõ¸{ùV¿Êë•^7öã‰"LßRşü©Áúb4ñ£œ&‘‚+[ÎÏF*ÔØBg™#uT‰-ÅpD¯’	ğv¤~KhétFêç]¡–ÔòŒ¾8Rß,Ä>IçãH}õ[HƒŒ”Äµ´©¥\ábºÚÇÔRïzÑgL¾©/Pâuè›v£ˆ¾"‡-ÉpD/ò	pŠšú1 …¢¦~_hé©ƒ›@Ëàl¤ÎU°…¢Fêœ	[èá’ú„fšGêùûõıÍPË€Zê‡5ú$µc@¾©“5ÎéÉë =º}êO}N›Ñ[çÔ+öŠíË·û§×“z-½ıî•‘ı~ºúoza^MIü¾?Ğ»çì¿¾Óûwô’Ÿ³¤’¾î÷ûºˆyußç“×Ûí½´Omí_îé5€õÛÿ.ZôšBj{ŞÑÕF÷w­—ô®^q§ÍË
?ÿ_    ÿÿ PK     ! œ½a]  (8     xl/styles.xmlÌ[Ûâ8}_iÿ!Ê;$@‹0ºi¤ÙÕJİ#ík "å‚’0KÏjÿ}ËÎãà€Cè‡&	vÕ©:UåÎìËÑ÷¤Ÿ(Šİ0°díI•%¬Ãl-ùÇÇr0‘¥8±ƒí…²äOË_æ¿ÿ6‹“O½ïJ$Ä–¼K’ı³¢Äëòíø)Ü£ ¾qÂÈ·¸¶J¼½‰q'ßStU5ßvy>sÂ ‰¥ux@¡gOæ³ø—ôÓöà‘&+óÙ:ôÂHJ@> !OÛGi‹ÛsW‘‹›9¶ïzŸéc? ²v¾„~¨`©æùl…[İI×9=ÑveÉKøSá£eX¡ŒH­9¨N\ìïú4M§S7Ms¬‡ÆxÚ	šÄ»c †õã†jŒU`dÔG#ÕÕİş¶!’~|ÃO© ®ÅoAs³‹u y<Öğßx2Öµ	Ì ’u5/w—­Ägİéjğl›Î“Eçd‘ME¨‹!h\Ï+ÊêWUx0Ÿíí$AQ°„)»şøÜCM Æã PÒvZo#ûSÓşqè¹ŒbûB*yQõpİÃbVÙn°AG´±d“°«T àF°qF¿òÁCÇƒGúl>ó“€ØÈİîğgî±’0IB.6®½ÛƒK%ï‘â0ğÁgÉÉŒQiŒBÃ3\í	…«9@ÎsµOo[ê=.]A"
ˆcÜG÷àC’\Œç:çúUX‡~—Rë<—¨È9º œféB‡vs¢¨T“ÔûğŸ»^åNåÔUZÜF	§p¶!œxYn4|#…%iá{Æµœ=yÍæGÑ÷kÓ*¡ÍÕô®1ñêà|³[À’ëJ\£¿·PÀeq‘\ÍÛ!áIù¼ÈÕîlm£âF#¸ºó1à&„q	-©-Ìåê×&›Ãôz<ïÏƒÿvŠ9¶³‡£#é'ß`šËx¼›’_Âº"»L§Óé SªÒRÙ±có*¹ÒÑ)´E¥ÉEoÉŞï½ÏYMàİ¥ôş«çn‘m)@›Lé­´#÷ØŒw§Öğ=J7•N{×èlà³¶&…J	•f•f
•6*¶Mó°<¬+8
•¦Aº
{³BÅ]—öx»âLİ9·„¤í&¿!Wú†ÀòÍQİ]–=–[úÄ!Ûª†¤eÉ¢ÊËå²ñÀÊÕ÷§hÂº(|¦çnmp#P!LV…€Xàœ .û™Š5†Ã(!+©‘(÷W‹q‰%›—ÊõAŠ%[üDÌ:KKZgC¯à•™,ám<2’ßn”kæ±šØéFĞ²Ü4äz%?á²ÌOMìO£òê6tT*İ$NÓëÙs“8Mì2@§é6tl[[dç"5Ã¢f­÷+W,Hi÷ƒÄœóRu?HÌºp
©ŒÅûEPXO×ûù…EUÍ‚ô€İ#q0Ú¥ôHÒz©ÇXbU"Š¸.+EU (rºóÂGË#$Ê/÷& .ÎzI£æ~˜XËRjò[‡$r¯„ZÔ!tÏ,HÔ
£HÔ: HTîÒfX…ˆŞôµæ:¬Ò?‘½ÿ@Gò[l‡4îØ°|&°P
ÁÓa‰j…59¢ŠÃ-u\"ŠÁQÃ+è-·9t>jÇP>”»Zè»ñ×ü«ëùT‡Uâba`FÂ#Vø[¢…Å^}ó›œ¿¿ª”Ş”:mÁ‘s4pr¦r<§v8§8f#á÷ˆ,ùOü–WÙcZ\^ş)ÎÍ”s@ææXõ!Çò{ïzáC@…ærìƒ—|_Zryı9eõ<kõ—û3LˆK.¯¿ãƒùà9SÉ¾Çp’>¥CäZò¿o‹ñôõm©&êb2‘1˜‹×1zY¼¾.§ª®¾ü6á·ÏÚˆzÍw×Q‡Nò´†óş¡ã¸kD¿ƒ6U¦ù[h ä9ö U”›/ŸYrå&…OŞ ØUìSİT¿š:XUm02íÉ`bÁÒĞôWs´x3–F»qvMU4­o<'®<7È¹Êª>’à¶Á%gB‰‹Wüæÿ  ÿÿ PK     ! é¦%¸‚  S     xl/theme/theme1.xmlìYOoÛ6¿Øw tom'¶uŠØ±›­MÄn‡i™–XS¢@ÒI}Úã€Ãºa—»í0l+Ğ»tŸ&[‡­úöHJ²ËKÒÖÕ‡D"|ÿßã#uõÚƒˆ¡C"$åqÛ«]®zˆÄ>Ó8h{w†ıK’
ÇcÌxLÚŞœHïÚÖûï]Å›*$A°>–›¸í…J%›•ŠôaËË<!1ÌM¸ˆ°‚WTÆİˆUÖªÕf%Â4öPŒ# {{2¡>ACMÒÛÊˆ÷¼ÆJêŸ‰&Mœ;Ö4BÎe—	tˆYÛ>c~4$”‡–
&Ú^Õü¼ÊÖÕ
ŞL1µbma]ßüÒué‚ñtÍğÁ(gZë×[WvrúÀÔ2®×ëu{µœ`ßM­,EšõşF­“Ñ,€ìã2ínµQ­»øıõ%™[N§ÑJe±DÈ>Ö—ğÕf}{ÍÁÅ7–ğõÎv·ÛtğdñÍ%|ÿJ«Ywñ2O—ĞÚ¡ı~J=‡L8Û-…o |£šÂ(ˆ†<º4‹	ÕªX‹ğ}.ú Ğ@†‘š'd‚}ˆâ.F‚bÍ o\˜±C¾\Ò¼ôMTÛû0Áz¯ÿêùSôêù“ã‡ÏştüèÑñÃ--gá.ƒâÂ—ß~öç×£?~óòñåxYÄÿúÃ'¿üüy92h!Ñ‹/ŸüöìÉ‹¯>ıı»Ç%ğmGEøFD¢[äğt3†q%'#q¾ÃSgv	é
à­9fe¸qwW@ñ(^Ÿİwd„b¦h	çaä ÷8g.JpCó*Xx8‹ƒræbVÄ`|XÆ»‹cÇµ½YU3JÇöİ8bî3+˜(¤çø”íîQêØuú‚K>QèELKM2¤#'‹vi~™—é®vl³wu8+Óz‡ºHHÌJ„æ˜ñ:)•‘âˆ~«°LÈÁ\øE\O*ğt@G½1‘²lÍmúœ~C½*uû›G.R(:-£ys^Dîği7ÄQR†Ğ8,b?SQŒö¹*ƒïq7Cô;øÇ+İ}—Çİ§‚;4pDZˆ™	íK(ÔNıhüwÅ˜Q¨Æ6Şã¶·[SYJì(Á«pÿÁÂ»ƒgñ>X_ŞxŞÕİwu×{ëëîª\>kµ]X¨½ºy°}±é’£•Mò„26PsFnJÓ'KØ,Æ}ÔëÌ‘ä‡¦$„Ç´¸;¸@`³	®>¢*„8»æi"LI%\ÂÙÎ—ÒÖxèÓ•=6ô™ÁÖ‰ÕÛáu=œr2fË	Ìù3c´®	œ•Ùú•”(¨ı:ÌjZ¨3s«ÑL©s¸å*ƒ—UƒÁÜšĞ… è]ÀÊM8¢kÖp6ÁŒŒµİíœ¹Åxá"]$C<&©´ŞË>ª'e±b. vJ|¤Ïy§X­À­¥É¾·³8©È®¾‚]æ½7ñRÁ/é¼=‘,.&'‹ÑQÛk5ÖòqÒö&p¬…Ç(¯KİøaÀİ¯„ûS“ÙdùÂ›­L17	jpSaí¾¤°S!Õ–¡3•† ‹5'+ÿZÌzQ
ØH)Ö7 ş5)À®kÉdB|UtvaDÛÎ¾¦¥”Ïƒp|„Fl&0¸_‡*è3¦n'LEĞ/p•¦­m¦Üâœ&]ñËàì8fIˆÓr«S4Ëd7yœË`Ş
ân¥²åÎ¯ŠIùR¥Æÿ3Uô~×ëcínrF:_Û*äP…’ú}ƒ©-pÓTpŸlşr¨ÿÛœ³4LZÃ©OĞ 	
û‘
!ûP–LôB¬–î]–$K	™ˆ*ˆ++öˆ6Ô5°©÷v…ê¦š¤eÀàNÆŸûfĞ(ĞMN1ßœ’ï½6şéÎÇ&3(åÖaÓĞdöÏE,ÙUíz³<Û{‹Šè‰E›UÏ²˜¶‚Všö¯)Â9·Z[±–4^kdÂ—5†Á¼!JàÒé?°ÿQá3ûqBo¨C~ µÁ·MÂ¢ú’m<.vp“´Á¤IYÓ¦­“¶Z¶Y_p§›ó=al-ÙYü}NcçÍ™ËÎÉÅ‹4vjaÇÖvl¥©Á³'S†&ÙAÆ8Æ|Õ*~xâ£ûàè¸âŸ1%M0Ág%¡õ˜<€ä·ÍÒ­¿   ÿÿ PK     ! d£ø  c     xl/sharedStrings.xml¬YÍnã6¾è;l› Hœ,¶‹b›¨m91Ë­l‘½Ñ«+‘®H9ë§è±ï×'éP?ŞxH{}èÑâÌp~¿™¡¯~û’g°æ…J¥¸î\_t€‹X&©x¾î<DÃ³_: 4	Ë¤à×Wß¼ï¿»RJò
uİYj½úĞíªxÉs¦ÎåŠ<y’EÎ4ş,»jUp–¨%ç:Ïºo/.Şws–ŠÄ²úºóîİû”"ı«äıúËåÏo;Ş•J½+íE<^Š4fø«U!×,»êjïªkNkŠÇ`N?…ë‹O¿Ø‚!”çGP˜æGÍf\öA­XŒ®DŸ(^¬yÇa`c)O ·Áröu"áŒÄ:Õ¬½®‰xE×zÎmà.‰Ûº]šãMÛå«õØo×>URú2ÏS­9ßZ»Ï-Jgd÷‰=à‡hÛÒ}¢©h`‡©`"Nd»MáŠªƒÊe•ƒl¦ˆNî 88©mVx¾Á3à*}L#tè·láµ®Ù(øìÔæÎùdFè1Åñ«´Ğ#«y±=„O@	€°—™Ó%æxÅ‹˜Í9œ¼9¥÷ÕRwé(9¬\.r•È
w6ø¹¶QªÇ3ùBoÄ
Z•Ú`@šÀG§7Æƒn4˜¿fiÆu×’±P
,)/ªş#b7%+º=äOç§0à¥*HŸL$3l,x•©ÁmJ8S4 ŸÀhq#~`ùêW˜q¦ì<İá#–»Õ£œ²à9†zR~Æb¦Ú¸ajÂîÀµ)¯|€­25}˜2yşsÁ«kˆZ^ãæ4KõÆ˜:,EÒ2İqÜ‚p¸õAMS¼r)é9@´—f™Ë¾Şèî¢Çi@d¸Õ‚™”Dˆ=ƒEô£[‚Ÿ›¡„Úæ½Ê^\GğüX—–à-ñ²øü:—öÑ'I7Ï»›Í†ª}ÂMœ"ØŒ¯d¡)I«ØáS# 'Ê<N…™'ú7eƒõÓç…NŸ°Lì™§½è ÉLnX†êšXÒ«¿bÆ5T'©€Øu±…lQ'oß˜lå_b®õEe}	¹ÚgDœoA/¹@üÍºŒ'’/ò®–ˆ ‘¤€—Ñ<Õ?*X¦‰ Í0-&DƒmBÔçK› 4cÚòœ±€©Sox>eŸ8]!ÆÑÆíÍyÆcµ})T™á ¯ÁÈ%¢Üîi·\c†ç¿ÅÎ'ÿ“/İú…Rœí@WïT=o,1:ÆQe/±Ãõ½›`L?M¦AQ«‡ßÆ£(ì9½˜D~4š„–ÄèÖ’å6 dÕ« g~ƒ[Â°–0nYà¶–
˜™†…ñÖ‹-h˜KtBåòDI·>­Û`R˜ƒğx\ú°]Ì˜Ir\Wèù«9‹ÍxÌÓµ“«E–y‰-z'M›Nìú®àvÛ¦kzÓNW6¹ĞÈ=ÔÉ
DÛAõ @ã¦õ±›â2mpõ#/V+ë)¯L‡İ`>ê“û½)§›£;ûƒSãyÕÓ±~çfKçÀÌ¼9e›jì8ƒş’	&´$7î±¢nˆs´ÃDhÃQlíu‘éëU„bûjDe•ë›7ãÜè×¦$ÔW-OÎN·6WJ$¦VN®Owq[‚Ûøv~Ä,JÅëRj¿w;· ôÇt`ñîü0E–êãÉCÑ¯óâ\Øï?Q2?I°¾À¢ÔÚPİ6ùñg!_2<×SŒ©´‹Ãïœ›Ñ‘\±GHõ:ãNèP¢£çæ:"Íû„)]ÌWZŸÓÃ;£¯İØæÜ£G²®²dÆñ=Ip¤2ı†¢M`z¾EŸ&uèyË¯Ê…2—•¤Š™™ÁîäÛT—•6	ïF¡•a0´ Ü?PJ·¦şã8#øQ`Ù¿ãÓfŒ	|çË¨ªñ 8ãFg·œ¶Ñ<áÛSËA-Š$Š‚IWAë)öŒ8„óS€K”Üà.†€›‰c½š¹eÄŞ€”·—Ëí„Ép8êü;x˜ÛN¸AŒíO‡Twlw+i	·ø€i‹«7KkÒªæzYuHQækZs+øŠ«‚"ªÌve§Pïë¹a'Ü®|µÌºîus¾^TÛ¡ø¨+£;ÂH*­Rtß„[X9
™Ã¸³“Ë<$«VÄ*%éa›@~ò'î&¯)Eµ 6ƒ9s«…—0ÕÃM<©v„FEy<Çúêùƒ~Ø·ß²ÇÜxGŸœse=ıãQa¥ä¿ÿüMÌò°5´O$½›v¶·W<<ÃWªi7Îm0àäòò¢ZÁXõøÃª©àÕ€ÖÅ?	¼ÿ   ÿÿ PK     ! ßÛ¯1  V#     xl/worksheets/sheet7.xmlŒš[sÛºÇß;Óï á{-S"¥DcùLÛÔâ]^‰¶5‘DU¢ãs¾}À‚¸ü‘¸/‰üãb¹7 ’¿üv:N¾w×Û¡?¯£øî>štç]¿?œ_ÖÑ¿şùô§OÑä6´ç}{ìÏİ:ú½»E¿<şñïıõÛíµë†	i8ßÖÑë0\VÓém÷ÚÚÛ]éÎtå¹¿Úş¼¾Lo—k×îå Óq:»¿_LOíá)«ëÿ££~>ìº/ıîíÔ¥äÚÛì¿½.·èña kÂ¡Éµ{^G_f«mºˆ¦òÖÿ>tï7ë÷dh¿şÚ»İĞí)Ñdè/U÷<üµ;×ÑŸçI4¾~íûobhNB÷t“›"nÒî†Ã÷N‰oRpû¯¼¯øM7wµkd|ş~ì»çöí8ü£ÏºÃËë@¦¤bø®?’,ı;9(Ci49µ¿Éÿßûá•Äfw³Oiœ.ftm÷vúÓøŠ¼½R øÒíãÃµŸP¬gdè¥™KVt«‰ºåİ’~¯‡İ·¿ôÂ¡‚Ìİd”PóE`a°U€¿) .Á“6>È|û ğAéƒÊµlXÊ0‘“£§”r;4ÚS×Ñ'ã)Š‘(¹ïÉç‡éwÊğ¥sçâ'÷b¡TÍ®ÊOg®x­Ä[f‘¸2Ë˜DlùîQ†Cî	l»·U Ç/ÂãvÆ+€ã—îøU»§J¼7qg"‹S•H®ÈÌh.€”0ªRi€l™Ì ±X1ÂQÏ()B3ÖÎ¿_oO,äÉ|îÉFÉ*™Ú5{ëßûIršß´1ŒµŞûjÅ`
x'æ˜åİ¨VÍ=Gmœ¤¾^–
èÅÒ«ŠŞÑ›Æ¾Z
¨iRjbUÍUé[ş<
Jhnê2‹ZÈI K5gdIˆJD¢Qƒh«QÀ]±»‡Ü|ÍçãœÛÄ
-Ì’•!ÊˆJD¢QƒhËˆ¶i±×:ıùÎ	î9§ĞRìşzAoÑÎb%E!°¤æTn¤ôX *Qj©J#S>µF2s²|Ôµe-mÁüJî†€‘_D9¢Q‰¨BT#jm…œ3§3Wg‚{Î)ôA~y —__7R:s¢’‘_¬üjdåum…B`m7j=¶çïL!'¿€r”*•ˆ*D5¢Ñ–QÈ9³u¸Î©MÁqN¡ò«¤Üü&Ş^–ÏF)“_@%K9ùUR©_Fv~A×–u…B`v97jsB “_@¹h!hnXR¢Q…¨FÔ Ú2
9gúP×9Õw:Î)ôQ~•”—_oóÏÅ1É ’¥œü*)'¿Œìü‚®-ë
…À´ÒnTëì„@!+sÙP¨@T"ªÕˆD[F!ç~ĞKÍ¸M²šFå—›)gÿM¼³RÎº¬@ˆJFN~•z'¿ŒìüFèåaËºB!MS ¿š©fjnkÌ¹9C”#*•ˆ*D5¢ÑV#<%StNr:°Q ¬fÊœDœ&JÜR’Œ·ä¤„Z.K‰wæİ°ÔOÏ<™Â3e,tóäŞ™géõ™’µáú$–€1ë£OJ·Xy¨ælŸîá$ÓR½N5z3zŒ ô.É›1V¾¹¹2%W0²N"%¢
Q¨Ñ(`µèš1Ù\uÓ”=‘rFöÔET"ªÕˆFyš8}²‰¬äYj”ÆÈÂ¹ g)oßYºy-Œ”ö·dd/BYM„FÖ"Ä(ä‰3)-O )Îå£J·@T"ªÕˆF!Eß¨ˆDõ£E{ìZMNü‡a«²*©dä[©²W|-e[I…	/^Y¢z<kyÏ52Ë{¨DT!ª5á*„£LroÑˆo1Êµ”µj0²WD¢Q£®‰ÓYuQ.E½:†Î¨D©
Q¨aJ¿h°7	´£J{ø³Ò…Ì:¢SÚŒìu„‘]Ú
…|ï5›Dí5ÖÄÊÙ9JˆJD¢QÃ(d¶Ùl–«x,›M¢6Çl…>JÉ8Ğ¤$öŸ½¨¾DT!ª5ŒÎ‰ÆëÍv.“Üyà‘3²ü-•ˆ*D5¢†QÈF³ÿ¸6âşCË®c´¤õÓì·şãÛÒHéP!ªQ}Ã(d¶XãÕTvÍæµßjRè!7˜­EET²İQ£J#3ÿjÔÕ0
Ùhv×FŞmlrÒ¨LUˆjD£¦£vmTÏì5"UÈ±Q!/ıŞš’’”	í8P£Õ7ŒBf›MÒ5[uìÙ
9f+”ÒcÕ¦Ş«ŒR\¥&6jmb¥‘)›š‘¥½a²Úì‘®Õ¼GšM;§÷ßâîs«ı@T"ªÕˆ¬öC½öVoœOİõE¾ ¿MvıÛ™‚DOıF¬ŞÓi²ª(G¸’Òéw…ººUM=¡g%Ú¼R&K#Mõ´éŒîÒV¤1]‘“ÙCOV5=ÀûĞét%Ÿ¡+	]	yJgDº²šNy+qˆCmtŒ dù¶ÅŸWâB`Ì,&«ÃşÌéJÈjz&FWB¶Ñ»Ç•xµˆ÷©“½˜FN¯iD(ÒOqBWÂcætEZ6¥o#.íKW·×—Ãù69Ò‡ô}Æõ5Wõ…üMŸtHJsğk?Ğú¯Wú ¥£îïh-|îûAÿA&½¿vÃÛeÒ_ô±‰üÆd]úëpmİauØ¯£k¾—OÇ/bÿ  ÿÿ PK     ! 4‡†T
  1-     xl/worksheets/sheet5.xml”šİ“Ú8Àß¯êşÊïó1‰k˜­Ú`ìî;Ëxf¨0xH²÷ß_KêvKj“ì>eòSH-©Õ2zøå¯·cï[}¾šÓ4|¸zõiß<N/Óà÷ß’ÿ|z—ëîô´;6§zü¯¾¿<şû_ß›ó—Ëk]_{`át™¯×ë{Ôï_ö¯õÛîò¡y¯OĞòÜœßvWøïù¥y?×»'­ôvì‡ww“şÛîp
Œ…èüwl4ÏÏ‡}=kö_ßêÓÕ9×Çİúy=¼_‚Çí¡:?>¼ï^êm}ıı½:÷×ßš
 Œ2è?>ô[©§˜Rãïëçiğ9Œ¶ãP‰h‰?õ÷‹õwOüÏ¦ù¢²§ip§<ÖÇz¯ºĞÛÁ?ßêÏõñ8²Á‚÷_mşÊÁ={VêÔÛG¢~ªŸw_×Mó}^^^¯ĞïqÛ«Ùîº{|87ß{µ¼¼ïÔ£Á§ gd?ÜƒŞõõ°ÿòk£”•.*]…Ç‡½2óYái h03`¢45ˆ}ø 5@S«d°ÑÜWYø ğAi ]ÀF+_eíƒ¶˜¸´ÁQsfE“‚£ğ4øØÆbfÀÌ@tÕ²ûö8Ü=ô¿Á¬î)`­…0$5$ä0g†°¯¼U²}\_‹Vˆ|‚”†X¾V†°¯ªU²}…®¯u+D¾6‚l1¾úv„a]vEXa'Â?µ1[’ ¹kIj+eğs,»´Âv$l·4„í®`»•–İ5Za»$lwkˆ¶ëDiâFéÖ®¦õ©Äa—³á½ñÍö$$E¢ ÙÁHØr.´‚‚”HØò
	[®„ÖZ [$Ú²CuxY{ùVacf„ìi+Ppv2£¼ec$>Hà$–ÀI,÷U>(|PÀFW°ÑÊWYû`ãƒ­23ÂâêŒæÎÎEâ%Ç¡›Db–¢,’H”"²rV†ˆ·^ÎzvÖ¹,E‰JD–Ã"vX±ípì:\³9ÜH´EÔ‘)ƒWÜ¸!Vò‰µò4°³%!Şq)"ÎklNjÑÛ³n"‚kz0âMQ/ÇR¸[	w©ıÈİš„Øİ†»Û"’Ùuğ7‹&Ê ZŞÍ¯„¬+Q"QJˆ3aFˆ'&'Äæ•„ØüŠ›¯±ùµD‰¶„d¶¨’ê¥[] [m´MíÀ9Ó’Ó€g;$$EÂùÑ”äv*Ï…ÖBBÒ¶ì9P¤;Ah‡dÎyŞU3-	Cr+È‰›Bb–¢’H”"²rV†h|omÚÁàŞ5Ÿ“v!Q!QIHÈ€:»&ÕÓvChÚ¼2örh<0BNCÄË9E);ùîr”<Õzókè¯ô-:D¼ƒ­´;ã†&ƒC¼qUk’÷²"Ş·1\+µ£D¢”§…ŒÇ1'Ä¶©»­îDGZPõD»nÖ7Va¡ShLàn¥+ÑÏšÛ›w†„Wo,H"H*È\L	'“	§©Rh-Y	R!‘W¨ÎT+tm ÌYkm%-	+f÷à£»Ûc–j“	¢‘}Ø½’4GÄ®@â&œĞ3U’OÙR¢•D!™pBç,·–‹âv•”hIX@°¾¬(}r£”’ï”‘=Zßx‰2V	¶Ddå®!Şs•mÜI¡s ŞŞ9í²Pòî€qz_)RíÂbØ(Ú6ŠUZ;%êA‘Eh)ÑJ¢ŠL¡:ù­ÿ³©åİ!cíàÌqè%úõœ!E=dwœ#İZ_ş‘„†Œ!TíúºË…FmÔæ¨§–x«÷Ñ›¥…ì)AK­¡eìÍed˜¬„L…¤#ÿ¨3Ôšv¡)nG=‡ÊC»s¾L‰2nÁz÷ˆ%KÑ¢ZIT!‚@Ê-uuõÙPvÎÄ#ËÉ™¡wŞ'¡‘ræÔ/RRâ9ÍÙñ{P¢Œ“|ı‹Õ’„ì)4–Fœ+Ûç#LÊOjPÉ»5!Şç±D‰D©Ds‰2‰rBœ‘
BvşÁ®r¿–$Åh%QEHæŸ¡WzÜŠ¬:,V†7ÎhÍb	Ïc,H"HŠ„Ë	O~.´‚‚”Hä¶z*!èí¿^®Í[û{D[˜i¸ÊØEÄ ô*ùIqÇc‰‰RB¹ŒëÑ»<å$Å•„dzªc°M/Ÿ8æx´Ò‹–„ï/vıÄ“-!ÄNq.É°»œÔ~änABì® ÄîJDÚ“K†`Üü­İAç„–ws	!Ş ±D‰D)!N	!N	9!6¿¨¨$Ô‘ÔAfÍø­A[)A¥gK£%íy=ÂÓ’’
2$$GÒ±İÂZÒ&½ò›1áB¯Û:åŞ;Àc¢<AälqÉ !^ˆ9¢…èÜ)­.›o×ÜåÊquœy°÷$%)^\9"é{äì[s»(JLìpBïR–¢”]Š"êğí6–oÿB˜ŒqÆ}ï›„¬a#êpí
–kÿ"”Œq\w¥lßuø¾‘tábåÖ¡	§Z8	qµ6Gôã
…:ú÷ó¢Ú^EˆW,Q"Q*Ñ\¢L¢œÌxPW:ùëç¾ú;”ñ4wŠ $VÆ$$d.H&H.ÈBBR¥ +A*AÖ‚lÙ"‘9y¤†#Ds;ÉÌ¸_~BïÒ¹E©¥{#ùüä¿EÒaâF2ùÉx†Šl:bB¼î‰R‰æeå-$*$*%ZJ´’¨’h-Ñ†g¿-"_•H»Ö‚æÎZ@õÅwCˆsİQ‡£§ËØ?]fH†|VÇ„xg'¥Í%Ê$Ê%ZHTHTJ´”h%Q%ÑZ¢!¾ŸmuÄWoÖ¦¾•W){BIà„x»Ä%¥Í%Ê$Ê%ZHTHTJ´”h%Q%ÑZ¢DêÙ—u¢™g~æ¹Ü[}~ÑOó.½}óõ,¬ßÇ‡›÷P1Fª„ä·Œî"U­uµ EÏ‰Ğ	¡EwH´¡EïT¯e6Fê(ı|‚5¸›Ê¸GêÖ*[àb©Kl²¬éZÙëA"õ‰´C'C‹Şö|ÿÔ×í.{ĞÑDèL@GgÑr-]:IqƒÈÒü¢©G»Z&ĞÒå~&…w™]:Is
õ ´?#@K×Há7HıP!ufƒ;èA×Ú™ĞÒ¥¯Z"õ@EZƒĞÒ¥S¢M§<«€–.„­+³QÏ;¼"xZØÁÇ¼›“¼E›.ùjm´|¿|xi«í–»óËátéëgØ¥w :›7°úïkó®)”©6Wø"Eÿ{…÷Å5<e½û ƒç¦¹Ò Søøë{ï²ßáğÔ›óë×ÃÓàÏœ¡í½oÑáiœ³'¯~ûØùñÿ   ÿÿ PK     ! O—fâ  ¡     xl/worksheets/sheet6.xml”™Is£F€ï©Ê ¸Ç y¡$MU%ÀåJfrg$dQ#	°=ù÷y½ÑËkÇÎÉÖÇ[zyKC/¾ü<½×ºë›ö¼ôƒ«©ïÕçm»kÎÏKÿÛWòÛ­ïõCuŞUÇö\/ıêŞÿ²úõ—Å[Ûıèu=x`áÜ/ıÃ0\âÉ¤ßêSÕ_µ—úOömwªøÙ=OúKWW;¦t:NÂéôzrªš³Ï-Äİgl´û}³­“vûrªÏ7ÒÕÇj€ñ÷‡æÒû«óğÔ­—ê¹ş³¾]:oß_Û' 0K²ZLF©]¦èü½®Ş/ıû0~Œn©“ø«©ßzíNü{Ûş Ö»¥?¥ëc½¥Cğ*øóZß×ÇãÒßsX¼¿™Uø?.à÷è™ªËQè>[0ğ®ŞW/Çáöí¡nŒ›©³Q%ÕP­]ûæÁª…àåRÑ=ˆâ ò=.{uŞ‡C³ıñ{K•©k¡ 2ºÂj±¥fî)^úÌ		×T“ÔÄ7làmt9s»¤xé³Õæ.9¸30fº™¯« š.&¯°V[9ŒQHŒ ’q²ÁOô‘Ğ=ÑVKNbc$DwjöœÌ¢‘A¦#É8aJ†×kÓë{{$GCÅaÏ”áD¶|3!ˆd‚„h?n>73´8–b#f8ĞbÆÄ,fØÌÖ¨@ÜØ*¹
”à@¼sÏƒbcû9°1´q‘Œˆ|zœ¨ ßŒJzĞ¦¯|’¾
DJNA‘äÜ>Æy2‡@3p>7Ç’
!=$R!›	¤2h-ˆ6uA´4Ë¥%•g…DÊx)Î´ 0§úQª1y3×$Ò’#‚Q&Ë7¾Ù©¡o$RæsŒ
ŒJ‰p:ÿ»ĞFáJhÆŒDKiD"™ ZV¢¥5ÒÊ))Á©Ğšï¨QŒ›A>öäAÙQ>JÉ”#Â”‰2ôG7JOw83æJJZ/0*re9í>®à]I¥]ÂN&p^P¹™
dä4×›©ØÍ„”Ò[¢Œóc„Ğ•»£Ç#Z„5w¥îÎè§ílÚT?ÌrÑ	ÕTf_¥aŠÁ(“HÏrd~#¥”ù££R"G–]¢óÃ“^@Ûà¸L38O±ªtÏ¸™åvM…ŒÊ{‚H&ˆ#i+r9æ-j3ÛËÌJ¼$BÊuŠÁ(“ˆ£/¡Ñ ÕB0nÔA ‹Œ´Zqê±NÄ!bÍ2"¸ƒ…F{›åf2y³ƒI¤‚/Åˆ`”I„ƒ/4ZÌû£‚Ò%ßKŒ£­9IP 	9Ñö‚H†È"kD6ˆäˆˆ”ˆ<
‚C?¤mÃúŒ›¡’cÍîÌn
ù™‰v"JH¶ŒŠ”Õ[ÓêZ(¨ÀÈù¹È…t ½¶W)…Ô–>
äˆnZå]ËÃ«¿ê#i(úŞ8Ÿ¹õ.H”\€G®¦¡$¯ŞºkNf†k«èÀ¬_©>ğ(Ãõ'K÷˜ÓTŞÊiÔÖ¥!B££ ÉU[c´ÁŠ9FF%F9
‹Õ£>îjá;Í…q£«	¢Ş[!H&D;»"Ë¤•#R R
‚‹FôNbÜ(‚Xo¦öš’’L0ÊÒÏ®©\Ø(=•†AtcÖ•\II‡F¥@³kd5=™Œ›@%?8^¦BM?ÍJ¤b>ˆ¥+]Cî6‚hGå\ZRo…DÊx)®‘»“úŞö¥ÚÓø¹Êöùn\ªmVfĞ<ÉbD0Ê$Rl-‘šÈF"UxrŒ
ŒJ‰pÎGz„"öáA6Ò»ÆÍxeØÈxAT~§ˆD2Ay©·Í¯İ1’ˆ+-¯Í,I•”Ì‚Q&+KhÁ—ÍSï*i“ˆ-jSŒ”àRÚW&¤Q«—iĞ{gËÆ0åïğ™FÎ4¯ê,rU¥Œ2‰´8âŸïùgğSİ=³Oî½·m_ÎpV€Sìj1bş]?‰¦1­0ô$€'lTÖ¨}1-cXÊ<qé@$€5–µdÃ‡j‡­»¾åaÌcøÂŒù&€Qñ…µ=D7à›E±ıä.&N
¾(¸¼ÌÀ‹ëÉ}pÓW-¬gÖ˜Iñ8GÆô˜ˆŸÀ1t\óLCXIÖl´ÛëIkCÜk70¾'À&£ÜìĞK¢²ê›sïë=DÏô
Â»ãw.ìÿ¡½0
5è{;@‰–¿pŸUÃÕÉô
^`öm;ÈàD\>½\¼~[áÚéNm×Àµ»­ZúG¸Vƒg—¼ÅÍnéwë‹¨Éx¹¶ú  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings5.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings4.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings2.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings3.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     ! ÏàG´Á  ,  '   xl/printerSettings/printerSettings7.binìT1kÛ`}¶’ÆõÒ
Y2„©ØÔÆrÛ­1–’ºH•dã%ƒ‰U¸’‘BbR(ıı!3fìÈÜ¡”ü€,íûT…“Ás'î»{ïÎgùlD8BŠ3úGdØ†K!ÎóŒ¬bìã!+­hO®á>×^– ŸÕ¤2f|†a¹Ì8,k<-„œ–ñLòŸ\©èW±LWñ7í çëE)FïCWØÕjoçŸÿ­-æ«9ñ4ŸµXü8¸{¯–¹í›|;x¯z×q9xÿ’š<;¨ÃÄ+´ÈÕé^ó©³§EŞdÖ Ö‰›Œ]¢Ú9:çDÏôËB?Òp¦2w4S?:a™A`zpÒ(Œ³Q%1\Ç¼N/€Î’ÉqÎ1u¦*k¢›L’ÔNÆáßLıâ{«m İ°ïîş­:İÙbù]£ß–œŠşãÄşz³önó²ıå;9«¨¡Â¤0Õ«ğ‹"*¼G(¼Ş?á9Æ'î µYúÜ7j¸1›á„õc6/v:¬ÅKöv9ãSÎ÷ù	õ}j“eäÄDQ@DQ@DQ@DQ@XF?   ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings6.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings1.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     ! âãaì_  œ   docProps/core.xml ¢(                                                                                                                                                                                                                                                                  Œ’]o‚0…ï—ì?4½‡*Ñ0Ù‡W:MÆ>²»¦}U2(¤í†şûUÄl»lÏyŸó¦ÑüPäè”ÎJcßõ0ÉK‘É]Œ_Ò…3ÅH&ËK	1>‚Æóäö&âå¥‚*+P&,IjÊ«ï©(!šï¡`ÚµiÅm©
fìQíHÅø'Û	</$&˜aätªˆ[¤à=²úRyœ@H£‰ïúäâ5 
ıç@£œEf•íÔÆ²?‹½û ³ŞX×µ[š6¿OŞWËç¦ª“ÉÓ®8à$œrÌ”*Y¢Gô„Öè­#2¸?í0gÚ¬ìº·ˆ»ãµõ·ÜMlT&ˆ$ğ‚Ğñ='˜¤ŞŒzÏ>"ÒÎu&¥i~ÎÙ.ôÜ¼SŞF÷é_xAê‡t<¡£©åu®¦}µmğÿÃÔ·	-tHì Iúú?%?   ÿÿ PK     ! lL“¹Â  ¹   docProps/app.xml ¢(                                                                                                                                                                                                                                                                  œ“QoÚ0Çß'í;D~/¨Z'd\!š©“Æ@$¥Ï®s!V;²¯ìÓÏI$OËÓùşçËÏŸÙã±ÒQÎ+kd:‰IFÚ\™Ã‚¼d?î¾“È£0¹ĞÖÀ‚œÀ“GşõÛ:[ƒC>
-Œ_±Sêe	•ğ“ › ÖUÃÒ¨-
%áÉÊ
ÒY£pD09äwõ¥!é;Îüß¦¹•-Ÿßg§: s¶¬k­¤ÀpJ¾VÒYoŒ’£ÍèPd.ùáxÌèpÉR)4¬Bc^íÑk‚=ƒhMÛ
å<gÎh]äÕŸ`ÛŒDoÂC‹³ pJXmY¿èb]{tüÕºw_ g4ôÉ.ÖcuÏº‚ŒÛ=HÆˆ™B~Sl…ÃÄCâ¡çíq¤5èDwÀ!ä7MvûŸ«ä¦¶^şŞn^“İM1Í6»ÛÛ’ªÖö-óFÜ¿ü­õ±çZ+/'á^Ãìyùw)I[k§Ãİ#“>ÙòK™wÿRgöI œ¯}œdi)äaRÎú5ÁÃ;İ6Y•Â ?×ü+´Cºï_"ŸÎ&qøºÙ<ç½¾9ş  ÿÿ PK-      ! íú¢  4                   [Content_Types].xmlPK-      ! µU0#õ   L               ±  _rels/.relsPK-      ! ÉöT‰'  	                 xl/_rels/workbook.xml.relsPK-      ! ¯Ù¹N¼  S               	  xl/workbook.xmlPK-      ! –6"ğ[  wP               í
  xl/worksheets/sheet4.xmlPK-      ! ³XG‹  '               ~  xl/worksheets/sheet2.xmlPK-      ! ;m2KÁ   B  #             A$  xl/worksheets/_rels/sheet1.xml.relsPK-      ! Ä,Â   B  #             C%  xl/worksheets/_rels/sheet2.xml.relsPK-      ! 4¡	’Â   B  #             F&  xl/worksheets/_rels/sheet3.xml.relsPK-      ! C–£Â   B  #             I'  xl/worksheets/_rels/sheet4.xml.relsPK-      ! dó4"Â   B  #             L(  xl/worksheets/_rels/sheet5.xml.relsPK-      ! LZ*zÂ   B  #             O)  xl/worksheets/_rels/sheet6.xml.relsPK-      ! k?ûÃ   B  #             R*  xl/worksheets/_rels/sheet7.xml.relsPK-      ! àñ—"<  "K               V+  xl/worksheets/sheet3.xmlPK-      ! ºNÈ  ñP               È:  xl/worksheets/sheet1.xmlPK-      ! œ½a]  (8               K  xl/styles.xmlPK-      ! é¦%¸‚  S               •Q  xl/theme/theme1.xmlPK-      ! d£ø  c               HX  xl/sharedStrings.xmlPK-      ! ßÛ¯1  V#               r_  xl/worksheets/sheet7.xmlPK-      ! 4‡†T
  1-               Ùg  xl/worksheets/sheet5.xmlPK-      ! O—fâ  ¡               cr  xl/worksheets/sheet6.xmlPK-      !  .À©Ã  ,  '             {y  xl/printerSettings/printerSettings5.binPK-      !  .À©Ã  ,  '             ƒ{  xl/printerSettings/printerSettings4.binPK-      !  .À©Ã  ,  '             ‹}  xl/printerSettings/printerSettings2.binPK-      !  .À©Ã  ,  '             “  xl/printerSettings/printerSettings3.binPK-      ! ÏàG´Á  ,  '             ›  xl/printerSettings/printerSettings7.binPK-      !  .À©Ã  ,  '             ¡ƒ  xl/printerSettings/printerSettings6.binPK-      !  .À©Ã  ,  '             ©…  xl/printerSettings/printerSettings1.binPK-      ! âãaì_  œ               ±‡  docProps/core.xmlPK-      ! lL“¹Â  ¹               GŠ  docProps/app.xmlPK      ®  ?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         <span
            style="
              color:#078c63;
              font-size:18px
            "
          >
            â‚¹ ${money(
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
          â‡© DOC
        </button>


        <button
          class="btn secondary"
          onclick="
            deleteChecklist(
              '${checklist.id}'
            )
          "
        >
          ğŸ—‘
        </button>


        <button
          class="btn"
          onclick="
            finalizeChecklist(
              '${checklist.id}'
            )
          "
        >
          âœ“ Finalise
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
      â† Checklists
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
              Next â†’
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
     TAB A â€” REGISTER DETAILS
     ------------------------------------------------------- */

  if (state.checklistTab === 'A') {
    const fields = A_REGISTER_CATEGORY_FIELDS[data.type] || A_REGISTER_CATEGORY_FIELDS.Contractor;
    const controls = fields.map(raw => {
      const [key, label, spec = 'text'] = raw.split('|');
      const value = data.register?.[key] ?? (key === 'prepared_by' ? (data.file_details?.prepared_by ?? '') : '');
      if (spec === 'area') return clArea(key, label, value);
      if (spec.startsWith('select:')) return clSelect(key, label, value, spec.slice(7).split(','));
      return clField(key, label, value, spec === 'date' || spec === 'number' ? spec : 'text');
    }).join('');
    return `<div class="contractor-style-scope contractor-tab-a"><form id="clForm" class="form-grid three"><div class="checklist-section-heading contractor-style-title" style="grid-column:1/-1;font-weight:700">${esc(OFFICIAL_CHECKLISTS[data.type]?.title || data.type)}</div>${controls}</form></div>`;
  }

  /* -------------------------------------------------------
     TAB B â€” FILE DETAILS
     ------------------------------------------------------- */

  if (state.checklistTab === 'B') {
    const file = data.file_details || {};

    // Manpower B. File Details: fields and conditional details from the supplied form.
    if (data.type === 'Manpower') {
      const saved = (key) => file[key] ?? '';
      const panel = (title, body) => `<section class="contractor-design-section" style="grid-column:1/-1;margin:0 0 24px;background:#fff;border:1px solid rgba(226,232,240,.8);border-radius:16px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,.04)"><h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 16px">${esc(title)}</h3><div class="form-grid three">${body}</div></section>`;
      const statusGroup = (key, title, details = '') => {
        const status = saved(key), detailId = `${key}Details`;
        const buttons = `<div class="contractor-approval-row" style="grid-column:1/-1"><label class="contractor-approval-label">${esc(title)}</label><div class="contractor-status-buttons" style="display:flex;gap:0;flex-wrap:wrap">${['Yes','No','NA'].map(option => `<label class="choice-button ${status===option?'selected':''}" style="display:inline-flex;align-items:center;justify-content:center;min-width:42px;border:1px solid ${status===option?'#16a34a':'#cbd5e1'};background:${status===option?'#ecfdf5':'#fff'};color:${status===option?'#166534':'#334155'};padding:8px 14px;cursor:pointer"><input type="radio" name="${key}" value="${option}" ${status===option?'checked':''} style="position:absolute;opacity:0;width:1px;height:1px" onchange="(function(el){var box=document.getElementById('${detailId}');if(box){box.hidden=el.value!=='Yes';box.style.setProperty('display',el.value==='Yes'?'grid':'none','important');}var group=el.closest('.contractor-status-buttons');if(group){group.querySelectorAll('.choice-button').forEach(function(btn){var input=btn.querySelector('input'),active=input.checked;btn.classList.toggle('selected',active);btn.style.borderColor=active?'#16a34a':'#cbd5e1';btn.style.background=active?'#ecfdf5':'#fff';btn.style.color=active?'#166534':'#334155';});}})(this)"><span>${option}</span></label>`).join('')}</div></div>`;
        return buttons + (details ? `<div id="${detailId}" class="form-grid three contractor-detail-expand" ${status==='Yes'?'':'hidden'} style="grid-column:1/-1;display:${status==='Yes'?'grid':'none'}${status==='Yes'?'':' !important'}">${details}</div>` : '');
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
          statusGroup('manpower_non_availability_report','Non-Availability Report',''))),
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
          clField('manpower_extended_date_supply','Extended Date of Supply',saved('manpower_extended_date_supply'),'date') +
          clField('manpower_extended_date_reason','Reason',saved('manpower_extended_date_reason')) +
          statusGroup('manpower_attendance_verified_bPK     ! íú¢  4   Ş[Content_Types].xml ¢Ú(                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ÌUËNÃ0¼#ñ‘¯¨qË[¨)G@jù o«‰my·¥ı{6)(*…6EpI”‡gfwÇãîõ¬È£)4Î&¢·E6uÚØQ"÷­K!)«Uî,$b(®{‡İÁÜF¼Úb"2"%%¦
cçÁò—¡…"~#éU:V#Çíö¹L%°Ô¢Côº·0T“œ¢»¿^(y1VD7‹ÿJªD(ïs“*b¡rjõ'’–M
Ú¥“‚¡cô”Æ€Š<öÁ0cè†Böº\t0¢'èAÌ g¹$® ×NÌ54Q•(_"ÍsÀÆT«õ.@¿a~ua\5eu;ß³ˆK¿­cİä¸İ¨ßóÊÊ“˜ËJ×0löÒf”|qn¼çÆTSeìR÷›¢ä»SN÷,¤ÆßRÇÙ_èàˆy
Î£ä@jÌeâiĞ-ÏÈ@í¡Îâ¸±†ÕèØu'ÿDGóÔŞ­˜© ºO|ÒŒöç±7í‘Ú›©°ı@–™V®^ãHYù½7   ÿÿ PK     ! µU0#õ   L   Î_rels/.rels ¢Ê(                                                                                                                                                                                                                                                                                                                                                                                                                                                                        Œ’ÏNÃ0ÆïH¼CäûênH¡¥»LH»!TÀ$îµ£$@÷ö„‚JcÛÑöçÏ?[ŞîæiTb/NÃº(A±3b{×jx­ŸV b"giÇaWİŞl_x¤”›b×û¨²‹‹º”ü#b4Oñìr¥‘0QÊahÑ“¨eÜ”å=†¿P-<ÕÁj{ª>ú<ù²·4Mox/æ}b—NŒ@;ËvåCf©ÏÛ¨šBËIƒóœÓÉû"c&Ú\Oôÿ¶8q"K‰ĞHàó<ßŠs@ëë.Ÿh©ø½Î<â§„áMdøaÁÅT_   ÿÿ PK     ! ÉöT‰'  	   xl/_rels/workbook.xml.rels ¢(                                                                                                                                                                                                                                                                  ¼ÔÍnƒ0ğû¤½Ê}hK·©¡—jR¯[÷ ˜§ÛxûY¬ƒ!UÙqŒ#şş)ÂŞí¿šÚû ƒ•V‚…~À<P©Î*Uö~zyxdZ©2Yk‚u€lŸÜßí^¡––>Â²jÑ£…‚•Ö¶ÏœcZB#Ñ×-(ºÉµi¤¥£)x+Ó³,€GAsó7ƒ%“Lï˜	fõ?u-uş?[çy•ÂA§—”½Ñ‚[rJS€¬?şCŸ Œß6¬æ4|jsÆÀ¡„¼¿Y¹0Û…1[&Z¹0áÂç?/Œ‰]/³Y³qaBÚ1ó4–Ò@öfm,¤àëhOÊ.ÍzNÌ0È#d(]g{íÂ<Í‰AÛÕ´­Ç'éÏ¿íùd'ß   ÿÿ PK     ! ¯Ù¹N¼  S     xl/workbook.xmlŒSËnÛ0¼È?¼ÇzÄÖ°¤­ŠúÇ>3äÊ"B‘I[ößwE#íSOärggwF«Ùı¡QdÖI£šRJ@s#¤Şômõçö;%Î3-˜2
zGïç7ßf±ïÆ|$Ğ® µ÷í4I¯¡an`ZĞ˜©Œm˜ÇĞn×Z`ÂÕ ¾QI¦ã¤aRÓÃÔş‡©*Éá·á»´?‘XPÌãø®–­£óY%¬OŠkÛ'ÖàÜE‰bÎ—Bzbh:¸x°»öçNª>;J'4™ŸE¾X" b;åW(ï“ıÊ‡y>î‘½k	û*êCrØH-LWĞÛ,Go—a’)|]Ğ<Ü!äôöä¶öØ!›Œñ‘q/÷°bïí’¨_pû†“è —í-Kğûõ–/PVF‰J¼Ø…Èú©ã’×r¹^ü*#8zt†ç×ğÇ‡§—çM¹Œğ£w]=/còq^ƒË¦Uæ@ÄiQ“IT7º®{”HyÀås¸¨_Êq‹ÏR‚Ê{Ğ›³O?"tØƒ$¤ĞcÎÇeè`h>šäaŠäó˜ÿ  ÿÿ PK     ! –6"ğ[  wP     xl/worksheets/sheet4.xmlŒœ[S#9²ÇßOÄ~ÂïÛà+àhz#N»î¾âà7ÜİÄ æ€{z÷ÛŸT)U)å_î™—ú§TJJI™)U¹>ÿë?/Ï'îŞ?ö¯W­ö§³ÖÉîõaÿøôúıªµ^¥ÿ¼h|î_ïŸ÷¯»«Öw­}ùÇÿ|şµÿããÇnw8!¯W­‡ÃÛğôôãáÇîåşãÓşm÷J%ßöï/÷úçû÷Ó·÷İıc]éåù´sv68}¹zmYÃ÷¿£cÿíÛÓÃn´øù²{=X%ï»çûõÿãÇÓÛGëËçº…ùû—Ïo÷ßwËİaı6?ùötXíçh”­Ó/ŸO©Ç'ReÆò¾ûvÕúÚn/zF¤–Ø<í~}xŸ˜ÿ{¿ÿÃW­3Óâîy÷`ºprOÿûs÷u÷ü|Õªd»ÿ«•ÒŸM›¦¢kß×Ö¦¢®>î¾İÿ|>\ïå»§ï?Ôã¾©ş°¦ĞO^ÌduZ'/÷ÿ±üzz<ü¸jõ?·Ï.»çıÖÉÃÏÃşåÆòzÈMÍu¬®işàšíŞ§‹~¿7¸ˆ×=µ×&İî¿|~ßÿ:¡)£N|¼İ›Ğu¶»ŸŒ–Ã§‡?şwoúoºÏºaQóÕ`ê=NFÔv«%R2r
J*ÆL4˜j0Ó`®ÁBƒk–¬4Xk°ÑàFƒ[î4ØZp^¯Vš°fÖzñY3øªu!³fAûœfÿªe6ãŸ_ÎÛŸOÿ¤ÿÀS±Œ'¢$r”è„:
”è†••è´½fÎ•–q#cv—Yu S 3 [K.Áj´	üÍáÖºÁ¾Õ¶`}ã@¼Íåêì×s+Cl­4*§9Š)78PnoG5]	J(C§(¡{i%°—&şDL`°ßË­Xÿ2¬Ì?9ÓqòWg²¢™XjÖH$’É@J 1	)9k K + k  7@nÜÙ2éÀF£	–É±i–0Ô¦[X5/Id@r ’Iík‡4f"qµ¦@f@æ@L¤­%ikµÖ@6¾S?f˜%jbÃıÍ;ª%iÛ‘?Öz"BÎ[§Œzä›z]åY2'$Ã*ÕŞ‚Í¬û4‘æD÷…ò|P´d"!qU¤äÆWÑDäˆlÛH-í¤Lú´cœ÷C#fN¨ŞBõĞKF¾1´î	Ë¡í§É¾˜!š;$Æ_0’ö–Ld,+&4×ŞÚ!éùÆ×ÍdÏhÇÜóúmÀ¥)“Ğ˜mL[­/]*¹nÌÄ)‡$¦LÍÍ-’>,ã­’×ˆ6ÕºBƒÉdè`nå”Ih¸sm8[-0Ü±¨}$	ª¹ïER&aÓºi›MËŒ?ò—Q³\l²â/Kú´qdï]ê¦YH6Q^·@‡(?»º8ë•,T¯©pVTrô—ËÜ&IŞRµÉÂH¥ˆ2D9¢QéPd‘™ğş7v­ñ
ûn‚jq&â¬ )H¤ R©€ŒL€LÌ€Ì,€\YYYÙ ¹räÈ–	2Í6ğ@3†û[}TKª„¡­·ºòö¤ŠßyDDEæ""¢2ŒŠEÌÿšİ?P‘w,B.¤MMÍm¡GèI¹jî[pË$¢âHÂÑÑIÁÈf¼måíò ´£|Ú$,UÓ²KÕŒlÂR5[SJ‹%20•4«KÿQÇ	©	“n“¤L<_îdÈ‹5Vé«UP¸j¢©tHÂõÄ!êG£j òá©Ÿ6sÈË¶ÉX®™H–@VNQ3Şè¹Z·@î@Ï–Idz¤bl™DT¨Tá¯â¡¹¯T§}‡¼xˆ(E”!ÊˆJD¢1¢	¢)¢¢9¢¢kDKD+DkDD7ˆnİ!Ú:„ùCG¥kÇ¦ßËTÕ¸›É6u,‘½– Id@r Hddd
dddäÈÈ
ÈÈÈ[ w@¶L"ùƒJ ›é´÷F’¯:–}¼sBV*ˆ¨hUDDTÈªXÄDuq÷*rŒEHò;
ªçĞ¥fˆ¶ŒĞƒv$Ô5ò&G’¸.$q†ÈxÕ1KUn·em‘æd@]}Á3bÒ%#6½Ğñ:a¡DËÔ!‰×¹¨rQ8)©X:$·Œ"ÃPYØ1_æ–x×f=şÑÎ!Y	¢Q†(wH<b¨DT9$#š8$îuŠh†hî¨_ ºF´D´B´F´AtƒèÑ¢­CÊº*Wı‹éÏky:Éj+•ˆ&I;E4PpÑ=’µÕ<83‘)N€¤@2 9H	¤22222² rd	dddäÈ-; [&A»*ƒnÜ‹Í”½ZKê¸
l™ò<¬ A#"ª¡ŠE~AEÈyé	¢)¢¢-£ˆãVIhcA{ù'Üv-‰¨8’•vm**F†4±«­ˆyXªò‰IXªrŸEXªbó&(í¨v·¦4z7¡6v¿Ss?»1‘SkÂD\ÊD<Wîd~ÑWM4•ˆ*‡$VOúí¡Ü	‰››9$±sÁH†wÍD:µ²rŠšlozn Ö-;Ğ³e‚K±§òÁ¿ˆC_kyò
b¶‘C¢D)¢Q¨@T"ªMMÍÍ-]#Z"Z!Z#Ú ºAt‹èÑÖ!LCz*—?6ıäOùí®Ş‘ô»æA>ÀD6J$’É@J Œ€”é>Ê²såµHà®˜˜»­Æ_èÅB‘M¦’½¦Ãıv*ó ;êY{GÒ°šû*F†4}ì© °¼÷Ü5uHœUêP¡£pÈMCú\U:!ñŞ£ˆ}TRâMIğac7¼Öë1ò ¥2D9¢Q‰¨r(²ÏTÒpl„Ş>;’#ôlì•X3bâï3+#$™H¤ R©€ŒL€LÌ€Ì,˜DötwĞº”—T›5cDÂbI°§Ûg*}]ô¬.ZóZr.½	Y¿mñµæ~C&÷õTÀMJßsÚl¹ö™Ú˜	Kõ©Ë”Ê¶S‘rYr†(äëR.¯)§«DT1Å¼~©¬rì¤dO×4õ¾.åæf"åú5G´`™˜ ÈywLôšYVÒç„	Å×tŠ(C”#*•ˆ*FO;$ıš8$ıš:]~TÓO¡fNH¼ÉÜ!qBFSáÖ3¥áş6™w+”)-	L	(ãzT¨@T"ª¦´-ÒZqó9qR¾)¹_¿7%ù¦dä›Ò¢ˆ)MrĞ¼>á™Ò&rl\ô-‰¨Òj¨v”æmşÆ‘pb,1·òŞöUGÆ¤ÏR¡óQ×º–Šô,È\Ïèç¤ÖÿAÓMÌúğD)¢Q¨@T"ªMMÍÍ-ªWcpw×²ã6¥…ÍÙ}?È:¼%YG-yÕ’¥œ I™Ôñº9YíÔ*T¾p€&8Çv„Úæ9r³b/Ô‚™0iüt/A”2¢‡’nûçÚÕB/PU‰¨b„ÛÁÄÊØÈjNÇ,¿m{XˆÎ#®Ï‰CrnOÕmÛÙù;Ê§I”—‰òÊWLÙ@å<^ªİçµ|xáàxäQê8éÜ!égáè*Uá¨LáØpd‹Œ{¬Ùšh&²ò )H¤ R©˜Èî˜0‘Í;…Z3 s &¢yÉÄÛŠ+DkDD7
—ŠŸŞ\¹¨2Ğ¡tÄ$8%\¨W¡*’­4ab<pãè‡{á‹ŸS'%S<C4G´pHbş’Q`C;­Qjƒè&@¡ÉñDW¯á~ÖP,ñm¢e¦,C.AŒšhQšyDDSĞ™¥«$«p…hhƒè&@¡¹TVÓ¬3›ªÈôD#\ª·éSJæ5‰g#¤İ~ê„äÊ%µª³má*ˆ?,¯Y1ò'R÷~2K&ŞÚ[!Z#Ú º	Phß¿™á4v7ò*š0’ ¥ˆ2D9¢Q‰¨rHÌ>qH&gêtu†hhá¨_:ä¯¶ 5Jmİ(œ•Oz.7ˆö^x<’Òl¶&ÁgÄD|g$’1‘1LDs	µ* c  S 3 s  ×@–@VLêqSp~$“¬9¹šôÆ¥\ª;™‘òŒŒ(E”9$®`$¤4¤i»§‚cÅòæE#¤û5!—êNC­*/ŸqÙB‹@¾¯‚Ëµk€BiÓ}G²tB²†VŒj¯Î‡J€k:7Ü #&şø•O""j iDDEÇŒEÄÃLd®*&æ±Jc‡¾
Scr³±òu‡vP™sc{£&Mgç–øİÓ2Ë„İSÖ‹tÏÓvO¥éÇ<WÓm#F–sF²ÖD)¢Ì!q×…CJ‡D}…hŒh‚hÊˆ~¸á,3C4ÇŠD×ˆ–ˆVÕc-<M?3ÌQ,)­yp¤bâ»3›”
IA&’)€”@* c  S 3 s  ×@–@VL"QÄ¤|‘Së¹NGL(ñGq©îçW,ñ&‰µcsñ
£sKü“QD«JCšMk¯µDkrN¤ño—êKfJi“?GÖÁ wB²¤
‡üø`UEúz$:·	ôuÅU\	ù5÷CLbˆWİe,ÿûá:!o¸yÃeékÍ·vìc´WL"*ŒoÖŒ§BG‰ä‚ˆW¥™)Õ³{©²’Ü	ùÃåz2ÜŠ¥‚×ÕÚg*\®X*2¢ øx#²Å[–DT^”¦Y‰^´±7ßHÑG’ê&&A”"Êåˆ
D%¢
ÑÑÑÑÑÑÑ5¢%¢•C^H³¡²ßSzÙ½¯?õqò°ÿùJëRÛ/Ÿl¿NE¿¯fösPPÒ¡’Z9”t©¤¾U%ô»ş¡ù‰>EuUB¿ÀšŸÜc	ı4´Õ—ªı ›Jê•%çTR‡U’wzCó8l‡~74?hÃzshŞÂÇzh^³•\ÍK}XBïõÍ;zXBoÃÍë/XBï¸Í+,XB ‡æY2–ĞQahNXBÉóĞäÆ±’•ÄÆC±fhâÖù:8šû|,É©Ä\Æc	] Íı–Ğ%Õ‰•ĞæĞ\4b
Ã‚<z¬¤C%±ñĞË	CóÖ¡W†æ­,¡†æ ,ùJ¶6gL,¡c#Y4VBOæ©±¾Ñ£wêA¬„­Sb%ôğœÖA¬$éÓn¤›:ì=—¦vb%ôà™Ú‰•L©dnKN›­E_‰3Ÿ¾›Ü¿zı8yŞ}#orö‰2¢wû=¹úïÃş­¦”áş{ oÅ¹ı ¯ôíèCGgŸ(z|ÛïîÔeş¤ŞÏ·“‡ûgú˜y©iÿşDã«¿ÁwÕz¦RÙÛZ>=^µŞ‹ÇzN›O~ù   ÿÿ PK     ! ³XG‹  '     xl/worksheets/sheet2.xml”š]sâ:†ï·jÿåûÉP!§vÆl¾!ñ‡8	5€9àLÎşûm}Y²^S™½™!º¥–ZênÛzøãïÃ¾ò+9_vé±ãÔnnJrÜ¦¯»ã{ÇY.¼İ;•K¶9¾nöé1é8ÿM.ÎÿüÇÃWzşyùH’¬B=/ç#ËNíjõ²ıH›ËMzJÔò–›Œş<¿W/§s²yåJ‡}µ~{Ûª6»£#zhŸ§ôím·Mºéöó3ÑÉ9Ùo2²ÿò±;]œÇ>ÂäüøpÚ¼'ó$[&çÊÛ.[¤4K§úøPÍ¥^wÔ›åœ¼uœ§z;vï™—Xí’¯‹ñ»’¥§Qò–=%û}Çùw½îTØRü™¦?™hğÚqn™É>Ù2£*úïW"ÄŸ\—–ó/1ë¶#÷NÛÂÔ•]æ¨_BšÂkò¶ùÜg³ôËOvïÍ¤ÉÔ·é,¤+‡s"™tØü-~|í^³Ó¼¹«İşpïšNeûyÉÒÃZp¾¹f½%5Ù©YkÜÜ7›Ö}¹nUÎ—ª»É6çô«B®$#.§Ûn›u'Ì½a½d»íÏÿ¤Ì~f¾T`+c(Ğ„X7O“ı|thå gÏ}ø6l0°ÁĞ#„6ˆl0¶ÁÄSÌl0·ÁÂK¬l°¶Á³^l v+9,÷Z£Ükw~Š¸»ÔîÈû‡Ò_wµ‡ê/Úğ[éê¾”1D,	%êÅ>”p‹C!Q¯ÃÜY½ŒrvºØ®D@Æ@bA~°½Z5WAÙ^gØ\µX Ô§óT¦Ï°©ß% —ÛZˆXHcçä£²Î.t.€¹–»z(a-´‡¶•B­dy©$\0lZ€ú?Šú×â“
CLœâÕmvº’ˆÊöHˆ¤Ä  	D@Æ@&@¦@f@æ@@–@V@Ö@¼ ‰%©ÃA#‡¶É57ë4T£]¶±8/$"IŒLÄÒâ	€€Œ€„@" c  S 3 s  K + k Ï@^€Ä’`~bÅP©;7E—KÒ§€“ÇÌV«˜<úJÈ±‚_"bE½ DÄ
{C)RHS­fÑš‘Êó¢ÑQ,ÊKı%‘–sscIJº`y°¬‘2¡FD¯ş]q¾~±õ¾Ø³VriÉğWÒ-UÏöÄ¥x’[Ñ´V½'Õn<…tzğ%¢®”o%¥
iÅX¢’iXYÿZ,S)«&¼™³2’"Q‘¯.ÍDDC…´#D¡B:¼FˆÆˆ&
éî§ˆfˆæˆˆ–ˆVˆÖˆ½ Š*Ie¬2Ñ7î÷Y c%‹Şm¢¢P¡F¾s#Dã*·µ+¥çÅ*Š3íâ”ÑÄÒâ	€€Œ€„@" c  S 3 s  K + k Ï@^€Ä’”dPV\û./¢è2ƒ·,ÃÌZ³[¿&…ŒE ƒ¢ˆ5ĞPôMıŠÒ¡ÖS(B4FK„»n¡j9/dPIJº¸R•²ÙË˜Â|kbô‹­Vf‹­Ví3-¶Z¹yUh­[ãÆ¬µ47³÷ge»‹ssmº’ğÀÈŸÉ{’è çI¢#—¯dÈÏW3z ÔtODC…t®*T-ÖÜ#%¤ƒÚX!;§ééÍ$ÑFÍ,TGùö]A?kĞzòıÄ’”lE«ü&=ÕÅ«#³QHŸº"Q‘(@4@4D4B"ŠMMÍÍ--­­=#zA+„eHUÙF:¸æ~
êMğ•ò».Šm}º’èƒÒâéñ@’ğ|ÇÃÉHmOZ1	)9%µ$˜ÇÙKxÓqy	Fç’ôŸBs3[?Š™¤/…š:ú
éc(¤ÃÚ@"XäÂÛ„R¦`ÁİmÑ‚‰ê[[0UH[0SH[°–¨$´ı%öS]–ØÚ‚®BÚ‚"Q‘(@4PHOp¤¶+THÛ!#š š"š!š#Z Z"Z!Z+T¬‡ßG¬äû –ŸQ"ê°Ğ­b†)›x Óâ	€€Œ€„@" c I0t¸W
XÎE#yÌhX%¹/å©Ìe¬Ú?(±jÿA‰ˆ5P(E´‡" I0
¸V­}mK©Âå‹ßÒ§­‡ÈCÔGäKDêy$@4@Å!¢¢P!½¿#Dc…ô„&
á™t­šş›ô¹<- N	¢P!]GTxÁ¿³«CN/s_‰bTO¶Ë%;Ş*= >H d dd$IRrPÍâÌœ¶x5jäx×|diXÉ½ÇZéq­aT×:dRÓ/öj½ ¤‚ŞCÃ‚|Ó:è#5€ijËzº
•vi$QÉÉ6+QsyD%ª—§ç
Ò0K ¦U€xZH-@$QÉĞfõem×>=WâĞV˜ô´Zè•mV54ô7Çñ‰î¤ğ‡:àtÒ®ë!òõùâ™Ñ@T"!
±K6|B%‘Ê¬´W|ºÿÃ5Ìˆd"kÄ"qëåœßù%ŸKe›~)¿ÑïãCÅİ"ªYÛ¬"%§Y-İZ³Í>#`UÚmVGcíÒ6Û„e--j)×iPAbY@Ç­ÍNöFß2ÚìKEIK½ŞfïE°…^´Ùkj©æÑ-%v%+ÜœßwÇKeO×¨è¶Ô¹ç,î3ñßtÁŠS:‚¦İUR}Ğí±„>´ßŞPKÓLıAƒÈ«^Ÿ§Êe»ÙÓ%¯&Å®ô¼£KbünXÇÙÓ%6j;%4Z{÷ÚqÎÁ+ßÏÕü*Ûãÿ   ÿÿ PK     ! ;m2KÁ   B  #   xl/worksheets/_rels/sheet1.xml.rels„ÁŠÂ0E÷şCx{“Ö…CS7"¸UçbúÚÛ—÷ı{³eÀååpÏå6›û<©f‘,Ôº…äch°ğ{Ú-¿A±8êÜ	-<aÓ.¾šNNJ‰ÇX±…Q$ıÃ~ÄÙ±	©>æÙI‰y0Éù‹Ğ¬ªjmò_´/Nµï,ä}Wƒ:=RYşì}<n£¿ÎHòÏ„I9`>¢H9ÈEíò€bAëwök}¦mÌËóö	  ÿÿ PK     ! Ä,Â   B  #   xl/worksheets/_rels/sheet2.xml.rels„ÁjÃ0Dï…üƒØ{$;‡PŠ%_J!×&ı E^Û¢öJh·%ùûèØ„BÃcŞ0]Yõ‹…c"­n@!…4Dš,|>¶¯ X<~I„®ÈĞ»ÍK÷‰‹—Zâ9fVÕBlaÉoÆp˜qõ¬SFªdLeõRc™LöáÛOhvM³7å¯ÜSå0´ N×\—Ÿ»Ó8Æ€ï)ü¬HòÏ„É%’`9¢H=ÈUíË„bAëGö˜wú	ŒëÌİsw  ÿÿ PK     ! 4¡	’Â   B  #   xl/worksheets/_rels/sheet3.xml.rels„ÁjÃ0DïüƒØ{$'…R‚å\B ×6ı U^Ë"öJh·¥ùûêX›BÃcŞ0íé{Ô‰,ìu
É§>R°ğ~»ì^@±8êİ”-<áÔm7í+NNj‰Ç˜YU±…Q$a?âìX§ŒTÉÊì¤ÆLvşîšCÓ<›òÛİÂ©®½…rí÷ n\—ÿw§aˆÏÉÎHòÇ„É%’`yC‘z«Ú•€bAë5[ç'ı	L×šÅóî  ÿÿ PK     ! C–£Â   B  #   xl/worksheets/_rels/sheet4.xml.rels„ÁjÃ0DïüƒØ{$'”R‚å\B ×6ı U^Ë"öJh·¥ùûêX›BÃcŞ0íé{Ô‰,ìu
É§>R°ğ~»ì^@±8êİ”-<áÔm7í+NNj‰Ç˜YU±…Q$a?âìX§ŒTÉÊì¤ÆLvşîšCÓ<›òÛİÂ©®½…rí÷ n\—ÿw§aˆÏÉÎHòÇ„É%’`yC‘z«Ú•€bAë5[ç'ı	L×šÅóî  ÿÿ PK     ! dó4"Â   B  #   xl/worksheets/_rels/sheet5.xml.rels„ÁjÃ0DïüƒØ{$'ĞR‚å\B ×6ı U^Ë"öJh·¥ùûêX›BÃcŞ0íé{Ô‰,ìu
É§>R°ğ~»ì^@±8êİ”-<áÔm7í+NNj‰Ç˜YU±…Q$a?âìX§ŒTÉÊì¤ÆLvşîšCÓ<›òÛİÂ©®½…rí÷ n\—ÿw§aˆÏÉÎHòÇ„É%’`yC‘z«Ú•€bAë5[ç'ı	L×šÅóî  ÿÿ PK     ! LZ*zÂ   B  #   xl/worksheets/_rels/sheet6.xml.rels„ÁjÃ0Dï…üƒØ{$§SŠå\J ×&ı U^Û¢öJh7!şûèX›BÃcŞ0Íñ1Oê™C$]Bò±4Xøºöo XunŠ„d8¶»—æ''¥ÄcH¬Š…ØÂ(’Şa?âìXÇ„THóì¤Ä<˜äüĞ¼VUmòo´+§:wò¹;€º.©,ÿï}<~D›‘ä	“r Á|A‘r‹ÚåÅ‚Ö[¶Íµş¦mÌêyû  ÿÿ PK     ! k?ûÃ   B  #   xl/worksheets/_rels/sheet7.xml.rels„ÁjÃ0DïüƒØ{$'‡¶Ë¹„@®múª¼–Eì•ĞnKó÷Õ±6…‡Ç¼aÚÓ÷<©/,YØë’O}¤`áıvÙ½€bqÔ»)Zx Ã©ÛnÚWœœÔ1³ªb£H>Ã~ÄÙ±N©’!•ÙI%˜ìüİ4‡¦y2å·º…S]{åÚïAİ¹.ÿïNÃ=“ÿœ‘ä	“K$Áò†"õ Wµ+Å‚Ök¶ÎÏú#˜®5‹çİ   ÿÿ PK     ! àñ—"<  "K     xl/worksheets/sheet3.xmlŒœÛR#9†ï7bßğı6ø8€‰™¶Ëup¹|(Ûà;˜nb ³àî}û•JÊJ)yºofèO™©sfJU®«ßş~y>ù¾{ÿxÚ¿^7šŸÎ'»×ûıÃÓë—ëÆ²ŒşsÑ8ù8l_¶Ïû×İuã»Æo7ÿş×Õıû__w»Ã‰²ğúqİøz8¼õOO?î¿î^¶Ÿöo»WUò¸ÙÔ?ß¿œ~¼½ï¶•ÒËóiëì¬wú²}zmı÷_±±||ºßö÷ß^v¯cä}÷¼=¨ö|}zûhÜ\U5LßOT7v“í‹jõB7´©ŠŞ¶_v‹İaù¦ŠŸå~ª€êwãôæêÔêİ\=<)ãzDNŞw×Ï­şæ¼£E*‰ÕÓîÇ‡ó÷‰Š?÷û¿tAòpİ8ÓmØ=ïîu£N¶êßwŸwÏÏ×?Zj4ÿ[ı£Õÿı÷ó.W¬µ©nQ5‚ª½»Çí·çÃ|ÿ#Ş=}ùzPÍ®Ôï÷Ïª9ê¿'/OzU/Û¿Í?_¯İOçÍ³Ë¶ªîäşÛÇaÿ²6¼êw­ÙêYMı‡Õlv>]t»ŞEX÷ÔT^Ë`{ØŞ\½ïœ¨™Ô}ÛêuÑîks¦¹Ÿ´•Ã×§û¿şØëöëŞ[…¶¯ :¤Í|ÖXµ_V``@¯C	"	FÄ$¤dŒ%È%˜HPH0•`&Á\‚…¥K	V¬%¸•àN‚çÕjUVÏZ'<k_7.êIĞ<W³İĞ{ôûÍyóêô»Zğ÷vfGVÆ1J´|	J´}‰ÌH´šN5çÂÊ¸–¡U—™ )€l¹„QS›Àİ´Ö5vGmc ê«ıÒ×ØÕ(ÀÃ-bc¤Ñ¸š£q=ã¸ã(¦kˆb #”­4ØJ–ÿBC¨±ÛÊ¨éëóOdW‹+uÆ+ÚãAµ«‰€Œ€Ä@ )ÈHd¤ 222² RYYY¹rdcI6šš0o™›fCMµ C«â^ ²Ä‰D@" # 1HjIå«08¶„cZ )™%\×Â®«­%•kçÔ:A	±æîæT’jÛ)'À~¬ã;ô!‘·,ê(ÿ[ëµ…g‘w+µ¨òv˜e›r®m_Ï7CK8$–ACÂA®\Cş êˆp€M©¹È’®Ú
õ`œwıA‘Pµ…ª®§¹ƒ!mçVF4ı„ï‹Ñ”şÌ"®oa	÷¥´Dõ…ê[â–¯\Kş é€ìÚ1w@^¿i87 ²ÄÌL£Öå&¥V;7¶Ä	)9!)D¢)¢!nÃ‚^Iˆk\"Zªlùz$“Q+G–øw.Î¨yw,jI‚*îz‘È¿êYµI‡¼ªeHÚ¹Ë¨^.&Yq—‹!]µqxï]Êª­o¢¸ªA¢ÜìêâÌ×K­Pµ¦üYÉÑO—¹I’œ¥8hZÄcˆ(B4B#J¥„‹L‡÷_ØµÄ["ìÓUÜâ–°³‰€Œ€Ä@ )ÈHd¤ 222² RYYY¹rdc	2õ6p@=š»[}PIŠ„¡)·:	9{RÄï8 ""sFfEôÿêİß‘wÌBÒrDD¢EèZGR®Š»#¸±$`âHÂÑ’IÁ@“º¿Máíb¯´%|Zî—Ši™ù¥bFV~©˜Œ.U‹%Ğ1‘Ô«KÿAË©CKÚu:Yâør’Q^¬•®X	©±¥”‡ëœjGmª'òá		±O+9Ù–EÜ—¹%Ü‚’Õı]5hİ¹;KÓs$ÅhÉccIÀ„H~õ}¥8írâ!¢ÑQŒ(A”"Êåˆ&ˆ
DSD3DsDD%¢%¢¢5¢[Dwˆ6„0h‰tíØô;ùƒH j—`²"ŞFƒ–!¼×†@" # 1H
$2’™ )€LÌ€Ì,€”@–@V@Ö@nÜÙXÈDYO§¹7â|}Ğ2Ä»pèÉã	9NXª8 "¢U!+³":ª³»‘cÌBœ?˜^(=B”*m,BÚ>’PWÜË,	˜8’Äµ!‰Ó„û+Îˆ±_*r»µ¨şHÔ–<KÚjëVÈx=´B–!×1›¢‰HHŠSB¬¸±(Ğ‘…óe´ÄÛ&ëqv„xuEˆFˆbBìD)¢Œ7bŒ('Äîu‚¨@4%ÄægˆæˆˆJDKD+DkD·ˆîma(k‹\õ'ÓWòê<Ä«-A”"Ê	q;ATxÈ»‚hÉÚ*îÀ-á)‰€Œ€Ä@ )ÈHd¤ 222² RYYY¹rdc	FĞ¶È k÷b2e'‚V’ò.Ûˆ„+#h@DFĞ€ˆ¨(³"ÿAYˆ¼th‚¨@´±(à¸EZ ¹üãÜ´	˜8’•¶MÊ&šÔ±«)ˆ±_*ò‰Ü/¹ÏÌ/±yå•¶D½]<ëPºß©¸›],áSëĞvp‘%ì¹b’ù§ˆ[Je„8Vç„şñPNBìæ
B;gq÷æ–p£@J2Tg{+°³­[ w`gc	.ÅÈ‡>WòÊ+ğ°qˆ"ŠÅˆD)¢ÑQh‚¨@4E4C4G´@T"Z"Z!Z#ºEt‡hCÓÈåM¿ò§öí®Î‘ô»â^>`	o”!ÈH$’É,Á¨2}ÏG9]&W^‰xîÊ}·U»ã£¬P`“‰d¯®Gs·L?èzÖÎ‘4¬â®‰&u;"(­¼óÜ5"ÄÎ*ömˆĞ‘‚Èº"y®JIˆ½wfQ`|DRâL‰÷a=nx­×±ÈuB€"”!Š%ˆRD¡À>IÃ±:ûìHĞ1±—cÍÀwŸ&‘•©vCõR@v°“ÉÀNv& U ™‚9ØY€V	d	vÖ`ç´î€l\;Şñ§s$£©¸z®ën¶‘'¬º„¢|tˆ("S<]#”ŠIÊ«PìîõRD™â
Ç(•“”W¡pÔ+MÉW8'äYYèM•ˆ–dŠ­¯	yÖÅÓ-šºC´±–~!”ëV\Bg‡Z¤âC½qYTÕdö(šJHM¥„ØT¦r45!=6UbSS05gSÇİÿ‚,±ñ’_‚ñõ¯¿%Klüß¸Æ½=İıÅ¤‡ÂM%ïç¼„œpƒ("äDVBÜÎ„ÛJe„ØVNˆmM±­Ñ”Ûšb[Bl«D´$Ä¶Ö„ØÖ-!¶u‡hC¨²åO™È:?õ›:ÁíiîQİİi»a¥{İ`‰$@R ™%"rK¸…Ğ*€LÌ,aËKØr	ZK + kK*Ëş4‰D×™¦z3ÉœwĞ5ÄÏ­ÅË™bç˜[Â—%Kº*ï«óÒKq×T°ùâ)¢™EêQ$I-,âúJÖsê‡‚%‘¥¢µE¦>HU®cÍİÄ?S§>;Tñ#·„›<±Ä}.#îëŠ€ˆÃi@Dt{fEx¾–pcÊ€Ñ˜e@D4fY[‘@×Gç…´z‘š£·uà/*ñ²ËP—ªÉĞû¢^yòD‘Ÿˆbßªè|B
ìGSBìm3‹x¤sK¸õ3Y€ÌÚ•ñWà/]êÁ3×îQ×"vÿCD¢¢Q‚(E”â±Ë	ñOqSDSD3Bl~AˆÍ—„ØüÑ
ÑšP 6Š“¢ãt½Ó³ò?ö§{äPSqïÇvƒC ‘%yK8ò¤ •ÉL€@¦@f@æ@@JK0îõœ*®T-ÿÚ/\ÊS"	9ƒŒ(B4"Ä=±ˆIªI]wG†U+¯¯k!ùûŠ1Q›øVÅÉª°
¼Æg|W¸ğ9U ºòm¸	ñ*-B¿Ş>¹¦Š»As`‰Ûá†‡Ñ( "bĞÈŠ°›N,á¹Ê,ÑW—õ8tE¬³ÍFéÚö\wO¤Íõ8hîÃ¨’´/UVÉCb‰Û<£å7OŒÖØª)!nÑL“ÈÑy®ºÙ&Sw#KÏ"^kCD¢!ngBˆİuJˆÍgˆÆˆrD‹ÔËÑ42¢)*ÎÍ-•„0fô'êGbFÏËCõã«eò¹â^Ì°Äug&3eÌH$’É€Œä@&@
 S 3 s  ¥%(âe£ÎC6Ú3Ä{»íR\–V(°í¼„Î©Çdi¼ã=›·q$/-
XõÒÇª¹Œf«Ã"µ»WŠ#]ª|“÷“?bâ%•rãƒ1h«— 9mÕÜõ‹eÏ4qî…|6Qq×ÄPî®¸ãYùî.	9İ%ät×¢@[½pè´Us·­å¹!^$qLÈH2<W„»+Rƒ‘.•³{)²’˜„ÜîZ=înf¥¼WBšg"\–V*Ğ#/ø8=2…×kynHÀ„çEÕ4ù6ùJõéİy7~â 3D!!Š%ˆRD¢1¢ÑQhŠh†hh¨$ä„4óµóÍ’—İû—ê-ê›1ß^Õ:T¯àİ\ÕØ|Fù˜¾ö*Ë’ó³~¢öQ¨¤¥Jªj…ºwêë;$ÔùÜ;ëë,K2U¢ój,Qw	}}U€%ê> ¯/ °D%Ğ}c‰J)U=Õâ­Îz-UêºàïëËz´¦nçûú¦K>«’a°$V%úê¨g}ıÄKÔÍZ_ß’a‰úr_ÿäKÔ/Šûú'ÄX¢y÷õCn,QO²ûúA5–¨~ûúuŞPÉe_¿<„%êı¡¾~KâV§¯„%ê‡@}ı£,Q?}ïë_¶‡JÚª$ÔSõ£fU¶ÖU%¡ª·¤ûúçP==¥ZoQó\•˜¦^VêËEú›LùöıËÓëÇÉóîQí¾³O*ƒx7ß8ªş>ìß*ª2Â?÷õı"ú×WõA©úøÆÙ'åm÷ûıC5Ì~ëéÛÛÉÇıöY}åI?hß¿?©ïFUŸ‹ºn<«ïZ©²·ª­ÿôpİxOªUZİêæÿ   ÿÿ PK     ! ºNÈ  ñP     xl/worksheets/sheet1.xml”œÛrÛ8†ï·jßÁ¥û­³£Š3µ‰G‘ÔÉ²­;­$®±-¯­$³o¿`ıCöÌÍŒó¡6@÷OHâ§ßş||8ù¹{y½ß?]´ÚÎZ'»§ÛıİıÓ·‹Öå*ú×yëäõ°}ºÛ>ìŸv­ÿí^[¿}şç?>ıÚ¿üñú}·;œĞO¯­ï‡Ãóèôôõöûîqûúaÿ¼{¢–¯û—Çíşùòíôõùe·½«;=>œvÎÎ§Ûû§–aôòWÆØız»ïo<îz—İÃö@ş¿~¿~m}şT_aörB·±+·äõR9Ú¦¦çí·İrw¸|¦æ¯÷‡Õ~F€î»uúùÓ©é÷ùÓİ=®"rò²ûzÑúÒmÎk“Úb}¿ûõj®¢ş>9ìŸ§»¯‡/»‡‡‹Ö¿ûƒÖ‰
Îïûıª9½»h)¯v»[åæÉ–ş÷s§Í¿ô‡àÿêëô‡£ràø¢º[¿Ü«FuPéîv_·?‹ı¯dwÿíûî¤¯nåvÿ@ÒOïÕ´vZ'Û?õ¿îïß/ZıÃöÙÇî°ß:¹ıñzØ?^i^_¾éÙ¡›©{ª?LÏvïÃy¿ßœ‡ûê‹×¡oÛÏŸ^ö¿NhrÉ‰×ç­Z*İ‘N»ûArø~ûÇöÊå¾éĞõ;Ğ©a¾(Lş×÷©ÀXƒA&DÄ$¤däL%($(%¨$˜I0—`!ÁR‚•—¬%¸’àZ‚	6UÔOiÂšYë…gMá‹Öy3IcÚ´üiÚÕ¶ıùùìÓéOíÖÌtlL‹¶o‘ EÇ·HÑ¢ë[äÚ¢Óv.3èû6ÓÆFm.µè
 %
ÈF“4ÚîŞ°K]a7h°?m§P…İşcM´{ş=&n›¸ÿÂmøıænÛĞo[»mÑqCäŞŒÊˆN¢°ÁPØ»:Í’šhĞm@¤A¯‰±øè„¡/î55x˜Ì³fœÂšÎ&œÏÒØp^ªáÔ5×„oa¡_{)ÁÊÒø²–c\É.×ÜÈ16àT¨ê˜
…İ©Øh€ı)Ğnÿc9ßN±2§À¢«’Úx H$’ÉL@J 9%K k W@®Ü ÙR¯V/åÓ„ı¥iæÒŞ¦lë.» jîwCxM€D@b 	H$2R )T@f@æ@@–@V@.¬\¹rdcÖ|%0ƒÓ©¸›(Æµ%mqJ8Mæ<÷‹FlmY÷&²ğLdå7&o—~6jj?¢Q…hcæÉ¶RSD[s7€CC(mBkGyµİ²õÑ~â5¶…"+üV1+s¿ULÈÚkíˆª»Q­´T÷uDÑ“\[šp5.§‘!$°6”İš	šÀvã‘2‹¸X¹ñY`8£U9ÂÀ ¾—…!ìÁÈÊÄâ Æ¹‚^×@n`œ!éQ*ÎYvï•ø¶V}n·È)òˆ"D1¢Ä"eŠ(C”[ÄNLñä•ˆ*D3‹xø9¢¢%¢¢KDkDWˆ®İ ÚX(ıJ9şõéOTâW—qŠ(CTXÄ;·DTyÈ×(G¤l[KW^/cCxŠ'@" 1H
$’™)€”@* 3 s  K + —@Ö@®€\¹²1$ 8”uÖ]# µHu«‘­®âh%·‘SDqK&¢Â¥q¡Ü˜¼#9´7dÄ’PÉCY«
ÑÆ LÜ!ÚmkîICCQñêî|Ùçİo[<)'~«P…ß*æ~«<ğZ;âºÕÔ#z¶ænlÆ†pÂ	.2„3WbmhRkÛGÊå92Ä¢7eˆ5â4WYÄ¹pnßŞÂvj	dej–ïÆ¹‚^×@n`œ!¥(ô{2¤£/]bïº	¢QŒ(A”"Êåˆ¦ˆ
D%¢
ÑÑÑÑÑ
Ñ%¢5¢+D×ˆnm,BÒQON986ı|Ñ9òXQsïÂŞ( H$’ÉL@J 9%K k W@®Ü Ù‚z@} ä.€¦šéÇGÔ–â¢- ¬‘“Ÿ¥˜H=0‘zÀ˜xu
>}`#[éD%¢
ÑÆ @J¾‰ VìÁMG“ÀG4vGklb¬HSùÚòÂkíÈ3¿ULËÜo3²ö[ÅdlTkX(õå¤—&6Z•¹7ftZSú&M¸`F†¸zÀØĞÿš¨À„íÆ#e¹Å_Õ{»ø#Îi•Ê-şÚÊ-şš°KÓÉÊÔD`ms½®ÜÀ8CpİuHÙš»rmcH`!e;ó]-]ı`‘£EˆbD	¢Q†(G4ET *Uˆfˆæˆˆ–ˆVˆ.­]!ºFtƒhcê‡®üÇ¦ŸõC×œ}úüÚ|;AKŞFãÚ’
›ò:âAebŒxCF@b 	H$2R )T†`1îzjÌ‰âî~+Ë&ãuDN½Ö®¬~«ÈôUíƒ9O®gæÆ‘4‹ŞÙP×Ó‚¿pÄ\[ÒX(²Û¢|MŒQ“b„(¶ˆswj‘{TÑ.³F\tr‹ê´¦¿`¥©ÆÑ®¨w%Y]QHÀrb$VÑÕ¤G[Š/-½K6âKë~K{ÊÄ¹´T&ã®9qTP¨VZ~¾câ´¡d#vL÷8¦ôB#Ç´àw5y³*O¬‘›L?N'•±
x£Š³ãÍ±Öd*]Ì½f{0QK‚F'À6¢Ø"®}	¢Q†(G4ET *UaÆïyš6ú‘¯£™hk{Š«¶	¢ÈC^éyƒ×JÍ½çMC8à H$’R§ğ:qLáW@¯Hdddd	däÈÈ•!XšÔæw7‰İ5÷J“Ÿ&D½½›^E¢N&¢H¥‘£3cRow3Cê\WeÃ©VTÑUà"ÂÕË€‰pu0®^ÌLT	½ ¿³×¾Ôö´×¸4-â3A!Š%ˆRD™EüØ2µˆı*,b¿JD¢¢9¢¢%¢¢KDkDWÒ£pÇ¦ŒŠ‚ù¶nïˆˆª¹Ÿà´¬rœ$‘éÅ61H
$’™)€”@* 3CIçˆvêIí4V„w²–‰±#é¤±Msï=©ªÍ ªp6È£ˆÒQµ³¢`fP`ó+õô7dIO«-oóÄ›lb­EˆbD‰Aô™–u=E”aÇÑQa×ÏQe{?³(°…Ê<¶M)KzZ3Ò|‡€
kÅ)¥‡|ñ¢D`3‡ê×u)úÒÓâovlïÛ	H$’ÉañRÂş”Ğ«22² ²²2÷ßÓš¾š»•|¬H³íz¢LÇÆWMâÛ‹š‚}f/ÂZ |]‘1æÍ8l#\[L„7Ë€‰¸ĞÊ˜`é{ê™‚ô¶ZÿRÛû
Â"ŞQ„(6ÈÉ	Z¥h•Y+V…Eœ}J‹Ø¯
ÑÑÜ Ç¯¢%¢•SMßSÇï†9®í)Ì¼RDsDDKyÙ§ïÉGgûÀQ[myÑr²H$’É€ä@¦@
 %
ÈÈÈÂ@öñ¤œ>8ë»§q=qd“ø­âÜ$U­êœ ):¹o/c¦ÆşMQ#GgTş¨â±lf;¸7"¿9·F\&§jßİ_úZÉºêÅ"ÍQ„(F” JrÒ@†V9¢©E†Qi{_!šYÄ;ohaQ ñx
ùİ0§êG–jµqâ™ZÄ‚¦@4³ˆqæò']£õ(n\ÿŠÓO<Ú†M$’É€ä@¦@
 ¥!„á	Nç¶µŠt5ûlÕê¥„Ø·—7Æ^İ4ZDY§ldÕmîÚ²cj;¼•
kÄSZH	GÄp_‹aObˆ:in¨/¸R6²7T„—ĞÎéğš»B21Ä¿´m)5—6(pé¿©ÀèwÌõä³Ò[Ä©d‚(B#Jr²^Š(Ã9¢)¢‘úav}C˜¼O5%µ½—¼Ry9hpDüÔÜ;V1„3ÎH$’ Id@r S Hdddaæ²’%'×š»;f¬ïRñd’û7åJjŒ¹’û£
I5û+£ÎqÔ…A]êÊõ‰ó;ÏI”+¹»ÔX1ŠĞ*F”XÄi5E”YÄÃçˆ¦ˆ
D%¢
ÑÌ"ökhaQ`Ç»rå0SZ5§£WJP{‚RsKá016¼±# 1HjH`“¨Bm7‰ëœ.à\ÑÆ"¼I„¦Tk]ğÙF”œ8`"
v0»15&õú¯O¢rCŞşÙzW *UòÓ³+ÜĞI14Á=;t‹º3DÍİ5Q„£/}bcÿfŠJŒ‘“¢Rƒ¹%ßuLWB^“!vLèÀXµÒ²xÇ1mä9¦QÀ1·à’cïe¹¡²§‚ëh‹8çLEˆb‹8u$ˆR‹0uİzş†ïœ:†n	s§Aq/uÔ–ŞSH$’É€ä@¦†`ÂQï|	%œš»K~\¿Æ¾¤/bcï®>‘p’€‰H8iÀD$œ©1á„SòfÂ©ØÈ&œ¢9¢…‡¼„3¥Ç’š»¡›Ø>GjÑPWw_iöõ@<¹dÆşÍ}#g_O
8¦êG u]q#Â‰	ÍŒı›ß¶É­oä©AÇdù¡ÌòEØ1±3cÿczPú4Ñ.š©é‡©5wWÃDvL¬ïÌØ“cöš¹EÜP™º™8Ê¶ïÈNz›–LÈ9	Q„(F” JeˆrDS‹œL®_¦ßmõ¸{ùV¿Êë•^7öã‰"LßRşü©Áúb4ñ£œ&‘‚+[ÎÏF*ÔØBg™#uT‰-ÅpD¯’	ğv¤~KhétFêç]¡–ÔòŒ¾8Rß,Ä>IçãH}õ[HƒŒ”Äµ´©¥\ábºÚÇÔRïzÑgL¾©/Pâuè›v£ˆ¾"‡-ÉpD/ò	pŠšú1 …¢¦~_hé©ƒ›@Ëàl¤ÎU°…¢Fêœ	[èá’ú„fšGêùûõıÍPË€Zê‡5ú$µc@¾©“5ÎéÉë =º}êO}N›Ñ[çÔ+öŠíË·û§×“z-½ıî•‘ı~ºúoza^MIü¾?Ğ»çì¿¾Óûwô’Ÿ³¤’¾î÷ûºˆyußç“×Ûí½´Omí_îé5€õÛÿ.ZôšBj{ŞÑÕF÷w­—ô®^q§ÍË
?ÿ_    ÿÿ PK     ! Â~¼  K     xl/styles.xmlÌ\[o£8~_iÿâ=å’K•d4i'ÒH³«•Ú‘ö•$NŠ–Kt6Õş÷96÷Ò‡ˆ}Îwî¾/?][úüÀòÜ•¬=¨²„Ü½w°ÜÓJşşºÍe)M÷`Ú‹Vò
äOëß[á‡^Ş
% á+ù-ÏŠìßcŞ¹ğÍÑó3„[ÿ¤g™‡ wrlEWÕ©â˜–+¯—GÏiï½»! ÇOÖËà§ôÃ´á‘&+ëåŞ³=_
> !O\ÓAQ‹'Ó¶v¾…›MÇ²?¢Ç:~@ ÅíËõ|üPÁ<#Îëå·ê‰Wÿ´[É[øSá£%XÊŒP-(LZXß#õa<Y,æS}:ÎÔÙØ˜-:Á@±wD°aÔ÷±ŒØôãÉD5&Eµ¿ “‡¤ï_ñSÊ©ş›š¹ZÅ:˜y6Óğßl¾¹	Œ u-w­DgİñªĞl™ÊEÇd’Í“ZìqªºQAÉ†È€—Z¶æq’ÆáÁzy6Ãùîn¤øúõãIÜ…¢‚½PÁ£î­O¾ù¡é‡À³­.&§'R:Ò4‹-&³‹¿°Üº ÃJwRr€Sp#È¸óüÌ¤ZgÀ z¶^ÚèYß:½áÏĞ;c&^z\,óä¹¦—JÒ#ùÄ=¡ÒBQ]Éá)Š‘S_CÃc\í	…«9@Nsµ„/[¤=.]A9CŞ.wfq¬w‚ä¦?m~£_ÎêĞïVh•Û²‰n§­t£C=9Qä²I¤}øÏ¯¥ròÊ$®Ã„“8[N¼‰,>Á"©$qá$[¢ZÎ¼bs’£Ìô«¬i9×æjÏú†­*1ñòàÜZ- I³W)cNï5pIœy$WózH¸HR:Ocµ;Yë°h)Ww^'ÜÄ`\D3Ó¦ârõãÃEŒ²ni/jª£ä­´Çõp›t¢Aø¥¤ûS
ãZÂÌœ¥ÍûCc¿ÿ'/Òü«L_Ù±Üö•]Z›¿’z€x•ZêCÏÆ«ÃÑÄ!¿î«ä|àvãRÙ„ËMÂhÌë	Ä«>K¢b©ê”CšÄÓç—¶‰8<üs©şGæ¬¡HF™ u8ğPf‹ÀÓ›×w5>ÁÛRº`ÁC³D<İª¤×â`iolû¯Áı}L×÷4H@—£ä¾;['ü
K„°g·’KX¸Œ/£¥¼èô¤ä©E´sd‹Ft¥Ë1eP•&§½%ó|¶?6d%o¥E÷Ÿmëä:ˆìÁ:ØQ‹n¥7Ï·~‚Ìx+nß£hír¬¯tVW¤±Pj¡Ô¡Ô¦B©Í„Rƒ=âÄ-¯«MB©i®ÁÁF´PrÍÂÜo˜”ä+p[Únâbeh,-Ğ6*ª¡Ë´ÇRË˜Àeë™ª"hY´¨ôÄRym\X¹¼º:E¬K·4À'z¢Ö
5‚)„ÑÊ™ æ8×‰¿“ÃªáP%„áb¹!U‰}Õ¨K,ÚT]Hx‹‹¶øˆUj–!Õ†ZÁ“&YÂk`¸2’U”&ãXMìğN£h–n*b=Ÿp™Å§&v€§QqÕJ­Èé z1zZ‘ÓÄNt*Ú¡cËZ#
8'q¬5jí/]± QFësÌwmªş 1óÂ5¤Ìûó0a1\ûÓËT:4Ò:ô€†ƒj[:JĞp,Hw¨¥}‰•‰(Ãu™‰X (S‚2N— `\xoqÄ‚Dé¥¿2~Qª%øeÊ`¥‹5-¥¿E5‰\+aA fE]ú35Ã5•„‡‡t‡6`"b¹7=GŞrfé_ß<¿¢ÙË€åÊ–Î&J!x:LQµğ±GTrh“Ç… ¢,˜!j°FVAMü\˜å”ôº_@®šÉZ¶ÄåE”–kğkù
Şú-Æu˜ªšf'z=™¥¨*«3Í~5¬+²\£¸¼O~NÙ¨X´ŠKQàøı7K„âSKiqGv…ÃBéŒ6S{T,t©=
]hy½•u˜(¨áö ºèÕ"Ëéà—ÅÃÍî™ ¨AV]ùlMQÛ‹ıbº2UÔ3W®È@LrÔğ¼¹1ğ)nz´#…^$¹Š4Ğ@wãŠÜÖ„\EzhB
óv¦ ”‹k¤¦SnÜ_h±*=mO˜X#5òÚ4¼({»ğ.vúVµ„ÏÈYÉâ†ì\8ìŞ-¶I_“ÎŞÃš‡Köf79"4wp~ç;å¡z@Góİ_Ó/WrvıùA;ä‡¸Õ_Ö/$$VrvıŸÃHğPX¸øÀ¡ğ)½ûÖJşïËf¶xş²ÕGsu3MÆÈ-ŒÍóÈ˜<mŸ·UWŸş™ğÉJmB®äX{ß¼cø°‡£%¼ãÑÚ#ú|¥…²HNX"­üXØüKöl%çn"øä¨€Ç¾Ğ§êgCSGÛ±ª&Ss>šOÇÆhkhúót²ùblv£vMU4-o<†–ƒlËMl•X(ÿŒ·B(‰%” =¾jı  ÿÿ PK     ! é¦%¸‚  S     xl/theme/theme1.xmlìYOoÛ6¿Øw tom'¶uŠØ±›­MÄn‡i™–XS¢@ÒI}Úã€Ãºa—»í0l+Ğ»tŸ&[‡­úöHJ²ËKÒÖÕ‡D"|ÿßã#uõÚƒˆ¡C"$åqÛ«]®zˆÄ>Ó8h{w†ıK’
ÇcÌxLÚŞœHïÚÖûï]Å›*$A°>–›¸í…J%›•ŠôaËË<!1ÌM¸ˆ°‚WTÆİˆUÖªÕf%Â4öPŒ# {{2¡>ACMÒÛÊˆ÷¼ÆJêŸ‰&Mœ;Ö4BÎe—	tˆYÛ>c~4$”‡–
&Ú^Õü¼ÊÖÕ
ŞL1µbma]ßüÒué‚ñtÍğÁ(gZë×[WvrúÀÔ2®×ëu{µœ`ßM­,EšõşF­“Ñ,€ìã2ínµQ­»øıõ%™[N§ÑJe±DÈ>Ö—ğÕf}{ÍÁÅ7–ğõÎv·ÛtğdñÍ%|ÿJ«Ywñ2O—ĞÚ¡ı~J=‡L8Û-…o |£šÂ(ˆ†<º4‹	ÕªX‹ğ}.ú Ğ@†‘š'd‚}ˆâ.F‚bÍ o\˜±C¾\Ò¼ôMTÛû0Áz¯ÿêùSôêù“ã‡ÏştüèÑñÃ--gá.ƒâÂ—ß~öç×£?~óòñåxYÄÿúÃ'¿üüy92h!Ñ‹/ŸüöìÉ‹¯>ıı»Ç%ğmGEøFD¢[äğt3†q%'#q¾ÃSgv	é
à­9fe¸qwW@ñ(^Ÿİwd„b¦h	çaä ÷8g.JpCó*Xx8‹ƒræbVÄ`|XÆ»‹cÇµ½YU3JÇöİ8bî3+˜(¤çø”íîQêØuú‚K>QèELKM2¤#'‹vi~™—é®vl³wu8+Óz‡ºHHÌJ„æ˜ñ:)•‘âˆ~«°LÈÁ\øE\O*ğt@G½1‘²lÍmúœ~C½*uû›G.R(:-£ys^Dîği7ÄQR†Ğ8,b?SQŒö¹*ƒïq7Cô;øÇ+İ}—Çİ§‚;4pDZˆ™	íK(ÔNıhüwÅ˜Q¨Æ6Şã¶·[SYJì(Á«pÿÁÂ»ƒgñ>X_ŞxŞÕİwu×{ëëîª\>kµ]X¨½ºy°}±é’£•Mò„26PsFnJÓ'KØ,Æ}ÔëÌ‘ä‡¦$„Ç´¸;¸@`³	®>¢*„8»æi"LI%\ÂÙÎ—ÒÖxèÓ•=6ô™ÁÖ‰ÕÛáu=œr2fË	Ìù3c´®	œ•Ùú•”(¨ı:ÌjZ¨3s«ÑL©s¸å*ƒ—UƒÁÜšĞ… è]ÀÊM8¢kÖp6ÁŒŒµİíœ¹Åxá"]$C<&©´ŞË>ª'e±b. vJ|¤Ïy§X­À­¥É¾·³8©È®¾‚]æ½7ñRÁ/é¼=‘,.&'‹ÑQÛk5ÖòqÒö&p¬…Ç(¯KİøaÀİ¯„ûS“ÙdùÂ›­L17	jpSaí¾¤°S!Õ–¡3•† ‹5'+ÿZÌzQ
ØH)Ö7 ş5)À®kÉdB|UtvaDÛÎ¾¦¥”Ïƒp|„Fl&0¸_‡*è3¦n'LEĞ/p•¦­m¦Üâœ&]ñËàì8fIˆÓr«S4Ëd7yœË`Ş
ân¥²åÎ¯ŠIùR¥Æÿ3Uô~×ëcínrF:_Û*äP…’ú}ƒ©-pÓTpŸlşr¨ÿÛœ³4LZÃ©OĞ 	
û‘
!ûP–LôB¬–î]–$K	™ˆ*ˆ++öˆ6Ô5°©÷v…ê¦š¤eÀàNÆŸûfĞ(ĞMN1ßœ’ï½6şéÎÇ&3(åÖaÓĞdöÏE,ÙUíz³<Û{‹Šè‰E›UÏ²˜¶‚Všö¯)Â9·Z[±–4^kdÂ—5†Á¼!JàÒé?°ÿQá3ûqBo¨C~ µÁ·MÂ¢ú’m<.vp“´Á¤IYÓ¦­“¶Z¶Y_p§›ó=al-ÙYü}NcçÍ™ËÎÉÅ‹4vjaÇÖvl¥©Á³'S†&ÙAÆ8Æ|Õ*~xâ£ûàè¸âŸ1%M0Ág%¡õ˜<€ä·ÍÒ­¿   ÿÿ PK     ! %eÚh  ­     xl/sharedStrings.xml´Y_oÛ6°ïp0Ğ-Å¸í†bè²­$ÆbÙµ•í-1±V‰ôDÊ©?Å÷ıöIv¤$7>Ò©‡mo‰xw¼ÿ÷;úüçOe^©\Š‹ŞË³=à"•Y.î/z·Éåé=Pš‰ŒRğ‹Ş–«ŞÏÁ×_+¥y…ºè­´^¿é÷Uºâ%SgrÍÜÉªdÿ­îûj]q–©çº,ú¯^¼xİ/Y.zÊZè‹Ş¯_õ ùï56_^¾ş¾œ«<8×AÂÓ•ÈSV@¸^WrÃŠó¾Îûæ´¡x-è§xê|	éW0ÄòìªÓü²¹¢ÂŒËŞ¨5KÑ•èÅ«ïyl-å¶ XÉÁ½Nd¼‚±ØäƒuĞ5	·tçüî“ø­Û§9Ş´}¾FÃvr•2”e™kÍùÎÚCnñPz#{Hì.ğˆv!=$šz€ö2L¤ùÙîRø¢ê¡òYå!›+¢“?(Nj›/ğŒ¸ÊïÓØŒˆ
G:ôËv…ğX×'ÙhóÙ«Í'8Ó95bÀì_µÓ="¡±š—»sÀö	(°í¥uáu‰9^ó*åB³{'ÏÓû©ût”ÆœN×>—*¹Îä…?Â¥Ü¸]jÀù@oÄ
Z×Úô€<ƒw^oLFıd4‡pÃò‚-ê®*döB)°tf¼²óG¤®jV1t/z(œ-Ãˆk”ª ¿3‘,p°àN¦FŸ´)áLÑ€¼£uÁ|ø†•ëŸ`Î™rótXîW{‚rêŠ—FHù‹™jãg„™	»§¯Í¸õÊÜÌu`Êä	„÷·×µ‚ÖÍy‘ë­1õ²YÇtÃ±áV„Ã¯jrœâÖ¥Ddài¢ƒ¼(|öÆ77¼ŸED†_-˜‡°DI„80½ˆ~ôKKJ¨mÁ£ÌÀà¥MO!LuíŞÿ*«sé}–õË²¿İn©ÚoQ¸‰SÂÍùZVš’tŠ=}j r Ì“\<1,¸)¬Ÿ!¯t~‡eâbî¢'HærË
T×Ä’^Õú3®¥:É¤¾‹Î–pòê™ÉVş)åJAÕ\äP6—«ıqÆ€øôŠì¿¶.ã‰¬íeW+lˆ ‘¤‚‡»y®¿U°Ê3·ƒ´`V/$Ìˆ»„hÎW.Al`ÚóDŒXÀT‚©7<Ÿ1ŒOš¯±ÇÑÁ,xÁSÓj‡R¨º@ ¯ÁÈ%¢üîk^v-¸é+üv7:3şG¾ôëKqº×ºš|§ê‰Ñ1ª«t…–¨\Eúi:‹bH¢x93üf<'ÑèÀéÛÛi&ãiìHL®Y~³ @Úyl1@Éü·2lÃN3ˆ°„qËÂ wµTÁÜ,Œ·®Xê´†…D'Xo˜&O”ôëÓ¹¦•Ù8O0Â¥ÇÅœ™$Çu…?ÂYôhÎSo¼\]gYÔ8¢·pÒ°ÙÔ­oÛnwcºa 7íMe“­Ü§&¹QÈñ;¨Ô1~Ú§).Ó¦¯¾ã¶Uk=å¢Ùe?ZŒ‡äş`ÆGtsôdŸcpš~ng:ÖïÂléØÁ›3¶µ°ã†+&LhIn<`E3h‡DhÃQlİu‰™ë6ÂG±}6bÀ
ë:ÂÌ¹inôk[ê³–'§Ïw6[%2S+'ÏwqW‚ßø?båbƒu)«-µ?¸^8 '°ooÃ8'ïÕ'ÓÛ8¡_Õ™pß'¾£da–á4|€e­µPı6…éG!
İ7(ÆTÚÅáÎt$Wb_gü	KtôÂ< ! #Ò‚˜BĞG`¾ÖúŒŞ¥¼öS—ó€ÙÆfÉœã{’2Í‘Ê[Š.éù®û´©CÏ;~U/•¹DhìQY®˜Áî$ß ¦Ü¨´i|3Ôˆ£K'†×ÑÛ[JéwÂ,|?‰âFa9öïù´…cï|…iÊlÎ¸Ñ¹#§4wøöÔqP‹‰¢`ÚWĞyŠİcBüá%·¸‹aCÇÍÄÓcƒ†¹cÄ™Ş6)#î —ß	ÓËËñpŞÀíÂuÂöØáì’êãn-]p˜fp°Ô¾Y:HËâzi'¤¨Ë¥ƒÖü
>â²­ˆ*³[ÙÀ+4ø|nØ	÷W>Zf}÷ú9/ª(>êÊ$Ç‰ƒm$—N)úoÂ-¶N„»J–0ÀÒ,Æä² Ë‘0û±¹I]Jaw¼‘3ÿÍ¸¦ öXç*Ï¶„£wa<tŸ'S\PÇ¼0°ëø S9ô×ŸÑÀİ‹ÆàªƒâÎkH€gø¨”#íÖ[QmÉ¼|ùÂnLÌ¾Õ0;Ä)ò»¥õ´¢~ñS#ôÇÚíı+VuKÂû’í±†Y³Ì>…åøBa¡ñÀAù;…ş¯šÌù—ÒƒÎMˆqb2‹ŸvŞê…0ÅÍm‹SşqBw˜ë:W^ 2\ñô#.¨Ú¤=Up‚[ÄÊIÔ]uRòVgòÙÃN/BØm?Ÿõñç¦ào   ÿÿ PK     ! `?Rø  ?Y     xl/worksheets/sheet7.xml”œ_sÛ¸Åß;ÓïàÑ{më¿í‰ÓiS@œvÛ>km%Ñ¬m¹²²Ù~û¼Ä¼N_ÖÙ/ àğ8„(|øóoOg¿î¯ûÃóídz~99Û=ßöÏ_n'ÿü©úÓÕäìõ´}~Ø>w·“ÿî^'şøÇ?|ø~8şòúu·;¹_o'_O§—›‹‹×û¯»§íëùáe÷ì®|>Ÿ¶'÷¿Ç/¯/Çİöa(ôôx1»¼\]<m÷Ïªáæø#u>Şßï>î¿=íOTÉq÷¸=¹ö¿~İ¿¼N>~>¡?~üğ²ı²ûÇîôÏ—şxöyúéĞ;àz9¹øøábŒzØ»ª|ÿÏ»Ï·“O³›şjæC†ˆíwß_Å¿ÏNÛŸÿ±{ÜİŸv¾ª³Óá¥Ù}>ım÷øx;ùËj69óÒü|8üâ‹*téÛ4ñ²½?íİQxµvá¯ÿ>×ÿ{l—/Ú([Prºî<ì>o¿=ş~ø^ïö_¾\S–¾øıáÑµÖı÷ìiïnèrrö´ımøû}ÿpúz;¹>¿Z.««µ»tÿíõtxú7]T®¸ ûË§‹ß-°æîo(pu>»ZN—«Ùï”Ë°¡îo(¹8Ÿ..ß+wÍåÜßPnşc›º,>rêî_(ûCŸ9u÷‹JúûÌÂ-Ï³åújZîçİ’!™>mOÛ‡ïg.Ùı­Ùú¡³¸™:é&ûsúº¿ÿå¯WıMåó´€»Í¾šOû;ìï¾wV#¨r°ÉA•“ƒ&6m:kßÒ×É±§.Õ¤4¡§ßN®Æİ9à4òcş×‹ë¿ºzî9Z%¯Ò‹šªšÇº¾œ¥á–Â2fµHcZ‰7¢#rİsw¸Ô=e÷:XŞ%K©¼ÇIyXŞQYş­Ì²ûp—‰—Qw&4eøœ«€l€Ô@‘Y¬Y1Pªb´@:&4ÉÊdsóÇ¨Ç¡Ÿ>d‰ ÓÀ“‘ÈDE  5D1@ H¤Ò3Áaê§O)„H¤Q"“òn(t;Y;Ùß»%n>OÜ&ÅW3ZÅq­iDQƒÈ"juˆzF8ı‚"%uó<ÕˆèZ5v	çòq”ry™«Då–CâDÍåDU
‘Fd5ˆ,¢Q‡¨gTPÉ/b­U¢$Şí»)¯1UŒ•¦H&*˜Èu)¬^#2ˆDQ‹¨CÔ3*Èäœ’L´EMî¼™sé%2 b”È´œæÉDå• *…µkDQƒÈ"juˆzF•ŞX~Î‡‘D%@.'¢jD
‘Fd5ˆ,¢Q‡¨gTĞäKá}i6½­8H ¢‘B¤D"‹¨EÔ!ê4ñ¡4šÈIÈÑDDPM9HNÍSNP°æ‚¢.…H#2ˆDQ‹¨CÔ3*ÈäwJ2y®`DD×ª)¡µFW0
šG»Y‡rÑ9*F"J#2ˆDQ‹¨(®¬=£‚J™ËW0ÏS•ˆ$*šÏG¾™BTH!Òˆ¢‘EÔ"êÍcS{F¨‰óıÅÌx¢	©	#©	#¿§2&Ót±J—°:Ö%¢æÙó¡ŠQá±Z#2ŒÜš¢š€b²Ú€b´XWÇH*Ç¨ \f¼C6ÍÀm3I”£ D9B"ªÆ‚
‘Fd5ˆ,¢QÇ(Ñ„šZĞÄûÜÂ<4#ÿ+¦k&¢·£D*÷^6Q”«KdÓ2ÛPø‰‘a”dU¿”ÙÄHfÓØˆ†]è‡Œ
ÊyŸ[Rü¯Tq5#”(Q5G	É"È jYD-¢Q’MÔÔ‚&ŞÕ–4!·+5ÿ[Í%šz/›ÆºD6Íó-®^ˆ©FI6QõI61’Ù46"f¡D9Bå2{-6’}ÍqÎÛí÷Q³‡F‰¢UcA…H#2ˆDQ‹¨c”hEM-h•ÙnÒjuîâ‡-àŸ/ôƒØuk>CkÎ(Ñ¢ŞËÄ±.‘‰‹loAá'jD†ÑUÜ§iŠ;c6 a›iØ§h±®Q¢.5µ ®w×bC&²¼£¢ìÙÇÅünş¼b”(
Q5Tˆ4"ƒ¨Adµˆ:F‰VÔÔ‚VŞc­FMÈ{Ëùˆ˜}ª¡DBïeÙX—Ì²lÓAqõâ5"Ãˆ¾ºò§	(úfP\[¬«c”(GM-(çxI9rèR9ğìÕŒP¢!§\˜~k(D‘	hh5kÂˆÈbTPl}Ç(Ñ„êBMæo8û'Î‰èZÅHjÂHjªJ°—©ÙWX½FdŠš4ˆ,¢6 !#)£‚LŞËRÇ=Ãf…L™(hgÕGÍã¬Z#Rˆ4"Ãè*:Ï£,¢QPœÚ{FM¼—-iB7*}7×[!Ú ª)D‘AÔ ²ˆZD¢QAïRKš{•š€õ®Ü8ÊÜÔQH!Òˆ¢‘EÔ"êõŒ
šxÿYÒ„|©Ô„H2v8(<²/}7ngÊÕˆ"È jYD-¢QÏ¨ “·%™È’J™ˆ$2Z;â†
lÏ¹ÈËäFô¸`!Rˆ4"ƒ¨Adµˆº€âBÚ3*Èä=dI&ò–R¦Ñ‡ŞVn¾ˆ6cÃHˆY#Rˆ4"ƒ¨Adµˆ:F.]Bë{FM¼W,iBRj¸šZ;×Sg#Œ¢~÷kŞš«ZÄ…N1òjDQƒÈ"juŒá¨ñá¼U,	GR
GDô£r¯¤@2J¾™[g›5—ßÌ)F¢vÈ jYD-¢Q¢5¾ ’7%•ÈTJ•Ø²FTÍ	¹Õ!äñ†Q¢Òt‘íÄÕ!*N
ŠQ"|¢Á¨‘EÔ"ê%2Ñ'¢L‹7¬ôÀ+ÍDô£b$eÂ¨‘B¤D"‹¨EÔ1’š0*hò†o^€of’hÂ¾Y¤FÕˆ"È jYD-¢Q¢	µ¾ É¾y¾™I¢	%yîºæ‚k·Üsz>©½¾f$‚AÔ ²ˆÚ€âøík£‚Jo8é8i&‰J”¨æºæ‚"Ja]‘AÔ ²ˆZF"M:D=£‚&Şæ&b¿*§_M2I4¡ ÑÛFÕŒÖN­1sà›9Ê¨ì‘^Ç¨0õFr«; hJm@1uZF‰rÜ!™M„
Êyç+”ƒF~…7l¦9“+J$Q”í´œŸ ªæª„îŠ‘¨K#2ˆDQË(ÑŠ›*µ"TĞÊ›dĞêÇ¶ºd°ãúÇDôµb$Ù`TÍè½L¤tÕÇLÌß÷ÕX»a$wºŠ{26 8E¶Œq©õU×[Qwß%Ïvºd]¥ DA	%‚BTÍU¹'«0U@±Ë‘AÔ ²ˆÚ€¢|]@2©©­¼!Zƒ“ŒªÔ„H¢	¡Dˆª€"È jYD-¢Q’?Ô®‚&Ş}–4!W*5g\-%š@TÍQBL…H#2ˆDQ‹¨c”hBMEMüƒDI“'Æ›‰èZÅHj‚Q5£ÄPÁ#‹
Q1ßu¨>®nQƒÈ"jŠËbNŒ
2e^ü½5Ğ}ùœ­LùĞ£cTÍHˆ¬0J#2ˆDQËHäO‡¨gTĞ*óèÿÏ×½îÁ>×zÅAB‘#¡nÍè50ü50…Ùß0’k`@qA°Å¤n%âRê9ª ®·âbƒDÌÖÀ%Yw1·1RUŒAÑòc”Âº4"ƒ¨AdµŒ„0¢QA+ïh…Va\’Ó•šI4!”hQ5Wõ^’c’Mëô[<Íu‰FD"‹¨e”(Ç’Ó¡‚rŞß–”#ß+•#"]-	%ÊATQŠ‘¨K#2ˆDQË(Ñ„›*5!TĞ$³öc6m_¾:L£Dˆª1Ja]šÑğÊğ6ñ4ÿ] ‰Q¡"‹Õ·Œ™¨©õUÉ;ÒRêS•©6»ZJd‚¨££$u¨ [Òƒ †£ÜÊPPôëj	:D=£‚&Ş‘–4!§*5O]-	%š@TQŠQ¢	4Õ ²ˆZF‰&ÜT9œ4ñ´¤	9U©	ØìjI(Ñ¢jŒRŒM¨`6œ²7¥tQ1uÆ‚Y¬¾ˆštˆzF(Óê>ğÄŸ3]«I™0ªÆ(…Qš‘ŸDÇÍ­e¶ke8ÈmÂIš€â0´X{ËH&¢QA¥Ì‡¹y6œI¢ÚpŒªÉ€€¢áÓˆ¢‘EÔÍcPL¦QA“Ì†š€Åö§9do¢2½İ{[#Rˆ4"ƒ¨Adµˆº€¢L=£‚&™{5—¼ÿ[!Ú ª)D‘AÔ ²ˆZD¢QAoñŠÌ¡˜ˆ™$c‡ƒÒWLò_bÁ‘B¤D"‹¨EÔ!êdò¾PÈ^Ù.øŠ|¤”H"¡äÕøù×$¾Xª)D‘AÔ ²ˆZD]@Ñ:õŒ
êy	êıØ¾øŠÜ§T¬sÅAÉR7FÅk‘­ëu(kWŒÄ}ÒÅªòÓ3É-€âœiŠÓUk«fÇH¬‡=£‚¶Şè‚¶oo‹¯ÈÇß1=®%z¢Ç‚
‘Fd5ˆ,¢QÇ(ÑŠšZĞÊÛQ¡Õ¸ M•šI4!”,ŠŒâ®]	¿šºÂİTˆ4"ƒ¨Adµˆº€b–õŒ
šx[Ò„ü­Ô„ˆ«)t­ZÚ ª)D‘AÔ ²ˆZD¢j²Îl÷{³ıŸã«p(>lV!*¢¢‘B¤D"‹¨EÔ!êæûä #¿ı%3è-µ\Öğ!O~Å“%Â8¸{¬îÈğ*ÿ£ëø Q!Ú ª)D‘AÔ ²73•ãm«0ö“şk7WŒOSî±tGğÎ?“fÆÑQH!Òˆ¢‘et]È„lûKkñu|0¼óßå´Á¨‘B¤D"Ë¨Ô¹l¡;Ç«ì#÷'ŞßËìşVëRÔ2ÛŞ”£r#SÊ^Tå¨ì-K]ŒZe?‹3å¨ìgMM9*{EÖ†¨BFùå´°:ùwn]ú$EèJ,O%ĞQH!Òˆ¢‘eTÊ¨7–^lTŞ9B¢'G	´AT#Rˆ4"ƒ¨Ad:w•­¡a¸<½sŒDO*DD5"…H#2ˆD–Q©sÉÓÜÍ7¬VŸÜ/‰ò;Ç(éïKÅLİ`TH!Òˆ¢‘eTê\²uä÷7m;MH×q[êÎı@qĞ!î—Vˆ6ˆjD
‘Fd5ˆl@ƒ;§U›ÎH¥C+ŸvÇ/Ã©¥¯g÷‡oÏnîv?§ÿøaÄtxª^^ß4nËÖù™üÊêòÆoyâ÷xxãş
WîŠ{é	¯¸W'nü‹xÅ}ÿ|ã¿]Æ+z¹vm|Ş¶åÊ])}ûUéÿÍ(Ö¶™¯oüOJW®Ü•r™kw¥¤{·öÆ¿:‹µ¹—Cşd­v§¸¶5˜9Üq…Úf®6w2@éŠÓÚıº¯¸ÃønüY{xÅ.nÜ©—ÈİÁt®Déóİ)cîJ¹ÌÜ]ŒÂÅØQw”­?Ã×n_öÏ¯gîœ]wœî¹3G:ôvø÷ÉÿJŞıËyÂŸ'w¢mø¿¯î¸á;òòÜÔÏ‡Ã)ük2Ÿüíåìõ~ûèNöïK{wªğp˜ğíäåp<·û“û°›ıÃíä¨ÈÑGüŸ    ÿÿ PK     ! 4‡†T
  1-     xl/worksheets/sheet5.xml”šİ“Ú8Àß¯êşÊïó1‰k˜­Ú`ìî;Ëxf¨0xH²÷ß_KêvKj“ì>eòSH-©Õ2zøå¯·cï[}¾šÓ4|¸zõiß<N/Óà÷ß’ÿ|z—ëîô´;6§zü¯¾¿<şû_ß›ó—Ëk]_{`át™¯×ë{Ôï_ö¯õÛîò¡y¯OĞòÜœßvWøïù¥y?×»'­ôvì‡ww“şÛîp
Œ…èüwl4ÏÏ‡}=kö_ßêÓÕ9×Çİúy=¼_‚Çí¡:?>¼ï^êm}ıı½:÷×ßš
 Œ2è?>ô[©§˜Rãïëçiğ9Œ¶ãP‰h‰?õ÷‹õwOüÏ¦ù¢²§ip§<ÖÇz¯ºĞÛÁ?ßêÏõñ8²Á‚÷_mşÊÁ={VêÔÛG¢~ªŸw_×Mó}^^^¯ĞïqÛ«Ùîº{|87ß{µ¼¼ïÔ£Á§ gd?ÜƒŞõõ°ÿòk£”•.*]…Ç‡½2óYái h03`¢45ˆ}ø 5@S«d°ÑÜWYø ğAi ]ÀF+_eíƒ¶˜¸´ÁQsfE“‚£ğ4øØÆbfÀÌ@tÕ²ûö8Ü=ô¿Á¬î)`­…0$5$ä0g†°¯¼U²}\_‹Vˆ|‚”†X¾V†°¯ªU²}…®¯u+D¾6‚l1¾úv„a]vEXa'Â?µ1[’ ¹kIj+eğs,»´Âv$l·4„í®`»•–İ5Za»$lwkˆ¶ëDiâFéÖ®¦õ©Äa—³á½ñÍö$$E¢ ÙÁHØr.´‚‚”HØò
	[®„ÖZ [$Ú²CuxY{ùVacf„ìi+Ppv2£¼ec$>Hà$–ÀI,÷U>(|PÀFW°ÑÊWYû`ãƒ­23ÂâêŒæÎÎEâ%Ç¡›Db–¢,’H”"²rV†ˆ·^ÎzvÖ¹,E‰JD–Ã"vX±ípì:\³9ÜH´EÔ‘)ƒWÜ¸!Vò‰µò4°³%!Şq)"ÎklNjÑÛ³n"‚kz0âMQ/ÇR¸[	w©ıÈİš„Øİ†»Û"’Ùuğ7‹&Ê ZŞÍ¯„¬+Q"QJˆ3aFˆ'&'Äæ•„ØüŠ›¯±ùµD‰¶„d¶¨’ê¥[] [m´MíÀ9Ó’Ó€g;$$EÂùÑ”äv*Ï…ÖBBÒ¶ì9P¤;Ah‡dÎyŞU3-	Cr+È‰›Bb–¢’H”"²rV†h|omÚÁàŞ5Ÿ“v!Q!QIHÈ€:»&ÕÓvChÚ¼2örh<0BNCÄË9E);ùîr”<Õzókè¯ô-:D¼ƒ­´;ã†&ƒC¼qUk’÷²"Ş·1\+µ£D¢”§…ŒÇ1'Ä¶©»­îDGZPõD»nÖ7Va¡ShLàn¥+ÑÏšÛ›w†„Wo,H"H*È\L	'“	§©Rh-Y	R!‘W¨ÎT+tm ÌYkm%-	+f÷à£»Ûc–j“	¢‘}Ø½’4GÄ®@â&œĞ3U’OÙR¢•D!™pBç,·–‹âv•”hIX@°¾¬(}r£”’ï”‘=Zßx‰2V	¶Ddå®!Şs•mÜI¡s ŞŞ9í²Pòî€qz_)RíÂbØ(Ú6ŠUZ;%êA‘Eh)ÑJ¢ŠL¡:ù­ÿ³©åİ!cíàÌqè%úõœ!E=dwœ#İZ_ş‘„†Œ!TíúºË…FmÔæ¨§–x«÷Ñ›¥…ì)AK­¡eìÍed˜¬„L…¤#ÿ¨3Ôšv¡)nG=‡ÊC»s¾L‰2nÁz÷ˆ%KÑ¢ZIT!‚@Ê-uuõÙPvÎÄ#ËÉ™¡wŞ'¡‘ræÔ/RRâ9ÍÙñ{P¢Œ“|ı‹Õ’„ì)4–Fœ+Ûç#LÊOjPÉ»5!Şç±D‰D©Ds‰2‰rBœ‘
BvşÁ®r¿–$Åh%QEHæŸ¡WzÜŠ¬:,V†7ÎhÍb	Ïc,H"HŠ„Ë	O~.´‚‚”Hä¶z*!èí¿^®Í[û{D[˜i¸ÊØEÄ ô*ùIqÇc‰‰RB¹ŒëÑ»<å$Å•„dzªc°M/Ÿ8æx´Ò‹–„ï/vıÄ“-!ÄNq.É°»œÔ~änABì® ÄîJDÚ“K†`Üü­İAç„–ws	!Ş ±D‰D)!N	!N	9!6¿¨¨$Ô‘ÔAfÍø­A[)A¥gK£%íy=ÂÓ’’
2$$GÒ±İÂZÒ&½ò›1áB¯Û:åŞ;Àc¢<AälqÉ !^ˆ9¢…èÜ)­.›o×ÜåÊquœy°÷$%)^\9"é{äì[s»(JLìpBïR–¢”]Š"êğí6–oÿB˜ŒqÆ}ï›„¬a#êpí
–kÿ"”Œq\w¥lßuø¾‘tábåÖ¡	§Z8	qµ6Gôã
…:ú÷ó¢Ú^EˆW,Q"Q*Ñ\¢L¢œÌxPW:ùëç¾ú;”ñ4wŠ $VÆ$$d.H&H.ÈBBR¥ +A*AÖ‚lÙ"‘9y¤†#Ds;ÉÌ¸_~BïÒ¹E©¥{#ùüä¿EÒaâF2ùÉx†Šl:bB¼î‰R‰æeå-$*$*%ZJ´’¨’h-Ñ†g¿-"_•H»Ö‚æÎZ@õÅwCˆsİQ‡£§ËØ?]fH†|VÇ„xg'¥Í%Ê$Ê%ZHTHTJ´”h%Q%ÑZ¢!¾ŸmuÄWoÖ¦¾•W){BIà„x»Ä%¥Í%Ê$Ê%ZHTHTJ´”h%Q%ÑZ¢DêÙ—u¢™g~æ¹Ü[}~ÑOó.½}óõ,¬ßÇ‡›÷P1Fª„ä·Œî"U­uµ EÏ‰Ğ	¡EwH´¡EïT¯e6Fê(ı|‚5¸›Ê¸GêÖ*[àb©Kl²¬éZÙëA"õ‰´C'C‹Şö|ÿÔ×í.{ĞÑDèL@GgÑr-]:IqƒÈÒü¢©G»Z&ĞÒå~&…w™]:Is
õ ´?#@K×Há7HıP!ufƒ;èA×Ú™ĞÒ¥¯Z"õ@EZƒĞÒ¥S¢M§<«€–.„­+³QÏ;¼"xZØÁÇ¼›“¼E›.ùjm´|¿|xi«í–»óËátéëgØ¥w :›7°úïkó®)”©6Wø"Eÿ{…÷Å5<e½û ƒç¦¹Ò Søøë{ï²ßáğÔ›óë×ÃÓàÏœ¡í½oÑáiœ³'¯~ûØùñÿ   ÿÿ PK     ! O—fâ  ¡     xl/worksheets/sheet6.xml”™Is£F€ï©Ê ¸Ç y¡$MU%ÀåJfrg$dQ#	°=ù÷y½ÑËkÇÎÉÖÇ[zyKC/¾ü<½×ºë›ö¼ôƒ«©ïÕçm»kÎÏKÿÛWòÛ­ïõCuŞUÇö\/ıêŞÿ²úõ—Å[Ûıèu=x`áÜ/ıÃ0\âÉ¤ßêSÕ_µ—úOömwªøÙ=OúKWW;¦t:NÂéôzrªš³Ï-Äİgl´û}³­“vûrªÏ7ÒÕÇj€ñ÷‡æÒû«óğÔ­—ê¹ş³¾]:oß_Û' 0K²ZLF©]¦èü½®Ş/ıû0~Œn©“ø«©ßzíNü{Ûş Ö»¥?¥ëc½¥Cğ*øóZß×ÇãÒßsX¼¿™Uø?.à÷è™ªËQè>[0ğ®ŞW/Çáöí¡nŒ›©³Q%ÕP­]ûæÁª…àåRÑ=ˆâ ò=.{uŞ‡C³ıñ{K•©k¡ 2ºÂj±¥fî)^úÌ		×T“ÔÄ7làmt9s»¤xé³Õæ.9¸30fº™¯« š.&¯°V[9ŒQHŒ ’q²ÁOô‘Ğ=ÑVKNbc$DwjöœÌ¢‘A¦#É8aJ†×kÓë{{$GCÅaÏ”áD¶|3!ˆd‚„h?n>73´8–b#f8ĞbÆÄ,fØÌÖ¨@ÜØ*¹
”à@¼sÏƒbcû9°1´q‘Œˆ|zœ¨ ßŒJzĞ¦¯|’¾
DJNA‘äÜ>Æy2‡@3p>7Ç’
!=$R!›	¤2h-ˆ6uA´4Ë¥%•g…DÊx)Î´ 0§úQª1y3×$Ò’#‚Q&Ë7¾Ù©¡o$RæsŒ
ŒJ‰p:ÿ»ĞFáJhÆŒDKiD"™ ZV¢¥5ÒÊ))Á©Ğšï¨QŒ›A>öäAÙQ>JÉ”#Â”‰2ôG7JOw83æJJZ/0*re9í>®à]I¥]ÂN&p^P¹™
dä4×›©ØÍ„”Ò[¢Œóc„Ğ•»£Ç#Z„5w¥îÎè§ílÚT?ÌrÑ	ÕTf_¥aŠÁ(“HÏrd~#¥”ù££R"G–]¢óÃ“^@Ûà¸L38O±ªtÏ¸™åvM…ŒÊ{‚H&ˆ#i+r9æ-j3ÛËÌJ¼$BÊuŠÁ(“ˆ£/¡Ñ ÕB0nÔA ‹Œ´Zqê±NÄ!bÍ2"¸ƒ…F{›åf2y³ƒI¤‚/Åˆ`”I„ƒ/4ZÌû£‚Ò%ßKŒ£­9IP 	9Ñö‚H†È"kD6ˆäˆˆ”ˆ<
‚C?¤mÃúŒ›¡’cÍîÌn
ù™‰v"JH¶ŒŠ”Õ[ÓêZ(¨ÀÈù¹È…t ½¶W)…Ô–>
äˆnZå]ËÃ«¿ê#i(úŞ8Ÿ¹õ.H”\€G®¦¡$¯ŞºkNf†k«èÀ¬_©>ğ(Ãõ'K÷˜ÓTŞÊiÔÖ¥!B££ ÉU[c´ÁŠ9FF%F9
‹Õ£>îjá;Í…q£«	¢Ş[!H&D;»"Ë¤•#R R
‚‹FôNbÜ(‚Xo¦öš’’L0ÊÒÏ®©\Ø(=•†AtcÖ•\II‡F¥@³kd5=™Œ›@%?8^¦BM?ÍJ¤b>ˆ¥+]Cî6‚hGå\ZRo…DÊx)®‘»“úŞö¥ÚÓø¹Êöùn\ªmVfĞ<ÉbD0Ê$Rl-‘šÈF"UxrŒ
ŒJ‰pÎGz„"öáA6Ò»ÆÍxeØÈxAT~§ˆD2Ay©·Í¯İ1’ˆ+-¯Í,I•”Ì‚Q&+KhÁ—ÍSï*i“ˆ-jSŒ”àRÚW&¤Q«—iĞ{gËÆ0åïğ™FÎ4¯ê,rU¥Œ2‰´8âŸïùgğSİ=³Oî½·m_ÎpV€Sìj1bş]?‰¦1­0ô$€'lTÖ¨}1-cXÊ<qé@$€5–µdÃ‡j‡­»¾åaÌcøÂŒù&€Qñ…µ=D7à›E±ıä.&N
¾(¸¼ÌÀ‹ëÉ}pÓW-¬gÖ˜Iñ8GÆô˜ˆŸÀ1t\óLCXIÖl´ÛëIkCÜk70¾'À&£ÜìĞK¢²ê›sïë=DÏô
Â»ãw.ìÿ¡½0
5è{;@‰–¿pŸUÃÕÉô
^`öm;ÈàD\>½\¼~[áÚéNm×Àµ»­ZúG¸Vƒg—¼ÅÍnéwë‹¨Éx¹¶ú  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings5.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings4.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings2.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings3.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     ! ÏàG´Á  ,  '   xl/printerSettings/printerSettings7.binìT1kÛ`}¶’ÆõÒ
Y2„©ØÔÆrÛ­1–’ºH•dã%ƒ‰U¸’‘BbR(ıı!3fìÈÜ¡”ü€,íûT…“Ás'î»{ïÎgùlD8BŠ3úGdØ†K!ÎóŒ¬bìã!+­hO®á>×^– ŸÕ¤2f|†a¹Ì8,k<-„œ–ñLòŸ\©èW±LWñ7í çëE)FïCWØÕjoçŸÿ­-æ«9ñ4ŸµXü8¸{¯–¹í›|;x¯z×q9xÿ’š<;¨ÃÄ+´ÈÕé^ó©³§EŞdÖ Ö‰›Œ]¢Ú9:çDÏôËB?Òp¦2w4S?:a™A`zpÒ(Œ³Q%1\Ç¼N/€Î’ÉqÎ1u¦*k¢›L’ÔNÆáßLıâ{«m İ°ïîş­:İÙbù]£ß–œŠşãÄşz³önó²ıå;9«¨¡Â¤0Õ«ğ‹"*¼G(¼Ş?á9Æ'î µYúÜ7j¸1›á„õc6/v:¬ÅKöv9ãSÎ÷ù	õ}j“eäÄDQ@DQ@DQ@DQ@XF?   ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings6.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     !  .À©Ã  ,  '   xl/printerSettings/printerSettings1.binìTAKa}›Õ½T¡àÅCOÅĞ„¬m=µawm•]³dñRJh¶°`wÃfEZ© şˆÇ=úzîAÄàEß¬+”à!=;³Ì7óŞÌNò=’ñã+2¤Ñ¿!ÇKÄ1’"ÏÉ
ã`™1e>ûƒà…ùÚ@.çÒê€ñ9v+‚w+&O§å<³Ç†ü'g”ı+t‰·´›¡U–Šàln÷–qsuáıçÃ£kãùtAÌÓŠŸ¿«I®|Î¦ĞïnIï<Îpˆ:ŞÁâ¿¤ÏjpñMr5ºƒ·|jìi’w™Õ‰-â£MÔÄZ~qbÇÏC/‰³h$YĞFYÿŒà¹İ®ÛA;‹£$ïçqšÀkm;¡İ
Ü/¶½^G'¥{ûE…i{(Yvº—f~:ˆî3ùŞb«Àåøw?./‘¿¢›ô£]µşø'×3Ÿ¯_óÊªLJ“^Á¯Ê(ø}Gğ<xÿ”{fß¹d³ô¸odè3á€õ6w¶YK&ìµ9ã†œòù<Ùd995U@PTU@PTU@PTU@P&Qà  ÿÿ PK     ! Æ•S_  œ   docProps/core.xml ¢(                                                                                                                                                                                                                                                                  Œ’ËnÂ0D÷•ú–÷‰cS"j… õÁ

RÓ‡º³ìDMœÈvü}M !¨]tiÏÜã™+'“]Y o06¯ôÓ0Â´¬T®×cü’MƒFÖ	­DQiã=X<I¯¯YsYXšªãr°È“´å²ãs5'ÄÊ”Â†Ş¡½¸ªL)œ?š5©…ük ,ŠbR‚J8AÀ îˆø„T²CÖ_¦h J( í,¡!%g¯SÚ?¥ç,s·¯}§SÜ>[É£Ø¹w6ïŒÛí6Üš>?%ïóÙsS5ÈõaWpš(É¥á*“ÎĞ#zBôŠ	éİvXëæ~İ«ÔİşÒú[n'–&×TÊ"4
XœÑ[N‡œÅ	9Íµ&¥i~Ì
ù.üØ¼UŞ÷ÙŸy,£1¿òÁÈóZWÓÇ¿ÚËSğÿãŒEœQÎúÄ6¡/ÿSú  ÿÿ PK     ! lL“¹Â  ¹   docProps/app.xml ¢(                                                                                                                                                                                                                                                                  œ“QoÚ0Çß'í;D~/¨Z'd\!š©“Æ@$¥Ï®s!V;²¯ìÓÏI$OËÓùşçËÏŸÙã±ÒQÎ+kd:‰IFÚ\™Ã‚¼d?î¾“È£0¹ĞÖÀ‚œÀ“GşõÛ:[ƒC>
-Œ_±Sêe	•ğ“ › ÖUÃÒ¨-
%áÉÊ
ÒY£pD09äwõ¥!é;Îüß¦¹•-Ÿßg§: s¶¬k­¤ÀpJ¾VÒYoŒ’£ÍèPd.ùáxÌèpÉR)4¬Bc^íÑk‚=ƒhMÛ
å<gÎh]äÕŸ`ÛŒDoÂC‹³ pJXmY¿èb]{tüÕºw_ g4ôÉ.ÖcuÏº‚ŒÛ=HÆˆ™B~Sl…ÃÄCâ¡çíq¤5èDwÀ!ä7MvûŸ«ä¦¶^şŞn^“İM1Í6»ÛÛ’ªÖö-óFÜ¿ü­õ±çZ+/'á^Ãìyùw)I[k§Ãİ#“>ÙòK™wÿRgöI œ¯}œdi)äaRÎú5ÁÃ;İ6Y•Â ?×ü+´Cºï_"ŸÎ&qøºÙ<ç½¾9ş  ÿÿ PK-      ! íú¢  4                   [Content_Types].xmlPK-      ! µU0#õ   L               ±  _rels/.relsPK-      ! ÉöT‰'  	                 xl/_rels/workbook.xml.relsPK-      ! ¯Ù¹N¼  S               	  xl/workbook.xmlPK-      ! –6"ğ[  wP               í
  xl/worksheets/sheet4.xmlPK-      ! ³XG‹  '               ~  xl/worksheets/sheet2.xmlPK-      ! ;m2KÁ   B  #             A$  xl/worksheets/_rels/sheet1.xml.relsPK-      ! Ä,Â   B  #             C%  xl/worksheets/_rels/sheet2.xml.relsPK-      ! 4¡	’Â   B  #             F&  xl/worksheets/_rels/sheet3.xml.relsPK-      ! C–£Â   B  #             I'  xl/worksheets/_rels/sheet4.xml.relsPK-      ! dó4"Â   B  #             L(  xl/worksheets/_rels/sheet5.xml.relsPK-      ! LZ*zÂ   B  #             O)  xl/worksheets/_rels/sheet6.xml.relsPK-      ! k?ûÃ   B  #             R*  xl/worksheets/_rels/sheet7.xml.relsPK-      ! àñ—"<  "K               V+  xl/worksheets/sheet3.xmlPK-      ! ºNÈ  ñP               È:  xl/worksheets/sheet1.xmlPK-      ! Â~¼  K               K  xl/styles.xmlPK-      ! é¦%¸‚  S               ôR  xl/theme/theme1.xmlPK-      ! %eÚh  ­               §Y  xl/sharedStrings.xmlPK-      ! `?Rø  ?Y               Aa  xl/worksheets/sheet7.xmlPK-      ! 4‡†T
  1-               or  xl/worksheets/sheet5.xmlPK-      ! O—fâ  ¡               ù|  xl/worksheets/sheet6.xmlPK-      !  .À©Ã  ,  '             „  xl/printerSettings/printerSettings5.binPK-      !  .À©Ã  ,  '             †  xl/printerSettings/printerSettings4.binPK-      !  .À©Ã  ,  '             !ˆ  xl/printerSettings/printerSettings2.binPK-      !  .À©Ã  ,  '             )Š  xl/printerSettings/printerSettings3.binPK-      ! ÏàG´Á  ,  '             1Œ  xl/printerSettings/printerSettings7.binPK-      !  .À©Ã  ,  '             7  xl/printerSettings/printerSettings6.binPK-      !  .À©Ã  ,  '             ?  xl/printerSettings/printerSettings1.binPK-      ! Æ•S_  œ               G’  docProps/core.xmlPK-      ! lL“¹Â  ¹               İ”  docProps/app.xmlPK      ®  Õ—                                                                                                                                                                                                                                                                                                                                                                                          <button type="button" class="check-answer ${check.status === 'Y' ? 'selected yes' : ''}" data-check-status="${index}" data-status-value="Y" onclick="setChecklistCheckStatus(${index}, 'Y')">Yes</button>
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
     TAB D â€” DEDUCTIONS
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
              <th>AMOUNT â‚¹</th>
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
                  â‚¹ ${money(
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
     TAB E â€” BOOKS & DOCUMENTS
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
     TAB G â€” CONDITIONAL QUERIES FORM
     ------------------------------------------------------- */

  if (state.checklistTab === 'G') {
    const query = data.query_form || {};
    const unifiedQueryText = String(data.result_details?.remarks ?? query.query_text ?? '');
    const defaultParty = data.register?.party || data.party || data.file_details?.work_contractor || '';
    return `
      <div class="contractor-style-scope contractor-tab-g"><section class="checklist-query-form">
        <div class="query-form-heading">
          <div>
            <div class="eyebrow">FORM-2 Â· QUERY DETAILS</div>
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
            <p class="muted query-help">JPG, JPEG, PNG or WEBP Â· Maximum 7 MB</p>
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
                <label>Amount (â‚¹) *</label>
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
                <p class="muted query-saved-images-empty">Loading saved imagesâ€¦</p>
              </div>
              <div class="query-full-width query-ai-action-after-images">
                <button type="button" class="btn query-ai-button" id="cl-query-extract-btn" onclick="extractChecklistQueryWithGemini()">âœ¦ Extract Details with AI</button>
              </div>
              <p class="query-review-note query-full-width">AI-filled fields are marked after extraction. Review all values before saving; unclear or missing values are left blank.</p>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /* -------------------------------------------------------
     TAB F â€” RESULT
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
          <label for="clPaymentPassed">Payment Passed (Net Amt.) â‚¹</label>
          <input id="clPaymentPassed" name="payment_passed" type="number" min="0" step="0.01"
            value="${esc(paymentDisabled ? '' : (result.payment_passed ?? ''))}"
            oninput="validateChecklistPaymentPassed()"
            ${paymentDisabled ? 'disabled aria-disabled="true" placeholder="Select Yes to enable"' : ''}>
          <small id="clPaymentPassedError" class="validation-message" role="alert"></small>
          ${paymentDisabled ? '<small class="muted">Disabled unless Amount Approved is Yes.</small>' : ''}
        </div>
        <div class="card" style="grid-column:1/-1;background:#f7fafc">
          <span class="muted">Proposed for Payment (Net Amt.) is calculated from deductions:</span>
          <b>â‚¹ ${money(calculateNet(data))}</b>
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
  container.innerHTML = '<div class="query-saved-images-heading">Saved query images</div><p class="query-saved-images-empty">Loading saved imagesâ€¦</p>';
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
          <button type="button" class="query-saved-image-delete" aria-label="Delete ${esc(doc.original_filename || 'saved image')}" title="Delete image" onclick="deleteChecklistQueryImage('${esc(doc.id)}', this)">Ã—</button>
          <a class="query-saved-image-open" href="${esc(doc.view_url || '')}" target="_blank" rel="noopener noreferrer" title="Open ${esc(doc.original_filename || 'saved image')}">
            <img src="${esc(doc.view_url || '')}" alt="${esc(doc.original_filename || 'Saved query image')}" loading="lazy">
            <span class="query-saved-image-name">${esc(doc.original_filename || 'Saved image')}</span>
            <span class="query-saved-image-meta">${esc(formatFileSize(doc.final_size_bytes || 0))}${doc.uploaded_at ? ` Â· ${esc(new Date(doc.uploaded_at).toLocaleDateString())}` : ''}</span>
          </a>
        </div>
      `).join('')}
    </div>`;
}


async function deleteChecklistQueryImage(documentId, button) {
  if (!documentId || button?.disabled) return;
  if (!window.confirm('Delete this saved image? This cannot be undone.')) return;
  const originalText = button?.textContent || 'Ã—';
  if (button) { button.disabled = true; button.textContent = 'â€¦'; }
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
  button.textContent = 'Extractingâ€¦';
  if (status) status.textContent = 'Loading saved query imagesâ€¦';
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
    if (status) status.textContent = `Extracting from ${documents.length} saved image(s) with the configured OCR engineâ€¦`;
    const results = [];
    for (let index = 0; index < documents.length; index++) {
      const doc = documents[index];
      if (status) status.textContent = `Extracting saved image ${index + 1} of ${documents.length}â€¦`;
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
    if (button) { button.disabled = false; button.textContent = 'âœ¦ Extract Details with AI'; }
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
  button.textContent = 'Savingâ€¦';
  if (status) status.textContent = 'Validating, optimizing and saving the image securelyâ€¦';
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
  if (net) net.textContent = `â‚¹ ${money(data.net_eligible)}`;
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
  if (net) net.textContent = `â‚¹ ${money(calculateNet(data))}`;
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
    if (error) error.textContent = `Amount exceeded the NET ELIGIBLE limit of â‚¹${money(limit)} and was cleared. Enter a correct amount.`;
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
     TAB G â€” QUERIES FORM
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
    } â€¢ NO: ${
      values.filter(
        x => x.status === 'NO'
      ).length
    } â€¢ N/A: ${
      values.filter(
        x => x.status === 'N/A'
      ).length
    } â€¢ Pending: ${
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


// Shared Remaining Fund calculator. Supports category-specific field names and
// repeated fields in Manpower without relying on a single querySelector match.
window.updateRemainingFundBalance = function(prefix) {
  const form = document.getElementById('clForm');
  if (!form) return;

  const updateGroup = (scope, key) => {
    if (!scope) return false;
    const sanctioned = scope.querySelector(`[name="${key}_amount_sanctioned"]`);
    const paid = scope.querySelector(`[name="${key}_payment_till_date"]`);
    const balance = scope.querySelector(`[name="${key}_remaining_balance"]`);
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
    return true;
  };

  if (prefix) {
    // Prefer the matching section so repeated category fields don't interfere.
    const sections = Array.from(form.querySelectorAll('.contractor-design-section'));
    for (const section of sections) {
      if (updateGroup(section, prefix)) return;
    }
    updateGroup(form, prefix);
    return;
  }

  const fields = Array.from(form.querySelectorAll('input[name$="_amount_sanctioned"]'));
  fields.forEach(field => {
    const key = field.name.slice(0, -'_amount_sanctioned'.length);
    updateGroup(field.closest('.contractor-design-section') || form, key);
  });
};
function handleRemainingFundInput(event) {
  const field = event.target;
  if (!field || !field.name || !field.closest || !field.closest('#clForm')) return;
  const suffix = field.name.endsWith('_amount_sanctioned') ? '_amount_sanctioned' :
    field.name.endsWith('_payment_till_date') ? '_payment_till_date' : null;
  if (!suffix) return;
  window.updateRemainingFundBalance(field.name.slice(0, -suffix.length));
}
document.addEventListener('input', handleRemainingFundInput);
document.addEventListener('change', handleRemainingFundInput);
                                            if (!field || !field.name || !field.closest || !field.closest('#clForm')) return;
  const suffix = field.name.endsWith('_amount_sanctioned') ? '_amount_sanctioned' :
    field.name.endsWith('_payment_till_date') ? '_payment_till_date' : null;
  if (!suffix) return;
  window.updateRemainingFundBalance(field.name.slice(0, -suffix.length));
}
document.addEventListener('input', handleRemainingFundInput);
document.addEventListener('change', handleRemainingFundInput);
                                             =\"btn btn-secondary\" data-newspaper-host=\"store-newspaper-extra-rows\" data-newspaper-prefix=\"store_tender_newspaper_name\" onclick=\"addTenderNewspaper(this)\">+ Add Newspaper</button>`)),
        panel('5. Tender Committee Approval', statusGroup('store_tender_committee_approval_status','Tender Committee Approval',approvalDetails('store_tender_committee_approval','Tender Committee Approval'))),
        panel('6. Purchase Order', clField('store_purchase_order_no','No.',saved('store_purchase_order_no')) + clField('store_purchase_order_date','Date',saved('store_purchase_order_date'),'date')),
        panel('7. Details of Inventory', `<div style="grid-column:1/-1;overflow-x:auto"><table class="store-inventory-table" style="width:100%;border-collapse:collapse;min-width:760px"><thead><tr>${['Sr. no.','HSN','Name','Quantity','Amount',''].map(h=>`<th style="text-align:left;padding:10px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:600">${h}</th>`).join('')}</tr></thead><tbody id="storeInventoryRows">${[0].map(i=>`<tr class="store-inventory-row">${[['sr_no','Sr. no.'],['hsn','HSN'],['name','Name'],['quantity','Quantity'],['amount','Amount']].map(([field,label])=>`<td style="padding:8px;border:1px solid #cbd5e1"><input aria-label="${label}" name="store_inventory_${i}_${field}" value="${esc(saved(`store_inventory_${i}_${field}`))}" ${field==='quantity'||field==='amount'?'type=number':''} style="width:100%;min-width:90px;box-sizing:border-box"></td>`).join('')}<td style="padding:8px;border:1px solid #cbd5e1;text-align:center"></td></tr>`).join('')}</tbody></table><button type="button" class="btn btn-secondary" style="margin-top:12px" onclick="(function(){var body=document.getElementById('storeInventoryRows');var i=body.querySelectorAll('.store-inventory-row').length;var tr=body.insertRow();tr.className='store-inventory-row';['sr_no','hsn','name','quantity','amount'].forEach(function(field){var td=tr.insertCell();td.style.padding='8px';td.style.border='1px solid #cbd5e1';var inp=document.createElement('input');inp.name='store_inventory_'+i+'_'+field;inp.setAttribute('aria-label',field);inp.style.cssText='width:100%;min-width:90px;box-sizing:border-box';if(field==='quantity'||field==='amount')inp.type='number';td.appendChild(inp);});var td=tr.insertCell();td.style.padding='8px';td.style.border='1px solid #cbd5e1';td.style.textAlign='center';var rm=document.createElement('button');rm.type='button';rm.className='btn btn-secondary';rm.textContent='Remove';rm.onclick=function(){tr.remove();};td.appendChild(rm);})();">+ Add row</button></div>`),
        panel('8. Supply & Acknowledgement', clField('store_date_supply_as_per_po','Date of Supply (as per PO)',saved('store_date_supply_as_per_po'),'date') + clField('store_actual_date_supply','Actual Date of Supply',saved('store_actual_date_supply'),'date') + clField('store_extended_date_supply','Extended Date',saved('store_extended_date_supply'),'date') + clField('store_extended_date_reason','Reason',saved('store_extended_date_reason')) + statusGroup('store_acknowledgement_store_keeper_status','Acknowledgement of Store Keeper')),
        panel('9. Panel Provision & Bill Details', statusGroup('store_panel_provision_status','Panel Provision as per Agreement')),
        panel('10. Bill Details', `<div class="contractor-subsection store-bill-details-box" style="grid-column:1/-1;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><div class="form-grid store-bill-fields"><div class="field"><label>Bill Type</label><select name="store_bill_type"><option value="">Select...</option>${['RA bill','Final'].map(v=>`<option value="${v}" ${saved('store_bill_type')===v?'selected':''}>${v}</option>`).join('')}</select></div>${clField('store_bill_no','Bill No.',saved('store_bill_no'))}${clField('bill_amount', 'Bill Amount (Rs.)', saved('bill_amount'), 'number').replace('<input', '<input min="0" step="0.01" oninput="updateChecklistGrossFromFileDetails(this.value)"')}</div></div>`),
        panel('11. Remaining Fund in Scheme after Payment', clField('store_amount_sanctioned','Amount Sanctioned',{
  "users": [
    {
      "id": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "mobile": "9999999999",
      "name": "System Administrator",
      "role": "admin",
      "active": true,
      "password_hash": "pbkdf2$120000$47865dd37e8f5e18d43684b8e658cb6e$b587da9b64e5d5485a220439c9ccd040f78772ed6baf5fc65943ac0ec08415117f4d5675db4b3b0c283efd5d6981c709649fe0928ae7b589a9696bfabe87f0f8",
      "created_at": "2026-10-08T08:19:57.431Z"
    }
  ],
  "districts": [
    {
      "id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon",
      "active": true
    },
    {
      "id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod",
      "active": true
    },
    {
      "id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha",
      "active": true
    },
    {
      "id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara",
      "active": true
    },
    {
      "id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg",
      "active": true
    }
  ],
  "ulbs": [
    {
      "id": "19a4737a-b927-4680-8fe4-d83c06042b8f",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 01",
      "code": "RAJ-01",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "06bcf8f8-c3dc-4888-8baa-b50047eee3ea",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 02",
      "code": "RAJ-02",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "ae4b5c60-959c-4dda-aff7-a8e734f1994f",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 03",
      "code": "RAJ-03",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "ab2beb2f-9723-41aa-b2b5-3ae0e4fe59f6",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 04",
      "code": "RAJ-04",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "9495bade-08d1-4a27-a56c-39745ab7b62a",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 05",
      "code": "RAJ-05",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "4a680aee-5a2a-499c-b9d7-37c238fdaf96",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 06",
      "code": "RAJ-06",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "c02c2034-e5d3-4cff-a59b-a978367e5044",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 07",
      "code": "RAJ-07",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "8cccf7ac-c8fa-4f0c-a439-0e67f5b309aa",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 08",
      "code": "RAJ-08",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "353ef10a-9dae-4fad-8345-15f5a9ab5190",
      "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
      "name": "Rajnandgaon - ULB 09",
      "code": "RAJ-09",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "9b25b427-0ab8-412a-90cc-6fbece9ac5a4",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 01",
      "code": "BAL-01",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "9565dac4-84a4-4fa1-a2e0-0f5dff0201c0",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 02",
      "code": "BAL-02",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "43c3cc33-fbbf-4b0a-8a9a-690959e8e669",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 03",
      "code": "BAL-03",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "975de598-7b4a-468b-94c5-fc199ec4f43e",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 04",
      "code": "BAL-04",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "be2ca441-5290-49af-a7da-4f061fd9e2ba",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 05",
      "code": "BAL-05",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "e5a44acc-bc43-413b-af06-8ba339781cb9",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 06",
      "code": "BAL-06",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "27c613e2-0c2e-4e2b-af2a-8d9e25567994",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 07",
      "code": "BAL-07",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "7e7fb45e-933b-44c2-a7e8-ead626c8084a",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 08",
      "code": "BAL-08",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "f4eea35a-b96c-4b1b-8e18-76e4dfe38f26",
      "district_id": "43e45ec9-15a0-4f44-876b-898dee7a1a65",
      "name": "Balod - ULB 09",
      "code": "BAL-09",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "bdb38b57-112c-49fa-8fc0-d4edd0081fea",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 01",
      "code": "KAW-01",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "ed11213d-9145-45d6-ae48-453abd97c693",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 02",
      "code": "KAW-02",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "424c7e26-b59e-4739-802b-f8d8618f96a0",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 03",
      "code": "KAW-03",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "c18c30ae-815c-4a5c-986a-244b75bc7c9a",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 04",
      "code": "KAW-04",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "138f7b4f-5fad-4c28-a5ab-9c2bce9b505c",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 05",
      "code": "KAW-05",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "b6a71182-0ad1-4e2d-90b5-441f035ece56",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 06",
      "code": "KAW-06",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "9e422161-6e94-4292-b00f-f4124ce630f8",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 07",
      "code": "KAW-07",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "ced3e09c-436f-482a-ae79-ee87652c920d",
      "district_id": "0d340d4a-1c23-4c8b-9434-cc880f275d3c",
      "name": "Kawardha - ULB 08",
      "code": "KAW-08",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "5d94fcd7-0e8b-4a34-ac8a-221213dbead3",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 01",
      "code": "BEM-01",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "4926122b-2bd4-48af-b153-bd401f6a0280",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 02",
      "code": "BEM-02",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "e65a2364-c71a-4862-915b-b95d5b540588",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 03",
      "code": "BEM-03",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "3a7cb174-87e1-41c4-ae42-092b58a84068",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 04",
      "code": "BEM-04",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "8fadc846-de65-4bd0-b467-b350fa234760",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 05",
      "code": "BEM-05",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "7bf183a8-2307-45fa-9f44-984bec6f241f",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 06",
      "code": "BEM-06",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "f6c2f604-6a5c-4765-abb9-1a599a2df9d1",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 07",
      "code": "BEM-07",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "59adf61a-4f32-402f-981d-15a3f158bb9a",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 08",
      "code": "BEM-08",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "5151e4c2-3b1f-4e7c-9e96-7c3b42d07004",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 09",
      "code": "BEM-09",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "54dd3a98-c81d-4d20-9f1d-bef6157cf777",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 10",
      "code": "BEM-10",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "6211f051-4096-4b53-b85c-92a55a6e1d20",
      "district_id": "ddbe7ca5-0b88-43e5-bdb9-901593d7291b",
      "name": "Bemetara - ULB 11",
      "code": "BEM-11",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "a994cd3f-e713-49a4-8623-4dc7cd33a667",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 01",
      "code": "DUR-01",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "328cd2cd-108e-45d9-a6a4-2c93bd41d7e2",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 02",
      "code": "DUR-02",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "63eed8d1-c32c-47be-abfb-033d38ce48be",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 03",
      "code": "DUR-03",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "e5149743-08dd-4ccd-ae5b-b5082d36b366",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 04",
      "code": "DUR-04",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "4f5fb4ec-8ebe-4e7f-946f-eb2585c6e377",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 05",
      "code": "DUR-05",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "29404306-ddb0-43e6-976b-27f09ac2b54d",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 06",
      "code": "DUR-06",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "bb505678-d04b-4f41-b0e8-4277187be460",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 07",
      "code": "DUR-07",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "128e1dc8-3570-414a-8eb3-e2d347478635",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 08",
      "code": "DUR-08",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "3f629004-d8b4-4264-b3d2-5c05b17c2058",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 09",
      "code": "DUR-09",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "ee4ef430-91ce-43ed-9fc2-8bb25590699d",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 10",
      "code": "DUR-10",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    },
    {
      "id": "42a3851a-6e10-43bc-8ab2-f8cc22ad5238",
      "district_id": "e7252fdd-5307-4ad1-9d60-55f9802d472f",
      "name": "Durg - ULB 11",
      "code": "DUR-11",
      "latitude": null,
      "longitude": null,
      "geofence_radius": 200,
      "active": true
    }
  ],
  "audits": [
    {
      "id": "b36990f2-aa71-42ff-b510-10aec9ce66b0",
      "checklist_record_id": "6c5d34f4-e945-4d55-bef3-1665441d591a",
      "ulb_id": "19a4737a-b927-4680-8fe4-d83c06042b8f",
      "financial_year": "2026",
      "month": 10,
      "checklist_no": "RAJ-01/OCT/07",
      "voucher_no": "234",
      "voucher_date": "",
      "file_received_date": "2026-10-25",
      "audit_date": "2026-10-25",
      "scheme_fund": "aetdha",
      "nature_work": "ae5ha",
      "party": "atha",
      "amount": 72.11,
      "payment_approved": "N",
      "proposed_payment": 69.23,
      "payment_passed": 0,
      "cheque_issued": "Y",
      "audit_status": "Audited",
      "query_status": "Pending",
      "form2_number": "RAJ-01/OCT/06-Q1",
      "query_text": "",
      "remarks": "",
      "updated_by": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "updated_at": "2026-10-25T14:22:24.664Z",
      "created_by": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "created_at": "2026-10-25T13:25:24.209Z",
      "payment_mode": "Cheque",
      "same_date_warning": false
    },
    {
      "id": "d1a18efe-fdd3-4376-99fc-ea32f7636e00",
      "checklist_record_id": "60606025-9d04-48bf-a9dd-3560414bb6d9",
      "ulb_id": "19a4737a-b927-4680-8fe4-d83c06042b8f",
      "financial_year": "2026",
      "month": 10,
      "checklist_no": "RAJ-01/OCT/08",
      "voucher_no": "",
      "voucher_date": "",
      "file_received_date": "2026-10-25",
      "audit_date": "2026-10-25",
      "scheme_fund": "aetdha",
      "nature_work": "ae5ha",
      "party": "atha",
      "amount": 72.11,
      "payment_approved": "Y",
      "proposed_payment": 69.23,
      "payment_passed": 50,
      "cheque_issued": "N",
      "audit_status": "Audited",
      "query_status": "",
      "form2_number": "",
      "query_text": "",
      "remarks": "",
      "updated_by": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "updated_at": "2026-10-25T14:21:22.495Z",
      "created_by": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "created_at": "2026-10-25T14:21:22.495Z"
    },
    {
      "id": "c9aebaf9-0262-4f58-bc2b-bbab3ee83d11",
      "checklist_record_id": "e0c3c404-27a8-4392-ae85-40ea60f50144",
      "ulb_id": "19a4737a-b927-4680-8fe4-d83c06042b8f",
      "financial_year": "2026",
      "month": 10,
      "checklist_no": "RAJ-01/OCT/03",
      "voucher_no": "",
      "voucher_date": "",
      "file_received_date": "2026-10-24",
      "audit_date": "2026-10-24",
      "scheme_fund": "",
      "nature_work": "",
      "party": "",
      "amount": 541653.14,
      "payment_approved": "Y",
      "proposed_payment": 541653.14,
      "payment_passed": 0,
      "cheque_issued": "N",
      "cheque_no": "",
      "cheque_date": "",
      "payment_date": "",
      "payment_mode": "",
      "payment_reference": "",
      "backoffice_update_date": "",
      "audit_status": "Audited",
      "query_status": "",
      "form2_number": "",
      "query_text": "",
      "remarks": "",
      "created_by": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "updated_by": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "created_at": "2026-10-24T11:24:32.725Z",
      "updated_at": "2026-10-25T14:53:51.605Z"
    },
    {
      "id": "c627f4bb-e95e-49f6-8d9d-68ba75861cd4",
      "checklist_record_id": "89e5c916-bf3e-4f46-b644-a3ab924a06ed",
      "ulb_id": "19a4737a-b927-4680-8fe4-d83c06042b8f",
      "financial_year": "2026",
      "month": 10,
      "checklist_no": "RAJ-01/OCT/06",
      "voucher_no": "",
      "voucher_date": "",
      "file_received_date": "2026-10-25",
      "audit_date": "2026-10-25",
      "scheme_fund": "aetdha",
      "nature_work": "ae5ha",
      "party": "atha",
      "amount": 72.11,
      "payment_approved": "N",
      "proposed_payment": 69.23,
      "payment_passed": 0,
      "cheque_issued": "N",
      "cheque_no": "",
      "cheque_date": "",
      "payment_date": "",
      "payment_mode": "",
      "payment_reference": "",
      "backoffice_update_date": "",
      "audit_status": "Audited",
      "query_status": "",
      "form2_number": "RAJ-01/OCT/06-Q1",
      "query_text": "",
      "remarks": "",
      "created_by": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "updated_by": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "created_at": "2026-10-25T13:01:19.763Z",
      "updated_at": "2026-10-25T14:53:51.605Z"
    }
  ],
  "form2": [],
  "attendance": [],
  "auditLogs": [
    {
      "id": "0cf40199-3886-4d80-b9ce-08ea86e21fe0",
      "user_id": "18441d6b-0bfd-4576-822d-550a7203d04d",
      "entity": "checklist_record",
      "record_id": "6eab658a-cbb0-47e4-b21f-4de35b5cbb69",
      "action": "CREATE",
      "old_value": null,
      "new_value": {
        "id": "6eab658a-cbb0-47e4-b21f-4de35b5cbb69",
        "checklist_no": "RAJ-01/OCT/01",
        "ulb_id": "19a4737a-b927-4680-8fe4-d83c06042b8f",
        "district_id": "46e9ca57-08f8-4654-b33b-98c91ddc3d52",
        "financial_year": "2026",
        "month": 10,
        "type": "Manpower",
        "status": "Final",
        "result": "Clear",
        "net_eligible": 338000,
        "register": {
          "voucher_no": "234",
          "voucher_date": "",
          "file_received_date": "2026-10-22",
          "audit_date": "2026-10-22",
          "scheme_fund": "almaz",
          "party": "shadan",
          "bill_amount": "520000",
          "nature_work": "web making "
        },
        "file_details": {
          "month_fy": "October 2026",
          "checklist_date": "2026-10-22",
          "prepared_by": "System Administrator",
          "zone_dept_file_no": "rrdva",
          "work_contractor": "",
          "head_expenses": "",
          "grant_type": "arntbae",
          "estimated_amount": "",
          "estimate_prepared_by": "",
          "technical_approval_no": "",
          "technical_approval_date": "",
          "technical_approval_rs": "",
          "technical_approval_by": "",
          "tender_approval_no": "",
          "tender_approval_date": "",
          "tender_approval_rs": "",
          "tender_approval_by": "",
          "document_verification": "",
          "tender_published_date": "",
          "participants": "",
          "financial_approval_no": "eabaefbdbdf",
          "tender_committee": "",
          "headed_by": "",
          "month_financial_year": "sghs",
          "item_availability_in_gem_non_availability_report": "baersdfv",
          "mode_of_purchase": "Open Tender",
          "name_of_service_item_vendor_name": "aerbe",
          "detail_of_epf_and_esic_labour_licence": "abedb",
          "estimated_amount_or_rate_contract": "453",
          "source_of_fund": "arbeb",
          "financial_approval_date": "",
          "financial_approval_rs": "3",
          "financial_approval_approved_by_name_desig": "arfeb",
          "tender_published_in_and_dated": "rfbearb",
          "no_of_participants": "3",
          "tender_committee_approval_no": "rearbnrbn",
          "tender_committee_approval_date": "",
          "value_approved_by_tender_committee": "453",
          "tender_committee_headed_by": "aeberbr",
          "reason_for_selection": "eabnaer",
          "pan_no": "aerb",
          "tin_gstin_no": "earthqaeth",
          "purchase_order_no_date": "aerha",
          "demand_raised_by": "arhbaeh",
          "approved_by": "eraragb",
          "received_by": "arebeab",
          "date_of_supply_as_per_po": "",
          "actual_date_of_supply": "",
          "extended_date_of_supply_reason": "aerbaerb",
          "attendance_verified_by": "arbeab",
          "epf_and_esic_paid_timely_or_not": "",
          "issue_date_receiver_name": "aerbed",
          "penal_provision_as_per_agreement": "areber",
          "bill_no_type": "aerb",
          "scheme_from_which_fund_allocated": "aerea",
          "remaining_fund_in_scheme_after_payment": "25432",
          "previous_bill_no": "aernaerhn",
          "previous_note_sheet_no": "arbaer",
          "previous_bill_amount": "453544",
          "previous_gross_payment": "453",
          "previous_deduction": "3453",
          "previous_net_payment": "453",
          "comment_on_previous_payment_if_any": "arhaeb"
        },
        "checks": [
          {
            "code": "1",
            "text": "Whether copy of agreements/PO/te