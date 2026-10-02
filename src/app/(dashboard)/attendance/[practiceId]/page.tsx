import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, hasPermission } from "@/modules/auth";
import { canUnmarkAttendance } from "@/modules/attendance/domain";
import { getAttendanceChecklist, getAttendanceThreshold, getPractice } from "@/modules/attendance";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate } from "@/shared/lib/dates";
import { ConfirmSubmit } from "@/shared/ui/client";
import { PageHeader } from "@/shared/ui/layout";
import { deletePracticeAction } from "../actions";
import { AttendanceChecklist } from "./attendance-checklist";

export const metadata = { title: "Take attendance" };

export default async function PracticePage(props: PageProps<"/attendance/[practiceId]">) {
  const user = await requirePermission("attendance:read");
  const { practiceId } = await props.params;
  const practice = await getPractice(practiceId);
  if (!practice) notFound();
  const [entries, threshold] = await Promise.all([getAttendanceChecklist(practiceId), getAttendanceThreshold()]);

  return (
    <>
      <PageHeader
        back={
          <Link href="/attendance" className="text-sm text-brand-700 hover:underline">
            ← Attendance
          </Link>
        }
        title={practice.title}
        description={`${formatIsoDate(practice.date, { weekday: "long", month: "long" })}${practice.venue ? ` · ${practice.venue}` : ""}`}
        actions={
          hasPermission(user.role, "settings:manage") ? (
            <form action={deletePracticeAction.bind(null, practice.id)}>
              <ConfirmSubmit variant="ghost" size="sm" message="Delete this practice and all its attendance marks?">
                Delete practice
              </ConfirmSubmit>
            </form>
          ) : null
        }
      />
      <AttendanceChecklist
        practiceId={practice.id}
        entries={entries}
        threshold={threshold}
        readOnly={!hasPermission(user.role, "attendance:write")}
        canUnmark={canUnmarkAttendance(user.role, practice.date, todayLocal())}
      />
    </>
  );
}
