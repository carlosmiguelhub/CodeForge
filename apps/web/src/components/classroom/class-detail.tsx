"use client";

import {
  classDetailSchema,
  classSchema,
  type ClassDetail,
  type Role,
} from "@sqweb/contracts";
import {
  Archive,
  ArchiveRestore,
  Award,
  Check,
  ClipboardList,
  Copy,
  Flag,
  LayoutList,
  LogOut,
  Pencil,
  RefreshCw,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePublishClassBottomNav } from "@/components/app-shell/class-bottom-nav-context";
import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

import { ActivityFeed } from "./activity-feed";
import { RenameClassDialog } from "./class-list";
import { MyScores } from "./my-scores";
import { QuizFeed } from "./quiz-feed";
import { RaceFeed } from "./race-feed";
import { TeacherStudentScores } from "./teacher-student-scores";

const DELETE_CONFIRM_WINDOW_MS = 4000;

type Tab = "classwork" | "quizzes" | "races" | "people" | "scores";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ClassDetail({
  role,
  classId,
}: Readonly<{
  role: Extract<Role, "student" | "teacher">;
  classId: string;
}>) {
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [status, setStatus] = useState("Loading class…");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("classwork");
  const [renaming, setRenaming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(
    null,
  );
  const deleteConfirmTimeoutRef = useRef<number | null>(null);
  const removeConfirmTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (deleteConfirmTimeoutRef.current !== null)
        window.clearTimeout(deleteConfirmTimeoutRef.current);
      if (removeConfirmTimeoutRef.current !== null)
        window.clearTimeout(removeConfirmTimeoutRef.current);
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch(`/v1/classes/${classId}`);
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "This class doesn't exist, or you're not a member of it."
            : "The class could not be loaded.",
        );
      }
      setDetail(classDetailSchema.parse(await response.json()));
    } catch (loadError) {
      setStatus(
        loadError instanceof Error
          ? loadError.message
          : "The class could not be loaded.",
      );
    }
  }, [authorizedFetch, classId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  async function copyJoinCode() {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail.joinCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied — the code is still visible on
      // screen for the teacher to read out or type manually.
    }
  }

  async function renameClass(next: {
    subjectName: string;
    sectionLabel: string;
  }) {
    setActionError(null);
    try {
      const response = await authorizedFetch(`/v1/classes/${classId}`, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The class could not be renamed.",
        );
      }
      setDetail((current) =>
        current
          ? {
              ...current,
              subjectName: next.subjectName,
              sectionLabel: next.sectionLabel,
            }
          : current,
      );
      setRenaming(false);
    } catch (renameError) {
      setActionError(
        renameError instanceof Error
          ? renameError.message
          : "The class could not be renamed.",
      );
    }
  }

  async function archiveOrUnarchive() {
    if (!detail) return;
    setActionError(null);
    try {
      const response = await authorizedFetch(
        `/v1/classes/${classId}/${detail.archivedAt ? "unarchive" : "archive"}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The class could not be updated.",
        );
      }
      const updated = classSchema.parse(await response.json());
      setDetail((current) =>
        current ? { ...current, archivedAt: updated.archivedAt } : current,
      );
    } catch (archiveError) {
      setActionError(
        archiveError instanceof Error
          ? archiveError.message
          : "The class could not be updated.",
      );
    }
  }

  async function regenerateJoinCode() {
    setActionError(null);
    setRegenerating(true);
    try {
      const response = await authorizedFetch(
        `/v1/classes/${classId}/regenerate-join-code`,
        { method: "POST" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The join code could not be changed.",
        );
      }
      const updated = classSchema.parse(await response.json());
      setDetail((current) =>
        current ? { ...current, joinCode: updated.joinCode } : current,
      );
    } catch (regenerateError) {
      setActionError(
        regenerateError instanceof Error
          ? regenerateError.message
          : "The join code could not be changed.",
      );
    } finally {
      setRegenerating(false);
    }
  }

  function requestDeleteClass() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (deleteConfirmTimeoutRef.current !== null)
        window.clearTimeout(deleteConfirmTimeoutRef.current);
      deleteConfirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingDelete(false);
      }, DELETE_CONFIRM_WINDOW_MS);
      return;
    }
    void deleteClass();
  }

  async function deleteClass() {
    setConfirmingDelete(false);
    setActionError(null);
    setDeleting(true);
    try {
      const response = await authorizedFetch(`/v1/classes/${classId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The class could not be deleted.",
        );
      }
      router.push(`/${role}/classes`);
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "The class could not be deleted.",
      );
      setDeleting(false);
    }
  }

  function requestLeaveClass() {
    if (!confirmingLeave) {
      setConfirmingLeave(true);
      if (deleteConfirmTimeoutRef.current !== null)
        window.clearTimeout(deleteConfirmTimeoutRef.current);
      deleteConfirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingLeave(false);
      }, DELETE_CONFIRM_WINDOW_MS);
      return;
    }
    void leaveClass();
  }

  async function leaveClass() {
    setConfirmingLeave(false);
    setActionError(null);
    setLeaving(true);
    try {
      const response = await authorizedFetch(`/v1/classes/${classId}/leave`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The class could not be left.",
        );
      }
      router.push(`/${role}/classes`);
    } catch (leaveError) {
      setActionError(
        leaveError instanceof Error
          ? leaveError.message
          : "The class could not be left.",
      );
      setLeaving(false);
    }
  }

  function requestRemoveMember(memberId: string) {
    if (confirmingRemoveId !== memberId) {
      setConfirmingRemoveId(memberId);
      if (removeConfirmTimeoutRef.current !== null)
        window.clearTimeout(removeConfirmTimeoutRef.current);
      removeConfirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingRemoveId(null);
      }, DELETE_CONFIRM_WINDOW_MS);
      return;
    }
    void removeMember(memberId);
  }

  async function removeMember(memberId: string) {
    const member = detail?.members.find((entry) => entry.id === memberId);
    if (!member) return;
    setConfirmingRemoveId(null);
    setActionError(null);
    setRemovingMemberId(memberId);
    try {
      const response = await authorizedFetch(
        `/v1/classes/${classId}/members/${member.studentId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The student could not be removed.",
        );
      }
      setDetail(classDetailSchema.parse(await response.json()));
    } catch (removeError) {
      setActionError(
        removeError instanceof Error
          ? removeError.message
          : "The student could not be removed.",
      );
    } finally {
      setRemovingMemberId(null);
    }
  }

  const tabs: readonly { id: Tab; label: string; icon: typeof LayoutList }[] =
    useMemo(
      () =>
        role === "teacher"
          ? [
              { id: "classwork", label: "Classwork", icon: LayoutList },
              { id: "quizzes", label: "Quizzes", icon: ClipboardList },
              { id: "races", label: "Code Racing", icon: Flag },
              { id: "scores", label: "Student Scores", icon: Award },
              {
                id: "people",
                label: `People · ${detail?.memberCount ?? 0}`,
                icon: Users,
              },
            ]
          : [
              { id: "classwork", label: "Classwork", icon: LayoutList },
              { id: "quizzes", label: "Quizzes", icon: ClipboardList },
              { id: "races", label: "Code Racing", icon: Flag },
              { id: "scores", label: "My Scores", icon: Award },
            ],
      [role, detail?.memberCount],
    );

  // Publishes this class's own tab set into the PWA bottom nav (see
  // ClassBottomNavProvider) so mobile/standalone users get Classwork/
  // Quizzes/Code Racing/Scores/People at the bottom instead of the app's
  // global nav while they're inside this class. Cleared automatically on
  // unmount (leaving the class) by the hook itself.
  const classBottomNavConfig = useMemo(
    () =>
      detail
        ? {
            backHref: `/${role}/classes`,
            backLabel: "My Classes",
            tabs,
            activeTab: tab,
            onTabChange: (id: string) => setTab(id as Tab),
          }
        : null,
    [detail, role, tabs, tab],
  );
  usePublishClassBottomNav(classBottomNavConfig);

  if (!detail) {
    return (
      <div className="border-structural bg-surface rounded-panel flex items-center gap-3 border p-4">
        <Spinner size={16} />
        <p className="text-ink-muted text-xs">{status}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/${role}/classes`}
        className="text-action-soft inline-block text-xs hover:underline"
      >
        ← Back to My Classes
      </Link>

      <section className="border-structural bg-surface rounded-panel border p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-ink-muted text-xs">{detail.sectionLabel}</p>
            <h2 className="font-heading text-ink-primary flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
              {detail.subjectName}
              {detail.archivedAt ? (
                <span className="text-ink-muted rounded-control border-divider bg-elevated border px-1.5 py-0.5 text-[10px] font-normal tracking-wide uppercase">
                  Archived
                </span>
              ) : null}
              {role === "teacher" ? (
                <button
                  type="button"
                  onClick={() => setRenaming(true)}
                  aria-label="Rename class"
                  className="text-ink-muted hover:text-ink-primary rounded-control grid size-6 shrink-0 place-items-center"
                >
                  <Pencil aria-hidden="true" size={13} />
                </button>
              ) : null}
            </h2>
            <p className="text-ink-muted mt-1 text-xs">
              {role === "student" ? `Taught by ${detail.teacherName} · ` : ""}
              {detail.memberCount}{" "}
              {detail.memberCount === 1 ? "student" : "students"} · Created{" "}
              {formatDate(detail.createdAt)}
            </p>
          </div>
          {role === "teacher" ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="border-divider bg-elevated rounded-control flex items-center gap-2 border px-3 py-2">
                <div>
                  <p className="text-ink-muted text-[10px] tracking-wide uppercase">
                    Join code
                  </p>
                  <p className="text-ink-primary font-mono text-base font-semibold tracking-widest">
                    {detail.joinCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyJoinCode()}
                  aria-label="Copy join code"
                  className="text-ink-muted hover:text-ink-primary rounded-control grid size-8 shrink-0 place-items-center"
                >
                  {copied ? (
                    <Check aria-hidden="true" size={14} />
                  ) : (
                    <Copy aria-hidden="true" size={14} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void regenerateJoinCode()}
                  disabled={regenerating}
                  aria-label="Generate a new join code"
                  title="Generate a new join code"
                  className="text-ink-muted hover:text-ink-primary rounded-control grid size-8 shrink-0 place-items-center disabled:opacity-50"
                >
                  {regenerating ? (
                    <Spinner size={14} />
                  ) : (
                    <RefreshCw aria-hidden="true" size={14} />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void archiveOrUnarchive()}
                className="rounded-control border-structural hover:border-action/50 flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold"
              >
                {detail.archivedAt ? (
                  <ArchiveRestore aria-hidden="true" size={14} />
                ) : (
                  <Archive aria-hidden="true" size={14} />
                )}
                {detail.archivedAt ? "Unarchive" : "Archive"}
              </button>
              <button
                type="button"
                onClick={requestDeleteClass}
                disabled={deleting}
                className="rounded-control bg-danger hover:bg-danger/90 flex min-h-9 items-center gap-1.5 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 aria-hidden="true" size={14} />
                {deleting
                  ? "Deleting…"
                  : confirmingDelete
                    ? "Confirm delete?"
                    : "Delete"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={requestLeaveClass}
              disabled={leaving}
              className="rounded-control border-danger/30 text-danger hover:bg-danger/5 flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut aria-hidden="true" size={14} />
              {leaving
                ? "Leaving…"
                : confirmingLeave
                  ? "Confirm unenroll?"
                  : "Unenroll"}
            </button>
          )}
        </div>
        {actionError ? (
          <div className="mt-3">
            <IdentityStatus tone="error">{actionError}</IdentityStatus>
          </div>
        ) : null}
      </section>

      <section className="border-structural bg-surface rounded-panel overflow-hidden border">
        <div className="border-divider flex overflow-x-auto border-b px-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap ${
                tab === id
                  ? "text-action-soft border-action border-b-2"
                  : "text-ink-muted hover:text-ink-secondary"
              }`}
            >
              <Icon aria-hidden="true" size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "classwork" ? (
            <ActivityFeed role={role} classId={classId} />
          ) : tab === "quizzes" ? (
            <QuizFeed role={role} classId={classId} />
          ) : tab === "races" ? (
            <RaceFeed role={role} classId={classId} />
          ) : tab === "scores" ? (
            role === "teacher" ? (
              <TeacherStudentScores classId={classId} />
            ) : (
              <MyScores classId={classId} />
            )
          ) : detail.members.length === 0 ? (
            <p className="text-ink-muted text-xs">
              No students have joined yet.
            </p>
          ) : (
            <ul className="divide-divider divide-y">
              {detail.members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="text-ink-primary min-w-0 truncate">
                    {member.studentName}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-ink-muted text-[11px]">
                      Joined {formatDate(member.joinedAt)}
                    </span>
                    {role === "teacher" ? (
                      <button
                        type="button"
                        onClick={() => requestRemoveMember(member.id)}
                        disabled={removingMemberId === member.id}
                        className="text-danger hover:bg-danger/5 rounded-control flex items-center gap-1 px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                      >
                        <UserMinus aria-hidden="true" size={12} />
                        {removingMemberId === member.id
                          ? "Removing…"
                          : confirmingRemoveId === member.id
                            ? "Confirm?"
                            : "Remove"}
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {renaming ? (
        <RenameClassDialog
          entry={detail}
          onClose={() => setRenaming(false)}
          onSave={renameClass}
        />
      ) : null}
    </div>
  );
}
