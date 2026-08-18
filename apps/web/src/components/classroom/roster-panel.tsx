"use client";

import {
  classSummarySchema,
  rosterMemberSchema,
  type ClassSummary,
  type InvitationCreated,
  type RosterMember,
} from "@sqweb/contracts";
import {
  Copy,
  Link2,
  RefreshCw,
  UserMinus,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";

export function RosterPanel({ classId }: Readonly<{ classId: string }>) {
  const { authorizedFetch } = useAuth();
  const [classRecord, setClassRecord] = useState<ClassSummary | null>(null);
  const [roster, setRoster] = useState<readonly RosterMember[]>([]);
  const [invitation, setInvitation] = useState<InvitationCreated | null>(null);
  const [pendingMember, setPendingMember] = useState<RosterMember | null>(null);
  const [status, setStatus] = useState("Loading roster…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [classResponse, rosterResponse] = await Promise.all([
        authorizedFetch(`/v1/classes/${classId}`),
        authorizedFetch(`/v1/classes/${classId}/roster`),
      ]);
      if (!classResponse.ok || !rosterResponse.ok)
        throw new Error("The roster could not be loaded.");
      setClassRecord(classSummarySchema.parse(await classResponse.json()));
      const members = rosterMemberSchema
        .array()
        .parse(await rosterResponse.json());
      setRoster(members);
      setStatus(members.length ? "" : "No students are enrolled yet.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The roster could not be loaded.",
      );
    }
  }, [authorizedFetch, classId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const days = Number(form.get("days"));
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    setBusy(true);
    try {
      const response = await authorizedFetch(
        `/v1/classes/${classId}/invites`,
        {
          method: "POST",
          body: JSON.stringify({
            expiresAt,
            usageLimit: Number(form.get("usageLimit")),
          }),
        },
        true,
      );
      if (!response.ok) throw new Error("An invitation could not be created.");
      setInvitation((await response.json()) as InvitationCreated);
      setStatus(
        "Invitation created. Copy it now; it will not be shown again after leaving this page.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "An invitation could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeEnrollment(
    event: FormEvent<HTMLFormElement>,
    member: RosterMember,
  ) {
    event.preventDefault();
    const nextState = member.state === "active" ? "removed" : "active";
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    );
    setBusy(true);
    try {
      const response = await authorizedFetch(
        `/v1/classes/${classId}/roster/${member.userId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ state: nextState, reason }),
        },
        true,
      );
      if (!response.ok) throw new Error("Enrollment could not be changed.");
      setPendingMember(null);
      await load();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Enrollment could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation() {
    if (!invitation) return;
    setBusy(true);
    try {
      const response = await authorizedFetch(
        `/v1/class-invites/${invitation.id}`,
        { method: "DELETE" },
        true,
      );
      if (!response.ok) throw new Error("The invitation could not be revoked.");
      setInvitation(null);
      setStatus("Invitation revoked.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The invitation could not be revoked.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="border-structural bg-surface rounded-panel border p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-ink-muted text-xs">
              {classRecord?.termName ?? "Class"}
            </p>
            <h2 className="font-heading text-ink-primary mt-1 text-xl font-semibold">
              {classRecord
                ? `${classRecord.courseCode} · ${classRecord.section}`
                : "Loading…"}
            </h2>
            <p className="text-ink-muted mt-1 text-sm">
              {classRecord?.courseTitle}
            </p>
          </div>
          <span className="border-divider bg-elevated text-ink-muted rounded-control flex items-center gap-2 border px-3 py-2 text-xs">
            <Users aria-hidden="true" size={15} />{" "}
            {classRecord?.enrolledCount ?? 0}/60 active
          </span>
        </div>
      </section>

      <section className="border-structural bg-surface rounded-panel border">
        <div className="border-divider border-b px-4 py-3">
          <h2 className="font-heading text-ink-primary text-lg font-semibold">
            Invitation
          </h2>
          <p className="text-ink-muted mt-1 text-xs">
            Codes are high-entropy, limited, expiring, and displayed only when
            created.
          </p>
        </div>
        <form
          onSubmit={(event) => void createInvitation(event)}
          className="flex flex-wrap items-end gap-3 p-4"
        >
          <label className="text-ink-muted grid gap-1.5 text-xs">
            Expires after
            <select
              name="days"
              defaultValue="7"
              className="border-divider bg-elevated text-ink-primary rounded-control min-h-10 border px-3"
            >
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
          <label className="text-ink-muted grid gap-1.5 text-xs">
            Maximum uses
            <input
              name="usageLimit"
              type="number"
              defaultValue="60"
              min="1"
              max="60"
              required
              className="border-divider bg-elevated text-ink-primary rounded-control min-h-10 w-28 border px-3"
            />
          </label>
          <button
            disabled={busy || classRecord?.status === "archived"}
            className="bg-action rounded-control min-h-10 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              <Link2 aria-hidden="true" size={15} /> Generate code
            </span>
          </button>
        </form>
        {invitation ? (
          <div className="border-divider bg-elevated mx-4 mb-4 border p-3">
            <p className="text-ink-muted text-[11px] tracking-[0.08em] uppercase">
              Copy this code now
            </p>
            <code className="text-action-soft mt-2 block overflow-x-auto py-1 font-mono text-xs">
              {invitation.code}
            </code>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(invitation.code)
                }
                className="border-structural rounded-control flex min-h-9 items-center gap-2 border px-3 text-xs"
              >
                <Copy aria-hidden="true" size={14} /> Copy
              </button>
              <button
                type="button"
                onClick={() => void revokeInvitation()}
                className="border-error/40 text-error rounded-control min-h-9 border px-3 text-xs"
              >
                Revoke
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <p
        role="status"
        aria-live="polite"
        className="text-ink-muted min-h-5 text-xs"
      >
        {status}
      </p>

      <section className="border-structural bg-surface rounded-panel overflow-hidden border">
        <div className="border-divider flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-heading text-ink-primary text-lg font-semibold">
            Roster
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            className="text-ink-muted hover:text-ink-primary rounded-control flex min-h-9 items-center gap-2 px-2 text-xs"
          >
            <RefreshCw aria-hidden="true" size={14} /> Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead className="bg-elevated text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Student</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">State</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((member) => (
                <tr key={member.userId} className="border-divider border-t">
                  <td className="text-ink-primary px-4 py-3 font-medium">
                    {member.displayName}
                  </td>
                  <td className="text-ink-muted px-4 py-3">{member.email}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 capitalize">
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${member.state === "active" ? "bg-success" : "bg-ink-disabled"}`}
                      />
                      {member.state}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingMember(member)}
                      className="border-structural text-ink-muted hover:text-ink-primary rounded-control inline-flex min-h-9 items-center gap-2 border px-3"
                    >
                      {member.state === "active" ? (
                        <UserMinus aria-hidden="true" size={14} />
                      ) : (
                        <UserRoundCheck aria-hidden="true" size={14} />
                      )}
                      {member.state === "active" ? "Remove" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {pendingMember ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="enrollment-dialog-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={(event) => void changeEnrollment(event, pendingMember)}
            className="border-structural bg-elevated rounded-panel w-full max-w-md border p-5 shadow-2xl"
          >
            <h2
              id="enrollment-dialog-title"
              className="font-heading text-ink-primary text-lg font-semibold"
            >
              {pendingMember.state === "active" ? "Remove" : "Reactivate"}{" "}
              {pendingMember.displayName}
            </h2>
            <p className="text-ink-muted mt-2 text-sm">
              This roster change is immediate and will be recorded in the audit
              log.
            </p>
            <label className="text-ink-muted mt-4 grid gap-1.5 text-xs">
              Required reason
              <textarea
                name="reason"
                required
                minLength={8}
                maxLength={500}
                autoFocus
                className="border-divider bg-surface text-ink-primary rounded-control min-h-24 resize-y border p-3"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingMember(null)}
                className="border-structural text-ink-muted rounded-control min-h-10 border px-4 text-sm"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className="bg-action rounded-control min-h-10 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirm change
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
