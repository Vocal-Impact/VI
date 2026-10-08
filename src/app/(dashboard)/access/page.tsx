import { FilterForm } from "@/shared/ui/filter-form";
import {
  accessFilterSchema,
  countAccessLevels,
  listMemberAccess,
  listUnlinkedUsers,
  requirePermission,
} from "@/modules/auth";
import { Input, Select } from "@/shared/ui/form";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Stat } from "@/shared/ui/layout";
import { createUserAction, setMemberAccessAction, updateUserAction } from "./actions";
import { AccountRow, MemberAccessForm, NewAccountForm } from "./access-forms";

export const metadata = { title: "Access & roles" };

export default async function AccessPage(props: PageProps<"/access">) {
  const actor = await requirePermission("users:manage");
  const searchParams = await props.searchParams;
  const pick = (key: string) => {
    const value = searchParams[key];
    return (Array.isArray(value) ? value[0] : value) || undefined;
  };
  const parsed = accessFilterSchema.safeParse({ q: pick("q"), level: pick("level") });
  const filter = parsed.success ? parsed.data : {};

  const [rows, others, counts] = await Promise.all([
    listMemberAccess(filter),
    listUnlinkedUsers(),
    countAccessLevels(),
  ]);

  return (
    <>
      <PageHeader
        title="Access & roles"
        description="Every current member can sign in with their IIT Google account to see practices and reply. Promote members to Committee or Admin here."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Admins" value={counts.ADMIN} href="/access?level=ADMIN" />
        <Stat label="Committee" value={counts.COMMITTEE} href="/access?level=COMMITTEE" />
        <Stat label="Accounts outside the member list" value={others.length} hint="Advisors, local admin…" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Members"
            description="Choose a level and press Save. “Member” removes committee/admin powers but they can still sign in to reply to practices."
          />
          <FilterForm className="grid gap-2 border-b border-slate-100 p-4 sm:grid-cols-[1fr_auto]">
            <Input
              name="q"
              placeholder="Search name, email or student ID"
              defaultValue={filter.q ?? ""}
              aria-label="Search"
            />
            <Select name="level" defaultValue={filter.level ?? "ALL"} aria-label="Access level">
              <option value="ALL">Everyone</option>
              <option value="WITH_ACCESS">With access</option>
              <option value="ADMIN">Admins</option>
              <option value="COMMITTEE">Committee</option>
              <option value="NONE">Members only</option>
            </Select>
          </FilterForm>
          {rows.length === 0 ? (
            <CardBody>
              <EmptyState title="No members found">Add members first (Members → Add member or Import CSV).</EmptyState>
            </CardBody>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((row) => (
                <MemberAccessForm
                  key={row.id}
                  action={setMemberAccessAction.bind(null, row.id)}
                  row={{
                    memberId: row.id,
                    name: `${row.firstName} ${row.lastName}`,
                    email: row.email,
                    voiceType: row.voiceType,
                    status: row.status,
                    level: row.level,
                    receivesBirthdayReminders: row.user?.receivesBirthdayReminders ?? false,
                    hasSignedIn: row.hasSignedIn,
                    isSelf: row.user?.id === actor.id,
                  }}
                />
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Other accounts" description="Logins not linked to a choir member." />
            {others.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-600">None.</p>
              </CardBody>
            ) : (
              <div className="divide-y divide-slate-100">
                {others.map((account) => (
                  <AccountRow
                    key={account.id}
                    action={updateUserAction.bind(null, account.id)}
                    isSelf={account.id === actor.id}
                    account={{
                      name: account.name,
                      email: account.email,
                      role: account.role,
                      active: account.active,
                      receivesBirthdayReminders: account.receivesBirthdayReminders,
                      hasSignedIn: account.accounts.length > 0,
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader
              title="Add an account"
              description="For someone who isn't in the member list (e.g. a faculty advisor)."
            />
            <CardBody>
              <NewAccountForm action={createUserAction} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
