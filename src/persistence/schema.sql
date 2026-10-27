-- Placement Management System - relational schema (Section 45.5, persistent data).
-- One table per persistent design class; Report is generated on demand and not stored.

CREATE TABLE IF NOT EXISTS users (
  user_id        TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash  TEXT NOT NULL,                       -- salted one-way hash (NFR-004)
  role           TEXT NOT NULL CHECK (role IN ('STUDENT','COMPANY','PLACEMENT_OFFICER','ADMINISTRATOR')),
  account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE','DEACTIVATED')),
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_profiles (
  student_id      TEXT PRIMARY KEY REFERENCES users(user_id),
  roll_number     TEXT NOT NULL UNIQUE,
  branch          TEXT NOT NULL,
  cgpa            REAL NOT NULL CHECK (cgpa BETWEEN 0 AND 10),
  active_backlogs INTEGER NOT NULL DEFAULT 0 CHECK (active_backlogs >= 0),
  resume_file_url TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  company_id      TEXT PRIMARY KEY,
  company_name    TEXT NOT NULL,
  industry        TEXT,
  contact_person  TEXT,
  contact_email   TEXT,
  account_user_id TEXT REFERENCES users(user_id),      -- optional company login (Section 45.1)
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS placement_drives (
  drive_id              TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(company_id),
  created_by            TEXT NOT NULL REFERENCES users(user_id),
  job_title             TEXT,
  job_description       TEXT,
  ctc_lpa               REAL,
  registration_deadline TEXT,
  status                TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','PUBLISHED','REGISTRATION_CLOSED','ONGOING_ROUNDS','COMPLETED','CANCELLED')),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drives_status_deadline ON placement_drives(status, registration_deadline);

CREATE TABLE IF NOT EXISTS eligibility_criteria (
  criteria_id  TEXT PRIMARY KEY,
  drive_id     TEXT NOT NULL UNIQUE REFERENCES placement_drives(drive_id) ON DELETE CASCADE,  -- composition 1:1
  min_cgpa     REAL CHECK (min_cgpa IS NULL OR min_cgpa BETWEEN 0 AND 10),
  max_backlogs INTEGER CHECK (max_backlogs IS NULL OR max_backlogs >= 0)
);

CREATE TABLE IF NOT EXISTS eligibility_branches (
  criteria_id TEXT NOT NULL REFERENCES eligibility_criteria(criteria_id) ON DELETE CASCADE,
  branch      TEXT NOT NULL,
  PRIMARY KEY (criteria_id, branch)                   -- stores Set<String> allowedBranches
);

CREATE TABLE IF NOT EXISTS rounds (
  round_id     TEXT PRIMARY KEY,
  drive_id     TEXT NOT NULL REFERENCES placement_drives(drive_id) ON DELETE CASCADE,  -- composition 1:1..*
  round_name   TEXT NOT NULL,
  round_order  INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED')),
  scheduled_at TEXT,
  UNIQUE (drive_id, round_order)
);

CREATE TABLE IF NOT EXISTS applications (
  application_id       TEXT PRIMARY KEY,
  student_id           TEXT NOT NULL REFERENCES student_profiles(student_id),
  drive_id             TEXT NOT NULL REFERENCES placement_drives(drive_id),
  application_date     TEXT NOT NULL,
  current_round_status TEXT NOT NULL DEFAULT 'APPLIED'
                       CHECK (current_round_status IN ('APPLIED','IN_SELECTION_ROUNDS','CLEARED_ALL_ROUNDS','OFFERED','REJECTED')),
  final_outcome        TEXT NOT NULL DEFAULT 'PENDING' CHECK (final_outcome IN ('PENDING','OFFERED','REJECTED')),
  UNIQUE (student_id, drive_id)                       -- BR-004 under concurrency
);

CREATE TABLE IF NOT EXISTS round_results (
  application_id TEXT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  round_id       TEXT NOT NULL REFERENCES rounds(round_id) ON DELETE CASCADE,
  result         TEXT NOT NULL DEFAULT 'PENDING' CHECK (result IN ('PENDING','QUALIFIED','NOT_QUALIFIED')),
  updated_at     TEXT NOT NULL,
  updated_by     TEXT REFERENCES users(user_id),
  PRIMARY KEY (application_id, round_id)
);

CREATE TABLE IF NOT EXISTS offers (
  offer_id       TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(application_id) ON DELETE CASCADE,  -- multiplicity 0..1
  ctc_lpa        REAL NOT NULL CHECK (ctc_lpa > 0),
  offer_date     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED','PUBLISHED')),
  recorded_by    TEXT NOT NULL REFERENCES users(user_id),
  recorded_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id TEXT PRIMARY KEY,
  recipient_id    TEXT NOT NULL REFERENCES users(user_id),
  type            TEXT NOT NULL,
  message         TEXT NOT NULL,
  reference_id    TEXT,                               -- drive / application the notice refers to
  timestamp       TEXT NOT NULL,
  read_status     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, read_status);

CREATE TABLE IF NOT EXISTS audit_logs (                 -- insert-only (NFR-013)
  log_id       TEXT PRIMARY KEY,
  action_type  TEXT NOT NULL,
  performed_by TEXT REFERENCES users(user_id),
  timestamp    TEXT NOT NULL,
  details      TEXT
);
