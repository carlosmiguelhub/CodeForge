"use client";

import { Mail } from "lucide-react";
import { type FormEvent, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";
import { IdentityStatus } from "@/components/auth/identity-status";
import { TextField } from "@/components/auth/text-field";
import { Spinner } from "@/components/ui/spinner";

export default function ForgotPasswordPage() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await auth.sendPasswordReset(String(form.get("email")));
      setSent(true);
    } catch {
      // AuthProvider exposes a safe user-facing error message.
    } finally {
      setBusy(false);
    }
  }

  return (
    <IdentityFrame
      eyebrow="Password recovery"
      title="Reset your password"
      description="Enter the email address on your account. If it's registered, we'll send a link to reset your password."
    >
      <div className="space-y-4">
        {sent ? (
          <IdentityStatus tone="success">
            If that email is registered, a password reset link is on its way.
          </IdentityStatus>
        ) : null}
        {auth.error ? (
          <IdentityStatus tone="error">{auth.error}</IdentityStatus>
        ) : null}
        <form
          method="post"
          className="space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          <TextField
            label="Email address"
            icon={Mail}
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <button
            type="submit"
            disabled={busy || auth.state === "unavailable"}
            className="rounded-control bg-action hover:bg-action/90 flex h-10 w-full items-center justify-center gap-2 px-4 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Spinner size={16} /> : null}
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <p className="text-ink-muted text-center text-xs">
          Remembered it?{" "}
          <a
            href="/login"
            className="text-action-soft underline-offset-4 hover:underline"
          >
            Sign in
          </a>
        </p>
      </div>
    </IdentityFrame>
  );
}
