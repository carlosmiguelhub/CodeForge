"use client";

import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";

export default function PendingApprovalPage() {
  const auth = useAuth();
  const router = useRouter();
  return (
    <IdentityFrame
      eyebrow="Account review"
      title="Approval pending"
      description="Your verified teacher account is waiting for an administrator. CodeForge will not grant teacher permissions until the server-side membership is approved."
    >
      <div className="space-y-3">
        <button
          type="button"
          onClick={() =>
            void auth.reloadIdentity().then(() => router.push("/continue"))
          }
          className="rounded-control bg-action h-10 w-full px-4 font-semibold text-white"
        >
          Check approval status
        </button>
        <button
          type="button"
          onClick={() => void auth.signOut().then(() => router.push("/login"))}
          className="rounded-control border-structural bg-surface text-ink-primary h-10 w-full border px-4"
        >
          Sign out
        </button>
      </div>
    </IdentityFrame>
  );
}
