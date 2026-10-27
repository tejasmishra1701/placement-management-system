'use strict';
// EligibilityCriteria.evaluate(profile) : EligibilityResult  (Section 48.6, BR-001). Side-effect free.

function evaluate(criteria, profile) {
  const failed = [];
  if (!criteria) {
    return { eligible: false, failedRules: ['Eligibility criteria have not been defined for this drive'] };
  }
  const branches = Array.isArray(criteria.branches) ? criteria.branches : [];
  if (criteria.min_cgpa !== null && criteria.min_cgpa !== undefined && Number(profile.cgpa) < Number(criteria.min_cgpa)) {
    failed.push(`CGPA ${Number(profile.cgpa).toFixed(2)} is below the minimum ${Number(criteria.min_cgpa).toFixed(2)}`);
  }
  if (branches.length > 0 && !branches.includes(profile.branch)) {
    failed.push(`Branch ${profile.branch} is not allowed (allowed: ${branches.join(', ')})`);
  }
  if (criteria.max_backlogs !== null && criteria.max_backlogs !== undefined && Number(profile.active_backlogs) > Number(criteria.max_backlogs)) {
    failed.push(`${profile.active_backlogs} active backlog(s) exceed the maximum of ${criteria.max_backlogs}`);
  }
  return { eligible: failed.length === 0, failedRules: failed };
}

module.exports = { evaluate };
