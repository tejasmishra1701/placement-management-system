'use strict';
// SelectionOfferService (Figure 15 / CS-3): round-result updates (UC-011) and final offers (UC-013).
// Clearance is checked across ALL applicable rounds for the specific candidate; an existing offer
// is replaced only after explicit confirmation; the student is notified after commit (FR-025).
const { AppError } = require('../domain/errors');
const { DriveStatus, ApplicationStatus, FinalOutcome, RoundResultStatus, RoundStatus, OfferStatus, NotificationType } = require('../domain/enums');
const { hasClearedAllRounds, deriveStatus } = require('../domain/application');
const { applicationToView } = require('./dto');

class SelectionOfferService {
  constructor(persistence, applicationService, notificationService, auditService) {
    this.p = persistence;
    this.applications = applicationService;
    this.notifications = notificationService;
    this.audit = auditService;
  }

  // updateRoundResult(appId, roundId, result, officerId) : void   (UC-011, FR-019, AC-08..AC-10)
  updateRoundResult(principal, applicationId, roundId, result) {
    if (!Object.values(RoundResultStatus).includes(result)) throw new AppError('E-VAL', undefined, { fields: [{ field: 'result', message: 'Result must be QUALIFIED, NOT_QUALIFIED or PENDING.' }] });
    const app = this.p.findApplication(applicationId);
    if (!app) throw new AppError('E-NOTFOUND');
    const drive = this.p.findDrive(app.drive_id);
    if (drive.status !== DriveStatus.ONGOING_ROUNDS) throw new AppError('E-STATE', 'Round results can only be updated while the drive is in Ongoing Rounds.');
    const round = this.p.findRound(roundId);
    if (!round || round.drive_id !== app.drive_id) throw new AppError('E-NOTFOUND', 'That round does not belong to this drive.');
    const rounds = this.p.listRounds(app.drive_id);
    const results = this.p.listRoundResults(applicationId);
    const hasNotQualified = rounds.some((r) => results[r.round_id] && results[r.round_id].result === RoundResultStatus.NOT_QUALIFIED);
    if (app.current_round_status === ApplicationStatus.OFFERED) throw new AppError('E-STATE', 'Results are frozen once an offer has been recorded for this candidate.');
    if (app.final_outcome === FinalOutcome.REJECTED && !hasNotQualified) throw new AppError('E-STATE', 'This candidate was marked as not offered; results are frozen.');
    const idx = rounds.findIndex((r) => r.round_id === roundId);
    if (result !== RoundResultStatus.PENDING && idx > 0) {
      const prev = results[rounds[idx - 1].round_id];
      if (!prev || prev.result !== RoundResultStatus.QUALIFIED) throw new AppError('E-STATE', `Mark the earlier round "${rounds[idx - 1].round_name}" as Qualified first.`);
    }
    return this.p.transaction(() => {
      if (result === RoundResultStatus.PENDING) this.p.deleteRoundResult(applicationId, roundId);
      else this.p.upsertRoundResult(applicationId, roundId, result, principal.userId);
      // A result that is no longer Qualified invalidates any later-round results for this candidate.
      if (result !== RoundResultStatus.QUALIFIED) for (const later of rounds.slice(idx + 1)) this.p.deleteRoundResult(applicationId, later.round_id);
      if (round.status === RoundStatus.PLANNED) this.p.setRoundStatus(roundId, RoundStatus.IN_PROGRESS);
      const updated = this.p.listRoundResults(applicationId);
      const derived = deriveStatus(rounds, updated, false);
      this.applications.setFinalOutcome(applicationId, derived.status, derived.outcome);
      this.audit.record(principal.userId, 'ROUND_RESULT_UPDATED', `${app.student_name} (${app.roll_number}) - ${round.round_name} of "${app.job_title}" (${app.company_name}): ${result}`);
      const next = rounds[idx + 1];
      const message = result === RoundResultStatus.QUALIFIED
        ? `You qualified the ${round.round_name} round of ${app.job_title} - ${app.company_name}.${next ? ` Next: ${next.round_name}.` : ' You have cleared all rounds; await the final offer.'}`
        : result === RoundResultStatus.NOT_QUALIFIED
          ? `You were not selected in the ${round.round_name} round of ${app.job_title} - ${app.company_name}.`
          : `Your ${round.round_name} result for ${app.job_title} - ${app.company_name} has been reset to Pending.`;
      this.p.afterCommit(() => this.notifications.notifyStudent(app.student_id, NotificationType.ROUND_UPDATE, message, applicationId, app.student_email));
      const fresh = this.p.findApplication(applicationId);
      return applicationToView(fresh, rounds, updated, this.p.findOfferByApplication(applicationId), { cleared: hasClearedAllRounds(rounds, updated) });
    });
  }

  // hasClearedAllRounds(appId) : boolean   (candidate-specific, Section 48.6)
  hasClearedAllRounds(applicationId) {
    const app = this.p.findApplication(applicationId);
    if (!app) throw new AppError('E-NOTFOUND');
    return hasClearedAllRounds(this.p.listRounds(app.drive_id), this.p.listRoundResults(applicationId));
  }

  // recordOffer(appId, ctcLpa, offerDate, overwriteOk, officerId) : OfferResult   (UC-013, CS-3)
  recordOffer(principal, applicationId, ctcLpa, offerDate, overwriteOk) {
    const ctc = Number(ctcLpa);
    const date = offerDate ? new Date(offerDate) : null;
    if (!Number.isFinite(ctc) || ctc <= 0 || !date || Number.isNaN(date.getTime())) {
      throw new AppError('E-VAL', 'Enter a package greater than 0 and a valid offer date.', { fields: [{ field: 'offer', message: 'Enter a package greater than 0 and a valid offer date (M-10).' }] });
    }
    const app = this.p.findApplication(applicationId);
    if (!app) throw new AppError('E-NOTFOUND');
    const drive = this.p.findDrive(app.drive_id);
    if (drive.status !== DriveStatus.ONGOING_ROUNDS) throw new AppError('E-STATE', 'Offers can be recorded only while the drive is in Ongoing Rounds.');
    return this.p.transaction(() => {
      // A and B (Figure 5 fork/join): clearance check and existing-offer check, then join.
      const cleared = this.hasClearedAllRounds(applicationId);
      const existing = this.p.findOfferByApplication(applicationId);
      if (!cleared) throw new AppError('E-NOT-CLEARED');                                   // no offer, no result, no notification
      if (existing && !overwriteOk) {
        throw new AppError('E-OFFER-EXISTS', undefined, { existing: { ctcLpa: Number(existing.ctc_lpa), offerDate: existing.offer_date } }); // screen S5 asks the Officer
      }
      const offer = { offer_id: existing ? existing.offer_id : this.p.newId(), application_id: applicationId, ctc_lpa: ctc,
        offer_date: date.toISOString().slice(0, 10), status: OfferStatus.PUBLISHED, recorded_by: principal.userId }; // BR-005: published under Officer authorization
      this.p.upsertOffer(offer);
      this.applications.setFinalOutcome(applicationId, ApplicationStatus.OFFERED, FinalOutcome.OFFERED);
      this.audit.record(principal.userId, existing ? 'OFFER_REPLACED' : 'OFFER_RECORDED',
        `${existing ? 'Replaced' : 'Recorded'} offer for ${app.student_name} (${app.roll_number}) - "${app.job_title}" (${app.company_name}): ${ctc.toFixed(1)} LPA${existing ? ` (was ${Number(existing.ctc_lpa).toFixed(1)} LPA)` : ''}`);
      this.p.afterCommit(() => this.notifications.notifyStudent(app.student_id, NotificationType.OFFER_RESULT,
        `Congratulations! You have been offered ${app.job_title} at ${app.company_name} with a package of ${ctc.toFixed(1)} LPA (offer date ${offer.offer_date}).${existing ? ' This replaces the earlier offer.' : ''}`,
        applicationId, app.student_email));
      return { status: existing ? 'REPLACED' : 'RECORDED', offerId: offer.offer_id, ctcLpa: ctc, offerDate: offer.offer_date };
    });
  }

  // Demo addition: declare "not offered" for a candidate who cleared all rounds, so a drive can be completed.
  markNotOffered(principal, applicationId) {
    const app = this.p.findApplication(applicationId);
    if (!app) throw new AppError('E-NOTFOUND');
    const drive = this.p.findDrive(app.drive_id);
    if (drive.status !== DriveStatus.ONGOING_ROUNDS) throw new AppError('E-STATE');
    if (app.current_round_status !== ApplicationStatus.CLEARED_ALL_ROUNDS) throw new AppError('E-STATE', 'Only a candidate who has cleared all rounds and has no offer can be marked as not offered.');
    return this.p.transaction(() => {
      this.applications.setFinalOutcome(applicationId, ApplicationStatus.REJECTED, FinalOutcome.REJECTED);
      this.audit.record(principal.userId, 'OUTCOME_DECLARED', `${app.student_name} (${app.roll_number}) - "${app.job_title}" (${app.company_name}): not offered after clearing all rounds`);
      this.p.afterCommit(() => this.notifications.notifyStudent(app.student_id, NotificationType.OFFER_RESULT,
        `The final result for ${app.job_title} at ${app.company_name} has been declared: no offer was extended. Thank you for participating.`, applicationId, app.student_email));
      return { status: 'DECLARED' };
    });
  }
}

module.exports = { SelectionOfferService };
