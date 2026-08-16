import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export interface SessionCookiePayload {
  username: string;
  userId?: string;
  role?: string;
  displayName?: string;
  issuedAt: number;
}

const SESSION_COOKIE_NAME = "court_session_auth";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function setSessionCookie(
  res: Response,
  userData: string | { username: string; userId?: string; role?: string; displayName?: string },
): void {
  const payload: SessionCookiePayload =
    typeof userData === "string"
      ? { username: userData, issuedAt: Date.now(), role: "admin" }
      : {
          username: userData.username,
          userId: userData.userId,
          role: userData.role || "staff",
          displayName: userData.displayName,
          issuedAt: Date.now(),
        };

  res.cookie(SESSION_COOKIE_NAME, JSON.stringify(payload), {
    httpOnly: true,
    sameSite: "strict",
    secure: env.isProduction,
    signed: true,
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

function readSessionCookie(req: Request): SessionCookiePayload | null {
  const raw = req.signedCookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SessionCookiePayload;
    if (
      typeof parsed.username !== "string" ||
      typeof parsed.issuedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.issuedAt > SESSION_MAX_AGE_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

declare global {
  namespace Express {
    interface Request {
      authUser?: SessionCookiePayload;
    }
  }
}

/** Populates `req.authUser` when a valid session cookie is present, without rejecting the request. */
export function attachAuthUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const session = readSessionCookie(req);
  if (session) {
    req.authUser = session;
  }
  next();
}

/** Rejects the request with 401 unless a valid session cookie is present. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.authUser) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}
