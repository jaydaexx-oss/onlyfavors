import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import { companionProfiles, safespots } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

export type SupabaseCompanionRow = {
  id: string;
  display_name: string;
  city: string;
  service_area: string;
  activities: string[];
  languages: string[];
  hourly_rate: number;
  response_time: string;
  rating: number;
  review_count: number;
  verified: boolean;
  instant_book: boolean;
  biography?: string | null;
  boundaries?: string[];
  photo_url?: string | null;
};

export type SupabaseSafeSpotRow = {
  id: string;
  name: string;
  category: string;
  city: string;
  address_hint: string;
  open_late: boolean;
};

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = (s: unknown) => typeof s === "string" && s.includes("does not exist");
  return msg(e.message) || msg((e.cause as { message?: string } | undefined)?.message);
}

function mapProfile(row: typeof companionProfiles.$inferSelect): SupabaseCompanionRow {
  return {
    id: row.id,
    display_name: row.displayName,
    city: row.city,
    service_area: row.serviceArea,
    activities: row.activities ?? [],
    languages: row.languages ?? [],
    hourly_rate: row.hourlyRate,
    response_time: row.responseTime,
    rating: Number(row.rating ?? 0),
    review_count: row.reviewCount,
    verified: row.verified,
    instant_book: row.instantBook,
    biography: row.biography,
    boundaries: row.boundaries ?? [],
    photo_url: row.photoUrl,
  };
}

async function supabaseGet<T>(path: string): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const response = await fetch(`${url.replace(/\/$/, "")}${path}`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Supabase request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }

  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("supabase", path, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Supabase request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getApprovedCompanions(): Promise<SupabaseCompanionRow[]> {
  try {
    const rows = await db
      .select()
      .from(companionProfiles)
      .where(and(eq(companionProfiles.approved, true), eq(companionProfiles.paused, false)));
    return rows.map(mapProfile);
  } catch (err) {
    if (!isMissingTableError(err)) {
      // Fall through to REST if the local schema is empty/unusable.
    }
  }
  return supabaseGet<SupabaseCompanionRow[]>(
    "/rest/v1/companion_profiles?approved=eq.true&select=id,display_name,city,service_area,activities,languages,hourly_rate,response_time,rating,review_count,verified,instant_book,biography,boundaries,photo_url",
  );
}

export async function getApprovedCompanion(
  id: string,
): Promise<SupabaseCompanionRow[]> {
  try {
    const rows = await db
      .select()
      .from(companionProfiles)
      .where(
        and(
          eq(companionProfiles.id, id),
          eq(companionProfiles.approved, true),
          eq(companionProfiles.paused, false),
        ),
      );
    if (rows.length > 0) return rows.map(mapProfile);
  } catch (err) {
    if (!isMissingTableError(err)) {
      // continue
    }
  }
  return supabaseGet<SupabaseCompanionRow[]>(
    `/rest/v1/companion_profiles?id=eq.${encodeURIComponent(id)}&approved=eq.true&select=id,display_name,city,service_area,activities,languages,hourly_rate,response_time,rating,review_count,verified,instant_book,biography,boundaries,photo_url`,
  );
}

export async function getSafeSpots(city?: string): Promise<SupabaseSafeSpotRow[]> {
  try {
    const rows = await db.select().from(safespots).where(eq(safespots.active, true));
    const mapped = rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      city: row.city,
      address_hint: row.addressHint,
      open_late: row.openLate,
    }));
    if (!city) return mapped;
    const needle = city.toLowerCase();
    return mapped.filter((row) => row.city.toLowerCase().includes(needle));
  } catch (err) {
    if (!isMissingTableError(err)) {
      // continue
    }
  }
  const cityFilter = city ? `&city=ilike.*${encodeURIComponent(city)}*` : "";
  return supabaseGet<SupabaseSafeSpotRow[]>(
    `/rest/v1/safespots?active=eq.true${cityFilter}&select=id,name,category,city,address_hint,open_late`,
  );
}

export async function getSafeSpot(id: string): Promise<SupabaseSafeSpotRow[]> {
  try {
    const rows = await db
      .select()
      .from(safespots)
      .where(and(eq(safespots.id, id), eq(safespots.active, true)));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      city: row.city,
      address_hint: row.addressHint,
      open_late: row.openLate,
    }));
  } catch (err) {
    if (!isMissingTableError(err)) {
      // continue
    }
  }
  return supabaseGet<SupabaseSafeSpotRow[]>(
    `/rest/v1/safespots?id=eq.${encodeURIComponent(id)}&active=eq.true&select=id,name,category,city,address_hint,open_late`,
  );
}
