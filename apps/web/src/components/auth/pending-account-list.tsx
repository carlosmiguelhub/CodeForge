"use client";

import { accountProfileSchema, type AccountProfile } from "@sqweb/contracts";
import { Check, RefreshCw, UserRoundCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

import { useAuth } from "./auth-provider";
import { IdentityStatus } from "./identity-status";

const pendingListSchema = z.array(accountProfileSchema);

export function PendingAccountList() {
  const auth = useAuth();
  const { authorizedFetch } = auth;
  const [accounts, setAccounts] = useState<readonly AccountProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authorizedFetch(
        "/v1/admin/users/pending",
        {},
        true,
      );
      if (!response.ok)
        throw new Error("Pending accounts could not be loaded.");
      setAccounts(pendingListSchema.parse(await response.json()));
    } catch {
      setError("Pending accounts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    let active = true;
    void authorizedFetch("/v1/admin/users/pending", {}, true)
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Pending accounts could not be loaded.");
        const pending = pendingListSchema.parse(await response.json());
        if (active) setAccounts(pending);
      })
      .catch(() => {
        if (active) setError("Pending accounts could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authorizedFetch]);

  async function approve(account: AccountProfile) {
    setActingOn(account.firebaseUid);
    setError(null);
    try {
      const response = await auth.authorizedFetch(
        `/v1/admin/users/${encodeURIComponent(account.firebaseUid)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "active",
            reason:
              "Teacher identity approved through the administrator review queue.",
          }),
        },
        true,
      );
      if (!response.ok) throw new Error("Approval failed.");
      setAccounts((current) =>
        current.filter(
          (candidate) => candidate.firebaseUid !== account.firebaseUid,
        ),
      );
    } catch {
      setError(
        "The account could not be approved. No permission change was assumed.",
      );
    } finally {
      setActingOn(null);
    }
  }

  return (
    <section
      aria-labelledby="pending-title"
      className="rounded-panel border-structural bg-surface border"
    >
      <div className="border-divider flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2
            id="pending-title"
            className="font-heading text-ink-primary text-base font-semibold"
          >
            Pending teacher accounts
          </h2>
          <p className="text-ink-muted mt-0.5 text-xs">
            Approval updates server state and Firebase broad-role claims.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh pending accounts"
          className="rounded-control border-structural text-ink-muted hover:text-ink-primary grid size-9 place-items-center border disabled:opacity-50"
        >
          <RefreshCw
            aria-hidden="true"
            size={16}
            className={loading ? "animate-spin motion-reduce:animate-none" : ""}
          />
        </button>
      </div>
      {error ? (
        <div className="p-4">
          <IdentityStatus tone="error">{error}</IdentityStatus>
        </div>
      ) : null}
      {!loading && accounts.length === 0 ? (
        <div className="grid min-h-40 place-items-center p-6 text-center">
          <div>
            <UserRoundCheck
              aria-hidden="true"
              className="text-ink-disabled mx-auto"
              size={24}
            />
            <p className="text-ink-secondary mt-3 font-medium">
              No accounts awaiting approval
            </p>
            <p className="text-ink-muted mt-1 text-xs">
              New verified teacher registrations will appear here.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-divider divide-y">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-ink-primary truncate font-medium">
                  {account.displayName}
                </p>
                <p className="text-ink-muted truncate text-xs">
                  {account.email}
                </p>
              </div>
              <span className="text-warning flex items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="bg-warning size-1.5 rounded-full"
                />
                Pending approval
              </span>
              <button
                type="button"
                disabled={actingOn === account.firebaseUid}
                onClick={() => void approve(account)}
                className="rounded-control bg-action inline-flex h-9 items-center justify-center gap-2 px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Check aria-hidden="true" size={14} />
                {actingOn === account.firebaseUid
                  ? "Approving…"
                  : "Approve teacher"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
