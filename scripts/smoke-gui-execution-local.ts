import { randomUUID } from "node:crypto";

import { ExecutionGrantSigner } from "@sqweb/execution";
import { createPool, type RowDataPacket } from "mysql2/promise";
import WebSocket from "ws";

const platformDatabaseUrl = process.env.PLATFORM_DATABASE_URL;
const poolInstanceId = process.env.GUI_SESSION_POOL_INSTANCE_ID;
const grantSecret = process.env.SQWEB_EXECUTION_GRANT_SECRET;
if (!platformDatabaseUrl || !poolInstanceId || !grantSecret)
  throw new Error("Local GUI execution smoke-test settings are required.");

const guiExecutionBaseUrl = "ws://127.0.0.1:8082";
const pool = createPool({ uri: platformDatabaseUrl, connectionLimit: 2 });
const signer = new ExecutionGrantSigner(grantSecret);

interface OwnerRow extends RowDataPacket {
  id: string;
  institution_id: string;
}

interface SessionStateRow extends RowDataPacket {
  state: string;
  failure_code: string | null;
}

interface AllocationRow extends RowDataPacket {
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

async function seedWorkspace(owner: OwnerRow) {
  const workspaceId = randomUUID();
  const fileId = randomUUID();
  const content = {
    files: [
      {
        id: fileId,
        name: "Main.java",
        sourceCode: `import javax.swing.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("gui-execution-api console smoke marker");\n        JFrame frame = new JFrame("Console Smoke Test");\n        frame.setSize(200, 150);\n        frame.setVisible(true);\n    }\n}\n`,
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

async function requestSession(owner: OwnerRow): Promise<string> {
  const sessionId = randomUUID();
  await pool.execute(
    `INSERT INTO gui_sessions
     (id, institution_id, owner_id, main_class_name, state, max_runtime_seconds)
     VALUES (?, ?, ?, 'Main', 'requested', 120)`,
    [sessionId, owner.institution_id, owner.id],
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

async function waitForCleanupComplete(sessionId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [rows] = await pool.query<AllocationRow[]>(
      `SELECT cleanup_state FROM gui_container_allocations WHERE session_id = ?`,
      [sessionId],
    );
    if (rows[0]?.cleanup_state === "complete") return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  }
  throw new Error(`Cleanup for session ${sessionId} did not complete in time.`);
}

function expectClose(url: string, expectedCode: number, label: string) {
  return new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("close", (code) => {
      if (code === expectedCode) resolve();
      else reject(new Error(`${label}: expected close code ${expectedCode}, got ${code}`));
    });
    socket.once("open", () => {
      // Some rejection paths only close after the upgrade succeeds — give
      // the server a moment to run its own verification before we'd
      // otherwise time out waiting for `close`.
    });
  });
}

async function main() {
  const owner = await ownerAccount();
  await ensurePoolInstance();
  await seedWorkspace(owner);
  const sessionId = await requestSession(owner);
  console.log("Session requested:", sessionId);

  const running = await waitForState(sessionId, ["running", "failed"], 20_000);
  if (running.state === "failed")
    throw new Error(`Session failed to provision: ${running.failure_code ?? "unknown"}`);
  console.log("Session is running.");

  const account = {
    id: owner.id,
    firebaseUid: "smoke-test-uid",
    email: "student@sqweb.local",
    displayName: "Smoke Test Student",
    institutionId: owner.institution_id,
    status: "active" as const,
    roles: ["student" as const],
    sectionId: null,
    authorizationVersion: 1,
  };
  const { token } = signer.issueGuiSession(account, sessionId, 120);

  // --- Reject a tampered grant ---
  await expectClose(
    `${guiExecutionBaseUrl}/v1/gui-sessions/${sessionId}/vnc?token=${token}x`,
    4401,
    "Tampered grant",
  );
  console.log("Tampered grant was rejected.");

  // --- Reject an expired grant ---
  const { token: expiredToken } = signer.issueGuiSession(account, sessionId, -5);
  await expectClose(
    `${guiExecutionBaseUrl}/v1/gui-sessions/${sessionId}/vnc?token=${expiredToken}`,
    4401,
    "Expired grant",
  );
  console.log("Expired grant was rejected.");

  // --- Console: real compiled-and-running app's stdout, proxied live ---
  const consoleText = await new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(
      `${guiExecutionBaseUrl}/v1/gui-sessions/${sessionId}/console?token=${token}`,
    );
    let buffer = "";
    const timer = setTimeout(
      () => reject(new Error("Console stream did not include the expected marker in time.")),
      15_000,
    );
    socket.on("message", (data) => {
      buffer += Buffer.from(data as Buffer).toString("utf8");
      if (buffer.includes("gui-execution-api console smoke marker")) {
        clearTimeout(timer);
        socket.close();
        resolve(buffer);
      }
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  if (!consoleText.includes("gui-execution-api console smoke marker"))
    throw new Error("Console stream did not carry the running app's real stdout.");
  console.log("Console route streamed the real container's stdout.");

  // --- VNC: real protocol bytes from the real x11vnc/websockify stack ---
  const vncBanner = await new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(
      `${guiExecutionBaseUrl}/v1/gui-sessions/${sessionId}/vnc?token=${token}`,
    );
    const timer = setTimeout(() => reject(new Error("No VNC banner received in time.")), 10_000);
    socket.once("message", (data) => {
      clearTimeout(timer);
      const text = Buffer.from(data as Buffer).toString("latin1");
      socket.close();
      resolve(text);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  if (!vncBanner.startsWith("RFB "))
    throw new Error(`Expected a real RFB protocol banner, got: ${JSON.stringify(vncBanner)}`);
  console.log("VNC route relayed the real server's RFB handshake banner:", vncBanner.trim());

  // --- Fast-path cleanup: closing the vnc connection tears the session down ---
  const stopSocket = new WebSocket(
    `${guiExecutionBaseUrl}/v1/gui-sessions/${sessionId}/vnc?token=${token}`,
  );
  await new Promise<void>((resolve) => stopSocket.once("open", resolve));
  stopSocket.close();
  await waitForCleanupComplete(sessionId, 15_000);
  const finalState = await waitForState(sessionId, ["stopped"], 5_000);
  if (finalState.state !== "stopped")
    throw new Error("Session was not marked stopped after the vnc socket closed.");
  console.log("Closing the vnc socket triggered the fast-path cleanup.");

  console.log("gui-execution-api smoke test passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
