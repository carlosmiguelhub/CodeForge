"use client";

import {
  raceSummaryForStudentSchema,
  raceSummaryForTeacherSchema,
  type RaceSummaryForStudent,
  type RaceSummaryForTeacher,
  type Role,
} from "@sqweb/contracts";
import {
  Check,
  CircleDashed,
  Clock3,
  Flag,
  ListChecks,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

import { RaceFormDialog } from "./race-form-dialog";

const DELETE_CONFIRM_WINDOW_MS = 4000;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RaceFeed({
  role,
  classId,
}: Readonly<{
  role: Extract<Role, "student" | "teacher">;
  classId: string;
}>) {
  const { authorizedFetch } = useAuth();
  const [races, setRaces] = useState<
    readonly RaceSummaryForTeacher[] | readonly RaceSummaryForStudent[]
  >([]);
  const [status, setStatus] = useState("Loading Code Racing quizzes…");
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
      const response = await authorizedFetch(`/v1/classes/${classId}/races`);
      if (!response.ok)
        throw new Error("Code Racing quizzes could not be loaded.");
      const payload = await response.json();
      const parsed =
        role === "teacher"
          ? raceSummaryForTeacherSchema.array().parse(payload)
          : raceSummaryForStudentSchema.array().parse(payload);
      setRaces(parsed);
      setStatus(
        parsed.length === 0
          ? role === "teacher"
            ? "No Code Racing quizzes posted yet."
            : "No Code Racing quizzes have been posted to this class yet."
          : "",
      );
    } catch (loadError) {
      setStatus(
        loadError instanceof Error
          ? loadError.message
          : "Code Racing quizzes could not be loaded.",
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
          authorizedFetch(`/v1/races/${id}`, { method: "DELETE" }),
        ),
      );
      if (results.some((response) => !response.ok))
        throw new Error("Some Code Racing quizzes could not be deleted.");
      setSelectMode(false);
      setSelectedIds(new Set());
      await load();
    } catch (deleteError) {
      setStatus(
        deleteError instanceof Error
          ? deleteError.message
          : "Some Code Racing quizzes could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-ink-primary flex items-center gap-2 text-sm font-semibold">
          <Flag aria-hidden="true" size={15} />
          Code Racing
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
                  New Code Quiz
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {races.length === 0 ? (
        <p className="text-ink-muted text-xs">{status}</p>
      ) : (
        <ul className="space-y-2">
          {races.map((race) => (
            <li key={race.id}>
              <RaceFeedRow
                race={race}
                role={role}
                selectMode={selectMode}
                selected={selectedIds.has(race.id)}
                onToggleSelected={() => toggleSelected(race.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <RaceFormDialog
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

function RaceFeedRow({
  race,
  role,
  selectMode,
  selected,
  onToggleSelected,
}: Readonly<{
  race: RaceSummaryForTeacher | RaceSummaryForStudent;
  role: Extract<Role, "student" | "teacher">;
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}>) {
  const content = (
    <>
      <div className="min-w-0">
        <p className="text-ink-primary truncate text-sm font-medium">
          {race.title}
        </p>
        <p className="text-ink-muted mt-0.5 text-[11px]">
          {race.problemCount} {race.problemCount === 1 ? "problem" : "problems"}{" "}
          · {race.totalPoints} pts · {race.durationMinutes} min
        </p>
        <p className="text-ink-muted mt-0.5 text-[10px]">
          {race.availability === "scheduled"
            ? `Opens ${formatDate(race.opensAt)}`
            : race.availability === "closed"
              ? `Closed ${formatDate(race.closesAt)}`
              : `Closes ${formatDate(race.closesAt)}`}
        </p>
      </div>
      {"submittedCount" in race ? (
        <span className="text-ink-muted shrink-0 text-[11px]">
          {race.submittedCount}/{race.memberCount} finished
        </span>
      ) : race.attemptStatus === "submitted" ? (
        <span className="text-success flex shrink-0 items-center gap-1 text-[11px] font-medium">
          <Check aria-hidden="true" size={13} />
          {race.totalScore}/{race.totalPoints}
        </span>
      ) : race.attemptStatus === "in_progress" ? (
        <span className="text-warning flex shrink-0 items-center gap-1 text-[11px] font-medium">
          <CircleDashed aria-hidden="true" size={13} /> In progress
        </span>
      ) : race.attemptStatus === "timed_out" ? (
        <span className="text-danger flex shrink-0 items-center gap-1 text-[11px] font-medium">
          <Clock3 aria-hidden="true" size={13} /> Timed out
        </span>
      ) : (
        <span className="text-ink-muted shrink-0 text-[11px]">
          {race.availability === "open" ? "Not started" : "Unavailable"}
        </span>
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
      href={`/${role}/races/${race.id}`}
      className="border-structural bg-surface rounded-panel hover:border-action/50 flex items-center justify-between gap-3 border p-3 transition-colors"
    >
      {content}
    </Link>
  );
}
