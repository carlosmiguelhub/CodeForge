# Migrations

The first migration establishes identity and institution membership records for Milestone 2.

`0006_remove_classroom.sql` drops the classroom/academic tables created by `0002_classroom_core.sql`. SQWeb no longer models classes, activities, submissions, or grades — it is a personal SQL Workbench and code compiler. `0002` is kept in place as an immutable historical record rather than edited or deleted.

`0007_erd_diagrams.sql` adds per-user ERD diagram storage (previously browser-`localStorage`-only). This file only auto-applies via `docker-entrypoint-initdb.d` on a fresh MySQL volume — an already-initialized local database needs `npm run local:migrate:workspace` to pick it up (that script applies any migration not yet present, despite its name).

`0008_code_workspace.sql` adds the same server-side persistence for the Code Workspace's file tree (`code_workspaces`, one row per user) and its run history (`code_executions`, metadata only — no source code, stdin, or stdout stored). Same locally-applies-via-script caveat as above.

`0009_saved_queries.sql` adds `saved_queries` — explicitly-named SQL snippets a user pins for later, distinct from the per-workspace `localStorage` editor tabs (which stay client-only draft/scratch space). Each row is tied to both its owner and a specific SQL workspace. Same locally-applies-via-script caveat as above.

`0010_sections.sql` adds an admin-managed `sections` table (e.g. "BSIT-3A") and a nullable `users.section_id` referencing it. Students pick one at registration; removing a section sets `archived_at` instead of deleting the row, so students already in it keep their history. Same locally-applies-via-script caveat as above.

`0011_section_workspace_locks.sql` adds a nullable `sections.locked_workspaces_json` column — an admin-set array of workspace kinds (`sql-workbench`, `code-compiler`, `erd-editor`, `saved-queries`) that are locked for students in that section; NULL/absent means nothing is locked. Teachers are never affected by this column, regardless of section membership. Same locally-applies-via-script caveat as above.

Future migration files must use ordered immutable identifiers, include verification tests, and never contain secrets or production data.
