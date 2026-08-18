import corpus from "../corpus/mysql-foundation.json";
import { describe, expect, it } from "vitest";

import { corpusSchema, MySqlParserClassifier } from "./index";

describe("MySQL security corpus", () => {
  const parsed = corpusSchema.parse(corpus);

  it("has unique case identifiers", () => {
    const ids = parsed.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains both allowed and denied examples", () => {
    expect(
      parsed.some((testCase) => testCase.expectedDecision === "allow"),
    ).toBe(true);
    expect(
      parsed.some((testCase) => testCase.expectedDecision === "deny"),
    ).toBe(true);
  });

  it("covers every high-risk foundation category", () => {
    const categories = new Set(parsed.map((testCase) => testCase.category));

    const requiredCategories = [
      "cross_schema",
      "account_admin",
      "server_admin",
      "file_access",
      "persistent_code",
      "parser_evasion",
    ] as const;

    for (const category of requiredCategories) {
      expect(categories.has(category)).toBe(true);
    }
  });

  it("enforces the complete parser-backed decision corpus", () => {
    const classifier = new MySqlParserClassifier();
    for (const testCase of parsed) {
      expect(
        classifier.classify(testCase.sql, {
          policyVersion: "mvp-1",
          allowedStatementClasses: [
            "read",
            "write",
            "ddl",
            "transaction",
            "metadata",
            "explain",
          ],
          defaultDatabaseAlias: "workspace",
        }).decision,
        testCase.id,
      ).toBe(testCase.expectedDecision);
    }
  });
});
