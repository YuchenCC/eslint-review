---
name: iflycode-eslint-report
description: Run @sunny/eslint-checker in a business project and generate a formal ESLint governance report from report.json only.
---

# iflycode ESLint Report

Use this workflow when asked to produce an ESLint governance report for a JavaScript or TypeScript project.

## Inputs

- Business project root. If not provided, ask for the path before running commands.
- Optional report metadata: system, center, owner.

## Run Checker

From the business project root, run:

```bash
npx @sunny/eslint-checker --mode full --for-iflycode
```

If direct scoped execution is unavailable, install and run:

```bash
npm install -D @sunny/eslint-checker
npx eslint-checker --mode full --for-iflycode
```

Wait for `.eslint-checker/report.json`. If it is missing, inspect `.eslint-checker/lint-log.txt` when available and produce an incomplete-check report with the failure cause.

## Formal Report Rules

- Treat `.eslint-checker/report.json` as the only source of factual counts and statuses.
- Do not invent lint counts, disabled-rule counts, package data, or execution status.
- Use `unknown`, `not_collected`, `skipped`, or recorded failure reasons when facts are absent.
- Mention generated artifacts: `report.json`, `summary.md`, `eslint-report.json`, and `lint-log.txt`.

## Report Sections

1. Project overview: package, stack, Git status, Node/package manager.
2. ESLint access: dependency, config, `eslintConfig`, and lint script status.
3. Config quality: disabled format, quality, and stack-specific rules.
4. Disable usage: total disables, file-level disables, broad disables, and concentrated files.
5. Lint execution: command, status, timeout, exit code, and recovery.
6. Findings and risk: use `riskAssessment` reasons and recommendations.
7. Next steps: only recommendations supported by report data.
