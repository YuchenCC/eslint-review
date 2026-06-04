import type { FileSummaryItem, LintEvidence, LintResult, RuleSummaryItem } from "../types.js";
import { pathExists, readJsonFile } from "../utils/fs.js";

export interface ParsedEslintSummary {
  lintResult: LintResult;
  ruleSummary: RuleSummaryItem[];
  fileSummary: FileSummaryItem[];
  lintEvidence: LintEvidence;
}

const EMPTY_EVIDENCE: LintEvidence = {
  topRuleExamples: [],
  topFileExamples: []
};

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
    lintEvidence: isLintEvidence(summary.evidence) ? summary.evidence : EMPTY_EVIDENCE
  };
}

export type ParsedEslintJson = ParsedEslintSummary;

export async function parseEslintJson(reportPath: string): Promise<ParsedEslintJson> {
  return parseEslintSummary(reportPath);
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
    lintEvidence: EMPTY_EVIDENCE
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
    isRecord(value.lintResult) &&
    Array.isArray(value.ruleSummary) &&
    Array.isArray(value.fileSummary) &&
    (value.evidence === undefined || isLintEvidence(value.evidence))
  );
}

function isLintEvidence(value: unknown): value is LintEvidence {
  return isRecord(value) && Array.isArray(value.topRuleExamples) && Array.isArray(value.topFileExamples);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
