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

Avoid broad arbitrary JavaScript execution. For this batch, support targeted `require.resolve(...)` extraction and safe path resolution.

If the referenced package cannot be resolved because dependencies are not installed, config analysis should keep the root config in `analyzedFiles`, add a limitation such as `Could not resolve jupui/.eslintrc.js`, and continue. This should not fail the entire checker run.

## Risk Assessment

Risk scoring should distinguish missing ESLint from jupui-managed ESLint.

If ESLint access is connected through jupui-managed dependencies, do not add the current partial-access score or the recommendation to complete ESLint setup. If access is still partial or failed for another reason, recommendations should mention the exact missing evidence, such as unresolved jupui config, missing managed ESLint package, or absent lint script.

For a declared-but-not-installed jupui project, risk assessment should surface dependency installation as the likely blocker. It should avoid recommending direct ESLint dependency additions unless the project is not detected as jupui-managed.

## Reporting Shape

Prefer additive fields so existing consumers remain compatible. Candidate fields:

- `projectInfo.frameworkProfile`;
- `eslintAccess.directEslintPackages`;
- `eslintAccess.managedEslintPackages`;
- `eslintAccess.managedBy`;
- `eslintAccess.eslintManagedDependencyDetected`;
- `eslintConfigAnalysis.resolvedConfigFiles`.

If the existing TypeScript types need adjustment, add optional fields and keep existing field names populated for compatibility.

## Validation

Add fixtures or tests that cover both jupui major versions using minimal fixture projects. Tests should not depend on the full checked-in `jup/eslintByJup2` and `jup/eslintByJup3/node_modules` trees.

Validation should prove:

- jupui projects are identified;
- declared-but-not-installed jupui projects degrade without throwing;
- declared-but-not-installed jupui projects use package-manager install only when recovery is explicitly enabled;
- managed ESLint packages make access connected;
- `require.resolve('jupui/.eslintrc.js')` is resolved and analyzed;
- risk assessment no longer emits the direct ESLint setup recommendation for jupui-managed projects;
- non-jupui fixtures keep their current behavior.
