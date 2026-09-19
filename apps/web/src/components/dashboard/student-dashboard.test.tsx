import axe from "axe-core";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const klass = {
  id: "00000000-0000-4000-8000-000000000020",
  teacherId: "00000000-0000-4000-8000-000000000010",
  teacherName: "Ms. Teacher",
  subjectName: "Databases 101",
  sectionLabel: "BSIT 2B",
  joinCode: "ABC123",
  archivedAt: null,
  createdAt: "2026-09-10T00:00:00.000Z",
  memberCount: 20,
};

const openActivity = {
  id: "00000000-0000-4000-8000-000000000030",
  title: "Joins practice",
  language: "python",
  testCaseCount: 3,
  points: 100,
  deadlineAt: "2026-09-20T00:00:00.000Z",
  isLocked: false,
  createdAt: "2026-09-11T00:00:00.000Z",
  attemptStatus: null,
  score: null,
  submittedAt: null,
};

const passedActivity = {
  ...openActivity,
  id: "00000000-0000-4000-8000-000000000031",
  title: "Already done",
  attemptStatus: "passed",
  score: 100,
  submittedAt: "2026-09-12T00:00:00.000Z",
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body));
}

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(async (path: string) => {
    if (path === "/v1/classes/enrolled") return jsonResponse([]);
    if (path.endsWith("/activities")) return jsonResponse([]);
    if (path.endsWith("/quizzes")) return jsonResponse([]);
    if (path.endsWith("/races")) return jsonResponse([]);
    return jsonResponse([]);
  }),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    authorizedFetch: mocks.authorizedFetch,
  }),
}));

import { StudentDashboard } from "./student-dashboard";

describe("StudentDashboard", () => {
  it("has no automated accessibility violations with no classes joined", async () => {
    const { container, getByText } = render(<StudentDashboard />);
    await waitFor(() =>
      expect(getByText(/haven't joined a class yet/)).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("lists an open, not-yet-submitted activity in To do and counts it as pending", async () => {
    mocks.authorizedFetch.mockImplementation(async (path: string) => {
      if (path === "/v1/classes/enrolled") return jsonResponse([klass]);
      if (path.endsWith("/activities")) return jsonResponse([openActivity]);
      if (path.endsWith("/quizzes")) return jsonResponse([]);
      if (path.endsWith("/races")) return jsonResponse([]);
      return jsonResponse([]);
    });
    const { getByText, getAllByText } = render(<StudentDashboard />);
    await waitFor(() => expect(getByText("Joins practice")).toBeInTheDocument());
    expect(getAllByText("Databases 101").length).toBeGreaterThan(0);
    expect(getAllByText(/Not started/).length).toBeGreaterThan(0);
    expect(getByText("1 pending", { exact: false })).toBeInTheDocument();
  });

  it("excludes a passed activity from To do and counts it as completed", async () => {
    mocks.authorizedFetch.mockImplementation(async (path: string) => {
      if (path === "/v1/classes/enrolled") return jsonResponse([klass]);
      if (path.endsWith("/activities")) return jsonResponse([passedActivity]);
      if (path.endsWith("/quizzes")) return jsonResponse([]);
      if (path.endsWith("/races")) return jsonResponse([]);
      return jsonResponse([]);
    });
    const { getByText, queryByText } = render(<StudentDashboard />);
    await waitFor(() =>
      expect(getByText(/all caught up/)).toBeInTheDocument(),
    );
    expect(queryByText("Already done")).not.toBeInTheDocument();
  });
});
