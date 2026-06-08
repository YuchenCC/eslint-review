import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createLogger, type Logger } from "../logger.js";
import type { EslintAccess, LintExecution, SourceEntries } from "../types.js";
import { runCommand } from "../utils/commands.js";
import { pathExists } from "../utils/fs.js";

const PROGRESS_INTERVAL_MS = 15_000;
const SUMMARY_FORMATTER_FILENAME = "summaryFormatter.cjs";

export interface ExecuteLintInput {
  cwd: string;
  outputDirectory: string;
  timeoutSeconds: number;
  eslintAccess: EslintAccess;
  sourceEntries: SourceEntries;
  rawEslintReport?: boolean;
  logger?: Logger;
}

export async function executeLint({
  cwd,
  outputDirectory,
  timeoutSeconds,
  eslintAccess,
  sourceEntries,
  rawEslintReport = false,
  logger = createLogger()
}: ExecuteLintInput): Promise<LintExecution> {
  if (eslintAccess.accessLevel === "not_connected") {
    logger.info("Skipping ESLint execution because ESLint is not connected");
    return {
      status: "skipped",
      command: "",
      timeoutSeconds,
      exitCode: null,
      durationMs: null,
      skippedReason: "eslint_not_connected"
    };
  }

  if (sourceEntries.entries.length === 0) {
    logger.info("Skipping ESLint execution because no source entries were discovered");
    return {
      status: "skipped",
      command: "",
      timeoutSeconds,
      exitCode: null,
      durationMs: null,
      skippedReason: "no_source_entries"
    };
  }

  await mkdir(path.join(cwd, outputDirectory), { recursive: true });
  const summaryFormatterPath = await emitSummaryFormatter({ cwd, outputDirectory });
  const summaryPath = path.join(outputDirectory, "eslint-summary.json");
  const args = ["eslint", ...sourceEntries.entries, "-f", summaryFormatterPath, "-o", summaryPath];
  const commandText = `npx ${args.join(" ")}`;
  logger.command(commandText);

  const result = await runCommandWithProgress(
    {
      cwd,
      command: "npx",
      args,
      streamOutput: true,
      timeoutMs: timeoutSeconds * 1000
    },
    logger,
    "ESLint"
  );
  const summaryExists = await pathExists(path.join(cwd, summaryPath));

  if (result.timedOut) {
    logger.error(`ESLint execution timed out after ${timeoutSeconds}s`);
    return {
      status: "failed",
      command: commandText,
      timeoutSeconds,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      failureReason: "timeout"
    };
  }

  const failureReason = collectBlockingFailureReason(result.stderr, result.stdout);
  if (result.exitCode === 0 || result.exitCode === 1 || (summaryExists && failureReason === "")) {
    if (summaryExists) {
      logger.info("ESLint summary execution completed");
    } else {
      logger.error("ESLint completed but summary output was not generated");
    }
    const rawEslintReportGenerated = rawEslintReport
      ? await emitRawEslintReport({ cwd, outputDirectory, timeoutSeconds, sourceEntries, logger })
      : false;
    return {
      status: "success",
      command: commandText,
      timeoutSeconds,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      rawEslintReportGenerated
    };
  }

  const reportedFailureReason = failureReason || "eslint_execution_failed";
  logger.error(reportedFailureReason);
  return {
    status: "failed",
    command: commandText,
    timeoutSeconds,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    failureReason: reportedFailureReason
  };
}

function collectBlockingFailureReason(stderr: string, stdout: string): string {
  return [stripNonBlockingEslintNotices(stderr), stripNonBlockingEslintNotices(stdout)]
    .map((output) => output.trim())
    .filter((output) => output.length > 0)
    .join("\n\n");
}

function stripNonBlockingEslintNotices(output: string): string {
  const lines = output.split(/\r?\n/);
  const retainedLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (isBrowserslistNoticeStart(line)) {
      while (index + 1 < lines.length && isBrowserslistNoticeContinuation(lines[index + 1] ?? "")) {
        index += 1;
      }
      continue;
    }

    retainedLines.push(line);
  }

  return retainedLines.join("\n");
}

function isBrowserslistNoticeStart(line: string): boolean {
  return line.startsWith("Browserslist: browsers data (caniuse-lite) is ");
}

function isBrowserslistNoticeContinuation(line: string): boolean {
  const trimmedLine = line.trim();
  return (
    trimmedLine === "npx update-browserslist-db@latest" ||
    trimmedLine.startsWith("Why you should do it regularly: https://github.com/browserslist/update-db")
  );
}

async function emitSummaryFormatter({ cwd, outputDirectory }: { cwd: string; outputDirectory: string }): Promise<string> {
  const formatterPath = path.join(cwd, outputDirectory, SUMMARY_FORMATTER_FILENAME);
  await writeFile(formatterPath, SUMMARY_FORMATTER_CJS, "utf8");
  return formatterPath;
}

const SUMMARY_FORMATTER_CJS = `"use strict";

const path = require("path");

const DEFAULT_FORMATTER_LIMITS = {
  maxRules: 20,
  maxFiles: 20,
  maxExamplesPerRule: 3,
  maxExamplesPerFile: 3,
  maxMessageLength: 200
};

module.exports = function formatter(results) {
  return JSON.stringify(buildEslintSummary(results || [], { cwd: process.cwd() }), null, 2) + "\\n";
};

function buildEslintSummary(results, options) {
  const limits = Object.assign({}, DEFAULT_FORMATTER_LIMITS, options && options.limits);
  const ruleCounts = new Map();
  const examplesByRule = new Map();
  const fileExamplesByPath = new Map();
  let errorCount = 0;
  let warningCount = 0;
  let fixableErrorCount = 0;
  let fixableWarningCount = 0;
  const allFileSummaries = [];

  for (const result of results) {
    const filePath = normalizeFilePath(result.filePath, options && options.cwd);
    const fileErrorCount = result.errorCount || 0;
    const fileWarningCount = result.warningCount || 0;
    errorCount += fileErrorCount;
    warningCount += fileWarningCount;
    fixableErrorCount += result.fixableErrorCount || 0;
    fixableWarningCount += result.fixableWarningCount || 0;

    const fileSummary = {
      filePath,
      errorCount: fileErrorCount,
      warningCount: fileWarningCount,
      disableCount: 0
    };
    allFileSummaries.push(fileSummary);

    const fileExamples = [];
    for (const message of result.messages || []) {
      const ruleId = message.ruleId || "fatal";
      const severity = severityName(message.severity);
      const existing = ruleCounts.get(ruleId) || {
        ruleId,
        severity,
        count: 0,
        fixableCount: 0
      };
      existing.count += 1;
      existing.severity = promotedSeverity(existing.severity, severity);
      if (message.fix !== undefined) {
        existing.fixableCount += 1;
      }
      ruleCounts.set(ruleId, existing);

      const evidence = {
        ruleId,
        severity,
        filePath,
        line: message.line || 0,
        column: message.column || 0,
        message: truncateMessage(message.message || "", limits.maxMessageLength)
      };

      const ruleExamples = examplesByRule.get(ruleId) || [];
      if (ruleExamples.length < limits.maxExamplesPerRule) {
        ruleExamples.push(evidence);
        examplesByRule.set(ruleId, ruleExamples);
      }
      if (fileExamples.length < limits.maxExamplesPerFile) {
        fileExamples.push(evidence);
      }
    }

    if (fileExamples.length > 0) {
      fileExamplesByPath.set(filePath, Object.assign({}, fileSummary, { examples: fileExamples }));
    }
  }

  const ruleSummary = Array.from(ruleCounts.values())
    .sort((left, right) => right.count - left.count || left.ruleId.localeCompare(right.ruleId))
    .slice(0, limits.maxRules);
  const fileSummary = allFileSummaries
    .sort((left, right) => problemCount(right) - problemCount(left) || left.filePath.localeCompare(right.filePath))
    .slice(0, limits.maxFiles);
  const retainedFilePaths = new Set(fileSummary.map((file) => file.filePath));

  return {
    schemaVersion: "0.1.0",
    generatedAt: new Date().toISOString(),
    lintResult: {
      status: "success",
      errorCount,
      warningCount,
      fixableErrorCount,
      fixableWarningCount,
      fileCount: results.length,
      problemFileCount: allFileSummaries.filter((file) => problemCount(file) > 0).length
    },
    ruleSummary,
    fileSummary,
    evidence: {
      topRuleExamples: ruleSummary.flatMap((rule) => examplesByRule.get(rule.ruleId) || []),
      topFileExamples: fileSummary
        .map((file) => fileExamplesByPath.get(file.filePath))
        .filter((file) => file !== undefined && retainedFilePaths.has(file.filePath))
    },
    limits
  };
}

function severityName(severity) {
  if (severity === 2) {
    return "error";
  }
  if (severity === 1) {
    return "warning";
  }
  return "unknown";
}

function promotedSeverity(current, next) {
  if (current === "error" || next === "error") {
    return "error";
  }
  if (current === "warning" || next === "warning") {
    return "warning";
  }
  return "unknown";
}

function normalizeFilePath(filePath, cwd) {
  const relativePath = cwd && path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  return relativePath.replace(/\\\\/g, "/");
}

function truncateMessage(message, maxLength) {
  return message.length > maxLength ? message.slice(0, maxLength) : message;
}

function problemCount(file) {
  return file.errorCount + file.warningCount;
}
`;

async function emitRawEslintReport({
  cwd,
  outputDirectory,
  timeoutSeconds,
  sourceEntries,
  logger
}: {
  cwd: string;
  outputDirectory: string;
  timeoutSeconds: number;
  sourceEntries: SourceEntries;
  logger: Logger;
}): Promise<boolean> {
  const reportPath = path.join(outputDirectory, "eslint-report.json");
  const args = ["eslint", ...sourceEntries.entries, "-f", "json", "-o", reportPath];
  const commandText = `npx ${args.join(" ")}`;
  logger.command(commandText);

  const result = await runCommandWithProgress(
    {
      cwd,
      command: "npx",
      args,
      streamOutput: true,
      timeoutMs: timeoutSeconds * 1000
    },
    logger,
    "Raw ESLint JSON"
  );

  if (result.timedOut) {
    logger.error(`Raw ESLint JSON execution timed out after ${timeoutSeconds}s`);
    return false;
  }

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    logger.error(result.stderr || result.stdout || "raw_eslint_report_failed");
    return false;
  }

  return pathExists(path.join(cwd, reportPath));
}

async function runCommandWithProgress(
  input: Parameters<typeof runCommand>[0],
  logger: Logger,
  label: string
): ReturnType<typeof runCommand> {
  logger.info(`${label} process started; streaming output when ESLint emits it`);
  const startedAt = Date.now();
  const progress = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    logger.info(`${label} still running after ${elapsedSeconds}s...`);
  }, PROGRESS_INTERVAL_MS);

  try {
    return await runCommand(input);
  } finally {
    clearInterval(progress);
  }
}
