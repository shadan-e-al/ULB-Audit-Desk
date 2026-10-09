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
  return `
    <button
      class="${state.view === view ? 'active' : ''}"
      onclick="go('${view}')"
    >
      ${label}
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
          ULB Audit Desk<br>

          <span
            style="
              font-size:11px;
              font-weight:500;
              opacity:.75
            "
          >
            Pre / Internal Audit · CG
          </span>
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
      </aside>


      <main class="main">

        <header class="top">

          <div class="actions">

            <button
              class="btn secondary mobile-menu"
              onclick="
                $('#side').classList.toggle('open')
              "
            >
              ☰
            </button>

            <b>${esc(state.user.name)}</b>

            <span class="pill ok">
              ${esc(state.user.role)}
            </span>

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
  const data = await api(
    `/api/dashboard?ulb=${state.ulb}&fy=${state.fy}&month=${state.month}`
  );

  content.innerHTML = `
    <div class="title">
      Dashboard
    </div>

    <div class="muted">
      ${esc(
        state.ulbs.find(
          x => x.id === state.ulb
        )?.name || ''
      )}
      • FY ${state.fy}
      • ${months[state.month]}
    </div>

    ${contextBar()}

    <div class="grid">

      ${stat(
        'Assigned ULBs',
        data.assigned_ulbs
      )}

      ${stat(
        'Pending Audit Registers',
        data.pending_audits
      )}

      ${stat(
        'Completed Audits',
        data.completed_audits
      )}

      ${stat(
        'Pending Form-2 Queries',
        data.pending_form2
      )}

      ${stat(
        'Payment Not Approved',
        data.payment_not_approved
      )}

      ${stat(
        'Cheques Issued',
        data.cheques_issued
      )}

      ${stat(
        'Bills Approved but Not Paid',
        data.bills_not_paid
      )}

      ${stat(
        'Records Edited After Initial Save',
        data.edited_after_save
      )}

    </div>


    <div
      class="card"
      style="margin-top:12px"
    >
      <h3>Quick Actions</h3>

      <div class="actions">

        <button
          class="btn"
          onclick="go('register')"
        >
          New Audit Register
        </button>

        <button
          class="btn"
          onclick="go('queries')"
        >
          Add / Review Form-2
        </button>

        <button
          class="btn"
          onclick="go('reports')"
        >
          Generate D-1 to D-7
        </button>

        <button
          class="btn"
          onclick="go('attendance')"
        >
          Attendance Check-In / Check-Out
        </button>

      </div>
    </div>
  `;
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
    <div class="title">
      Audit Register / Input Register
    </div>

    <div class="muted">
      Core transaction source for downstream reports
    </div>

    ${contextBar()}

    <div
      class="actions"
      style="margin:10px 0"
    >
      <button
        class="btn"
        onclick="auditModal()"
      >
        + Add Row
      </button>

      <button
        class="btn secondary"
        onclick="downloadAuditCsv()"
      >
        Export CSV
      </button>
    </div>


    <div class="table-wrap">

      <table class="table">

        <thead>
          <tr>
            <th>Sr.</th>
            <th>Checklist No.</th>
            <th>File Received</th>
            <th>Audit Date</th>
            <th>Voucher</th>
            <th>Scheme / Fund</th>
            <th>Nature of Work</th>
            <th>Contractor</th>
            <th>Amount</th>
            <th>Approved</th>
            <th>Proposed</th>
            <th>Passed</th>
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
                  ${esc(row.checklist_no)}
                </td>

                <td>
                  ${esc(row.file_received_date)}
                </td>

                <td>
                  ${esc(row.audit_date)}
                </td>

                <td>
                  ${esc(row.voucher_no)}
                </td>

                <td>
                  ${esc(row.scheme_fund)}
                </td>

                <td>
                  ${esc(row.nature_work)}
                </td>

                <td>
                  ${esc(row.party)}
                </td>

                <td>
                  ${money(row.amount)}
                </td>

                <td>
                  ${pill(row.payment_approved)}
                </td>

                <td>
                  ${money(row.proposed_payment)}
                </td>

                <td>
                  ${money(row.payment_passed)}
                </td>

                <td>
                  ${pill(row.cheque_issued)}
                </td>

                <td>
                  ${esc(
                    row.query_text ||
                    row.remarks ||
                    ''
                  )}
                </td>

                <td>
                  <button
                    class="btn secondary sm"
                    onclick='editAudit(${JSON.stringify(row)})'
                  >
                    Edit
                  </button>

                  <button
                    class="btn secondary sm"
                    onclick='deleteAudit(${JSON.stringify(row.id)})'
                  >
                    Delete
                  </button>

                </td>

              </tr>
            `).join('') ||
            `
              <tr>
                <td
                  colspan="15"
                  class="empty"
                >
                  No records for this month.
                </td>
              </tr>
            `
          }

        </tbody>

      </table>

    </div>
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
    <div class="title">
      FORM-2 Query Management
    </div>

    <div class="muted">
      FORM-2 source fields:
      Query Sheet Serial No., Date,
      Bill/Invoice Reference and Query.
    </div>

    ${contextBar()}

    <div
      class="actions"
      style="margin:10px 0"
    >
      <button
        class="btn"
        onclick="form2Modal()"
      >
        + Add Form-2
      </button>
    </div>


    <div class="table-wrap">

      <table
        class="table"
        style="min-width:850px"
      >

        <thead>
          <tr>
            <th>Query Sheet No.</th>
            <th>Date</th>
            <th>Bill/Invoice Reference</th>
            <th>Amount</th>
            <th>Party</th>
            <th>Query</th>
            <th>Verified</th>
            <th>Image</th>
          </tr>
        </thead>

        <tbody>

          ${
            state.form2.map(row => `
              <tr>

                <td>
                  ${esc(row.form2_number)}
                </td>

                <td>
                  ${esc(row.query_date)}
                </td>

                <td>
                  ${esc(
                    row.bill_invoice_reference
                  )}
                </td>

                <td>
                  ${money(row.amount)}
                </td>

                <td>
                  ${esc(row.party_name)}
                </td>

                <td>
                  ${esc(row.query_text)}
                </td>

                <td>
                  ${pill(
                    row.verified
                      ? 'YES'
                      : 'NO'
                  )}
                </td>

                <td>
                  ${row.image_data ? 'Stored' : ''}
                </td>

              </tr>
            `).join('') ||
            `
              <tr>
                <td
                  colspan="8"
                  class="empty"
                >
                  No Form-2 records.
                </td>
              </tr>
            `
          }

        </tbody>

      </table>

    </div>
  `;
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

function reports(content) {
  const reportList = [
    ['D1', 'Audit Letter'],
    ['D2', 'Work Progress Report'],
    ['D3', 'Completion Certificate'],
    ['D4', 'Irregularities + Revenue'],
    ['D5', 'Statutory Deductions / Compliance'],
    ['D6', 'Unpaid / Paid-Un-audited / Advances / FD'],
    ['D7', 'Major Observations / Red Flags']
  ];

  content.innerHTML = `
    <div class="title">
      D-1 to D-7 Reports
    </div>

    <div class="muted">
      Each report is generated from the
      underlying audit data.
    </div>

    ${contextBar()}

    <div class="report-grid">

      ${reportList.map(
        ([report, name]) => `
          <div class="card">

            <h3>${report}</h3>

            <div
              class="muted"
              style="min-height:42px"
            >
              ${name}
            </div>

            <div
              class="actions"
              style="margin-top:10px"
            >

              <button
                class="btn sm"
                onclick="openReport('${report}')"
              >
                Preview / Print PDF
              </button>

              <button
                class="btn secondary sm"
                onclick="
                  downloadReport(
                    '${report}',
                    'doc'
                  )
                "
              >
                Word
              </button>

              ${
                [
                  'D2',
                  'D4',
                  'D5',
                  'D6',
                  'D7'
                ].includes(report)
                  ? `
                    <button
                      class="btn secondary sm"
                      onclick="
                        downloadReport(
                          '${report}',
                          'csv'
                        )
                      "
                    >
                      CSV
                    </button>
                  `
                  : ''
              }

            </div>

          </div>
        `
      ).join('')}

    </div>


    <div
      class="card"
      style="margin-top:12px"
    >

      <h3>
        Report validation
      </h3>

      <p>
        Before production use, verify all
        mandatory fields and compare the
        rendered output against the supplied
        government templates. The supplied
        D-1/D-7 reference is the layout authority.
      </p>

    </div>
  `;
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
      'Administrative approval / sanction is available from the competent authority.',
      'Technical sanction / approved estimate is available where required.',
      'Work order / agreement is available and terms are identifiable.',
      'Tender / quotation process and comparative statement are available as applicable.',
      'Tender was invited with prescribed specifications, quantities and conditions.',
      'Competent authority / tender committee has approved the selected tender.',
      'Contractor registration / eligibility and financial or technical capacity were considered.',
      'Measurement Book is available, properly maintained and measurements are recorded chronologically.',
      'Check measurements / verification by the prescribed superior officer are available.',
      'Previous payments and recoveries have been correctly considered in the bill.',
      'Rates paid are supported by sanctioned rates / schedule or otherwise checked for reasonableness.',
      'Payment voucher, supporting documents and authorised scrutiny / pay order are available.',
      'Security deposit, statutory deductions and other recoveries have been correctly accounted for.',
      'Material supplied has been accepted and its quantity / quality agrees with the order and records.',
      'Payment advice and payment voucher are prepared in the prescribed manner.'
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
  'Royalty / Mining Cess',
  'Income Tax',
  'GST',
  'Labour Welfare Fund',
  'Penalty / LD',
  'Recovery of Advance',
  'Recovery of Material',
  'Under / over payment in last bill',
  'Other recovery / adjustment'
];


const DEFAULT_BOOKS = [
  'Measurement book / relevant work record',
  'Memo and mode of payment / supporting payment record',
  'Cheque issue register',
  'Cash Book / relevant book',
  'Grant Register',
  'Work Register / relevant register',
  'Budget Control Register',
  'Time limit / completion record'
];


const DEFAULT_DOCS = [
  'Administrative approval / sanction',
  'Technical sanction / approved estimate',
  'Work order / agreement',
  'Tender / quotation documents',
  'Comparative statement / approval',
  'Bill / invoice and voucher',
  'Measurement / attendance / receipt record',
  'Stock / inventory record where applicable',
  'Payment advice / payment voucher',
  'Other supporting documents'
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
        String(index + 1);

      return (
        map.get(code) || {
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
    const query =
      new URLSearchParams();

    if ($('#clDistrict')?.value) {
      query.set(
        'district_id',
        $('#clDistrict').value
      );
    }

    if ($('#clUlb')?.value) {
      query.set(
        'ulb_id',
        $('#clUlb').value
      );
    }

    if ($('#clSearch')?.value) {
      query.set(
        'q',
        $('#clSearch').value
      );
    }

    const rows =
      await api(
        '/api/checklist-records?' +
        query
      );

    content.innerHTML = `
      <div class="title">
        Checklists
      </div>

      <div class="muted">
        Every saved checklist flows into
        the Internal Audit Register once
        finalised.
      </div>

      <div
        class="actions"
        style="
          justify-content:flex-end;
          margin-top:-30px
        "
      >
        <button
          class="btn"
          onclick="newChecklistModal()"
        >
          + New checklist
        </button>
      </div>

      ${checklistListFilters()}


      <div
        class="table-wrap"
        style="margin-top:16px"
      >

        <table
          class="table"
          style="min-width:1050px"
        >

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

            ${
              rows.map(row => `
                <tr
                  style="cursor:pointer"
                  onclick="
                    openChecklist('${row.id}')
                  "
                >

                  <td>
                    <b
                      style="color:#c65a00"
                    >
                      ${esc(row.checklist_no)}
                    </b>
                  </td>

                  <td>
                    ${esc(row.type)}
                  </td>

                  <td>
                    ${esc(
                      ulbName(row.ulb_id)
                    )}
                    <br>

                    <span class="muted">
                      ${esc(
                        districtName(
                          row.district_id
                        )
                      )}
                    </span>
                  </td>

                  <td>
                    ${esc(
                      row.work ||
                      row.register?.nature_work ||
                      '-'
                    )}

                    <br>

                    <span class="muted">
                      ${esc(
                        row.party ||
                        row.register?.party ||
                        ''
                      )}
                    </span>
                  </td>

                  <td>
                    ${esc(
                      row.audit_date ||
                      row.register?.audit_date ||
                      '-'
                    )}
                  </td>

                  <td>
                    ${money(
                      row.net_eligible || 0
                    )}
                  </td>

                  <td>
                    ${pill(
                      row.result || '-'
                    )}
                  </td>

                  <td>
                    ${pill(
                      row.status || 'Draft'
                    )}
                  </td>

                </tr>
              `).join('') ||

              `
                <tr>
                  <td
                    colspan="8"
                    class="empty"
                  >
                    No checklists found.
                  </td>
                </tr>
              `
            }

          </tbody>

        </table>

      </div>
    `;

  } catch (error) {
    content.innerHTML = `
      <div class="card">

        <b>
          Unable to load checklists
        </b>

        <p>
          ${esc(error.message)}
        </p>

      </div>
    `;
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


function clTabs() {
  const tabs = [
    'A|Register details',
    'B|File details',
    'C|Checks',
    'D|Deductions',
    'E|Books & documents',
    'F|Result'
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
    const file =
      data.file_details || {};

    return `
      <form
        id="clForm"
        class="form-grid three"
      >

        ${clField(
          'month_fy',
          'Month - Financial Year',
          file.month_fy
        )}

        ${clField(
          'checklist_date',
          'Checklist Date',
          file.checklist_date,
          'date'
        )}

        ${clField(
          'prepared_by',
          'Prepared by',
          file.prepared_by
        )}

        ${clField(
          'zone_dept_file_no',
          'Zone / Dept. / File No.',
          file.zone_dept_file_no
        )}

        ${clArea(
          'work_contractor',
          'Name of Work & Contractor Name',
          file.work_contractor
        )}

        ${clField(
          'head_expenses',
          'Head of Expenses',
          file.head_expenses
        )}

        ${clField(
          'grant_type',
          'Grant Type',
          file.grant_type
        )}

        ${clField(
          'estimated_amount',
          'Estimated Amount',
          file.estimated_amount,
          'number'
        )}

        ${clField(
          'estimate_prepared_by',
          'Estimate Prepared by (Name & Authority)',
          file.estimate_prepared_by
        )}

        ${clField(
          'technical_approval_no',
          'Technical Approval No.',
          file.technical_approval_no
        )}

        ${clField(
          'technical_approval_date',
          'Technical Approval Date',
          file.technical_approval_date,
          'date'
        )}

        ${clField(
          'technical_approval_rs',
          'Technical Approval Rs.',
          file.technical_approval_rs,
          'number'
        )}

        ${clField(
          'technical_approval_by',
          'Technical Approval Approved By (Name & Desig.)',
          file.technical_approval_by
        )}

        ${clField(
          'tender_approval_no',
          'Tender Inviting Approval No.',
          file.tender_approval_no
        )}

        ${clField(
          'tender_approval_date',
          'Tender Inviting Approval Date',
          file.tender_approval_date,
          'date'
        )}

        ${clField(
          'tender_approval_rs',
          'Tender Inviting Approval Rs.',
          file.tender_approval_rs,
          'number'
        )}

        ${clField(
          'tender_approval_by',
          'Tender Inviting Approval Approved By (Name & Desig.)',
          file.tender_approval_by
        )}

        ${clField(
          'document_verification',
          'Document Verification as per applicable NIT / procurement rules',
          file.document_verification
        )}

        ${clField(
          'tender_published_date',
          'Tender Published in, Dated & Bid Due Date',
          file.tender_published_date
        )}

        ${clField(
          'participants',
          'No. of Participants',
          file.participants,
          'number'
        )}

        ${clField(
          'tender_committee',
          'Tender Committee Approval No. & Date & Value',
          file.tender_committee
        )}

        ${clField(
          'headed_by',
          'Headed by',
          file.headed_by
        )}

        ${clField(
          'financial_approval_no',
          'Financial Approval No.',
          file.financial_approval_no
        )}

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
              <div
                style="
                  display:grid;
                  grid-template-columns:
                    55px 1fr 320px;
                  gap:12px;
                  align-items:center;
                  padding:12px 0;
                  border-bottom:
                    1px solid #e8edf3
                "
              >

                <div class="muted">
                  ${esc(check.code)}
                </div>

                <div>
                  ${esc(check.text)}
                </div>

                <div
                  style="
                    display:flex;
                    gap:8px;
                    align-items:center
                  "
                >

                  <select
                    data-check-status="${index}"
                  >

                    <option value="">
                      —
                    </option>

                    <option
                      value="Y"
                      ${
                        check.status === 'Y'
                          ? 'selected'
                          : ''
                      }
                    >
                      Y
                    </option>

                    <option
                      value="N"
                      ${
                        check.status === 'N'
                          ? 'selected'
                          : ''
                      }
                    >
                      N
                    </option>

                    <option
                      value="NA"
                      ${
                        check.status === 'NA'
                          ? 'selected'
                          : ''
                      }
                    >
                      NA
                    </option>

                  </select>


                  <input
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

            ${(data.deductions || [])
              .map(
                (deduction, index) => `
                  <tr>

                    <td>
                      ${esc(deduction.code)}
                    </td>

                    <td>
                      ${esc(deduction.head)}
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

                  ${esc(item.label)}

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

                  ${esc(item.label)}

                </label>
              `
            )
            .join('')}

        </div>

      </div>
    `;
  }


  /* -------------------------------------------------------
     TAB F — RESULT
     ------------------------------------------------------- */

  const result =
    data.result_details || {};

  return `
    <form
      id="clForm"
      class="form-grid three"
    >

      ${clField(
        'amount_approved',
        'Amount Approved (Y/N)',
        result.amount_approved
      )}

      ${clField(
        'query_sheet_no',
        'Query Sheet No.',
        result.query_sheet_no
      )}

      ${clField(
        'payment_passed',
        'Payment Passed (Net Amt.) ₹',
        result.payment_passed,
        'number'
      )}

      ${clArea(
        'remarks',
        'Remarks or Queries (if not approved)',
        result.remarks
      )}


      <div
        class="card"
        style="
          grid-column:1/-1;
          background:#f7fafc
        "
      >

        <span class="muted">
          Proposed for Payment
          (Net Amt.) is calculated from deductions:
        </span>

        <b>
          ₹ ${money(
            calculateNet(data)
          )}
        </b>

      </div>

    </form>
  `;
}


/* =========================================================
   24. CHECKLIST CALCULATIONS
   ========================================================= */

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

async function switchChecklistTab(tab) {
  try {
    await saveChecklistTab(false);
  } catch (error) {
    return;
  }

  state.checklistTab = tab;

  state.checklistDraft =
    await api(
      '/api/checklist-records/' +
      state.checklistId
    );

  checklistDetailView(
    $('#content'),
    state.checklistDraft
  );
}


async function saveChecklistTab(
  showToast = true
) {
  const data =
    state.checklistDraft;

  if (!data) return;


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
              `[data-check-status="${index}"]`
            )?.value || '',

          remark:
            $(
              `[data-check-remark="${index}"]`
            )?.value || ''
        })
      );
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
      ...Object.fromEntries(
        formData.entries()
      )
    };

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
