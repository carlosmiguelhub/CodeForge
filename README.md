# SQWeb

SQWeb is a secure, browser-based MySQL classroom workbench under milestone-based development.

The repository has implemented Milestones 1-5 through the secure SQL Workbench. It includes the role-aware classroom application, Firebase identity boundary, classroom core, isolated workspace provisioning, a separate SQL Execution API, parser-backed policy, bounded real-MySQL execution, cancellation, schema discovery, history, and the Monaco workbench. No Cloud SQL instance or other cloud resource is provisioned automatically.

## Local commands

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run verify
```

## Workspace layout

- `apps/web`: Next.js identity, classroom, workspace, and Monaco Workbench application.
- `apps/platform-api`: Firebase verification, account authorization, classroom API, and short-lived execution grants.
- `apps/execution-api`: isolated SQL authorization, classification, execution, limits, cancellation, schema, and history API.
- `packages/auth`: identity, account-state, and role-policy services.
- `packages/classroom`: academic, class, invitation, and enrollment policy services.
- `packages/contracts`: shared role, permission, API, execution, and audit contracts.
- `packages/design-system`: approved semantic design tokens.
- `packages/sql-classifier`: parser-backed default-deny classifier and adversarial security corpus.
- `packages/execution`: signed execution capabilities, confirmation tokens, and repository contracts.
- `packages/workspace-secrets`: production Secret Manager and development-only local credential adapters.
- `packages/database-platform`: platform metadata schema, migrations, and bounded execution metadata repository.
- `infrastructure`: documentation-only Terraform/environment skeleton.
- `docs`: approved product and architecture artifacts.

Implementation scope and gates are defined in `docs/IMPLEMENTATION_ROADMAP.md`.
The complete local startup workflow is documented in `docs/LOCAL_DEVELOPMENT.md`.
