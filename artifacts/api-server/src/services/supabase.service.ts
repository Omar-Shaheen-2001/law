import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { env, isSupabaseConfigured } from "../config/env";
import { logger } from "../lib/logger";

export interface AppUser {
  id: string;
  username: string;
  email?: string | null;
  role: "admin" | "staff";
  display_name?: string | null;
  created_at?: string;
}

export interface AppUserWithHash extends AppUser {
  password_hash: string;
}

let _supabaseClient: SupabaseClient | null = null;
let _lastUrl: string | undefined = undefined;
let _lastKey: string | undefined = undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const url = env.supabaseUrl!;
  const key = env.supabaseKey!;

  if (_supabaseClient && _lastUrl === url && _lastKey === key) {
    return _supabaseClient;
  }

  try {
    _supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    _lastUrl = url;
    _lastKey = key;
    return _supabaseClient;
  } catch (err) {
    logger.error({ err }, "Failed to initialize Supabase client");
    return null;
  }
}

/**
 * Ensures that if app_users table is empty, a default admin user is seeded.
 */
export async function ensureDefaultAdmin(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const tableName = env.supabaseTableName;
    const { count, error } = await client
      .from(tableName)
      .select("*", { count: "exact", head: true });

    if (error) {
      logger.warn({ error }, `Error checking ${tableName} in Supabase (table might not exist yet)`);
      return;
    }

    if (count === 0) {
      const defaultUsername = env.appUsername || "admin";
      const defaultPassword = env.appPassword || "admin123";
      const password_hash = await bcrypt.hash(defaultPassword, 10);

      const { error: insertErr } = await client.from(tableName).insert([
        {
          username: defaultUsername,
          email: `${defaultUsername}@law.local`,
          password_hash,
          role: "admin",
          display_name: "مدير النظام الافتراضي",
        },
      ]);

      if (insertErr) {
        logger.error({ insertErr }, "Failed to create default admin in Supabase");
      } else {
        logger.info({ username: defaultUsername }, "Seeded default admin user in Supabase");
      }
    }
  } catch (err) {
    logger.error({ err }, "Error during ensureDefaultAdmin");
  }
}

/**
 * Verify user credentials against Supabase app_users table.
 */
export async function verifySupabaseUser(
  usernameOrEmail: string,
  plainPassword: string,
): Promise<AppUser | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const tableName = env.supabaseTableName;
    const cleanIdentifier = usernameOrEmail.trim().toLowerCase();

    const { data, error } = await client
      .from(tableName)
      .select("id, username, email, role, display_name, password_hash, created_at")
      .or(`username.ilike.${cleanIdentifier},email.ilike.${cleanIdentifier}`)
      .limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }

    const record = data[0] as AppUserWithHash;
    if (!record.password_hash) {
      return null;
    }

    let isValid = false;
    // Check bcrypt hash
    if (record.password_hash.startsWith("$2a$") || record.password_hash.startsWith("$2b$")) {
      isValid = await bcrypt.compare(plainPassword, record.password_hash);
    } else {
      // Plain-text legacy fallback, upgrade to bcrypt on match
      if (record.password_hash === plainPassword) {
        isValid = true;
        const newHash = await bcrypt.hash(plainPassword, 10);
        await client.from(tableName).update({ password_hash: newHash }).eq("id", record.id);
      }
    }

    if (!isValid) {
      return null;
    }

    return {
      id: record.id,
      username: record.username,
      email: record.email,
      role: record.role || "staff",
      display_name: record.display_name,
      created_at: record.created_at,
    };
  } catch (err) {
    logger.error({ err }, "Error verifying user against Supabase");
    return null;
  }
}

/**
 * List all users.
 */
export async function listSupabaseUsers(): Promise<AppUser[]> {
  const client = getSupabaseClient();
  if (!client) {
    // If Supabase is not configured, return default local user
    return [
      {
        id: "local-default",
        username: env.appUsername || "5128",
        email: "local@law.internal",
        role: "admin",
        display_name: "المستخدم المحلي الافتراضي",
        created_at: new Date().toISOString(),
      },
    ];
  }

  const tableName = env.supabaseTableName;
  const { data, error } = await client
    .from(tableName)
    .select("id, username, email, role, display_name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    logger.error({ error }, "Failed to list users from Supabase");
    throw new Error(
      `فشل جلب المستخدمين من Supabase: ${error.message}. تأكد من إنشاء جدول ${tableName}.`,
    );
  }

  return (data || []) as AppUser[];
}

/**
 * Create a new user in Supabase.
 */
export async function createSupabaseUser(input: {
  username: string;
  email?: string;
  password: string;
  role?: "admin" | "staff";
  display_name?: string;
}): Promise<AppUser> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase غير متصل. يرجى إدخال Supabase URL و Key في صفحة الإعدادات أولاً.");
  }

  const tableName = env.supabaseTableName;
  const username = input.username.trim().toLowerCase();
  const password = input.password.trim();

  if (!username) {
    throw new Error("اسم المستخدم مطلوب.");
  }
  if (!password || password.length < 4) {
    throw new Error("كلمة المرور يجب ألا تقل عن 4 خانات.");
  }

  // Check if username already exists
  const { data: existing } = await client
    .from(tableName)
    .select("id")
    .ilike("username", username)
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error(`اسم المستخدم "${username}" مسجل مسبقاً.`);
  }

  const password_hash = await bcrypt.hash(password, 10);

  const newUserData = {
    username,
    email: input.email?.trim() || null,
    password_hash,
    role: input.role || "staff",
    display_name: input.display_name?.trim() || username,
  };

  const { data, error } = await client
    .from(tableName)
    .insert([newUserData])
    .select("id, username, email, role, display_name, created_at")
    .single();

  if (error) {
    logger.error({ error }, "Failed to insert user into Supabase");
    throw new Error(`فشل إنشاء المستخدم: ${error.message}`);
  }

  return data as AppUser;
}

/**
 * Delete a user from Supabase.
 */
export async function deleteSupabaseUser(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase غير متصل.");
  }

  const tableName = env.supabaseTableName;
  const { error } = await client.from(tableName).delete().eq("id", id);

  if (error) {
    logger.error({ error, id }, "Failed to delete user from Supabase");
    throw new Error(`فشل حذف المستخدم: ${error.message}`);
  }
}

/**
 * Update a user in Supabase (password, role, display name, email).
 */
export async function updateSupabaseUser(
  id: string,
  input: {
    password?: string;
    role?: "admin" | "staff";
    display_name?: string;
    email?: string;
  },
): Promise<AppUser> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase غير متصل.");
  }

  const tableName = env.supabaseTableName;
  const updates: Record<string, unknown> = {};

  if (input.password && input.password.trim()) {
    if (input.password.trim().length < 4) {
      throw new Error("كلمة المرور يجب ألا تقل عن 4 خانات.");
    }
    updates.password_hash = await bcrypt.hash(input.password.trim(), 10);
  }

  if (input.role) {
    updates.role = input.role;
  }

  if (input.display_name !== undefined) {
    updates.display_name = input.display_name.trim() || null;
  }

  if (input.email !== undefined) {
    updates.email = input.email.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("لا توجد بيانات للتعديل.");
  }

  const { data, error } = await client
    .from(tableName)
    .update(updates)
    .eq("id", id)
    .select("id, username, email, role, display_name, created_at")
    .single();

  if (error) {
    logger.error({ error, id }, "Failed to update user in Supabase");
    throw new Error(`فشل تعديل المستخدم: ${error.message}`);
  }

  return data as AppUser;
}
