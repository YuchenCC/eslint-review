import { describe, expect, test } from "vitest";
import { detectEslintAccess } from "../src/discovery/eslintAccess.js";
import { discoverProject } from "../src/discovery/project.js";

describe("project and ESLint discovery", () => {
  test("detects a project without package.json", async () => {
    await expect(discoverProject("fixtures/no-package")).resolves.toMatchObject({
      hasPackageJson: false
    });
  });

  test("detects connected Vue ESLint access", async () => {
    await expect(detectEslintAccess("fixtures/vue-eslint")).resolves.toMatchObject({
      eslintDependencyDetected: true,
      eslintConfigDetected: true,
      lintScriptDetected: true,
      accessLevel: "connected"
    });
  });

  test("detects partial React ESLint access without config", async () => {
    await expect(detectEslintAccess("fixtures/react-partial-eslint")).resolves.toMatchObject({
      eslintDependencyDetected: true,
      eslintConfigDetected: false,
      accessLevel: "partial"
    });
  });
});
