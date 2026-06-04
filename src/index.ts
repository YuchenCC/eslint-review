import type { CheckerReport, LintRecovery, RunCheckerInput } from "./types.js";
import { analyzeEslintConfig } from "./analysis/configAnalysis.js";
import { scanEslintDisable } from "./analysis/disableScan.js";
import { collectResolvedEslintConfig } from "./analysis/resolvedConfig.js";
import { detectEslintAccess } from "./discovery/eslintAccess.js";
import { discoverProject } from "./discovery/project.js";
import { createLogger } from "./logger.js";
import { executeLint } from "./lint/execute.js";
import { parseEslintJson } from "./lint/parse.js";
import { recoverAndRetry } from "./lint/recovery.js";
import { writeArtifacts } from "./report/artifacts.js";
import { assessRisk } from "./report/risk.js";

const CHECKER_VERSION = "0.1.0";
const SCHEMA_VERSION = "0.1.0";

export async function runChecker({ cwd, options }: RunCheckerInput): Promise<CheckerReport> {
  const outputDirectory = options.output;
  const timeoutSeconds = Number.parseInt(options.timeout, 10);
  const logger = createLogger({ console: options.console });
  logger.info("[1/7] Initializing check");
  logger.info("[2/7] Discovering project and static ESLint context");
  const [projectDiscovery, eslintAccess, eslintConfigAnalysis, eslintDisableAnalysis] = await Promise.all([
    discoverProject(cwd),
    detectEslintAccess(cwd),
    analyzeEslintConfig(cwd),
    scanEslintDisable(cwd)
  ]);
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
          logger
        });

  if (options.recovery && lintExecution.status === "failed") {
    logger.info("Recovery enabled: attempting dependency recovery and retry");
    const recovered = await recoverAndRetry({
      cwd,
      outputDirectory,
      timeoutSeconds: normalizedTimeoutSeconds,
      eslintAccess,
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
      ? await parseEslintJson(`${cwd}/${outputDirectory}/eslint-report.json`)
      : {
          lintResult: {
            status: "not_collected" as const,
            errorCount: 0,
            warningCount: 0,
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            fileCount: 0
          },
          ruleSummary: [],
          fileSummary: []
        };

  logger.info("[6/7] Assessing risk and composing report");
  const reportWithoutRisk = {
    schemaVersion: SCHEMA_VERSION,
    checkerVersion: CHECKER_VERSION,
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
      packageManagerLockfile: projectDiscovery.packageManagerLockfile
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
    artifacts: {
      outputDirectory,
      reportJson: `${outputDirectory}/report.json`,
      summaryMarkdown: `${outputDirectory}/summary.md`,
      eslintReportJson: `${outputDirectory}/eslint-report.json`,
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

export type { CheckerReport, CheckerOptions, RunCheckerInput } from "./types.js";
