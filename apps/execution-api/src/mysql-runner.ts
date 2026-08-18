import type {
  ExecutionLimits,
  ExecutionResultSet,
  WorkspaceSchemaResponse,
} from "@sqweb/contracts";
import type { WorkspaceCredential } from "@sqweb/workspace";
import {
  createConnection,
  type Connection,
  type FieldPacket,
  type Query,
} from "mysql2";

export class ExecutionLimitError extends Error {
  constructor(
    readonly code: "ROW_LIMIT" | "OUTPUT_LIMIT" | "RESULT_SET_LIMIT",
  ) {
    super(code);
    this.name = "ExecutionLimitError";
  }
}

export class ExecutionCancelledError extends Error {
  constructor() {
    super("EXECUTION_CANCELLED");
    this.name = "ExecutionCancelledError";
  }
}

function connectionOptions(credential: WorkspaceCredential) {
  return {
    host: credential.host,
    port: credential.port,
    database: credential.database,
    user: credential.username,
    password: credential.password,
    multipleStatements: true,
    rowsAsArray: true,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 5000,
  } as const;
}

function safeCell(value: unknown): string | number | boolean | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `base64:${value.toString("base64")}`;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value).slice(0, 10_000);
}

const mysqlTypeNames: Readonly<Record<number, string>> = {
  0: "DECIMAL",
  1: "TINYINT",
  2: "SMALLINT",
  3: "INT",
  4: "FLOAT",
  5: "DOUBLE",
  6: "NULL",
  7: "TIMESTAMP",
  8: "BIGINT",
  9: "MEDIUMINT",
  10: "DATE",
  11: "TIME",
  12: "DATETIME",
  13: "YEAR",
  15: "VARCHAR",
  16: "BIT",
  245: "JSON",
  246: "DECIMAL",
  249: "TINYBLOB",
  250: "MEDIUMBLOB",
  251: "LONGBLOB",
  252: "TEXT/BLOB",
  253: "VARCHAR",
  254: "CHAR/BINARY",
  255: "GEOMETRY",
};

function mysqlTypeName(type: number | undefined) {
  if (type === undefined) return "UNKNOWN";
  return mysqlTypeNames[type] ?? `MYSQL_${type}`;
}

function connect(credential: WorkspaceCredential): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const connection = createConnection(connectionOptions(credential));
    connection.connect((error) => {
      if (error) {
        connection.destroy();
        reject(error);
      } else resolve(connection);
    });
  });
}

export interface RunResult {
  readonly resultSets: readonly ExecutionResultSet[];
  readonly rowsReturned: number;
  readonly bytesReturned: number;
  readonly durationMs: number;
}

export class MySqlRunner {
  private readonly active = new Map<
    string,
    {
      connection: Connection;
      credential: WorkspaceCredential;
      cancel?: () => void;
    }
  >();
  private readonly cancelled = new Set<string>();

  async cancel(executionId: string) {
    const active = this.active.get(executionId);
    if (!active) return false;
    this.cancelled.add(executionId);
    let control: Connection | null = null;
    try {
      control = await connect(active.credential);
      await control
        .promise()
        .query(`KILL QUERY ${Number(active.connection.threadId)}`);
    } catch {
      // Closing the execution connection remains the safe fallback.
    } finally {
      control?.destroy();
      if (active.cancel) active.cancel();
      else active.connection.destroy();
    }
    return true;
  }

  async run(
    executionId: string,
    credential: WorkspaceCredential,
    sql: string,
    limits: ExecutionLimits,
  ): Promise<RunResult> {
    const started = Date.now();
    const connection = await connect(credential);
    const active: {
      connection: Connection;
      credential: WorkspaceCredential;
      cancel?: () => void;
    } = {
      connection,
      credential,
    };
    this.active.set(executionId, active);
    const resultSets: ExecutionResultSet[] = [];
    let rowsReturned = 0;
    let bytesReturned = 0;

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let nextFieldResultIndex = 0;
        let currentEventResultIndex = 0;
        const stop = (error: Error) => {
          if (settled) return;
          settled = true;
          connection.destroy();
          reject(error);
        };
        active.cancel = () => stop(new ExecutionCancelledError());
        const query: Query = connection.query({
          sql,
          timeout: limits.timeoutMs,
          rowsAsArray: true,
          dateStrings: true,
          supportBigNumbers: true,
          bigNumberStrings: true,
        });
        query.on("fields", (fields: FieldPacket[]) => {
          const index = nextFieldResultIndex;
          currentEventResultIndex = index;
          nextFieldResultIndex += 1;
          if (!Array.isArray(fields)) return;
          if (index >= limits.maxResultSets)
            return stop(new ExecutionLimitError("RESULT_SET_LIMIT"));
          resultSets[index] ??= {
            columns: fields.map((field) => ({
              name: field.name,
              type: mysqlTypeName(field.type),
            })),
            rows: [],
            affectedRows: 0,
            warningCount: 0,
            truncated: false,
          };
        });
        query.on("result", (value: unknown, emittedIndex?: number) => {
          const index = emittedIndex ?? currentEventResultIndex;
          if (index >= limits.maxResultSets)
            return stop(new ExecutionLimitError("RESULT_SET_LIMIT"));
          const header = value as {
            affectedRows?: number;
            warningStatus?: number;
          };
          if (
            !Array.isArray(value) &&
            typeof header.affectedRows === "number"
          ) {
            resultSets[index] ??= {
              columns: [],
              rows: [],
              affectedRows: header.affectedRows,
              warningCount: header.warningStatus ?? 0,
              truncated: false,
            };
            return;
          }
          const result = (resultSets[index] ??= {
            columns: [],
            rows: [],
            affectedRows: 0,
            warningCount: 0,
            truncated: false,
          });
          if (result.rows.length >= limits.maxRowsPerResult) {
            result.truncated = true;
            return stop(new ExecutionLimitError("ROW_LIMIT"));
          }
          const row = (value as unknown[]).map(safeCell);
          const rowBytes = Buffer.byteLength(JSON.stringify(row));
          if (bytesReturned + rowBytes > limits.maxOutputBytes)
            return stop(new ExecutionLimitError("OUTPUT_LIMIT"));
          result.rows.push(row);
          rowsReturned += 1;
          bytesReturned += rowBytes;
        });
        query.once("error", (error) =>
          stop(
            this.cancelled.delete(executionId)
              ? new ExecutionCancelledError()
              : error,
          ),
        );
        query.once("end", () => {
          if (settled) return;
          settled = true;
          resolve();
        });
      });
      return {
        resultSets,
        rowsReturned,
        bytesReturned,
        durationMs: Date.now() - started,
      };
    } finally {
      this.active.delete(executionId);
      this.cancelled.delete(executionId);
      connection.destroy();
    }
  }

  async schema(
    credential: WorkspaceCredential,
  ): Promise<WorkspaceSchemaResponse> {
    const connection = await connect(credential);
    try {
      const [tables, columns] = await Promise.all([
        connection.promise().query(
          {
            sql: `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
                    FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME LIMIT 200`,
            rowsAsArray: false,
          },
          [credential.database],
        ),
        connection.promise().query(
          {
            sql: `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS name,
                         DATA_TYPE AS data_type, IS_NULLABLE AS nullable, COLUMN_KEY AS column_key
                    FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION LIMIT 2000`,
            rowsAsArray: false,
          },
          [credential.database],
        ),
      ]);
      const columnRows = columns[0] as Array<Record<string, string>>;
      return {
        tables: (tables[0] as Array<Record<string, string>>).map((table) => ({
          name: table.name ?? "",
          type: table.type === "VIEW" ? "view" : "table",
          columns: columnRows
            .filter((column) => column.table_name === table.name)
            .map((column) => ({
              name: column.name ?? "",
              dataType: column.data_type ?? "",
              nullable: column.nullable === "YES",
              key: column.column_key ?? "",
            })),
        })),
      };
    } finally {
      connection.destroy();
    }
  }
}
