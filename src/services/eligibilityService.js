'use strict';
// EligibilityService: evaluates a student against a drive's criteria (D2 / D4) and filters drives.
const { AppError } = require('../domain/errors');
const { evaluate } = require('../domain/eligibilityCriteria');

class EligibilityService {
  constructor(persistence) { this.p = persistence; }

  // evaluate(driveId, studentId) : EligibilityResult   (uses the CURRENT stored profile, AC-03)
  evaluate(driveId, studentId) {
    const criteria = this.p.findCriteria(driveId);
    const student = this.p.findStudent(studentId);
    if (!student) throw new AppError('E-NOTFOUND', 'Student profile not found.');
    return evaluate(criteria, student);
  }

  // Pure variant for callers that already hold the rows (used when listing many drives).
  evaluateProfile(criteria, profile) { return evaluate(criteria, profile); }

  // eligibleDrives(studentId, drives) : filtered list
  eligibleDrives(studentId, drives) {
    const student = this.p.findStudent(studentId);
    if (!student) throw new AppError('E-NOTFOUND', 'Student profile not found.');
    return drives.filter((d) => evaluate(this.p.findCriteria(d.drive_id), student).eligible);
  }
}

module.exports = { EligibilityService };
