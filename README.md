# @sunny/eslint-checker

`@sunny/eslint-checker` is a Node CLI that inspects a JavaScript or TypeScript project and writes ESLint governance artifacts to `.eslint-checker/`.

## Direct CLI Usage

```bash
npx @sunny/eslint-checker --mode full
```

Useful options:

- `--mode access`: collect discovery and access information without running ESLint.
- `--output <dir>`: change the artifact directory. Default: `.eslint-checker`.
- `--timeout <seconds>`: set the ESLint execution timeout. Default: `120`.
- `--no-recovery`: disable bounded missing dependency recovery.
- `--raw-eslint-report`: also emit full raw ESLint JSON for debugging. This is slower and can be large.
- `--system`, `--center`, `--owner`: attach report metadata.
- `--for-iflycode`: emit artifacts for iflycode report generation.

Source discovery:

- ESLint execution, `eslint-disable` scanning, and resolved config collection use the same discovered source entries.
- Supported entries are `src`, `apps/*/src`, `apps/*/app`, `packages/*/src`, and `packages/*/app`.
- Generated and public assets are excluded, including `public`, nested `public`, `dist`, `build`, `node_modules`, the output directory, and `*.min.js`.

Generated artifacts:

- `.eslint-checker/report.json`: stable machine-readable report.
- `.eslint-checker/summary.md`: development-readable summary.
- `.eslint-checker/eslint-summary.json`: compact ESLint formatter output used by `report.json`.
- `.eslint-checker/eslint-config.json`: resolved ESLint config when collection succeeds.
- `.eslint-checker/lint-log.txt`: execution log.
- `.eslint-checker/eslint-report.json`: optional raw ESLint JSON only when `--raw-eslint-report` is used.

The checker reports both static config quality and resolved ESLint config. `eslintConfigAnalysis` is a static governance analysis of config files and `package.json#eslintConfig`, focused on disabled rules and weakened standard config. `eslintResolvedConfig` records whether the CLI could ask ESLint for the effective config and, when successful, writes that merged runtime config to `.eslint-checker/eslint-config.json`.

## iflycode Skill Usage

Use `skills/iflycode-eslint-report/SKILL.md` to run the checker in a business project and generate a formal report. The Skill must use `.eslint-checker/report.json` as the source of truth and must not invent factual counts or statuses.

Typical command:

```bash
npx @sunny/eslint-checker --mode full --for-iflycode
```
