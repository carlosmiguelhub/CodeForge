import { z } from "zod";

// Diagram content is React Flow node/edge data (EntityNodeData | ShapeNodeData
// | TextNodeData, CrowsFootEdgeData, etc.) owned and interpreted entirely by
// the client. Mirroring that full discriminated union here would duplicate
// it and drift out of sync, so the server only validates the envelope shape
// plus a minimal per-item contract (an `id` must exist), and caps array
// sizes against abuse. Everything else passes through opaquely.
const looseRecord = z.object({ id: z.string().min(1) }).catchall(z.unknown());

export const erdDiagramContentSchema = z.object({
  nodes: z.array(looseRecord).max(500),
  edges: z.array(looseRecord).max(1000),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
  entityColumns: z.array(looseRecord).max(50),
});
export type ErdDiagramContent = z.infer<typeof erdDiagramContentSchema>;

export const erdDiagramNameSchema = z.string().trim().min(1).max(120);

export const erdDiagramSummarySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: erdDiagramNameSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ErdDiagramSummary = z.infer<typeof erdDiagramSummarySchema>;

export const erdDiagramSchema = erdDiagramSummarySchema.extend({
  content: erdDiagramContentSchema,
});
export type ErdDiagram = z.infer<typeof erdDiagramSchema>;

export const erdDiagramCreateRequestSchema = z.object({
  name: erdDiagramNameSchema.optional(),
  content: erdDiagramContentSchema.optional(),
});
export type ErdDiagramCreateRequest = z.infer<
  typeof erdDiagramCreateRequestSchema
>;

export const erdDiagramRenameRequestSchema = z.object({
  name: erdDiagramNameSchema,
});
export type ErdDiagramRenameRequest = z.infer<
  typeof erdDiagramRenameRequestSchema
>;

export const erdDiagramSaveContentRequestSchema = z.object({
  content: erdDiagramContentSchema,
});
export type ErdDiagramSaveContentRequest = z.infer<
  typeof erdDiagramSaveContentRequestSchema
>;
