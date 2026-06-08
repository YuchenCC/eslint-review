import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { discoverSourceEntries } from "../src/discovery/sourceEntries.js";

describe("source entry discovery", () => {
  test("discovers root and workspace source entries with common ignores", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "eslint-source-entries-"));
    try {
      await Promise.all([
        mkdir(path.join(cwd, "src"), { recursive: true }),
        mkdir(path.join(cwd, "apps/admin/src"), { recursive: true }),
        mkdir(path.join(cwd, "apps/web/app"), { recursive: true }),
        mkdir(path.join(cwd, "packages/ui/src"), { recursive: true }),
        mkdir(path.join(cwd, "packages/docs/app"), { recursive: true }),
        mkdir(path.join(cwd, "public"), { recursive: true }),
        mkdir(path.join(cwd, "packages/legacy/lib"), { recursive: true })
      ]);
      await Promise.all([
        writeFile(path.join(cwd, "src/index.ts"), "const root = 1;\n", "utf8"),
        writeFile(path.join(cwd, "apps/admin/src/main.tsx"), "const admin = 1;\n", "utf8"),
        writeFile(path.join(cwd, "apps/web/app/page.tsx"), "const web = 1;\n", "utf8"),
        writeFile(path.join(cwd, "packages/ui/src/index.ts"), "const ui = 1;\n", "utf8"),
        writeFile(path.join(cwd, "packages/docs/app/page.ts"), "const docs = 1;\n", "utf8"),
        writeFile(path.join(cwd, "public/app.js"), "const publicAsset = 1;\n", "utf8"),
        writeFile(path.join(cwd, "src/vendor.min.js"), "const minified = 1;\n", "utf8")
      ]);

      await expect(discoverSourceEntries(cwd, ".eslint-checker")).resolves.toEqual({
        entries: ["apps/admin/src", "apps/web/app", "packages/docs/app", "packages/ui/src", "src"],
        ignorePatterns: [
          "**/node_modules/**",
          "**/dist/**",
          "**/build/**",
          ".eslint-checker/**",
          "public/**",
          "**/public/**",
          "**/*.min.js"
        ]
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("returns no entries when no supported source roots exist", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "eslint-source-empty-"));
    try {
      await mkdir(path.join(cwd, "lib"), { recursive: true });
      await writeFile(path.join(cwd, "lib/index.ts"), "const value = 1;\n", "utf8");

      await expect(discoverSourceEntries(cwd, ".eslint-checker")).resolves.toMatchObject({
        entries: []
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
