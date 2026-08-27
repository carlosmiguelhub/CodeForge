"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

export default function VerifyEmailPage() {
  const auth = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Guards against the background poll and a manual button click racing
  // each other into two overlapping reloadIdentity() calls.
  const checkingRef = useRef(false);

  async function attemptCheck(reportOutcome: boolean) {
    if (checkingRef.current) return;
    checkingRef.current = true;
    if (reportOutcome) {
      setBusy(true);
      setStatus(null);
    }
    try {
      const verified = await auth.reloadIdentity();
      if (verified) {
        router.push("/continue");
      } else if (reportOutcome) {
        setStatus({
          tone: "error",
          text: "Your email isn't verified yet. Open the link we sent you, then try again.",
        });
      }
    } catch {
      if (reportOutcome)
        setStatus({
          tone: "error",
          text: "Could not check your verification status. Try again.",
        });
    } finally {
      checkingRef.current = false;
      if (reportOutcome) setBusy(false);
    }
  }

  // The verification link is almost always opened in a different tab or on
  // a different device — this tab has no way to know that happened except
  // by asking Firebase again. Poll quietly in the background (even while
  // this tab is hidden, since switching to a phone to click the link is the
  // common case) so most people never have to click anything at all.
  usePolling(
    () => void attemptCheck(false),
    DEFAULT_POLL_INTERVAL_MS,
    true,
    false,
  );

  async function resend() {
    setBusy(true);
    setStatus(null);
    try {
      await auth.resendVerification();
      setStatus({
        tone: "success",
        text: "A new verification email was sent.",
      });
    } catch {
      setStatus({
        tone: "error",
        text: "Could not resend the verification email. Wait a moment and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function backToLogin() {
    setBusy(true);
    try {
      await auth.signOut();
      router.push("/login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <IdentityFrame
      eyebrow="Email verification"
      title="Verify your email"
      description={`Open the verification link sent to ${auth.user?.email ?? "your email address"}. This page checks automatically every few seconds, so you don't need to come back and click anything.`}
    >
      <div className="space-y-3">
        {status ? (
          <IdentityStatus tone={status.tone}>{status.text}</IdentityStatus>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void attemptCheck(true)}
          className="rounded-control bg-action flex h-10 w-full items-center justify-center gap-2 px-4 font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Spinner size={16} /> : null}I have verified my email
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void resend()}
          className="rounded-control border-structural bg-surface text-ink-primary flex h-10 w-full items-center justify-center gap-2 border px-4 font-medium disabled:opacity-50"
        >
          {busy ? <Spinner size={16} /> : null}
          Resend verification email
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void backToLogin()}
          className="text-ink-muted w-full text-center text-xs underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Wrong account? Sign out and go back to login
        </button>
      </div>
    </IdentityFrame>
  );
}
