"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLng } from "../domain/geo";

const COLOMBO: LatLng = { latitude: 6.9, longitude: 79.87 };

function ClickHandler({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

/** Small OpenStreetMap map: click to drop an approximate home pin. */
export default function PinPicker({ value, onChange }: { value: LatLng | null; onChange: (point: LatLng) => void }) {
  const centre = value ?? COLOMBO;
  return (
    <MapContainer
      center={[centre.latitude, centre.longitude]}
      zoom={value ? 13 : 11}
      className="h-56 w-full"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onChange} />
      {value ? (
        <CircleMarker
          center={[value.latitude, value.longitude]}
          radius={9}
          pathOptions={{ color: "#6d28d9", fillOpacity: 0.6 }}
        />
      ) : null}
    </MapContainer>
  );
}
