import {
  bigint,
  boolean,
  char,
  double,
  index,
  int,
  json,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  smallint,
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
    maintenanceMode: boolean("maintenance_mode").notNull().default(false),
    maintenanceMessage: varchar("maintenance_message", { length: 500 }),
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

export const sections = mysqlTable(
  "sections",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    lockedWorkspaces: json("locked_workspaces_json"),
    archivedAt: timestamp("archived_at", { mode: "date", fsp: 3 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("sections_institution_name_uq").on(
      table.institutionId,
      table.name,
    ),
    index("sections_institution_idx").on(table.institutionId),
  ],
);

export const users = mysqlTable(
  "users",
  {
    id: char("id", { length: 36 }).primaryKey(),
    firebaseUid: varchar("firebase_uid", { length: 128 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    sectionId: char("section_id", { length: 36 }).references(
      () => sections.id,
      { onDelete: "set null" },
    ),
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
    scopeType: mysqlEnum("scope_type", ["personal"]).notNull(),
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

export const queryExecutions = mysqlTable(
  "query_executions",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 }).notNull(),
    actorId: char("actor_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    workspaceId: char("workspace_id", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    statementHash: char("statement_hash", { length: 64 }).notNull(),
    statementClasses: json("statement_classes_json").notNull(),
    state: mysqlEnum("state", [
      "queued",
      "running",
      "successful",
      "failed",
      "timed_out",
      "cancelled",
      "limit_exceeded",
    ])
      .notNull()
      .default("queued"),
    durationMs: int("duration_ms", { unsigned: true }),
    rowsReturned: int("rows_returned", { unsigned: true }).notNull().default(0),
    bytesReturned: int("bytes_returned", { unsigned: true })
      .notNull()
      .default(0),
    errorCategory: varchar("error_category", { length: 80 }),
    startedAt: timestamp("started_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { mode: "date", fsp: 3 }),
  },
  (table) => [
    index("query_executions_actor_started_idx").on(
      table.actorId,
      table.startedAt,
    ),
    index("query_executions_workspace_started_idx").on(
      table.workspaceId,
      table.startedAt,
    ),
    index("query_executions_state_idx").on(table.state),
  ],
);

export const erdDiagrams = mysqlTable(
  "erd_diagrams",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    ownerId: char("owner_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    content: json("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [index("erd_diagrams_owner_idx").on(table.ownerId)],
);

export const codeWorkspaces = mysqlTable(
  "code_workspaces",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    ownerId: char("owner_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    content: json("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [uniqueIndex("code_workspaces_owner_uq").on(table.ownerId)],
);

export const webWorkspaces = mysqlTable(
  "web_workspaces",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    ownerId: char("owner_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    content: json("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [uniqueIndex("web_workspaces_owner_uq").on(table.ownerId)],
);

export const codeExecutions = mysqlTable(
  "code_executions",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 }).notNull(),
    actorId: char("actor_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    language: varchar("language", { length: 20 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    timeMs: int("time_ms", { unsigned: true }),
    startedAt: timestamp("started_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("code_executions_actor_started_idx").on(
      table.actorId,
      table.startedAt,
    ),
  ],
);

export const classes = mysqlTable(
  "classes",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    teacherId: char("teacher_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subjectName: varchar("subject_name", { length: 120 }).notNull(),
    sectionLabel: varchar("section_label", { length: 60 }).notNull(),
    joinCode: char("join_code", { length: 6 }).notNull(),
    archivedAt: timestamp("archived_at", { mode: "date", fsp: 3 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("classes_join_code_uq").on(table.joinCode),
    index("classes_teacher_idx").on(table.teacherId),
  ],
);

export const classMembers = mysqlTable(
  "class_members",
  {
    id: char("id", { length: 36 }).primaryKey(),
    classId: char("class_id", { length: 36 })
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    studentId: char("student_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: mysqlEnum("status", ["active", "removed"])
      .notNull()
      .default("active"),
    joinedAt: timestamp("joined_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("class_members_class_student_uq").on(
      table.classId,
      table.studentId,
    ),
    index("class_members_student_idx").on(table.studentId),
  ],
);

export const activities = mysqlTable(
  "activities",
  {
    id: char("id", { length: 36 }).primaryKey(),
    classId: char("class_id", { length: 36 })
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 160 }).notNull(),
    instructions: text("instructions").notNull(),
    language: mysqlEnum("language", [
      "python",
      "java",
      "cpp",
      "javascript",
      "c",
    ]).notNull(),
    starterCode: text("starter_code"),
    referenceSolution: text("reference_solution"),
    allowRetake: boolean("allow_retake").notNull().default(false),
    comparisonMode: mysqlEnum("comparison_mode", [
      "normalized_exact",
      "token",
      "numeric",
      "suffix_exact",
    ])
      .notNull()
      .default("suffix_exact"),
    numericTolerance: double("numeric_tolerance"),
    points: smallint("points", { unsigned: true }).notNull().default(100),
    // Both nullable/false by default so an activity with no deadline set
    // behaves exactly as it always has (always open). isLocked is derived
    // server-side from these two at read time (locked OR deadline passed),
    // never stored — see MySqlActivityRepository's toActivitySummary etc.
    deadlineAt: timestamp("deadline_at", { mode: "date", fsp: 3 }),
    locked: boolean("locked").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [index("activities_class_idx").on(table.classId)],
);

export const activityTestCases = mysqlTable(
  "activity_test_cases",
  {
    id: char("id", { length: 36 }).primaryKey(),
    activityId: char("activity_id", { length: 36 })
      .notNull()
      .references(() => activities.id, { onDelete: "restrict" }),
    stdin: text("stdin").notNull(),
    expectedStdout: text("expected_stdout").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
    showExpectedOutput: boolean("show_expected_output")
      .notNull()
      .default(false),
    orderIndex: smallint("order_index", { unsigned: true })
      .notNull()
      .default(0),
  },
  (table) => [index("activity_test_cases_activity_idx").on(table.activityId)],
);

export const activityAttempts = mysqlTable(
  "activity_attempts",
  {
    id: char("id", { length: 36 }).primaryKey(),
    activityId: char("activity_id", { length: 36 })
      .notNull()
      .references(() => activities.id, { onDelete: "restrict" }),
    studentId: char("student_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // The student's most recently submitted source, whichever run produced
    // it (passed or not) — lets a teacher see what was actually written,
    // not just the pass/fail outcome.
    sourceCode: mediumtext("source_code"),
    status: mysqlEnum("status", [
      "in_progress",
      "passed",
      "submitted_incomplete",
      "zeroed_violation",
    ])
      .notNull()
      .default("in_progress"),
    // Incremented on each detected tab-switch or fullscreen-exit while an
    // attempt is in progress. Never locks the attempt — once violationCount
    // exceeds ACTIVITY_ALLOWED_VIOLATIONS, each excess violation deducts
    // ACTIVITY_VIOLATION_DEDUCTION_PERCENT% of the activity's points from
    // the score (see scoreFor in activity-repository.ts). "zeroed_violation"
    // above is legacy — no attempt reaches it anymore.
    violationCount: smallint("violation_count", { unsigned: true })
      .notNull()
      .default(0),
    startedAt: timestamp("started_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { mode: "date", fsp: 3 }),
  },
  (table) => [
    uniqueIndex("activity_attempts_activity_student_uq").on(
      table.activityId,
      table.studentId,
    ),
    index("activity_attempts_student_idx").on(table.studentId),
  ],
);

export const activityTestRuns = mysqlTable(
  "activity_test_runs",
  {
    id: char("id", { length: 36 }).primaryKey(),
    attemptId: char("attempt_id", { length: 36 })
      .notNull()
      .references(() => activityAttempts.id, { onDelete: "restrict" }),
    testCaseId: char("test_case_id", { length: 36 })
      .notNull()
      .references(() => activityTestCases.id, { onDelete: "restrict" }),
    passed: boolean("passed").notNull(),
    actualStdout: text("actual_stdout"),
    ranAt: timestamp("ran_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (table) => [index("activity_test_runs_attempt_idx").on(table.attemptId)],
);

export const activityViolations = mysqlTable(
  "activity_violations",
  {
    id: char("id", { length: 36 }).primaryKey(),
    attemptId: char("attempt_id", { length: 36 })
      .notNull()
      .references(() => activityAttempts.id, { onDelete: "restrict" }),
    kind: mysqlEnum("kind", ["tab_switch", "fullscreen_exit"]).notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("activity_violations_attempt_idx").on(table.attemptId)],
);

// Advisory-only "this submission might be hardcoded" signals — never
// affects grading, surfaced to the teacher for manual review. Append-only,
// same shape as activityViolations: one row per detection, not deduped
// against prior submissions of the same attempt.
export const activityIntegrityFlags = mysqlTable(
  "activity_integrity_flags",
  {
    id: char("id", { length: 36 }).primaryKey(),
    attemptId: char("attempt_id", { length: 36 })
      .notNull()
      .references(() => activityAttempts.id, { onDelete: "restrict" }),
    kind: mysqlEnum("kind", ["input_ignored", "output_invariant"]).notNull(),
    testCaseId: char("test_case_id", { length: 36 }).references(
      () => activityTestCases.id,
      { onDelete: "restrict" },
    ),
    message: text("message").notNull(),
    detectedAt: timestamp("detected_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activity_integrity_flags_attempt_idx").on(table.attemptId),
  ],
);

export const quizzes = mysqlTable(
  "quizzes",
  {
    id: char("id", { length: 36 }).primaryKey(),
    classId: char("class_id", { length: 36 })
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 160 }).notNull(),
    quizType: mysqlEnum("quiz_type", ["lecture", "code"])
      .notNull()
      .default("lecture"),
    durationMinutes: smallint("duration_minutes", { unsigned: true }).notNull(),
    opensAt: timestamp("opens_at", { mode: "date", fsp: 3 }).notNull(),
    closesAt: timestamp("closes_at", { mode: "date", fsp: 3 }).notNull(),
    status: mysqlEnum("status", ["draft", "open", "closed"])
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    index("quizzes_class_idx").on(table.classId),
    index("quizzes_availability_idx").on(
      table.status,
      table.opensAt,
      table.closesAt,
    ),
  ],
);

export const quizQuestions = mysqlTable(
  "quiz_questions",
  {
    id: char("id", { length: 36 }).primaryKey(),
    quizId: char("quiz_id", { length: 36 })
      .notNull()
      .references(() => quizzes.id, { onDelete: "restrict" }),
    questionText: text("question_text").notNull(),
    questionType: mysqlEnum("question_type", [
      "mcq",
      "short_answer",
      "code_choice",
    ]).notNull(),
    language: mysqlEnum("language", [
      "python",
      "java",
      "cpp",
      "javascript",
      "c",
    ]),
    options: json("options_json").$type<string[] | null>(),
    correctAnswer: text("correct_answer").notNull(),
    points: smallint("points", { unsigned: true }).notNull(),
    orderIndex: smallint("order_index", { unsigned: true })
      .notNull()
      .default(0),
  },
  (table) => [
    index("quiz_questions_quiz_idx").on(table.quizId, table.orderIndex),
  ],
);

export const quizAttempts = mysqlTable(
  "quiz_attempts",
  {
    id: char("id", { length: 36 }).primaryKey(),
    quizId: char("quiz_id", { length: 36 })
      .notNull()
      .references(() => quizzes.id, { onDelete: "restrict" }),
    studentId: char("student_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { mode: "date", fsp: 3 }),
    score: int("score", { unsigned: true }),
    status: mysqlEnum("status", ["in_progress", "submitted", "timed_out"])
      .notNull()
      .default("in_progress"),
    violationCount: smallint("violation_count", { unsigned: true })
      .notNull()
      .default(0),
  },
  (table) => [
    uniqueIndex("quiz_attempts_quiz_student_uq").on(
      table.quizId,
      table.studentId,
    ),
    index("quiz_attempts_student_idx").on(table.studentId),
  ],
);

export const quizAnswers = mysqlTable(
  "quiz_answers",
  {
    id: char("id", { length: 36 }).primaryKey(),
    quizAttemptId: char("quiz_attempt_id", { length: 36 })
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "restrict" }),
    questionId: char("question_id", { length: 36 })
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "restrict" }),
    response: text("response").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    pointsAwarded: smallint("points_awarded", { unsigned: true })
      .notNull()
      .default(0),
  },
  (table) => [
    uniqueIndex("quiz_answers_attempt_question_uq").on(
      table.quizAttemptId,
      table.questionId,
    ),
    index("quiz_answers_question_idx").on(table.questionId),
  ],
);

export const races = mysqlTable(
  "races",
  {
    id: char("id", { length: 36 }).primaryKey(),
    classId: char("class_id", { length: 36 })
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 160 }).notNull(),
    durationMinutes: smallint("duration_minutes", { unsigned: true }).notNull(),
    opensAt: timestamp("opens_at", { mode: "date", fsp: 3 }).notNull(),
    closesAt: timestamp("closes_at", { mode: "date", fsp: 3 }).notNull(),
    status: mysqlEnum("status", ["draft", "open", "closed"])
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    index("races_class_idx").on(table.classId),
    index("races_availability_idx").on(
      table.status,
      table.opensAt,
      table.closesAt,
    ),
  ],
);

export const raceProblems = mysqlTable(
  "race_problems",
  {
    id: char("id", { length: 36 }).primaryKey(),
    raceId: char("race_id", { length: 36 })
      .notNull()
      .references(() => races.id, { onDelete: "restrict" }),
    orderIndex: smallint("order_index", { unsigned: true })
      .notNull()
      .default(0),
    title: varchar("title", { length: 160 }).notNull(),
    instructions: text("instructions").notNull(),
    language: mysqlEnum("language", [
      "python",
      "java",
      "cpp",
      "javascript",
      "c",
    ]).notNull(),
    starterCode: text("starter_code"),
    referenceSolution: text("reference_solution"),
    comparisonMode: mysqlEnum("comparison_mode", [
      "normalized_exact",
      "token",
      "numeric",
      "suffix_exact",
    ])
      .notNull()
      .default("suffix_exact"),
    numericTolerance: double("numeric_tolerance"),
    points: smallint("points", { unsigned: true }).notNull().default(100),
  },
  (table) => [
    index("race_problems_race_idx").on(table.raceId, table.orderIndex),
  ],
);

export const raceTestCases = mysqlTable(
  "race_test_cases",
  {
    id: char("id", { length: 36 }).primaryKey(),
    problemId: char("problem_id", { length: 36 })
      .notNull()
      .references(() => raceProblems.id, { onDelete: "restrict" }),
    stdin: text("stdin").notNull(),
    expectedStdout: text("expected_stdout").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
    showExpectedOutput: boolean("show_expected_output")
      .notNull()
      .default(false),
    orderIndex: smallint("order_index", { unsigned: true })
      .notNull()
      .default(0),
  },
  (table) => [index("race_test_cases_problem_idx").on(table.problemId)],
);

export const raceAttempts = mysqlTable(
  "race_attempts",
  {
    id: char("id", { length: 36 }).primaryKey(),
    raceId: char("race_id", { length: 36 })
      .notNull()
      .references(() => races.id, { onDelete: "restrict" }),
    studentId: char("student_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: mysqlEnum("status", ["in_progress", "submitted", "timed_out"])
      .notNull()
      .default("in_progress"),
    startedAt: timestamp("started_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { mode: "date", fsp: 3 }),
    violationCount: smallint("violation_count", { unsigned: true })
      .notNull()
      .default(0),
  },
  (table) => [
    uniqueIndex("race_attempts_race_student_uq").on(
      table.raceId,
      table.studentId,
    ),
    index("race_attempts_student_idx").on(table.studentId),
  ],
);

export const raceProblemSubmissions = mysqlTable(
  "race_problem_submissions",
  {
    id: char("id", { length: 36 }).primaryKey(),
    attemptId: char("attempt_id", { length: 36 })
      .notNull()
      .references(() => raceAttempts.id, { onDelete: "restrict" }),
    problemId: char("problem_id", { length: 36 })
      .notNull()
      .references(() => raceProblems.id, { onDelete: "restrict" }),
    sourceCode: mediumtext("source_code").notNull(),
    submitted: boolean("submitted").notNull().default(false),
    passedTestCaseCount: smallint("passed_test_case_count", {
      unsigned: true,
    })
      .notNull()
      .default(0),
    totalTestCaseCount: smallint("total_test_case_count", { unsigned: true })
      .notNull()
      .default(0),
    score: smallint("score", { unsigned: true }),
    submittedAt: timestamp("submitted_at", { mode: "date", fsp: 3 }),
  },
  (table) => [
    uniqueIndex("race_problem_submissions_attempt_problem_uq").on(
      table.attemptId,
      table.problemId,
    ),
    index("race_problem_submissions_problem_idx").on(table.problemId),
  ],
);

export const savedQueries = mysqlTable(
  "saved_queries",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    ownerId: char("owner_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    workspaceId: char("workspace_id", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    sqlText: text("sql_text").notNull(),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    index("saved_queries_owner_workspace_idx").on(
      table.ownerId,
      table.workspaceId,
    ),
  ],
);

export const guiSessionPoolInstances = mysqlTable(
  "gui_session_pool_instances",
  {
    id: char("id", { length: 36 }).primaryKey(),
    environment: varchar("environment", { length: 32 }).notNull(),
    region: varchar("region", { length: 64 }).notNull(),
    serviceRef: varchar("service_ref", { length: 255 }).notNull(),
    state: mysqlEnum("state", ["active", "draining", "offline"])
      .notNull()
      .default("active"),
    sessionCount: int("session_count").notNull().default(0),
    capacity: json("capacity_json"),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
  },
);

export const javaGuiWorkspaces = mysqlTable(
  "java_gui_workspaces",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    ownerId: char("owner_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    content: json("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [uniqueIndex("java_gui_workspaces_owner_uq").on(table.ownerId)],
);

export const guiSessions = mysqlTable(
  "gui_sessions",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    ownerId: char("owner_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    mainClassName: varchar("main_class_name", { length: 120 }).notNull(),
    state: mysqlEnum("state", [
      "requested",
      "provisioning",
      "running",
      "stopped",
      "failed",
      "expired",
    ])
      .notNull()
      .default("requested"),
    maxRuntimeSeconds: int("max_runtime_seconds", { unsigned: true }).notNull(),
    failureCode: varchar("failure_code", { length: 80 }),
    startedAt: timestamp("started_at", { mode: "date", fsp: 3 }),
    endsAt: timestamp("ends_at", { mode: "date", fsp: 3 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    index("gui_sessions_state_idx").on(table.state),
    index("gui_sessions_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export const guiContainerAllocations = mysqlTable(
  "gui_container_allocations",
  {
    id: char("id", { length: 36 }).primaryKey(),
    sessionId: char("session_id", { length: 36 })
      .notNull()
      .references(() => guiSessions.id, { onDelete: "restrict" }),
    poolInstanceId: char("pool_instance_id", { length: 36 })
      .notNull()
      .references(() => guiSessionPoolInstances.id, { onDelete: "restrict" }),
    containerRef: varchar("container_ref", { length: 255 }).notNull(),
    internalHost: varchar("internal_host", { length: 255 }).notNull(),
    websockifyPort: smallint("websockify_port", { unsigned: true }).notNull(),
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
  },
  (table) => [
    uniqueIndex("gui_container_allocations_session_uq").on(table.sessionId),
    index("gui_container_allocations_cleanup_idx").on(
      table.cleanupState,
      table.cleanupAttempts,
    ),
  ],
);

export const platformSchema = {
  activities,
  activityAttempts,
  activityTestCases,
  activityTestRuns,
  activityViolations,
  auditEvents,
  classes,
  classMembers,
  codeExecutions,
  codeWorkspaces,
  erdDiagrams,
  guiContainerAllocations,
  guiSessionPoolInstances,
  guiSessions,
  institutionMemberships,
  institutions,
  javaGuiWorkspaces,
  queryExecutions,
  quizAnswers,
  quizAttempts,
  quizQuestions,
  quizzes,
  raceAttempts,
  raceProblems,
  raceProblemSubmissions,
  races,
  raceTestCases,
  savedQueries,
  sections,
  templateVersions,
  users,
  webWorkspaces,
  workspaceAllocations,
  workspacePoolInstances,
  workspaceResets,
  workspaces,
  workspaceTemplates,
};
