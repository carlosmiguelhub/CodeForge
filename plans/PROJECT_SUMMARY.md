# CodeForge (internal name: SQWeb) — Project Summary

*Generated 2026-09-10, for use as context when brainstorming future features (e.g. in Claude on the web).*

## What it is

CodeForge is a browser-based **personal practice suite** for SQL, general-purpose coding, and database ERD design. It started life as a classroom-management platform (classes, assignments, grading) but that scope was **deliberately abandoned** — Classes/Activities/Submissions/Grades were ripped out — in favor of a leaner practice tool: real SQL execution, a multi-language code compiler, and a diagramming tool, sitting behind Firebase auth with student/teacher/admin roles.

- **Live in production**: https://code-forge.online
- **Frontend**: Vercel (Next.js App Router, `apps/web`)
- **Backend**: self-hosted on an InterServer VPS (`162.35.102.39`), Docker Compose, nginx + TLS
- **Auth/identity**: Firebase Authentication (bearer ID tokens only — no App Check, removed after it broke real users)
- **Database**: real MySQL (not an emulator), isolated per-user workspace databases for the SQL tool

## Tech stack

- Next.js (App Router, Turbopack) + React 19 + TypeScript, npm workspaces monorepo
- Design system: Tailwind v4 + custom design tokens (`packages/design-system`), light/dark theming
- Monaco Editor (SQL + code editing), `@xyflow/react` (React Flow) for the ERD canvas
- Fastify-based satellite services for execution/sessions, MySQL via mysql2/Drizzle-style raw SQL
- Docker for sandboxed code/GUI execution; dockerode for orchestration
- PWA via `@serwist/turbopack` (installable, offline fallback, PWA-only bottom nav)

## User roles

- **Student** — uses the workspaces (SQL, Code, ERD, Saved Queries, Web, Java GUI)
- **Teacher** — same workspace access as students today; the teacher-specific dashboard is still a pre-pivot placeholder and intentionally not being built right now
- **Admin** — full platform administration (see below)

---

## Feature inventory

### 1. SQL Workbench
Real, bounded MySQL execution against an isolated per-user workspace database (provisioned/reset on demand by a dedicated provisioning worker). Includes:
- Parser-backed, default-deny SQL classifier/policy (adversarial security test corpus behind it)
- Query cancellation, execution history, live schema discovery
- Monaco-based SQL editor with theming
- **"Generate ERD"**: reverse-engineers a diagram straight from the live schema (auto-layout + orthogonal connector routing — went through several iteration rounds to get visually right; currently hand-rolled Sugiyama-style layered layout, with `elkjs` flagged as a stronger long-term alternative if it needs more work)

### 2. Code Workspace (compiler)
Multi-language code execution (Python, Java, C++, JavaScript, C):
- **Batch Run** — Judge0-backed (RapidAPI SaaS), pre-typed stdin, single request/response
- **Run Interactively** — a live, line-buffered stdin/stdout console (WebSocket + on-demand Docker container per run) for `input()`/`Scanner`-style programs that need to prompt and pause mid-execution. Deliberately not a full terminal/PTY — just a scrolling transcript + one input line.
- Concurrency-capped on the shared VPS (env-tunable, default 3 simultaneous interactive runs) to avoid OOMing the box

### 3. ERD Editor (freeform diagramming)
Built on React Flow: Entity/Rectangle/Diamond/Ellipse/Text shapes, a full notation palette (arrows, UML, crow's-foot) per edge end, click-driven perimeter-dot connections with axis-snapping and magnet-snapping, draggable bend points, custom entity columns, snap-to-grid, PDF export (`jspdf` + `html-to-image`, Philippine "Long" 8.5×13in page).

### 4. Java GUI Workspace
The most architecturally involved feature: students write Java Swing/AWT code and get an **actual interactive GUI window rendered in the browser** via VNC-in-browser (noVNC), not just console output.
- Fresh Docker container per Run (no persistent reuse), hard runtime cap, multi-file Java compilation with a designated entry point
- Locally: Docker-based container admin. Production target: Kubernetes (GKE Standard + gVisor sandbox) — **this Kubernetes/production path (Phase 5) and docs (Phase 6) were never built**
- **Currently locked/disabled in the live production deployment** — it's the single biggest infra cost/complexity driver (one held-open container per session vs. much lighter per-submission sandboxing elsewhere), and doesn't fit the $6/mo VPS budget. The code exists and works (verified end-to-end locally and in an earlier browser click-through); it's just switched off in prod via the existing per-section workspace-lock mechanism.
- Known unfixed bug: deleting a user account that has ever used this workspace fails on a DB foreign-key constraint (cascading delete doesn't clean up GUI-session tables yet).

### 5. Web Workspace
Multi-file HTML/CSS/JS editor with a sandboxed live preview. Shipped most recently (2026-09-07). Preview is an on-demand **full-screen "View result" overlay** (not an always-visible split pane — that was tried and explicitly rejected by the user as eating too much editor space), auto-updating live via debounced `DOMParser` assembly once opened.

### 6. Saved Queries
Persisted SQL query library per user.

### 7. Admin controls
- **Per-section workspace locking** — admins lock/unlock any of the 5 workspace kinds per class section; enforced server-side, not just hidden in the UI
- **User management** — cascading hard-delete (removes all owned workspace/execution data first), direct password-set (no email-reset-link requirement), section reassignment, section filtering
- **Auto-logout on suspend/deactivate** — near-real-time via polling + refresh-token revocation
- **Sections management** — archive/restore, live student counts, blocks archiving a section with active students
- **Admin Dashboard** — workspace usage stat tiles with 14-day sparklines
- **Database Infrastructure page** — MySQL workspace pool stats + Java GUI session stats, paginated tables
- **System Settings** — maintenance mode (site-wide lockout), "reset activity numbers" (clears only terminal-state execution/session history, never user-authored content)
- **Top Contributors leaderboard** — ranks students by a cross-workspace contribution score (SQL runs + code runs + ERD diagrams + saved queries + GUI sessions) plus a separate "successful works" count
- **Audit Logs** — full admin/account action trail
- Explicitly **not** built: Query Monitoring (deprioritized — redundant with existing execution + audit logs), Teacher Dashboard (still the old pre-pivot placeholder)

### 8. Identity / auth
- Firebase Authentication, email/password (Google sign-in code exists but is hidden — it bypassed the mandatory section-selection step for student registration)
- Email verification flow: sign in while unverified → redirected to a dedicated `/verify-email` page that **auto-polls and auto-redirects** once verified elsewhere (e.g. clicked on a phone), no manual click required
- App Check (reCAPTCHA Enterprise) was added, then **fully removed** after it silently broke registration/login/execution for real users behind ad blockers or privacy browsers — auth is bearer-ID-token-only today, deliberately, not a security shortfall

### 9. Theming
Manual light/dark toggle (default dark, no OS-preference auto-detection), token-driven via Tailwind v4 custom properties. Monaco and React Flow needed separate hand-wired theming since they don't participate in the CSS cascade.

### 10. PWA
Installable (manifest + service worker via `@serwist/turbopack`, since Turbopack doesn't support the webpack-based `next-pwa`/`@serwist/next`). Standalone/installed mode below the `lg:` breakpoint swaps the mobile hamburger nav for a native-app-style bottom tab bar. Execution-related API calls (`/v1/*`, execution/interactive-run/gui-execution endpoints) are deliberately never cached — only static assets and page navigations are. Shipped 2026-08-25.

### 11. Branding
User-facing product name is **"CodeForge"**; all internal identifiers (package names, DB name, env vars, Firebase project ID, repo folder) deliberately remain "sqweb" — a conscious choice to avoid a much larger, riskier rename with no user-facing benefit.

---

## Architecture shape (monorepo layout)

- `apps/web` — Next.js frontend (all workspaces, dashboards, auth pages)
- `apps/platform-api` — Firebase verification, account authorization, workspace/ERD/code/saved-query APIs, short-lived execution grants
- `apps/execution-api` — isolated SQL authorization, classification, execution, cancellation, schema/history
- `apps/provisioning-worker` — provisions/resets per-user MySQL workspace databases
- `apps/interactive-run-api` — live Docker-backed interactive stdin/stdout for Code Workspace
- `apps/gui-execution-api` / `apps/gui-provisioning-worker` — Java GUI Workspace's WebSocket console+VNC proxy and container lifecycle
- `packages/*` — shared auth, contracts, design-system tokens, SQL classifier, execution-grant signing, workspace/ERD/code-workspace/saved-query/gui-session persistence services, workspace-secrets, database-platform (schema/migrations/repositories)
- `infrastructure/vps` — production Docker Compose stack + deploy runbook

Recurring pattern across features: a signed, short-lived HMAC execution grant is the sole credential on execution/WebSocket routes (native `WebSocket` can't send custom headers); provisioning services generally mirror a claim/provision/compensate/cleanup pattern with `FOR UPDATE SKIP LOCKED` row-locking as a queue.

---

## Known open items / rough edges (useful seeds for "what's next")

- Java GUI Workspace: no Kubernetes/production container admin yet (stuck on local Docker only, hence locked in prod); no cascading-delete cleanup for GUI-session DB rows (FK constraint blocks deleting a student who used it)
- Interactive Code runs: no execution-history persistence, no admin visibility, no Ctrl+C/SIGINT support, orphan cleanup is a periodic sweep rather than a DB-backed reaper
- Teacher Dashboard: still the old pre-pivot placeholder, never rebuilt for the current scope
- Firebase's built-in verification/reset emails still use the generic default template — customizing them turned out to require a separate transactional email provider (none integrated), and the user explicitly parked this
- Query Monitoring was deliberately dropped as a feature (not just deferred)
- Hosting is a tight $6/mo VPS budget — MySQL buffer pool and Judge0 concurrency are hand-tuned to fit; this is a real constraint on how big any new "keep-a-container-alive" feature (like GUI Workspace) can get without a hosting-cost conversation first

---

*This file was generated from the assistant's project memory plus a live check of the current repo (routes, package.json, recent commits) — memory notes on the PWA and Web Workspace status were confirmed shipped, since the memory itself was written before they landed.*
