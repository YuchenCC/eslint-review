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
