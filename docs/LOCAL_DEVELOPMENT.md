# SQWeb Local Development

The local stack uses separate platform and workspace MySQL 8.4 Docker volumes, Firebase Authentication Emulator, a development-only App Check verifier, the Platform API, provisioning worker, and Next.js. It does not create or mutate production cloud resources.

## Prerequisites

- Node.js 22–24
- Docker Desktop
- Java
- Firebase CLI

## First-time startup

Open separate PowerShell terminals from the repository root.

1. Start MySQL and wait for it to become healthy:

   ```powershell
   npm.cmd run local:db:up
   ```

2. Start the Firebase Authentication Emulator:

   ```powershell
   $env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = "true"
   firebase.cmd emulators:start --only auth --project sqweb-5b004 --non-interactive
   ```

3. Apply the workspace migrations, then create idempotent local accounts and seed data:

   ```powershell
   npm.cmd run local:migrate:workspace
   npm.cmd run local:bootstrap
   ```

4. Start the Platform API:

   ```powershell
   npm.cmd run dev:api:local
   ```

5. Start the private workspace provisioning worker:

   ```powershell
   npm.cmd run dev:worker:local
   ```

6. Start Next.js:

   ```powershell
   npm.cmd run dev
   ```

7. Verify the authenticated and workspace-isolation boundaries:

   ```powershell
   npm.cmd run local:smoke
   npm.cmd run local:smoke:workspace
   ```

## Local URLs

| Service         | URL                            |
| --------------- | ------------------------------ |
| SQWeb           | `http://localhost:3000`        |
| Platform API    | `http://localhost:8080`        |
| API health      | `http://localhost:8080/health` |
| Firebase UI     | `http://127.0.0.1:4000/auth`   |
| Platform MySQL  | `127.0.0.1:3307`               |
| Workspace MySQL | `127.0.0.1:3308`               |

## Local accounts

All local accounts use password `Local-SQWeb-2026!`.

| Role          | Email                 |
| ------------- | --------------------- |
| Administrator | `admin@sqweb.local`   |
| Teacher       | `teacher@sqweb.local` |
| Student       | `student@sqweb.local` |

These credentials are synthetic and must never be used outside local development.

## Security boundary

- `.env.local` and `.env.mysql.local` are Git-ignored.
- Platform and workspace MySQL use separate containers, volumes, accounts, and loopback ports.
- Generated workspace credentials are stored only in the ignored local secret directory; production uses Google Secret Manager.
- Replacement reset activates a new allocation before the old allocation enters bounded, persisted cleanup retries.
- The local App Check verifier uses an explicit token, compares it in constant time, and refuses to initialize when `NODE_ENV=production`.
- Production keeps Firebase App Check verification and Application Default Credentials.
- The bootstrap is idempotent and writes only synthetic local identities and academic records.
- No browser or user-SQL execution engine exists yet. The current workspace screen manages lifecycle status only.

## Stop local services

Stop the interactive Firebase, API, and web terminals with `Ctrl+C`, then stop MySQL:

```powershell
docker compose -f infrastructure/local/compose.yaml stop
```

Stopping preserves the local MySQL volume. Removing the volume is destructive and is intentionally not part of the standard workflow.
