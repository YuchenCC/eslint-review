import type { CheckerReport, RiskAssessment } from "../types.js";

export function assessRisk(report: Omit<CheckerReport, "riskAssessment">): RiskAssessment {
  const reasons: string[] = [];
  const recommendations: string[] = [];
  let score = 0;

  if (report.eslintAccess.accessLevel === "not_connected") {
    score += 40;
    reasons.push("ESLint is not connected");
    recommendations.push("Add ESLint dependency, config, and lint script");
  } else if (report.eslintAccess.accessLevel === "partial") {
    score += 20;
    reasons.push("ESLint access is partial");
    if (report.eslintAccess.managedBy === "jupui") {
      recommendations.push("Install or restore jupui-managed project dependencies");
    } else {
      recommendations.push("Complete ESLint config and lint script setup");
    }
  }

  if (report.eslintConfigAnalysis.disabledRuleCount >= 10) {
    score += 30;
    reasons.push("Many ESLint rules are disabled");
  } else if (report.eslintConfigAnalysis.disabledRuleCount > 0) {
    score += 10;
    reasons.push("Some ESLint rules are disabled");
  }

  if (report.eslintDisableAnalysis.fileLevelDisableCount > 0) {
    score += 30;
    reasons.push("File-level ESLint disables are present");
    recommendations.push("Replace file-level disables with rule-specific suppressions");
  } else if (report.eslintDisableAnalysis.totalDisableCount > 0) {
    score += 10;
    reasons.push("ESLint disable comments are present");
  }

  if (report.lintResult.errorCount >= 50) {
    score += 40;
    reasons.push("ESLint reported at least 50 errors");
  } else if (report.lintResult.errorCount > 0) {
    score += 20;
    reasons.push("ESLint reported errors");
  }

  if (report.lintResult.warningCount >= 100) {
    score += 20;
    reasons.push("ESLint reported at least 100 warnings");
  }

  return {
    level: score >= 70 ? "high" : score >= 30 ? "medium" : "low",
    score,
    reasons,
    recommendations
  };
}
