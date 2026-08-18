import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { AuthorizationError, type AccountProfile } from "@sqweb/auth";
import { z } from "zod";

import type { ConfirmationPayload, ExecutionGrantPayload } from "./types";

const executionPayloadSchema = z.object({
  kind: z.literal("execution"),
  uid: z.string().min(1),
  accountId: z.string().uuid(),
  institutionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
  nonce: z.string().uuid(),
});
const confirmationPayloadSchema = z.object({
  kind: z.literal("confirmation"),
  uid: z.string().min(1),
  workspaceId: z.string().uuid(),
  statementHash: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
  nonce: z.string().uuid(),
});

export class ExecutionGrantSigner {
  constructor(private readonly secret: string) {
    if (secret.length < 32)
      throw new Error("Execution grant secret must be at least 32 characters.");
  }

  private signPayload(payload: object) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.secret)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verifyRaw(token: string): unknown {
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra)
      throw new AuthorizationError(
        "INVALID_GRANT",
        "Execution authorization is invalid.",
        403,
      );
    const expected = createHmac("sha256", this.secret).update(encoded).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new AuthorizationError(
        "INVALID_GRANT",
        "Execution authorization is invalid.",
        403,
      );
    try {
      return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw new AuthorizationError(
        "INVALID_GRANT",
        "Execution authorization is invalid.",
        403,
      );
    }
  }

  issueExecution(
    account: AccountProfile,
    workspaceId: string,
    lifetimeSeconds = 60,
  ) {
    const now = Math.floor(Date.now() / 1000);
    const payload: ExecutionGrantPayload = {
      kind: "execution",
      uid: account.firebaseUid,
      accountId: account.id,
      institutionId: account.institutionId,
      workspaceId,
      issuedAt: now,
      expiresAt: now + lifetimeSeconds,
      nonce: randomUUID(),
    };
    return { token: this.signPayload(payload), payload };
  }

  verifyExecution(token: string, uid: string) {
    const payload = executionPayloadSchema.parse(this.verifyRaw(token));
    if (
      payload.uid !== uid ||
      payload.expiresAt < Math.floor(Date.now() / 1000)
    )
      throw new AuthorizationError(
        "INVALID_GRANT",
        "Execution authorization expired or does not match.",
        403,
      );
    return payload;
  }

  issueConfirmation(uid: string, workspaceId: string, statementHash: string) {
    const now = Math.floor(Date.now() / 1000);
    const payload: ConfirmationPayload = {
      kind: "confirmation",
      uid,
      workspaceId,
      statementHash,
      issuedAt: now,
      expiresAt: now + 60,
      nonce: randomUUID(),
    };
    return this.signPayload(payload);
  }

  verifyConfirmation(
    token: string,
    uid: string,
    workspaceId: string,
    statementHash: string,
  ) {
    const payload = confirmationPayloadSchema.parse(this.verifyRaw(token));
    if (
      payload.uid !== uid ||
      payload.workspaceId !== workspaceId ||
      payload.statementHash !== statementHash ||
      payload.expiresAt < Math.floor(Date.now() / 1000)
    )
      throw new AuthorizationError(
        "INVALID_CONFIRMATION",
        "Destructive confirmation is invalid or expired.",
        403,
      );
    return payload;
  }
}
