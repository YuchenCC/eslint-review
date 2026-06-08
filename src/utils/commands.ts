import { execa } from "execa";

export interface RunCommandInput {
  cwd: string;
  command: string;
  args: string[];
  streamOutput?: boolean;
  timeoutMs: number;
}

export interface RunCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export async function runCommand({
  cwd,
  command,
  args,
  streamOutput = false,
  timeoutMs
}: RunCommandInput): Promise<RunCommandResult> {
  const startedAt = Date.now();
  try {
    const result = await execa(command, args, {
      cwd,
      reject: false,
      stderr: streamOutput ? ["pipe", "inherit"] : "pipe",
      stdout: streamOutput ? ["pipe", "inherit"] : "pipe",
      timeout: timeoutMs
    });

    return {
      exitCode: result.exitCode ?? null,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: Date.now() - startedAt,
      timedOut: false
    };
  } catch (error) {
    const maybeError = error as {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      timedOut?: boolean;
      message?: string;
    };
    return {
      exitCode: maybeError.exitCode ?? null,
      stdout: maybeError.stdout ?? "",
      stderr: maybeError.stderr ?? maybeError.message ?? "",
      durationMs: Date.now() - startedAt,
      timedOut: maybeError.timedOut === true
    };
  }
}
