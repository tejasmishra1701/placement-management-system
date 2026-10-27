// Administrator dashboard (Section 11.4, UC-002, FR-027): user accounts, audit logs, demo reset.
import { get, post, setToken, session } from '../api.js';
import { esc, fmtDateTime, fmtCgpa, timeAgo, banner, errorBanner, toast, confirmDialog, setBusy, debounce, ROLE_LABEL } from '../ui.js';
import { setScreen, navigate } from '../shell.js';

export async function users(root) {
  setScreen('Admin - Users', 'UC-002 / FR-027');
  const [{ summary: s }, { users: list }] = await Promise.all([get('/api/dashboard/summary'), get('/api/admin/users')]);
  root.innerHTML = `
    <div class="page-head"><div><h1>User Accounts <span class="trace">[UC-002 / FR-027]</span></h1><p class="sub">Manage accounts and roles. Deactivated accounts cannot log in and lose any active session immediately.</p></div>
      <button class="btn danger" id="reset-demo" title="Rebuild all demo data with dates relative to today">Reset demo data</button></div>
    <div class="tiles">
      <div class="tile"><div class="n">${s.users.total}</div><div class="l">User accounts</div></div>
      <div class="tile"><div class="n">${s.users.active}</div><div class="l">Active</div></div>
      <div class="tile"><div class="n">${s.users.deactivated}</div><div class="l">Deactivated</div></div>
      <div class="tile"><div class="n">${s.users.students}</div><div class="l">Students</div></div>
      <div class="tile"><div class="n">${s.users.companies}</div><div class="l">Companies</div></div>
      <div class="tile"><div class="n">${s.drives.total}</div><div class="l">Drives</div></div>
      <div class="tile"><div class="n">${s.applications.total}</div><div class="l">Applications</div></div>
    </div>
    <div id="u-msg"></div>
    <div class="card tight"><div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>E-mail</th><th>Role</th><th>Profile</th><th>Status</th><th class="right">Action</th></tr></thead><tbody id="u-body"></tbody></table></div></div>`;
  const body = root.querySelector('#u-body'); const msg = root.querySelector('#u-msg');
  function render(users) {
    body.innerHTML = users.map((u) => `<tr><td class="name"><b>${esc(u.name)}</b></td><td class="small">${esc(u.email)}</td><td>${esc(ROLE_LABEL[u.role] || u.role)}</td>
      <td class="small muted">${u.rollNumber ? `${esc(u.rollNumber)} · ${esc(u.branch)} · CGPA ${fmtCgpa(u.cgpa)}` : u.companyName ? esc(u.companyName) : '-'}</td>
      <td>${u.accountStatus === 'ACTIVE' ? '<span class="badge green">Active</span>' : '<span class="badge red">Deactivated</span>'}</td>
      <td class="actions-cell">${u.userId === session.user.userId ? '<span class="faint small">you</span>' : u.accountStatus === 'ACTIVE' ? `<button class="btn xs danger" data-act="deactivate" data-id="${u.userId}">Deactivate</button>` : `<button class="btn xs" data-act="restore" data-id="${u.userId}">Restore</button>`}</td></tr>`).join('');
  }
  render(list);
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    setBusy(b, true);
    try {
      const { user } = await post(`/api/admin/users/${b.dataset.id}/${b.dataset.act}`);
      msg.innerHTML = banner('success', `${esc(user.name)} is now <b>${user.accountStatus === 'ACTIVE' ? 'active' : 'deactivated'}</b>. Recorded in the audit log (NFR-013).`);
      render((await get('/api/admin/users')).users);
    } catch (err) { msg.innerHTML = errorBanner(err); setBusy(b, false); }
  });
  root.querySelector('#reset-demo').addEventListener('click', async (e) => {
    if (!(await confirmDialog({ title: 'Reset demo data', message: 'Rebuild the whole demo database? All changes made during this session will be lost and every user will be logged out. Dates are regenerated relative to today.', confirmLabel: 'Yes, reset', cancelLabel: 'No', danger: true }))) return;
    setBusy(e.target, true);
    try {
      const r = await post('/api/admin/reset-demo');
      setToken(null); session.user = null;
      toast(r.message, 'success');
      navigate('#/login');
    } catch (err) { msg.innerHTML = errorBanner(err); setBusy(e.target, false); }
  });
}

export async function audit(root) {
  setScreen('Admin - Audit Log', 'NFR-013');
  const { logs } = await get('/api/admin/audit-logs?limit=500');
  root.innerHTML = `
    <div class="page-head"><div><h1>Audit Log <span class="trace">[NFR-013]</span></h1><p class="sub">Append-only record of administrative actions: drive publication, eligibility edits, round results, offers, account changes.</p></div>
      <input type="text" id="a-filter" placeholder="Filter by action or text" style="max-width:280px"></div>
    <div class="card tight"><div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Action</th><th>Performed by</th><th>Details</th></tr></thead><tbody id="a-body"></tbody></table></div></div>`;
  const body = root.querySelector('#a-body');
  function render(q = '') {
    const ql = q.toLowerCase();
    const shown = logs.filter((l) => !ql || `${l.actionType} ${l.details} ${l.performedByName}`.toLowerCase().includes(ql));
    body.innerHTML = shown.length ? shown.map((l) => `<tr><td class="nowrap small" title="${fmtDateTime(l.timestamp)}">${fmtDateTime(l.timestamp)}<br><span class="faint">${timeAgo(l.timestamp)}</span></td><td><span class="badge ${l.actionType.includes('DEACTIVATED') || l.actionType.includes('CANCELLED') ? 'red' : l.actionType.includes('OFFER') ? 'green' : 'blue'}">${esc(l.actionType.replace(/_/g, ' '))}</span></td><td>${esc(l.performedByName)}<br><span class="small faint">${esc(ROLE_LABEL[l.performedByRole] || '')}</span></td><td class="small">${esc(l.details || '')}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">No entries match.</td></tr>';
  }
  render();
  root.querySelector('#a-filter').addEventListener('input', debounce((e) => render(e.target.value), 200));
}
