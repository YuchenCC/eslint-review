# Proposal: eslint-checker-mvp

## Why

Frontend governance needs a repeatable way to check whether each project has ESLint connected, whether the configuration is meaningful, and what problems ESLint currently reports. Manual review is inconsistent, expensive, and difficult to aggregate. The first PRD draft is broad; this MVP narrows it to a single-project end-to-end loop that can reliably produce a formal iflycode report.

## Goals

- Provide a Node CLI package named `@sunny/eslint-checker`, exposed as the `eslint-checker` command.
- Let iflycode Skill orchestrate checker installation, execution, report discovery, and formal report generation.
- Detect ESLint access status and generate a report even when ESLint is not connected.
- For projects with ESLint connected, detect the technical stack, ESLint configuration environment, and lint scripts, then execute ESLint when possible.
- Maximize final report generation through controlled lint recovery for missing ESLint runtime dependencies.
- Analyze ESLint configuration quality, especially common rule categories being disabled.
- Scan only the `src` directory for `eslint-disable` usage and identify broad or excessive disabling.
- Emit a stable `report.json` protocol that iflycode can parse without guessing.

## Scope

The MVP supports one project at a time from the business project root. It outputs `.eslint-checker/report.json`, `.eslint-checker/summary.md`, `.eslint-checker/eslint-report.json`, and `.eslint-checker/lint-log.txt`.

The checker may install missing ESLint-related development dependencies during lint recovery. This is limited to dependencies required to load or run the existing ESLint configuration, such as shared configs, plugins, and parsers. It must record package and lockfile modifications in the report.

## Non-Goals

- No batch project summary.
- No unified company ESLint rule package.
- No CI gate or CI template.
- No web management platform.
- No automatic source code fixes and no ESLint `--fix`.
- No complex monorepo traversal.
- No automatic installation of general business project dependencies.
- No modification of existing ESLint configuration files.

## Success Criteria

- A project without ESLint still produces a structured report and formal iflycode report.
- A project with ESLint can run the checker and produce stable machine-readable output.
- Missing ESLint shared config, plugin, or parser dependencies are diagnosed, installed as dev dependencies when possible, and retried.
- ESLint config analysis reports disabled common format and quality rules.
- `src`-only disable scanning reports counts, file-level disables, disables without rule names, and concentrated disable usage.
- iflycode Skill can install/run `@sunny/eslint-checker`, wait for `.eslint-checker/report.json`, and generate a consistent formal report from report facts only.
