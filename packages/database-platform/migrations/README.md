# Migrations

The first migration establishes identity and institution membership records for Milestone 2.

`0006_remove_classroom.sql` drops the original academic model created by `0002_classroom_core.sql`. That abandoned model remains immutable history. The narrower classroom feature introduced later by `0015_classroom.sql` is a separate design and does not revive those tables.

`0007_erd_diagrams.sql` adds per-user ERD diagram storage (previously browser-`localStorage`-only). This file only auto-applies via `docker-entrypoint-initdb.d` on a fresh MySQL volume — an already-initialized local database needs `npm run local:migrate:workspace` to pick it up (that script applies any migration not yet present, despite its name).

`0008_code_workspace.sql` adds the same server-side persistence for the Code Workspace's file tree (`code_workspaces`, one row per user) and its run history (`code_executions`, metadata only — no source code, stdin, or stdout stored). Same locally-applies-via-script caveat as above.

`0009_saved_queries.sql` adds `saved_queries` — explicitly-named SQL snippets a user pins for later, distinct from the per-workspace `localStorage` editor tabs (which stay client-only draft/scratch space). Each row is tied to both its owner and a specific SQL workspace. Same locally-applies-via-script caveat as above.

`0010_sections.sql` adds an admin-managed `sections` table (e.g. "BSIT-3A") and a nullable `users.section_id` referencing it. Students pick one at registration; removing a section sets `archived_at` instead of deleting the row, so students already in it keep their history. Same locally-applies-via-script caveat as above.

`0011_section_workspace_locks.sql` adds a nullable `sections.locked_workspaces_json` column — an admin-set array of workspace kinds (`sql-workbench`, `code-compiler`, `erd-editor`, `saved-queries`, `java-gui-workspace`, `web-workspace`) that are locked for students in that section; NULL/absent means nothing is locked. Teachers are never affected by this column, regardless of section membership. Same locally-applies-via-script caveat as above.

`0014_web_workspace.sql` adds one owner-unique `web_workspaces` row per user. Its JSON content stores the HTML/CSS/JavaScript file tree; authored JavaScript is rendered only in the browser preview and is never executed by a backend service. Same locally-applies-via-script caveat as above.

`0015_classroom.sql` through `0018_activity_violations.sql` add the current class membership, graded coding activity, saved submission, and lockdown-audit tables. They are intentionally separate from the academic hierarchy removed by `0006`.

`0019_quizzes.sql` adds scheduled MCQ and exact-match short-answer quizzes, one timed attempt per student, and server-scored answer rows. Existing databases must apply `0015` through `0019` manually in numeric order; the legacy `local:migrate:workspace` helper currently stops at `0014`.

`0020_activity_output_matching.sql` adds per-activity output comparison modes and per-test visibility controls. Its defaults preserve existing behavior: old inputs remain visible, old expected outputs remain private, and grading continues to use normalized exact matching.

Future migration files must use ordered immutable identifiers, include verification tests, and never contain secrets or production data.
