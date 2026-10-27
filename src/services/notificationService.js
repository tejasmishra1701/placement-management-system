'use strict';
// NotificationService: creates in-app notifications (FR-023..FR-025) and "delivers" e-mail
// (simulated by a console line, D11). Delivery problems are logged, never fatal (E-DELIVERY).
const { NotificationType } = require('../domain/enums');
const { evaluate } = require('../domain/eligibilityCriteria');
const { notificationToDTO } = require('./dto');

const fmtDate = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const REMINDER_WINDOW_HOURS = 48;

class NotificationService {
  constructor(persistence) { this.p = persistence; this.emailLog = []; }

  // notifyEligibleStudents(driveId) : int  (FR-023; one notice per eligible student)
  notifyEligibleStudents(driveId) {
    const drive = this.p.findDrive(driveId);
    const criteria = this.p.findCriteria(driveId);
    if (!drive) return 0;
    let count = 0;
    for (const student of this.p.listActiveStudents()) {
      if (!evaluate(criteria, student).eligible) continue;
      if (this.p.notificationExists(student.user_id, NotificationType.NEW_DRIVE, driveId)) continue;
      const message = `New drive published: ${drive.job_title} at ${drive.company_name} (${Number(drive.ctc_lpa).toFixed(1)} LPA). Registration closes ${fmtDate(drive.registration_deadline)}.`;
      this.notifyStudent(student.user_id, NotificationType.NEW_DRIVE, message, driveId, student.email);
      count += 1;
    }
    return count;
  }

  // notifyStudent(studentId, type, message) : void
  notifyStudent(studentId, type, message, referenceId, email) {
    this.p.insertNotification({ recipient_id: studentId, type, message, reference_id: referenceId || null });
    this.deliverEmail(email || this.p.findUserById(studentId)?.email, type, message);
  }

  notifyApplicants(driveId, type, message) {
    let n = 0;
    for (const app of this.p.listApplicationsByDrive(driveId)) {
      this.notifyStudent(app.student_id, type, message, driveId, app.student_email);
      n += 1;
    }
    return n;
  }

  // FR-024: remind a student about open, eligible, not-yet-applied drives closing within 48 hours.
  generateDeadlineReminders(studentId) {
    const student = this.p.findStudent(studentId);
    if (!student) return 0;
    const now = Date.now();
    let n = 0;
    for (const drive of this.p.listOpenDrives()) {
      if (!drive.registration_deadline) continue;
      const hoursLeft = (new Date(drive.registration_deadline).getTime() - now) / 3600000;
      if (hoursLeft < 0 || hoursLeft > REMINDER_WINDOW_HOURS) continue;
      if (this.p.findApplicationByPair(studentId, drive.drive_id)) continue;
      if (!evaluate(this.p.findCriteria(drive.drive_id), student).eligible) continue;
      if (this.p.notificationExists(studentId, NotificationType.DEADLINE_REMINDER, drive.drive_id)) continue;
      this.notifyStudent(studentId, NotificationType.DEADLINE_REMINDER,
        `Reminder: registration for ${drive.job_title} at ${drive.company_name} closes ${fmtDate(drive.registration_deadline)}. You are eligible and have not applied yet.`,
        drive.drive_id, student.email);
      n += 1;
    }
    return n;
  }

  listForUser(userId) { return this.p.listNotifications(userId).map(notificationToDTO); }
  unreadCount(userId) { return this.p.countUnreadNotifications(userId); }
  markAsRead(userId, notificationId) { return this.p.markNotificationRead(userId, notificationId) > 0; }
  markAllAsRead(userId) { this.p.markAllNotificationsRead(userId); }

  // Optional external delivery (Email / SMTP Gateway). Simulated: logged to the server console.
  deliverEmail(to, type, message) {
    if (!to) return;
    const line = `[email -> ${to}] (${type}) ${message}`;
    this.emailLog.push({ to, type, message, at: new Date().toISOString() });
    if (this.emailLog.length > 500) this.emailLog.shift();
    if (process.env.PMS_QUIET !== '1') console.log(line);
  }
}

module.exports = { NotificationService };
