"use client";

import {
  activitySummaryForStudentSchema,
  activitySummaryForTeacherSchema,
  codeLanguageMeta,
  type ActivitySummaryForStudent,
  type ActivitySummaryForTeacher,
  type Role,
} from "@sqweb/contracts";
import {
  Check,
  CircleAlert,
  CircleDashed,
  FileCode2,
  ListChecks,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

import { ActivityFormDialog } from "./activity-form-dialog";

const DELETE_CONFIRM_WINDOW_MS = 4000;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ActivityFeed({
  role,
  classId,
}: Readonly<{
  role: Extract<Role, "student" | "teacher">;
  classId: string;
}>) {
  const { authorizedFetch } = useAuth();
  const [activities, setActivities] = useState<
    readonly ActivitySummaryForTeacher[] | readonly ActivitySummaryForStudent[]
  >([]);
  const [status, setStatus] = useState("Loading activities…");
  const [creating, setCreating] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteConfirmTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (deleteConfirmTimeoutRef.current !== null)
        window.clearTimeout(deleteConfirmTimeoutRef.current);
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch(
        `/v1/classes/${classId}/activities`,
      );
      if (!response.ok) throw new Error("Activities could not be loaded.");
      const payload = await response.json();
      const parsed =
        role === "teacher"
          ? activitySummaryForTeacherSchema.array().parse(payload)
          : activitySummaryForStudentSchema.array().parse(payload);
      setActivities(parsed);
      setStatus(
        parsed.length
          ? ""
          : role === "teacher"
            ? "Nothing posted yet."
            : "Nothing has been posted to this class yet.",
      );
    } catch (loadError) {
      setStatus(
        loadError instanceof Error
          ? loadError.message
          : "Activities could not be loaded.",
      );
    }
  }, [authorizedFetch, classId, role]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  function toggleSelectMode() {
    setSelectMode((current) => !current);
    setSelectedIds(new Set());
    setConfirmingDelete(false);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function requestDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (deleteConfirmTimeoutRef.current !== null)
        window.clearTimeout(deleteConfirmTimeoutRef.current);
      deleteConfirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingDelete(false);
      }, DELETE_CONFIRM_WINDOW_MS);
      return;
    }
    void deleteSelected();
  }

  async function deleteSelected() {
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      const results = await Promise.all(
        [...selectedIds].map((id) =>
          authorizedFetch(`/v1/activities/${id}`, { method: "DELETE" }),
        ),
      );
      if (results.some((response) => !response.ok))
        throw new Error("Some activities could not be deleted.");
      setSelectMode(false);
      setSelectedIds(new Set());
      await load();
    } catch (deleteError) {
      setStatus(
        deleteError instanceof Error
          ? deleteError.message
          : "Some activities could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-ink-primary flex items-center gap-2 text-sm font-semibold">
          <FileCode2 aria-hidden="true" size={15} />
          Activities
        </h3>
        {role === "teacher" ? (
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button
                  type="button"
                  onClick={requestDeleteSelected}
                  disabled={selectedIds.size === 0 || deleting}
                  className="rounded-control bg-danger hover:bg-danger/90 flex min-h-8 items-center gap-1.5 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 aria-hidden="true" size={13} />
                  {deleting
                    ? "Deleting…"
                    : confirmingDelete
                      ? `Confirm delete (${selectedIds.size})?`
                      : `Delete (${selectedIds.size})`}
                </button>
                <button
                  type="button"
                  onClick={toggleSelectMode}
                  className="rounded-control border-structural hover:border-action/50 flex min-h-8 items-center gap-1.5 border px-3 text-xs font-semibold"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleSelectMode}
                  className="rounded-control border-structural hover:border-action/50 flex min-h-8 items-center gap-1.5 border px-3 text-xs font-semibold"
                >
                  <ListChecks aria-hidden="true" size={13} />
                  Select
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="rounded-control bg-action hover:bg-action/90 flex min-h-8 items-center gap-1.5 px-3 text-xs font-semibold text-white"
                >
                  <Plus aria-hidden="true" size={13} />
                  New Activity
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {activities.length === 0 ? (
        <p className="text-ink-muted text-xs">{status}</p>
      ) : (
        <ul className="space-y-2">
          {activities.map((entry) => (
            <li key={entry.id}>
              <ActivityFeedRow
                entry={entry}
                role={role}
                selectMode={selectMode}
                selected={selectedIds.has(entry.id)}
                onToggleSelected={() => toggleSelected(entry.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <ActivityFormDialog
          classId={classId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function ActivityFeedRow({
  entry,
  role,
  selectMode,
  selected,
  onToggleSelected,
}: Readonly<{
  entry: ActivitySummaryForTeacher | ActivitySummaryForStudent;
  role: Extract<Role, "student" | "teacher">;
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}>) {
  const content = (
    <>
      <div className="min-w-0">
        <p className="text-ink-primary flex items-center gap-1.5 truncate text-sm font-medium">
          {entry.isLocked ? (
            <Lock
              aria-hidden="true"
              size={12}
              className="text-danger shrink-0"
            />
          ) : null}
          <span className="truncate">{entry.title}</span>
        </p>
        <p className="text-ink-muted mt-0.5 text-[11px]">
          {codeLanguageMeta[entry.language].label} · {entry.testCaseCount}{" "}
          {entry.testCaseCount === 1 ? "test case" : "test cases"} ·{" "}
          {entry.points} pts · {formatDate(entry.createdAt)}
          {entry.deadlineAt
            ? ` · Deadline ${formatDate(entry.deadlineAt)}`
            : ""}
        </p>
      </div>
      {"passedCount" in entry ? (
        <span className="flex shrink-0 items-center gap-2 text-[11px]">
          <span className="text-ink-muted">
            {entry.passedCount}/{entry.memberCount} passed
          </span>
          {entry.zeroedCount > 0 ? (
            <span className="text-danger">{entry.zeroedCount} zeroed</span>
          ) : null}
        </span>
      ) : entry.attemptStatus === "passed" ? (
        <span className="text-success flex shrink-0 items-center gap-1 text-[11px] font-medium">
          <Check aria-hidden="true" size={13} />
          Passed
        </span>
      ) : entry.attemptStatus === "zeroed_violation" ? (
        <span className="text-danger flex shrink-0 items-center gap-1 text-[11px] font-medium">
          <X aria-hidden="true" size={13} />
          Zeroed
        </span>
      ) : entry.attemptStatus === "submitted_incomplete" ? (
        <span className="text-warning flex shrink-0 items-center gap-1 text-[11px] font-medium">
          <CircleAlert aria-hidden="true" size={13} />
          Submitted
        </span>
      ) : entry.attemptStatus === "in_progress" ? (
        <span className="text-warning flex shrink-0 items-center gap-1 text-[11px] font-medium">
          <CircleDashed aria-hidden="true" size={13} />
          In progress
        </span>
      ) : (
        <span className="text-ink-muted shrink-0 text-[11px]">Not started</span>
      )}
    </>
  );

  if (selectMode && role === "teacher") {
    return (
      <label className="border-structural bg-surface rounded-panel hover:border-action/50 flex cursor-pointer items-center gap-3 border p-3 transition-colors">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          className="accent-action size-4 shrink-0"
        />
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          {content}
        </span>
      </label>
    );
  }

  return (
    <Link
      href={`/${role}/activities/${entry.id}`}
      className="border-structural bg-surface rounded-panel hover:border-action/50 flex items-center justify-between gap-3 border p-3 transition-colors"
    >
      {content}
    </Link>
  );
}
