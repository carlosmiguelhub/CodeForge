import type { ExecutionState } from "@sqweb/contracts";

export interface ExecutionGrantPayload {
  readonly kind: "execution";
  readonly uid: string;
  readonly accountId: string;
  readonly institutionId: string;
  readonly workspaceId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly nonce: string;
}

export interface ConfirmationPayload {
  readonly kind: "confirmation";
  readonly uid: string;
  readonly workspaceId: string;
  readonly statementHash: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly nonce: string;
}

export interface AuthorizedWorkspaceExecution {
  readonly actorId: string;
  readonly institutionId: string;
  readonly workspaceId: string;
  readonly credentialSecretRef: string;
}

export interface QueryHistoryItem {
  readonly id: string;
  readonly workspaceId: string;
  readonly state: ExecutionState;
  readonly statementClasses: readonly string[];
  readonly durationMs: number | null;
  readonly rowsReturned: number;
  readonly bytesReturned: number;
  readonly startedAt: string;
}

export interface ExecutionRepository {
  authorizeAndStart(input: {
    executionId: string;
    firebaseUid: string;
    grant: ExecutionGrantPayload;
    statementHash: string;
    statementClasses: readonly string[];
  }): Promise<AuthorizedWorkspaceExecution>;
  finish(input: {
    executionId: string;
    state: ExecutionState;
    durationMs: number;
    rowsReturned: number;
    bytesReturned: number;
    errorCategory?: string;
  }): Promise<void>;
  requestCancellation(
    executionId: string,
    firebaseUid: string,
  ): Promise<boolean>;
  listHistory(
    firebaseUid: string,
    workspaceId: string,
  ): Promise<readonly QueryHistoryItem[]>;
  resolveForSchema(
    firebaseUid: string,
    grant: ExecutionGrantPayload,
  ): Promise<AuthorizedWorkspaceExecution>;
}
