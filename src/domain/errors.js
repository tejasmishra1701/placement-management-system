'use strict';
// Error-code catalogue from Section 47.5. Every service raises AppError with one of
// these codes; the HTTP layer maps the code to a status and the UI to a message (M-01..M-11).

const CATALOGUE = Object.freeze({
  'E-AUTH':         { status: 401, message: 'Invalid e-mail or password.' },
  'E-INACTIVE':     { status: 401, message: 'Invalid e-mail or password.' },               // never says which (FR-002)
  'E-UNAUTH':       { status: 401, message: 'Please log in again.' },                       // M-11
  'E-FORBIDDEN':    { status: 403, message: 'You do not have access to this action.' },     // M-11
  'E-VAL':          { status: 400, message: 'Some fields are missing or invalid.' },        // M-01, M-02, M-03, M-10
  'E-STATE':        { status: 409, message: "This action is not available for the drive's current status." },
  'E-REG-CLOSED':   { status: 409, message: 'Registration for this drive has closed. Your application was not submitted.' }, // M-04
  'E-DUP':          { status: 409, message: 'You have already applied to this drive.' },     // M-05
  'E-INELIGIBLE':   { status: 422, message: "Your profile does not meet this drive's eligibility criteria." }, // M-06
  'E-NOT-CLEARED':  { status: 422, message: 'Offer not recorded: the candidate has not cleared all rounds.' }, // M-08
  'E-OFFER-EXISTS': { status: 409, message: 'An offer already exists for this application. Replace it?' },     // M-09
  'E-NOTFOUND':     { status: 404, message: 'The requested item could not be found.' },
  'E-PERSIST':      { status: 500, message: 'Something went wrong; nothing was saved. Please retry.' },
  'E-DELIVERY':     { status: 502, message: 'Notification delivery failed (in-app notification remains available).' },
});

class AppError extends Error {
  constructor(code, message, extra) {
    const entry = CATALOGUE[code] || { status: 400, message: 'The request could not be completed.' };
    super(message || entry.message);
    this.name = 'AppError';
    this.code = code;
    this.status = entry.status;
    this.extra = extra || {};
  }
  toJSON() {
    return { code: this.code, message: this.message, ...this.extra };
  }
}

module.exports = { AppError, CATALOGUE };
