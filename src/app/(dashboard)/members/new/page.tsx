import Link from "next/link";
import { requirePermission } from "@/modules/auth";
import { Card, CardBody, PageHeader } from "@/shared/ui/layout";
import { createMemberAction } from "../actions";
import { MemberForm } from "../member-form";

export const metadata = { title: "Add member" };
// Leaves time for looking up coordinates in the background after saving.
export const maxDuration = 60;

export default async function NewMemberPage() {
  await requirePermission("members:write");
  return (
    <>
      <PageHeader
        back={
          <Link href="/members" className="text-sm text-brand-700 hover:underline">
            ← Members
          </Link>
        }
        title="Add member"
      />
      <Card className="max-w-3xl">
        <CardBody>
          <MemberForm action={createMemberAction} mode="create" cancelHref="/members" />
        </CardBody>
      </Card>
    </>
  );
}
