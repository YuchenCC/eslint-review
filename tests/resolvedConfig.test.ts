import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { collectResolvedEslintConfig } from "../src/analysis/resolvedConfig.js";
import type { EslintAccess, SourceEntries } from "../src/types.js";
import { runCommand } from "../src/utils/commands.js";

vi.mock("../src/utils/commands.js", () => ({
  runCommand: vi.fn()
}));

const mockedRunCommand = vi.mocked(runCommand);

const connectedEslintAccess: EslintAccess = {
  accessLevel: "connected",
  eslintDependencyDetected: true,
  eslintPackages: ["eslint"],
  eslintConfigDetected: true,
  configFiles: ["eslint.config.js"],
  packageJsonEslintConfigDetected: false,
  lintScriptDetected: true,
  lintScripts: {
    lint: "eslint ."
  }
};

const sourceEntries: SourceEntries = {
  entries: ["packages/ui/src", "src"],
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

describe("resolved ESLint config collection", () => {
  beforeEach(() => {
    mockedRunCommand.mockReset();
  });

  test("prints config for the first discovered source file and ignores public and minified files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "eslint-resolved-config-"));
    try {
      await Promise.all([
        mkdir(path.join(cwd, "src"), { recursive: true }),
        mkdir(path.join(cwd, "packages/ui/src"), { recursive: true }),
        mkdir(path.join(cwd, "public"), { recursive: true })
      ]);
      await Promise.all([
        writeFile(path.join(cwd, "src/index.ts"), "const root = 1;\n", "utf8"),
        writeFile(path.join(cwd, "packages/ui/src/button.tsx"), "const Button = () => null;\n", "utf8"),
        writeFile(path.join(cwd, "public/app.js"), "const publicAsset = 1;\n", "utf8"),
        writeFile(path.join(cwd, "src/vendor.min.js"), "const minified = 1;\n", "utf8")
      ]);
      mockedRunCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({ rules: {} }),
        stderr: "",
        durationMs: 10,
        timedOut: false
      });

      await expect(
        collectResolvedEslintConfig({
          cwd,
          outputDirectory: ".eslint-checker",
          timeoutSeconds: 10,
          eslintAccess: connectedEslintAccess,
          sourceEntries
        })
      ).resolves.toMatchObject({
        status: "success",
        targetFile: "packages/ui/src/button.tsx"
      });

      expect(mockedRunCommand).toHaveBeenCalledWith({
        cwd,
        command: "npx",
        args: ["eslint", "--print-config", "packages/ui/src/button.tsx"],
        timeoutMs: 10000
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("skips config collection when no source entries are discovered", async () => {
    await expect(
      collectResolvedEslintConfig({
        cwd: "fixtures/no-package",
        outputDirectory: ".eslint-checker",
        timeoutSeconds: 10,
        eslintAccess: connectedEslintAccess,
        sourceEntries: { ...sourceEntries, entries: [] }
      })
    ).resolves.toMatchObject({
      status: "skipped",
      skippedReason: "no_source_entries"
    });
    expect(mockedRunCommand).not.toHaveBeenCalled();
  });
});
