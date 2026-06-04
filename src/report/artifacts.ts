import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckerReport } from "../types.js";
import { checkerReportSchema } from "./schema.js";

export async function writeArtifacts(cwd: string, report: CheckerReport, lintLogText: string): Promise<void> {
  const outputPath = path.join(cwd, report.artifacts.outputDirectory);
  await mkdir(outputPath, { recursive: true });

  checkerReportSchema.parse(report);
  await writeFile(
    path.join(cwd, report.artifacts.reportJson),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  await writeFile(path.join(cwd, report.artifacts.summaryMarkdown), renderSummary(report), "utf8");
  await writeFile(path.join(cwd, report.artifacts.lintLog), `${lintLogText}\n`, "utf8");
}

function renderSummary(report: CheckerReport): string {
  return [
    "# ESLint Checker Summary",
    "",
    `Project: ${report.projectInfo.packageName}`,
    `Stack: ${report.projectInfo.stack}`,
    `ESLint access: ${report.eslintAccess.accessLevel}`,
    `Config analysis: ${report.eslintConfigAnalysis.status}`,
    `Disable count: ${report.eslintDisableAnalysis.totalDisableCount}`,
    `Lint execution: ${report.lintExecution.status}`,
    `Recovery: ${report.lintRecovery.status}`,
    `Risk: ${report.riskAssessment.level}`,
    "",
    "## Artifacts",
    "",
    `- report.json: ${report.artifacts.reportJson}`,
    `- summary.md: ${report.artifacts.summaryMarkdown}`,
    `- eslint-report.json: ${report.artifacts.eslintReportJson}`,
    `- lint-log.txt: ${report.artifacts.lintLog}`,
    ""
  ].join("\n");
}
