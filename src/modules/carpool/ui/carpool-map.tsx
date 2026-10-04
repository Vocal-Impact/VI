"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { LatLng } from "../domain/geo";
import { groupColour } from "./colours";

export interface MapPerson extends LatLng {
  id: string;
  name: string;
  areaLabel: string;
  canDrive: boolean;
  groupIndex: number | null;
}

/** OpenStreetMap view of members' approximate locations, coloured by suggested group. */
export default function CarpoolMap({
  venue,
  people,
  lines,
}: {
  venue: LatLng & { name: string };
  people: MapPerson[];
  lines: Array<{ points: LatLng[]; groupIndex: number; road: boolean }>;
}) {
  return (
    <MapContainer center={[venue.latitude, venue.longitude]} zoom={11} className="h-[28rem] w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {lines.map((line, index) => (
        <Polyline
          key={index}
          positions={line.points.map((point) => [point.latitude, point.longitude])}
          pathOptions={{
            color: groupColour(line.groupIndex),
            weight: line.road ? 4 : 3,
            opacity: line.road ? 0.85 : 0.6,
            // Dashed = straight-line guide, solid = the real road route.
            dashArray: line.road ? undefined : "6 6",
          }}
        />
      ))}
      {people.map((person) => (
        <CircleMarker
          key={person.id}
          center={[person.latitude, person.longitude]}
          radius={person.canDrive ? 9 : 7}
          pathOptions={{
            color: groupColour(person.groupIndex),
            fillColor: groupColour(person.groupIndex),
            fillOpacity: person.canDrive ? 0.9 : 0.5,
            weight: person.canDrive ? 3 : 1,
          }}
        >
          <Tooltip>
            {person.name} · {person.areaLabel}
            {person.canDrive ? " · 🚗 driver" : ""}
          </Tooltip>
        </CircleMarker>
      ))}
      <CircleMarker
        center={[venue.latitude, venue.longitude]}
        radius={11}
        pathOptions={{ color: "#111827", fillColor: "#facc15", fillOpacity: 1 }}
      >
        <Tooltip permanent direction="top">
          🎵 {venue.name}
        </Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
