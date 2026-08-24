# Running SQWeb locally

Real Firebase is used for auth in local dev (no emulator). Docker Desktop
must be running (MySQL, Java GUI containers, and interactive code runs need
it). Build the interactive runtime once, then open 8 separate terminals from
the repo root and run one command in each, in this order.

```bash
# One-time (or after changing infrastructure/docker/code-runtime)
docker build -t sqweb/code-runtime:local infrastructure/docker/code-runtime

# 1. Start MySQL (Docker) and wait for it to become healthy
npm run local:db:up

# 2. Start the Platform API (:8080)
npm run dev:api:local

# 3. Start the isolated SQL Execution API (:8081)
npm run dev:execution:local

# 4. Start the workspace provisioning worker
npm run dev:worker:local

# 5. Start the Java GUI Workspace's execution API (console/VNC relay)
npm run dev:gui-execution:local

# 6. Start the Java GUI Workspace's provisioning worker (Docker containers)
npm run dev:gui-worker:local

# 7. Start the interactive Code Compiler runner (:8084)
npm run dev:interactive-run:local

# 8. Start Next.js (:3000) — logs in against real Firebase
npm run dev
```

Only using SQL Workbench, Code Compiler, ERD Editor, or Saved Queries?
Steps 5–6 are exclusively for the Java GUI Workspace and can be skipped.
Step 7 is required for the Code Compiler's interactive Run button.

## Stop

Ctrl+C in each terminal, then stop MySQL (preserves the volume):

```bash
docker compose -f infrastructure/local/compose.yaml stop
```
