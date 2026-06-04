import { describe, expect, test } from "vitest";
import { executeLint } from "../src/lint/execute.js";
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
});
