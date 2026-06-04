---
change: eslint-checker-mvp
design-doc: docs/superpowers/specs/2026-06-03-eslint-checker-mvp-design.md
base-ref: dcfe71087978b98c624bc236b5ac8e76f4a2276b
archived-with: 2026-06-04-eslint-checker-mvp
---

# ESLint Checker MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@sunny/eslint-checker`, a Node CLI that generates stable ESLint governance reports and an iflycode Skill that orchestrates checker execution and formal report generation.

**Architecture:** The CLI is a TypeScript package with small modules for discovery, ESLint access detection, config analysis, disable scanning, lint execution, recovery, parsing, risk assessment, and artifact writing. The iflycode Skill is a documented workflow that runs the CLI, waits for `.eslint-checker/report.json`, and generates a formal report strictly from report data.

**Tech Stack:** Node.js, TypeScript, Vitest, commander, execa, fast-glob, fs-extra, zod, yaml.

archived-with: 2026-06-04-eslint-checker-mvp
---

## File Structure

- `package.json`: package metadata, CLI bin mapping, build/test scripts, dependencies.
- `tsconfig.json`: TypeScript build configuration.
- `vitest.config.ts`: test configuration.
- `src/cli.ts`: command-line entry point and option parsing.
- `src/index.ts`: orchestration entry point for running checks.
- `src/types.ts`: shared report schema types and constants.
- `src/utils/fs.ts`: filesystem helpers, JSON read/write, path checks.
- `src/utils/commands.ts`: safe command execution wrapper with timeout and logs.
- `src/logger.ts`: in-memory and file-backed log collection.
- `src/discovery/project.ts`: package, Git, Node, package manager, and stack discovery.
- `src/discovery/eslintAccess.ts`: ESLint dependency, config, and lint script detection.
- `src/analysis/configAnalysis.ts`: high-signal ESLint disabled-rule analysis.
- `src/analysis/disableScan.ts`: `src`-only disable comment scanning.
- `src/lint/execute.ts`: ESLint JSON execution.
- `src/lint/recovery.ts`: missing parser, plugin, and shared config recovery.
- `src/lint/parse.ts`: ESLint JSON result parsing.
- `src/report/risk.ts`: risk-level calculation.
- `src/report/artifacts.ts`: `report.json`, `summary.md`, `eslint-report.json`, `lint-log.txt` writing.
- `src/report/schema.ts`: zod schema for `report.json`.
- `skills/iflycode-eslint-report/SKILL.md`: iflycode orchestration and formal report prompt.
- `fixtures/*`: sample projects used by tests.
- `tests/*`: unit and integration tests.
- `README.md`: direct CLI and iflycode usage.

## Task 1: Initialize CLI Package

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/cli.ts`
- Create: `src/index.ts`
- Create: `src/types.ts`

- [ ] **Step 1: Write package metadata and scripts**

Create `package.json` with this structure:

```json
{
  "name": "@sunny/eslint-checker",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "eslint-checker": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint ."
  },
  "dependencies": {
    "commander": "^12.1.0",
    "execa": "^9.6.0",
    "fast-glob": "^3.3.2",
    "fs-extra": "^11.2.0",
    "yaml": "^2.5.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/fs-extra": "^11.0.4",
    "@types/node": "^22.10.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Add TypeScript and test config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
```

- [ ] **Step 3: Define core types**

Create `src/types.ts` with report section interfaces for `SystemInfo`, `GitInfo`, `ProjectInfo`, `EslintAccess`, `EslintConfigAnalysis`, `EslintDisableAnalysis`, `LintExecution`, `LintRecovery`, `LintResult`, `RuleSummaryItem`, `FileSummaryItem`, `RiskAssessment`, `Artifacts`, and `CheckerReport`.

- [ ] **Step 4: Add a minimal CLI entry**

Create `src/cli.ts`:

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { runChecker } from "./index.js";

const program = new Command();

program
  .name("eslint-checker")
  .option("--system <name>", "system name")
  .option("--center <name>", "center name")
  .option("--owner <name>", "owner name")
  .option("--mode <mode>", "check mode: access or full", "full")
  .option("--output <dir>", "output directory", ".eslint-checker")
  .option("--timeout <seconds>", "ESLint timeout seconds", "120")
  .option("--for-iflycode", "emit iflycode-ready artifacts", false)
  .option("--no-recovery", "disable lint recovery")
  .parse(process.argv);

await runChecker({
  cwd: process.cwd(),
  options: program.opts()
});
```

- [ ] **Step 5: Add orchestration stub**

Create `src/index.ts` exporting `runChecker()` that returns a `CheckerReport` with `schemaVersion`, `checkerVersion`, `generatedAt`, and empty section defaults. This task intentionally does not implement discovery.

- [ ] **Step 6: Build**

Run: `npm run build`

Expected: TypeScript emits `dist/cli.js` without errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/cli.ts src/index.ts src/types.ts
git commit -m "feat: initialize eslint checker cli"
```

## Task 2: Project and ESLint Access Discovery

**Files:**
- Create: `src/utils/fs.ts`
- Create: `src/discovery/project.ts`
- Create: `src/discovery/eslintAccess.ts`
- Modify: `src/index.ts`
- Test: `tests/discovery.test.ts`
- Create fixtures: `fixtures/no-package`, `fixtures/vue-eslint`, `fixtures/react-partial-eslint`

- [ ] **Step 1: Write discovery tests**

Create `tests/discovery.test.ts` with tests that assert:

```ts
expect(await discoverProject("fixtures/no-package")).toMatchObject({
  hasPackageJson: false
});
expect(await detectEslintAccess("fixtures/vue-eslint")).toMatchObject({
  eslintDependencyDetected: true,
  eslintConfigDetected: true,
  lintScriptDetected: true,
  accessLevel: "connected"
});
expect(await detectEslintAccess("fixtures/react-partial-eslint")).toMatchObject({
  eslintDependencyDetected: true,
  eslintConfigDetected: false,
  accessLevel: "partial"
});
```

- [ ] **Step 2: Create fixtures**

Create:

- `fixtures/no-package/src/index.ts`
- `fixtures/vue-eslint/package.json` with `vue`, `eslint`, `eslint-plugin-vue`, and `scripts.lint`
- `fixtures/vue-eslint/eslint.config.js`
- `fixtures/react-partial-eslint/package.json` with `react` and `eslint`, but no ESLint config

- [ ] **Step 3: Implement file helpers**

Create `src/utils/fs.ts` with `pathExists`, `readJsonFile`, `readTextFile`, `listExistingFiles`, and `safeStat` helpers. Each helper returns explicit `undefined` or `false` on missing files, not thrown errors.

- [ ] **Step 4: Implement project discovery**

Implement `discoverProject(cwd)` in `src/discovery/project.ts`:

- Reads `package.json`.
- Detects package manager from lockfiles in order: `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, fallback `npm`.
- Detects stack from dependencies and config files: Vue, React, Umi, Next, Vite, Webpack, or `unknown`.
- Reads Git branch, commit hash, and dirty state using commands.
- Reads Node and package manager versions.

- [ ] **Step 5: Implement ESLint access discovery**

Implement `detectEslintAccess(cwd)` in `src/discovery/eslintAccess.ts`:

- Checks dependencies and devDependencies for `eslint` and common ecosystem packages.
- Finds flat config, eslintrc config, and `package.json eslintConfig`.
- Reads lint scripts named `lint`, `lint:eslint`, `eslint`, `lint:check`, and `lint:report`.
- Computes access levels: `not_connected`, `partial`, `connected`, `well_connected`.

- [ ] **Step 6: Wire discovery into report**

Update `src/index.ts` so `runChecker()` includes project and ESLint access discovery in the returned report. Missing `package.json` must still produce report artifacts later.

- [ ] **Step 7: Run tests**

Run: `npm test -- tests/discovery.test.ts`

Expected: discovery tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/utils/fs.ts src/discovery/project.ts src/discovery/eslintAccess.ts src/index.ts tests/discovery.test.ts fixtures
git commit -m "feat: add project and eslint access discovery"
```

## Task 3: Config Analysis and Disable Scan

**Files:**
- Create: `src/analysis/configAnalysis.ts`
- Create: `src/analysis/disableScan.ts`
- Modify: `src/index.ts`
- Test: `tests/analysis.test.ts`
- Create fixtures: `fixtures/config-disabled`, `fixtures/disable-heavy`

- [ ] **Step 1: Write analysis tests**

Create `tests/analysis.test.ts` asserting:

```ts
expect(await analyzeEslintConfig("fixtures/config-disabled")).toMatchObject({
  analyzed: true,
  disabledRuleCount: 4,
  formatRulesDisabled: ["semi", "quotes"],
  qualityRulesDisabled: ["no-unused-vars", "eqeqeq"]
});
expect(await scanEslintDisable("fixtures/disable-heavy")).toMatchObject({
  scanned: true,
  totalDisableCount: 4,
  fileLevelDisableCount: 1,
  disableWithoutRuleCount: 2
});
```

- [ ] **Step 2: Create config-disabled fixture**

Create `fixtures/config-disabled/package.json` and `fixtures/config-disabled/.eslintrc.json` with rules:

```json
{
  "rules": {
    "semi": "off",
    "quotes": 0,
    "no-unused-vars": "off",
    "eqeqeq": 0
  }
}
```

- [ ] **Step 3: Create disable-heavy fixture**

Create `fixtures/disable-heavy/src/page-a.ts` and `fixtures/disable-heavy/src/page-b.ts` containing file-level, next-line, line-level, and rule-specific disable comments.

- [ ] **Step 4: Implement config analysis**

Implement `analyzeEslintConfig(cwd)`:

- Parse `.eslintrc.json`, `.eslintrc.yaml`, `.eslintrc.yml`, and `package.json eslintConfig`.
- For `.js`, `.cjs`, `.mjs`, and flat config files, do a conservative text scan for rule keys and disabled values.
- Track `disabledRuleCount`, `criticalDisabledRules`, `formatRulesDisabled`, `qualityRulesDisabled`, `stackSpecificRulesDisabled`, `riskLevel`, and `findings`.
- Set `analyzed: false` and a parse reason only when no config content can be read safely.

- [ ] **Step 5: Implement disable scan**

Implement `scanEslintDisable(cwd)`:

- Scan only `src/**/*.{js,jsx,ts,tsx,vue}`.
- Count `eslint-disable`, `eslint-disable-next-line`, and `eslint-disable-line`.
- Count file-level disables and disables without explicit rule names.
- Return `topFiles` sorted by disable count descending.
- Set `scanned: false` with reason `src_not_found` when no `src` directory exists.

- [ ] **Step 6: Wire analysis into report**

Update `src/index.ts` to include `eslintConfigAnalysis` and `eslintDisableAnalysis` before lint execution.

- [ ] **Step 7: Run tests**

Run: `npm test -- tests/analysis.test.ts`

Expected: config and disable analysis tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/analysis/configAnalysis.ts src/analysis/disableScan.ts src/index.ts tests/analysis.test.ts fixtures/config-disabled fixtures/disable-heavy
git commit -m "feat: add eslint config and disable analysis"
```

## Task 4: Lint Execution, Recovery, and Parsing

**Files:**
- Create: `src/utils/commands.ts`
- Create: `src/logger.ts`
- Create: `src/lint/execute.ts`
- Create: `src/lint/recovery.ts`
- Create: `src/lint/parse.ts`
- Modify: `src/index.ts`
- Test: `tests/lint.test.ts`
- Create fixtures: `fixtures/lint-success`, `fixtures/missing-parser`

- [ ] **Step 1: Write lint tests**

Create `tests/lint.test.ts` with tests for:

- `parseEslintJson()` summarizing file count, errors, warnings, fixable counts, `ruleSummary`, and `fileSummary`.
- `diagnoseMissingDependency()` extracting `@typescript-eslint/parser`, `eslint-plugin-vue`, and `eslint-config-standard` from representative ESLint error text.
- `executeLint()` skips execution when access level is `not_connected`.

- [ ] **Step 2: Implement command runner**

Create `src/utils/commands.ts` with `runCommand({ cwd, command, args, timeoutMs })`. It returns `exitCode`, `stdout`, `stderr`, `durationMs`, and `timedOut`. It never throws for non-zero process exits.

- [ ] **Step 3: Implement logger**

Create `src/logger.ts` with `createLogger()` returning `info`, `error`, `command`, and `toText()` methods. Log entries include ISO timestamps.

- [ ] **Step 4: Implement lint execution**

Create `src/lint/execute.ts`:

- Creates `.eslint-checker`.
- Runs `npx eslint . -f json -o .eslint-checker/eslint-report.json`.
- Applies timeout from options.
- Records command, exit code, duration, success, and failed reason.
- Treats ESLint exit code `1` with a readable JSON report as successful execution with lint findings.

- [ ] **Step 5: Implement recovery diagnosis**

Create `src/lint/recovery.ts`:

- Detect missing parser errors with patterns for `Cannot find module '@typescript-eslint/parser'`.
- Detect plugin errors and normalize `vue` to `eslint-plugin-vue`, `react` to `eslint-plugin-react`, and `@typescript-eslint` to `@typescript-eslint/eslint-plugin`.
- Detect config errors and normalize `standard` to `eslint-config-standard`, scoped config names, and `eslint-config-*`.
- Build install commands using detected package manager: `pnpm add -D`, `yarn add -D`, or `npm install -D`.

- [ ] **Step 6: Implement recovery execution**

In `src/lint/recovery.ts`, implement `recoverAndRetry()`:

- Limit retries to `2`.
- Install only diagnosed ESLint-related packages.
- Record `packageJsonModified`, `lockfileModified`, `installedPackages`, `installCommand`, `retryCount`, and `finalStatus`.
- Return final lint execution result and recovery report.

- [ ] **Step 7: Implement ESLint JSON parsing**

Create `src/lint/parse.ts`:

- Read `.eslint-checker/eslint-report.json`.
- Summarize `fileCount`, `checkedFileCount`, `errorCount`, `warningCount`, `fixableErrorCount`, `fixableWarningCount`, and `fatalErrorCount`.
- Group messages by `ruleId` into `ruleSummary`.
- Group messages by file path into `fileSummary`.
- Ignore source text in final `report.json`.

- [ ] **Step 8: Wire lint flow into report**

Update `src/index.ts`:

- Skip lint execution for `not_connected` or `mode=access`.
- Execute lint for `partial`, `connected`, or `well_connected`.
- Try recovery when enabled and the failure diagnosis returns installable packages.
- Parse JSON output when available.

- [ ] **Step 9: Run tests**

Run: `npm test -- tests/lint.test.ts`

Expected: lint parser and recovery diagnosis tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/utils/commands.ts src/logger.ts src/lint src/index.ts tests/lint.test.ts fixtures/lint-success fixtures/missing-parser
git commit -m "feat: add lint execution and recovery"
```

## Task 5: Report Schema, Artifacts, and Summary

**Files:**
- Create: `src/report/schema.ts`
- Create: `src/report/risk.ts`
- Create: `src/report/artifacts.ts`
- Modify: `src/index.ts`
- Test: `tests/report.test.ts`

- [ ] **Step 1: Write report tests**

Create `tests/report.test.ts` asserting:

- `CheckerReportSchema.parse(report)` accepts a successful full report.
- Missing `package.json` still writes `report.json`.
- Risk is `high` when ESLint is not connected, fatal errors exist, or file-level disables are present.
- Summary markdown includes access status, config analysis, disable analysis, lint execution, recovery, and artifact paths.

- [ ] **Step 2: Implement zod schema**

Create `src/report/schema.ts` with `CheckerReportSchema`. Include all top-level protocol fields from the design doc. Unknown optional details should be nullable or defaulted through report builders, not omitted.

- [ ] **Step 3: Implement risk assessment**

Create `src/report/risk.ts`:

- `high`: ESLint not connected, fatal errors, `errorCount >= 50`, file-level disable present, or config analysis high risk.
- `medium`: errors exist, warnings `>= 100`, partial ESLint access, disable count concentrated in one file, or config analysis medium risk.
- `low`: connected ESLint with no errors and warnings below threshold.
- `excellent`: connected ESLint with zero errors, zero warnings, low config risk, and no disable comments.

- [ ] **Step 4: Implement artifact writer**

Create `src/report/artifacts.ts`:

- Ensure output directory exists.
- Write `report.json` with two-space formatting.
- Write `summary.md` with sections for project info, ESLint access, config quality, disable use, lint execution, recovery, and next steps.
- Write `lint-log.txt` from logger output.
- Preserve `eslint-report.json` when available.

- [ ] **Step 5: Wire artifact writing**

Update `src/index.ts` so `runChecker()` validates the final report with zod and writes artifacts even on failures. CLI process exit should be `0` when artifacts are generated and non-zero only when artifact generation itself fails.

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/report.test.ts`

Expected: report schema, risk, and artifact tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/report src/index.ts tests/report.test.ts
git commit -m "feat: add report schema and artifacts"
```

## Task 6: iflycode Skill and Documentation

**Files:**
- Create: `skills/iflycode-eslint-report/SKILL.md`
- Create: `README.md`
- Modify: `openspec/changes/eslint-checker-mvp/tasks.md`

- [ ] **Step 1: Write iflycode Skill**

Create `skills/iflycode-eslint-report/SKILL.md` with:

- Step to confirm business project root.
- Primary command: `npx @sunny/eslint-checker --mode full --for-iflycode`.
- Fallback command: `npm install -D @sunny/eslint-checker && npx eslint-checker --mode full --for-iflycode`.
- Instruction to wait for `.eslint-checker/report.json`.
- Instruction to generate a check-incomplete report if checker installation or execution fails before report output.
- Formal report template sections from the design doc.
- Strict rule that all facts come from `report.json`.

- [ ] **Step 2: Write README**

Create `README.md` with:

- Package name and command.
- Install/run examples for internal registry users.
- CLI options.
- Artifact paths.
- Lint recovery explanation and warning that `package.json` and lockfiles may change for missing ESLint runtime dependencies.
- iflycode Skill usage.
- MVP limitations.

- [ ] **Step 3: Mark completed documentation task**

Update `openspec/changes/eslint-checker-mvp/tasks.md` only for tasks completed so far during implementation. Do not mark implementation tasks complete until their code and tests are committed.

- [ ] **Step 4: Run docs verification**

Run:

```bash
node -e 'const fs=require("fs"); const files=["README.md","skills/iflycode-eslint-report/SKILL.md"]; const bad=["T"+"BD","待"+"定","占"+"位","implement"+" later","fill"+" in details"]; let failed=false; for (const file of files) { const text=fs.readFileSync(file,"utf8"); for (const token of bad) if (text.includes(token)) { console.error(`${file}: contains ${token}`); failed=true; } } process.exit(failed ? 1 : 0);'
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add skills/iflycode-eslint-report/SKILL.md README.md openspec/changes/eslint-checker-mvp/tasks.md
git commit -m "docs: add iflycode skill and usage"
```

## Task 7: End-to-End Validation and MVP Task Closure

**Files:**
- Modify: `openspec/changes/eslint-checker-mvp/tasks.md`
- Modify as needed: implementation files from previous tasks

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: `dist/cli.js` is emitted without TypeScript errors.

- [ ] **Step 3: Run fixture smoke checks**

Run:

```bash
node dist/cli.js --mode full --output .eslint-checker-test
```

from at least one fixture project with ESLint and one fixture without ESLint. Expected: each fixture writes a report artifact.

- [ ] **Step 4: Validate generated report schema**

Add or run a small test helper that imports `CheckerReportSchema` and validates fixture-generated `.eslint-checker-test/report.json` files.

- [ ] **Step 5: Mark OpenSpec tasks complete**

Mark each completed line in `openspec/changes/eslint-checker-mvp/tasks.md` with `- [x]`. Leave no task checked unless its implementation, tests, and commit are complete.

- [ ] **Step 6: Commit closure**

```bash
git add openspec/changes/eslint-checker-mvp/tasks.md
git commit -m "chore: complete eslint checker mvp tasks"
```

## Self-Review

- Spec coverage: The plan covers CLI initialization, discovery, access detection, config quality analysis, `src` disable scanning, safe ESLint execution, lint recovery, JSON parsing, report schema/artifacts, logging, iflycode Skill, tests, and README.
- Red-flag scan: The plan contains no deferred-detail markers, generic "fill later" steps, or unspecified test commands.
- Type consistency: The report section names match the design doc protocol: `eslintAccess`, `eslintConfigAnalysis`, `eslintDisableAnalysis`, `lintExecution`, `lintRecovery`, `lintResult`, `ruleSummary`, `fileSummary`, `riskAssessment`, and `artifacts`.
