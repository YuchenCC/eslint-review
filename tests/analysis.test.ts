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
      disabledStackRules: [],
      disabledOtherRules: []
    });
  });

  test("classifies unrecognized disabled rules as other rules", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "eslint-config-disabled-other-"));
    try {
      await writeFile(
        path.join(cwd, "package.json"),
        JSON.stringify({ name: "config-disabled-other", version: "1.0.0" }),
        "utf8"
      );
      await writeFile(
        path.join(cwd, ".eslintrc.json"),
        JSON.stringify({
          rules: {
            semi: "off",
            eqeqeq: 0,
            "react-hooks/rules-of-hooks": "off",
            "import/no-unresolved": "off",
            "no-debugger": 0
          }
        }),
        "utf8"
      );

      await expect(analyzeEslintConfig(cwd)).resolves.toMatchObject({
        status: "success",
        disabledRuleCount: 5,
        disabledFormatRules: ["semi"],
        disabledQualityRules: ["eqeqeq"],
        disabledStackRules: ["react-hooks/rules-of-hooks"],
        disabledOtherRules: ["import/no-unresolved", "no-debugger"]
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
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
      disabledFormatRules: []
    });
  });

  test("counts local referenced disabled rules but ignores package default disabled rules", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "eslint-config-disabled-local-"));
    try {
      await Promise.all([
        mkdir(path.join(cwd, "config"), { recursive: true }),
        mkdir(path.join(cwd, "node_modules/shared-config"), { recursive: true })
      ]);
      await writeFile(
        path.join(cwd, "package.json"),
        JSON.stringify({ name: "config-disabled-local", version: "1.0.0" }),
        "utf8"
      );
      await writeFile(
        path.join(cwd, ".eslintrc.js"),
        [
          "module.exports = {",
          "  extends: [require.resolve('./config/base.js'), require.resolve('shared-config')],",
          "  rules: { semi: 'off', eqeqeq: 0 }",
          "};",
          ""
        ].join("\n"),
        "utf8"
      );
      await writeFile(
        path.join(cwd, "config/base.js"),
        "module.exports = { rules: { quotes: ['off'], curly: [0] } };\n",
        "utf8"
      );
      await writeFile(
        path.join(cwd, "node_modules/shared-config/index.js"),
        "module.exports = { rules: { indent: 'off', 'no-console': 0 } };\n",
        "utf8"
      );

      await expect(analyzeEslintConfig(cwd)).resolves.toMatchObject({
        status: "success",
        analyzedFiles: expect.arrayContaining([".eslintrc.js", "config/base.js", "node_modules/shared-config/index.js"]),
        resolvedConfigFiles: expect.arrayContaining(["config/base.js", "node_modules/shared-config/index.js"]),
        disabledRuleCount: 4,
        disabledFormatRules: ["semi", "quotes"],
        disabledQualityRules: ["eqeqeq", "curly"],
        disabledOtherRules: []
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
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

  test("uses eslintignore patterns as disable scan governance evidence", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "eslint-disable-ignore-"));
    try {
      await Promise.all([
        mkdir(path.join(cwd, "src/generated"), { recursive: true }),
        mkdir(path.join(cwd, "src/manual"), { recursive: true })
      ]);
      await Promise.all([
        writeFile(path.join(cwd, "src/generated/api.ts"), "/* eslint-disable */\n", "utf8"),
        writeFile(path.join(cwd, "src/manual/page.ts"), "/* eslint-disable */\n", "utf8")
      ]);

      await expect(
        scanEslintDisable(cwd, {
          ...sourceEntries,
          eslintIgnorePatterns: ["src/generated/**"]
        })
      ).resolves.toMatchObject({
        status: "success",
        totalDisableCount: 1,
        eslintIgnorePatterns: ["src/generated/**"],
        effectiveIgnorePatterns: expect.arrayContaining(["src/generated/**"]),
        findings: expect.arrayContaining([".eslintignore excludes 1 pattern from ESLint disable scanning"])
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
