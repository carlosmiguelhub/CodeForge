import { z } from "zod";

import { codeLanguageSchema } from "./code-execution";

export const interactiveRunStartMessageSchema = z.object({
  type: z.literal("start"),
  language: codeLanguageSchema,
  sourceCode: z.string().min(1).max(100_000),
});

export const interactiveRunStdinMessageSchema = z.object({
  type: z.literal("stdin"),
  data: z.string().max(10_000),
});

export const interactiveRunClientMessageSchema = z.discriminatedUnion("type", [
  interactiveRunStartMessageSchema,
  interactiveRunStdinMessageSchema,
]);
export type InteractiveRunClientMessage = z.infer<
  typeof interactiveRunClientMessageSchema
>;

export const interactiveRunServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stdout"), data: z.string() }),
  z.object({ type: z.literal("stderr"), data: z.string() }),
  z.object({ type: z.literal("exit"), exitCode: z.number().int() }),
  z.object({ type: z.literal("error"), message: z.string().min(1).max(1_000) }),
]);
export type InteractiveRunServerMessage = z.infer<
  typeof interactiveRunServerMessageSchema
>;

export const interactiveRunGrantResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type InteractiveRunGrantResponse = z.infer<
  typeof interactiveRunGrantResponseSchema
>;
