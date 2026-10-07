"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/modules/auth";
import { geocodeLocations, requeueFailedGeocodes } from "@/modules/carpool";
import { isFeatureEnabled } from "@/shared/config/features";
import type { ActionState } from "@/shared/lib/action-state";

export async function geocodePendingAction(): Promise<ActionState> {
  await requirePermission("carpool:write");
  if (!isFeatureEnabled("liftsHome")) return { status: "error", message: "Lifts home is switched off." };
  const summary = await geocodeLocations({ limit: 8 });
  revalidatePath("/carpool");
  const remaining = summary.remaining > 0 ? ` ${summary.remaining} still waiting — run again.` : "";
  return {
    status: "success",
    message: `Located ${summary.located}, not found ${summary.notFound}, failed ${summary.failed}.${remaining}`,
  };
}

export async function requeueFailedAction(): Promise<void> {
  await requirePermission("carpool:write");
  if (!isFeatureEnabled("liftsHome")) return;
  await requeueFailedGeocodes();
  revalidatePath("/carpool");
}
