// Placement Officer dashboard: Home, Drives, S1 Create/Edit Drive (UC-004/005/006), S4 Candidates (UC-011),
// S5 Record Offer (UC-013), Companies (UC-003), Students (AC-03).
import { get, post, put } from '../api.js';
import { esc, fmtDateTime, fmtDate, fmtLpa, fmtCgpa, toLocalInput, todayLocal, badge, driveBadge, resultText, banner, errorBanner, applyFieldErrors, toast, modal, confirmDialog, setBusy, criteriaText, criteriaShort, APP_STATUS, OUTCOME } from '../ui.js';
import { setScreen, navigate } from '../shell.js';

const BRANCHES = ['CSE', 'IT', 'ECE', 'CCE', 'MME'];
const DEFAULT_ROUNDS = ['Aptitude Test', 'Technical Interview', 'HR Interview'];

// ---------------- Home ----------------
export async function home(root) {
  setScreen('Officer Home', 'FR-026 / FR-027');
  const [{ summary: s }, { drives: list }] = await Promise.all([get('/api/dashboard/summary'), get('/api/drives')]);
  const bs = s.drives.byStatus; const as = s.applications.byStatus;
  root.innerHTML = `
    <div class="page-head"><div><h1>Placement Office - Home</h1><p class="sub">Overview of the current placement season.</p></div>
      <div class="actions" style="margin:0"><a class="btn primary" href="#/officer/drives/new">+ Create Drive</a><a class="btn" href="#/officer/reports">Reports</a></div></div>
    <div class="tiles">
      <div class="tile"><div class="n">${bs.PUBLISHED}</div><div class="l">Open for registration</div></div>
      <div class="tile"><div class="n">${bs.REGISTRATION_CLOSED}</div><div class="l">Registration closed</div></div>
      <div class="tile"><div class="n">${bs.ONGOING_ROUNDS}</div><div class="l">Ongoing rounds</div></div>
      <div class="tile"><div class="n">${bs.COMPLETED}</div><div class="l">Completed drives</div></div>
      <div class="tile"><div class="n">${s.applications.total}</div><div class="l">Applications</div></div>
      <div class="tile"><div class="n">${as.OFFERED || 0}</div><div class="l">Offers recorded</div></div>
      <div class="tile"><div class="n">${s.users.students}</div><div class="l">Students</div></div>
      <div class="tile"><div class="n">${s.users.companies}</div><div class="l">Companies</div></div>
    </div>
    <div class="grid two">
      <div class="card"><h2>Needs attention</h2>
        ${s.attention.length ? `<ul class="attention">${s.attention.map((a) => `<li><a href="#/officer/drives/${a.driveId}/${a.reason.startsWith('Draft') ? 'edit' : 'candidates'}">${esc(a.label)}</a><br><span class="small muted">${esc(a.reason)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing pending.</p>'}</div>
      <div class="card"><h2>Recent drives</h2>
        <div class="table-wrap"><table class="data"><thead><tr><th>Drive</th><th>Status</th><th class="right">Applied</th></tr></thead>
        <tbody>${list.slice(0, 6).map((d) => `<tr><td><a href="#/officer/drives/${d.driveId}/candidates">${esc(d.jobTitle || '(untitled)')}</a><br><span class="small muted">${esc(d.companyName)}</span></td><td>${driveBadge(d)}</td><td class="right">${d.applicationCount}</td></tr>`).join('')}</tbody></table></div>
        <p style="margin-top:10px"><a href="#/officer/drives">All drives &rarr;</a></p></div>
    </div>`;
}

// ---------------- Drives list ----------------
function driveActions(d) {
  const a = [];
  const eff = d.effectiveStatus;
  if (d.status === 'DRAFT') { a.push(`<a class="btn xs" href="#/officer/drives/${d.driveId}/edit">Edit</a>`); a.push(`<button class="btn xs primary" data-act="publish" data-id="${d.driveId}">Publish</button>`); }
  if (d.status === 'PUBLISHED' && eff === 'PUBLISHED') { a.push(`<a class="btn xs" href="#/officer/drives/${d.driveId}/edit">Edit</a>`); a.push(`<button class="btn xs" data-act="close" data-id="${d.driveId}">Close registration</button>`); }
  if (eff === 'REGISTRATION_CLOSED') a.push(`<button class="btn xs primary" data-act="begin-rounds" data-id="${d.driveId}">Begin rounds</button>`);
  if (d.status === 'ONGOING_ROUNDS') a.push(`<button class="btn xs primary" data-act="complete" data-id="${d.driveId}">Complete</button>`);
  if (d.status !== 'DRAFT') a.push(`<a class="btn xs" href="#/officer/drives/${d.driveId}/candidates">Candidates</a>`);
  if (['PUBLISHED', 'REGISTRATION_CLOSED', 'ONGOING_ROUNDS'].includes(d.status)) a.push(`<button class="btn xs danger" data-act="cancel" data-id="${d.driveId}">Cancel</button>`);
  return a.join(' ');
}

export async function drives(root) {
  setScreen('Drives', 'UC-004 / UC-006 / FR-012');
  root.innerHTML = `
    <div class="page-head"><div><h1>Placement Drives <span class="trace">[UC-004 / UC-006 / FR-012]</span></h1><p class="sub">Lifecycle: Draft &rarr; Published &rarr; Registration Closed &rarr; Ongoing Rounds &rarr; Completed (or Cancelled).</p></div>
      <a class="btn primary" href="#/officer/drives/new">+ Create Drive</a></div>
    <div id="drives-msg"></div>
    <div class="card tight"><div class="table-wrap"><table class="data" id="drives-table"><thead><tr><th>Drive</th><th>CTC</th><th>Deadline</th><th>Eligibility</th><th>Status</th><th class="right">Applied</th><th class="right">Actions</th></tr></thead><tbody></tbody></table></div></div>`;
  const tbody = root.querySelector('tbody'); const msg = root.querySelector('#drives-msg');
  async function load() {
    const { drives: list } = await get('/api/drives');
    tbody.innerHTML = list.length ? list.map((d) => `<tr><td class="name"><b>${esc(d.jobTitle || '(untitled)')}</b><br><span class="small muted">${esc(d.companyName)}</span></td><td class="nowrap">${fmtLpa(d.ctcLpa)}</td><td class="nowrap" title="${fmtDateTime(d.registrationDeadline)}">${fmtDate(d.registrationDeadline)}</td><td class="small">${criteriaShort(d.criteria)}</td><td>${driveBadge(d)}</td><td class="right">${d.applicationCount}</td><td class="actions-cell">${driveActions(d)}</td></tr>`).join('') : '<tr><td colspan="7" class="muted">No drives yet.</td></tr>';
  }
  tbody.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) lifecycleAction(b.dataset.act, b.dataset.id, b, msg, load); });
  await load();
}

export async function lifecycleAction(act, driveId, btn, msgEl, reload) {
  const confirms = {
    close: { title: 'Close registration', message: 'Close registration now? Students will no longer be able to apply and applicants will be notified (FR-012).' },
    cancel: { title: 'Cancel drive', message: 'Cancel this drive? All applicants will be notified and the drive cannot be reopened (FR-012).', danger: true },
    complete: { title: 'Complete drive', message: 'Mark this drive as completed? All outcomes must already be declared (Figure 11).' },
    'begin-rounds': { title: 'Begin selection rounds', message: 'Begin the selection rounds for this drive? Applicants will be notified.' },
  };
  if (confirms[act] && !(await confirmDialog({ confirmLabel: 'Yes, continue', cancelLabel: 'No', ...confirms[act] }))) return;
  setBusy(btn, true);
  try {
    const r = await post(`/api/drives/${driveId}/${act}`);
    if (act === 'publish') {
      if (r.published) msgEl.innerHTML = banner('success', `Drive published. <b>${r.notified}</b> eligible student(s) notified (FR-023).`);
      else msgEl.innerHTML = banner('error', `Cannot publish: ${r.missingFields.length} mandatory field(s) are missing. <a href="#/officer/drives/${driveId}/edit">Complete them</a> and try again.<ul>${r.missingFields.map((m) => `<li>${esc(m.message)}</li>`).join('')}</ul>`, 'M-01');
    } else {
      msgEl.innerHTML = banner('success', `${esc(r.drive.jobTitle)} - ${esc(r.drive.companyName)} is now <b>${esc(r.drive.effectiveStatus.replace(/_/g, ' ').toLowerCase())}</b>.`);
    }
  } catch (err) { msgEl.innerHTML = errorBanner(err); }
  finally { setBusy(btn, false); if (reload) await reload(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

// ---------------- S1 Create / Edit Drive ----------------
export async function driveForm(root, { driveId } = {}) {
  const editing = !!driveId;
  setScreen(editing ? 'S1 Edit Drive' : 'S1 Create Drive', 'UC-004 / UC-005');
  const [{ companies: cos }, existing] = await Promise.all([get('/api/companies'), editing ? get(`/api/drives/${driveId}`).then((r) => r.drive) : null]);
  if (existing && !existing.editable) {
    root.innerHTML = banner('error', 'This drive can no longer be edited: the registration deadline has passed or the drive has moved past registration (FR-010).', 'E-STATE') + `<a class="btn" href="#/officer/drives">Back to drives</a>`;
    return;
  }
  const d = existing || { criteria: { minCgpa: '', maxBacklogs: 0, branches: ['CSE', 'IT'] }, rounds: DEFAULT_ROUNDS.map((n) => ({ roundName: n })) };
  const isDraft = !existing || existing.status === 'DRAFT';
  root.innerHTML = `
    <div class="page-head"><div><h1>${editing ? 'Edit' : 'Create'} Drive <span class="trace">[UC-004]</span></h1><p class="sub">${isDraft ? 'Save as Draft keeps the drive hidden from students (FR-009). Publish validates all mandatory fields (BR-006) and notifies eligible students (FR-023).' : 'This drive is published; changes are allowed until the registration deadline (FR-010). Eligibility edits are audited (NFR-013).'}</p></div></div>
    <form id="drive-form" class="card" novalidate>
      <div id="form-banner"></div>
      <div class="grid two">
        <div class="field" data-field="companyId"><label>Company <span class="req">*</span></label><select name="companyId">${cos.map((c) => `<option value="${c.companyId}" ${d.companyId === c.companyId ? 'selected' : ''}>${esc(c.companyName)}</option>`).join('')}</select><div class="field-error"></div></div>
        <div class="field" data-field="jobTitle"><label>Job Title <span class="req">*</span></label><input name="jobTitle" type="text" value="${esc(d.jobTitle || '')}" placeholder="Software Engineer"><div class="field-error"></div></div>
        <div class="field" data-field="ctcLpa"><label>Package / CTC (LPA) <span class="req">*</span></label><input name="ctcLpa" type="number" step="0.1" min="0" value="${d.ctcLpa ?? ''}" placeholder="12.0"><div class="field-error"></div></div>
        <div class="field" data-field="registrationDeadline"><label>Registration Deadline <span class="req">*</span></label><input name="registrationDeadline" type="datetime-local" value="${toLocalInput(d.registrationDeadline)}"><div class="field-error"></div><div class="hint">Must be in the future (BR-003 / M-03).</div></div>
      </div>
      <div class="field" data-field="jobDescription"><label>Job Description</label><textarea name="jobDescription" placeholder="Role summary, skills, location">${esc(d.jobDescription || '')}</textarea></div>
      <div class="fieldset" data-field="eligibilityCriteria"><div class="legend">Eligibility Criteria (FR-008) <span class="trace">[UC-005]</span></div>
        <div class="grid three">
          <div class="field" data-field="minCgpa"><label>Min CGPA <span class="req">*</span></label><input name="minCgpa" type="number" step="0.1" min="0" max="10" value="${d.criteria?.minCgpa ?? ''}" placeholder="7.5"><div class="field-error"></div></div>
          <div class="field" data-field="maxBacklogs"><label>Max Active Backlogs <span class="req">*</span></label><input name="maxBacklogs" type="number" step="1" min="0" value="${d.criteria?.maxBacklogs ?? 0}"><div class="field-error"></div></div>
          <div class="field" data-field="branches"><label>Allowed Branches <span class="req">*</span></label><div class="checks">${BRANCHES.map((b) => `<label><input type="checkbox" name="branches" value="${b}" ${(d.criteria?.branches || []).includes(b) ? 'checked' : ''}> ${b}</label>`).join('')}</div><div class="field-error"></div></div>
        </div>
        <div class="field-error"></div><div class="hint">* mandatory for publishing (BR-006)</div>
      </div>
      <div class="fieldset rounds-editor" data-field="selectionRounds"><div class="legend">Selection Rounds (FR-007) <span class="trace">[Round 1..*]</span></div>
        <div id="rounds"></div><div class="field-error"></div>
        <button type="button" class="btn sm" id="add-round">+ Add round</button>
      </div>
      <div class="actions">
        ${isDraft ? '<button type="button" class="btn" data-submit="draft">Save as Draft</button><button type="button" class="btn primary" data-submit="publish">Publish Drive</button>' : '<button type="button" class="btn primary" data-submit="save">Save changes</button>'}
        <a class="btn ghost" href="#/officer/drives">Cancel</a>
      </div>
      <p class="small faint" style="margin-top:10px">${isDraft ? 'Save as Draft stores status "Draft" (hidden from students). Publish validates mandatory fields, stores "Published" and notifies eligible students.' : ''}</p>
    </form>`;
  const form = root.querySelector('#drive-form');
  const roundsEl = root.querySelector('#rounds');
  const rows = (d.rounds || []).map((r) => ({ ...r }));
  function renderRounds() {
    roundsEl.innerHTML = rows.map((r, i) => `<div class="round-row"><span class="idx">${i + 1}</span><input type="text" data-r="${i}" data-k="roundName" value="${esc(r.roundName || '')}" placeholder="Round name"><input class="sched" type="datetime-local" data-r="${i}" data-k="scheduledAt" value="${toLocalInput(r.scheduledAt)}" title="Optional schedule"><button type="button" class="btn xs danger rm" data-rm="${i}">Remove</button></div>`).join('') || '<p class="muted small">No rounds. Add at least one round to publish.</p>';
  }
  renderRounds();
  roundsEl.addEventListener('input', (e) => { const i = e.target.dataset.r; if (i !== undefined) rows[i][e.target.dataset.k] = e.target.value; });
  roundsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { rows.splice(Number(b.dataset.rm), 1); renderRounds(); } });
  root.querySelector('#add-round').addEventListener('click', () => { rows.push({ roundName: '' }); renderRounds(); roundsEl.querySelector(`[data-r="${rows.length - 1}"]`).focus(); });

  function payload() {
    const f = form.elements;
    return {
      companyId: f.companyId.value, jobTitle: f.jobTitle.value, ctcLpa: f.ctcLpa.value, jobDescription: f.jobDescription.value,
      registrationDeadline: f.registrationDeadline.value ? new Date(f.registrationDeadline.value).toISOString() : '',
      criteria: { minCgpa: f.minCgpa.value, maxBacklogs: f.maxBacklogs.value, branches: [...form.querySelectorAll('input[name=branches]:checked')].map((c) => c.value) },
      rounds: rows.map((r) => ({ roundId: r.roundId, roundName: r.roundName, scheduledAt: r.scheduledAt ? new Date(r.scheduledAt).toISOString() : '' })),
    };
  }
  const bannerEl = root.querySelector('#form-banner');
  form.querySelectorAll('[data-submit]').forEach((btn) => btn.addEventListener('click', async () => {
    const mode = btn.dataset.submit;
    bannerEl.innerHTML = ''; applyFieldErrors(form, []);
    setBusy(btn, true);
    try {
      const saved = editing ? await put(`/api/drives/${driveId}`, payload()) : await post('/api/drives', payload());
      const id = saved.drive.driveId;
      if (mode === 'publish') {
        const r = await post(`/api/drives/${id}/publish`);
        if (!r.published) {
          bannerEl.innerHTML = banner('error', `<b>Cannot publish: ${r.missingFields.length} mandatory field(s) are missing.</b> Complete them and try again. Entered data is retained; Save as Draft still works (FR-009).`, 'M-01');
          applyFieldErrors(form, r.missingFields);
          if (!editing) history.replaceState(null, '', `#/officer/drives/${id}/edit`);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        toast(`Drive published. ${r.notified} eligible student(s) notified (FR-023).`, 'success');
      } else {
        toast(mode === 'draft' ? 'Draft saved. Hidden from students until published (FR-009).' : 'Drive updated.', 'success');
      }
      navigate('#/officer/drives');
    } catch (err) {
      bannerEl.innerHTML = errorBanner(err);
      applyFieldErrors(form, err.fields);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { setBusy(btn, false); }
  }));
}

// ---------------- S4 Candidates ----------------
export async function candidates(root, { driveId }) {
  setScreen('S4 Candidates', 'UC-011 / UC-013');
  let drive, list;
  async function load() { [{ drive }, { candidates: list }] = await Promise.all([get(`/api/drives/${driveId}`), get(`/api/drives/${driveId}/candidates`)]); }
  await load();
  root.innerHTML = `
    <div class="page-head"><div><h1>Candidates - ${esc(drive.jobTitle)}, ${esc(drive.companyName)} <span class="trace">[UC-011 / UC-013]</span></h1>
      <p class="sub"><span id="drive-badge">${driveBadge(drive)}</span> · ${fmtLpa(drive.ctcLpa)} · Deadline ${fmtDateTime(drive.registrationDeadline)} · ${esc(criteriaText(drive.criteria))}</p></div>
      <div class="lifecycle" id="lifecycle"></div></div>
    <div id="cand-msg"></div>
    <div class="card tight"><div class="table-wrap"><table class="data" id="cand-table"><thead></thead><tbody></tbody></table></div></div>
    <p class="small faint">Record Offer is enabled only when every round shows Qualified for that candidate (UC-013 precondition). Round results can be updated only while the drive is in Ongoing Rounds; each update notifies the student (FR-025). Companies see this list read-only (FR-020).</p>`;
  const msg = root.querySelector('#cand-msg');
  const table = root.querySelector('#cand-table');

  function renderLifecycle() {
    const b = [];
    const eff = drive.effectiveStatus;
    if (drive.status === 'PUBLISHED' && eff === 'PUBLISHED') b.push(`<button class="btn sm" data-act="close">Close registration</button>`);
    if (eff === 'REGISTRATION_CLOSED') b.push(`<button class="btn sm primary" data-act="begin-rounds">Begin rounds</button>`);
    if (drive.status === 'ONGOING_ROUNDS') b.push(`<button class="btn sm primary" data-act="complete">Complete drive</button>`);
    if (['PUBLISHED', 'REGISTRATION_CLOSED', 'ONGOING_ROUNDS'].includes(drive.status)) b.push(`<button class="btn sm danger" data-act="cancel">Cancel drive</button>`);
    b.push('<a class="btn sm ghost" href="#/officer/drives">All drives</a>');
    root.querySelector('#lifecycle').innerHTML = b.join('');
    root.querySelector('#drive-badge').innerHTML = driveBadge(drive);
  }

  function renderTable() {
    const rounds = drive.rounds;
    const editable = drive.status === 'ONGOING_ROUNDS';
    table.querySelector('thead').innerHTML = `<tr><th>Name</th><th>Roll No.</th><th>Branch · CGPA</th>${rounds.map((r) => `<th>R${r.roundOrder}<span class="sub">${esc(r.roundName)}</span></th>`).join('')}<th>Outcome</th><th class="right">Action</th></tr>`;
    table.querySelector('tbody').innerHTML = list.length ? list.map((c) => {
      const frozen = c.currentRoundStatus === 'OFFERED' || (c.finalOutcome === 'REJECTED' && !c.rounds.some((r) => r.result === 'NOT_QUALIFIED'));
      const cells = c.rounds.map((r, i) => {
        const prevOk = i === 0 || c.rounds[i - 1].result === 'QUALIFIED';
        if (!editable || frozen || !prevOk) return `<td>${r.result === 'PENDING' && !prevOk && editable && !frozen ? '<span class="result-p">-</span>' : resultText(r.result)}</td>`;
        return `<td><select class="cell-select" data-app="${c.applicationId}" data-round="${r.roundId}">${['PENDING', 'QUALIFIED', 'NOT_QUALIFIED'].map((v) => `<option value="${v}" ${v === r.result ? 'selected' : ''}>${v === 'PENDING' ? 'Pending' : v === 'QUALIFIED' ? 'Qualified' : 'Not qualified'}</option>`).join('')}</select></td>`;
      }).join('');
      const outcome = c.currentRoundStatus === 'OFFERED' && c.offer ? badge(APP_STATUS, 'OFFERED', ` · ${fmtLpa(c.offer.ctcLpa)}`) : badge(APP_STATUS, c.currentRoundStatus);
      let action = '';
      if (editable) {
        if (c.currentRoundStatus === 'OFFERED') action = `<button class="btn xs" data-offer="${c.applicationId}">Replace Offer</button>`;
        else action = `<button class="btn xs primary" data-offer="${c.applicationId}" ${c.cleared ? '' : 'disabled title="Enabled once every round is Qualified"'}>Record Offer</button>${c.cleared ? ` <button class="btn xs link" data-notoffered="${c.applicationId}">Not offered</button>` : ''}`;
      }
      return `<tr><td class="name"><b>${esc(c.studentName)}</b></td><td class="mono">${esc(c.rollNumber)}</td><td class="nowrap">${esc(c.branch)} · ${fmtCgpa(c.cgpa)}${c.activeBacklogs ? ` · ${c.activeBacklogs} backlog(s)` : ''}</td>${cells}<td>${outcome}</td><td class="actions-cell">${action}</td></tr>`;
    }).join('') : `<tr><td colspan="${rounds.length + 5}" class="muted">No applications for this drive yet.</td></tr>`;
  }
  renderLifecycle(); renderTable();

  root.querySelector('#lifecycle').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    await lifecycleAction(b.dataset.act, driveId, b, msg, async () => { await load(); renderLifecycle(); renderTable(); });
  });
  table.addEventListener('change', async (e) => {
    const sel = e.target.closest('select[data-app]'); if (!sel) return;
    sel.disabled = true;
    try {
      await post(`/api/applications/${sel.dataset.app}/rounds/${sel.dataset.round}/result`, { result: sel.value });
      msg.innerHTML = banner('success', 'Result saved. Student notified of the round update (FR-025).');
    } catch (err) { msg.innerHTML = errorBanner(err); }
    await load(); renderTable();
  });
  table.addEventListener('click', async (e) => {
    const ob = e.target.closest('[data-offer]');
    if (ob) { const c = list.find((x) => x.applicationId === ob.dataset.offer); return recordOfferModal(c, drive, msg, async () => { await load(); renderTable(); }); }
    const nb = e.target.closest('[data-notoffered]');
    if (nb) {
      const c = list.find((x) => x.applicationId === nb.dataset.notoffered);
      if (!(await confirmDialog({ title: 'Declare: not offered', message: `Declare that <b>${esc(c.studentName)}</b> cleared all rounds but did not receive an offer? The student will be notified.`, confirmLabel: 'Yes, declare', cancelLabel: 'No', danger: true }))) return;
      try { await post(`/api/applications/${c.applicationId}/not-offered`); msg.innerHTML = banner('success', 'Outcome declared and student notified.'); }
      catch (err) { msg.innerHTML = errorBanner(err); }
      await load(); renderTable();
    }
  });
}

// ---------------- S5 Record Offer ----------------
function recordOfferModal(c, drive, msgEl, reload) {
  const today = todayLocal();
  const clearedCount = c.rounds.filter((r) => r.result === 'QUALIFIED').length;
  const m = modal({
    title: `Record Offer <span class="trace">[UC-013]</span>`,
    body: `<p class="muted small">Candidate: <b>${esc(c.studentName)} (${esc(c.rollNumber)})</b> · Drive: ${esc(drive.jobTitle)}, ${esc(drive.companyName)} · Rounds: ${clearedCount} of ${c.rounds.length} cleared</p>
      <div id="offer-banner"></div>
      <form id="offer-form" novalidate><div class="grid two">
        <div class="field" data-field="offer"><label>Package / CTC (LPA) <span class="req">*</span></label><input name="ctcLpa" type="number" step="0.1" min="0" value="${c.offer ? c.offer.ctcLpa : drive.ctcLpa ?? ''}"><div class="field-error"></div></div>
        <div class="field"><label>Offer Date <span class="req">*</span></label><input name="offerDate" type="date" value="${c.offer ? c.offer.offerDate : today}"></div>
      </div></form>
      <p class="small faint">Round clearance and existing-offer checks run before recording; the notification is sent only after the commit succeeds (Figure 10).</p>`,
    actions: [
      { label: c.offer ? 'Replace Offer' : 'Record Offer', kind: 'primary', onClick: (close, el, btn) => submit(false, close, el, btn) },
      { label: 'Cancel' },
    ],
  });
  async function submit(overwriteOk, close, el, btn) {
    const form = el.querySelector('#offer-form'); const b = el.querySelector('#offer-banner');
    setBusy(btn, true); b.innerHTML = ''; applyFieldErrors(form, []);
    try {
      const { offer } = await post(`/api/applications/${c.applicationId}/offer`, { ctcLpa: form.ctcLpa.value, offerDate: form.offerDate.value, overwriteOk });
      close();
      msgEl.innerHTML = banner('success', `<b>SUCCESS</b> Offer ${offer.status === 'REPLACED' ? 'replaced' : 'recorded'} and published: ${esc(c.studentName)} - ${fmtLpa(offer.ctcLpa)} (${fmtDate(offer.offerDate)}). Student notified (FR-025).`);
      await reload();
    } catch (err) {
      setBusy(btn, false);
      if (err.code === 'E-OFFER-EXISTS') {
        b.innerHTML = `<div class="banner warn"><b>Confirm overwrite</b><br>An offer (${fmtLpa(err.existing.ctcLpa)}, ${fmtDate(err.existing.offerDate)}) already exists for this application. Replace it?
          <div class="actions" style="margin-top:10px"><button type="button" class="btn sm primary" id="ow-yes">Yes, replace</button><button type="button" class="btn sm" id="ow-no">No, keep existing</button></div></div>`;
        b.querySelector('#ow-yes').addEventListener('click', () => submit(true, close, el, btn));
        b.querySelector('#ow-no').addEventListener('click', () => { b.innerHTML = banner('info', 'Existing offer kept unchanged.'); });
      } else {
        b.innerHTML = errorBanner(err);
        applyFieldErrors(form, err.fields);
      }
    }
  }
}

// ---------------- Companies (UC-003) ----------------
export async function companies(root) {
  setScreen('Companies', 'UC-003 / FR-005');
  root.innerHTML = `
    <div class="page-head"><div><h1>Companies <span class="trace">[UC-003 / FR-005]</span></h1><p class="sub">Company records are created by the Placement Officer (BR-007); drives are linked to a company.</p></div></div>
    <div class="card"><h2>Add company</h2><form id="co-form" class="inline-form" novalidate>
      <div class="field" data-field="companyName" style="margin:0"><label>Company name <span class="req">*</span></label><input name="companyName" type="text"><div class="field-error"></div></div>
      <div class="field" style="margin:0"><label>Industry</label><input name="industry" type="text"></div>
      <div class="field" style="margin:0"><label>Contact person</label><input name="contactPerson" type="text"></div>
      <div class="field" data-field="contactEmail" style="margin:0"><label>Contact e-mail</label><input name="contactEmail" type="email"><div class="field-error"></div></div>
      <button class="btn primary" type="submit">Add company</button></form><div id="co-msg" style="margin-top:12px"></div></div>
    <div class="card tight"><div class="table-wrap"><table class="data"><thead><tr><th>Company</th><th>Industry</th><th>Contact</th><th>E-mail</th><th>Login</th><th class="right">Drives</th></tr></thead><tbody id="co-body"></tbody></table></div></div>`;
  const body = root.querySelector('#co-body'); const form = root.querySelector('#co-form'); const msg = root.querySelector('#co-msg');
  async function load() {
    const { companies: cos } = await get('/api/companies');
    body.innerHTML = cos.map((c) => `<tr><td><b>${esc(c.companyName)}</b></td><td>${esc(c.industry || '-')}</td><td>${esc(c.contactPerson || '-')}</td><td>${esc(c.contactEmail || '-')}</td><td>${c.hasAccount ? '<span class="badge green">account</span>' : '<span class="faint small">via placement office</span>'}</td><td class="right">${c.driveCount}</td></tr>`).join('');
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.innerHTML = ''; applyFieldErrors(form, []);
    const btn = form.querySelector('button'); setBusy(btn, true);
    try {
      const { company } = await post('/api/companies', { companyName: form.companyName.value, industry: form.industry.value, contactPerson: form.contactPerson.value, contactEmail: form.contactEmail.value });
      msg.innerHTML = banner('success', `Company <b>${esc(company.companyName)}</b> added. You can now create a drive for it.`); form.reset(); await load();
    } catch (err) { msg.innerHTML = errorBanner(err); applyFieldErrors(form, err.fields); }
    finally { setBusy(btn, false); }
  });
  await load();
}

// ---------------- Students (AC-03) ----------------
export async function students(root) {
  setScreen('Students', 'AC-03 / NFR-013');
  root.innerHTML = `
    <div class="page-head"><div><h1>Student Profiles <span class="trace">[AC-03]</span></h1><p class="sub">Academic profiles used by the eligibility check. A formal update re-evaluates every drive instantly; edits are audited.</p></div></div>
    <div id="st-msg"></div>
    <div class="card tight"><div class="table-wrap"><table class="data"><thead><tr><th>Roll No.</th><th>Name</th><th>E-mail</th><th>Branch</th><th class="right">CGPA</th><th class="right">Backlogs</th><th>Status</th><th class="right">Action</th></tr></thead><tbody id="st-body"></tbody></table></div></div>`;
  const body = root.querySelector('#st-body'); const msg = root.querySelector('#st-msg');
  let list = [];
  async function load() {
    ({ students: list } = await get('/api/students'));
    body.innerHTML = list.map((s) => `<tr><td class="mono">${esc(s.rollNumber)}</td><td class="name"><b>${esc(s.name)}</b></td><td class="small">${esc(s.email)}</td><td>${esc(s.branch)}</td><td class="right">${fmtCgpa(s.cgpa)}</td><td class="right">${s.activeBacklogs}</td><td>${s.accountStatus === 'ACTIVE' ? '<span class="badge green">Active</span>' : '<span class="badge red">Deactivated</span>'}</td><td class="actions-cell"><button class="btn xs" data-edit="${s.studentId}">Edit profile</button></td></tr>`).join('');
  }
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]'); if (!b) return;
    const s = list.find((x) => x.studentId === b.dataset.edit);
    modal({ title: `Edit profile - ${esc(s.name)}`, body: `<form id="st-form" novalidate><div id="st-banner"></div><div class="grid three">
        <div class="field" data-field="branch"><label>Branch</label><select name="branch">${BRANCHES.map((x) => `<option ${x === s.branch ? 'selected' : ''}>${x}</option>`).join('')}</select><div class="field-error"></div></div>
        <div class="field" data-field="cgpa"><label>CGPA</label><input name="cgpa" type="number" step="0.01" min="0" max="10" value="${s.cgpa}"><div class="field-error"></div></div>
        <div class="field" data-field="activeBacklogs"><label>Active backlogs</label><input name="activeBacklogs" type="number" step="1" min="0" value="${s.activeBacklogs}"><div class="field-error"></div></div></div>
        <div class="field"><label>Resume file URL</label><input name="resumeFileUrl" type="text" value="${esc(s.resumeFileUrl || '')}"></div></form>`,
      actions: [{ label: 'Save', kind: 'primary', onClick: async (close, el, btn) => {
        const f = el.querySelector('#st-form'); setBusy(btn, true); applyFieldErrors(f, []);
        try {
          await put(`/api/students/${s.studentId}`, { branch: f.branch.value, cgpa: f.cgpa.value, activeBacklogs: f.activeBacklogs.value, resumeFileUrl: f.resumeFileUrl.value });
          close(); msg.innerHTML = banner('success', `Profile of ${esc(s.name)} updated. Eligibility for every drive is re-evaluated on the stored profile (AC-03).`); await load();
        } catch (err) { setBusy(btn, false); el.querySelector('#st-banner').innerHTML = errorBanner(err); applyFieldErrors(f, err.fields); }
      } }, { label: 'Cancel' }] });
  });
  await load();
}
