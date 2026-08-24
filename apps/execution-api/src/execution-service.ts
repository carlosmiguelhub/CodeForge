import { randomUUID } from "node:crypto";

import { AuthorizationError, type VerifiedIdentity } from "@sqweb/auth";
import {
  interactiveExecutionLimits,
  type ExecutionRequest,
  type ExecutionResponse,
} from "@sqweb/contracts";
import type {
  ExecutionRepository,
  ExecutionGrantSigner,
} from "@sqweb/execution";
import type { SqlClassifier } from "@sqweb/sql-classifier";
import type { WorkspaceSecretStore } from "@sqweb/workspace";

import {
  ExecutionCancelledError,
  ExecutionLimitError,
  MySqlRunner,
} from "./mysql-runner";

// MySQL's own FK error text names the referencing table, just in two
// different shapes depending on the statement that triggered it:
//   DROP TABLE parent:  "... on table 'enrollments'."
//   DELETE/UPDATE a referenced row: "(`db`.`enrollments`, CONSTRAINT ...)"
function extractReferencingTable(sqlMessage: string): string | undefined {
  const dropMatch = /on table '([^']+)'/i.exec(sqlMessage);
  if (dropMatch) return dropMatch[1];
  const rowMatch = /`[^`]+`\.`([^`]+)`,\s*CONSTRAINT/i.exec(sqlMessage);
  if (rowMatch) return rowMatch[1];
  return undefined;
}

// Translates common MySQL error codes into plain-English guidance so
// students see what went wrong and how to fix it, not just a bare error
// code. The original MySQL message is still appended for anyone who wants
// the technical detail.
function friendlyMysqlMessage(error: {
  code?: string;
  sqlMessage?: string;
}): string {
  const detail = error.sqlMessage ? ` (${error.sqlMessage})` : "";
  switch (error.code) {
    case "ER_FK_CANNOT_DROP_PARENT":
    case "ER_ROW_IS_REFERENCED":
    case "ER_ROW_IS_REFERENCED_2": {
      const referencingTable = extractReferencingTable(error.sqlMessage ?? "");
      const suggestion = referencingTable
        ? ` Drop or clear \`${referencingTable}\` first, then try again.`
        : " Drop or alter the table that references it first, then try again.";
      return `Another table still has a foreign key pointing to this one.${suggestion}${detail}`;
    }
    case "ER_NO_REFERENCED_ROW":
    case "ER_NO_REFERENCED_ROW_2":
      return `That value does not exist in the table it references — insert the parent row first.${detail}`;
    case "ER_DUP_ENTRY":
      return `That value already exists and must be unique.${detail}`;
    case "ER_BAD_FIELD_ERROR":
      return `Unknown column referenced in the query — check the spelling and table structure.${detail}`;
    case "ER_NO_SUCH_TABLE":
      return `That table does not exist in this workspace.${detail}`;
    case "ER_TABLE_EXISTS_ERROR":
      return `A table with that name already exists.${detail}`;
    case "ER_PARSE_ERROR":
      return `MySQL could not parse this SQL — check the syntax.${detail}`;
    case "ER_BAD_NULL_ERROR":
      return `A required (NOT NULL) column was left empty.${detail}`;
    case "ER_DATA_TOO_LONG":
      return `A value is too long for its column.${detail}`;
    default:
      return `MySQL rejected the query (${error.code ?? "QUERY_FAILED"}).${detail}`;
  }
}

export class ConfirmationRequiredError extends Error {
  readonly statusCode = 409;
  constructor(
    readonly token: string,
    readonly statementHash: string,
  ) {
    super("Destructive SQL requires explicit confirmation.");
  }
}

export class ExecutionService {
  constructor(
    private readonly dependencies: {
      signer: ExecutionGrantSigner;
      classifier: SqlClassifier;
      repository: ExecutionRepository;
      secrets: WorkspaceSecretStore;
      runner: MySqlRunner;
    },
  ) {}

  async execute(
    identity: VerifiedIdentity,
    request: ExecutionRequest,
  ): Promise<ExecutionResponse> {
    if (request.transactionMode === "manual")
      throw new AuthorizationError(
        "MANUAL_TRANSACTION_UNAVAILABLE",
        "Manual transactions require a persistent session and are not enabled yet.",
        409,
      );
    const grant = this.dependencies.signer.verifyExecution(
      request.grant,
      identity.uid,
    );
    const classification = this.dependencies.classifier.classify(request.sql, {
      policyVersion: "mvp-1",
      allowedStatementClasses: [
        "read",
        "write",
        "ddl",
        "transaction",
        "metadata",
        "explain",
      ],
      defaultDatabaseAlias: "workspace",
    });
    if (classification.decision === "deny")
      throw new AuthorizationError(
        "SQL_POLICY_DENIED",
        "This SQL statement is not permitted in the workspace.",
        403,
      );
    if (
      classification.statementCount > interactiveExecutionLimits.maxStatements
    )
      throw new AuthorizationError(
        "STATEMENT_LIMIT_EXCEEDED",
        `A maximum of ${interactiveExecutionLimits.maxStatements} statements is allowed.`,
        400,
      );
    if (classification.destructive) {
      if (!request.confirmation) {
        throw new ConfirmationRequiredError(
          this.dependencies.signer.issueConfirmation(
            identity.uid,
            grant.workspaceId,
            classification.normalizedStatementHash,
          ),
          classification.normalizedStatementHash,
        );
      }
      this.dependencies.signer.verifyConfirmation(
        request.confirmation,
        identity.uid,
        grant.workspaceId,
        classification.normalizedStatementHash,
      );
    }

    const executionId = request.executionId ?? randomUUID();
    const started = Date.now();
    const access = await this.dependencies.repository.authorizeAndStart({
      executionId,
      firebaseUid: identity.uid,
      grant,
      statementHash: classification.normalizedStatementHash,
      statementClasses: classification.statementClasses,
    });
    try {
      const credential = await this.dependencies.secrets.get(
        access.credentialSecretRef,
      );
      const result = await this.dependencies.runner.run(
        executionId,
        credential,
        request.sql,
        interactiveExecutionLimits,
      );
      await this.dependencies.repository.finish({
        executionId,
        state: "successful",
        durationMs: result.durationMs,
        rowsReturned: result.rowsReturned,
        bytesReturned: result.bytesReturned,
      });
      return {
        executionId,
        state: "successful",
        resultSets: [...result.resultSets],
        messages: [],
        statistics: {
          durationMs: result.durationMs,
          rowsReturned: result.rowsReturned,
          bytesReturned: result.bytesReturned,
          statementCount: classification.statementCount,
        },
      };
    } catch (error) {
      const state =
        error instanceof ExecutionLimitError
          ? "limit_exceeded"
          : error instanceof ExecutionCancelledError
            ? "cancelled"
            : (error as { code?: string }).code === "PROTOCOL_SEQUENCE_TIMEOUT"
              ? "timed_out"
              : "failed";
      const durationMs = Date.now() - started;
      await this.dependencies.repository.finish({
        executionId,
        state,
        durationMs,
        rowsReturned: 0,
        bytesReturned: 0,
        errorCategory:
          error instanceof ExecutionLimitError
            ? error.code
            : ((error as { code?: string }).code ?? state.toUpperCase()),
      });
      return {
        executionId,
        state,
        resultSets: [],
        messages: [
          {
            severity: "error",
            text:
              state === "timed_out"
                ? "The query exceeded the 10-second execution limit."
                : state === "cancelled"
                  ? "The query was cancelled."
                  : state === "limit_exceeded"
                    ? "The query exceeded a result safety limit."
                    : friendlyMysqlMessage(
                        error as { code?: string; sqlMessage?: string },
                      ),
          },
        ],
        statistics: {
          durationMs,
          rowsReturned: 0,
          bytesReturned: 0,
          statementCount: classification.statementCount,
        },
      };
    }
  }

  async schema(identity: VerifiedIdentity, grantToken: string) {
    const grant = this.dependencies.signer.verifyExecution(
      grantToken,
      identity.uid,
    );
    const access = await this.dependencies.repository.resolveForSchema(
      identity.uid,
      grant,
    );
    return this.dependencies.runner.schema(
      await this.dependencies.secrets.get(access.credentialSecretRef),
    );
  }

  async cancel(identity: VerifiedIdentity, executionId: string) {
    const permitted = await this.dependencies.repository.requestCancellation(
      executionId,
      identity.uid,
    );
    if (!permitted)
      throw new AuthorizationError(
        "EXECUTION_NOT_FOUND",
        "The running execution was not found.",
        404,
      );
    await this.dependencies.runner.cancel(executionId);
    return { executionId, state: "cancelled" as const };
  }

  history(identity: VerifiedIdentity, workspaceId: string) {
    return this.dependencies.repository.listHistory(identity.uid, workspaceId);
  }
}
