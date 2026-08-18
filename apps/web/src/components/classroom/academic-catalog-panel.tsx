"use client";

import { academicCatalogSchema, type AcademicCatalog } from "@sqweb/contracts";
import {
  BookOpen,
  Building2,
  CalendarRange,
  GraduationCap,
  RefreshCw,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";

const emptyCatalog: AcademicCatalog = {
  departments: [],
  programs: [],
  courses: [],
  terms: [],
};

export function AcademicCatalogPanel() {
  const { authorizedFetch } = useAuth();
  const [catalog, setCatalog] = useState<AcademicCatalog>(emptyCatalog);
  const [status, setStatus] = useState("Loading academic catalog…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch("/v1/admin/academics");
      if (!response.ok)
        throw new Error("The academic catalog could not be loaded.");
      setCatalog(academicCatalogSchema.parse(await response.json()));
      setStatus("");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The academic catalog could not be loaded.",
      );
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createRecord(
    event: FormEvent<HTMLFormElement>,
    kind: "departments" | "programs" | "courses" | "terms",
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement));
    if (kind === "terms") {
      values.startsAt = new Date(String(values.startsAt)).toISOString();
      values.endsAt = new Date(String(values.endsAt)).toISOString();
    }
    setBusy(true);
    setStatus("Saving academic record…");
    try {
      const response = await authorizedFetch(
        `/v1/admin/academics/${kind}`,
        {
          method: "POST",
          body: JSON.stringify(values),
        },
        true,
      );
      if (!response.ok)
        throw new Error("The academic record could not be saved.");
      formElement.reset();
      await load();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The academic record could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "border-divider bg-elevated text-ink-primary rounded-control min-h-10 border px-3";

  return (
    <div className="space-y-6">
      <section className="border-structural bg-surface rounded-panel border">
        <div className="border-divider flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-heading text-ink-primary text-lg font-semibold">
              Academic hierarchy
            </h2>
            <p className="text-ink-muted mt-1 text-xs">
              Create parent records before dependent programs, courses, and
              classes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="text-ink-muted hover:text-ink-primary rounded-control flex min-h-9 items-center gap-2 px-2 text-xs"
          >
            <RefreshCw aria-hidden="true" size={14} /> Refresh
          </button>
        </div>
        <div className="grid divide-y divide-[var(--color-divider)] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <AcademicForm
            title="Department"
            icon={Building2}
            onSubmit={(event) => void createRecord(event, "departments")}
            busy={busy}
          >
            <label className="text-ink-muted grid gap-1 text-xs">
              Code
              <input
                className={inputClass}
                name="code"
                required
                maxLength={32}
              />
            </label>
            <label className="text-ink-muted grid gap-1 text-xs">
              Name
              <input
                className={inputClass}
                name="name"
                required
                maxLength={160}
              />
            </label>
          </AcademicForm>
          <AcademicForm
            title="Program"
            icon={GraduationCap}
            onSubmit={(event) => void createRecord(event, "programs")}
            busy={busy}
          >
            <DepartmentSelect catalog={catalog} className={inputClass} />
            <label className="text-ink-muted grid gap-1 text-xs">
              Code
              <input
                className={inputClass}
                name="code"
                required
                maxLength={32}
              />
            </label>
            <label className="text-ink-muted grid gap-1 text-xs sm:col-span-2">
              Name
              <input
                className={inputClass}
                name="name"
                required
                maxLength={160}
              />
            </label>
          </AcademicForm>
        </div>
        <div className="border-divider grid divide-y divide-[var(--color-divider)] border-t lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <AcademicForm
            title="Course"
            icon={BookOpen}
            onSubmit={(event) => void createRecord(event, "courses")}
            busy={busy}
          >
            <DepartmentSelect catalog={catalog} className={inputClass} />
            <label className="text-ink-muted grid gap-1 text-xs">
              Code
              <input
                className={inputClass}
                name="code"
                required
                maxLength={32}
              />
            </label>
            <label className="text-ink-muted grid gap-1 text-xs sm:col-span-2">
              Title
              <input
                className={inputClass}
                name="title"
                required
                maxLength={200}
              />
            </label>
          </AcademicForm>
          <AcademicForm
            title="Term"
            icon={CalendarRange}
            onSubmit={(event) => void createRecord(event, "terms")}
            busy={busy}
          >
            <label className="text-ink-muted grid gap-1 text-xs sm:col-span-2">
              Name
              <input
                className={inputClass}
                name="name"
                required
                maxLength={120}
              />
            </label>
            <label className="text-ink-muted grid gap-1 text-xs">
              Starts
              <input
                className={inputClass}
                name="startsAt"
                type="datetime-local"
                required
              />
            </label>
            <label className="text-ink-muted grid gap-1 text-xs">
              Ends
              <input
                className={inputClass}
                name="endsAt"
                type="datetime-local"
                required
              />
            </label>
          </AcademicForm>
        </div>
      </section>

      <p
        role="status"
        aria-live="polite"
        className="text-ink-muted min-h-5 text-xs"
      >
        {status}
      </p>

      <section className="border-structural bg-surface rounded-panel overflow-x-auto border">
        <table className="w-full min-w-[700px] border-collapse text-left text-xs">
          <thead className="bg-elevated text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Code/name</th>
              <th className="px-4 py-2.5 font-medium">Detail</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {catalog.departments.map((item) => (
              <CatalogRow
                key={item.id}
                type="Department"
                primary={`${item.code} · ${item.name}`}
                detail="Institution academic unit"
                status={item.status}
              />
            ))}
            {catalog.programs.map((item) => (
              <CatalogRow
                key={item.id}
                type="Program"
                primary={`${item.code} · ${item.name}`}
                detail="Department-owned program"
                status={item.status}
              />
            ))}
            {catalog.courses.map((item) => (
              <CatalogRow
                key={item.id}
                type="Course"
                primary={`${item.code} · ${item.title}`}
                detail="Available for class creation"
                status={item.status}
              />
            ))}
            {catalog.terms.map((item) => (
              <CatalogRow
                key={item.id}
                type="Term"
                primary={item.name}
                detail={`${new Date(item.startsAt).toLocaleDateString()} – ${new Date(item.endsAt).toLocaleDateString()}`}
                status={item.status}
              />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function AcademicForm({
  title,
  icon: Icon,
  onSubmit,
  busy,
  children,
}: Readonly<{
  title: string;
  icon: typeof Building2;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  children: React.ReactNode;
}>) {
  return (
    <form onSubmit={onSubmit} className="p-4">
      <h3 className="text-ink-primary flex items-center gap-2 text-sm font-semibold">
        <Icon aria-hidden="true" size={15} /> {title}
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
      <button
        disabled={busy}
        className="bg-action rounded-control mt-3 min-h-9 px-3 text-xs font-semibold text-white disabled:opacity-50"
      >
        Add {title.toLowerCase()}
      </button>
    </form>
  );
}

function DepartmentSelect({
  catalog,
  className,
}: Readonly<{ catalog: AcademicCatalog; className: string }>) {
  return (
    <label className="text-ink-muted grid gap-1 text-xs">
      Department
      <select className={className} name="departmentId" required>
        <option value="">Select department</option>
        {catalog.departments
          .filter((item) => item.status === "active")
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} — {item.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function CatalogRow({
  type,
  primary,
  detail,
  status,
}: Readonly<{
  type: string;
  primary: string;
  detail: string;
  status: string;
}>) {
  return (
    <tr className="border-divider border-t">
      <td className="text-ink-muted px-4 py-3">{type}</td>
      <td className="text-ink-primary px-4 py-3 font-medium">{primary}</td>
      <td className="text-ink-muted px-4 py-3">{detail}</td>
      <td className="px-4 py-3 capitalize">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="bg-success size-1.5 rounded-full"
          />
          {status}
        </span>
      </td>
    </tr>
  );
}
