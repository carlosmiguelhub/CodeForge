import {
  getNodesBounds,
  getViewportForBounds,
  type ReactFlowInstance,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

import type { ErdEdge, ErdNode } from "./types";

const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 1000;
const EXPORT_PADDING = 0.1;
const PAGE_MARGIN_PT = 36;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function safeFileName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[^a-z0-9-_ ]/gi, "")
    .trim();
  return cleaned.length ? cleaned : "diagram";
}

export async function exportDiagramToPdf(input: {
  container: HTMLElement;
  reactFlow: ReactFlowInstance<ErdNode, ErdEdge>;
  name: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
}): Promise<void> {
  const viewportElement = input.container.querySelector<HTMLElement>(
    ".react-flow__viewport",
  );
  if (!viewportElement) throw new Error("The diagram canvas is not ready.");

  const bounds = getNodesBounds(input.reactFlow.getNodes());
  const viewport = getViewportForBounds(
    bounds,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    0.1,
    2,
    EXPORT_PADDING,
  );

  // html-to-image clones the node before applying `style`, so this doesn't
  // touch the live canvas the user is looking at — no on-screen flicker,
  // nothing to restore afterward.
  const dataUrl = await toPng(viewportElement, {
    backgroundColor: "#ffffff",
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    style: {
      width: `${IMAGE_WIDTH}px`,
      height: `${IMAGE_HEIGHT}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(input.name, PAGE_MARGIN_PT, PAGE_MARGIN_PT + 8);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  const metaY = PAGE_MARGIN_PT + 26;
  doc.text(`Created: ${formatDate(input.createdAt)}`, PAGE_MARGIN_PT, metaY);
  doc.text(
    `Last modified: ${formatDate(input.updatedAt)}`,
    PAGE_MARGIN_PT,
    metaY + 14,
  );
  doc.text(`Author: ${input.authorName}`, PAGE_MARGIN_PT, metaY + 28);
  doc.setTextColor(0);

  const imageTop = metaY + 46;
  const imageMaxWidth = pageWidth - PAGE_MARGIN_PT * 2;
  const imageMaxHeight = pageHeight - imageTop - PAGE_MARGIN_PT;
  const imageAspect = IMAGE_WIDTH / IMAGE_HEIGHT;
  let renderWidth = imageMaxWidth;
  let renderHeight = renderWidth / imageAspect;
  if (renderHeight > imageMaxHeight) {
    renderHeight = imageMaxHeight;
    renderWidth = renderHeight * imageAspect;
  }
  doc.addImage(
    dataUrl,
    "PNG",
    PAGE_MARGIN_PT,
    imageTop,
    renderWidth,
    renderHeight,
  );

  doc.save(`${safeFileName(input.name)}.pdf`);
}
