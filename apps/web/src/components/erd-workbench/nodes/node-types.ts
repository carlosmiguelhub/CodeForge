import type { NodeTypes } from "@xyflow/react";

import { EntityNode } from "./entity-node";
import { ShapeNode } from "./shape-node";
import { TextNode } from "./text-node";

export const nodeTypes: NodeTypes = {
  entity: EntityNode,
  shape: ShapeNode,
  text: TextNode,
};
