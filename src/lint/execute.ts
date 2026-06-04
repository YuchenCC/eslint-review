import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createLogger, type Logger } from "../logger.js";
import type { EslintAccess, LintExecution } from "../types.js";
import { runCommand } from "../utils/commands.js";
import { pathExists } from "../utils/fs.js";

export interface ExecuteLintInput {
  cwd: string;
  outputDirectory: string;
  timeoutSeconds: number;
  eslintAccess: EslintAccess;
  rawEslintReport?: boolean;
  logger?: Logger;
}

export async function executeLint({
  cwd,
  outputDirectory,
  timeoutSeconds,
  eslintAccess,
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

  await mkdir(path.join(cwd, outputDirectory), { recursive: true });
  const summaryPath = path.join(outputDirectory, "eslint-summary.json");
  const formatterPath = path.join("src", "lint", "summaryFormatter.js");
  const args = ["eslint", ".", "-f", formatterPath, "-o", summaryPath];
  const commandText = `npx ${args.join(" ")}`;
  logger.command(commandText);

  const result = await runCommand({
    cwd,
    command: "npx",
    args,
    timeoutMs: timeoutSeconds * 1000
  });
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

  if ((result.exitCode === 0 || result.exitCode === 1) && summaryExists) {
    logger.info("ESLint summary execution completed");
    if (rawEslintReport) {
      await emitRawEslintReport({ cwd, outputDirectory, timeoutSeconds, logger });
    }
    return {
      status: "success",
      command: commandText,
      timeoutSeconds,
      exitCode: result.exitCode,
      durationMs: result.durationMs
    };
  }

  const failureReason = result.stderr || result.stdout || "eslint_execution_failed";
  logger.error(failureReason);
  return {
    status: "failed",
    command: commandText,
    timeoutSeconds,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    failureReason
  };
}

async function emitRawEslintReport({
  cwd,
  outputDirectory,
  timeoutSeconds,
  logger
}: {
  cwd: string;
  outputDirectory: string;
  timeoutSeconds: number;
  logger: Logger;
}): Promise<void> {
  const reportPath = path.join(outputDirectory, "eslint-report.json");
  const args = ["eslint", ".", "-f", "json", "-o", reportPath];
  const commandText = `npx ${args.join(" ")}`;
  logger.command(commandText);

  const result = await runCommand({
    cwd,
    command: "npx",
    args,
    timeoutMs: timeoutSeconds * 1000
  });

  if (result.timedOut) {
    logger.error(`Raw ESLint JSON execution timed out after ${timeoutSeconds}s`);
    return;
  }

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    logger.error(result.stderr || result.stdout || "raw_eslint_report_failed");
  }
}
