import { randomUUID } from "node:crypto";

import type { ClassroomRepository, InvitationRecord } from "@sqweb/classroom";
import { ClassroomRepositoryError } from "@sqweb/classroom";
import type {
  AccountProfile,
  ClassSummary,
  RosterMember,
} from "@sqweb/contracts";
import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import {
  classes,
  classInvites,
  classTeachers,
  courses,
  departments,
  enrollments,
  institutionMemberships,
  platformSchema,
  programs,
  terms,
  users,
} from "./schema";

type PlatformDatabase = MySql2Database<typeof platformSchema>;

interface ClassRow {
  readonly id: string;
  readonly institutionId: string;
  readonly courseId: string;
  readonly courseCode: string;
  readonly courseTitle: string;
  readonly termId: string;
  readonly termName: string;
  readonly section: string;
  readonly ownerTeacherId: string;
  readonly ownerTeacherName: string;
  readonly status: "active" | "archived";
  readonly createdAt: Date;
}

export class MySqlClassroomRepository implements ClassroomRepository {
  constructor(private readonly database: PlatformDatabase) {}

  private baseClassQuery() {
    return this.database
      .select({
        id: classes.id,
        institutionId: classes.institutionId,
        courseId: classes.courseId,
        courseCode: courses.code,
        courseTitle: courses.title,
        termId: classes.termId,
        termName: terms.name,
        section: classes.section,
        ownerTeacherId: classes.ownerTeacherId,
        ownerTeacherName: users.displayName,
        status: classes.status,
        createdAt: classes.createdAt,
      })
      .from(classes)
      .innerJoin(courses, eq(courses.id, classes.courseId))
      .innerJoin(terms, eq(terms.id, classes.termId))
      .innerJoin(users, eq(users.id, classes.ownerTeacherId));
  }

  async listAcademicOptions(institutionId: string) {
    const [courseRows, termRows] = await Promise.all([
      this.database
        .select({ id: courses.id, code: courses.code, title: courses.title })
        .from(courses)
        .where(
          and(
            eq(courses.institutionId, institutionId),
            eq(courses.status, "active"),
          ),
        ),
      this.database
        .select({
          id: terms.id,
          name: terms.name,
          startsAt: terms.startsAt,
          endsAt: terms.endsAt,
          status: terms.status,
        })
        .from(terms)
        .where(eq(terms.institutionId, institutionId)),
    ]);
    return {
      courses: courseRows,
      terms: termRows.map((term) => ({
        ...term,
        startsAt: term.startsAt.toISOString(),
        endsAt: term.endsAt.toISOString(),
      })),
    };
  }

  async listAcademicCatalog(institutionId: string) {
    const [departmentRows, programRows, courseRows, termRows] =
      await Promise.all([
        this.database
          .select({
            id: departments.id,
            code: departments.code,
            name: departments.name,
            status: departments.status,
          })
          .from(departments)
          .where(eq(departments.institutionId, institutionId)),
        this.database
          .select({
            id: programs.id,
            departmentId: programs.departmentId,
            code: programs.code,
            name: programs.name,
            status: programs.status,
          })
          .from(programs)
          .where(eq(programs.institutionId, institutionId)),
        this.database
          .select({
            id: courses.id,
            departmentId: courses.departmentId,
            code: courses.code,
            title: courses.title,
            description: courses.description,
            status: courses.status,
          })
          .from(courses)
          .where(eq(courses.institutionId, institutionId)),
        this.database
          .select({
            id: terms.id,
            name: terms.name,
            startsAt: terms.startsAt,
            endsAt: terms.endsAt,
            status: terms.status,
          })
          .from(terms)
          .where(eq(terms.institutionId, institutionId)),
      ]);
    return {
      departments: departmentRows,
      programs: programRows,
      courses: courseRows,
      terms: termRows.map((term) => ({
        ...term,
        startsAt: term.startsAt.toISOString(),
        endsAt: term.endsAt.toISOString(),
      })),
    };
  }

  async createDepartment(
    institutionId: string,
    request: Parameters<ClassroomRepository["createDepartment"]>[1],
  ) {
    const id = randomUUID();
    await this.database.insert(departments).values({
      id,
      institutionId,
      code: request.code.toUpperCase(),
      name: request.name,
    });
    return id;
  }

  private async requireDepartment(institutionId: string, departmentId: string) {
    const rows = await this.database
      .select({ id: departments.id })
      .from(departments)
      .where(
        and(
          eq(departments.id, departmentId),
          eq(departments.institutionId, institutionId),
          eq(departments.status, "active"),
        ),
      );
    if (!rows[0])
      throw new ClassroomRepositoryError("academic_reference_invalid");
  }

  async createProgram(
    institutionId: string,
    request: Parameters<ClassroomRepository["createProgram"]>[1],
  ) {
    await this.requireDepartment(institutionId, request.departmentId);
    const id = randomUUID();
    await this.database.insert(programs).values({
      id,
      institutionId,
      departmentId: request.departmentId,
      code: request.code.toUpperCase(),
      name: request.name,
    });
    return id;
  }

  async createCourse(
    institutionId: string,
    request: Parameters<ClassroomRepository["createCourse"]>[1],
  ) {
    await this.requireDepartment(institutionId, request.departmentId);
    const id = randomUUID();
    await this.database.insert(courses).values({
      id,
      institutionId,
      departmentId: request.departmentId,
      code: request.code.toUpperCase(),
      title: request.title,
      description: request.description ?? null,
    });
    return id;
  }

  async createTerm(
    institutionId: string,
    request: Parameters<ClassroomRepository["createTerm"]>[1],
  ) {
    const id = randomUUID();
    const startsAt = new Date(request.startsAt);
    const endsAt = new Date(request.endsAt);
    const now = new Date();
    const status =
      endsAt <= now ? "closed" : startsAt <= now ? "active" : "upcoming";
    await this.database.insert(terms).values({
      id,
      institutionId,
      name: request.name,
      startsAt,
      endsAt,
      status,
    });
    return id;
  }

  private async toSummaries(
    rows: readonly ClassRow[],
  ): Promise<ClassSummary[]> {
    return Promise.all(
      rows.map(async (row) => {
        const counts = await this.database
          .select({ count: sql<number>`count(*)` })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.classId, row.id),
              eq(enrollments.state, "active"),
            ),
          );
        return {
          ...row,
          enrolledCount: Number(counts[0]?.count ?? 0),
          createdAt: row.createdAt.toISOString(),
        };
      }),
    );
  }

  async listScoped(actor: AccountProfile): Promise<readonly ClassSummary[]> {
    let rows: ClassRow[];
    if (actor.roles.includes("administrator")) {
      rows = await this.baseClassQuery().where(
        eq(classes.institutionId, actor.institutionId),
      );
    } else if (actor.roles.includes("teacher")) {
      rows = await this.baseClassQuery()
        .innerJoin(classTeachers, eq(classTeachers.classId, classes.id))
        .where(
          and(
            eq(classes.institutionId, actor.institutionId),
            eq(classTeachers.teacherId, actor.id),
          ),
        );
    } else {
      rows = await this.baseClassQuery()
        .innerJoin(enrollments, eq(enrollments.classId, classes.id))
        .where(
          and(
            eq(classes.institutionId, actor.institutionId),
            eq(enrollments.studentId, actor.id),
            eq(enrollments.state, "active"),
          ),
        );
    }
    return this.toSummaries(rows);
  }

  async findScoped(
    classId: string,
    institutionId: string,
  ): Promise<ClassSummary | null> {
    const rows = await this.baseClassQuery().where(
      and(eq(classes.id, classId), eq(classes.institutionId, institutionId)),
    );
    const summaries = await this.toSummaries(rows);
    return summaries[0] ?? null;
  }

  async canAccess(classId: string, actor: AccountProfile): Promise<boolean> {
    if (actor.roles.includes("teacher")) {
      const rows = await this.database
        .select({ classId: classTeachers.classId })
        .from(classTeachers)
        .where(
          and(
            eq(classTeachers.classId, classId),
            eq(classTeachers.teacherId, actor.id),
          ),
        );
      return rows.length > 0;
    }
    const rows = await this.database
      .select({ classId: enrollments.classId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.classId, classId),
          eq(enrollments.studentId, actor.id),
          eq(enrollments.state, "active"),
        ),
      );
    return rows.length > 0;
  }

  async create(input: Parameters<ClassroomRepository["create"]>[0]) {
    const [courseRows, termRows, ownerRows] = await Promise.all([
      this.database
        .select({ id: courses.id })
        .from(courses)
        .where(
          and(
            eq(courses.id, input.request.courseId),
            eq(courses.institutionId, input.actor.institutionId),
            eq(courses.status, "active"),
          ),
        ),
      this.database
        .select({ id: terms.id })
        .from(terms)
        .where(
          and(
            eq(terms.id, input.request.termId),
            eq(terms.institutionId, input.actor.institutionId),
          ),
        ),
      this.database
        .select({ id: users.id })
        .from(users)
        .innerJoin(
          institutionMemberships,
          eq(institutionMemberships.userId, users.id),
        )
        .where(
          and(
            eq(users.id, input.ownerTeacherId),
            eq(users.status, "active"),
            eq(institutionMemberships.institutionId, input.actor.institutionId),
            eq(institutionMemberships.role, "teacher"),
            eq(institutionMemberships.approvalState, "approved"),
          ),
        ),
    ]);
    if (!courseRows[0] || !termRows[0])
      throw new ClassroomRepositoryError("academic_reference_invalid");
    if (!ownerRows[0]) throw new ClassroomRepositoryError("owner_invalid");

    const classId = randomUUID();
    await this.database.transaction(async (transaction) => {
      await transaction.insert(classes).values({
        id: classId,
        institutionId: input.actor.institutionId,
        courseId: input.request.courseId,
        termId: input.request.termId,
        section: input.request.section,
        ownerTeacherId: input.ownerTeacherId,
      });
      await transaction.insert(classTeachers).values({
        classId,
        teacherId: input.ownerTeacherId,
        permissionLevel: "owner",
      });
    });
    const created = await this.findScoped(classId, input.actor.institutionId);
    if (!created) throw new ClassroomRepositoryError("class_not_found");
    return created;
  }

  async update(input: Parameters<ClassroomRepository["update"]>[0]) {
    const current = await this.findScoped(input.classId, input.institutionId);
    if (!current) throw new ClassroomRepositoryError("class_not_found");
    await this.database
      .update(classes)
      .set({
        ...(input.request.section !== undefined
          ? { section: input.request.section }
          : {}),
        ...(input.request.status !== undefined
          ? { status: input.request.status }
          : {}),
        version: sql`${classes.version} + 1`,
      })
      .where(
        and(
          eq(classes.id, input.classId),
          eq(classes.institutionId, input.institutionId),
        ),
      );
    const updated = await this.findScoped(input.classId, input.institutionId);
    if (!updated) throw new ClassroomRepositoryError("class_not_found");
    return updated;
  }

  async createInvitation(
    input: Omit<InvitationRecord, "usageCount" | "revokedAt">,
  ): Promise<void> {
    await this.database.insert(classInvites).values({
      id: input.id,
      classId: input.classId,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      usageLimit: input.usageLimit,
    });
  }

  async findInvitation(invitationId: string, institutionId: string) {
    const rows = await this.database
      .select({ invite: classInvites })
      .from(classInvites)
      .innerJoin(classes, eq(classes.id, classInvites.classId))
      .where(
        and(
          eq(classInvites.id, invitationId),
          eq(classes.institutionId, institutionId),
        ),
      );
    return rows[0]?.invite ?? null;
  }

  async revokeInvitation(
    invitationId: string,
    classId: string,
  ): Promise<boolean> {
    const result = await this.database
      .update(classInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(classInvites.id, invitationId),
          eq(classInvites.classId, classId),
          sql`${classInvites.revokedAt} is null`,
        ),
      );
    return result[0].affectedRows === 1;
  }

  async joinWithInvitation(
    input: Parameters<ClassroomRepository["joinWithInvitation"]>[0],
  ) {
    await this.database.transaction(async (transaction) => {
      const classRows = await transaction
        .select({ status: classes.status })
        .from(classes)
        .where(
          and(
            eq(classes.id, input.classId),
            eq(classes.institutionId, input.actor.institutionId),
          ),
        )
        .for("update");
      const classRecord = classRows[0];
      if (!classRecord) throw new ClassroomRepositoryError("class_not_found");
      if (classRecord.status === "archived")
        throw new ClassroomRepositoryError("class_archived");

      const inviteRows = await transaction
        .select()
        .from(classInvites)
        .where(
          and(
            eq(classInvites.classId, input.classId),
            eq(classInvites.codeHash, input.codeHash),
          ),
        )
        .for("update");
      const invitation = inviteRows[0];
      if (!invitation || invitation.revokedAt)
        throw new ClassroomRepositoryError("invite_invalid");
      if (invitation.expiresAt <= input.now)
        throw new ClassroomRepositoryError("invite_expired");
      if (invitation.usageCount >= invitation.usageLimit)
        throw new ClassroomRepositoryError("invite_exhausted");

      const existingRows = await transaction
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.classId, input.classId),
            eq(enrollments.studentId, input.actor.id),
          ),
        )
        .for("update");
      const existing = existingRows[0];
      if (existing?.state === "active") return;

      const counts = await transaction
        .select({ count: sql<number>`count(*)` })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.classId, input.classId),
            eq(enrollments.state, "active"),
          ),
        );
      if (Number(counts[0]?.count ?? 0) >= input.maximumClassSize)
        throw new ClassroomRepositoryError("class_full");

      if (existing) {
        await transaction
          .update(enrollments)
          .set({ state: "active", joinedAt: input.now, removedAt: null })
          .where(eq(enrollments.id, existing.id));
      } else {
        await transaction.insert(enrollments).values({
          id: randomUUID(),
          classId: input.classId,
          studentId: input.actor.id,
          state: "active",
          joinedAt: input.now,
        });
      }
      await transaction
        .update(classInvites)
        .set({ usageCount: sql`${classInvites.usageCount} + 1` })
        .where(eq(classInvites.id, invitation.id));
    });

    const joined = await this.findScoped(
      input.classId,
      input.actor.institutionId,
    );
    if (!joined) throw new ClassroomRepositoryError("class_not_found");
    return joined;
  }

  async listRoster(classId: string): Promise<readonly RosterMember[]> {
    const rows = await this.database
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        state: enrollments.state,
        joinedAt: enrollments.joinedAt,
        removedAt: enrollments.removedAt,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .where(eq(enrollments.classId, classId));
    return rows.map((row) => ({
      ...row,
      joinedAt: row.joinedAt.toISOString(),
      removedAt: row.removedAt?.toISOString() ?? null,
    }));
  }

  async changeEnrollment(
    input: Parameters<ClassroomRepository["changeEnrollment"]>[0],
  ): Promise<RosterMember> {
    const enrollmentRows = await this.database
      .select({ enrollment: enrollments, user: users })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .where(
        and(
          eq(enrollments.classId, input.classId),
          eq(enrollments.studentId, input.studentId),
        ),
      );
    const current = enrollmentRows[0];
    if (!current) throw new ClassroomRepositoryError("student_invalid");

    if (input.state === "active" && current.enrollment.state !== "active") {
      const counts = await this.database
        .select({ count: sql<number>`count(*)` })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.classId, input.classId),
            eq(enrollments.state, "active"),
          ),
        );
      if (Number(counts[0]?.count ?? 0) >= 60)
        throw new ClassroomRepositoryError("class_full");
    }

    await this.database
      .update(enrollments)
      .set({
        state: input.state,
        removedAt: input.state === "removed" ? input.now : null,
        ...(input.state === "active" ? { joinedAt: input.now } : {}),
      })
      .where(eq(enrollments.id, current.enrollment.id));
    return {
      userId: current.user.id,
      displayName: current.user.displayName,
      email: current.user.email,
      state: input.state,
      joinedAt:
        input.state === "active"
          ? input.now.toISOString()
          : current.enrollment.joinedAt.toISOString(),
      removedAt: input.state === "removed" ? input.now.toISOString() : null,
    };
  }
}
