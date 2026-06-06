# Design: refine-eslint-report-template

## Overview

The report workflow should separate factual extraction from human-facing presentation.

- `.eslint-checker/report.json` remains the single source of truth.
- The key-data artifact normalizes important fields into a stable aggregation contract.
- The Markdown report uses a strict chapter template so every project report has the same structure, ordering, and evidence style.

All non-technical prose should be Chinese. Technical terms and keywords such as `ESLint`, `report.json`, `dependency`, `lint script`, `riskAssessment`, `eslintConfigAnalysis`, `disable`, `rule`, `warning`, `error`, `exitCode`, and `timeout` should remain English.

## Output Artifacts

### Key Data Artifact

Recommended file name: `.eslint-checker/iflycode-key-data.json`.

Purpose: support later multi-project aggregation without reparsing delivery prose.

Required top-level shape:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "unknown",
  "project": {},
  "environment": {},
  "eslintAccess": {},
  "configQuality": {},
  "disableUsage": {},
  "lintExecution": {},
  "lintResult": {},
  "risk": {},
  "recommendations": [],
  "artifacts": {}
}
```

Field rules:

- Every field must be derived from `.eslint-checker/report.json`.
- Missing values must use `unknown`, `not_collected`, `skipped`, `not_applicable`, or the recorded failure reason.
- Numeric count fields must be numbers when known and `null` only when not collected.
- Status fields should use stable enum-like strings already present in `report.json` where possible.
- Evidence examples should remain bounded and should reference only recorded `lintEvidence`.
- Before writing final artifacts, any human-owned field that would be emitted as `unknown` must be presented to the user through an interactive prompt. User-provided values must be applied consistently to both key data and the Markdown report.
- Machine-collected facts that are `not_collected`, `skipped`, or failed must not be manually replaced by user guesses. Preserve the recorded status or failure reason.

Recommended key fields:

| Area | Fields |
| --- | --- |
| project | `packageName`, `packageVersion`, `stack`, `gitBranch`, `gitDirty`, `projectRootLabel` |
| environment | `nodeVersion`, `packageManager`, `packageManagerVersion` |
| eslintAccess | `dependencyStatus`, `configStatus`, `eslintConfigStatus`, `lintScriptStatus` |
| configQuality | `qualityStatus`, `disabledFormat`, `stackRuleCoverage`, `resolvedConfigStatus` |
| disableUsage | `totalDisables`, `fileLevelDisables`, `broadDisables`, `concentratedFiles` |
| lintExecution | `command`, `status`, `timeoutSeconds`, `exitCode`, `recoveryStatus`, `failureReason` |
| lintResult | `errorCount`, `warningCount`, `fixableErrorCount`, `fixableWarningCount`, `topRules`, `topFiles` |
| risk | `level`, `reasons`, `governanceImpact`, `deliveryImpact` |
| recommendations | stable list of data-supported actions |
| artifacts | `reportJson`, `summaryMd`, `eslintSummaryJson`, `eslintConfigJson`, `lintLogTxt`, optional `eslintReportJson` |

### Markdown Report Artifact

Recommended file name: `.eslint-checker/iflycode-eslint-governance-report.md`.

Purpose: formal delivery document for a single project.

The Markdown report should be generated directly from `.eslint-checker/report.json` using the template below.

## Unknown Field Completion

Before generating `.eslint-checker/iflycode-key-data.json` and `.eslint-checker/iflycode-eslint-governance-report.md`, the workflow must scan the planned output for fields that would render as `unknown`.

For each user-fillable field, ask the user for the value and explain where it will appear. Typical fields include `system`, `center`, `owner`, `projectRootLabel`, and other business metadata not collected by the checker. If the user skips a field, keep `unknown` and list it in `9.3 未采集项` with reason `用户未提供`.

The workflow must not ask users to fill machine measurement fields such as lint counts, disable counts, execution status, `exitCode`, or config collection status. Those remain governed by `.eslint-checker/report.json`.

## Markdown Chapter Template

### 0. 封面

Required content:

- 报告标题：`ESLint 治理检查报告`
- 项目名称
- 系统/中心/负责人，若未提供则写 `unknown`
- 检查时间，来自报告数据；缺失时写 `unknown`
- 数据来源声明：本报告基于 `.eslint-checker/report.json` 生成

### 1. 执行摘要

Purpose: give managers and owners a stable first-page summary.

Subsections:

1. `1.1 检查结论`: one of `通过`, `需治理`, `检查未完成`, mapped from factual status and risk.
2. `1.2 核心指标`: compact table with ESLint access, config quality, disable usage, lint execution, lint issue counts, risk level.
3. `1.3 主要风险`: up to three risk reasons from `riskAssessment`.
4. `1.4 优先建议`: up to three recommendations supported by report data.

Fallback rule: if lint did not execute, the summary must clearly say `检查未完成` and cite the recorded failure reason.

### 2. 项目与环境概况

Subsections:

1. `2.1 项目信息`: package name/version, stack, project root label.
2. `2.2 Git 状态`: branch, dirty status, commit if available.
3. `2.3 Node 与包管理器`: Node version, package manager, package manager version.
4. `2.4 产物清单`: list generated artifacts and whether each exists.

Required distinction: mention `eslint-report.json` only when `artifacts.eslintReportJson` is present.

### 3. ESLint 接入状态

Subsections:

1. `3.1 dependency 状态`: whether ESLint dependency exists and where it is declared.
2. `3.2 config 状态`: config file or config source status.
3. `3.3 package.json eslintConfig 状态`: inline config status.
4. `3.4 lint script 状态`: available npm scripts and execution relevance.
5. `3.5 接入完整性判断`: concise conclusion from the previous four subsections.

Template rule: each subsection should include `状态`, `证据`, and `影响` rows.

### 4. Config 质量分析

Subsections:

1. `4.1 配置可维护性`: disabled format, parser/settings clarity, and maintainability facts from `eslintConfigAnalysis`.
2. `4.2 规则覆盖情况`: stack-specific rules and missing/weak coverage.
3. `4.3 resolved config 采集状态`: whether `eslint-config.json` was collected.
4. `4.4 Config 风险判断`: governance risk caused by current config quality.

Required distinction: `eslintConfigAnalysis` is static governance analysis; `eslintResolvedConfig` / `eslint-config.json` is the effective config emitted from ESLint `--print-config`.

### 5. Disable 使用分析

Subsections:

1. `5.1 disable 总量`: total disables and trend-neutral interpretation.
2. `5.2 file-level disable`: file-level disables and affected files.
3. `5.3 broad disable`: broad disables without specific rule names.
4. `5.4 集中度分析`: files with concentrated disables.
5. `5.5 治理影响`: explain maintainability and rule bypass risk.

Evidence rule: use file paths and counts only from recorded data. Do not infer intent from source code.

### 6. Lint 执行结果

Subsections:

1. `6.1 执行命令`: command and mode.
2. `6.2 执行状态`: status, timeout, exitCode.
3. `6.3 recovery 情况`: recovery status and reason.
4. `6.4 问题总览`: error/warning/fixable counts.
5. `6.5 Top rules`: top triggered rules when available.
6. `6.6 Top files`: top affected files when available.

Fallback rule: when lint execution is `skipped`, `failed`, or `timeout`, keep all result counts as not collected and explain why.

### 7. 代表性问题与风险

Subsections:

1. `7.1 代表性 lint evidence`: bounded examples from `lintEvidence`.
2. `7.2 rule 维度风险`: risk by high-frequency rules.
3. `7.3 file 维度风险`: risk by concentrated files.
4. `7.4 综合风险等级`: risk level and reasons from `riskAssessment`.

Evidence rule: examples must not expand beyond recorded `lintEvidence`; source code snippets are not required unless already present in the report data.

### 8. 治理建议与优先级

Subsections:

1. `8.1 P0 建议`: unblock or restore check execution.
2. `8.2 P1 建议`: reduce high-impact governance risks.
3. `8.3 P2 建议`: improve maintainability and long-term consistency.
4. `8.4 建议与证据映射`: table mapping recommendation to supporting report fields.

Rule: recommendations must be omitted or downgraded when the supporting fact is absent.

### 9. 附录

Subsections:

1. `9.1 字段口径`: explain major metrics and status meanings.
2. `9.2 数据来源`: list source artifacts.
3. `9.3 未采集项`: list unknown/not_collected/skipped items with reasons.

## Consistency Requirements

- The chapter order and subsection names are fixed.
- Each report must include every chapter. If a chapter has no data, it must contain a clear missing-data statement rather than being omitted.
- Tables should use the same column names across projects.
- The same status should produce the same Chinese wording across projects.
- Narrative analysis should be concise and evidence-bound.

## Error Handling

If `.eslint-checker/report.json` is missing:

- Generate no key-data artifact unless enough structured failure metadata exists outside `report.json`.
- Produce an incomplete-check Markdown report only from `lint-log.txt` and command failure context.
- Mark factual fields as `not_collected` and include the failure cause.

If `report.json` exists but optional fields are absent:

- Generate both artifacts.
- Preserve the template structure.
- Use stable fallback values and explain missing collection in Appendix `9.3`.

## Testing Strategy

- Add fixture-based tests for complete, no-ESLint, lint-failed, timeout, and missing-optional-field reports.
- Snapshot or golden-file test the key-data JSON shape.
- Validate the generated Markdown report contains all fixed chapters and subsection headings.
- Verify `eslint-report.json` is only mentioned when present in `artifacts.eslintReportJson`.
- Verify Chinese narrative with preserved English technical terms for key labels and artifact names.
