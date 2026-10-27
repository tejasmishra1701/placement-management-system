'use strict';
// DriveController: create, define, publish, close, cancel drives; companies (UC-003..UC-006, FR-005..FR-012).
const { Role } = require('../domain/enums');

module.exports = function registerDriveController(router, { auth, drives, applications }) {
  router.get('/api/companies', (ctx) => { auth.authorize(ctx.token, 'VIEW_COMPANIES'); return { companies: drives.listCompanies() }; });
  router.post('/api/companies', (ctx) => { const p = auth.authorize(ctx.token, 'ADD_COMPANY'); return { company: drives.addCompany(p, ctx.body) }; });

  // Students get the eligibility-decorated listing (S2); other roles get the management listing.
  router.get('/api/drives', (ctx) => {
    const p = auth.authorize(ctx.token, 'VIEW_DRIVES');
    if (p.role === Role.STUDENT) return { drives: applications.listEligibleDrives(p, ctx.query) };
    return { drives: drives.listDrives(p) };
  });

  router.get('/api/drives/:driveId', (ctx) => {
    const p = auth.authorize(ctx.token, 'VIEW_DRIVE');
    if (p.role === Role.STUDENT) return { drive: applications.getDriveForStudent(p, ctx.params.driveId) };
    return { drive: drives.getDrive(p, ctx.params.driveId) };
  });

  router.post('/api/drives', (ctx) => { const p = auth.authorize(ctx.token, 'CREATE_DRIVE'); return { drive: drives.createDrive(p, ctx.body) }; });
  router.put('/api/drives/:driveId', (ctx) => { const p = auth.authorize(ctx.token, 'EDIT_DRIVE'); return { drive: drives.updateDrive(p, ctx.params.driveId, ctx.body) }; });

  router.post('/api/drives/:driveId/publish', (ctx) => { const p = auth.authorize(ctx.token, 'PUBLISH_DRIVE'); return drives.publishDrive(p, ctx.params.driveId); });
  router.post('/api/drives/:driveId/close', (ctx) => { const p = auth.authorize(ctx.token, 'MANAGE_DRIVE_STATUS'); return { drive: drives.closeDrive(p, ctx.params.driveId) }; });
  router.post('/api/drives/:driveId/begin-rounds', (ctx) => { const p = auth.authorize(ctx.token, 'MANAGE_DRIVE_STATUS'); return { drive: drives.beginRounds(p, ctx.params.driveId) }; });
  router.post('/api/drives/:driveId/complete', (ctx) => { const p = auth.authorize(ctx.token, 'MANAGE_DRIVE_STATUS'); return { drive: drives.completeDrive(p, ctx.params.driveId) }; });
  router.post('/api/drives/:driveId/cancel', (ctx) => { const p = auth.authorize(ctx.token, 'MANAGE_DRIVE_STATUS'); return { drive: drives.cancelDrive(p, ctx.params.driveId) }; });

  router.put('/api/drives/:driveId/rounds/:roundId/schedule', (ctx) => {
    const p = auth.authorize(ctx.token, 'UPDATE_SCHEDULE');
    return { drive: drives.updateRoundSchedule(p, ctx.params.driveId, ctx.params.roundId, ctx.body.scheduledAt) };
  });
};
