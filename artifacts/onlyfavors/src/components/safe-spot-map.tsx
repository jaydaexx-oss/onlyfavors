/**
 * Neighborhood-level map for New Orleans.
 *
 * Privacy rules enforced here:
 *  - Companions appear as fuzzy service-area CIRCLES at shared neighborhood centers.
 *  - Never live GPS pins, homes, workplaces, or routes.
 *  - SafeSpots appear as mint shield markers at their venue coordinates.
 *  - The customer's own marker is shown only to them.
 */
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import type { Companion, SafeSpot } from '@workspace/api-client-react';
import { neighborhoodCenter } from '@/lib/nola-areas';

const NOLA_CENTER: [number, number] = [29.9511, -90.0715];

const safespotIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:32px;height:32px;
    background:linear-gradient(135deg,#3dbd8c,#2d9e75);
    border:2.5px solid #fff;
    border-radius:50% 50% 50% 4px;
    transform:rotate(-45deg);
    box-shadow:0 4px 14px rgba(0,0,0,.45);
    display:flex;align-items:center;justify-center;
  "><svg style="transform:rotate(45deg);width:14px;height:14px;fill:white" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.35C17.25 21.15 21 16.25 21 11V5L12 1z"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -36],
});

const userIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:18px;height:18px;
    background:#7f2e62;
    border:3px solid white;
    border-radius:50%;
    box-shadow:0 0 0 5px rgba(127,46,98,.25),0 3px 10px rgba(0,0,0,.4);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true, duration: 0.8 });
  }, [center, zoom, map]);
  return null;
}

type MapCompanion = Companion & {
  availabilityHint?: 'now' | 'tonight' | 'weekend' | null;
  approvedAreas?: string[];
};

interface Props {
  safeSpots?: SafeSpot[];
  companions?: MapCompanion[];
  userCoords?: [number, number] | null;
  height?: string;
}

export default function SafeSpotMap({
  safeSpots = [],
  companions = [],
  userCoords,
  height = '520px',
}: Props) {
  const defaultCenter: [number, number] = userCoords ?? NOLA_CENTER;
  const zoom = userCoords ? 13 : 12;

  const grouped = new Map<string, { lat: number; lng: number; name: string; people: MapCompanion[] }>();
  for (const companion of companions) {
    const labels = companion.approvedAreas?.length
      ? companion.approvedAreas
      : [companion.serviceArea || companion.city];
    for (const label of labels) {
      const area = neighborhoodCenter(label);
      const existing = grouped.get(area.name);
      if (existing) {
        if (!existing.people.some((person) => person.id === companion.id)) existing.people.push(companion);
      } else grouped.set(area.name, { lat: area.lat, lng: area.lng, name: area.name, people: [companion] });
    }
  }

  return (
    <div
      className="relative overflow-hidden rounded-[22px] border border-[#4a2040] shadow-[0_20px_60px_rgba(63,10,45,.25)]"
      style={{ height }}
    >
      <div className="absolute right-3 top-3 z-[500] flex items-center gap-1.5 rounded-full bg-[#3d2038]/90 px-3 py-1.5 text-[10px] font-bold text-[#df9cbd] backdrop-blur-sm">
        Neighborhood view · no live pins
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%', background: '#1a0d17' }}
        zoomControl={false}
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          className="map-tiles-mulberry"
        />

        <Recenter center={userCoords ?? defaultCenter} zoom={zoom} />

        {userCoords && (
          <Marker position={userCoords} icon={userIcon}>
            <Popup className="of-popup">
              <p className="text-xs font-bold text-[#3d2038]">Your approximate location</p>
              <p className="text-[10px] text-[#725e69]">Shown to you only. Never stored or shared.</p>
            </Popup>
          </Marker>
        )}

        {safeSpots.map((spot) => {
          const lat = spot.latitude;
          const lng = spot.longitude;
          if (typeof lat !== 'number' || typeof lng !== 'number') return null;
          return (
            <Marker key={spot.id} position={[lat, lng]} icon={safespotIcon}>
              <Popup className="of-popup">
                <p className="text-xs font-bold text-[#3d2038]">{spot.name}</p>
                <p className="text-[10px] text-[#725e69]">{spot.category} · {spot.addressHint}</p>
                {spot.openLate && (
                  <p className="mt-1 text-[10px] font-semibold text-[#3dbd8c]">Open late</p>
                )}
              </Popup>
            </Marker>
          );
        })}

        {[...grouped.values()].map((area) => {
          const evening = area.people.some((c) => c.availabilityHint === 'now' || c.availabilityHint === 'tonight' || c.availableNow);
          return (
            <Circle
              key={area.name}
              center={[area.lat, area.lng]}
              radius={1800}
              pathOptions={{
                fillColor: evening ? '#3dbd8c' : '#7f2e62',
                fillOpacity: evening ? 0.14 : 0.08,
                color: evening ? '#3dbd8c' : '#9d557e',
                weight: 1.5,
                dashArray: evening ? undefined : '5 5',
              }}
            >
              <Popup className="of-popup">
                <p className="text-xs font-bold text-[#3d2038]">{area.name}</p>
                <p className="text-[10px] text-[#725e69]">
                  {area.people.length} companion{area.people.length === 1 ? '' : 's'} in this neighborhood
                </p>
                <ul className="mt-2 space-y-1">
                  {area.people.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <a href={`/companions/${c.id}`} className="text-[10px] font-bold text-[#7f2e62]">
                        {c.displayName} →
                      </a>
                    </li>
                  ))}
                </ul>
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>

      <div className="absolute bottom-3 left-3 z-[500] flex flex-col gap-1.5 rounded-[12px] bg-[#3d2038]/90 p-3 text-[10px] backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[#f9efe5]">
          <span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: '#3dbd8c' }} />
          Approved meeting venue
        </div>
        <div className="flex items-center gap-2 text-[#d9c4cf]">
          <span className="h-3 w-3 rounded-full border border-dashed border-[#9d557e]" style={{ background: 'rgba(127,46,98,.15)' }} />
          Neighborhood service area
        </div>
      </div>
    </div>
  );
}
