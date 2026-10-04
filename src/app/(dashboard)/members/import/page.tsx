import Link from "next/link";
import { requirePermission } from "@/modules/auth";
import { listImportBatches } from "@/modules/imports";
import { Card, CardBody, CardHeader, PageHeader } from "@/shared/ui/layout";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import CSV" };
// Leaves time for looking up coordinates in the background after saving.
export const maxDuration = 60;

export default async function ImportPage() {
  await requirePermission("imports:run");
  const batches = await listImportBatches(10);

  return (
    <>
      <PageHeader
        back={
          <Link href="/members" className="text-sm text-brand-700 hover:underline">
            ← Members
          </Link>
        }
        title="Import from Google Forms"
        description="Upload the CSV export (Google Sheets → File → Download → CSV). You'll see a preview before anything is saved."
      />
      <ImportWizard />
      <Card className="mt-6">
        <CardHeader title="Import history" />
        <CardBody>
          {batches.length === 0 ? (
            <p className="text-sm text-slate-600">No imports yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {batches.map((batch) => (
                <li key={batch.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{batch.fileName}</span>{" "}
                    <span className="text-slate-500">
                      ({batch.profile === "REGISTRATION" ? "registration" : "details"}) ·{" "}
                      {batch.createdAt.toLocaleString("en-GB")}
                      {batch.uploadedBy ? ` · ${batch.uploadedBy.name}` : ""}
                    </span>
                  </span>
                  <span className="text-slate-600">
                    +{batch.createdCount} new · {batch.updatedCount} updated · {batch.unchangedCount} unchanged ·{" "}
                    {batch.skippedCount} skipped
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
