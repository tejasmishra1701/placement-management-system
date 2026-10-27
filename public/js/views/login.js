// S0 Login (UC-001). Generic failure message (FR-002). Demo quick-login panel lists seeded accounts.
import { post, get, setToken } from '../api.js';
import { esc, errorBanner, setBusy, ROLE_LABEL } from '../ui.js';

export async function render(root) {
  document.title = 'PMS | Login';
  root.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <span class="brand-mark">PMS</span>
      <h1>Placement Management System</h1>
      <p class="muted small">The LNM Institute of Information Technology, Jaipur<br>CS314 Software Development Laboratory - Team T061</p>
      <form id="login-form" novalidate>
        <div class="field"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" placeholder="you@lnmiit.ac.in" required></div>
        <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
        <div id="login-msg"></div>
        <button class="btn primary" type="submit" style="width:100%">Login</button>
      </form>
      <p class="login-foot">S0 Login - UC-001. A failed login shows one generic message without revealing whether the e-mail or the password was wrong (FR-002).</p>
    </div>
    <div class="demo-panel">
      <h2>Demo accounts - quick login</h2>
      <p class="muted small">Click a card to sign in as that user. The role decides which dashboard and actions are available (FR-004, NFR-005).</p>
      <div class="demo-grid" id="demo-grid"><p class="muted">Loading accounts...</p></div>
      <details><summary class="small muted" style="cursor:pointer">All student accounts</summary><div class="demo-grid" id="demo-students"></div></details>
      <p class="login-foot">Demo data only. Use <b>Administrator &rarr; Reset demo data</b> before a presentation to refresh all dates relative to today.</p>
    </div>
  </div>`;

  const form = root.querySelector('#login-form');
  const msg = root.querySelector('#login-msg');

  async function doLogin(email, password, btn) {
    msg.innerHTML = '';
    setBusy(btn, true);
    try {
      const { token, user } = await post('/api/auth/login', { email, password });
      setToken(token);
      window.dispatchEvent(new CustomEvent('pms:login', { detail: user }));
    } catch (err) {
      msg.innerHTML = errorBanner(err);
    } finally { setBusy(btn, false); }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    doLogin(form.email.value.trim(), form.password.value, form.querySelector('button[type=submit]'));
  });

  try {
    const { accounts } = await get('/api/demo-accounts');
    const card = (a) => `<button type="button" class="demo-btn" data-email="${esc(a.email)}" data-password="${esc(a.password)}">
        <div class="role">${esc(ROLE_LABEL[a.role] || a.role)}</div><div class="who">${esc(a.name)}</div><div class="det">${esc(a.detail || a.email)}</div></button>`;
    const students = accounts.filter((a) => a.role === 'STUDENT');
    const primary = [students[0], ...accounts.filter((a) => a.role !== 'STUDENT')];
    root.querySelector('#demo-grid').innerHTML = primary.map(card).join('');
    root.querySelector('#demo-students').innerHTML = students.map(card).join('');
    root.querySelectorAll('.demo-btn').forEach((b) => b.addEventListener('click', () => {
      form.email.value = b.dataset.email; form.password.value = b.dataset.password;
      doLogin(b.dataset.email, b.dataset.password, b);
    }));
  } catch (err) {
    root.querySelector('#demo-grid').innerHTML = errorBanner(err);
  }
}
