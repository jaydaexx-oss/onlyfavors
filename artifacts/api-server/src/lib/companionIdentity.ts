import type { Request } from "express";
import { db } from "@workspace/db";
import { companionProfiles } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = (s: unknown) => typeof s === "string" && s.includes("does not exist");
  return msg(e.message) || msg((e.cause as { message?: string } | undefined)?.message);
}

export function isCompanionUser(req: Request): boolean {
  return Boolean(
    req.user?.id &&
      req.user.status === "active" &&
      req.user.roles.includes("companion") &&
      req.user.companionApproved,
  );
}

export async function resolveCompanionProfile(req: Request) {
  if (!isCompanionUser(req)) return null;
  const accountId = req.user!.id;
  try {
    const [row] = await db
      .select()
      .from(companionProfiles)
      .where(eq(companionProfiles.accountId, accountId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

export async function resolveCompanionId(req: Request): Promise<string | null> {
  const profile = await resolveCompanionProfile(req);
  return profile?.id ?? null;
}
