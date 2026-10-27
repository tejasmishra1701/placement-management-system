'use strict';
// AdminController: user accounts, audit logs, student profiles, demo reset (UC-002, Section 11.4).
module.exports = function registerAdminController(router, { auth, admin, audit, students }) {
  router.get('/api/admin/users', (ctx) => { auth.authorize(ctx.token, 'MANAGE_USERS'); return { users: admin.listUsers() }; });
  router.post('/api/admin/users/:userId/deactivate', (ctx) => { const p = auth.authorize(ctx.token, 'MANAGE_USERS'); return { user: admin.deactivateAccount(p, ctx.params.userId) }; });
  router.post('/api/admin/users/:userId/restore', (ctx) => { const p = auth.authorize(ctx.token, 'MANAGE_USERS'); return { user: admin.restoreAccount(p, ctx.params.userId) }; });
  router.get('/api/admin/audit-logs', (ctx) => { auth.authorize(ctx.token, 'VIEW_AUDIT'); return { logs: audit.query(ctx.query.limit) }; });
  router.post('/api/admin/reset-demo', (ctx) => { const p = auth.authorize(ctx.token, 'RESET_DEMO'); return admin.resetDemo(p); });

  router.get('/api/students', (ctx) => { auth.authorize(ctx.token, 'VIEW_STUDENTS'); return { students: students.listStudents() }; });
  router.put('/api/students/:studentId', (ctx) => { const p = auth.authorize(ctx.token, 'MANAGE_STUDENTS'); return { student: students.updateProfile(p, ctx.params.studentId, ctx.body) }; });
};
