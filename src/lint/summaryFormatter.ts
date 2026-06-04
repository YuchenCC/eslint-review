import path from "node:path";
import type {
  EslintSummary,
  FileSummaryItem,
  FormatterLimits,
  LintEvidence,
  LintEvidenceExample,
  RuleSummaryItem
} from "../types.js";

export interface EslintFormatterMessage {
  ruleId?: string | null;
  severity?: number;
  line?: number;
  column?: number;
  message?: string;
  fix?: unknown;
}

export interface EslintFormatterResult {
  filePath: string;
  errorCount?: number;
  warningCount?: number;
  fixableErrorCount?: number;
  fixableWarningCount?: number;
  messages?: EslintFormatterMessage[];
}

export interface BuildEslintSummaryOptions {
  cwd?: string;
  limits?: Partial<FormatterLimits>;
}

export const DEFAULT_FORMATTER_LIMITS: FormatterLimits = {
  maxRules: 20,
  maxFiles: 20,
  maxExamplesPerRule: 3,
  maxExamplesPerFile: 3,
  maxMessageLength: 200
};

export function buildEslintSummary(
  results: EslintFormatterResult[],
  options: BuildEslintSummaryOptions = {}
): EslintSummary {
  const limits = { ...DEFAULT_FORMATTER_LIMITS, ...options.limits };
  const ruleCounts = new Map<string, RuleSummaryItem>();
  const examplesByRule = new Map<string, LintEvidenceExample[]>();
  const fileExamplesByPath = new Map<string, LintEvidence["topFileExamples"][number]>();
  let errorCount = 0;
  let warningCount = 0;
  let fixableErrorCount = 0;
  let fixableWarningCount = 0;

  const allFileSummaries: FileSummaryItem[] = [];

  for (const result of results) {
    const filePath = normalizeFilePath(result.filePath, options.cwd);
    const fileErrorCount = result.errorCount ?? 0;
    const fileWarningCount = result.warningCount ?? 0;
    errorCount += fileErrorCount;
    warningCount += fileWarningCount;
    fixableErrorCount += result.fixableErrorCount ?? 0;
    fixableWarningCount += result.fixableWarningCount ?? 0;

    const fileSummary = {
      filePath,
      errorCount: fileErrorCount,
      warningCount: fileWarningCount,
      disableCount: 0
    };
    allFileSummaries.push(fileSummary);

    const fileExamples: LintEvidenceExample[] = [];
    for (const message of result.messages ?? []) {
      const ruleId = message.ruleId ?? "fatal";
      const severity = severityName(message.severity);
      const existing = ruleCounts.get(ruleId) ?? {
        ruleId,
        severity,
        count: 0,
        fixableCount: 0
      };
      existing.count += 1;
      existing.severity = promotedSeverity(existing.severity, severity);
      if (message.fix !== undefined) {
        existing.fixableCount += 1;
      }
      ruleCounts.set(ruleId, existing);

      const evidence = {
        ruleId,
        severity,
        filePath,
        line: message.line ?? 0,
        column: message.column ?? 0,
        message: truncateMessage(message.message ?? "", limits.maxMessageLength)
      };

      const ruleExamples = examplesByRule.get(ruleId) ?? [];
      if (ruleExamples.length < limits.maxExamplesPerRule) {
        ruleExamples.push(evidence);
        examplesByRule.set(ruleId, ruleExamples);
      }
      if (fileExamples.length < limits.maxExamplesPerFile) {
        fileExamples.push(evidence);
      }
    }

    if (fileExamples.length > 0) {
      fileExamplesByPath.set(filePath, {
        ...fileSummary,
        examples: fileExamples
      });
    }
  }

  const ruleSummary = [...ruleCounts.values()]
    .sort((left, right) => right.count - left.count || left.ruleId.localeCompare(right.ruleId))
    .slice(0, limits.maxRules);
  const fileSummary = allFileSummaries
    .sort((left, right) => problemCount(right) - problemCount(left) || left.filePath.localeCompare(right.filePath))
    .slice(0, limits.maxFiles);
  const retainedFilePaths = new Set(fileSummary.map((file) => file.filePath));

  return {
    schemaVersion: "0.1.0",
    generatedAt: new Date().toISOString(),
    lintResult: {
      status: "success",
      errorCount,
      warningCount,
      fixableErrorCount,
      fixableWarningCount,
      fileCount: results.length,
      problemFileCount: allFileSummaries.filter((file) => problemCount(file) > 0).length
    },
    ruleSummary,
    fileSummary,
    evidence: {
      topRuleExamples: ruleSummary.flatMap((rule) => examplesByRule.get(rule.ruleId) ?? []),
      topFileExamples: fileSummary
        .map((file) => fileExamplesByPath.get(file.filePath))
        .filter((file): file is LintEvidence["topFileExamples"][number] => file !== undefined && retainedFilePaths.has(file.filePath))
    },
    limits
  };
}

export function formatter(results: EslintFormatterResult[]): string {
  return `${JSON.stringify(buildEslintSummary(results, { cwd: process.cwd() }), null, 2)}\n`;
}

export default formatter;

function severityName(severity: number | undefined): RuleSummaryItem["severity"] {
  if (severity === 2) {
    return "error";
  }
  if (severity === 1) {
    return "warning";
  }
  return "unknown";
}

function promotedSeverity(
  current: RuleSummaryItem["severity"],
  next: RuleSummaryItem["severity"]
): RuleSummaryItem["severity"] {
  if (current === "error" || next === "error") {
    return "error";
  }
  if (current === "warning" || next === "warning") {
    return "warning";
  }
  return "unknown";
}

function normalizeFilePath(filePath: string, cwd?: string): string {
  const relativePath = cwd && path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  return relativePath.replaceAll("\\", "/");
}

function truncateMessage(message: string, maxLength: number): string {
  return message.length > maxLength ? message.slice(0, maxLength) : message;
}

function problemCount(file: Pick<FileSummaryItem, "errorCount" | "warningCount">): number {
  return file.errorCount + file.warningCount;
}
