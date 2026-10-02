import Link from "next/link";
import { requirePermission, hasPermission } from "@/modules/auth";
import { getBirthdayCalendar, getBirthdayDashboard } from "@/modules/birthdays";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { formatIsoDate } from "@/shared/lib/dates";
import { buttonClasses } from "@/shared/ui/button";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/shared/ui/layout";
import { cn } from "@/shared/lib/cn";

export const metadata = { title: "Birthdays" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseMonth(value: string | undefined, today: string): { year: number; month: number } {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : Number(today.slice(0, 4));
  const month = match ? Number(match[2]) : Number(today.slice(5, 7));
  return month >= 1 && month <= 12
    ? { year, month }
    : { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

export default async function BirthdaysPage(props: PageProps<"/birthdays">) {
  const user = await requirePermission("birthdays:read");
  const { month: monthParam } = await props.searchParams;
  const dashboard = await getBirthdayDashboard();
  const { year, month } = parseMonth(Array.isArray(monthParam) ? monthParam[0] : monthParam, dashboard.today);
  const calendar = await getBirthdayCalendar(year, month);

  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = (first.getUTCDay() + 6) % 7; // Monday-first grid
  const byDay = new Map<number, typeof calendar>();
  for (const entry of calendar) {
    const day = Number(entry.date.slice(8, 10));
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }
  const prev = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
  const next = month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
  const showDetails = hasPermission(user.role, "members:read");

  return (
    <>
      <PageHeader
        title="Birthdays 🎂"
        description="Reminder emails go out every morning to subscribed committee members."
      />

      {dashboard.missing > 0 && showDetails ? (
        <Alert tone="info" className="mb-6">
          {dashboard.missing} current member(s) have no birthday on file. Import the details form or add it on their
          profile.
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader title="Today" />
          <CardBody className="space-y-2">
            {dashboard.todays.length === 0 ? <p className="text-sm text-slate-600">No birthdays today.</p> : null}
            {dashboard.todays.map((entry) => (
              <div key={entry.person.id} className="rounded-lg bg-brand-50 px-3 py-2">
                <p className="font-semibold">🎉 {entry.person.name}</p>
                <p className="text-sm text-slate-600">
                  Turns {entry.turningAge} · {VOICE_TYPE_LABELS[entry.person.voiceType as VoiceType]}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Next 7 days" />
          <CardBody>
            {dashboard.nextSevenDays.length === 0 ? <p className="text-sm text-slate-600">None coming up.</p> : null}
            <ul className="space-y-1.5 text-sm">
              {dashboard.nextSevenDays.map((entry) => (
                <li key={entry.person.id} className="flex justify-between gap-2">
                  <span>{entry.person.name}</span>
                  <span className="text-slate-500">{formatIsoDate(entry.date, { year: undefined })}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="This month" />
          <CardBody>
            <p className="text-3xl font-semibold tabular-nums">{dashboard.thisMonth.length}</p>
            <p className="text-sm text-slate-500">
              birthdays in {formatIsoDate(dashboard.today, { weekday: undefined, day: undefined, month: "long" })}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={formatIsoDate(`${monthKey(year, month)}-01`, { weekday: undefined, day: undefined, month: "long" })}
          action={
            <div className="flex gap-1">
              <Link
                href={`/birthdays?month=${prev}`}
                className={buttonClasses("outline", "sm")}
                aria-label="Previous month"
              >
                ←
              </Link>
              <Link href="/birthdays" className={buttonClasses("ghost", "sm")}>
                Today
              </Link>
              <Link
                href={`/birthdays?month=${next}`}
                className={buttonClasses("outline", "sm")}
                aria-label="Next month"
              >
                →
              </Link>
            </div>
          }
        />
        <CardBody>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
            {WEEKDAYS.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }, (_, index) => (
              <div key={`blank-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const iso = `${monthKey(year, month)}-${String(day).padStart(2, "0")}`;
              const entries = byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  className={cn(
                    "min-h-16 rounded-md border p-1 text-left text-xs sm:min-h-20",
                    iso === dashboard.today ? "border-brand-500 bg-brand-50" : "border-slate-100",
                  )}
                >
                  <span className="font-medium text-slate-500">{day}</span>
                  {entries.map((entry) => (
                    <p
                      key={entry.person.id}
                      className="mt-0.5 truncate rounded bg-brand-100 px-1 text-brand-800"
                      title={entry.person.name}
                    >
                      🎂 {entry.person.name.split(" ")[0]}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
