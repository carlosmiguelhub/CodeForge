# SQWeb UI Route Map

Status: Approved planning baseline  
Last updated: 2026-08-17

## 1. Route principles

- Routes are role-aware, but permissions are enforced by APIs.
- Unauthorized resources return a safe not-found/denied experience without leaking existence.
- Activities and assignments share one domain model; `type` and policy distinguish them.
- Route loaders render explicit loading, empty, error, offline, and permission states.
- Workspace IDs are opaque and never imply database names.

## 2. Public and shared routes

| Route               | Purpose                                     | Access                   |
| ------------------- | ------------------------------------------- | ------------------------ |
| `/login`            | Email/password and Google sign-in           | Public                   |
| `/register`         | Create Student or Teacher candidate account | Public                   |
| `/verify-email`     | Verification guidance                       | Authenticated unverified |
| `/pending-approval` | Account approval state                      | Pending teacher/admin    |
| `/join/[code]`      | Validate invitation and join class          | Verified student         |
| `/profile`          | Personal profile and preferences            | Authenticated            |
| `/notifications`    | Notification center                         | Authenticated            |
| `/help`             | Product and keyboard help                   | Authenticated            |
| `/forbidden`        | Safe permission explanation                 | Authenticated            |
| `/maintenance`      | Service maintenance state                   | Any affected user        |

No public marketing route is required for MVP.

## 3. Student routes

| Route                                 | Primary content/actions                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `/student`                            | Dashboard, due work, workspace state, recent queries/grades, continue action |
| `/student/workspaces`                 | Authorized personal/activity workspaces                                      |
| `/student/workspace/[workspaceId]`    | SQL Workbench                                                                |
| `/student/classes`                    | Current/archived classes and join action                                     |
| `/student/classes/[classId]`          | Class overview and activity list                                             |
| `/student/activities`                 | Filtered activity queue                                                      |
| `/student/activities/[activityId]`    | Instructions, schedule, attempts, tests, workspace entry                     |
| `/student/submissions`                | Submission history and states                                                |
| `/student/submissions/[submissionId]` | Attempts, grading state, released feedback                                   |
| `/student/grades`                     | Released grades and progress                                                 |
| `/student/saved-queries`              | Saved query library                                                          |

## 4. Teacher routes

| Route                                      | Primary content/actions                                             |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `/teacher`                                 | Dashboard, classes, grading queue, learner attention, common errors |
| `/teacher/workspaces`                      | Teacher personal workspace lifecycle                                |
| `/teacher/classes`                         | Class list and creation                                             |
| `/teacher/classes/[classId]`               | Overview, activities, roster, gradebook, analytics tabs             |
| `/teacher/classes/[classId]/roster`        | Invitation and enrollment management                                |
| `/teacher/activities`                      | Activity library                                                    |
| `/teacher/activities/new`                  | Activity creation flow                                              |
| `/teacher/activities/[activityId]/edit`    | Versioned builder, policy, tests, schedule                          |
| `/teacher/activities/[activityId]/preview` | Disposable student preview                                          |
| `/teacher/grading`                         | Cross-class grading queue                                           |
| `/teacher/grading/[submissionId]`          | Submission, tests, rubric, feedback, grade actions                  |
| `/teacher/templates`                       | Template library                                                    |
| `/teacher/templates/[templateId]`          | Versioning, schema/seed artifacts, validation                       |
| `/teacher/students`                        | Authorized student overview                                         |
| `/teacher/analytics`                       | Class/activity outcome summaries                                    |

## 5. Administrator routes

| Route                   | Primary content/actions                                  |
| ----------------------- | -------------------------------------------------------- |
| `/admin`                | Service, usage, security, capacity, and action dashboard |
| `/admin/users`          | Account approval, status, roles                          |
| `/admin/users/[userId]` | Scoped profile, memberships, audit history               |
| `/admin/academics`      | Departments, programs, courses, terms                    |
| `/admin/classes`        | System-wide class management                             |
| `/admin/infrastructure` | Workspace pools, storage, health, backup summaries       |
| `/admin/query-monitor`  | Running/queued/failed query metadata and cancellation    |
| `/admin/audit-logs`     | Filtered audit events                                    |
| `/admin/reports`        | Usage, grade, security, storage, and cost exports        |
| `/admin/announcements`  | Institution announcements                                |
| `/admin/settings`       | Global policies, quotas, retention, maintenance          |

No administrator route can open the platform metadata database in the SQL Workbench.

## 6. Workbench route contract

`/student/workspace/[workspaceId]` and any approved teacher practice equivalent render the same shared Workbench shell.

Query parameters may select UI state such as a tab or activity context, but never database identity, credential, role, enrollment, or SQL policy. The API resolves all authority.

Workbench regions:

1. Application/workspace header.
2. Schema/object explorer.
3. Editor tab bar and SQL toolbar.
4. Monaco SQL editor.
5. Results/messages/statistics/history tabs.
6. Optional activity/test context panel.

## 7. Navigation by role

### Student

Dashboard, SQL Workspace, Classes, Activities, Submissions, Grades, Saved Queries, Notifications.

### Teacher

Dashboard, Classes, Activities, Grading, Database Templates, Students, Analytics, Notifications.

### Administrator

Dashboard, Users, Academics, Classes, Database Infrastructure, Query Monitoring, Audit Logs, Reports, System Settings.

## 8. Route guards and recovery

- Unauthenticated users return to the intended route after sign-in only when still authorized.
- Unverified users are directed to verification.
- Pending/suspended users receive a specific state screen.
- Stale role claims cause token refresh and a safe retry.
- Removed enrollments immediately prevent new grants and submissions.
- Unsaved editor drafts remain locally recoverable when navigation is interrupted.
- Maintenance mode preserves read-only access only where policy explicitly permits it.
