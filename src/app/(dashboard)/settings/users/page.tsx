import { listUsers, requirePermission } from "@/modules/auth";
import { Card, CardBody, CardHeader } from "@/shared/ui/layout";
import { createUserAction, updateUserAction } from "../actions";
import { NewUserForm, UserRow } from "./user-forms";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requirePermission("users:manage");
  const users = await listUsers();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Committee users"
          description="Only people on this list can sign in. Tick “Birthday emails” for anyone who should get the morning reminder."
        />
        <CardBody className="divide-y divide-slate-100 p-0 sm:p-0">
          {users.map((user) => (
            <UserRow
              key={user.id}
              action={updateUserAction.bind(null, user.id)}
              isSelf={user.id === actor.id}
              user={{
                name: user.name,
                email: user.email,
                role: user.role,
                active: user.active,
                receivesBirthdayReminders: user.receivesBirthdayReminders,
                hasSignedIn: user.accounts.length > 0,
              }}
            />
          ))}
        </CardBody>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Add a user" description="Use their IIT Google account email." />
        <CardBody>
          <NewUserForm action={createUserAction} />
        </CardBody>
      </Card>
    </div>
  );
}
