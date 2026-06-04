# Design: eslint-checker-mvp

## Architecture

The MVP has two cooperating parts:

- `@sunny/eslint-checker` CLI: runs in the business project directory, performs factual discovery, optional lint execution, recovery, analysis, and artifact generation.
- iflycode Skill: orchestrates checker installation and execution, then turns `report.json` into a formal report.

The CLI owns all objective data collection. The Skill must treat `report.json` as the source of truth and must not invent or modify factual counts.

## CLI Flow

1. Validate execution directory and detect `package.json`.
2. Collect project information: package name, Git branch, commit, dirty state, Node version, package manager and package manager versions.
3. Detect technology stack: Vue, React, Umi, Next, Vite, Webpack, or `unknown`.
4. Detect ESLint access:
   - dependencies and devDependencies
   - flat config files
   - eslintrc files
   - `package.json eslintConfig`
   - lint scripts
5. Analyze ESLint config content where statically possible.
6. Scan `src` only for ESLint disable comments.
7. If ESLint is not connected, skip lint execution and write report artifacts.
8. If ESLint is connected or partially connected, execute ESLint in JSON format.
9. On missing ESLint runtime dependency failures, perform lint recovery and retry with a bounded retry count.
10. Parse ESLint JSON output where available.
11. Write `report.json`, `summary.md`, `eslint-report.json`, and `lint-log.txt`.

## ESLint Execution

MVP execution is conservative. The checker does not run `--fix` and does not change source files. It prefers project-local ESLint and writes commands and output to `lint-log.txt`.

The default execution command is conceptually:

```bash
npx eslint . -f json -o .eslint-checker/eslint-report.json
```

The checker records discovered lint scripts, but the MVP uses a unified JSON-oriented command so the output is parseable.

## Lint Recovery

Lint recovery is enabled by default to maximize successful report generation. It handles common dependency-load failures:

- missing shared config packages referenced by `extends`
- missing ESLint plugins
- missing parsers such as `@typescript-eslint/parser`
- common Vue, React, TypeScript ESLint ecosystem package gaps

Recovery may modify `package.json` and lockfiles by installing missing ESLint-related packages as dev dependencies. It must not alter ESLint config files or source code. It must record installed packages, install command, modified files, retry count, and final status.

## Config Quality Analysis

The checker should statically inspect ESLint configuration where feasible. It should detect high-signal risks rather than fully interpret every config branch.

Findings include:

- common format rules disabled, such as `semi`, `quotes`, `indent`, `comma-dangle`, and `max-len`
- common quality rules disabled, such as `no-unused-vars`, `no-console`, `eqeqeq`, and `curly`
- stack-specific key rules disabled, such as `@typescript-eslint/no-unused-vars`, `vue/multi-word-component-names`, and `react-hooks/rules-of-hooks`
- large numbers of disabled rules
- cases where `extends` points to a standard config but local overrides disable many rules
- config files that cannot be safely parsed

## Disable Scan

The checker scans only `src` and ignores all other directories for this MVP. It detects:

- `/* eslint-disable */`
- `/* eslint-disable rule-a, rule-b */`
- `// eslint-disable-next-line`
- `// eslint-disable-line`
- file-level disables
- disables without explicit rule names
- files with concentrated disable usage

The output is a risk-oriented summary, not a full source-code report.

## Report Protocol

`report.json` must include stable top-level sections:

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

Missing data is represented explicitly as `unknown`, `not_collected`, empty arrays, or failure reason fields. The Skill should not infer absent facts.

## iflycode Skill Flow

1. Confirm the business project root or provided project path.
2. Run `@sunny/eslint-checker` from the internal npm registry.
3. Prefer direct scoped package execution:

```bash
npx @sunny/eslint-checker --mode full --for-iflycode
```

4. If direct execution is not available, install the checker as a dev dependency and run `npx eslint-checker`.
5. Wait for `.eslint-checker/report.json`.
6. If the report exists, validate and generate the formal report using only report data.
7. If installation or execution fails before report generation, output a "check incomplete" formal report with failure cause and manual next steps.

## Formal Report Template

The Skill produces a consistent report with these sections:

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

## Error Handling

The checker should generate a final report whenever possible. It must handle:

- missing `package.json`
- no ESLint dependency or config
- missing `node_modules`
- ESLint load failures
- missing parser, plugin, or shared config
- timeout
- invalid JSON output
- config parse failures

Failures are not silent. Each failure path writes a structured status, failure reason, logs, and recommended next action.
