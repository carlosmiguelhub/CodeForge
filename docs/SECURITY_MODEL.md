# SQWeb Security Model

Status: Approved planning baseline  
Last updated: 2026-08-18

Implementation note: Milestone 4 verifies this isolation model against real local MySQL: generated accounts receive only database-scoped data/DDL grants and two concurrent connections; cross-workspace access and account-management commands are denied. Lifecycle responses omit database names, usernames, and secret references. Production configuration rejects the local secret adapter.

## 1. Security objectives

- Treat every SQL statement and uploaded artifact as untrusted.
- Prevent access across users, classes, institutions, and database security domains.
- Keep all MySQL credentials and infrastructure identifiers out of the browser.
- Contain a compromised workspace credential to one database.
- Prevent resource exhaustion from harming other learners.
- Preserve integrity and traceability of submissions, grades, policies, and administrative actions.
- Make recovery and cleanup testable.

## 2. Trust boundaries

1. Browser to public application/API boundary.
2. Platform API to platform database boundary.
3. Execution API to workspace database boundary.
4. Public execution service to private cancellation service boundary.
5. Queue to grading/provisioning workers boundary.
6. Application services to Secret Manager and object storage boundary.
7. Institution and class authorization boundaries inside platform metadata.

No service identity receives access to both the platform database and arbitrary workspace SQL unless an approved, narrowly scoped workflow requires metadata writes through the Platform API.

## 3. Authentication and session controls

- Firebase Authentication supports email/password and Google sign-in.
- Email verification is required before class enrollment.
- Teacher and Administrator accounts remain pending until approved.
- Every API validates token signature, issuer, audience, expiry, and UID.
- Sensitive operations check revocation and current account state.
- App Check is required for mutations, SQL execution/cancellation, uploads, exports, grading, and administration.
- Custom claims contain only institution ID, broad roles, and an authorization-version marker.
- Role changes force token refresh/revocation behavior.
- No client-provided role, enrollment, ownership, policy, or quota value is trusted.

## 4. Authorization model

Authorization evaluates, in order:

1. Authenticated and verified identity.
2. Active account and institution membership.
3. Broad role.
4. Resource institution match.
5. Class enrollment, class-teacher assignment, or administrative permission.
6. Resource state, schedule, attempt, and ownership rules.
7. Versioned global and activity policy.
8. Quota and rate availability.

Execution grants are signed, last at most 60 seconds, and bind UID, institution, workspace, activity, policy version, permissions, and nonce. They are not bearer authority by themselves: the Execution API also verifies the Firebase ID token, App Check token, and current authorization.

## 5. Workspace isolation

- The platform database is a separate Cloud SQL instance and preferably a separate production GCP project.
- Workspace MySQL uses a pool of separate Cloud SQL instances reachable only through private networking.
- Each workspace receives a generated database name and unique MySQL account.
- Workspace accounts receive database-level grants only.
- Global privileges are denied, including `FILE`, `PROCESS`, `SUPER`, `CREATE USER`, `GRANT OPTION`, replication, plugin, and tablespace privileges.
- Student accounts cannot access `mysql`, `sys`, `performance_schema`, `information_schema` beyond safe metadata behavior, or another workspace database.
- The client never submits a database name, hostname, port, username, or secret.
- `USE`, cross-schema references, account/server commands, and dynamic SQL mechanisms outside policy are denied by classification.
- Database privileges enforce the boundary even if classification fails.
- Credentials are stored per workspace in Secret Manager, rotated, briefly cached in process memory, and never logged.

## 6. SQL classification and execution controls

### Defense layers

1. Request schema and payload-size validation.
2. MySQL-aware lexer/parser and canonical statement classification.
3. Default-deny policy by statement and object class.
4. Cross-schema and dangerous-function inspection.
5. Server-side statement, row, byte, rate, and concurrency limits.
6. Application execution deadline and active cancellation.
7. Database-specific credentials and privileges.
8. Cloud SQL instance capacity controls and monitoring.

Regular expressions may assist token detection but are never the security mechanism.

### Default MVP policy

| SQL capability                                     | Default                        |
| -------------------------------------------------- | ------------------------------ |
| SELECT, INSERT, UPDATE, DELETE                     | Allowed in assigned workspace  |
| CREATE/ALTER/DROP table or index                   | Activity-configurable          |
| CREATE/DROP view                                   | Activity-configurable          |
| Transactions, COMMIT, ROLLBACK                     | Allowed                        |
| EXPLAIN                                            | Allowed and bounded            |
| Procedures, functions, triggers, events            | Denied in MVP                  |
| USE or cross-schema references                     | Denied                         |
| Account, role, grant, server, replication commands | Denied                         |
| FILE operations and server-side file paths         | Denied by parser and privilege |
| LOCK TABLES and explicit long locks                | Denied by default              |
| Dynamic/prepared SQL created inside SQL text       | Denied in MVP                  |

### Resource limits

- Interactive timeout: 10 seconds.
- Grading timeout: 30 seconds.
- Five statements, five result sets, 1,000 rows per result set, and 5 MB total output.
- Two running queries per user and ten starts per user per minute.
- Import limit: 25 MB.
- Workspace quota: 100 MB default, 250 MB hard maximum.
- Limits terminate retrieval and cancel the database query where execution continues.

## 7. Destructive-operation safeguards

- Destructive statements must be permitted by global and activity policy.
- The UI presents the parsed operation and affected object name.
- `DROP`, `TRUNCATE`, and broad destructive operations require explicit confirmation.
- Confirmation is short-lived and bound to the normalized statement hash.
- The server re-parses the submitted statement and does not trust the client classification.
- Production platform databases are not selectable targets.
- Workspace reset is a separate authorized API operation, never a special SQL command.
- Reset creates a replacement before removing the old allocation when practical.

## 8. Query cancellation

- Execution API records execution ID, authenticated actor, workspace, database connection ID, and deadline in an inaccessible control schema.
- The browser can cancel only using the opaque execution ID.
- Execution API validates ownership or teacher/admin scope.
- It invokes an IAM-protected cancellation service.
- Only the cancellation identity holds the narrow global privilege needed to stop a query.
- The service verifies the control record immediately before `KILL QUERY`.
- Completion/cancellation races are handled idempotently.

## 9. Hidden tests and grading security

- Hidden test definitions and expected data never appear in client APIs, HTML, source maps, logs, or exports.
- Storage objects use restricted service-only paths.
- Submission SQL executes in a disposable database under student-equivalent privileges.
- Tests execute under a separate grader identity.
- Safe feedback is stored separately from internal diagnostic detail.
- Every grading run pins activity, template, policy, grader, and comparison versions.
- Grading cleanup executes after success, failure, timeout, or retry.
- Regrade creates a new run; historical evidence is immutable.

## 10. Storage and upload security

- Buckets are private; public object access is disabled.
- Prefer API-issued, short-lived signed operations over broad client access.
- Paths use opaque IDs and server-derived ownership.
- Rules validate authentication, path, size, and content type.
- SQL/CSV imports are quarantined, size-limited, scanned where available, and parsed server-side.
- Exports expire after seven days.
- Download responses use safe content disposition and anti-sniffing headers.
- Firebase Storage Rules receive emulator and negative-path tests before deployment.

## 11. Web and API security

- Strict Content Security Policy compatible with Monaco workers.
- HSTS, secure transport, no mixed content, and secure cookie attributes where cookies are used.
- Narrow CORS allowlist; no credentialed wildcard origins.
- Output is rendered as text, never trusted HTML.
- SQL errors are sanitized and capped.
- CSRF protections apply to cookie-authenticated endpoints; bearer-token endpoints still verify origin and App Check.
- Request IDs and idempotency keys protect retries.
- Cloud Armor provides coarse IP/client throttling; application quotas key on authenticated UID and workspace.
- Dependency lockfiles, provenance review, automated vulnerability scanning, and container scanning are required.

## 12. Threat model

| Threat                           | Example                               | Primary controls                                                    |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| Identity spoofing                | Forged user/role                      | Firebase token verification, claims from trusted token, App Check   |
| Insecure direct object reference | Student supplies another workspace ID | Server lookup and signed grant bound to UID/workspace               |
| SQL privilege escalation         | GRANT or system schema access         | Parser default-deny and database-specific MySQL grants              |
| Parser bypass                    | Comments, encodings, compound SQL     | Dialect grammar, canonicalization, fuzz/corpus tests, DB privileges |
| Resource exhaustion              | Cartesian joins or huge results       | Time/row/byte/statement/concurrency/rate limits                     |
| Data exfiltration                | FILE or cross-schema read             | No FILE privilege, private network, unique account, schema checks   |
| Hidden-test disclosure           | Student requests test record          | Service-only storage and role-filtered DTOs                         |
| Grade tampering                  | Untracked score change                | Immutable versions, optimistic locking, audit events                |
| Repudiation                      | Teacher denies regrade                | Actor/reason/before-after audit trail                               |
| Credential leakage               | Secret logged or bundled              | Secret Manager, IAM, redaction, build scanning                      |
| Platform DB compromise           | Admin opens metadata in Workbench     | No Workbench route or execution identity to platform DB             |
| Stored XSS                       | SQL/error rendered as markup          | Escaping, text rendering, CSP                                       |
| Replay                           | Reused execution capability           | Short TTL, nonce, UID binding, App Check, idempotency               |
| Unsafe upload                    | Malicious or oversized import         | Quarantine, type/size checks, controlled parser/importer            |

## 13. Auditing

Audit events include actor, effective role, institution, action, target, timestamp, request ID, result, reason where required, and safe before/after references.

Mandatory events include:

- Account approval, suspension, reactivation, and role change.
- Enrollment/roster changes.
- Activity publication and policy change.
- Submission, reopen, regrade, grade override, and release.
- Destructive SQL confirmation and execution metadata.
- Workspace create/reset/suspend/delete.
- Query cancellation by another actor.
- Quota and global setting change.
- Export, backup/restore, maintenance mode, and break-glass access.

SQL text is not written to general logs. Query-history content follows its own authorization and retention policy.

## 14. Security verification gates

- Unit and fuzz tests for classification and policy.
- MySQL privilege inspection tests for every workspace-account template.
- Cross-user, cross-class, cross-institution, and platform/workspace isolation tests.
- Firebase Authentication and Storage Rules emulator tests.
- Cancellation race and timeout tests.
- Upload and result-output boundary tests.
- OWASP ASVS-oriented review.
- Static dependency, secret, image, and IaC scanning.
- Manual keyboard/accessibility checks for security dialogs.
- No unresolved critical or high security defects before pilot.

## 15. Incident and recovery controls

- Alert on unusual denials, timeouts, query rates, secret failures, capacity pressure, and administrator actions.
- Suspend account/workspace independently.
- Revoke Firebase sessions and rotate workspace credentials.
- Preserve security logs under restricted retention.
- Restore platform and workspace instances independently.
- Maintain an audited break-glass procedure.
- Conduct a monthly pilot restore exercise and post-incident review.
