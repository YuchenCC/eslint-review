# ESLint Summary Formatter Design

## Goal

Replace the default dependency on full ESLint JSON output with a lightweight formatter output that still covers every fact needed by the final `report.json` and formal iflycode report.

The checker should avoid writing, reading, and parsing large `.eslint-checker/eslint-report.json` files during normal execution. It should instead run ESLint with a custom formatter that emits a compact `.eslint-checker/eslint-summary.json` file containing aggregate lint statistics and bounded evidence samples.

## Problem

The current lint flow runs:

```bash
npx eslint . -f json -o .eslint-checker/eslint-report.json
```

The checker then reads the full JSON file and parses it into memory before producing `lintResult`, `ruleSummary`, and `fileSummary`. In large systems, the raw ESLint JSON can become very large because each message can contain location fields, fix ranges, suggestions, and sometimes source context. Trimming only `report.json` does not remove the write, read, and parse pressure from the raw file.

## Formatter Output

The new default formatter writes `.eslint-checker/eslint-summary.json`.

Required shape:

```json
{
  "schemaVersion": "0.1.0",
  "generatedAt": "2026-06-04T00:00:00.000Z",
  "lintResult": {
    "status": "success",
    "errorCount": 0,
    "warningCount": 0,
    "fixableErrorCount": 0,
    "fixableWarningCount": 0,
    "fileCount": 0,
    "problemFileCount": 0
  },
  "ruleSummary": [],
  "fileSummary": [],
  "evidence": {
    "topRuleExamples": [],
    "topFileExamples": []
  },
  "limits": {
    "maxRules": 20,
    "maxFiles": 20,
    "maxExamplesPerRule": 3,
    "maxExamplesPerFile": 3,
    "maxMessageLength": 200
  }
}
```

The formatter owns only lint-result facts. Existing checker modules continue to own project metadata, Git metadata, ESLint access detection, config analysis, resolved config collection, disable scanning, recovery, artifact paths, and risk assessment.

## Aggregates

`lintResult` must include:

- `errorCount`
- `warningCount`
- `fixableErrorCount`
- `fixableWarningCount`
- `fileCount`
- `problemFileCount`

`ruleSummary` must include the top rules by occurrence count:

- `ruleId`
- `severity`
- `count`
- `fixableCount`

`fileSummary` must include the top files by problem count:

- `filePath`
- `errorCount`
- `warningCount`
- `disableCount`

`disableCount` remains `0` in formatter output unless a future formatter can safely derive it from lint messages. The existing disable scanner remains the source of truth for `eslint-disable` usage.

## Evidence Samples

The formatter must retain bounded evidence so the formal report has factual examples behind its conclusions without storing every lint message.

`evidence.topRuleExamples` contains representative examples for the highest-volume rules:

```json
{
  "ruleId": "@typescript-eslint/no-explicit-any",
  "severity": "warning",
  "filePath": "src/example.ts",
  "line": 12,
  "column": 8,
  "message": "Unexpected any. Specify a different type."
}
```

`evidence.topFileExamples` contains representative examples for the highest-volume files:

```json
{
  "filePath": "src/example.ts",
  "errorCount": 2,
  "warningCount": 5,
  "examples": [
    {
      "ruleId": "no-unused-vars",
      "severity": "error",
      "line": 20,
      "column": 5,
      "message": "'value' is assigned a value but never used."
    }
  ]
}
```

Default limits:

- Keep top 20 rules.
- Keep top 20 files.
- Keep at most 3 examples per retained rule.
- Keep at most 3 examples per retained file.
- Truncate messages to 200 characters.

The formatter must not retain source text, fix text, suggestions, full fix ranges, `nodeType`, `messageId`, or end-position fields. File paths must be relative to the checked project root when possible.

## Runtime Flow

Default full mode should run ESLint with the summary formatter:

```bash
npx eslint . -f <checker-summary-formatter> -o .eslint-checker/eslint-summary.json
```

After execution succeeds with ESLint exit code `0` or `1`, the checker reads `.eslint-checker/eslint-summary.json` and maps it into:

- `lintResult`
- `ruleSummary`
- `fileSummary`
- `lintEvidence`

The final `report.json` should include formatter-derived lint facts and evidence. The iflycode Skill continues to treat `report.json` as the only source of factual counts and statuses.

## Raw ESLint JSON

Full `.eslint-checker/eslint-report.json` should become an opt-in debug artifact, not a default artifact.

The CLI should expose an explicit option such as `--raw-eslint-report`. When enabled, the checker may run ESLint with the JSON formatter or perform an additional debug collection step. This mode is expected to be slower and heavier.

The artifact list should distinguish default artifacts from optional debug artifacts so the formal report does not imply that raw ESLint JSON always exists.

## Compatibility

This changes the report protocol by adding lint evidence and replacing the default raw ESLint artifact with a summary artifact. The schema version should be incremented.

Consumers should rely on:

- `report.json` for formal report facts.
- `eslint-summary.json` for formatter-level debug inspection.
- `eslint-report.json` only when explicitly generated in raw debug mode.

## Error Handling

If ESLint exits with `0` or `1` but summary output is missing or invalid, lint parsing should be marked failed with a specific failure reason such as `eslint_summary_unavailable` or `eslint_summary_invalid`.

If ESLint exits with another code, the current execution failure and recovery path remains responsible for retry decisions.

If recovery succeeds, the retry should also use the summary formatter by default.

## Testing Focus

Tests should cover:

- Formatter aggregate counts match a representative ESLint result set.
- Top rule and top file limits are enforced.
- Evidence examples are bounded and message text is truncated.
- Source text, fix text, suggestions, and full ranges are omitted.
- Checker reads `eslint-summary.json` into final `report.json`.
- Missing or invalid summary output produces an explicit failure reason.
- Raw `eslint-report.json` is not produced by default.
- Raw report generation remains available through the explicit debug option.
