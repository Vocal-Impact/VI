import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth";
import { getGroup, listGroups } from "@/modules/whatsapp-groups";
import { Button } from "@/shared/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/shared/ui/layout";
import { moveGroupAction, setGroupArchivedAction } from "../../actions";
import { GroupForm } from "../../group-form";

export const metadata = { title: "Edit group" };

export default async function EditGroupPage(props: PageProps<"/whatsapp-groups/[groupId]/edit">) {
  await requirePermission("groups:manage");
  const { groupId } = await props.params;
  const [group, active] = await Promise.all([getGroup(groupId), listGroups()]);
  if (!group) notFound();
  const position = active.findIndex((candidate) => candidate.id === group.id);

  return (
    <>
      <PageHeader
        back={
          <Link href={`/whatsapp-groups/${group.id}`} className="text-sm text-brand-700 hover:underline">
            ← {group.name}
          </Link>
        }
        title="Edit group"
        description="Change the name, invite link (e.g. after resetting it in WhatsApp), parts or rules."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <GroupForm group={group} />
          </CardBody>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Order & archive" />
          <CardBody className="flex flex-wrap gap-2">
            {!group.archived && position > 0 ? (
              <form action={moveGroupAction.bind(null, group.id, "up")}>
                <Button type="submit" size="sm" variant="outline">
                  ↑ Move up
                </Button>
              </form>
            ) : null}
            {!group.archived && position >= 0 && position < active.length - 1 ? (
              <form action={moveGroupAction.bind(null, group.id, "down")}>
                <Button type="submit" size="sm" variant="outline">
                  ↓ Move down
                </Button>
              </form>
            ) : null}
            <form action={setGroupArchivedAction.bind(null, group.id, !group.archived)}>
              <Button type="submit" size="sm" variant="ghost">
                {group.archived ? "Restore group" : "Archive group"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
