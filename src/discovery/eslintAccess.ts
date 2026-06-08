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
  const directEslintPackages = packageNames.filter(isEslintPackage);
  const managed = await collectJupuiManagedEslintPackages(cwd, packageJson);
  const eslintPackages = [...new Set([...directEslintPackages, ...managed.packages])].sort();
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
    directEslintPackages,
    managedEslintPackages: managed.packages,
    ...(managed.managedBy ? { managedBy: managed.managedBy } : {}),
    eslintManagedDependencyDetected: managed.packages.includes("eslint"),
    eslintConfigDetected,
    configFiles,
    packageJsonEslintConfigDetected,
    lintScriptDetected,
    lintScripts,
    ...(managed.limitations.length > 0 ? { limitations: managed.limitations } : {})
  };
}

async function collectJupuiManagedEslintPackages(
  cwd: string,
  packageJson: PackageJson | undefined
): Promise<{ packages: string[]; managedBy?: string; limitations: string[] }> {
  const declaresJupui = packageJson?.dependencies?.jupui !== undefined || packageJson?.devDependencies?.jupui !== undefined;
  if (!declaresJupui) {
    return { packages: [], limitations: [] };
  }

  const jupuiPackageJson = await readJsonFile<PackageJson>(path.join(cwd, "node_modules/jupui/package.json"));
  if (!jupuiPackageJson) {
    return {
      packages: [],
      managedBy: "jupui",
      limitations: ["node_modules/jupui/package.json could not be read"]
    };
  }

  const packageNames = [
    ...Object.keys(jupuiPackageJson.dependencies ?? {}),
    ...Object.keys(jupuiPackageJson.devDependencies ?? {})
  ].sort();

  return {
    packages: packageNames.filter(isEslintPackage),
    managedBy: "jupui",
    limitations: []
  };
}

function isEslintPackage(packageName: string): boolean {
  return (
    packageName === "eslint" ||
    packageName.startsWith("eslint-") ||
    packageName.startsWith("@eslint/") ||
    packageName.startsWith("@typescript-eslint/") ||
    packageName.includes("/eslint-") ||
    packageName.startsWith("@vue/eslint-config-")
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
