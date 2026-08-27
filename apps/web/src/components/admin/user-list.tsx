"use client";

import {
  accountListResponseSchema,
  sectionSchema,
  type AccountProfile,
  type AccountStatus,
  type Role,
  type Section,
} from "@sqweb/contracts";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { roleLabels } from "@/components/app-shell/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { accountStatusLabels } from "@/lib/account-labels";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";
import { AddUserDialog } from "./add-user-dialog";
import { UserDetailPanel } from "./user-detail-panel";

const PAGE_SIZE = 20;
const sectionListSchema = z.array(sectionSchema);

export function UserList() {
  const { authorizedFetch } = useAuth();
  const [items, setItems] = useState<readonly AccountProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "">("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [sections, setSections] = useState<readonly Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingUid, setApprovingUid] = useState<string | null>(null);
  const [selectedFirebaseUid, setSelectedFirebaseUid] = useState<string | null>(
    null,
  );
  const [addingUser, setAddingUser] = useState(false);
  const searchTimeout = useRef<number | null>(null);

  const sectionsById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections],
  );

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        if (search.trim()) query.set("search", search.trim());
        if (roleFilter) query.set("role", roleFilter);
        if (statusFilter) query.set("status", statusFilter);
        if (sectionFilter) query.set("sectionId", sectionFilter);
        const response = await authorizedFetch(
          `/v1/admin/users?${query.toString()}`,
        );
        if (!response.ok) throw new Error("Users could not be loaded.");
        const parsed = accountListResponseSchema.parse(await response.json());
        setItems(parsed.items);
        setTotal(parsed.total);
        setPage(parsed.page);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Users could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [authorizedFetch, search, roleFilter, statusFilter, sectionFilter],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const loadSections = useCallback(async () => {
    try {
      const response = await authorizedFetch("/v1/admin/sections");
      if (!response.ok) return;
      setSections(sectionListSchema.parse(await response.json()));
    } catch {
      // The section filter/column is supplementary — a failed fetch here
      // shouldn't block the user list itself from working.
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSections(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSections]);

  // Live-reflects accounts created/changed/deleted from another admin
  // session without a manual refresh.
  usePolling(() => void load(page), DEFAULT_POLL_INTERVAL_MS);
  usePolling(() => void loadSections(), DEFAULT_POLL_INTERVAL_MS);

  function onSearchChange(value: string) {
    setSearch(value);
    if (searchTimeout.current !== null)
      window.clearTimeout(searchTimeout.current);
    searchTimeout.current = window.setTimeout(() => {
      void load(1);
    }, 300);
  }

  async function quickApprove(account: AccountProfile) {
    setApprovingUid(account.firebaseUid);
    try {
      const response = await authorizedFetch(
        `/v1/admin/users/${encodeURIComponent(account.firebaseUid)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "active",
            reason:
              "Teacher identity approved through the administrator review queue.",
          }),
        },
      );
      if (!response.ok) throw new Error("Approval failed.");
      const updated = (await response.json()) as AccountProfile;
      setItems((current) =>
        current.map((item) =>
          item.firebaseUid === updated.firebaseUid ? updated : item,
        ),
      );
    } catch {
      setError("The account could not be approved.");
    } finally {
      setApprovingUid(null);
    }
  }

  function onAccountChanged(updated: AccountProfile) {
    setItems((current) =>
      current.map((item) =>
        item.firebaseUid === updated.firebaseUid ? updated : item,
      ),
    );
  }

  function onAccountDeleted(deletedFirebaseUid: string) {
    setItems((current) =>
      current.filter((item) => item.firebaseUid !== deletedFirebaseUid),
    );
    setTotal((current) => Math.max(0, current - 1));
    setSelectedFirebaseUid(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <section className="rounded-panel border-structural bg-surface border">
        <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-heading text-ink-primary text-lg font-semibold tracking-[-0.02em]">
              Users
            </h2>
            <p className="text-ink-muted mt-1 text-xs">
              Search, filter, and manage every account in the institution.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddingUser(true)}
            className="rounded-control bg-action hover:bg-action/90 flex min-h-9 items-center gap-2 px-3 text-xs font-semibold text-white"
          >
            <UserPlus aria-hidden="true" size={14} />
            Add user
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <div className="border-structural bg-canvas rounded-control flex min-h-9 min-w-48 flex-1 items-center gap-2 border px-2.5">
            <Search
              aria-hidden="true"
              size={14}
              className="text-ink-disabled"
            />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search name or email…"
              aria-label="Search users"
              className="text-ink-primary min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none"
            />
          </div>
          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value as Role | "");
            }}
            className="border-structural bg-canvas text-ink-secondary rounded-control min-h-9 border px-2.5 text-xs"
          >
            <option value="">All roles</option>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="administrator">Administrator</option>
          </select>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as AccountStatus | "");
            }}
            className="border-structural bg-canvas text-ink-secondary rounded-control min-h-9 border px-2.5 text-xs"
          >
            <option value="">All statuses</option>
            {Object.entries(accountStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by section"
            value={sectionFilter}
            onChange={(event) => setSectionFilter(event.target.value)}
            className="border-structural bg-canvas text-ink-secondary rounded-control min-h-9 border px-2.5 text-xs"
          >
            <option value="">All sections</option>
            {sections
              .filter((section) => !section.archivedAt)
              .map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
          </select>
        </div>

        {error ? (
          <div className="px-4 pb-3">
            <IdentityStatus tone="error">{error}</IdentityStatus>
          </div>
        ) : null}

        {loading ? (
          <div className="grid min-h-40 place-items-center">
            <Spinner size={20} />
          </div>
        ) : items.length === 0 ? (
          <p className="text-ink-muted px-4 pb-6 text-center text-xs">
            No users match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-ink-muted border-divider border-y text-[11px] uppercase">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Roles</th>
                  <th className="px-4 py-2 font-medium">Section</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-divider divide-y">
                {items.map((account) => (
                  <tr key={account.id}>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedFirebaseUid(account.firebaseUid)
                        }
                        className="text-left"
                      >
                        <p className="text-ink-primary text-sm font-medium hover:underline">
                          {account.displayName}
                        </p>
                        <p className="text-ink-muted text-xs">
                          {account.email}
                        </p>
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {account.roles.length === 0 ? (
                          <span className="text-ink-disabled text-xs">—</span>
                        ) : (
                          account.roles.map((role) => (
                            <span
                              key={role}
                              className="border-divider bg-panel text-ink-secondary rounded-control border px-1.5 py-0.5 text-[10px] font-medium"
                            >
                              {roleLabels[role]}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="text-ink-secondary px-4 py-2.5 text-xs">
                      {account.sectionId
                        ? (sectionsById.get(account.sectionId)?.name ??
                          "Unknown section")
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {accountStatusLabels[account.status]}
                    </td>
                    <td className="px-4 py-2.5">
                      {account.status === "pending_approval" ? (
                        <button
                          type="button"
                          disabled={approvingUid === account.firebaseUid}
                          onClick={() => void quickApprove(account)}
                          className="rounded-control bg-action inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
                        >
                          {approvingUid === account.firebaseUid ? (
                            <Spinner size={12} />
                          ) : (
                            <Check aria-hidden="true" size={12} />
                          )}
                          Approve
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedFirebaseUid(account.firebaseUid)
                          }
                          className="text-action-soft text-[11px] font-medium hover:underline"
                        >
                          Manage
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > 0 ? (
          <div className="border-divider flex items-center justify-between border-t px-4 py-3">
            <p className="text-ink-muted text-xs">
              Page {page} of {totalPages} · {total} total
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => void load(page - 1)}
                aria-label="Previous page"
                className="border-structural text-ink-muted rounded-control grid size-8 place-items-center border disabled:opacity-40"
              >
                <ChevronLeft aria-hidden="true" size={14} />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => void load(page + 1)}
                aria-label="Next page"
                className="border-structural text-ink-muted rounded-control grid size-8 place-items-center border disabled:opacity-40"
              >
                <ChevronRight aria-hidden="true" size={14} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedFirebaseUid ? (
        <UserDetailPanel
          firebaseUid={selectedFirebaseUid}
          sections={sections}
          onClose={() => setSelectedFirebaseUid(null)}
          onChanged={onAccountChanged}
          onDeleted={onAccountDeleted}
        />
      ) : null}

      {addingUser ? (
        <AddUserDialog
          onClose={() => setAddingUser(false)}
          onCreated={() => {
            setAddingUser(false);
            void load(1);
          }}
        />
      ) : null}
    </div>
  );
}
