import type { AccountProfile, Role } from "@sqweb/contracts";

export function dashboardForRole(role: Role): string {
  switch (role) {
    case "student":
      return "/student";
    case "teacher":
      return "/teacher";
    case "administrator":
      return "/admin";
  }
}

export function destinationForAccount(account: AccountProfile | null): string {
  if (!account) return "/register";
  if (account.status === "pending_verification") return "/verify-email";
  if (account.status === "pending_approval") return "/pending-approval";
  if (account.status === "suspended" || account.status === "deactivated") {
    return "/account-unavailable";
  }
  const role = account.roles[0];
  return role ? dashboardForRole(role) : "/account-unavailable";
}
