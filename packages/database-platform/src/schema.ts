import {
  bigint,
  char,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const institutions = mysqlTable(
  "institutions",
  {
    id: char("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    status: mysqlEnum("status", ["active", "suspended"])
      .notNull()
      .default("active"),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("Asia/Manila"),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [uniqueIndex("institutions_slug_uq").on(table.slug)],
);

export const users = mysqlTable(
  "users",
  {
    id: char("id", { length: 36 }).primaryKey(),
    firebaseUid: varchar("firebase_uid", { length: 128 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    status: mysqlEnum("status", [
      "pending_verification",
      "pending_approval",
      "active",
      "suspended",
      "deactivated",
    ])
      .notNull()
      .default("pending_verification"),
    authorizationVersion: int("authorization_version").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("users_firebase_uid_uq").on(table.firebaseUid),
    index("users_email_idx").on(table.email),
  ],
);

export const institutionMemberships = mysqlTable(
  "institution_memberships",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: mysqlEnum("role", ["student", "teacher", "administrator"]).notNull(),
    approvalState: mysqlEnum("approval_state", [
      "pending",
      "approved",
      "revoked",
    ])
      .notNull()
      .default("pending"),
    approvedBy: char("approved_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { mode: "date", fsp: 3 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("memberships_institution_user_role_uq").on(
      table.institutionId,
      table.userId,
      table.role,
    ),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 }).notNull(),
    actorId: char("actor_id", { length: 36 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    targetId: varchar("target_id", { length: 128 }).notNull(),
    result: mysqlEnum("result", ["succeeded", "denied", "failed"]).notNull(),
    reason: varchar("reason", { length: 500 }),
    occurredAt: timestamp("occurred_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_institution_occurred_idx").on(
      table.institutionId,
      table.occurredAt,
    ),
    index("audit_actor_occurred_idx").on(table.actorId, table.occurredAt),
  ],
);

export const departments = mysqlTable(
  "departments",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    status: mysqlEnum("status", ["active", "archived"])
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("departments_institution_code_uq").on(
      table.institutionId,
      table.code,
    ),
  ],
);

export const programs = mysqlTable(
  "programs",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    departmentId: char("department_id", { length: 36 })
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    status: mysqlEnum("status", ["active", "archived"])
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("programs_institution_code_uq").on(
      table.institutionId,
      table.code,
    ),
    index("programs_department_idx").on(table.departmentId),
  ],
);

export const terms = mysqlTable(
  "terms",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    startsAt: timestamp("starts_at", { mode: "date", fsp: 3 }).notNull(),
    endsAt: timestamp("ends_at", { mode: "date", fsp: 3 }).notNull(),
    status: mysqlEnum("status", ["upcoming", "active", "closed"])
      .notNull()
      .default("upcoming"),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("terms_institution_name_uq").on(
      table.institutionId,
      table.name,
    ),
  ],
);

export const courses = mysqlTable(
  "courses",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    departmentId: char("department_id", { length: 36 })
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 32 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    status: mysqlEnum("status", ["active", "archived"])
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("courses_institution_code_uq").on(
      table.institutionId,
      table.code,
    ),
    index("courses_department_idx").on(table.departmentId),
  ],
);

export const classes = mysqlTable(
  "classes",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    courseId: char("course_id", { length: 36 })
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    termId: char("term_id", { length: 36 })
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    section: varchar("section", { length: 80 }).notNull(),
    ownerTeacherId: char("owner_teacher_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: mysqlEnum("status", ["active", "archived"])
      .notNull()
      .default("active"),
    schedule: json("schedule_json"),
    version: int("version").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("classes_course_term_section_uq").on(
      table.courseId,
      table.termId,
      table.section,
    ),
    index("classes_institution_status_idx").on(
      table.institutionId,
      table.status,
    ),
    index("classes_owner_idx").on(table.ownerTeacherId),
  ],
);

export const classTeachers = mysqlTable(
  "class_teachers",
  {
    classId: char("class_id", { length: 36 })
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    teacherId: char("teacher_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    permissionLevel: mysqlEnum("permission_level", ["owner", "assistant"])
      .notNull()
      .default("assistant"),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.classId, table.teacherId] })],
);

export const enrollments = mysqlTable(
  "enrollments",
  {
    id: char("id", { length: 36 }).primaryKey(),
    classId: char("class_id", { length: 36 })
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    studentId: char("student_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    state: mysqlEnum("state", ["active", "removed"])
      .notNull()
      .default("active"),
    joinedAt: timestamp("joined_at", { mode: "date", fsp: 3 }).notNull(),
    removedAt: timestamp("removed_at", { mode: "date", fsp: 3 }),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("enrollments_class_student_uq").on(
      table.classId,
      table.studentId,
    ),
    index("enrollments_student_state_idx").on(table.studentId, table.state),
  ],
);

export const classInvites = mysqlTable(
  "class_invites",
  {
    id: char("id", { length: 36 }).primaryKey(),
    classId: char("class_id", { length: 36 })
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    codeHash: char("code_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", fsp: 3 }).notNull(),
    usageLimit: int("usage_limit").notNull(),
    usageCount: int("usage_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { mode: "date", fsp: 3 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("class_invites_code_hash_uq").on(table.codeHash),
    index("class_invites_class_idx").on(table.classId),
  ],
);

export const workspaceTemplates = mysqlTable("workspace_templates", {
  id: char("id", { length: 36 }).primaryKey(),
  institutionId: char("institution_id", { length: 36 })
    .notNull()
    .references(() => institutions.id, { onDelete: "restrict" }),
  ownerId: char("owner_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["draft", "published", "archived"])
    .notNull()
    .default("draft"),
  createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .defaultNow(),
});

export const templateVersions = mysqlTable("template_versions", {
  id: char("id", { length: 36 }).primaryKey(),
  templateId: char("template_id", { length: 36 })
    .notNull()
    .references(() => workspaceTemplates.id, { onDelete: "restrict" }),
  versionNumber: int("version_number").notNull(),
  mysqlVersion: varchar("mysql_version", { length: 32 }).notNull(),
  checksum: char("checksum", { length: 64 }).notNull(),
  state: mysqlEnum("state", ["draft", "published", "retired"])
    .notNull()
    .default("draft"),
  publishedAt: timestamp("published_at", { mode: "date", fsp: 3 }),
});

export const workspacePoolInstances = mysqlTable("workspace_pool_instances", {
  id: char("id", { length: 36 }).primaryKey(),
  environment: varchar("environment", { length: 32 }).notNull(),
  region: varchar("region", { length: 64 }).notNull(),
  serviceRef: varchar("service_ref", { length: 255 }).notNull(),
  state: mysqlEnum("state", ["active", "draining", "offline"])
    .notNull()
    .default("active"),
  databaseCount: int("database_count").notNull().default(0),
  capacity: json("capacity_json"),
  createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .defaultNow(),
});

export const workspaces = mysqlTable(
  "workspaces",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    ownerId: char("owner_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scopeType: mysqlEnum("scope_type", ["personal", "class"]).notNull(),
    scopeId: char("scope_id", { length: 36 }).notNull(),
    templateVersionId: char("template_version_id", { length: 36 }).references(
      () => templateVersions.id,
      { onDelete: "restrict" },
    ),
    state: mysqlEnum("state", [
      "requested",
      "provisioning",
      "ready",
      "resetting",
      "suspended",
      "failed",
      "expired",
      "deleting",
      "deleted",
    ])
      .notNull()
      .default("requested"),
    quotaBytes: bigint("quota_bytes", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", fsp: 3 }),
    failureCode: varchar("failure_code", { length: 80 }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("workspaces_owner_scope_uq").on(
      table.ownerId,
      table.scopeType,
      table.scopeId,
    ),
    uniqueIndex("workspaces_idempotency_uq").on(
      table.institutionId,
      table.ownerId,
      table.idempotencyKey,
    ),
    index("workspaces_state_idx").on(table.state),
  ],
);

export const workspaceAllocations = mysqlTable("workspace_allocations", {
  id: char("id", { length: 36 }).primaryKey(),
  workspaceId: char("workspace_id", { length: 36 })
    .notNull()
    .references(() => workspaces.id, { onDelete: "restrict" }),
  poolInstanceId: char("pool_instance_id", { length: 36 })
    .notNull()
    .references(() => workspacePoolInstances.id, { onDelete: "restrict" }),
  databaseName: varchar("database_name", { length: 64 }).notNull().unique(),
  databaseUser: varchar("database_user", { length: 32 }).notNull().unique(),
  credentialSecretRef: varchar("credential_secret_ref", {
    length: 255,
  }).notNull(),
  allocatedAt: timestamp("allocated_at", { mode: "date", fsp: 3 })
    .notNull()
    .defaultNow(),
  releasedAt: timestamp("released_at", { mode: "date", fsp: 3 }),
  cleanupState: mysqlEnum("cleanup_state", [
    "active",
    "pending",
    "cleaning",
    "complete",
    "failed",
  ])
    .notNull()
    .default("active"),
  cleanupAttempts: int("cleanup_attempts").notNull().default(0),
  cleanupError: varchar("cleanup_error", { length: 80 }),
});

export const workspaceResets = mysqlTable(
  "workspace_resets",
  {
    id: char("id", { length: 36 }).primaryKey(),
    workspaceId: char("workspace_id", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    actorId: char("actor_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: varchar("reason", { length: 500 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    state: mysqlEnum("state", ["requested", "running", "succeeded", "failed"])
      .notNull()
      .default("requested"),
    startedAt: timestamp("started_at", { mode: "date", fsp: 3 }),
    finishedAt: timestamp("finished_at", { mode: "date", fsp: 3 }),
  },
  (table) => [
    uniqueIndex("workspace_resets_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
  ],
);

export const platformSchema = {
  auditEvents,
  classes,
  classInvites,
  classTeachers,
  courses,
  departments,
  enrollments,
  institutionMemberships,
  institutions,
  programs,
  terms,
  templateVersions,
  users,
  workspaceAllocations,
  workspacePoolInstances,
  workspaceResets,
  workspaces,
  workspaceTemplates,
};
