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
  google_service_account_json?: string | null;
  google_spreadsheet_id?: string | null;
  google_sheet_name?: string | null;
  has_google_service?: boolean;
  created_at?: string;
}

export interface AppUserWithHash extends AppUser {
  password_hash: string;
}

export interface UserGoogleCredentials {
  serviceAccountJson?: Record<string, unknown>;
  spreadsheetId?: string;
  sheetName?: string;
}

let _supabaseClient: SupabaseClient | null = null;
let _lastUrl: string | undefined = undefined;
let _lastKey: string | undefined = undefined;

// In-memory cache for user google credentials to avoid querying Supabase on every Sheets call
const userGoogleCredsCache = new Map<string, { data: UserGoogleCredentials; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export function invalidateUserGoogleCache(userId?: string): void {
  if (userId) {
    userGoogleCredsCache.delete(userId);
  } else {
    userGoogleCredsCache.clear();
  }
}

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
      const defaultUsername = env.adminUsername || "407171248";
      const defaultPassword = env.adminPassword || "407171248";
      const password_hash = await bcrypt.hash(defaultPassword, 10);

      const { error: insertErr } = await client.from(tableName).insert([
        {
          username: defaultUsername,
          email: `${defaultUsername}@law.local`,
          password_hash,
          role: "admin",
          display_name: "مدير النظام (المشرف العام)",
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
      .select("id, username, email, role, display_name, password_hash, google_spreadsheet_id, google_sheet_name, created_at")
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
      google_spreadsheet_id: record.google_spreadsheet_id,
      google_sheet_name: record.google_sheet_name,
      created_at: record.created_at,
    };
  } catch (err) {
    logger.error({ err }, "Error verifying user against Supabase");
    return null;
  }
}

/**
 * Get Google Sheets credentials for a specific user.
 */
export async function getUserGoogleCredentials(userId?: string): Promise<UserGoogleCredentials | null> {
  if (!userId || userId === "local-admin" || userId === "local-default") {
    return null;
  }

  const cached = userGoogleCredsCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const tableName = env.supabaseTableName;
    const { data, error } = await client
      .from(tableName)
      .select("google_service_account_json, google_spreadsheet_id, google_sheet_name")
      .eq("id", userId)
      .single();

    if (error || !data) return null;

    let parsedJson: Record<string, unknown> | undefined = undefined;
    if (data.google_service_account_json) {
      try {
        parsedJson = typeof data.google_service_account_json === "string"
          ? JSON.parse(data.google_service_account_json)
          : data.google_service_account_json;
      } catch (err) {
        logger.warn({ err, userId }, "Failed to parse user google_service_account_json");
      }
    }

    const creds: UserGoogleCredentials = {
      serviceAccountJson: parsedJson,
      spreadsheetId: data.google_spreadsheet_id?.trim() || undefined,
      sheetName: data.google_sheet_name?.trim() || undefined,
    };

    userGoogleCredsCache.set(userId, { data: creds, timestamp: Date.now() });
    return creds;
  } catch (err) {
    logger.error({ err, userId }, "Error getting user Google credentials from Supabase");
    return null;
  }
}

/**
 * List all users.
 */
export async function listSupabaseUsers(): Promise<AppUser[]> {
  const client = getSupabaseClient();
  if (!client) {
    // If Supabase is not configured, return default local admin user
    return [
      {
        id: "local-admin",
        username: env.adminUsername || "407171248",
        email: "admin@law.internal",
        role: "admin",
        display_name: "المشرف العام الافتراضي",
        has_google_service: false,
        google_spreadsheet_id: null,
        google_sheet_name: null,
        created_at: new Date().toISOString(),
      },
    ];
  }

  const tableName = env.supabaseTableName;
  const { data, error } = await client
    .from(tableName)
    .select("id, username, email, role, display_name, google_service_account_json, google_spreadsheet_id, google_sheet_name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    logger.error({ error }, "Failed to list users from Supabase");
    throw new Error(
      `فشل جلب المستخدمين من Supabase: ${error.message}. تأكد من إنشاء جدول ${tableName}.`,
    );
  }

  return (data || []).map((u: any) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role || "staff",
    display_name: u.display_name,
    has_google_service: Boolean(u.google_service_account_json && u.google_service_account_json.trim().length > 10),
    google_spreadsheet_id: u.google_spreadsheet_id || null,
    google_sheet_name: u.google_sheet_name || null,
    created_at: u.created_at,
  }));
}

/**
 * Validates Google Service Account JSON string or object.
 */
function sanitizeGoogleServiceJson(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw.trim()) : raw;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid JSON object");
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("ملف Service Account JSON يجب أن يحتوي على client_email و private_key.");
    }
    return JSON.stringify(parsed);
  } catch (err: any) {
    throw new Error(err.message || "صيغة Google Service Account JSON غير صحيحة.");
  }
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
  google_service_account_json?: string;
  google_spreadsheet_id?: string;
  google_sheet_name?: string;
}): Promise<AppUser> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase غير متصل. يرجى إدخال Supabase URL و Key في صفحة الإدارة أولاً.");
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

  // Validate Google Service JSON if provided
  const sanitizedGoogleJson = sanitizeGoogleServiceJson(input.google_service_account_json);

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
    google_service_account_json: sanitizedGoogleJson,
    google_spreadsheet_id: input.google_spreadsheet_id?.trim() || null,
    google_sheet_name: input.google_sheet_name?.trim() || null,
  };

  const { data, error } = await client
    .from(tableName)
    .insert([newUserData])
    .select("id, username, email, role, display_name, google_spreadsheet_id, google_sheet_name, created_at")
    .single();

  if (error) {
    logger.error({ error }, "Failed to insert user into Supabase");
    throw new Error(`فشل إنشاء المستخدم: ${error.message}`);
  }

  return {
    id: data.id,
    username: data.username,
    email: data.email,
    role: data.role,
    display_name: data.display_name,
    has_google_service: Boolean(sanitizedGoogleJson),
    google_spreadsheet_id: data.google_spreadsheet_id,
    google_sheet_name: data.google_sheet_name,
    created_at: data.created_at,
  };
}

/**
 * Delete a user from Supabase.
 */
export async function deleteSupabaseUser(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase غير متصل.");
  }

  invalidateUserGoogleCache(id);
  const tableName = env.supabaseTableName;
  const { error } = await client.from(tableName).delete().eq("id", id);

  if (error) {
    logger.error({ error, id }, "Failed to delete user from Supabase");
    throw new Error(`فشل حذف المستخدم: ${error.message}`);
  }
}

/**
 * Update a user in Supabase (password, role, display name, email, google credentials).
 */
export async function updateSupabaseUser(
  id: string,
  input: {
    password?: string;
    role?: "admin" | "staff";
    display_name?: string;
    email?: string;
    google_service_account_json?: string;
    google_spreadsheet_id?: string;
    google_sheet_name?: string;
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

  if (input.google_service_account_json !== undefined) {
    updates.google_service_account_json = sanitizeGoogleServiceJson(input.google_service_account_json);
  }

  if (input.google_spreadsheet_id !== undefined) {
    updates.google_spreadsheet_id = input.google_spreadsheet_id.trim() || null;
  }

  if (input.google_sheet_name !== undefined) {
    updates.google_sheet_name = input.google_sheet_name.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("لا توجد بيانات للتعديل.");
  }

  invalidateUserGoogleCache(id);

  const { data, error } = await client
    .from(tableName)
    .update(updates)
    .eq("id", id)
    .select("id, username, email, role, display_name, google_service_account_json, google_spreadsheet_id, google_sheet_name, created_at")
    .single();

  if (error) {
    logger.error({ error, id }, "Failed to update user in Supabase");
    throw new Error(`فشل تعديل المستخدم: ${error.message}`);
  }

  return {
    id: data.id,
    username: data.username,
    email: data.email,
    role: data.role,
    display_name: data.display_name,
    has_google_service: Boolean(data.google_service_account_json && data.google_service_account_json.trim().length > 10),
    google_spreadsheet_id: data.google_spreadsheet_id,
    google_sheet_name: data.google_sheet_name,
    created_at: data.created_at,
  };
}
