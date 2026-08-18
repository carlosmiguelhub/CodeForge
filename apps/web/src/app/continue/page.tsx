"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";
import { destinationForAccount } from "@/lib/role-routing";

export default function ContinuePage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.state === "anonymous") router.replace("/login");
    else if (auth.state === "unverified") router.replace("/verify-email");
    else if (auth.state === "unregistered") router.replace("/register");
    else if (auth.state === "ready")
      router.replace(destinationForAccount(auth.account));
  }, [auth.account, auth.state, router]);

  return (
    <IdentityFrame
      eyebrow="Authorization check"
      title={
        auth.state === "unavailable"
          ? "Identity services are not configured"
          : "Verifying access"
      }
      description={
        auth.state === "unavailable"
          ? "Provide the approved local Firebase and platform API environment values before testing identity workflows. No cloud resources were created automatically."
          : "SQWeb is checking identity, account state, institution, and role before selecting a dashboard."
      }
    >
      <div className="bg-divider h-1 overflow-hidden rounded-full">
        <div className="bg-action h-full w-1/2 motion-safe:animate-pulse" />
      </div>
    </IdentityFrame>
  );
}
