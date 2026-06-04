import { describe, expect, test } from "vitest";
import { executeLint } from "../src/lint/execute.js";
import { buildInstallCommand, diagnoseMissingDependency } from "../src/lint/recovery.js";
import type { EslintAccess } from "../src/types.js";

describe("lint execution", () => {
  test("skips execution when ESLint is not connected", async () => {
    const eslintAccess: EslintAccess = {
      accessLevel: "not_connected",
      eslintDependencyDetected: false,
      eslintPackages: [],
      eslintConfigDetected: false,
      configFiles: [],
      packageJsonEslintConfigDetected: false,
      lintScriptDetected: false,
      lintScripts: {}
    };

    await expect(
      executeLint({
        cwd: "fixtures/no-package",
        outputDirectory: ".eslint-checker",
        timeoutSeconds: 1,
        eslintAccess
      })
    ).resolves.toMatchObject({
      status: "skipped",
      command: "",
      exitCode: null,
      skippedReason: "eslint_not_connected"
    });
  });

  test.each([
    ["Cannot find module '@typescript-eslint/parser'", ["@typescript-eslint/parser"]],
    ["ESLint couldn't find the plugin \"eslint-plugin-vue\".", ["eslint-plugin-vue"]],
    ["ESLint couldn't find the plugin \"react\".", ["eslint-plugin-react"]],
    ["ESLint couldn't find the config \"standard\" to extend from.", ["eslint-config-standard"]]
  ])("diagnoses installable dependency from %s", (message, expectedPackages) => {
    expect(diagnoseMissingDependency(message)).toEqual(expectedPackages);
  });

  test("builds package-manager specific install command", () => {
    expect(buildInstallCommand("pnpm", ["eslint-plugin-vue"])).toEqual({
      command: "pnpm",
      args: ["add", "-D", "eslint-plugin-vue"],
      text: "pnpm add -D eslint-plugin-vue"
    });
  });
});
