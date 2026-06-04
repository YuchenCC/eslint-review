import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

  test.each([
    ["vue", { dependencies: { vue: "^3.0.0" } }, []],
    ["react", { dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" } }, []],
    ["umi", { dependencies: { "@umijs/max": "^4.0.0" } }, []],
    ["next", { dependencies: { next: "^14.0.0", react: "^18.0.0" } }, []],
    ["vite", { devDependencies: { vite: "^5.0.0" } }, ["vite.config.ts"]],
    ["webpack", { devDependencies: { webpack: "^5.0.0" } }, ["webpack.config.js"]],
    ["unknown", {}, []]
  ] as const)("detects %s stack", async (expectedStack, packageJson, configFiles) => {
    const cwd = await createProject(packageJson, configFiles);

    try {
      await expect(discoverProject(cwd)).resolves.toMatchObject({
        stack: expectedStack
      });
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  test("detects package eslintConfig as ESLint configuration", async () => {
    const cwd = await createProject(
      {
        devDependencies: { eslint: "^9.0.0" },
        eslintConfig: { rules: {} }
      },
      []
    );

    try {
      await expect(detectEslintAccess(cwd)).resolves.toMatchObject({
        eslintDependencyDetected: true,
        eslintConfigDetected: true,
        packageJsonEslintConfigDetected: true,
        accessLevel: "partial"
      });
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });
});

async function createProject(
  packageJson: Record<string, unknown>,
  configFiles: readonly string[]
): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "eslint-checker-discovery-"));
  await writeFile(path.join(cwd, "package.json"), JSON.stringify(packageJson), "utf8");

  for (const configFile of configFiles) {
    const fullPath = path.join(cwd, configFile);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, "export default {};\n", "utf8");
  }

  return cwd;
}

  test("collects ESLint ecosystem packages and lint scripts", async () => {
    const cwd = await createProject(
      {
        devDependencies: {
          eslint: "^9.0.0",
          "eslint-plugin-vue": "^9.0.0",
          "@eslint/js": "^9.0.0",
          "@typescript-eslint/parser": "^8.0.0"
        },
        scripts: {
          lint: "eslint src",
          "lint:report": "eslint src -f json",
          build: "tsc"
        }
      },
      [".eslintrc.json"]
    );

    try {
      await expect(detectEslintAccess(cwd)).resolves.toMatchObject({
        accessLevel: "well_connected",
        eslintPackages: ["@eslint/js", "@typescript-eslint/parser", "eslint", "eslint-plugin-vue"],
        configFiles: [".eslintrc.json"],
        lintScripts: {
          lint: "eslint src",
          "lint:report": "eslint src -f json"
        }
      });
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });
