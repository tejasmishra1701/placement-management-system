// PMS Web Client shell: session handling, hash router, role-based navigation (FR-004, NFR-005).
import { session, setToken, get, post } from './api.js';
import { esc, toast, ROLE_LABEL } from './ui.js';
import { configureShell } from './shell.js';
import * as login from './views/login.js';
import * as student from './views/student.js';
import * as officer from './views/officer.js';
import * as company from './views/company.js';
import * as admin from './views/admin.js';
import * as shared from './views/shared.js';

const HOME = { STUDENT: '#/student/drives', PLACEMENT_OFFICER: '#/officer/home', COMPANY: '#/company/drives', ADMINISTRATOR: '#/admin/users' };

const NAV = {
  STUDENT: [['#/student/drives', 'Drives'], ['#/student/applications', 'My Applications'], ['#/notifications', 'Alerts']],
  PLACEMENT_OFFICER: [['#/officer/home', 'Home'], ['#/officer/drives', 'Drives'], ['#/officer/companies', 'Companies'], ['#/officer/students', 'Students'], ['#/officer/reports', 'Reports']],
  COMPANY: [['#/company/drives', 'My Drives'], ['#/notifications', 'Alerts']],
  ADMINISTRATOR: [['#/admin/users', 'Users'], ['#/admin/audit', 'Audit Log'], ['#/admin/reports', 'Reports']],
};

const ROUTES = [
  { re: /^\/login$/, view: login.render, public: true },
  { re: /^\/student\/drives$/, role: 'STUDENT', view: student.drives },
  { re: /^\/student\/drives\/([^/]+)$/, role: 'STUDENT', view: student.driveDetail, keys: ['driveId'] },
  { re: /^\/student\/applications$/, role: 'STUDENT', view: student.applications },
  { re: /^\/officer\/home$/, role: 'PLACEMENT_OFFICER', view: officer.home },
  { re: /^\/officer\/drives$/, role: 'PLACEMENT_OFFICER', view: officer.drives },
  { re: /^\/officer\/drives\/new$/, role: 'PLACEMENT_OFFICER', view: officer.driveForm },
  { re: /^\/officer\/drives\/([^/]+)\/edit$/, role: 'PLACEMENT_OFFICER', view: officer.driveForm, keys: ['driveId'] },
  { re: /^\/officer\/drives\/([^/]+)\/candidates$/, role: 'PLACEMENT_OFFICER', view: officer.candidates, keys: ['driveId'] },
  { re: /^\/officer\/companies$/, role: 'PLACEMENT_OFFICER', view: officer.companies },
  { re: /^\/officer\/students$/, role: 'PLACEMENT_OFFICER', view: officer.students },
  { re: /^\/officer\/reports$/, role: 'PLACEMENT_OFFICER', view: shared.reports },
  { re: /^\/company\/drives$/, role: 'COMPANY', view: company.drives },
  { re: /^\/company\/drives\/([^/]+)$/, role: 'COMPANY', view: company.driveDetail, keys: ['driveId'] },
  { re: /^\/admin\/users$/, role: 'ADMINISTRATOR', view: admin.users },
  { re: /^\/admin\/audit$/, role: 'ADMINISTRATOR', view: admin.audit },
  { re: /^\/admin\/reports$/, role: 'ADMINISTRATOR', view: shared.reports },
  { re: /^\/notifications$/, view: shared.notifications },
];

const viewEl = document.getElementById('view');
const topbar = document.getElementById('topbar');

function setScreen(label, trace) {
  document.getElementById('screen-label').textContent = label;
  document.title = `PMS | ${label}`;
  viewEl.dataset.trace = trace || '';
}
function navigate(hash) { if (location.hash === hash) render(); else location.hash = hash; }

async function refreshUnread() {
  if (!session.token) return;
  try {
    const me = await get('/api/auth/me');
    session.user = me.user; session.unread = me.unreadNotifications || 0;
    const c = document.getElementById('bell-count');
    c.textContent = session.unread; c.hidden = session.unread === 0;
  } catch (_) { /* handled by pms:unauth */ }
}
configureShell({ setScreen, navigate, refreshUnread });

function renderChrome() {
  if (!session.user) { topbar.hidden = true; return; }
  topbar.hidden = false;
  const items = NAV[session.user.role] || [];
  const current = location.hash.split('?')[0];
  document.getElementById('nav').innerHTML = items.map(([href, label]) => `<a href="${href}" class="${current.startsWith(href) ? 'active' : ''}">${label}</a>`).join('');
  const u = session.user;
  const extra = u.profile ? ` · ${esc(u.profile.rollNumber)} · ${esc(u.profile.branch)}` : u.company ? ` · ${esc(u.company.companyName)}` : '';
  document.getElementById('user-chip').innerHTML = `<b>${esc(u.name)}</b> · ${ROLE_LABEL[u.role] || u.role}${extra}`;
  document.getElementById('brand-link').setAttribute('href', HOME[u.role] || '#/');
  const c = document.getElementById('bell-count'); c.textContent = session.unread; c.hidden = !session.unread;
}

export async function onLoggedIn(user) {
  session.user = user;
  await refreshUnread();
  navigate(HOME[user.role] || '#/');
}

async function logout() {
  try { await post('/api/auth/logout'); } catch (_) { /* ignore */ }
  setToken(null); session.user = null; session.unread = 0;
  navigate('#/login');
}

async function render() {
  const path = (location.hash || '#/').slice(1).split('?')[0] || '/';
  if (session.token && !session.user) {
    try { const me = await get('/api/auth/me'); session.user = me.user; session.unread = me.unreadNotifications || 0; }
    catch (_) { setToken(null); session.user = null; }
  }
  if (!session.user) {
    renderChrome();
    if (path !== '/login') { location.hash = '#/login'; return; }
    viewEl.innerHTML = '';
    await login.render(viewEl, {});
    return;
  }
  if (path === '/' || path === '/login') { location.hash = HOME[session.user.role] || '#/'; return; }
  const route = ROUTES.find((r) => r.re.test(path));
  if (!route || (route.role && route.role !== session.user.role)) {
    toast('You do not have access to this action.', 'error'); // M-11
    location.hash = HOME[session.user.role] || '#/';
    return;
  }
  const m = route.re.exec(path);
  const params = {};
  (route.keys || []).forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
  renderChrome();
  viewEl.innerHTML = '<p class="muted">Loading...</p>';
  window.scrollTo(0, 0);
  try {
    await route.view(viewEl, params);
  } catch (err) {
    if (err && err.code === 'E-UNAUTH') return;
    viewEl.innerHTML = `<div class="banner error"><span class="code">${esc(err.code || 'ERROR')}</span>${esc(err.message || 'Something went wrong.')}</div>`;
    console.error(err);
  }
  refreshUnread().then(renderChrome);
}

window.addEventListener('hashchange', render);
window.addEventListener('pms:unauth', () => {
  if (!session.token) return;
  setToken(null); session.user = null;
  toast('Please log in again.', 'error'); // M-11
  navigate('#/login');
});
window.addEventListener('pms:login', (e) => onLoggedIn(e.detail));
document.getElementById('logout-btn').addEventListener('click', logout);
render();
