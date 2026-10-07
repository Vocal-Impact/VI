"use client";

import { SubmitButton } from "@/shared/ui/client";
import Link from "next/link";
import { useState } from "react";
import { attendanceProgress } from "@/modules/attendance/domain";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { cn } from "@/shared/lib/cn";
import { Button, LinkButton } from "@/shared/ui/button";
import { CopyButton } from "@/shared/ui/client";
import { Badge, Card, EmptyState } from "@/shared/ui/layout";

type Kind = "ACTIVE_NOT_IN_GROUP" | "READY" | "STILL_ATTENDING";

interface QueueMember {
  id: string;
  name: string;
  status: string;
  kind: Kind;
  voiceType: string;
  whatsappNumber: string;
  attendedCount: number;
  invitedAt: string | null;
}

const SECTIONS: Array<{ kind: Kind; title: string; hint: string }> = [
  {
    kind: "ACTIVE_NOT_IN_GROUP",
    title: "Active members not in the main group",
    hint: "Already choir members — invite them, or open the group and mark them as joined.",
  },
  { kind: "READY", title: "Ready to join", hint: "Prospective members who have reached the practice count." },
  {
    kind: "STILL_ATTENDING",
    title: "Still attending practices",
    hint: "Not eligible for the main groups yet — open groups only.",
  },
];

export function EligibleList({
  members,
  threshold,
  canWrite,
  markAdded,
}: {
  members: QueueMember[];
  threshold: number;
  canWrite: boolean;
  markAdded: (memberId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (members.length === 0) {
    return <EmptyState title="Nobody here right now">Everyone in this view has been taken care of 🎉</EmptyState>;
  }

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAll = (kind: Kind) =>
    setSelected((current) => new Set([...current, ...members.filter((m) => m.kind === kind).map((m) => m.id)]));

  return (
    <div className="space-y-4">
      {canWrite ? (
        <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
          <span className="text-sm text-slate-600">{selected.size} selected</span>
          <LinkButton
            href={`/whatsapp-groups/invite?members=${[...selected].join(",")}`}
            aria-disabled={selected.size === 0}
            className={selected.size === 0 ? "pointer-events-none opacity-50" : undefined}
          >
            Send group invites to selected
          </LinkButton>
        </Card>
      ) : null}

      {SECTIONS.map(({ kind, title, hint }) => {
        const rows = members.filter((member) => member.kind === kind);
        if (rows.length === 0) return null;
        const muted = kind === "STILL_ATTENDING";
        return (
          <Card key={kind}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-display font-extrabold text-ink">
                  {title} <span className="text-slate-400">({rows.length})</span>
                </h2>
                <p className="text-xs text-slate-500">{hint}</p>
              </div>
              {canWrite ? (
                <Button size="sm" variant="ghost" onClick={() => selectAll(kind)}>
                  Select all
                </Button>
              ) : null}
            </div>
            <ul className="divide-y divide-slate-100">
              {rows.map((member) => (
                <li
                  key={member.id}
                  className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", muted && "bg-slate-50 text-slate-500")}
                >
                  {canWrite ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${member.name}`}
                      className="size-4 accent-brand-700"
                      checked={selected.has(member.id)}
                      onChange={() => toggle(member.id)}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/members/${member.id}`}
                      className={cn("font-medium hover:underline", !muted && "text-ink")}
                    >
                      {member.name}
                    </Link>
                    <p className="text-xs">
                      {VOICE_TYPE_LABELS[member.voiceType as VoiceType]}
                      {member.status === "PROSPECTIVE"
                        ? ` · ${attendanceProgress(member.attendedCount, threshold)} practices`
                        : " · active"}
                    </p>
                  </div>
                  <span className="hidden items-center gap-2 text-sm tabular-nums sm:flex">
                    {member.whatsappNumber}
                    <CopyButton text={member.whatsappNumber} label="Copy" />
                  </span>
                  {member.invitedAt ? (
                    <Badge tone="blue">Invited {new Date(member.invitedAt).toLocaleDateString("en-GB")}</Badge>
                  ) : (
                    <Badge>Not invited</Badge>
                  )}
                  {canWrite ? (
                    <span className="inline-flex gap-2">
                      <LinkButton href={`/whatsapp-groups/invite?members=${member.id}`} size="sm" variant="secondary">
                        Invite
                      </LinkButton>
                      {member.kind === "READY" ? (
                        <form action={markAdded.bind(null, member.id)}>
                          <SubmitButton
                            size="sm"
                            variant="outline"
                            confirm={{
                              title: `Mark ${member.name} as added to WhatsApp?`,
                              description: "Only once they're in the main WhatsApp group. Their status becomes Active.",
                              confirmLabel: "Mark as added",
                            }}
                          >
                            Mark as added
                          </SubmitButton>
                        </form>
                      ) : null}
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
