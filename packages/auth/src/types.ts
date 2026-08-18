import type {
  AccountProfile,
  AccountStatus,
  RequestedRegistrationRole,
} from "@sqweb/contracts";

export type { AccountProfile } from "@sqweb/contracts";

export interface VerifiedIdentity {
  readonly uid: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

export interface RegistrationInput {
  readonly identity: VerifiedIdentity;
  readonly institutionId: string;
  readonly displayName: string;
  readonly requestedRole: RequestedRegistrationRole;
}

export interface AccountStatusChange {
  readonly targetFirebaseUid: string;
  readonly actor: AccountProfile;
  readonly reason: string;
  readonly nextStatus: Extract<
    AccountStatus,
    "active" | "suspended" | "deactivated"
  >;
}

export interface TokenVerifier {
  verifyIdToken(
    token: string,
    checkRevoked: boolean,
  ): Promise<VerifiedIdentity>;
}

export interface AppCheckVerifier {
  verifyToken(token: string): Promise<void>;
}

export interface ClaimsWriter {
  writeClaims(account: AccountProfile): Promise<void>;
}

export interface AccountRepository {
  findByFirebaseUid(firebaseUid: string): Promise<AccountProfile | null>;
  listPending(institutionId: string): Promise<readonly AccountProfile[]>;
  register(input: RegistrationInput): Promise<AccountProfile>;
  changeStatus(input: AccountStatusChange): Promise<AccountProfile>;
}

export interface AuditSink {
  record(event: {
    readonly actorId: string;
    readonly action: string;
    readonly targetId: string;
    readonly result: "succeeded" | "denied" | "failed";
    readonly reason?: string;
  }): Promise<void>;
}
