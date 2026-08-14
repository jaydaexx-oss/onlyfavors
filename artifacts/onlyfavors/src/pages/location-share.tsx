/**
 * Expiring Trust Circle / emergency map.
 * Shows the agreed public venue, never a live companion pin or a home address.
 */
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, Popup, Circle, TileLayer } from 'react-leaflet';
import { Link, useParams } from 'wouter';
import { neighborhoodCenter } from '@/lib/nola-areas';

type SharePayload = {
  purpose: 'trust_circle' | 'walk' | 'emergency';
  firstName: string;
  activity: string;
  venue: { name: string; hint: string; area?: { name: string; lat: number; lng: number } } | null;
  lastCheckIn: { lat: number; lng: number; live: boolean } | null;
  expiresAt: string;
  livePin: boolean;
};

const NOLA_CENTER: [number, number] = [29.9511, -90.0715];

const venueIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:32px;height:32px;
    background:linear-gradient(135deg,#3dbd8c,#2d9e75);
    border:2.5px solid #fff;
    border-radius:50% 50% 50% 4px;
    transform:rotate(-45deg);
    box-shadow:0 4px 14px rgba(0,0,0,.45);
  "></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -36],
});

const checkInIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:18px;height:18px;
    background:#c45b8f;
    border:3px solid white;
    border-radius:50%;
    box-shadow:0 0 0 5px rgba(196,91,143,.25);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function LocationShare() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharePayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('This link is not available.'); return; }
    fetch(`/api/safety/share/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({})) as { error?: string } & Partial<SharePayload>;
        if (!res.ok) throw new Error(body.error ?? 'This link has expired or was stopped.');
        return body as SharePayload;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'This link is not available.'));
  }, [token]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#1f0c1b] px-6 text-[#f9efe5]">
        <div className="max-w-sm text-center">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#c695ae]">Safety map</p>
          <h1 className="mt-3 font-serif text-3xl">This link is closed.</h1>
          <p className="mt-3 text-sm leading-6 text-[#d9c4cf]">{error}</p>
          <p className="mt-4 text-xs leading-5 text-[#9d7e8e]">
            If this is an emergency, call 911 first. OnlyFavors maps expire after the booking and never show a live companion pin.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#1f0c1b] text-[#f9efe5]">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#c695ae]">Opening safety map…</p>
      </div>
    );
  }

  const area = data.venue?.area ?? (data.venue ? neighborhoodCenter(data.venue.hint || data.venue.name) : null);
  const emergencyPin = data.purpose === 'emergency' && data.lastCheckIn && !data.lastCheckIn.live
    ? data.lastCheckIn
    : null;
  const center: [number, number] = emergencyPin
    ? [emergencyPin.lat, emergencyPin.lng]
    : area
      ? [area.lat, area.lng]
      : NOLA_CENTER;
  const expires = new Date(data.expiresAt);
  const purposeLabel = data.purpose === 'emergency'
    ? 'Emergency share'
    : data.purpose === 'walk'
      ? 'Walk-me-there map'
      : 'Trust Circle map';

  return (
    <div className="min-h-screen bg-[#1f0c1b] text-[#f9efe5]">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 py-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#c695ae]">{purposeLabel}</p>
          <h1 className="mt-1 font-serif text-2xl">{data.firstName}'s public meeting place</h1>
        </div>
        <span className="rounded-full bg-[#3dbd8c]/15 px-3 py-1 text-[10px] font-bold text-[#3dbd8c]">Not a live pin</span>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-5 pb-10">
        <div className="overflow-hidden rounded-[22px] border border-[#4a2040]">
          <MapContainer
            center={center}
            zoom={emergencyPin ? 15 : 13}
            style={{ height: 360, width: '100%', background: '#1a0d17' }}
            zoomControl={false}
            scrollWheelZoom={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            {area && (
              <Circle
                center={[area.lat, area.lng]}
                radius={900}
                pathOptions={{ fillColor: '#3dbd8c', fillOpacity: 0.16, color: '#3dbd8c', weight: 1.5 }}
              />
            )}
            {area && data.venue && (
              <Marker position={[area.lat, area.lng]} icon={venueIcon}>
                <Popup>
                  <p className="text-xs font-bold text-[#3d2038]">{data.venue.name}</p>
                  <p className="text-[10px] text-[#725e69]">{data.venue.hint}</p>
                  <p className="mt-1 text-[10px] font-semibold text-[#3dbd8c]">Agreed public SafeSpot</p>
                </Popup>
              </Marker>
            )}
            {emergencyPin && (
              <Marker position={[emergencyPin.lat, emergencyPin.lng]} icon={checkInIcon}>
                <Popup>
                  <p className="text-xs font-bold text-[#3d2038]">Last check-in</p>
                  <p className="text-[10px] text-[#725e69]">A stored point — not live tracking, not a route.</p>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        {data.venue ? (
          <div className="rounded-[20px] bg-[#2d1228] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Meet here</p>
            <p className="mt-2 font-bold">{data.venue.name}</p>
            <p className="mt-1 text-xs text-[#d9c4cf]">{data.venue.hint}</p>
            {data.activity && <p className="mt-3 text-[10px] text-[#9d7e8e]">{data.activity}</p>}
          </div>
        ) : (
          <div className="rounded-[20px] bg-[#2d1228] p-5">
            <p className="text-sm text-[#d9c4cf]">The agreed public venue is shown after both people confirm the booking. No home or work address is ever listed here.</p>
          </div>
        )}

        <p className="text-[11px] leading-5 text-[#9d7e8e]">
          This map expires {Number.isNaN(expires.getTime()) ? 'after the booking' : expires.toLocaleString()}.
          Companions are never shown as live pins. Precise location is not used for advertising.
          If someone may be in danger, call 911 first.
        </p>
        <Link href="/safety" className="inline-block text-xs font-bold text-[#df9cbd] underline">
          OnlyFavors safety notes
        </Link>
      </main>
    </div>
  );
}
