# Classroom feature — status & remaining work (handoff)

Written by Claude Code, 2026-09-10, at the end of a long session that built this
feature from scratch. Handing off to Codex to continue. Everything below is on
branch `feature/classroom` — **do not merge to `main` or push until the user
says it's ready.** Nothing here has touched production; `main` is untouched.

## What this is

A CodeChum-style graded classroom system, deliberately **not** a revival of the
old classroom/grading platform that was removed from this repo earlier in its
history (see git history / `docs/PRODUCT_REQUIREMENTS.md` if it still exists —
that doc describes a stale, abandoned vision, don't treat it as current). This
is a narrower, new feature the user explicitly asked to build: teachers create
classes, students join by code, teachers post graded coding activities,
students solve them in a locked-down browser environment.

**Read this whole file before writing any code.** Sections below cover what's
already built (don't redo it) and what's genuinely missing (build only what's
asked — don't jump ahead to Phase 6 if only Phase 5 was requested).

## Conventions this codebase already has — follow them, don't reinvent

- Monorepo: `apps/*` (services) + `packages/*` (shared logic), npm workspaces.
- Contracts: zod schemas + inferred types live in `packages/contracts/src/*.ts`,
  each file re-exported from `packages/contracts/src/index.ts`.
- DB schema: Drizzle ORM table defs in `packages/database-platform/src/schema.ts`,
  aggregated into the `platformSchema` export at the bottom of that file.
- Migrations: plain `.sql` files in `packages/database-platform/migrations/`,
  numbered sequentially (`NNNN_description.sql`), **never edited after the
  fact** — a later migration supersedes an earlier one, immutable history.
  There is no auto-migrator; they're applied by hand:
  ```
  docker exec -i sqweb-local-mysql mysql -usqweb_app -psqweb_local_app_2026 sqweb_platform < packages/database-platform/migrations/NNNN_x.sql
  ```
  (local Docker MySQL — completely separate from production; production has
  its own manual-apply step documented in `infrastructure/vps/DEPLOY.md`.)
  Next migration number is **0019**.
- Two DB-access styles coexist **on purpose**, matched to which service is
  writing: `platform-api`-side repositories use Drizzle (`packages/database-platform/src/activity-repository.ts`,
  `classroom-repository.ts`); `execution-api`-side repositories use raw
  `mysql2` SQL (`activity-grading-repository.ts`), because that service's
  existing repositories (`execution-repository.ts`) already did it that way.
  Don't "fix" this inconsistency — it's deliberate, both point at the same
  physical tables.
- Service layer: `packages/classroom/src/` holds `ClassroomService` and
  `ActivityService` — role-gated via an injected `identity.requireActiveAccount()`
  and a `classes.getAccess(classId, userId)` check returning
  `{ isTeacher, isActiveMember }`. Any new class-scoped feature (quizzes,
  leaderboard) should reuse this same `getAccess` pattern rather than
  re-deriving membership rules.
- Grading-and-attempt-mutating logic lives in **execution-api**
  (`apps/execution-api/src/activity-grading-service.ts`), not platform-api —
  because it needs the same `getOrCreateAttempt`/lock-check logic for both
  grading (`POST /v1/activities/:id/test-runs`) and lockdown violation
  reporting (`POST /v1/activities/:id/violations`). If quizzes need their own
  timed-submission logic, consider whether it belongs here too, or whether
  quizzes (no Judge0 involved, pure DB) are simple enough to live entirely in
  platform-api instead — likely the latter, since quiz questions (MCQ/short
  answer) don't need code execution.
- Error codes: shared closed enum `apiErrorCodeSchema` in
  `packages/contracts/src/api.ts` — add new codes there if a new distinct
  error condition needs one (see `ACTIVITY_ATTEMPT_LOCKED` for precedent),
  don't invent ad hoc strings.
- Every service/route file has adjacent `*.test.ts` unit tests (vitest,
  dependency-injected fakes, no real DB in tests). Follow the existing pattern
  in `packages/classroom/src/activity-service.test.ts` and
  `apps/execution-api/src/activity-grading-service.test.ts`.
- After any change: `npm run format:check && npm run lint && npm run typecheck
  && npm run test && npm run build` (or `npm run verify`) across every touched
  workspace. All of it is currently green — keep it that way.
- **Local dev uses real Firebase, not an emulator** (deliberate, previously
  reverted when tried once — don't re-add the emulator). Be careful with
  anything that touches Firebase Admin SDK or real user accounts; this repo
  has real students using it.

## What's already built (Phases 1–4 of the original plan)

### Phase 1 — Classes shell
- Tables: `classes` (id, institution_id, teacher_id, subject_name,
  section_label, join_code UNIQUE, archived_at, created_at, updated_at),
  `class_members` (id, class_id, student_id, status enum('active','removed'),
  joined_at). Migration `0015_classroom.sql`.
- `packages/classroom/src/classroom-service.ts` (`ClassroomService`):
  `createClass`, `listTeaching`, `listEnrolled`, `joinClass`, `getDetail`,
  `getAccess`-backed authorization throughout.
- Routes (`apps/platform-api/src/server.ts`): `POST /v1/classes`,
  `GET /v1/classes/teaching`, `GET /v1/classes/enrolled`,
  `POST /v1/classes/join`, `GET /v1/classes/:id`.
- Frontend: `apps/web/src/components/classroom/{class-list,class-detail}.tsx`,
  pages under `apps/web/src/app/{student,teacher}/classes/`.
- Teacher's sidebar nav (`apps/web/src/components/app-shell/navigation.ts`)
  was deliberately trimmed to just Dashboard + My Classes — every practice
  workspace link and the old pre-pivot dead links were removed (per explicit
  user request: "a teacher account's job is just teacher"). The underlying
  `/teacher/workspaces` etc. pages were **not deleted**, just unlinked —
  reversible.

### Phase 2 — Activity authoring + grading
- Tables: `activities` (id, class_id, title, instructions, language enum,
  starter_code, allow_retake, created_at, updated_at), `activity_test_cases`
  (id, activity_id, stdin, expected_stdout, order_index), `activity_attempts`
  (id, activity_id, student_id, source_code, status, violation_count,
  started_at, submitted_at), `activity_test_runs` (id, attempt_id,
  test_case_id, passed, actual_stdout, ran_at). Migrations `0016`, `0017`
  (added `source_code`), `0018` (added `violation_count` + widened `status`).
- **No draft/publish workflow** — an activity is live the moment it's posted.
  The plan's original `status` column idea was dropped entirely (not just
  unused) since there's no draft state to represent.
- **No `is_hidden` flag on test cases** — all test cases are visible to
  students (stdin only, never `expected_stdout`). Matches the plan's own "v1
  can start with all-visible test cases" note.
- Grading (`apps/execution-api/src/activity-grading-service.ts`,
  `ActivityGradingService.gradeSubmission`): runs the student's submission
  once per test case through the existing `CodeJudgeClient` (Judge0), diffs
  normalized stdout (`\r\n`→`\n`, trailing whitespace trimmed per line, then
  overall trim) against `expected_stdout` **server-side only** — the answer
  key never reaches the browser. A compile error short-circuits the remaining
  test cases (they'd all fail identically) instead of burning a Judge0 call
  per case. All-pass marks the attempt `passed`.
- `allowRetake` (per-activity, teacher sets at creation): if a `passed`
  attempt is graded again, it's only allowed when `allowRetake` is true, and
  resets `violation_count` to 0 on that retry. A `zeroed_violation` attempt
  is **always** locked regardless of `allowRetake` — only a teacher reset
  clears it (see Phase 4 below).
- Source code is persisted on every grading run (pass or fail), not just
  passing ones — `saveAttemptSourceCode`, so a teacher can review what was
  actually submitted, not just the outcome.
- Route: `POST /v1/activities/:id/test-runs` (execution-api).
- Authoring/listing routes (platform-api): `POST/GET /v1/classes/:classId/activities`,
  `GET /v1/activities/:id`, `GET /v1/activities/:id/submissions` (teacher-only,
  full roster incl. students who haven't started, each row's status/code/violations).
- Frontend: `activity-feed.tsx` (class page's activity list, role-aware),
  `create-activity-dialog.tsx` (teacher, repeatable test-case rows),
  `activity-workspace.tsx` (student — the actual coding UI, see Phase 3/layout
  below for its current shape), `activity-detail-teacher.tsx` (read-only
  answer key + Submissions list with expandable code/violation log).
- **Interactive console**: students also get a free-run "Run" button
  (separate from grading) reusing the same WebSocket flow Code Workspace's
  "Run Interactively" already uses — extracted into a new shared hook
  `apps/web/src/lib/use-interactive-run.ts` (Code Workspace's own
  `code-workbench.tsx` was deliberately left untouched/not refactored, to
  avoid risking a regression in that already-shipped feature; the hook is a
  fresh implementation of the same logic, not a shared import from there).

### Phase 3 — Lockdown (4 strikes, not the plan's original 2)
- Table: `activity_violations` (id, attempt_id, kind enum('tab_switch',
  'fullscreen_exit'), occurred_at). Migration `0018`.
- `ACTIVITY_MAX_VIOLATIONS = 4` exported from `packages/contracts/src/activity.ts`
  so client and server can't drift on the threshold.
- Student side (`activity-workspace.tsx`): activity is gated behind a "Start
  Activity (Fullscreen)" screen using the real browser Fullscreen API. Once
  active, `visibilitychange` (tab-switch) and `fullscreenchange` (exiting
  fullscreen) each report a violation, de-duped within a 1.5s window (one real
  alt-tab commonly fires both near-simultaneously). Strikes 1–3 show a warning
  banner; strike 4 zeroes the attempt server-side (`ActivityGradingService.recordViolation`,
  route `POST /v1/activities/:id/violations`) and locks it — permanently,
  until a teacher reset. Window `blur` was deliberately **not** used as a
  third listener (overlaps too much with `visibilitychange`, risks
  over-triggering on harmless things like a devtools click).
- Teacher side: `activity-detail-teacher.tsx`'s Submissions list shows a
  strikes badge and the actual violation log (kind + timestamp) per student.
- **Superseded later**: the hard-lock-at-4-strikes design above (for both
  Activities and Code Racing, NOT Quiz) was replaced with a graduated
  deduction model — `ACTIVITY_MAX_VIOLATIONS`/`RACE_MAX_VIOLATIONS` renamed
  to `ACTIVITY_ALLOWED_VIOLATIONS`/`RACE_ALLOWED_VIOLATIONS` (4 → 5), and
  violations no longer lock/zero/force-end an attempt — each one past the
  allowance instead deducts `*_VIOLATION_DEDUCTION_PERCENT` (2.5%) of the
  activity's/race's total points from the score, via the shared
  `applyViolationDeduction` helper in `packages/contracts/src/violation-scoring.ts`.
  `zeroed_violation` stays in the schema for historical rows but nothing
  writes it anymore.

### Phase 4 — Retake control (this is actually done, despite the original
plan listing it as a separate later phase — both halves got built)
- `allowRetake` per-activity (Phase 2, above) already lets a teacher choose
  unlimited-retake activities from day one.
- **Teacher-initiated reset**, the only unlock path for a `passed`-and-locked
  or `zeroed_violation` attempt: `POST /v1/activities/:id/submissions/:studentId/reset`
  (platform-api, teacher-of-that-class only). `MySqlActivityRepository.resetAttempt`
  sets status back to `in_progress`, clears `violation_count` to 0 and
  `submitted_at` to null — but **keeps** `source_code` and the historical
  `activity_violations` log rows (a reset unlocks, it doesn't erase the audit
  trail). Frontend: a per-student "Reset" button in the Submissions list
  (two-click arm-then-confirm, matching the same pattern used for deleting a
  saved query elsewhere in this app), visible only on `passed`/`zeroed_violation` rows.

### Layout (student activity page, `activity-workspace.tsx`)
Three columns on desktop (`lg:` breakpoint and up), matching a reference
CodeChum screenshot the user provided:
- **Left** (380px, `lg:h-full lg:overflow-y-auto`): Problem — instructions +
  sample stdin per test case (never expected output) + a "Back to class" link.
- **Center** (flexible width): file-label bar, Monaco editor
  (`h-80 lg:h-auto lg:min-h-0 lg:flex-1` — fixed height on mobile where there's
  no bounding parent, flexes on desktop where there is), an optional
  **vertically resizable** console drawer (drag handle copied from
  `code-workbench.tsx`'s existing `beginVerticalResize` pattern — pointer
  events on a `role="separator"` bar, 120–420px range), and a full-width
  "Run" (blue, free execution) / "Check code" (green, grading) button pair.
- **Right** (260px, `lg:h-full lg:overflow-y-auto`): Tests — a static
  per-test-case status list (populated from the last "Check code" result) +
  a Score line.
- The whole 3-column grid is `lg:h-[clamp(520px,calc(100dvh-210px),900px)]` —
  fills most of the actual viewport on desktop, with a floor/ceiling. **On
  mobile there is no height constraint at all** — panels stack and take their
  natural content height, the page scrolls normally. This was fixed once
  already after a first attempt (`min(640px, 76dvh)`) was wrong — `min()`
  always picks the smaller value, so it clamped to a flat 640px on any normal
  monitor regardless of real screen size, and had no responsive breakpoint at
  all so it also broke mobile by squeezing all 3 stacked panels into that same
  small shared height. **Any height/overflow class touching this component
  needs an explicit `lg:` prefix or it will silently break mobile again** —
  there's no separate mobile layout, just the same grid collapsing to 1 column.
- Deliberately **not** ported from the CodeChum reference: "Item Navigation"
  (multi-item quiz navigation — doesn't map to this app's one-activity-per-page
  model) and a "Minimum Requirements" structural checker (e.g. "Should use:
  While Loop") — see the known limitation below, this was discussed but never
  explicitly greenlit as a build request.

### Also in the UI: a Quizzes tab that is a placeholder only
`apps/web/src/components/classroom/quiz-feed.tsx`, embedded in the class
page's "Classwork" tab alongside Activities. Shows a "New Quiz" button that's
visibly present but **disabled** ("coming soon" tooltip) for teachers, and an
empty-state message for students. Explicit, deliberate scope call by the user
("layout only for now") — this is exactly what Phase 5 below needs to make real.

## What's NOT built — the actual remaining work

### Phase 5 — Quizzes (not started at all, backend or frontend)
From the original plan, not yet refined further — use judgment on exact
shape, but keep it simple for v1:
- New tables (next migration `0019_quizzes.sql`): `quizzes` (id, class_id,
  title, duration_minutes, opens_at, closes_at, status enum('draft','open','closed')),
  `quiz_questions` (id, quiz_id, question_text, question_type enum('mcq','short_answer')
  — **skip a 'code' question type for v1**, that's a much bigger lift requiring
  Judge0 integration into quiz grading, not requested — `points`, `order_index`),
  `quiz_attempts` (id, quiz_id, student_id, started_at, submitted_at, score,
  status), `quiz_answers` (id, quiz_attempt_id, question_id, response,
  is_correct, points_awarded).
- Teacher authors a quiz: title, duration, open/close window, a list of MCQ
  (with options + correct answer) and/or short-answer (exact-match string)
  questions.
- Student takes it: a countdown UI, but **the deadline must be enforced
  server-side** (reject answer submission after `closes_at`, don't trust a
  client-side timer alone — same principle already applied throughout this
  feature, e.g. grant-based auth, server-side lockdown enforcement).
- Auto-scoring: MCQ and short-answer (exact match) score automatically on
  submission; no manual teacher override needed for v1.
- This probably belongs entirely in **platform-api** (Drizzle), not
  execution-api — no Judge0/code execution involved, pure DB + timers. Don't
  copy the execution-api raw-SQL pattern here just for consistency; that
  pattern exists because execution-api's *other* repositories already used
  raw SQL, which isn't true for a from-scratch quiz feature.
- Wire the real "New Quiz" flow into `quiz-feed.tsx`, replacing the disabled
  placeholder button, matching `create-activity-dialog.tsx`'s UX pattern.

### Phase 6 — Leaderboard (not started)
- A per-class ranking view aggregating quiz scores (and optionally activity
  scores) — plan's own note: "derived, not stored — `SUM`/`GROUP BY` over
  `quiz_attempts` scoped to a class, no materialized table needed at this scale."
- Visual pattern to reuse: the existing admin "Top Contributors" leaderboard
  (`apps/web/src/components/admin/...`, or check `usage-reader.ts`'s
  `getTopContributors` for the query shape) already solves this exact kind of
  ranking UI — reuse its visual style (rank badges, meter bars sized relative
  to the top scorer) rather than designing a new pattern from scratch.

### Phase 7 — Teacher dashboard polish (not started)
- Roster management already exists (the class page's "People" tab).
- Per-activity analytics beyond what's already in Submissions
  (pass/zeroed counts, per-student violation log) — genuinely not much is
  missing here already; check what's actually still wanted before building
  more, this phase may be mostly done already as a side effect of Phase 2–4 work.
- Bulk reset (reset multiple students' attempts at once) is **not** built —
  only the single-student reset from Phase 4 exists.

### Discussed but explicitly not built — don't build without being asked
- **Structural/keyword code-pattern checking.** Real limitation flagged to
  the user during this session: pure output-matching grading can't verify a
  student actually wrote the required class/object/method structure — they
  could hardcode `println` calls and pass an OOP exercise. Two options were
  discussed: (1) save submitted code so a teacher can manually check — **this
  one was built** (Phase 2's source persistence). (2) an automated
  required-keyword/substring check on the submission (e.g. must contain
  `"class Student"`) as an optional per-activity gate — **not built**, the
  user's request stopped at (1). Only build (2) if explicitly asked; it's
  gameable by a determined student either way (declaring an unused dummy
  class), so frame it as a deterrent, not a guarantee, if it comes up.
- **Numeric/partial-credit scoring.** Activities are binary pass/fail only
  (all test cases must pass). No 7/10-style partial credit exists anywhere.
- **Per-test-case individual "run" buttons** (visible in the CodeChum
  reference screenshot, each test case row had its own play icon) — not
  built; "Check code" always grades every test case in one call. Would need
  the grading endpoint to accept a specific test case ID to run individually.

## Before starting

1. Confirm you're on `feature/classroom`, not `main`.
2. Bring up the local stack if you need to test against a real DB: Docker
   Desktop running, then `npm run local:db:up`, `npm run dev:api:local`,
   `npm run dev:execution:local` (only these two + Docker are needed for
   anything classroom-related — the GUI workspace and interactive-run workers
   aren't required unless touching those unrelated features).
3. Read the specific section above for whatever phase you're asked to build,
   then check the actual current file contents before assuming this document
   is 100% in sync with the code — it's a snapshot from the moment it was
   written, not a live view.
