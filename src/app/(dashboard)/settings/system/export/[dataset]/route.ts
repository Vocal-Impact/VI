import { requirePermission } from "@/modules/auth";
import { exportMembersCsv } from "@/modules/members";
import { exportAttendanceCsv } from "@/modules/attendance";
import { exportInvitesCsv } from "@/modules/whatsapp-groups";
import { todayLocal } from "@/shared/lib/clock";

const EXPORTS = {
  members: () => exportMembersCsv(),
  attendance: () => exportAttendanceCsv(),
  invites: () => exportInvitesCsv(),
} as const;

export async function GET(_request: Request, context: RouteContext<"/settings/system/export/[dataset]">) {
  await requirePermission("settings:manage");
  const { dataset } = await context.params;
  const exporter = EXPORTS[dataset as keyof typeof EXPORTS];
  if (!exporter) return new Response("Unknown dataset", { status: 404 });
  return new Response(await exporter(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vocal-impact-${dataset}-${todayLocal()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
