import { jsPDF } from "jspdf";

import type { InteractiveConsoleEntry } from "./interactive-console";

const PAGE_FORMAT_IN = [8.5, 13] as const;
const PAGE_MARGIN_IN = 0.65;
const FOOTER_RESERVED_IN = 0.75;
const FOOTER_BOTTOM_MARGIN_IN = 0.35;
const BODY_LINE_HEIGHT_IN = 0.17;
const META_LINE_HEIGHT_IN = 0.19;

interface PdfDocument {
  readonly internal: {
    readonly pageSize: {
      getWidth(): number;
      getHeight(): number;
    };
  };
  setFontSize(size: number): this;
  setFont(fontName: string, fontStyle: string): this;
  setTextColor(gray: number): this;
  text(
    text: string,
    x: number,
    y: number,
    options?: { align?: "left" | "center" | "right" },
  ): this;
  splitTextToSize(text: string, maxWidth: number): string[];
  addPage(): this;
  getNumberOfPages(): number;
  setPage(pageNumber: number): this;
  save(fileName: string): void;
}

type PdfDocumentFactory = (options: {
  orientation: "portrait";
  unit: "in";
  format: number[];
}) => PdfDocument;

export interface CodePdfExportInput {
  readonly fileName: string;
  readonly sourceCode: string;
  readonly consoleEntries: readonly Pick<
    InteractiveConsoleEntry,
    "kind" | "data"
  >[];
  readonly authorName: string;
  readonly exportedAt: Date;
}

export function safeCodePdfFileName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 100)
    .trim();
  return cleaned || "code-activity";
}

function prefixFirstContentLine(data: string, prefix: string): string {
  const normalized = data.replace(/\r\n?/g, "\n");
  const leadingNewlines = normalized.match(/^\n*/)?.[0] ?? "";
  return `${leadingNewlines}${prefix}${normalized.slice(leadingNewlines.length)}`;
}

export function formatConsoleTranscript(
  entries: CodePdfExportInput["consoleEntries"],
): string {
  if (entries.length === 0) return "(not run yet)";
  return entries
    .map((entry) => {
      if (entry.kind === "stdout") return entry.data;
      if (entry.kind === "stdin")
        return prefixFirstContentLine(entry.data, "> ");
      if (entry.kind === "stderr")
        return prefixFirstContentLine(entry.data, "[stderr] ");
      return prefixFirstContentLine(entry.data, "[status] ");
    })
    .join("");
}

function logicalLines(value: string): string[] {
  return value.replace(/\r\n?/g, "\n").split("\n");
}

function wrappedLine(
  doc: PdfDocument,
  line: string,
  maxWidth: number,
): string[] {
  const expanded = line.replace(/\t/g, "    ");
  if (!expanded) return [""];
  const wrapped = doc.splitTextToSize(expanded, maxWidth);
  return wrapped.length ? wrapped : [expanded];
}

export function exportFileToPdf(
  input: CodePdfExportInput,
  createDocument: PdfDocumentFactory = (options) =>
    new jsPDF(options) as unknown as PdfDocument,
): void {
  const doc = createDocument({
    orientation: "portrait",
    unit: "in",
    format: [...PAGE_FORMAT_IN],
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxTextWidth = pageWidth - PAGE_MARGIN_IN * 2;
  const contentBottom = pageHeight - FOOTER_RESERVED_IN;
  const footerY = pageHeight - FOOTER_BOTTOM_MARGIN_IN;
  let cursorY = PAGE_MARGIN_IN;

  const addContentPage = () => {
    doc.addPage();
    cursorY = PAGE_MARGIN_IN;
  };
  const writeBodyLine = (line: string) => {
    if (cursorY + BODY_LINE_HEIGHT_IN > contentBottom) addContentPage();
    // jsPDF ignores an empty string; a single space preserves the visual blank
    // line while cursor movement preserves the student's original line break.
    doc.text(line || " ", PAGE_MARGIN_IN, cursorY);
    cursorY += BODY_LINE_HEIGHT_IN;
  };
  const writeBody = (value: string) => {
    for (const line of logicalLines(value))
      for (const visualLine of wrappedLine(doc, line, maxTextWidth))
        writeBodyLine(visualLine);
  };
  const writeSectionTitle = (title: string) => {
    if (cursorY + 0.3 > contentBottom) addContentPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0);
    doc.text(title, PAGE_MARGIN_IN, cursorY);
    cursorY += 0.27;
    doc.setFont("courier", "normal");
    doc.setFontSize(9.5);
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text("Code Activity Report", PAGE_MARGIN_IN, cursorY + 0.12);
  cursorY += 0.48;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(65);
  const metadata = [
    `Author: ${input.authorName}`,
    `Date & Time: ${input.exportedAt.toLocaleString()}`,
    `Activity: ${input.fileName}`,
  ];
  for (const item of metadata) {
    for (const line of wrappedLine(doc, item, maxTextWidth)) {
      doc.text(line || " ", PAGE_MARGIN_IN, cursorY);
      cursorY += META_LINE_HEIGHT_IN;
    }
  }
  cursorY += 0.18;

  writeSectionTitle("Source Code");
  writeBody(input.sourceCode || "(empty file)");

  // The output always begins on a clean page, even when the source happens to
  // end near the top of its last page.
  addContentPage();
  writeSectionTitle("Program Output");
  writeBody(formatConsoleTranscript(input.consoleEntries));

  const pageCount = doc.getNumberOfPages();
  const footerFileName = safeCodePdfFileName(input.fileName);
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(footerFileName, PAGE_MARGIN_IN, footerY);
    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - PAGE_MARGIN_IN,
      footerY,
      { align: "right" },
    );
  }

  doc.save(`${footerFileName}.pdf`);
}
