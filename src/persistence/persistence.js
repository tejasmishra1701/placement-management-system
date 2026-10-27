'use strict';
// IPersistence (Figure 15) + repositories: transaction boundaries, atomic insert-if-absent and
// upsert-offer, and the load/save operations every service uses. Only this file talks SQL.
const { randomUUID } = require('node:crypto');
const { AppError } = require('../domain/errors');
const { applySchema, dropAllTables } = require('./database');

function wrapStorageError(err) {
  if (err instanceof AppError) return err;
  if (err && err.code === 'ERR_SQLITE_ERROR') return new AppError('E-PERSIST', undefined, { detail: err.message });
  return err;
}

class Persistence {
  constructor(db) {
    this.db = db;
    this.depth = 0;
    this.pendingAfterCommit = [];
    this.statements = new Map();
  }

  // ---------- IPersistence: transactions ----------
  begin() { this.db.exec('BEGIN IMMEDIATE'); }
  commit() { this.db.exec('COMMIT'); }
  rollback() { this.db.exec('ROLLBACK'); }

  // One transaction per use-case workflow (Section 46.4). Nested calls join the outer transaction.
  transaction(work) {
    if (this.depth > 0) {
      this.depth += 1;
      try { return work(); } finally { this.depth -= 1; }
    }
    this.begin();
    this.depth = 1;
    let result;
    try {
      result = work();
      this.commit();
    } catch (err) {
      try { this.rollback(); } catch (_) { /* already rolled back */ }
      this.depth = 0;
      this.pendingAfterCommit = [];
      throw wrapStorageError(err);
    }
    this.depth = 0;
    const hooks = this.pendingAfterCommit;
    this.pendingAfterCommit = [];
    for (const hook of hooks) {
      try { hook(); } catch (e) { console.error('[after-commit] ' + (e && e.message)); }
    }
    return result;
  }

  // Notifications / e-mail run only after a successful commit (D11: a delivery problem never undoes data).
  afterCommit(fn) {
    if (this.depth > 0) this.pendingAfterCommit.push(fn);
    else fn();
  }

  // ---------- helpers ----------
  stmt(sql) {
    let s = this.statements.get(sql);
    if (!s) { s = this.db.prepare(sql); this.statements.set(sql, s); }
    return s;
  }
  get(sql, ...params) { const row = this.stmt(sql).get(...params); return row === undefined ? null : row; }
  all(sql, ...params) { return this.stmt(sql).all(...params); }
  run(sql, ...params) { return this.stmt(sql).run(...params); }
  newId() { return randomUUID(); }
  now() { return new Date().toISOString(); }

  // ---------- users / student profiles ----------
  findUserByEmail(email) { return this.get('SELECT * FROM users WHERE email = ?', email); }
  findUserById(id) { return this.get('SELECT * FROM users WHERE user_id = ?', id); }
  listUsers() {
    return this.all(`SELECT u.user_id, u.name, u.email, u.role, u.account_status, u.created_at,
                            sp.roll_number, sp.branch, sp.cgpa, sp.active_backlogs, c.company_name
                     FROM users u
                     LEFT JOIN student_profiles sp ON sp.student_id = u.user_id
                     LEFT JOIN companies c ON c.account_user_id = u.user_id
                     ORDER BY u.role, u.name`);
  }
  insertUser(u) {
    this.run('INSERT INTO users (user_id, name, email, password_hash, role, account_status, created_at) VALUES (?,?,?,?,?,?,?)',
      u.user_id, u.name, u.email, u.password_hash, u.role, u.account_status || 'ACTIVE', u.created_at || this.now());
  }
  updateUserStatus(id, status) { this.run('UPDATE users SET account_status = ? WHERE user_id = ?', status, id); }
  countUsers() { return this.get('SELECT COUNT(*) AS n FROM users').n; }

  findStudent(id) {
    return this.get(`SELECT u.user_id, u.name, u.email, u.account_status, sp.*
                     FROM student_profiles sp JOIN users u ON u.user_id = sp.student_id WHERE sp.student_id = ?`, id);
  }
  listStudents() {
    return this.all(`SELECT u.user_id, u.name, u.email, u.account_status, sp.*
                     FROM student_profiles sp JOIN users u ON u.user_id = sp.student_id ORDER BY sp.roll_number`);
  }
  listActiveStudents() {
    return this.all(`SELECT u.user_id, u.name, u.email, sp.*
                     FROM student_profiles sp JOIN users u ON u.user_id = sp.student_id
                     WHERE u.account_status = 'ACTIVE' ORDER BY sp.roll_number`);
  }
  insertStudentProfile(p) {
    this.run('INSERT INTO student_profiles (student_id, roll_number, branch, cgpa, active_backlogs, resume_file_url) VALUES (?,?,?,?,?,?)',
      p.student_id, p.roll_number, p.branch, p.cgpa, p.active_backlogs || 0, p.resume_file_url || null);
  }
  updateStudentProfile(id, p) {
    this.run('UPDATE student_profiles SET branch = ?, cgpa = ?, active_backlogs = ?, resume_file_url = ? WHERE student_id = ?',
      p.branch, p.cgpa, p.active_backlogs, p.resume_file_url || null, id);
  }

  // ---------- companies ----------
  insertCompany(c) {
    this.run('INSERT INTO companies (company_id, company_name, industry, contact_person, contact_email, account_user_id, created_at) VALUES (?,?,?,?,?,?,?)',
      c.company_id, c.company_name, c.industry || null, c.contact_person || null, c.contact_email || null, c.account_user_id || null, c.created_at || this.now());
  }
  findCompany(id) { return this.get('SELECT * FROM companies WHERE company_id = ?', id); }
  findCompanyByAccount(userId) { return this.get('SELECT * FROM companies WHERE account_user_id = ?', userId); }
  listCompanies() {
    return this.all(`SELECT c.*, (SELECT COUNT(*) FROM placement_drives d WHERE d.company_id = c.company_id) AS drive_count
                     FROM companies c ORDER BY c.company_name`);
  }

  // ---------- placement drives ----------
  static get DRIVE_SELECT() {
    return `SELECT d.*, c.company_name,
                   (SELECT COUNT(*) FROM applications a WHERE a.drive_id = d.drive_id) AS application_count
            FROM placement_drives d JOIN companies c ON c.company_id = d.company_id`;
  }
  insertDrive(d) {
    this.run(`INSERT INTO placement_drives (drive_id, company_id, created_by, job_title, job_description, ctc_lpa, registration_deadline, status, created_at, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
      d.drive_id, d.company_id, d.created_by, d.job_title || null, d.job_description || null, d.ctc_lpa ?? null,
      d.registration_deadline || null, d.status || 'DRAFT', d.created_at || this.now(), d.updated_at || this.now());
  }
  updateDriveDetails(id, d) {
    this.run(`UPDATE placement_drives SET company_id = ?, job_title = ?, job_description = ?, ctc_lpa = ?, registration_deadline = ?, updated_at = ?
              WHERE drive_id = ?`,
      d.company_id, d.job_title || null, d.job_description || null, d.ctc_lpa ?? null, d.registration_deadline || null, this.now(), id);
  }
  setDriveStatus(id, status) { this.run('UPDATE placement_drives SET status = ?, updated_at = ? WHERE drive_id = ?', status, this.now(), id); }
  findDrive(id) { return this.get(`${Persistence.DRIVE_SELECT} WHERE d.drive_id = ?`, id); }
  listDrives() { return this.all(`${Persistence.DRIVE_SELECT} ORDER BY d.created_at DESC`); }
  listDrivesByCompany(companyId) { return this.all(`${Persistence.DRIVE_SELECT} WHERE d.company_id = ? ORDER BY d.created_at DESC`, companyId); }
  // Drives students may see: everything that has been published (FR-013); drafts stay hidden (FR-009).
  listVisibleDrives() {
    return this.all(`${Persistence.DRIVE_SELECT} WHERE d.status IN ('PUBLISHED','REGISTRATION_CLOSED','ONGOING_ROUNDS')
                     ORDER BY d.registration_deadline ASC`);
  }
  listOpenDrives() { return this.all(`${Persistence.DRIVE_SELECT} WHERE d.status = 'PUBLISHED' ORDER BY d.registration_deadline ASC`); }

  // ---------- eligibility criteria ----------
  findCriteria(driveId) {
    const row = this.get('SELECT * FROM eligibility_criteria WHERE drive_id = ?', driveId);
    if (!row) return null;
    const branches = this.all('SELECT branch FROM eligibility_branches WHERE criteria_id = ? ORDER BY branch', row.criteria_id).map((b) => b.branch);
    return { ...row, branches };
  }
  upsertCriteria(driveId, spec) {
    const existing = this.get('SELECT criteria_id FROM eligibility_criteria WHERE drive_id = ?', driveId);
    const criteriaId = existing ? existing.criteria_id : this.newId();
    if (existing) {
      this.run('UPDATE eligibility_criteria SET min_cgpa = ?, max_backlogs = ? WHERE criteria_id = ?', spec.min_cgpa ?? null, spec.max_backlogs ?? null, criteriaId);
      this.run('DELETE FROM eligibility_branches WHERE criteria_id = ?', criteriaId);
    } else {
      this.run('INSERT INTO eligibility_criteria (criteria_id, drive_id, min_cgpa, max_backlogs) VALUES (?,?,?,?)', criteriaId, driveId, spec.min_cgpa ?? null, spec.max_backlogs ?? null);
    }
    for (const b of spec.branches || []) this.run('INSERT INTO eligibility_branches (criteria_id, branch) VALUES (?,?)', criteriaId, b);
    return criteriaId;
  }

  // ---------- rounds ----------
  listRounds(driveId) { return this.all('SELECT * FROM rounds WHERE drive_id = ? ORDER BY round_order', driveId); }
  findRound(id) { return this.get('SELECT * FROM rounds WHERE round_id = ?', id); }
  replaceRounds(driveId, rounds) {
    this.run('DELETE FROM rounds WHERE drive_id = ?', driveId);
    rounds.forEach((r, i) => {
      this.run('INSERT INTO rounds (round_id, drive_id, round_name, round_order, status, scheduled_at) VALUES (?,?,?,?,?,?)',
        r.round_id || this.newId(), driveId, r.round_name, i + 1, r.status || 'PLANNED', r.scheduled_at || null);
    });
  }
  setRoundStatus(id, status) { this.run('UPDATE rounds SET status = ? WHERE round_id = ?', status, id); }
  setRoundSchedule(id, at) { this.run('UPDATE rounds SET scheduled_at = ? WHERE round_id = ?', at, id); }
  countRoundResultsForDrive(driveId) {
    return this.get('SELECT COUNT(*) AS n FROM round_results rr JOIN rounds r ON r.round_id = rr.round_id WHERE r.drive_id = ?', driveId).n;
  }

  // ---------- applications ----------
  static get APPLICATION_SELECT() {
    return `SELECT a.*, d.job_title, d.company_id, d.ctc_lpa AS drive_ctc_lpa, d.status AS drive_status, d.registration_deadline,
                   c.company_name, u.name AS student_name, u.email AS student_email,
                   sp.roll_number, sp.branch, sp.cgpa, sp.active_backlogs, sp.resume_file_url
            FROM applications a
            JOIN placement_drives d ON d.drive_id = a.drive_id
            JOIN companies c ON c.company_id = d.company_id
            JOIN student_profiles sp ON sp.student_id = a.student_id
            JOIN users u ON u.user_id = a.student_id`;
  }
  // IPersistence.insertApplicationIfAbsent(app): true if inserted, false if the pair exists (BR-004).
  insertApplicationIfAbsent(app) {
    const r = this.run(`INSERT OR IGNORE INTO applications (application_id, student_id, drive_id, application_date, current_round_status, final_outcome)
                        VALUES (?,?,?,?,?,?)`,
      app.application_id, app.student_id, app.drive_id, app.application_date, app.current_round_status || 'APPLIED', app.final_outcome || 'PENDING');
    return r.changes === 1;
  }
  findApplication(id) { return this.get(`${Persistence.APPLICATION_SELECT} WHERE a.application_id = ?`, id); }
  findApplicationByPair(studentId, driveId) { return this.get(`${Persistence.APPLICATION_SELECT} WHERE a.student_id = ? AND a.drive_id = ?`, studentId, driveId); }
  listApplicationsByDrive(driveId) { return this.all(`${Persistence.APPLICATION_SELECT} WHERE a.drive_id = ? ORDER BY a.application_date`, driveId); }
  listApplicationsByStudent(studentId) { return this.all(`${Persistence.APPLICATION_SELECT} WHERE a.student_id = ? ORDER BY a.application_date DESC`, studentId); }
  updateApplicationStatus(id, status, outcome) {
    this.run('UPDATE applications SET current_round_status = ?, final_outcome = ? WHERE application_id = ?', status, outcome, id);
  }
  countApplicationsByStatus() {
    return this.all('SELECT current_round_status AS status, COUNT(*) AS n FROM applications GROUP BY current_round_status');
  }

  // ---------- round results ----------
  listRoundResults(applicationId) {
    const map = {};
    for (const r of this.all('SELECT * FROM round_results WHERE application_id = ?', applicationId)) map[r.round_id] = r;
    return map;
  }
  listRoundResultsByDrive(driveId) {
    const map = {};
    for (const r of this.all('SELECT rr.* FROM round_results rr JOIN rounds r ON r.round_id = rr.round_id WHERE r.drive_id = ?', driveId)) {
      (map[r.application_id] = map[r.application_id] || {})[r.round_id] = r;
    }
    return map;
  }
  upsertRoundResult(applicationId, roundId, result, updatedBy) {
    this.run(`INSERT INTO round_results (application_id, round_id, result, updated_at, updated_by) VALUES (?,?,?,?,?)
              ON CONFLICT(application_id, round_id) DO UPDATE SET result = excluded.result, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      applicationId, roundId, result, this.now(), updatedBy || null);
  }
  deleteRoundResult(applicationId, roundId) { this.run('DELETE FROM round_results WHERE application_id = ? AND round_id = ?', applicationId, roundId); }

  // ---------- offers ----------
  findOfferByApplication(applicationId) { return this.get('SELECT * FROM offers WHERE application_id = ?', applicationId); }
  listOffersByDrive(driveId) {
    const map = {};
    for (const o of this.all('SELECT o.* FROM offers o JOIN applications a ON a.application_id = o.application_id WHERE a.drive_id = ?', driveId)) map[o.application_id] = o;
    return map;
  }
  // IPersistence.upsertOffer(offer): one row per application (multiplicity 0..1).
  upsertOffer(o) {
    this.run(`INSERT INTO offers (offer_id, application_id, ctc_lpa, offer_date, status, recorded_by, recorded_at) VALUES (?,?,?,?,?,?,?)
              ON CONFLICT(application_id) DO UPDATE SET ctc_lpa = excluded.ctc_lpa, offer_date = excluded.offer_date, status = excluded.status,
                recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at`,
      o.offer_id, o.application_id, o.ctc_lpa, o.offer_date, o.status || 'PUBLISHED', o.recorded_by, o.recorded_at || this.now());
  }

  // ---------- notifications ----------
  insertNotification(n) {
    this.run('INSERT INTO notifications (notification_id, recipient_id, type, message, reference_id, timestamp, read_status) VALUES (?,?,?,?,?,?,?)',
      n.notification_id || this.newId(), n.recipient_id, n.type, n.message, n.reference_id || null, n.timestamp || this.now(), n.read_status ? 1 : 0);
  }
  listNotifications(userId) { return this.all('SELECT * FROM notifications WHERE recipient_id = ? ORDER BY timestamp DESC LIMIT 100', userId); }
  notificationExists(userId, type, referenceId) {
    return !!this.get('SELECT 1 FROM notifications WHERE recipient_id = ? AND type = ? AND reference_id = ?', userId, type, referenceId);
  }
  markNotificationRead(userId, id) { return this.run('UPDATE notifications SET read_status = 1 WHERE notification_id = ? AND recipient_id = ?', id, userId).changes; }
  markAllNotificationsRead(userId) { this.run('UPDATE notifications SET read_status = 1 WHERE recipient_id = ?', userId); }
  countUnreadNotifications(userId) { return this.get('SELECT COUNT(*) AS n FROM notifications WHERE recipient_id = ? AND read_status = 0', userId).n; }

  // ---------- audit log ----------
  insertAudit(a) {
    this.run('INSERT INTO audit_logs (log_id, action_type, performed_by, timestamp, details) VALUES (?,?,?,?,?)',
      a.log_id || this.newId(), a.action_type, a.performed_by || null, a.timestamp || this.now(), a.details || null);
  }
  listAudit(limit = 200) {
    return this.all(`SELECT l.*, u.name AS performed_by_name, u.role AS performed_by_role
                     FROM audit_logs l LEFT JOIN users u ON u.user_id = l.performed_by ORDER BY l.timestamp DESC LIMIT ?`, limit);
  }

  // ---------- reports (FR-026) ----------
  driveWiseReport() {
    return this.all(`SELECT d.drive_id, c.company_name, d.job_title, d.ctc_lpa, d.status, d.registration_deadline,
                            COUNT(a.application_id) AS applications,
                            SUM(CASE WHEN a.current_round_status = 'IN_SELECTION_ROUNDS' THEN 1 ELSE 0 END) AS in_rounds,
                            SUM(CASE WHEN a.current_round_status = 'CLEARED_ALL_ROUNDS' THEN 1 ELSE 0 END) AS cleared,
                            SUM(CASE WHEN a.final_outcome = 'OFFERED' THEN 1 ELSE 0 END) AS offered,
                            SUM(CASE WHEN a.final_outcome = 'REJECTED' THEN 1 ELSE 0 END) AS rejected
                     FROM placement_drives d
                     JOIN companies c ON c.company_id = d.company_id
                     LEFT JOIN applications a ON a.drive_id = d.drive_id
                     WHERE d.status <> 'DRAFT'
                     GROUP BY d.drive_id ORDER BY d.created_at DESC`);
  }
  branchWiseReport() {
    return this.all(`SELECT sp.branch,
                            COUNT(DISTINCT sp.student_id) AS students,
                            COUNT(DISTINCT a.student_id) AS students_applied,
                            COUNT(a.application_id) AS applications,
                            COUNT(DISTINCT CASE WHEN a.final_outcome = 'OFFERED' THEN a.student_id END) AS students_placed,
                            SUM(CASE WHEN a.final_outcome = 'OFFERED' THEN 1 ELSE 0 END) AS offers,
                            ROUND(AVG(o.ctc_lpa), 2) AS avg_ctc_lpa,
                            MAX(o.ctc_lpa) AS highest_ctc_lpa
                     FROM student_profiles sp
                     LEFT JOIN applications a ON a.student_id = sp.student_id
                     LEFT JOIN offers o ON o.application_id = a.application_id
                     GROUP BY sp.branch ORDER BY sp.branch`);
  }

  // ---------- demo reset ----------
  resetSchema() {
    this.statements.clear();
    dropAllTables(this.db);
    applySchema(this.db);
  }
}

module.exports = { Persistence };
