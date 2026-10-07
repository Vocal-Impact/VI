"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { cn } from "@/shared/lib/cn";
import { Button, LinkButton } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/form";
import { useConfirm } from "@/shared/ui/client";
import { Alert, Badge, Card, EmptyState } from "@/shared/ui/layout";
import { markJoinedAction, markManyJoinedAction, sendInvitesAction } from "../actions";

export interface GroupRosterRow {
  id: string;
  name: string;
  voiceType: string;
  status: string;
  attendedCount: number;
  membership: "NOT_INVITED" | "INVITED" | "JOINED" | "FAILED";
  lastInvitedAt: string | null;
  eligible: boolean;
  reason: string | null;
}

type Section = "active" | "ready" | "invited" | "blocked";

const SECTIONS: Array<{ key: Section; title: string; hint: string }> = [
  { key: "active", title: "Active members not in this group", hint: "Already choir members — add them first." },
  { key: "ready", title: "Ready to invite", hint: "Eligible and not invited yet." },
  { key: "invited", title: "Invited — waiting to join", hint: "Tick “Joined” once you see them in the group." },
  { key: "blocked", title: "Can't join yet", hint: "Admins can override (e.g. a committee member in a part group)." },
];

function sectionOf(row: GroupRosterRow): Section {
  if (!row.eligible) return "blocked";
  if (row.status === "ACTIVE") return "active";
  return row.membership === "INVITED" ? "invited" : "ready";
}

export function GroupRoster({
  groupId,
  groupName,
  rows,
  canOverride,
  canInvite,
  emailDelivery,
}: {
  groupId: string;
  groupName: string;
  rows: GroupRosterRow[];
  canOverride: boolean;
  canInvite: boolean;
  emailDelivery: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [override, setOverride] = useState(false);
  const { confirm, dialog } = useConfirm();
  const [pending, startTransition] = useTransition();
  const selectable = (row: GroupRosterRow) => canInvite && (row.eligible || override);

  const grouped = useMemo(() => {
    const map = new Map<Section, GroupRosterRow[]>(SECTIONS.map(({ key }) => [key, []]));
    for (const row of rows) map.get(sectionOf(row))!.push(row);
    return map;
  }, [rows]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectSection = (section: Section) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const row of grouped.get(section) ?? []) if (selectable(row)) next.add(row.id);
      return next;
    });

  const selectedIds = [...selected];
  const needsOverride = rows.some((row) => selected.has(row.id) && !row.eligible);

  async function emailSelected() {
    if (selectedIds.length === 0) return;
    const people = `${selectedIds.length} ${selectedIds.length === 1 ? "person" : "people"}`;
    const ok = await confirm({
      title: `Email the ${groupName} invite to ${people}?`,
      description: needsOverride
        ? "Some of them can't join yet; you're overriding that as an admin. Each gets the invite link by email."
        : "Each gets the group's invite link by email.",
      confirmLabel: "Send emails",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await sendInvitesAction({
        memberIds: selectedIds,
        groupIds: [groupId],
        channel: "EMAIL",
        overrideEligibility: needsOverride,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { sent, failed } = result.value;
      if (!emailDelivery) toast.warning(`Recorded ${sent} invite(s) — email isn't set up, so nothing was delivered.`);
      else if (failed > 0) toast.error(`${sent} sent, ${failed} failed — check each member's profile.`);
      else toast.success(`Invite emails sent to ${sent} ${sent === 1 ? "person" : "people"} 🎶`);
      setSelected(new Set());
    });
  }

  async function markSelectedJoined() {
    if (selectedIds.length === 0) return;
    const ok = await confirm({
      title: `Mark ${selectedIds.length} ${selectedIds.length === 1 ? "person" : "people"} as in ${groupName}?`,
      description: "Only once you can see them in the group.",
      confirmLabel: "Mark as joined",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await markManyJoinedAction(groupId, selectedIds);
      toast.success(`${result.marked} marked as in ${groupName}`);
      setSelected(new Set());
    });
  }

  async function markJoined(row: GroupRosterRow) {
    const ok = await confirm({
      title: `Mark ${row.name} as in ${groupName}?`,
      description: "Only once you can see them in the group.",
      confirmLabel: "Mark as joined",
    });
    if (!ok) return;
    startTransition(async () => {
      await markJoinedAction(row.id, groupId);
      toast.success(`${row.name} marked as in ${groupName}`);
    });
  }

  if (rows.length === 0) {
    return <EmptyState title="Everyone is already in this group 🎉" />;
  }

  return (
    <div className="space-y-4">
      {dialog}
      {canInvite ? (
        <Card className="sticky top-[57px] z-10 flex flex-wrap items-center justify-between gap-3 p-3 lg:top-2">
          <span className="text-sm font-medium">
            {selected.size} selected
            {selected.size > 0 ? (
              <button
                type="button"
                className="ml-2 text-xs text-brand-700 hover:underline"
                onClick={() => setSelected(new Set())}
              >
                clear
              </button>
            ) : null}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {canOverride ? (
              <Checkbox
                checked={override}
                onChange={(event) => {
                  setOverride(event.target.checked);
                  if (!event.target.checked) {
                    setSelected(
                      (current) => new Set([...current].filter((id) => rows.find((r) => r.id === id)?.eligible)),
                    );
                  }
                }}
                label="Override restrictions"
              />
            ) : null}
            <Button size="sm" variant="outline" disabled={pending || selected.size === 0} onClick={markSelectedJoined}>
              Mark as joined
            </Button>
            <Button size="sm" disabled={pending || selected.size === 0} onClick={emailSelected}>
              Email invites ({selected.size})
            </Button>
          </div>
        </Card>
      ) : null}

      {!emailDelivery && canInvite ? (
        <Alert tone="warning">Email isn&apos;t set up yet — invites will be recorded but not delivered.</Alert>
      ) : null}

      {SECTIONS.map(({ key, title, hint }) => {
        const sectionRows = grouped.get(key) ?? [];
        if (sectionRows.length === 0) return null;
        return (
          <Card key={key}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-display font-extrabold text-ink">
                  {title} <span className="text-slate-400">({sectionRows.length})</span>
                </h2>
                <p className="text-xs text-slate-500">{hint}</p>
              </div>
              {canInvite && (key !== "blocked" || override) ? (
                <Button size="sm" variant="ghost" onClick={() => selectSection(key)}>
                  Select all
                </Button>
              ) : null}
            </div>
            <ul className="divide-y divide-slate-100">
              {sectionRows.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-4 py-2.5",
                    !row.eligible && "bg-slate-50 text-slate-400",
                  )}
                >
                  {canInvite ? (
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-700"
                      aria-label={`Select ${row.name}`}
                      checked={selected.has(row.id)}
                      disabled={!selectable(row)}
                      onChange={() => toggle(row.id)}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/members/${row.id}`}
                      className={cn("font-medium hover:underline", row.eligible ? "text-ink" : "text-slate-500")}
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs">
                      {VOICE_TYPE_LABELS[row.voiceType as VoiceType]} · {row.status.toLowerCase()}
                      {row.status === "PROSPECTIVE" ? ` · ${row.attendedCount} practices` : ""}
                      {row.reason ? <span className="text-amber-700"> · {row.reason}</span> : null}
                    </p>
                  </div>
                  {row.membership === "INVITED" && row.lastInvitedAt ? (
                    <Badge tone="blue">Invited {new Date(row.lastInvitedAt).toLocaleDateString("en-GB")}</Badge>
                  ) : row.membership === "FAILED" ? (
                    <Badge tone="red">Last invite failed</Badge>
                  ) : null}
                  {canInvite && selectable(row) ? (
                    <span className="flex gap-2">
                      <LinkButton
                        href={`/whatsapp-groups/invite?members=${row.id}&groups=${groupId}`}
                        size="sm"
                        variant="secondary"
                      >
                        WhatsApp
                      </LinkButton>
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => markJoined(row)}>
                        Joined
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
