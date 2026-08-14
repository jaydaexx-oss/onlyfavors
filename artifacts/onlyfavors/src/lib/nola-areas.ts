/** Public neighborhood centers for New Orleans — never a home or live pin. */
export const NOLA_AREAS: Array<{ name: string; lat: number; lng: number }> = [
  { name: "French Quarter", lat: 29.9584, lng: -90.0644 },
  { name: "Marigny", lat: 29.9646, lng: -90.0577 },
  { name: "Bywater", lat: 29.9653, lng: -90.0306 },
  { name: "Garden District", lat: 29.928, lng: -90.084 },
  { name: "Uptown", lat: 29.934, lng: -90.112 },
  { name: "Warehouse District", lat: 29.943, lng: -90.067 },
  { name: "CBD", lat: 29.951, lng: -90.071 },
  { name: "Mid-City", lat: 29.972, lng: -90.096 },
  { name: "Treme", lat: 29.969, lng: -90.074 },
  { name: "Algiers", lat: 29.921, lng: -90.051 },
  { name: "Lakeview", lat: 30.006, lng: -90.108 },
  { name: "New Orleans", lat: 29.9511, lng: -90.0715 },
];

const NOLA_BOX = { south: 29.86, north: 30.08, west: -90.25, east: -89.86 };

export function isInNewOrleans(lat: number, lng: number): boolean {
  return lat >= NOLA_BOX.south && lat <= NOLA_BOX.north && lng >= NOLA_BOX.west && lng <= NOLA_BOX.east;
}

export function neighborhoodCenter(label: string): { name: string; lat: number; lng: number } {
  const raw = label.trim().toLowerCase();
  const fallback = NOLA_AREAS[NOLA_AREAS.length - 1];
  if (!raw) return fallback;
  const exact = NOLA_AREAS.find((a) => a.name.toLowerCase() === raw);
  if (exact) return exact;
  const contained = NOLA_AREAS.find((a) => raw.includes(a.name.toLowerCase()));
  if (contained) return contained;
  if (raw.length >= 4) {
    const partial = NOLA_AREAS.find((a) => a.name.toLowerCase().includes(raw));
    if (partial) return partial;
  }
  return fallback;
}

export function approxMiles(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Frozen Near Me cap — neighborhood centroids, never companion GPS. */
export const MAX_NEAR_ME_MILES = 15;
export const NEAR_ME_RADIUS_OPTIONS = [5, 10, 15] as const;
