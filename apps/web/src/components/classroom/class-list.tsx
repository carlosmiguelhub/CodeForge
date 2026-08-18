"use client";

import {
  academicOptionsSchema,
  classSummarySchema,
  type AcademicOptions,
  type ClassSummary,
  type Role,
} from "@sqweb/contracts";
import { ArrowRight, BookOpen, Plus, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";

export function classCodeFromInvitation(code: string): string | null {
  const [candidate] = code.trim().split(".", 1);
  return candidate &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate,
    )
    ? candidate
    : null;
}

export function ClassList({
  role,
}: Readonly<{ role: Extract<Role, "student" | "teacher"> }>) {
  const { authorizedFetch } = useAuth();
  const [classes, setClasses] = useState<readonly ClassSummary[]>([]);
  const [options, setOptions] = useState<AcademicOptions>({
    courses: [],
    terms: [],
  });
  const [status, setStatus] = useState("Loading classes…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("Loading classes…");
    try {
      const requests: Promise<Response>[] = [authorizedFetch("/v1/classes")];
      if (role === "teacher")
        requests.push(authorizedFetch("/v1/academic-options"));
      const responses = await Promise.all(requests);
      if (!responses[0]?.ok) throw new Error("Classes could not be loaded.");
      const parsedClasses = classSummarySchema
        .array()
        .parse(await responses[0].json());
      setClasses(parsedClasses);
      if (responses[1]) {
        if (!responses[1].ok)
          throw new Error("Academic options could not be loaded.");
        setOptions(academicOptionsSchema.parse(await responses[1].json()));
      }
      setStatus(parsedClasses.length ? "" : "No classes yet.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Classes could not be loaded.",
      );
    }
  }, [authorizedFetch, role]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setStatus("Creating class…");
    try {
      const response = await authorizedFetch(
        "/v1/classes",
        {
          method: "POST",
          body: JSON.stringify({
            courseId: form.get("courseId"),
            termId: form.get("termId"),
            section: form.get("section"),
          }),
        },
        true,
      );
      if (!response.ok) throw new Error("The class could not be created.");
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The class could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function joinClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const code = String(
      new FormData(formElement).get("invitationCode") ?? "",
    ).trim();
    const classId = classCodeFromInvitation(code);
    if (!classId) {
      setStatus("Enter the complete invitation code supplied by your Teacher.");
      return;
    }
    setBusy(true);
    setStatus("Joining class…");
    try {
      const response = await authorizedFetch(
        `/v1/classes/${classId}/join`,
        { method: "POST", body: JSON.stringify({ code }) },
        true,
      );
      if (!response.ok)
        throw new Error("The invitation is invalid, expired, or unavailable.");
      formElement.reset();
      await load();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The class could not be joined.",
      );
    } finally {
      setBusy(false);
    }
  }

  const noAcademicOptions =
    options.courses.length === 0 || options.terms.length === 0;

  return (
    <div className="space-y-6">
      <section className="border-structural bg-surface rounded-panel border">
        <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-heading text-ink-primary text-lg font-semibold tracking-[-0.02em]">
              {role === "teacher" ? "Create a class" : "Join a class"}
            </h2>
            <p className="text-ink-muted mt-1 text-xs">
              {role === "teacher"
                ? "Classes are bound to an approved course, term, and Teacher owner."
                : "Use the complete invitation code shared by your Teacher."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="border-structural text-ink-muted hover:text-ink-primary rounded-control flex min-h-9 items-center gap-2 border px-3 text-xs"
          >
            <RefreshCw aria-hidden="true" size={14} /> Refresh
          </button>
        </div>

        {role === "teacher" ? (
          <form
            onSubmit={(event) => void createClass(event)}
            className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
          >
            <label className="text-ink-muted grid gap-1.5 text-xs">
              Course
              <select
                name="courseId"
                required
                disabled={busy || noAcademicOptions}
                className="border-divider bg-elevated text-ink-primary rounded-control min-h-10 border px-3"
              >
                <option value="">Select course</option>
                {options.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} — {course.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-ink-muted grid gap-1.5 text-xs">
              Term
              <select
                name="termId"
                required
                disabled={busy || noAcademicOptions}
                className="border-divider bg-elevated text-ink-primary rounded-control min-h-10 border px-3"
              >
                <option value="">Select term</option>
                {options.terms
                  .filter((term) => term.status !== "closed")
                  .map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-ink-muted grid gap-1.5 text-xs">
              Section
              <input
                name="section"
                required
                maxLength={80}
                disabled={busy}
                className="border-divider bg-elevated text-ink-primary rounded-control min-h-10 border px-3"
                placeholder="e.g. BSIT 2A"
              />
            </label>
            <button
              disabled={busy || noAcademicOptions}
              className="bg-action rounded-control min-h-10 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <Plus aria-hidden="true" size={15} /> Create
              </span>
            </button>
          </form>
        ) : (
          <form
            onSubmit={(event) => void joinClass(event)}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
          >
            <label className="text-ink-muted grid flex-1 gap-1.5 text-xs">
              Invitation code
              <input
                name="invitationCode"
                required
                minLength={32}
                maxLength={128}
                disabled={busy}
                autoComplete="off"
                className="border-divider bg-elevated text-ink-primary rounded-control min-h-10 border px-3 font-mono"
              />
            </label>
            <button
              disabled={busy}
              className="bg-action rounded-control min-h-10 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Join class
            </button>
          </form>
        )}

        {role === "teacher" && noAcademicOptions ? (
          <p className="border-warning/30 bg-warning/5 text-warning mx-4 mb-4 border px-3 py-2 text-xs">
            An Administrator must add at least one active course and term before
            a class can be created.
          </p>
        ) : null}
      </section>

      <p
        role="status"
        aria-live="polite"
        className="text-ink-muted min-h-5 text-xs"
      >
        {status}
      </p>

      <section
        aria-label="Classes"
        className="border-structural bg-surface rounded-panel overflow-hidden border"
      >
        <div className="border-divider grid grid-cols-[minmax(0,1fr)_auto] border-b px-4 py-3 text-[11px] font-medium tracking-[0.08em] uppercase">
          <span className="text-ink-muted">Class</span>
          <span className="text-ink-muted">Enrollment</span>
        </div>
        {classes.map((item) => (
          <article
            key={item.id}
            className="border-divider hover:bg-elevated grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="border-divider bg-elevated text-action-soft rounded-control grid size-9 shrink-0 place-items-center border">
                <BookOpen aria-hidden="true" size={16} />
              </span>
              <div className="min-w-0">
                <h3 className="text-ink-primary truncate text-sm font-semibold">
                  {item.courseCode} · {item.section}
                </h3>
                <p className="text-ink-muted truncate text-xs">
                  {item.courseTitle} · {item.termName}
                </p>
                <p className="text-ink-muted mt-1 text-[11px]">
                  Teacher: {item.ownerTeacherName} ·{" "}
                  <span className="capitalize">{item.status}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-ink-muted flex items-center gap-1.5 text-xs">
                <Users aria-hidden="true" size={14} /> {item.enrolledCount}/60
              </span>
              <Link
                href={
                  role === "teacher"
                    ? `/teacher/classes/${item.id}/roster`
                    : `/student/classes/${item.id}`
                }
                className="text-action-soft hover:text-ink-primary rounded-control flex min-h-9 items-center gap-1 px-2 text-xs"
              >
                Open <ArrowRight aria-hidden="true" size={14} />
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
