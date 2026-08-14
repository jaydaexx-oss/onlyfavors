import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  accountRoles,
  accounts,
  companionApplications,
  companionProfiles,
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
/** Public customer/companion sessions. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Admin portal sessions — short, same identity, separate cookie lifetime. */
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

export type AccountRole = "customer" | "companion" | "admin";
export type AccountStatus = "active" | "suspended" | "banned" | "deactivated";
export type SessionKind = "login" | "admin";
export type CompanionApplicationStatus = "none" | "draft" | "pending" | "approved" | "rejected";

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
  /** How this session was issued. Admin APIs require kind `admin`. */
  sessionKind: SessionKind;
  /** True only after manual approval — pending providers stay out of search. */
  companionApproved: boolean;
  companionApplicationStatus: CompanionApplicationStatus;
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

function sessionKindFromToken(token: string): SessionKind {
  return token.startsWith("adm_") ? "admin" : "login";
}

function mintSessionToken(kind: SessionKind): string {
  const prefix = kind === "admin" ? "adm_" : "pub_";
  return `${prefix}${randomBytes(32).toString("hex")}`;
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

async function companionStatusForAccount(accountId: string): Promise<{
  companionApproved: boolean;
  companionApplicationStatus: CompanionApplicationStatus;
}> {
  try {
    const [listing] = await db
      .select({ approved: companionProfiles.approved })
      .from(companionProfiles)
      .where(eq(companionProfiles.accountId, accountId))
      .limit(1);
    const [app] = await db
      .select({ status: companionApplications.status })
      .from(companionApplications)
      .where(eq(companionApplications.accountId, accountId))
      .orderBy(desc(companionApplications.createdAt))
      .limit(1);
    const raw = app?.status ?? (listing ? "approved" : "none");
    const companionApplicationStatus: CompanionApplicationStatus =
      raw === "draft" || raw === "pending" || raw === "approved" || raw === "rejected"
        ? raw
        : "none";
    return {
      companionApproved: Boolean(listing?.approved),
      companionApplicationStatus,
    };
  } catch (err) {
    if (isMissingTableError(err)) {
      return { companionApproved: false, companionApplicationStatus: "none" };
    }
    throw err;
  }
}

export async function loadUserById(
  accountId: string,
  sessionKind: SessionKind = "login",
): Promise<AuthUser | null> {
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
    const companion = await companionStatusForAccount(account.id);
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
      sessionKind,
      ...companion,
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
    const sessionKind = sessionKindFromToken(token);
    req.sessionKind = sessionKind;
    const user = await loadUserById(session.accountId, sessionKind);
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

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (user.suspended || user.banned) {
    res.status(403).json({ error: user.banned ? "This account is banned" : "This account is suspended" });
    return;
  }
  if (!user.roles.includes("admin") || req.sessionKind !== "admin") {
    res.status(403).json({ error: "This workspace is restricted to trust staff" });
    return;
  }
  next();
}

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

  const bootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const isBootstrapAdmin = Boolean(bootstrap && bootstrap === email);

  if (!account) {
    if (purpose === "admin" && !isBootstrapAdmin) {
      throw Object.assign(new Error("This workspace is restricted to trust staff"), {
        status: 403,
      });
    }
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

  // Admin is never granted through public signup — only the admin portal,
  // and only for the manually configured bootstrap email or an existing admin role.
  if (purpose === "admin" && isBootstrapAdmin) {
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

  const sessionKind: SessionKind = purpose === "admin" ? "admin" : "login";
  if (sessionKind === "admin") {
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

  const ttl = sessionKind === "admin" ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;
  const token = mintSessionToken(sessionKind);
  await db.insert(sessions).values({
    accountId: account.id,
    tokenHash: hashSecret(token),
    expiresAt: new Date(Date.now() + ttl),
  });

  const user = await loadUserById(account.id, sessionKind);
  if (!user) {
    throw Object.assign(new Error("Could not load account"), { status: 500 });
  }
  if (sessionKind === "admin") {
    await writeAudit({
      actorId: account.id,
      action: "admin.session.create",
      subjectType: "account",
      subjectId: account.id,
      note: "admin portal sign-in",
    });
  }
  return { token, user, sessionKind, ttlMs: ttl };
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

export function setSessionCookie(res: Response, token: string, ttlMs = SESSION_TTL_MS): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlMs,
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
