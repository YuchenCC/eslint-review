import path from "node:path";
import type { FileSummaryItem, LintEvidence, LintResult, RuleSummaryItem } from "../types.js";
import { pathExists, readJsonFile } from "../utils/fs.js";

interface EslintJsonFile {
  filePath: string;
  errorCount?: number;
  warningCount?: number;
  fixableErrorCount?: number;
  fixableWarningCount?: number;
  messages?: EslintJsonMessage[];
}

interface EslintJsonMessage {
  ruleId?: string | null;
  severity?: number;
  fix?: unknown;
}

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

export type ParsedEslintJson = ParsedEslintSummary;

export async function parseEslintJson(reportPath: string): Promise<ParsedEslintJson> {
  const files = await readJsonFile<unknown>(reportPath);
  if (!isEslintJsonFiles(files)) {
    return failedSummary("eslint_json_unavailable");
  }

  const ruleCounts = new Map<string, RuleSummaryItem>();
  let errorCount = 0;
  let warningCount = 0;
  let fixableErrorCount = 0;
  let fixableWarningCount = 0;

  const fileSummary = files.map((file) => {
    const fileErrorCount = file.errorCount ?? 0;
    const fileWarningCount = file.warningCount ?? 0;
    errorCount += fileErrorCount;
    warningCount += fileWarningCount;
    fixableErrorCount += file.fixableErrorCount ?? 0;
    fixableWarningCount += file.fixableWarningCount ?? 0;

    for (const message of file.messages ?? []) {
      const ruleId = message.ruleId ?? "fatal";
      const existing = ruleCounts.get(ruleId) ?? {
        ruleId,
        severity: severityName(message.severity),
        count: 0,
        fixableCount: 0
      };
      existing.count += 1;
      if (message.fix !== undefined) {
        existing.fixableCount += 1;
      }
      ruleCounts.set(ruleId, existing);
    }

    return {
      filePath: normalizeFilePath(file.filePath),
      errorCount: fileErrorCount,
      warningCount: fileWarningCount,
      disableCount: 0
    };
  });

  return {
    lintResult: {
      status: "success",
      errorCount,
      warningCount,
      fixableErrorCount,
      fixableWarningCount,
      fileCount: files.length,
      problemFileCount: fileSummary.filter((file) => file.errorCount + file.warningCount > 0).length
    },
    ruleSummary: [...ruleCounts.values()].sort((left, right) => right.count - left.count || left.ruleId.localeCompare(right.ruleId)),
    fileSummary,
    lintEvidence: emptyEvidence()
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

function isEslintJsonFiles(value: unknown): value is EslintJsonFile[] {
  return Array.isArray(value) && value.every(isEslintJsonFile);
}

function isEslintJsonFile(value: unknown): value is EslintJsonFile {
  return (
    isRecord(value) &&
    typeof value.filePath === "string" &&
    isOptionalNumber(value.errorCount) &&
    isOptionalNumber(value.warningCount) &&
    isOptionalNumber(value.fixableErrorCount) &&
    isOptionalNumber(value.fixableWarningCount) &&
    (value.messages === undefined || (Array.isArray(value.messages) && value.messages.every(isEslintJsonMessage)))
  );
}

function isEslintJsonMessage(value: unknown): value is EslintJsonMessage {
  return (
    isRecord(value) &&
    (value.ruleId === undefined || value.ruleId === null || typeof value.ruleId === "string") &&
    isOptionalNumber(value.severity)
  );
}

function isSeverity(value: unknown): value is RuleSummaryItem["severity"] {
  return value === "error" || value === "warning" || value === "unknown";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || isNumber(value);
}

function severityName(severity: number | undefined): RuleSummaryItem["severity"] {
  if (severity === 2) {
    return "error";
  }
  if (severity === 1) {
    return "warning";
  }
  return "unknown";
}

function normalizeFilePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function emptyEvidence(): LintEvidence {
  return {
    topRuleExamples: [],
    topFileExamples: []
  };
}
