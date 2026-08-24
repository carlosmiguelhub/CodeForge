# SQWeb

SQWeb is a secure, browser-based practice suite for SQL, code, and ERD design, with Firebase-backed identity and student/teacher/administrator roles.

It includes a Firebase identity boundary, isolated MySQL workspace provisioning, a separate SQL Execution API, parser-backed policy, bounded real-MySQL execution, cancellation, schema discovery and history, the Monaco SQL workbench, a Judge0-backed code compiler workspace, an ERD editor (including reverse-engineering a diagram from a live schema), and saved queries. No Cloud SQL instance or other cloud resource is provisioned automatically.

## Local commands

See `RUN.md` for the full local startup workflow (Docker database, platform API, execution API, provisioning worker, and the Next.js app).

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run verify
```

## Workspace layout

- `apps/web`: Next.js identity, SQL/code/ERD workbench, and dashboard application.
- `apps/platform-api`: Firebase verification, account authorization, workspace/ERD/code-workspace/saved-query APIs, and short-lived execution grants.
- `apps/execution-api`: isolated SQL authorization, classification, execution, limits, cancellation, schema, and history API.
- `apps/provisioning-worker`: provisions and resets isolated per-user MySQL workspaces.
- `packages/auth`: identity, account-state, and role-policy services.
- `packages/contracts`: shared role, permission, API, execution, and audit contracts.
- `packages/design-system`: approved semantic design tokens.
- `packages/sql-classifier`: parser-backed default-deny classifier and adversarial security corpus.
- `packages/execution`: signed execution capabilities, confirmation tokens, and repository contracts.
- `packages/workspace`: personal SQL workspace request/reset service.
- `packages/erd`: ERD diagram persistence service.
- `packages/code-workspace`: code compiler workspace persistence service.
- `packages/saved-queries`: saved SQL query persistence service.
- `packages/workspace-secrets`: production Secret Manager and development-only local credential adapters.
- `packages/database-platform`: platform metadata schema, migrations, and repositories.
- `infrastructure`: documentation-only Terraform/environment skeleton.
