import type { Request, Response } from "express";

export type AccountLifecycle = "active" | "suspended" | "banned" | "deactivated";

export function lifecycleOf(account: {
  deletedAt?: Date | null;
  bannedAt?: Date | null;
  suspendedAt?: Date | null;
  deactivatedAt?: Date | null;
}): AccountLifecycle | "deleted" {
  if (account.deletedAt) return "deleted";
  if (account.bannedAt) return "banned";
  if (account.suspendedAt) return "suspended";
  if (account.deactivatedAt) return "deactivated";
  return "active";
}

/** Booking, pay, accept, and Favor Requests require an active adult account. */
export function assertCanTransact(req: Request, res: Response): boolean {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  if (user.status === "banned") {
    res.status(403).json({ error: "This account is banned." });
    return false;
  }
  if (user.status === "suspended") {
    res.status(403).json({ error: "This account is suspended." });
    return false;
  }
  if (user.status === "deactivated") {
    res.status(403).json({ error: "This account is deactivated. Reactivate it in settings to continue." });
    return false;
  }
  if (!user.ageConfirmed) {
    res.status(403).json({ error: "Confirm you are 18 or older before booking or sending a request." });
    return false;
  }
  return true;
}
