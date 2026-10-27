'use strict';
// AuthController: login, logout, session filter (UC-001, FR-001..FR-004).
const { DEMO_ACCOUNTS, STUDENTS, DEMO_PASSWORDS } = require('../persistence/seed');

// Demo-only: the login screen lists the seeded accounts so a viva can switch roles quickly.
function demoAccounts() {
  return [
    ...DEMO_ACCOUNTS.map((a) => ({ role: a.role, name: a.name, email: a.email, password: DEMO_PASSWORDS[a.role], detail: a.role === 'COMPANY' ? 'TechCorp recruiter account' : '' })),
    ...STUDENTS.map((s) => ({ role: 'STUDENT', name: s.name, email: s.email, password: DEMO_PASSWORDS.STUDENT, detail: `${s.roll} · ${s.branch} · CGPA ${s.cgpa.toFixed(1)} · ${s.backlogs} backlog(s)` })),
  ];
}

module.exports = function registerAuthController(router, { auth, notifications }) {
  router.get('/api/demo-accounts', () => ({ accounts: demoAccounts() }));

  router.post('/api/auth/login', (ctx) => {
    const { token, principal } = auth.authenticate(ctx.body.email, ctx.body.password);
    return { token, user: principal };
  });

  router.post('/api/auth/logout', (ctx) => { auth.logout(ctx.token); return { loggedOut: true }; });

  router.get('/api/auth/me', (ctx) => {
    const principal = auth.authorize(ctx.token, 'VIEW_DASHBOARD');
    return { user: principal, unreadNotifications: notifications.unreadCount(principal.userId) };
  });
};
