import type { AccountProfile } from "@sqweb/contracts";
import { describe, expect, it } from "vitest";

import { destinationForAccount } from "./role-routing";

const baseAccount: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "firebase-user",
  email: "user@example.edu",
  displayName: "User",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active",
  roles: ["student"],
  sectionId: null,
  authorizationVersion: 1,
};

describe("identity role routing", () => {
  it("routes unregistered identities to registration", () => {
    expect(destinationForAccount(null)).toBe("/register");
  });

  it("keeps pending teachers out of role dashboards", () => {
    expect(
      destinationForAccount({
        ...baseAccount,
        status: "pending_approval",
        roles: [],
      }),
    ).toBe("/pending-approval");
  });

  it("routes active roles to their own dashboard", () => {
    expect(destinationForAccount(baseAccount)).toBe("/student");
    expect(destinationForAccount({ ...baseAccount, roles: ["teacher"] })).toBe(
      "/teacher",
    );
    expect(
      destinationForAccount({ ...baseAccount, roles: ["administrator"] }),
    ).toBe("/admin");
  });
});
