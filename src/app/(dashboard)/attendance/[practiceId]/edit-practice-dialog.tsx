import { hasPermission, type SessionUser } from "@/modules/auth";
import { listInvitableMembers, type PracticeView } from "@/modules/attendance";
import { STUDY_LEVEL_LABELS, STUDY_LEVELS, VOICE_TYPE_LABELS } from "@/modules/members/domain";
import { FormDialog } from "@/shared/ui/client";
import { updatePracticeAction } from "../actions";
import { PracticeForm } from "../practice-form";

/** "Edit details" on a practice page: the practice form over the page (opened by `?edit=1` too). */
export async function EditPracticeDialog({ practice, user }: { practice: PracticeView; user: SessionUser }) {
  const members = practice.audience === "SELECTED" ? await listInvitableMembers() : [];
  return (
    <FormDialog
      label="Edit details"
      title="Edit practice"
      description="Everyone invited sees the new date, time and venue straight away."
      openParam="edit"
      icon="edit"
      buttonVariant="outline"
      buttonSize="sm"
    >
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
    </FormDialog>
  );
}
