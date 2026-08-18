"use client";

import type { RequestedRegistrationRole } from "@sqweb/contracts";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";
import { IdentityStatus } from "@/components/auth/identity-status";

export default function RegisterPage() {
  const auth = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const canCompleteProfile =
    auth.state === "unregistered" && auth.user?.emailVerified;

  async function createIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await auth.createEmailAccount(
        String(form.get("email")),
        String(form.get("password")),
        String(form.get("displayName")),
      );
      router.push("/verify-email");
    } catch {
      // AuthProvider exposes a safe user-facing error message.
    } finally {
      setBusy(false);
    }
  }

  async function completeProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await auth.completeRegistration(
        String(form.get("displayName")),
        String(form.get("requestedRole")) as RequestedRegistrationRole,
      );
      router.push("/continue");
    } catch {
      // Registration remains on this screen; no authority is assumed.
    } finally {
      setBusy(false);
    }
  }

  return (
    <IdentityFrame
      eyebrow="Account registration"
      title={
        canCompleteProfile ? "Complete your profile" : "Create an identity"
      }
      description={
        canCompleteProfile
          ? "Choose the educational role you are requesting. Teacher access requires administrator approval."
          : "Create a Firebase identity first. Email verification is required before SQWeb creates a platform account."
      }
    >
      {auth.error ? (
        <div className="mb-4">
          <IdentityStatus tone="error">{auth.error}</IdentityStatus>
        </div>
      ) : null}
      {canCompleteProfile ? (
        <form
          className="space-y-4"
          onSubmit={(event) => void completeProfile(event)}
        >
          <label className="block">
            <span className="text-ink-secondary mb-1.5 block text-xs font-medium">
              Display name
            </span>
            <input
              name="displayName"
              defaultValue={auth.user?.displayName ?? ""}
              required
              minLength={2}
              maxLength={120}
              className="rounded-control border-divider bg-surface text-ink-primary focus:border-action h-10 w-full border px-3"
            />
          </label>
          <fieldset>
            <legend className="text-ink-secondary mb-2 text-xs font-medium">
              Requested role
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["student", "teacher"] as const).map((role) => (
                <label
                  key={role}
                  className="rounded-control border-divider bg-surface text-ink-secondary has-checked:border-action has-checked:text-ink-primary flex min-h-16 items-center gap-2 border px-3 capitalize"
                >
                  <input
                    type="radio"
                    name="requestedRole"
                    value={role}
                    required
                  />
                  {role}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={busy}
            className="rounded-control bg-action h-10 w-full px-4 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Completing…" : "Complete registration"}
          </button>
          <p className="text-ink-muted text-xs leading-5">
            Administrator accounts cannot be requested through public
            registration.
          </p>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => void createIdentity(event)}
        >
          <label className="block">
            <span className="text-ink-secondary mb-1.5 block text-xs font-medium">
              Display name
            </span>
            <input
              name="displayName"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              className="rounded-control border-divider bg-surface text-ink-primary focus:border-action h-10 w-full border px-3"
            />
          </label>
          <label className="block">
            <span className="text-ink-secondary mb-1.5 block text-xs font-medium">
              Email address
            </span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-control border-divider bg-surface text-ink-primary focus:border-action h-10 w-full border px-3"
            />
          </label>
          <label className="block">
            <span className="text-ink-secondary mb-1.5 block text-xs font-medium">
              Password
            </span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-control border-divider bg-surface text-ink-primary focus:border-action h-10 w-full border px-3"
            />
          </label>
          <button
            type="submit"
            disabled={busy || auth.state === "unavailable"}
            className="rounded-control bg-action h-10 w-full px-4 font-semibold text-white disabled:opacity-50"
          >
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
      )}
    </IdentityFrame>
  );
}
