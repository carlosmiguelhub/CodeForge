import { describe, expect, it, vi } from "vitest";

vi.mock("jspdf", () => ({ jsPDF: vi.fn() }));

import {
  exportFileToPdf,
  formatConsoleTranscript,
  safeCodePdfFileName,
} from "./code-pdf-export";

interface TextCall {
  readonly page: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly options?: { align?: "left" | "center" | "right" } | undefined;
}

class FakePdfDocument {
  readonly internal = {
    pageSize: {
      getWidth: () => 8.5,
      getHeight: () => 13,
    },
  };
  readonly textCalls: TextCall[] = [];
  savedAs: string | undefined;
  private page = 1;
  private pageCount = 1;

  setFontSize() {
    return this;
  }

  setFont() {
    return this;
  }

  setTextColor() {
    return this;
  }

  text(
    text: string,
    x: number,
    y: number,
    options?: { align?: "left" | "center" | "right" },
  ) {
    this.textCalls.push({ page: this.page, text, x, y, options });
    return this;
  }

  splitTextToSize(text: string) {
    const lines: string[] = [];
    for (let index = 0; index < text.length; index += 60)
      lines.push(text.slice(index, index + 60));
    return lines;
  }

  addPage() {
    this.pageCount += 1;
    this.page = this.pageCount;
    return this;
  }

  getNumberOfPages() {
    return this.pageCount;
  }

  setPage(pageNumber: number) {
    this.page = pageNumber;
    return this;
  }

  save(fileName: string) {
    this.savedAs = fileName;
  }
}

describe("code PDF export", () => {
  it("keeps useful file-name characters while removing unsafe ones", () => {
    expect(safeCodePdfFileName(" Activity: 3?.java ")).toBe(
      "Activity- 3-.java",
    );
    expect(safeCodePdfFileName("... ")).toBe("code-activity");
  });

  it("formats the console transcript in chronological, printable form", () => {
    expect(
      formatConsoleTranscript([
        { kind: "stdout", data: "Full name: " },
        { kind: "stdin", data: "Charlie Psito\n" },
        { kind: "stderr", data: "warning\n" },
        { kind: "status", data: "\n[Process exited with code 0]\n" },
      ]),
    ).toBe(
      "Full name: > Charlie Psito\n[stderr] warning\n\n[status] [Process exited with code 0]\n",
    );
    expect(formatConsoleTranscript([])).toBe("(not run yet)");
  });

  it("uses long bond paper, preserves content, and puts output on a fresh page", () => {
    const doc = new FakePdfDocument();
    let options: unknown;
    const exportedAt = new Date("2026-08-24T05:30:00.000Z");

    exportFileToPdf(
      {
        fileName: "Activity: 3?.java",
        sourceCode: `public class Main {\n\n${"x".repeat(125)}\n}`,
        consoleEntries: [
          { kind: "stdout", data: "Name: " },
          { kind: "stdin", data: "Ada Lovelace\n" },
        ],
        authorName: "Carlos Student",
        exportedAt,
      },
      (receivedOptions) => {
        options = receivedOptions;
        return doc;
      },
    );

    expect(options).toEqual({
      orientation: "portrait",
      unit: "in",
      format: [8.5, 13],
    });
    expect(doc.savedAs).toBe("Activity- 3-.java.pdf");
    expect(doc.textCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ page: 1, text: "Code Activity Report" }),
        expect.objectContaining({ page: 1, text: "Author: Carlos Student" }),
        expect.objectContaining({
          page: 1,
          text: `Date & Time: ${exportedAt.toLocaleString()}`,
        }),
        expect.objectContaining({ page: 1, text: "Source Code" }),
        expect.objectContaining({ page: 1, text: " " }),
        expect.objectContaining({ page: 2, text: "Program Output" }),
        expect.objectContaining({ page: 2, text: "Name: > Ada Lovelace" }),
        expect.objectContaining({ page: 1, text: "Page 1 of 2" }),
        expect.objectContaining({ page: 2, text: "Page 2 of 2" }),
      ]),
    );
  });

  it("paginates long source and adds an identifying footer to every page", () => {
    const doc = new FakePdfDocument();
    const sourceCode = Array.from(
      { length: 180 },
      (_, index) => `printf("line ${index + 1}");`,
    ).join("\n");

    exportFileToPdf(
      {
        fileName: "long-program.c",
        sourceCode,
        consoleEntries: [],
        authorName: "Student",
        exportedAt: new Date("2026-08-24T05:30:00.000Z"),
      },
      () => doc,
    );

    const pageCount = doc.getNumberOfPages();
    expect(pageCount).toBeGreaterThan(3);
    const outputTitle = doc.textCalls.find(
      (call) => call.text === "Program Output",
    );
    const lastSourceLine = doc.textCalls.find(
      (call) => call.text === 'printf("line 180");',
    );
    expect(outputTitle!.page).toBeGreaterThan(lastSourceLine!.page);
    expect(doc.textCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          page: outputTitle!.page,
          text: "(not run yet)",
        }),
      ]),
    );
    for (let page = 1; page <= pageCount; page += 1) {
      expect(doc.textCalls).toContainEqual(
        expect.objectContaining({
          page,
          text: `Page ${page} of ${pageCount}`,
        }),
      );
      expect(doc.textCalls).toContainEqual(
        expect.objectContaining({ page, text: "long-program.c" }),
      );
    }
  });
});
