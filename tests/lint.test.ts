import { describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { executeLint } from "../src/lint/execute.js";
import { parseEslintSummary } from "../src/lint/parse.js";
import { buildInstallCommand, diagnoseMissingDependency } from "../src/lint/recovery.js";
import type { EslintAccess } from "../src/types.js";

describe("lint execution", () => {
  test("skips execution when ESLint is not connected", async () => {
    const eslintAccess: EslintAccess = {
      accessLevel: "not_connected",
      eslintDependencyDetected: false,
      eslintPackages: [],
      eslintConfigDetected: false,
      configFiles: [],
      packageJsonEslintConfigDetected: false,
      lintScriptDetected: false,
      lintScripts: {}
    };

    await expect(
      executeLint({
        cwd: "fixtures/no-package",
        outputDirectory: ".eslint-checker",
        timeoutSeconds: 1,
        eslintAccess
      })
    ).resolves.toMatchObject({
      status: "skipped",
      command: "",
      exitCode: null,
      skippedReason: "eslint_not_connected"
    });
  });

  test.each([
    ["Cannot find module '@typescript-eslint/parser'", ["@typescript-eslint/parser"]],
    ["ESLint couldn't find the plugin \"eslint-plugin-vue\".", ["eslint-plugin-vue"]],
    ["ESLint couldn't find the plugin \"react\".", ["eslint-plugin-react"]],
    ["ESLint couldn't find the config \"standard\" to extend from.", ["eslint-config-standard"]]
  ])("diagnoses installable dependency from %s", (message, expectedPackages) => {
    expect(diagnoseMissingDependency(message)).toEqual(expectedPackages);
  });

  test("builds package-manager specific install command", () => {
    expect(buildInstallCommand("pnpm", ["eslint-plugin-vue"])).toEqual({
      command: "pnpm",
      args: ["add", "-D", "eslint-plugin-vue"],
      text: "pnpm add -D eslint-plugin-vue"
    });
  });

  test("parses ESLint summary into lint, file, rule, and evidence summaries", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-summary-"));
    const summaryPath = path.join(tempDirectory, "eslint-summary.json");
    await writeFile(
      summaryPath,
      JSON.stringify({
        schemaVersion: "0.1.0",
        generatedAt: "2026-06-04T00:00:00.000Z",
        lintResult: {
          status: "success",
          fileCount: 2,
          problemFileCount: 2,
          errorCount: 2,
          warningCount: 1,
          fixableErrorCount: 1,
          fixableWarningCount: 1
        },
        ruleSummary: [
          { ruleId: "no-unused-vars", severity: "error", count: 2, fixableCount: 1 },
          { ruleId: "no-console", severity: "warning", count: 1, fixableCount: 1 }
        ],
        fileSummary: [
          { filePath: "src/a.ts", errorCount: 1, warningCount: 1, disableCount: 0 },
          { filePath: "src/b.ts", errorCount: 1, warningCount: 0, disableCount: 0 }
        ],
        evidence: {
          topRuleExamples: [
            {
              ruleId: "no-unused-vars",
              severity: "error",
              filePath: "src/a.ts",
              line: 10,
              column: 5,
              message: "'value' is assigned a value but never used."
            }
          ],
          topFileExamples: [
            {
              filePath: "src/a.ts",
              errorCount: 1,
              warningCount: 1,
              examples: [
                {
                  ruleId: "no-unused-vars",
                  severity: "error",
                  filePath: "src/a.ts",
                  line: 10,
                  column: 5,
                  message: "'value' is assigned a value but never used."
                }
              ]
            }
          ]
        },
        limits: {
          maxRules: 20,
          maxFiles: 20,
          maxExamplesPerRule: 3,
          maxExamplesPerFile: 3,
          maxMessageLength: 200
        }
      }),
      "utf8"
    );

    await expect(parseEslintSummary(summaryPath)).resolves.toEqual({
      lintResult: {
        status: "success",
        fileCount: 2,
        problemFileCount: 2,
        errorCount: 2,
        warningCount: 1,
        fixableErrorCount: 1,
        fixableWarningCount: 1
      },
      ruleSummary: [
        { ruleId: "no-unused-vars", severity: "error", count: 2, fixableCount: 1 },
        { ruleId: "no-console", severity: "warning", count: 1, fixableCount: 1 }
      ],
      fileSummary: [
        { filePath: "src/a.ts", errorCount: 1, warningCount: 1, disableCount: 0 },
        { filePath: "src/b.ts", errorCount: 1, warningCount: 0, disableCount: 0 }
      ],
      lintEvidence: {
        topRuleExamples: [
          {
            ruleId: "no-unused-vars",
            severity: "error",
            filePath: "src/a.ts",
            line: 10,
            column: 5,
            message: "'value' is assigned a value but never used."
          }
        ],
        topFileExamples: [
          {
            filePath: "src/a.ts",
            errorCount: 1,
            warningCount: 1,
            examples: [
              {
                ruleId: "no-unused-vars",
                severity: "error",
                filePath: "src/a.ts",
                line: 10,
                column: 5,
                message: "'value' is assigned a value but never used."
              }
            ]
          }
        ]
      }
    });

    await rm(tempDirectory, { recursive: true, force: true });
  });

  test("returns unavailable failure when ESLint summary is missing", async () => {
    await expect(parseEslintSummary("fixtures/lint-success/.eslint-checker/missing-summary.json")).resolves.toEqual({
      lintResult: {
        status: "failed",
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        fileCount: 0,
        problemFileCount: 0,
        failureReason: "eslint_summary_unavailable"
      },
      ruleSummary: [],
      fileSummary: [],
      lintEvidence: {
        topRuleExamples: [],
        topFileExamples: []
      }
    });
  });

  test("returns invalid failure when ESLint summary is malformed", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-summary-invalid-"));
    const summaryPath = path.join(tempDirectory, "eslint-summary.json");
    const invalidJsonPath = path.join(tempDirectory, "invalid-json-summary.json");
    await writeFile(summaryPath, JSON.stringify({ lintResult: {}, ruleSummary: [] }), "utf8");
    await writeFile(invalidJsonPath, "{", "utf8");

    await expect(parseEslintSummary(summaryPath)).resolves.toEqual({
      lintResult: {
        status: "failed",
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        fileCount: 0,
        problemFileCount: 0,
        failureReason: "eslint_summary_invalid"
      },
      ruleSummary: [],
      fileSummary: [],
      lintEvidence: {
        topRuleExamples: [],
        topFileExamples: []
      }
    });
    await expect(parseEslintSummary(invalidJsonPath)).resolves.toMatchObject({
      lintResult: {
        status: "failed",
        failureReason: "eslint_summary_invalid",
        problemFileCount: 0
      },
      ruleSummary: [],
      fileSummary: [],
      lintEvidence: {
        topRuleExamples: [],
        topFileExamples: []
      }
    });

    await rm(tempDirectory, { recursive: true, force: true });
  });
});
