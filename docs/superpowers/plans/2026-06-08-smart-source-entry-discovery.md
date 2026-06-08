# Smart Source Entry Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `eslint-checker` lint and analyze only discovered source entry directories.

**Architecture:** Add one shared discovery module for source entries and ignore patterns. Pass its output from `runChecker()` into lint execution, disable scanning, and resolved config collection so these flows stay consistent.

**Tech Stack:** TypeScript, fast-glob, Vitest, Commander CLI.

---

### Task 1: Source Entry Discovery

**Files:**
- Create: `src/discovery/sourceEntries.ts`
- Test: `tests/sourceEntries.test.ts`

- [ ] **Step 1: Write failing tests**

Cover root `src`, workspace `apps/*/src`, `packages/*/src`, `apps/*/app`, `packages/*/app`, sorted output, absent entry exclusion, common ignore patterns, `public`, and `*.min.js`.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/sourceEntries.test.ts`

- [ ] **Step 3: Implement discovery**

Create `discoverSourceEntries(cwd, outputDirectory)` returning `entries`, `ignorePatterns`, and helper file globs.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/sourceEntries.test.ts`

### Task 2: Route Existing Flows Through Discovery

**Files:**
- Modify: `src/index.ts`
- Modify: `src/lint/execute.ts`
- Modify: `src/analysis/disableScan.ts`
- Modify: `src/analysis/resolvedConfig.ts`
- Modify: `src/types.ts`
- Test: `tests/lint.test.ts`
- Test: `tests/analysis.test.ts`
- Test: `tests/report.test.ts`

- [ ] **Step 1: Write failing tests**

Assert lint command uses discovered entries instead of `.`, no-entry lint skips with `no_source_entries`, disable scanning ignores public and minified files, and print-config picks a source file from discovered entries.

- [ ] **Step 2: Verify RED**

Run targeted Vitest tests for lint, analysis, and report behavior.

- [ ] **Step 3: Implement minimal routing**

Discover source entries once in `runChecker()` and pass the result to the three flows. Use `npx eslint <entries...>` for normal and raw lint.

- [ ] **Step 4: Verify GREEN**

Run targeted Vitest tests, then the full test suite and build.

### Task 3: Documentation Check

**Files:**
- Modify if needed: `README.md`

- [ ] **Step 1: Update behavior docs if current README contradicts source-entry behavior**

- [ ] **Step 2: Verify**

Run: `npm test` and `npm run build`.
