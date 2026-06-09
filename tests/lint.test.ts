import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { executeLint } from "../src/lint/execute.js";
import { parseEslintSummary } from "../src/lint/parse.js";
import {
  buildDependencyRestoreCommand,
  buildInstallCommand,
  diagnoseMissingDependency,
  recoverAndRetry
} from "../src/lint/recovery.js";
import type { EslintAccess, SourceEntries } from "../src/types.js";
import { runCommand } from "../src/utils/commands.js";

vi.mock("../src/utils/commands.js", () => ({
  runCommand: vi.fn()
}));

const mockedRunCommand = vi.mocked(runCommand);
const require = createRequire(import.meta.url);

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

const sourceEntries: SourceEntries = {
  entries: ["src"],
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    ".eslint-checker/**",
    "public/**",
    "**/public/**",
    "**/*.min.js"
  ]
};

const sourceIgnoreArgs = [
  "--ignore-pattern",
  "**/node_modules/**",
  "--ignore-pattern",
  "**/dist/**",
  "--ignore-pattern",
  "**/build/**",
  "--ignore-pattern",
  ".eslint-checker/**",
  "--ignore-pattern",
  "public/**",
  "--ignore-pattern",
  "**/public/**",
  "--ignore-pattern",
  "**/*.min.js"
];

const quietNpmEnv = {
  NPM_CONFIG_LOGLEVEL: "error",
  npm_config_loglevel: "error"
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
        eslintAccess,
        sourceEntries
      })
    ).resolves.toMatchObject({
      status: "skipped",
      command: "",
      exitCode: null,
      skippedReason: "eslint_not_connected"
    });
  });

  test("skips execution when no source entries are discovered", async () => {
    await expect(
      executeLint({
        cwd: "fixtures/no-package",
        outputDirectory: ".eslint-checker",
        timeoutSeconds: 1,
        eslintAccess: connectedEslintAccess,
        sourceEntries: { ...sourceEntries, entries: [] }
      })
    ).resolves.toMatchObject({
      status: "skipped",
      command: "",
      exitCode: null,
      skippedReason: "no_source_entries"
    });
    expect(mockedRunCommand).not.toHaveBeenCalled();
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
          sourceEntries,
          logger
        })
      ).resolves.toMatchObject({
        status: "success",
        exitCode: 1,
        durationMs: 25
      });

      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      const summaryFormatterPath = getFormatterPathFromFirstRun();
      expect(summaryFormatterPath).toBe(".eslint-checker/summaryFormatter.cjs");
      expect(mockedRunCommand).toHaveBeenCalledWith({
        cwd: tempDirectory,
        command: "npx",
        args: [
          "--loglevel=error",
          "eslint",
          "src",
          ...sourceIgnoreArgs,
          "-f",
          summaryFormatterPath,
          "-o",
          path.join(".eslint-checker", "eslint-summary.json")
        ],
        env: quietNpmEnv,
        streamOutput: true,
        timeoutMs: 10000
      });
      expect(logger.commands).toHaveLength(1);
      expect(normalizePath(logger.commands[0] ?? "")).toContain("-f .eslint-checker/summaryFormatter.cjs -o .eslint-checker/eslint-summary.json");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("runs npx eslint with npm warnings disabled", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-execute-quiet-npm-"));
    try {
      await mkdir(path.join(tempDirectory, ".eslint-checker"), { recursive: true });
      await writeFile(path.join(tempDirectory, ".eslint-checker", "eslint-summary.json"), "{}", "utf8");
      mockedRunCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 25,
        timedOut: false
      });

      await executeLint({
        cwd: tempDirectory,
        outputDirectory: ".eslint-checker",
        timeoutSeconds: 10,
        eslintAccess: connectedEslintAccess,
        sourceEntries
      });

      expect(mockedRunCommand).toHaveBeenCalledWith(expect.objectContaining({ env: quietNpmEnv }));
      expect(mockedRunCommand.mock.calls[0]?.[0].args.slice(0, 2)).toEqual(["--loglevel=error", "eslint"]);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("passes a project-relative formatter path for Windows-compatible ESLint loading", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-execute-relative-formatter-"));
    try {
      await mkdir(path.join(tempDirectory, ".eslint-checker"), { recursive: true });
      await writeFile(path.join(tempDirectory, ".eslint-checker", "eslint-summary.json"), "{}", "utf8");
      mockedRunCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 25,
        timedOut: false
      });

      await executeLint({
        cwd: tempDirectory,
        outputDirectory: ".eslint-checker",
        timeoutSeconds: 10,
        eslintAccess: connectedEslintAccess,
        sourceEntries
      });

      expect(getFormatterPathFromFirstRun()).toBe(".eslint-checker/summaryFormatter.cjs");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("passes ESLint a CommonJS-loadable summary formatter for ESLint 6", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-execute-cjs-formatter-"));
    try {
      await mkdir(path.join(tempDirectory, ".eslint-checker"), { recursive: true });
      await writeFile(path.join(tempDirectory, ".eslint-checker", "eslint-summary.json"), "{}", "utf8");
      mockedRunCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 25,
        timedOut: false
      });

      await executeLint({
        cwd: tempDirectory,
        outputDirectory: ".eslint-checker",
        timeoutSeconds: 10,
        eslintAccess: connectedEslintAccess,
        sourceEntries
      });

      const summaryFormatterPath = getFormatterPathFromFirstRun();
      expect(summaryFormatterPath).toBe(".eslint-checker/summaryFormatter.cjs");

      const formatter = require(path.join(tempDirectory, summaryFormatterPath ?? ""));
      const formatted = formatter([
        {
          filePath: path.join(tempDirectory, "src", "a.js"),
          errorCount: 1,
          warningCount: 0,
          messages: [
            {
              ruleId: "no-unused-vars",
              severity: 2,
              line: 1,
              column: 7,
              message: "'value' is assigned a value but never used."
            }
          ]
        }
      ]);

      expect(JSON.parse(formatted)).toMatchObject({
        lintResult: {
          status: "success",
          errorCount: 1,
          warningCount: 0
        },
        ruleSummary: [{ ruleId: "no-unused-vars", severity: "error", count: 1, fixableCount: 0 }]
      });
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
          sourceEntries,
          rawEslintReport: true,
          logger
        })
      ).resolves.toMatchObject({
        status: "success",
        exitCode: 0,
        durationMs: 30,
        rawEslintReportGenerated: false
      });

      const summaryFormatterPath = getFormatterPathFromFirstRun();
      expect(summaryFormatterPath).toBe(".eslint-checker/summaryFormatter.cjs");
      expect(mockedRunCommand).toHaveBeenNthCalledWith(2, {
        cwd: tempDirectory,
        command: "npx",
        args: [
          "--loglevel=error",
          "eslint",
          "src",
          ...sourceIgnoreArgs,
          "-f",
          "json",
          "-o",
          path.join(".eslint-checker", "eslint-report.json")
        ],
        env: quietNpmEnv,
        streamOutput: true,
        timeoutMs: 10000
      });
      expect(logger.commands).toHaveLength(2);
      expect(normalizePath(logger.commands[0] ?? "")).toContain("-f .eslint-checker/summaryFormatter.cjs -o .eslint-checker/eslint-summary.json");
      expect(normalizePath(logger.commands[1] ?? "")).toContain("--ignore-pattern **/*.min.js -f json -o .eslint-checker/eslint-report.json");
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
          sourceEntries,
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

  test("does not use non-blocking Browserslist notices as the ESLint failure reason", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-execute-browserslist-notice-"));
    try {
      mockedRunCommand.mockResolvedValueOnce({
        exitCode: 2,
        stdout: "ESLint couldn't find the plugin \"react\".",
        stderr: [
          "Browserslist: browsers data (caniuse-lite) is 6 months old. Please run:",
          "  npx update-browserslist-db@latest",
          "  Why you should do it regularly: https://github.com/browserslist/update-db#readme"
        ].join("\n"),
        durationMs: 20,
        timedOut: false
      });

      await expect(
        executeLint({
          cwd: tempDirectory,
          outputDirectory: ".eslint-checker",
          timeoutSeconds: 10,
          eslintAccess: connectedEslintAccess,
          sourceEntries
        })
      ).resolves.toMatchObject({
        status: "failed",
        exitCode: 2,
        failureReason: "ESLint couldn't find the plugin \"react\"."
      });
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("does not include npm warnings in the ESLint failure reason", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-execute-npm-warn-filter-"));
    try {
      mockedRunCommand.mockResolvedValueOnce({
        exitCode: 2,
        stdout: "",
        stderr: [
          'npm warn Unknown user config "email". This will stop working in the next major version of npm.',
          'npm warn Unknown user config "always-auth". This will stop working in the next major version of npm.',
          "There was a problem loading formatter: .eslint-checker/summaryFormatter.cjs",
          "Error: Cannot find module '.eslint-checker/summaryFormatter.cjs'"
        ].join("\n"),
        durationMs: 20,
        timedOut: false
      });

      await expect(
        executeLint({
          cwd: tempDirectory,
          outputDirectory: ".eslint-checker",
          timeoutSeconds: 10,
          eslintAccess: connectedEslintAccess,
          sourceEntries
        })
      ).resolves.toMatchObject({
        status: "failed",
        exitCode: 2,
        failureReason: [
          "There was a problem loading formatter: .eslint-checker/summaryFormatter.cjs",
          "Error: Cannot find module '.eslint-checker/summaryFormatter.cjs'"
        ].join("\n")
      });
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("treats ESLint output as collected when only Browserslist notices accompany a generated summary", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-execute-browserslist-summary-"));
    try {
      await mkdir(path.join(tempDirectory, ".eslint-checker"), { recursive: true });
      await writeFile(path.join(tempDirectory, ".eslint-checker", "eslint-summary.json"), "{}", "utf8");
      mockedRunCommand.mockResolvedValueOnce({
        exitCode: 2,
        stdout: "",
        stderr: [
          "Browserslist: browsers data (caniuse-lite) is 6 months old. Please run:",
          "  npx update-browserslist-db@latest",
          "  Why you should do it regularly: https://github.com/browserslist/update-db#readme"
        ].join("\n"),
        durationMs: 20,
        timedOut: false
      });

      await expect(
        executeLint({
          cwd: tempDirectory,
          outputDirectory: ".eslint-checker",
          timeoutSeconds: 10,
          eslintAccess: connectedEslintAccess,
          sourceEntries
        })
      ).resolves.toMatchObject({
        status: "success",
        exitCode: 2,
        durationMs: 20
      });
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("logs heartbeat messages while ESLint is still running", async () => {
    vi.useFakeTimers();
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-execute-progress-"));
    try {
      await mkdir(path.join(tempDirectory, ".eslint-checker"), { recursive: true });
      let resolveCommand: (value: {
        exitCode: number;
        stdout: string;
        stderr: string;
        durationMs: number;
        timedOut: boolean;
      }) => void = () => undefined;
      mockedRunCommand.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCommand = resolve;
          })
      );

      const logger = memoryLogger();
      const execution = executeLint({
        cwd: tempDirectory,
        outputDirectory: ".eslint-checker",
        timeoutSeconds: 60,
        eslintAccess: connectedEslintAccess,
        sourceEntries,
        logger
      });

      await vi.waitFor(() => expect(mockedRunCommand).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(45_000);
      expect(logger.infos).toContain("ESLint still running after 15s...");
      expect(logger.infos).toContain("ESLint still running after 30s...");
      expect(logger.infos).toContain("ESLint still running after 45s...");

      await writeFile(path.join(tempDirectory, ".eslint-checker", "eslint-summary.json"), "{}", "utf8");
      resolveCommand({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 45_000,
        timedOut: false
      });

      await expect(execution).resolves.toMatchObject({
        status: "success",
        exitCode: 0
      });
      const infoCountAfterCompletion = logger.infos.length;
      await vi.advanceTimersByTimeAsync(15_000);
      expect(logger.infos).toHaveLength(infoCountAfterCompletion);
    } finally {
      vi.useRealTimers();
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

  test.each([
    ["npm", { command: "npm", args: ["install"], text: "npm install" }],
    ["yarn", { command: "yarn", args: ["install"], text: "yarn install" }],
    ["pnpm", { command: "pnpm", args: ["install"], text: "pnpm install" }]
  ] as const)("builds package-manager restore command for %s", (packageManager, expectedCommand) => {
    expect(buildDependencyRestoreCommand(packageManager)).toEqual(expectedCommand);
  });

  test("logs when recovery skips a failure without installable dependency evidence", async () => {
    const logger = memoryLogger();

    await expect(
      recoverAndRetry({
        cwd: "fixtures/vue-eslint",
        outputDirectory: ".eslint-checker",
        timeoutSeconds: 10,
        eslintAccess: connectedEslintAccess,
        sourceEntries,
        packageManager: "npm",
        failedExecution: {
          status: "failed",
          command: "npx eslint src -f formatter -o .eslint-checker/eslint-summary.json",
          timeoutSeconds: 10,
          exitCode: 2,
          durationMs: 20,
          failureReason: "eslint_execution_failed"
        },
        logger
      })
    ).resolves.toMatchObject({
      lintRecovery: {
        status: "skipped",
        failureReason: "no_installable_missing_dependency"
      }
    });

    expect(logger.infos).toContain("Recovery skipped: no installable missing ESLint dependency was detected in the failure output");
  });

  test("logs recovery diagnosis, install command, and retry result", async () => {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "eslint-recovery-logs-"));
    try {
      await mkdir(path.join(tempDirectory, "src"), { recursive: true });
      mockedRunCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: "",
          stderr: "",
          durationMs: 20,
          timedOut: false
        })
        .mockImplementationOnce(async () => {
          await mkdir(path.join(tempDirectory, ".eslint-checker"), { recursive: true });
          await writeFile(path.join(tempDirectory, ".eslint-checker", "eslint-summary.json"), "{}", "utf8");
          return {
            exitCode: 0,
            stdout: "",
            stderr: "",
            durationMs: 30,
            timedOut: false
          };
        });
      const logger = memoryLogger();

      await expect(
        recoverAndRetry({
          cwd: tempDirectory,
          outputDirectory: ".eslint-checker",
          timeoutSeconds: 10,
          eslintAccess: connectedEslintAccess,
          sourceEntries,
          packageManager: "npm",
          failedExecution: {
            status: "failed",
            command: "npx eslint src -f formatter -o .eslint-checker/eslint-summary.json",
            timeoutSeconds: 10,
            exitCode: 2,
            durationMs: 20,
            failureReason: "ESLint couldn't find the plugin \"react\"."
          },
          logger
        })
      ).resolves.toMatchObject({
        lintExecution: {
          status: "success",
          exitCode: 0
        },
        lintRecovery: {
          status: "success",
          installedPackages: ["eslint-plugin-react"],
          installCommand: "npm install -D eslint-plugin-react"
        }
      });

      expect(logger.infos).toContain("Recovery diagnosed missing ESLint dependency packages: eslint-plugin-react");
      expect(logger.commands).toContain("npm install -D eslint-plugin-react");
      expect(logger.infos).toContain("Recovery install succeeded; retrying ESLint execution");
      expect(logger.infos).toContain("Recovery retry finished with status success and exit code 0");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
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

function getFormatterPathFromFirstRun(): string | undefined {
  const args = mockedRunCommand.mock.calls[0]?.[0].args ?? [];
  const formatterFlagIndex = args.indexOf("-f");
  return formatterFlagIndex >= 0 ? args[formatterFlagIndex + 1] : undefined;
}
