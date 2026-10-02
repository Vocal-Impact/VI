import Link from "next/link";
import { requirePermission, hasPermission } from "@/modules/auth";
import { listGroups, listInviteHistory } from "@/modules/whatsapp-groups";
import { INVITE_CHANNEL_LABELS } from "@/modules/whatsapp-groups/domain";
import { Button } from "@/shared/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/shared/ui/layout";
import { moveGroupAction, setGroupArchivedAction } from "./actions";
import { GroupForm } from "./group-form";

export const metadata = { title: "WhatsApp groups" };

export default async function WhatsAppGroupsPage() {
  const user = await requirePermission("groups:read");
  const canManage = hasPermission(user.role, "groups:manage");
  const [groups, history] = await Promise.all([listGroups({ includeArchived: canManage }), listInviteHistory(30)]);
  const activeGroups = groups.filter((group) => !group.archived);

  return (
    <>
      <PageHeader
        title="WhatsApp groups"
        description="The choir's groups and their invite links. Send links from a member's profile or the “Ready for WhatsApp” list."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Groups" description="Invite links are private — anyone with a link can join." />
            <CardBody className="space-y-3">
              {groups.length === 0 ? (
                <EmptyState title="No groups yet">
                  {canManage ? "Add your first group on the right." : "Ask an admin to add the groups."}
                </EmptyState>
              ) : null}
              {groups.map((group) => {
                const position = activeGroups.findIndex((active) => active.id === group.id);
                return (
                  <details key={group.id} className="group rounded-lg border border-slate-200 open:bg-slate-50">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{group.name}</span>
                        {group.isMainGroup ? <Badge tone="brand">Main</Badge> : null}
                        {group.requiresEligibility ? (
                          <Badge tone="amber">After practices</Badge>
                        ) : (
                          <Badge tone="green">Open to new members</Badge>
                        )}
                        {group.archived ? <Badge>Archived</Badge> : null}
                      </span>
                      <span className="text-xs text-slate-500">{group._count.invites} invites sent</span>
                    </summary>
                    <div className="space-y-3 border-t border-slate-200 px-4 py-3">
                      {group.description ? <p className="text-sm text-slate-600">{group.description}</p> : null}
                      <p className="text-sm break-all">
                        <a
                          href={group.inviteLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-700 hover:underline"
                        >
                          {group.inviteLink}
                        </a>
                      </p>
                      {canManage ? (
                        <>
                          <GroupForm group={group} />
                          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                            {!group.archived && position > 0 ? (
                              <form action={moveGroupAction.bind(null, group.id, "up")}>
                                <Button type="submit" size="sm" variant="ghost">
                                  ↑ Move up
                                </Button>
                              </form>
                            ) : null}
                            {!group.archived && position >= 0 && position < activeGroups.length - 1 ? (
                              <form action={moveGroupAction.bind(null, group.id, "down")}>
                                <Button type="submit" size="sm" variant="ghost">
                                  ↓ Move down
                                </Button>
                              </form>
                            ) : null}
                            <form action={setGroupArchivedAction.bind(null, group.id, !group.archived)}>
                              <Button type="submit" size="sm" variant="ghost">
                                {group.archived ? "Restore" : "Archive"}
                              </Button>
                            </form>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </details>
                );
              })}
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
