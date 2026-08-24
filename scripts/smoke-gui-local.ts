import { randomUUID } from "node:crypto";

import Docker from "dockerode";
import { createPool, type RowDataPacket } from "mysql2/promise";

const platformDatabaseUrl = process.env.PLATFORM_DATABASE_URL;
const poolInstanceId = process.env.GUI_SESSION_POOL_INSTANCE_ID;
if (!platformDatabaseUrl || !poolInstanceId)
  throw new Error("Local GUI session smoke-test settings are required.");

const pool = createPool({ uri: platformDatabaseUrl, connectionLimit: 2 });
const docker = new Docker();

interface OwnerRow extends RowDataPacket {
  id: string;
  institution_id: string;
}

interface SessionStateRow extends RowDataPacket {
  state: string;
  failure_code: string | null;
}

interface AllocationRow extends RowDataPacket {
  id: string;
  container_ref: string;
  internal_host: string;
  websockify_port: number;
  cleanup_state: string;
}

async function ownerAccount(): Promise<OwnerRow> {
  const [rows] = await pool.query<OwnerRow[]>(
    `SELECT u.id, m.institution_id
       FROM users u
       JOIN institution_memberships m ON m.user_id = u.id
      WHERE u.email = 'student@sqweb.local' LIMIT 1`,
  );
  const row = rows[0];
  if (!row)
    throw new Error(
      "student@sqweb.local was not found — run npm run local:bootstrap first.",
    );
  return row;
}

async function ensurePoolInstance() {
  await pool.execute(
    `INSERT INTO gui_session_pool_instances
     (id, environment, region, service_ref, state, session_count, capacity_json)
     VALUES (?, 'local', 'local', 'docker-desktop', 'active', 0, JSON_OBJECT())
     ON DUPLICATE KEY UPDATE state = 'active'`,
    [poolInstanceId],
  );
}

async function seedWorkspace(owner: OwnerRow, label: string) {
  const workspaceId = randomUUID();
  const fileId = randomUUID();
  const content = {
    files: [
      {
        id: fileId,
        name: "Main.java",
        sourceCode: `import javax.swing.*;\nimport java.awt.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        JFrame frame = new JFrame("Smoke Test");\n        frame.setSize(300, 200);\n        frame.add(new JLabel("${label}", SwingConstants.CENTER));\n        frame.setVisible(true);\n    }\n}\n`,
      },
    ],
    openFileIds: [fileId],
    activeFileId: fileId,
    mainFileId: fileId,
  };
  await pool.execute(
    `INSERT INTO java_gui_workspaces (id, institution_id, owner_id, content)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE content = VALUES(content)`,
    [workspaceId, owner.institution_id, owner.id, JSON.stringify(content)],
  );
}

async function requestSession(
  owner: OwnerRow,
  maxRuntimeSeconds: number,
): Promise<string> {
  const sessionId = randomUUID();
  await pool.execute(
    `INSERT INTO gui_sessions
     (id, institution_id, owner_id, main_class_name, state, max_runtime_seconds)
     VALUES (?, ?, ?, 'Main', 'requested', ?)`,
    [sessionId, owner.institution_id, owner.id, maxRuntimeSeconds],
  );
  return sessionId;
}

async function waitForState(
  sessionId: string,
  targetStates: readonly string[],
  timeoutMs: number,
): Promise<SessionStateRow> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [rows] = await pool.query<SessionStateRow[]>(
      `SELECT state, failure_code FROM gui_sessions WHERE id = ?`,
      [sessionId],
    );
    const row = rows[0];
    if (row && targetStates.includes(row.state)) return row;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  }
  throw new Error(
    `Session ${sessionId} did not reach [${targetStates.join(", ")}] in time.`,
  );
}

async function allocationFor(sessionId: string): Promise<AllocationRow> {
  const [rows] = await pool.query<AllocationRow[]>(
    `SELECT id, container_ref, internal_host, websockify_port, cleanup_state
       FROM gui_container_allocations WHERE session_id = ?`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) throw new Error(`No allocation recorded for session ${sessionId}.`);
  return row;
}

async function probeTcp(host: string, port: number): Promise<boolean> {
  const { connect } = await import("node:net");
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 2000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForCleanupComplete(sessionId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [rows] = await pool.query<AllocationRow[]>(
      `SELECT id, container_ref, internal_host, websockify_port, cleanup_state
         FROM gui_container_allocations WHERE session_id = ?`,
      [sessionId],
    );
    if (rows[0]?.cleanup_state === "complete") return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  }
  throw new Error(`Cleanup for session ${sessionId} did not complete in time.`);
}

async function assertContainerGone(containerRef: string) {
  try {
    await docker.getContainer(containerRef).inspect();
    throw new Error(`Container ${containerRef} still exists after cleanup.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Container "))
      throw error;
    // dockerode throws a 404-status error for an unknown container — that's
    // the expected outcome here.
  }
}

async function main() {
  const owner = await ownerAccount();
  await ensurePoolInstance();

  // --- Session A: request -> provisioning -> running -> explicit stop ---
  await seedWorkspace(owner, "Explicit stop path");
  const stopSessionId = await requestSession(owner, 120);
  console.log("Session A requested:", stopSessionId);

  await waitForState(stopSessionId, ["provisioning", "failed"], 10_000);
  const runningRow = await waitForState(
    stopSessionId,
    ["running", "failed"],
    20_000,
  );
  if (runningRow.state === "failed")
    throw new Error(
      `Session A failed to provision: ${runningRow.failure_code ?? "unknown"}`,
    );
  console.log("Session A is running.");

  const allocationA = await allocationFor(stopSessionId);
  if (allocationA.cleanup_state !== "active")
    throw new Error("Session A's allocation was not recorded as active.");
  const reachable = await probeTcp(
    allocationA.internal_host,
    allocationA.websockify_port,
  );
  if (!reachable)
    throw new Error("Session A's websockify port was not reachable.");
  console.log("Session A's container is reachable over TCP.");

  // Simulates gui-execution-api's fast-path cleanup trigger (Phase 3),
  // which will run this exact pair of updates on the vnc WebSocket's
  // close event.
  await pool.execute(
    `UPDATE gui_container_allocations SET cleanup_state = 'pending' WHERE id = ?`,
    [allocationA.id],
  );
  await pool.execute(
    `UPDATE gui_sessions SET state = 'stopped' WHERE id = ? AND state = 'running'`,
    [stopSessionId],
  );
  console.log("Session A marked stopped — waiting for cleanup...");
  await waitForCleanupComplete(stopSessionId, 15_000);
  await assertContainerGone(allocationA.container_ref);
  console.log("Session A's container was torn down after explicit stop.");

  // --- Session B: request -> running -> safety-net expiry (no manual stop) ---
  await seedWorkspace(owner, "Safety-net expiry path");
  const expirySessionId = await requestSession(owner, 3);
  console.log("Session B requested (3s runtime):", expirySessionId);

  const expiryRunningRow = await waitForState(
    expirySessionId,
    ["running", "failed"],
    20_000,
  );
  if (expiryRunningRow.state === "failed")
    throw new Error(
      `Session B failed to provision: ${expiryRunningRow.failure_code ?? "unknown"}`,
    );
  const allocationB = await allocationFor(expirySessionId);
  console.log("Session B is running — waiting for it to expire on its own...");

  const expiredRow = await waitForState(expirySessionId, ["expired"], 20_000);
  if (expiredRow.state !== "expired")
    throw new Error("Session B was not reaped by the safety-net sweep.");
  await waitForCleanupComplete(expirySessionId, 15_000);
  await assertContainerGone(allocationB.container_ref);
  console.log("Session B was reaped by the safety-net sweep and torn down.");

  console.log("GUI session provisioning smoke test passed.");
  console.log(
    "Verified: requested->provisioning->running, TCP reachability, explicit-stop cleanup, and unattended expiry cleanup.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
