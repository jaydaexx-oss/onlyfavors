import type { Request } from "express";
import { db } from "@workspace/db";
import { companionProfiles } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getActorId } from "./auth";

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = (s: unknown) => typeof s === "string" && s.includes("does not exist");
  return msg(e.message) || msg((e.cause as { message?: string } | undefined)?.message);
}

export async function resolveCompanionProfile(req: Request) {
  const accountId = getActorId(req, "companion");
  if (!accountId) return null;
  const isCompanion = req.user?.roles.includes("companion") || process.env.NODE_ENV === "development";
  if (!isCompanion) return null;
  try {
    const [row] = await db
      .select()
      .from(companionProfiles)
      .where(eq(companionProfiles.accountId, accountId))
      .limit(1);
    if (row) return row;
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
  return {
    id: accountId,
    accountId,
    displayName: "",
    city: "",
    serviceArea: "",
    activities: [] as string[],
    languages: [] as string[],
    hourlyRate: 0,
    dayRate: null as number | null,
    responseTime: "Usually within a day",
    rating: "0",
    reviewCount: 0,
    verified: false,
    approved: false,
    instantBook: false,
    paused: false,
    availableToday: false,
    biography: null as string | null,
    boundaries: [] as string[],
    photoUrl: null as string | null,
    stripeAccountId: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function resolveCompanionId(req: Request): Promise<string | null> {
  const profile = await resolveCompanionProfile(req);
  return profile?.id ?? null;
}
