import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { runChecker } from "../src/index.js";

describe("report artifacts", () => {
  test("writes stable report, summary, and lint log artifacts", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "eslint-checker-report-"));
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ name: "report-fixture", version: "1.0.0" }),
      "utf8"
    );

    try {
      const report = await runChecker({
        cwd,
        options: {
          mode: "access",
          output: ".eslint-checker",
          timeout: "1",
          forIflycode: false,
          recovery: true
        }
      });

      const reportJson = JSON.parse(await readFile(path.join(cwd, ".eslint-checker/report.json"), "utf8"));
      const summary = await readFile(path.join(cwd, ".eslint-checker/summary.md"), "utf8");
      const lintLog = await readFile(path.join(cwd, ".eslint-checker/lint-log.txt"), "utf8");

      expect(reportJson).toMatchObject({
        schemaVersion: report.schemaVersion,
        projectInfo: { packageName: "report-fixture" },
        lintExecution: { status: "skipped", skippedReason: "access_mode" },
        eslintResolvedConfig: { status: "skipped", skippedReason: "eslint_not_connected" },
        riskAssessment: { level: "medium" }
      });
      expect(summary).toContain("ESLint Checker Summary");
      expect(summary).toContain("report-fixture");
      expect(summary).toContain("eslint-config.json");
      expect(lintLog).toContain("Checker started");
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  test("writes resolved ESLint config and records extended config packages", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "eslint-checker-config-"));
    await mkdir(path.join(cwd, "src"), { recursive: true });
    await mkdir(path.join(cwd, "node_modules/.bin"), { recursive: true });
    await writeFile(path.join(cwd, "src/index.js"), "const value = 1;\n", "utf8");
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "config-fixture",
        version: "1.0.0",
        devDependencies: { eslint: "8.0.0" }
      }),
      "utf8"
    );
    await writeFile(
      path.join(cwd, ".eslintrc.json"),
      JSON.stringify({
        extends: ["eslint:recommended", "plugin:react/recommended", "standard"],
        rules: { semi: "error" }
      }),
      "utf8"
    );
    const eslintBin = path.join(cwd, "node_modules/.bin/eslint");
    await writeFile(
      eslintBin,
      [
        "#!/usr/bin/env node",
        "if (process.argv.includes('--print-config')) {",
        "  console.log(JSON.stringify({ rules: { semi: ['error', 'always'] }, parserOptions: { ecmaVersion: 2022 } }));",
        "  process.exit(0);",
        "}",
        "process.exit(1);",
        ""
      ].join("\n"),
      "utf8"
    );
    await chmod(eslintBin, 0o755);

    try {
      await runChecker({
        cwd,
        options: {
          mode: "access",
          output: ".eslint-checker",
          timeout: "5",
          forIflycode: false,
          recovery: true
        }
      });

      const reportJson = JSON.parse(await readFile(path.join(cwd, ".eslint-checker/report.json"), "utf8"));
      const resolvedConfigJson = JSON.parse(
        await readFile(path.join(cwd, ".eslint-checker/eslint-config.json"), "utf8")
      );

      expect(resolvedConfigJson).toMatchObject({
        rules: { semi: ["error", "always"] },
        parserOptions: { ecmaVersion: 2022 }
      });
      expect(reportJson.eslintResolvedConfig).toMatchObject({
        status: "success",
        targetFile: "src/index.js",
        outputPath: ".eslint-checker/eslint-config.json"
      });
      expect(reportJson.eslintConfigAnalysis.extendedConfigs).toEqual([
        "eslint:recommended",
        "plugin:react/recommended",
        "standard"
      ]);
      expect(reportJson.eslintConfigAnalysis.extendedPackages).toEqual([
        "eslint",
        "eslint-plugin-react",
        "eslint-config-standard"
      ]);
      expect(reportJson.artifacts.eslintConfigJson).toBe(".eslint-checker/eslint-config.json");
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  test("emits console process logs when enabled", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "eslint-checker-console-"));
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ name: "console-fixture", version: "1.0.0" }),
      "utf8"
    );
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await runChecker({
        cwd,
        options: {
          mode: "access",
          output: ".eslint-checker",
          timeout: "1",
          forIflycode: false,
          recovery: true,
          console: true
        }
      });

      const output = consoleLog.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(output).toContain("[eslint-checker] [1/7] Initializing check");
      expect(output).toContain("[eslint-checker] [2/7] Discovering project and static ESLint context");
      expect(output).toContain("[eslint-checker] [3/7] Collecting resolved ESLint config");
      expect(output).toContain("[eslint-checker] [4/7] Collecting ESLint results");
      expect(output).toContain("[eslint-checker] [5/7] Parsing ESLint output");
      expect(output).toContain("[eslint-checker] [6/7] Assessing risk and composing report");
      expect(output).toContain("[eslint-checker] [7/7] Writing report artifacts");
      expect(output).toContain("[eslint-checker] Done. Report: .eslint-checker/report.json");
    } finally {
      consoleLog.mockRestore();
      await rm(cwd, { force: true, recursive: true });
    }
  });
});
