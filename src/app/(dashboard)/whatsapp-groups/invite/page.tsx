import Link from "next/link";
import { z } from "zod";
import { requirePermission, hasPermission } from "@/modules/auth";
import { getInviteContext } from "@/modules/whatsapp-groups";
import { isEmailDeliveryEnabled } from "@/modules/notifications";
import { Alert, EmptyState, PageHeader } from "@/shared/ui/layout";
import { InviteComposer } from "./invite-composer";

export const metadata = { title: "Send group invites" };

const memberIdsSchema = z.array(z.uuid()).min(1).max(200);

export default async function InvitePage(props: PageProps<"/whatsapp-groups/invite">) {
  const user = await requirePermission("invites:send");
  const { members: raw, groups: groupsParam } = await props.searchParams;
  const preselectGroupIds = String(Array.isArray(groupsParam) ? groupsParam.join(",") : (groupsParam ?? ""))
    .split(",")
    .filter(Boolean);
  const ids = memberIdsSchema.safeParse(
    String(Array.isArray(raw) ? raw.join(",") : (raw ?? ""))
      .split(",")
      .filter(Boolean),
  );

  const back = (
    <Link href="/attendance/eligible" className="text-sm text-brand-700 hover:underline">
      ← Ready for WhatsApp
    </Link>
  );
  if (!ids.success) {
    return (
      <>
        <PageHeader back={back} title="Send group invites" />
        <EmptyState title="No members selected">
          Pick members from the “Ready for WhatsApp” list or a member profile.
        </EmptyState>
      </>
    );
  }

  const context = await getInviteContext(ids.data);
  return (
    <>
      <PageHeader
        back={back}
        title="Send group invites"
        description={
          context.members.length === 1
            ? `To ${context.members[0]?.firstName} ${context.members[0]?.lastName}`
            : `To ${context.members.length} members`
        }
      />
      {context.groups.length === 0 ? (
        <Alert tone="warning" title="No WhatsApp groups set up">
          {hasPermission(user.role, "groups:manage") ? (
            <Link href="/whatsapp-groups" className="underline">
              Add the choir&apos;s groups first.
            </Link>
          ) : (
            "Ask an admin to add the choir's groups first."
          )}
        </Alert>
      ) : (
        <InviteComposer
          context={{
            ...context,
            members: context.members.map((member) => ({
              id: member.id,
              firstName: member.firstName,
              lastName: member.lastName,
              email: member.email,
              whatsappNumber: member.whatsappNumber,
              status: member.status,
              voiceType: member.voiceType,
              attendedCount: member.attendedCount,
              groupStatus: member.groupStatus,
            })),
          }}
          canOverride={hasPermission(user.role, "invites:override-eligibility")}
          emailDelivery={isEmailDeliveryEnabled()}
          preselectGroupIds={preselectGroupIds}
        />
      )}
    </>
  );
}
