import { google, type sheets_v4 } from "googleapis";
import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * Google Sheets service for Tasks (المهام) records.
 * Uses a dedicated sheet tab named "Tasks" in the spreadsheet.
 */

const TASK_SHEET_NAME = "Tasks";

export const TASK_SHEET_COLUMNS = [
  "عنوان المهمة",
  "المكلف",
  "الأولوية",
  "تاريخ التسليم",
  "عدد الأيام المتبقية",
  "الحالة",
  "ملاحظات",
  "تاريخ الإنشاء",
] as const;

export const TASK_COLS = TASK_SHEET_COLUMNS.length; // 8
const COL_LAST = String.fromCharCode("A".charCodeAt(0) + TASK_COLS - 1); // "H"

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

let taskSheetIdCache: number | null = null;
let isTaskSheetReadyCache = false;

// In-memory data cache
let taskDataCache: { id: number; values: TaskRow }[] | null = null;
let lastTaskCacheTime = 0;
const TASK_CACHE_TTL_MS = 15000; // 15 seconds

export function invalidateTaskCache(): void {
  taskDataCache = null;
  lastTaskCacheTime = 0;
}

async function getTaskSheetId(): Promise<number> {
  if (taskSheetIdCache !== null) return taskSheetIdCache;
  const sheets = getClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: env.googleSpreadsheetId,
  });
  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === TASK_SHEET_NAME,
  );
  if (!sheet?.properties && sheet?.properties?.sheetId === undefined) {
    throw new Error(`Sheet tab "${TASK_SHEET_NAME}" not found.`);
  }
  taskSheetIdCache = sheet!.properties!.sheetId!;
  return taskSheetIdCache;
}

/** Ensures the "Tasks" sheet tab exists with the correct header row and formatting. */
export async function ensureTaskSheetReady(): Promise<void> {
  if (isTaskSheetReadyCache) return;

  try {
    const sheets = getClient();
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: env.googleSpreadsheetId,
    });
    const existing = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === TASK_SHEET_NAME,
    );

    if (!existing) {
      const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: env.googleSpreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: TASK_SHEET_NAME } } }],
        },
      });
      taskSheetIdCache = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
      logger.info(`Created sheet tab "${TASK_SHEET_NAME}"`);
    } else {
      taskSheetIdCache = existing.properties?.sheetId ?? null;
    }

    // 1. Write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.googleSpreadsheetId,
      range: `${TASK_SHEET_NAME}!A1:${COL_LAST}1`,
      valueInputOption: "RAW",
      requestBody: { values: [[...TASK_SHEET_COLUMNS]] },
    });

    isTaskSheetReadyCache = true;

    // 2. Format header row safely (non-blocking)
    if (taskSheetIdCache !== null) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: env.googleSpreadsheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId: taskSheetIdCache,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: TASK_COLS,
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
                  fields:
                    "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
                },
              },
            ],
          },
        });
      } catch (fmtErr) {
        logger.warn({ fmtErr }, "Non-fatal formatting warning for Tasks sheet");
      }
    }
  } catch (err) {
    logger.warn({ err }, "ensureTaskSheetReady warning");
    isTaskSheetReadyCache = true;
  }
}

export type TaskRow = string[];

/** Returns all Task records (excluding header row), using in-memory cache if fresh. */
export async function listTaskRowsWithHeaders(forceRefresh = false): Promise<{
  headers: string[];
  rows: { id: number; values: TaskRow }[];
}> {
  await ensureTaskSheetReady();

  const now = Date.now();
  const useCache =
    !forceRefresh &&
    taskDataCache !== null &&
    now - lastTaskCacheTime < TASK_CACHE_TTL_MS;

  try {
    const sheets = getClient();

    if (useCache) {
      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: env.googleSpreadsheetId,
        range: `${TASK_SHEET_NAME}!A1:${COL_LAST}1`,
      });
      const headers = ((headerRes.data.values?.[0] as string[]) ?? [...TASK_SHEET_COLUMNS]);
      return { headers, rows: taskDataCache! };
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.googleSpreadsheetId,
      range: `${TASK_SHEET_NAME}!A1:${COL_LAST}`,
    });
    const data = response.data.values ?? [];
    const headers = (data[0] as string[]) ?? [...TASK_SHEET_COLUMNS];
    const dataRows = data.slice(1);
    const rows = dataRows
      .map((row, index) => ({ id: index + 2, values: row as TaskRow }))
      .filter((row) => row.values.some((cell) => cell !== undefined && cell !== ""));

    taskDataCache = rows;
    lastTaskCacheTime = now;
    return { headers, rows };
  } catch (err) {
    logger.warn({ err }, "Failed to fetch Task rows from Google Sheets, returning cached/empty");
    return {
      headers: [...TASK_SHEET_COLUMNS],
      rows: taskDataCache ?? [],
    };
  }
}

/**
 * Appends a new Task record row and returns its 1-based row id.
 * Uses OVERWRITE (not INSERT_ROWS) to avoid inheriting header row formatting.
 */
export async function appendTaskRow(values: TaskRow): Promise<number> {
  invalidateTaskCache();
  const sheets = getClient();
  const paddedValues: string[] = Array.from({ length: TASK_COLS }, (_, i) => values[i] ?? "");
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: env.googleSpreadsheetId,
    range: `${TASK_SHEET_NAME}!A:${COL_LAST}`,
    valueInputOption: "RAW",
    insertDataOption: "OVERWRITE",
    requestBody: { values: [paddedValues] },
  });
  const updatedRange = response.data.updates?.updatedRange;
  const match = updatedRange?.match(/![A-Z]+(\d+):/);
  if (match) return Number(match[1]);
  const { rows } = await listTaskRowsWithHeaders();
  const last = rows[rows.length - 1];
  if (!last) throw new Error("Failed to determine id of newly created Task row.");
  return last.id;
}

/** Updates an existing Task row by its 1-based row id. */
export async function updateTaskRow(id: number, values: TaskRow): Promise<void> {
  invalidateTaskCache();
  const sheets = getClient();
  const paddedValues: string[] = Array.from({ length: TASK_COLS }, (_, i) => values[i] ?? "");
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSpreadsheetId,
    range: `${TASK_SHEET_NAME}!A${id}:${COL_LAST}${id}`,
    valueInputOption: "RAW",
    requestBody: { values: [paddedValues] },
  });
}

/** Deletes a Task row by its 1-based row id. */
export async function deleteTaskRow(id: number): Promise<void> {
  invalidateTaskCache();
  const sheets = getClient();
  const sheetId = await getTaskSheetId();
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
