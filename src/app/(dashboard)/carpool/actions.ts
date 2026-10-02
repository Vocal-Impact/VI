"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/modules/auth";
import { geocodePendingLocations, requeueFailedGeocodes } from "@/modules/carpool";
import type { ActionState } from "@/shared/lib/action-state";

export async function geocodePendingAction(): Promise<ActionState> {
  await requirePermission("carpool:write");
  const summary = await geocodePendingLocations({ limit: 8 });
  revalidatePath("/carpool");
  const remaining = summary.remaining > 0 ? ` ${summary.remaining} still waiting — run again.` : "";
  return {
    status: "success",
    message: `Located ${summary.located}, not found ${summary.notFound}, failed ${summary.failed}.${remaining}`,
  };
}

export async function requeueFailedAction(): Promise<void> {
  await requirePermission("carpool:write");
  await requeueFailedGeocodes();
  revalidatePath("/carpool");
}
