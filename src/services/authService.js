'use strict';
// AuthService (Figure 15): authenticate(), authorize(), logout(). Every controller calls authorize()
// before delegating (Section 46.4), so a hidden button is never the only protection.
const { randomBytes } = require('node:crypto');
const { AppError } = require('../domain/errors');
const { Role, AccountStatus } = require('../domain/enums');
const { verifyPassword } = require('./passwords');
const { studentToDTO, companyToDTO } = require('./dto');

const ALL = [Role.STUDENT, Role.COMPANY, Role.PLACEMENT_OFFICER, Role.ADMINISTRATOR];
const PO = [Role.PLACEMENT_OFFICER];
const ADMIN = [Role.ADMINISTRATOR];

// Permission catalogue: which roles may invoke which protected action (FR-004, NFR-003).
const PERMISSIONS = Object.freeze({
  VIEW_DRIVES: ALL,
  VIEW_DRIVE: ALL,
  CREATE_DRIVE: PO, EDIT_DRIVE: PO, PUBLISH_DRIVE: PO, MANAGE_DRIVE_STATUS: PO,
  ADD_COMPANY: PO, VIEW_COMPANIES: [...PO, ...ADMIN],
  VIEW_STUDENTS: [...PO, ...ADMIN], MANAGE_STUDENTS: PO,
  APPLY: [Role.STUDENT], VIEW_OWN_APPLICATIONS: [Role.STUDENT],
  VIEW_CANDIDATES: [...PO, Role.COMPANY], UPDATE_ROUND_RESULT: PO, RECORD_OFFER: PO, UPDATE_SCHEDULE: [...PO, Role.COMPANY],
  GENERATE_REPORT: [...PO, ...ADMIN],
  MANAGE_USERS: ADMIN, VIEW_AUDIT: ADMIN, RESET_DEMO: ADMIN,
  VIEW_NOTIFICATIONS: ALL, VIEW_DASHBOARD: ALL,
});

class AuthService {
  constructor(persistence) {
    this.p = persistence;
    this.sessions = new Map(); // SessionToken -> { userId, role, issuedAt }
  }

  // authenticate(email, rawPassword) : SessionToken  -- errors E-AUTH / E-INACTIVE (generic message, FR-002)
  authenticate(email, rawPassword) {
    if (typeof email !== 'string' || typeof rawPassword !== 'string' || !email.trim()) throw new AppError('E-AUTH');
    const user = this.p.findUserByEmail(email.trim());
    if (!user || !verifyPassword(rawPassword, user.password_hash)) throw new AppError('E-AUTH');
    if (user.account_status !== AccountStatus.ACTIVE) throw new AppError('E-INACTIVE');
    const token = randomBytes(24).toString('hex');
    this.sessions.set(token, { userId: user.user_id, role: user.role, issuedAt: Date.now() });
    return { token, principal: this.principalFor(user) };
  }

  // authorize(token, permission) : Principal  -- errors E-UNAUTH / E-FORBIDDEN
  authorize(token, permission) {
    const session = token ? this.sessions.get(token) : null;
    if (!session) throw new AppError('E-UNAUTH');
    const user = this.p.findUserById(session.userId);
    if (!user || user.account_status !== AccountStatus.ACTIVE) {
      this.sessions.delete(token);
      throw new AppError('E-UNAUTH');
    }
    const allowed = PERMISSIONS[permission];
    if (!allowed) throw new Error(`Unknown permission: ${permission}`);
    if (!allowed.includes(user.role)) throw new AppError('E-FORBIDDEN');
    return this.principalFor(user);
  }

  logout(token) { if (token) this.sessions.delete(token); }

  // Deactivating an account ends its sessions immediately (UC-002).
  invalidateUser(userId) {
    for (const [token, s] of this.sessions) if (s.userId === userId) this.sessions.delete(token);
  }
  clearAllSessions() { this.sessions.clear(); }

  principalFor(user) {
    const principal = { userId: user.user_id, name: user.name, email: user.email, role: user.role };
    if (user.role === Role.STUDENT) {
      const s = this.p.findStudent(user.user_id);
      if (s) principal.profile = studentToDTO(s);
    }
    if (user.role === Role.COMPANY) {
      const c = this.p.findCompanyByAccount(user.user_id);
      if (c) principal.company = companyToDTO(c);
    }
    return principal;
  }
}

module.exports = { AuthService, PERMISSIONS };
