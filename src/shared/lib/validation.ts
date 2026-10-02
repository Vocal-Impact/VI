import { z } from "zod";
import { err, type Result } from "./result";

/** Field → messages map from a Zod error, for showing under form inputs. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

export function validationError(error: z.ZodError, message = "Please fix the highlighted fields"): Result<never> {
  return err("VALIDATION", message, fieldErrorsOf(error));
}
