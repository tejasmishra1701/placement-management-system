'use strict';
// DriveService (Figure 15 / CS-1): create, edit, save draft, publish, close, begin rounds, complete and
// cancel drives; configure eligibility criteria and rounds; link companies. Transactional; notifies
// eligible students only after commit.
const { AppError } = require('../domain/errors');
const { DriveStatus, RoundStatus, NotificationType, BRANCHES, Role } = require('../domain/enums');
const { validateMandatoryFields, effectiveStatus, isEditable } = require('../domain/placementDrive');
const { driveToDTO, companyToDTO } = require('./dto');

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

class DriveService {
  constructor(persistence, notificationService, auditService) {
    this.p = persistence;
    this.notifications = notificationService;
    this.audit = auditService;
  }

  // ---------- input normalisation / validation (E-VAL) ----------
  normalizeDetails(body) {
    const fields = [];
    const out = { company_id: null, job_title: null, job_description: null, ctc_lpa: null, registration_deadline: null, criteria: null, rounds: [] };
    body = body || {};

    if (isBlank(body.companyId)) fields.push({ field: 'companyId', message: 'Select a company.' });
    else out.company_id = String(body.companyId);

    out.job_title = isBlank(body.jobTitle) ? null : String(body.jobTitle).trim();
    out.job_description = isBlank(body.jobDescription) ? null : String(body.jobDescription).trim();

    if (!isBlank(body.ctcLpa)) {
      const n = Number(body.ctcLpa);
      if (!Number.isFinite(n) || n <= 0) fields.push({ field: 'ctcLpa', message: 'Enter a package greater than 0 (LPA).' });
      else out.ctc_lpa = n;
    }
    if (!isBlank(body.registrationDeadline)) {
      const d = new Date(body.registrationDeadline);
      if (Number.isNaN(d.getTime())) fields.push({ field: 'registrationDeadline', message: 'Enter a valid registration deadline.' });
      else out.registration_deadline = d.toISOString();
    }

    const c = body.criteria || {};
    const criteria = { min_cgpa: null, max_backlogs: null, branches: [] };
    if (!isBlank(c.minCgpa)) {
      const n = Number(c.minCgpa);
      if (!Number.isFinite(n) || n < 0 || n > 10) fields.push({ field: 'minCgpa', message: 'Enter a value from 0.0 to 10.0.' }); // M-02
      else criteria.min_cgpa = n;
    }
    if (!isBlank(c.maxBacklogs)) {
      const n = Number(c.maxBacklogs);
      if (!Number.isInteger(n) || n < 0) fields.push({ field: 'maxBacklogs', message: 'Enter a whole number of 0 or more.' });
      else criteria.max_backlogs = n;
    }
    if (c.branches !== undefined) {
      if (!Array.isArray(c.branches) || c.branches.some((b) => !BRANCHES.includes(b))) fields.push({ field: 'branches', message: `Branches must be from: ${BRANCHES.join(', ')}.` });
      else criteria.branches = [...new Set(c.branches)];
    }
    out.criteria = criteria;

    if (body.rounds !== undefined) {
      if (!Array.isArray(body.rounds)) fields.push({ field: 'selectionRounds', message: 'Rounds must be a list.' });
      else {
        body.rounds.forEach((r, i) => {
          const name = isBlank(r && r.roundName) ? '' : String(r.roundName).trim();
          if (!name) { fields.push({ field: `rounds[${i}]`, message: `Round ${i + 1}: round name is required.` }); return; }
          let at = null;
          if (!isBlank(r.scheduledAt)) {
            const d = new Date(r.scheduledAt);
            if (Number.isNaN(d.getTime())) fields.push({ field: `rounds[${i}]`, message: `Round ${i + 1}: invalid schedule date.` });
            else at = d.toISOString();
          }
          out.rounds.push({ round_id: r.roundId || null, round_name: name, scheduled_at: at });
        });
      }
    }
    if (fields.length) throw new AppError('E-VAL', 'Some fields are missing or invalid.', { fields });
    return out;
  }

  // ---------- read ----------
  toDTO(drive, now = new Date()) {
    return driveToDTO(drive, this.p.findCriteria(drive.drive_id), this.p.listRounds(drive.drive_id), now);
  }

  getDrive(principal, driveId) {
    const drive = this.p.findDrive(driveId);
    if (!drive) throw new AppError('E-NOTFOUND');
    if (principal.role === Role.STUDENT && drive.status === DriveStatus.DRAFT) throw new AppError('E-NOTFOUND'); // FR-009
    if (principal.role === Role.COMPANY && (!principal.company || principal.company.companyId !== drive.company_id)) throw new AppError('E-FORBIDDEN'); // NFR-012
    return this.toDTO(drive);
  }

  listDrives(principal) {
    if (principal.role === Role.COMPANY) {
      if (!principal.company) return [];
      return this.p.listDrivesByCompany(principal.company.companyId).map((d) => this.toDTO(d));
    }
    return this.p.listDrives().map((d) => this.toDTO(d));
  }

  // DriveService.isRegistrationOpen(driveId, now) : boolean  (D3)
  isRegistrationOpen(driveId, now = new Date()) {
    const drive = this.p.findDrive(driveId);
    if (!drive) throw new AppError('E-NOTFOUND');
    return require('../domain/placementDrive').isRegistrationOpen(drive, now);
  }

  // ---------- UC-003 Add Company ----------
  listCompanies() { return this.p.listCompanies().map(companyToDTO); }

  addCompany(principal, body) {
    body = body || {};
    const fields = [];
    if (isBlank(body.companyName)) fields.push({ field: 'companyName', message: 'Company name is required.' });
    if (!isBlank(body.contactEmail) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.contactEmail))) fields.push({ field: 'contactEmail', message: 'Enter a valid contact e-mail.' });
    if (fields.length) throw new AppError('E-VAL', undefined, { fields });
    const company = { company_id: this.p.newId(), company_name: String(body.companyName).trim(), industry: isBlank(body.industry) ? null : String(body.industry).trim(),
      contact_person: isBlank(body.contactPerson) ? null : String(body.contactPerson).trim(), contact_email: isBlank(body.contactEmail) ? null : String(body.contactEmail).trim() };
    return this.p.transaction(() => {
      this.p.insertCompany(company);
      this.audit.record(principal.userId, 'COMPANY_ADDED', `Added company ${company.company_name}${company.industry ? ` (${company.industry})` : ''}`);
      return companyToDTO(this.p.findCompany(company.company_id));
    });
  }

  // ---------- UC-004 Create Drive / UC-005 Define Eligibility / FR-009 Save Draft ----------
  createDrive(principal, body) {
    const details = this.normalizeDetails(body);
    const company = this.p.findCompany(details.company_id);
    if (!company) throw new AppError('E-NOTFOUND', 'The selected company does not exist.');
    const driveId = this.p.newId();
    return this.p.transaction(() => {
      this.p.insertDrive({ drive_id: driveId, company_id: details.company_id, created_by: principal.userId, job_title: details.job_title,
        job_description: details.job_description, ctc_lpa: details.ctc_lpa, registration_deadline: details.registration_deadline, status: DriveStatus.DRAFT });
      this.defineEligibility(driveId, details.criteria);
      this.p.replaceRounds(driveId, details.rounds);
      this.audit.record(principal.userId, 'DRIVE_CREATED', `Created drive "${details.job_title || '(untitled)'}" for ${company.company_name} (Draft)`);
      return this.toDTO(this.p.findDrive(driveId));
    });
  }

  // defineEligibility(driveId, spec) : criteriaId
  defineEligibility(driveId, spec) {
    return this.p.upsertCriteria(driveId, spec);
  }

  // FR-010 Edit Drive: only while Draft, or Published before the registration deadline.
  updateDrive(principal, driveId, body) {
    const drive = this.p.findDrive(driveId);
    if (!drive) throw new AppError('E-NOTFOUND');
    if (!isEditable(drive)) throw new AppError('E-STATE', 'Drive details can no longer be edited: the registration deadline has passed or the drive has moved past registration (FR-010).');
    const details = this.normalizeDetails(body);
    const company = this.p.findCompany(details.company_id);
    if (!company) throw new AppError('E-NOTFOUND', 'The selected company does not exist.');
    if (drive.status === DriveStatus.PUBLISHED) {
      if (!details.registration_deadline || new Date(details.registration_deadline) <= new Date()) {
        throw new AppError('E-VAL', undefined, { fields: [{ field: 'registrationDeadline', message: 'Registration deadline must be in the future (M-03).' }] });
      }
      if (this.p.countRoundResultsForDrive(driveId) > 0) throw new AppError('E-STATE', 'Rounds cannot be changed once results have been recorded.');
    }
    const before = this.p.findCriteria(driveId);
    return this.p.transaction(() => {
      this.p.updateDriveDetails(driveId, details);
      this.defineEligibility(driveId, details.criteria);
      const existingRounds = this.p.listRounds(driveId);
      const keep = new Map(existingRounds.map((r) => [r.round_id, r]));
      this.p.replaceRounds(driveId, details.rounds.map((r) => ({ ...r, round_id: r.round_id && keep.has(r.round_id) ? r.round_id : null, status: r.round_id && keep.has(r.round_id) ? keep.get(r.round_id).status : RoundStatus.PLANNED })));
      const criteriaChanged = JSON.stringify(before && { a: before.min_cgpa, b: before.max_backlogs, c: before.branches }) !== JSON.stringify({ a: details.criteria.min_cgpa, b: details.criteria.max_backlogs, c: [...details.criteria.branches].sort() });
      if (drive.status === DriveStatus.PUBLISHED && criteriaChanged) {
        this.audit.record(principal.userId, 'ELIGIBILITY_EDITED', `Edited eligibility of published drive "${details.job_title}" (${company.company_name}): min CGPA ${details.criteria.min_cgpa}, max backlogs ${details.criteria.max_backlogs}, branches ${details.criteria.branches.join('/')}`);
      }
      this.audit.record(principal.userId, 'DRIVE_UPDATED', `Updated drive "${details.job_title || '(untitled)'}" (${company.company_name}) while ${drive.status}`);
      return this.toDTO(this.p.findDrive(driveId));
    });
  }

  // ---------- UC-006 Publish Drive (CS-1) ----------
  // publishDrive(driveId, officerId) : PublishResult { published, missingFields, notified }
  publishDrive(principal, driveId) {
    const drive = this.p.findDrive(driveId);
    if (!drive) throw new AppError('E-NOTFOUND');
    if (drive.status !== DriveStatus.DRAFT) throw new AppError('E-STATE', 'Only a Draft drive can be published.');
    const criteria = this.p.findCriteria(driveId);
    const rounds = this.p.listRounds(driveId);
    const missing = validateMandatoryFields(drive, criteria, rounds, new Date());
    if (missing.length > 0) {
      return { published: false, missingFields: missing, notified: 0, drive: this.toDTO(drive) }; // drive stays Draft (Figure 11 self-transition), UI shows M-01
    }
    this.p.transaction(() => {
      this.p.setDriveStatus(driveId, DriveStatus.PUBLISHED);
      this.audit.record(principal.userId, 'DRIVE_PUBLISHED', `Published drive "${drive.job_title}" for ${drive.company_name}`);
    });
    // After commit only: a delivery problem must not undo the publication (FR-023).
    let notified = 0;
    try { notified = this.notifications.notifyEligibleStudents(driveId); } catch (e) { console.error('[E-DELIVERY] ' + e.message); }
    return { published: true, missingFields: [], notified, drive: this.toDTO(this.p.findDrive(driveId)) };
  }

  // ---------- FR-012 close / cancel, Figure 11 transitions ----------
  closeDrive(principal, driveId) {
    const drive = this.requireDrive(driveId);
    if (drive.status !== DriveStatus.PUBLISHED) throw new AppError('E-STATE', 'Registration can only be closed for a Published drive.');
    return this.transition(principal, drive, DriveStatus.REGISTRATION_CLOSED, 'DRIVE_REGISTRATION_CLOSED', `Closed registration for "${drive.job_title}" (${drive.company_name})`,
      NotificationType.DRIVE_CLOSED_OR_CANCELLED, `Registration for ${drive.job_title} at ${drive.company_name} is now closed. Selection rounds will be announced soon.`);
  }

  beginRounds(principal, driveId) {
    const drive = this.requireDrive(driveId);
    const eff = effectiveStatus(drive);
    if (eff !== DriveStatus.REGISTRATION_CLOSED) throw new AppError('E-STATE', 'Selection rounds can begin only after registration has closed.');
    const rounds = this.p.listRounds(driveId);
    if (rounds.length === 0) throw new AppError('E-STATE', 'Define at least one selection round first.');
    return this.p.transaction(() => {
      this.p.setDriveStatus(driveId, DriveStatus.ONGOING_ROUNDS);
      this.p.setRoundStatus(rounds[0].round_id, RoundStatus.IN_PROGRESS);
      this.audit.record(principal.userId, 'DRIVE_ROUNDS_BEGUN', `Selection rounds begun for "${drive.job_title}" (${drive.company_name})`);
      this.p.afterCommit(() => this.notifications.notifyApplicants(driveId, NotificationType.ROUND_UPDATE, `Selection rounds for ${drive.job_title} at ${drive.company_name} have begun. First round: ${rounds[0].round_name}.`));
      return this.toDTO(this.p.findDrive(driveId));
    });
  }

  completeDrive(principal, driveId) {
    const drive = this.requireDrive(driveId);
    if (drive.status !== DriveStatus.ONGOING_ROUNDS) throw new AppError('E-STATE', 'Only a drive in Ongoing Rounds can be completed.');
    const pending = this.p.listApplicationsByDrive(driveId).filter((a) => a.final_outcome === 'PENDING');
    if (pending.length > 0) {
      throw new AppError('E-STATE', `${pending.length} candidate(s) still have a pending outcome. Record an offer or declare the remaining results first.`, { pending: pending.map((a) => a.student_name) });
    }
    return this.p.transaction(() => {
      this.p.setDriveStatus(driveId, DriveStatus.COMPLETED);
      for (const r of this.p.listRounds(driveId)) this.p.setRoundStatus(r.round_id, RoundStatus.COMPLETED);
      this.audit.record(principal.userId, 'DRIVE_COMPLETED', `Completed drive "${drive.job_title}" (${drive.company_name}); all outcomes declared`);
      return this.toDTO(this.p.findDrive(driveId));
    });
  }

  cancelDrive(principal, driveId) {
    const drive = this.requireDrive(driveId);
    if (![DriveStatus.PUBLISHED, DriveStatus.REGISTRATION_CLOSED, DriveStatus.ONGOING_ROUNDS].includes(drive.status)) {
      throw new AppError('E-STATE', 'Only a Published, Registration Closed or Ongoing Rounds drive can be cancelled.');
    }
    return this.transition(principal, drive, DriveStatus.CANCELLED, 'DRIVE_CANCELLED', `Cancelled drive "${drive.job_title}" (${drive.company_name})`,
      NotificationType.DRIVE_CLOSED_OR_CANCELLED, `The ${drive.job_title} drive at ${drive.company_name} has been cancelled by the placement office. Your application will not proceed.`);
  }

  // Company.updateInterviewSchedule(roundId, at) - also usable by the Officer.
  updateRoundSchedule(principal, driveId, roundId, scheduledAt) {
    const drive = this.requireDrive(driveId);
    if (principal.role === Role.COMPANY && (!principal.company || principal.company.companyId !== drive.company_id)) throw new AppError('E-FORBIDDEN');
    const round = this.p.findRound(roundId);
    if (!round || round.drive_id !== driveId) throw new AppError('E-NOTFOUND');
    let at = null;
    if (!isBlank(scheduledAt)) {
      const d = new Date(scheduledAt);
      if (Number.isNaN(d.getTime())) throw new AppError('E-VAL', undefined, { fields: [{ field: 'scheduledAt', message: 'Enter a valid date and time.' }] });
      at = d.toISOString();
    }
    return this.p.transaction(() => {
      this.p.setRoundSchedule(roundId, at);
      this.audit.record(principal.userId, 'ROUND_SCHEDULE_UPDATED', `${round.round_name} of "${drive.job_title}" (${drive.company_name}) scheduled ${at ? 'for ' + new Date(at).toLocaleString('en-IN') : 'cleared'}`);
      if (at && [DriveStatus.REGISTRATION_CLOSED, DriveStatus.ONGOING_ROUNDS, DriveStatus.PUBLISHED].includes(drive.status)) {
        this.p.afterCommit(() => this.notifications.notifyApplicants(driveId, NotificationType.ROUND_UPDATE,
          `Schedule update: the ${round.round_name} round of ${drive.job_title} at ${drive.company_name} is scheduled for ${new Date(at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.`));
      }
      return this.toDTO(this.p.findDrive(driveId));
    });
  }

  // ---------- helpers ----------
  requireDrive(driveId) {
    const drive = this.p.findDrive(driveId);
    if (!drive) throw new AppError('E-NOTFOUND');
    return drive;
  }

  transition(principal, drive, newStatus, auditType, auditDetails, notifType, notifMessage) {
    return this.p.transaction(() => {
      this.p.setDriveStatus(drive.drive_id, newStatus);
      this.audit.record(principal.userId, auditType, auditDetails);
      this.p.afterCommit(() => this.notifications.notifyApplicants(drive.drive_id, notifType, notifMessage));
      return this.toDTO(this.p.findDrive(drive.drive_id));
    });
  }
}

module.exports = { DriveService };
