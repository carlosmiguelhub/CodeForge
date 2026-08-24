"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";

export default function AccountUnavailablePage() {
  const auth = useAuth();
  const router = useRouter();

  // Landing here means the account is suspended/deactivated — end the
  // Firebase session automatically rather than leaving the user nominally
  // signed in until they click the button below.
  useEffect(() => {
    void auth.signOut();
    // Only ever needs to fire once per mount — `auth` is a fresh object
    // every render, so it's deliberately not in the dependency array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
