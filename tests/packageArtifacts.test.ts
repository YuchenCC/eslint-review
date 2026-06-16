import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("formatter artifact path", () => {
  test("uses the Windows-compatible ESLint formatter execution path", async () => {
    const executeSource = await readFile(path.join(process.cwd(), "src", "lint", "execute.ts"), "utf8");

    expect(executeSource).toContain('const SUMMARY_FORMATTER_FILENAME = "summaryFormatter.cjs";');
    expect(executeSource).toContain("emitSummaryFormatter");
    expect(executeSource).toContain("NPM_CONFIG_LOGLEVEL");
    expect(executeSource).not.toContain("SUMMARY_FORMATTER_PATH");
    expect(executeSource).not.toContain("summaryFormatter.js");
  });
});

describe("package runtime compatibility", () => {
  test("declares Node 16.17 runtime support without Node 18-only dependencies", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
      engines?: { node?: string };
      dependencies?: Record<string, string>;
    };

    expect(packageJson.engines?.node).toBe(">=16.17");
    expect(packageJson.dependencies?.commander).toBe("^10.0.1");
    expect(packageJson.dependencies?.execa).toBe("^8.0.1");
  });
});
