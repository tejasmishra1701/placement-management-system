'use strict';
// ReportService: drive-wise and branch-wise placement statistics (FR-026, UC-014), built on demand
// and exportable as CSV (Report.export()).
const { AppError } = require('../domain/errors');
const { ReportType } = require('../domain/enums');

const STATUS_LABEL = { DRAFT: 'Draft', PUBLISHED: 'Published', REGISTRATION_CLOSED: 'Registration Closed', ONGOING_ROUNDS: 'Ongoing Rounds', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

class ReportService {
  constructor(persistence) { this.p = persistence; }

  generate(type) {
    if (type === ReportType.DRIVE_WISE) {
      const rows = this.p.driveWiseReport().map((r) => ({
        driveId: r.drive_id, company: r.company_name, jobTitle: r.job_title, ctcLpa: Number(r.ctc_lpa), status: STATUS_LABEL[r.status] || r.status,
        registrationDeadline: r.registration_deadline, applications: r.applications, inRounds: r.in_rounds, cleared: r.cleared, offered: r.offered, rejected: r.rejected,
        conversionPct: r.applications ? Math.round((r.offered / r.applications) * 1000) / 10 : 0,
      }));
      return { reportType: type, generatedOn: new Date().toISOString(), rows, totals: this.totals(rows, ['applications', 'inRounds', 'cleared', 'offered', 'rejected']) };
    }
    if (type === ReportType.BRANCH_WISE) {
      const rows = this.p.branchWiseReport().map((r) => ({
        branch: r.branch, students: r.students, studentsApplied: r.students_applied, applications: r.applications, studentsPlaced: r.students_placed, offers: r.offers,
        placementPct: r.students ? Math.round((r.students_placed / r.students) * 1000) / 10 : 0,
        avgCtcLpa: r.avg_ctc_lpa === null ? null : Number(r.avg_ctc_lpa), highestCtcLpa: r.highest_ctc_lpa === null ? null : Number(r.highest_ctc_lpa),
      }));
      return { reportType: type, generatedOn: new Date().toISOString(), rows, totals: this.totals(rows, ['students', 'studentsApplied', 'applications', 'studentsPlaced', 'offers']) };
    }
    throw new AppError('E-VAL', 'Unknown report type. Use DRIVE_WISE or BRANCH_WISE.');
  }

  totals(rows, keys) {
    const t = {};
    for (const k of keys) t[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    return t;
  }

  export(type, format = 'csv') {
    if (format !== 'csv') throw new AppError('E-VAL', 'Only CSV export is supported.');
    const report = this.generate(type);
    const columns = report.rows.length ? Object.keys(report.rows[0]).filter((k) => k !== 'driveId') : [];
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [columns.join(','), ...report.rows.map((r) => columns.map((c) => esc(r[c])).join(','))];
    return { contentType: 'text/csv; charset=utf-8', filename: `pms-${type.toLowerCase().replace('_', '-')}-report.csv`, body: lines.join('\n') + '\n' };
  }
}

module.exports = { ReportService };
