import { Router, type IRouter } from "express";
import {
  confirmAge,
  clearSessionCookie,
  requestOtp,
  revokeSession,
  SESSION_COOKIE,
  setSessionCookie,
  verifyOtp,
} from "../lib/auth";
import { clientKey, rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

function readError(err: unknown): { status: number; message: string } {
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: number }).status) || 500
      : 500;
  const message = err instanceof Error ? err.message : "Unexpected error";
  return { status, message };
}

router.post("/auth/otp/request", async (req, res) => {
  const email = String(req.body?.email ?? "");
  const purpose = req.body?.purpose === "admin" ? "admin" : "login";
  const limited = rateLimit(clientKey(req.ip, `otp:${email.toLowerCase()}`), 5, 15 * 60_000);
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfterSec));
    res.status(429).json({ error: "Too many code requests. Try again shortly." });
    return;
  }
  try {
    const result = await requestOtp(email, purpose);
    res.json(result);
  } catch (err) {
    const { status, message } = readError(err);
    res.status(status).json({ error: message });
  }
});

router.post("/auth/otp/verify", async (req, res) => {
  const email = String(req.body?.email ?? "");
  const code = String(req.body?.code ?? "");
  const purpose = req.body?.purpose === "admin" ? "admin" : "login";
  const limited = rateLimit(clientKey(req.ip, `otp-verify:${email.toLowerCase()}`), 10, 15 * 60_000);
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfterSec));
    res.status(429).json({ error: "Too many attempts. Request a new code." });
    return;
  }
  try {
    const { token, user } = await verifyOtp(email, code, purpose);
    setSessionCookie(res, token);
    res.json({ user });
  } catch (err) {
    const { status, message } = readError(err);
    res.status(status).json({ error: message });
  }
});

router.get("/auth/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({ user: req.user });
});

router.post("/auth/logout", async (req, res) => {
  const token =
    typeof req.cookies?.[SESSION_COOKIE] === "string"
      ? req.cookies[SESSION_COOKIE]
      : undefined;
  await revokeSession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post("/auth/confirm-age", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const confirmed = Boolean(req.body?.confirmed);
  if (!confirmed) {
    res.status(400).json({ error: "You must confirm you are 18 or older" });
    return;
  }
  await confirmAge(req.user.id);
  res.json({ ok: true, ageConfirmed: true });
});

export default router;
