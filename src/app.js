'use strict';
// Composition root: database -> IPersistence -> services -> controllers (Figure 16 layers).
const path = require('node:path');
const { openDatabase } = require('./persistence/database');
const { Persistence } = require('./persistence/persistence');
const { seedDemoData, isSeeded } = require('./persistence/seed');
const { AuthService } = require('./services/authService');
const { AuditService } = require('./services/auditService');
const { NotificationService } = require('./services/notificationService');
const { EligibilityService } = require('./services/eligibilityService');
const { DriveService } = require('./services/driveService');
const { ApplicationService } = require('./services/applicationService');
const { SelectionOfferService } = require('./services/selectionOfferService');
const { ReportService } = require('./services/reportService');
const { AdminService } = require('./services/adminService');
const { StudentService } = require('./services/studentService');
const { buildRouter } = require('./controllers');
const { createHttpHandler } = require('./controllers/http');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'pms.db');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function buildServices(persistence) {
  const audit = new AuditService(persistence);
  const auth = new AuthService(persistence);
  const notifications = new NotificationService(persistence);
  const eligibility = new EligibilityService(persistence);
  const drives = new DriveService(persistence, notifications, audit);
  const applications = new ApplicationService(persistence, drives, eligibility, notifications);
  const selection = new SelectionOfferService(persistence, applications, notifications, audit);
  const reports = new ReportService(persistence);
  const admin = new AdminService(persistence, auth, audit);
  const students = new StudentService(persistence, audit);
  return { audit, auth, notifications, eligibility, drives, applications, selection, reports, admin, students };
}

function createApp({ dbFile = DEFAULT_DB, log = true, seed = true } = {}) {
  const db = openDatabase(dbFile);
  const persistence = new Persistence(db);
  if (seed && !isSeeded(persistence)) {
    seedDemoData(persistence);
    if (log) console.log('Demo data seeded (dates relative to today).');
  }
  const services = buildServices(persistence);
  const router = buildRouter(services);
  return { handle: createHttpHandler(router, PUBLIC_DIR, { log }), services, persistence, db };
}

module.exports = { createApp, buildServices, DEFAULT_DB };
