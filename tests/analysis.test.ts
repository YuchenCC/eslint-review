import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { analyzeEslintConfig } from "../src/analysis/configAnalysis.js";
import { scanEslintDisable } from "../src/analysis/disableScan.js";
import type { SourceEntries } from "../src/types.js";

const sourceEntries: SourceEntries = {
  entries: ["src"],
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    ".eslint-checker/**",
    "public/**",
    "**/public/**",
    "**/*.min.js"
  ]
};

describe("ESLint analysis", () => {
  test("detects disabled format and quality rules in JSON config", async () => {
    await expect(analyzeEslintConfig("fixtures/config-disabled")).resolves.toMatchObject({
      status: "success",
      disabledRuleCount: 4,
      disabledFormatRules: ["semi", "quotes"],
      disabledQualityRules: ["no-unused-vars", "eqeqeq"],
      disabledStackRules: []
    });
  });

  test("resolves and analyzes jupui shared ESLint config references", async () => {
    await expect(analyzeEslintConfig("fixtures/jupui-managed-2")).resolves.toMatchObject({
      status: "success",
      analyzedFiles: expect.arrayContaining([".eslintrc.js", "node_modules/jupui/.eslintrc.js"]),
      resolvedConfigFiles: ["node_modules/jupui/.eslintrc.js"],
      extendedConfigs: expect.arrayContaining([
        "plugin:vue/essential",
        "eslint:recommended",
        "@vue/typescript/recommended"
      ]),
      disabledFormatRules: expect.arrayContaining(["quotes"])
    });
  });

  test("keeps root config analysis when jupui shared config cannot be resolved", async () => {
    await expect(analyzeEslintConfig("fixtures/jupui-missing-install")).resolves.toMatchObject({
      status: "success",
      analyzedFiles: expect.arrayContaining([".eslintrc.js"]),
      resolvedConfigFiles: [],
      limitations: expect.arrayContaining(["Could not resolve jupui/.eslintrc.js"])
    });
  });

  test("scans src-only ESLint disable comments", async () => {
    await expect(scanEslintDisable("fixtures/disable-heavy", sourceEntries)).resolves.toMatchObject({
      status: "success",
      scannedDirectory: "src",
      totalDisableCount: 4,
      fileLevelDisableCount: 1,
      disableWithoutRuleCount: 2,
      broadDisableCount: 2
    });
  });

  test("scans discovered entries and ignores public and minified files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "eslint-disable-entries-"));
    try {
      await Promise.all([
        mkdir(path.join(cwd, "src"), { recursive: true }),
        mkdir(path.join(cwd, "packages/ui/src"), { recursive: true }),
        mkdir(path.join(cwd, "public"), { recursive: true })
      ]);
      await Promise.all([
        writeFile(path.join(cwd, "src/index.ts"), "/* eslint-disable */\n", "utf8"),
        writeFile(path.join(cwd, "packages/ui/src/view.tsx"), "// eslint-disable-next-line no-alert\n", "utf8"),
        writeFile(path.join(cwd, "public/app.js"), "/* eslint-disable */\n", "utf8"),
        writeFile(path.join(cwd, "src/vendor.min.js"), "/* eslint-disable */\n", "utf8")
      ]);

      await expect(
        scanEslintDisable(cwd, {
          ...sourceEntries,
          entries: ["packages/ui/src", "src"]
        })
      ).resolves.toMatchObject({
        status: "success",
        scannedDirectory: "packages/ui/src, src",
        totalDisableCount: 2,
        topFiles: [
          expect.objectContaining({ filePath: "packages/ui/src/view.tsx", disableCount: 1 }),
          expect.objectContaining({ filePath: "src/index.ts", disableCount: 1 })
        ]
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
