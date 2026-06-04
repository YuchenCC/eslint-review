import type { FileSummaryItem, LintEvidence, LintResult, RuleSummaryItem } from "../types.js";
import { pathExists, readJsonFile } from "../utils/fs.js";

export interface ParsedEslintSummary {
  lintResult: LintResult;
  ruleSummary: RuleSummaryItem[];
  fileSummary: FileSummaryItem[];
  lintEvidence: LintEvidence;
}

export async function parseEslintSummary(summaryPath: string): Promise<ParsedEslintSummary> {
  if (!(await pathExists(summaryPath))) {
    return failedSummary("eslint_summary_unavailable");
  }

  const summary = await readJsonFile<unknown>(summaryPath);
  if (!isValidSummaryShape(summary)) {
    return failedSummary("eslint_summary_invalid");
  }

  return {
    lintResult: summary.lintResult,
    ruleSummary: summary.ruleSummary,
    fileSummary: summary.fileSummary,
    lintEvidence: isLintEvidence(summary.evidence) ? summary.evidence : emptyEvidence()
  };
}

function failedSummary(failureReason: string): ParsedEslintSummary {
  return {
    lintResult: {
      status: "failed",
      errorCount: 0,
      warningCount: 0,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      fileCount: 0,
      problemFileCount: 0,
      failureReason
    },
    ruleSummary: [],
    fileSummary: [],
    lintEvidence: emptyEvidence()
  };
}

function isValidSummaryShape(value: unknown): value is {
  lintResult: LintResult;
  ruleSummary: RuleSummaryItem[];
  fileSummary: FileSummaryItem[];
  evidence?: unknown;
} {
  return (
    isRecord(value) &&
    isLintResult(value.lintResult) &&
    Array.isArray(value.ruleSummary) &&
    value.ruleSummary.every(isRuleSummaryItem) &&
    Array.isArray(value.fileSummary) &&
    value.fileSummary.every(isFileSummaryItem) &&
    (value.evidence === undefined || isLintEvidence(value.evidence))
  );
}

function isLintEvidence(value: unknown): value is LintEvidence {
  return (
    isRecord(value) &&
    Array.isArray(value.topRuleExamples) &&
    value.topRuleExamples.every(isLintEvidenceExample) &&
    Array.isArray(value.topFileExamples) &&
    value.topFileExamples.every(isTopFileEvidence)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLintResult(value: unknown): value is LintResult {
  return (
    isRecord(value) &&
    typeof value.status === "string" &&
    isNumber(value.errorCount) &&
    isNumber(value.warningCount) &&
    isNumber(value.fixableErrorCount) &&
    isNumber(value.fixableWarningCount) &&
    isNumber(value.fileCount) &&
    isNumber(value.problemFileCount)
  );
}

function isRuleSummaryItem(value: unknown): value is RuleSummaryItem {
  return (
    isRecord(value) &&
    typeof value.ruleId === "string" &&
    isSeverity(value.severity) &&
    isNumber(value.count) &&
    isNumber(value.fixableCount)
  );
}

function isFileSummaryItem(value: unknown): value is FileSummaryItem {
  return (
    isRecord(value) &&
    typeof value.filePath === "string" &&
    isNumber(value.errorCount) &&
    isNumber(value.warningCount) &&
    isNumber(value.disableCount)
  );
}

function isLintEvidenceExample(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.ruleId === "string" &&
    isSeverity(value.severity) &&
    typeof value.filePath === "string" &&
    isNumber(value.line) &&
    isNumber(value.column) &&
    typeof value.message === "string"
  );
}

function isTopFileEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.filePath === "string" &&
    isNumber(value.errorCount) &&
    isNumber(value.warningCount) &&
    Array.isArray(value.examples) &&
    value.examples.every(isLintEvidenceExample)
  );
}

function isSeverity(value: unknown): value is RuleSummaryItem["severity"] {
  return value === "error" || value === "warning" || value === "unknown";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function emptyEvidence(): LintEvidence {
  return {
    topRuleExamples: [],
    topFileExamples: []
  };
}
