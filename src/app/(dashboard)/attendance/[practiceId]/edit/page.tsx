import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasPermission, requireUser } from "@/modules/auth";
import { canManagePractice } from "@/modules/attendance/domain";
import { getPractice, listInvitableMembers } from "@/modules/attendance";
import { STUDY_LEVEL_LABELS, STUDY_LEVELS, VOICE_TYPE_LABELS } from "@/modules/members/domain";
import { Card, CardBody, PageHeader } from "@/shared/ui/layout";
import { updatePracticeAction } from "../../actions";
import { PracticeForm } from "../../practice-form";

export const metadata = { title: "Edit practice" };

export default async function EditPracticePage(props: PageProps<"/attendance/[practiceId]/edit">) {
  const user = await requireUser();
  const { practiceId } = await props.params;
  const practice = await getPractice(practiceId);
  if (!practice) notFound();
  if (!canManagePractice(user, practice)) redirect("/forbidden");
  const members = practice.audience === "SELECTED" ? await listInvitableMembers() : [];

  return (
    <>
      <PageHeader
        back={
          <Link href={`/attendance/${practice.id}`} className="text-sm text-brand-700 hover:underline">
            ← {practice.title}
          </Link>
        }
        title="Edit practice"
        description="Everyone invited sees the new date, time and venue straight away."
      />
      <Card className="max-w-xl">
        <CardBody>
          <PracticeForm
            action={updatePracticeAction.bind(null, practice.id)}
            mode="edit"
            audience={practice.audience}
            // Batch leads keep their own level; the committee can change the levels.
            levelChoices={
              hasPermission(user.role, "practices:manage") || !user.studyLevel ? STUDY_LEVELS : [user.studyLevel]
            }
            members={members.map((member) => ({
              id: member.id,
              name: `${member.firstName} ${member.lastName}`,
              detail:
                member.status === "ALUMNI"
                  ? "Alumni"
                  : `${STUDY_LEVEL_LABELS[member.yearOfStudy]} · ${VOICE_TYPE_LABELS[member.voiceType]}`,
            }))}
            cancelHref={`/attendance/${practice.id}`}
            initial={{
              date: practice.date,
              startTime: practice.startTime ?? "",
              endTime: practice.endTime ?? "",
              title: practice.title,
              venue: practice.venue ?? "",
              notes: practice.notes ?? "",
              levels: practice.levels,
              memberIds: practice.inviteeIds,
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
