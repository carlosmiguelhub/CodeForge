"use client";

import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";

export default function AccountUnavailablePage() {
  const auth = useAuth();
  const router = useRouter();
  return (
    <IdentityFrame
      eyebrow="Access unavailable"
      title="This account cannot continue"
      description="The platform has suspended or deactivated this account. Contact an administrator if you believe this is incorrect."
    >
      <button
        type="button"
        onClick={() => void auth.signOut().then(() => router.push("/login"))}
        className="rounded-control border-structural bg-surface text-ink-primary h-10 w-full border px-4"
      >
        Sign out
      </button>
    </IdentityFrame>
  );
}
