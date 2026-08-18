"use client";

import type { Role } from "@sqweb/contracts";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { useAuth } from "./auth-provider";
import { destinationForAccount } from "@/lib/role-routing";

export function ProtectedRolePage({
  role,
  children,
}: Readonly<{ role: Role; children: ReactNode }>) {
  const auth = useAuth();
  const router = useRouter();
  const allowed =
    auth.state === "ready" &&
    auth.account?.status === "active" &&
    auth.account.roles.includes(role);

  useEffect(() => {
    if (auth.state === "initializing") return;
    if (!allowed) {
      router.replace(
        auth.state === "anonymous"
          ? "/login"
          : destinationForAccount(auth.account),
      );
    }
  }, [allowed, auth.account, auth.state, router]);

  if (!allowed)
    return (
      <main className="bg-canvas text-ink-muted grid min-h-dvh place-items-center text-sm">
        Checking authorized role…
      </main>
    );
  return children;
}
