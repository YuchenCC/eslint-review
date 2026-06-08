# Tasks: fix-eslint6-formatter-compat

- [x] Add a regression test that reproduces ESLint 6 loading the checker formatter through CommonJS.
- [x] Implement a CommonJS-compatible formatter entrypoint and route lint execution to it.
- [x] Verify the full test suite, build, and `jup/eslintByJup2` checker run.
