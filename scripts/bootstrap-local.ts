import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createPool } from "mysql2/promise";

const projectId = process.env.FIREBASE_PROJECT_ID;
const databaseUrl = process.env.PLATFORM_DATABASE_URL;
const institutionId = process.env.SQWEB_DEFAULT_INSTITUTION_ID;
const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

if (!projectId || !databaseUrl || !institutionId || !emulatorHost) {
  throw new Error("Local API environment variables are required.");
}

const authBaseUrl = `http://${emulatorHost}`;
const localPassword = "Local-SQWeb-2026!";
const firebaseApp =
  getApps()[0] ??
  initializeApp({
    projectId,
  });

async function ensureUser(email: string, displayName: string) {
  const signUp = await fetch(
    `${authBaseUrl}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: localPassword,
        displayName,
        returnSecureToken: true,
      }),
    },
  );

  let payload = (await signUp.json()) as {
    localId?: string;
    error?: { message?: string };
  };
  if (!signUp.ok) {
    const signIn = await fetch(
      `${authBaseUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: localPassword,
          returnSecureToken: true,
        }),
      },
    );
    payload = (await signIn.json()) as typeof payload;
    if (!signIn.ok) {
      throw new Error(
        `Could not create or load ${email}: ${payload.error?.message ?? "unknown error"}`,
      );
    }
  }
  if (!payload.localId) throw new Error(`Firebase UID missing for ${email}.`);

  await getAuth(firebaseApp).updateUser(payload.localId, {
    emailVerified: true,
    displayName,
  });
  return payload.localId;
}

const accounts = [
  {
    id: "00000000-0000-4000-8000-000000000010",
    email: "admin@sqweb.local",
    displayName: "Local Administrator",
    role: "administrator",
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    email: "teacher@sqweb.local",
    displayName: "Local Teacher",
    role: "teacher",
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    email: "student@sqweb.local",
    displayName: "Local Student",
    role: "student",
  },
] as const;

async function main() {
  const pool = createPool({ uri: databaseUrl, connectionLimit: 2 });
  try {
    await pool.execute(
      `INSERT INTO institutions (id, name, slug, status, timezone)
     VALUES (?, 'SQWeb Local School', 'sqweb-local', 'active', 'Asia/Manila')
     ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'active'`,
      [institutionId],
    );

    for (const account of accounts) {
      const firebaseUid = await ensureUser(account.email, account.displayName);
      await getAuth(firebaseApp).setCustomUserClaims(firebaseUid, {
        institution_id: institutionId,
        roles: [account.role],
        authorization_version: 1,
      });
      await pool.execute(
        `INSERT INTO users (id, firebase_uid, email, display_name, status, authorization_version)
       VALUES (?, ?, ?, ?, 'active', 1)
       ON DUPLICATE KEY UPDATE firebase_uid = VALUES(firebase_uid), email = VALUES(email),
         display_name = VALUES(display_name), status = 'active'`,
        [account.id, firebaseUid, account.email, account.displayName],
      );
      await pool.execute(
        `INSERT INTO institution_memberships
         (id, institution_id, user_id, role, approval_state, approved_at)
       VALUES (UUID(), ?, ?, ?, 'approved', CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE approval_state = 'approved', approved_at = CURRENT_TIMESTAMP(3)`,
        [institutionId, account.id, account.role],
      );
    }

    const departmentId = "00000000-0000-4000-8000-000000000020";
    await pool.execute(
      `INSERT INTO departments (id, institution_id, code, name, status)
     VALUES (?, ?, 'CCS', 'College of Computing Studies', 'active')
     ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'active'`,
      [departmentId, institutionId],
    );
    await pool.execute(
      `INSERT INTO programs (id, institution_id, department_id, code, name, status)
     VALUES ('00000000-0000-4000-8000-000000000021', ?, ?, 'BSIT',
       'Bachelor of Science in Information Technology', 'active')
     ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'active'`,
      [institutionId, departmentId],
    );
    await pool.execute(
      `INSERT INTO courses (id, institution_id, department_id, code, title, status)
     VALUES ('00000000-0000-4000-8000-000000000022', ?, ?, 'DB101',
       'Database Fundamentals', 'active')
     ON DUPLICATE KEY UPDATE title = VALUES(title), status = 'active'`,
      [institutionId, departmentId],
    );
    await pool.execute(
      `INSERT INTO terms (id, institution_id, name, starts_at, ends_at, status)
     VALUES ('00000000-0000-4000-8000-000000000023', ?, 'Academic Year 2026–2027',
       '2026-06-01 00:00:00.000', '2027-06-01 00:00:00.000', 'active')
     ON DUPLICATE KEY UPDATE status = 'active'`,
      [institutionId],
    );
    await pool.execute(
      `INSERT INTO workspace_pool_instances
       (id, environment, region, service_ref, state, database_count, capacity_json)
       VALUES ('00000000-0000-4000-8000-000000000030', 'local', 'local',
         'workspace-mysql:3306', 'active', 0, JSON_OBJECT('maximumDatabases', 100))
       ON DUPLICATE KEY UPDATE state = 'active', service_ref = VALUES(service_ref)`,
    );
  } finally {
    await pool.end();
  }

  console.log("Local SQWeb accounts are ready:");
  for (const account of accounts)
    console.log(`- ${account.role}: ${account.email}`);
  console.log(`- password: ${localPassword}`);
}

void main();
