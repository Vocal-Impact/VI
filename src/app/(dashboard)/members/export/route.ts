import { requirePermission } from "@/modules/auth";
import { exportMembersCsv, parseMemberFilter } from "@/modules/members";
import { todayLocal } from "@/shared/lib/clock";

export async function GET(request: Request) {
  await requirePermission("members:read");
  const url = new URL(request.url);
  const filter = parseMemberFilter(Object.fromEntries(url.searchParams));
  const csv = await exportMembersCsv(filter);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vocal-impact-members-${todayLocal()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
