import Link from "next/link";
import { requirePermission, hasPermission } from "@/modules/auth";
import { listMembers, parseMemberFilter } from "@/modules/members";
import {
  MEMBER_STATUSES,
  MEMBER_STATUS_LABELS,
  VOICE_TYPES,
  VOICE_TYPE_LABELS,
  formatYearOfStudy,
} from "@/modules/members/domain";
import { StatusBadge, VoiceBadge } from "@/modules/members/ui";
import { buttonClasses, LinkButton } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form";
import { Alert, Card, EmptyState, PageHeader, Table, Td, Th } from "@/shared/ui/layout";

export const metadata = { title: "Members" };

export default async function MembersPage(props: PageProps<"/members">) {
  const user = await requirePermission("members:read");
  const searchParams = await props.searchParams;
  const filter = parseMemberFilter(searchParams);
  const members = await listMembers(filter);
  const exportQuery = new URLSearchParams(
    Object.entries(filter).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
  ).toString();

  return (
    <>
      <PageHeader
        title="Members"
        description={`${members.length} member${members.length === 1 ? "" : "s"}${Object.keys(filter).length ? " match your filters" : ""}`}
        actions={
          <>
            {hasPermission(user.role, "members:write") ? <LinkButton href="/members/new">Add member</LinkButton> : null}
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
          <Select name="status" defaultValue={filter.status ?? ""} aria-label="Status">
            <option value="">All statuses</option>
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {MEMBER_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          <Select name="voiceType" defaultValue={filter.voiceType ?? ""} aria-label="Voice type">
            <option value="">All voices</option>
            {VOICE_TYPES.map((voiceType) => (
              <option key={voiceType} value={voiceType}>
                {VOICE_TYPE_LABELS[voiceType]}
              </option>
            ))}
          </Select>
          <Select name="year" defaultValue={filter.year?.toString() ?? ""} aria-label="Year of study">
            <option value="">All years</option>
            {[0, 1, 2, 3, 4, 5].map((year) => (
              <option key={year} value={year}>
                {formatYearOfStudy(year)}
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
                  <Td className="hidden sm:table-cell">{formatYearOfStudy(member.yearOfStudy)}</Td>
                  <Td>
                    <StatusBadge status={member.status} />
                  </Td>
                  <Td className="text-right tabular-nums">{member._count.attendances}</Td>
                  <Td className="hidden tabular-nums lg:table-cell">{member.whatsappNumber}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
