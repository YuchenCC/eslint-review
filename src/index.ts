import type { CheckerReport, RunCheckerInput } from "./types.js";

const CHECKER_VERSION = "0.1.0";
const SCHEMA_VERSION = "0.1.0";

export async function runChecker({ cwd, options }: RunCheckerInput): Promise<CheckerReport> {
  const outputDirectory = options.output;
  const timeoutSeconds = Number.parseInt(options.timeout, 10);

  return {
    schemaVersion: SCHEMA_VERSION,
    checkerVersion: CHECKER_VERSION,
    generatedAt: new Date().toISOString(),
    systemInfo: {
      system: options.system ?? "unknown",
      center: options.center ?? "unknown",
      owner: options.owner ?? "unknown",
      nodeVersion: process.version,
      packageManager: "unknown",
      packageManagerVersion: "unknown",
      cwd
    },
    gitInfo: {
      branch: "unknown",
      commit: "unknown",
      dirty: "unknown",
      status: "not_collected"
    },
    projectInfo: {
      hasPackageJson: false,
      packageName: "unknown",
      packageVersion: "unknown",
      stack: "unknown",
      dependencies: [],
      devDependencies: [],
      packageManagerLockfile: "unknown"
    },
    eslintAccess: {
      accessLevel: "not_connected",
      eslintDependencyDetected: false,
      eslintPackages: [],
      eslintConfigDetected: false,
      configFiles: [],
      packageJsonEslintConfigDetected: false,
      lintScriptDetected: false,
      lintScripts: {}
    },
    eslintConfigAnalysis: {
      status: "not_collected",
      analyzedFiles: [],
      disabledFormatRules: [],
      disabledQualityRules: [],
      disabledStackRules: [],
      disabledRuleCount: 0,
      weakenedStandardConfig: false,
      limitations: [],
      findings: []
    },
    eslintDisableAnalysis: {
      status: "not_collected",
      scannedDirectory: "src",
      totalDisableCount: 0,
      fileLevelDisableCount: 0,
      disableWithoutRuleCount: 0,
      broadDisableCount: 0,
      topFiles: [],
      findings: []
    },
    lintExecution: {
      status: "skipped",
      command: "",
      timeoutSeconds: Number.isNaN(timeoutSeconds) ? 120 : timeoutSeconds,
      exitCode: null,
      durationMs: null,
      skippedReason: "discovery_not_implemented"
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
