'use strict';
// PlacementDrive domain behaviour (Figure 14; Section 48.6 supporting algorithms).
const { DriveStatus } = require('./enums');

function isCriteriaComplete(criteria) {
  return !!criteria
    && criteria.min_cgpa !== null && criteria.min_cgpa !== undefined
    && criteria.min_cgpa >= 0 && criteria.min_cgpa <= 10
    && criteria.max_backlogs !== null && criteria.max_backlogs !== undefined
    && criteria.max_backlogs >= 0
    && Array.isArray(criteria.branches) && criteria.branches.length > 0;
}

// PlacementDrive.validateMandatoryFields() : List<String>  (BR-006)
function validateMandatoryFields(drive, criteria, rounds, now = new Date()) {
  const missing = [];
  if (!drive.company_id) missing.push({ field: 'companyId', message: 'Company is required.' });
  if (!drive.job_title || !String(drive.job_title).trim()) missing.push({ field: 'jobTitle', message: 'Job title is required.' });
  if (drive.ctc_lpa === null || drive.ctc_lpa === undefined || !(drive.ctc_lpa > 0)) {
    missing.push({ field: 'ctcLpa', message: 'Package / CTC (LPA) must be greater than 0.' });
  }
  if (!drive.registration_deadline) {
    missing.push({ field: 'registrationDeadline', message: 'Registration deadline is required (BR-006).' });
  } else if (new Date(drive.registration_deadline) <= now) {
    missing.push({ field: 'registrationDeadline', message: 'Registration deadline must be in the future (M-03).' });
  }
  if (!isCriteriaComplete(criteria)) {
    missing.push({ field: 'eligibilityCriteria', message: 'Eligibility criteria (minimum CGPA, maximum backlogs and at least one branch) are required (BR-006).' });
  }
  if (!rounds || rounds.length === 0) {
    missing.push({ field: 'selectionRounds', message: 'At least one selection round is required.' });
  }
  return missing;
}

// PlacementDrive.isRegistrationOpen(now) : boolean  (BR-003, server clock)
function isRegistrationOpen(drive, now = new Date()) {
  return drive.status === DriveStatus.PUBLISHED
    && !!drive.registration_deadline
    && now <= new Date(drive.registration_deadline);
}

// Figure 11: Published -> Registration Closed on closeDrive() OR [time > deadline].
// The stored status stays PUBLISHED until the Officer acts; the effective status is derived.
function effectiveStatus(drive, now = new Date()) {
  if (drive.status === DriveStatus.PUBLISHED && drive.registration_deadline && now > new Date(drive.registration_deadline)) {
    return DriveStatus.REGISTRATION_CLOSED;
  }
  return drive.status;
}

const EDITABLE_STATUSES = new Set([DriveStatus.DRAFT, DriveStatus.PUBLISHED]);

// FR-010: editable while Draft, or Published before the registration deadline.
function isEditable(drive, now = new Date()) {
  if (!EDITABLE_STATUSES.has(drive.status)) return false;
  if (drive.status === DriveStatus.PUBLISHED && drive.registration_deadline && now > new Date(drive.registration_deadline)) return false;
  return true;
}

module.exports = { validateMandatoryFields, isCriteriaComplete, isRegistrationOpen, effectiveStatus, isEditable };
