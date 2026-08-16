import { Router, type IRouter } from "express";
import { attachAuthUser, requireAuth, requireAdmin } from "../middlewares/auth.middleware";
import {
  listSupabaseUsers,
  createSupabaseUser,
  deleteSupabaseUser,
  updateSupabaseUser,
} from "../services/supabase.service";
import { isSupabaseConfigured } from "../config/env";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Require auth on all user management routes
router.use(attachAuthUser, requireAuth);

/**
 * GET /api/users
 * Returns list of users and supabase connection status
 */
router.get("/users", async (_req, res) => {
  try {
    const isConfigured = isSupabaseConfigured();
    const users = await listSupabaseUsers();
    res.json({
      isSupabaseConfigured: isConfigured,
      users,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch users");
    res.status(500).json({
      error: err.message || "فشل جلب المستخدمين.",
      isSupabaseConfigured: isSupabaseConfigured(),
      users: [],
    });
  }
});

/**
 * POST /api/users
 * Creates a new user (Admin only)
 */
router.post("/users", requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role, display_name } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان." });
      return;
    }

    const newUser = await createSupabaseUser({
      username,
      email,
      password,
      role: role === "admin" ? "admin" : "staff",
      display_name,
    });

    res.status(201).json(newUser);
  } catch (err: any) {
    logger.error({ err }, "Failed to create user");
    res.status(400).json({ error: err.message || "فشل إنشاء المستخدم." });
  }
});

/**
 * PATCH /api/users/:id
 * Updates an existing user (Admin only)
 */
router.patch("/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { password, role, display_name, email } = req.body;

    const updatedUser = await updateSupabaseUser(id, {
      password,
      role,
      display_name,
      email,
    });

    res.json(updatedUser);
  } catch (err: any) {
    logger.error({ err, id: req.params.id }, "Failed to update user");
    res.status(400).json({ error: err.message || "فشل تعديل المستخدم." });
  }
});

/**
 * DELETE /api/users/:id
 * Deletes a user (Admin only)
 */
router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (req.authUser?.userId === id) {
      res.status(400).json({ error: "لا يمكنك حذف الحساب الذي قمت بتسجيل الدخول به حالياً." });
      return;
    }

    await deleteSupabaseUser(id);
    res.status(204).send();
  } catch (err: any) {
    logger.error({ err, id: req.params.id }, "Failed to delete user");
    res.status(400).json({ error: err.message || "فشل حذف المستخدم." });
  }
});

export default router;
