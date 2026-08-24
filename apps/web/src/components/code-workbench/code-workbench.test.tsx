import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CodeWorkbench } from "./code-workbench";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
  exportFileToPdf: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    authorizedFetch: mocks.authorizedFetch,
    account: { displayName: "Charlie Student" },
  }),
}));

vi.mock("./code-pdf-export", () => ({
  exportFileToPdf: mocks.exportFileToPdf,
}));

vi.mock("./code-editor", () => ({
  CodeEditor: ({ value }: { value: string }) => (
    <textarea aria-label="Code editor" readOnly value={value} />
  ),
}));

const workspace = {
  ownerId: "00000000-0000-4000-8000-000000000010",
  content: {
    root: {
      id: "root",
      kind: "folder",
      name: "My files",
      children: [
        {
          id: "file-1",
          kind: "file",
          name: "Activity 3.c",
          language: "c",
          sourceCode: "int main(void) { return 0; }",
        },
      ],
    },
    expanded: ["root"],
    openFileIds: ["file-1"],
    activeFileId: "file-1",
  },
  createdAt: "2026-08-24T05:00:00.000Z",
  updatedAt: "2026-08-24T05:00:00.000Z",
};

describe("CodeWorkbench PDF export", () => {
  beforeEach(() => {
    mocks.authorizedFetch.mockReset();
    mocks.exportFileToPdf.mockReset();
    mocks.authorizedFetch.mockImplementation(
      async (_path: string, init?: RequestInit) =>
        init?.method === "PUT"
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify(workspace), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
    );
  });

  it("exports the active file with author metadata and an honest empty transcript", async () => {
    render(<CodeWorkbench />);

    const exportButton = screen.getByRole("button", { name: "Export PDF" });
    expect(exportButton).toBeDisabled();
    await waitFor(() => expect(exportButton).toBeEnabled());

    fireEvent.click(exportButton);

    await waitFor(() =>
      expect(mocks.exportFileToPdf).toHaveBeenCalledWith({
        fileName: "Activity 3.c",
        sourceCode: "int main(void) { return 0; }",
        consoleEntries: [],
        authorName: "Charlie Student",
        exportedAt: expect.any(Date),
      }),
    );
  });
});
