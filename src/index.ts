import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { CheckerReport, LintRecovery, RunCheckerInput } from "./types.js";
import { analyzeEslintConfig } from "./analysis/configAnalysis.js";
import { scanEslintDisable } from "./analysis/disableScan.js";
import { collectResolvedEslintConfig } from "./analysis/resolvedConfig.js";
import { detectEslintAccess } from "./discovery/eslintAccess.js";
import { discoverProject } from "./discovery/project.js";
import { discoverSourceEntries } from "./discovery/sourceEntries.js";
import { createLogger } from "./logger.js";
import { executeLint } from "./lint/execute.js";
import { parseEslintSummary } from "./lint/parse.js";
import { recoverAndRetry } from "./lint/recovery.js";
import { writeArtifacts } from "./report/artifacts.js";
import { assessRisk } from "./report/risk.js";
import { pathExists } from "./utils/fs.js";

const SCHEMA_VERSION = "0.2.0";

export async function runChecker({ cwd, options }: RunCheckerInput): Promise<CheckerReport> {
  const outputDirectory = normalizeOutputDirectory(options.output);
  const timeoutSeconds = Number.parseInt(options.timeout, 10);
  const logger = createLogger({ console: options.console });
  const checkerVersion = await readCheckerPackageVersion();
  logger.info(`eslint-checker version: ${checkerVersion}`);
  logger.info("[1/7] Initializing check");
  await prepareOutputDirectory(cwd, outputDirectory, logger);
  logger.info("[2/7] Discovering project and static ESLint context");
  const [projectDiscovery, eslintAccess, eslintConfigAnalysis, sourceEntries] = await Promise.all([
    discoverProject(cwd),
    detectEslintAccess(cwd),
    analyzeEslintConfig(cwd),
    discoverSourceEntries(cwd, outputDirectory)
  ]);
  const eslintDisableAnalysis = await scanEslintDisable(cwd, sourceEntries);
  const normalizedTimeoutSeconds = Number.isNaN(timeoutSeconds) ? 120 : timeoutSeconds;
  logger.info("Checker started");
  let lintRecovery: LintRecovery = {
    enabled: options.recovery,
    attempted: false,
    status: "not_collected" as const,
    retryCount: 0,
    installedPackages: [],
    installCommand: "",
    modifiedFiles: []
  };
  logger.info("[3/7] Collecting resolved ESLint config");
  const eslintResolvedConfig = await collectResolvedEslintConfig({
    cwd,
    outputDirectory,
    timeoutSeconds: normalizedTimeoutSeconds,
    eslintAccess,
    sourceEntries,
    logger
  });

  logger.info("[4/7] Collecting ESLint results");
  let lintExecution =
    options.mode === "access"
      ? {
          status: "skipped" as const,
          command: "",
          timeoutSeconds: normalizedTimeoutSeconds,
          exitCode: null,
          durationMs: null,
          skippedReason: "access_mode"
        }
      : await executeLint({
          cwd,
          outputDirectory,
          timeoutSeconds: normalizedTimeoutSeconds,
          eslintAccess,
          sourceEntries,
          rawEslintReport: options.rawEslintReport,
          logger
        });

  if (options.recovery && lintExecution.status === "failed") {
    logger.info(
      `Recovery enabled after ESLint execution failed with exit code ${lintExecution.exitCode ?? "unknown"}: ${
        lintExecution.failureReason ?? "eslint_execution_failed"
      }`
    );
    logger.info("Recovery enabled: attempting dependency recovery and retry");
    const recovered = await recoverAndRetry({
      cwd,
      outputDirectory,
      timeoutSeconds: normalizedTimeoutSeconds,
      eslintAccess,
      sourceEntries,
      rawEslintReport: options.rawEslintReport,
      packageManager: projectDiscovery.packageManager,
      failedExecution: lintExecution,
      logger
    });
    lintExecution = recovered.lintExecution;
    lintRecovery = recovered.lintRecovery;
  }
  logger.info("[5/7] Parsing ESLint output");
  const parsedLint =
    lintExecution.status === "success"
      ? await parseEslintSummary(`${cwd}/${outputDirectory}/eslint-summary.json`)
      : {
          lintResult: {
            status: "not_collected" as const,
            errorCount: 0,
            warningCount: 0,
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            fileCount: 0,
            problemFileCount: 0
          },
          ruleSummary: [],
          fileSummary: [],
          lintEvidence: {
            topRuleExamples: [],
            topFileExamples: []
          }
        };

  logger.info("[6/7] Assessing risk and composing report");
  const reportWithoutRisk = {
    schemaVersion: SCHEMA_VERSION,
    checkerVersion,
    generatedAt: new Date().toISOString(),
    systemInfo: {
      system: options.system ?? "unknown",
      center: options.center ?? "unknown",
      owner: options.owner ?? "unknown",
      nodeVersion: projectDiscovery.nodeVersion,
      packageManager: projectDiscovery.packageManager,
      packageManagerVersion: projectDiscovery.packageManagerVersion,
      cwd
    },
    gitInfo: projectDiscovery.gitInfo,
    projectInfo: {
      hasPackageJson: projectDiscovery.hasPackageJson,
      packageName: projectDiscovery.packageName,
      packageVersion: projectDiscovery.packageVersion,
      stack: projectDiscovery.stack,
      dependencies: projectDiscovery.dependencies,
      devDependencies: projectDiscovery.devDependencies,
      packageManagerLockfile: projectDiscovery.packageManagerLockfile,
      ...(projectDiscovery.frameworkProfile ? { frameworkProfile: projectDiscovery.frameworkProfile } : {})
    },
    eslintAccess,
    eslintConfigAnalysis,
    eslintResolvedConfig,
    eslintDisableAnalysis,
    lintExecution: {
      ...lintExecution
    },
    lintRecovery,
    lintResult: parsedLint.lintResult,
    ruleSummary: parsedLint.ruleSummary,
    fileSummary: parsedLint.fileSummary,
    lintEvidence: parsedLint.lintEvidence,
    artifacts: {
      outputDirectory,
      reportJson: `${outputDirectory}/report.json`,
      summaryMarkdown: `${outputDirectory}/summary.md`,
      eslintSummaryJson: `${outputDirectory}/eslint-summary.json`,
      eslintReportJson: lintExecution.rawEslintReportGenerated ? `${outputDirectory}/eslint-report.json` : null,
      eslintConfigJson: `${outputDirectory}/eslint-config.json`,
      lintLog: `${outputDirectory}/lint-log.txt`
    }
  };
  const report: CheckerReport = {
    ...reportWithoutRisk,
    riskAssessment: assessRisk(reportWithoutRisk)
  };

  logger.info("[7/7] Writing report artifacts");
  await writeArtifacts(cwd, report, logger.toText());
  logger.info(`Done. Report: ${outputDirectory}/report.json`);
  return report;
}

async function readCheckerPackageVersion(): Promise<string> {
  const packageJsonPath = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
  return typeof packageJson.version === "string" ? packageJson.version : "unknown";
}

function normalizeOutputDirectory(outputDirectory: string): ".eslint-checker" {
  if (outputDirectory !== ".eslint-checker") {
    throw new Error("Unsupported output directory. Only .eslint-checker is supported.");
  }

  return ".eslint-checker";
}

async function prepareOutputDirectory(
  cwd: string,
  outputDirectory: ".eslint-checker",
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  logger.info(`Preparing output directory: ${outputDirectory}`);
  const outputPath = path.join(cwd, outputDirectory);
  if (await pathExists(outputPath)) {
    await rm(outputPath, { recursive: true, force: true });
    logger.info(`Existing output directory removed: ${outputDirectory}`);
  }
}

export type { CheckerReport, CheckerOptions, RunCheckerInput } from "./types.js";
