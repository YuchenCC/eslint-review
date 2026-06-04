import { describe, expect, test } from "vitest";
import { analyzeEslintConfig } from "../src/analysis/configAnalysis.js";

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
});
