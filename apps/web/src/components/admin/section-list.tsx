"use client";

import { sectionSchema, type Section } from "@sqweb/contracts";
import {
  Archive,
  Layers,
  Plus,
  RotateCcw,
  Settings,
  Users,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { z } from "zod";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

import { SectionWorkspaceLockDialog } from "./section-workspace-lock-dialog";

const sectionListSchema = z.array(sectionSchema);

export function SectionList() {
  const { authorizedFetch } = useAuth();
  const [sections, setSections] = useState<readonly Section[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [lockDialogSection, setLockDialogSection] = useState<Section | null>(
    null,
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await authorizedFetch("/v1/admin/sections");
      if (!response.ok) throw new Error("Sections could not be loaded.");
      setSections(sectionListSchema.parse(await response.json()));
    } catch {
      setError("Sections could not be loaded.");
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Live-reflects sections created/archived/locked from another admin
  // session without a manual refresh.
  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  async function createSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const response = await authorizedFetch("/v1/admin/sections", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) throw new Error("The section could not be created.");
      setName("");
      await load();
    } catch {
      setError("The section could not be created.");
    } finally {
      setCreating(false);
    }
  }

  async function archiveSection(section: Section) {
    setArchivingId(section.id);
    setError(null);
    try {
      const response = await authorizedFetch(
        `/v1/admin/sections/${section.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          payload?.error?.message ?? "The section could not be removed.",
        );
      }
      await load();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "The section could not be removed.",
      );
    } finally {
      setArchivingId(null);
    }
  }

  async function restoreSection(section: Section) {
    setRestoringId(section.id);
    setError(null);
    try {
      const response = await authorizedFetch(
        `/v1/admin/sections/${section.id}/restore`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("The section could not be restored.");
      await load();
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "The section could not be restored.",
      );
    } finally {
      setRestoringId(null);
    }
  }

  const active = sections?.filter((section) => !section.archivedAt) ?? [];
  const archived = sections?.filter((section) => section.archivedAt) ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-panel border-structural bg-surface border">
        <div className="border-divider border-b px-4 py-3">
          <h2 className="font-heading text-ink-primary text-lg font-semibold tracking-[-0.02em]">
            Sections
          </h2>
          <p className="text-ink-muted mt-1 text-xs">
            Managed here so students can pick one when they register — remove
            one anytime without losing history for students already in it.
          </p>
        </div>

        <form
          onSubmit={(event) => void createSection(event)}
          className="border-divider flex flex-wrap items-end gap-2 border-b px-4 py-3"
        >
          <label className="text-ink-muted min-w-48 flex-1 text-[11px]">
            New section name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. BSIT-3A"
              maxLength={120}
              className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="rounded-control bg-action hover:bg-action/90 flex min-h-9 items-center gap-2 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? (
              <Spinner size={13} />
            ) : (
              <Plus aria-hidden="true" size={13} />
            )}
            Add section
          </button>
        </form>

        {error ? (
          <div className="px-4 pt-3">
            <IdentityStatus tone="error">{error}</IdentityStatus>
          </div>
        ) : null}

        {sections === null ? (
          <div className="grid min-h-32 place-items-center">
            <Spinner size={20} />
          </div>
        ) : active.length === 0 && archived.length === 0 ? (
          <div className="grid min-h-32 place-items-center px-6 py-8 text-center">
            <div>
              <Layers
                aria-hidden="true"
                className="text-ink-disabled mx-auto mb-2"
                size={20}
              />
              <p className="text-ink-muted max-w-xs text-xs leading-5">
                No sections yet — add one above so students can select it at
                registration.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-divider divide-y">
            {active.map((section) => (
              <li
                key={section.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-ink-primary text-sm font-medium">
                    {section.name}
                  </p>
                  <p className="text-ink-muted mt-0.5 flex items-center gap-1 text-[11px]">
                    <Users aria-hidden="true" size={11} />
                    {section.memberCount ?? 0}{" "}
                    {section.memberCount === 1 ? "student" : "students"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setLockDialogSection(section)}
                    className="text-ink-muted hover:text-action-soft flex items-center gap-1.5 text-[11px]"
                  >
                    <Settings aria-hidden="true" size={12} />
                    Settings
                  </button>
                  <button
                    type="button"
                    disabled={archivingId === section.id}
                    onClick={() => void archiveSection(section)}
                    className="text-ink-muted hover:text-danger flex items-center gap-1.5 text-[11px] disabled:opacity-50"
                  >
                    {archivingId === section.id ? (
                      <Spinner size={12} />
                    ) : (
                      <Archive aria-hidden="true" size={12} />
                    )}
                    Remove
                  </button>
                </div>
              </li>
            ))}
            {archived.map((section) => (
              <li
                key={section.id}
                className="flex items-center justify-between gap-3 px-4 py-3 opacity-60"
              >
                <p className="text-ink-muted text-sm line-through">
                  {section.name}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-ink-disabled text-[11px]">Removed</span>
                  <button
                    type="button"
                    disabled={restoringId === section.id}
                    onClick={() => void restoreSection(section)}
                    className="text-ink-muted hover:text-action-soft flex items-center gap-1.5 text-[11px] disabled:opacity-50"
                  >
                    {restoringId === section.id ? (
                      <Spinner size={12} />
                    ) : (
                      <RotateCcw aria-hidden="true" size={12} />
                    )}
                    Restore
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lockDialogSection ? (
        <SectionWorkspaceLockDialog
          section={lockDialogSection}
          onClose={() => setLockDialogSection(null)}
          onSaved={(updated) => {
            setSections(
              (current) =>
                current?.map((existing) =>
                  existing.id === updated.id ? updated : existing,
                ) ?? current,
            );
            setLockDialogSection(null);
          }}
        />
      ) : null}
    </div>
  );
}
