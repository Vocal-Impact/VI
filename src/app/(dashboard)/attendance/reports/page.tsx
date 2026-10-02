import Link from "next/link";
import { requirePermission } from "@/modules/auth";
import { getAttendanceReport } from "@/modules/attendance";
import { formatIsoDate } from "@/shared/lib/dates";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/shared/ui/layout";

export const metadata = { title: "Attendance reports" };

export default async function ReportsPage() {
  await requirePermission("attendance:read");
  const report = await getAttendanceReport();
  const max = Math.max(1, ...report.practices.map((practice) => practice.attended));

  return (
    <>
      <PageHeader
        back={
          <Link href="/attendance" className="text-sm text-brand-700 hover:underline">
            ← Attendance
          </Link>
        }
        title="Attendance reports"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Last 12 practices" />
          <CardBody>
            {report.practices.length === 0 ? (
              <p className="text-sm text-slate-600">No practices yet.</p>
            ) : (
              <ul className="space-y-2">
                {report.practices.map((practice) => (
                  <li key={practice.id} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                    <Link href={`/attendance/${practice.id}`} className="truncate hover:underline">
                      {formatIsoDate(practice.date, { weekday: undefined })}
                    </Link>
                    <span className="h-2.5 rounded-full bg-slate-100">
                      <span
                        className="block h-2.5 rounded-full bg-brand-600"
                        style={{ width: `${(practice.attended / max) * 100}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums">{practice.attended}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Stopped coming"
            description={`Active members with no attendance in the last ${report.inactiveAfterWeeks} weeks.`}
          />
          {report.stoppedComing.length === 0 ? (
            <CardBody>
              <EmptyState title="Everyone has been coming 🎉" />
            </CardBody>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Last attended</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {report.stoppedComing.map((member) => (
                  <tr key={member.id}>
                    <Td>
                      <Link href={`/members/${member.id}`} className="hover:underline">
                        {member.name}
                      </Link>
                    </Td>
                    <Td>{member.lastAttended ? formatIsoDate(member.lastAttended) : "Never"}</Td>
                    <Td className="text-right tabular-nums">{member.attendedCount}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
