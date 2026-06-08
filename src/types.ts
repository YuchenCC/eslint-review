export type CheckMode = "access" | "full";

export type StackName = "vue" | "react" | "umi" | "next" | "vite" | "webpack" | "unknown";

export type PackageManagerName = "npm" | "pnpm" | "yarn" | "unknown";

export type EslintAccessLevel = "not_connected" | "partial" | "connected" | "well_connected";

export type CollectionStatus = "not_collected" | "success" | "partial" | "failed" | "skipped";

export type RiskLevel = "low" | "medium" | "high" | "critical" | "unknown";

export interface CheckerOptions {
  system?: string;
  center?: string;
  owner?: string;
  mode: CheckMode;
  output: string;
  timeout: string;
  recovery: boolean;
  rawEslintReport?: boolean;
  console?: boolean;
}

export interface RunCheckerInput {
  cwd: string;
  options: CheckerOptions;
}

export interface SystemInfo {
  system: string;
  center: string;
  owner: string;
  nodeVersion: string;
  packageManager: PackageManagerName;
  packageManagerVersion: string;
  cwd: string;
}

export interface GitInfo {
  branch: string;
  commit: string;
  dirty: boolean | "unknown";
  status: CollectionStatus;
  failureReason?: string;
}

export interface FrameworkProfile {
  name: "jupui";
  declaredVersion: string;
  installedVersion: string;
  majorVersion: number | null;
  packagePath: string;
  status: "detected" | "installed" | "missing_install";
  limitations: string[];
}

export interface ProjectInfo {
  hasPackageJson: boolean;
  packageName: string;
  packageVersion: string;
  stack: StackName;
  dependencies: string[];
  devDependencies: string[];
  packageManagerLockfile: string;
  frameworkProfile?: FrameworkProfile;
}

export interface EslintAccess {
  accessLevel: EslintAccessLevel;
  eslintDependencyDetected: boolean;
  eslintPackages: string[];
  directEslintPackages?: string[];
  managedEslintPackages?: string[];
  managedBy?: string;
  eslintManagedDependencyDetected?: boolean;
  eslintConfigDetected: boolean;
  configFiles: string[];
  packageJsonEslintConfigDetected: boolean;
  lintScriptDetected: boolean;
  lintScripts: Record<string, string>;
  limitations?: string[];
  failureReason?: string;
}

export interface SourceEntries {
  entries: string[];
  ignorePatterns: string[];
}

export interface EslintConfigAnalysis {
  status: CollectionStatus;
  analyzedFiles: string[];
  resolvedConfigFiles?: string[];
  extendedConfigs: string[];
  extendedPackages: string[];
  disabledFormatRules: string[];
  disabledQualityRules: string[];
  disabledStackRules: string[];
  disabledRuleCount: number;
  weakenedStandardConfig: boolean;
  limitations: string[];
  findings: string[];
}

export interface EslintDisableAnalysis {
  status: CollectionStatus;
  scannedDirectory: string;
  totalDisableCount: number;
  fileLevelDisableCount: number;
  disableWithoutRuleCount: number;
  broadDisableCount: number;
  topFiles: FileSummaryItem[];
  findings: string[];
}

export interface LintExecution {
  status: CollectionStatus;
  command: string;
  timeoutSeconds: number;
  exitCode: number | null;
  durationMs: number | null;
  rawEslintReportGenerated?: boolean;
  skippedReason?: string;
  failureReason?: string;
}

export interface LintRecovery {
  enabled: boolean;
  attempted: boolean;
  status: CollectionStatus;
  retryCount: number;
  installedPackages: string[];
  installCommand: string;
  modifiedFiles: string[];
  failureReason?: string;
}

export interface EslintResolvedConfig {
  status: CollectionStatus;
  command: string;
  timeoutSeconds: number;
  exitCode: number | null;
  durationMs: number | null;
  targetFile: string;
  outputPath: string;
  skippedReason?: string;
  failureReason?: string;
}

export interface LintResult {
  status: CollectionStatus;
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
  fileCount: number;
  problemFileCount: number;
  failureReason?: string;
}

export interface RuleSummaryItem {
  ruleId: string;
  severity: "error" | "warning" | "unknown";
  count: number;
  fixableCount: number;
}

export interface FileSummaryItem {
  filePath: string;
  errorCount: number;
  warningCount: number;
  disableCount: number;
}

export interface FormatterLimits {
  maxRules: number;
  maxFiles: number;
  maxExamplesPerRule: number;
  maxExamplesPerFile: number;
  maxMessageLength: number;
}

export interface LintEvidenceExample {
  ruleId: string;
  severity: "error" | "warning" | "unknown";
  filePath: string;
  line: number;
  column: number;
  message: string;
}

export interface LintEvidence {
  topRuleExamples: LintEvidenceExample[];
  topFileExamples: Array<{
    filePath: string;
    errorCount: number;
    warningCount: number;
    examples: LintEvidenceExample[];
  }>;
}

export interface EslintSummary {
  schemaVersion: string;
  generatedAt: string;
  lintResult: LintResult;
  ruleSummary: RuleSummaryItem[];
  fileSummary: FileSummaryItem[];
  evidence: LintEvidence;
  limits: FormatterLimits;
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  reasons: string[];
  recommendations: string[];
}

export interface Artifacts {
  outputDirectory: string;
  reportJson: string;
  summaryMarkdown: string;
  eslintSummaryJson: string;
  eslintReportJson: string | null;
  eslintConfigJson: string;
  lintLog: string;
}

export interface CheckerReport {
  schemaVersion: string;
  checkerVersion: string;
  generatedAt: string;
  systemInfo: SystemInfo;
  gitInfo: GitInfo;
  projectInfo: ProjectInfo;
  eslintAccess: EslintAccess;
  eslintConfigAnalysis: EslintConfigAnalysis;
  eslintResolvedConfig: EslintResolvedConfig;
  eslintDisableAnalysis: EslintDisableAnalysis;
  lintExecution: LintExecution;
  lintRecovery: LintRecovery;
  lintResult: LintResult;
  ruleSummary: RuleSummaryItem[];
  fileSummary: FileSummaryItem[];
  lintEvidence: LintEvidence;
  riskAssessment: RiskAssessment;
  artifacts: Artifacts;
}
