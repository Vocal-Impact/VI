"use client";

import { SubmitButton } from "@/shared/ui/client";

/** "Mark venue confirmed", asking first and naming the venue typed in. */
export function VenueConfirmButton() {
  return (
    <SubmitButton
      size="sm"
      confirm={{
        title: (data) => {
          const venue = String(data.get("venue") ?? "").trim();
          return venue ? `Confirm the venue as ${venue}?` : "Mark the venue as confirmed?";
        },
        description: "Members will see this venue on the practice. Use Undo if the administration changes it.",
        confirmLabel: "Confirm venue",
      }}
    >
      Mark venue confirmed
    </SubmitButton>
  );
}
