/**
 * SafeSpotMap — mulberry map with mint verified-venue markers.
 *
 * Privacy rules enforced here:
 *  - Companions appear as fuzzy service-area CIRCLES, never as live pins.
 *  - SafeSpots appear as mint shield markers at their exact venue coordinates.
 *  - No companion home or work addresses are ever shown.
 */
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import type { Companion, SafeSpot } from '@workspace/api-client-react';

// --- Custom icons (divIcon avoids the Vite asset-URL issue with default Leaflet icons) ---

const safespotIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:32px;height:32px;
    background:linear-gradient(135deg,#3dbd8c,#2d9e75);
    border:2.5px solid #fff;
    border-radius:50% 50% 50% 4px;
    transform:rotate(-45deg);
    box-shadow:0 4px 14px rgba(0,0,0,.45);
    display:flex;align-items:center;justify-content:center;
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

// --- City fallback coordinates (used when Supabase rows don't have coordinates yet) ---
const CITY_COORDS: Record<string, [number, number]> = {
  'honolulu': [21.306, -157.858],
  'waikiki': [21.276, -157.826],
  'new york': [40.712, -74.006],
  'los angeles': [34.052, -118.244],
  'miami': [25.775, -80.208],
  'chicago': [41.878, -87.630],
  'san francisco': [37.774, -122.419],
  'seattle': [47.606, -122.332],
  'austin': [30.266, -97.750],
  'london': [51.505, -0.090],
  'paris': [48.856, 2.352],
  'tokyo': [35.676, 139.650],
  'sydney': [-33.868, 151.209],
};

function cityCoords(city: string): [number, number] | null {
  const key = city.toLowerCase();
  return CITY_COORDS[key] ?? null;
}

// Nudge companion circles slightly so overlapping cities spread out visually
function nudge(lat: number, lng: number, index: number): [number, number] {
  const angle = (index * 137.5 * Math.PI) / 180; // golden angle
  const r = 0.008 * (index % 3);
  return [lat + r * Math.cos(angle), lng + r * Math.sin(angle)];
}

// --- Map re-center helper ---
function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true, duration: 0.8 });
  }, [center, zoom, map]);
  return null;
}

// --- Props ---
interface Props {
  safeSpots?: SafeSpot[];
  companions?: Companion[];
  userCoords?: [number, number] | null;
  defaultCity?: string;
  height?: string;
}

export default function SafeSpotMap({
  safeSpots = [],
  companions = [],
  userCoords,
  defaultCity = 'honolulu',
  height = '520px',
}: Props) {
  const defaultCenter: [number, number] = userCoords ?? cityCoords(defaultCity) ?? [21.276, -157.826];
  const zoom = userCoords ? 13 : 12;

  return (
    <div
      className="relative overflow-hidden rounded-[22px] border border-[#4a2040] shadow-[0_20px_60px_rgba(63,10,45,.25)]"
      style={{ height }}
    >
      {/* Privacy badge */}
      <div className="absolute right-3 top-3 z-[500] flex items-center gap-1.5 rounded-full bg-[#3d2038]/90 px-3 py-1.5 text-[10px] font-bold text-[#df9cbd] backdrop-blur-sm">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3dbd8c]" />
        Privacy-safe view · no live pins
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%', background: '#1a0d17' }}
        zoomControl={false}
        scrollWheelZoom={false}
        attributionControl={false}
      >
        {/* Dark mulberry-tinted tiles */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          className="map-tiles-mulberry"
        />

        {/* Re-center when coords change */}
        <Recenter center={userCoords ?? defaultCenter} zoom={zoom} />

        {/* User location pin */}
        {userCoords && (
          <Marker position={userCoords} icon={userIcon}>
            <Popup className="of-popup">
              <p className="text-xs font-bold text-[#3d2038]">Your approximate location</p>
              <p className="text-[10px] text-[#725e69]">Shown to you only. Never shared.</p>
            </Popup>
          </Marker>
        )}

        {/* SafeSpot venue markers */}
        {safeSpots.map((spot) => {
          const lat = spot.latitude ?? cityCoords(spot.city)?.[0];
          const lng = spot.longitude ?? cityCoords(spot.city)?.[1];
          if (!lat || !lng) return null;
          return (
            <Marker key={spot.id} position={[lat, lng]} icon={safespotIcon}>
              <Popup className="of-popup">
                <p className="text-xs font-bold text-[#3d2038]">{spot.name}</p>
                <p className="text-[10px] text-[#725e69]">{spot.category} · {spot.addressHint}</p>
                {spot.openLate && (
                  <p className="mt-1 text-[10px] font-semibold text-[#3dbd8c]">Open late</p>
                )}
                <a
                  href={`/book?spot=${spot.id}`}
                  className="mt-2 inline-block text-[10px] font-bold text-[#7f2e62]"
                >
                  Use as meeting point →
                </a>
              </Popup>
            </Marker>
          );
        })}

        {/* Companion service-area circles — approximate only, never precise pins */}
        {companions.map((companion, i) => {
          const base = companion.latitude && companion.longitude
            ? [companion.latitude, companion.longitude] as [number, number]
            : cityCoords(companion.city);
          if (!base) return null;
          const pos = nudge(base[0], base[1], i);
          return (
            <Circle
              key={companion.id}
              center={pos}
              radius={4200}
              pathOptions={{
                fillColor: companion.availableNow ? '#3dbd8c' : '#7f2e62',
                fillOpacity: companion.availableNow ? 0.12 : 0.07,
                color: companion.availableNow ? '#3dbd8c' : '#9d557e',
                weight: 1.5,
                dashArray: companion.availableNow ? undefined : '5 5',
              }}
            >
              <Popup className="of-popup">
                <p className="text-xs font-bold text-[#3d2038]">{companion.displayName}</p>
                <p className="text-[10px] text-[#725e69]">{companion.serviceArea}</p>
                {companion.availableNow && (
                  <p className="mt-1 text-[10px] font-semibold text-[#3dbd8c]">Available now</p>
                )}
                <a
                  href={`/companions/${companion.id}`}
                  className="mt-2 inline-block text-[10px] font-bold text-[#7f2e62]"
                >
                  View profile →
                </a>
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[500] flex flex-col gap-1.5 rounded-[12px] bg-[#3d2038]/90 p-3 text-[10px] backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[#f9efe5]">
          <span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: '#3dbd8c' }} />
          Verified SafeSpot
        </div>
        <div className="flex items-center gap-2 text-[#d9c4cf]">
          <span className="h-3 w-3 rounded-full border border-dashed border-[#9d557e]" style={{ background: 'rgba(127,46,98,.15)' }} />
          Companion service area
        </div>
        <div className="flex items-center gap-2 text-[#3dbd8c]">
          <span className="h-3 w-3 rounded-full border border-[#3dbd8c]" style={{ background: 'rgba(61,189,140,.15)' }} />
          Available tonight
        </div>
      </div>
    </div>
  );
}
