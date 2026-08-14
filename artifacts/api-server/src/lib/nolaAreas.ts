/** Public New Orleans neighborhoods — never a home, workplace, or live pin. */
export const NOLA_AREA_LABELS = [
  "French Quarter",
  "Marigny",
  "Bywater",
  "Garden District",
  "Uptown",
  "Warehouse District",
  "CBD",
  "Mid-City",
  "Treme",
  "Algiers",
  "Lakeview",
  "New Orleans",
] as const;

/** Frozen service circle: about 15 miles around a neighborhood center. */
export const SERVICE_RADIUS_KM = 24;

const NOLA_AREA_CENTERS: Record<(typeof NOLA_AREA_LABELS)[number], { lat: number; lng: number }> = {
  "French Quarter": { lat: 29.9584, lng: -90.0644 },
  Marigny: { lat: 29.9646, lng: -90.0577 },
  Bywater: { lat: 29.9653, lng: -90.0306 },
  "Garden District": { lat: 29.928, lng: -90.084 },
  Uptown: { lat: 29.934, lng: -90.112 },
  "Warehouse District": { lat: 29.943, lng: -90.067 },
  CBD: { lat: 29.951, lng: -90.071 },
  "Mid-City": { lat: 29.972, lng: -90.096 },
  Treme: { lat: 29.969, lng: -90.074 },
  Algiers: { lat: 29.921, lng: -90.051 },
  Lakeview: { lat: 30.006, lng: -90.108 },
  "New Orleans": { lat: 29.9511, lng: -90.0715 },
};

/** Public neighborhood center only — never a home, workplace, or live pin. */
export function neighborhoodCenter(label: string): { name: string; lat: number; lng: number } {
  const raw = label.trim().toLowerCase();
  const fallback = { name: "New Orleans" as const, ...NOLA_AREA_CENTERS["New Orleans"] };
  if (!raw) return fallback;
  const exact = NOLA_AREA_LABELS.find((name) => name.toLowerCase() === raw);
  if (exact) return { name: exact, ...NOLA_AREA_CENTERS[exact] };
  const contained = NOLA_AREA_LABELS.find((name) => raw.includes(name.toLowerCase()));
  if (contained) return { name: contained, ...NOLA_AREA_CENTERS[contained] };
  return fallback;
}

export function normalizeApprovedAreas(raw: unknown, fallback = ""): string[] {
  const byLabel = new Map(NOLA_AREA_LABELS.map((label) => [label.toLowerCase(), label]));
  const incoming = Array.isArray(raw) ? raw.map((item) => String(item)) : [];
  const out: string[] = [];
  for (const item of incoming) {
    const canonical = byLabel.get(item.trim().toLowerCase());
    if (canonical && !out.includes(canonical)) out.push(canonical);
  }
  if (!out.length && fallback.trim()) {
    const hay = fallback.toLowerCase();
    for (const label of NOLA_AREA_LABELS) {
      if (hay.includes(label.toLowerCase()) && !out.includes(label)) out.push(label);
    }
  }
  return out.slice(0, 8);
}
