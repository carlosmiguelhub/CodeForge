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
                    : `MySQL rejected the query (${(error as { code?: string }).code ?? "QUERY_FAILED"}).`,
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
