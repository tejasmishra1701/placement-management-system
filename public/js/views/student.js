// Student dashboard: S2 Ongoing Drives (UC-007/008/009), S3 Drive Details & Apply (UC-009), My Applications (UC-010).
import { get, post, session } from '../api.js';
import { esc, fmtDateTime, fmtDate, fmtLpa, fmtCgpa, badge, driveBadge, resultText, banner, errorBanner, setBusy, debounce, criteriaText, APP_STATUS, OUTCOME, DRIVE_STATUS } from '../ui.js';
import { setScreen, navigate, refreshUnread } from '../shell.js';

const BRANCHES = ['CSE', 'IT', 'ECE', 'CCE', 'MME'];

function stateLine(d) {
  const applied = d.application ? ` <span class="muted">(status: ${APP_STATUS[d.application.currentRoundStatus][0]})</span>` : '';
  switch (d.state) {
    case 'ELIGIBLE': return `<span class="state ok">Eligible</span>`;
    case 'INELIGIBLE': return `<span class="state bad">Not eligible: ${esc(d.eligibility.failedRules.join('; '))}</span>`;
    case 'APPLIED': return `<span class="state ok">Already applied</span>${applied}`;
    default: return `<span class="state bad">Registration closed</span>${d.applied ? ` <span class="state ok">- you applied</span>${applied}` : ''}${d.effectiveStatus === 'ONGOING_ROUNDS' ? ' <span class="muted">- selection rounds in progress</span>' : ''}`;
  }
}

function applyButton(d) {
  if (d.state === 'ELIGIBLE') return `<button class="btn primary" data-apply="${d.driveId}">Apply</button>`;
  if (d.state === 'APPLIED') return `<button class="btn" disabled>Applied</button>`;
  if (d.state === 'INELIGIBLE') return `<button class="btn" disabled title="Not eligible (AC-04)">Not eligible</button>`;
  return `<button class="btn" disabled>Closed</button>`;
}

function driveCard(d) {
  return `<article class="drive-card state-${d.state.toLowerCase()}">
    <div class="dc-main">
      <h3><a href="#/student/drives/${d.driveId}">${esc(d.jobTitle)} - ${esc(d.companyName)}</a></h3>
      <div class="dc-meta"><span>${fmtLpa(d.ctcLpa)}</span><span>Min CGPA ${fmtCgpa(d.criteria?.minCgpa)}</span><span>${d.criteria && d.criteria.branches.length ? esc(d.criteria.branches.join(', ')) : 'all branches'}</span><span>Max backlogs ${d.criteria?.maxBacklogs ?? '-'}</span><span>Deadline ${fmtDateTime(d.registrationDeadline)}</span></div>
      ${stateLine(d)}
    </div>
    <div class="dc-actions">${applyButton(d)}<a class="btn ghost sm" href="#/student/drives/${d.driveId}">Details</a></div>
  </article>`;
}

export function applyErrorBanner(err) {
  if (err.code === 'E-INELIGIBLE') return errorBanner(err);
  return banner('error', esc(err.message), err.code);
}

export async function drives(root) {
  setScreen('S2 Ongoing Drives', 'UC-007 / UC-008 / UC-009');
  const p = session.user.profile || {};
  const filter = { text: '', branch: '', eligibleOnly: false };
  root.innerHTML = `
    <div class="page-head"><div><h1>Ongoing Drives <span class="trace">[UC-007 / UC-008 / UC-009]</span></h1>
      <p class="sub">Drives are evaluated against your current profile: <b>${esc(p.branch)}</b> · CGPA <b>${fmtCgpa(p.cgpa)}</b> · <b>${p.activeBacklogs ?? 0}</b> active backlog(s) (AC-01).</p></div></div>
    <div class="card tight">
      <div class="filters">
        <div class="field" style="margin:0"><label for="f-text">Search</label><input id="f-text" type="text" placeholder="company / role"></div>
        <div class="field" style="margin:0"><label for="f-branch">Branch</label><select id="f-branch"><option value="">All branches</option>${BRANCHES.map((b) => `<option value="${b}">${b}</option>`).join('')}</select></div>
        <label style="margin:0 0 9px"><input type="checkbox" id="f-eligible"> Show only drives I am eligible for</label>
      </div>
    </div>
    <div id="drive-msg"></div>
    <div id="drive-list"><p class="muted">Loading drives...</p></div>
    <p class="small faint">Ineligible drives are hidden when the filter is on, otherwise shown disabled with the reason (AC-02). Apply is enabled only for open, eligible, not-yet-applied drives (AC-04).</p>`;
  const list = root.querySelector('#drive-list');
  const msg = root.querySelector('#drive-msg');

  async function load() {
    const q = new URLSearchParams();
    if (filter.text) q.set('text', filter.text);
    if (filter.branch) q.set('branch', filter.branch);
    if (filter.eligibleOnly) q.set('eligibleOnly', 'true');
    const { drives } = await get(`/api/drives?${q}`);
    list.innerHTML = drives.length ? drives.map(driveCard).join('') : '<div class="empty">No drives match the current filter.</div>';
  }
  root.querySelector('#f-text').addEventListener('input', debounce((e) => { filter.text = e.target.value; load(); }, 250));
  root.querySelector('#f-branch').addEventListener('change', (e) => { filter.branch = e.target.value; load(); });
  root.querySelector('#f-eligible').addEventListener('change', (e) => { filter.eligibleOnly = e.target.checked; load(); });
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-apply]');
    if (!btn) return;
    setBusy(btn, true);
    try {
      const { confirmation } = await post(`/api/drives/${btn.dataset.apply}/apply`);
      msg.innerHTML = banner('success', `<b>SUCCESS</b> ${esc(confirmation.message)} <a href="#/student/applications">View my applications</a>`);
    } catch (err) {
      msg.innerHTML = applyErrorBanner(err);
    }
    await load();
    refreshUnread();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  await load();
}

export async function driveDetail(root, { driveId }) {
  setScreen('S3 Drive Details', 'UC-009');
  const { drive: d } = await get(`/api/drives/${driveId}`);
  root.innerHTML = `
    <div class="page-head"><div><h1>${esc(d.jobTitle)} - ${esc(d.companyName)} <span class="trace">[UC-009]</span></h1><p class="sub">${driveBadge(d)}</p></div></div>
    <div class="card">
      <div class="info-box"><dl>
        <dt>Package</dt><dd>${fmtLpa(d.ctcLpa)}</dd>
        <dt>Eligibility</dt><dd>${esc(criteriaText(d.criteria))}</dd>
        <dt>Registration deadline</dt><dd>${fmtDateTime(d.registrationDeadline)}</dd>
        <dt>Selection rounds</dt><dd>${d.rounds.length ? d.rounds.map((r) => `${r.roundOrder}. ${esc(r.roundName)}${r.scheduledAt ? ` <span class="muted small">(${fmtDateTime(r.scheduledAt)})</span>` : ''}`).join('<br>') : '-'}</dd>
        ${d.jobDescription ? `<dt>Job description</dt><dd>${esc(d.jobDescription)}</dd>` : ''}
        <dt>Your status</dt><dd>${stateLine(d)}</dd>
      </dl></div>
      <div class="actions">${applyButton(d)}<a class="btn" href="#/student/drives">Back to list</a>${d.applied ? '<a class="btn ghost" href="#/student/applications">View application status</a>' : ''}</div>
      <div id="apply-msg" style="margin-top:16px"></div>
      <p class="small faint" style="margin-top:12px">Success is shown only after the application is stored (FR-018). Every failed check (closed, duplicate, ineligible) discards the request; no application record is created.</p>
    </div>`;
  const msg = root.querySelector('#apply-msg');
  const btn = root.querySelector('[data-apply]');
  if (btn) btn.addEventListener('click', async () => {
    setBusy(btn, true);
    try {
      const { confirmation } = await post(`/api/drives/${driveId}/apply`);
      msg.innerHTML = banner('success', `<b>SUCCESS</b> ${esc(confirmation.message)}`);
      btn.outerHTML = '<button class="btn" disabled>Applied</button>';
      refreshUnread();
    } catch (err) {
      msg.innerHTML = applyErrorBanner(err);
      setBusy(btn, false);
      if (err.code === 'E-DUP' || err.code === 'E-REG-CLOSED' || err.code === 'E-INELIGIBLE') btn.disabled = true;
    }
  });
}

export async function applications(root) {
  setScreen('My Applications', 'UC-010 / FR-022');
  const { applications: apps } = await get('/api/applications/mine');
  root.innerHTML = `
    <div class="page-head"><div><h1>My Applications <span class="trace">[UC-010 / FR-022]</span></h1><p class="sub">Round-wise status for every drive you applied to. Offers appear here once the Placement Officer publishes them (BR-005).</p></div></div>
    ${apps.length ? apps.map(appCard).join('') : '<div class="empty">You have not applied to any drive yet. <a href="#/student/drives">Browse ongoing drives</a>.</div>'}`;
}

function appCard(a) {
  return `<article class="app-card">
    <header><h3 style="margin:0">${esc(a.jobTitle)} - ${esc(a.companyName)}</h3>${badge(APP_STATUS, a.currentRoundStatus)}</header>
    <div class="muted small">Applied ${fmtDateTime(a.applicationDate)} · Package ${fmtLpa(a.driveCtcLpa)} · Drive ${badge(DRIVE_STATUS, a.driveStatus)}</div>
    <div class="table-wrap" style="margin-top:10px"><table class="data"><thead><tr><th>#</th><th>Round</th><th>Scheduled</th><th>Your result</th></tr></thead>
      <tbody>${a.rounds.map((r) => `<tr><td>${r.roundOrder}</td><td>${esc(r.roundName)}</td><td>${fmtDateTime(r.scheduledAt)}</td><td>${resultText(r.result)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Rounds not yet defined</td></tr>'}</tbody></table></div>
    <div style="margin-top:10px">Final outcome: ${badge(OUTCOME, a.finalOutcome)}</div>
    ${a.offer ? `<div class="offer-box">Offer: ${fmtLpa(a.offer.ctcLpa)} · Offer date ${fmtDate(a.offer.offerDate)} · Congratulations!</div>` : ''}
  </article>`;
}
