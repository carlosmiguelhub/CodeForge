const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const appCheckToken = process.env.SQWEB_LOCAL_APP_CHECK_TOKEN;
if (!emulatorHost || !appCheckToken)
  throw new Error("Local execution smoke-test settings are required.");

const platformUrl = "http://127.0.0.1:8080";
const executionUrl = "http://127.0.0.1:8081";

async function signIn() {
  const response = await fetch(
    `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "student@sqweb.local",
        password: "Local-SQWeb-2026!",
        returnSecureToken: true,
      }),
    },
  );
  const payload = (await response.json()) as { idToken?: string };
  if (!response.ok || !payload.idToken)
    throw new Error("Local sign-in failed.");
  return payload.idToken;
}

function headers(token: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Firebase-AppCheck": appCheckToken!,
    ...extra,
  };
}

interface SmokePayload {
  grant?: unknown;
  state?: unknown;
  resultSets?: Array<{
    columns?: Array<{ name?: unknown }>;
    rows?: unknown[][];
  }>;
  error?: { code?: unknown; confirmation?: { token?: unknown } };
}

async function json(response: Response) {
  const payload = (await response.json()) as SmokePayload;
  return { response, payload };
}

async function grant(token: string, workspaceId: string) {
  const { response, payload } = await json(
    await fetch(`${platformUrl}/v1/execution-grants`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ workspaceId, requestedMode: "interactive" }),
    }),
  );
  if (!response.ok || typeof payload.grant !== "string")
    throw new Error(`Execution grant failed (${response.status}).`);
  return payload.grant;
}

async function execute(
  token: string,
  workspaceId: string,
  sql: string,
  confirmation?: string,
) {
  const capability = await grant(token, workspaceId);
  return json(
    await fetch(`${executionUrl}/v1/executions`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        executionId: crypto.randomUUID(),
        grant: capability,
        sql,
        selection: { mode: "script" },
        transactionMode: "auto",
        ...(confirmation ? { confirmation } : {}),
      }),
    }),
  );
}

async function main() {
  const token = await signIn();
  const workspaces = await fetch(`${platformUrl}/v1/workspaces`, {
    headers: headers(token),
  });
  const items = (await workspaces.json()) as Array<{
    id: string;
    state: string;
  }>;
  const workspace = items.find((item) => item.state === "ready");
  if (!workspace) throw new Error("No ready Student workspace exists.");

  const create = await execute(
    token,
    workspace.id,
    "CREATE TABLE IF NOT EXISTS m5_execution_probe (id INT PRIMARY KEY, label VARCHAR(40) NOT NULL)",
  );
  if (!create.response.ok || create.payload.state !== "successful")
    throw new Error(
      `Allowed DDL did not execute successfully: ${JSON.stringify(create.payload)}`,
    );

  const schemaGrant = await grant(token, workspace.id);
  const createdSchemaResponse = await fetch(
    `${executionUrl}/v1/workspaces/${workspace.id}/schema`,
    {
      headers: headers(token, {
        "X-SQWeb-Execution-Grant": schemaGrant,
      }),
    },
  );
  const createdSchema = (await createdSchemaResponse.json()) as {
    tables?: Array<{
      name?: string;
      columns?: Array<{ name?: string }>;
    }>;
  };
  const probeTable = createdSchema.tables?.find(
    (table) => table.name === "m5_execution_probe",
  );
  if (
    !createdSchemaResponse.ok ||
    probeTable?.columns?.map((column) => column.name).join(",") !== "id,label"
  )
    throw new Error("Schema discovery did not return named table columns.");

  const sampleId = Math.floor(Date.now() / 1000);
  const multi = await execute(
    token,
    workspace.id,
    `INSERT INTO m5_execution_probe (id, label) VALUES (${sampleId}, 'isolated'); SELECT id, label FROM m5_execution_probe WHERE id = ${sampleId}; SELECT COUNT(*) AS total FROM m5_execution_probe`,
  );
  if (
    !multi.response.ok ||
    multi.payload.state !== "successful" ||
    !Array.isArray(multi.payload.resultSets) ||
    multi.payload.resultSets.length !== 3 ||
    multi.payload.resultSets[1]?.columns?.[0]?.name !== "id" ||
    multi.payload.resultSets[1]?.rows?.[0]?.[0] !== sampleId ||
    multi.payload.resultSets[2]?.columns?.[0]?.name !== "total"
  )
    throw new Error("Bounded multi-result execution or rendering data failed.");

  const digits =
    "(SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)";
  const populate = await execute(
    token,
    workspace.id,
    `INSERT IGNORE INTO m5_execution_probe (id, label) SELECT 100000 + a.n + (10 * b.n) + (100 * c.n), 'limit probe' FROM ${digits} a CROSS JOIN ${digits} b CROSS JOIN ${digits} c`,
  );
  if (!populate.response.ok || populate.payload.state !== "successful")
    throw new Error("Result-limit probe data could not be created.");

  const limited = await execute(
    token,
    workspace.id,
    "SELECT id, label FROM m5_execution_probe ORDER BY id",
  );
  if (!limited.response.ok || limited.payload.state !== "limit_exceeded")
    throw new Error("The 1,000-row execution limit was not enforced.");

  const cancellationId = crypto.randomUUID();
  const cancellationGrant = await grant(token, workspace.id);
  const runningRequest = fetch(`${executionUrl}/v1/executions`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      executionId: cancellationId,
      grant: cancellationGrant,
      sql: "SELECT SUM(LENGTH(SHA2(CONCAT(a.id, ':', b.id, ':', c.id), 512))) AS deliberately_slow FROM m5_execution_probe a CROSS JOIN m5_execution_probe b CROSS JOIN m5_execution_probe c",
      selection: { mode: "current" },
      transactionMode: "auto",
    }),
  });
  let cancellation: Response | null = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const cancellationHeaders = new Headers(headers(token));
    cancellationHeaders.delete("Content-Type");
    cancellation = await fetch(
      `${executionUrl}/v1/executions/${cancellationId}`,
      { method: "DELETE", headers: cancellationHeaders },
    );
    if (cancellation.ok) break;
    if (cancellation.status !== 404)
      throw new Error(`Query cancellation failed (${cancellation.status}).`);
  }
  const cancelledResult = await json(await runningRequest);
  if (
    !cancellation?.ok ||
    !cancelledResult.response.ok ||
    cancelledResult.payload.state !== "cancelled"
  )
    throw new Error("A running query was not cancelled safely.");

  const crossSchema = await execute(
    token,
    workspace.id,
    "SELECT * FROM mysql.user",
  );
  if (
    crossSchema.response.status !== 403 ||
    crossSchema.payload.error?.code !== "SQL_POLICY_DENIED"
  )
    throw new Error("Cross-schema SQL was not denied by policy.");

  const serverCommand = await execute(
    token,
    workspace.id,
    "CREATE USER 'forbidden'@'%' IDENTIFIED BY 'forbidden-password'",
  );
  if (
    serverCommand.response.status !== 403 ||
    serverCommand.payload.error?.code !== "SQL_POLICY_DENIED"
  )
    throw new Error("Server account SQL was not denied by policy.");

  const requestedDrop = await execute(
    token,
    workspace.id,
    "DROP TABLE m5_execution_probe",
  );
  const confirmation = requestedDrop.payload.error?.confirmation?.token;
  if (requestedDrop.response.status !== 409 || typeof confirmation !== "string")
    throw new Error("Destructive SQL did not require confirmation.");
  const confirmedDrop = await execute(
    token,
    workspace.id,
    "DROP TABLE m5_execution_probe",
    confirmation,
  );
  if (
    !confirmedDrop.response.ok ||
    confirmedDrop.payload.state !== "successful"
  )
    throw new Error(
      `Confirmed destructive SQL failed: ${JSON.stringify(confirmedDrop.payload)}`,
    );

  const capability = await grant(token, workspace.id);
  const schema = await fetch(
    `${executionUrl}/v1/workspaces/${workspace.id}/schema`,
    { headers: headers(token, { "X-SQWeb-Execution-Grant": capability }) },
  );
  if (!schema.ok) throw new Error("Authorized schema discovery failed.");
  const history = await fetch(
    `${executionUrl}/v1/query-history?workspaceId=${workspace.id}`,
    { headers: headers(token) },
  );
  const historyItems = (await history.json()) as unknown[];
  if (!history.ok || historyItems.length < 3)
    throw new Error("Query execution history was not recorded.");

  console.log("SQL execution smoke test passed.");
  console.log(
    "Verified: grants, real MySQL execution, multiple results, limits, cancellation, schema discovery, policy denial, destructive confirmation, and history.",
  );
}

void main();
