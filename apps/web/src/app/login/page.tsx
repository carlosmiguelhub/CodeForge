"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { IdentityFrame } from "@/components/auth/identity-frame";
import { IdentityStatus } from "@/components/auth/identity-status";
import { useAuth } from "@/components/auth/auth-provider";

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await auth.signInWithEmail(
        String(form.get("email")),
        String(form.get("password")),
      );
      router.push("/continue");
    } catch {
      // AuthProvider exposes a safe user-facing error message.
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    try {
      await auth.signInWithGoogle();
      router.push("/continue");
    } catch {
      // AuthProvider exposes a safe user-facing error message.
    } finally {
      setBusy(false);
    }
  }

  return (
    <IdentityFrame
      eyebrow="Authorized access"
      title="Sign in"
      description="Use your verified SQWeb identity. Role and account state are checked again by the platform API."
    >
      <div className="space-y-4">
        {auth.state === "unavailable" ? (
          <IdentityStatus tone="error">
            Firebase and the platform API are not configured. Copy
            `.env.example` and provide approved local values.
          </IdentityStatus>
        ) : null}
        {auth.error ? (
          <IdentityStatus tone="error">{auth.error}</IdentityStatus>
        ) : null}
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block">
            <span className="text-ink-secondary mb-1.5 block text-xs font-medium">
              Email address
            </span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="rounded-control border-divider bg-surface text-ink-primary placeholder:text-ink-disabled focus:border-action h-10 w-full border px-3"
            />
          </label>
          <label className="block">
            <span className="text-ink-secondary mb-1.5 block text-xs font-medium">
              Password
            </span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-control border-divider bg-surface text-ink-primary focus:border-action h-10 w-full border px-3"
            />
          </label>
          <button
            type="submit"
            disabled={busy || auth.state === "unavailable"}
            className="rounded-control bg-action h-10 w-full px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="text-ink-muted flex items-center gap-3 text-xs">
          <span className="bg-divider h-px flex-1" />
          or
          <span className="bg-divider h-px flex-1" />
        </div>
        <button
          type="button"
          disabled={busy || auth.state === "unavailable"}
          onClick={() => void googleSignIn()}
          className="rounded-control border-structural bg-surface text-ink-primary hover:bg-elevated h-10 w-full border px-4 font-medium disabled:opacity-50"
        >
          Continue with Google
        </button>
        <p className="text-ink-muted text-center text-xs">
          Need an account?{" "}
          <a
            href="/register"
            className="text-action-soft underline-offset-4 hover:underline"
          >
            Register
          </a>
        </p>
      </div>
    </IdentityFrame>
  );
}
