'use strict';
// DTO mapping (Section 45.5 in-memory structures): DB rows (snake_case) -> API views (camelCase).
const { effectiveStatus, isRegistrationOpen, isEditable } = require('../domain/placementDrive');

const num = (v) => (v === null || v === undefined ? null : Number(v));

function roundToDTO(r) {
  return { roundId: r.round_id, roundName: r.round_name, roundOrder: r.round_order, status: r.status, scheduledAt: r.scheduled_at || null };
}

function criteriaToDTO(c) {
  if (!c) return null;
  return { criteriaId: c.criteria_id, minCgpa: num(c.min_cgpa), maxBacklogs: num(c.max_backlogs), branches: c.branches || [] };
}

// DriveSummary / drive detail
function driveToDTO(drive, criteria, rounds, now = new Date()) {
  return {
    driveId: drive.drive_id,
    companyId: drive.company_id,
    companyName: drive.company_name,
    jobTitle: drive.job_title,
    jobDescription: drive.job_description,
    ctcLpa: num(drive.ctc_lpa),
    registrationDeadline: drive.registration_deadline,
    status: drive.status,
    effectiveStatus: effectiveStatus(drive, now),
    registrationOpen: isRegistrationOpen(drive, now),
    editable: isEditable(drive, now),
    applicationCount: drive.application_count ?? 0,
    createdAt: drive.created_at,
    updatedAt: drive.updated_at,
    criteria: criteriaToDTO(criteria),
    rounds: (rounds || []).map(roundToDTO),
  };
}

function offerToDTO(o) {
  if (!o) return null;
  return { offerId: o.offer_id, ctcLpa: num(o.ctc_lpa), offerDate: o.offer_date, status: o.status, recordedAt: o.recorded_at };
}

// ApplicationStatusView (student) / CandidateView (officer, company)
function applicationToView(app, rounds, resultsByRoundId, offer, extra = {}) {
  return {
    applicationId: app.application_id,
    studentId: app.student_id,
    studentName: app.student_name,
    studentEmail: app.student_email || null,
    rollNumber: app.roll_number,
    branch: app.branch,
    cgpa: num(app.cgpa),
    activeBacklogs: num(app.active_backlogs),
    resumeFileUrl: app.resume_file_url || null,
    driveId: app.drive_id,
    jobTitle: app.job_title,
    companyName: app.company_name,
    driveCtcLpa: num(app.drive_ctc_lpa),
    driveStatus: app.drive_status,
    applicationDate: app.application_date,
    currentRoundStatus: app.current_round_status,
    finalOutcome: app.final_outcome,
    rounds: (rounds || []).map((r) => ({
      ...roundToDTO(r),
      result: resultsByRoundId && resultsByRoundId[r.round_id] ? resultsByRoundId[r.round_id].result : 'PENDING',
      updatedAt: resultsByRoundId && resultsByRoundId[r.round_id] ? resultsByRoundId[r.round_id].updated_at : null,
    })),
    offer: offerToDTO(offer),
    ...extra,
  };
}

function studentToDTO(s) {
  return {
    studentId: s.student_id || s.user_id, name: s.name, email: s.email, accountStatus: s.account_status,
    rollNumber: s.roll_number, branch: s.branch, cgpa: num(s.cgpa), activeBacklogs: num(s.active_backlogs), resumeFileUrl: s.resume_file_url || null,
  };
}

function companyToDTO(c) {
  return { companyId: c.company_id, companyName: c.company_name, industry: c.industry, contactPerson: c.contact_person, contactEmail: c.contact_email, hasAccount: !!c.account_user_id, driveCount: c.drive_count ?? 0 };
}

function userToDTO(u) {
  return {
    userId: u.user_id, name: u.name, email: u.email, role: u.role, accountStatus: u.account_status, createdAt: u.created_at,
    rollNumber: u.roll_number || null, branch: u.branch || null, cgpa: num(u.cgpa), activeBacklogs: num(u.active_backlogs), companyName: u.company_name || null,
  };
}

function notificationToDTO(n) {
  return { notificationId: n.notification_id, type: n.type, message: n.message, referenceId: n.reference_id, timestamp: n.timestamp, read: !!n.read_status };
}

function auditToDTO(a) {
  return { logId: a.log_id, actionType: a.action_type, performedBy: a.performed_by, performedByName: a.performed_by_name || 'system', performedByRole: a.performed_by_role || null, timestamp: a.timestamp, details: a.details };
}

module.exports = { driveToDTO, roundToDTO, criteriaToDTO, offerToDTO, applicationToView, studentToDTO, companyToDTO, userToDTO, notificationToDTO, auditToDTO };
