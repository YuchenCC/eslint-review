# Proposal: fix-eslint6-formatter-compat

## Problem

When the checker runs against `jup/eslintByJup2`, the project-local ESLint is `v6.8.0`. Lint execution fails before collecting results because ESLint 6 loads custom formatter files through CommonJS, while the checker passes the built ESM formatter file:

```text
There was a problem loading formatter: ...dist\lint\summaryFormatter.js
Error: Cannot use import statement outside a module
```

## Root Cause

The checker emits TypeScript as ESM because the package is `"type": "module"`. ESLint 6 does not dynamically import custom formatter modules and therefore cannot load the ESM formatter path supplied by the checker.

## Fix Goal

Provide an ESLint 6-compatible formatter entrypoint while preserving the existing summary artifact format and lint execution behavior.

