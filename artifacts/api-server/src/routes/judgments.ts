import { Router, type IRouter } from "express";
import { attachAuthUser, requireAuth } from "../middlewares/auth.middleware";
import { logger } from "../lib/logger";
import {
  ensureJudgmentSheetReady,
  listJudgmentRowsWithHeaders,
  appendJudgmentRow,
  updateJudgmentRow,
  deleteJudgmentRow,
  JUDGMENT_SHEET_COLUMNS,
} from "../services/judgment.sheets.service";

const router: IRouter = Router();

export interface JudgmentRecord {
  id: number;
  caseNumber: string;
  court: string;
  plaintiff: string;
  defendant: string;
  assignedLawyer: string;
  judgmentNumber: string;
  judgmentDate: string;
  summary: string;
  isFavorable: "نهائي" | "ابتدائي" | string;
  createdAt: string;
}

function normalizeJudgmentType(val: string): "نهائي" | "ابتدائي" {
  const trimmed = (val || "").trim();
  if (trimmed === "ابتدائي" || trimmed === "لا") return "ابتدائي";
  return "نهائي";
}

/**
 * Maps a raw row from Google Sheets to a JudgmentRecord.
 * Automatically detects whether the row is in the legacy 9-column layout
 * or the canonical 10-column layout (with caseNumber at Col A).
 */
function rowToRecord(id: number, values: string[]): JudgmentRecord {
  const isJudgmentType = (v?: string) => {
    const t = (v || "").trim();
    return t === "نهائي" || t === "ابتدائي" || t === "نعم" || t === "لا";
  };

  // Legacy 9-column row detection:
  // In legacy rows, values[7] is the judgment result ("نهائي"/"ابتدائي"/"نعم"/"لا"),
  // values[8] is NOT a judgment result, and total length is <= 9.
  const isLegacy9ColRow =
    isJudgmentType(values[7]) &&
    !isJudgmentType(values[8]) &&
    values.length <= 9 &&
    !/^\d+$/.test((values[0] || "").trim());

  if (isLegacy9ColRow) {
    return {
      id,
      caseNumber: "",
      court: values[0] || "",
      plaintiff: values[1] || "",
      defendant: values[2] || "",
      assignedLawyer: values[3] || "",
      judgmentNumber: values[4] || "",
      judgmentDate: values[5] || "",
      summary: values[6] || "",
      isFavorable: normalizeJudgmentType(values[7]),
      createdAt: values[8] || new Date().toISOString(),
    };
  }

  // Canonical 10-column layout:
  // Col A (0) = caseNumber, Col B (1) = court, Col C (2) = plaintiff, Col D (3) = defendant,
  // Col E (4) = assignedLawyer, Col F (5) = judgmentNumber, Col G (6) = judgmentDate,
  // Col H (7) = summary, Col I (8) = isFavorable, Col J (9) = createdAt
  return {
    id,
    caseNumber: values[0] || "",
    court: values[1] || "",
    plaintiff: values[2] || "",
    defendant: values[3] || "",
    assignedLawyer: values[4] || "",
    judgmentNumber: values[5] || "",
    judgmentDate: values[6] || "",
    summary: values[7] || "",
    isFavorable: normalizeJudgmentType(values[8]),
    createdAt: values[9] || new Date().toISOString(),
  };
}

/**
 * Converts a JudgmentRecord back to a row array ordered by JUDGMENT_SHEET_COLUMNS.
 * Always outputs exactly 10 values in the canonical column order.
 */
function recordToRow(record: Omit<JudgmentRecord, "id">): string[] {
  return [
    record.caseNumber || "",           // A: رقم القضية
    record.court || "",                // B: المحكمة المختصة
    record.plaintiff || "",            // C: المدعي
    record.defendant || "",            // D: المدعى عليه
    record.assignedLawyer || "",       // E: المحامي المكلف
    record.judgmentNumber || "",       // F: رقم الصك
    record.judgmentDate || "",         // G: تاريخ الحكم
    record.summary || "",              // H: ملخص الحكم
    normalizeJudgmentType(record.isFavorable), // I: الحكم
    record.createdAt || new Date().toISOString(), // J: تاريخ الإنشاء
  ];
}

// Sanity check: ensure JUDGMENT_SHEET_COLUMNS hasn't drifted from recordToRow order
const _EXPECTED_COLS = ["رقم القضية","المحكمة المختصة","المدعي","المدعى عليه","المحامي المكلف","رقم الصك","تاريخ الحكم","ملخص الحكم","الحكم","تاريخ الإنشاء"];
if (JUDGMENT_SHEET_COLUMNS.join(",") !== _EXPECTED_COLS.join(",")) {
  logger.warn("JUDGMENT_SHEET_COLUMNS order mismatch — recordToRow may write to wrong columns!");
}

/**
 * GET /api/judgments
 * Lists all Judgment records from the "Judgment" sheet.
 */
router.get("/judgments", attachAuthUser, requireAuth, async (req, res) => {
  try {
    await ensureJudgmentSheetReady();
    const forceRefresh = req.query.refresh === "true";
    const { rows } = await listJudgmentRowsWithHeaders(forceRefresh);
    const records = rows.map(({ id, values }) => rowToRecord(id, values));
    res.json(records);
  } catch (err) {
    logger.error({ err }, "Failed to list Judgment records");
    res.status(500).json({ error: "فشل تحميل بيانات الأحكام." });
  }
});

/**
 * GET /api/judgments/:id
 * Gets a single Judgment record by row id.
 */
router.get("/judgments/:id", attachAuthUser, requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف الصف غير صالح." });
    return;
  }
  try {
    await ensureJudgmentSheetReady();
    const { rows } = await listJudgmentRowsWithHeaders();
    const match = rows.find((r) => r.id === id);
    if (!match) {
      res.status(404).json({ error: "الحكم غير موجود." });
      return;
    }
    res.json(rowToRecord(match.id, match.values));
  } catch (err) {
    logger.error({ err }, "Failed to get Judgment record");
    res.status(500).json({ error: "فشل تحميل بيانات الحكم." });
  }
});

/**
 * POST /api/judgments
 * Creates a new Judgment record in the "Judgment" sheet.
 */
router.post("/judgments", attachAuthUser, requireAuth, async (req, res) => {
  const body = req.body as Partial<JudgmentRecord>;
  if (!body.judgmentNumber?.trim()) {
    res.status(400).json({ error: "رقم الصك مطلوب." });
    return;
  }
  try {
    await ensureJudgmentSheetReady();
    const recordPayload: Omit<JudgmentRecord, "id"> = {
      caseNumber: body.caseNumber?.trim() || "",
      court: body.court?.trim() || "",
      plaintiff: body.plaintiff?.trim() || "",
      defendant: body.defendant?.trim() || "",
      assignedLawyer: body.assignedLawyer?.trim() || "",
      judgmentNumber: body.judgmentNumber.trim(),
      judgmentDate: body.judgmentDate?.trim() || "",
      summary: body.summary?.trim() || "",
      isFavorable: normalizeJudgmentType(body.isFavorable || "نهائي"),
      createdAt: new Date().toISOString(),
    };
    const rowId = await appendJudgmentRow(recordToRow(recordPayload));
    logger.info({ rowId }, "Judgment record created");
    res.status(201).json({ id: rowId, ...recordPayload });
  } catch (err) {
    logger.error({ err }, "Failed to create Judgment record");
    res.status(500).json({ error: "فشل حفظ الحكم." });
  }
});

/**
 * PUT /api/judgments/:id
 * Updates an existing Judgment record. :id is the 1-based sheet row number.
 */
router.put("/judgments/:id", attachAuthUser, requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف الصف غير صالح." });
    return;
  }
  const body = req.body as Partial<JudgmentRecord>;
  try {
    await ensureJudgmentSheetReady();
    const { rows } = await listJudgmentRowsWithHeaders();
    const existing = rows.find((r) => r.id === id);
    if (!existing) {
      res.status(404).json({ error: "الحكم غير موجود." });
      return;
    }
    const existingRecord = rowToRecord(id, existing.values);
    const updatedPayload: Omit<JudgmentRecord, "id"> = {
      caseNumber: body.caseNumber !== undefined ? body.caseNumber.trim() : existingRecord.caseNumber,
      court: body.court !== undefined ? body.court.trim() : existingRecord.court,
      plaintiff: body.plaintiff !== undefined ? body.plaintiff.trim() : existingRecord.plaintiff,
      defendant: body.defendant !== undefined ? body.defendant.trim() : existingRecord.defendant,
      assignedLawyer: body.assignedLawyer !== undefined ? body.assignedLawyer.trim() : existingRecord.assignedLawyer,
      judgmentNumber: body.judgmentNumber !== undefined ? body.judgmentNumber.trim() : existingRecord.judgmentNumber,
      judgmentDate: body.judgmentDate !== undefined ? body.judgmentDate.trim() : existingRecord.judgmentDate,
      summary: body.summary !== undefined ? body.summary.trim() : existingRecord.summary,
      isFavorable: body.isFavorable !== undefined ? normalizeJudgmentType(body.isFavorable) : existingRecord.isFavorable,
      createdAt: existingRecord.createdAt,
    };
    await updateJudgmentRow(id, recordToRow(updatedPayload));
    logger.info({ id }, "Judgment record updated");
    res.json({ id, ...updatedPayload });
  } catch (err) {
    logger.error({ err }, "Failed to update Judgment record");
    res.status(500).json({ error: "فشل تحديث الحكم." });
  }
});

/**
 * DELETE /api/judgments/:id
 * Deletes a Judgment record by its 1-based sheet row id.
 */
router.delete("/judgments/:id", attachAuthUser, requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف الصف غير صالح." });
    return;
  }
  try {
    await deleteJudgmentRow(id);
    logger.info({ id }, "Judgment record deleted");
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Failed to delete Judgment record");
    res.status(500).json({ error: "فشل حذف الحكم." });
  }
});

export default router;
