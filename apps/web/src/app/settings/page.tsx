"use client";

import { AppShell } from "@/components/app-shell/app-shell";
import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { AccountSettings } from "@/components/settings/account-settings";

export default function SettingsPage() {
  const auth = useAuth();
  const role = auth.account?.roles[0] ?? "student";

  return (
    <ProtectedRolePage>
      <AppShell
        role={role}
        activeHref="/settings"
        eyebrow="Account"
        pageTitle="Settings"
      >
        <AccountSettings />
      </AppShell>
    </ProtectedRolePage>
  );
}
