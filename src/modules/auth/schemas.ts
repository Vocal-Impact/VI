import { z } from "zod";
import { ROLES } from "./domain/permissions";

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  role: z.enum(ROLES),
});

export const updateUserSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
  active: z.boolean(),
  receivesBirthdayReminders: z.boolean(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
