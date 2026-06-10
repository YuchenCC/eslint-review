import path from "node:path";
import fg from "fast-glob";
import type { EslintDisableAnalysis, FileSummaryItem, SourceEntries } from "../types.js";
import { readTextFile } from "../utils/fs.js";

const DISABLE_PATTERN = /eslint-disable(?<modifier>-next-line|-line)?(?<rules>[^\n\r*]*)/g;
const SOURCE_FILE_EXTENSIONS = "{js,jsx,ts,tsx,vue}";

export async function scanEslintDisable(cwd: string, sourceEntries: SourceEntries): Promise<EslintDisableAnalysis> {
  const scannedDirectory = sourceEntries.entries.join(", ");
  const eslintIgnorePatterns = sourceEntries.eslintIgnorePatterns ?? [];
  const effectiveIgnorePatterns = [...sourceEntries.ignorePatterns, ...eslintIgnorePatterns];
  if (sourceEntries.entries.length === 0) {
    return {
      status: "skipped",
      scannedDirectory,
      eslintIgnorePatterns,
      effectiveIgnorePatterns,
      totalDisableCount: 0,
      fileLevelDisableCount: 0,
      disableWithoutRuleCount: 0,
      broadDisableCount: 0,
      topFiles: [],
      findings: ["no_source_entries"]
    };
  }

  const files = await fg(
    sourceEntries.entries.map((entry) => `${entry}/**/*.${SOURCE_FILE_EXTENSIONS}`),
    {
      cwd,
      onlyFiles: true,
      unique: true,
      ignore: effectiveIgnorePatterns
    }
  );

  if (files.length === 0) {
    return {
      status: "skipped",
      scannedDirectory,
      eslintIgnorePatterns,
      effectiveIgnorePatterns,
      totalDisableCount: 0,
      fileLevelDisableCount: 0,
      disableWithoutRuleCount: 0,
      broadDisableCount: 0,
      topFiles: [],
      findings: ["src_not_found"]
    };
  }

  let totalDisableCount = 0;
  let fileLevelDisableCount = 0;
  let disableWithoutRuleCount = 0;
  let broadDisableCount = 0;
  const topFiles: FileSummaryItem[] = [];

  for (const filePath of files.sort()) {
    const content = await readTextFile(path.join(cwd, filePath));
    if (!content) {
      continue;
    }

    let disableCount = 0;
    for (const match of content.matchAll(DISABLE_PATTERN)) {
      const modifier = match.groups?.modifier;
      const ruleText = normalizeRuleText(match.groups?.rules ?? "");
      disableCount += 1;
      totalDisableCount += 1;

      if (modifier === undefined) {
        fileLevelDisableCount += 1;
      }
      if (ruleText.length === 0) {
        disableWithoutRuleCount += 1;
      }
      if (ruleText.length === 0 || ruleText.split(",").length > 1) {
        broadDisableCount += 1;
      }
    }

    if (disableCount > 0) {
      topFiles.push({
        filePath,
        errorCount: 0,
        warningCount: 0,
        disableCount
      });
    }
  }

  topFiles.sort((left, right) => right.disableCount - left.disableCount || left.filePath.localeCompare(right.filePath));

  return {
    status: "success",
    scannedDirectory,
    eslintIgnorePatterns,
    effectiveIgnorePatterns,
    totalDisableCount,
    fileLevelDisableCount,
    disableWithoutRuleCount,
    broadDisableCount,
    topFiles: topFiles.slice(0, 10),
    findings: buildFindings({
      eslintIgnorePatterns,
      totalDisableCount,
      fileLevelDisableCount,
      disableWithoutRuleCount,
      broadDisableCount
    })
  };
}

function normalizeRuleText(ruleText: string): string {
  return ruleText.replace(/\/\//g, "").replace(/\*\//g, "").trim();
}

function buildFindings({
  eslintIgnorePatterns,
  totalDisableCount,
  fileLevelDisableCount,
  disableWithoutRuleCount,
  broadDisableCount
}: Pick<
  EslintDisableAnalysis,
  "eslintIgnorePatterns" | "totalDisableCount" | "fileLevelDisableCount" | "disableWithoutRuleCount" | "broadDisableCount"
>): string[] {
  const findings: string[] = [];
  if (eslintIgnorePatterns.length > 0) {
    const patternLabel = eslintIgnorePatterns.length === 1 ? "pattern" : "patterns";
    findings.push(`.eslintignore excludes ${eslintIgnorePatterns.length} ${patternLabel} from ESLint disable scanning`);
  }
  if (totalDisableCount > 0) {
    findings.push(`Found ${totalDisableCount} ESLint disable comments in src`);
  }
  if (fileLevelDisableCount > 0) {
    findings.push(`Found ${fileLevelDisableCount} file-level ESLint disable comments`);
  }
  if (disableWithoutRuleCount > 0) {
    findings.push(`Found ${disableWithoutRuleCount} disable comments without explicit rule names`);
  }
  if (broadDisableCount > 0) {
    findings.push(`Found ${broadDisableCount} broad ESLint disable comments`);
  }
  return findings;
}
