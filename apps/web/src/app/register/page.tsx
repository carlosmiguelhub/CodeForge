"use client";

import { sectionSchema, type Section } from "@sqweb/contracts";
import { Lock, Mail, Users, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { z } from "zod";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";
import { IdentityStatus } from "@/components/auth/identity-status";
import { TextField } from "@/components/auth/text-field";
import { Spinner } from "@/components/ui/spinner";
import { setPendingSectionId } from "@/lib/pending-section";
import { passwordPolicyError } from "@/lib/password-policy";

const sectionListSchema = z.array(sectionSchema);

export default function RegisterPage() {
  const auth = useAuth();
  const { publicFetch } = auth;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sections, setSections] = useState<readonly Section[] | null>(null);
  const [sectionsError, setSectionsError] = useState<string | null>(null);

  useEffect(() => {
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
    // AuthProvider recreates its whole context value object every render,
    // so depending on `auth` here (instead of the specific stable
    // publicFetch callback) would re-run this effect on every re-render.
  }, [publicFetch]);

  async function createIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const confirmPassword = String(form.get("confirmPassword"));
    const sectionId = String(form.get("sectionId") || "");

    const policyError = passwordPolicyError(password);
    if (policyError) {
      setFormError(policyError);
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    if (!sectionId) {
      setFormError("Select a section.");
      return;
    }

    setBusy(true);
    try {
      await auth.createEmailAccount(
        String(form.get("email")),
        password,
        String(form.get("displayName")),
      );
      setPendingSectionId(sectionId);
      await auth.signOut();
      router.push("/login?registered=1");
    } catch {
      // AuthProvider exposes a safe user-facing error message.
    } finally {
      setBusy(false);
    }
  }

  return (
    <IdentityFrame
      eyebrow="Account registration"
      title="Create an identity"
      description="Every account starts as a student. Verify your email, then sign in — an administrator can grant teacher access later."
    >
      {formError || auth.error ? (
        <div className="mb-4">
          <IdentityStatus tone="error">
            {formError ?? auth.error ?? ""}
          </IdentityStatus>
        </div>
      ) : null}
      <form
        method="post"
        className="space-y-4"
        onSubmit={(event) => void createIdentity(event)}
      >
        <TextField
          label="Display name"
          icon={User}
          name="displayName"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
        />
        <label htmlFor="sectionId" className="block">
          <span className="text-ink-secondary mb-1.5 block text-xs font-medium">
            Section
          </span>
          <div className="relative">
            <Users
              aria-hidden="true"
              size={16}
              className="text-ink-disabled pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            />
            <select
              id="sectionId"
              name="sectionId"
              required
              disabled={!sections || sections.length === 0}
              defaultValue=""
              className="rounded-control border-structural bg-elevated text-ink-primary focus:border-action h-10 w-full appearance-none border py-2 pr-3 pl-9 transition-colors disabled:opacity-60"
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
          </div>
          {sectionsError ? (
            <p className="text-danger mt-1.5 text-xs">{sectionsError}</p>
          ) : null}
        </label>
        <TextField
          label="Email address"
          icon={Mail}
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <TextField
          label="Password"
          icon={Lock}
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <TextField
          label="Confirm password"
          icon={Lock}
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-ink-muted -mt-2 text-xs leading-5">
          At least 8 characters, including one special character (e.g. ! @ # $
          %).
        </p>
        <button
          type="submit"
          disabled={busy || auth.state === "unavailable"}
          className="rounded-control bg-action hover:bg-action/90 flex h-10 w-full items-center justify-center gap-2 px-4 font-semibold text-white transition-colors disabled:opacity-50"
        >
          {busy ? <Spinner size={16} /> : null}
          {busy ? "Creating…" : "Create account"}
        </button>
        <p className="text-ink-muted text-center text-xs">
          Already registered?{" "}
          <a
            href="/login"
            className="text-action-soft underline-offset-4 hover:underline"
          >
            Sign in
          </a>
        </p>
      </form>
    </IdentityFrame>
  );
}
