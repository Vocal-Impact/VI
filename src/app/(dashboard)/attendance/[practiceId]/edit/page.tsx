import { redirect } from "next/navigation";

/** Old link: editing now opens over the practice page. */
export default async function EditPracticePage(props: PageProps<"/attendance/[practiceId]/edit">) {
  const { practiceId } = await props.params;
  redirect(`/attendance/${practiceId}?edit=1`);
}
