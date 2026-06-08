# Design: smart source entry discovery

## Goal

`eslint-checker` should lint and analyze only source-code entry directories instead of the whole project. The same entry discovery must be shared by lint execution, `eslint-disable` scanning, and resolved config collection.

## Source Entry Discovery

Add a shared discovery module that finds existing source roots under these patterns:

- `src`
- `apps/*/src`
- `packages/*/src`
- `apps/*/app`
- `packages/*/app`

The module returns sorted relative paths and common ignore patterns. If no source roots are found, lint execution should skip with `no_source_entries` rather than falling back to `eslint .`.

## Common Exclusions

All source-oriented flows must ignore generated or public assets:

- `**/node_modules/**`
- `**/dist/**`
- `**/build/**`
- checker output directory, for example `.eslint-checker/**`
- `public/**` and `**/public/**`
- `**/*.min.js`

## Data Flow

`runChecker()` discovers source entries once after project discovery. It passes the result to:

- `executeLint()`, which runs `npx eslint <entry...>` instead of `npx eslint .`.
- `scanEslintDisable()`, which scans supported source file extensions under those entries.
- `collectResolvedEslintConfig()`, which chooses the first supported source file under those entries for `--print-config`.

## Testing

Tests must verify:

- source discovery returns root and workspace source entries.
- discovery ignores absent entries.
- lint command arguments use discovered entries, not `.`.
- public files and `*.min.js` are excluded from disable scanning and print-config target selection.
- lint skips with `no_source_entries` when no source roots exist.
