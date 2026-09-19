import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type { Class, ClassDetail } from "@sqweb/contracts";

export interface ClassroomRepository {
  create(input: {
    institutionId: string;
    teacherId: string;
    subjectName: string;
    sectionLabel: string;
  }): Promise<Class>;
  listForTeacher(teacherId: string): Promise<readonly Class[]>;
  listForStudent(studentId: string): Promise<readonly Class[]>;
  findByJoinCode(
    joinCode: string,
  ): Promise<{ id: string; teacherId: string; archivedAt: Date | null } | null>;
  isTeacherOrMember(classId: string, userId: string): Promise<boolean>;
  addMember(classId: string, studentId: string): Promise<void>;
  removeMember(classId: string, studentId: string): Promise<void>;
  getDetail(classId: string): Promise<ClassDetail | null>;
  getAccess(
    classId: string,
    userId: string,
  ): Promise<{ isTeacher: boolean; isActiveMember: boolean } | null>;
  update(
    classId: string,
    input: { subjectName: string; sectionLabel: string },
  ): Promise<Class | null>;
  archive(classId: string): Promise<Class | null>;
  unarchive(classId: string): Promise<Class | null>;
  regenerateJoinCode(classId: string): Promise<Class | null>;
  countDependents(classId: string): Promise<{
    members: number;
    activities: number;
    quizzes: number;
    races: number;
  }>;
  remove(classId: string): Promise<void>;
}

export interface ClassroomServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  classes: ClassroomRepository;
  audit: AuditSink;
}
