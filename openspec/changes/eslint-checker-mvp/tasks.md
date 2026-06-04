# Tasks: eslint-checker-mvp

- [x] Initialize the `@sunny/eslint-checker` Node CLI package and expose the `eslint-checker` command.
- [x] Implement project root validation and baseline project, Git, Node, and package manager discovery.
- [x] Implement technology stack detection for Vue, React, Umi, Next, Vite, Webpack, and unknown projects.
- [x] Implement ESLint access detection for dependencies, config files, `package.json eslintConfig`, and lint scripts.
- [x] Implement ESLint config quality analysis for disabled common format, quality, and stack-specific rules.
- [x] Implement `src`-only `eslint-disable` scanning and risk summary.
- [x] Implement safe ESLint JSON execution with timeout and artifact logging.
- [ ] Implement lint recovery for missing shared configs, plugins, and parsers, including controlled dev dependency installation and bounded retry.
- [ ] Implement ESLint JSON parsing into lint result, rule summary, and file summary.
- [ ] Implement stable `report.json` schema and development-readable `summary.md`.
- [ ] Implement `lint-log.txt` logging for commands, output, recovery, retries, and failures.
- [ ] Implement iflycode Skill workflow for installing/running `@sunny/eslint-checker`, waiting for report output, and generating the formal report.
- [ ] Add tests or fixtures for no ESLint, partial ESLint, missing plugin/parser/config, config-disabled rules, disable-heavy `src`, and successful lint execution.
- [ ] Write README usage examples for direct CLI usage and iflycode Skill usage.
