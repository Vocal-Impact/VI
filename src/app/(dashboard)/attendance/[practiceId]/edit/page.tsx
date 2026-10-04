import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth";
import { getPractice } from "@/modules/attendance";
import { Card, CardBody, PageHeader } from "@/shared/ui/layout";
import { updatePracticeAction } from "../../actions";
import { PracticeForm } from "../../practice-form";

export const metadata = { title: "Edit practice" };

export default async function EditPracticePage(props: PageProps<"/attendance/[practiceId]/edit">) {
  await requirePermission("practices:manage");
  const { practiceId } = await props.params;
  const practice = await getPractice(practiceId);
  if (!practice) notFound();

  return (
    <>
      <PageHeader
        back={
          <Link href={`/attendance/${practice.id}`} className="text-sm text-brand-700 hover:underline">
            ← {practice.title}
          </Link>
        }
        title="Edit practice"
        description="Members see the new date, time and venue straight away."
      />
      <Card className="max-w-xl">
        <CardBody>
          <PracticeForm
            action={updatePracticeAction.bind(null, practice.id)}
            mode="edit"
            cancelHref={`/attendance/${practice.id}`}
            initial={{
              date: practice.date,
              startTime: practice.startTime ?? "",
              endTime: practice.endTime ?? "",
              title: practice.title,
              venue: practice.venue ?? "",
              notes: practice.notes ?? "",
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
