import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type {
  AcademicOptions,
  AcademicCatalog,
  ClassCreateRequest,
  ClassSummary,
  ClassUpdateRequest,
  CourseCreateRequest,
  DepartmentCreateRequest,
  EnrollmentState,
  InvitationCreated,
  ProgramCreateRequest,
  RosterMember,
  TermCreateRequest,
} from "@sqweb/contracts";

export interface InvitationRecord {
  readonly id: string;
  readonly classId: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly usageLimit: number;
  readonly usageCount: number;
  readonly revokedAt: Date | null;
}

export type ClassroomFailure =
  | "class_not_found"
  | "academic_reference_invalid"
  | "owner_invalid"
  | "invite_invalid"
  | "invite_expired"
  | "invite_exhausted"
  | "class_archived"
  | "class_full"
  | "student_invalid";

export class ClassroomRepositoryError extends Error {
  constructor(readonly reason: ClassroomFailure) {
    super(reason);
    this.name = "ClassroomRepositoryError";
  }
}

export interface ClassroomRepository {
  listAcademicOptions(institutionId: string): Promise<AcademicOptions>;
  listAcademicCatalog(institutionId: string): Promise<AcademicCatalog>;
  createDepartment(
    institutionId: string,
    request: DepartmentCreateRequest,
  ): Promise<string>;
  createProgram(
    institutionId: string,
    request: ProgramCreateRequest,
  ): Promise<string>;
  createCourse(
    institutionId: string,
    request: CourseCreateRequest,
  ): Promise<string>;
  createTerm(
    institutionId: string,
    request: TermCreateRequest,
  ): Promise<string>;
  listScoped(actor: AccountProfile): Promise<readonly ClassSummary[]>;
  findScoped(
    classId: string,
    institutionId: string,
  ): Promise<ClassSummary | null>;
  canAccess(classId: string, actor: AccountProfile): Promise<boolean>;
  create(input: {
    readonly actor: AccountProfile;
    readonly ownerTeacherId: string;
    readonly request: ClassCreateRequest;
  }): Promise<ClassSummary>;
  update(input: {
    readonly classId: string;
    readonly institutionId: string;
    readonly request: ClassUpdateRequest;
  }): Promise<ClassSummary>;
  createInvitation(
    input: Omit<InvitationRecord, "usageCount" | "revokedAt">,
  ): Promise<void>;
  findInvitation(
    invitationId: string,
    institutionId: string,
  ): Promise<InvitationRecord | null>;
  revokeInvitation(invitationId: string, classId: string): Promise<boolean>;
  joinWithInvitation(input: {
    readonly classId: string;
    readonly actor: AccountProfile;
    readonly codeHash: string;
    readonly now: Date;
    readonly maximumClassSize: number;
  }): Promise<ClassSummary>;
  listRoster(classId: string): Promise<readonly RosterMember[]>;
  changeEnrollment(input: {
    readonly classId: string;
    readonly studentId: string;
    readonly state: EnrollmentState;
    readonly now: Date;
  }): Promise<RosterMember>;
}

export interface ClassroomServiceDependencies {
  readonly identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      allowedRoles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  readonly classroom: ClassroomRepository;
  readonly audit: AuditSink;
  readonly now?: () => Date;
  readonly createInvitationCode?: () => string;
}

export type { InvitationCreated };
