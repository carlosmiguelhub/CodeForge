"use client";

import {
  accountProfileSchema,
  userUsageSummarySchema,
  type AccountProfile,
  type AccountStatus,
  type Role,
  type Section,
  type UserUsageSummary,
} from "@sqweb/contracts";
import {
  AppWindow,
  Ban,
  Code2,
  Database,
  KeyRound,
  Network,
  Plus,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { roleLabels } from "@/components/app-shell/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { accountStatusLabels } from "@/lib/account-labels";
import { passwordPolicyError } from "@/lib/password-policy";

type StatusAction = Extract<
  AccountStatus,
  "active" | "suspended" | "deactivated"
>;

const allRoles: readonly Role[] = ["student", "teacher", "administrator"];

const statusActions: readonly {
  status: StatusAction;
  label: string;
  icon: typeof ShieldCheck;
}[] = [
  { status: "active", label: "Activate", icon: UserRoundCheck },
  { status: "suspended", label: "Suspend", icon: Ban },
  { status: "deactivated", label: "Deactivate", icon: UserX },
];

export function UserDetailPanel({
  firebaseUid,
  sections,
  onClose,
  onChanged,
  onDeleted,
}: Readonly<{
  firebaseUid: string;
  sections?: readonly Section[];
  onClose: () => void;
  onChanged: (account: AccountProfile) => void;
  onDeleted: (firebaseUid: string) => void;
}>) {
  const auth = useAuth();
  const { authorizedFetch } = auth;
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [usage, setUsage] = useState<UserUsageSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; message: string } | undefined
  >(undefined);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordError = newPassword ? passwordPolicyError(newPassword) : null;
  const [sectionDraft, setSectionDraft] = useState("");

  const isSelf = auth.account?.firebaseUid === firebaseUid;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [accountRes, usageRes] = await Promise.all([
          authorizedFetch(`/v1/admin/users/${encodeURIComponent(firebaseUid)}`),
          authorizedFetch(
            `/v1/admin/users/${encodeURIComponent(firebaseUid)}/usage`,
          ),
        ]);
        if (!accountRes.ok || !usageRes.ok)
          throw new Error("This account could not be loaded.");
        const loadedAccount = accountProfileSchema.parse(
          await accountRes.json(),
        );
        const loadedUsage = userUsageSummarySchema.parse(await usageRes.json());
        if (cancelled) return;
        setAccount(loadedAccount);
        setSectionDraft(loadedAccount.sectionId ?? "");
        setUsage(loadedUsage);
      } catch (error) {
        if (!cancelled)
          setLoadError(
            error instanceof Error
              ? error.message
              : "This account could not be loaded.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
    // AuthProvider recreates its whole context value object every render,
    // so depending on `auth` here (instead of the specific stable
    // authorizedFetch callback) would re-run this effect on every re-render.
  }, [authorizedFetch, firebaseUid]);

  async function confirmStatusChange() {
    if (!pendingStatus || !account) return;
    setBusyAction(`status:${pendingStatus}`);
    setFeedback(undefined);
    try {
      const response = await auth.authorizedFetch(
        `/v1/admin/users/${encodeURIComponent(firebaseUid)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: pendingStatus, reason }),
        },
      );
      if (!response.ok) throw new Error("The status change was not accepted.");
      const updated = accountProfileSchema.parse(await response.json());
      setAccount(updated);
      onChanged(updated);
      setFeedback({ tone: "success", message: "Account status updated." });
      setPendingStatus(null);
      setReason("");
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The status change was not accepted.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function assignRole(role: Role) {
    setBusyAction(`assign:${role}`);
    setFeedback(undefined);
    try {
      const response = await auth.authorizedFetch(
        `/v1/admin/users/${encodeURIComponent(firebaseUid)}/roles`,
        { method: "POST", body: JSON.stringify({ role }) },
      );
      if (!response.ok) throw new Error("The role could not be added.");
      const updated = accountProfileSchema.parse(await response.json());
      setAccount(updated);
      onChanged(updated);
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The role could not be added.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function removeRole(role: Role) {
    setBusyAction(`remove:${role}`);
    setFeedback(undefined);
    try {
      const response = await auth.authorizedFetch(
        `/v1/admin/users/${encodeURIComponent(firebaseUid)}/roles/${role}`,
        { method: "DELETE" },
      );
      if (!response.ok)
        throw new Error(
          response.status === 400
            ? "An account must keep at least one role."
            : "The role could not be removed.",
        );
      const updated = accountProfileSchema.parse(await response.json());
      setAccount(updated);
      onChanged(updated);
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The role could not be removed.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function saveSectionAssignment() {
    setBusyAction("assign-section");
    setFeedback(undefined);
    try {
      const response = await auth.authorizedFetch(
        `/v1/admin/users/${encodeURIComponent(firebaseUid)}/section`,
        {
          method: "PATCH",
          body: JSON.stringify({ sectionId: sectionDraft || null }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          payload?.error?.message ?? "The section could not be updated.",
        );
      }
      const updated = accountProfileSchema.parse(await response.json());
      setAccount(updated);
      onChanged(updated);
      setFeedback({ tone: "success", message: "Section updated." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The section could not be updated.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function resetPassword() {
    if (!account) return;
    setBusyAction("reset-password");
    setFeedback(undefined);
    try {
      const response = await auth.authorizedFetch(
        `/v1/admin/users/${encodeURIComponent(firebaseUid)}/reset-password`,
        { method: "POST" },
      );
      if (!response.ok)
        throw new Error("The password reset could not be recorded.");
      await auth.sendPasswordReset(account.email);
      setFeedback({
        tone: "success",
        message: `A password reset link was sent to ${account.email}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The password reset could not be recorded.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function setPasswordDirectly() {
    setBusyAction("set-password");
    setFeedback(undefined);
    try {
      const response = await auth.authorizedFetch(
        `/v1/admin/users/${encodeURIComponent(firebaseUid)}/set-password`,
        { method: "POST", body: JSON.stringify({ password: newPassword }) },
      );
      if (!response.ok) throw new Error("The password could not be changed.");
      setFeedback({ tone: "success", message: "Password changed directly." });
      setSettingPassword(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The password could not be changed.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteAccount() {
    setBusyAction("delete");
    setFeedback(undefined);
    try {
      const response = await auth.authorizedFetch(
        `/v1/admin/users/${encodeURIComponent(firebaseUid)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("The account could not be deleted.");
      onDeleted(firebaseUid);
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The account could not be deleted.",
      });
    } finally {
      setBusyAction(null);
      setConfirmingDelete(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-detail-title"
      className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-end p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="border-structural bg-elevated rounded-panel flex max-h-[90vh] w-full max-w-lg flex-col border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <h2
              id="user-detail-title"
              className="font-heading text-ink-primary truncate text-base font-semibold"
            >
              {account?.displayName ?? "Account details"}
            </h2>
            <p className="text-ink-muted mt-0.5 truncate text-xs">
              {account?.email}
            </p>
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

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {loadError ? (
            <IdentityStatus tone="error">{loadError}</IdentityStatus>
          ) : null}
          {feedback ? (
            <IdentityStatus tone={feedback.tone}>
              {feedback.message}
            </IdentityStatus>
          ) : null}

          {!account ? (
            <p className="text-ink-muted text-xs">Loading account…</p>
          ) : (
            <>
              {isSelf ? (
                <IdentityStatus tone="neutral">
                  This is your own account — role and status controls are
                  disabled here to prevent locking yourself out.
                </IdentityStatus>
              ) : null}

              <section>
                <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Roles
                </h3>
                <div className="flex flex-wrap gap-2">
                  {account.roles.map((role) => (
                    <span
                      key={role}
                      className="border-divider bg-panel text-ink-secondary rounded-control flex items-center gap-1.5 border py-1 pr-1.5 pl-2.5 text-[11px] font-medium"
                    >
                      {roleLabels[role]}
                      <button
                        type="button"
                        aria-label={`Remove ${roleLabels[role]} role`}
                        disabled={isSelf || busyAction === `remove:${role}`}
                        onClick={() => void removeRole(role)}
                        className="text-ink-muted hover:text-danger disabled:opacity-40"
                      >
                        <Trash2 aria-hidden="true" size={12} />
                      </button>
                    </span>
                  ))}
                  {allRoles
                    .filter((role) => !account.roles.includes(role))
                    .map((role) => (
                      <button
                        key={role}
                        type="button"
                        disabled={isSelf || busyAction === `assign:${role}`}
                        onClick={() => void assignRole(role)}
                        className="border-divider text-ink-muted hover:border-action/40 hover:text-action-soft rounded-control flex items-center gap-1 border border-dashed py-1 pr-2.5 pl-2 text-[11px] disabled:opacity-40"
                      >
                        <Plus aria-hidden="true" size={12} />
                        {roleLabels[role]}
                      </button>
                    ))}
                </div>
              </section>

              <section>
                <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Section
                </h3>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Section"
                    value={sectionDraft}
                    onChange={(event) => setSectionDraft(event.target.value)}
                    className="border-structural bg-canvas text-ink-primary rounded-control min-h-9 flex-1 border px-2.5 text-sm"
                  >
                    <option value="">No section</option>
                    {sections
                      ?.filter(
                        (section) =>
                          !section.archivedAt ||
                          section.id === account.sectionId,
                      )
                      .map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                          {section.archivedAt ? " (archived)" : ""}
                        </option>
                      ))}
                  </select>
                  {sectionDraft !== (account.sectionId ?? "") ? (
                    <button
                      type="button"
                      disabled={busyAction === "assign-section"}
                      onClick={() => void saveSectionAssignment()}
                      className="rounded-control bg-action hover:bg-action/90 flex min-h-9 shrink-0 items-center gap-2 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyAction === "assign-section" ? (
                        <Spinner size={13} />
                      ) : null}
                      Save
                    </button>
                  ) : null}
                </div>
              </section>

              <section>
                <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Status — {accountStatusLabels[account.status]}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {statusActions.map(({ status, label, icon: Icon }) => (
                    <button
                      key={status}
                      type="button"
                      disabled={isSelf || account.status === status}
                      onClick={() => {
                        setPendingStatus(status);
                        setFeedback(undefined);
                      }}
                      className="border-divider text-ink-secondary hover:bg-surface rounded-control flex items-center gap-1.5 border px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon aria-hidden="true" size={13} />
                      {label}
                    </button>
                  ))}
                </div>
                {pendingStatus ? (
                  <div className="border-divider bg-panel rounded-control mt-3 border p-3">
                    <label className="text-ink-muted mb-1.5 block text-[11px]">
                      Reason (at least 8 characters)
                      <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={2}
                        className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingStatus(null);
                          setReason("");
                        }}
                        className="text-ink-muted rounded-control px-2.5 py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={
                          reason.trim().length < 8 ||
                          busyAction === `status:${pendingStatus}`
                        }
                        onClick={() => void confirmStatusChange()}
                        className="rounded-control bg-action hover:bg-action/90 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyAction === `status:${pendingStatus}` ? (
                          <Spinner size={13} />
                        ) : null}
                        Confirm {pendingStatus}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section>
                <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Password
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyAction === "reset-password"}
                    onClick={() => void resetPassword()}
                    className="border-divider text-ink-secondary hover:bg-surface rounded-control flex items-center gap-1.5 border px-2.5 py-1.5 text-xs disabled:opacity-50"
                  >
                    {busyAction === "reset-password" ? (
                      <Spinner size={13} />
                    ) : (
                      <KeyRound aria-hidden="true" size={13} />
                    )}
                    Send reset link
                  </button>
                  {!settingPassword ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSettingPassword(true);
                        setFeedback(undefined);
                      }}
                      className="border-divider text-ink-secondary hover:bg-surface rounded-control flex items-center gap-1.5 border px-2.5 py-1.5 text-xs"
                    >
                      <KeyRound aria-hidden="true" size={13} />
                      Set password directly
                    </button>
                  ) : null}
                </div>
                <p className="text-ink-muted mt-1.5 text-[11px]">
                  Setting a password directly changes it immediately without
                  emailing anything — use this if the reset link doesn&apos;t
                  reach the user.
                </p>
                {settingPassword ? (
                  <div className="border-divider bg-panel rounded-control mt-3 border p-3">
                    <label className="text-ink-muted mb-1.5 block text-[11px]">
                      New password
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        autoComplete="new-password"
                        className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-ink-muted mb-1.5 block text-[11px]">
                      Confirm password
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        autoComplete="new-password"
                        className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
                      />
                    </label>
                    {passwordError ? (
                      <p className="text-danger text-[11px]">{passwordError}</p>
                    ) : null}
                    {confirmPassword && confirmPassword !== newPassword ? (
                      <p className="text-danger text-[11px]">
                        Passwords do not match.
                      </p>
                    ) : null}
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSettingPassword(false);
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                        className="text-ink-muted rounded-control px-2.5 py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={
                          !newPassword ||
                          Boolean(passwordError) ||
                          newPassword !== confirmPassword ||
                          busyAction === "set-password"
                        }
                        onClick={() => void setPasswordDirectly()}
                        className="rounded-control bg-action hover:bg-action/90 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyAction === "set-password" ? (
                          <Spinner size={13} />
                        ) : null}
                        Change password
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              {usage ? (
                <section>
                  <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
                    Usage
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <UsageTile
                      icon={Database}
                      label="SQL workspace"
                      value={usage.workspaceState ?? "None yet"}
                    />
                    <UsageTile
                      icon={Network}
                      label="ERD diagrams"
                      value={String(usage.erdDiagramCount)}
                    />
                    <UsageTile
                      icon={Code2}
                      label="Code files"
                      value={String(usage.codeFileCount)}
                    />
                    <UsageTile
                      icon={Database}
                      label="Saved queries"
                      value={String(usage.savedQueryCount)}
                    />
                    <UsageTile
                      icon={Database}
                      label="SQL executions"
                      value={String(usage.sqlExecutionCount)}
                    />
                    <UsageTile
                      icon={Code2}
                      label="Code executions"
                      value={String(usage.codeExecutionCount)}
                    />
                    <UsageTile
                      icon={AppWindow}
                      label="Java GUI sessions"
                      value={String(usage.guiSessionCount)}
                    />
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="text-danger mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Danger zone
                </h3>
                {!confirmingDelete ? (
                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={() => {
                      setConfirmingDelete(true);
                      setFeedback(undefined);
                    }}
                    className="border-danger/30 text-danger hover:bg-danger/10 rounded-control flex items-center gap-1.5 border px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 aria-hidden="true" size={13} />
                    Delete account
                  </button>
                ) : (
                  <div className="border-danger/30 bg-danger/5 rounded-control border p-3">
                    <p className="text-ink-primary text-xs leading-5">
                      This permanently deletes {account.displayName}&apos;s
                      account, sign-in, and everything they own — workspaces,
                      code files, ERD diagrams, saved queries, and execution
                      history. This cannot be undone.
                    </p>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="text-ink-muted rounded-control px-2.5 py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busyAction === "delete"}
                        onClick={() => void deleteAccount()}
                        className="rounded-control bg-danger hover:bg-danger/90 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyAction === "delete" ? <Spinner size={13} /> : null}
                        Delete permanently
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UsageTile({
  icon: Icon,
  label,
  value,
}: Readonly<{ icon: typeof Database; label: string; value: string }>) {
  return (
    <div className="border-divider bg-panel rounded-control flex items-center gap-2 border p-2.5">
      <span className="text-action-soft grid size-7 shrink-0 place-items-center">
        <Icon aria-hidden="true" size={14} strokeWidth={1.7} />
      </span>
      <div className="min-w-0">
        <p className="text-ink-primary truncate text-sm font-semibold capitalize">
          {value}
        </p>
        <p className="text-ink-muted text-[10px]">{label}</p>
      </div>
    </div>
  );
}
