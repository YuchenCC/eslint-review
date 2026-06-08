# Comet Design Handoff

- Change: support-jupui-eslint
- Phase: design
- Mode: compact
- Context hash: 2938b1bf437e96f5549b2e5b191d323284acbefa1c9309644b4ab098f3769c72

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/support-jupui-eslint/proposal.md

- Source: openspec/changes/support-jupui-eslint/proposal.md
- Lines: 1-38
- SHA256: 0c489d97e51f259a9edd56887fde06da2b133c6af884afd2b495d6dbc30ed461

```md
# Proposal: support-jupui-eslint

## Problem

`jup/eslintByJup2` and `jup/eslintByJup3` are both internal `jupui` scaffold projects. They do not declare the ESLint toolchain directly in the business project root. Instead, the root project depends on `jupui`, and the real ESLint ecosystem packages and shared config live under `node_modules/jupui`.

The current checker treats these projects as only partially connected because it only evaluates direct root `package.json` dependencies. It also statically reads the root `.eslintrc.js` without resolving `require.resolve('jupui/.eslintrc.js')`, so the report misses the actual inherited rule stack.

As a result, jupui projects can receive misleading access and risk recommendations even when `eslint --print-config` and `eslint src` work successfully.

## Goals

- Detect jupui scaffold projects and record the jupui declared and installed version.
- Treat ESLint packages managed by `jupui` as valid ESLint access evidence.
- Resolve and analyze `.eslintrc.js` entries that use `require.resolve('jupui/.eslintrc.js')`.
- Report the real jupui inherited ESLint config and managed ESLint packages.
- Adjust risk assessment so jupui-managed ESLint projects are not penalized as incomplete solely because the root project does not directly declare `eslint`.
- When recovery is explicitly enabled and `jupui` is declared but not installed, attempt to restore declared project dependencies instead of adding direct ESLint packages.

## Non-Goals

- Do not implement the jupui or Vue CLI fallback runner in this first batch.
- Do not change lint execution behavior beyond what is required for access/config/risk reporting.
- Do not upgrade jupui, ESLint, Vue CLI, TypeScript, or project dependencies.
- Do not run dependency installation by default; installation is allowed only through an explicit recovery path.
- Do not modify the sample jupui projects.
- Do not redesign the complete report schema beyond the minimum fields needed to explain jupui-managed ESLint access.

## Expected Behavior

For both `jup/eslintByJup2` and `jup/eslintByJup3`, the checker should:

- identify the project as a jupui scaffold;
- show direct root dependencies separately from jupui-managed ESLint dependencies;
- mark ESLint access as connected when config, lint script, and managed ESLint packages are present;
- include `node_modules/jupui/.eslintrc.js` in config analysis;
- list inherited configs such as `plugin:vue/essential`, `eslint:recommended`, `@vue/typescript/recommended`, and `@vue/prettier`;
- avoid recommending that the business project directly add ESLint when jupui already provides it.
```

## openspec/changes/support-jupui-eslint/design.md

- Source: openspec/changes/support-jupui-eslint/design.md
- Lines: 1-119
- SHA256: 817fcd6e70e986d1e88d919eb961a82125e6beefb6ea9b0baf6f65bc648b1866

[TRUNCATED]

```md
# Design: support-jupui-eslint

## Overview

Add a jupui-aware discovery path to the checker. The implementation should preserve the existing generic project flow, then layer jupui-specific evidence into project discovery, ESLint access detection, ESLint config analysis, and risk assessment.

The first batch is intentionally reporting-focused. It should make the checker explain jupui projects correctly without changing the primary lint runner.

## Project Discovery

Detect a jupui scaffold when one or more strong signals are present:

- root `package.json` has `dependencies.jupui`;
- root `package.json` has `vuePlugins.resolveFrom` pointing at `node_modules/jupui`;
- root `.eslintrc.js` references `require.resolve('jupui/.eslintrc.js')`;
- root `scripts.lint` contains `jupui-service lint`;
- root `tsconfig.json` extends `./node_modules/jupui/tsconfig`.

When detected, read `node_modules/jupui/package.json` if available and record:

- package name: `jupui`;
- declared version from the root dependency;
- installed version from the package under `node_modules`;
- major version when parseable;
- package path relative to the project root.

This profile should be optional and must not break non-jupui projects.

If the root project declares `jupui` but dependencies have not been installed, detection should still produce a partial jupui profile from root metadata. In that case:

- keep the declared version;
- set installed version and package path to an unknown or unavailable value;
- do not throw;
- record a limitation that `node_modules/jupui/package.json` could not be read.

## ESLint Access Detection

Keep the existing root dependency scan, but add managed dependency evidence for jupui projects.

For jupui projects, inspect `node_modules/jupui/package.json` and collect ESLint ecosystem packages from `dependencies` and `devDependencies`, including:

- `eslint`;
- packages starting with `eslint-`;
- packages starting with `@eslint/`;
- packages starting with `@typescript-eslint/`;
- packages whose name contains `/eslint-`;
- Vue ESLint config packages such as `@vue/eslint-config-typescript` and `@vue/eslint-config-prettier`.

The access calculation should consider direct and managed ESLint packages. A jupui project with managed `eslint`, an ESLint config, and a lint script should be `connected`; if more than one lint script is present, it can still use the existing `well_connected` rule.

The report should make source clear. A package provided by jupui is valid evidence but should not be presented as a direct business-project dependency.

If `jupui` is declared but not installed, managed ESLint package collection should return an empty managed package list with a failure or limitation reason. Access should remain `partial` when root config or lint script exists but neither direct nor managed ESLint packages can be verified. The recommendation should ask the user to install or restore project dependencies, not to add direct ESLint packages to the business project.

When checker recovery is explicitly enabled and the project declares `jupui` but `node_modules/jupui/package.json` is missing, the recovery path may attempt to restore existing declared dependencies. This should use the detected package manager and lockfile:

- npm project with `package-lock.json`: run `npm install`;
- yarn project with `yarn.lock`: run `yarn install`;
- pnpm project with `pnpm-lock.yaml`: run `pnpm install`.

This recovery must not run by default. It must not run `npm install -D eslint ...` for jupui-managed projects, because that changes the ownership model from scaffold-managed to business-project-managed. After a successful install, rerun jupui profile discovery, ESLint access detection, and config analysis before deciding access level.

If installation fails, preserve the original partial state and record the install command and failure reason in recovery metadata.

## Config Analysis

Extend config analysis to follow resolvable CommonJS references in text configs, starting with:

```js
require.resolve('jupui/.eslintrc.js')
```

Resolution must happen from the business project root so Node resolves the same package the project would use. If resolution succeeds, analyze the resolved file in addition to the root `.eslintrc.js`.

The analyzer should collect:

- `analyzedFiles` containing both `.eslintrc.js` and `node_modules/jupui/.eslintrc.js`;
- inherited configs from the resolved jupui config;
- disabled rules from the resolved jupui config;
- limitations when a referenced config cannot be resolved or read.
```

Full source: openspec/changes/support-jupui-eslint/design.md

## openspec/changes/support-jupui-eslint/tasks.md

- Source: openspec/changes/support-jupui-eslint/tasks.md
- Lines: 1-10
- SHA256: f200487ea21207ecdd157f548b04394ae2c397a12de406dbf2a6a77becc2233f

```md
# Tasks: support-jupui-eslint

- [ ] Add jupui scaffold detection to project discovery and expose optional framework profile metadata.
- [ ] Extend ESLint access detection to collect direct and jupui-managed ESLint packages separately.
- [ ] Update access-level calculation so jupui-managed ESLint dependencies count as valid ESLint access evidence.
- [ ] Extend config analysis to resolve and analyze `require.resolve('jupui/.eslintrc.js')` from the business project root.
- [ ] Add an explicit recovery path that runs package-manager install for declared-but-missing jupui dependencies without adding direct ESLint packages.
- [ ] Update risk assessment to avoid incomplete-setup recommendations when ESLint is correctly managed by jupui.
- [ ] Add focused tests for jupui 2.x and 3.x fixture shapes and preserve existing non-jupui behavior.
- [ ] Run the test suite and verify checker output against `jup/eslintByJup2` and `jup/eslintByJup3`.
```

