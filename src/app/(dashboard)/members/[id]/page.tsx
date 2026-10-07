import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, hasPermission } from "@/modules/auth";
import { ACCESS_LEVEL_LABELS, accessLevelOf } from "@/modules/auth/domain";
import { getMember } from "@/modules/members";
import { MEMBER_STATUSES, MEMBER_STATUS_LABELS, STUDY_LEVEL_LABELS } from "@/modules/members/domain";
import { StatusBadge, VoiceBadge } from "@/modules/members/ui";
import { getAttendanceThreshold } from "@/modules/attendance";
import { attendanceProgress, isEligibleForWhatsApp } from "@/modules/attendance/domain";
import { listGroups } from "@/modules/whatsapp-groups";
import { INVITE_CHANNEL_LABELS, membershipStatus } from "@/modules/whatsapp-groups/domain";
import { listAuditLog } from "@/shared/audit/audit-log";
import { formatIsoDate, toIsoDate } from "@/shared/lib/dates";
import { ConfirmSubmit, SubmitButton } from "@/shared/ui/client";
import { LinkButton } from "@/shared/ui/button";
import { Select } from "@/shared/ui/form";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/shared/ui/layout";
import { markJoinedAction } from "../../whatsapp-groups/actions";
import {
  changeStatusAction,
  eraseMemberAction,
  markAddedAction,
  removeLocationAction,
  removeMemberAction,
  restoreMemberAction,
  saveLocationAction,
} from "../actions";
import { LocationForm } from "./location-form";

export const metadata = { title: "Member" };
// Leaves time for looking up coordinates in the background after saving.
export const maxDuration = 60;

const GROUP_STATUS = {
  NOT_INVITED: { label: "Not invited", tone: "neutral" },
  INVITED: { label: "Invited", tone: "blue" },
  JOINED: { label: "Joined", tone: "green" },
  FAILED: { label: "Invite failed", tone: "red" },
} as const;

export default async function MemberPage(props: PageProps<"/members/[id]">) {
  const user = await requirePermission("members:read");
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const [member, threshold, groups] = await Promise.all([getMember(id), getAttendanceThreshold(), listGroups()]);
  if (!member) notFound();

  const canWrite = hasPermission(user.role, "members:write");
  const attended = member.attendances.length;
  const eligible = isEligibleForWhatsApp(member.status, attended, threshold);
  const audit = hasPermission(user.role, "audit:read")
    ? await listAuditLog({ entity: "member", entityId: id, take: 20 })
    : [];

  return (
    <>
      <PageHeader
        back={
          <Link href="/members" className="text-sm text-brand-700 hover:underline">
            ← Members
          </Link>
        }
        title={`${member.firstName} ${member.lastName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={member.status} />
            <VoiceBadge voiceType={member.voiceType} />
            {member.status === "PROSPECTIVE" ? (
              <Badge tone={eligible ? "green" : "amber"}>{attendanceProgress(attended, threshold)} practices</Badge>
            ) : null}
            {member.source === "CSV_IMPORT" ? <Badge>Imported</Badge> : null}
            {accessLevelOf(member.user) !== "NONE" ? (
              <Badge tone="brand">App access: {ACCESS_LEVEL_LABELS[accessLevelOf(member.user)]}</Badge>
            ) : null}
          </span>
        }
        actions={
          canWrite && !member.deletedAt ? (
            <>
              <LinkButton href={`/whatsapp-groups/invite?members=${member.id}`}>Send group invites</LinkButton>
              <LinkButton href={`/members/${member.id}/edit`} variant="outline">
                Edit
              </LinkButton>
            </>
          ) : null
        }
      />

      {searchParams.created ? (
        <Alert tone="success" className="mb-4">
          Member added
          {member.status === "PROSPECTIVE"
            ? `. They'll show as ready for WhatsApp after ${threshold} practices.`
            : ` as ${member.status.toLowerCase()}.`}
        </Alert>
      ) : null}
      {member.deletedAt ? (
        <Alert tone="warning" title="This member has been removed" className="mb-4">
          They&apos;re hidden from lists and attendance and can&apos;t sign in. You can always find them again under{" "}
          <Link href="/members?status=REMOVED" className="font-semibold underline">
            Members → Removed
          </Link>
          .
          {canWrite ? (
            <form action={restoreMemberAction.bind(null, member.id)} className="mt-2">
              <SubmitButton
                size="sm"
                variant="outline"
                pendingText="Restoring…"
                confirm={{
                  title: `Restore ${member.firstName} ${member.lastName}?`,
                  description: "They'll be back in the members list, attendance and WhatsApp lists.",
                  confirmLabel: "Restore member",
                }}
              >
                Restore member
              </SubmitButton>
            </form>
          ) : null}
        </Alert>
      ) : null}
      {eligible && canWrite ? (
        <Alert tone="success" title={`Ready for WhatsApp — attended ${attended} practices`} className="mb-4">
          <div className="mt-2 flex flex-wrap gap-2">
            <LinkButton href={`/whatsapp-groups/invite?members=${member.id}`} size="sm">
              Send group invites
            </LinkButton>
            <form action={markAddedAction.bind(null, member.id)}>
              <SubmitButton
                size="sm"
                variant="outline"
                confirm={{
                  title: `Mark ${member.firstName} as added to WhatsApp?`,
                  description: "Only once they're in the main WhatsApp group. Their status becomes Active.",
                  confirmLabel: "Mark as added",
                }}
              >
                Mark as added
              </SubmitButton>
            </form>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Detail label="Student ID" value={<span className="font-mono">{member.studentId}</span>} />
                <Detail label="Year of study" value={STUDY_LEVEL_LABELS[member.yearOfStudy]} />
                <Detail
                  label="WhatsApp"
                  value={
                    <a
                      href={`https://wa.me/${member.whatsappNumber.replace(/\D/g, "")}`}
                      className="text-brand-700 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {member.whatsappNumber}
                    </a>
                  }
                />
                <Detail
                  label="IIT email"
                  value={
                    <a href={`mailto:${member.email}`} className="text-brand-700 hover:underline">
                      {member.email}
                    </a>
                  }
                />
                <Detail
                  label="Date of birth"
                  value={
                    member.dateOfBirth ? (
                      formatIsoDate(toIsoDate(member.dateOfBirth))
                    ) : (
                      <span className="text-amber-700">Not provided</span>
                    )
                  }
                />
                <Detail
                  label="Dietary preferences"
                  value={member.dietaryPreference ?? <span className="text-slate-400">None given</span>}
                />
                <Detail
                  label="Added to WhatsApp"
                  value={member.addedToWhatsappAt ? member.addedToWhatsappAt.toLocaleDateString("en-GB") : "—"}
                />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="WhatsApp groups" description="Tick “Joined” once you see them in the group." />
            <CardBody>
              {groups.length === 0 ? (
                <EmptyState title="No groups set up yet">
                  {hasPermission(user.role, "groups:manage") ? (
                    <Link href="/whatsapp-groups" className="text-brand-700 underline">
                      Add your WhatsApp groups
                    </Link>
                  ) : (
                    "Ask an admin to add the WhatsApp groups."
                  )}
                </EmptyState>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {groups.map((group) => {
                    const status = membershipStatus(member.invites, group.id);
                    const lastInvite = member.invites.find((invite) => invite.groupId === group.id);
                    return (
                      <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div>
                          <p className="text-sm font-medium">
                            {group.name} {group.isMainGroup ? <Badge tone="brand">Main</Badge> : null}
                          </p>
                          {lastInvite ? (
                            <p className="text-xs text-slate-500">
                              Last: {INVITE_CHANNEL_LABELS[lastInvite.channel]} ·{" "}
                              {lastInvite.sentAt.toLocaleDateString("en-GB")}
                              {lastInvite.sentBy ? ` · by ${lastInvite.sentBy.name}` : ""}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={GROUP_STATUS[status].tone}>{GROUP_STATUS[status].label}</Badge>
                          {status !== "JOINED" && canWrite ? (
                            <form action={markJoinedAction.bind(null, member.id, group.id)}>
                              <SubmitButton
                                size="sm"
                                variant="outline"
                                confirm={{
                                  title: `Mark ${member.firstName} as joined ${group.name}?`,
                                  description: group.isMainGroup
                                    ? "This is the main group, so their status becomes Active."
                                    : "Only once you can see them in the group.",
                                  confirmLabel: "Mark as joined",
                                }}
                              >
                                Joined
                              </SubmitButton>
                            </form>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Attendance" description={`${attended} practice${attended === 1 ? "" : "s"} attended`} />
            <CardBody>
              {member.attendances.length === 0 ? (
                <p className="text-sm text-slate-600">No practices attended yet.</p>
              ) : (
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {member.attendances.map((attendance) => (
                    <li key={attendance.practiceId}>
                      ✓ {formatIsoDate(toIsoDate(attendance.practice.date))} — {attendance.practice.title}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {audit.length > 0 ? (
            <Card>
              <CardHeader title="Change history" />
              <CardBody>
                <ul className="space-y-1 text-xs text-slate-600">
                  {audit.map((entry) => (
                    <li key={entry.id}>
                      {entry.createdAt.toLocaleString("en-GB")} — <span className="font-medium">{entry.action}</span>
                      {entry.actor ? ` by ${entry.actor.name}` : ""}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Carpool" description="Approximate area only — never a full address." />
            <CardBody>
              {hasPermission(user.role, "carpool:write") ? (
                <LocationForm
                  action={saveLocationAction.bind(null, member.id)}
                  removeAction={member.location ? removeLocationAction.bind(null, member.id) : undefined}
                  initial={member.location}
                />
              ) : member.location ? (
                <p className="text-sm">{member.location.areaLabel}</p>
              ) : (
                <p className="text-sm text-slate-600">No location shared.</p>
              )}
            </CardBody>
          </Card>

          {canWrite && !member.deletedAt ? (
            <Card>
              <CardHeader title="Manage" />
              <CardBody className="space-y-4">
                <form action={changeStatusAction.bind(null, member.id)} className="flex gap-2">
                  <Select name="status" defaultValue={member.status} aria-label="Status">
                    {MEMBER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {MEMBER_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton
                    variant="outline"
                    confirm={{
                      title: `Change ${member.firstName}'s status?`,
                      description:
                        "Status decides the practice rule for WhatsApp groups, birthday reminders and who can sign in.",
                      confirmLabel: "Change status",
                    }}
                  >
                    Update
                  </SubmitButton>
                </form>
                {hasPermission(user.role, "users:manage") ? (
                  <LinkButton
                    href={`/access?q=${encodeURIComponent(member.email)}`}
                    variant="secondary"
                    className="w-full"
                  >
                    App access: {ACCESS_LEVEL_LABELS[accessLevelOf(member.user)]} — change
                  </LinkButton>
                ) : null}
                <p className="text-xs text-slate-500">
                  Stopped coming? Set them to <b>Inactive</b>. Graduated? <b>Alumni</b>. Use Remove only for records
                  that shouldn&apos;t be here (duplicates, test entries).
                </p>
                <form action={removeMemberAction.bind(null, member.id)}>
                  <ConfirmSubmit
                    variant="outline"
                    className="w-full"
                    confirm={{
                      title: `Remove ${member.firstName} ${member.lastName}?`,
                      description: "They'll be hidden everywhere. You can restore them from Members → Removed.",
                      confirmLabel: "Remove member",
                    }}
                  >
                    Remove member
                  </ConfirmSubmit>
                </form>
                {hasPermission(user.role, "members:delete") ? (
                  <form action={eraseMemberAction.bind(null, member.id)}>
                    <ConfirmSubmit
                      variant="danger"
                      className="w-full"
                      confirm={{
                        title: `Permanently erase ${member.firstName} ${member.lastName}?`,
                        description:
                          "All their details, attendance, replies and invites are deleted for good (for data-removal requests). This can't be undone.",
                        confirmLabel: "Erase permanently",
                      }}
                    >
                      Erase permanently (data request)
                    </ConfirmSubmit>
                  </form>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value}</dd>
    </div>
  );
}
