# SQWeb Product Requirements

Status: Approved planning baseline  
Product owner context: Teacher-led classroom platform  
Last updated: 2026-08-17

## 1. Product vision

SQWeb is a secure, browser-based MySQL classroom environment. Students practice SQL in isolated databases, teachers create and grade laboratory activities, and administrators operate the learning platform without exposing infrastructure credentials or the production platform database.

SQWeb is an educational application, not a general remote database-administration product.

## 2. Objectives and success measures

| Objective            | Initial target                                                                    |
| -------------------- | --------------------------------------------------------------------------------- |
| Workspace isolation  | 100% of automated cross-workspace access tests denied                             |
| Query safety         | 100% of prohibited-command corpus rejected                                        |
| Interactive overhead | p95 platform overhead below 2 seconds, excluding MySQL execution                  |
| Limit enforcement    | Timeout, row, byte, statement, rate, and concurrency limits enforced in all tests |
| Automatic grading    | 95% of normal grading jobs complete within 30 seconds                             |
| Pilot availability   | 99.5% monthly                                                                     |
| Accessibility        | WCAG 2.2 AA for every MVP workflow                                                |
| Security             | No unresolved critical or high findings before pilot                              |
| Teacher efficiency   | A basic activity can be created and published within 10 minutes                   |
| Recovery             | RPO at most 15 minutes and RTO at most 4 hours for pilot                          |
| Pilot cost           | Target below USD 300/month, subject to validation before provisioning             |

## 3. Product scope

### MVP

- MySQL 8.4 only.
- Platform-provisioned databases only; no external connections.
- Email/password and Google authentication.
- Student, Teacher, and Administrator roles.
- Teacher and administrator account approval.
- Verified student email and invitation-code class joining.
- Single-institution pilot with institution boundaries in the data model.
- Dark operational interface.
- In-app and email notifications.
- Desktop-first Workbench with responsive supporting workflows.

### Explicit non-goals

- General-purpose remote database administration.
- External or production-business database connectivity.
- PostgreSQL, SQL Server, SQLite, Oracle, or multi-engine support.
- Server, account, replication, plugin, or tablespace administration.
- Arbitrary SQL access to SQWeb's platform metadata database.
- Full mobile parity for wide grids, schema design, or data editing.
- LMS/SIS integration, public community datasets, collaborative editing, or AI grading in MVP.
- A public marketing site in MVP.

## 4. Baseline scale and limits

| Item                        | Approved baseline              |
| --------------------------- | ------------------------------ |
| Registered users            | 500                            |
| Peak concurrent users       | 100                            |
| Concurrent SQL executions   | 25 platform-wide pilot ceiling |
| Class size                  | Up to 60 students              |
| Default workspace quota     | 100 MB                         |
| Hard workspace maximum      | 250 MB                         |
| Import size                 | 25 MB                          |
| Interactive timeout         | 10 seconds                     |
| Grading timeout             | 30 seconds                     |
| Statements per request      | 5                              |
| Rows per result set         | 1,000                          |
| Result sets per request     | 5                              |
| Total result payload        | 5 MB                           |
| Running queries per user    | 2                              |
| Execution rate              | 10 per user per minute         |
| Practice attempts           | Unlimited                      |
| Default assignment attempts | 3; teacher-configurable        |

These values are policy ceilings, enforced on the server. Lower per-activity limits may be configured.

## 5. Roles and permissions

| Capability                        | Student |                               Teacher |           Administrator |
| --------------------------------- | ------: | ------------------------------------: | ----------------------: |
| Join a class                      |     Yes |                                    No |                  Assist |
| Use own workspace                 |     Yes |                                   Yes |        No arbitrary SQL |
| Access another student's database |   Never | Controlled reset/review workflow only | Never through Workbench |
| Create and publish activities     |      No |                           Own classes |    Emergency management |
| Submit work                       |     Own |                                    No |                      No |
| View grades                       |     Own |                      Assigned classes |      Authorized reports |
| Grade, reopen, regrade            |      No |                      Assigned classes |       Policy-controlled |
| Manage roster                     |      No |                           Own classes |             All classes |
| Create database templates         |      No |                                   Yes |          Approve/manage |
| Change SQL policy                 |      No |    Per activity within global ceiling |          Global ceiling |
| Cancel queries                    |     Own |          Students in assigned classes |     Any workspace query |
| Read hidden tests                 |   Never |          Author/authorized co-teacher |     Security-controlled |
| Manage infrastructure             |      No |                                    No |                     Yes |
| Execute SQL against platform DB   |   Never |                                 Never |     Never through SQWeb |

Broad roles are carried in Firebase custom claims. Enrollment, ownership, account state, and detailed permissions come from authoritative server-side records.

## 6. Feature priorities

| Area          | MVP                                                                                 | Post-MVP                                          | Advanced/Optional                    | Out of scope                                |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------ | ------------------------------------------- |
| Editor        | Tabs, highlighting, basic completion, run selected/current/script, autosaved drafts | Formatter, richer completion, restored sessions   | Review annotations                   | Real-time co-editing                        |
| Results       | Multiple sets, virtualized grid, timing, affected rows, warnings/errors, copy       | Persisted column sizes, advanced filters          | Result comparison workspace          | Unlimited result delivery                   |
| History       | Personal history, rerun, saved queries                                              | Tags, folders, shared snippets                    | History analytics                    | Permanent unrestricted history              |
| Schema        | Tables, columns, keys, indexes, views, structure viewer                             | Object dialogs and data editor                    | Procedures/functions/triggers/events | Server/account administration               |
| SQL           | DML, scoped DDL, transactions, EXPLAIN, reset                                       | SQL/CSV import and CSV/JSON/SQL export            | Visual execution plan                | FILE, account, replication, server commands |
| Student       | Classes, activities, deadlines, tests, submissions, grades, feedback, progress      | Practice library                                  | Learning paths                       | Public social profile                       |
| Teacher       | Classes, invitations, templates, activities, tests, grading, gradebook, CSV export  | Duplication, scheduling, richer analytics         | Rubric/question libraries            | Production DB editing                       |
| Administrator | Users, approval, academics, quotas, policies, audits, health, cleanup               | Cost reports, announcements, retention automation | Multi-institution administration     | Platform DB Workbench                       |
| Notifications | In-app and email                                                                    | Digests and preference controls                   | Teams/Slack/SMS                      | Marketing automation                        |
| Marketing     | None                                                                                | Small public product page                         | Documentation site                   | Copying Romer composition/content           |

Student procedures, functions, triggers, and events are disabled in MVP. Views and table/index DDL may be enabled per activity. Transactions are supported.

## 7. Student workflow

1. Register, verify email, and join a class with an invitation code.
2. Open an activity and review its instructions, schedule, attempt limit, and allowed commands.
3. Receive a server-provisioned isolated workspace.
4. Edit SQL with autosaved drafts.
5. Run selected, current, or complete SQL.
6. Review bounded results, messages, statistics, and visible tests.
7. Submit an immutable SQL snapshot.
8. Automatic grading runs in a fresh disposable grading database.
9. Review released grade and feedback, then resubmit if permitted.

## 8. Teacher workflow

1. Create a class and invitation code.
2. Select or author a versioned schema template and seed dataset.
3. Define activity instructions, starter SQL, points, SQL policy, visible/hidden tests, schedule, and attempts.
4. Preview the activity as a student in a disposable workspace.
5. Publish an immutable version.
6. Monitor completion and categorized SQL errors.
7. Review automatic results, award manual points, and write feedback.
8. Reopen or regrade with a required reason.
9. Release grades and export the gradebook.

## 9. Administrator workflow

1. Approve teacher and administrator accounts.
2. Manage academic structure, users, quotas, and global SQL-policy ceilings.
3. Monitor query state and infrastructure capacity without opening student databases.
4. Cancel abusive queries.
5. Review audit and security events.
6. operate cleanup, backup verification, reporting, and maintenance mode.

## 10. Grading rules

- Visible and hidden tests are supported.
- Hidden definitions and internal failures never reach the browser.
- Each grading run uses a fresh database created from the activity's pinned template version.
- The submission runs under student-equivalent privileges; tests run under a separate grader account.
- Comparison may evaluate result sets, schema state, or modified data state.
- Default result comparison is row-order-insensitive unless order is part of the task.
- Duplicate rows remain significant.
- NULL comparison is strict.
- DECIMAL comparison is exact; floating-point tolerance defaults to `1e-6` and is configurable.
- Template collation controls text case behavior; grading runs in UTC.
- Late submissions are accepted until the close time, labeled late, and carry no automatic penalty unless configured.
- Manual override, partial credit, release, reopening, and regrading require audit events.

## 11. Retention baseline

| Data                   | Retention                             |
| ---------------------- | ------------------------------------- |
| Query history          | 90 days                               |
| Temporary exports      | 7 days                                |
| Audit events           | 1 year                                |
| Submissions and grades | 5 years, pending institutional policy |
| Class workspace        | Class duration plus 90 days           |
| Operational backups    | 14 days plus point-in-time recovery   |

The school privacy officer must approve retention and deletion behavior before production. The planning baseline follows Philippine Data Privacy Act principles but is not a legal determination.

## 12. Remaining production decisions

- Legal institution name and verified domains.
- Production domain and branding.
- Billing account and hard monthly budget.
- Privacy-officer-approved retention schedule.
- Transactional email provider.
- Whether pilot high availability is affordable.
- Terms of service, privacy notice, acceptable-use policy, and support process.
