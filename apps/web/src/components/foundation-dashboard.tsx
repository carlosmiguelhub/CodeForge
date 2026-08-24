import {
  Check,
  CircleAlert,
  DatabaseZap,
  FileCode2,
  ShieldCheck,
} from "lucide-react";

const readiness = [
  {
    label: "Design system",
    detail: "Approved tokens and responsive shell",
    icon: FileCode2,
  },
  {
    label: "Shared contracts",
    detail: "Roles, permissions, API, execution, audit",
    icon: ShieldCheck,
  },
  {
    label: "Security corpus",
    detail: "Initial MySQL allow/deny cases",
    icon: DatabaseZap,
  },
] as const;

export function FoundationDashboard() {
  return (
    <div className="space-y-6">
      <section className="border-divider border-b pb-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-action-soft mb-2 text-xs font-semibold tracking-[0.12em] uppercase">
              Milestone 1 · Foundation
            </p>
            <h2 className="heading-balance font-heading text-ink-primary text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              The command surface is ready for verified workflows.
            </h2>
            <p className="text-ink-muted mt-3 max-w-xl text-sm leading-6">
              This preview validates CodeForge&apos;s shared shell, information
              density, and accessibility baseline. No database service is
              connected.
            </p>
          </div>
          <div className="rounded-control border-warning/30 bg-warning/5 text-warning flex items-center gap-2 self-start border px-3 py-2 text-xs md:self-auto">
            <CircleAlert aria-hidden="true" size={15} />
            Nonfunctional preview
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section
          aria-labelledby="readiness-title"
          className="rounded-panel border-structural bg-surface overflow-hidden border"
        >
          <div className="border-divider flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3
                id="readiness-title"
                className="font-heading text-ink-primary text-base font-semibold"
              >
                Foundation readiness
              </h3>
              <p className="text-ink-muted mt-0.5 text-xs">
                Local repository capabilities
              </p>
            </div>
            <span className="text-success flex items-center gap-2 text-xs">
              <span
                className="bg-success size-1.5 rounded-full"
                aria-hidden="true"
              />
              Ready
            </span>
          </div>

          <ul className="divide-divider divide-y">
            {readiness.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.label}
                  className="hover:bg-panel flex min-h-16 items-center gap-3 px-4 py-3"
                >
                  <span className="rounded-control border-divider bg-panel text-info grid size-9 shrink-0 place-items-center border">
                    <Icon aria-hidden="true" size={17} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-primary font-medium">{item.label}</p>
                    <p className="text-ink-muted mt-0.5 text-xs">
                      {item.detail}
                    </p>
                  </div>
                  <span className="text-success flex items-center gap-1.5 text-xs">
                    <Check aria-hidden="true" size={14} />
                    Complete
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <aside
          aria-labelledby="services-title"
          className="rounded-panel border-structural bg-panel border"
        >
          <div className="border-divider border-b px-4 py-3">
            <h3
              id="services-title"
              className="font-heading text-ink-primary text-base font-semibold"
            >
              Connected services
            </h3>
            <p className="text-ink-muted mt-0.5 text-xs">Milestone boundary</p>
          </div>
          <div className="space-y-4 p-4">
            <div className="rounded-control border-divider bg-deep border p-3">
              <div className="text-ink-secondary flex items-center gap-2 text-xs font-medium">
                <span
                  className="bg-ink-disabled size-1.5 rounded-full"
                  aria-hidden="true"
                />
                Database execution
              </div>
              <p className="text-ink-muted mt-2 text-xs leading-5">
                Not connected by design. MySQL integration belongs to a later
                approved milestone.
              </p>
            </div>
            <div className="rounded-control border-divider bg-deep border p-3">
              <div className="text-ink-secondary flex items-center gap-2 text-xs font-medium">
                <span
                  className="bg-ink-disabled size-1.5 rounded-full"
                  aria-hidden="true"
                />
                Authentication
              </div>
              <p className="text-ink-muted mt-2 text-xs leading-5">
                No Firebase project or credentials have been configured.
              </p>
            </div>
            <p className="text-ink-muted text-xs leading-5">
              The next milestone requires separate approval and must preserve
              the contracts and isolation model already documented.
            </p>
          </div>
        </aside>
      </div>

      <section
        aria-labelledby="queue-title"
        className="rounded-panel border-structural bg-deep border"
      >
        <div className="border-divider border-b px-4 py-3">
          <h3
            id="queue-title"
            className="font-heading text-ink-primary text-base font-semibold"
          >
            Operational queue
          </h3>
          <p className="text-ink-muted mt-0.5 text-xs">
            No sample data is fabricated
          </p>
        </div>
        <div className="grid min-h-36 place-items-center px-6 py-8 text-center">
          <div>
            <p className="text-ink-secondary font-medium">
              No workflows connected
            </p>
            <p className="text-ink-muted mt-1 max-w-md text-xs leading-5">
              Database operations remain outside this approved foundation
              milestone.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
