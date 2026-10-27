'use strict';
// Student profile management for the Placement Officer (AC-03: eligibility re-evaluates instantly
// when a profile is formally updated). Edits are audited (NFR-013).
const { AppError } = require('../domain/errors');
const { BRANCHES } = require('../domain/enums');
const { studentToDTO } = require('./dto');

class StudentService {
  constructor(persistence, auditService) { this.p = persistence; this.audit = auditService; }

  listStudents() { return this.p.listStudents().map(studentToDTO); }

  getProfile(studentId) {
    const s = this.p.findStudent(studentId);
    if (!s) throw new AppError('E-NOTFOUND');
    return studentToDTO(s);
  }

  updateProfile(principal, studentId, body) {
    const s = this.p.findStudent(studentId);
    if (!s) throw new AppError('E-NOTFOUND');
    body = body || {};
    const fields = [];
    const cgpa = body.cgpa === undefined ? Number(s.cgpa) : Number(body.cgpa);
    const backlogs = body.activeBacklogs === undefined ? Number(s.active_backlogs) : Number(body.activeBacklogs);
    const branch = body.branch === undefined ? s.branch : String(body.branch);
    const resume = body.resumeFileUrl === undefined ? s.resume_file_url : (body.resumeFileUrl || null);
    if (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10) fields.push({ field: 'cgpa', message: 'CGPA must be between 0.0 and 10.0.' });
    if (!Number.isInteger(backlogs) || backlogs < 0) fields.push({ field: 'activeBacklogs', message: 'Active backlogs must be a whole number of 0 or more.' });
    if (!BRANCHES.includes(branch)) fields.push({ field: 'branch', message: `Branch must be one of ${BRANCHES.join(', ')}.` });
    if (fields.length) throw new AppError('E-VAL', undefined, { fields });
    return this.p.transaction(() => {
      this.p.updateStudentProfile(studentId, { branch, cgpa, active_backlogs: backlogs, resume_file_url: resume });
      this.audit.record(principal.userId, 'STUDENT_PROFILE_UPDATED', `${s.name} (${s.roll_number}): branch ${s.branch}->${branch}, CGPA ${Number(s.cgpa)}->${cgpa}, backlogs ${s.active_backlogs}->${backlogs}`);
      return studentToDTO(this.p.findStudent(studentId));
    });
  }
}

module.exports = { StudentService };
