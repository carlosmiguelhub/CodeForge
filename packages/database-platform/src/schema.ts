import {
  bigint,
  boolean,
  char,
  index,
  int,
  json,
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
  auditEvents,
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
  savedQueries,
  sections,
  templateVersions,
  users,
  workspaceAllocations,
  workspacePoolInstances,
  workspaceResets,
  workspaces,
  workspaceTemplates,
};
