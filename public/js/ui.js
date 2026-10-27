// Presentation helpers: escaping, formatting, labels (Section 47.3 messages), banners, toasts, modals.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DT = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const D = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso) => (iso ? DT.format(new Date(iso)) : '-');
export const fmtDate = (iso) => (iso ? D.format(new Date(iso)) : '-');
export const fmtLpa = (n) => (n === null || n === undefined ? '-' : `${Number(n).toFixed(1)} LPA`);
export const fmtCgpa = (n) => (n === null || n === undefined ? '-' : Number(n).toFixed(2));
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const DRIVE_STATUS = {
  DRAFT: ['Draft', 'gray'], PUBLISHED: ['Published', 'green'], REGISTRATION_CLOSED: ['Registration Closed', 'amber'],
  ONGOING_ROUNDS: ['Ongoing Rounds', 'blue'], COMPLETED: ['Completed', 'navy'], CANCELLED: ['Cancelled', 'red'],
};
export const APP_STATUS = {
  APPLIED: ['Applied', 'blue'], IN_SELECTION_ROUNDS: ['In Selection Rounds', 'amber'], CLEARED_ALL_ROUNDS: ['Cleared All Rounds', 'green'],
  OFFERED: ['Offered', 'green'], REJECTED: ['Rejected', 'red'],
};
export const OUTCOME = { PENDING: ['Pending', 'gray'], OFFERED: ['Offered', 'green'], REJECTED: ['Rejected', 'red'] };
export const RESULT = { PENDING: ['Pending', 'result-p'], QUALIFIED: ['Qualified', 'result-q'], NOT_QUALIFIED: ['Not qualified', 'result-nq'] };
export const ROLE_LABEL = { STUDENT: 'Student', COMPANY: 'Company', PLACEMENT_OFFICER: 'Placement Officer', ADMINISTRATOR: 'Administrator' };
export const NOTIF_LABEL = { NEW_DRIVE: 'New drive', DEADLINE_REMINDER: 'Deadline reminder', ROUND_UPDATE: 'Round update', OFFER_RESULT: 'Offer result', DRIVE_CLOSED_OR_CANCELLED: 'Drive update' };

export const badge = (map, value, extra = '') => { const [label, cls] = map[value] || [value, 'gray']; return `<span class="badge ${cls}">${esc(label)}${extra}</span>`; };
export const driveBadge = (d) => badge(DRIVE_STATUS, d.effectiveStatus || d.status) + (d.status === 'PUBLISHED' && d.effectiveStatus === 'REGISTRATION_CLOSED' ? ' <span class="small faint">(deadline passed)</span>' : '');
export const resultText = (r) => { const [label, cls] = RESULT[r] || RESULT.PENDING; return `<span class="${cls}">${label}</span>`; };

export function banner(type, html, code) {
  return `<div class="banner ${type}">${code ? `<span class="code">${esc(code)}</span>` : ''}${html}</div>`;
}
export function errorBanner(err) {
  const rules = err.failedRules && err.failedRules.length ? `<ul>${err.failedRules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '';
  const fields = err.fields && err.fields.length ? `<ul>${err.fields.map((f) => `<li>${esc(f.message)}</li>`).join('')}</ul>` : '';
  return banner('error', `${esc(err.message)}${rules}${fields}`, err.code);
}
export function applyFieldErrors(form, fields) {
  form.querySelectorAll('.field.has-error, .fieldset.has-error').forEach((el) => el.classList.remove('has-error'));
  for (const f of fields || []) {
    const key = String(f.field).replace(/\[\d+\]$/, '');
    const wrap = form.querySelector(`[data-field="${CSS.escape(key)}"]`);
    if (!wrap) continue;
    wrap.classList.add('has-error');
    const slot = wrap.querySelector(':scope > .field-error') || wrap.querySelector('.field-error');
    if (slot) slot.textContent = f.message;
  }
}

export function toast(text, type = '') {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = text;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 3800);
}

export function setBusy(btn, busy) { if (!btn) return; btn.classList.toggle('busy', busy); btn.disabled = !!busy; }

// modal({ title, body, actions:[{label, kind, onClick(close, modalEl)}] }) -> close()
export function modal({ title, body, actions = [], wide = false }) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${wide ? 'style="max-width:760px"' : ''}>
    <header><h2>${title}</h2><button class="x" type="button" aria-label="Close">&times;</button></header>
    <div class="modal-body">${body}</div>
    <footer></footer></div>`;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.x').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const footer = overlay.querySelector('footer');
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `btn ${a.kind || ''}`; b.textContent = a.label;
    b.addEventListener('click', () => a.onClick ? a.onClick(close, overlay, b) : close());
    footer.appendChild(b);
  }
  if (!actions.length) footer.remove();
  root.appendChild(overlay);
  const first = overlay.querySelector('input, select, textarea, button.primary');
  if (first) first.focus();
  return { close, el: overlay };
}

export function confirmDialog({ title = 'Please confirm', message, confirmLabel = 'Yes', cancelLabel = 'No', danger = false }) {
  return new Promise((resolve) => {
    modal({ title, body: `<p>${message}</p>`, actions: [
      { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: (close) => { close(); resolve(true); } },
      { label: cancelLabel, onClick: (close) => { close(); resolve(false); } },
    ] });
  });
}

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const criteriaText = (c) => c ? `CGPA >= ${fmtCgpa(c.minCgpa)} | ${c.branches.length ? c.branches.join(', ') : 'all branches'} | backlogs <= ${c.maxBacklogs ?? '-'}` : 'not defined';
export const criteriaShort = (c) => c ? `<span class="nowrap">CGPA &ge; ${fmtCgpa(c.minCgpa)}</span><br><span class="faint">${c.branches.length ? esc(c.branches.join('/')) : 'all branches'} &middot; &le; ${c.maxBacklogs ?? '-'} backlogs</span>` : '<span class="faint">not defined</span>';
export function todayLocal() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
