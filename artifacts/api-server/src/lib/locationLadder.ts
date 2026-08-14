import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { exactLocations, locationShareLinks, trustedContacts } from "@workspace/db/schema";

export const LOCATION_RETENTION_MS = 24 * 60 * 60 * 1000;
export const VENUE_REVEAL_STATUSES = new Set(["confirmed", "authorized"]);
export const SHARING_STATUSES = new Set(["confirmed", "authorized"]);

export function venueRevealed(status: string): boolean {
  return VENUE_REVEAL_STATUSES.has(status);
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function purgeExpiredLocations(now = new Date()) {
  try {
    await db.delete(exactLocations).where(lt(exactLocations.expiresAt, now));
    await db
      .update(locationShareLinks)
      .set({ revokedAt: now })
      .where(and(isNull(locationShareLinks.revokedAt), lt(locationShareLinks.expiresAt, now)));
  } catch {
    /* table may not exist yet */
  }
}

export async function stopOrdinarySharing(bookingId: string) {
  const now = new Date();
  try {
    await db.update(exactLocations).set({ sharing: false }).where(eq(exactLocations.bookingId, bookingId));
    await db
      .update(locationShareLinks)
      .set({ revokedAt: now })
      .where(
        and(
          eq(locationShareLinks.bookingId, bookingId),
          isNull(locationShareLinks.revokedAt),
          or(eq(locationShareLinks.purpose, "trust_circle"), eq(locationShareLinks.purpose, "walk")),
        ),
      );
  } catch {
    /* table may not exist yet */
  }
}

async function sendSafetyEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM_EMAIL ?? "OnlyFavors <noreply@onlyfavors.app>";
  if (!key) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  return response.ok;
}

export async function notifyTrustCircle(accountId: string, payload: { title: string; body: string; href?: string }) {
  const contacts = await db.select().from(trustedContacts).where(eq(trustedContacts.accountId, accountId));
  if (!contacts.length) {
    return { notified: 0, attempted: 0, reason: "No Trust Circle contacts yet." };
  }
  let notified = 0;
  const failures: string[] = [];
  for (const contact of contacts) {
    const email = contact.email?.trim();
    if (email) {
      const sent = await sendSafetyEmail(
        email,
        payload.title,
        `${payload.body}${payload.href ? `\n\n${payload.href}` : ""}\n\nThis is a safety notice from OnlyFavors. It does not include a companion name or a live map pin.`,
      );
      if (sent) notified += 1;
      else failures.push(`${contact.name}: email could not be sent`);
    } else if (contact.phone) {
      failures.push(`${contact.name}: SMS is not configured`);
    } else {
      failures.push(`${contact.name}: no email or phone`);
    }
  }
  const reason = notified
    ? undefined
    : process.env.TWILIO_AUTH_TOKEN
      ? "SMS sending is not wired yet. Add an email to a Trust Circle contact, or call 911 if this is an emergency."
      : "SMS is not configured. Add an email to a Trust Circle contact, or call 911 if this is an emergency.";
  return {
    notified,
    attempted: contacts.length,
    reason: notified ? failures[0] : reason,
    failures,
  };
}
