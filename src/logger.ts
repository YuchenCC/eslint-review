type LogLevel = "info" | "error" | "command";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
}

export interface Logger {
  info(message: string): void;
  error(message: string): void;
  command(message: string): void;
  toText(): string;
}

export interface LoggerOptions {
  console?: boolean;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const entries: LogEntry[] = [];
  const emitConsole = options.console ?? false;

  function add(level: LogLevel, message: string): void {
    entries.push({
      level,
      message,
      timestamp: new Date().toISOString()
    });
    if (emitConsole) {
      const formattedMessage = `[eslint-checker] ${message}`;
      if (level === "error") {
        console.error(formattedMessage);
      } else {
        console.log(formattedMessage);
      }
    }
  }

  return {
    info: (message) => add("info", message),
    error: (message) => add("error", message),
    command: (message) => add("command", message),
    toText: () => entries.map((entry) => `[${entry.timestamp}] ${entry.level}: ${entry.message}`).join("\n")
  };
}
