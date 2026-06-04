import { describe, expect, test } from "vitest";
import { analyzeEslintConfig } from "../src/analysis/configAnalysis.js";
import { scanEslintDisable } from "../src/analysis/disableScan.js";

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

  test("scans src-only ESLint disable comments", async () => {
    await expect(scanEslintDisable("fixtures/disable-heavy")).resolves.toMatchObject({
      status: "success",
      scannedDirectory: "src",
      totalDisableCount: 4,
      fileLevelDisableCount: 1,
      disableWithoutRuleCount: 2,
      broadDisableCount: 2
    });
  });
});
