'use strict';
// Demo data. Names come from the sample objects in the assignment figures (ravi : Student,
// techCorp : Company, drive07 : PlacementDrive, wireframes S2/S4). Dates are relative to the
// moment of seeding so the demo always contains open, closed, ongoing and completed drives.
const { hashPassword } = require('../services/passwords');
const { deriveStatus } = require('../domain/application');
const { evaluate } = require('../domain/eligibilityCriteria');

function daysFromNow(days, hour = 23, minute = 59) {
  const t = new Date();
  t.setDate(t.getDate() + days);
  t.setHours(hour, minute, 0, 0);
  return t.toISOString();
}
const dateOnly = (iso) => iso.slice(0, 10);

// Every demo account uses the password shown on the login screen.
const DEMO_PASSWORDS = {
  ADMINISTRATOR: 'Admin@123',
  PLACEMENT_OFFICER: 'Officer@123',
  COMPANY: 'Company@123',
  STUDENT: 'Student@123',
};

const DEMO_ACCOUNTS = [
  { key: 'admin', name: 'System Administrator', email: 'admin@pms.lnmiit.ac.in', role: 'ADMINISTRATOR' },
  { key: 'tpo', name: 'Dr. Anita Rao', email: 'tpo@pms.lnmiit.ac.in', role: 'PLACEMENT_OFFICER' },
  { key: 'techcorp_hr', name: 'Meera Iyer', email: 'recruiter@techcorp.com', role: 'COMPANY' },
];

const STUDENTS = [
  { key: 'ravi',  name: 'Ravi Kumar',   email: 'ravi.kumar@lnmiit.ac.in',   roll: '24UCS104', branch: 'CSE', cgpa: 8.4, backlogs: 0 },
  { key: 'asha',  name: 'Asha Verma',   email: 'asha.verma@lnmiit.ac.in',   roll: '24UCS110', branch: 'CSE', cgpa: 9.1, backlogs: 0 },
  { key: 'neel',  name: 'Neel Shah',    email: 'neel.shah@lnmiit.ac.in',    roll: '24UCS117', branch: 'IT',  cgpa: 7.6, backlogs: 0 },
  { key: 'sneha', name: 'Sneha Patel',  email: 'sneha.patel@lnmiit.ac.in',  roll: '24UCS131', branch: 'CSE', cgpa: 8.9, backlogs: 0 },
  { key: 'divya', name: 'Divya Nair',   email: 'divya.nair@lnmiit.ac.in',   roll: '24UCS142', branch: 'IT',  cgpa: 8.1, backlogs: 0 },
  { key: 'priya', name: 'Priya Singh',  email: 'priya.singh@lnmiit.ac.in',  roll: '24UEC021', branch: 'ECE', cgpa: 7.2, backlogs: 1 },
  { key: 'arjun', name: 'Arjun Mehta',  email: 'arjun.mehta@lnmiit.ac.in',  roll: '24UCC008', branch: 'CCE', cgpa: 6.8, backlogs: 0 },
  { key: 'karan', name: 'Karan Gupta',  email: 'karan.gupta@lnmiit.ac.in',  roll: '24UME015', branch: 'MME', cgpa: 7.9, backlogs: 2 },
  { key: 'isha',  name: 'Isha Agarwal', email: 'isha.agarwal@lnmiit.ac.in', roll: '24UEC044', branch: 'ECE', cgpa: 8.6, backlogs: 0 },
  { key: 'rohan', name: 'Rohan Jain',   email: 'rohan.jain@lnmiit.ac.in',   roll: '24UCC031', branch: 'CCE', cgpa: 8.3, backlogs: 0 },
];

const COMPANIES = [
  { key: 'techcorp',  name: 'TechCorp',  industry: 'IT Services',          contact: 'Meera Iyer',   email: 'hr@techcorp.com',        account: 'techcorp_hr' },
  { key: 'dataworks', name: 'DataWorks', industry: 'Data Analytics',       contact: 'Rohit Menon',  email: 'careers@dataworks.io' },
  { key: 'testify',   name: 'Testify',   industry: 'Software Testing',     contact: 'Kavita Joshi', email: 'talent@testify.com' },
  { key: 'helpdesk',  name: 'HelpDesk',  industry: 'IT Support Services',  contact: 'Sameer Khan',  email: 'jobs@helpdesk.in' },
  { key: 'cloudnine', name: 'CloudNine', industry: 'Cloud Infrastructure', contact: 'Neha Kapoor',  email: 'hiring@cloudnine.dev' },
];

const DRIVES = [
  {
    key: 'techcorp_se', company: 'techcorp', title: 'Software Engineer', ctc: 12.0, status: 'ONGOING_ROUNDS',
    created: daysFromNow(-20, 10), deadline: daysFromNow(-5),
    minCgpa: 7.5, maxBacklogs: 0, branches: ['CSE', 'IT'],
    description: 'Full-stack development role on the TechCorp platform team. Java / Spring Boot, React, PostgreSQL. Location: Bengaluru.',
    rounds: [['Aptitude Test', 'COMPLETED', daysFromNow(-3, 10)], ['Technical Interview', 'COMPLETED', daysFromNow(-2, 10)], ['HR Interview', 'IN_PROGRESS', daysFromNow(-1, 11)]],
  },
  {
    key: 'dataworks_da', company: 'dataworks', title: 'Data Analyst', ctc: 9.0, status: 'PUBLISHED',
    created: daysFromNow(-6, 11), deadline: daysFromNow(12),
    minCgpa: 8.5, maxBacklogs: 0, branches: ['CSE', 'IT'],
    description: 'Analytics role working with SQL, Python and dashboarding tools for client reporting. Location: Pune.',
    rounds: [['Online Test', 'PLANNED', null], ['Case Study Interview', 'PLANNED', null], ['HR Interview', 'PLANNED', null]],
  },
  {
    key: 'testify_qa', company: 'testify', title: 'QA Engineer', ctc: 7.0, status: 'PUBLISHED',
    created: daysFromNow(-8, 9), deadline: daysFromNow(7),
    minCgpa: 7.0, maxBacklogs: 1, branches: ['CSE', 'IT', 'ECE'],
    description: 'Manual and automation testing (Selenium, Playwright) for enterprise web applications. Location: Jaipur.',
    rounds: [['Aptitude Test', 'PLANNED', null], ['Technical Interview', 'PLANNED', null]],
  },
  {
    key: 'helpdesk_se', company: 'helpdesk', title: 'Support Engineer', ctc: 6.0, status: 'PUBLISHED',
    created: daysFromNow(-15, 14), deadline: daysFromNow(-2),
    minCgpa: 6.5, maxBacklogs: 2, branches: ['CSE', 'IT', 'ECE', 'CCE', 'MME'],
    description: 'L1/L2 technical support for enterprise customers. Rotational shifts. Location: Noida.',
    rounds: [['Group Discussion', 'PLANNED', null], ['HR Interview', 'PLANNED', null]],
  },
  {
    key: 'cloudnine_ce', company: 'cloudnine', title: 'Cloud Engineer', ctc: 14.0, status: 'PUBLISHED',
    created: daysFromNow(-1, 9), deadline: daysFromNow(15),
    minCgpa: 8.0, maxBacklogs: 0, branches: ['CSE', 'IT', 'CCE'],
    description: 'Infrastructure engineering on AWS / Kubernetes. Strong Linux and networking fundamentals expected. Location: Hyderabad.',
    rounds: [['Coding Test', 'PLANNED', daysFromNow(18, 10)], ['System Design Interview', 'PLANNED', null], ['HR Interview', 'PLANNED', null]],
  },
  {
    key: 'dataworks_ba', company: 'dataworks', title: 'Business Analyst', ctc: 8.5, status: 'DRAFT',
    created: daysFromNow(-1, 16), deadline: null,
    minCgpa: null, maxBacklogs: 0, branches: ['CSE', 'CCE'],
    description: 'Requirement analysis and client-facing analytics consulting. Location: Gurugram.',
    rounds: [['Aptitude Test', 'PLANNED', null], ['Interview', 'PLANNED', null]],
  },
  {
    key: 'techcorp_de', company: 'techcorp', title: 'Data Engineer', ctc: 10.0, status: 'COMPLETED',
    created: daysFromNow(-50, 10), deadline: daysFromNow(-30),
    minCgpa: 7.0, maxBacklogs: 0, branches: ['CSE', 'IT', 'CCE'],
    description: 'Batch and streaming data pipelines (Spark, Kafka) for the TechCorp analytics platform. Location: Bengaluru.',
    rounds: [['Online Test', 'COMPLETED', daysFromNow(-27, 10)], ['Technical Interview', 'COMPLETED', daysFromNow(-26, 10)]],
  },
];

// results are listed per round in round order; an offer makes the application OFFERED.
const APPLICATIONS = [
  { student: 'ravi',  drive: 'techcorp_se', date: daysFromNow(-12, 9),  results: ['QUALIFIED', 'QUALIFIED', 'QUALIFIED'] },
  { student: 'asha',  drive: 'techcorp_se', date: daysFromNow(-11, 14), results: ['QUALIFIED', 'QUALIFIED'] },
  { student: 'neel',  drive: 'techcorp_se', date: daysFromNow(-10, 16), results: ['QUALIFIED', 'NOT_QUALIFIED'] },
  { student: 'sneha', drive: 'techcorp_se', date: daysFromNow(-12, 12), results: ['QUALIFIED', 'QUALIFIED', 'QUALIFIED'], offer: { ctc: 11.0, date: daysFromNow(-1) } },
  { student: 'divya', drive: 'techcorp_se', date: daysFromNow(-9, 10),  results: ['QUALIFIED'] },
  { student: 'asha',  drive: 'dataworks_da', date: daysFromNow(-1, 18), results: [] },
  { student: 'ravi',  drive: 'testify_qa',  date: daysFromNow(-2, 11), results: [] },
  { student: 'priya', drive: 'testify_qa',  date: daysFromNow(-1, 9),  results: [] },
  { student: 'isha',  drive: 'testify_qa',  date: daysFromNow(-3, 15), results: [] },
  { student: 'arjun', drive: 'helpdesk_se', date: daysFromNow(-4, 15), results: [] },
  { student: 'karan', drive: 'helpdesk_se', date: daysFromNow(-3, 10), results: [] },
  { student: 'divya', drive: 'techcorp_de', date: daysFromNow(-40, 10), results: ['QUALIFIED', 'QUALIFIED'], offer: { ctc: 10.0, date: daysFromNow(-25) } },
  { student: 'rohan', drive: 'techcorp_de', date: daysFromNow(-39, 12), results: ['QUALIFIED', 'QUALIFIED'], offer: { ctc: 10.0, date: daysFromNow(-25) } },
  { student: 'neel',  drive: 'techcorp_de', date: daysFromNow(-40, 11), results: ['QUALIFIED', 'NOT_QUALIFIED'] },
  { student: 'sneha', drive: 'techcorp_de', date: daysFromNow(-41, 9),  results: ['NOT_QUALIFIED'] },
];

function isSeeded(p) {
  return p.countUsers() > 0;
}

function seedDemoData(p) {
  const ids = { users: {}, companies: {}, drives: {}, rounds: {}, applications: {} };
  const hashes = {};
  for (const role of Object.keys(DEMO_PASSWORDS)) hashes[role] = hashPassword(DEMO_PASSWORDS[role]);

  p.transaction(() => {
    // Users
    for (const a of DEMO_ACCOUNTS) {
      const id = p.newId();
      ids.users[a.key] = id;
      p.insertUser({ user_id: id, name: a.name, email: a.email, password_hash: hashes[a.role], role: a.role, created_at: daysFromNow(-60, 9) });
    }
    for (const s of STUDENTS) {
      const id = p.newId();
      ids.users[s.key] = id;
      p.insertUser({ user_id: id, name: s.name, email: s.email, password_hash: hashes.STUDENT, role: 'STUDENT', created_at: daysFromNow(-55, 9) });
      p.insertStudentProfile({ student_id: id, roll_number: s.roll, branch: s.branch, cgpa: s.cgpa, active_backlogs: s.backlogs, resume_file_url: `/resumes/${s.roll}.pdf` });
    }
    // Companies
    for (const c of COMPANIES) {
      const id = p.newId();
      ids.companies[c.key] = id;
      p.insertCompany({ company_id: id, company_name: c.name, industry: c.industry, contact_person: c.contact, contact_email: c.email,
        account_user_id: c.account ? ids.users[c.account] : null, created_at: daysFromNow(-52, 10) });
      p.insertAudit({ action_type: 'COMPANY_ADDED', performed_by: ids.users.tpo, timestamp: daysFromNow(-52, 10), details: `Added company ${c.name} (${c.industry})` });
    }
    // Drives, criteria, rounds
    for (const d of DRIVES) {
      const id = p.newId();
      ids.drives[d.key] = id;
      p.insertDrive({ drive_id: id, company_id: ids.companies[d.company], created_by: ids.users.tpo, job_title: d.title, job_description: d.description,
        ctc_lpa: d.ctc, registration_deadline: d.deadline, status: d.status, created_at: d.created, updated_at: d.created });
      p.upsertCriteria(id, { min_cgpa: d.minCgpa, max_backlogs: d.maxBacklogs, branches: d.branches });
      const rounds = d.rounds.map(([name, status, at]) => ({ round_id: p.newId(), round_name: name, status, scheduled_at: at }));
      p.replaceRounds(id, rounds);
      ids.rounds[d.key] = rounds.map((r) => r.round_id);
      const companyName = COMPANIES.find((c) => c.key === d.company).name;
      p.insertAudit({ action_type: 'DRIVE_CREATED', performed_by: ids.users.tpo, timestamp: d.created, details: `Created drive "${d.title}" for ${companyName} (Draft)` });
      if (d.status !== 'DRAFT') {
        const publishedAt = new Date(new Date(d.created).getTime() + 2 * 3600 * 1000).toISOString();
        p.insertAudit({ action_type: 'DRIVE_PUBLISHED', performed_by: ids.users.tpo, timestamp: publishedAt, details: `Published drive "${d.title}" for ${companyName}` });
        // FR-023: every eligible student was notified when the drive was published.
        for (const s of STUDENTS) {
          const r = evaluate({ min_cgpa: d.minCgpa, max_backlogs: d.maxBacklogs, branches: d.branches }, { cgpa: s.cgpa, branch: s.branch, active_backlogs: s.backlogs });
          if (!r.eligible) continue;
          p.insertNotification({ recipient_id: ids.users[s.key], type: 'NEW_DRIVE', reference_id: id, timestamp: publishedAt,
            message: `New drive published: ${d.title} at ${companyName} (${d.ctc.toFixed(1)} LPA). Registration closes ${new Date(d.deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`,
            read_status: new Date(publishedAt) < new Date(daysFromNow(-3)) ? 1 : 0 });
        }
      }
      if (d.status === 'ONGOING_ROUNDS') {
        p.insertAudit({ action_type: 'DRIVE_ROUNDS_BEGUN', performed_by: ids.users.tpo, timestamp: daysFromNow(-4, 9), details: `Selection rounds begun for "${d.title}" (${companyName})` });
      }
      if (d.status === 'COMPLETED') {
        p.insertAudit({ action_type: 'DRIVE_COMPLETED', performed_by: ids.users.tpo, timestamp: daysFromNow(-24, 17), details: `Completed drive "${d.title}" (${companyName}); all outcomes declared` });
      }
    }
    // Applications, round results, offers, notifications
    for (const a of APPLICATIONS) {
      const driveDef = DRIVES.find((d) => d.key === a.drive);
      const companyName = COMPANIES.find((c) => c.key === driveDef.company).name;
      const studentDef = STUDENTS.find((s) => s.key === a.student);
      const appId = p.newId();
      const driveId = ids.drives[a.drive];
      const roundIds = ids.rounds[a.drive];
      p.insertApplicationIfAbsent({ application_id: appId, student_id: ids.users[a.student], drive_id: driveId, application_date: a.date });
      const resultsByRoundId = {};
      a.results.forEach((result, i) => {
        const roundId = roundIds[i];
        const at = new Date(new Date(driveDef.rounds[i][2] || a.date).getTime() + 6 * 3600 * 1000).toISOString();
        p.upsertRoundResult(appId, roundId, result, ids.users.tpo);
        resultsByRoundId[roundId] = { result };
        const roundName = driveDef.rounds[i][0];
        p.insertAudit({ action_type: 'ROUND_RESULT_UPDATED', performed_by: ids.users.tpo, timestamp: at, details: `${studentDef.name} (${studentDef.roll}) - ${roundName} of "${driveDef.title}" (${companyName}): ${result}` });
        const msg = result === 'QUALIFIED'
          ? `You qualified the ${roundName} round of ${driveDef.title} - ${companyName}.`
          : `You were not selected in the ${roundName} round of ${driveDef.title} - ${companyName}.`;
        p.insertNotification({ recipient_id: ids.users[a.student], type: 'ROUND_UPDATE', reference_id: appId, timestamp: at, message: msg,
          read_status: new Date(at) < new Date(daysFromNow(-2)) ? 1 : 0 });
      });
      const rounds = roundIds.map((round_id) => ({ round_id }));
      const derived = deriveStatus(rounds, resultsByRoundId, !!a.offer);
      p.updateApplicationStatus(appId, derived.status, derived.outcome);
      if (a.offer) {
        p.upsertOffer({ offer_id: p.newId(), application_id: appId, ctc_lpa: a.offer.ctc, offer_date: dateOnly(a.offer.date), status: 'PUBLISHED', recorded_by: ids.users.tpo, recorded_at: a.offer.date });
        p.insertAudit({ action_type: 'OFFER_RECORDED', performed_by: ids.users.tpo, timestamp: a.offer.date, details: `Offer recorded for ${studentDef.name} (${studentDef.roll}) - "${driveDef.title}" (${companyName}): ${a.offer.ctc.toFixed(1)} LPA` });
        p.insertNotification({ recipient_id: ids.users[a.student], type: 'OFFER_RESULT', reference_id: appId, timestamp: a.offer.date,
          message: `Congratulations! You have been offered ${driveDef.title} at ${companyName} with a package of ${a.offer.ctc.toFixed(1)} LPA.`,
          read_status: new Date(a.offer.date) < new Date(daysFromNow(-2)) ? 1 : 0 });
      }
      ids.applications[`${a.student}:${a.drive}`] = appId;
    }
    p.insertAudit({ action_type: 'DEMO_DATA_SEEDED', performed_by: ids.users.admin, timestamp: p.now(), details: 'Demo data generated with dates relative to today' });
  });
  return ids;
}

module.exports = { seedDemoData, isSeeded, DEMO_PASSWORDS, DEMO_ACCOUNTS, STUDENTS, COMPANIES };
