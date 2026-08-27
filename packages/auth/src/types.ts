import type {
  AccountProfile,
  AccountStatus,
  RequestedRegistrationRole,
  Role,
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
  readonly sectionId?: string | undefined;
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

export interface AccountListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string | undefined;
  readonly role?: Role | undefined;
  readonly status?: AccountStatus | undefined;
  readonly sectionId?: string | undefined;
}

export interface AccountListResult {
  readonly items: readonly AccountProfile[];
  readonly total: number;
}

export interface AdminAccountCreation {
  readonly institutionId: string;
  readonly firebaseUid: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly Role[];
  readonly approvedBy: string;
}

export interface RoleAssignmentChange {
  readonly targetFirebaseUid: string;
  readonly institutionId: string;
  readonly role: Role;
  readonly approvedBy: string;
}

export interface RoleRemoval {
  readonly targetFirebaseUid: string;
  readonly institutionId: string;
  readonly role: Role;
}

export interface AdminCreateUserInput {
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly Role[];
}

export interface UserProvisioner {
  createUser(input: {
    email: string;
    displayName: string;
  }): Promise<{ firebaseUid: string }>;
  deleteUser(firebaseUid: string): Promise<void>;
  setPassword(firebaseUid: string, password: string): Promise<void>;
  // Invalidates every already-issued ID token for this user immediately
  // (server-side `checkRevoked` verification then rejects them), instead of
  // waiting for their natural ~1 hour expiry.
  revokeSessions(firebaseUid: string): Promise<void>;
}

export interface TokenVerifier {
  verifyIdToken(
    token: string,
    checkRevoked: boolean,
  ): Promise<VerifiedIdentity>;
}

export interface ClaimsWriter {
  writeClaims(account: AccountProfile): Promise<void>;
}

export interface AccountRepository {
  findByFirebaseUid(firebaseUid: string): Promise<AccountProfile | null>;
  register(input: RegistrationInput): Promise<AccountProfile>;
  changeStatus(input: AccountStatusChange): Promise<AccountProfile>;
  updateDisplayName(
    firebaseUid: string,
    displayName: string,
  ): Promise<AccountProfile>;
  listAccounts(
    institutionId: string,
    query: AccountListQuery,
  ): Promise<AccountListResult>;
  createByAdmin(input: AdminAccountCreation): Promise<AccountProfile>;
  assignRole(input: RoleAssignmentChange): Promise<AccountProfile>;
  removeRole(input: RoleRemoval): Promise<AccountProfile>;
  assignSection(
    firebaseUid: string,
    institutionId: string,
    sectionId: string | null,
  ): Promise<AccountProfile>;
  deleteAccount(firebaseUid: string): Promise<void>;
  countByRole(institutionId: string): Promise<Readonly<Record<Role, number>>>;
  countByStatus(
    institutionId: string,
  ): Promise<Readonly<Record<AccountStatus, number>>>;
  listActiveFirebaseUidsExcludingRole(
    institutionId: string,
    excludedRole: Role,
  ): Promise<readonly string[]>;
}

export interface InstitutionMaintenanceState {
  readonly enabled: boolean;
  readonly message: string | null;
}

export interface InstitutionRepository {
  getMaintenanceState(
    institutionId: string,
  ): Promise<InstitutionMaintenanceState>;
  setMaintenanceState(
    institutionId: string,
    enabled: boolean,
    message: string | null,
  ): Promise<void>;
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

export interface AuditEventRecord {
  readonly id: string;
  readonly actorId: string;
  readonly actorDisplayName: string | null;
  readonly action: string;
  readonly targetId: string;
  readonly result: "succeeded" | "denied" | "failed";
  readonly reason: string | null;
  readonly occurredAt: string;
}

export interface AuditEventListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly action?: string | undefined;
  readonly actorId?: string | undefined;
  readonly targetId?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

export interface AuditReader {
  listEvents(query: AuditEventListQuery): Promise<{
    items: readonly AuditEventRecord[];
    total: number;
  }>;
}
