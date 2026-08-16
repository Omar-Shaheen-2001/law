import { google, type sheets_v4 } from "googleapis";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { getUserGoogleCredentials } from "./supabase.service";

/**
 * Thin wrapper around the Google Sheets API that treats one spreadsheet tab
 * as the database of record for hearing sessions. Row 1 is a fixed header;
 * every subsequent row is one session, and its 1-based sheet row index
 * doubles as the record's `id` (there is no separate primary key column).
 */

export const SHEET_COLUMNS = [
  "رقم القضية",
  "المدعي",
  "المدعى عليه",
  "المحكمة",
  "الدائرة القضائية",
  "موضوع القضية",
  "نوع الجلسة",
  "تاريخ الجلسة هجري",
  "يوم الجلسة",
  "وقت الجلسة",
  "الأيام المتبقية",
  "ملاحظات",
  "حالة الجلسة",
  "تذكير 24 ساعة",
  "تذكير 6 ساعات",
  "تاريخ الإنشاء",
  "التقرير",
] as const;

export type SheetRow = string[];

let defaultSheetsClient: sheets_v4.Sheets | null = null;
const userClientsMap = new Map<string, sheets_v4.Sheets>();

function getDefaultClient(): sheets_v4.Sheets {
  if (!defaultSheetsClient) {
    const credentials = env.googleServiceAccountJson as {
      client_email?: string;
      private_key?: string;
    };
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email/private_key. Paste the full service account key JSON.",
      );
    }
    const privateKey = credentials.private_key.replace(/\\n/g, "\n");
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    defaultSheetsClient = google.sheets({ version: "v4", auth });
  }
  return defaultSheetsClient;
}

export interface GoogleContext {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
  sheetName: string;
}

export async function getGoogleContext(userId?: string): Promise<GoogleContext> {
  if (userId) {
    const userCreds = await getUserGoogleCredentials(userId);
    if (
      userCreds &&
      userCreds.serviceAccountJson &&
      typeof userCreds.serviceAccountJson === "object"
    ) {
      const credentials = userCreds.serviceAccountJson as {
        client_email?: string;
        private_key?: string;
      };

      if (credentials.client_email && credentials.private_key) {
        let client = userClientsMap.get(userId);
        if (!client) {
          const privateKey = credentials.private_key.replace(/\\n/g, "\n");
          const auth = new google.auth.JWT({
            email: credentials.client_email,
            key: privateKey,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
          });
          client = google.sheets({ version: "v4", auth });
          userClientsMap.set(userId, client);
        }

        const spreadsheetId = userCreds.spreadsheetId || env.googleSpreadsheetId;
        const sheetName = userCreds.sheetName || env.googleSheetName;
        return { sheets: client, spreadsheetId, sheetName };
      }
    }
  }

  // Global default fallback
  return {
    sheets: getDefaultClient(),
    spreadsheetId: env.googleSpreadsheetId,
    sheetName: env.googleSheetName,
  };
}

/** Resolves the numeric sheet (tab) id needed for row delete operations. */
async function getSheetId(ctx: GoogleContext): Promise<number> {
  const spreadsheet = await ctx.sheets.spreadsheets.get({
    spreadsheetId: ctx.spreadsheetId,
  });
  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === ctx.sheetName,
  );
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    throw new Error(
      `Sheet tab "${ctx.sheetName}" was not found in the configured spreadsheet.`,
    );
  }
  return sheet.properties.sheetId;
}

/** Ensures the target sheet tab exists with the expected header row. Safe to call repeatedly. */
export async function ensureSheetReady(userId?: string): Promise<void> {
  try {
    const ctx = await getGoogleContext(userId);
    const spreadsheet = await ctx.sheets.spreadsheets.get({
      spreadsheetId: ctx.spreadsheetId,
    });
    const existing = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === ctx.sheetName,
    );

    if (!existing) {
      await ctx.sheets.spreadsheets.batchUpdate({
        spreadsheetId: ctx.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: ctx.sheetName } } }],
        },
      });
    }

    await ctx.sheets.spreadsheets.values.update({
      spreadsheetId: ctx.spreadsheetId,
      range: `${ctx.sheetName}!A1:Q1`,
      valueInputOption: "RAW",
      requestBody: { values: [[...SHEET_COLUMNS]] },
    });
  } catch (err) {
    logger.warn({ err, userId }, "ensureSheetReady non-fatal warning");
  }
}

/** Returns every data row (excluding the header) as `{ id, values }`, where `id` is the 1-based sheet row number. */
export async function listRows(userId?: string): Promise<{ id: number; values: SheetRow }[]> {
  const ctx = await getGoogleContext(userId);
  const response = await ctx.sheets.spreadsheets.values.get({
    spreadsheetId: ctx.spreadsheetId,
    range: `${ctx.sheetName}!A2:Q`,
  });
  const rows = response.data.values ?? [];
  return rows
    .map((row, index) => ({ id: index + 2, values: row as SheetRow }))
    .filter((row) => row.values.some((cell) => cell !== undefined && cell !== ""));
}

/** Appends a new row (filling the first empty row if available) and returns its 1-based sheet row id. */
export async function appendRow(values: SheetRow, userId?: string): Promise<number> {
  const ctx = await getGoogleContext(userId);

  // Check if there are any existing empty rows in the sheet range to reuse
  try {
    const existing = await ctx.sheets.spreadsheets.values.get({
      spreadsheetId: ctx.spreadsheetId,
      range: `${ctx.sheetName}!A2:Q`,
    });
    const rawRows = existing.data.values ?? [];

    let emptyRowId: number | null = null;
    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const isEmpty =
        !r ||
        r.length === 0 ||
        r.every((cell) => cell === undefined || cell === null || String(cell).trim() === "");
      if (isEmpty) {
        emptyRowId = i + 2; // 1-based sheet row number (Header is row 1)
        break;
      }
    }

    if (emptyRowId !== null) {
      await updateRow(emptyRowId, values, userId);
      return emptyRowId;
    }
  } catch (err) {
    logger.warn({ err, userId }, "Failed to check empty rows before append, falling back to append API");
  }

  const response = await ctx.sheets.spreadsheets.values.append({
    spreadsheetId: ctx.spreadsheetId,
    range: `${ctx.sheetName}!A:Q`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
  const updatedRange = response.data.updates?.updatedRange;
  const match = updatedRange?.match(/![A-Z]+(\d+):/);
  if (match) {
    return Number(match[1]);
  }
  logger.warn({ updatedRange, userId }, "Could not parse appended row id from Sheets response");
  const rows = await listRows(userId);
  const last = rows[rows.length - 1];
  if (!last) {
    throw new Error("Failed to determine id of newly created session row.");
  }
  return last.id;
}

/** Overwrites a single existing row (1-based sheet row id) with new values. */
export async function updateRow(id: number, values: SheetRow, userId?: string): Promise<void> {
  const ctx = await getGoogleContext(userId);
  await ctx.sheets.spreadsheets.values.update({
    spreadsheetId: ctx.spreadsheetId,
    range: `${ctx.sheetName}!A${id}:Q${id}`,
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
}

/** Overwrites specific columns (0-based indexes into SHEET_COLUMNS) on a row, leaving others untouched. */
export async function updateRowCells(
  id: number,
  updates: Record<number, string>,
  userId?: string,
): Promise<void> {
  const ctx = await getGoogleContext(userId);
  const data = Object.entries(updates).map(([colIndex, value]) => {
    const column = String.fromCharCode("A".charCodeAt(0) + Number(colIndex));
    return {
      range: `${ctx.sheetName}!${column}${id}:${column}${id}`,
      values: [[value]],
    };
  });
  if (data.length === 0) {
    return;
  }
  await ctx.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: ctx.spreadsheetId,
    requestBody: { valueInputOption: "RAW", data },
  });
}

/** Deletes a row (1-based sheet row id). */
export async function deleteRow(id: number, userId?: string): Promise<void> {
  const ctx = await getGoogleContext(userId);
  const sheetId = await getSheetId(ctx);
  await ctx.sheets.spreadsheets.batchUpdate({
    spreadsheetId: ctx.spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: id - 1,
              endIndex: id,
            },
          },
        },
      ],
    },
  });
}
