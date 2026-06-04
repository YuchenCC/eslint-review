import type { CheckerReport, RunCheckerInput } from "./types.js";
import { analyzeEslintConfig } from "./analysis/configAnalysis.js";
import { scanEslintDisable } from "./analysis/disableScan.js";
import { detectEslintAccess } from "./discovery/eslintAccess.js";
import { discoverProject } from "./discovery/project.js";
import { executeLint } from "./lint/execute.js";

const CHECKER_VERSION = "0.1.0";
const SCHEMA_VERSION = "0.1.0";

export async function runChecker({ cwd, options }: RunCheckerInput): Promise<CheckerReport> {
  const outputDirectory = options.output;
  const timeoutSeconds = Number.parseInt(options.timeout, 10);
  const [projectDiscovery, eslintAccess, eslintConfigAnalysis, eslintDisableAnalysis] = await Promise.all([
    discoverProject(cwd),
    detectEslintAccess(cwd),
    analyzeEslintConfig(cwd),
    scanEslintDisable(cwd)
  ]);
  const normalizedTimeoutSeconds = Number.isNaN(timeoutSeconds) ? 120 : timeoutSeconds;
  const lintExecution =
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
          eslintAccess
        });

  return {
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
    eslintDisableAnalysis,
    lintExecution: {
      ...lintExecution
    },
    lintRecovery: {
      enabled: options.recovery,
      attempted: false,
      status: "not_collected",
      retryCount: 0,
      installedPackages: [],
      installCommand: "",
      modifiedFiles: []
    },
    lintResult: {
      status: "not_collected",
      errorCount: 0,
      warningCount: 0,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      fileCount: 0
    },
    ruleSummary: [],
    fileSummary: [],
    riskAssessment: {
      level: "unknown",
      score: 0,
      reasons: [],
      recommendations: []
    },
    artifacts: {
      outputDirectory,
      reportJson: `${outputDirectory}/report.json`,
      summaryMarkdown: `${outputDirectory}/summary.md`,
      eslintReportJson: `${outputDirectory}/eslint-report.json`,
      lintLog: `${outputDirectory}/lint-log.txt`
    }
  };
}

export type { CheckerReport, CheckerOptions, RunCheckerInput } from "./types.js";
