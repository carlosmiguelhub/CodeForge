import type { AccountStatus } from "@sqweb/contracts";

export const accountStatusLabels: Record<AccountStatus, string> = {
  pending_verification: "Verifying email",
  pending_approval: "Awaiting approval",
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
};
