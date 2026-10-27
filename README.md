# Placement Management System (PMS) - Working Demo

**Course:** CS314 Software Development Laboratory, The LNM Institute of Information Technology, Jaipur
**Team T061:** Pankaj Sharma (24UCS103), Nikshay Joshi (24UCS104), Tejas Mishra (24UCS105), Manan Vaish (24UCS106)

This is a runnable implementation of the PMS specified in Lab Assignments 1-7 (SRS v1.0, use cases
UC-001..UC-014, the Assignment 6/7 design class model, layered architecture, interface design and
component specifications CS-1..CS-3). It is a web application with a REST/JSON API, a relational
(SQLite) database and role-based dashboards for Student, Company, Placement Officer and Administrator.

## 1. Run it

Requirements: **Node.js 22.13 or newer** (uses the built-in `node:sqlite`; no npm packages to install).

```bash
npm start
```

Open <http://localhost:3000>. The first start creates `data/pms.db` and seeds demo data with dates
relative to *today* (so there are always open, closed, ongoing and completed drives).

| Command | What it does |
| --- | --- |
| `npm start` | Start the server on port 3000 (`PORT=4000 npm start` to change). |
| `npm test` | Run the end-to-end API test suite (10 scenarios covering every use case and error code). |
| `npm run reset` | Rebuild the demo database from scratch (stop the server first). The Administrator can also do this from the UI. |

## 2. Demo accounts

All accounts are listed on the login screen with one-click login. Passwords (demo only):

| Role | E-mail | Password |
| --- | --- | --- |
| Administrator | admin@pms.lnmiit.ac.in | Admin@123 |
| Placement Officer | tpo@pms.lnmiit.ac.in | Officer@123 |
| Company (TechCorp recruiter) | recruiter@techcorp.com | Company@123 |
| Student (Ravi Kumar, 24UCS104, CSE, CGPA 8.4) | ravi.kumar@lnmiit.ac.in | Student@123 |
| Other students (Asha Verma, Neel Shah, Sneha Patel, Divya Nair, Priya Singh, Arjun Mehta, Karan Gupta, Isha Agarwal, Rohan Jain) | `<first>.<last>@lnmiit.ac.in` | Student@123 |

The seeded objects follow the figures in the assignments: `ravi : Student`, `techCorp : Company`,
`drive07 : PlacementDrive` (Software Engineer, 12 LPA, CGPA >= 7.5, CSE/IT, rounds Aptitude Test ->
Technical Interview -> HR Interview) and the candidates from wireframe S4.

## 3. Suggested demo script (viva walkthrough)

**Before you start:** log in as Administrator and press **Reset demo data** so all deadlines are
relative to today. Then log out.

1. **UC-001 Login (S0).** Type a wrong password: the message is the generic
   "Invalid e-mail or password." (FR-002). Then quick-login as *Student - Ravi Kumar*.
2. **UC-007 / UC-008 Ongoing Drives (S2).** The cards show the four states from Figure 19:
   *Eligible* (Cloud Engineer - CloudNine), *Not eligible: CGPA 8.40 is below the minimum 8.50*
   (Data Analyst - DataWorks), *Already applied* (QA Engineer - Testify) and *Registration closed*
   (Support Engineer - HelpDesk). Try the search box, the branch filter and the
   "Show only drives I am eligible for" switch (AC-01, AC-02).
3. **UC-009 Apply (S2/S3).** Press **Apply** on Cloud Engineer: the SUCCESS message M-07 appears and
   the card turns to *Applied*. Open its details and press Apply again: E-DUP (M-05). Open the
   closed HelpDesk drive: the button is disabled; the API returns E-REG-CLOSED (M-04).
4. **UC-010 My Applications.** Round-wise results for every application, the final outcome and the
   published offer (BR-005). Open **Alerts** to see the NEW_DRIVE / ROUND_UPDATE notifications.
5. Log out; quick-login as **Placement Officer**.
6. **UC-004 / UC-005 Create Drive (S1 / S1-E).** From Home, open the draft *Business Analyst -
   DataWorks* and press **Publish Drive**: banner M-01 "Cannot publish: 2 mandatory fields are
   missing", with the deadline and eligibility box outlined in red (Figure 18). Fill a future
   deadline and a minimum CGPA, publish again: "Drive published. N eligible students notified
   (FR-023)". Alternatively press **+ Create Drive** and walk through the form from scratch
   (Save as Draft keeps it hidden, FR-009).
7. **UC-011 Candidates (S4).** Drives -> *Software Engineer - TechCorp* -> **Candidates**. Change
   Asha Verma's *R3 HR Interview* to Qualified: "Result saved. Student notified (FR-025)" and her
   status becomes *Cleared All Rounds*. Try to set Divya Nair's R3 before R2: refused (rounds are
   sequential). Neel Shah is *Rejected* after R2 and his R3 cannot be set.
8. **UC-013 Record Offer (S5).** Press **Record Offer** for Ravi Kumar (enabled only because all
   three rounds are Qualified): offer recorded and published, student notified. Press **Replace
   Offer** for Sneha Patel (who already has 11.0 LPA): the "Confirm overwrite" dialog (M-09)
   appears; choose *Yes, replace*. Record Offer stays disabled for candidates who have not cleared
   every round (E-NOT-CLEARED / M-08 if forced through the API).
9. **Figure 11 lifecycle.** On the drives list: *Close registration* (Published -> Registration
   Closed), *Begin rounds* (-> Ongoing Rounds), *Complete* (only when every candidate has a
   declared outcome) and *Cancel* (applicants notified, FR-012). The HelpDesk drive shows
   "Registration Closed (deadline passed)" automatically from the server clock (BR-003).
10. **UC-014 Reports.** Drive-wise and branch-wise statistics; **Export CSV**.
11. **UC-003 Companies / Students.** Add a company; edit Ravi's CGPA to 8.6 and log in as Ravi
    again: Data Analyst is now *Eligible* (AC-03). The edit is in the audit log.
12. Log out; quick-login as **Company (TechCorp)**: own drives only, read-only candidate list with
    round results, resumes (NFR-012) and interview-schedule updates (Section 11.2).
13. Quick-login as **Administrator (UC-002)**: deactivate Neel Shah, log out and try to log in as
    him (generic failure), restore him; open **Audit Log** (NFR-013) to see every action from this
    demo in order.

## 4. Requirement coverage

| Area (SRS) | Implemented in |
| --- | --- |
| FR-001..FR-004 authentication, generic failure, logout, role-based access | `AuthService`, `AuthController`, permission table per role; the client never relies on hidden buttons alone (server re-checks every call) |
| FR-005..FR-012 companies, create/define/draft/edit/publish/close/cancel drives | `DriveService` (CS-1 `publishDrive` with `validateMandatoryFields`), `DriveController` |
| FR-013..FR-018 drive listing, eligibility filter, search, apply, duplicate prevention, confirmation | `ApplicationService.listEligibleDrives` / `applyForDrive` (CS-2: open -> duplicate -> eligibility -> atomic insert guarded by `UNIQUE(student_id, drive_id)`) |
| FR-019..FR-022 round tracking, candidate list, record offers, student status view | `SelectionOfferService` (CS-3: candidate-specific `hasClearedAllRounds`, overwrite confirmation, `upsertOffer`), `ApplicationService.getStatus` |
| FR-023..FR-025 notifications (new drive, deadline reminder, round/offer result) | `NotificationService`, sent only after the transaction commits; e-mail delivery simulated in the server log (D11) |
| FR-026..FR-027 reports and administrative dashboard | `ReportService` (drive-wise, branch-wise, CSV export), `AdminService.summary` |
| BR-001..BR-007 | Enforced in the domain/service layer and by database constraints (see `src/persistence/schema.sql`) |
| NFR-003/004 security | scrypt-salted password hashes, bearer session tokens, server-side authorization on every request |
| NFR-007/010 reliability under concurrency | one transaction per workflow (`IPersistence.transaction`), `INSERT OR IGNORE` + UNIQUE for applications, one offer per application |
| NFR-011 compatibility | plain HTML/CSS/JS, responsive layout |
| NFR-013 auditability | `AuditService` writes inside the same transaction as the change |
| Error-code catalogue (Section 47.5) | `src/domain/errors.js`; HTTP status + message per code, shown as M-01..M-11 in the client |

## 5. Code layout = the Assignment 6/7 architecture

```
server.js                      HTTP server entry point
src/app.js                     composition root (database -> persistence -> services -> controllers)
src/controllers/               Presentation / API layer: Auth, Drive, Application, Selection, Report,
                               Admin, Notification controllers + router and HTTP adapter (Figure 23 "PMS API Controllers")
src/services/                  Application service layer (Figure 15): AuthService, DriveService,
                               EligibilityService, ApplicationService, SelectionOfferService,
                               NotificationService, AuditService, ReportService (+ Admin, Student)
src/domain/                    Domain layer: enums (Figure 14 enumerations), error catalogue,
                               PlacementDrive / EligibilityCriteria / Application behaviour (Section 48.6)
src/persistence/               Data access layer: IPersistence (transactions, insertApplicationIfAbsent,
                               upsertOffer), schema.sql (Section 45.5 tables), demo seed
public/                        PMS Web Client: role-based dashboards and screens S0-S5 (Section 47)
test/api.test.js               End-to-end tests over the REST API
```

## 6. Additions beyond the SRS (for the demo)

These are not in the Assignment 2 requirements; they exist to make the demo smoother and are easy
to point out (or remove):

- **Quick-login panel** on the login screen listing the seeded demo accounts.
- **Reset demo data** (Administrator) and `npm run reset`: rebuilds the database with dates
  relative to today so the demo never goes stale.
- **Officer home dashboard** with counts and a "Needs attention" list (drafts to publish, closed
  registrations whose rounds have not begun, candidates who cleared all rounds and await an offer).
- **Student profile editing by the Officer** (Students page) to demonstrate AC-03 live.
- **"Not offered" declaration** for a candidate who cleared all rounds, so a drive can reach
  *Completed* when the company does not extend an offer (the SRS leaves this case open).
- **Sequential round enforcement**: a later round cannot be evaluated before the earlier one is
  Qualified; a non-qualified result clears later-round results.
- **Interview schedule editing by the Company** (Section 11.2 lists it as a company ability; the
  design added `Round.scheduledAt`).
- **CSV export** of reports (listed as a "Could Have" in Section 22).
- **Deadline reminders** are generated when a student opens the drive list / alerts (FR-024),
  since the demo has no background scheduler.

Out of scope and intentionally not implemented, as in Section 7: payments, AI resume screening,
video interviews, alumni, external job portals, a mobile app.

## 7. Notes

- Passwords are shown on the login page **only because this is a demo**; a real deployment would
  never expose them.
- Sessions are kept in memory; restarting the server logs everyone out.
- E-mail delivery (D11) is simulated: each notification is printed to the server console as
  `[email -> address] ...`.
