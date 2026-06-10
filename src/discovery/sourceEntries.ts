import fg from "fast-glob";
import type { SourceEntries } from "../types.js";
import { readTextFile } from "../utils/fs.js";

const SOURCE_ENTRY_PATTERNS = ["src", "apps/*/src", "apps/*/app", "packages/*/src", "packages/*/app"];

export async function discoverSourceEntries(cwd: string, outputDirectory: string): Promise<SourceEntries> {
  const eslintIgnorePatterns = await readEslintIgnorePatterns(cwd);
  const entries = await fg(SOURCE_ENTRY_PATTERNS, {
    cwd,
    onlyDirectories: true,
    unique: true,
    ignore: buildSourceIgnorePatterns(outputDirectory)
  });

  return {
    entries: entries.map(normalizePath).sort(),
    ignorePatterns: buildSourceIgnorePatterns(outputDirectory),
    eslintIgnorePatterns
  };
}

export function buildSourceIgnorePatterns(outputDirectory: string): string[] {
  return [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    `${normalizePath(outputDirectory)}/**`,
    "public/**",
    "**/public/**",
    "**/*.min.js"
  ];
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

async function readEslintIgnorePatterns(cwd: string): Promise<string[]> {
  const content = await readTextFile(`${cwd}/.eslintignore`);
  if (!content) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
