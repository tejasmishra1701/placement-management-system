'use strict';
// ApplicationService (Figure 15 / CS-2): list eligible drives, apply for a drive with the check order
// open -> duplicate -> eligibility -> atomic insert, return status views and candidate lists.
const { AppError } = require('../domain/errors');
const { DriveStatus, ApplicationStatus, FinalOutcome, Role } = require('../domain/enums');
const { isRegistrationOpen } = require('../domain/placementDrive');
const { hasClearedAllRounds } = require('../domain/application');
const { driveToDTO, applicationToView } = require('./dto');

class ApplicationService {
  constructor(persistence, driveService, eligibilityService, notificationService) {
    this.p = persistence;
    this.drives = driveService;
    this.eligibility = eligibilityService;
    this.notifications = notificationService;
  }

  // Drive state as seen by one student (Section 48.4 supporting operation).
  studentDriveState(drive, criteria, student, now) {
    const app = this.p.findApplicationByPair(student.student_id, drive.drive_id);
    const result = this.eligibility.evaluateProfile(criteria, student);
    let state;
    if (!isRegistrationOpen(drive, now)) state = 'CLOSED';
    else if (app) state = 'APPLIED';
    else if (result.eligible) state = 'ELIGIBLE';
    else state = 'INELIGIBLE';
    return {
      state,
      eligibility: result,
      applied: !!app,
      application: app ? { applicationId: app.application_id, currentRoundStatus: app.current_round_status, finalOutcome: app.final_outcome, applicationDate: app.application_date } : null,
    };
  }

  // listEligibleDrives(studentId, filter) : List<DriveSummary>   (UC-007, UC-008; AC-01..AC-03)
  listEligibleDrives(principal, filter = {}) {
    const student = this.p.findStudent(principal.userId);
    if (!student) throw new AppError('E-NOTFOUND', 'Student profile not found.');
    this.notifications.generateDeadlineReminders(student.student_id); // FR-024
    const now = new Date();
    const text = (filter.text || '').trim().toLowerCase();
    const branch = (filter.branch || '').trim();
    const eligibleOnly = filter.eligibleOnly === true || filter.eligibleOnly === 'true' || filter.eligibleOnly === '1';
    const out = [];
    for (const drive of this.p.listVisibleDrives()) {
      const criteria = this.p.findCriteria(drive.drive_id);
      if (text && !(`${drive.job_title} ${drive.company_name}`.toLowerCase().includes(text))) continue;
      if (branch && criteria && criteria.branches.length && !criteria.branches.includes(branch)) continue;
      const view = this.studentDriveState(drive, criteria, student, now);
      if (eligibleOnly && !['ELIGIBLE', 'APPLIED'].includes(view.state)) continue;
      out.push({ ...driveToDTO(drive, criteria, this.p.listRounds(drive.drive_id), now), ...view });
    }
    return out;
  }

  // Drive detail decorated with the student's eligibility / application state (screen S3).
  getDriveForStudent(principal, driveId) {
    const student = this.p.findStudent(principal.userId);
    if (!student) throw new AppError('E-NOTFOUND', 'Student profile not found.');
    const drive = this.p.findDrive(driveId);
    if (!drive || drive.status === DriveStatus.DRAFT) throw new AppError('E-NOTFOUND');
    const criteria = this.p.findCriteria(driveId);
    return { ...driveToDTO(drive, criteria, this.p.listRounds(driveId)), ...this.studentDriveState(drive, criteria, student, new Date()) };
  }

  // applyForDrive(studentId, driveId) : ApplicationConfirmation   (UC-009, CS-2)
  applyForDrive(principal, driveId) {
    const studentId = principal.userId;
    const drive = this.p.findDrive(driveId);
    if (!drive || drive.status === DriveStatus.DRAFT) throw new AppError('E-NOTFOUND');
    const now = new Date();
    // 2.1  registration open? (BR-003, server clock)
    if (!isRegistrationOpen(drive, now)) throw new AppError('E-REG-CLOSED');
    // 2.2  duplicate? (BR-004)
    if (this.p.findApplicationByPair(studentId, driveId)) throw new AppError('E-DUP');
    // 2.3  eligibility re-check on the current stored profile (BR-001)
    const result = this.eligibility.evaluate(driveId, studentId);
    if (!result.eligible) throw new AppError('E-INELIGIBLE', undefined, { failedRules: result.failedRules });
    // 2.4  atomic submit guarded by UNIQUE(student_id, drive_id)
    const app = { application_id: this.p.newId(), student_id: studentId, drive_id: driveId, application_date: now.toISOString(),
      current_round_status: ApplicationStatus.APPLIED, final_outcome: FinalOutcome.PENDING };
    return this.p.transaction(() => {
      const inserted = this.p.insertApplicationIfAbsent(app);
      if (!inserted) throw new AppError('E-DUP'); // another request won the race
      return { applicationId: app.application_id, driveId, jobTitle: drive.job_title, companyName: drive.company_name,
        status: ApplicationStatus.APPLIED, applicationDate: app.application_date,
        message: `Application submitted for ${drive.job_title} - ${drive.company_name}. Status: Applied.` }; // M-07, shown only after commit
    });
  }

  // getStatus(studentId, applicationId) : ApplicationStatusView   (UC-010, FR-022)
  getStatus(principal, applicationId) {
    const app = this.p.findApplication(applicationId);
    if (!app) throw new AppError('E-NOTFOUND');
    if (principal.role === Role.STUDENT && app.student_id !== principal.userId) throw new AppError('E-FORBIDDEN');
    return this.viewOf(app);
  }

  listMyApplications(principal) {
    return this.p.listApplicationsByStudent(principal.userId).map((app) => this.viewOf(app));
  }

  // listCandidates(driveId) : List<CandidateView>   (FR-020; officer, or the company that owns the drive)
  listCandidates(principal, driveId) {
    const drive = this.p.findDrive(driveId);
    if (!drive) throw new AppError('E-NOTFOUND');
    if (principal.role === Role.COMPANY && (!principal.company || principal.company.companyId !== drive.company_id)) throw new AppError('E-FORBIDDEN');
    const rounds = this.p.listRounds(driveId);
    const results = this.p.listRoundResultsByDrive(driveId);
    const offers = this.p.listOffersByDrive(driveId);
    return this.p.listApplicationsByDrive(driveId).map((app) => {
      const byRound = results[app.application_id] || {};
      return applicationToView(app, rounds, byRound, offers[app.application_id] || null, { cleared: hasClearedAllRounds(rounds, byRound) });
    });
  }

  // setFinalOutcome(appId, outcome) : void  (internal, called by Selection & Offer)
  setFinalOutcome(applicationId, status, outcome) {
    this.p.updateApplicationStatus(applicationId, status, outcome);
  }

  viewOf(app) {
    const rounds = this.p.listRounds(app.drive_id);
    const byRound = this.p.listRoundResults(app.application_id);
    const offer = this.p.findOfferByApplication(app.application_id);
    // BR-005: students only see PUBLISHED offers.
    const visibleOffer = offer && offer.status === 'PUBLISHED' ? offer : null;
    return applicationToView(app, rounds, byRound, visibleOffer, { cleared: hasClearedAllRounds(rounds, byRound) });
  }
}

module.exports = { ApplicationService };
