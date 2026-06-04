import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { GitInfo, PackageManagerName, ProjectInfo, StackName } from "../types.js";
import { listExistingFiles, readJsonFile } from "../utils/fs.js";

const execFileAsync = promisify(execFile);

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface ProjectDiscovery extends ProjectInfo {
  gitInfo: GitInfo;
  nodeVersion: string;
  packageManager: PackageManagerName;
  packageManagerVersion: string;
}

const PACKAGE_MANAGER_LOCKFILES: Array<{ file: string; manager: PackageManagerName }> = [
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "yarn.lock", manager: "yarn" },
  { file: "package-lock.json", manager: "npm" }
];

export async function discoverProject(cwd: string): Promise<ProjectDiscovery> {
  const packageJson = await readJsonFile<PackageJson>(path.join(cwd, "package.json"));
  const dependencies = Object.keys(packageJson?.dependencies ?? {}).sort();
  const devDependencies = Object.keys(packageJson?.devDependencies ?? {}).sort();
  const packageManagerLockfile = await detectPackageManagerLockfile(cwd);
  const packageManager = packageManagerLockfile.manager;

  return {
    hasPackageJson: packageJson !== undefined,
    packageName: packageJson?.name ?? "unknown",
    packageVersion: packageJson?.version ?? "unknown",
    stack: await detectStack(cwd, [...dependencies, ...devDependencies]),
    dependencies,
    devDependencies,
    packageManagerLockfile: packageManagerLockfile.file,
    gitInfo: await discoverGitInfo(cwd),
    nodeVersion: process.version,
    packageManager,
    packageManagerVersion: await getPackageManagerVersion(packageManager)
  };
}

async function detectPackageManagerLockfile(
  cwd: string
): Promise<{ file: string; manager: PackageManagerName }> {
  const existingLockfiles = await listExistingFiles(
    cwd,
    PACKAGE_MANAGER_LOCKFILES.map(({ file }) => file)
  );
  const selected = PACKAGE_MANAGER_LOCKFILES.find(({ file }) => existingLockfiles.includes(file));
  return selected ?? { file: "npm", manager: "npm" };
}

async function detectStack(cwd: string, packageNames: string[]): Promise<StackName> {
  const packages = new Set(packageNames);
  const configFiles = await listExistingFiles(cwd, [
    ".umirc.ts",
    ".umirc.js",
    "config/config.ts",
    "config/config.js",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.ts",
    "webpack.config.js",
    "webpack.config.ts"
  ]);

  if (packages.has("umi") || packages.has("@umijs/max") || hasAny(configFiles, [".umirc", "config/config"])) {
    return "umi";
  }
  if (packages.has("next") || hasAny(configFiles, ["next.config"])) {
    return "next";
  }
  if (packages.has("vue") || packages.has("@vue/cli-service")) {
    return "vue";
  }
  if (packages.has("react") || packages.has("react-dom")) {
    return "react";
  }
  if (packages.has("vite") || hasAny(configFiles, ["vite.config"])) {
    return "vite";
  }
  if (packages.has("webpack") || hasAny(configFiles, ["webpack.config"])) {
    return "webpack";
  }

  return "unknown";
}

function hasAny(values: string[], needles: string[]): boolean {
  return values.some((value) => needles.some((needle) => value.includes(needle)));
}

async function discoverGitInfo(cwd: string): Promise<GitInfo> {
  const [branch, commit, status] = await Promise.all([
    runCommand(cwd, "git", ["rev-parse", "--abbrev-ref", "HEAD"]),
    runCommand(cwd, "git", ["rev-parse", "HEAD"]),
    runCommand(cwd, "git", ["status", "--porcelain"])
  ]);

  if (!branch.ok || !commit.ok || !status.ok) {
    return {
      branch: branch.output ?? "unknown",
      commit: commit.output ?? "unknown",
      dirty: "unknown",
      status: "failed",
      failureReason: getCommandError(branch) ?? getCommandError(commit) ?? getCommandError(status)
    };
  }

  return {
    branch: branch.output,
    commit: commit.output,
    dirty: status.output.length > 0,
    status: "success"
  };
}

function getCommandError(result: Awaited<ReturnType<typeof runCommand>>): string | undefined {
  return result.ok ? undefined : result.error;
}

async function getPackageManagerVersion(packageManager: PackageManagerName): Promise<string> {
  if (packageManager === "unknown") {
    return "unknown";
  }

  const result = await runCommand(process.cwd(), packageManager, ["--version"]);
  return result.ok ? result.output : "unknown";
}

async function runCommand(
  cwd: string,
  command: string,
  args: string[]
): Promise<{ ok: true; output: string } | { ok: false; output?: string; error: string }> {
  try {
    const { stdout } = await execFileAsync(command, args, { cwd, timeout: 5000 });
    return { ok: true, output: stdout.trim() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
