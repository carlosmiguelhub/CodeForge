import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type {
  Activity,
  ActivitySubmission,
  ActivitySummaryForStudent,
  ActivitySummaryForTeacher,
  ActivityForStudent,
  ActivityComparisonMode,
  CodeLanguage,
} from "@sqweb/contracts";

export interface ActivityRepository {
  create(
    input: {
      classId: string;
      title: string;
      instructions: string;
      language: CodeLanguage;
      starterCode: string | null;
      referenceSolution: string | null;
      allowRetake: boolean;
      comparisonMode: ActivityComparisonMode;
      numericTolerance: number | null;
      points: number;
      deadlineAt: Date | null;
      testCases: readonly {
        stdin: string;
        expectedStdout: string;
        isHidden: boolean;
        showExpectedOutput: boolean;
      }[];
    },
    now: Date,
  ): Promise<Activity>;
  listForTeacher(
    classId: string,
    now: Date,
  ): Promise<readonly ActivitySummaryForTeacher[]>;
  listForStudent(
    classId: string,
    studentId: string,
    now: Date,
  ): Promise<readonly ActivitySummaryForStudent[]>;
  update(
    activityId: string,
    input: {
      title: string;
      instructions: string;
      language: CodeLanguage;
      starterCode: string | null;
      referenceSolution: string | null;
      allowRetake: boolean;
      comparisonMode: ActivityComparisonMode;
      numericTolerance: number | null;
      points: number;
      deadlineAt: Date | null;
      testCases: readonly {
        stdin: string;
        expectedStdout: string;
        isHidden: boolean;
        showExpectedOutput: boolean;
      }[];
    },
    now: Date,
  ): Promise<Activity>;
  updateSchedule(activityId: string, deadlineAt: Date | null): Promise<void>;
  lock(activityId: string): Promise<void>;
  remove(activityId: string): Promise<void>;
  getForTeacher(activityId: string, now: Date): Promise<Activity | null>;
  getForStudent(
    activityId: string,
    studentId: string,
    now: Date,
  ): Promise<ActivityForStudent | null>;
  findClassId(activityId: string): Promise<string | null>;
  listSubmissions(
    activityId: string,
    classId: string,
  ): Promise<readonly ActivitySubmission[]>;
  resetAttempt(activityId: string, studentId: string): Promise<void>;
  resetAttempts(
    activityId: string,
    studentIds: readonly string[],
  ): Promise<void>;
}

export interface ActivityServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  // Reuses ClassroomService's own class-access rules (teacher-owner vs
  // active member) rather than re-deriving them here — same
  // MySqlClassroomRepository instance, narrowed to just this one method.
  classes: {
    getAccess(
      classId: string,
      userId: string,
    ): Promise<{ isTeacher: boolean; isActiveMember: boolean } | null>;
  };
  activities: ActivityRepository;
  audit: AuditSink;
  now?: () => Date;
}
