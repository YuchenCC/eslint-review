import { z } from "zod";

const lintEvidenceExampleSchema = z.object({
  ruleId: z.string(),
  severity: z.union([z.literal("error"), z.literal("warning"), z.literal("unknown")]),
  filePath: z.string(),
  line: z.number(),
  column: z.number(),
  message: z.string()
});

const lintEvidenceSchema = z.object({
  topRuleExamples: z.array(lintEvidenceExampleSchema),
  topFileExamples: z.array(
    z.object({
      filePath: z.string(),
      errorCount: z.number(),
      warningCount: z.number(),
      examples: z.array(lintEvidenceExampleSchema)
    })
  )
});

export const checkerReportSchema = z.object({
  schemaVersion: z.string(),
  checkerVersion: z.string(),
  generatedAt: z.string(),
  systemInfo: z.object({
    system: z.string(),
    center: z.string(),
    owner: z.string(),
    nodeVersion: z.string(),
    packageManager: z.string(),
    packageManagerVersion: z.string(),
    cwd: z.string()
  }),
  gitInfo: z.object({
    branch: z.string(),
    commit: z.string(),
    dirty: z.union([z.boolean(), z.literal("unknown")]),
    status: z.string()
  }),
  projectInfo: z.object({
    hasPackageJson: z.boolean(),
    packageName: z.string(),
    packageVersion: z.string(),
    stack: z.string(),
    dependencies: z.array(z.string()),
    devDependencies: z.array(z.string()),
    packageManagerLockfile: z.string()
  }),
  eslintAccess: z.object({
    accessLevel: z.string(),
    eslintDependencyDetected: z.boolean(),
    eslintPackages: z.array(z.string()),
    eslintConfigDetected: z.boolean(),
    configFiles: z.array(z.string()),
    packageJsonEslintConfigDetected: z.boolean(),
    lintScriptDetected: z.boolean(),
    lintScripts: z.record(z.string())
  }),
  eslintConfigAnalysis: z.object({
    status: z.string(),
    analyzedFiles: z.array(z.string()),
    extendedConfigs: z.array(z.string()),
    extendedPackages: z.array(z.string()),
    disabledFormatRules: z.array(z.string()),
    disabledQualityRules: z.array(z.string()),
    disabledStackRules: z.array(z.string()),
    disabledRuleCount: z.number(),
    weakenedStandardConfig: z.boolean(),
    limitations: z.array(z.string()),
    findings: z.array(z.string())
  }),
  eslintResolvedConfig: z.object({
    status: z.string(),
    command: z.string(),
    timeoutSeconds: z.number(),
    exitCode: z.number().nullable(),
    durationMs: z.number().nullable(),
    targetFile: z.string(),
    outputPath: z.string(),
    skippedReason: z.string().optional(),
    failureReason: z.string().optional()
  }),
  eslintDisableAnalysis: z.object({
    status: z.string(),
    scannedDirectory: z.string(),
    totalDisableCount: z.number(),
    fileLevelDisableCount: z.number(),
    disableWithoutRuleCount: z.number(),
    broadDisableCount: z.number(),
    topFiles: z.array(z.unknown()),
    findings: z.array(z.string())
  }),
  lintExecution: z.object({
    status: z.string(),
    command: z.string(),
    timeoutSeconds: z.number(),
    exitCode: z.number().nullable(),
    durationMs: z.number().nullable()
  }),
  lintRecovery: z.object({
    enabled: z.boolean(),
    attempted: z.boolean(),
    status: z.string(),
    retryCount: z.number(),
    installedPackages: z.array(z.string()),
    installCommand: z.string(),
    modifiedFiles: z.array(z.string())
  }),
  lintResult: z.object({
    status: z.string(),
    errorCount: z.number(),
    warningCount: z.number(),
    fixableErrorCount: z.number(),
    fixableWarningCount: z.number(),
    fileCount: z.number(),
    problemFileCount: z.number()
  }),
  ruleSummary: z.array(z.unknown()),
  fileSummary: z.array(z.unknown()),
  lintEvidence: lintEvidenceSchema,
  riskAssessment: z.object({
    level: z.string(),
    score: z.number(),
    reasons: z.array(z.string()),
    recommendations: z.array(z.string())
  }),
  artifacts: z.object({
    outputDirectory: z.string(),
    reportJson: z.string(),
    summaryMarkdown: z.string(),
    eslintSummaryJson: z.string(),
    eslintReportJson: z.string().nullable(),
    eslintConfigJson: z.string(),
    lintLog: z.string()
  })
});
