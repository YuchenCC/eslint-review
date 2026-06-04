import path from "node:path";
import type { EslintAccess, EslintAccessLevel } from "../types.js";
import { listExistingFiles, readJsonFile } from "../utils/fs.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  eslintConfig?: unknown;
}

const ESLINT_CONFIG_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml"
];

const LINT_SCRIPT_NAMES = ["lint", "lint:eslint", "eslint", "lint:check", "lint:report"];

export async function detectEslintAccess(cwd: string): Promise<EslintAccess> {
  const packageJson = await readJsonFile<PackageJson>(path.join(cwd, "package.json"));
  const packageNames = [
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {})
  ].sort();
  const eslintPackages = packageNames.filter(isEslintPackage);
  const configFiles = await listExistingFiles(cwd, ESLINT_CONFIG_FILES);
  const packageJsonEslintConfigDetected = packageJson?.eslintConfig !== undefined;
  const lintScripts = Object.fromEntries(
    Object.entries(packageJson?.scripts ?? {}).filter(([name]) => LINT_SCRIPT_NAMES.includes(name))
  );

  const eslintDependencyDetected = eslintPackages.includes("eslint");
  const eslintConfigDetected = configFiles.length > 0 || packageJsonEslintConfigDetected;
  const lintScriptDetected = Object.keys(lintScripts).length > 0;

  return {
    accessLevel: getAccessLevel({
      eslintDependencyDetected,
      eslintConfigDetected,
      lintScriptDetected,
      lintScriptCount: Object.keys(lintScripts).length
    }),
    eslintDependencyDetected,
    eslintPackages,
    eslintConfigDetected,
    configFiles,
    packageJsonEslintConfigDetected,
    lintScriptDetected,
    lintScripts
  };
}

function isEslintPackage(packageName: string): boolean {
  return (
    packageName === "eslint" ||
    packageName.startsWith("eslint-") ||
    packageName.startsWith("@eslint/") ||
    packageName.includes("/eslint-")
  );
}

function getAccessLevel({
  eslintDependencyDetected,
  eslintConfigDetected,
  lintScriptDetected,
  lintScriptCount
}: {
  eslintDependencyDetected: boolean;
  eslintConfigDetected: boolean;
  lintScriptDetected: boolean;
  lintScriptCount: number;
}): EslintAccessLevel {
  if (!eslintDependencyDetected && !eslintConfigDetected && !lintScriptDetected) {
    return "not_connected";
  }

  if (eslintDependencyDetected && eslintConfigDetected && lintScriptDetected) {
    return lintScriptCount > 1 ? "well_connected" : "connected";
  }

  return "partial";
}
