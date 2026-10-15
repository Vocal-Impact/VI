"use client";

import Link from "next/link";
import { useState } from "react";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { byVoicePart, VoicePartSelect, type VoicePartFilter } from "@/modules/members/ui";
import { Card, CardBody, CardHeader } from "@/shared/ui/layout";

export interface RsvpBoardPerson {
  memberId: string;
  name: string;
  voiceType: string;
  /** When they replied, already formatted ("12 Oct, 14:05"), or null. */
  replied: string | null;
}

/** Going / Can't make it / No reply yet, narrowed to one voice part if wanted. */
export function RsvpBoard({
  going,
  notGoing,
  noResponse,
  linkToProfiles,
}: {
  going: RsvpBoardPerson[];
  notGoing: RsvpBoardPerson[];
  noResponse: RsvpBoardPerson[];
  /** Off for organisers who can't open member profiles (alumni organisers, batch leads). */
  linkToProfiles: boolean;
}) {
  const [part, setPart] = useState<VoicePartFilter>("ALL");
  const lists = [
    { title: "Going", tone: "text-emerald-700", people: going, showTime: true },
    { title: "Can't make it", tone: "text-red-600", people: notGoing, showTime: true },
    { title: "No reply yet", tone: "text-slate-500", people: noResponse, showTime: false },
  ];

  return (
    <section aria-label="Replies" className="mb-6 space-y-3">
      <div className="flex justify-end">
        <VoicePartSelect value={part} onChange={setPart} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {lists.map((list) => (
          <RsvpList
            key={list.title}
            {...list}
            people={byVoicePart(list.people, part)}
            linkToProfiles={linkToProfiles}
          />
        ))}
      </div>
    </section>
  );
}

function RsvpList({
  title,
  tone,
  people,
  showTime,
  linkToProfiles,
}: {
  title: string;
  tone: string;
  people: RsvpBoardPerson[];
  showTime: boolean;
  linkToProfiles: boolean;
}) {
  return (
    <Card>
      <CardHeader title={`${title} (${people.length})`} className={tone} />
      <CardBody>
        {people.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody.</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto text-sm">
            {people.map((person) => (
              <li key={person.memberId} className="flex justify-between gap-2">
                {linkToProfiles ? (
                  <Link href={`/members/${person.memberId}`} className="truncate hover:underline">
                    {person.name}
                  </Link>
                ) : (
                  <span className="truncate">{person.name}</span>
                )}
                <span className="shrink-0 text-xs text-slate-500">
                  {showTime && person.replied ? person.replied : VOICE_TYPE_LABELS[person.voiceType as VoiceType]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
