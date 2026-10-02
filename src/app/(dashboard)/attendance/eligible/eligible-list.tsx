"use client";

import Link from "next/link";
import { useState } from "react";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { Button, LinkButton } from "@/shared/ui/button";
import { CopyButton } from "@/shared/ui/client";
import { Badge, Card, EmptyState, Table, Td, Th } from "@/shared/ui/layout";

interface EligibleMember {
  id: string;
  name: string;
  voiceType: string;
  whatsappNumber: string;
  attendedCount: number;
  invitedAt: string | null;
}

export function EligibleList({
  members,
  canWrite,
  markAdded,
}: {
  members: EligibleMember[];
  canWrite: boolean;
  markAdded: (memberId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (members.length === 0) {
    return (
      <EmptyState title="Nobody is waiting right now">
        Members show up here once they reach the practice threshold.
      </EmptyState>
    );
  }

  const allSelected = selected.size === members.length;
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card>
      {canWrite ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
          <span className="text-sm text-slate-600">{selected.size} selected</span>
          <LinkButton
            href={`/whatsapp-groups/invite?members=${[...selected].join(",")}`}
            aria-disabled={selected.size === 0}
            className={selected.size === 0 ? "pointer-events-none opacity-50" : undefined}
          >
            Send group invites to selected
          </LinkButton>
        </div>
      ) : null}
      <Table>
        <thead>
          <tr>
            {canWrite ? (
              <Th className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  className="size-4 accent-brand-700"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(members.map((member) => member.id)))}
                />
              </Th>
            ) : null}
            <Th>Name</Th>
            <Th>Voice</Th>
            <Th className="text-right">Practices</Th>
            <Th>WhatsApp</Th>
            <Th>Invite</Th>
            {canWrite ? <Th className="text-right">Actions</Th> : null}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              {canWrite ? (
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${member.name}`}
                    className="size-4 accent-brand-700"
                    checked={selected.has(member.id)}
                    onChange={() => toggle(member.id)}
                  />
                </Td>
              ) : null}
              <Td>
                <Link href={`/members/${member.id}`} className="font-medium hover:underline">
                  {member.name}
                </Link>
              </Td>
              <Td>{VOICE_TYPE_LABELS[member.voiceType as VoiceType]}</Td>
              <Td className="text-right tabular-nums">{member.attendedCount}</Td>
              <Td>
                <span className="flex items-center gap-2 tabular-nums">
                  {member.whatsappNumber}
                  <CopyButton text={member.whatsappNumber} label="Copy" />
                </span>
              </Td>
              <Td>
                {member.invitedAt ? (
                  <Badge tone="blue">Sent {new Date(member.invitedAt).toLocaleDateString("en-GB")}</Badge>
                ) : (
                  <Badge>Not sent</Badge>
                )}
              </Td>
              {canWrite ? (
                <Td className="text-right">
                  <span className="inline-flex gap-2">
                    <LinkButton href={`/whatsapp-groups/invite?members=${member.id}`} size="sm" variant="secondary">
                      Invite
                    </LinkButton>
                    <form action={markAdded.bind(null, member.id)}>
                      <Button type="submit" size="sm" variant="outline">
                        Mark as added
                      </Button>
                    </form>
                  </span>
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
