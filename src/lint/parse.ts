import path from "node:path";
import type { FileSummaryItem, LintResult, RuleSummaryItem } from "../types.js";
import { readJsonFile } from "../utils/fs.js";

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
  fatal?: boolean;
}

export interface ParsedEslintJson {
  lintResult: LintResult;
  ruleSummary: RuleSummaryItem[];
  fileSummary: FileSummaryItem[];
}

export async function parseEslintJson(reportPath: string): Promise<ParsedEslintJson> {
  const files = await readJsonFile<EslintJsonFile[]>(reportPath);
  if (!Array.isArray(files)) {
    return {
      lintResult: {
        status: "failed",
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        fileCount: 0,
        failureReason: "eslint_json_unavailable"
      },
      ruleSummary: [],
      fileSummary: []
    };
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
      fileCount: files.length
    },
    ruleSummary: [...ruleCounts.values()].sort((left, right) => right.count - left.count || left.ruleId.localeCompare(right.ruleId)),
    fileSummary
  };
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
