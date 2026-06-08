import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { createLogger, type Logger } from "../logger.js";
import type { EslintAccess, EslintResolvedConfig, SourceEntries } from "../types.js";
import { runCommand } from "../utils/commands.js";

export interface CollectResolvedEslintConfigInput {
  cwd: string;
  outputDirectory: string;
  timeoutSeconds: number;
  eslintAccess: EslintAccess;
  sourceEntries: SourceEntries;
  logger?: Logger;
}

const SOURCE_FILE_EXTENSIONS = "{js,cjs,mjs,jsx,ts,cts,mts,tsx,vue}";

export async function collectResolvedEslintConfig({
  cwd,
  outputDirectory,
  timeoutSeconds,
  eslintAccess,
  sourceEntries,
  logger = createLogger()
}: CollectResolvedEslintConfigInput): Promise<EslintResolvedConfig> {
  const outputPath = path.join(outputDirectory, "eslint-config.json");

  if (eslintAccess.accessLevel === "not_connected") {
    return skippedConfig({
      timeoutSeconds,
      outputPath,
      skippedReason: "eslint_not_connected"
    });
  }

  if (sourceEntries.entries.length === 0) {
    return skippedConfig({
      timeoutSeconds,
      outputPath,
      skippedReason: "no_source_entries"
    });
  }

  const targetFile = await findConfigTargetFile(cwd, sourceEntries);
  if (!targetFile) {
    return skippedConfig({
      timeoutSeconds,
      outputPath,
      skippedReason: "no_target_file"
    });
  }

  const args = ["eslint", "--print-config", targetFile];
  const commandText = `npx ${args.join(" ")}`;
  logger.command(commandText);
  const result = await runCommand({
    cwd,
    command: "npx",
    args,
    timeoutMs: timeoutSeconds * 1000
  });

  if (result.timedOut) {
    return {
      status: "failed",
      command: commandText,
      timeoutSeconds,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      targetFile,
      outputPath,
      failureReason: "timeout"
    };
  }

  if (result.exitCode !== 0) {
    return {
      status: "failed",
      command: commandText,
      timeoutSeconds,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      targetFile,
      outputPath,
      failureReason: result.stderr || result.stdout || "eslint_print_config_failed"
    };
  }

  try {
    const resolvedConfig = JSON.parse(result.stdout) as unknown;
    await mkdir(path.join(cwd, outputDirectory), { recursive: true });
    await writeFile(path.join(cwd, outputPath), `${JSON.stringify(resolvedConfig, null, 2)}\n`, "utf8");
  } catch (error) {
    return {
      status: "failed",
      command: commandText,
      timeoutSeconds,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      targetFile,
      outputPath,
      failureReason: error instanceof Error ? error.message : "invalid_eslint_print_config_json"
    };
  }

  logger.info("Resolved ESLint config collected");
  return {
    status: "success",
    command: commandText,
    timeoutSeconds,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    targetFile,
    outputPath
  };
}

async function findConfigTargetFile(cwd: string, sourceEntries: SourceEntries): Promise<string | undefined> {
  const [targetFile] = await fg(
    sourceEntries.entries.map((entry) => `${entry}/**/*.${SOURCE_FILE_EXTENSIONS}`),
    {
      cwd,
      absolute: false,
      onlyFiles: true,
      ignore: sourceEntries.ignorePatterns
    }
  );
  return targetFile;
}

function skippedConfig({
  timeoutSeconds,
  outputPath,
  skippedReason
}: {
  timeoutSeconds: number;
  outputPath: string;
  skippedReason: string;
}): EslintResolvedConfig {
  return {
    status: "skipped",
    command: "",
    timeoutSeconds,
    exitCode: null,
    durationMs: null,
    targetFile: "",
    outputPath,
    skippedReason
  };
}
