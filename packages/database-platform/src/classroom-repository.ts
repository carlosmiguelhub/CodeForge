import { randomInt, randomUUID } from "node:crypto";

import { and, count, desc, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import {
  activities,
  classes,
  classMembers,
  platformSchema,
  quizzes,
  races,
  users,
} from "./schema";

type Database = MySql2Database<typeof platformSchema>;

// Excludes visually ambiguous characters (0/O, 1/I) since join codes are
// meant to be read off one screen and typed on another.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const JOIN_CODE_LENGTH = 6;
const MAX_JOIN_CODE_ATTEMPTS = 8;

function generateJoinCode(): string {
  let code = "";
  for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

function isDuplicateEntryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}

// Explicit table-qualified raw SQL, not interpolated Column objects — see
// the matching comment in activity-repository.ts. Interpolating e.g.
// `${classes.id}` renders unqualified whenever the outer select has no
// JOIN, and MySQL then silently resolves it against the subquery's own
// table instead of the outer one, making the correlation always false.
// This one currently happens to work everywhere it's used (each call site
// already joins `users`), but stays written this way so it can't regress
// the moment that stops being true.
const activeMemberCountSql = sql<number>`(
  SELECT COUNT(*) FROM class_members
  WHERE class_members.class_id = classes.id AND class_members.status = 'active'
)`;

function toClass(row: {
  class: typeof classes.$inferSelect;
  teacherName: string | null;
  memberCount: number;
}) {
  return {
    id: row.class.id,
    teacherId: row.class.teacherId,
    teacherName: row.teacherName ?? "Unknown teacher",
    subjectName: row.class.subjectName,
    sectionLabel: row.class.sectionLabel,
    joinCode: row.class.joinCode,
    archivedAt: row.class.archivedAt?.toISOString() ?? null,
    createdAt: row.class.createdAt.toISOString(),
    memberCount: Number(row.memberCount),
  };
}

export class MySqlClassroomRepository {
  constructor(private readonly database: Database) {}

  private async findSummaryById(id: string) {
    const [row] = await this.database
      .select({
        class: classes,
        teacherName: users.displayName,
        memberCount: activeMemberCountSql,
      })
      .from(classes)
      .leftJoin(users, eq(users.id, classes.teacherId))
      .where(eq(classes.id, id));
    return row ? toClass(row) : null;
  }

  async create(input: {
    institutionId: string;
    teacherId: string;
    subjectName: string;
    sectionLabel: string;
  }) {
    const id = randomUUID();
    for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
      try {
        await this.database.insert(classes).values({
          id,
          institutionId: input.institutionId,
          teacherId: input.teacherId,
          subjectName: input.subjectName,
          sectionLabel: input.sectionLabel,
          joinCode: generateJoinCode(),
        });
        const created = await this.findSummaryById(id);
        if (!created) throw new Error("Class could not be reloaded.");
        return created;
      } catch (error) {
        if (!isDuplicateEntryError(error)) throw error;
      }
    }
    throw new Error("Could not generate a unique join code.");
  }

  async listForTeacher(teacherId: string) {
    const rows = await this.database
      .select({
        class: classes,
        teacherName: users.displayName,
        memberCount: activeMemberCountSql,
      })
      .from(classes)
      .leftJoin(users, eq(users.id, classes.teacherId))
      .where(eq(classes.teacherId, teacherId))
      .orderBy(desc(classes.createdAt));
    return rows.map(toClass);
  }

  async listForStudent(studentId: string) {
    const rows = await this.database
      .select({
        class: classes,
        teacherName: users.displayName,
        memberCount: activeMemberCountSql,
      })
      .from(classMembers)
      .innerJoin(classes, eq(classes.id, classMembers.classId))
      .leftJoin(users, eq(users.id, classes.teacherId))
      .where(
        and(
          eq(classMembers.studentId, studentId),
          eq(classMembers.status, "active"),
        ),
      )
      .orderBy(desc(classes.createdAt));
    return rows.map(toClass);
  }

  async findByJoinCode(joinCode: string) {
    const [row] = await this.database
      .select()
      .from(classes)
      .where(eq(classes.joinCode, joinCode));
    return row ?? null;
  }

  async findMembership(classId: string, studentId: string) {
    const [row] = await this.database
      .select()
      .from(classMembers)
      .where(
        and(
          eq(classMembers.classId, classId),
          eq(classMembers.studentId, studentId),
        ),
      );
    return row ?? null;
  }

  async isTeacherOrMember(classId: string, userId: string) {
    const summary = await this.findSummaryById(classId);
    if (!summary) return false;
    if (summary.teacherId === userId) return true;
    const membership = await this.findMembership(classId, userId);
    return membership?.status === "active";
  }

  async getAccess(classId: string, userId: string) {
    const summary = await this.findSummaryById(classId);
    if (!summary) return null;
    if (summary.teacherId === userId)
      return { isTeacher: true, isActiveMember: false };
    const membership = await this.findMembership(classId, userId);
    return {
      isTeacher: false,
      isActiveMember: membership?.status === "active",
    };
  }

  async addMember(classId: string, studentId: string) {
    const existing = await this.findMembership(classId, studentId);
    if (existing) {
      await this.database
        .update(classMembers)
        .set({ status: "active", joinedAt: new Date() })
        .where(eq(classMembers.id, existing.id));
    } else {
      await this.database.insert(classMembers).values({
        id: randomUUID(),
        classId,
        studentId,
      });
    }
  }

  async removeMember(classId: string, studentId: string) {
    await this.database
      .update(classMembers)
      .set({ status: "removed" })
      .where(
        and(
          eq(classMembers.classId, classId),
          eq(classMembers.studentId, studentId),
        ),
      );
  }

  async update(
    classId: string,
    input: { subjectName: string; sectionLabel: string },
  ) {
    await this.database
      .update(classes)
      .set({
        subjectName: input.subjectName,
        sectionLabel: input.sectionLabel,
      })
      .where(eq(classes.id, classId));
    return this.findSummaryById(classId);
  }

  async archive(classId: string) {
    await this.database
      .update(classes)
      .set({ archivedAt: new Date() })
      .where(eq(classes.id, classId));
    return this.findSummaryById(classId);
  }

  async unarchive(classId: string) {
    await this.database
      .update(classes)
      .set({ archivedAt: null })
      .where(eq(classes.id, classId));
    return this.findSummaryById(classId);
  }

  async regenerateJoinCode(classId: string) {
    for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
      try {
        await this.database
          .update(classes)
          .set({ joinCode: generateJoinCode() })
          .where(eq(classes.id, classId));
        return this.findSummaryById(classId);
      } catch (error) {
        if (!isDuplicateEntryError(error)) throw error;
      }
    }
    throw new Error("Could not generate a unique join code.");
  }

  // A class is only eligible for a hard delete once no student is
  // currently enrolled and no classwork exists — a *removed* membership
  // doesn't count (unenrolling should make a class deletable again), but
  // any active member or piece of classwork still blocks it, so deleting
  // never silently drops attempts/scores. Archive is the path otherwise.
  async countDependents(classId: string) {
    const [[memberRow], [activityRow], [quizRow], [raceRow]] =
      await Promise.all([
        this.database
          .select({ value: count() })
          .from(classMembers)
          .where(
            and(
              eq(classMembers.classId, classId),
              eq(classMembers.status, "active"),
            ),
          ),
        this.database
          .select({ value: count() })
          .from(activities)
          .where(eq(activities.classId, classId)),
        this.database
          .select({ value: count() })
          .from(quizzes)
          .where(eq(quizzes.classId, classId)),
        this.database
          .select({ value: count() })
          .from(races)
          .where(eq(races.classId, classId)),
      ]);
    return {
      members: Number(memberRow?.value ?? 0),
      activities: Number(activityRow?.value ?? 0),
      quizzes: Number(quizRow?.value ?? 0),
      races: Number(raceRow?.value ?? 0),
    };
  }

  async remove(classId: string) {
    // countDependents only gates on *active* members, so a class that has
    // had someone unenroll can still carry `removed`-status class_members
    // rows here — those don't block the app-level check, but the FK is
    // ON DELETE RESTRICT and doesn't care about status, so it fails the
    // class delete unless those leftover rows are cleared first.
    await this.database
      .delete(classMembers)
      .where(eq(classMembers.classId, classId));
    await this.database.delete(classes).where(eq(classes.id, classId));
  }

  async getDetail(classId: string) {
    const summary = await this.findSummaryById(classId);
    if (!summary) return null;
    const memberRows = await this.database
      .select({
        member: classMembers,
        studentName: users.displayName,
      })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.studentId))
      .where(
        and(
          eq(classMembers.classId, classId),
          eq(classMembers.status, "active"),
        ),
      )
      .orderBy(desc(classMembers.joinedAt));
    return {
      ...summary,
      members: memberRows.map((row) => ({
        id: row.member.id,
        studentId: row.member.studentId,
        studentName: row.studentName ?? "Unknown student",
        joinedAt: row.member.joinedAt.toISOString(),
      })),
    };
  }
}
