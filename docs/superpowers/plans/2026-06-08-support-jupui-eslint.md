---
change: support-jupui-eslint
design-doc: docs/superpowers/specs/2026-06-08-support-jupui-eslint-design.md
base-ref: 7ccd891f82536f33f725926fa884e31aa8aecfb0
---

# Support Jupui ESLint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make eslint-checker correctly recognize jupui-managed ESLint access, analyze jupui shared config, and avoid misleading direct-ESLint setup recommendations.

**Architecture:** Add optional jupui framework profile discovery, reuse that profile in ESLint access/config/risk analysis, and keep existing report fields backward compatible. Recovery installation is explicit and restores declared dependencies only.

**Tech Stack:** TypeScript, Node.js `createRequire`, `fast-glob`, Vitest, existing checker report types.

---

## File Structure

- Modify `src/types.ts`: add optional jupui/framework profile, managed ESLint evidence, and recovery metadata fields.
- Modify `src/discovery/project.ts`: detect jupui scaffold signals and read installed jupui package metadata safely.
- Modify `src/discovery/eslintAccess.ts`: collect direct and jupui-managed ESLint packages, then compute access level from combined evidence.
- Modify `src/analysis/configAnalysis.ts`: resolve targeted `require.resolve('jupui/.eslintrc.js')` references and analyze resolved configs.
- Modify `src/report/risk.ts`: avoid direct ESLint setup recommendations for connected jupui-managed projects and recommend dependency restoration when jupui is declared but missing.
- Modify `src/lint/recovery.ts`: add explicit package-manager install command support for missing declared jupui dependencies.
- Modify tests in `tests/discovery.test.ts`, `tests/analysis.test.ts`, `tests/report.test.ts`, and `tests/lint.test.ts`.
- Create minimal fixture data under `fixtures/jupui-managed-2`, `fixtures/jupui-managed-3`, and `fixtures/jupui-missing-install`.

### Task 1: Types And Fixture Shapes

**Files:**
- Modify: `src/types.ts`
- Create: `fixtures/jupui-managed-2/package.json`
- Create: `fixtures/jupui-managed-2/.eslintrc.js`
- Create: `fixtures/jupui-managed-2/tsconfig.json`
- Create: `fixtures/jupui-managed-2/node_modules/jupui/package.json`
- Create: `fixtures/jupui-managed-2/node_modules/jupui/.eslintrc.js`
- Create equivalent files under `fixtures/jupui-managed-3`
- Create: `fixtures/jupui-missing-install/package.json`
- Create: `fixtures/jupui-missing-install/.eslintrc.js`
- Create: `fixtures/jupui-missing-install/tsconfig.json`

- [ ] **Step 1: Add optional report types**

Add these interfaces to `src/types.ts`:

```ts
export interface FrameworkProfile {
  name: "jupui";
  declaredVersion: string;
  installedVersion: string;
  majorVersion: number | null;
  packagePath: string;
  status: "detected" | "installed" | "missing_install";
  limitations: string[];
}
```

Extend `ProjectInfo`:

```ts
frameworkProfile?: FrameworkProfile;
```

Extend `EslintAccess`:

```ts
directEslintPackages?: string[];
managedEslintPackages?: string[];
managedBy?: string;
eslintManagedDependencyDetected?: boolean;
limitations?: string[];
```

Extend `EslintConfigAnalysis`:

```ts
resolvedConfigFiles?: string[];
```

- [ ] **Step 2: Create jupui 2 fixture**

Create `fixtures/jupui-managed-2/package.json`:

```json
{
  "name": "jupui-managed-2",
  "version": "1.0.0",
  "scripts": {
    "lint": "jupui-service lint"
  },
  "dependencies": {
    "jupui": "2.0.12"
  },
  "vuePlugins": {
    "resolveFrom": "node_modules/jupui"
  }
}
```

Create `fixtures/jupui-managed-2/.eslintrc.js`:

```js
module.exports = {
  root: true,
  extends: [require.resolve('jupui/.eslintrc.js')]
};
```

Create `fixtures/jupui-managed-2/tsconfig.json`:

```json
{
  "extends": "./node_modules/jupui/tsconfig"
}
```

Create `fixtures/jupui-managed-2/node_modules/jupui/package.json`:

```json
{
  "name": "jupui",
  "version": "2.0.12",
  "dependencies": {
    "eslint": "^6.7.2",
    "eslint-plugin-vue": "^6.2.2",
    "@typescript-eslint/parser": "^2.33.0",
    "@typescript-eslint/eslint-plugin": "^2.33.0",
    "@vue/eslint-config-typescript": "^5.0.2",
    "@vue/eslint-config-prettier": "^6.0.0",
    "eslint-plugin-prettier": "^3.1.4"
  }
}
```

Create `fixtures/jupui-managed-2/node_modules/jupui/.eslintrc.js`:

```js
module.exports = {
  root: true,
  extends: [
    "plugin:vue/essential",
    "eslint:recommended",
    "@vue/typescript/recommended",
    "@vue/prettier",
    "@vue/prettier/@typescript-eslint"
  ],
  rules: {
    "quotes": [0, "single"],
    "prefer-const": 0
  }
};
```

- [ ] **Step 3: Create jupui 3 and missing-install fixtures**

Copy the jupui 2 fixture shape to `fixtures/jupui-managed-3`, changing package versions to `3.0.17` and `typescript` if included.

Create `fixtures/jupui-missing-install/package.json`:

```json
{
  "name": "jupui-missing-install",
  "version": "1.0.0",
  "scripts": {
    "lint": "jupui-service lint"
  },
  "dependencies": {
    "jupui": "3.0.17"
  },
  "vuePlugins": {
    "resolveFrom": "node_modules/jupui"
  }
}
```

Create `fixtures/jupui-missing-install/.eslintrc.js` and `tsconfig.json` with the same root references as the managed fixtures, but do not create `node_modules/jupui`.

- [ ] **Step 4: Run type checks**

Run: `npm run build`

Expected before later implementation tasks: type errors may occur if interfaces are added but not yet consumed. After Task 5, this command must pass.

### Task 2: Jupui Project Discovery

**Files:**
- Modify: `src/discovery/project.ts`
- Test: `tests/discovery.test.ts`

- [ ] **Step 1: Write discovery tests**

Add tests that assert:

```ts
await expect(discoverProject("fixtures/jupui-managed-2")).resolves.toMatchObject({
  stack: "vue",
  frameworkProfile: {
    name: "jupui",
    declaredVersion: "2.0.12",
    installedVersion: "2.0.12",
    majorVersion: 2,
    packagePath: "node_modules/jupui",
    status: "installed"
  }
});

await expect(discoverProject("fixtures/jupui-missing-install")).resolves.toMatchObject({
  frameworkProfile: {
    name: "jupui",
    declaredVersion: "3.0.17",
    installedVersion: "unknown",
    majorVersion: 3,
    packagePath: "node_modules/jupui",
    status: "missing_install"
  }
});
```

- [ ] **Step 2: Implement safe profile detection**

In `src/discovery/project.ts`, extend `PackageJson` with `scripts?: Record<string,string>` and `vuePlugins?: { resolveFrom?: string }`.

Add helpers:

```ts
async function detectFrameworkProfile(cwd: string, packageJson: PackageJson | undefined): Promise<FrameworkProfile | undefined>
```

Read root `.eslintrc.js` and `tsconfig.json` with existing fs helpers. Return a profile when any strong jupui signal is present.

- [ ] **Step 3: Read installed jupui package safely**

Use `readJsonFile` on `path.join(cwd, "node_modules/jupui/package.json")`. If missing, return status `missing_install`, installed version `unknown`, and limitation `node_modules/jupui/package.json could not be read`.

- [ ] **Step 4: Run discovery tests**

Run: `npx vitest run tests/discovery.test.ts`

Expected: jupui profile tests pass and existing discovery tests remain green.

### Task 3: Managed ESLint Access

**Files:**
- Modify: `src/discovery/eslintAccess.ts`
- Test: `tests/discovery.test.ts`

- [ ] **Step 1: Write access tests**

Add expectations:

```ts
await expect(detectEslintAccess("fixtures/jupui-managed-2")).resolves.toMatchObject({
  accessLevel: "connected",
  eslintDependencyDetected: true,
  eslintManagedDependencyDetected: true,
  directEslintPackages: [],
  managedBy: "jupui",
  managedEslintPackages: expect.arrayContaining(["eslint", "eslint-plugin-vue", "@typescript-eslint/parser"])
});

await expect(detectEslintAccess("fixtures/jupui-missing-install")).resolves.toMatchObject({
  accessLevel: "partial",
  eslintManagedDependencyDetected: false,
  managedBy: "jupui"
});
```

- [ ] **Step 2: Implement managed package collection**

In `eslintAccess.ts`, read `node_modules/jupui/package.json` when root package declares `jupui`. Collect package names from dependencies and devDependencies using the existing `isEslintPackage`, plus `@vue/eslint-config-*`.

- [ ] **Step 3: Update access calculation**

Use combined evidence:

```ts
const eslintDependencyDetected = [...directEslintPackages, ...managedEslintPackages].includes("eslint");
```

Keep `eslintPackages` as the sorted union for backward compatibility.

- [ ] **Step 4: Run access tests**

Run: `npx vitest run tests/discovery.test.ts`

Expected: managed jupui access is connected; missing install is partial.

### Task 4: Config Reference Resolution

**Files:**
- Modify: `src/analysis/configAnalysis.ts`
- Test: `tests/analysis.test.ts`

- [ ] **Step 1: Write config analysis tests**

Add tests:

```ts
await expect(analyzeEslintConfig("fixtures/jupui-managed-2")).resolves.toMatchObject({
  status: "success",
  analyzedFiles: expect.arrayContaining([".eslintrc.js", "node_modules/jupui/.eslintrc.js"]),
  extendedConfigs: expect.arrayContaining(["plugin:vue/essential", "eslint:recommended", "@vue/typescript/recommended"]),
  disabledFormatRules: expect.arrayContaining(["quotes"])
});

await expect(analyzeEslintConfig("fixtures/jupui-missing-install")).resolves.toMatchObject({
  status: "success",
  analyzedFiles: expect.arrayContaining([".eslintrc.js"]),
  limitations: expect.arrayContaining(["Could not resolve jupui/.eslintrc.js"])
});
```

- [ ] **Step 2: Implement targeted require.resolve extraction**

Use `createRequire(path.join(cwd, "package.json"))` and a regex over text configs:

```ts
const REQUIRE_RESOLVE_PATTERN = /require\.resolve\(\s*['"]([^'"]+)['"]\s*\)/g;
```

Resolve only package references and only analyze paths inside `cwd`. Add resolved relative paths to `resolvedConfigFiles`.

- [ ] **Step 3: Reuse existing text collectors**

For resolved `.js` files, read text and call `collectExtendedConfigsFromText`, `collectDisabledRulesFromText`, and weakened-config checks. Preserve limitations on read/resolve failure.

- [ ] **Step 4: Run analysis tests**

Run: `npx vitest run tests/analysis.test.ts`

Expected: jupui inherited configs and disabled rules are collected.

### Task 5: Risk And Recovery

**Files:**
- Modify: `src/report/risk.ts`
- Modify: `src/lint/recovery.ts`
- Test: `tests/report.test.ts`
- Test: `tests/lint.test.ts`

- [ ] **Step 1: Write risk tests**

Add report stubs showing:

```ts
eslintAccess: {
  accessLevel: "connected",
  eslintDependencyDetected: true,
  eslintManagedDependencyDetected: true,
  managedBy: "jupui",
  eslintPackages: ["eslint"]
}
```

Expected: `assessRisk` does not include `ESLint access is partial` or `Complete ESLint config and lint script setup`.

Add a missing-install stub with `accessLevel: "partial"`, `managedBy: "jupui"`, `eslintManagedDependencyDetected: false`.

Expected: recommendations include dependency restoration wording.

- [ ] **Step 2: Update risk assessment**

In `risk.ts`, branch partial access recommendations:

```ts
if (report.eslintAccess.accessLevel === "partial" && report.eslintAccess.managedBy === "jupui") {
  recommendations.push("Install or restore jupui-managed project dependencies");
} else {
  recommendations.push("Complete ESLint config and lint script setup");
}
```

- [ ] **Step 3: Write recovery command tests**

In `tests/lint.test.ts`, add tests for a new helper such as `buildDependencyRestoreCommand`:

```ts
expect(buildDependencyRestoreCommand("npm")).toMatchObject({ command: "npm", args: ["install"] });
expect(buildDependencyRestoreCommand("yarn")).toMatchObject({ command: "yarn", args: ["install"] });
expect(buildDependencyRestoreCommand("pnpm")).toMatchObject({ command: "pnpm", args: ["install"] });
```

- [ ] **Step 4: Implement recovery helper**

Add `buildDependencyRestoreCommand(packageManager)` to `src/lint/recovery.ts`. Do not wire it into direct ESLint package installation unless the failed project is detected as declared-but-missing jupui.

- [ ] **Step 5: Run risk and lint tests**

Run: `npx vitest run tests/report.test.ts tests/lint.test.ts`

Expected: risk recommendations and recovery command tests pass.

### Task 6: End-To-End Verification

**Files:**
- Modify: `openspec/changes/support-jupui-eslint/tasks.md`

- [ ] **Step 1: Run full automated tests**

Run: `npm test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: TypeScript build passes.

- [ ] **Step 3: Verify real jupui samples**

Run:

```bash
npx tsx ../../src/cli.ts --mode access --output .eslint-checker-jup2-access --timeout 60
```

from `jup/eslintByJup2`.

Run:

```bash
npx tsx ../../src/cli.ts --mode access --output .eslint-checker-jup3-access --timeout 60
```

from `jup/eslintByJup3`.

Expected in each `report.json`:

- `projectInfo.frameworkProfile.name` is `jupui`;
- `eslintAccess.accessLevel` is `connected`;
- `eslintAccess.managedBy` is `jupui`;
- `eslintConfigAnalysis.analyzedFiles` includes `node_modules/jupui/.eslintrc.js`;
- `riskAssessment.recommendations` does not ask to add direct ESLint setup.

- [ ] **Step 4: Update OpenSpec task checkboxes**

Mark completed implementation tasks in `openspec/changes/support-jupui-eslint/tasks.md`.

- [ ] **Step 5: Commit**

Run:

```bash
git add src tests fixtures docs/superpowers/plans/2026-06-08-support-jupui-eslint.md docs/superpowers/specs/2026-06-08-support-jupui-eslint-design.md openspec/changes/support-jupui-eslint
git commit -m "feat: support jupui-managed eslint access"
```

Expected: one commit containing the implementation and Comet artifacts.
