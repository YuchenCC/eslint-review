---
comet_change: support-jupui-eslint
role: technical-design
canonical_spec: openspec
---

# Support Jupui ESLint Technical Design

## Context

`jup/eslintByJup2` and `jup/eslintByJup3` are internal jupui scaffold projects. Their root projects do not directly declare the ESLint toolchain. Instead, `jupui` owns the Vue CLI, ESLint, TypeScript, Prettier, and shared `.eslintrc.js` setup.

The checker currently reads only root dependencies for ESLint access, so both projects are reported as `partial` even though `npx eslint --print-config` and `npx eslint src` succeed. Static config analysis also stops at the root `.eslintrc.js` and misses `require.resolve('jupui/.eslintrc.js')`.

## Technical Approach

Add a jupui-aware discovery path while preserving the current generic flow.

### Jupui Profile

Project discovery should detect jupui using strong root signals:

- `dependencies.jupui`;
- `vuePlugins.resolveFrom` pointing to `node_modules/jupui`;
- `scripts.lint` containing `jupui-service lint`;
- `.eslintrc.js` referencing `require.resolve('jupui/.eslintrc.js')`;
- `tsconfig.json` extending `./node_modules/jupui/tsconfig`.

When detected, expose an optional framework profile with `name`, declared version, installed version, major version, and package path. If `jupui` is declared but not installed, keep the profile with the declared version and record installed fields as unavailable rather than throwing.

### Managed ESLint Evidence

ESLint access detection should keep direct root dependency scanning and add jupui-managed evidence from `node_modules/jupui/package.json`.

Collect managed packages with the same ESLint ecosystem rules used for direct packages, plus Vue ESLint config packages such as `@vue/eslint-config-typescript` and `@vue/eslint-config-prettier`.

Access should be `connected` when:

- an ESLint config exists;
- a lint script exists;
- direct or managed ESLint packages include `eslint`.

Existing fields should remain populated for compatibility. Add optional fields to explain source, such as direct packages, managed packages, managed provider, and managed dependency status.

### Config Reference Resolution

Config analysis should support targeted CommonJS reference extraction for:

```js
require.resolve('jupui/.eslintrc.js')
```

Resolve from the business project root, analyze the resolved file, and include both root and resolved paths in `analyzedFiles`. Collect inherited configs and disabled rules from the resolved jupui config.

If resolution fails because dependencies are not installed, keep analyzing the root config, add a limitation, and continue. Do not execute arbitrary JavaScript config logic in this batch.

### Recovery Install

When `jupui` is declared but `node_modules/jupui/package.json` is missing, normal analysis should degrade to `partial`. If checker recovery is explicitly enabled, it may try to restore existing declared dependencies by running the package manager install command inferred from the lockfile:

- `npm install` for `package-lock.json`;
- `yarn install` for `yarn.lock`;
- `pnpm install` for `pnpm-lock.yaml`.

Recovery must not install direct ESLint packages for jupui-managed projects. After successful install, rerun jupui profile discovery, ESLint access detection, and config analysis before final access/risk decisions. If install fails, record command and failure reason and preserve the partial state.

### Risk Assessment

Risk assessment should not penalize a jupui project as incomplete solely because root `package.json` lacks direct `eslint`. If managed evidence makes access connected, avoid the existing partial-access score and direct ESLint setup recommendation.

For declared-but-not-installed jupui projects, recommendations should point to dependency installation or restoration. For unresolved jupui config, missing managed package evidence, or absent lint script, recommendations should name that specific missing evidence.

## Data Flow

1. Read root package/config files.
2. Detect optional jupui profile.
3. Read `node_modules/jupui/package.json` when available.
4. Merge direct and managed ESLint evidence for access calculation.
5. Resolve targeted `require.resolve(...)` config references.
6. Analyze root and resolved configs.
7. Compose report and risk assessment with source-aware recommendations.

## Testing Strategy

Add minimal fixtures rather than relying on full checked-in sample `node_modules` trees:

- jupui 2.x shape with `jupui@2.0.12`;
- jupui 3.x shape with `jupui@3.0.17`;
- declared-but-not-installed jupui shape;
- non-jupui Vue/React existing fixtures.

Test coverage should verify:

- jupui profile detection and version fields;
- managed ESLint package collection;
- connected access through managed `eslint`;
- graceful degradation when `node_modules/jupui` is absent;
- targeted `require.resolve('jupui/.eslintrc.js')` analysis;
- risk recommendations do not ask for direct ESLint dependencies when jupui owns ESLint;
- recovery install builds package-manager install commands only when explicitly enabled.

Integration verification should run checker output against `jup/eslintByJup2` and `jup/eslintByJup3`.

## Boundaries

This batch does not change the primary lint runner and does not add jupui/Vue CLI fallback execution. It also does not upgrade project dependencies or mutate sample projects.
