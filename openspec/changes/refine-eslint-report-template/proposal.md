# Proposal: refine-eslint-report-template

## Problem

`skills/iflycode-eslint-report/SKILL.md` currently defines only seven coarse report sections. This is enough to guide a one-off report, but it leaves too much freedom in wording, subsection order, field selection, and evidence presentation. Reports generated for different projects can therefore differ in structure, which weakens delivery consistency and makes later multi-project aggregation harder.

The current workflow also focuses on a single formal report. It does not yet define a separate machine-readable key-data output for later cross-project summary reports.

## Goals

- Define a fine-grained report chapter template with stable section order, subsection names, required facts, optional facts, and fallback wording.
- Keep the Markdown-facing report highly consistent across projects while still allowing factual project differences.
- Define a separate key-data artifact for multi-project aggregation, using stable fields derived from `.eslint-checker/report.json`.
- Preserve the rule that `.eslint-checker/report.json` is the only factual source for counts, statuses, package data, lint evidence, and recommendations.
- Use Chinese for narrative content, while preserving technical terms and keywords in English.

## Non-Goals

- Do not change the checker collection logic in this design.
- Do not invent new lint facts that are not present in `.eslint-checker/report.json`.
- Do not design the final multi-project summary report in full; this change only prepares the single-project key-data output that enables it.
- Do not require raw `eslint-report.json`; it remains an optional debug artifact only when generated.

## Expected Outputs

After parsing completes, the iflycode report workflow should produce two delivery materials:

1. **Key data output**: a structured JSON file for later aggregation across multiple projects.
2. **Markdown document output**: a formal single-project ESLint governance report rendered from the standardized chapter template.
