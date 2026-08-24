# Running SQWeb locally

## Prerequisites

- Node.js `>=22.12.0 <25` (see `engines` in the root `package.json`) and `npm install` run once at the repo root — this is an npm workspaces monorepo, one install covers every `apps/*`/`packages/*` workspace.
- Docker Desktop running — MySQL, Java GUI containers, and interactive code runs all need it.
- Each service that needs one already has its own `.env.local` (gitignored, not created by this guide). The root `.env.example` documents every variable across every service; `apps/interactive-run-api/.env.local.example` is that one service's own template.

## Start everything

Real Firebase is used for auth in local dev (no emulator). Build the
interactive runtime once, then open 8 separate terminals from the repo root
and run one command in each, in this order.

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

## Verify (before committing / what CI checks)

Each of these runs across every workspace (`apps/*` and `packages/*`) at once — none of them need the 8-terminal stack from above running:

```bash
npm run format:check # prettier --check .
npm run lint # eslint . --max-warnings=0
npm run typecheck # tsc --noEmit in every workspace
npm run test # vitest run in every workspace
npm run build # production build of every workspace
npm run verify # all five above, in that order
```

`npm run format` (no `:check`) applies Prettier's fixes instead of just reporting them.

`npm run build` compiles every backend service's `src/` to `dist/` (`tsc -p tsconfig.build.json`) and runs `apps/web`'s real `next build`. Only `apps/platform-api` and `apps/web` currently have a matching `start` script (`tsx dist/main.js` and `next start`) to actually run that compiled output — `execution-api`, `provisioning-worker`, and `interactive-run-api` don't have one yet, so day-to-day local dev always goes through the `dev:*:local` scripts above (running `src/main.ts` directly via `tsx`, not `dist/`), and `npm run build` for those three is really just a compile-correctness check.

## Smoke tests

One-off scripts that exercise a real slice of the stack end-to-end — each needs the relevant services from "Start everything" above already running:

```bash
npm run local:smoke                    # core auth/account flow
npm run local:smoke:workspace          # SQL Workspace provisioning
npm run local:smoke:execution          # SQL Execution API
npm run local:smoke:gui                # Java GUI Workspace provisioning
npm run local:smoke:gui-execution      # Java GUI Workspace console/VNC relay
npm run local:smoke:interactive-run    # Interactive Code Compiler runner
```
