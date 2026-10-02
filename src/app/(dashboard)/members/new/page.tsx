import Link from "next/link";
import { requirePermission } from "@/modules/auth";
import { getEnv } from "@/shared/config/env";
import { Card, CardBody, PageHeader } from "@/shared/ui/layout";
import { createMemberAction } from "../actions";
import { MemberForm } from "../member-form";

export const metadata = { title: "Add member" };

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
        description="New members start as Prospective until they have attended enough practices."
      />
      <Card className="max-w-3xl">
        <CardBody>
          <MemberForm
            action={createMemberAction}
            mode="create"
            cancelHref="/members"
            emailDomain={getEnv().ALLOWED_EMAIL_DOMAIN}
          />
        </CardBody>
      </Card>
    </>
  );
}
