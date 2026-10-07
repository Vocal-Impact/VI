import Link from "next/link";
import { notFound } from "next/navigation";
import { isFeatureEnabled } from "@/shared/config/features";
import { requirePermission, hasPermission } from "@/modules/auth";
import { getCarpoolOverview } from "@/modules/carpool";
import { getPractice, getPracticeAttendeeIds, getTodaysPractice, listUpcomingPractices } from "@/modules/attendance";
import { formatTimeRange } from "@/modules/attendance/domain";
import { formatIsoDate } from "@/shared/lib/dates";
import { Select } from "@/shared/ui/form";
import { haversineKm } from "@/modules/carpool/domain";
import { groupColour, type MapPerson } from "@/modules/carpool/ui";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/shared/ui/layout";
import { requeueFailedAction } from "./actions";
import { GeocodeButton, MapClient } from "./map-client";

export const metadata = { title: "Lifts home" };

const ALL = "all";

export default async function CarpoolPage(props: PageProps<"/carpool">) {
  if (!isFeatureEnabled("liftsHome")) notFound();
  const user = await requirePermission("carpool:read");
  const canWrite = hasPermission(user.role, "carpool:write");
  const { practice: practiceParam } = await props.searchParams;
  const requested = Array.isArray(practiceParam) ? practiceParam[0] : practiceParam;

  // Default to today's practice, else the next one, else everyone.
  const [todays, upcoming] = await Promise.all([getTodaysPractice(), listUpcomingPractices({ take: 8 })]);
  const practiceId = requested ?? todays?.id ?? upcoming[0]?.id ?? ALL;
  const practice = practiceId === ALL ? null : await getPractice(practiceId);
  const attendeeIds = practice ? await getPracticeAttendeeIds(practice.id) : undefined;
  const choices = [...upcoming];
  if (practice && !choices.some((choice) => choice.id === practice.id))
    choices.unshift({ ...practice, counts: { going: 0, notGoing: 0, noResponse: 0 } });

  const overview = await getCarpoolOverview({ attendeeIds });
  const { suggestions, venue } = overview;

  // Colour index per person: driver groups first, then neighbour groups.
  const groupOf = new Map<string, number>();
  suggestions.driverGroups.forEach((group, index) => {
    groupOf.set(group.driver.id, index);
    for (const passenger of group.passengers) groupOf.set(passenger.id, index);
  });
  const offset = suggestions.driverGroups.length;
  suggestions.neighbourGroups.forEach((group, index) => {
    for (const member of group.members) groupOf.set(member.id, offset + index);
  });

  const people: MapPerson[] = overview.people.map((person) => ({
    id: person.id,
    name: person.name,
    areaLabel: person.areaLabel,
    latitude: person.latitude,
    longitude: person.longitude,
    canDrive: person.canDrive,
    groupIndex: groupOf.get(person.id) ?? null,
  }));
  // Real road routes when available; otherwise a dashed straight line through the stops.
  const lines = suggestions.driverGroups.map((group, index) => {
    const route = overview.routes[group.driver.id];
    return {
      groupIndex: index,
      road: Boolean(route),
      points: (route?.geometry ?? [venue, ...group.passengers, group.driver]).map(({ latitude, longitude }) => ({
        latitude,
        longitude,
      })),
    };
  });
  const road = overview.routingStatus === "road";
  const km = (value: number) => `${road ? "" : "≈"}${value.toFixed(1)} km`;
  const phone = (id: string) => overview.whatsappById[id] ?? "";

  return (
    <>
      <PageHeader
        title="Lifts home"
        description={`Who can drop whom home after practice at ${venue.name}. Members agree the final plan in WhatsApp.`}
      />

      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <label htmlFor="practice" className="text-sm font-medium text-slate-700">
          Plan for
        </label>
        <Select id="practice" name="practice" defaultValue={practiceId} className="h-9 w-auto max-w-full">
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.title} — {formatIsoDate(choice.date, { year: undefined })},{" "}
              {formatTimeRange(choice.startTime, choice.endTime)}
            </option>
          ))}
          <option value={ALL}>All members with a location</option>
        </Select>
        <button type="submit" className={buttonClasses("secondary", "sm")}>
          Show
        </button>
      </form>

      {practice ? (
        <Alert tone="info" className="mb-4">
          Showing the {attendeeIds?.size ?? 0} people who said they&apos;re going to (or were marked present at){" "}
          <b>{practice.title}</b> on {formatIsoDate(practice.date, { weekday: "long", month: "long" })}.
          {overview.attendeesWithoutLocation > 0
            ? ` ${overview.attendeesWithoutLocation} of them haven't shared their area yet, so they're not on the map.`
            : ""}
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canWrite && overview.pending > 0 ? <GeocodeButton pending={overview.pending} /> : null}
        <span className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          {road ? <Badge tone="green">Real road distances</Badge> : <Badge tone="amber">Estimated distances</Badge>}
          {overview.people.length} on the map · max detour {overview.settings.maxDetourKm} km · neighbours within{" "}
          {overview.settings.clusterRadiusKm} km
        </span>
      </div>

      {overview.routingStatus === "not-configured" ? (
        <Alert tone="warning" title="Distances are estimates, not real roads" className="mb-4">
          Without a routing service the app uses straight-line distance × 1.3, so a real detour can be longer than
          shown. Add a free OpenRouteService key (ORS_API_KEY — see README) to match on actual roads. The “Open in
          Google Maps” buttons always use real roads.
        </Alert>
      ) : overview.routingStatus === "too-many" ? (
        <Alert tone="info" className="mb-4">
          Too many people for one free road-distance lookup, so these are estimates. Pick a specific practice to use
          real roads.
        </Alert>
      ) : overview.routingStatus === "unavailable" ? (
        <Alert tone="warning" className="mb-4">
          The road-distance service didn&apos;t respond, so these are estimates for now. Try again in a few minutes.
        </Alert>
      ) : null}

      {overview.unlocated.length > 0 ? (
        <Alert tone="warning" title="Some areas could not be found on the map" className="mb-4">
          {overview.unlocated.map((entry, index) => (
            <span key={entry.memberId}>
              {index > 0 ? ", " : ""}
              <Link href={`/members/${entry.memberId}`} className="underline">
                {entry.name}
              </Link>{" "}
              ({entry.areaLabel})
            </span>
          ))}
          . Open their profile and paste the spot&apos;s coordinates from Google Maps (or drop a pin). If you fixed the
          spelling, use Retry.
          {canWrite ? (
            <form action={requeueFailedAction} className="mt-2">
              <Button type="submit" size="sm" variant="outline">
                Retry these areas
              </Button>
            </form>
          ) : null}
        </Alert>
      ) : null}

      <Card className="mb-6 overflow-hidden p-1">
        {overview.people.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No locations yet">
              Import the details form (Members → Import CSV) or add an area on a member&apos;s profile.
            </EmptyState>
          </div>
        ) : (
          <MapClient venue={venue} people={people} lines={lines} />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="🚗 Driver groups"
            description="Each driver drops these people off on the way home, in this order."
          />
          <CardBody className="space-y-4">
            {suggestions.driverGroups.length === 0 ? (
              <p className="text-sm text-slate-600">
                No driver matches. Mark members who can drive (and their free seats) on their profiles.
              </p>
            ) : null}
            {suggestions.driverGroups.map((group, index) => (
              <div
                key={group.driver.id}
                className="rounded-lg border border-slate-200 p-3"
                style={{ borderLeft: `4px solid ${groupColour(index)}` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {group.driver.name} <span className="text-sm text-slate-500">({group.driver.areaLabel})</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {group.passengers.length}/{group.driver.seats} seats · +{km(group.detourKm)} detour · trip home{" "}
                      {km(overview.routes[group.driver.id]?.distanceKm ?? group.tripKm)}
                      {overview.routes[group.driver.id]
                        ? ` · ~${Math.round(overview.routes[group.driver.id]!.durationMin)} min`
                        : ""}
                    </p>
                  </div>
                  <a
                    href={group.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClasses("primary", "sm")}
                  >
                    Open in Google Maps
                  </a>
                </div>
                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm">
                  {group.passengers.map((passenger) => (
                    <li key={passenger.id}>
                      {passenger.name}{" "}
                      <span className="text-slate-500">
                        — {passenger.areaLabel} · {phone(passenger.id)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="👥 Going the same way"
            description="No driver, but they live close together — could share a taxi or travel together."
          />
          <CardBody className="space-y-4">
            {suggestions.neighbourGroups.length === 0 ? (
              <p className="text-sm text-slate-600">No neighbour groups.</p>
            ) : null}
            {suggestions.neighbourGroups.map((group, index) => (
              <div
                key={group.members[0]?.id}
                className="rounded-lg border border-slate-200 p-3"
                style={{ borderLeft: `4px solid ${groupColour(offset + index)}` }}
              >
                <p className="text-xs text-slate-500">{haversineKm(group.centre, venue).toFixed(1)} km from venue</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {group.members.map((member) => (
                    <li key={member.id}>
                      {member.name}{" "}
                      <span className="text-slate-500">
                        — {member.areaLabel} · {phone(member.id)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {suggestions.alone.length > 0 ? (
              <div>
                <p className="mb-1 text-sm font-medium">No one nearby</p>
                <div className="flex flex-wrap gap-1">
                  {suggestions.alone.map((person) => (
                    <Badge key={person.id}>
                      {person.name} · {person.areaLabel}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
