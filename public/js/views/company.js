// Company dashboard (Section 11.2, UC-012): own drives, read-only candidate list (FR-020), interview schedules.
import { get, put, session } from '../api.js';
import { esc, fmtDateTime, fmtDate, fmtLpa, fmtCgpa, toLocalInput, badge, driveBadge, resultText, banner, errorBanner, setBusy, criteriaText, criteriaShort, APP_STATUS } from '../ui.js';
import { setScreen } from '../shell.js';

export async function drives(root) {
  setScreen('Company Dashboard', 'UC-012 / FR-020');
  const co = session.user.company;
  const { drives: list } = await get('/api/drives');
  root.innerHTML = `
    <div class="page-head"><div><h1>${esc(co ? co.companyName : 'Company')} - Drives <span class="trace">[UC-012]</span></h1><p class="sub">Drives posted on your behalf by the placement office. You can view applicants and their round-wise status, and update interview schedules.</p></div></div>
    ${list.length ? `<div class="card tight"><div class="table-wrap"><table class="data"><thead><tr><th>Job title</th><th>CTC</th><th>Deadline</th><th>Eligibility</th><th>Status</th><th class="right">Applicants</th><th class="right"></th></tr></thead>
      <tbody>${list.map((d) => `<tr><td class="name"><b>${esc(d.jobTitle)}</b></td><td class="nowrap">${fmtLpa(d.ctcLpa)}</td><td class="nowrap" title="${fmtDateTime(d.registrationDeadline)}">${fmtDate(d.registrationDeadline)}</td><td class="small">${criteriaShort(d.criteria)}</td><td>${driveBadge(d)}</td><td class="right">${d.applicationCount}</td><td class="actions-cell"><a class="btn xs" href="#/company/drives/${d.driveId}">Candidates &amp; schedule</a></td></tr>`).join('')}</tbody></table></div></div>` : '<div class="empty">No drives have been posted for your company yet.</div>'}`;
}

export async function driveDetail(root, { driveId }) {
  setScreen('Candidates (read-only)', 'UC-012 / FR-020');
  let drive, list, shortlistedOnly = false;
  async function load() { [{ drive }, { candidates: list }] = await Promise.all([get(`/api/drives/${driveId}`), get(`/api/drives/${driveId}/candidates`)]); }
  await load();
  root.innerHTML = `
    <div class="page-head"><div><h1>${esc(drive.jobTitle)} - ${esc(drive.companyName)} <span class="trace">[UC-012]</span></h1><p class="sub">${driveBadge(drive)} · ${fmtLpa(drive.ctcLpa)} · Deadline ${fmtDateTime(drive.registrationDeadline)} · ${esc(criteriaText(drive.criteria))}</p></div><a class="btn ghost sm" href="#/company/drives">Back</a></div>
    <div class="grid two">
      <div class="card"><h2>Interview schedule</h2><p class="muted small">Set or change the date of each round (Company.updateInterviewSchedule). Applicants are notified.</p><div id="sched-msg"></div>
        <div id="sched">${drive.rounds.map((r) => `<div class="field"><label>R${r.roundOrder} ${esc(r.roundName)} <span class="faint">(${esc(r.status.replace('_', ' ').toLowerCase())})</span></label><div style="display:flex;gap:8px"><input type="datetime-local" data-round="${r.roundId}" value="${toLocalInput(r.scheduledAt)}"><button class="btn sm" data-save="${r.roundId}">Save</button></div></div>`).join('')}</div></div>
      <div class="card"><h2>Drive summary</h2><div class="info-box"><dl><dt>Applicants</dt><dd id="n-total">-</dd><dt>Shortlisted (in rounds)</dt><dd id="n-short">-</dd><dt>Cleared all rounds</dt><dd id="n-cleared">-</dd><dt>Offered</dt><dd id="n-offered">-</dd></dl></div>
        ${drive.jobDescription ? `<p class="small muted">${esc(drive.jobDescription)}</p>` : ''}</div>
    </div>
    <div class="card tight"><div class="toolbar" style="margin:4px 0 10px"><h2 style="margin:0">Candidates</h2><span class="spacer"></span><label style="margin:0;font-weight:500"><input type="checkbox" id="short-only"> Shortlisted only</label></div>
      <div class="table-wrap"><table class="data" id="c-table"><thead></thead><tbody></tbody></table></div>
      <p class="small faint" style="margin:10px 0 0">Read-only (FR-020). Resumes and contact details are visible only to the company the student applied to and the placement office (NFR-012). Round results and offers are recorded by the Placement Officer.</p></div>`;
  const table = root.querySelector('#c-table');
  function render() {
    const rounds = drive.rounds;
    const shown = shortlistedOnly ? list.filter((c) => ['IN_SELECTION_ROUNDS', 'CLEARED_ALL_ROUNDS', 'OFFERED'].includes(c.currentRoundStatus)) : list;
    table.querySelector('thead').innerHTML = `<tr><th>Name</th><th>Roll No.</th><th>Branch</th><th class="right">CGPA</th><th>Resume</th>${rounds.map((r) => `<th>R${r.roundOrder}<span class="sub">${esc(r.roundName)}</span></th>`).join('')}<th>Status</th></tr>`;
    table.querySelector('tbody').innerHTML = shown.length ? shown.map((c) => `<tr><td class="name"><b>${esc(c.studentName)}</b><br><span class="small muted">${esc(c.studentEmail || '')}</span></td><td class="mono">${esc(c.rollNumber)}</td><td>${esc(c.branch)}</td><td class="right">${fmtCgpa(c.cgpa)}</td><td>${c.resumeFileUrl ? `<a href="${esc(c.resumeFileUrl)}" target="_blank" rel="noopener">${esc(c.rollNumber)}.pdf</a>` : '-'}</td>${c.rounds.map((r) => `<td>${resultText(r.result)}</td>`).join('')}<td>${c.currentRoundStatus === 'OFFERED' && c.offer ? badge(APP_STATUS, 'OFFERED', ` · ${fmtLpa(c.offer.ctcLpa)}`) : badge(APP_STATUS, c.currentRoundStatus)}</td></tr>`).join('') : `<tr><td colspan="${rounds.length + 6}" class="muted">No candidates${shortlistedOnly ? ' shortlisted yet' : ''}.</td></tr>`;
    root.querySelector('#n-total').textContent = list.length;
    root.querySelector('#n-short').textContent = list.filter((c) => ['IN_SELECTION_ROUNDS', 'CLEARED_ALL_ROUNDS', 'OFFERED'].includes(c.currentRoundStatus)).length;
    root.querySelector('#n-cleared').textContent = list.filter((c) => c.currentRoundStatus === 'CLEARED_ALL_ROUNDS').length;
    root.querySelector('#n-offered').textContent = list.filter((c) => c.currentRoundStatus === 'OFFERED').length;
  }
  render();
  root.querySelector('#short-only').addEventListener('change', (e) => { shortlistedOnly = e.target.checked; render(); });
  root.querySelector('#sched').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-save]'); if (!b) return;
    const input = root.querySelector(`input[data-round="${b.dataset.save}"]`); const msg = root.querySelector('#sched-msg');
    setBusy(b, true);
    try {
      await put(`/api/drives/${driveId}/rounds/${b.dataset.save}/schedule`, { scheduledAt: input.value ? new Date(input.value).toISOString() : '' });
      msg.innerHTML = banner('success', 'Schedule saved. Applicants have been notified.');
    } catch (err) { msg.innerHTML = errorBanner(err); }
    finally { setBusy(b, false); }
  });
}
