"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityFrame } from "@/components/auth/identity-frame";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";

export default function VerifyEmailPage() {
  const auth = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setStatus(null);
    try {
      const verified = await auth.reloadIdentity();
      if (verified) {
        router.push("/continue");
      } else {
        setStatus({
          tone: "error",
          text: "Your email isn't verified yet. Open the link we sent you, then try again.",
        });
      }
    } catch {
      setStatus({
        tone: "error",
        text: "Could not check your verification status. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <IdentityFrame
      eyebrow="Email verification"
      title="Verify your email"
      description={`Open the verification link sent to ${auth.user?.email ?? "your email address"}, then return here.`}
    >
      <div className="space-y-3">
        {status ? (
          <IdentityStatus tone={status.tone}>{status.text}</IdentityStatus>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void check()}
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
      </div>
    </IdentityFrame>
  );
}
