import type { WorkspaceCredential } from "@sqweb/workspace";

export function parseCredential(value: unknown): WorkspaceCredential {
  if (!value || typeof value !== "object")
    throw new Error("Workspace credential payload is invalid.");
  const item = value as Record<string, unknown>;
  if (
    typeof item.host !== "string" ||
    typeof item.port !== "number" ||
    !Number.isInteger(item.port) ||
    typeof item.database !== "string" ||
    typeof item.username !== "string" ||
    typeof item.password !== "string" ||
    item.host.length === 0 ||
    item.database.length === 0 ||
    item.username.length === 0 ||
    item.password.length < 32
  )
    throw new Error("Workspace credential payload is invalid.");
  return item as unknown as WorkspaceCredential;
}
