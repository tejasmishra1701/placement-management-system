'use strict';
// ApplicationController: list eligible drives, apply, status, candidate list (UC-007..UC-010, UC-012).
module.exports = function registerApplicationController(router, { auth, applications }) {
  router.post('/api/drives/:driveId/apply', (ctx) => {
    const p = auth.authorize(ctx.token, 'APPLY');
    return { confirmation: applications.applyForDrive(p, ctx.params.driveId) };
  });

  router.get('/api/applications/mine', (ctx) => {
    const p = auth.authorize(ctx.token, 'VIEW_OWN_APPLICATIONS');
    return { applications: applications.listMyApplications(p) };
  });

  router.get('/api/applications/:applicationId', (ctx) => {
    const p = auth.authorize(ctx.token, 'VIEW_DASHBOARD');
    return { application: applications.getStatus(p, ctx.params.applicationId) };
  });

  router.get('/api/drives/:driveId/candidates', (ctx) => {
    const p = auth.authorize(ctx.token, 'VIEW_CANDIDATES');
    return { candidates: applications.listCandidates(p, ctx.params.driveId) };
  });
};
