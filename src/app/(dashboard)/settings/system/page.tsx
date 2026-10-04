import Link from "next/link";
import { requirePermission } from "@/modules/auth";
import { listCronRuns } from "@/modules/birthdays";
import { formatAcademicYear, getStudyYearStatus } from "@/modules/members";
import { formatIsoDate } from "@/shared/lib/dates";
import { brandLogoUrl, describeEmailLogo, describeEmailSetup } from "@/modules/notifications";
import { listAuditLog } from "@/shared/audit/audit-log";
import { buttonClasses } from "@/shared/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, Table, Td, Th } from "@/shared/ui/layout";
import { RunRemindersButton } from "./run-reminders-button";
import { TestEmailButton } from "./test-email-button";

export const metadata = { title: "System" };

export default async function SystemPage() {
  await requirePermission("settings:manage");
  const [runs, audit, studyYear] = await Promise.all([
    listCronRuns(30),
    listAuditLog({ take: 50 }),
    getStudyYearStatus(),
  ]);
  const email = describeEmailSetup();
  const logo = describeEmailLogo();
  const logoUrl = brandLogoUrl();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Export data" description="CSV downloads for backups and data requests." />
          <CardBody className="flex flex-wrap gap-2">
            {(["members", "attendance", "invites"] as const).map((dataset) => (
              <a key={dataset} href={`/settings/system/export/${dataset}`} className={buttonClasses("outline", "sm")}>
                {dataset[0]?.toUpperCase()}
                {dataset.slice(1)} CSV
              </a>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Email" description="Used for birthday reminders and WhatsApp invite emails." />
          <CardBody className="space-y-3 text-sm">
            {email.mode !== "console" ? (
              <p>
                <Badge tone="green">Sending for real</Badge> via <span className="font-mono">{email.via}</span>
              </p>
            ) : (
              <Alert tone="warning" title="Development mode — nothing is delivered">
                Emails are only printed in the server terminal. Set EMAIL_TRANSPORT=brevo and BREVO_API_KEY (README →
                Deploy, step 4) and restart the app.
              </Alert>
            )}
            <p className="text-slate-500">
              From: <span className="font-mono">{email.from}</span>
            </p>
            <div className="flex items-center gap-3 rounded-lg bg-ink p-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- previewing the exact public image emails use
                <img src={logoUrl} alt="Email logo" className="h-8 w-auto" />
              ) : (
                <span className="font-display text-lg font-black text-white italic">VOCAL IMPACT</span>
              )}
              <span className="text-xs text-slate-300">
                {logo === "custom"
                  ? "Logo from EMAIL_LOGO_URL"
                  : logo === "site"
                    ? "Logo from this site"
                    : "No public logo yet — emails show this text instead. Set EMAIL_LOGO_URL (see README)."}
              </span>
            </div>
            <TestEmailButton />
            <Link href="/settings/email-preview" className="inline-block text-sm text-brand-700 hover:underline">
              Preview the email designs →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Birthday reminders"
            description="Runs automatically every day at 07:00 Sri Lanka time. Running it again never sends duplicates."
          />
          <CardBody>
            <RunRemindersButton />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Years of study"
            description="Every 1 September everyone moves up: Foundation → L4 → L5 → Placement Year → L6 → alumni."
          />
          <CardBody className="space-y-2 text-sm text-slate-700">
            <p>
              Levels are for <strong>{formatAcademicYear(studyYear.academicYear)}</strong>. Next move up:{" "}
              <strong>{formatIsoDate(studyYear.nextRollover)}</strong> (by the daily job).
            </p>
            <p className="text-slate-500">
              Someone skipping the placement year or repeating a year? Edit their year on their profile after the move.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Data protection" />
          <CardBody className="space-y-2 text-sm text-slate-700">
            <p>
              WhatsApp numbers, locations (landmark and coordinates) and dietary preferences are{" "}
              <strong>encrypted in the database</strong> with AES-256-GCM. Only this app, holding DATA_ENCRYPTION_KEY,
              can read them.
            </p>
            <p className="text-amber-800">
              Keep a copy of DATA_ENCRYPTION_KEY in the committee password manager — without it this data cannot be
              recovered.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Daily job runs" />
        {runs.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-600">No runs yet.</p>
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Job</Th>
                <Th>Status</Th>
                <Th>Summary</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <Td className="whitespace-nowrap">{run.startedAt.toLocaleString("en-GB")}</Td>
                  <Td>{run.job}</Td>
                  <Td>
                    <Badge tone={run.status === "SUCCESS" ? "green" : run.status === "FAILED" ? "red" : "amber"}>
                      {run.status.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td className="font-mono text-xs break-all">{run.summary ? JSON.stringify(run.summary) : ""}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Audit log" description="Latest 50 changes." />
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
            </tr>
          </thead>
          <tbody>
            {audit.map((entry) => (
              <tr key={entry.id}>
                <Td className="whitespace-nowrap">{entry.createdAt.toLocaleString("en-GB")}</Td>
                <Td>{entry.actor?.name ?? "System"}</Td>
                <Td className="font-mono text-xs">{entry.action}</Td>
                <Td className="text-xs text-slate-500">
                  {entry.entity}
                  {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ""}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
