import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth";
import { getGroup } from "@/modules/whatsapp-groups";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/shared/ui/layout";
import { setGroupArchivedAction } from "../../actions";
import { GroupForm } from "../../group-form";
import { ArchiveGroupButton } from "./archive-group-button";

export const metadata = { title: "Edit group" };

export default async function EditGroupPage(props: PageProps<"/whatsapp-groups/[groupId]/edit">) {
  await requirePermission("groups:manage");
  const { groupId } = await props.params;
  const group = await getGroup(groupId);
  if (!group) notFound();

  return (
    <>
      <PageHeader
        back={
          <Link href={`/whatsapp-groups/${group.id}`} className="text-sm text-brand-700 hover:underline">
            ← {group.name}
          </Link>
        }
        title="Edit group"
        description="Change the name, invite link (e.g. after resetting it in WhatsApp), parts or rules. Drag groups on the WhatsApp page to reorder them."
      />
      <Card className="max-w-3xl">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              Group details {group.archived ? <Badge>Archived</Badge> : null}
            </span>
          }
          action={
            <form action={setGroupArchivedAction.bind(null, group.id, !group.archived)}>
              <ArchiveGroupButton name={group.name} archived={group.archived} />
            </form>
          }
        />
        <CardBody>
          <GroupForm group={group} />
        </CardBody>
      </Card>
    </>
  );
}
