import { z } from "zod";

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
}

export interface SqlClassifier {
  classify(sql: string, context: ClassificationContext): ClassificationResult;
}

// No parser implementation is included in Foundation. The interface exists so a
// later security-reviewed implementation can be replaced without coupling APIs
// to a specific parser library.
