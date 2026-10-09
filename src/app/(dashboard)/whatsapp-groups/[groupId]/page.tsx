import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, hasPermission } from "@/modules/auth";
import { getGroupRoster } from "@/modules/whatsapp-groups";
import { describeAllowedParts } from "@/modules/whatsapp-groups/domain";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { isEmailDeliveryEnabled } from "@/modules/notifications";
import { cn } from "@/shared/lib/cn";
import { LinkButton } from "@/shared/ui/button";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/shared/ui/layout";
import { GroupRoster } from "./group-roster";

export const metadata = { title: "WhatsApp group" };

export default async function GroupPage(props: PageProps<"/whatsapp-groups/[groupId]">) {
  const user = await requirePermission("groups:read");
  const { groupId } = await props.params;
  const { tab } = await props.searchParams;
  const roster = await getGroupRoster(groupId);
  if (!roster) notFound();
  const { group, toInvite, inGroup, stats, threshold } = roster;
  const showMembers = tab === "members";

  const tabClass = (active: boolean) =>
    cn(
      "border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap",
      active ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800",
    );

  return (
    <>
      <PageHeader
        back={
          <Link href="/whatsapp-groups" className="text-sm text-brand-700 hover:underline">
            ← WhatsApp groups
          </Link>
        }
        title={group.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {group.isMainGroup ? <Badge tone="brand">Main group</Badge> : null}
            <Badge tone="blue">{describeAllowedParts(group.allowedVoiceTypes)}</Badge>
            {group.requiresEligibility ? (
              <Badge tone="amber">New members after {threshold} practices</Badge>
            ) : (
              <Badge tone="green">Open to new members</Badge>
            )}
            <span className="text-slate-600">
              {stats.joinedPeople} in the group · {stats.invitedPeople} invited
            </span>
          </span>
        }
        actions={
          hasPermission(user.role, "groups:manage") ? (
            <LinkButton href={`/whatsapp-groups/${group.id}/edit`} variant="outline" size="sm">
              Edit group
            </LinkButton>
          ) : null
        }
      />

      <nav aria-label="Group sections" className="mb-4 flex gap-1 border-b border-slate-200">
        <Link
          href={`/whatsapp-groups/${group.id}`}
          className={tabClass(!showMembers)}
          aria-current={!showMembers ? "page" : undefined}
        >
          Invite ({toInvite.length})
        </Link>
        <Link
          href={`/whatsapp-groups/${group.id}?tab=members`}
          className={tabClass(showMembers)}
          aria-current={showMembers ? "page" : undefined}
        >
          In the group ({inGroup.length})
        </Link>
      </nav>

      {showMembers ? (
        <Card>
          {inGroup.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Nobody marked as in this group yet">
                Tick “Joined” on the Invite tab once you see someone in the WhatsApp group.
              </EmptyState>
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Part</Th>
                  <Th>Status</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {inGroup.map((member) => (
                  <tr key={member.id}>
                    <Td>
                      <Link href={`/members/${member.id}`} className="font-medium hover:underline">
                        {member.firstName} {member.lastName}
                      </Link>
                    </Td>
                    <Td>{VOICE_TYPE_LABELS[member.voiceType as VoiceType]}</Td>
                    <Td className="lowercase first-letter:uppercase">{member.status}</Td>
                    <Td className="text-slate-500">{member.joinedAt?.toLocaleDateString("en-GB") ?? "Unknown"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : (
        <GroupRoster
          groupId={group.id}
          groupName={group.name}
          canOverride={hasPermission(user.role, "invites:override-eligibility")}
          canInvite={hasPermission(user.role, "invites:send")}
          emailDelivery={isEmailDeliveryEnabled()}
          rows={toInvite.map((row) => ({
            id: row.id,
            name: `${row.firstName} ${row.lastName}`,
            voiceType: row.voiceType,
            status: row.status,
            attendedCount: row.attendedCount,
            membership: row.membership,
            lastInvitedAt: row.lastInvitedAt?.toISOString() ?? null,
            eligible: row.eligible,
            reason: row.reason,
          }))}
        />
      )}
    </>
  );
}
