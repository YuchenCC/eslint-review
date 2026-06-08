import { describe, expect, test, vi } from "vitest";
import { runCommand } from "../src/utils/commands.js";

describe("runCommand", () => {
  test("captures output without streaming it by default", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const result = await runCommand({
        cwd: process.cwd(),
        command: process.execPath,
        args: ["-e", "console.log('captured stdout'); console.error('captured stderr');"],
        timeoutMs: 1000
      });

      expect(result).toMatchObject({
        exitCode: 0,
        stdout: "captured stdout",
        stderr: "captured stderr",
        timedOut: false
      });
      expect(stdoutWrite).not.toHaveBeenCalled();
      expect(stderrWrite).not.toHaveBeenCalled();
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }
  });

  test("captures and streams output when requested", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const result = await runCommand({
        cwd: process.cwd(),
        command: process.execPath,
        args: ["-e", "console.log('streamed stdout'); console.error('streamed stderr');"],
        streamOutput: true,
        timeoutMs: 1000
      });

      expect(result).toMatchObject({
        exitCode: 0,
        stdout: "streamed stdout",
        stderr: "streamed stderr",
        timedOut: false
      });
      expect(stdoutWrite.mock.calls.map((call) => String(call[0])).join("")).toContain("streamed stdout");
      expect(stderrWrite.mock.calls.map((call) => String(call[0])).join("")).toContain("streamed stderr");
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }
  });
});
