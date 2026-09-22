import { WEB_IMAGE_MAX_BYTES } from "@sqweb/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WebWorkbench } from "./web-workbench";

const mocks = vi.hoisted(() => ({ authorizedFetch: vi.fn() }));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

vi.mock("@/components/code-workbench/code-editor", () => ({
  CodeEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange(value: string): void;
  }) => (
    <textarea
      aria-label="Code editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
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
          id: "site",
          kind: "folder",
          name: "My website",
          children: [
            {
              id: "html",
              kind: "file",
              name: "index.html",
              sourceCode:
                '<link rel="stylesheet" href="style.css"><h1>Hello</h1><script src="app.js"></script>',
            },
            {
              id: "css",
              kind: "file",
              name: "style.css",
              sourceCode: "h1 { color: blue; }",
            },
            {
              id: "js",
              kind: "file",
              name: "app.js",
              sourceCode: "document.body.dataset.ready = 'yes';",
            },
          ],
        },
      ],
    },
    expanded: ["site"],
    openFileIds: ["html"],
    activeFileId: "html",
  },
  createdAt: "2026-08-24T05:00:00.000Z",
  updatedAt: "2026-08-24T05:00:00.000Z",
};

describe("WebWorkbench", () => {
  beforeEach(() => {
    mocks.authorizedFetch.mockReset();
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

  it("opens the result into a scripts-only sandbox and hard-refreshes it", async () => {
    render(<WebWorkbench />);

    fireEvent.click(await screen.findByRole("button", { name: "View result" }));

    const iframe = await screen.findByTitle("Live preview");
    await waitFor(() =>
      expect((iframe as HTMLIFrameElement).srcdoc).toContain(
        "h1 { color: blue; }",
      ),
    );
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect((iframe as HTMLIFrameElement).srcdoc).toContain(
      "document.body.dataset.ready",
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(screen.getByTitle("Live preview")).not.toBe(iframe),
    );
  });

  it("live-reloads edits and autosaves the complete workspace", async () => {
    render(<WebWorkbench />);
    fireEvent.click(await screen.findByRole("button", { name: "View result" }));
    await screen.findByTitle("Live preview");

    fireEvent.click(screen.getByRole("button", { name: /^style\.cssCSS$/i }));
    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: { value: "h1 { color: red; }" },
    });

    await waitFor(() =>
      expect(
        (screen.getByTitle("Live preview") as HTMLIFrameElement).srcdoc,
      ).toContain("h1 { color: red; }"),
    );
    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        "/v1/web-workspace",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("keeps an invalid file draft open with an inline validation error", async () => {
    render(<WebWorkbench />);
    await screen.findByRole("button", { name: "View result" });

    fireEvent.click(
      screen.getByRole("button", { name: "New file in My website" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "notes.txt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "File name must end in .html, .css, or .js",
    );
    expect(screen.getByDisplayValue("notes.txt")).toBeInTheDocument();
  });

  it("uploads an image, opens it as a preview instead of the code editor, and resolves it in the live result", async () => {
    render(<WebWorkbench />);
    await screen.findByRole("button", { name: "View result" });

    const file = new File(["a".repeat(12)], "logo.png", {
      type: "image/png",
    });
    fireEvent.change(
      screen.getByLabelText("Choose an image to upload", { exact: false }),
      { target: { files: [file] } },
    );

    const image = (await screen.findByRole("img", {
      name: "logo.png",
    })) as HTMLImageElement;
    expect(image.src.startsWith("data:image/png;base64,")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "index.html" }));
    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: {
        value:
          '<link rel="stylesheet" href="style.css"><img src="logo.png"><script src="app.js"></script>',
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "View result" }));
    const iframe = (await screen.findByTitle(
      "Live preview",
    )) as HTMLIFrameElement;
    await waitFor(() =>
      expect(iframe.srcdoc).toContain('src="data:image/png;base64,'),
    );
  });

  it("rejects an oversized image upload with an inline error instead of adding it", async () => {
    render(<WebWorkbench />);
    await screen.findByRole("button", { name: "View result" });

    const oversized = new File(
      ["a".repeat(WEB_IMAGE_MAX_BYTES + 1)],
      "big.png",
      { type: "image/png" },
    );
    fireEvent.change(
      screen.getByLabelText("Choose an image to upload", { exact: false }),
      { target: { files: [oversized] } },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("too large");
    expect(screen.queryByRole("img", { name: "big.png" })).toBeNull();
  });
});
