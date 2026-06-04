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
  logger?: Logger;
}

export async function executeLint({
  cwd,
  outputDirectory,
  timeoutSeconds,
  eslintAccess,
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
  const reportExists = await pathExists(path.join(cwd, reportPath));

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

  if ((result.exitCode === 0 || result.exitCode === 1) && reportExists) {
    logger.info("ESLint JSON execution completed");
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
