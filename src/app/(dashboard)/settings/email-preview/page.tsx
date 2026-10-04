import Link from "next/link";
import { requirePermission } from "@/modules/auth";
import { birthdayDigestEmail, groupInviteEmail, testEmail, type EmailMessage } from "@/modules/notifications";
import { listGroups, renderInviteMessage, renderInviteParts } from "@/modules/whatsapp-groups";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate } from "@/shared/lib/dates";
import { getSettings } from "@/shared/settings/settings";
import { Card, CardBody, CardHeader } from "@/shared/ui/layout";

export const metadata = { title: "Email preview" };

/** The app serves the logo itself, so previews can show it even locally. */
const PREVIEW_LOGO = "/brand/logo-primary-white.png";

export default async function EmailPreviewPage() {
  const user = await requirePermission("settings:manage");
  const [settings, groups] = await Promise.all([getSettings(), listGroups()]);

  // Real template and real groups when they exist; sample data otherwise.
  const sampleMember = { firstName: "Nethmi", lastName: "Perera" };
  const inviteGroups = groups.length
    ? groups.slice(0, 3).map((group) => ({
        name: group.name,
        inviteLink: group.inviteLink,
        description: group.description,
        isMainGroup: group.isMainGroup,
      }))
    : [
        {
          name: "VI Main",
          inviteLink: "https://chat.whatsapp.com/ExampleMainGroup",
          description: "Announcements for the whole choir",
          isMainGroup: true,
        },
        {
          name: "VI Newcomers",
          inviteLink: "https://chat.whatsapp.com/ExampleNewcomers",
          description: "Say hi and ask anything before your first practices",
        },
      ];

  const emails: Array<{ label: string; description: string; email: EmailMessage }> = [
    {
      label: "WhatsApp group invite",
      description: "Uses your invite message from Settings → General, with a Join button for each group.",
      email: groupInviteEmail({
        to: "nethmi.perera@iit.ac.lk",
        firstName: sampleMember.firstName,
        text: renderInviteMessage(settings.inviteMessageTemplate, sampleMember, inviteGroups),
        ...renderInviteParts(settings.inviteMessageTemplate, sampleMember),
        groups: inviteGroups,
        logoUrl: PREVIEW_LOGO,
      }),
    },
    {
      label: "Birthday reminder",
      description: "Sent at 07:00 to committee members who have “Birthday emails” turned on.",
      email: birthdayDigestEmail(
        user.email,
        user.name,
        formatIsoDate(todayLocal()),
        [
          { name: "Amaya Fernando", voiceType: "Soprano", turningAge: 21, whatsappNumber: "+94771234567" },
          { name: "Kavindu Silva", voiceType: "Tenor", turningAge: 23, whatsappNumber: "+94777654321" },
        ],
        PREVIEW_LOGO,
      ),
    },
    {
      label: "Test email",
      description: "What “Send me a test email” sends.",
      email: testEmail(user.email, user.name, PREVIEW_LOGO),
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Previews with sample people — nothing is sent.{" "}
        <Link href="/settings/system" className="text-brand-700 hover:underline">
          Back to System &amp; data
        </Link>
      </p>
      {emails.map(({ label, description, email }) => (
        <Card key={label}>
          <CardHeader title={label} description={description} />
          <CardBody className="space-y-2">
            <p className="text-sm">
              <span className="text-slate-500">Subject:</span> <span className="font-medium">{email.subject}</span>
            </p>
            <iframe
              title={`${label} preview`}
              srcDoc={email.html}
              sandbox=""
              className="h-[640px] w-full rounded-lg border border-slate-200 bg-white"
            />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
