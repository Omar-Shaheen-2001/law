import type { Session, SessionInput, SessionUpdate, SessionStatus } from "@workspace/api-client-react";
import {
  appendRow,
  deleteRow,
  ensureSheetReady,
  listRows,
  SHEET_COLUMNS,
  updateRow,
  updateRowCells,
  type SheetRow,
} from "./googleSheets.service";
import { computeHearingDateTime, parseHijriDateString, hijriToGregorian } from "../utils/hijri";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { listPoaRows } from "./poa.sheets.service";
import { listJudgmentRows } from "./judgment.sheets.service";

const COLUMN_INDEX: Record<string, number> = {
  // Arabic headers
  "رقم القضية": 0,
  "المدعي": 1,
  "المدعى عليه": 2,
  "المحكمة": 3,
  "الدائرة القضائية": 4,
  "موضوع القضية": 5,
  "نوع الجلسة": 6,
  "تاريخ الجلسة هجري": 7,
  "يوم الجلسة": 8,
  "وقت الجلسة": 9,
  "الأيام المتبقية": 10,
  "ملاحظات": 11,
  "حالة الجلسة": 12,
  "تذكير 24 ساعة": 13,
  "تذكير 6 ساعات": 14,
  "تاريخ الإنشاء": 15,
  "التقرير": 16,

  // English header aliases
  "Case Number": 0,
  "Plaintiff": 1,
  "Defendant": 2,
  "Court": 3,
  "Court Circuit": 4,
  "Case Subject": 5,
  "Session Type": 6,
  "Session Date Hijri": 7,
  "Session Day": 8,
  "Session Time": 9,
  "Days Remaining": 10,
  "Notes": 11,
  "Status": 12,
  "Reminder24": 13,
  "Reminder6": 14,
  "Created At": 15,
  "Report": 16,
};

function cell(row: SheetRow, name: string): string {
  const index = COLUMN_INDEX[name];
  return index !== undefined ? (row[index] ?? "") : "";
}

function nullableString(value: string): string | null {
  return value === "" ? null : value;
}

const VALID_STATUSES = new Set<SessionStatus>(["Upcoming", "Today", "Finished", "Cancelled"]);

function parseStatus(raw: string): SessionStatus {
  if (VALID_STATUSES.has(raw as SessionStatus)) {
    return raw as SessionStatus;
  }
  return "Upcoming";
}

const ARABIC_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function computeSessionDayStr(
  sessionDateHijri: string | null | undefined,
  sessionTime: string | null | undefined,
): string {
  const hearingAt = computeHearingDateTime(sessionDateHijri, sessionTime);
  if (hearingAt) {
    return ARABIC_DAYS[hearingAt.getUTCDay()] ?? "—";
  }
  const hijri = parseHijriDateString(sessionDateHijri);
  if (!hijri) return "—";
  const greg = hijriToGregorian(hijri);
  if (!greg) return "—";
  const date = new Date(Date.UTC(greg.year, greg.month - 1, greg.day));
  return ARABIC_DAYS[date.getUTCDay()] ?? "—";
}

function rowToSession(id: number, row: SheetRow): Session {
  const sessionDateHijri = nullableString(cell(row, "Session Date Hijri"));
  const sessionTime = nullableString(cell(row, "Session Time"));
  const hearingDate = computeHearingDateTime(sessionDateHijri, sessionTime);
  const rawSessionDay = nullableString(cell(row, "Session Day"));
  const sessionDay = rawSessionDay || computeSessionDayStr(sessionDateHijri, sessionTime);
  return {
    id,
    caseNumber: nullableString(cell(row, "Case Number")),
    plaintiff: nullableString(cell(row, "Plaintiff")),
    defendant: nullableString(cell(row, "Defendant")),
    court: nullableString(cell(row, "Court")),
    courtCircuit: nullableString(cell(row, "Court Circuit")),
    caseSubject: nullableString(cell(row, "Case Subject")),
    sessionType: nullableString(cell(row, "Session Type")),
    sessionDateHijri,
    sessionDay: sessionDay && sessionDay !== "—" ? sessionDay : null,
    sessionTime,
    notes: nullableString(cell(row, "Notes")),
    status: parseStatus(cell(row, "Status")),
    reminder24: cell(row, "Reminder24") === "true",
    reminder6: cell(row, "Reminder6") === "true",
    createdAt: cell(row, "Created At") || new Date().toISOString(),
    hearingAt: hearingDate ? hearingDate.toISOString() : null,
  };
}

export function computeDaysRemainingStr(
  sessionDateHijri: string | null | undefined,
  sessionTime: string | null | undefined,
): string {
  let hearingAt = computeHearingDateTime(sessionDateHijri, sessionTime);
  if (!hearingAt) {
    const hijri = parseHijriDateString(sessionDateHijri);
    if (!hijri) return "—";
    const greg = hijriToGregorian(hijri);
    if (!greg) return "—";
    hearingAt = new Date(Date.UTC(greg.year, greg.month - 1, greg.day));
  }

  const offsetHours = env.courtTimezoneOffsetHours;
  const nowMecca = new Date(Date.now() + offsetHours * 3600 * 1000);
  const hearingMecca = new Date(hearingAt.getTime() + offsetHours * 3600 * 1000);

  const hearingYear = hearingMecca.getUTCFullYear();
  const hearingMonth = hearingMecca.getUTCMonth();
  const hearingDay = hearingMecca.getUTCDate();

  const nowYear = nowMecca.getUTCFullYear();
  const nowMonth = nowMecca.getUTCMonth();
  const nowDay = nowMecca.getUTCDate();

  const hearingMidnight = Date.UTC(hearingYear, hearingMonth, hearingDay);
  const nowMidnight = Date.UTC(nowYear, nowMonth, nowDay);

  const diffMs = hearingMidnight - nowMidnight;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "اليوم";
  if (diffDays < 0) return `انتهت (منذ ${Math.abs(diffDays)} يوم)`;
  return `${diffDays} يوم`;
}

function sessionInputToRow(input: SessionInput, createdAt: string): SheetRow {
  const daysRemaining = computeDaysRemainingStr(input.sessionDateHijri, input.sessionTime);
  const sessionDay = computeSessionDayStr(input.sessionDateHijri, input.sessionTime);
  return [
    input.caseNumber ?? "",              // 0: رقم القضية
    input.plaintiff ?? "",               // 1: المدعي
    input.defendant ?? "",               // 2: المدعى عليه
    input.court ?? "",                   // 3: المحكمة
    input.courtCircuit ?? "",            // 4: الدائرة القضائية
    input.caseSubject ?? "",             // 5: موضوع القضية
    input.sessionType ?? "",             // 6: نوع الجلسة
    input.sessionDateHijri ?? "",        // 7: تاريخ الجلسة هجري
    sessionDay,                          // 8: يوم الجلسة
    input.sessionTime ?? "",             // 9: وقت الجلسة
    daysRemaining,                       // 10: الأيام المتبقية
    input.notes ?? "",                    // 11: ملاحظات
    "Upcoming",                          // 12: حالة الجلسة
    "false",                             // 13: تذكير 24 ساعة
    "false",                             // 14: تذكير 6 ساعات
    createdAt,                           // 15: تاريخ الإنشاء
    "",                                  // 16: التقرير
  ];
}

/** Derives dashboard-facing status from the stored status + parsed hearing date, without persisting anything. */
function deriveEffectiveStatus(session: Session): SessionStatus {
  if (session.status === "Cancelled" || session.status === "Finished") {
    return session.status;
  }
  const hearingAt = computeHearingDateTime(
    session.sessionDateHijri,
    session.sessionTime,
  );
  if (!hearingAt) {
    return session.status;
  }
  const now = new Date();
  if (hearingAt.getTime() < now.getTime()) {
    return "Finished";
  }
  const offsetHours = env.courtTimezoneOffsetHours;
  const meccaHearing = new Date(hearingAt.getTime() + offsetHours * 3600 * 1000);
  const meccaNow = new Date(now.getTime() + offsetHours * 3600 * 1000);
  const isSameDay =
    meccaHearing.getUTCFullYear() === meccaNow.getUTCFullYear() &&
    meccaHearing.getUTCMonth() === meccaNow.getUTCMonth() &&
    meccaHearing.getUTCDate() === meccaNow.getUTCDate();
  return isSameDay ? "Today" : "Upcoming";
}

export function sortSessionsByNearestTime(sessions: Session[]): Session[] {
  const now = Date.now();

  return [...sessions].sort((a, b) => {
    const timeA = a.hearingAt ? new Date(a.hearingAt).getTime() : null;
    const timeB = b.hearingAt ? new Date(b.hearingAt).getTime() : null;

    const validA = timeA !== null && !isNaN(timeA);
    const validB = timeB !== null && !isNaN(timeB);

    if (validA && validB) {
      const isPastA = timeA! < now;
      const isPastB = timeB! < now;

      if (!isPastA && isPastB) return -1;
      if (isPastA && !isPastB) return 1;

      if (!isPastA && !isPastB) {
        return timeA! - timeB!;
      }

      if (isPastA && isPastB) {
        return timeB! - timeA!;
      }
    }

    if (validA && !validB) return -1;
    if (!validA && validB) return 1;

    return (b.id ?? 0) - (a.id ?? 0);
  });
}

export async function listSessions(statusFilter?: SessionStatus): Promise<Session[]> {
  await ensureSheetReady();
  const rows = await listRows();
  let sessions = rows
    .map(({ id, values }) => {
      const s = rowToSession(id, values);
      const expectedDay = computeSessionDayStr(s.sessionDateHijri, s.sessionTime);
      const expectedRemaining = computeDaysRemainingStr(s.sessionDateHijri, s.sessionTime);

      const currentDayCell = cell(values, "Session Day");
      const currentRemainingCell = cell(values, "Days Remaining");

      if (currentDayCell !== expectedDay || currentRemainingCell !== expectedRemaining) {
        updateRowCells(id, {
          [COLUMN_INDEX["Days Remaining"]]: expectedRemaining,
          [COLUMN_INDEX["Session Day"]]: expectedDay,
        }).catch((err) => logger.warn({ err, id }, "Failed to auto-sync row cells"));
      }
      return s;
    });

  if (statusFilter) {
    sessions = sessions.filter((s) => deriveEffectiveStatus(s) === statusFilter);
  }

  return sortSessionsByNearestTime(sessions);
}

export async function getSessionById(id: number): Promise<Session | null> {
  const rows = await listRows();
  const match = rows.find((r) => r.id === id);
  return match ? rowToSession(match.id, match.values) : null;
}

export async function createSession(input: SessionInput): Promise<Session> {
  await ensureSheetReady();
  const createdAt = new Date().toISOString();
  const row = sessionInputToRow(input, createdAt);
  const id = await appendRow(row);
  return rowToSession(id, row);
}

export async function updateSession(
  id: number,
  patch: SessionUpdate,
): Promise<Session | null> {
  const rows = await listRows();
  const match = rows.find((r) => r.id === id);
  if (!match) {
    return null;
  }
  const existing = rowToSession(id, match.values);
  const existingReport = match.values[COLUMN_INDEX["Report"]] ?? "";

  const merged: Session = {
    ...existing,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ),
  };
  const daysRemaining = computeDaysRemainingStr(merged.sessionDateHijri, merged.sessionTime);
  const sessionDay = computeSessionDayStr(merged.sessionDateHijri, merged.sessionTime);
  const row: SheetRow = [
    merged.caseNumber ?? "",             // 0: رقم القضية
    merged.plaintiff ?? "",              // 1: المدعي
    merged.defendant ?? "",              // 2: المدعى عليه
    merged.court ?? "",                  // 3: المحكمة
    merged.courtCircuit ?? "",           // 4: الدائرة القضائية
    merged.caseSubject ?? "",            // 5: موضوع القضية
    merged.sessionType ?? "",            // 6: نوع الجلسة
    merged.sessionDateHijri ?? "",       // 7: تاريخ الجلسة هجري
    sessionDay,                          // 8: يوم الجلسة
    merged.sessionTime ?? "",            // 9: وقت الجلسة
    daysRemaining,                       // 10: الأيام المتبقية
    merged.notes ?? "",                  // 11: ملاحظات
    merged.status,                       // 12: حالة الجلسة
    String(merged.reminder24),           // 13: تذكير 24 ساعة
    String(merged.reminder6),            // 14: تذكير 6 ساعات
    merged.createdAt,                    // 15: تاريخ الإنشاء
    existingReport,                      // 16: التقرير
  ];
  await updateRow(id, row);
  return merged;
}

export async function deleteSession(id: number): Promise<boolean> {
  const existing = await getSessionById(id);
  if (!existing) {
    return false;
  }
  await deleteRow(id);
  return true;
}

export interface DashboardStats {
  totalCases: number;
  todayHearings: number;
  upcomingHearings: number;
  finishedHearings: number;
  totalPoas: number;
  favorableJudgments: number;
  unfavorableJudgments: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [sessionsRes, poaRes, judgmentRes] = await Promise.allSettled([
    listSessions(),
    listPoaRows(),
    listJudgmentRows(),
  ]);

  const sessions = sessionsRes.status === "fulfilled" ? sessionsRes.value : [];
  const poaRows = poaRes.status === "fulfilled" ? poaRes.value : [];
  const judgmentRows = judgmentRes.status === "fulfilled" ? judgmentRes.value : [];

  if (sessionsRes.status === "rejected") {
    logger.warn({ err: sessionsRes.reason }, "Failed to load sessions for dashboard stats");
  }
  if (poaRes.status === "rejected") {
    logger.warn({ err: poaRes.reason }, "Failed to load POA rows for dashboard stats");
  }
  if (judgmentRes.status === "rejected") {
    logger.warn({ err: judgmentRes.reason }, "Failed to load Judgment rows for dashboard stats");
  }

  let todayHearings = 0;
  let upcomingHearings = 0;
  let finishedHearings = 0;
  for (const session of sessions) {
    const effective = deriveEffectiveStatus(session);
    if (effective === "Today") todayHearings += 1;
    else if (effective === "Upcoming") upcomingHearings += 1;
    else if (effective === "Finished") finishedHearings += 1;
  }

  let favorableJudgments = 0;
  let unfavorableJudgments = 0;
  for (const row of judgmentRows) {
    const isFavorableVal = (row.values[7] || "").trim();
    if (isFavorableVal === "نعم") {
      favorableJudgments += 1;
    } else {
      unfavorableJudgments += 1;
    }
  }

  return {
    totalCases: sessions.length,
    todayHearings,
    upcomingHearings,
    finishedHearings,
    totalPoas: poaRows.length,
    favorableJudgments,
    unfavorableJudgments,
  };
}

/** Marks a session's Reminder24/Reminder6 flag as sent (used by the scheduler). */
export async function markReminderSent(
  id: number,
  kind: "24h" | "6h",
): Promise<void> {
  const columnName = kind === "24h" ? "Reminder24" : "Reminder6";
  await updateRowCells(id, { [COLUMN_INDEX[columnName]]: "true" });
}

// ─── Session Reports ──────────────────────────────────────────────────────────

export interface SessionReportData {
  reportNumber: string;
  lawyerName: string;
  summary: string;
  courtDecision: string;
  nextSessionDate: string;
  nextSessionTime: string;
  ourActionRequired: string;
  clientActionRequired: string;
  reportDate: string;
  createdAt: string;
  updatedAt: string;
}

/** Returns the saved report for a session, or null if none exists yet. */
export async function getSessionReport(id: number): Promise<SessionReportData | null> {
  await ensureSheetReady();
  const rows = await listRows();
  const match = rows.find((r) => r.id === id);
  if (!match) return null;
  const raw = match.values[COLUMN_INDEX["Report"]] ?? "";
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionReportData;
  } catch {
    return null;
  }
}

/** Creates or updates the report for a session. */
export async function upsertSessionReport(
  id: number,
  input: Partial<SessionReportData>,
): Promise<SessionReportData | null> {
  await ensureSheetReady();
  const existing = await getSessionById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const current = await getSessionReport(id);
  const updated: SessionReportData = {
    reportNumber: input.reportNumber ?? current?.reportNumber ?? "01",
    lawyerName: input.lawyerName ?? current?.lawyerName ?? "",
    summary: input.summary ?? current?.summary ?? "",
    courtDecision: input.courtDecision ?? current?.courtDecision ?? "",
    nextSessionDate: input.nextSessionDate ?? current?.nextSessionDate ?? "",
    nextSessionTime: input.nextSessionTime ?? current?.nextSessionTime ?? "",
    ourActionRequired: input.ourActionRequired ?? current?.ourActionRequired ?? "",
    clientActionRequired: input.clientActionRequired ?? current?.clientActionRequired ?? "",
    reportDate: input.reportDate ?? current?.reportDate ?? now.split("T")[0],
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };

  await updateRowCells(id, { [COLUMN_INDEX["Report"]]: JSON.stringify(updated) });
  return updated;
}
