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
UUIDs you pick now and reuse in step 5 — `node -e "console.log(crypto.randomUUID())"`
for each.

`SQWEB_ALLOWED_ORIGINS` needs your real Vercel URL (e.g.
`https://codeforge.vercel.app`) — set that up first (see the Vercel
section below) if you don't have it yet, or come back and fill this in
once you do; the platform-api container needs a restart after changing it
(`docker compose ... restart platform-api`), not a full rebuild.

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

### Seed the one institution + workspace pool row

Every other row a fresh install needs (institution, workspace pool
instance) has to be inserted once — there's no seed script for this
(`scripts/bootstrap-local.ts` exists but is entangled with the Firebase
**emulator** and leftover classroom-platform seed data from before the
CodeForge pivot — don't run it here, it'll fail on the emulator call and
seed departments/programs/courses this app doesn't use anymore). Plain
SQL instead:

```bash
docker compose -f infrastructure/vps/docker-compose.prod.yml exec mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" sqweb_platform -e "
INSERT INTO institutions (id, name, slug, status, timezone)
VALUES ('<SQWEB_DEFAULT_INSTITUTION_ID from .env.prod>', 'Your School Name', 'your-school-slug', 'active', 'Asia/Manila');

INSERT INTO workspace_pool_instances
  (id, environment, region, service_ref, state, database_count, capacity_json)
VALUES ('<WORKSPACE_POOL_INSTANCE_ID from .env.prod>', 'production', 'vps',
  'workspace-mysql:3306', 'active', 0, JSON_OBJECT('maximumDatabases', 100));
"
```

(`service_ref` is the compose service name + internal port — that's
already correct as written above, don't change it unless you rename the
`workspace-mysql` service in `docker-compose.prod.yml`.)

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
```

Rebuilds and recreates only the services whose image actually changed.
`mysql`/`workspace-mysql` keep their data (named volumes, untouched by
`--build`).

---

## Vercel (frontend)

`apps/web` deploys separately — connect the GitHub repo
(`carlosmiguelhub/CodeForge`) in the Vercel dashboard, then:

- **Root Directory**: `apps/web`
- **Framework Preset**: Next.js (auto-detected)
- **Build/Install commands**: leave the defaults — Vercel detects the npm
  workspaces monorepo from the root `package-lock.json` and installs from
  the repo root automatically once Root Directory is set.
- **Environment variables** (Project Settings → Environment Variables —
  the `NEXT_PUBLIC_*` ones are baked into the client bundle at *build*
  time, so set them before the first deploy, not after):
  - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
    `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
    `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` — from the Firebase Console,
    same project the VPS's service account belongs to.
  - `NEXT_PUBLIC_PLATFORM_API_URL` → `https://api.example.com` (step 7's
    domain, once it exists — until then this can point at
    `http://<vps-ip>` and API calls just won't work over HTTPS yet; the
    rest of the site still deploys and renders fine).
  - `NEXT_PUBLIC_EXECUTION_API_URL` → `https://exec.example.com`
  - `NEXT_PUBLIC_INTERACTIVE_RUN_API_URL` → `wss://run.example.com` (note
    `wss://`, not `https://` — this one's a WebSocket base URL).
  - Leave `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL` and
    `NEXT_PUBLIC_LOCAL_APP_CHECK_TOKEN` unset — those are local-dev-only
    bypasses.

Once deployed, copy the real `https://<project>.vercel.app` URL into the
VPS's `SQWEB_ALLOWED_ORIGINS` (step 3) and restart `platform-api` — CORS
will reject the frontend's requests until that round-trip is done.
