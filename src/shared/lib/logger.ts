type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

function write(level: Level, message: string, fields?: Fields): void {
  if (process.env.NODE_ENV === "test" && level === "debug") return;
  const entry = { level, message, time: new Date().toISOString(), ...fields };
  const line = process.env.NODE_ENV === "production" ? JSON.stringify(entry) : `[${level}] ${message}`;
  const extra = process.env.NODE_ENV === "production" || !fields ? [] : [fields];
  if (level === "error") console.error(line, ...extra);
  else if (level === "warn") console.warn(line, ...extra);
  else console.log(line, ...extra);
}

/** Structured logger: JSON lines in production (readable in Vercel logs), plain text locally. */
export const logger = {
  debug: (message: string, fields?: Fields) => write("debug", message, fields),
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
