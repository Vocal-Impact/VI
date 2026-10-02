/**
 * Explicit success/failure value for expected outcomes (validation errors,
 * not found, forbidden). Exceptions are reserved for bugs and outages.
 */
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export type AppErrorCode = "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "UNAUTHENTICATED" | "EXTERNAL";

export interface AppError {
  code: AppErrorCode;
  message: string;
  /** Field-level messages, keyed by input field name. */
  fieldErrors?: Record<string, string[]>;
}

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = (code: AppErrorCode, message: string, fieldErrors?: Record<string, string[]>): Result<never> => ({
  ok: false,
  error: { code, message, fieldErrors },
});
