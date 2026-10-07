import Link from "next/link";
import { requirePermission, hasPermission } from "@/modules/auth";
import { countRemovedMembers, listMembers, parseMemberFilter, REMOVED_FILTER } from "@/modules/members";
import {
  MEMBER_STATUSES,
  MEMBER_STATUS_LABELS,
  VOICE_TYPES,
  VOICE_TYPE_LABELS,
  STUDY_LEVELS,
  STUDY_LEVEL_LABELS,
} from "@/modules/members/domain";
import { StatusBadge, VoiceBadge } from "@/modules/members/ui";
import { buttonClasses, LinkButton } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form";
import { Alert, Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/shared/ui/layout";
import { SubmitButton } from "@/shared/ui/client";
import { restoreMemberAction } from "./actions";

export const metadata = { title: "Members" };

export default async function MembersPage(props: PageProps<"/members">) {
  const user = await requirePermission("members:read");
  const searchParams = await props.searchParams;
  const filter = parseMemberFilter(searchParams);
  const [members, removedCount] = await Promise.all([listMembers(filter), countRemovedMembers()]);
  const canWrite = hasPermission(user.role, "members:write");
  const exportQuery = new URLSearchParams(
    Object.entries({ ...filter, removed: undefined, status: filter.removed ? REMOVED_FILTER : filter.status }).flatMap(
      ([key, value]) => (value === undefined ? [] : [[key, String(value)]]),
    ),
  ).toString();

  return (
    <>
      <PageHeader
        title={filter.removed ? "Removed members" : "Members"}
        description={
          <>
            {`${members.length} member${members.length === 1 ? "" : "s"}${Object.keys(filter).length ? " match your filters" : ""}`}
            {!filter.removed && removedCount > 0 ? (
              <>
                {" · "}
                <Link href={`/members?status=${REMOVED_FILTER}`} className="text-brand-700 hover:underline">
                  {removedCount} removed (can be restored)
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            {canWrite ? <LinkButton href="/members/new">Add member</LinkButton> : null}
            {hasPermission(user.role, "imports:run") ? (
              <LinkButton href="/members/import" variant="outline">
                Import CSV
              </LinkButton>
            ) : null}
            <a href={`/members/export${exportQuery ? `?${exportQuery}` : ""}`} className={buttonClasses("ghost")}>
              Export CSV
            </a>
          </>
        }
      />

      {filter.removed ? (
        <Alert tone="warning" title="Removed members" className="mb-4">
          These records are hidden from lists, attendance and the carpool map, and can&apos;t sign in. Restore anyone
          removed by mistake. Members who simply stopped coming should be set to <b>Inactive</b> instead.
        </Alert>
      ) : null}

      {searchParams.erased ? (
        <Alert tone="success" className="mb-4">
          The member and their personal data were permanently erased.
        </Alert>
      ) : null}

      <Card>
        <form className="grid gap-2 border-b border-slate-100 p-4 sm:grid-cols-[1fr_repeat(3,auto)_auto]" role="search">
          <Input
            name="q"
            placeholder="Search name, student ID, email or phone"
            defaultValue={filter.q ?? ""}
            aria-label="Search"
          />
          <Select
            name="status"
            defaultValue={filter.removed ? REMOVED_FILTER : (filter.status ?? "")}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {MEMBER_STATUS_LABELS[status]}
              </option>
            ))}
            <option value={REMOVED_FILTER}>Removed (restorable)</option>
          </Select>
          <Select name="voiceType" defaultValue={filter.voiceType ?? ""} aria-label="Voice type">
            <option value="">All voices</option>
            {VOICE_TYPES.map((voiceType) => (
              <option key={voiceType} value={voiceType}>
                {VOICE_TYPE_LABELS[voiceType]}
              </option>
            ))}
          </Select>
          <Select name="year" defaultValue={filter.year ?? ""} aria-label="Year of study">
            <option value="">All years</option>
            {STUDY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {STUDY_LEVEL_LABELS[level]}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonClasses("secondary")}>
            Filter
          </button>
        </form>

        {members.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No members found">
              Try clearing the filters, add a member, or import the form CSV.
            </EmptyState>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="hidden md:table-cell">Student ID</Th>
                <Th>Voice</Th>
                <Th className="hidden sm:table-cell">Year</Th>
                <Th>Status</Th>
                <Th className="text-right">Practices</Th>
                <Th className="hidden lg:table-cell">WhatsApp</Th>
                <Th className="hidden xl:table-cell">Dietary</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/members/${member.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {member.firstName} {member.lastName}
                    </Link>
                  </Td>
                  <Td className="hidden font-mono text-xs md:table-cell">{member.studentId}</Td>
                  <Td>
                    <VoiceBadge voiceType={member.voiceType} />
                  </Td>
                  <Td className="hidden sm:table-cell">{STUDY_LEVEL_LABELS[member.yearOfStudy]}</Td>
                  <Td>
                    {member.deletedAt ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone="red">Removed {member.deletedAt.toLocaleDateString("en-GB")}</Badge>
                        {canWrite ? (
                          <form action={restoreMemberAction.bind(null, member.id)}>
                            <SubmitButton
                              size="sm"
                              variant="outline"
                              pendingText="Restoring…"
                              confirm={{
                                title: `Restore ${member.firstName} ${member.lastName}?`,
                                confirmLabel: "Restore",
                              }}
                            >
                              Restore
                            </SubmitButton>
                          </form>
                        ) : null}
                      </span>
                    ) : (
                      <StatusBadge status={member.status} />
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{member._count.attendances}</Td>
                  <Td className="hidden tabular-nums lg:table-cell">{member.whatsappNumber}</Td>
                  <Td
                    className="hidden max-w-48 truncate text-slate-600 xl:table-cell"
                    title={member.dietaryPreference ?? ""}
                  >
                    {member.dietaryPreference ?? <span className="text-slate-300">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
