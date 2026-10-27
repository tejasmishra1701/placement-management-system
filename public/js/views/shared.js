// Views shared across roles: Alerts (notifications, FR-023..025) and Reports (UC-014, FR-026).
import { get, post, session, download } from '../api.js';
import { esc, fmtDateTime, fmtDate, fmtLpa, timeAgo, toast, errorBanner, setBusy, NOTIF_LABEL } from '../ui.js';
import { setScreen, navigate, refreshUnread } from '../shell.js';

export async function notifications(root) {
  setScreen('Alerts', 'FR-023 / FR-024 / FR-025');
  const { notifications: list, unread } = await get('/api/notifications');
  root.innerHTML = `
    <div class="page-head"><div><h1>Alerts <span class="trace">[FR-023 / FR-024 / FR-025]</span></h1><p class="sub">${unread} unread · new drives you are eligible for, deadline reminders, round updates and offer results.</p></div>
      <button class="btn sm" id="read-all" ${unread ? '' : 'disabled'}>Mark all as read</button></div>
    <div id="notif-list">${list.length ? list.map(item).join('') : '<div class="empty">No notifications yet.</div>'}</div>`;
  root.querySelector('#read-all').addEventListener('click', async (e) => {
    setBusy(e.target, true); await post('/api/notifications/read-all'); await refreshUnread(); notifications(root);
  });
  root.querySelector('#notif-list').addEventListener('click', async (e) => {
    const el = e.target.closest('.notif'); if (!el) return;
    if (el.classList.contains('unread')) { await post(`/api/notifications/${el.dataset.id}/read`); el.classList.remove('unread'); refreshUnread(); }
    const { type, ref } = el.dataset;
    if (session.user.role === 'STUDENT') {
      if ((type === 'NEW_DRIVE' || type === 'DEADLINE_REMINDER' || type === 'DRIVE_CLOSED_OR_CANCELLED') && ref) navigate(`#/student/drives/${ref}`);
      else if (type === 'ROUND_UPDATE' || type === 'OFFER_RESULT') navigate('#/student/applications');
    }
  });
}
const item = (n) => `<div class="notif ${n.read ? '' : 'unread'}" data-id="${n.notificationId}" data-type="${n.type}" data-ref="${esc(n.referenceId || '')}">
  <div class="ntype">${esc(NOTIF_LABEL[n.type] || n.type)}</div><div class="nmsg">${esc(n.message)}</div><div class="ntime" title="${fmtDateTime(n.timestamp)}">${timeAgo(n.timestamp)}</div></div>`;

export async function reports(root) {
  setScreen('Reports', 'UC-014 / FR-026');
  let type = 'DRIVE_WISE';
  root.innerHTML = `
    <div class="page-head"><div><h1>Placement Reports <span class="trace">[UC-014 / FR-026]</span></h1><p class="sub">Drive-wise and branch-wise statistics, generated on demand from drive and application data.</p></div>
      <button class="btn" id="export-csv">Export CSV</button></div>
    <div class="card"><div class="tabs"><button class="active" data-type="DRIVE_WISE">Drive-wise</button><button data-type="BRANCH_WISE">Branch-wise</button></div>
      <div id="report-body"><p class="muted">Loading...</p></div><p class="small faint" id="report-meta"></p></div>`;
  const body = root.querySelector('#report-body');
  async function load() {
    const { report } = await get(`/api/reports/${type.toLowerCase().replace('_', '-')}`);
    body.innerHTML = type === 'DRIVE_WISE' ? driveTable(report) : branchTable(report);
    root.querySelector('#report-meta').textContent = `Generated ${fmtDateTime(report.generatedOn)}. Report.generate() builds this from stored drives, applications and offers; nothing is persisted.`;
  }
  root.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b)); type = b.dataset.type; load();
  }));
  root.querySelector('#export-csv').addEventListener('click', async (e) => {
    setBusy(e.target, true);
    try { await download(`/api/reports/${type.toLowerCase().replace('_', '-')}?format=csv`, `pms-${type.toLowerCase()}-report.csv`); toast('CSV exported.', 'success'); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(e.target, false); }
  });
  await load();
}

function driveTable(r) {
  const t = r.totals;
  return `<div class="table-wrap"><table class="data"><thead><tr><th>Company</th><th>Role</th><th>CTC</th><th>Status</th><th>Deadline</th><th class="right">Applied</th><th class="right">In rounds</th><th class="right">Cleared</th><th class="right">Offered</th><th class="right">Rejected</th><th class="right">Conversion</th></tr></thead>
    <tbody>${r.rows.map((x) => `<tr><td>${esc(x.company)}</td><td>${esc(x.jobTitle)}</td><td>${fmtLpa(x.ctcLpa)}</td><td>${esc(x.status)}</td><td>${fmtDate(x.registrationDeadline)}</td><td class="right">${x.applications}</td><td class="right">${x.inRounds}</td><td class="right">${x.cleared}</td><td class="right">${x.offered}</td><td class="right">${x.rejected}</td><td class="right">${x.conversionPct}%</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5">Total</td><td class="right">${t.applications}</td><td class="right">${t.inRounds}</td><td class="right">${t.cleared}</td><td class="right">${t.offered}</td><td class="right">${t.rejected}</td><td class="right">${t.applications ? Math.round((t.offered / t.applications) * 1000) / 10 : 0}%</td></tr></tfoot></table></div>`;
}
function branchTable(r) {
  const t = r.totals;
  return `<div class="table-wrap"><table class="data"><thead><tr><th>Branch</th><th class="right">Students</th><th class="right">Students applied</th><th class="right">Applications</th><th class="right">Students placed</th><th class="right">Offers</th><th class="right">Placement %</th><th class="right">Avg CTC</th><th class="right">Highest CTC</th></tr></thead>
    <tbody>${r.rows.map((x) => `<tr><td><b>${esc(x.branch)}</b></td><td class="right">${x.students}</td><td class="right">${x.studentsApplied}</td><td class="right">${x.applications}</td><td class="right">${x.studentsPlaced}</td><td class="right">${x.offers}</td><td class="right">${x.placementPct}%</td><td class="right">${x.avgCtcLpa === null ? '-' : fmtLpa(x.avgCtcLpa)}</td><td class="right">${x.highestCtcLpa === null ? '-' : fmtLpa(x.highestCtcLpa)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td class="right">${t.students}</td><td class="right">${t.studentsApplied}</td><td class="right">${t.applications}</td><td class="right">${t.studentsPlaced}</td><td class="right">${t.offers}</td><td class="right">${t.students ? Math.round((t.studentsPlaced / t.students) * 1000) / 10 : 0}%</td><td></td><td></td></tr></tfoot></table></div>`;
}
