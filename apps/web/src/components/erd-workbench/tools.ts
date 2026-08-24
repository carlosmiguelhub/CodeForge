import {
  Circle,
  Diamond,
  type LucideIcon,
  MousePointer2,
  RectangleHorizontal,
  Spline,
  Table2,
  Trash2,
  Type,
} from "lucide-react";

export type ToolId =
  | "select"
  | "entity"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "text"
  | "connect"
  | "delete";

export interface ToolDefinition {
  readonly id: ToolId;
  readonly label: string;
  readonly icon: LucideIcon;
}

export const shapeTools: readonly ToolDefinition[] = [
  { id: "entity", label: "Entity", icon: Table2 },
  { id: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
  { id: "diamond", label: "Diamond", icon: Diamond },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "text", label: "Text", icon: Type },
];

export const navigationTools: readonly ToolDefinition[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
];

export const actionTools: readonly ToolDefinition[] = [
  { id: "connect", label: "Connect", icon: Spline },
  { id: "delete", label: "Delete", icon: Trash2 },
];

export function isShapeTool(tool: ToolId): boolean {
  return shapeTools.some((t) => t.id === tool);
}
