const PALETTE = ["#7c3aed", "#0891b2", "#ea580c", "#16a34a", "#db2777", "#2563eb", "#ca8a04", "#9333ea"];

/** Consistent colour per suggested group on the map and in the list. Grey = no group. */
export function groupColour(index: number | null): string {
  return index === null ? "#64748b" : (PALETTE[index % PALETTE.length] ?? "#64748b");
}
