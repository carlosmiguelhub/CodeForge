import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type {
  ActivityComparisonMode,
  CodeLanguage,
  RaceForStudent,
  RaceForTeacher,
  RaceLeaderboardEntry,
  RaceSubmission,
  RaceSummaryForStudent,
  RaceSummaryForTeacher,
} from "@sqweb/contracts";

export interface RaceRepository {
  create(
    input: {
      classId: string;
      title: string;
      durationMinutes: number;
      opensAt: Date;
      closesAt: Date;
      problems: readonly {
        title: string;
        instructions: string;
        language: CodeLanguage;
        starterCode: string | null;
        referenceSolution: string | null;
        comparisonMode: ActivityComparisonMode;
        numericTolerance: number | null;
        points: number;
        testCases: readonly {
          stdin: string;
          expectedStdout: string;
          isHidden: boolean;
          showExpectedOutput: boolean;
        }[];
      }[];
    },
    now: Date,
  ): Promise<RaceForTeacher>;
  listForTeacher(
    classId: string,
    now: Date,
  ): Promise<readonly RaceSummaryForTeacher[]>;
  listForStudent(
    classId: string,
    studentId: string,
    now: Date,
  ): Promise<readonly RaceSummaryForStudent[]>;
  getForTeacher(raceId: string, now: Date): Promise<RaceForTeacher | null>;
  getForStudent(
    raceId: string,
    studentId: string,
    now: Date,
  ): Promise<RaceForStudent | null>;
  findClassId(raceId: string): Promise<string | null>;
  remove(raceId: string): Promise<void>;
  update(
    raceId: string,
    input: {
      title: string;
      durationMinutes: number;
      problems: readonly {
        title: string;
        instructions: string;
        language: CodeLanguage;
        starterCode: string | null;
        referenceSolution: string | null;
        comparisonMode: ActivityComparisonMode;
        numericTolerance: number | null;
        points: number;
        testCases: readonly {
          stdin: string;
          expectedStdout: string;
          isHidden: boolean;
          showExpectedOutput: boolean;
        }[];
      }[];
    },
    now: Date,
  ): Promise<RaceForTeacher>;
  updateSchedule(raceId: string, closesAt: Date): Promise<void>;
  listRaceLeaderboard(raceId: string): Promise<readonly RaceLeaderboardEntry[]>;
  listSubmissions(
    raceId: string,
    classId: string,
  ): Promise<readonly RaceSubmission[]>;
  resetStudent(raceId: string, studentId: string, now: Date): Promise<void>;
  resetStudents(
    raceId: string,
    studentIds: readonly string[],
    now: Date,
  ): Promise<void>;
  resetProblem(
    raceId: string,
    studentId: string,
    problemId: string,
  ): Promise<void>;
}

export interface RaceServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  // Reuses ClassroomService's own class-access rules, same precedent as
  // ActivityServiceDependencies/QuizServiceDependencies.
  classes: {
    getAccess(
      classId: string,
      userId: string,
    ): Promise<{ isTeacher: boolean; isActiveMember: boolean } | null>;
  };
  races: RaceRepository;
  audit: AuditSink;
  now?: () => Date;
}
