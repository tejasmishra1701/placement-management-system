'use strict';
// NotificationController: in-app notifications (FR-023..FR-025).
const { Role } = require('../domain/enums');

module.exports = function registerNotificationController(router, { auth, notifications }) {
  router.get('/api/notifications', (ctx) => {
    const p = auth.authorize(ctx.token, 'VIEW_NOTIFICATIONS');
    if (p.role === Role.STUDENT) notifications.generateDeadlineReminders(p.userId); // FR-024
    return { notifications: notifications.listForUser(p.userId), unread: notifications.unreadCount(p.userId) };
  });
  router.post('/api/notifications/read-all', (ctx) => { const p = auth.authorize(ctx.token, 'VIEW_NOTIFICATIONS'); notifications.markAllAsRead(p.userId); return { ok: true }; });
  router.post('/api/notifications/:id/read', (ctx) => { const p = auth.authorize(ctx.token, 'VIEW_NOTIFICATIONS'); return { ok: notifications.markAsRead(p.userId, ctx.params.id) }; });
};
