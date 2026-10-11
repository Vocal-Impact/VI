import { redirect } from "next/navigation";

/** Old link: editing now opens over the group's page. */
export default async function EditGroupPage(props: PageProps<"/whatsapp-groups/[groupId]/edit">) {
  const { groupId } = await props.params;
  redirect(`/whatsapp-groups/${groupId}?edit=1`);
}
