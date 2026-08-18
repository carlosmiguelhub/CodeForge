import { randomUUID } from "node:crypto";

import type {
  AccountProfile,
  AccountRepository,
  AccountStatusChange,
  RegistrationInput,
} from "@sqweb/auth";
import type { AccountStatus, Role } from "@sqweb/contracts";
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { institutionMemberships, platformSchema, users } from "./schema";

type PlatformDatabase = MySql2Database<typeof platformSchema>;

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

    const first = rows[0];
    if (!first) return null;

    return {
      id: first.user.id,
      firebaseUid: first.user.firebaseUid,
      email: first.user.email,
      displayName: first.user.displayName,
      institutionId: first.membership.institutionId,
      status: first.user.status as AccountStatus,
      roles: rows
        .filter((row) => row.membership.approvalState === "approved")
        .map((row) => row.membership.role as Role),
      authorizationVersion: first.user.authorizationVersion,
    };
  }

  async register(input: RegistrationInput): Promise<AccountProfile> {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const isStudent = input.requestedRole === "student";
    const status: AccountStatus = isStudent ? "active" : "pending_approval";

    await this.database.transaction(async (transaction) => {
      await transaction.insert(users).values({
        id: userId,
        firebaseUid: input.identity.uid,
        email: input.identity.email.toLowerCase(),
        displayName: input.displayName,
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

  async listPending(institutionId: string): Promise<readonly AccountProfile[]> {
    const rows = await this.database
      .select({ firebaseUid: users.firebaseUid })
      .from(users)
      .innerJoin(
        institutionMemberships,
        eq(institutionMemberships.userId, users.id),
      )
      .where(
        and(
          eq(institutionMemberships.institutionId, institutionId),
          eq(users.status, "pending_approval"),
        ),
      );

    const accounts = await Promise.all(
      rows.map((row) => this.findByFirebaseUid(row.firebaseUid)),
    );
    return accounts.filter(
      (account): account is AccountProfile => account !== null,
    );
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
}
