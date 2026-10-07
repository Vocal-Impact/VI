"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  buildWaMeUrl,
  canInviteToGroup,
  describeAllowedParts,
  renderInviteMessage,
  type GroupMembershipStatus,
} from "@/modules/whatsapp-groups/domain";
import { cn } from "@/shared/lib/cn";
import { Button, LinkButton } from "@/shared/ui/button";
import { Checkbox, Textarea } from "@/shared/ui/form";
import { useConfirm } from "@/shared/ui/client";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/shared/ui/layout";
import { sendInvitesAction } from "../actions";

interface InviteMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  whatsappNumber: string;
  status: string;
  voiceType: string;
  attendedCount: number;
  groupStatus: Record<string, GroupMembershipStatus>;
}

interface InviteGroup {
  id: string;
  name: string;
  description: string | null;
  inviteLink: string;
  requiresEligibility: boolean;
  isMainGroup: boolean;
  allowedVoiceTypes: string[];
}

type Channel = "EMAIL" | "WHATSAPP_LINK" | "MANUAL";

export function InviteComposer({
  context,
  canOverride,
  emailDelivery,
  preselectGroupIds = [],
}: {
  context: { threshold: number; template: string; groups: InviteGroup[]; members: InviteMember[] };
  canOverride: boolean;
  /** False when the server is in development email mode (nothing is delivered). */
  emailDelivery: boolean;
  /** Groups to tick initially (e.g. when coming from a group's page). */
  preselectGroupIds?: string[];
}) {
  const { members, groups, threshold, template } = context;
  const single = members.length === 1;
  const [override, setOverride] = useState(false);
  const [channel, setChannel] = useState<Channel>(single ? "WHATSAPP_LINK" : "EMAIL");
  const [done, setDone] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const [pending, startTransition] = useTransition();

  const allowedFor = (group: InviteGroup, allowOverride: boolean) =>
    members.every((member) => canInviteToGroup(member, group, threshold, allowOverride).allowed);
  /** Why (some of) the selected members can't join, e.g. "For Tenors only · Needs 3 practices (has 1)". */
  const blockedReason = (group: InviteGroup) => {
    for (const member of members) {
      const decision = canInviteToGroup(member, group, threshold, false);
      if (!decision.allowed) return single ? decision.reason : `${member.firstName}: ${decision.reason}`;
    }
    return null;
  };
  const allJoined = (group: InviteGroup) => members.every((member) => member.groupStatus[group.id] === "JOINED");

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        groups
          .filter((group) =>
            preselectGroupIds.length
              ? preselectGroupIds.includes(group.id)
              : allowedFor(group, false) && !allJoined(group),
          )
          .map((group) => group.id),
      ),
  );
  const chosenGroups = groups.filter((group) => selected.has(group.id));
  const blocked = chosenGroups.filter((group) => !allowedFor(group, override));
  const preview = members[0] ? renderInviteMessage(template, members[0], chosenGroups) : "";

  function toggleGroup(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (chosenGroups.length === 0 || blocked.length > 0) return;
    // Emails go out to people at once, so ask first. (WhatsApp and copy can't wait for a
    // dialog: browsers only allow opening WhatsApp or the clipboard straight from the click.)
    if (channel === "EMAIL") {
      const ok = await confirm({
        title: `Email ${members.length === 1 ? (members[0]?.firstName ?? "this member") : `${members.length} people`} the invite?`,
        description: `Groups: ${chosenGroups.map((group) => group.name).join(", ")}.${override ? " You're overriding the practice or voice-part rule as an admin." : ""}`,
        confirmLabel: members.length === 1 ? "Send email" : `Send ${members.length} emails`,
      });
      if (!ok) return;
    }
    const member = members[0];
    // Open WhatsApp / copy synchronously inside the click so browsers allow it.
    if (single && member && channel === "WHATSAPP_LINK") {
      window.open(buildWaMeUrl(member.whatsappNumber, preview), "_blank", "noopener,noreferrer");
    }
    if (single && channel === "MANUAL") {
      void navigator.clipboard
        .writeText(preview)
        .catch(() => toast.error("Could not copy — select the text and copy it"));
    }

    startTransition(async () => {
      const result = await sendInvitesAction({
        memberIds: members.map((m) => m.id),
        groupIds: chosenGroups.map((group) => group.id),
        channel,
        overrideEligibility: override,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { sent, failed } = result.value;
      if (channel === "EMAIL" && !emailDelivery) {
        setDone(
          `Recorded ${sent} invite(s), but NO email was delivered: the app is in development email mode (EMAIL_TRANSPORT=console), so the message was only printed in the server terminal.`,
        );
      } else if (channel === "EMAIL") {
        setDone(
          failed > 0
            ? `${sent} email(s) sent, ${failed} failed — see each member's profile.`
            : `${sent} invite email(s) sent.`,
        );
      } else if (channel === "WHATSAPP_LINK") {
        setDone("WhatsApp opened with the message ready — press Send there. The invite has been recorded.");
      } else {
        setDone("Message copied to your clipboard and the invite recorded.");
      }
      toast.success("Invite recorded");
    });
  }

  if (done) {
    return (
      <Alert tone="success" title="Done">
        {done}
        <p className="mt-2">
          Once they appear in the group, tick “Joined” on their profile (main group → they become Active).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {single && members[0] ? (
            <LinkButton href={`/members/${members[0].id}`} size="sm">
              Open profile
            </LinkButton>
          ) : null}
          <LinkButton href="/attendance/eligible" size="sm" variant="outline">
            Back to the list
          </LinkButton>
        </div>
      </Alert>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {dialog}
      <div className="space-y-6">
        <Card>
          <CardHeader title="1. Choose groups" />
          <CardBody className="space-y-3">
            {groups.map((group) => {
              const eligible = allowedFor(group, override);
              const joined = allJoined(group);
              return (
                <label
                  key={group.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-sm",
                    selected.has(group.id) ? "border-brand-300 bg-brand-50" : "border-slate-200",
                    (!eligible || joined) && "opacity-60",
                  )}
                  title={!eligible ? (blockedReason(group) ?? undefined) : undefined}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-brand-700"
                    checked={selected.has(group.id)}
                    disabled={joined || (!eligible && !selected.has(group.id))}
                    onChange={() => toggleGroup(group.id)}
                  />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {group.name}
                      {group.isMainGroup ? <Badge tone="brand">Main</Badge> : null}
                      {joined ? <Badge tone="green">Already joined</Badge> : null}
                      {group.allowedVoiceTypes.length ? (
                        <Badge tone="blue">{describeAllowedParts(group.allowedVoiceTypes)}</Badge>
                      ) : null}
                      {!eligible ? <Badge tone="amber">{blockedReason(group)}</Badge> : null}
                    </span>
                    {group.description ? <span className="block text-slate-500">{group.description}</span> : null}
                  </span>
                </label>
              );
            })}
            {canOverride && groups.some((group) => !allowedFor(group, false)) ? (
              <Checkbox
                checked={override}
                onChange={(event) => setOverride(event.target.checked)}
                label="Override group restrictions (admin)"
                hint="Recorded in the audit log."
              />
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="2. How to send" />
          <CardBody className="space-y-2">
            {!emailDelivery ? (
              <Alert tone="warning" title="Email isn't set up yet">
                Emails are only printed in the server terminal, not delivered. Use WhatsApp or Copy, or set up Brevo
                email (see README → Deploy, step 4).
              </Alert>
            ) : null}
            <ChannelOption
              value="EMAIL"
              current={channel}
              onSelect={setChannel}
              title="Email"
              description={
                single ? `To ${members[0]?.email}` : `One email to each of the ${members.length} members' IIT addresses`
              }
            />
            <ChannelOption
              value="WHATSAPP_LINK"
              current={channel}
              onSelect={setChannel}
              disabled={!single}
              title="WhatsApp (pre-filled message)"
              description={
                single ? `Opens a chat with ${members[0]?.whatsappNumber} — you press Send` : "One member at a time"
              }
            />
            <ChannelOption
              value="MANUAL"
              current={channel}
              onSelect={setChannel}
              disabled={!single}
              title="Copy message"
              description={single ? "Copies the text so you can paste it anywhere" : "One member at a time"}
            />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="3. Preview"
            description={
              single ? undefined : `Showing ${members[0]?.firstName}'s message — each member gets their own name.`
            }
          />
          <CardBody>
            <Textarea
              readOnly
              value={preview}
              rows={Math.max(8, preview.split("\n").length + 4)}
              className="font-mono text-xs"
              aria-label="Message preview"
            />
          </CardBody>
        </Card>
        {!single ? (
          <p className="text-sm text-slate-600">
            Sending to:{" "}
            {members.map((member, index) => (
              <span key={member.id}>
                {index > 0 ? ", " : ""}
                <Link href={`/members/${member.id}`} className="hover:underline">
                  {member.firstName} {member.lastName}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
        {blocked.length > 0 ? (
          <Alert tone="warning">
            Can&apos;t send to {blocked.map((group) => group.name).join(", ")} without an admin override.
          </Alert>
        ) : null}
        <Button
          size="lg"
          className="w-full"
          onClick={send}
          disabled={pending || chosenGroups.length === 0 || blocked.length > 0}
        >
          {pending
            ? "Sending…"
            : channel === "EMAIL"
              ? `Send ${members.length > 1 ? `${members.length} emails` : "email"}`
              : channel === "WHATSAPP_LINK"
                ? "Open WhatsApp"
                : "Copy message"}
        </Button>
      </div>
    </div>
  );
}

function ChannelOption({
  value,
  current,
  onSelect,
  title,
  description,
  disabled = false,
}: {
  value: Channel;
  current: Channel;
  onSelect: (value: Channel) => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-sm",
        current === value ? "border-brand-300 bg-brand-50" : "border-slate-200",
        disabled && "opacity-50",
      )}
    >
      <input
        type="radio"
        name="channel"
        className="mt-0.5 size-4 accent-brand-700"
        checked={current === value}
        disabled={disabled}
        onChange={() => onSelect(value)}
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-slate-500">{description}</span>
      </span>
    </label>
  );
}
