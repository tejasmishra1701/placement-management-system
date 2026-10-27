'use strict';
// Enumerations from the design class model (Figure 14, Section 45.1).

const Role = Object.freeze({
  STUDENT: 'STUDENT',
  COMPANY: 'COMPANY',
  PLACEMENT_OFFICER: 'PLACEMENT_OFFICER',
  ADMINISTRATOR: 'ADMINISTRATOR',
});

const AccountStatus = Object.freeze({ ACTIVE: 'ACTIVE', DEACTIVATED: 'DEACTIVATED' });

// Section 17 / Figure 11 lifecycle.
const DriveStatus = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  ONGOING_ROUNDS: 'ONGOING_ROUNDS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

// Figure 12 lifecycle.
const ApplicationStatus = Object.freeze({
  APPLIED: 'APPLIED',
  IN_SELECTION_ROUNDS: 'IN_SELECTION_ROUNDS',
  CLEARED_ALL_ROUNDS: 'CLEARED_ALL_ROUNDS',
  OFFERED: 'OFFERED',
  REJECTED: 'REJECTED',
});

const FinalOutcome = Object.freeze({ PENDING: 'PENDING', OFFERED: 'OFFERED', REJECTED: 'REJECTED' });
const RoundStatus = Object.freeze({ PLANNED: 'PLANNED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED' });
const RoundResultStatus = Object.freeze({ PENDING: 'PENDING', QUALIFIED: 'QUALIFIED', NOT_QUALIFIED: 'NOT_QUALIFIED' });
const OfferStatus = Object.freeze({ RECORDED: 'RECORDED', PUBLISHED: 'PUBLISHED' });

const NotificationType = Object.freeze({
  NEW_DRIVE: 'NEW_DRIVE',
  DEADLINE_REMINDER: 'DEADLINE_REMINDER',
  ROUND_UPDATE: 'ROUND_UPDATE',
  OFFER_RESULT: 'OFFER_RESULT',
  DRIVE_CLOSED_OR_CANCELLED: 'DRIVE_CLOSED_OR_CANCELLED',
});

const ReportType = Object.freeze({ DRIVE_WISE: 'DRIVE_WISE', BRANCH_WISE: 'BRANCH_WISE' });

// Branches offered by the institute (wireframe S1 checkbox list).
const BRANCHES = Object.freeze(['CSE', 'IT', 'ECE', 'CCE', 'MME']);

module.exports = {
  Role, AccountStatus, DriveStatus, ApplicationStatus, FinalOutcome, RoundStatus,
  RoundResultStatus, OfferStatus, NotificationType, ReportType, BRANCHES,
};
