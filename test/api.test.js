'use strict';
// End-to-end API tests over an in-memory database. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../src/app');

process.env.PMS_QUIET = '1';
let server, base, app;

before(async () => {
  app = createApp({ dbFile: ':memory:', log: false });
  server = http.createServer(app.handle);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function api(method, path, { token, body } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }
  return { status: res.status, ...json };
}
async function login(email, password) {
  const r = await api('POST', '/api/auth/login', { body: { email, password } });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r)}`);
  return r.token;
}
const byTitle = (list, title) => list.find((d) => d.jobTitle === title);

test('UC-001 login: generic failure message, logout invalidates session', async () => {
  const bad = await api('POST', '/api/auth/login', { body: { email: 'ravi.kumar@lnmiit.ac.in', password: 'wrong' } });
  assert.equal(bad.status, 401); assert.equal(bad.error.code, 'E-AUTH'); assert.equal(bad.error.message, 'Invalid e-mail or password.');
  const unknown = await api('POST', '/api/auth/login', { body: { email: 'nobody@x.com', password: 'x' } });
  assert.equal(unknown.error.message, bad.error.message, 'must not reveal which part was wrong (FR-002)');
  const token = await login('ravi.kumar@lnmiit.ac.in', 'Student@123');
  const me = await api('GET', '/api/auth/me', { token });
  assert.equal(me.user.role, 'STUDENT'); assert.equal(me.user.profile.rollNumber, '24UCS104');
  await api('POST', '/api/auth/logout', { token });
  const after = await api('GET', '/api/auth/me', { token });
  assert.equal(after.status, 401); assert.equal(after.error.code, 'E-UNAUTH');
});

test('FR-004 role-based access: student cannot create drives, company sees only its own drives', async () => {
  const student = await login('ravi.kumar@lnmiit.ac.in', 'Student@123');
  const r = await api('POST', '/api/drives', { token: student, body: {} });
  assert.equal(r.status, 403); assert.equal(r.error.code, 'E-FORBIDDEN');
  const company = await login('recruiter@techcorp.com', 'Company@123');
  const drives = await api('GET', '/api/drives', { token: company });
  assert.ok(drives.drives.length >= 2);
  assert.ok(drives.drives.every((d) => d.companyName === 'TechCorp'));
  const foreign = await api('GET', '/api/admin/users', { token: company });
  assert.equal(foreign.status, 403);
});

test('UC-007/UC-008 student drive listing shows eligibility states and filters', async () => {
  const token = await login('ravi.kumar@lnmiit.ac.in', 'Student@123');
  const all = (await api('GET', '/api/drives', { token })).drives;
  assert.equal(byTitle(all, 'Cloud Engineer').state, 'ELIGIBLE');
  assert.equal(byTitle(all, 'Data Analyst').state, 'INELIGIBLE');
  assert.match(byTitle(all, 'Data Analyst').eligibility.failedRules[0], /CGPA 8.40 is below the minimum 8.50/);
  assert.equal(byTitle(all, 'QA Engineer').state, 'APPLIED');
  assert.equal(byTitle(all, 'Support Engineer').state, 'CLOSED');
  assert.equal(byTitle(all, 'Business Analyst'), undefined, 'drafts are hidden (FR-009)');
  const eligible = (await api('GET', '/api/drives?eligibleOnly=true', { token })).drives;
  assert.ok(eligible.every((d) => ['ELIGIBLE', 'APPLIED'].includes(d.state)));
  const searched = (await api('GET', '/api/drives?text=cloud', { token })).drives;
  assert.equal(searched.length, 1); assert.equal(searched[0].companyName, 'CloudNine');
});

test('UC-009 apply: success, duplicate (E-DUP), ineligible (E-INELIGIBLE), closed (E-REG-CLOSED)', async () => {
  const token = await login('ravi.kumar@lnmiit.ac.in', 'Student@123');
  const all = (await api('GET', '/api/drives', { token })).drives;
  const cloud = byTitle(all, 'Cloud Engineer');
  const ok = await api('POST', `/api/drives/${cloud.driveId}/apply`, { token });
  assert.equal(ok.status, 200); assert.equal(ok.confirmation.status, 'APPLIED'); assert.match(ok.confirmation.message, /Application submitted/);
  const dup = await api('POST', `/api/drives/${cloud.driveId}/apply`, { token });
  assert.equal(dup.status, 409); assert.equal(dup.error.code, 'E-DUP');
  const inel = await api('POST', `/api/drives/${byTitle(all, 'Data Analyst').driveId}/apply`, { token });
  assert.equal(inel.status, 422); assert.equal(inel.error.code, 'E-INELIGIBLE'); assert.ok(inel.error.failedRules.length === 1);
  const closed = await api('POST', `/api/drives/${byTitle(all, 'Support Engineer').driveId}/apply`, { token });
  assert.equal(closed.status, 409); assert.equal(closed.error.code, 'E-REG-CLOSED');
  const mine = (await api('GET', '/api/applications/mine', { token })).applications;
  assert.ok(mine.some((a) => a.jobTitle === 'Cloud Engineer' && a.currentRoundStatus === 'APPLIED'));
  const detail = (await api('GET', `/api/drives/${cloud.driveId}`, { token })).drive;
  assert.equal(detail.state, 'APPLIED');
});

test('UC-004/UC-006 create drive: draft, publish rejected with missing fields (M-01), then published with notifications (FR-023)', async () => {
  const tpo = await login('tpo@pms.lnmiit.ac.in', 'Officer@123');
  const companies = (await api('GET', '/api/companies', { token: tpo })).companies;
  const testify = companies.find((c) => c.companyName === 'Testify');
  const created = await api('POST', '/api/drives', { token: tpo, body: { companyId: testify.companyId, jobTitle: 'Automation Engineer', ctcLpa: 8, criteria: { minCgpa: 7, branches: ['CSE', 'ECE'] }, rounds: [{ roundName: 'Coding Test' }] } });
  assert.equal(created.status, 200); assert.equal(created.drive.status, 'DRAFT');
  const driveId = created.drive.driveId;
  const bad = await api('POST', `/api/drives/${driveId}/publish`, { token: tpo });
  assert.equal(bad.published, false);
  assert.deepEqual(bad.missingFields.map((m) => m.field).sort(), ['eligibilityCriteria', 'registrationDeadline']);
  const invalid = await api('PUT', `/api/drives/${driveId}`, { token: tpo, body: { companyId: testify.companyId, jobTitle: 'Automation Engineer', ctcLpa: 8, criteria: { minCgpa: 11, branches: ['CSE'] }, rounds: [{ roundName: 'Coding Test' }] } });
  assert.equal(invalid.status, 400); assert.equal(invalid.error.code, 'E-VAL'); assert.equal(invalid.error.fields[0].field, 'minCgpa');
  const deadline = new Date(Date.now() + 5 * 86400000).toISOString();
  const fixed = await api('PUT', `/api/drives/${driveId}`, { token: tpo, body: { companyId: testify.companyId, jobTitle: 'Automation Engineer', ctcLpa: 8, registrationDeadline: deadline, criteria: { minCgpa: 7, maxBacklogs: 0, branches: ['CSE', 'ECE'] }, rounds: [{ roundName: 'Coding Test' }, { roundName: 'Interview' }] } });
  assert.equal(fixed.status, 200);
  const published = await api('POST', `/api/drives/${driveId}/publish`, { token: tpo });
  assert.equal(published.published, true); assert.equal(published.drive.status, 'PUBLISHED');
  assert.equal(published.notified, 4, 'Ravi, Asha, Sneha (CSE, 0 backlogs) + Isha (ECE, 0 backlogs); Priya has a backlog');
  const again = await api('POST', `/api/drives/${driveId}/publish`, { token: tpo });
  assert.equal(again.status, 409); assert.equal(again.error.code, 'E-STATE');
  const ravi = await login('ravi.kumar@lnmiit.ac.in', 'Student@123');
  const notes = (await api('GET', '/api/notifications', { token: ravi })).notifications;
  assert.ok(notes.some((n) => n.type === 'NEW_DRIVE' && n.referenceId === driveId));
});

test('UC-011/UC-013 rounds and offers: sequential results, E-NOT-CLEARED, record, E-OFFER-EXISTS, replace', async () => {
  const tpo = await login('tpo@pms.lnmiit.ac.in', 'Officer@123');
  const drives = (await api('GET', '/api/drives', { token: tpo })).drives;
  const se = drives.find((d) => d.jobTitle === 'Software Engineer' && d.companyName === 'TechCorp');
  assert.equal(se.status, 'ONGOING_ROUNDS');
  let candidates = (await api('GET', `/api/drives/${se.driveId}/candidates`, { token: tpo })).candidates;
  const ravi = candidates.find((c) => c.rollNumber === '24UCS104');
  const asha = candidates.find((c) => c.rollNumber === '24UCS110');
  const sneha = candidates.find((c) => c.rollNumber === '24UCS131');
  assert.equal(ravi.cleared, true); assert.equal(asha.cleared, false); assert.equal(sneha.currentRoundStatus, 'OFFERED');

  // Offer for Asha must fail: HR round still pending.
  const notCleared = await api('POST', `/api/applications/${asha.applicationId}/offer`, { token: tpo, body: { ctcLpa: 12, offerDate: '2026-10-28' } });
  assert.equal(notCleared.status, 422); assert.equal(notCleared.error.code, 'E-NOT-CLEARED');
  // Validation M-10
  const badOffer = await api('POST', `/api/applications/${ravi.applicationId}/offer`, { token: tpo, body: { ctcLpa: 0, offerDate: 'x' } });
  assert.equal(badOffer.status, 400); assert.equal(badOffer.error.code, 'E-VAL');
  // Record Ravi's offer
  const rec = await api('POST', `/api/applications/${ravi.applicationId}/offer`, { token: tpo, body: { ctcLpa: 12, offerDate: '2026-10-28' } });
  assert.equal(rec.status, 200); assert.equal(rec.offer.status, 'RECORDED');
  const exists = await api('POST', `/api/applications/${ravi.applicationId}/offer`, { token: tpo, body: { ctcLpa: 12.5, offerDate: '2026-10-29' } });
  assert.equal(exists.status, 409); assert.equal(exists.error.code, 'E-OFFER-EXISTS'); assert.equal(exists.error.existing.ctcLpa, 12);
  const replaced = await api('POST', `/api/applications/${ravi.applicationId}/offer`, { token: tpo, body: { ctcLpa: 12.5, offerDate: '2026-10-29', overwriteOk: true } });
  assert.equal(replaced.offer.status, 'REPLACED');
  // Results frozen after offer
  const frozen = await api('POST', `/api/applications/${ravi.applicationId}/rounds/${se.rounds[2].roundId}/result`, { token: tpo, body: { result: 'NOT_QUALIFIED' } });
  assert.equal(frozen.status, 409);
  // Asha: cannot skip to a later round than the next pending one? (round 3 follows qualified round 2 -> allowed)
  const upd = await api('POST', `/api/applications/${asha.applicationId}/rounds/${se.rounds[2].roundId}/result`, { token: tpo, body: { result: 'QUALIFIED' } });
  assert.equal(upd.status, 200); assert.equal(upd.candidate.currentRoundStatus, 'CLEARED_ALL_ROUNDS'); assert.equal(upd.candidate.cleared, true);
  // Divya: only round 1 qualified -> round 3 cannot be set before round 2
  const divya = candidates.find((c) => c.rollNumber === '24UCS142');
  const skip = await api('POST', `/api/applications/${divya.applicationId}/rounds/${se.rounds[2].roundId}/result`, { token: tpo, body: { result: 'QUALIFIED' } });
  assert.equal(skip.status, 409); assert.match(skip.error.message, /earlier round/);
  // Student sees the published offer and round-wise status (FR-022, BR-005)
  const rv = await login('ravi.kumar@lnmiit.ac.in', 'Student@123');
  const mine = (await api('GET', '/api/applications/mine', { token: rv })).applications;
  const app = mine.find((a) => a.jobTitle === 'Software Engineer');
  assert.equal(app.finalOutcome, 'OFFERED'); assert.equal(app.offer.ctcLpa, 12.5); assert.equal(app.rounds.length, 3);
  const notes = (await api('GET', '/api/notifications', { token: rv })).notifications;
  assert.ok(notes.some((n) => n.type === 'OFFER_RESULT' && /12.5 LPA/.test(n.message)));
  // Complete is blocked while outcomes are pending; after declaring, it succeeds
  const blocked = await api('POST', `/api/drives/${se.driveId}/complete`, { token: tpo });
  assert.equal(blocked.status, 409);
  await api('POST', `/api/applications/${asha.applicationId}/not-offered`, { token: tpo });
  await api('POST', `/api/applications/${divya.applicationId}/rounds/${se.rounds[1].roundId}/result`, { token: tpo, body: { result: 'NOT_QUALIFIED' } });
  const done = await api('POST', `/api/drives/${se.driveId}/complete`, { token: tpo });
  assert.equal(done.status, 200, JSON.stringify(done)); assert.equal(done.drive.status, 'COMPLETED');
});

test('Figure 11 drive lifecycle: close -> begin rounds -> results; cancel notifies applicants', async () => {
  const tpo = await login('tpo@pms.lnmiit.ac.in', 'Officer@123');
  const drives = (await api('GET', '/api/drives', { token: tpo })).drives;
  const qa = drives.find((d) => d.jobTitle === 'QA Engineer');
  const early = await api('POST', `/api/drives/${qa.driveId}/begin-rounds`, { token: tpo });
  assert.equal(early.status, 409);
  const closed = await api('POST', `/api/drives/${qa.driveId}/close`, { token: tpo });
  assert.equal(closed.drive.status, 'REGISTRATION_CLOSED');
  const begun = await api('POST', `/api/drives/${qa.driveId}/begin-rounds`, { token: tpo });
  assert.equal(begun.drive.status, 'ONGOING_ROUNDS'); assert.equal(begun.drive.rounds[0].status, 'IN_PROGRESS');
  const helpdesk = drives.find((d) => d.jobTitle === 'Support Engineer');
  assert.equal(helpdesk.effectiveStatus, 'REGISTRATION_CLOSED', 'deadline passed -> effectively closed');
  const cancelled = await api('POST', `/api/drives/${helpdesk.driveId}/cancel`, { token: tpo });
  assert.equal(cancelled.drive.status, 'CANCELLED');
  const arjun = await login('arjun.mehta@lnmiit.ac.in', 'Student@123');
  const notes = (await api('GET', '/api/notifications', { token: arjun })).notifications;
  assert.ok(notes.some((n) => n.type === 'DRIVE_CLOSED_OR_CANCELLED' && /cancelled/.test(n.message)));
});

test('UC-002 admin: deactivated users cannot log in (generic message) and lose their session; audit log records it', async () => {
  const admin = await login('admin@pms.lnmiit.ac.in', 'Admin@123');
  const neelToken = await login('neel.shah@lnmiit.ac.in', 'Student@123');
  const users = (await api('GET', '/api/admin/users', { token: admin })).users;
  const neel = users.find((u) => u.email === 'neel.shah@lnmiit.ac.in');
  const d = await api('POST', `/api/admin/users/${neel.userId}/deactivate`, { token: admin });
  assert.equal(d.user.accountStatus, 'DEACTIVATED');
  const me = await api('GET', '/api/auth/me', { token: neelToken });
  assert.equal(me.status, 401);
  const relogin = await api('POST', '/api/auth/login', { body: { email: 'neel.shah@lnmiit.ac.in', password: 'Student@123' } });
  assert.equal(relogin.status, 401); assert.equal(relogin.error.message, 'Invalid e-mail or password.');
  const self = await api('POST', `/api/admin/users/${users.find((u) => u.role === 'ADMINISTRATOR').userId}/deactivate`, { token: admin });
  assert.equal(self.status, 409);
  await api('POST', `/api/admin/users/${neel.userId}/restore`, { token: admin });
  const logs = (await api('GET', '/api/admin/audit-logs', { token: admin })).logs;
  assert.equal(logs[0].actionType, 'USER_RESTORED'); assert.equal(logs[1].actionType, 'USER_DEACTIVATED');
});

test('UC-014 reports: drive-wise and branch-wise rows, CSV export', async () => {
  const tpo = await login('tpo@pms.lnmiit.ac.in', 'Officer@123');
  const dw = (await api('GET', '/api/reports/drive-wise', { token: tpo })).report;
  assert.ok(dw.rows.length >= 6); assert.ok(dw.rows.every((r) => r.status !== 'Draft'));
  const bw = (await api('GET', '/api/reports/branch-wise', { token: tpo })).report;
  const it = bw.rows.find((r) => r.branch === 'IT');
  assert.ok(it.studentsPlaced >= 1); assert.ok(it.highestCtcLpa >= 10);
  const res = await fetch(`${base}/api/reports/branch-wise?format=csv`, { headers: { Authorization: `Bearer ${tpo}` } });
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  const csv = await res.text();
  assert.match(csv.split('\n')[0], /^branch,students/);
  const summary = (await api('GET', '/api/dashboard/summary', { token: tpo })).summary;
  assert.ok(summary.drives.total >= 7); assert.ok(Array.isArray(summary.attention));
});

test('AC-03 profile update re-evaluates eligibility instantly; company can schedule rounds', async () => {
  const tpo = await login('tpo@pms.lnmiit.ac.in', 'Officer@123');
  const students = (await api('GET', '/api/students', { token: tpo })).students;
  const ravi = students.find((s) => s.rollNumber === '24UCS104');
  await api('PUT', `/api/students/${ravi.studentId}`, { token: tpo, body: { cgpa: 8.6 } });
  const rv = await login('ravi.kumar@lnmiit.ac.in', 'Student@123');
  const all = (await api('GET', '/api/drives', { token: rv })).drives;
  assert.equal(byTitle(all, 'Data Analyst').state, 'ELIGIBLE');
  await api('PUT', `/api/students/${ravi.studentId}`, { token: tpo, body: { cgpa: 8.4 } });
  const company = await login('recruiter@techcorp.com', 'Company@123');
  const mine = (await api('GET', '/api/drives', { token: company })).drives;
  const se = mine.find((d) => d.jobTitle === 'Software Engineer');
  const sched = await api('PUT', `/api/drives/${se.driveId}/rounds/${se.rounds[2].roundId}/schedule`, { token: company, body: { scheduledAt: new Date(Date.now() + 86400000).toISOString() } });
  assert.equal(sched.status, 200); assert.ok(sched.drive.rounds[2].scheduledAt);
  const other = mine.length && (await api('GET', '/api/drives', { token: tpo })).drives.find((d) => d.companyName !== 'TechCorp');
  const forbidden = await api('GET', `/api/drives/${other.driveId}/candidates`, { token: company });
  assert.equal(forbidden.status, 403);
});
