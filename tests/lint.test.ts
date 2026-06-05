import { beforeEach, describe, expect, test, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { executeLint } from "../src/lint/execute.js";
import { parseEslintSummary } from "../src/lint/parse.js";
import { buildInstallCommand, diagnoseMissingDependency } from "../src/lint/recovery.js";
import type { EslintAccess } from "../src/types.js";
import { runCommand } from "../src/utils/commands.js";

vi.mock("../src/utils/commands.js", () => ({
  runCommand: vi.fn()
}));

const mockedRunCommand = vi.mocked(runCommand);

const connectedEslintAccess: EslintAccess = {
  accessLevel: "connected",
  eslintDependencyDetected: true,
  eslintPackages: ["eslint"],
  eslintConfigDetected: true,
  configFiles: ["eslint.config.js"],
  packageJsonEslintConfigDetected: false,
  lintScriptDetected: true,
  lintScripts: {
    lint: "eslint ."
  }
};

describe("lint execution", () => {
  beforeEach(() => {
    mockedRunCommand.mockReset();
  });

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

  test("runs ESLint with the summary formatter by default", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-execute-summary-"));
    try {
      await mkdir(path.join(tempDirectory, ".eslint-checker"), { recursive: true });
      await writeFile(path.join(tempDirectory, ".eslint-checker", "eslint-summary.json"), "{}", "utf8");
      mockedRunCommand.mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "",
        durationMs: 25,
        timedOut: false
      });

      const logger = memoryLogger();
      await expect(
        executeLint({
          cwd: tempDirectory,
          outputDirectory: ".eslint-checker",
          timeoutSeconds: 10,
          eslintAccess: connectedEslintAccess,
          logger
        })
      ).resolves.toMatchObject({
        status: "success",
        exitCode: 1,
        durationMs: 25
      });

      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      const summaryFormatterPath = mockedRunCommand.mock.calls[0]?.[0].args[3];
      expect(path.isAbsolute(summaryFormatterPath ?? "")).toBe(true);
      expect(normalizePath(summaryFormatterPath ?? "")).toMatch(/\/lint\/summaryFormatter\.js$/);
      expect(mockedRunCommand).toHaveBeenCalledWith({
        cwd: tempDirectory,
        command: "npx",
        args: ["eslint", ".", "-f", summaryFormatterPath, "-o", ".eslint-checker/eslint-summary.json"],
        timeoutMs: 10000
      });
      expect(logger.commands).toHaveLength(1);
      expect(normalizePath(logger.commands[0] ?? "")).toContain("/lint/summaryFormatter.js -o .eslint-checker/eslint-summary.json");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("optionally emits raw ESLint JSON without failing primary execution", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-execute-raw-"));
    try {
      await mkdir(path.join(tempDirectory, ".eslint-checker"), { recursive: true });
      await writeFile(path.join(tempDirectory, ".eslint-checker", "eslint-summary.json"), "{}", "utf8");
      mockedRunCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: "",
          stderr: "",
          durationMs: 30,
          timedOut: false
        })
        .mockResolvedValueOnce({
          exitCode: 2,
          stdout: "",
          stderr: "raw formatter failed",
          durationMs: 10,
          timedOut: false
        });

      const logger = memoryLogger();
      await expect(
        executeLint({
          cwd: tempDirectory,
          outputDirectory: ".eslint-checker",
          timeoutSeconds: 10,
          eslintAccess: connectedEslintAccess,
          rawEslintReport: true,
          logger
        })
      ).resolves.toMatchObject({
        status: "success",
        exitCode: 0,
        durationMs: 30,
        rawEslintReportGenerated: false
      });

      const summaryFormatterPath = mockedRunCommand.mock.calls[0]?.[0].args[3];
      expect(path.isAbsolute(summaryFormatterPath ?? "")).toBe(true);
      expect(normalizePath(summaryFormatterPath ?? "")).toMatch(/\/lint\/summaryFormatter\.js$/);
      expect(mockedRunCommand).toHaveBeenNthCalledWith(2, {
        cwd: tempDirectory,
        command: "npx",
        args: ["eslint", ".", "-f", "json", "-o", ".eslint-checker/eslint-report.json"],
        timeoutMs: 10000
      });
      expect(logger.commands).toHaveLength(2);
      expect(normalizePath(logger.commands[0] ?? "")).toContain("/lint/summaryFormatter.js -o .eslint-checker/eslint-summary.json");
      expect(logger.commands[1]).toBe("npx eslint . -f json -o .eslint-checker/eslint-report.json");
      expect(logger.errors).toEqual(["raw formatter failed"]);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("treats missing summary after ESLint success as a parsing failure", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-execute-missing-summary-"));
    try {
      mockedRunCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 20,
        timedOut: false
      });

      const logger = memoryLogger();
      await expect(
        executeLint({
          cwd: tempDirectory,
          outputDirectory: ".eslint-checker",
          timeoutSeconds: 10,
          eslintAccess: connectedEslintAccess,
          logger
        })
      ).resolves.toMatchObject({
        status: "success",
        exitCode: 0
      });
      await expect(parseEslintSummary(path.join(tempDirectory, ".eslint-checker/eslint-summary.json"))).resolves.toMatchObject({
        lintResult: {
          status: "failed",
          failureReason: "eslint_summary_unavailable"
        }
      });
      expect(logger.errors).toEqual(["ESLint completed but summary output was not generated"]);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
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
    try {
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
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
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
    try {
      const summaryPath = path.join(tempDirectory, "eslint-summary.json");
      const invalidJsonPath = path.join(tempDirectory, "invalid-json-summary.json");
      const invalidRuleSummaryPath = path.join(tempDirectory, "invalid-rule-summary.json");
      await writeFile(summaryPath, JSON.stringify({ lintResult: {}, ruleSummary: [] }), "utf8");
      await writeFile(invalidJsonPath, "{", "utf8");
      await writeFile(
        invalidRuleSummaryPath,
        JSON.stringify({
          lintResult: {
            status: "success",
            errorCount: 0,
            warningCount: 0,
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            fileCount: 1,
            problemFileCount: 0
          },
          ruleSummary: [{ ruleId: "no-alert", severity: "error", count: "1", fixableCount: 0 }],
          fileSummary: [{ filePath: "src/a.ts", errorCount: 0, warningCount: 0, disableCount: 0 }]
        }),
        "utf8"
      );

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
      await expect(parseEslintSummary(invalidRuleSummaryPath)).resolves.toMatchObject({
        lintResult: {
          status: "failed",
          failureReason: "eslint_summary_invalid",
          problemFileCount: 0
        }
      });
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("returns distinct empty evidence objects for failures and evidence fallback", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-summary-empty-evidence-"));
    try {
      const summaryPath = path.join(tempDirectory, "eslint-summary.json");
      await writeFile(
        summaryPath,
        JSON.stringify({
          lintResult: {
            status: "success",
            errorCount: 0,
            warningCount: 0,
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            fileCount: 1,
            problemFileCount: 0
          },
          ruleSummary: [],
          fileSummary: [{ filePath: "src/a.ts", errorCount: 0, warningCount: 0, disableCount: 0 }]
        }),
        "utf8"
      );

      const missing = await parseEslintSummary(path.join(tempDirectory, "missing.json"));
      const validWithoutEvidence = await parseEslintSummary(summaryPath);
      missing.lintEvidence.topRuleExamples.push({
        ruleId: "mutated",
        severity: "error",
        filePath: "src/a.ts",
        line: 1,
        column: 1,
        message: "mutated"
      });

      expect(validWithoutEvidence.lintEvidence).toEqual({
        topRuleExamples: [],
        topFileExamples: []
      });
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});

function memoryLogger() {
  const infos: string[] = [];
  const errors: string[] = [];
  const commands: string[] = [];
  return {
    infos,
    errors,
    commands,
    info: (message: string) => infos.push(message),
    error: (message: string) => errors.push(message),
    command: (message: string) => commands.push(message),
    toText: () => ""
  };
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}
