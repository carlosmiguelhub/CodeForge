"use client";

import { classSchema, type Class, type Role } from "@sqweb/contracts";
import {
  Archive,
  ArchiveRestore,
  GraduationCap,
  LogOut,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

type SortBy = "recent" | "name" | "students";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ClassList({
  role,
}: Readonly<{ role: Extract<Role, "student" | "teacher"> }>) {
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<readonly Class[]>([]);
  const [status, setStatus] = useState("Loading classes…");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [showArchived, setShowArchived] = useState(false);
  const [renaming, setRenaming] = useState<Class | null>(null);
  const [addingClass, setAddingClass] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch(
        role === "teacher" ? "/v1/classes/teaching" : "/v1/classes/enrolled",
      );
      if (!response.ok) throw new Error("Classes could not be loaded.");
      const parsed = classSchema.array().parse(await response.json());
      setClasses(parsed);
      setStatus(
        parsed.length
          ? ""
          : role === "teacher"
            ? "You haven't created a class yet."
            : "You haven't joined a class yet.",
      );
    } catch (loadError) {
      setStatus(
        loadError instanceof Error
          ? loadError.message
          : "Classes could not be loaded.",
      );
    }
  }, [authorizedFetch, role]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  async function createClass(next: {
    subjectName: string;
    sectionLabel: string;
  }) {
    setError(null);
    try {
      const response = await authorizedFetch("/v1/classes", {
        method: "POST",
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The class could not be created.",
        );
      }
      const created = classSchema.parse(await response.json());
      setClasses((current) => [created, ...current]);
      setAddingClass(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The class could not be created.",
      );
    }
  }

  async function joinClass(joinCode: string) {
    setError(null);
    try {
      const response = await authorizedFetch("/v1/classes/join", {
        method: "POST",
        body: JSON.stringify({ joinCode }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The class could not be joined.",
        );
      }
      const joined = classSchema.parse(await response.json());
      setClasses((current) => [
        joined,
        ...current.filter((entry) => entry.id !== joined.id),
      ]);
      setAddingClass(false);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "The class could not be joined.",
      );
    }
  }

  async function archiveOrUnarchive(entry: Class) {
    setError(null);
    try {
      const response = await authorizedFetch(
        `/v1/classes/${entry.id}/${entry.archivedAt ? "unarchive" : "archive"}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The class could not be updated.",
        );
      }
      const updated = classSchema.parse(await response.json());
      setClasses((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "The class could not be updated.",
      );
    }
  }

  async function deleteClass(entry: Class) {
    setError(null);
    try {
      const response = await authorizedFetch(`/v1/classes/${entry.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The class could not be deleted.",
        );
      }
      setClasses((current) => current.filter((item) => item.id !== entry.id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The class could not be deleted.",
      );
    }
  }

  async function unenroll(entry: Class) {
    setError(null);
    try {
      const response = await authorizedFetch(`/v1/classes/${entry.id}/leave`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The class could not be left.",
        );
      }
      setClasses((current) => current.filter((item) => item.id !== entry.id));
    } catch (leaveError) {
      setError(
        leaveError instanceof Error
          ? leaveError.message
          : "The class could not be left.",
      );
    }
  }

  async function renameClass(next: {
    subjectName: string;
    sectionLabel: string;
  }) {
    if (!renaming) return;
    setError(null);
    try {
      const response = await authorizedFetch(`/v1/classes/${renaming.id}`, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The class could not be renamed.",
        );
      }
      const updated = classSchema.parse(await response.json());
      setClasses((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setRenaming(null);
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : "The class could not be renamed.",
      );
    }
  }

  const archivedCount = classes.filter((entry) => entry.archivedAt).length;

  const visibleClasses = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = classes.filter((entry) => {
      if (!showArchived && entry.archivedAt) return false;
      if (!query) return true;
      return (
        entry.subjectName.toLowerCase().includes(query) ||
        entry.sectionLabel.toLowerCase().includes(query) ||
        entry.teacherName.toLowerCase().includes(query)
      );
    });
    const sorted = [...filtered];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
    } else if (sortBy === "students") {
      sorted.sort((a, b) => b.memberCount - a.memberCount);
    } else {
      sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    return sorted;
  }, [classes, search, showArchived, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setAddingClass(true)}
          className="rounded-control bg-action hover:bg-action/90 flex min-h-9 shrink-0 items-center gap-2 px-3 text-xs font-semibold text-white"
        >
          <Plus aria-hidden="true" size={14} />
          {role === "teacher" ? "Create class" : "Join class"}
        </button>

        {classes.length > 0 ? (
          <>
            <label className="border-structural bg-surface rounded-control flex min-w-48 flex-1 items-center gap-2 border px-2.5 py-1.5">
              <Search
                aria-hidden="true"
                size={13}
                className="text-ink-muted shrink-0"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search classes…"
                className="text-ink-primary min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortBy)}
              className="border-structural bg-surface text-ink-secondary rounded-control border px-2.5 py-1.5 text-xs"
            >
              <option value="recent">Newest first</option>
              <option value="name">Name (A–Z)</option>
              <option value="students">Most students</option>
            </select>
            {role === "teacher" && archivedCount > 0 ? (
              <label className="text-ink-muted flex shrink-0 items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                  className="accent-action size-3.5"
                />
                Show archived ({archivedCount})
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      {error ? <IdentityStatus tone="error">{error}</IdentityStatus> : null}

      {classes.length === 0 ? (
        <p
          role="status"
          aria-live="polite"
          className="text-ink-muted min-h-5 text-xs"
        >
          {status}
        </p>
      ) : visibleClasses.length === 0 ? (
        <p className="text-ink-muted text-xs">No classes match your search.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleClasses.map((entry) => (
            <li key={entry.id}>
              <ClassCard
                entry={entry}
                role={role}
                onOpen={() => router.push(`/${role}/classes/${entry.id}`)}
                onArchiveToggle={
                  role === "teacher"
                    ? () => void archiveOrUnarchive(entry)
                    : undefined
                }
                onDelete={
                  role === "teacher" ? () => void deleteClass(entry) : undefined
                }
                onRename={
                  role === "teacher" ? () => setRenaming(entry) : undefined
                }
                onUnenroll={
                  role === "student" ? () => void unenroll(entry) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}

      {renaming ? (
        <RenameClassDialog
          entry={renaming}
          onClose={() => setRenaming(null)}
          onSave={renameClass}
        />
      ) : null}

      {addingClass ? (
        role === "teacher" ? (
          <CreateClassDialog
            onClose={() => setAddingClass(false)}
            onCreate={createClass}
          />
        ) : (
          <JoinClassDialog
            onClose={() => setAddingClass(false)}
            onJoin={joinClass}
          />
        )
      ) : null}
    </div>
  );
}

const CONFIRM_WINDOW_MS = 4000;

function ClassCard({
  entry,
  role,
  onOpen,
  onArchiveToggle,
  onDelete,
  onRename,
  onUnenroll,
}: Readonly<{
  entry: Class;
  role: Extract<Role, "student" | "teacher">;
  onOpen: () => void;
  onArchiveToggle?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  onRename?: (() => void) | undefined;
  onUnenroll?: (() => void) | undefined;
}>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingUnenroll, setConfirmingUnenroll] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const confirmTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setConfirmingDelete(false);
        setConfirmingUnenroll(false);
      }
    }
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () =>
      document.removeEventListener("mousedown", onDocumentPointerDown);
  }, []);

  useEffect(
    () => () => {
      if (confirmTimeoutRef.current !== null)
        window.clearTimeout(confirmTimeoutRef.current);
    },
    [],
  );

  function armConfirm(setter: (value: boolean) => void) {
    setter(true);
    if (confirmTimeoutRef.current !== null)
      window.clearTimeout(confirmTimeoutRef.current);
    confirmTimeoutRef.current = window.setTimeout(() => {
      setter(false);
    }, CONFIRM_WINDOW_MS);
  }

  function requestDelete() {
    if (!confirmingDelete) {
      armConfirm(setConfirmingDelete);
      return;
    }
    setMenuOpen(false);
    setConfirmingDelete(false);
    onDelete?.();
  }

  function requestUnenroll() {
    if (!confirmingUnenroll) {
      armConfirm(setConfirmingUnenroll);
      return;
    }
    setMenuOpen(false);
    setConfirmingUnenroll(false);
    onUnenroll?.();
  }

  const hasActions =
    (role === "teacher" && (onArchiveToggle || onDelete || onRename)) ||
    (role === "student" && onUnenroll);

  return (
    <div className="border-structural bg-surface rounded-panel hover:border-action/50 relative border p-4 transition-colors">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start gap-3">
          <span className="border-divider bg-elevated text-action-soft rounded-control grid size-9 shrink-0 place-items-center border">
            <GraduationCap aria-hidden="true" size={16} />
          </span>
          <div className="min-w-0 flex-1 pr-6">
            <p className="text-ink-primary truncate text-sm font-semibold">
              {entry.subjectName}
              {entry.archivedAt ? (
                <span className="text-ink-muted ml-1.5 text-[10px] font-normal tracking-wide uppercase">
                  Archived
                </span>
              ) : null}
            </p>
            <p className="text-ink-muted mt-0.5 truncate text-xs">
              {entry.sectionLabel}
              {role === "student" ? ` · ${entry.teacherName}` : ""}
            </p>
          </div>
        </div>
        <div className="text-ink-muted mt-3 flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1">
            <Users aria-hidden="true" size={12} />
            {entry.memberCount}{" "}
            {entry.memberCount === 1 ? "student" : "students"}
          </span>
          <span>{formatDate(entry.createdAt)}</span>
        </div>
      </button>

      {hasActions ? (
        <div ref={menuRef} className="absolute top-3 right-3">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="Class actions"
            className="text-ink-muted hover:text-ink-primary hover:bg-elevated rounded-control grid size-7 place-items-center"
          >
            <MoreVertical aria-hidden="true" size={15} />
          </button>
          {menuOpen ? (
            <div className="border-structural bg-elevated rounded-panel absolute top-8 right-0 z-10 w-44 overflow-hidden border shadow-lg">
              {onRename ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRename();
                  }}
                  className="text-ink-secondary hover:bg-surface flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
                >
                  <Pencil aria-hidden="true" size={13} />
                  Rename
                </button>
              ) : null}
              {onArchiveToggle ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onArchiveToggle();
                  }}
                  className="text-ink-secondary hover:bg-surface flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
                >
                  {entry.archivedAt ? (
                    <ArchiveRestore aria-hidden="true" size={13} />
                  ) : (
                    <Archive aria-hidden="true" size={13} />
                  )}
                  {entry.archivedAt ? "Unarchive" : "Archive"}
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  onClick={requestDelete}
                  className="text-danger hover:bg-danger/5 flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
                >
                  <Trash2 aria-hidden="true" size={13} />
                  {confirmingDelete ? "Confirm delete?" : "Delete"}
                </button>
              ) : null}
              {onUnenroll ? (
                <button
                  type="button"
                  onClick={requestUnenroll}
                  className="text-danger hover:bg-danger/5 flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
                >
                  <LogOut aria-hidden="true" size={13} />
                  {confirmingUnenroll ? "Confirm unenroll?" : "Unenroll"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DialogShell({
  titleId,
  title,
  children,
}: Readonly<{
  titleId: string;
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-end p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
    >
      <div
        className="border-structural bg-elevated rounded-panel w-full max-w-sm border p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id={titleId}
          className="font-heading text-ink-primary text-base font-semibold"
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function RenameClassDialog({
  entry,
  onClose,
  onSave,
}: Readonly<{
  entry: Class;
  onClose: () => void;
  onSave: (next: { subjectName: string; sectionLabel: string }) => void;
}>) {
  const [subjectName, setSubjectName] = useState(entry.subjectName);
  const [sectionLabel, setSectionLabel] = useState(entry.sectionLabel);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ subjectName, sectionLabel });
  }

  return (
    <DialogShell titleId="rename-class-title" title="Rename class">
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="text-ink-muted block text-[11px]">
          Subject
          <input
            required
            maxLength={120}
            value={subjectName}
            onChange={(event) => setSubjectName(event.target.value)}
            className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="text-ink-muted block text-[11px]">
          Section
          <input
            required
            maxLength={60}
            value={sectionLabel}
            onChange={(event) => setSectionLabel(event.target.value)}
            className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border-structural hover:border-action/50 flex min-h-8 items-center px-3 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-control bg-action hover:bg-action/90 flex min-h-8 items-center px-3 text-xs font-semibold text-white"
          >
            Save
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function CreateClassDialog({
  onClose,
  onCreate,
}: Readonly<{
  onClose: () => void;
  onCreate: (next: { subjectName: string; sectionLabel: string }) => void;
}>) {
  const [subjectName, setSubjectName] = useState("");
  const [sectionLabel, setSectionLabel] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({ subjectName, sectionLabel });
  }

  return (
    <DialogShell titleId="create-class-title" title="Create a class">
      <p className="text-ink-muted mt-1 text-xs">
        Students join with the 6-character code generated for your class.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="text-ink-muted block text-[11px]">
          Subject
          <input
            required
            autoFocus
            maxLength={120}
            value={subjectName}
            onChange={(event) => setSubjectName(event.target.value)}
            placeholder="Databases 101"
            className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="text-ink-muted block text-[11px]">
          Section
          <input
            required
            maxLength={60}
            value={sectionLabel}
            onChange={(event) => setSectionLabel(event.target.value)}
            placeholder="BSIT 2B"
            className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border-structural hover:border-action/50 flex min-h-8 items-center px-3 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-control bg-action hover:bg-action/90 flex min-h-8 items-center px-3 text-xs font-semibold text-white"
          >
            Create class
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function JoinClassDialog({
  onClose,
  onJoin,
}: Readonly<{
  onClose: () => void;
  onJoin: (joinCode: string) => void;
}>) {
  const [joinCode, setJoinCode] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onJoin(joinCode);
  }

  return (
    <DialogShell titleId="join-class-title" title="Join a class">
      <p className="text-ink-muted mt-1 text-xs">
        Ask your teacher for the class&apos;s 6-character join code.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="text-ink-muted block text-[11px]">
          Join code
          <input
            required
            autoFocus
            minLength={6}
            maxLength={6}
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="ABC123"
            className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 font-mono text-sm tracking-widest uppercase"
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border-structural hover:border-action/50 flex min-h-8 items-center px-3 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-control bg-action hover:bg-action/90 flex min-h-8 items-center px-3 text-xs font-semibold text-white"
          >
            Join class
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
