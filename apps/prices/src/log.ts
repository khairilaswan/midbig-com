type Level = "info" | "warn" | "error";

function write(level: Level, scope: string, msg: string, extra?: unknown): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${msg}`;
  const out = level === "info" ? console.log : console.error;
  if (extra === undefined) out(line);
  else out(line, extra instanceof Error ? extra.message : extra);
}

export function logger(scope: string) {
  return {
    info: (msg: string, extra?: unknown) => write("info", scope, msg, extra),
    warn: (msg: string, extra?: unknown) => write("warn", scope, msg, extra),
    error: (msg: string, extra?: unknown) => write("error", scope, msg, extra),
  };
}
