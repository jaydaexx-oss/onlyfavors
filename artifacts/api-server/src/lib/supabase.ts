import { ReplitConnectors } from "@replit/connectors-sdk";

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

async function supabaseGet<T>(path: string): Promise<T> {
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("supabase", path, { method: "GET" });

  if (!response.ok) {
    throw new Error(`Supabase request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getApprovedCompanions(): Promise<SupabaseCompanionRow[]> {
  return supabaseGet<SupabaseCompanionRow[]>(
    "/rest/v1/companion_profiles?approved=eq.true&select=id,display_name,city,service_area,activities,languages,hourly_rate,response_time,rating,review_count,verified,instant_book,biography,boundaries,photo_url",
  );
}

export function getApprovedCompanion(
  id: string,
): Promise<SupabaseCompanionRow[]> {
  return supabaseGet<SupabaseCompanionRow[]>(
    `/rest/v1/companion_profiles?id=eq.${encodeURIComponent(id)}&approved=eq.true&select=id,display_name,city,service_area,activities,languages,hourly_rate,response_time,rating,review_count,verified,instant_book,biography,boundaries,photo_url`,
  );
}

export function getSafeSpots(city?: string): Promise<SupabaseSafeSpotRow[]> {
  const cityFilter = city
    ? `&city=ilike.*${encodeURIComponent(city)}*`
    : "";
  return supabaseGet<SupabaseSafeSpotRow[]>(
    `/rest/v1/safespots?active=eq.true${cityFilter}&select=id,name,category,city,address_hint,open_late`,
  );
}