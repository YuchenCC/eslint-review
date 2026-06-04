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
- `--system`, `--center`, `--owner`: attach report metadata.
- `--for-iflycode`: emit artifacts for iflycode report generation.

Generated artifacts:

- `.eslint-checker/report.json`: stable machine-readable report.
- `.eslint-checker/summary.md`: development-readable summary.
- `.eslint-checker/eslint-report.json`: raw ESLint JSON output when lint execution succeeds.
- `.eslint-checker/eslint-config.json`: resolved ESLint config from `npx eslint --print-config <target-file>` when config collection succeeds.
- `.eslint-checker/lint-log.txt`: commands, execution notes, recovery, and failures.

The checker reports both static config quality and resolved ESLint config. `eslintConfigAnalysis` is a static governance analysis of config files and `package.json#eslintConfig`, focused on disabled rules and weakened standard config. `eslintResolvedConfig` records whether the CLI could ask ESLint for the effective config and, when successful, writes that merged runtime config to `.eslint-checker/eslint-config.json`.

## iflycode Skill Usage

Use `skills/iflycode-eslint-report/SKILL.md` to run the checker in a business project and generate a formal report. The Skill must use `.eslint-checker/report.json` as the source of truth and must not invent factual counts or statuses.

Typical command:

```bash
npx @sunny/eslint-checker --mode full --for-iflycode
```
