'use strict';
// Administrator responsibilities (Section 11.4, UC-002): user accounts, audit log access, system
// summary, and the demo reset (re-seeds data relative to today).
const { AppError } = require('../domain/errors');
const { AccountStatus, DriveStatus } = require('../domain/enums');
const { userToDTO } = require('./dto');
const { seedDemoData } = require('../persistence/seed');
const { effectiveStatus } = require('../domain/placementDrive');

class AdminService {
  constructor(persistence, authService, auditService) {
    this.p = persistence;
    this.auth = authService;
    this.audit = auditService;
  }

  listUsers() { return this.p.listUsers().map(userToDTO); }

  deactivateAccount(principal, userId) {
    const user = this.p.findUserById(userId);
    if (!user) throw new AppError('E-NOTFOUND');
    if (user.user_id === principal.userId) throw new AppError('E-STATE', 'You cannot deactivate your own account.');
    return this.p.transaction(() => {
      this.p.updateUserStatus(userId, AccountStatus.DEACTIVATED);
      this.audit.record(principal.userId, 'USER_DEACTIVATED', `Deactivated account ${user.name} <${user.email}> (${user.role})`);
      this.auth.invalidateUser(userId);
      return userToDTO({ ...user, account_status: AccountStatus.DEACTIVATED });
    });
  }

  restoreAccount(principal, userId) {
    const user = this.p.findUserById(userId);
    if (!user) throw new AppError('E-NOTFOUND');
    return this.p.transaction(() => {
      this.p.updateUserStatus(userId, AccountStatus.ACTIVE);
      this.audit.record(principal.userId, 'USER_RESTORED', `Restored account ${user.name} <${user.email}> (${user.role})`);
      return userToDTO({ ...user, account_status: AccountStatus.ACTIVE });
    });
  }

  // Dashboard summary (FR-027 for the Administrator; also used by the Officer home).
  summary() {
    const now = new Date();
    const drives = this.p.listDrives();
    const byStatus = {};
    for (const s of Object.values(DriveStatus)) byStatus[s] = 0;
    for (const d of drives) byStatus[effectiveStatus(d, now)] += 1;
    const apps = {};
    for (const r of this.p.countApplicationsByStatus()) apps[r.status] = r.n;
    const users = this.p.listUsers();
    const attention = [];
    for (const d of drives) {
      const eff = effectiveStatus(d, now);
      if (d.status === DriveStatus.DRAFT) attention.push({ driveId: d.drive_id, label: `${d.job_title || '(untitled)'} - ${d.company_name}`, reason: 'Draft: complete and publish' });
      else if (eff === DriveStatus.REGISTRATION_CLOSED) attention.push({ driveId: d.drive_id, label: `${d.job_title} - ${d.company_name}`, reason: 'Registration closed: begin selection rounds' });
      else if (d.status === DriveStatus.ONGOING_ROUNDS) {
        const cleared = this.p.listApplicationsByDrive(d.drive_id).filter((a) => a.current_round_status === 'CLEARED_ALL_ROUNDS').length;
        if (cleared) attention.push({ driveId: d.drive_id, label: `${d.job_title} - ${d.company_name}`, reason: `${cleared} candidate(s) cleared all rounds: record offers` });
      }
    }
    return {
      drives: { total: drives.length, byStatus },
      applications: { total: Object.values(apps).reduce((a, b) => a + b, 0), byStatus: apps },
      users: { total: users.length, students: users.filter((u) => u.role === 'STUDENT').length, companies: this.p.listCompanies().length,
        active: users.filter((u) => u.account_status === 'ACTIVE').length, deactivated: users.filter((u) => u.account_status !== 'ACTIVE').length },
      attention,
    };
  }

  resetDemo(principal) {
    this.audit.record(principal.userId, 'DEMO_RESET', `Demo data reset requested by ${principal.name}`);
    this.p.resetSchema();
    seedDemoData(this.p);
    this.auth.clearAllSessions();
    return { reset: true, message: 'Demo data has been reset. Please log in again.' };
  }
}

module.exports = { AdminService };
