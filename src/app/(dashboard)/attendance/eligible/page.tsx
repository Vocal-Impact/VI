import Link from "next/link";
import { requirePermission, hasPermission } from "@/modules/auth";
import { getAttendanceThreshold, listEligibleMembers } from "@/modules/attendance";
import { PageHeader } from "@/shared/ui/layout";
import { markAddedAction } from "../../members/actions";
import { EligibleList } from "./eligible-list";

export const metadata = { title: "Ready for WhatsApp" };

export default async function EligiblePage() {
  const user = await requirePermission("attendance:read");
  const [members, threshold] = await Promise.all([listEligibleMembers(), getAttendanceThreshold()]);

  return (
    <>
      <PageHeader
        back={
          <Link href="/attendance" className="text-sm text-brand-700 hover:underline">
            ← Attendance
          </Link>
        }
        title="Ready for WhatsApp"
        description={`Prospective members who have attended ${threshold}+ practices. Send them the group links, then mark them as added.`}
      />
      <EligibleList
        canWrite={hasPermission(user.role, "invites:send")}
        markAdded={markAddedAction}
        members={members.map((member) => ({
          id: member.id,
          name: `${member.firstName} ${member.lastName}`,
          voiceType: member.voiceType,
          whatsappNumber: member.whatsappNumber,
          attendedCount: member.attendedCount,
          invitedAt: member.invites[0]?.sentAt.toISOString() ?? null,
        }))}
      />
    </>
  );
}
