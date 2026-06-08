import type { Logger } from "../logger.js";
import type { LintExecution, LintRecovery, PackageManagerName } from "../types.js";
import { runCommand } from "../utils/commands.js";
import { executeLint, type ExecuteLintInput } from "./execute.js";

const MAX_RETRIES = 2;

export interface InstallCommand {
  command: string;
  args: string[];
  text: string;
}

export interface RecoverAndRetryInput extends ExecuteLintInput {
  packageManager: PackageManagerName;
  failedExecution: LintExecution;
  logger: Logger;
}

export function diagnoseMissingDependency(errorText: string): string[] {
  const packages = new Set<string>();

  for (const match of errorText.matchAll(/Cannot find module ['"]([^'"]+)['"]/g)) {
    addInstallablePackage(packages, match[1]);
  }
  for (const match of errorText.matchAll(/(?:couldn't|cannot) find (?:the )?plugin ['"](?:eslint-plugin-)?([^'"]+)['"]/gi)) {
    addInstallablePackage(packages, normalizePluginName(match[1]));
  }
  for (const match of errorText.matchAll(/(?:couldn't|cannot) find (?:the )?config ['"]([^'"]+)['"]/gi)) {
    addInstallablePackage(packages, normalizeConfigName(match[1]));
  }

  return [...packages].sort();
}

export function buildInstallCommand(
  packageManager: PackageManagerName,
  packages: string[]
): InstallCommand {
  if (packageManager === "pnpm") {
    return command("pnpm", ["add", "-D", ...packages]);
  }
  if (packageManager === "yarn") {
    return command("yarn", ["add", "-D", ...packages]);
  }
  return command("npm", ["install", "-D", ...packages]);
}

export function buildDependencyRestoreCommand(packageManager: PackageManagerName): InstallCommand {
  if (packageManager === "pnpm") {
    return command("pnpm", ["install"]);
  }
  if (packageManager === "yarn") {
    return command("yarn", ["install"]);
  }
  return command("npm", ["install"]);
}

export async function recoverAndRetry({
  packageManager,
  failedExecution,
  logger,
  ...executeInput
}: RecoverAndRetryInput): Promise<{ lintExecution: LintExecution; lintRecovery: LintRecovery }> {
  const packages = diagnoseMissingDependency(failedExecution.failureReason ?? "");
  if (packages.length === 0) {
    logger.info("Recovery skipped: no installable missing ESLint dependency was detected in the failure output");
    return {
      lintExecution: failedExecution,
      lintRecovery: emptyRecovery("skipped", "no_installable_missing_dependency")
    };
  }

  let lintExecution = failedExecution;
  let retryCount = 0;
  const installCommand = buildInstallCommand(packageManager, packages);
  logger.info(`Recovery diagnosed missing ESLint dependency packages: ${packages.join(", ")}`);
  logger.info(`Recovery will run install command: ${installCommand.text}`);

  while (retryCount < MAX_RETRIES && lintExecution.status === "failed") {
    retryCount += 1;
    logger.info(`Recovery attempt ${retryCount}/${MAX_RETRIES}: installing diagnosed dependencies`);
    logger.command(installCommand.text);
    const installResult = await runCommand({
      cwd: executeInput.cwd,
      command: installCommand.command,
      args: installCommand.args,
      timeoutMs: executeInput.timeoutSeconds * 1000
    });

    if (installResult.exitCode !== 0) {
      logger.error(
        `Recovery install failed with exit code ${installResult.exitCode ?? "unknown"}: ${
          installResult.stderr || installResult.stdout || "install_failed"
        }`
      );
      return {
        lintExecution,
        lintRecovery: {
          enabled: true,
          attempted: true,
          status: "failed",
          retryCount,
          installedPackages: packages,
          installCommand: installCommand.text,
          modifiedFiles: [],
          failureReason: installResult.stderr || installResult.stdout || "install_failed"
        }
      };
    }

    logger.info("Recovery install succeeded; retrying ESLint execution");
    lintExecution = await executeLint({ ...executeInput, logger });
    logger.info(
      `Recovery retry finished with status ${lintExecution.status} and exit code ${lintExecution.exitCode ?? "unknown"}`
    );
  }

  return {
    lintExecution,
    lintRecovery: {
      enabled: true,
      attempted: true,
      status: lintExecution.status === "failed" ? "failed" : "success",
      retryCount,
      installedPackages: packages,
      installCommand: installCommand.text,
      modifiedFiles: ["package.json"]
    }
  };
}

function command(commandName: string, args: string[]): InstallCommand {
  return {
    command: commandName,
    args,
    text: `${commandName} ${args.join(" ")}`
  };
}

function addInstallablePackage(packages: Set<string>, packageName: string): void {
  if (isAllowedEslintPackage(packageName)) {
    packages.add(packageName);
  }
}

function normalizePluginName(pluginName: string): string {
  if (pluginName === "@typescript-eslint") {
    return "@typescript-eslint/eslint-plugin";
  }
  if (pluginName.startsWith("@")) {
    return pluginName.includes("/eslint-plugin") ? pluginName : `${pluginName}/eslint-plugin`;
  }
  return pluginName.startsWith("eslint-plugin-") ? pluginName : `eslint-plugin-${pluginName}`;
}

function normalizeConfigName(configName: string): string {
  if (configName.startsWith("@")) {
    return configName.includes("/eslint-config") ? configName : `${configName}/eslint-config`;
  }
  return configName.startsWith("eslint-config-") ? configName : `eslint-config-${configName}`;
}

function isAllowedEslintPackage(packageName: string): boolean {
  return (
    packageName === "@typescript-eslint/parser" ||
    packageName.startsWith("@typescript-eslint/") ||
    packageName.startsWith("@eslint/") ||
    packageName.startsWith("eslint-plugin-") ||
    packageName.startsWith("eslint-config-") ||
    /^@[^/]+\/eslint-(?:plugin|config)/.test(packageName)
  );
}

function emptyRecovery(status: LintRecovery["status"], failureReason?: string): LintRecovery {
  return {
    enabled: true,
    attempted: false,
    status,
    retryCount: 0,
    installedPackages: [],
    installCommand: "",
    modifiedFiles: [],
    failureReason
  };
}
