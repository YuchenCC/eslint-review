# Tasks: support-jupui-eslint

- [x] Add jupui scaffold detection to project discovery and expose optional framework profile metadata.
- [x] Extend ESLint access detection to collect direct and jupui-managed ESLint packages separately.
- [x] Update access-level calculation so jupui-managed ESLint dependencies count as valid ESLint access evidence.
- [x] Extend config analysis to resolve and analyze `require.resolve('jupui/.eslintrc.js')` from the business project root.
- [x] Add an explicit recovery path that runs package-manager install for declared-but-missing jupui dependencies without adding direct ESLint packages.
- [x] Update risk assessment to avoid incomplete-setup recommendations when ESLint is correctly managed by jupui.
- [x] Add focused tests for jupui 2.x and 3.x fixture shapes and preserve existing non-jupui behavior.
- [x] Run the test suite and verify checker output against `jup/eslintByJup2` and `jup/eslintByJup3`.
