'use strict';
// ReportController: drive-wise / branch-wise reports, CSV export, dashboard summary (UC-014, FR-026, FR-027).
module.exports = function registerReportController(router, { auth, reports, admin }) {
  router.get('/api/reports/:type', (ctx) => {
    auth.authorize(ctx.token, 'GENERATE_REPORT');
    const type = String(ctx.params.type).toUpperCase().replace('-', '_');
    if (ctx.query.format === 'csv') {
      const out = reports.export(type, 'csv');
      return { __raw: true, status: 200, headers: { 'Content-Type': out.contentType, 'Content-Disposition': `attachment; filename="${out.filename}"` }, body: out.body };
    }
    return { report: reports.generate(type) };
  });

  router.get('/api/dashboard/summary', (ctx) => {
    const p = auth.authorize(ctx.token, 'GENERATE_REPORT');
    return { summary: admin.summary(), role: p.role };
  });
};
