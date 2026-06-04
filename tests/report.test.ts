import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
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
        riskAssessment: { level: "medium" }
      });
      expect(summary).toContain("ESLint Checker Summary");
      expect(summary).toContain("report-fixture");
      expect(lintLog).toContain("Checker started");
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });
});
