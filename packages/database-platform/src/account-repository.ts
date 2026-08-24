import { randomUUID } from "node:crypto";

import {
  AuthorizationError,
  type AccountListQuery,
  type AccountListResult,
  type AccountProfile,
  type AccountRepository,
  type AccountStatusChange,
  type AdminAccountCreation,
  type RegistrationInput,
  type RoleAssignmentChange,
  type RoleRemoval,
} from "@sqweb/auth";
import type { AccountStatus, Role } from "@sqweb/contracts";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  like,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import {
  codeExecutions,
  codeWorkspaces,
  erdDiagrams,
  institutionMemberships,
  platformSchema,
  queryExecutions,
  savedQueries,
  sections,
  templateVersions,
  users,
  workspaceAllocations,
  workspaceResets,
  workspaces,
  workspaceTemplates,
} from "./schema";

type PlatformDatabase = MySql2Database<typeof platformSchema>;
type MembershipRow = {
  user: typeof users.$inferSelect;
  membership: typeof institutionMemberships.$inferSelect;
};

function toProfile(rows: readonly MembershipRow[]): AccountProfile {
  const first = rows[0];
  if (!first) throw new Error("toProfile requires at least one row.");
  return {
    id: first.user.id,
    firebaseUid: first.user.firebaseUid,
    email: first.user.email,
    displayName: first.user.displayName,
    institutionId: first.membership.institutionId,
    status: first.user.status as AccountStatus,
    sectionId: first.user.sectionId,
    roles: rows
      .filter((row) => row.membership.approvalState === "approved")
      .map((row) => row.membership.role as Role),
    authorizationVersion: first.user.authorizationVersion,
  };
}

export class MySqlAccountRepository implements AccountRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async findByFirebaseUid(firebaseUid: string): Promise<AccountProfile | null> {
    const rows = await this.database
      .select({ user: users, membership: institutionMemberships })
      .from(users)
      .innerJoin(
        institutionMemberships,
        eq(institutionMemberships.userId, users.id),
      )
      .where(eq(users.firebaseUid, firebaseUid));

    if (rows.length === 0) return null;
    return toProfile(rows);
  }

  async register(input: RegistrationInput): Promise<AccountProfile> {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const isStudent = input.requestedRole === "student";
    const status: AccountStatus = isStudent ? "active" : "pending_approval";

    if (input.sectionId) {
      const [section] = await this.database
        .select({ id: sections.id })
        .from(sections)
        .where(
          and(
            eq(sections.id, input.sectionId),
            eq(sections.institutionId, input.institutionId),
            isNull(sections.archivedAt),
          ),
        );
      if (!section) {
        throw new AuthorizationError(
          "VALIDATION_FAILED",
          "Select a valid section.",
          400,
        );
      }
    }

    await this.database.transaction(async (transaction) => {
      await transaction.insert(users).values({
        id: userId,
        firebaseUid: input.identity.uid,
        email: input.identity.email.toLowerCase(),
        displayName: input.displayName,
        sectionId: input.sectionId ?? null,
        status,
        authorizationVersion: 1,
      });
      await transaction.insert(institutionMemberships).values({
        id: membershipId,
        institutionId: input.institutionId,
        userId,
        role: input.requestedRole,
        approvalState: isStudent ? "approved" : "pending",
        approvedAt: isStudent ? new Date() : null,
      });
    });

    const created = await this.findByFirebaseUid(input.identity.uid);
    if (!created) throw new Error("Registered account could not be reloaded.");
    return created;
  }

  async updateDisplayName(
    firebaseUid: string,
    displayName: string,
  ): Promise<AccountProfile> {
    await this.database
      .update(users)
      .set({ displayName })
      .where(eq(users.firebaseUid, firebaseUid));

    const updated = await this.findByFirebaseUid(firebaseUid);
    if (!updated) throw new Error("Updated account could not be reloaded.");
    return updated;
  }

  async assignSection(
    firebaseUid: string,
    institutionId: string,
    sectionId: string | null,
  ): Promise<AccountProfile> {
    if (sectionId) {
      const [section] = await this.database
        .select({ id: sections.id })
        .from(sections)
        .where(
          and(
            eq(sections.id, sectionId),
            eq(sections.institutionId, institutionId),
            isNull(sections.archivedAt),
          ),
        );
      if (!section) {
        throw new AuthorizationError(
          "VALIDATION_FAILED",
          "Select a valid section.",
          400,
        );
      }
    }
    await this.database
      .update(users)
      .set({ sectionId })
      .where(eq(users.firebaseUid, firebaseUid));

    const updated = await this.findByFirebaseUid(firebaseUid);
    if (!updated) throw new Error("Updated account could not be reloaded.");
    return updated;
  }

  async listAccounts(
    institutionId: string,
    query: AccountListQuery,
  ): Promise<AccountListResult> {
    const filters = [eq(institutionMemberships.institutionId, institutionId)];
    if (query.role) filters.push(eq(institutionMemberships.role, query.role));
    if (query.status) filters.push(eq(users.status, query.status));
    if (query.sectionId) filters.push(eq(users.sectionId, query.sectionId));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const searchMatch = or(
        like(users.email, pattern),
        like(users.displayName, pattern),
      );
      if (searchMatch) filters.push(searchMatch);
    }
    const where = and(...filters);

    const [pageRows, [totalRow]] = await Promise.all([
      this.database
        .selectDistinct({ id: users.id, createdAt: users.createdAt })
        .from(users)
        .innerJoin(
          institutionMemberships,
          eq(institutionMemberships.userId, users.id),
        )
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database
        .select({ count: sql<number>`COUNT(DISTINCT ${users.id})` })
        .from(users)
        .innerJoin(
          institutionMemberships,
          eq(institutionMemberships.userId, users.id),
        )
        .where(where),
    ]);

    const ids = pageRows.map((row) => row.id);
    if (ids.length === 0) return { items: [], total: Number(totalRow?.count ?? 0) };

    const rows = await this.database
      .select({ user: users, membership: institutionMemberships })
      .from(users)
      .innerJoin(
        institutionMemberships,
        eq(institutionMemberships.userId, users.id),
      )
      .where(inArray(users.id, ids));

    const byId = new Map<string, MembershipRow[]>();
    for (const row of rows) {
      const group = byId.get(row.user.id) ?? [];
      group.push(row);
      byId.set(row.user.id, group);
    }
    // The IN(...) lookup above doesn't preserve order, so re-sort against
    // the already-paginated/ordered id list from the first query.
    const items = ids
      .map((id) => byId.get(id))
      .filter((group): group is MembershipRow[] => group !== undefined)
      .map(toProfile);

    return { items, total: Number(totalRow?.count ?? 0) };
  }

  async createByAdmin(input: AdminAccountCreation): Promise<AccountProfile> {
    const userId = randomUUID();
    await this.database.transaction(async (transaction) => {
      await transaction.insert(users).values({
        id: userId,
        firebaseUid: input.firebaseUid,
        email: input.email.toLowerCase(),
        displayName: input.displayName,
        status: "active",
        authorizationVersion: 1,
      });
      for (const role of input.roles) {
        await transaction.insert(institutionMemberships).values({
          id: randomUUID(),
          institutionId: input.institutionId,
          userId,
          role,
          approvalState: "approved",
          approvedBy: input.approvedBy,
          approvedAt: new Date(),
        });
      }
    });

    const created = await this.findByFirebaseUid(input.firebaseUid);
    if (!created)
      throw new Error("Admin-created account could not be reloaded.");
    return created;
  }

  async assignRole(input: RoleAssignmentChange): Promise<AccountProfile> {
    const [userRow] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.firebaseUid, input.targetFirebaseUid));
    if (!userRow) throw new Error("Target account was not found.");

    await this.database
      .insert(institutionMemberships)
      .values({
        id: randomUUID(),
        institutionId: input.institutionId,
        userId: userRow.id,
        role: input.role,
        approvalState: "approved",
        approvedBy: input.approvedBy,
        approvedAt: new Date(),
      })
      // Re-grants a previously revoked role via the existing
      // (institution_id, user_id, role) unique key instead of erroring.
      .onDuplicateKeyUpdate({
        set: {
          approvalState: "approved",
          approvedBy: input.approvedBy,
          approvedAt: new Date(),
        },
      });

    const updated = await this.findByFirebaseUid(input.targetFirebaseUid);
    if (!updated) throw new Error("Account could not be reloaded.");
    return updated;
  }

  async removeRole(input: RoleRemoval): Promise<AccountProfile> {
    const [userRow] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.firebaseUid, input.targetFirebaseUid));
    if (!userRow) throw new Error("Target account was not found.");

    await this.database
      .update(institutionMemberships)
      .set({ approvalState: "revoked" })
      .where(
        and(
          eq(institutionMemberships.userId, userRow.id),
          eq(institutionMemberships.institutionId, input.institutionId),
          eq(institutionMemberships.role, input.role),
        ),
      );

    const updated = await this.findByFirebaseUid(input.targetFirebaseUid);
    if (!updated) throw new Error("Account could not be reloaded.");
    return updated;
  }

  // Every owner/actor FK to `users` is ON DELETE RESTRICT (see migrations),
  // so a user with any history can't be deleted until every dependent row
  // is gone first. `audit_events` has no FK to `users` and is deliberately
  // left untouched — the audit trail should survive account deletion.
  async deleteAccount(firebaseUid: string): Promise<void> {
    const [userRow] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid));
    if (!userRow) return;
    const userId = userRow.id;

    await this.database.transaction(async (transaction) => {
      const ownedWorkspaces = await transaction
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.ownerId, userId));
      const workspaceIds = ownedWorkspaces.map((row) => row.id);

      if (workspaceIds.length > 0) {
        await transaction
          .delete(queryExecutions)
          .where(inArray(queryExecutions.workspaceId, workspaceIds));
        await transaction
          .delete(workspaceResets)
          .where(inArray(workspaceResets.workspaceId, workspaceIds));
        await transaction
          .delete(workspaceAllocations)
          .where(inArray(workspaceAllocations.workspaceId, workspaceIds));
        await transaction
          .delete(savedQueries)
          .where(inArray(savedQueries.workspaceId, workspaceIds));
      }
      // Failsafe for any remaining rows keyed by actor/owner rather than
      // workspace (none expected in this app's personal-workspace model,
      // since only an owner ever acts on their own workspace).
      await transaction
        .delete(queryExecutions)
        .where(eq(queryExecutions.actorId, userId));
      await transaction
        .delete(workspaceResets)
        .where(eq(workspaceResets.actorId, userId));
      await transaction
        .delete(savedQueries)
        .where(eq(savedQueries.ownerId, userId));
      await transaction.delete(workspaces).where(eq(workspaces.ownerId, userId));

      await transaction
        .delete(codeExecutions)
        .where(eq(codeExecutions.actorId, userId));
      await transaction
        .delete(codeWorkspaces)
        .where(eq(codeWorkspaces.ownerId, userId));
      await transaction.delete(erdDiagrams).where(eq(erdDiagrams.ownerId, userId));

      const ownedTemplates = await transaction
        .select({ id: workspaceTemplates.id })
        .from(workspaceTemplates)
        .where(eq(workspaceTemplates.ownerId, userId));
      if (ownedTemplates.length > 0) {
        const templateIds = ownedTemplates.map((row) => row.id);
        await transaction
          .delete(templateVersions)
          .where(inArray(templateVersions.templateId, templateIds));
        await transaction
          .delete(workspaceTemplates)
          .where(eq(workspaceTemplates.ownerId, userId));
      }

      // `institution_memberships.approved_by` is ON DELETE SET NULL, so
      // deleting this row below doesn't need manual cleanup for memberships
      // this user approved on someone else's behalf.
      await transaction
        .delete(institutionMemberships)
        .where(eq(institutionMemberships.userId, userId));
      await transaction.delete(users).where(eq(users.id, userId));
    });
  }

  async countByRole(
    institutionId: string,
  ): Promise<Readonly<Record<Role, number>>> {
    const rows = await this.database
      .select({
        role: institutionMemberships.role,
        count: sql<number>`COUNT(DISTINCT ${institutionMemberships.userId})`,
      })
      .from(institutionMemberships)
      .where(
        and(
          eq(institutionMemberships.institutionId, institutionId),
          eq(institutionMemberships.approvalState, "approved"),
        ),
      )
      .groupBy(institutionMemberships.role);

    const result: Record<Role, number> = {
      student: 0,
      teacher: 0,
      administrator: 0,
    };
    for (const row of rows) result[row.role as Role] = Number(row.count);
    return result;
  }

  async countByStatus(
    institutionId: string,
  ): Promise<Readonly<Record<AccountStatus, number>>> {
    const rows = await this.database
      .select({
        status: users.status,
        count: sql<number>`COUNT(DISTINCT ${users.id})`,
      })
      .from(users)
      .innerJoin(
        institutionMemberships,
        eq(institutionMemberships.userId, users.id),
      )
      .where(eq(institutionMemberships.institutionId, institutionId))
      .groupBy(users.status);

    const result: Record<AccountStatus, number> = {
      pending_verification: 0,
      pending_approval: 0,
      active: 0,
      suspended: 0,
      deactivated: 0,
    };
    for (const row of rows) result[row.status as AccountStatus] = Number(row.count);
    return result;
  }

  async changeStatus(input: AccountStatusChange): Promise<AccountProfile> {
    const target = await this.findByFirebaseUid(input.targetFirebaseUid);
    if (!target) throw new Error("Target account was not found.");

    await this.database.transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({
          status: input.nextStatus,
          authorizationVersion: target.authorizationVersion + 1,
        })
        .where(eq(users.firebaseUid, input.targetFirebaseUid));

      if (input.nextStatus === "active") {
        await transaction
          .update(institutionMemberships)
          .set({
            approvalState: "approved",
            approvedBy: input.actor.id,
            approvedAt: new Date(),
          })
          .where(
            and(
              eq(institutionMemberships.userId, target.id),
              eq(institutionMemberships.approvalState, "pending"),
            ),
          );
      } else if (input.nextStatus === "deactivated") {
        await transaction
          .update(institutionMemberships)
          .set({ approvalState: "revoked" })
          .where(eq(institutionMemberships.userId, target.id));
      }
    });

    const changed = await this.findByFirebaseUid(input.targetFirebaseUid);
    if (!changed) throw new Error("Changed account could not be reloaded.");
    return changed;
  }

  // Used to bulk-revoke Firebase sessions when maintenance mode is enabled
  // — every account in the institution that doesn't hold `excludedRole`
  // (administrator), regardless of status, so a suspended account's stale
  // token can't be replayed either.
  async listActiveFirebaseUidsExcludingRole(
    institutionId: string,
    excludedRole: Role,
  ): Promise<readonly string[]> {
    const exemptRows = await this.database
      .select({ userId: institutionMemberships.userId })
      .from(institutionMemberships)
      .where(
        and(
          eq(institutionMemberships.institutionId, institutionId),
          eq(institutionMemberships.role, excludedRole),
        ),
      );
    const exemptIds = exemptRows.map((row) => row.userId);

    const rows = await this.database
      .selectDistinct({ firebaseUid: users.firebaseUid })
      .from(users)
      .innerJoin(
        institutionMemberships,
        eq(institutionMemberships.userId, users.id),
      )
      .where(
        exemptIds.length > 0
          ? and(
              eq(institutionMemberships.institutionId, institutionId),
              notInArray(users.id, exemptIds),
            )
          : eq(institutionMemberships.institutionId, institutionId),
      );
    return rows.map((row) => row.firebaseUid);
  }
}
