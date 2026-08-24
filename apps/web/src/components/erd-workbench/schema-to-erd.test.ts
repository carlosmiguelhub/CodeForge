import type { WorkspaceSchemaResponse } from "@sqweb/contracts";
import { describe, expect, it } from "vitest";

import { schemaToErdContent } from "./schema-to-erd";
import type { EntityNodeType, ErdNode, PersistedErdDiagram } from "./types";

function findEntity(nodes: readonly ErdNode[], name: string): EntityNodeType {
  const node = nodes.find(
    (candidate): candidate is EntityNodeType =>
      candidate.data.kind === "entity" && candidate.data.name === name,
  );
  if (!node) throw new Error(`Entity node "${name}" was not generated.`);
  return node;
}

// authors (1) --- (0..many) books, via a plain, required, non-unique FK.
// authors (1) --- (0..many) books, via a plain, nullable, non-unique FK
//   (books.editor_id).
// authors (1) --- (0..1) author_profiles, via a required FK that is ALSO
//   the profile's primary key — the standard MySQL "shared PK" 1:1 pattern.
const schema: WorkspaceSchemaResponse = {
  tables: [
    {
      name: "authors",
      type: "table",
      columns: [
        {
          name: "id",
          dataType: "int",
          nullable: false,
          key: "PRI",
          references: null,
        },
        {
          name: "name",
          dataType: "varchar",
          nullable: false,
          key: "",
          references: null,
        },
      ],
    },
    {
      name: "books",
      type: "table",
      columns: [
        {
          name: "id",
          dataType: "int",
          nullable: false,
          key: "PRI",
          references: null,
        },
        {
          name: "author_id",
          dataType: "int",
          nullable: false,
          key: "MUL",
          references: { table: "authors", column: "id" },
        },
        {
          name: "editor_id",
          dataType: "int",
          nullable: true,
          key: "MUL",
          references: { table: "authors", column: "id" },
        },
      ],
    },
    {
      name: "author_profiles",
      type: "table",
      columns: [
        {
          name: "author_id",
          dataType: "int",
          nullable: false,
          key: "PRI",
          references: { table: "authors", column: "id" },
        },
        {
          name: "bio",
          dataType: "text",
          nullable: true,
          key: "",
          references: null,
        },
      ],
    },
    {
      name: "author_summary",
      type: "view",
      columns: [
        {
          name: "author_id",
          dataType: "int",
          nullable: false,
          key: "",
          references: null,
        },
      ],
    },
  ],
};

describe("schemaToErdContent", () => {
  it("creates one entity per table, skipping views", () => {
    const content = schemaToErdContent(schema);
    expect(content.nodes).toHaveLength(3);
    const names = content.nodes.map((node) =>
      node.data.kind === "entity" ? node.data.name : null,
    );
    expect(names).toEqual(["authors", "books", "author_profiles"]);
  });

  it("marks primary key columns from the schema's PRI key flag", () => {
    const content = schemaToErdContent(schema);
    const authors = findEntity(content.nodes, "authors");
    expect(
      authors.data.attributes.map((a) => [a.name, a.isPrimaryKey]),
    ).toEqual([
      ["id", true],
      ["name", false],
    ]);
  });

  it("orients every FK edge from the referenced (parent) table to the owning (child) table", () => {
    const content = schemaToErdContent(schema);
    const authors = findEntity(content.nodes, "authors");
    expect(content.edges).toHaveLength(3);
    for (const edge of content.edges) expect(edge.source).toBe(authors.id);
  });

  it("marks the parent side exactly-one for a required FK, zero-or-one for a nullable FK", () => {
    const content = schemaToErdContent(schema);
    const books = findEntity(content.nodes, "books");
    const bookEdges = content.edges.filter((edge) => edge.target === books.id);
    expect(bookEdges).toHaveLength(2);
    // books.author_id is NOT NULL -> "one"; books.editor_id is nullable -> "zero-or-one".
    expect(
      bookEdges.map((edge) => edge.data?.sourceCardinality).sort(),
    ).toEqual(["one", "zero-or-one"]);
  });

  it("marks the child side zero-or-many for a plain FK, since a parent isn't guaranteed any children", () => {
    const content = schemaToErdContent(schema);
    const books = findEntity(content.nodes, "books");
    const bookEdges = content.edges.filter((edge) => edge.target === books.id);
    for (const edge of bookEdges)
      expect(edge.data?.targetCardinality).toBe("zero-or-many");
  });

  it("caps the child side at zero-or-one when the FK column is itself unique/primary (a 1:1 relationship)", () => {
    const content = schemaToErdContent(schema);
    const profiles = findEntity(content.nodes, "author_profiles");
    const edge = content.edges.find((e) => e.target === profiles.id)!;
    expect(edge.data?.targetCardinality).toBe("zero-or-one");
    // author_profiles.author_id is NOT NULL, so the parent side is mandatory.
    expect(edge.data?.sourceCardinality).toBe("one");
  });

  it("lays every entity out on a non-overlapping grid", () => {
    const content = schemaToErdContent(schema);
    const positions = content.nodes.map(
      (node) => `${node.position.x},${node.position.y}`,
    );
    expect(new Set(positions).size).toBe(content.nodes.length);
  });
});

describe("schemaToErdContent layout", () => {
  function column(
    name: string,
    references: { table: string; column: string } | null = null,
    overrides: Partial<{ nullable: boolean; key: string }> = {},
  ) {
    return {
      name,
      dataType: "int",
      nullable: overrides.nullable ?? false,
      key: overrides.key ?? (references ? "MUL" : ""),
      references,
    };
  }

  // departments has no FKs of its own; instructors and students both
  // reference only departments; courses references both departments AND
  // instructors; enrollments references both students AND courses. A
  // naive definition-order grid would place departments directly between
  // courses and enrollments (they're adjacent tables in this list), so the
  // courses<->enrollments line would visibly run past/through departments
  // even though it has nothing to do with that relationship.
  const universitySchema: WorkspaceSchemaResponse = {
    tables: [
      {
        name: "courses",
        type: "table",
        columns: [
          column("course_id"),
          column("course_code"),
          column("course_name"),
          column("units"),
          column("department_id", {
            table: "departments",
            column: "department_id",
          }),
          column("instructor_id", {
            table: "instructors",
            column: "instructor_id",
          }),
        ],
      },
      {
        name: "departments",
        type: "table",
        columns: [
          column("department_id"),
          column("department_name"),
          column("building"),
        ],
      },
      {
        name: "enrollments",
        type: "table",
        columns: [
          column("enrollment_id"),
          column("student_id", { table: "students", column: "student_id" }),
          column("course_id", { table: "courses", column: "course_id" }),
          column("semester"),
          column("school_year"),
          column("grade"),
          column("status"),
          column("enrollment_date"),
        ],
      },
      {
        name: "instructors",
        type: "table",
        columns: [
          column("instructor_id"),
          column("first_name"),
          column("last_name"),
          column("email"),
          column("department_id", {
            table: "departments",
            column: "department_id",
          }),
        ],
      },
      {
        name: "students",
        type: "table",
        columns: [
          column("student_id"),
          column("first_name"),
          column("last_name"),
          column("email"),
          column("year_level"),
          column("department_id", {
            table: "departments",
            column: "department_id",
          }),
        ],
      },
    ],
  };

  it("places each table strictly to the right of everything it references", () => {
    const content = schemaToErdContent(universitySchema);
    const xByName = new Map(
      content.nodes.map((node) => [
        node.data.kind === "entity" ? node.data.name : "",
        node.position.x,
      ]),
    );
    expect(xByName.get("departments")).toBeLessThan(
      xByName.get("instructors")!,
    );
    expect(xByName.get("departments")).toBeLessThan(xByName.get("students")!);
    expect(xByName.get("instructors")).toBeLessThan(xByName.get("courses")!);
    expect(xByName.get("departments")).toBeLessThan(xByName.get("courses")!);
    expect(xByName.get("courses")).toBeLessThan(xByName.get("enrollments")!);
    expect(xByName.get("students")).toBeLessThan(xByName.get("enrollments")!);
  });

  it("puts courses in a column between departments and enrollments", () => {
    // The actual bug this guards: departments and enrollments sitting on
    // opposite sides of courses in the row order, so the courses<->
    // enrollments edge no longer runs parallel past departments.
    const content = schemaToErdContent(universitySchema);
    const xByName = new Map(
      content.nodes.map((node) => [
        node.data.kind === "entity" ? node.data.name : "",
        node.position.x,
      ]),
    );
    expect(xByName.get("departments")).not.toBe(xByName.get("enrollments"));
    expect(xByName.get("courses")).toBeGreaterThan(xByName.get("departments")!);
    expect(xByName.get("courses")).toBeLessThan(xByName.get("enrollments")!);
  });

  it("spaces same-column entities apart vertically, not stacked on each other", () => {
    const content = schemaToErdContent(universitySchema);
    const positions = new Map(
      content.nodes.map((node) => [
        node.data.kind === "entity" ? node.data.name : "",
        node.position,
      ]),
    );
    expect(positions.get("instructors")!.x).toBe(positions.get("students")!.x);
    expect(positions.get("instructors")!.y).not.toBe(
      positions.get("students")!.y,
    );
  });

  function findEdge(
    content: PersistedErdDiagram,
    sourceName: string,
    targetName: string,
  ) {
    const idByName = new Map(
      content.nodes.map((node) => [
        node.data.kind === "entity" ? node.data.name : "",
        node.id,
      ]),
    );
    const edge = content.edges.find(
      (e) =>
        e.source === idByName.get(sourceName) &&
        e.target === idByName.get(targetName),
    );
    if (!edge) throw new Error(`No edge from ${sourceName} to ${targetName}`);
    return edge;
  }

  const entityHeight = (node: EntityNodeType) =>
    29 + 8 + (node.data.attributes.length + 1) * 28;

  it("every generated connection is a series of horizontal/vertical segments, never a bare diagonal", () => {
    const content = schemaToErdContent(universitySchema);
    const positions = new Map(
      content.nodes.map((node) => [node.id, node.position]),
    );
    for (const edge of content.edges) {
      const bendPoints = edge.data?.bendPoints ?? [];
      // A straight line with zero bends is only valid when both ends are
      // already level — checked directly rather than skipped.
      if (bendPoints.length === 0) {
        const sourceY = positions.get(edge.source)!.y;
        const targetY = positions.get(edge.target)!.y;
        expect(sourceY).toBe(targetY);
        continue;
      }
      for (let i = 0; i < bendPoints.length - 1; i++) {
        const a = bendPoints[i]!;
        const b = bendPoints[i + 1]!;
        const isAxisAligned = a.x === b.x || a.y === b.y;
        expect(isAxisAligned).toBe(true);
      }
    }
  });

  it("routes a skip-layer relationship through a gap in the column it skips", () => {
    // departments (column 0) -> courses (column 2) crosses the
    // instructors/students column. It should thread through their gap
    // rather than detouring out past the edge of the whole diagram.
    const content = schemaToErdContent(universitySchema);
    const instructors = content.nodes.find(
      (node) => node.data.kind === "entity" && node.data.name === "instructors",
    )!;
    const students = content.nodes.find(
      (node) => node.data.kind === "entity" && node.data.name === "students",
    )!;
    const columnSpans = [instructors, students]
      .map((node) => ({
        topY: node.position.y,
        bottomY: node.position.y + entityHeight(node as EntityNodeType),
      }))
      .sort((a, b) => a.topY - b.topY);

    const edge = findEdge(content, "departments", "courses");
    const bendPoints = edge.data?.bendPoints ?? [];
    expect(bendPoints).toHaveLength(6);
    const corridorY = bendPoints[2]!.y;
    expect(corridorY).toBe(bendPoints[3]!.y);
    // The corridor must not fall inside either instructors' or students'
    // own horizontal span — it has to actually be in the gap.
    for (const span of columnSpans) {
      const insideSpan = corridorY > span.topY && corridorY < span.bottomY;
      expect(insideSpan).toBe(false);
    }
    // With a real gap between instructors and students (COLUMN_GAP=60,
    // comfortably over the 40px minimum), the corridor should be that
    // gap — a short local detour — not a jog out past the whole diagram.
    expect(corridorY).toBeGreaterThan(columnSpans[0]!.topY);
    expect(corridorY).toBeLessThan(columnSpans[1]!.bottomY);
  });

  it("routes an adjacent-layer relationship as a right-angle step", () => {
    const content = schemaToErdContent(universitySchema);
    const edge = findEdge(content, "departments", "instructors");
    const bendPoints = edge.data?.bendPoints ?? [];
    expect(bendPoints.length === 2 || bendPoints.length === 4).toBe(true);
    for (const point of bendPoints) expect(point.x).toBeGreaterThanOrEqual(0);
  });

  it("gives every connection leaving the same table its own exit point instead of a shared center", () => {
    // The actual bug from the last round: departments has three outgoing
    // relationships (to instructors, students, and courses), and they all
    // converged on the exact same exit point, making the lines visually
    // merge right at departments' own border.
    const content = schemaToErdContent(universitySchema);
    const departmentsId = content.nodes.find(
      (node) => node.data.kind === "entity" && node.data.name === "departments",
    )!.id;
    const outgoing = content.edges.filter(
      (edge) => edge.source === departmentsId,
    );
    expect(outgoing.length).toBeGreaterThan(1);
    const exitPoints = outgoing.map(
      (edge) => `${edge.data!.bendPoints[0]!.x},${edge.data!.bendPoints[0]!.y}`,
    );
    expect(new Set(exitPoints).size).toBe(exitPoints.length);
  });

  it("gives every connection entering the same table its own entry point instead of a shared center", () => {
    // courses has two incoming relationships (from departments and
    // instructors) — same failure mode as above, on the entry side.
    const content = schemaToErdContent(universitySchema);
    const coursesId = content.nodes.find(
      (node) => node.data.kind === "entity" && node.data.name === "courses",
    )!.id;
    const incoming = content.edges.filter((edge) => edge.target === coursesId);
    expect(incoming.length).toBeGreaterThan(1);
    const entryPoints = incoming.map((edge) => {
      const points = edge.data!.bendPoints;
      const last = points[points.length - 1]!;
      return `${last.x},${last.y}`;
    });
    expect(new Set(entryPoints).size).toBe(entryPoints.length);
  });

  it("centres a parent vertically beside its child column", () => {
    const content = schemaToErdContent(universitySchema);
    const departments = findEntity(content.nodes, "departments");
    const instructors = findEntity(content.nodes, "instructors");
    const students = findEntity(content.nodes, "students");
    const columnTop = Math.min(instructors.position.y, students.position.y);
    const columnBottom = Math.max(
      instructors.position.y + entityHeight(instructors),
      students.position.y + entityHeight(students),
    );
    const departmentCenter =
      departments.position.y + entityHeight(departments) / 2;
    expect(
      Math.abs(departmentCenter - (columnTop + columnBottom) / 2),
    ).toBeLessThanOrEqual(10);
  });

  it("places singleton child rows near their parents instead of blindly centring them", () => {
    const content = schemaToErdContent(universitySchema);
    const instructors = findEntity(content.nodes, "instructors");
    const students = findEntity(content.nodes, "students");
    const courses = findEntity(content.nodes, "courses");
    const enrollments = findEntity(content.nodes, "enrollments");
    const center = (node: EntityNodeType) =>
      node.position.y + entityHeight(node) / 2;

    expect(Math.abs(center(courses) - center(instructors))).toBeLessThan(
      Math.abs(center(courses) - center(students)),
    );
    expect(center(enrollments)).toBeGreaterThan(center(courses));
    expect(center(enrollments)).toBeLessThan(center(students));
  });

  it("keeps the students-to-enrollments detour local to the courses table", () => {
    const content = schemaToErdContent(universitySchema);
    const students = findEntity(content.nodes, "students");
    const courses = findEntity(content.nodes, "courses");
    const edge = findEdge(content, "students", "enrollments");
    const points = edge.data!.bendPoints;
    const exitY = points[0]!.y;
    const corridorY = points[2]!.y;

    expect(exitY).toBeGreaterThan(students.position.y);
    expect(exitY).toBeLessThan(students.position.y + entityHeight(students));
    expect(corridorY).toBeGreaterThan(
      courses.position.y + entityHeight(courses),
    );
    expect(Math.abs(corridorY - exitY)).toBeLessThan(60);
  });

  it("pins generated edges to the source's right side and target's left side", () => {
    const content = schemaToErdContent(universitySchema);
    const instructors = findEntity(content.nodes, "instructors");
    const edge = findEdge(content, "instructors", "courses");
    const courses = findEntity(content.nodes, "courses");
    expect(edge.data!.bendPoints[0]!.x).toBe(instructors.position.x + 224);
    expect(edge.data!.bendPoints.at(-1)!.x).toBe(courses.position.x);
  });

  it("reserves visible line space for notation beside both table borders", () => {
    const content = schemaToErdContent(universitySchema);
    for (const edge of content.edges) {
      const points = edge.data!.bendPoints;
      const firstLength = Math.hypot(
        points[1]!.x - points[0]!.x,
        points[1]!.y - points[0]!.y,
      );
      const lastLength = Math.hypot(
        points.at(-1)!.x - points.at(-2)!.x,
        points.at(-1)!.y - points.at(-2)!.y,
      );
      expect(firstLength).toBeGreaterThan(32);
      expect(lastLength).toBeGreaterThan(32);
    }
  });

  it("assigns a parent's ports in the same top-to-bottom order as its children", () => {
    const content = schemaToErdContent(universitySchema);
    const departments = findEntity(content.nodes, "departments");
    const outgoing = content.edges
      .filter((edge) => edge.source === departments.id)
      .map((edge) => {
        const target = content.nodes.find((node) => node.id === edge.target)!;
        return {
          targetY:
            target.position.y + entityHeight(target as EntityNodeType) / 2,
          exitY: edge.data!.bendPoints[0]!.y,
        };
      })
      .sort((a, b) => a.targetY - b.targetY);
    expect(outgoing.map((connection) => connection.exitY)).toEqual(
      [...outgoing].map((connection) => connection.exitY).sort((a, b) => a - b),
    );
  });

  it("does not route a connector through an unrelated entity", () => {
    const content = schemaToErdContent(universitySchema);
    for (const edge of content.edges) {
      const points = edge.data!.bendPoints;
      for (const node of content.nodes) {
        if (node.id === edge.source || node.id === edge.target) continue;
        const entity = node as EntityNodeType;
        const left = entity.position.x;
        const right = left + 224;
        const top = entity.position.y;
        const bottom = top + entityHeight(entity);
        for (let index = 0; index < points.length - 1; index++) {
          const a = points[index]!;
          const b = points[index + 1]!;
          const crossesInterior =
            a.x === b.x
              ? a.x > left &&
                a.x < right &&
                Math.max(a.y, b.y) > top &&
                Math.min(a.y, b.y) < bottom
              : a.y > top &&
                a.y < bottom &&
                Math.max(a.x, b.x) > left &&
                Math.min(a.x, b.x) < right;
          expect(crossesInterior).toBe(false);
        }
      }
    }
  });

  it("keeps the sample schema's connectors from crossing or sharing segments", () => {
    const content = schemaToErdContent(universitySchema);
    type Point = { x: number; y: number };
    const between = (value: number, a: number, b: number) =>
      value >= Math.min(a, b) && value <= Math.max(a, b);
    const segmentsIntersect = (a: Point, b: Point, c: Point, d: Point) => {
      const firstVertical = a.x === b.x;
      const secondVertical = c.x === d.x;
      if (firstVertical !== secondVertical) {
        const verticalA = firstVertical ? a : c;
        const verticalB = firstVertical ? b : d;
        const horizontalA = firstVertical ? c : a;
        const horizontalB = firstVertical ? d : b;
        return (
          between(verticalA.x, horizontalA.x, horizontalB.x) &&
          between(horizontalA.y, verticalA.y, verticalB.y)
        );
      }
      if (firstVertical) {
        return (
          a.x === c.x &&
          Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
            Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
        );
      }
      return (
        a.y === c.y &&
        Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
          Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
      );
    };

    for (let first = 0; first < content.edges.length; first++) {
      const firstPoints = content.edges[first]!.data!.bendPoints;
      for (let second = first + 1; second < content.edges.length; second++) {
        const secondPoints = content.edges[second]!.data!.bendPoints;
        for (let a = 0; a < firstPoints.length - 1; a++) {
          for (let b = 0; b < secondPoints.length - 1; b++) {
            expect(
              segmentsIntersect(
                firstPoints[a]!,
                firstPoints[a + 1]!,
                secondPoints[b]!,
                secondPoints[b + 1]!,
              ),
            ).toBe(false);
          }
        }
      }
    }
  });
});
