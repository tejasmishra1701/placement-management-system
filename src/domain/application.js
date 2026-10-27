'use strict';
// Application domain behaviour: candidate-specific round clearance (Section 43, 48.6) and
// the Figure 12 state derivation from RoundResult rows.
const { ApplicationStatus, FinalOutcome, RoundResultStatus } = require('./enums');

// SelectionOfferService.hasClearedAllRounds(): every applicable round must have a QUALIFIED
// RoundResult for THIS application (a drive-wide Round.status is never enough).
function hasClearedAllRounds(rounds, resultsByRoundId) {
  if (!rounds || rounds.length === 0) return false;
  for (const round of rounds) {
    const res = resultsByRoundId[round.round_id];
    if (!res || res.result !== RoundResultStatus.QUALIFIED) return false;
  }
  return true;
}

// Derives currentRoundStatus / finalOutcome from the round results (Figure 12 transitions).
function deriveStatus(rounds, resultsByRoundId, hasOffer) {
  if (hasOffer) return { status: ApplicationStatus.OFFERED, outcome: FinalOutcome.OFFERED };
  const results = rounds.map((r) => (resultsByRoundId[r.round_id] ? resultsByRoundId[r.round_id].result : RoundResultStatus.PENDING));
  if (results.includes(RoundResultStatus.NOT_QUALIFIED)) {
    return { status: ApplicationStatus.REJECTED, outcome: FinalOutcome.REJECTED };
  }
  if (rounds.length > 0 && results.every((r) => r === RoundResultStatus.QUALIFIED)) {
    return { status: ApplicationStatus.CLEARED_ALL_ROUNDS, outcome: FinalOutcome.PENDING };
  }
  if (results.some((r) => r === RoundResultStatus.QUALIFIED)) {
    return { status: ApplicationStatus.IN_SELECTION_ROUNDS, outcome: FinalOutcome.PENDING };
  }
  return { status: ApplicationStatus.APPLIED, outcome: FinalOutcome.PENDING };
}

module.exports = { hasClearedAllRounds, deriveStatus };
