import { z } from "zod";
import { createHash } from "node:crypto";
import NodeSqlParser from "node-sql-parser";

export const statementDecisionSchema = z.enum(["allow", "deny"]);
export type StatementDecision = z.infer<typeof statementDecisionSchema>;

export const corpusCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().min(1),
  sql: z.string().min(1),
  expectedDecision: statementDecisionSchema,
  category: z.enum([
    "read",
    "write",
    "ddl",
    "transaction",
    "cross_schema",
    "account_admin",
    "server_admin",
    "file_access",
    "persistent_code",
    "parser_evasion",
  ]),
});

export const corpusSchema = z.array(corpusCaseSchema).min(1);
export type CorpusCase = z.infer<typeof corpusCaseSchema>;

export interface ClassificationContext {
  readonly policyVersion: string;
  readonly allowedStatementClasses: readonly string[];
  readonly defaultDatabaseAlias: string;
}

export interface ClassificationResult {
  readonly decision: StatementDecision;
  readonly normalizedStatementHash: string;
  readonly statementClasses: readonly string[];
  readonly referencedObjects: readonly string[];
  readonly denialCode?: string;
  readonly statementCount: number;
  readonly destructive: boolean;
}

export interface SqlClassifier {
  classify(sql: string, context: ClassificationContext): ClassificationResult;
}

type AstNode = Record<string, unknown>;

const dangerousFunctions = new Set([
  "benchmark",
  "get_lock",
  "is_free_lock",
  "is_used_lock",
  "load_file",
  "master_pos_wait",
  "name_const",
  "release_all_locks",
  "release_lock",
  "sleep",
]);

function walk(value: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as AstNode;
  visit(node);
  for (const child of Object.values(node)) walk(child, visit);
}

function statementClass(node: AstNode): string | null {
  const type = String(node.type ?? "").toLowerCase();
  if (type === "select") return "read";
  if (["insert", "replace", "update", "delete"].includes(type)) return "write";
  if (type === "transaction") return "transaction";
  if (type === "explain") return "explain";
  if (["show", "desc"].includes(type)) return "metadata";
  if (["create", "alter", "drop", "truncate", "rename"].includes(type)) {
    const keyword = String(node.keyword ?? "table").toLowerCase();
    return ["table", "index", "view"].includes(keyword) ? "ddl" : null;
  }
  return null;
}

function deny(
  hash: string,
  statementCount: number,
  classes: readonly string[],
  objects: readonly string[],
  denialCode: string,
): ClassificationResult {
  return {
    decision: "deny",
    normalizedStatementHash: hash,
    statementClasses: classes,
    referencedObjects: objects,
    denialCode,
    statementCount,
    destructive: false,
  };
}

export class MySqlParserClassifier implements SqlClassifier {
  private readonly parser = new NodeSqlParser.Parser();

  classify(sql: string, context: ClassificationContext): ClassificationResult {
    let parsed: unknown;
    try {
      parsed = this.parser.astify(sql, { database: "MySQL" });
    } catch {
      return deny(
        createHash("sha256").update(sql).digest("hex"),
        0,
        [],
        [],
        "SQL_PARSE_FAILED",
      );
    }
    const statements = (Array.isArray(parsed) ? parsed : [parsed]).filter(
      (statement): statement is AstNode =>
        Boolean(statement && typeof statement === "object"),
    );
    const normalizedStatementHash = createHash("sha256")
      .update(JSON.stringify(statements))
      .digest("hex");
    if (statements.length === 0)
      return deny(normalizedStatementHash, 0, [], [], "EMPTY_OR_COMMENT_ONLY");

    const classes: string[] = [];
    const objects = new Set<string>();
    let unsafeReference = false;
    let unsafeFunction = false;
    let serverFileAccess = false;
    let destructive = false;

    for (const statement of statements) {
      const classification = statementClass(statement);
      if (!classification)
        return deny(
          normalizedStatementHash,
          statements.length,
          classes,
          [...objects],
          "STATEMENT_CLASS_DENIED",
        );
      classes.push(classification);
      if (["drop", "truncate"].includes(String(statement.type).toLowerCase()))
        destructive = true;

      walk(statement, (node) => {
        if (typeof node.db === "string" && node.db.length > 0) {
          objects.add(`${node.db}.${String(node.table ?? "")}`);
          if (node.db !== context.defaultDatabaseAlias) unsafeReference = true;
        } else if (typeof node.table === "string" && node.table.length > 0) {
          objects.add(node.table);
        }
        const functionName =
          typeof node.name === "string"
            ? node.name
            : typeof (node.name as AstNode | undefined)?.name === "string"
              ? String((node.name as AstNode).name)
              : null;
        if (functionName && dangerousFunctions.has(functionName.toLowerCase()))
          unsafeFunction = true;
        if (
          String(node.type ?? "").toLowerCase() === "into" ||
          ["outfile", "dumpfile"].includes(
            String(node.keyword ?? "").toLowerCase(),
          )
        )
          serverFileAccess = true;
      });
    }

    if (unsafeReference)
      return deny(
        normalizedStatementHash,
        statements.length,
        classes,
        [...objects],
        "CROSS_SCHEMA_DENIED",
      );
    if (unsafeFunction || serverFileAccess)
      return deny(
        normalizedStatementHash,
        statements.length,
        classes,
        [...objects],
        "DANGEROUS_SQL_DENIED",
      );
    if (
      classes.some((value) => !context.allowedStatementClasses.includes(value))
    )
      return deny(
        normalizedStatementHash,
        statements.length,
        classes,
        [...objects],
        "POLICY_DENIED",
      );
    return {
      decision: "allow",
      normalizedStatementHash,
      statementClasses: classes,
      referencedObjects: [...objects],
      statementCount: statements.length,
      destructive,
    };
  }
}
