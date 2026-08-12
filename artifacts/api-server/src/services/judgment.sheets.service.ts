import { google, type sheets_v4 } from "googleapis";
import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * Google Sheets service for Judgment (الأحكام) records.
 * Uses a dedicated sheet tab named "Judgment" in the spreadsheet.
 */

const JUDGMENT_SHEET_NAME = "Judgment";

export const JUDGMENT_SHEET_COLUMNS = [
  "رقم القضية",
  "المحكمة المختصة",
  "المدعي",
  "المدعى عليه",
  "المحامي المكلف",
  "رقم الصك",
  "تاريخ الحكم",
  "ملخص الحكم",
  "الحكم",
  "تاريخ الإنشاء",
] as const;

export const JUDGMENT_COLS = JUDGMENT_SHEET_COLUMNS.length; // 10
const COL_LAST = String.fromCharCode("A".charCodeAt(0) + JUDGMENT_COLS - 1); // "J"

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

/** Ensures the "Judgment" sheet tab exists with the correct header row and text formatting. */
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
      const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: env.googleSpreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: JUDGMENT_SHEET_NAME } } }],
        },
      });
      judgmentSheetIdCache = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
      logger.info(`Created sheet tab "${JUDGMENT_SHEET_NAME}"`);
    } else {
      judgmentSheetIdCache = existing.properties?.sheetId ?? null;
    }

    // 1. Ensure Header row 1 is updated to JUDGMENT_SHEET_COLUMNS
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.googleSpreadsheetId,
      range: `${JUDGMENT_SHEET_NAME}!A1:${COL_LAST}1`,
      valueInputOption: "RAW",
      requestBody: { values: [[...JUDGMENT_SHEET_COLUMNS]] },
    });

    // 2. Format cells explicitly so text color is BLACK on white background for data rows,
    //    preventing Google Sheets from making text white.
    if (judgmentSheetIdCache !== null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: env.googleSpreadsheetId,
        requestBody: {
          requests: [
            // Row 1 (Header): Dark Navy fill, white text, bold
            {
              repeatCell: {
                range: {
                  sheetId: judgmentSheetIdCache,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: JUDGMENT_COLS,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.15, blue: 0.25 },
                    textFormat: {
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                      bold: true,
                      fontSize: 10,
                    },
                    horizontalAlignment: "CENTER",
                    verticalAlignment: "MIDDLE",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
              },
            },
            // Rows 2..1000 (Data): White fill, BLACK text, normal
            {
              repeatCell: {
                range: {
                  sheetId: judgmentSheetIdCache,
                  startRowIndex: 1,
                  endRowIndex: 1000,
                  startColumnIndex: 0,
                  endColumnIndex: JUDGMENT_COLS,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 1, blue: 1 },
                    textFormat: {
                      foregroundColor: { red: 0, green: 0, blue: 0 },
                      bold: false,
                      fontSize: 10,
                    },
                    horizontalAlignment: "RIGHT",
                    verticalAlignment: "MIDDLE",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
              },
            },
          ],
        },
      });
    }

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

/** Fetches both headers and data rows in a single API call, using in-memory cache if fresh. */
export async function listJudgmentRowsWithHeaders(forceRefresh = false): Promise<{
  headers: string[];
  rows: { id: number; values: JudgmentRow }[];
}> {
  await ensureJudgmentSheetReady();

  const now = Date.now();
  const useCache =
    !forceRefresh &&
    judgmentDataCache !== null &&
    now - lastJudgmentCacheTime < JUDGMENT_CACHE_TTL_MS;

  try {
    const sheets = getClient();

    if (useCache) {
      // Fetch row 1 only for headers when using cache
      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: env.googleSpreadsheetId,
        range: `${JUDGMENT_SHEET_NAME}!A1:${COL_LAST}1`,
      });
      const headers = ((headerRes.data.values?.[0] as string[]) ?? [...JUDGMENT_SHEET_COLUMNS]);
      return { headers, rows: judgmentDataCache! };
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.googleSpreadsheetId,
      range: `${JUDGMENT_SHEET_NAME}!A1:${COL_LAST}`,
    });
    const data = response.data.values ?? [];
    const headers = (data[0] as string[]) ?? [...JUDGMENT_SHEET_COLUMNS];
    const dataRows = data.slice(1);
    const rows = dataRows
      .map((row, index) => ({ id: index + 2, values: row as JudgmentRow }))
      .filter((row) => row.values.some((cell) => cell !== undefined && cell !== ""));

    judgmentDataCache = rows;
    lastJudgmentCacheTime = now;
    return { headers, rows };
  } catch (err) {
    logger.warn({ err }, "Failed to fetch Judgment rows from Google Sheets, returning cached/empty");
    return {
      headers: [...JUDGMENT_SHEET_COLUMNS],
      rows: judgmentDataCache ?? [],
    };
  }
}

/** Appends a new Judgment record row and returns its 1-based row id.
 *  Uses OVERWRITE (not INSERT_ROWS) to avoid inheriting cell formatting
 *  from the row above, which would make text appear white on a white background.
 */
export async function appendJudgmentRow(values: JudgmentRow): Promise<number> {
  invalidateJudgmentCache();
  const sheets = getClient();
  // Pad the row to exactly JUDGMENT_COLS so we always write all 10 columns
  const paddedValues: string[] = Array.from({ length: JUDGMENT_COLS }, (_, i) => values[i] ?? "");
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: env.googleSpreadsheetId,
    range: `${JUDGMENT_SHEET_NAME}!A:${COL_LAST}`,
    valueInputOption: "RAW",
    insertDataOption: "OVERWRITE", // OVERWRITE avoids inheriting header row's white-text formatting
    requestBody: { values: [paddedValues] },
  });
  const updatedRange = response.data.updates?.updatedRange;
  const match = updatedRange?.match(/![A-Z]+(\d+):/);
  if (match) return Number(match[1]);
  const { rows } = await listJudgmentRowsWithHeaders();
  const last = rows[rows.length - 1];
  if (!last) throw new Error("Failed to determine id of newly created Judgment row.");
  return last.id;
}

/** Updates an existing Judgment row by its 1-based row id. */
export async function updateJudgmentRow(id: number, values: JudgmentRow): Promise<void> {
  invalidateJudgmentCache();
  const sheets = getClient();
  // Always write exactly JUDGMENT_COLS columns to avoid leaving stale values
  const paddedValues: string[] = Array.from({ length: JUDGMENT_COLS }, (_, i) => values[i] ?? "");
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSpreadsheetId,
    range: `${JUDGMENT_SHEET_NAME}!A${id}:${COL_LAST}${id}`,
    valueInputOption: "RAW",
    requestBody: { values: [paddedValues] },
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
