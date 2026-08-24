"use client";

import {
  sectionSchema,
  workspaceKindLabels,
  workspaceKindSchema,
  type Section,
  type WorkspaceKind,
} from "@sqweb/contracts";
import { Lock, Settings, Unlock, X } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";

const allWorkspaceKinds: readonly WorkspaceKind[] = workspaceKindSchema.options;

export function SectionWorkspaceLockDialog({
  section,
  onClose,
  onSaved,
}: Readonly<{
  section: Section;
  onClose: () => void;
  onSaved: (section: Section) => void;
}>) {
  const { authorizedFetch } = useAuth();
  const [locked, setLocked] = useState<readonly WorkspaceKind[]>(
    section.lockedWorkspaces,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(kind: WorkspaceKind) {
    setLocked((current) =>
      current.includes(kind)
        ? current.filter((value) => value !== kind)
        : [...current, kind],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await authorizedFetch(
        `/v1/admin/sections/${section.id}/locked-workspaces`,
        { method: "PATCH", body: JSON.stringify({ lockedWorkspaces: locked }) },
        true,
      );
      if (!response.ok) throw new Error("Workspace access could not be saved.");
      onSaved(sectionSchema.parse(await response.json()));
    } catch {
      setError("Workspace access could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="section-lock-title"
      className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-structural bg-elevated rounded-panel w-full max-w-2xl border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider flex items-center justify-between gap-4 border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-control border-divider bg-surface text-action-soft grid size-9 shrink-0 place-items-center border">
              <Settings aria-hidden="true" size={17} strokeWidth={1.7} />
            </span>
            <div>
              <h2
                id="section-lock-title"
                className="font-heading text-ink-primary text-base font-semibold"
              >
                Workspace access — {section.name}
              </h2>
              <p className="text-ink-muted mt-0.5 text-xs">
                Choose which tools students in this section can open.
              </p>
            </div>
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

        <div className="space-y-2 p-5">
          {allWorkspaceKinds.map((kind) => {
            const isLocked = locked.includes(kind);
            return (
              <div
                key={kind}
                className="border-divider rounded-control flex items-center justify-between gap-4 border px-3.5 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-control grid size-8 shrink-0 place-items-center border ${
                      isLocked
                        ? "border-danger/30 bg-danger/10 text-danger"
                        : "border-divider bg-surface text-ink-muted"
                    }`}
                  >
                    {isLocked ? (
                      <Lock aria-hidden="true" size={14} strokeWidth={1.7} />
                    ) : (
                      <Unlock aria-hidden="true" size={14} strokeWidth={1.7} />
                    )}
                  </span>
                  <p className="text-ink-primary text-sm font-medium">
                    {workspaceKindLabels[kind]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(kind)}
                  aria-pressed={isLocked}
                  className={`rounded-control min-w-24 border px-3 py-1.5 text-xs font-semibold ${
                    isLocked
                      ? "border-danger/30 bg-danger/10 text-danger"
                      : "border-divider text-ink-muted hover:text-ink-primary"
                  }`}
                >
                  {isLocked ? "Locked" : "Unlocked"}
                </button>
              </div>
            );
          })}

          {error ? <IdentityStatus tone="error">{error}</IdentityStatus> : null}
        </div>

        <div className="border-divider flex justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted rounded-control px-3 py-2 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-control bg-action hover:bg-action/90 flex min-h-9 items-center gap-2 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Spinner size={14} /> : null}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
