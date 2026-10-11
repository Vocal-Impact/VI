import { redirect } from "next/navigation";

/** Old link: adding a member now opens a form over the members list. */
export default function NewMemberPage() {
  redirect("/members?new=1");
}
