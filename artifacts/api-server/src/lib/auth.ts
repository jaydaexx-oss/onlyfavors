import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  accountRoles,
  accounts,
  db,
  otpChallenges,
  sessions,
  adminAuditLog,
} from "@workspace/db";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { lifecycleOf } from "./accountState";

export const SESSION_COOKIE = "of_session";
const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

export type AccountRole = "customer" | "companion" | "admin";
export type AccountStatus = "active" | "suspended" | "banned" | "deactivated";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  roles: AccountRole[];
  ageConfirmed: boolean;
  status: AccountStatus;
  suspended: boolean;
  banned: boolean;
  deactivated: boolean;
  riskLevel: string;
};

function pepper(): string {
  const value = process.env.AUTH_PEPPER;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_PEPPER must be set to a long secret in production");
  }
  return "onlyfavors-dev-pepper-not-for-production";
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(`${pepper()}:${value}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateOtp(): string {
  const n = randomBytes(4).readUInt32BE(0) % 100_000_000;
  return n.toString().padStart(8, "0");
}

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = (s: unknown) => typeof s === "string" && s.includes("does not exist");
  return msg(e.message) || msg((e.cause as { message?: string } | undefined)?.message);
}

export function getActorId(
  req: Request,
  _fallbackRole?: "customer" | "companion",
): string | null {
  if (req.user?.id) {
    if (req.user.status === "suspended" || req.user.status === "banned") return null;
    return req.user.id;
  }
  return null;
}

export async function loadUserById(accountId: string): Promise<AuthUser | null> {
  try {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    if (!account || account.deletedAt) return null;
    const life = lifecycleOf(account);
    if (life === "deleted") return null;
    const roles = await db
      .select()
      .from(accountRoles)
      .where(eq(accountRoles.accountId, account.id));
    return {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      roles: roles.map((r) => r.role as AccountRole),
      ageConfirmed: Boolean(account.ageConfirmedAt),
      status: life,
      suspended: life === "suspended",
      banned: life === "banned",
      deactivated: life === "deactivated",
      riskLevel: account.riskLevel,
    };
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    const bearer =
      typeof header === "string" && header.startsWith("Bearer ")
        ? header.slice(7).trim()
        : "";
    const token =
      (typeof req.cookies?.[SESSION_COOKIE] === "string"
        ? req.cookies[SESSION_COOKIE]
        : "") || bearer;
    if (!token) {
      next();
      return;
    }
    const tokenHash = hashSecret(token);
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!session) {
      next();
      return;
    }
    const user = await loadUserById(session.accountId);
    if (user) req.user = user;
  } catch (err) {
    if (!isMissingTableError(err)) {
      logger.warn({ err }, "Session lookup failed");
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const id = getActorId(req);
  if (!id || (req.user && (req.user.status === "suspended" || req.user.status === "banned"))) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export function requireRole(...roles: AccountRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (user.suspended || user.banned) {
      res.status(403).json({ error: user.banned ? "This account is banned" : "This account is suspended" });
      return;
    }
    if (!roles.some((role) => user.roles.includes(role))) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole("admin");

async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM_EMAIL ?? "OnlyFavors <noreply@onlyfavors.app>";
  if (!key) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your OnlyFavors sign-in code",
      text: `Your OnlyFavors code is ${code}. It expires in 10 minutes. If you did not request this, ignore the email.`,
    }),
  });
  return response.ok;
}

export async function requestOtp(emailRaw: string, purpose = "login") {
  const email = normalizeEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Enter a valid email address"), { status: 400 });
  }
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_PEPPER) {
    throw Object.assign(new Error("Sign-in is temporarily unavailable"), {
      status: 503,
    });
  }

  const code = generateOtp();
  await db.insert(otpChallenges).values({
    email,
    codeHash: hashSecret(`${email}:${code}`),
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  const emailed = await sendOtpEmail(email, code);
  const payload: { sent: true; email: string; devCode?: string } = {
    sent: true,
    email,
  };
  if (!emailed && process.env.NODE_ENV !== "production") {
    payload.devCode = code;
    logger.info({ email }, "OTP issued for development (not emailed)");
  } else if (!emailed && process.env.NODE_ENV === "production") {
    throw Object.assign(
      new Error("Email delivery is not configured. Set RESEND_API_KEY."),
      { status: 503 },
    );
  }
  return payload;
}

export async function verifyOtp(emailRaw: string, codeRaw: string, purpose = "login") {
  const email = normalizeEmail(emailRaw);
  const code = codeRaw.replace(/\D/g, "");
  if (code.length !== 8) {
    throw Object.assign(new Error("Enter the 8-digit code"), { status: 400 });
  }

  const [challenge] = await db
    .select()
    .from(otpChallenges)
    .where(
      and(
        eq(otpChallenges.email, email),
        eq(otpChallenges.purpose, purpose),
        isNull(otpChallenges.consumedAt),
        gt(otpChallenges.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);

  if (!challenge) {
    throw Object.assign(new Error("That code has expired. Request a new one."), {
      status: 401,
    });
  }
  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    throw Object.assign(new Error("Too many attempts. Request a new code."), {
      status: 429,
    });
  }

  const incoming = hashSecret(`${email}:${code}`);
  if (!safeEqualHex(incoming, challenge.codeHash)) {
    await db
      .update(otpChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(otpChallenges.id, challenge.id));
    throw Object.assign(new Error("That code is not correct"), { status: 401 });
  }

  await db
    .update(otpChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(otpChallenges.id, challenge.id));

  let [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.email, email))
    .limit(1);

  if (!account) {
    const [created] = await db
      .insert(accounts)
      .values({ email })
      .returning();
    account = created;
    await db.insert(accountRoles).values({
      accountId: account.id,
      role: "customer",
      grantedBy: "system:signup",
    });
  }

  if (account.deletedAt) {
    throw Object.assign(new Error("This account was deleted"), { status: 403 });
  }
  if (account.bannedAt) {
    throw Object.assign(new Error("This account is banned"), { status: 403 });
  }
  if (account.suspendedAt) {
    throw Object.assign(new Error("This account is suspended"), { status: 403 });
  }

  const bootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (bootstrap && bootstrap === email) {
    const existing = await db
      .select()
      .from(accountRoles)
      .where(
        and(eq(accountRoles.accountId, account.id), eq(accountRoles.role, "admin")),
      );
    if (existing.length === 0) {
      await db.insert(accountRoles).values({
        accountId: account.id,
        role: "admin",
        grantedBy: "system:bootstrap",
      });
      await writeAudit({
        actorId: account.id,
        action: "role.grant",
        subjectType: "account",
        subjectId: account.id,
        note: "admin bootstrap",
      });
    }
  }

  if (purpose === "admin") {
    const roles = await db
      .select()
      .from(accountRoles)
      .where(eq(accountRoles.accountId, account.id));
    if (!roles.some((r) => r.role === "admin")) {
      throw Object.assign(new Error("This workspace is restricted to trust staff"), {
        status: 403,
      });
    }
  }

  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    accountId: account.id,
    tokenHash: hashSecret(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  const user = await loadUserById(account.id);
  if (!user) {
    throw Object.assign(new Error("Could not load account"), { status: 500 });
  }
  return { token, user };
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashSecret(token)));
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
}

export async function revokeAllSessions(accountId: string): Promise<void> {
  try {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt)));
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function writeAudit(input: {
  actorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  note?: string;
}): Promise<void> {
  try {
    await db.insert(adminAuditLog).values(input);
  } catch (err) {
    if (!isMissingTableError(err)) {
      logger.error({ err }, "Failed to write admin audit log");
    }
  }
}

export async function confirmAge(accountId: string): Promise<void> {
  await db
    .update(accounts)
    .set({ ageConfirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(accounts.id, accountId));
}
