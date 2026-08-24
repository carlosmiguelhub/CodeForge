import type { GuideSample } from "./guide-modal";

export const sqlGuideSections = [
  {
    title: "Your private MySQL workspace",
    body: "This is a real MySQL database isolated to your account. You can create tables, add or change rows, test joins, and make mistakes without affecting another student or CodeForge's platform database.",
  },
  {
    title: "A good first workflow",
    body: "Start by creating one or two related tables, insert a few sample rows, and then practice SELECT, WHERE, ORDER BY, GROUP BY, and JOIN. Run one small step at a time and inspect the Results or Messages panel before continuing.",
  },
  {
    title: "Running exactly what you intend",
    body: 'Click "Run" or press Ctrl/Cmd + Enter. With no selection, CodeForge runs the SQL statement containing your cursor; when text is highlighted, it runs only that selection. This lets you keep several practice statements in one editor tab safely.',
  },
  {
    title: "Reading the results",
    body: "Results shows returned rows and columns, Messages explains successful statements or errors, and History keeps recent executions. When a query fails, use the error message and reported SQL location to fix only the affected statement.",
  },
  {
    title: "Schema explorer and ERD",
    body: 'The left panel lists tables, columns, keys, and data types. Insert SQL adds a starter SELECT without executing it. Refresh after schema changes, or choose "Generate ERD" to create an editable diagram from the current tables and relationships.',
  },
  {
    title: "Saving useful queries",
    body: "Use Save query for statements you want to revisit, such as reports, joins, or exercises. Saved Queries can reopen them in the SQL editor, while editor tabs are better suited to temporary experiments during the current task.",
  },
  {
    title: "Safety, limits, and recovery",
    body: "DROP, DELETE, TRUNCATE, and other destructive statements require confirmation. Execution uses autocommit, stops after 10 seconds, and returns at most 1,000 rows. If you want to start over completely, use the workspace reset controls rather than manually deleting objects one by one.",
  },
] as const;

export const sqlGuideSamples: readonly GuideSample[] = [
  {
    label: "Create a table",
    description: "Define a table with a primary key",
    code: "CREATE TABLE students (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  name VARCHAR(100) NOT NULL,\n  grade INT\n);",
  },
  {
    label: "Insert rows",
    description: "Add sample data to query against",
    code: "INSERT INTO students (name, grade) VALUES\n  ('Ada', 95),\n  ('Grace', 88),\n  ('Alan', 72);",
  },
  {
    label: "Filter with WHERE",
    description: "Select rows matching a condition",
    code: "SELECT name, grade\nFROM students\nWHERE grade >= 90\nORDER BY grade DESC;",
  },
  {
    label: "Aggregate with GROUP BY",
    description: "Count rows per group",
    code: "SELECT\n  CASE WHEN grade >= 90 THEN 'A' WHEN grade >= 80 THEN 'B' ELSE 'C' END AS band,\n  COUNT(*) AS students\nFROM students\nGROUP BY band;",
  },
  {
    label: "Join two tables",
    description: "Combine related data across tables",
    code: "CREATE TABLE enrollments (\n  student_id INT,\n  course VARCHAR(50),\n  FOREIGN KEY (student_id) REFERENCES students(id)\n);\n\nSELECT s.name, e.course\nFROM students s\nJOIN enrollments e ON e.student_id = s.id;",
  },
];
