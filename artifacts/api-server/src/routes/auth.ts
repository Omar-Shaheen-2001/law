import { Router, type IRouter } from "express";
import { LoginBody } from "@workspace/api-zod";
import { env, isAuthConfigured, isSupabaseConfigured } from "../config/env";
import { logger } from "../lib/logger";
import {
  attachAuthUser,
  clearSessionCookie,
  requireAuth,
  requireAdmin,
  setSessionCookie,
} from "../middlewares/auth.middleware";
import { loginRateLimiter } from "../middlewares/rate-limiter.middleware";
import { verifySupabaseUser, ensureDefaultAdmin } from "../services/supabase.service";

const router: IRouter = Router();

router.post("/auth/login", loginRateLimiter, attachAuthUser, async (req, res) => {
  if (!isAuthConfigured()) {
    res.status(500).json({
      error: "Login is not configured yet. Set APP_USERNAME and APP_PASSWORD.",
    });
    return;
  }

  const parseResult = LoginBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان." });
    return;
  }

  const { username, password } = parseResult.data;

  // 1. If Supabase is configured, authenticate via Supabase app_users table
  if (isSupabaseConfigured()) {
    try {
      await ensureDefaultAdmin();
      const supabaseUser = await verifySupabaseUser(username, password);
      if (supabaseUser) {
        setSessionCookie(res, {
          username: supabaseUser.username,
          userId: supabaseUser.id,
          role: supabaseUser.role,
          displayName: supabaseUser.display_name || supabaseUser.username,
        });

        res.json({
          username: supabaseUser.username,
          role: supabaseUser.role,
          displayName: supabaseUser.display_name,
        });
        return;
      }
    } catch (err) {
      logger.error({ err }, "Error authenticating with Supabase");
    }
  }

  // 2. Fallback to env / default credentials
  if (username === env.appUsername && password === env.appPassword) {
    setSessionCookie(res, {
      username,
      role: "admin",
      displayName: "المدير الافتراضي",
    });

    res.json({
      username,
      role: "admin",
      displayName: "المدير الافتراضي",
    });
    return;
  }

  res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." });
});

/**
 * Dedicated Admin Portal Login
 * Only users with role === 'admin' are permitted
 */
router.post("/auth/admin-login", loginRateLimiter, attachAuthUser, async (req, res) => {
  const parseResult = LoginBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان." });
    return;
  }

  const { username, password } = parseResult.data;

  // 1. If Supabase is configured
  if (isSupabaseConfigured()) {
    try {
      await ensureDefaultAdmin();
      const supabaseUser = await verifySupabaseUser(username, password);
      if (supabaseUser) {
        if (supabaseUser.role !== "admin") {
          res.status(403).json({
            error: "عذراً، هذا الحساب ليس لديه صلاحيات الإدارة للدخول لبوابة المشرف.",
          });
          return;
        }

        setSessionCookie(res, {
          username: supabaseUser.username,
          userId: supabaseUser.id,
          role: supabaseUser.role,
          displayName: supabaseUser.display_name || supabaseUser.username,
        });

        res.json({
          username: supabaseUser.username,
          role: supabaseUser.role,
          displayName: supabaseUser.display_name,
        });
        return;
      }
    } catch (err) {
      logger.error({ err }, "Error authenticating admin with Supabase");
    }
  }

  // 2. Fallback to dedicated admin env credentials
  if (username === env.adminUsername && password === env.adminPassword) {
    setSessionCookie(res, {
      username,
      role: "admin",
      displayName: "المشرف العام",
    });

    res.json({
      username,
      role: "admin",
      displayName: "المشرف العام",
    });
    return;
  }

  res.status(401).json({ error: "بيانات دخول المشرف غير صحيحة." });
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

router.get("/auth/me", attachAuthUser, requireAuth, (req, res) => {
  try {
    const authUser = req.authUser!;
    res.json({
      username: authUser.username,
      role: authUser.role || "staff",
      displayName: authUser.displayName || authUser.username,
      isSupabase: isSupabaseConfigured(),
    });
  } catch (err) {
    logger.error({ err }, "Failed to serialize current user");
    res.status(500).json({ error: "Failed to load current user." });
  }
});

export default router;
export { attachAuthUser, requireAuth, requireAdmin };
