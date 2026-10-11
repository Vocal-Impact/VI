import { redirect } from "next/navigation";

/** Old link: editing now opens over the member's page. */
export default async function EditMemberPage(props: PageProps<"/members/[id]/edit">) {
  const { id } = await props.params;
  redirect(`/members/${id}?edit=1`);
}
