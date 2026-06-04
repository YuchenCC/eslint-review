import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<T | undefined> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

export async function readTextFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

export async function listExistingFiles(cwd: string, fileNames: string[]): Promise<string[]> {
  const existingFiles = await Promise.all(
    fileNames.map(async (fileName) => {
      const filePath = path.join(cwd, fileName);
      return (await pathExists(filePath)) ? fileName : undefined;
    })
  );

  return existingFiles.filter((fileName): fileName is string => fileName !== undefined);
}

export async function safeStat(filePath: string): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    return await stat(filePath);
  } catch {
    return undefined;
  }
}
