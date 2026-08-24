"use client";

import { KeyRound, Mail, ShieldCheck, User } from "lucide-react";
import { type FormEvent, useState } from "react";

import { roleLabels } from "@/components/app-shell/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { accountStatusLabels } from "@/lib/account-labels";
import { IDLE_TIMEOUT_MS } from "@/lib/idle-session";

export function AccountSettings() {
  const auth = useAuth();
  const account = auth.account;
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<
    { tone: "success" | "error"; message: string } | undefined
  >(undefined);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  if (!account) return null;

  const trimmedName = displayName.trim();
  const nameChanged = trimmedName.length > 0 && trimmedName !== account.displayName;

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nameChanged) return;
    setSavingName(true);
    setNameFeedback(undefined);
    try {
      await auth.updateDisplayName(trimmedName);
      setNameFeedback({ tone: "success", message: "Display name updated." });
    } catch (error) {
      setNameFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Your display name could not be updated. Try again.",
      });
    } finally {
      setSavingName(false);
    }
  }

  async function sendPasswordReset() {
    if (!account) return;
    setSendingReset(true);
    setResetSent(false);
    try {
      await auth.sendPasswordReset(account.email);
      setResetSent(true);
    } catch {
      // AuthProvider exposes a safe user-facing error message via auth.error.
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <section className="border-structural bg-surface rounded-panel border">
        <div className="border-divider border-b px-4 py-3">
          <h2 className="font-heading text-ink-primary flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
            <User aria-hidden="true" size={16} className="text-action-soft" />
            Profile
          </h2>
          <p className="text-ink-muted mt-1 text-xs">
            How your name appears across CodeForge.
          </p>
        </div>
        <form onSubmit={(event) => void saveDisplayName(event)} className="p-4">
          <div className="flex items-center gap-3">
            <span className="border-structural bg-elevated text-action-soft font-heading grid size-12 shrink-0 place-items-center rounded-full border text-base font-bold">
              {(displayName.slice(0, 1) || "?").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <label className="text-ink-muted mb-1.5 block text-[11px]">
                Display name
                <input
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setNameFeedback(undefined);
                  }}
                  maxLength={120}
                  className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
                />
              </label>
            </div>
          </div>

          <div className="border-divider mt-4 flex items-center gap-2 border-t pt-3 text-xs">
            <Mail aria-hidden="true" size={14} className="text-ink-disabled" />
            <span className="text-ink-muted">{account.email}</span>
          </div>

          {nameFeedback ? (
            <div className="mt-3">
              <IdentityStatus tone={nameFeedback.tone}>
                {nameFeedback.message}
              </IdentityStatus>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={!nameChanged || savingName}
              className="rounded-control bg-action hover:bg-action/90 flex min-h-9 items-center gap-2 px-4 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingName ? <Spinner size={14} /> : null}
              {savingName ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>

      <section className="border-structural bg-surface rounded-panel border">
        <div className="border-divider border-b px-4 py-3">
          <h2 className="font-heading text-ink-primary flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
            <KeyRound
              aria-hidden="true"
              size={16}
              className="text-action-soft"
            />
            Password &amp; security
          </h2>
          <p className="text-ink-muted mt-1 text-xs">
            We&apos;ll email a secure link to {account.email} to set a new
            password — CodeForge never sees your current one.
          </p>
        </div>
        <div className="space-y-3 p-4">
          {resetSent ? (
            <IdentityStatus tone="success">
              {`Check ${account.email} for a link to set a new password.`}
            </IdentityStatus>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-ink-muted text-xs leading-5">
              You&apos;re automatically signed out after{" "}
              {IDLE_TIMEOUT_MS / 60_000} minutes of inactivity, for security.
            </p>
            <button
              type="button"
              disabled={sendingReset}
              onClick={() => void sendPasswordReset()}
              className="border-structural text-ink-secondary rounded-control flex min-h-9 shrink-0 items-center gap-2 border px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendingReset ? <Spinner size={13} /> : null}
              {sendingReset ? "Sending…" : "Send reset link"}
            </button>
          </div>
        </div>
      </section>

      <section className="border-structural bg-surface rounded-panel border">
        <div className="border-divider border-b px-4 py-3">
          <h2 className="font-heading text-ink-primary flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
            <ShieldCheck
              aria-hidden="true"
              size={16}
              className="text-action-soft"
            />
            Role &amp; account
          </h2>
          <p className="text-ink-muted mt-1 text-xs">
            Contact an administrator to change your role or account status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {account.roles.map((role) => (
            <span
              key={role}
              className="border-divider bg-elevated text-ink-secondary rounded-control border px-2.5 py-1 text-[11px] font-medium"
            >
              {roleLabels[role]}
            </span>
          ))}
          <span className="border-divider bg-elevated text-ink-secondary rounded-control border px-2.5 py-1 text-[11px] font-medium">
            {accountStatusLabels[account.status]}
          </span>
        </div>
      </section>
    </div>
  );
}
