"use client";

import {
  accountProfileSchema,
  type AccountProfile,
  type Role,
} from "@sqweb/contracts";
import { UserPlus, X } from "lucide-react";
import { type FormEvent, useState } from "react";

import { roleLabels } from "@/components/app-shell/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";

const allRoles: readonly Role[] = ["student", "teacher", "administrator"];

export function AddUserDialog({
  onClose,
  onCreated,
}: Readonly<{
  onClose: () => void;
  onCreated: (account: AccountProfile) => void;
}>) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<readonly Role[]>(["student"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: Role) {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((value) => value !== role)
        : [...current, role],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (roles.length === 0) {
      setError("Select at least one role.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await auth.authorizedFetch(
        "/v1/admin/users",
        {
          method: "POST",
          body: JSON.stringify({ email, displayName, roles }),
        },
        true,
      );
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? "An account already uses this email address."
            : "The account could not be created.",
        );
      }
      const account = accountProfileSchema.parse(await response.json());
      // Best-effort — the account exists either way. This is the same
      // unauthenticated, email-keyed reset call the self-service flow
      // uses, letting the new user set their own initial password.
      await auth.sendPasswordReset(account.email).catch(() => undefined);
      onCreated(account);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The account could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-user-title"
      className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-structural bg-elevated rounded-panel w-full max-w-md border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider flex items-center justify-between gap-4 border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-control border-divider bg-surface text-action-soft grid size-9 shrink-0 place-items-center border">
              <UserPlus aria-hidden="true" size={17} strokeWidth={1.7} />
            </span>
            <h2
              id="add-user-title"
              className="font-heading text-ink-primary text-base font-semibold"
            >
              Add user
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:bg-elevated-high hover:text-ink-primary rounded-control grid size-8 shrink-0 place-items-center"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <form
          onSubmit={(event) => void submit(event)}
          className="space-y-4 p-5"
        >
          <p className="text-ink-muted text-xs leading-5">
            The account is active immediately and skips email verification — the
            new user sets their own password via an emailed link.
          </p>

          <label className="text-ink-muted block text-[11px]">
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
            />
          </label>

          <label className="text-ink-muted block text-[11px]">
            Display name
            <input
              required
              minLength={2}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
            />
          </label>

          <fieldset>
            <legend className="text-ink-muted mb-1.5 text-[11px]">Roles</legend>
            <div className="flex flex-wrap gap-2">
              {allRoles.map((role) => (
                <label
                  key={role}
                  className={`rounded-control border px-2.5 py-1.5 text-xs font-medium ${
                    roles.includes(role)
                      ? "border-action bg-action/10 text-action-soft"
                      : "border-divider text-ink-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={roles.includes(role)}
                    onChange={() => toggleRole(role)}
                    className="sr-only"
                  />
                  {roleLabels[role]}
                </label>
              ))}
            </div>
          </fieldset>

          {error ? <IdentityStatus tone="error">{error}</IdentityStatus> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-ink-muted rounded-control px-3 py-2 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-control bg-action hover:bg-action/90 flex min-h-9 items-center gap-2 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Spinner size={14} /> : null}
              {busy ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
