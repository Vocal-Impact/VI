import Link from "next/link";
import { requireUser, hasPermission } from "@/modules/auth";
import { countMembersByStatus, countMissingData } from "@/modules/members";
import { listEligibleMembers } from "@/modules/attendance";
import { getBirthdayDashboard } from "@/modules/birthdays";
import { countPendingInvites } from "@/modules/whatsapp-groups";
import { listImportBatches } from "@/modules/imports";
import { VoiceBadge } from "@/modules/members/ui";
import { formatIsoDate } from "@/shared/lib/dates";
import { LinkButton } from "@/shared/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat } from "@/shared/ui/layout";
import { MemberDashboard } from "./member-dashboard";
import { UpcomingPractices } from "./upcoming-practices";

export default async function DashboardPage() {
  const user = await requireUser();
  if (!hasPermission(user.role, "members:read")) return <MemberDashboard user={user} />;

  const [counts, missing, eligible, birthdays, pendingInvites, imports] = await Promise.all([
    countMembersByStatus(),
    countMissingData(),
    listEligibleMembers(),
    getBirthdayDashboard(),
    countPendingInvites(),
    listImportBatches(3),
  ]);

  return (
    <>
      <PageHeader
        title={`Hi ${user.name.split(" ")[0]} 👋`}
        description={formatIsoDate(birthdays.today, { weekday: "long", month: "long" })}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active members" value={counts.ACTIVE} href="/members?status=ACTIVE" />
        <Stat label="Prospective" value={counts.PROSPECTIVE} href="/members?status=PROSPECTIVE" />
        <Stat label="Ready for WhatsApp" value={eligible.length} href="/attendance/eligible" />
        <Stat
          label="Missing details"
          value={missing.missingBirthday + missing.missingLocation}
          hint={`${missing.missingBirthday} birthdays · ${missing.missingLocation} areas`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <UpcomingPractices
          memberId={user.memberId}
          manage={hasPermission(user.role, "practices:manage")}
          showVenueBooking={hasPermission(user.role, "venues:book")}
        />

        <Card>
          <CardHeader
            title="🎂 Birthdays"
            action={
              <Link href="/birthdays" className="text-sm text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          <CardBody className="space-y-3">
            {birthdays.todays.length === 0 && birthdays.nextSevenDays.length === 0 ? (
              <p className="text-sm text-slate-600">No birthdays in the next 7 days.</p>
            ) : null}
            {birthdays.todays.map((entry) => (
              <p key={entry.person.id} className="rounded-lg bg-brand-50 px-3 py-2 text-sm">
                🎉 <span className="font-semibold">{entry.person.name}</span> turns {entry.turningAge} today!
              </p>
            ))}
            {birthdays.nextSevenDays.map((entry) => (
              <p key={entry.person.id} className="text-sm text-slate-700">
                {entry.person.name} — {formatIsoDate(entry.date, { year: undefined })}{" "}
                <span className="text-slate-500">
                  (in {entry.daysUntil} day{entry.daysUntil === 1 ? "" : "s"})
                </span>
              </p>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Ready for WhatsApp"
            description={
              pendingInvites > 0 ? `${pendingInvites} member(s) invited but not yet marked as joined` : undefined
            }
            action={
              <Link href="/attendance/eligible" className="text-sm text-brand-700 hover:underline">
                Open list
              </Link>
            }
          />
          <CardBody>
            {eligible.length === 0 ? (
              <EmptyState title="Nobody is waiting">New members appear here after their practices.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {eligible.slice(0, 6).map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/members/${member.id}`} className="text-sm font-medium hover:underline">
                      {member.firstName} {member.lastName}
                    </Link>
                    <span className="flex items-center gap-2">
                      <VoiceBadge voiceType={member.voiceType} />
                      {member.invites.length > 0 ? <Badge tone="blue">Invited</Badge> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recent imports"
            action={
              hasPermission(user.role, "imports:run") ? (
                <LinkButton href="/members/import" variant="outline" size="sm">
                  Import CSV
                </LinkButton>
              ) : null
            }
          />
          <CardBody>
            {imports.length === 0 ? (
              <p className="text-sm text-slate-600">No imports yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {imports.map((batch) => (
                  <li key={batch.id} className="flex flex-wrap justify-between gap-2">
                    <span className="truncate font-medium">{batch.fileName}</span>
                    <span className="text-slate-500">
                      +{batch.createdCount} new · {batch.updatedCount} updated · {batch.skippedCount} skipped
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
