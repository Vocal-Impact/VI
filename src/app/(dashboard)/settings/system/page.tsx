import { requirePermission } from "@/modules/auth";
import { listCronRuns } from "@/modules/birthdays";
import { describeEmailSetup } from "@/modules/notifications";
import { listAuditLog } from "@/shared/audit/audit-log";
import { buttonClasses } from "@/shared/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, Table, Td, Th } from "@/shared/ui/layout";
import { RunRemindersButton } from "./run-reminders-button";
import { TestEmailButton } from "./test-email-button";

export const metadata = { title: "System" };

export default async function SystemPage() {
  await requirePermission("settings:manage");
  const [runs, audit] = await Promise.all([listCronRuns(30), listAuditLog({ take: 50 })]);
  const email = describeEmailSetup();

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
            <TestEmailButton />
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
