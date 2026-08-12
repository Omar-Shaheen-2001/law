import { google, type sheets_v4 } from "googleapis";
import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * Google Sheets service for Judgment (الأحكام) records.
 * Uses a dedicated sheet tab named "Judgment" in the spreadsheet.
 */

const JUDGMENT_SHEET_NAME = "Judgment";

export const JUDGMENT_SHEET_COLUMNS = [
  "المحكمة المختصة",
  "المدعي",
  "المدعى عليه",
  "المحامي المكلف",
  "رقم الصك",
  "تاريخ الحكم",
  "ملخص الحكم",
  "هل الحكم لصالح العميل",
  "تاريخ الإنشاء",
] as const;

export const JUDGMENT_COLS = JUDGMENT_SHEET_COLUMNS.length; // 9
const COL_LAST = String.fromCharCode("A".charCodeAt(0) + JUDGMENT_COLS - 1); // "I"

let sheetsClient: sheets_v4.Sheets | null = null;

function getClient(): sheets_v4.Sheets {
  if (!sheetsClient) {
    const credentials = env.googleServiceAccountJson as {
      client_email?: string;
      private_key?: string;
    };
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email/private_key.",
      );
    }
    const privateKey = credentials.private_key.replace(/\\n/g, "\n");
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheetsClient = google.sheets({ version: "v4", auth });
  }
  return sheetsClient;
}

let judgmentSheetIdCache: number | null = null;
let isJudgmentSheetReadyCache = false;

// In-memory data cache
let judgmentDataCache: { id: number; values: JudgmentRow }[] | null = null;
let lastJudgmentCacheTime = 0;
const JUDGMENT_CACHE_TTL_MS = 15000; // 15 seconds

export function invalidateJudgmentCache(): void {
  judgmentDataCache = null;
  lastJudgmentCacheTime = 0;
}

async function getJudgmentSheetId(): Promise<number> {
  if (judgmentSheetIdCache !== null) return judgmentSheetIdCache;
  const sheets = getClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: env.googleSpreadsheetId,
  });
  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === JUDGMENT_SHEET_NAME,
  );
  if (!sheet?.properties && sheet?.properties?.sheetId === undefined) {
    throw new Error(`Sheet tab "${JUDGMENT_SHEET_NAME}" not found.`);
  }
  judgmentSheetIdCache = sheet!.properties!.sheetId!;
  return judgmentSheetIdCache;
}

/** Ensures the "Judgment" sheet tab exists with the correct header row. */
export async function ensureJudgmentSheetReady(): Promise<void> {
  if (isJudgmentSheetReadyCache) return;
  try {
    const sheets = getClient();
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: env.googleSpreadsheetId,
    });
    const existing = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === JUDGMENT_SHEET_NAME,
    );

    if (!existing) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: env.googleSpreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: JUDGMENT_SHEET_NAME } } }],
        },
      });
      judgmentSheetIdCache = null;
      logger.info(`Created sheet tab "${JUDGMENT_SHEET_NAME}"`);
    }

    // Always ensure the header is correct
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.googleSpreadsheetId,
      range: `${JUDGMENT_SHEET_NAME}!A1:${COL_LAST}1`,
      valueInputOption: "RAW",
      requestBody: { values: [[...JUDGMENT_SHEET_COLUMNS]] },
    });
    isJudgmentSheetReadyCache = true;
  } catch (err) {
    isJudgmentSheetReadyCache = false;
    logger.warn({ err }, "ensureJudgmentSheetReady non-fatal warning");
  }
}

export type JudgmentRow = string[];

/** Returns all Judgment records (excluding header row), using in-memory cache if fresh. */
export async function listJudgmentRows(forceRefresh = false): Promise<{ id: number; values: JudgmentRow }[]> {
  const now = Date.now();
  if (!forceRefresh && judgmentDataCache !== null && now - lastJudgmentCacheTime < JUDGMENT_CACHE_TTL_MS) {
    return judgmentDataCache;
  }

  await ensureJudgmentSheetReady();

  try {
    const sheets = getClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.googleSpreadsheetId,
      range: `${JUDGMENT_SHEET_NAME}!A2:${COL_LAST}`,
    });
    const rows = response.data.values ?? [];
    const result = rows
      .map((row, index) => ({ id: index + 2, values: row as JudgmentRow }))
      .filter((row) => row.values.some((cell) => cell !== undefined && cell !== ""));
    
    judgmentDataCache = result;
    lastJudgmentCacheTime = now;
    return result;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch Judgment rows from Google Sheets, returning cached/empty");
    return judgmentDataCache ?? [];
  }
}

/** Appends a new Judgment record row and returns its 1-based row id. */
export async function appendJudgmentRow(values: JudgmentRow): Promise<number> {
  invalidateJudgmentCache();
  const sheets = getClient();
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: env.googleSpreadsheetId,
    range: `${JUDGMENT_SHEET_NAME}!A:${COL_LAST}`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
  const updatedRange = response.data.updates?.updatedRange;
  const match = updatedRange?.match(/![A-Z]+(\d+):/);
  if (match) return Number(match[1]);
  const rows = await listJudgmentRows(true);
  const last = rows[rows.length - 1];
  if (!last) throw new Error("Failed to determine id of newly created Judgment row.");
  return last.id;
}

/** Updates an existing Judgment row by its 1-based row id. */
export async function updateJudgmentRow(id: number, values: JudgmentRow): Promise<void> {
  invalidateJudgmentCache();
  const sheets = getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSpreadsheetId,
    range: `${JUDGMENT_SHEET_NAME}!A${id}:${COL_LAST}${id}`,
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
}

/** Deletes a Judgment row by its 1-based row id. */
export async function deleteJudgmentRow(id: number): Promise<void> {
  invalidateJudgmentCache();
  const sheets = getClient();
  const sheetId = await getJudgmentSheetId();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.googleSpreadsheetId,
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
