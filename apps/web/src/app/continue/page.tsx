"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";
import { IdentityStatus } from "@/components/auth/identity-status";
import {
  clearPendingSectionId,
  getPendingSectionId,
} from "@/lib/pending-section";
import { destinationForAccount } from "@/lib/role-routing";

export default function ContinuePage() {
  const auth = useAuth();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [provisionFailed, setProvisionFailed] = useState(false);
  const provisioningRef = useRef(false);

  useEffect(() => {
    if (auth.state === "anonymous") router.replace("/login");
    else if (auth.state === "unverified") router.replace("/verify-email");
    else if (auth.state === "ready")
      router.replace(destinationForAccount(auth.account));
  }, [auth.account, auth.state, router]);

  useEffect(() => {
    if (auth.state !== "unregistered") {
      provisioningRef.current = false;
      return;
    }
    if (provisioningRef.current) return;
    provisioningRef.current = true;
    setProvisionFailed(false);
    void auth
      .completeRegistration(
        auth.user?.displayName ?? "CodeForge user",
        "student",
        getPendingSectionId() ?? undefined,
      )
      .then(() => clearPendingSectionId())
      .catch(() => setProvisionFailed(true));
  }, [auth]);

  async function retrySync() {
    setRetrying(true);
    try {
      await auth.reloadIdentity();
    } finally {
      setRetrying(false);
    }
  }

  async function retryProvisioning() {
    setRetrying(true);
    setProvisionFailed(false);
    try {
      await auth.completeRegistration(
        auth.user?.displayName ?? "CodeForge user",
        "student",
        getPendingSectionId() ?? undefined,
      );
      clearPendingSectionId();
    } catch {
      setProvisionFailed(true);
    } finally {
      setRetrying(false);
    }
  }

  if (
    auth.state === "sync_error" ||
    (auth.state === "unregistered" && provisionFailed)
  ) {
    return (
      <IdentityFrame
        eyebrow="Authorization check"
        title="Could not reach CodeForge"
        description="You're signed in, but the platform server could not be reached. This is usually temporary."
      >
        <div className="space-y-4">
          {auth.error ? (
            <IdentityStatus tone="error">{auth.error}</IdentityStatus>
          ) : null}
          <button
            type="button"
            disabled={retrying}
            onClick={() =>
              void (auth.state === "sync_error"
                ? retrySync()
                : retryProvisioning())
            }
            className="rounded-control bg-action hover:bg-action/90 flex h-10 w-full items-center justify-center gap-2 px-4 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      </IdentityFrame>
    );
  }

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
          : "CodeForge is checking identity, account state, institution, and role before selecting a dashboard."
      }
    >
      <div className="bg-divider h-1 overflow-hidden rounded-full">
        <div className="bg-action h-full w-1/2 motion-safe:animate-pulse" />
      </div>
    </IdentityFrame>
  );
}
