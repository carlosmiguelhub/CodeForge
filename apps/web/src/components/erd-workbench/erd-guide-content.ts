import { randomId } from "@/lib/random-id";

import type { GuideSample } from "../workbench/guide-modal";
import type { EntityNodeType, ErdEdge } from "./types";

export const erdGuideSections = [
  {
    title: "Your ERD design workspace",
    body: "Use this canvas to plan database structures before writing SQL or to document a schema you already built. Diagrams are saved to your CodeForge account, remain separate from the live database, and can be renamed from the toolbar.",
  },
  {
    title: "Navigating and arranging the canvas",
    body: "Use Select to move shapes, select relationships, and edit content. Drag empty canvas space to pan, use the canvas controls to zoom or fit the diagram, and leave consistent horizontal and vertical gaps so relationship labels and line endings remain readable.",
  },
  {
    title: "Building entities and attributes",
    body: "Place an Entity, rename it, and add one row per attribute. Give each attribute a SQL data type and mark primary keys with the key control. The plus control in the header can add custom diagram-wide columns for details such as nullability, defaults, or notes.",
  },
  {
    title: "Shapes and annotations",
    body: "Entity is the structured table-like shape. Rectangle, Diamond, Ellipse, and Text are freeform tools for conceptual models, relationship labels, grouping, and notes. After placing a shape, the editor returns to Select so you can position or edit it immediately.",
  },
  {
    title: "Drawing clean relationship lines",
    body: "Choose Connect, click a source shape, and then click a target. While connecting, click empty canvas to add routing waypoints around other entities; alignment guides help the final segment meet a target cleanly. Press Escape to cancel. You can also start from a connection dot on an entity edge for precise attachment.",
  },
  {
    title: "Cardinality and notation",
    body: "Select a relationship in Select mode to edit its left and right endings independently. Crow's-foot choices express one, many, zero-or-one, and zero-or-many; arrow, diamond, square, and circle endings support UML or custom classroom notation. Set each end from the perspective of the entity it touches.",
  },
  {
    title: "Autosave, SQL generation, and export",
    body: 'Changes autosave after you pause editing, and the status near the toolbar confirms when saving finishes. From SQL Workspace, "Generate ERD" creates a new editable diagram from tables and keys. Use Export PDF when you need a clean submission or printable copy.',
  },
] as const;

// A JSON-encoded starter diagram, in an editor-relative coordinate space —
// insertDiagramSample() below offsets it before merging into the canvas.
interface DiagramSampleContent {
  nodes: EntityNodeType[];
  edges: ErdEdge[];
}

function entity(
  id: string,
  x: number,
  y: number,
  name: string,
  attributes: { name: string; dataType: string; isPrimaryKey: boolean }[],
): EntityNodeType {
  return {
    id,
    type: "entity",
    position: { x, y },
    data: {
      kind: "entity",
      name,
      attributes: attributes.map((a) => ({
        id: randomId(),
        customValues: {},
        ...a,
      })),
    },
  };
}

const oneToMany: DiagramSampleContent = {
  nodes: [
    entity("author", 0, 0, "authors", [
      { name: "id", dataType: "INT", isPrimaryKey: true },
      { name: "name", dataType: "VARCHAR(120)", isPrimaryKey: false },
    ]),
    entity("book", 320, 0, "books", [
      { name: "id", dataType: "INT", isPrimaryKey: true },
      { name: "author_id", dataType: "INT", isPrimaryKey: false },
      { name: "title", dataType: "VARCHAR(200)", isPrimaryKey: false },
    ]),
  ],
  edges: [
    {
      id: "author-book",
      type: "crowsFoot",
      source: "author",
      target: "book",
      data: {
        sourceCardinality: "one",
        targetCardinality: "many",
        bendPoints: [],
      },
    },
  ],
};

const manyToManyWithJoinTable: DiagramSampleContent = {
  nodes: [
    entity("student", 0, 0, "students", [
      { name: "id", dataType: "INT", isPrimaryKey: true },
      { name: "name", dataType: "VARCHAR(120)", isPrimaryKey: false },
    ]),
    entity("enrollment", 300, 120, "enrollments", [
      { name: "student_id", dataType: "INT", isPrimaryKey: true },
      { name: "course_id", dataType: "INT", isPrimaryKey: true },
    ]),
    entity("course", 600, 0, "courses", [
      { name: "id", dataType: "INT", isPrimaryKey: true },
      { name: "title", dataType: "VARCHAR(160)", isPrimaryKey: false },
    ]),
  ],
  edges: [
    {
      id: "student-enrollment",
      type: "crowsFoot",
      source: "student",
      target: "enrollment",
      data: {
        sourceCardinality: "one",
        targetCardinality: "many",
        bendPoints: [],
      },
    },
    {
      id: "course-enrollment",
      type: "crowsFoot",
      source: "course",
      target: "enrollment",
      data: {
        sourceCardinality: "one",
        targetCardinality: "many",
        bendPoints: [],
      },
    },
  ],
};

export const erdGuideSamples: readonly GuideSample[] = [
  {
    label: "One-to-many",
    description: 'Two entities, a single "many" relationship',
    code: JSON.stringify(oneToMany),
  },
  {
    label: "Many-to-many with a join table",
    description: 'The standard pattern for pairing two "many" entities',
    code: JSON.stringify(manyToManyWithJoinTable),
  },
];

export function createSeedDiagram(): DiagramSampleContent {
  return {
    nodes: oneToMany.nodes.map((n) => ({ ...n, id: randomId() })),
    edges: [],
  };
}

// Re-IDs every node/edge and offsets positions so a repeated insert never
// collides with existing content or stacks exactly on top of it.
export function parseDiagramSample(
  code: string,
  offset: { x: number; y: number },
): DiagramSampleContent | null {
  try {
    const parsed = JSON.parse(code) as DiagramSampleContent;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges))
      return null;
    const idMap = new Map<string, string>();
    const nodes = parsed.nodes.map((node) => {
      const id = randomId();
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
      };
    });
    const edges = parsed.edges.flatMap((edge) => {
      const source = idMap.get(edge.source);
      const target = idMap.get(edge.target);
      if (!source || !target) return [];
      return [{ ...edge, id: randomId(), source, target }];
    });
    return { nodes, edges };
  } catch {
    return null;
  }
}
