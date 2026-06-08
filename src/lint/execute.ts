import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createLogger, type Logger } from "../logger.js";
import type { EslintAccess, LintExecution } from "../types.js";
import { runCommand } from "../utils/commands.js";
import { pathExists } from "../utils/fs.js";

const SUMMARY_FORMATTER_PATH = fileURLToPath(new URL("./summaryFormatter.js", import.meta.url));
const PROGRESS_INTERVAL_MS = 15_000;

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
  const args = ["eslint", ".", "-f", SUMMARY_FORMATTER_PATH, "-o", summaryPath];
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

  if (result.exitCode === 0 || result.exitCode === 1) {
    if (summaryExists) {
      logger.info("ESLint summary execution completed");
    } else {
      logger.error("ESLint completed but summary output was not generated");
    }
    const rawEslintReportGenerated = rawEslintReport
      ? await emitRawEslintReport({ cwd, outputDirectory, timeoutSeconds, logger })
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
}): Promise<boolean> {
  const reportPath = path.join(outputDirectory, "eslint-report.json");
  const args = ["eslint", ".", "-f", "json", "-o", reportPath];
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
