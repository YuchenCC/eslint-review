# ESLint Summary Formatter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace default full ESLint JSON collection with a custom summary formatter that emits compact lint aggregates and bounded evidence samples.

**Architecture:** ESLint execution will use a local formatter module that converts ESLint `results` into `.eslint-checker/eslint-summary.json`. The checker will parse this compact summary into `lintResult`, `ruleSummary`, `fileSummary`, and `lintEvidence`, while raw `.eslint-checker/eslint-report.json` becomes an explicit debug artifact.

**Tech Stack:** TypeScript, NodeNext ESM, ESLint formatter contract, Commander, Zod, Vitest.

---

## File Structure

- Create `src/lint/summaryFormatter.ts`: pure formatter helpers and default ESLint formatter export.
- Create `tests/formatter.test.ts`: unit tests for aggregate counts, limits, evidence, and omitted heavy fields.
- Replace `src/lint/parse.ts` with summary parsing from `.eslint-checker/eslint-summary.json`.
- Modify `tests/lint.test.ts`: parser tests for valid, missing, and invalid summary files.
- Modify `src/lint/execute.ts`: run ESLint with the checker formatter and write `eslint-summary.json`; optionally run raw JSON when requested.
- Modify `src/lint/recovery.ts`: pass raw-report setting through retries.
- Modify `src/cli.ts`: add `--raw-eslint-report`.
- Modify `src/types.ts`: add summary, evidence, formatter limit, and artifact fields.
- Modify `src/report/schema.ts`: validate new fields.
- Modify `src/index.ts`: read summary output and map lint evidence into final report.
- Modify `src/report/artifacts.ts`: mention `eslint-summary.json` by default and raw JSON only when present.
- Modify `tests/report.test.ts`: assert summary artifact in final `report.json` and raw JSON absence by default.
- Modify `README.md` and `skills/iflycode-eslint-report/SKILL.md`: document summary artifact and optional raw debug artifact.

## Task 1: Formatter Aggregation

**Files:**
- Create: `src/lint/summaryFormatter.ts`
- Test: `tests/formatter.test.ts`

- [ ] **Step 1: Write failing formatter tests**

Create `tests/formatter.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildEslintSummary } from "../src/lint/summaryFormatter.js";

describe("eslint summary formatter", () => {
  test("aggregates lint totals, top rules, top files, and bounded evidence", () => {
    const summary = buildEslintSummary(
      [
        {
          filePath: "/repo/src/a.ts",
          errorCount: 2,
          warningCount: 1,
          fixableErrorCount: 1,
          fixableWarningCount: 0,
          messages: [
            {
              ruleId: "no-unused-vars",
              severity: 2,
              line: 10,
              column: 5,
              message: "'value' is assigned a value but never used.",
              fix: { range: [1, 2], text: "" },
              suggestions: [{ desc: "remove" }],
              source: "const value = 1;"
            },
            {
              ruleId: "eqeqeq",
              severity: 2,
              line: 11,
              column: 8,
              message: "Expected '===' and instead saw '=='."
            },
            {
              ruleId: "no-console",
              severity: 1,
              line: 12,
              column: 1,
              message: "Unexpected console statement."
            }
          ]
        },
        {
          filePath: "/repo/src/b.ts",
          errorCount: 1,
          warningCount: 0,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          messages: [
            {
              ruleId: "no-unused-vars",
              severity: 2,
              line: 4,
              column: 3,
              message: "unused ".repeat(80)
            }
          ]
        }
      ],
      { cwd: "/repo" }
    );

    expect(summary.lintResult).toMatchObject({
      status: "success",
      errorCount: 3,
      warningCount: 1,
      fixableErrorCount: 1,
      fixableWarningCount: 0,
      fileCount: 2,
      problemFileCount: 2
    });
    expect(summary.ruleSummary[0]).toEqual({
      ruleId: "no-unused-vars",
      severity: "error",
      count: 2,
      fixableCount: 1
    });
    expect(summary.fileSummary[0]).toMatchObject({
      filePath: "src/a.ts",
      errorCount: 2,
      warningCount: 1,
      disableCount: 0
    });
    expect(summary.evidence.topRuleExamples[0]).toMatchObject({
      ruleId: "no-unused-vars",
      severity: "error",
      filePath: "src/a.ts",
      line: 10,
      column: 5
    });
    expect(JSON.stringify(summary)).not.toContain("source");
    expect(JSON.stringify(summary)).not.toContain("suggestions");
    expect(JSON.stringify(summary)).not.toContain("range");
    expect(summary.evidence.topRuleExamples[1].message.length).toBeLessThanOrEqual(200);
  });

  test("enforces top item and evidence limits", () => {
    const messages = Array.from({ length: 30 }, (_, index) => ({
      ruleId: `rule-${index}`,
      severity: index % 2 === 0 ? 2 : 1,
      line: index + 1,
      column: 1,
      message: `message-${index}`
    }));

    const summary = buildEslintSummary(
      [
        {
          filePath: "/repo/src/many.ts",
          errorCount: 15,
          warningCount: 15,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          messages
        }
      ],
      {
        cwd: "/repo",
        limits: {
          maxRules: 5,
          maxFiles: 1,
          maxExamplesPerRule: 1,
          maxExamplesPerFile: 2,
          maxMessageLength: 20
        }
      }
    );

    expect(summary.ruleSummary).toHaveLength(5);
    expect(summary.fileSummary).toHaveLength(1);
    expect(summary.evidence.topRuleExamples).toHaveLength(5);
    expect(summary.evidence.topFileExamples[0].examples).toHaveLength(2);
    expect(summary.limits).toEqual({
      maxRules: 5,
      maxFiles: 1,
      maxExamplesPerRule: 1,
      maxExamplesPerFile: 2,
      maxMessageLength: 20
    });
  });
});
```

- [ ] **Step 2: Run formatter tests and verify failure**

Run: `npm test -- tests/formatter.test.ts`

Expected: FAIL because `src/lint/summaryFormatter.ts` does not exist.

- [ ] **Step 3: Implement summary formatter**

Create `src/lint/summaryFormatter.ts`:

```ts
import path from "node:path";
import type { EslintSummary, FormatterLimits, LintEvidence, RuleSummaryItem, FileSummaryItem } from "../types.js";

export interface EslintFormatterMessage {
  ruleId?: string | null;
  severity?: number;
  line?: number;
  column?: number;
  message?: string;
  fix?: unknown;
}

export interface EslintFormatterResult {
  filePath: string;
  errorCount?: number;
  warningCount?: number;
  fixableErrorCount?: number;
  fixableWarningCount?: number;
  messages?: EslintFormatterMessage[];
}

export interface BuildEslintSummaryOptions {
  cwd?: string;
  limits?: Partial<FormatterLimits>;
}

export const DEFAULT_FORMATTER_LIMITS: FormatterLimits = {
  maxRules: 20,
  maxFiles: 20,
  maxExamplesPerRule: 3,
  maxExamplesPerFile: 3,
  maxMessageLength: 200
};

export function buildEslintSummary(results: EslintFormatterResult[], options: BuildEslintSummaryOptions = {}): EslintSummary {
  const limits = { ...DEFAULT_FORMATTER_LIMITS, ...options.limits };
  const ruleCounts = new Map<string, RuleSummaryItem>();
  const examplesByRule = new Map<string, LintEvidence["topRuleExamples"]>();
  let errorCount = 0;
  let warningCount = 0;
  let fixableErrorCount = 0;
  let fixableWarningCount = 0;

  const allFileSummaries: FileSummaryItem[] = [];
  const topFileExamples: LintEvidence["topFileExamples"] = [];

  for (const result of results) {
    const filePath = normalizeFilePath(result.filePath, options.cwd);
    const fileErrorCount = result.errorCount ?? 0;
    const fileWarningCount = result.warningCount ?? 0;
    errorCount += fileErrorCount;
    warningCount += fileWarningCount;
    fixableErrorCount += result.fixableErrorCount ?? 0;
    fixableWarningCount += result.fixableWarningCount ?? 0;

    allFileSummaries.push({
      filePath,
      errorCount: fileErrorCount,
      warningCount: fileWarningCount,
      disableCount: 0
    });

    const fileExamples = [];
    for (const message of result.messages ?? []) {
      const ruleId = message.ruleId ?? "fatal";
      const existing = ruleCounts.get(ruleId) ?? {
        ruleId,
        severity: severityName(message.severity),
        count: 0,
        fixableCount: 0
      };
      existing.count += 1;
      if (message.fix !== undefined) {
        existing.fixableCount += 1;
      }
      ruleCounts.set(ruleId, existing);

      const evidence = {
        ruleId,
        severity: severityName(message.severity),
        filePath,
        line: message.line ?? 0,
        column: message.column ?? 0,
        message: truncateMessage(message.message ?? "", limits.maxMessageLength)
      };
      const ruleExamples = examplesByRule.get(ruleId) ?? [];
      if (ruleExamples.length < limits.maxExamplesPerRule) {
        ruleExamples.push(evidence);
        examplesByRule.set(ruleId, ruleExamples);
      }
      if (fileExamples.length < limits.maxExamplesPerFile) {
        fileExamples.push(evidence);
      }
    }

    if (fileExamples.length > 0) {
      topFileExamples.push({
        filePath,
        errorCount: fileErrorCount,
        warningCount: fileWarningCount,
        examples: fileExamples
      });
    }
  }

  const ruleSummary = [...ruleCounts.values()]
    .sort((left, right) => right.count - left.count || left.ruleId.localeCompare(right.ruleId))
    .slice(0, limits.maxRules);
  const fileSummary = allFileSummaries
    .sort((left, right) => right.errorCount + right.warningCount - (left.errorCount + left.warningCount) || left.filePath.localeCompare(right.filePath))
    .slice(0, limits.maxFiles);
  const retainedRuleIds = new Set(ruleSummary.map((rule) => rule.ruleId));

  return {
    schemaVersion: "0.1.0",
    generatedAt: new Date().toISOString(),
    lintResult: {
      status: "success",
      errorCount,
      warningCount,
      fixableErrorCount,
      fixableWarningCount,
      fileCount: results.length,
      problemFileCount: allFileSummaries.filter((file) => file.errorCount + file.warningCount > 0).length
    },
    ruleSummary,
    fileSummary,
    evidence: {
      topRuleExamples: ruleSummary.flatMap((rule) => examplesByRule.get(rule.ruleId) ?? []).filter((example) => retainedRuleIds.has(example.ruleId)),
      topFileExamples: topFileExamples
        .sort((left, right) => right.errorCount + right.warningCount - (left.errorCount + left.warningCount) || left.filePath.localeCompare(right.filePath))
        .slice(0, limits.maxFiles)
    },
    limits
  };
}

export default function formatter(results: EslintFormatterResult[]): string {
  return `${JSON.stringify(buildEslintSummary(results, { cwd: process.cwd() }), null, 2)}\n`;
}

function severityName(severity: number | undefined): RuleSummaryItem["severity"] {
  if (severity === 2) {
    return "error";
  }
  if (severity === 1) {
    return "warning";
  }
  return "unknown";
}

function normalizeFilePath(filePath: string, cwd?: string): string {
  const relativePath = cwd && path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  return relativePath.split(path.sep).join("/");
}

function truncateMessage(message: string, maxLength: number): string {
  return message.length > maxLength ? message.slice(0, maxLength) : message;
}
```

- [ ] **Step 4: Add formatter-related types**

Modify `src/types.ts` to add these interfaces near `FileSummaryItem`:

```ts
export interface FormatterLimits {
  maxRules: number;
  maxFiles: number;
  maxExamplesPerRule: number;
  maxExamplesPerFile: number;
  maxMessageLength: number;
}

export interface LintEvidenceExample {
  ruleId: string;
  severity: "error" | "warning" | "unknown";
  filePath: string;
  line: number;
  column: number;
  message: string;
}

export interface LintEvidence {
  topRuleExamples: LintEvidenceExample[];
  topFileExamples: Array<{
    filePath: string;
    errorCount: number;
    warningCount: number;
    examples: LintEvidenceExample[];
  }>;
}

export interface EslintSummary {
  schemaVersion: string;
  generatedAt: string;
  lintResult: LintResult & {
    problemFileCount: number;
  };
  ruleSummary: RuleSummaryItem[];
  fileSummary: FileSummaryItem[];
  evidence: LintEvidence;
  limits: FormatterLimits;
}
```

Extend `LintResult`:

```ts
problemFileCount: number;
```

Extend `CheckerReport`:

```ts
lintEvidence: LintEvidence;
```

- [ ] **Step 5: Run formatter tests and typecheck**

Run: `npm test -- tests/formatter.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit formatter aggregation**

```bash
git add src/types.ts src/lint/summaryFormatter.ts tests/formatter.test.ts
git commit -m "feat: add eslint summary formatter"
```

## Task 2: Summary Parser

**Files:**
- Modify: `src/lint/parse.ts`
- Modify: `tests/lint.test.ts`

- [ ] **Step 1: Write failing summary parser tests**

Replace the ESLint raw JSON parser test in `tests/lint.test.ts` with tests that create `.eslint-checker/eslint-summary.json` fixtures:

```ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseEslintSummary } from "../src/lint/parse.js";

describe("parseEslintSummary", () => {
  test("reads compact eslint summary output", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "eslint-summary-"));
    const reportPath = path.join(cwd, ".eslint-checker/eslint-summary.json");
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      JSON.stringify({
        schemaVersion: "0.1.0",
        generatedAt: "2026-06-04T00:00:00.000Z",
        lintResult: {
          status: "success",
          errorCount: 2,
          warningCount: 1,
          fixableErrorCount: 1,
          fixableWarningCount: 0,
          fileCount: 3,
          problemFileCount: 2
        },
        ruleSummary: [{ ruleId: "no-unused-vars", severity: "error", count: 2, fixableCount: 1 }],
        fileSummary: [{ filePath: "src/a.ts", errorCount: 2, warningCount: 0, disableCount: 0 }],
        evidence: {
          topRuleExamples: [{ ruleId: "no-unused-vars", severity: "error", filePath: "src/a.ts", line: 1, column: 1, message: "unused" }],
          topFileExamples: [{ filePath: "src/a.ts", errorCount: 2, warningCount: 0, examples: [] }]
        },
        limits: {
          maxRules: 20,
          maxFiles: 20,
          maxExamplesPerRule: 3,
          maxExamplesPerFile: 3,
          maxMessageLength: 200
        }
      }),
      "utf8"
    );

    await expect(parseEslintSummary(reportPath)).resolves.toMatchObject({
      lintResult: { status: "success", errorCount: 2, warningCount: 1, problemFileCount: 2 },
      ruleSummary: [{ ruleId: "no-unused-vars", severity: "error", count: 2, fixableCount: 1 }],
      lintEvidence: {
        topRuleExamples: [{ filePath: "src/a.ts", line: 1, column: 1 }]
      }
    });
  });

  test("returns explicit failure when summary is missing", async () => {
    await expect(parseEslintSummary("/missing/eslint-summary.json")).resolves.toMatchObject({
      lintResult: {
        status: "failed",
        failureReason: "eslint_summary_unavailable"
      },
      ruleSummary: [],
      fileSummary: [],
      lintEvidence: {
        topRuleExamples: [],
        topFileExamples: []
      }
    });
  });

  test("returns explicit failure when summary is invalid", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "eslint-summary-invalid-"));
    const reportPath = path.join(cwd, "eslint-summary.json");
    await writeFile(reportPath, "{", "utf8");

    await expect(parseEslintSummary(reportPath)).resolves.toMatchObject({
      lintResult: {
        status: "failed",
        failureReason: "eslint_summary_invalid"
      }
    });
  });
});
```

- [ ] **Step 2: Run parser tests and verify failure**

Run: `npm test -- tests/lint.test.ts`

Expected: FAIL because `parseEslintSummary` is not implemented.

- [ ] **Step 3: Implement summary parser**

Replace `src/lint/parse.ts` with:

```ts
import type { EslintSummary, FileSummaryItem, LintEvidence, LintResult, RuleSummaryItem } from "../types.js";
import { pathExists, readJsonFile } from "../utils/fs.js";

export interface ParsedEslintSummary {
  lintResult: LintResult;
  ruleSummary: RuleSummaryItem[];
  fileSummary: FileSummaryItem[];
  lintEvidence: LintEvidence;
}

const emptyEvidence: LintEvidence = {
  topRuleExamples: [],
  topFileExamples: []
};

export async function parseEslintSummary(summaryPath: string): Promise<ParsedEslintSummary> {
  if (!(await pathExists(summaryPath))) {
    return failedParsedSummary("eslint_summary_unavailable");
  }

  try {
    const summary = await readJsonFile<EslintSummary>(summaryPath);
    if (!summary?.lintResult || !Array.isArray(summary.ruleSummary) || !Array.isArray(summary.fileSummary)) {
      return failedParsedSummary("eslint_summary_invalid");
    }

    return {
      lintResult: summary.lintResult,
      ruleSummary: summary.ruleSummary,
      fileSummary: summary.fileSummary,
      lintEvidence: summary.evidence ?? emptyEvidence
    };
  } catch {
    return failedParsedSummary("eslint_summary_invalid");
  }
}

function failedParsedSummary(failureReason: string): ParsedEslintSummary {
  return {
    lintResult: {
      status: "failed",
      errorCount: 0,
      warningCount: 0,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      fileCount: 0,
      problemFileCount: 0,
      failureReason
    },
    ruleSummary: [],
    fileSummary: [],
    lintEvidence: emptyEvidence
  };
}
```

- [ ] **Step 4: Run parser tests and build**

Run: `npm test -- tests/lint.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: FAIL only if call sites still import `parseEslintJson`; fix imports in later tasks if this occurs.

- [ ] **Step 5: Commit summary parser**

```bash
git add src/lint/parse.ts tests/lint.test.ts
git commit -m "feat: parse eslint summary output"
```

## Task 3: Execution Flow and Raw Debug Option

**Files:**
- Modify: `src/lint/execute.ts`
- Modify: `src/lint/recovery.ts`
- Modify: `src/cli.ts`
- Modify: `src/types.ts`
- Test: `tests/report.test.ts`

- [ ] **Step 1: Write failing execution tests**

Add assertions to `tests/report.test.ts` in the successful report test:

```ts
expect(reportJson.artifacts.eslintSummaryJson).toBe(".eslint-checker/eslint-summary.json");
expect(reportJson.artifacts.eslintReportJson).toBeNull();
await expect(readFile(path.join(cwd, ".eslint-checker/eslint-summary.json"), "utf8")).resolves.toContain("lintResult");
await expect(readFile(path.join(cwd, ".eslint-checker/eslint-report.json"), "utf8")).rejects.toThrow();
```

Add a second test for raw debug mode:

```ts
test("writes raw eslint report only when raw debug output is requested", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "eslint-checker-raw-"));
  await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "raw-fixture", version: "1.0.0", devDependencies: { eslint: "^9.0.0" } }), "utf8");

  const report = await runChecker({
    cwd,
    options: {
      system: "unknown",
      center: "unknown",
      owner: "unknown",
      mode: "full",
      output: ".eslint-checker",
      timeout: "30",
      forIflycode: true,
      recovery: false,
      rawEslintReport: true
    }
  });

  expect(report.artifacts.eslintReportJson).toBe(".eslint-checker/eslint-report.json");
});
```

- [ ] **Step 2: Run report tests and verify failure**

Run: `npm test -- tests/report.test.ts`

Expected: FAIL because execution still writes `eslint-report.json` and `rawEslintReport` is not typed.

- [ ] **Step 3: Update option and artifact types**

Modify `src/types.ts`:

```ts
export interface CheckerOptions {
  system?: string;
  center?: string;
  owner?: string;
  mode: CheckMode;
  output: string;
  timeout: string;
  forIflycode: boolean;
  recovery: boolean;
  rawEslintReport?: boolean;
  console?: boolean;
}
```

Modify `Artifacts`:

```ts
eslintSummaryJson: string;
eslintReportJson: string | null;
```

- [ ] **Step 4: Add CLI option**

Modify `src/cli.ts`:

```ts
.option("--raw-eslint-report", "also emit full raw ESLint JSON for debugging", false)
```

- [ ] **Step 5: Run ESLint with summary formatter by default**

Modify `src/lint/execute.ts`:

```ts
const summaryPath = path.join(outputDirectory, "eslint-summary.json");
const args = ["eslint", ".", "-f", new URL("./summaryFormatter.js", import.meta.url).pathname, "-o", summaryPath];
```

Extend `ExecuteLintInput`:

```ts
rawEslintReport?: boolean;
```

After summary execution succeeds, if `rawEslintReport` is true, run:

```ts
const rawReportPath = path.join(outputDirectory, "eslint-report.json");
await runCommand({
  cwd,
  command: "npx",
  args: ["eslint", ".", "-f", "json", "-o", rawReportPath],
  timeoutMs: timeoutSeconds * 1000
});
```

Do not fail the primary lint result if the raw debug command fails; log the failure with `logger.error(...)`.

- [ ] **Step 6: Pass raw option through recovery**

No new API is needed in `src/lint/recovery.ts` if `rawEslintReport` remains part of `ExecuteLintInput`. Confirm the retry call keeps:

```ts
lintExecution = await executeLint({ ...executeInput, logger });
```

- [ ] **Step 7: Run execution tests**

Run: `npm test -- tests/report.test.ts`

Expected: PASS after Task 4 updates schema/index if failures are schema-only.

- [ ] **Step 8: Commit execution flow**

```bash
git add src/lint/execute.ts src/lint/recovery.ts src/cli.ts src/types.ts tests/report.test.ts
git commit -m "feat: run eslint with summary formatter"
```

## Task 4: Report Protocol, Schema, and Artifacts

**Files:**
- Modify: `src/index.ts`
- Modify: `src/report/schema.ts`
- Modify: `src/report/artifacts.ts`
- Modify: `tests/report.test.ts`

- [ ] **Step 1: Write failing report protocol assertions**

Add to `tests/report.test.ts`:

```ts
expect(reportJson.schemaVersion).toBe("0.2.0");
expect(reportJson.lintResult).toHaveProperty("problemFileCount");
expect(reportJson.lintEvidence).toMatchObject({
  topRuleExamples: expect.any(Array),
  topFileExamples: expect.any(Array)
});
expect(summary).toContain("eslint-summary.json");
expect(summary).not.toContain("eslint-report.json: .eslint-checker/eslint-report.json");
```

- [ ] **Step 2: Run report tests and verify failure**

Run: `npm test -- tests/report.test.ts`

Expected: FAIL because schema version, evidence, and artifact rendering are not updated.

- [ ] **Step 3: Update report composition**

Modify `src/index.ts`:

```ts
import { parseEslintSummary } from "./lint/parse.js";
```

Change `SCHEMA_VERSION`:

```ts
const SCHEMA_VERSION = "0.2.0";
```

Pass `rawEslintReport` into `executeLint`:

```ts
rawEslintReport: options.rawEslintReport
```

Read summary output:

```ts
const parsedLint =
  lintExecution.status === "success"
    ? await parseEslintSummary(`${cwd}/${outputDirectory}/eslint-summary.json`)
    : {
        lintResult: {
          status: "not_collected" as const,
          errorCount: 0,
          warningCount: 0,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          fileCount: 0,
          problemFileCount: 0
        },
        ruleSummary: [],
        fileSummary: [],
        lintEvidence: {
          topRuleExamples: [],
          topFileExamples: []
        }
      };
```

Add to `reportWithoutRisk`:

```ts
lintEvidence: parsedLint.lintEvidence,
```

Update artifacts:

```ts
eslintSummaryJson: `${outputDirectory}/eslint-summary.json`,
eslintReportJson: options.rawEslintReport ? `${outputDirectory}/eslint-report.json` : null,
```

- [ ] **Step 4: Update Zod schema**

Modify `src/report/schema.ts`:

```ts
const lintEvidenceExampleSchema = z.object({
  ruleId: z.string(),
  severity: z.string(),
  filePath: z.string(),
  line: z.number(),
  column: z.number(),
  message: z.string()
});
```

Add `problemFileCount` to `lintResult`.

Add `lintEvidence` to the top-level schema:

```ts
lintEvidence: z.object({
  topRuleExamples: z.array(lintEvidenceExampleSchema),
  topFileExamples: z.array(z.object({
    filePath: z.string(),
    errorCount: z.number(),
    warningCount: z.number(),
    examples: z.array(lintEvidenceExampleSchema)
  }))
}),
```

Update artifacts:

```ts
eslintSummaryJson: z.string(),
eslintReportJson: z.string().nullable(),
```

- [ ] **Step 5: Update summary artifact rendering**

Modify `src/report/artifacts.ts`:

```ts
`- eslint-summary.json: ${report.artifacts.eslintSummaryJson}`,
report.artifacts.eslintReportJson ? `- eslint-report.json: ${report.artifacts.eslintReportJson}` : "- eslint-report.json: not generated by default",
```

- [ ] **Step 6: Run report tests and build**

Run: `npm test -- tests/report.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit report protocol update**

```bash
git add src/index.ts src/report/schema.ts src/report/artifacts.ts tests/report.test.ts
git commit -m "feat: add lint evidence to report protocol"
```

## Task 5: Documentation and Skill Update

**Files:**
- Modify: `README.md`
- Modify: `skills/iflycode-eslint-report/SKILL.md`

- [ ] **Step 1: Update README artifact list**

Modify `README.md` generated artifact section:

```md
- `.eslint-checker/report.json`: stable machine-readable report.
- `.eslint-checker/summary.md`: development-readable summary.
- `.eslint-checker/eslint-summary.json`: compact ESLint formatter output used by `report.json`.
- `.eslint-checker/eslint-config.json`: resolved ESLint config when collection succeeds.
- `.eslint-checker/lint-log.txt`: execution log.
- `.eslint-checker/eslint-report.json`: optional raw ESLint JSON only when `--raw-eslint-report` is used.
```

Add CLI option:

```md
- `--raw-eslint-report`: also emit full raw ESLint JSON for debugging. This is slower and can be large.
```

- [ ] **Step 2: Update iflycode Skill artifact rules**

Modify `skills/iflycode-eslint-report/SKILL.md`:

```md
- Mention generated artifacts: `report.json`, `summary.md`, `eslint-summary.json`, `eslint-config.json`, and `lint-log.txt`.
- Mention `eslint-report.json` only when `artifacts.eslintReportJson` is present; it is an opt-in raw debug artifact.
- Use `lintEvidence` for representative examples when writing the main issue analysis, but do not expand beyond recorded examples.
```

- [ ] **Step 3: Scan docs for stale raw artifact wording**

Run:

```bash
rg -n "eslint-report\\.json|eslint-summary\\.json|raw ESLint" README.md skills/iflycode-eslint-report/SKILL.md
```

Expected: README and Skill describe summary as default and raw report as optional.

- [ ] **Step 4: Commit docs**

```bash
git add README.md skills/iflycode-eslint-report/SKILL.md
git commit -m "docs: document eslint summary artifact"
```

## Task 6: Full Verification

**Files:**
- Modify only if verification exposes issues in files touched by Tasks 1-5.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Run CLI smoke check**

Run:

```bash
rm -rf .eslint-checker
npm run build
node dist/cli.js --mode full --timeout 60 --no-recovery
```

Expected:

- `.eslint-checker/report.json` exists.
- `.eslint-checker/eslint-summary.json` exists.
- `.eslint-checker/eslint-report.json` does not exist unless raw mode is used.

- [ ] **Step 4: Run raw debug smoke check**

Run:

```bash
rm -rf .eslint-checker
node dist/cli.js --mode full --timeout 60 --no-recovery --raw-eslint-report
```

Expected:

- `.eslint-checker/report.json` exists.
- `.eslint-checker/eslint-summary.json` exists.
- `.eslint-checker/eslint-report.json` exists.

- [ ] **Step 5: Commit verification fixes if needed**

If Step 1-4 required code changes:

```bash
git add <changed-files>
git commit -m "fix: stabilize eslint summary formatter"
```

If no code changes were required, do not create an empty commit.

## Self-Review

- Spec coverage: The plan covers custom formatter output, aggregate counts, bounded evidence, default summary artifact, optional raw artifact, report protocol changes, schema changes, docs, error handling, recovery path, and tests.
- Placeholder scan: No placeholder markers are intentionally present; all tasks include concrete files, code snippets, commands, and expected results.
- Type consistency: The plan consistently uses `EslintSummary`, `FormatterLimits`, `LintEvidence`, `parseEslintSummary`, `eslintSummaryJson`, `eslintReportJson`, and `rawEslintReport`.
