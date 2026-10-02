import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth";
import { getMember } from "@/modules/members";
import { getEnv } from "@/shared/config/env";
import { toIsoDate } from "@/shared/lib/dates";
import { Card, CardBody, PageHeader } from "@/shared/ui/layout";
import { updateMemberAction } from "../../actions";
import { MemberForm } from "../../member-form";

export const metadata = { title: "Edit member" };

export default async function EditMemberPage(props: PageProps<"/members/[id]/edit">) {
  await requirePermission("members:write");
  const { id } = await props.params;
  const member = await getMember(id);
  if (!member) notFound();

  return (
    <>
      <PageHeader
        back={
          <Link href={`/members/${id}`} className="text-sm text-brand-700 hover:underline">
            ← {member.firstName} {member.lastName}
          </Link>
        }
        title="Edit member"
      />
      <Card className="max-w-3xl">
        <CardBody>
          <MemberForm
            action={updateMemberAction.bind(null, id)}
            mode="edit"
            cancelHref={`/members/${id}`}
            emailDomain={getEnv().ALLOWED_EMAIL_DOMAIN}
            initial={{
              firstName: member.firstName,
              lastName: member.lastName,
              studentId: member.studentId,
              yearOfStudy: String(member.yearOfStudy),
              whatsappNumber: member.whatsappNumber,
              email: member.email,
              voiceType: member.voiceType,
              dateOfBirth: member.dateOfBirth ? toIsoDate(member.dateOfBirth) : "",
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
