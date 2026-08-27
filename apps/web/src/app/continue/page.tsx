"use client";

import { sectionSchema, type Section } from "@sqweb/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";
import { IdentityStatus } from "@/components/auth/identity-status";
import {
  clearPendingSectionId,
  getPendingSectionId,
} from "@/lib/pending-section";
import { destinationForAccount } from "@/lib/role-routing";

const sectionListSchema = z.array(sectionSchema);

export default function ContinuePage() {
  const auth = useAuth();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [provisionFailed, setProvisionFailed] = useState(false);
  // The section chosen at /register lives in sessionStorage, tab-scoped —
  // it does not survive email verification happening on a different
  // device/tab (checking mail on a phone, the original tab being closed),
  // which is the common case, not an edge case. When provisioning fails,
  // rather than blindly retrying with whatever (possibly missing) value
  // sessionStorage still has, let the user pick a section right here.
  const [sections, setSections] = useState<readonly Section[] | null>(null);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState(
    () => getPendingSectionId() ?? "",
  );
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

  const { publicFetch } = auth;
  useEffect(() => {
    if (!provisionFailed) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await publicFetch("/v1/sections");
        if (!response.ok) throw new Error();
        const parsed = sectionListSchema.parse(await response.json());
        if (!cancelled) setSections(parsed);
      } catch {
        if (!cancelled)
          setSectionsError(
            "Sections could not be loaded. Refresh the page to try again.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provisionFailed, publicFetch]);

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
        selectedSectionId || undefined,
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
    const needsSection = auth.state === "unregistered";
    return (
      <IdentityFrame
        eyebrow="Authorization check"
        title={needsSection ? "Finish setting up your account" : "Could not reach CodeForge"}
        description={
          needsSection
            ? "Your section selection didn't carry over (this can happen if you verified your email on a different device). Pick your section to finish."
            : "You're signed in, but the platform server could not be reached. This is usually temporary."
        }
      >
        <div className="space-y-4">
          {auth.error ? (
            <IdentityStatus tone="error">{auth.error}</IdentityStatus>
          ) : null}
          {needsSection ? (
            <label htmlFor="sectionId" className="block">
              <span className="text-ink-secondary mb-1.5 block text-xs font-medium">
                Section
              </span>
              <select
                id="sectionId"
                required
                disabled={!sections || sections.length === 0}
                value={selectedSectionId}
                onChange={(event) => setSelectedSectionId(event.target.value)}
                className="rounded-control border-structural bg-elevated text-ink-primary focus:border-action h-10 w-full border px-3 transition-colors disabled:opacity-60"
              >
                <option value="" disabled>
                  {sections === null
                    ? "Loading sections…"
                    : sections.length === 0
                      ? "No sections available yet"
                      : "Select your section"}
                </option>
                {(sections ?? []).map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
              {sectionsError ? (
                <p className="text-danger mt-1.5 text-xs">{sectionsError}</p>
              ) : null}
            </label>
          ) : null}
          <button
            type="button"
            disabled={
              retrying || (needsSection && !selectedSectionId)
            }
            onClick={() =>
              void (auth.state === "sync_error"
                ? retrySync()
                : retryProvisioning())
            }
            className="rounded-control bg-action hover:bg-action/90 flex h-10 w-full items-center justify-center gap-2 px-4 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Continue"}
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
