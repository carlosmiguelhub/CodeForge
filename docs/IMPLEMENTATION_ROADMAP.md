# SQWeb Implementation Roadmap

Status: Milestones 1–5 implemented and locally verified; production hardening remains pending
Last updated: 2026-08-18

## 1. Delivery policy

- Work one explicitly approved milestone at a time.
- Planning approval does not authorize application implementation or cloud provisioning.
- Inspect existing files before editing and preserve unrelated changes.
- Use TypeScript/TSX and Tailwind unless a later approved decision changes them.
- Never hardcode secrets or trust client-side authorization.
- Update architecture and decision records whenever behavior changes.

## 2. Milestones in dependency order

| Phase                            | Scope                                                                                        | Exclusions                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1. Foundation                    | Monorepo, CI, contracts, design tokens, nonfunctional shell, test harness, IaC skeleton      | Authentication workflows, MySQL connectivity, cloud provisioning |
| 2. Identity and authorization    | Firebase Auth integration, account states, approvals, role routing, server policy middleware | Classes and SQL execution                                        |
| 3. Classroom core                | Academic hierarchy, classes, invitations, enrollment, roster                                 | Workspaces and grading                                           |
| 4. Workspace provisioning        | Templates, private database/account lifecycle, reset, cleanup, secret rotation               | Interactive editor execution                                     |
| 5. SQL Workbench                 | Editor, explorer, execution, results, history, transactions, EXPLAIN, cancellation           | Import/export and advanced objects                               |
| 6. Activities and submissions    | Versioned builder, starter SQL, policies, drafts, attempts, deadlines, immutable submissions | Automatic grading                                                |
| 7. Grading and gradebook         | Visible/hidden tests, comparison, automatic/manual grading, feedback, release, exports       | Advanced analytics                                               |
| 8. Administration and operations | Users, academics, policies, quotas, query monitor, audits, cleanup, reports, maintenance     | Multi-institution operations                                     |
| 9. Hardening and pilot           | Load, security, privacy, accessibility, visual, backup/restore, incident readiness           | General availability expansion                                   |

## 3. Acceptance criteria and phase Definition of Done

| Phase | Acceptance criteria                                                                                               | Phase-specific Definition of Done                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1     | Reproducible install/build; lint/type/test/build gates; shared contracts; responsive shell; focus baseline        | CI green; architecture/package boundaries reviewed; no feature or DB behavior added    |
| 2     | Wrong role, stale claim, suspended account, and unauthorized institution requests denied server-side              | Auth emulator/integration tests pass; token revocation and audit behavior documented   |
| 3     | Teacher ownership and student enrollment boundaries enforced; invitation expiry/revocation works                  | Migrations, APIs, audit events, and role E2E tests complete                            |
| 4     | Per-workspace database/account created privately; cross-workspace and platform access denied; reset reproducible  | Privilege inspection, isolation, idempotency, cleanup, and failure recovery tests pass |
| 5     | Selected/current/script execution, bounded multi-results, timeout and cancellation work; wide data remains usable | SQL corpus, load, accessibility, responsive, and cancellation-race tests pass          |
| 6     | Published versions immutable; attempts, deadline, drafts, and submission snapshots reproducible                   | Student/teacher E2E, concurrency, schedule, and audit tests pass                       |
| 7     | Hidden tests never exposed; deterministic fresh-state grading; manual changes audited                             | Comparison corpus, worker retry/cleanup, grade release and regrade tests pass          |
| 8     | Administrator can manage and monitor without opening platform DB in Workbench                                     | Admin permission, audit integrity, cleanup, export, and maintenance tests pass         |
| 9     | Performance/recovery objectives met; no unresolved critical/high security findings; WCAG AA gate met              | Release checklist signed; production rollback and restore exercised                    |

## 4. Common Definition of Done

Every phase requires:

- Acceptance criteria traced to automated or documented manual tests.
- Peer review completed.
- Formatter, lint, type checking, unit/integration tests, and production builds pass.
- Positive and negative authorization tests.
- Accessibility and responsive testing for changed UI.
- Monitoring, safe logging, and audit behavior included.
- Database migrations and rollback/forward-recovery path tested where applicable.
- Documentation and decision log updated.
- No secrets or unrelated user changes.
- Deployment and rollback steps verified in the relevant environment.

## 5. Testing strategy

### Automated

- Unit tests for permissions, policy merging, grading comparison, and SQL classification.
- Property/fuzz tests for quoting, comments, Unicode, delimiters, nested/compound statements, and parser failure.
- Integration tests against real MySQL for privileges, transactions, timeout, reset, and grading.
- Contract tests across web, APIs, workers, and stream events.
- Firebase Authentication and Storage Rules emulator tests.
- End-to-end tests for critical Student, Teacher, and Administrator workflows.
- Load tests for classroom execution and grading spikes.
- Dependency, secret, container, and infrastructure scanning.

### Visual and accessibility

- Playwright screenshots for wide desktop, laptop, tablet, and mobile.
- Approved visual baselines for all roles and major Workbench states.
- axe-core plus manual keyboard, screen-reader, 200% zoom, contrast, and reduced-motion checks.
- Large-column, long-SQL, error, empty, loading, and permission-denied fixtures.

### Resilience

- Query timeout and cancellation races.
- Cloud SQL disconnect/restart.
- Queue retry and duplicate delivery.
- Partial provisioning/import cleanup.
- Backup restoration and application rollback.

## 6. CI/CD plan

1. Format, lint, and type-check.
2. Unit and security-policy corpus.
3. Integration and Firebase Rules tests.
4. Build every application/package.
5. Dependency, secret, container, and IaC scans.
6. Preview deployment.
7. Playwright accessibility and visual tests.
8. Staging migration with recovery validation.
9. Manual production approval.
10. Progressive deployment, health checks, and rollback readiness.

## 7. Environments

| Environment | Purpose                          | Data/resource policy                                         |
| ----------- | -------------------------------- | ------------------------------------------------------------ |
| Local       | Daily development and fast tests | Emulators, containerized MySQL, synthetic fixtures           |
| Development | Shared integration               | Nonproduction identities and synthetic data                  |
| Staging     | Production-like validation       | Isolated project, production topology, no production data    |
| Production  | Pilot/real use                   | Separate security domains, controlled access, backups, audit |

## 8. Monitoring and release gates

Dashboards and alerts cover:

- API latency, availability, and error rate.
- Running/queued/success/failed/timed-out/cancelled queries.
- MySQL connection and storage saturation.
- Result-limit events and rate denials.
- Grading/provisioning queue delay and cleanup failure.
- Authentication/authorization denial anomalies.
- Backup health and restore verification.
- Cloud cost and budget thresholds.

## 9. Backup and recovery plan

- Automated Cloud SQL backups and point-in-time recovery.
- Daily backup status verification.
- Monthly restore rehearsal during pilot, quarterly after stabilization.
- Platform and workspace instances restored independently.
- Versioned template/submission artifacts and object lifecycle rules.
- RPO at most 15 minutes and RTO at most 4 hours for pilot.
- Documented incident roles, communication, evidence preservation, and post-incident review.

## 10. Major risks and mitigations

| Risk                             | Mitigation                                                          |
| -------------------------------- | ------------------------------------------------------------------- |
| SQL parser bypass                | Default-deny grammar, fuzz/corpus tests, MySQL privilege boundary   |
| Shared-instance exhaustion       | Deadlines, cancellation, quotas, bounded pools, capacity monitoring |
| Hidden-test leakage              | Server-only storage and separate grader identity                    |
| Grading nondeterminism           | Fresh DB, UTC, pinned MySQL/template/policy/comparator versions     |
| Per-workspace credential scale   | Automated lifecycle, short cache, rotation and cleanup              |
| Cloud SQL fixed cost             | Pilot sizing, nonproduction shutdown, budgets, capacity review      |
| Teacher configuration complexity | Safe templates, preview-as-student, progressive disclosure          |
| Privacy mismatch                 | Institutional/legal approval before production                      |
| Mobile editor limitations        | Explicit focused alternatives and desktop-first contract            |

## 11. Cost drivers

1. Platform and workspace Cloud SQL instances.
2. High availability, backup, and PITR storage.
3. Workspace storage growth.
4. Cloud Run execution duration and concurrency.
5. Load balancer and Cloud Armor.
6. Secret Manager operations.
7. Log retention and export.
8. Object storage/egress and transactional email.
9. Staging environment parity.

## 12. Recommended next implementation task

After separate implementation approval, begin only Phase 6: Activities and Submissions.

- Add versioned activities with starter SQL, datasets, allowed-command policy, scheduling, drafts, attempts, deadlines, and immutable submission snapshots.
- Keep automatic grading and hidden-test execution outside Phase 6 until Milestone 7 is separately approved.

Milestone 5 delivered short-lived execution grants, parser-backed classification, metadata-only history, a separate Execution API, real bounded MySQL execution, cancellation, destructive confirmation, schema discovery, Monaco editing, multiple result sets, responsive schema access, and accessible keyboard-resizable panels. Persistent manual sessions, import/export, visual plans, saved-query persistence, and advanced object management remain post-MVP work.
