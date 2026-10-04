import { redirect } from "next/navigation";

// User management moved to its own page, linked to member records.
export default function OldUsersPage() {
  redirect("/access");
}
