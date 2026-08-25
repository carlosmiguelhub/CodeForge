# Deploying CodeForge's backend to the InterServer VPS

This box (2 slices, 4GB RAM / 2 CPU / 80GB disk, ~$6/mo) runs everything
**except** the frontend: `platform-api`, `execution-api`,
`provisioning-worker`, `interactive-run-api`, two MySQL instances, and
nginx as the reverse proxy. `apps/web` deploys separately to Vercel — see
the bottom of this file for those settings. The Java GUI Workspace
(`gui-execution-api`, `gui-provisioning-worker`) is **not** deployed here;
every active section already has it locked server-side (see
[[sqweb-hosting-plan]] memory) rather than shipped in a half-working state.

No domain is assumed to exist yet — this runbook gets everything running
over plain HTTP on the VPS's bare IP first, with the TLS/domain step
clearly marked as a later addition once you have one.

**That said, don't put this off indefinitely if Vercel is also part of
your plan**: Vercel always serves over HTTPS, and browsers block an
HTTPS page from calling a plain-HTTP API (mixed content) — not a config
toggle, built into every modern browser. The frontend will load fine
without step 7 done, but every SQL/code/API call will silently fail
until the backend has real TLS too.

## 1. One-time VPS setup

SSH in as root (or a sudo user), then:

```bash
# Docker + Compose plugin (InterServer's Debian/Ubuntu images don't ship
# these) — use Docker's own convenience script rather than hand-rolling apt
# repo setup:
curl -fsSL https://get.docker.com | sh

# Swap safety net (see setup-swap.sh's own comments for why)
git clone https://github.com/carlosmiguelhub/CodeForge.git
cd CodeForge
bash infrastructure/vps/setup-swap.sh
```

## 2. Firebase service account

Firebase Console → Project Settings → Service Accounts → **Generate new
private key**. Upload the downloaded JSON to the VPS as
`infrastructure/vps/firebase-service-account.json` (gitignored — never
commit it, `scp` it over directly):

```bash
scp firebase-service-account.json your-vps:/root/CodeForge/infrastructure/vps/firebase-service-account.json
```

## 3. `.env.prod`

```bash
cd infrastructure/vps
cp .env.prod.example .env.prod
```

Fill in every value — see the comments in `.env.prod.example` for where
each one comes from and, for `PLATFORM_DATABASE_URL` /
`WORKSPACE_ADMIN_DATABASE_URL`, the **important caveat that `${...}`
references inside the file are NOT substituted** — paste the real password
into those URLs by hand, twice.

Generate the two secrets:

```bash
openssl rand -base64 24   # → MYSQL_ROOT_PASSWORD, PLATFORM_DB_APP_PASSWORD, WORKSPACE_MYSQL_ROOT_PASSWORD (run 3x, once each)
openssl rand -hex 32      # → SQWEB_EXECUTION_GRANT_SECRET
```

`SQWEB_DEFAULT_INSTITUTION_ID` and `WORKSPACE_POOL_INSTANCE_ID` are just
UUIDs you pick now and reuse in step 5 — `cat /proc/sys/kernel/random/uuid`
for each (no need for `node`/`uuidgen`/anything extra — this is a fresh
box with only Docker installed, and this is a real file the kernel
answers freshly on every read).

`INTERACTIVE_RUN_HOST_TMP_DIR` — see its comment in `.env.prod.example`.
Create the directory it points at now, since `interactive-run-api` won't:

```bash
mkdir -p /root/CodeForge/infrastructure/vps/interactive-run-tmp
```

`SQWEB_ALLOWED_ORIGINS` needs your real Vercel URL (e.g.
`https://codeforge.vercel.app`) — set that up first (see the Vercel
section below) if you don't have it yet, or come back and fill this in
once you do. Changing anything in `.env.prod` needs `up -d` run again
(below), **not** `docker compose restart` — restart only restarts the
existing container with whatever env it already has baked in; it does not
re-read `env_file`. Only `up -d` notices the config changed and recreates
the container with the new value.

## 4. Build the interactive-run-api runtime image

This is the sandboxed image `interactive-run-api` spawns per code run — it
must exist in the **host's** Docker image store before that service can
serve any runs (it talks to the host daemon over the mounted socket, it
doesn't build its own images):

```bash
cd ~/CodeForge
docker build -t sqweb/code-runtime:prod infrastructure/docker/code-runtime
```

Re-run this after any change to `infrastructure/docker/code-runtime/`, then
restart the service (`docker compose ... restart interactive-run-api`) —
already-running containers keep using whatever image tag they were
started with, a rebuild alone doesn't retroactively update them.

## 5. First deploy

```bash
cd ~/CodeForge
docker compose -f infrastructure/vps/docker-compose.prod.yml --env-file infrastructure/vps/.env.prod up -d --build
```

This builds all five service images (first build takes a few minutes —
each does a full `npm ci` in its own build stage, see
`infrastructure/docker/node-service/Dockerfile`'s comments for why that's
simpler than trying to hand-optimize a shared layer across services) and
starts everything. The `mysql` container applies every file in
`packages/database-platform/migrations/` on this **first boot only**
(standard `docker-entrypoint-initdb.d` behavior — it does not re-run on
restart, only on a genuinely empty data volume).

Watch it come up:

```bash
docker compose -f infrastructure/vps/docker-compose.prod.yml logs -f
```

### Fix the workspace-secrets directory permissions

`docker compose up` auto-creates the `./workspace-secrets` bind-mount
directory the first time it's referenced — owned by `root:root`, mode
`755`. But `execution-api` and `provisioning-worker` both run as the
Dockerfile's non-root `sqweb` user (uid `999`), which can't write to a
root-owned directory. Left unfixed, every workspace provisioning attempt
fails instantly with a generic `PROVISIONING_FAILED` (the actual MySQL
`CREATE DATABASE`/`CREATE USER` steps succeed — it's the credential file
write to this directory that silently fails, and none of this path logs
anything to `docker compose logs`, so this is easy to lose an hour to).
Fix it once, right after the first `up -d --build`:

```bash
chown -R 999:999 infrastructure/vps/workspace-secrets
```

### Verify the interactive-run-api Docker-outside-of-Docker path split

`interactive-run-api` writes each student's source file, then tells the
**host's** Docker daemon (over the mounted socket) to bind-mount that path
into the sandbox container it spawns. Since `interactive-run-api` is
itself containerized, a plain temp-dir path only means something inside
its own container — the host daemon would resolve it against the wrong
filesystem entirely and silently mount an empty directory instead (see
`interactive-runner.ts`'s `DockerInteractiveRunManagerOptions` comment for
the full mechanics). `INTERACTIVE_RUN_TMP_DIR`/`INTERACTIVE_RUN_HOST_TMP_DIR`
(set in step 3) and the `./interactive-run-tmp` bind mount in
`docker-compose.prod.yml` exist specifically to route around this — as
long as `INTERACTIVE_RUN_HOST_TMP_DIR` in `.env.prod` genuinely matches
where you cloned the repo, this should already work with no extra step.
Confirm with a real Code Workspace "Run" click once the frontend's up
(step 8 for Vercel); if it fails with `Cannot find module
'/workspace/src/main.js'` (or the equivalent for another language),
`INTERACTIVE_RUN_HOST_TMP_DIR` doesn't match the real clone path — fix it
in `.env.prod` and `up -d` again (not just `restart`, see step 3).

### Seed the institution, workspace pool row, and at least one section

A fresh install needs three rows inserted once — there's no seed script
for this (`scripts/bootstrap-local.ts` exists but is entangled with the
Firebase **emulator** and leftover classroom-platform seed data from
before the CodeForge pivot — don't run it here, it'll fail on the
emulator call and seed departments/programs/courses this app doesn't use
anymore). Plain SQL instead:

```bash
docker compose -f infrastructure/vps/docker-compose.prod.yml exec mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" sqweb_platform -e "
INSERT INTO institutions (id, name, slug, status, timezone)
VALUES ('<SQWEB_DEFAULT_INSTITUTION_ID from .env.prod>', 'Your School Name', 'your-school-slug', 'active', 'Asia/Manila');

INSERT INTO workspace_pool_instances
  (id, environment, region, service_ref, state, database_count, capacity_json)
VALUES ('<WORKSPACE_POOL_INSTANCE_ID from .env.prod>', 'production', 'vps',
  'workspace-mysql:3306', 'active', 0, JSON_OBJECT('maximumDatabases', 100));

INSERT INTO sections (id, institution_id, name)
VALUES (UUID(), '<SQWEB_DEFAULT_INSTITUTION_ID from .env.prod>', 'General');
"
```

(`service_ref` is the compose service name + internal port — that's
already correct as written above, don't change it unless you rename the
`workspace-mysql` service in `docker-compose.prod.yml`. The registration
form's "Section" dropdown is required and comes from the `sections` table
— skip that last insert and registration fails client-side with
"Select a section," dropdown permanently empty, no server error at all.)

### Promote your first admin

Register a real account through the actual `/register` flow (once
`apps/web` is deployed and pointed at this VPS) — it lands as a pending
student. Promote it directly in MySQL:

```bash
docker compose -f infrastructure/vps/docker-compose.prod.yml exec mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" sqweb_platform -e "
UPDATE institution_memberships
SET role = 'administrator', approval_state = 'approved'
WHERE user_id = (SELECT id FROM users WHERE email = 'you@example.com');
"
```

## 6. Verify

```bash
docker compose -f infrastructure/vps/docker-compose.prod.yml ps
curl http://localhost/health -H 'Host: api.example.com'   # platform-api
curl http://localhost/health -H 'Host: exec.example.com'  # execution-api
curl http://localhost/health -H 'Host: run.example.com'   # interactive-run-api
```

All three should return `{"status":"ok"}`. If not, `docker compose logs <service>`.

## 7. TLS, once you have a domain

Point three DNS A records at the VPS's IP: `api.`, `exec.`, `run.`
(matching `infrastructure/vps/nginx/codeforge.conf` — edit that file
first if you want different subdomain names, then reload nginx:
`docker compose ... exec nginx nginx -s reload`).

Then certbot, using the `codeforge_certbot_www`/`codeforge_certbot_conf`
volumes already declared in the compose file:

```bash
docker run --rm \
  -v codeforge-prod_codeforge_certbot_www:/var/www/certbot \
  -v codeforge-prod_codeforge_certbot_conf:/etc/letsencrypt \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d api.example.com -d exec.example.com -d run.example.com \
  --email you@example.com --agree-tos --no-eff-email
```

Add a webroot `location /.well-known/acme-challenge/` block to each
nginx `server {}` and a second `listen 443 ssl` block with the issued
cert paths afterward — not written into `codeforge.conf` yet since it's
pointless before you have a domain to issue against.

## 8. Redeploying after a code change

```bash
cd ~/CodeForge
git pull
docker compose -f infrastructure/vps/docker-compose.prod.yml --env-file infrastructure/vps/.env.prod up -d --build
docker compose -f infrastructure/vps/docker-compose.prod.yml exec nginx nginx -s reload
```

Rebuilds and recreates only the services whose image actually changed.
`mysql`/`workspace-mysql` keep their data (named volumes, untouched by
`--build`).

**The `nginx -s reload` line is not optional.** nginx resolves each
upstream hostname (`platform-api`, `execution-api`, `interactive-run-api`)
to a container IP once, at its own startup/reload — it does not notice
when Docker recreates one of those containers with a new IP afterward.
Skip the reload and you'll get a working deploy that still 502s through
nginx until something happens to reload it. (Confirmed the hard way:
this exact thing broke `exec.code-forge.online` mid-session even though
`execution-api` itself was healthy the whole time — `docker compose ps`
showed it "Up," its own logs showed it listening, and `curl` from inside
the box worked fine on its container IP; only requests through nginx
502'd. It might not remember every container's IP after every single
`up -d`, but a reload after `up -d` costs nothing and closes the gap
completely — treat it as a fixed part of every deploy, not a doubt to
resolve.)

---

## Vercel (frontend)

`apps/web` deploys separately — connect the GitHub repo
(`carlosmiguelhub/CodeForge`) in the Vercel dashboard, then:

- **Root Directory**: `apps/web`
- **Framework Preset**: Next.js (auto-detected once Root Directory is set
  correctly — Vercel's own guess before you set it has been wrong here,
  defaulting to a random `apps/*` backend service and a "Fastify" preset).
- **Install Command**: override the default. Vercel's build environment
  installs with devDependencies stripped (same as `NODE_ENV=production
  npm install` anywhere), but `next build` type-checks test files too,
  and those import `vitest`/`@testing-library/react`/`axe-core` — all
  root-level devDependencies. The build fails with a wall of
  `Cannot find module` `TS2307` errors otherwise. Set it to:
  ```
  npm install --prefix=../.. --include=dev
  ```
  (keep the `--prefix=../..` — that's what installs from the monorepo
  root correctly; `--include=dev` is the only addition needed.)
- **Environment variables** (Project Settings → Environment Variables —
  the `NEXT_PUBLIC_*` ones are baked into the client bundle at *build*
  time, so set them before the first deploy, not after):
  - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
    `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` —
    from Firebase Console → Project Settings → General → "Your apps" →
    the Web app's SDK config snippet. (The API key here is meant to be
    public, unlike the service account key from step 2 — no need to
    treat it as a secret.)
  - `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` — **not optional**, even
    though the frontend code degrades gracefully without it
    (`firebase-client.ts` just sets `appCheck: null`). The backend does
    not degrade: `packages/auth/src/identity-service.ts`'s
    `verifyAppCheck` throws a 403 on every single route if the
    `X-Firebase-AppCheck` header is missing. Skipping this env var means
    the whole site loads but nothing works. Get it from **Firebase
    Console → App Check → your Web app → Register → reCAPTCHA
    Enterprise** (not the plain "reCAPTCHA" option below it — the code
    specifically uses `ReCaptchaEnterpriseProvider`), which needs a key
    created first at **Google Cloud Console → Security → reCAPTCHA
    Enterprise → Keys → Create key** (Website type, add your Vercel
    domain(s) to its domain list). Free for the first 10,000
    assessments/month, no billing account needed to create the key.
  - `NEXT_PUBLIC_PLATFORM_API_URL` → `https://api.<your-domain>` (step 7's
    domain, once it exists — until then this can point at
    `http://<vps-ip>` and API calls just won't work over HTTPS yet; the
    rest of the site still deploys and renders fine).
  - `NEXT_PUBLIC_EXECUTION_API_URL` → `https://exec.<your-domain>`
  - `NEXT_PUBLIC_INTERACTIVE_RUN_API_URL` → `wss://run.<your-domain>`
    (note `wss://`, not `https://` — this one's a WebSocket base URL).
  - Leave `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL` and
    `NEXT_PUBLIC_LOCAL_APP_CHECK_TOKEN` unset — those are local-dev-only
    bypasses.

Once deployed, copy the real `https://<project>.vercel.app` URL into the
VPS's `SQWEB_ALLOWED_ORIGINS` (step 3) — **and into the reCAPTCHA
Enterprise key's domain list above too**, or App Check silently fails
with `appCheck/recaptcha-error` for that origin — then redeploy the two
affected containers:

```bash
docker compose -f infrastructure/vps/docker-compose.prod.yml --env-file infrastructure/vps/.env.prod up -d
docker compose -f infrastructure/vps/docker-compose.prod.yml exec nginx nginx -s reload
```

(Both `platform-api` and `execution-api` read `SQWEB_ALLOWED_ORIGINS` —
this recreates whichever ones actually changed. The nginx reload is the
same not-optional step from "Redeploying after a code change" above —
skip it and one of the two can keep 502ing through nginx even though the
container itself is healthy.)
