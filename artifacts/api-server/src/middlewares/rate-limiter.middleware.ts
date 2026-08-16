import type { Request, Response, NextFunction } from "express";

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const ipMap = new Map<string, RateLimitStore>();

// Clean up expired entries every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipMap.entries()) {
    if (now > record.resetTime) {
      ipMap.delete(ip);
    }
  }
}, 10 * 60 * 1000);

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * Creates an in-memory rate limiter middleware.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = "تم تجاوز عدد المحاولات المسموح بها. يرجى الانتظار والمحاولة لاحقاً." } = options;

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
    const now = Date.now();

    const record = ipMap.get(clientIp);

    if (!record || now > record.resetTime) {
      ipMap.set(clientIp, { count: 1, resetTime: now + windowMs });
      return next();
    }

    record.count += 1;

    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ error: message, retryAfterSeconds });
      return;
    }

    next();
  };
}

/** Rate limiter specifically for login attempts: max 10 attempts per 3 minutes */
export const loginRateLimiter = createRateLimiter({
  windowMs: 3 * 60 * 1000,
  max: 10,
  message: "تم تجاوز عدد محاولات الدخول الخاطئة. يرجى المحاولة بعد 3 دقائق.",
});

/** Rate limiter for admin login: max 10 attempts per 5 minutes */
export const adminLoginRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "تم تجاوز عدد محاولات دخول المشرف. يرجى المحاولة بعد 5 دقائق.",
});
