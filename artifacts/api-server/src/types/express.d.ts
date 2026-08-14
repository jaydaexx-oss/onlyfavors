import type { AuthUser, SessionKind } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionKind?: SessionKind;
    }
  }
}

export {};
