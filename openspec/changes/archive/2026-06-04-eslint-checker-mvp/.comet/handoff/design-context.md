# Comet Design Handoff

- Change: eslint-checker-mvp
- Phase: design
- Mode: compact
- Context hash: e5c1ee3a52e4cd97723bc5aa461637487a2e1414039a6d2b40c289ec700df91c

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/eslint-checker-mvp/proposal.md

- Source: openspec/changes/eslint-checker-mvp/proposal.md
- Lines: 1-42
- SHA256: f0778f7a5eae52c825d4224470125fe9b730e92e6f3daddeef646ca356ee8f8a

```md
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
```

## openspec/changes/eslint-checker-mvp/design.md

- Source: openspec/changes/eslint-checker-mvp/design.md
- Lines: 1-148
- SHA256: 61aacf1186c3367940ef8623944361dad341adf6ad7f59a40436e6837d135c8b

[TRUNCATED]

```md
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

```

Full source: openspec/changes/eslint-checker-mvp/design.md

## openspec/changes/eslint-checker-mvp/tasks.md

- Source: openspec/changes/eslint-checker-mvp/tasks.md
- Lines: 1-16
- SHA256: 6db76dc1c9ac1d0f674f8b9fbf9f25b34f1fddb08fbc455a0974a83934696f3f

```md
# Tasks: eslint-checker-mvp

- [ ] Initialize the `@sunny/eslint-checker` Node CLI package and expose the `eslint-checker` command.
- [ ] Implement project root validation and baseline project, Git, Node, and package manager discovery.
- [ ] Implement technology stack detection for Vue, React, Umi, Next, Vite, Webpack, and unknown projects.
- [ ] Implement ESLint access detection for dependencies, config files, `package.json eslintConfig`, and lint scripts.
- [ ] Implement ESLint config quality analysis for disabled common format, quality, and stack-specific rules.
- [ ] Implement `src`-only `eslint-disable` scanning and risk summary.
- [ ] Implement safe ESLint JSON execution with timeout and artifact logging.
- [ ] Implement lint recovery for missing shared configs, plugins, and parsers, including controlled dev dependency installation and bounded retry.
- [ ] Implement ESLint JSON parsing into lint result, rule summary, and file summary.
- [ ] Implement stable `report.json` schema and development-readable `summary.md`.
- [ ] Implement `lint-log.txt` logging for commands, output, recovery, retries, and failures.
- [ ] Implement iflycode Skill workflow for installing/running `@sunny/eslint-checker`, waiting for report output, and generating the formal report.
- [ ] Add tests or fixtures for no ESLint, partial ESLint, missing plugin/parser/config, config-disabled rules, disable-heavy `src`, and successful lint execution.
- [ ] Write README usage examples for direct CLI usage and iflycode Skill usage.
```

