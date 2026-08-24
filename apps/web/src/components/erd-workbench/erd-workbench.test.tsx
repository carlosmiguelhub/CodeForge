import axe from "axe-core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver, which @xyflow/react requires to measure its
// container and nodes — a minimal no-op polyfill is enough for a
// mount-only smoke test. It is NOT enough to make React Flow actually
// render edges (that additionally needs DOMMatrixReadOnly and real layout,
// neither of which jsdom provides), so interaction tests below assert on
// this component's own state-driven UI (status text) rather than on
// React Flow's internal SVG output.
beforeAll(() => {
  class ResizeObserverStub implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver ??= ResizeObserverStub;
});

const diagram = {
  id: "00000000-0000-4000-8000-000000000040",
  ownerId: "00000000-0000-4000-8000-000000000010",
  name: "Untitled diagram",
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
  content: {
    nodes: [
      {
        id: "author",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          kind: "entity",
          name: "authors",
          attributes: [
            {
              id: "a1",
              name: "id",
              dataType: "INT",
              isPrimaryKey: true,
              customValues: {},
            },
            {
              id: "a2",
              name: "name",
              dataType: "VARCHAR(120)",
              isPrimaryKey: false,
              customValues: {},
            },
          ],
        },
      },
      {
        id: "book",
        type: "entity",
        position: { x: 320, y: 0 },
        data: {
          kind: "entity",
          name: "books",
          attributes: [
            {
              id: "b1",
              name: "id",
              dataType: "INT",
              isPrimaryKey: true,
              customValues: {},
            },
            {
              id: "b2",
              name: "author_id",
              dataType: "INT",
              isPrimaryKey: false,
              customValues: {},
            },
            {
              id: "b3",
              name: "title",
              dataType: "VARCHAR(200)",
              isPrimaryKey: false,
              customValues: {},
            },
          ],
        },
      },
    ],
    edges: [
      {
        id: "author-book",
        type: "crowsFoot",
        source: "author",
        target: "book",
        data: {
          sourceCardinality: "one",
          targetCardinality: "many",
          bendPoints: [],
        },
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    entityColumns: [],
  },
};

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(async () => new Response(JSON.stringify(diagram))),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () =>
    "/student/erd-workspace/00000000-0000-4000-8000-000000000040",
}));

import { ErdWorkbench } from "./erd-workbench";

describe("ErdWorkbench", () => {
  beforeEach(() => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify(diagram)),
    );
  });

  it("renders an accessible tool palette and canvas", async () => {
    const { container, getByRole } = render(
      <ErdWorkbench diagramId={diagram.id} />,
    );

    await waitFor(() =>
      expect(
        getByRole("complementary", { name: "ERD tools" }),
      ).toBeInTheDocument(),
    );
    expect(getByRole("button", { name: "Select" })).toBeInTheDocument();
    expect(getByRole("button", { name: "Entity" })).toBeInTheDocument();
    expect(getByRole("button", { name: "Connect" })).toBeInTheDocument();

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  // Regression test: nodes were draggable in every tool mode, so a click
  // with any pointer movement (the normal case for a real mouse) was
  // interpreted as a drag and onNodeClick never fired — the Connect tool
  // silently did nothing. This clicks through the real flow and asserts on
  // the toolbar's status text, which is driven by the exact same
  // pendingConnectionSourceId state that creates the edge, so it catches
  // this class of regression without depending on React Flow's
  // measurement-gated SVG rendering (unavailable in jsdom).
  it("progresses the click-to-connect flow when clicking two entities", async () => {
    const { getByRole, getByText } = render(
      <ErdWorkbench diagramId={diagram.id} />,
    );
    await waitFor(() =>
      expect(
        getByRole("complementary", { name: "ERD tools" }),
      ).toBeInTheDocument(),
    );
    await waitFor(() => expect(getByText("authors")).toBeInTheDocument());

    const sourceNode = getByText("authors").closest(".react-flow__node");
    const targetNode = getByText("books").closest(".react-flow__node");
    expect(sourceNode).toBeTruthy();
    expect(targetNode).toBeTruthy();

    fireEvent.click(getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(getByText("Click a source shape to connect")).toBeInTheDocument(),
    );

    fireEvent.click(sourceNode!);
    await waitFor(() =>
      expect(getByText("Click a target shape to connect")).toBeInTheDocument(),
    );

    fireEvent.click(targetNode!);
    // Completing a connection resets to "pick a source" so more lines can
    // be drawn without reselecting the Connect tool.
    await waitFor(() =>
      expect(getByText("Click a source shape to connect")).toBeInTheDocument(),
    );
  });
});
