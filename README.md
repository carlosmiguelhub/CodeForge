# SQWeb

SQWeb is a secure, browser-based MySQL classroom workbench under milestone-based development.

The repository has completed **Milestone 1: Foundation**, **Milestone 2: Identity and Authorization**, and **Milestone 3: Classroom Core**. It contains shared contracts, design tokens, a responsive role-aware application, Firebase client/Admin adapters, server-side account policy, academic hierarchy, Teacher-owned classes, invitations, enrollment, rosters, audit behavior, platform persistence definitions, and quality gates. No Cloud SQL instance or other cloud resource is provisioned automatically. Workspace provisioning and SQL execution remain out of scope.

## Local commands

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run verify
```

## Workspace layout

- `apps/web`: Next.js identity and classroom application.
- `apps/platform-api`: Firebase token/App Check verification, account authorization, and classroom API.
- `packages/auth`: identity, account-state, and role-policy services.
- `packages/classroom`: academic, class, invitation, and enrollment policy services.
- `packages/contracts`: shared role, permission, API, execution, and audit contracts.
- `packages/design-system`: approved semantic design tokens.
- `packages/sql-classifier`: classifier interfaces and adversarial security corpus only.
- `packages/database-platform`: identity and classroom platform schema and migration boundary.
- `infrastructure`: documentation-only Terraform/environment skeleton.
- `docs`: approved product and architecture artifacts.

Implementation scope and gates are defined in `docs/IMPLEMENTATION_ROADMAP.md`.
The complete local startup workflow is documented in `docs/LOCAL_DEVELOPMENT.md`.
