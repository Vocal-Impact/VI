import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePermission, hasPermission } from "@/modules/auth";
import { listGroups, listInviteHistory } from "@/modules/whatsapp-groups";
import { describeAllowedParts, INVITE_CHANNEL_LABELS } from "@/modules/whatsapp-groups/domain";
import { LinkButton } from "@/shared/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/shared/ui/layout";
import { GroupForm } from "./group-form";

export const metadata = { title: "WhatsApp groups" };

export default async function WhatsAppGroupsPage() {
  const user = await requirePermission("groups:read");
  const canManage = hasPermission(user.role, "groups:manage");
  const [groups, history] = await Promise.all([listGroups({ includeArchived: canManage }), listInviteHistory(30)]);

  return (
    <>
      <PageHeader
        title="WhatsApp groups"
        description="Open a group to see who's in it and send invites. Invite links are private — anyone with a link can join."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Groups" />
            <CardBody className="space-y-3">
              {groups.length === 0 ? (
                <EmptyState title="No groups yet">
                  {canManage ? "Add your first group on the right." : "Ask an admin to add the groups."}
                </EmptyState>
              ) : null}
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  <Link href={`/whatsapp-groups/${group.id}`} className="min-w-0 flex-1 px-4 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{group.name}</span>
                      {group.isMainGroup ? <Badge tone="brand">Main</Badge> : null}
                      <Badge tone="blue">{describeAllowedParts(group.allowedVoiceTypes)}</Badge>
                      {group.requiresEligibility ? <Badge tone="amber">New members after practices</Badge> : null}
                      {group.archived ? <Badge>Archived</Badge> : null}
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">
                      {group.stats.joinedPeople} in the group · {group.stats.invitedPeople}{" "}
                      {group.stats.invitedPeople === 1 ? "person" : "people"} invited
                    </span>
                  </Link>
                  {canManage ? (
                    <LinkButton href={`/whatsapp-groups/${group.id}/edit`} size="sm" variant="ghost">
                      Edit
                    </LinkButton>
                  ) : null}
                  <ChevronRight className="mr-3 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent invites" />
            {history.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-600">No invites sent yet.</p>
              </CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Member</Th>
                    <Th>Group</Th>
                    <Th>Via</Th>
                    <Th>Status</Th>
                    <Th className="hidden sm:table-cell">When</Th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((invite) => (
                    <tr key={invite.id}>
                      <Td>
                        <Link href={`/members/${invite.member.id}`} className="hover:underline">
                          {invite.member.firstName} {invite.member.lastName}
                        </Link>
                      </Td>
                      <Td>{invite.group.name}</Td>
                      <Td>{INVITE_CHANNEL_LABELS[invite.channel]}</Td>
                      <Td>
                        <Badge
                          tone={invite.status === "JOINED" ? "green" : invite.status === "FAILED" ? "red" : "blue"}
                        >
                          {invite.status.toLowerCase()}
                        </Badge>
                      </Td>
                      <Td className="hidden text-slate-500 sm:table-cell">
                        {invite.sentAt.toLocaleDateString("en-GB")}
                        {invite.sentBy ? ` · ${invite.sentBy.name}` : ""}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        {canManage ? (
          <Card className="h-fit">
            <CardHeader title="Add a group" description="WhatsApp → group → Invite via link → Copy link." />
            <CardBody>
              <GroupForm />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
