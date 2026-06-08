---
archived-with: 2026-06-08-fix-eslint6-formatter-compat
status: final
status: final
---
# Design: fix-eslint6-formatter-compat

## Approach

Add a CommonJS formatter entrypoint for ESLint runtime loading and have lint execution pass that formatter path instead of the package ESM module.

The CommonJS formatter will implement the same compact summary shape currently produced by `buildEslintSummary`. It will avoid importing ESM code so ESLint 6 can `require()` it successfully.

## Scope

- Formatter compatibility for ESLint 6 custom formatter loading.
- Existing checker command shape and report schema remain unchanged.
- No change to business project ESLint configuration.

