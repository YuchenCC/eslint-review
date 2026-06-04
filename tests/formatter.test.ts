import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildEslintSummary, DEFAULT_FORMATTER_LIMITS, formatter } from "../src/lint/summaryFormatter.js";

describe("eslint summary formatter", () => {
  test("aggregates lint totals, top rules, top files, and bounded evidence", () => {
    const summary = buildEslintSummary(
      [
        {
          filePath: "/repo/src/a.ts",
          errorCount: 2,
          warningCount: 1,
          fixableErrorCount: 1,
          fixableWarningCount: 0,
          messages: [
            {
              ruleId: "no-unused-vars",
              severity: 2,
              line: 10,
              column: 5,
              message: "'value' is assigned a value but never used.",
              fix: { range: [1, 2], text: "" },
              suggestions: [{ desc: "remove" }],
              source: "const value = 1;",
              range: [0, 14],
              nodeType: "Identifier",
              messageId: "unusedVar",
              endLine: 10,
              endColumn: 19
            },
            {
              ruleId: "eqeqeq",
              severity: 2,
              line: 11,
              column: 8,
              message: "Expected '===' and instead saw '=='."
            },
            {
              ruleId: "no-console",
              severity: 1,
              line: 12,
              column: 1,
              message: "Unexpected console statement."
            }
          ]
        },
        {
          filePath: "/repo/src/b.ts",
          errorCount: 1,
          warningCount: 0,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          messages: [
            {
              ruleId: "no-unused-vars",
              severity: 2,
              line: 4,
              column: 3,
              message: "unused ".repeat(80)
            }
          ]
        }
      ],
      { cwd: "/repo" }
    );

    expect(summary.lintResult).toMatchObject({
      status: "success",
      errorCount: 3,
      warningCount: 1,
      fixableErrorCount: 1,
      fixableWarningCount: 0,
      fileCount: 2,
      problemFileCount: 2
    });
    expect(summary.ruleSummary).toEqual([
      { ruleId: "no-unused-vars", severity: "error", count: 2, fixableCount: 1 },
      { ruleId: "eqeqeq", severity: "error", count: 1, fixableCount: 0 },
      { ruleId: "no-console", severity: "warning", count: 1, fixableCount: 0 }
    ]);
    expect(summary.fileSummary).toEqual([
      { filePath: "src/a.ts", errorCount: 2, warningCount: 1, disableCount: 0 },
      { filePath: "src/b.ts", errorCount: 1, warningCount: 0, disableCount: 0 }
    ]);
    expect(summary.evidence.topRuleExamples[0]).toMatchObject({
      ruleId: "no-unused-vars",
      severity: "error",
      filePath: "src/a.ts",
      line: 10,
      column: 5
    });
    expect(JSON.stringify(summary)).not.toContain("source");
    expect(JSON.stringify(summary)).not.toContain("suggestions");
    expect(JSON.stringify(summary)).not.toContain("range");
    expect(JSON.stringify(summary)).not.toContain("nodeType");
    expect(JSON.stringify(summary)).not.toContain("messageId");
    expect(JSON.stringify(summary)).not.toContain("endLine");
    expect(JSON.stringify(summary)).not.toContain("endColumn");
    expect(summary.evidence.topRuleExamples[1].message.length).toBeLessThanOrEqual(200);
    expect(summary.limits).toEqual(DEFAULT_FORMATTER_LIMITS);
  });

  test("enforces top item and evidence limits", () => {
    const results = Array.from({ length: 3 }, (_, fileIndex) => ({
      filePath: `/repo/src/file-${fileIndex}.ts`,
      errorCount: 10,
      warningCount: 0,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      messages: Array.from({ length: 10 }, (_, messageIndex) => ({
        ruleId: `rule-${messageIndex}`,
        severity: 2,
        line: messageIndex + 1,
        column: 1,
        message: `message-${fileIndex}-${messageIndex}`.repeat(4)
      }))
    }));

    const summary = buildEslintSummary(results, {
      cwd: "/repo",
      limits: {
        maxRules: 5,
        maxFiles: 2,
        maxExamplesPerRule: 1,
        maxExamplesPerFile: 2,
        maxMessageLength: 20
      }
    });

    expect(summary.ruleSummary).toHaveLength(5);
    expect(summary.fileSummary).toHaveLength(2);
    expect(summary.evidence.topRuleExamples).toHaveLength(5);
    expect(summary.evidence.topFileExamples).toHaveLength(2);
    expect(summary.evidence.topFileExamples.every((file) => file.examples.length === 2)).toBe(true);
    expect(summary.evidence.topRuleExamples.every((example) => example.message.length <= 20)).toBe(true);
    expect(summary.limits).toEqual({
      maxRules: 5,
      maxFiles: 2,
      maxExamplesPerRule: 1,
      maxExamplesPerFile: 2,
      maxMessageLength: 20
    });
  });

  test("uses fatal and unknown defaults, slash-normalizes relative paths, and emits pretty json", () => {
    const cwd = path.join("/", "repo", "project");
    const filePath = path.join(cwd, "src", "nested", "file.ts");
    const summary = buildEslintSummary(
      [
        {
          filePath,
          errorCount: 0,
          warningCount: 1,
          messages: [
            {
              ruleId: null,
              severity: 0,
              line: 1,
              column: 2,
              message: "Parsing failed"
            }
          ]
        }
      ],
      { cwd }
    );

    expect(summary.ruleSummary).toEqual([{ ruleId: "fatal", severity: "unknown", count: 1, fixableCount: 0 }]);
    expect(summary.fileSummary[0].filePath).toBe("src/nested/file.ts");

    const formatted = formatter([{ filePath: "/repo/src/a.ts", messages: [] }]);
    expect(formatted).toMatch(/\n}\n$/);
    expect(formatted.endsWith("\n")).toBe(true);
    expect(JSON.parse(formatted)).toMatchObject({ schemaVersion: "0.1.0" });
  });

  test("promotes rule severity to error and preserves relative file paths when cwd is absolute", () => {
    const summary = buildEslintSummary(
      [
        {
          filePath: "src\\relative.ts",
          errorCount: 1,
          warningCount: 1,
          messages: [
            {
              ruleId: "mixed-severity",
              severity: 1,
              line: 1,
              column: 1,
              message: "warning first"
            },
            {
              ruleId: "mixed-severity",
              severity: 2,
              line: 2,
              column: 1,
              message: "error later"
            }
          ]
        }
      ],
      { cwd: "/repo" }
    );

    expect(summary.ruleSummary).toEqual([{ ruleId: "mixed-severity", severity: "error", count: 2, fixableCount: 0 }]);
    expect(summary.fileSummary[0].filePath).toBe("src/relative.ts");
  });
});
