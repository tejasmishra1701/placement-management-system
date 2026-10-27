'use strict';
const { Router } = require('./router');

function buildRouter(services) {
  const router = new Router();
  router.get('/api/health', () => ({ ok: true, service: 'PMS', time: new Date().toISOString() }));
  require('./authController')(router, services);
  require('./driveController')(router, services);
  require('./applicationController')(router, services);
  require('./selectionController')(router, services);
  require('./reportController')(router, services);
  require('./adminController')(router, services);
  require('./notificationController')(router, services);
  return router;
}

module.exports = { buildRouter };
