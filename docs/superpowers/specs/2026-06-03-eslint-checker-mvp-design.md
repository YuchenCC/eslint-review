---
comet_change: eslint-checker-mvp
role: technical-design
canonical_spec: openspec
archived-with: 2026-06-04-eslint-checker-mvp
status: final
---

# eslint-checker-mvp Design

## Summary

Build a single-project ESLint governance checker MVP. The CLI package is `@sunny/eslint-checker`, exposed as `eslint-checker`. The iflycode Skill orchestrates installing and running the checker, waits for `.eslint-checker/report.json`, and generates a formal report from that data only.

## Goals

- Generate reports even when ESLint is not connected.
- Detect technology stack, ESLint access status, configuration files, lint scripts, and package manager context.
- Execute ESLint for connected or partially connected projects when possible.
- Recover from common missing ESLint runtime dependencies by installing missing dev dependencies and retrying.
- Analyze ESLint configuration quality for common disabled format, quality, and stack-specific rules.
- Scan only `src` for `eslint-disable` usage and flag broad or excessive disabling.
- Produce a stable `report.json` protocol that iflycode can read reliably.

## Explicit Cuts

MVP excludes batch summary, unified rule packages, CI gates, web platform, source-code auto-fix, complex monorepo traversal, automatic installation of general business dependencies, and modification of ESLint config files.

## CLI Design

The CLI runs from the business project root. It writes:

- `.eslint-checker/report.json`
- `.eslint-checker/summary.md`
- `.eslint-checker/eslint-report.json`
- `.eslint-checker/lint-log.txt`

The CLI flow is:

1. Validate `package.json`.
2. Collect project, Git, Node, and package manager information.
3. Detect stack: Vue, React, Umi, Next, Vite, Webpack, or `unknown`.
4. Detect ESLint access from dependencies, config files, `eslintConfig`, and scripts.
5. Analyze ESLint configuration for disabled common rules and parse limitations.
6. Scan `src` for ESLint disable comments.
7. If ESLint is not connected, skip lint execution and write report artifacts.
8. If ESLint is connected or partially connected, execute ESLint in JSON mode.
9. Diagnose missing shared config, plugin, or parser failures, install missing ESLint-related dev dependencies, and retry with a bounded retry count.
10. Parse available ESLint JSON output and write final artifacts.

## Lint Recovery

Recovery is enabled by default. It may modify `package.json` and lockfiles only to install missing ESLint-related dev dependencies needed to load the existing config. It never changes source files, never runs `--fix`, and never edits ESLint config. It records installed packages, install command, modified files, retry count, and final status.

## Config Analysis

The checker performs high-signal static analysis rather than complete semantic interpretation. It flags common format rules disabled, common quality rules disabled, stack-specific key rules disabled, unusually high disabled-rule counts, and local overrides that weaken an extended standard config. If a config cannot be parsed safely, the report records that limitation.

## Disable Scan

The checker scans only `src` for `eslint-disable`, `eslint-disable-next-line`, and `eslint-disable-line`. It reports total count, file-level disables, disables without rule names, and top files by disable count.

## Report Protocol

`report.json` must include:

- `schemaVersion`
- `checkerVersion`
- `generatedAt`
- `systemInfo`
- `gitInfo`
- `projectInfo`
- `eslintAccess`
- `eslintConfigAnalysis`
- `eslintDisableAnalysis`
- `lintExecution`
- `lintRecovery`
- `lintResult`
- `ruleSummary`
- `fileSummary`
- `riskAssessment`
- `artifacts`

Absent facts must be explicit, such as `unknown`, `not_collected`, empty arrays, or failure reason fields.

## iflycode Skill Design

The Skill prefers execution orchestration. It confirms the business project root, runs:

```bash
npx @sunny/eslint-checker --mode full --for-iflycode
```

If direct `npx` execution is unavailable, it installs the checker as a dev dependency and runs `npx eslint-checker`. It waits for `.eslint-checker/report.json`; if present, it validates and generates the formal report from report facts only. If checker installation or execution fails before report generation, it outputs a check-incomplete report with the failure reason and manual next steps.

## Formal Report

The formal report uses these sections:

1. 检查概况
2. ESLint 接入情况
3. ESLint 配置质量分析
4. eslint-disable 使用分析
5. 检查执行情况
6. 问题统计情况
7. 主要问题分析
8. 自动修复与重试记录
9. 风险评估
10. 整改建议
11. 后续跟踪建议

## Testing Focus

Cover no ESLint, partial ESLint, missing shared config, missing parser, missing plugin, disabled common rules, heavy `src` disable usage, successful lint execution, ESLint timeout, and invalid JSON output.
