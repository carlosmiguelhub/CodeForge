import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createConnection,
  createPool,
  type RowDataPacket,
} from "mysql2/promise";

const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const platformDatabaseUrl = process.env.PLATFORM_DATABASE_URL;
const secretDirectory = process.env.WORKSPACE_LOCAL_SECRET_DIRECTORY;
if (!emulatorHost || !platformDatabaseUrl || !secretDirectory)
  throw new Error("Local workspace smoke-test settings are required.");

const apiBaseUrl = "http://127.0.0.1:8080";
const localPassword = "Local-SQWeb-2026!";

async function signIn(email: string) {
  const response = await fetch(
    `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`,
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
  const payload = (await response.json()) as { idToken?: string };
  if (!response.ok || !payload.idToken)
    throw new Error(`Sign-in failed for ${email}.`);
  return payload.idToken;
}

async function api(token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
}

async function ensureReady(token: string) {
  const requested = await api(token, "/v1/workspaces", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ scope: "personal" }),
  });
  if (requested.status !== 202)
    throw new Error(`Workspace request failed (${requested.status}).`);
  const workspace = (await requested.json()) as { id: string; state: string };
  await waitUntilReady(token, workspace.id);
  return workspace.id;
}

async function waitUntilReady(token: string, workspaceId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await api(token, `/v1/workspaces/${workspaceId}`);
    const current = (await response.json()) as {
      id: string;
      state: string;
      failureCode?: string;
    };
    if (current.state === "ready") return;
    if (current.state === "failed")
      throw new Error(
        `Workspace provisioning failed (${current.failureCode ?? "unknown"}).`,
      );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error("Workspace provisioning did not complete in time.");
}

interface AllocationRow extends RowDataPacket {
  workspace_id: string;
  database_name: string;
  credential_secret_ref: string;
}

interface CleanupRow extends RowDataPacket {
  cleanup_state: string;
}

async function expectDenied(operation: () => Promise<unknown>, label: string) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`${label} was not denied.`);
}

async function main() {
  const [studentToken, teacherToken] = await Promise.all([
    signIn("student@sqweb.local"),
    signIn("teacher@sqweb.local"),
  ]);
  const [studentWorkspaceId, teacherWorkspaceId] = await Promise.all([
    ensureReady(studentToken),
    ensureReady(teacherToken),
  ]);

  const platform = createPool({ uri: platformDatabaseUrl, connectionLimit: 1 });
  const [rows] = await platform.query<AllocationRow[]>(
    `SELECT workspace_id, database_name, credential_secret_ref
       FROM workspace_allocations
      WHERE workspace_id IN (?, ?) AND released_at IS NULL`,
    [studentWorkspaceId, teacherWorkspaceId],
  );
  await platform.end();
  const byWorkspace = new Map(rows.map((row) => [row.workspace_id, row]));
  const studentAllocation = byWorkspace.get(studentWorkspaceId);
  const teacherAllocation = byWorkspace.get(teacherWorkspaceId);
  if (!studentAllocation || !teacherAllocation)
    throw new Error("Active allocations were not recorded.");

  const loadCredential = async (reference: string) => {
    const name = reference.replace("local-secret://", "");
    return JSON.parse(
      await readFile(resolve(secretDirectory, name), "utf8"),
    ) as {
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
    };
  };
  const studentCredential = await loadCredential(
    studentAllocation.credential_secret_ref,
  );
  const teacherCredential = await loadCredential(
    teacherAllocation.credential_secret_ref,
  );
  const connectionOptions = (credential: typeof studentCredential) => ({
    host: credential.host,
    port: credential.port,
    database: credential.database,
    user: credential.username,
    password: credential.password,
  });
  const [student, teacher] = await Promise.all([
    createConnection(connectionOptions(studentCredential)),
    createConnection(connectionOptions(teacherCredential)),
  ]);
  try {
    await student.query(
      "CREATE TABLE IF NOT EXISTS isolation_probe (id INT PRIMARY KEY)",
    );
    await teacher.query(
      "CREATE TABLE IF NOT EXISTS isolation_probe (id INT PRIMARY KEY)",
    );
    await student.query("SELECT * FROM isolation_probe");
    await expectDenied(
      () =>
        student.query(
          `SELECT * FROM \`${teacherAllocation.database_name}\`.isolation_probe`,
        ),
      "Cross-workspace access",
    );
    await expectDenied(
      () =>
        student.query(
          "CREATE USER 'forbidden_user'@'%' IDENTIFIED BY 'forbidden-password'",
        ),
      "Server account administration",
    );
    const [grants] = await student.query<RowDataPacket[]>(
      "SHOW GRANTS FOR CURRENT_USER",
    );
    const grantLines = grants.map((row) => Object.values(row).join(" "));
    if (
      grantLines.some(
        (grant) =>
          grant.includes(teacherAllocation.database_name) ||
          grant.includes("GRANT OPTION") ||
          (grant.includes(" ON *.* ") && !grant.startsWith("GRANT USAGE ")),
      )
    )
      throw new Error("Workspace grants exceeded the allocated database.");
  } finally {
    await Promise.all([student.end(), teacher.end()]);
  }

  const reset = await api(
    studentToken,
    `/v1/workspaces/${studentWorkspaceId}/reset`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        reason: "Local replacement lifecycle verification",
      }),
    },
  );
  if (reset.status !== 202)
    throw new Error(`Workspace reset failed (${reset.status}).`);
  await waitUntilReady(studentToken, studentWorkspaceId);

  const platformAfterReset = createPool({
    uri: platformDatabaseUrl,
    connectionLimit: 1,
  });
  const [replacementRows] = await platformAfterReset.query<AllocationRow[]>(
    `SELECT workspace_id, database_name, credential_secret_ref
       FROM workspace_allocations
      WHERE workspace_id = ? AND released_at IS NULL`,
    [studentWorkspaceId],
  );
  await platformAfterReset.end();
  const replacement = replacementRows[0];
  if (
    !replacement ||
    replacement.database_name === studentAllocation.database_name
  )
    throw new Error("Reset did not activate a replacement allocation.");
  await expectDenied(
    () => createConnection(connectionOptions(studentCredential)),
    "Retired workspace credentials",
  );
  const cleanupCheck = createPool({
    uri: platformDatabaseUrl,
    connectionLimit: 1,
  });
  let cleanupComplete = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [cleanupRows] = await cleanupCheck.query<CleanupRow[]>(
      `SELECT cleanup_state FROM workspace_allocations WHERE database_name = ?`,
      [studentAllocation.database_name],
    );
    if (cleanupRows[0]?.cleanup_state === "complete") {
      cleanupComplete = true;
      break;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  await cleanupCheck.end();
  if (!cleanupComplete)
    throw new Error("Retired allocation cleanup was not persisted.");
  const replacementCredential = await loadCredential(
    replacement.credential_secret_ref,
  );
  const replacementConnection = await createConnection(
    connectionOptions(replacementCredential),
  );
  await replacementConnection.query("SELECT 1");
  await replacementConnection.end();

  console.log("Workspace provisioning smoke test passed.");
  console.log(
    "Verified: private accounts, scoped grants, cross-workspace denial, server-command denial, and replacement reset.",
  );
}

void main();
