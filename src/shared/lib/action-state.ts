import type { Result } from "./result";

/** Serializable state returned by server actions to `useActionState` forms. */
export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Echo of submitted values so forms keep input after a validation error. */
  values?: Record<string, string>;
}

export const idleState: ActionState = { status: "idle" };

export function toActionState(
  result: Result<unknown>,
  successMessage: string,
  values?: Record<string, string>,
): ActionState {
  if (result.ok) return { status: "success", message: successMessage };
  return { status: "error", message: result.error.message, fieldErrors: result.error.fieldErrors, values };
}

/** FormData → plain string record (files and repeated keys ignored). */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value;
  });
  return values;
}
