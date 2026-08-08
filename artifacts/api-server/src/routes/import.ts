import { Router, type IRouter } from "express";
import multer from "multer";
import { db, employeesTable, documentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận file .xlsx, .xls hoặc .pdf"));
    }
  },
});

const router: IRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

const str = (v: unknown): string =>
  v === undefined || v === null ? "" : String(v).trim();

function toIsoDate(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const num = Number(raw);
  if (!isNaN(num) && num > 1000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
}

function docStatus(expiry: string | null): "valid" | "expiring" | "expired" | "pending" {
  if (!expiry) return "pending";
  const today = new Date().toISOString().slice(0, 10);
  if (expiry < today) return "expired";
  if ((new Date(expiry).getTime() - Date.now()) / 86400000 <= 60) return "expiring";
  return "valid";
}

function rowToEmployee(row: Record<string, string>) {
  const g = (key: string, ...aliases: string[]) => {
    for (const k of [key, ...aliases]) {
      if (row[k] !== undefined && row[k] !== "") return str(row[k]);
    }
    return "";
  };
  return {
    id:        g("ID", "id"),
    HO_TEN:    g("HO_TEN",    "T1",  "Họ tên", "Họ và tên", "fullName"),
    NGAY_SINH: g("NGAY_SINH", "T2",  "Ngày sinh", "dob"),
    GIOI_TINH: g("GIOI_TINH", "T3",  "Giới tính", "gender"),
    CCCD:      g("CCCD",      "T4",  "cccd", "Số CCCD"),
    SO_HC:     g("SO_HC",     "T5",  "Số hộ chiếu", "passportNo", "Số HC"),
    CAP_HC:    g("CAP_HC",    "T6",  "Ngày cấp HC", "passportIssueDate", "Cấp HC"),
    HH_HC:     g("HH_HC",     "T7",  "Hết hạn HC", "passportExpiry", "HH HC"),
    MA_NV:     g("MA_NV",     "T8",  "Mã số NV", "Mã nhân viên", "employeeCode"),
    QUOC_TICH: g("QUOC_TICH", "T9",  "Quốc tịch", "nationality"),
    CHUC_VU:   g("CHUC_VU",   "T10", "Chức vụ", "position"),
    SO_TRC:    g("SO_TRC",    "T11", "Thẻ tạm trú", "Số TRC"),
    HH_TRC:    g("HH_TRC",    "T12", "Hạn thẻ tạm trú", "Hết hạn TRC", "HH TRC"),
    DIA_CHI:   g("DIA_CHI",   "T13", "Địa chỉ tạm trú", "tempAddress"),
    SO_VISA:   g("SO_VISA",   "T14", "Số Visa", "visaNo", "Visa"),
    TGCT:      g("TGCT",      "T15", "Thời gian công tác", "workPeriod", "Thời gian CT"),
    CAP_VISA:  g("CAP_VISA",  "T16", "Ngày cấp Visa", "visaIssueDate", "Cấp Visa"),
    HH_VISA:   g("HH_VISA",   "T17", "Hết hạn Visa", "visaExpiry", "HH Visa"),
    company:   g("Công ty",   "company"),
    phone:     g("SĐT",       "phone"),
    capTRC:    g("Cấp TRC",   "capTRC"),
    soGPLD:    g("Số GPLD",   "soGPLD"),
    capGPLD:   g("Cấp GPLD",  "capGPLD"),
    hhGPLD:    g("HH GPLD",   "hhGPLD"),
    soSKSK:    g("Số SKSK",   "soSKSK"),
    capSKSK:   g("Cấp SKSK",  "capSKSK"),
    hhSKSK:    g("HH SKSK",   "hhSKSK"),
    soLLTP:    g("Số LLTP",   "soLLTP"),
    capLLTP:   g("Cấp LLTP",  "capLLTP"),
    hhLLTP:    g("HH LLTP",   "hhLLTP"),
    soXNTT:    g("Số XNTT",   "soXNTT"),
    capXNTT:   g("Cấp XNTT",  "capXNTT"),
    hhXNTT:    g("HH XNTT",   "hhXNTT"),
  };
}

// ── Parse Excel ────────────────────────────────────────────────────────────

async function parseExcel(buf: Buffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });
  return rawRows.map((r) =>
    rowToEmployee(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str(v)])))
  );
}

// ── Parse PDF ─────────────────────────────────────────────────────────────

async function parsePdf(buf: Buffer) {
  const pdfModule = await import("pdf-parse");
  const pdfParse = (pdfModule as any).default ?? pdfModule;
  const data = await pdfParse(buf);
  const lines = data.text.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const rows: ReturnType<typeof rowToEmployee>[] = [];

  // Support both old T1-T17 and new named tags in PDF format
  const tagPattern = /^(T\d{1,2}|HO_TEN|NGAY_SINH|GIOI_TINH|CCCD|SO_HC|CAP_HC|HH_HC|MA_NV|QUOC_TICH|CHUC_VU|SO_TRC|HH_TRC|DIA_CHI|SO_VISA|TGCT|CAP_VISA|HH_VISA)[:\s]+(.+)$/;
  const tagMap: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(tagPattern);
    if (m) tagMap[m[1]] = m[2].trim();
  }
  if (Object.keys(tagMap).length >= 3) {
    rows.push(rowToEmployee(tagMap));
    return rows;
  }

  const tableRows = lines.filter((l: string) => /\t|\|/.test(l));
  if (tableRows.length >= 2) {
    const sep = tableRows[0].includes("\t") ? "\t" : "|";
    const headers = tableRows[0].split(sep).map((h: string) => h.trim());
    for (let i = 1; i < tableRows.length; i++) {
      const cells = tableRows[i].split(sep).map((c: string) => c.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h: string, idx: number) => { obj[h] = cells[idx] ?? ""; });
      rows.push(rowToEmployee(obj));
    }
    if (rows.length > 0) return rows;
  }

  const pairMap: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (m) pairMap[m[1].trim()] = m[2].trim();
  }
  if (Object.keys(pairMap).length >= 3) rows.push(rowToEmployee(pairMap));
  return rows;
}

// ── Zod schemas ───────────────────────────────────────────────────────────

const ImportRowSchema = z.object({
  id:        z.string().optional().default(""),
  HO_TEN:    z.string(), NGAY_SINH: z.string(), GIOI_TINH: z.string(), CCCD:    z.string(),
  SO_HC:     z.string(), CAP_HC:    z.string(), HH_HC:     z.string(), MA_NV:   z.string(),
  QUOC_TICH: z.string(), CHUC_VU:   z.string(), SO_TRC:    z.string(), HH_TRC:  z.string(),
  DIA_CHI:   z.string(), SO_VISA:   z.string(), TGCT:      z.string(), CAP_VISA: z.string(),
  HH_VISA:   z.string(),
  company:  z.string().optional().default(""),
  phone:    z.string().optional().default(""),
  capTRC:   z.string().optional().default(""),
  soGPLD:   z.string().optional().default(""),
  capGPLD:  z.string().optional().default(""),
  hhGPLD:   z.string().optional().default(""),
  soSKSK:   z.string().optional().default(""),
  capSKSK:  z.string().optional().default(""),
  hhSKSK:   z.string().optional().default(""),
  soLLTP:   z.string().optional().default(""),
  capLLTP:  z.string().optional().default(""),
  hhLLTP:   z.string().optional().default(""),
  soXNTT:   z.string().optional().default(""),
  capXNTT:  z.string().optional().default(""),
  hhXNTT:   z.string().optional().default(""),
});

const ConfirmBodySchema = z.object({ rows: z.array(ImportRowSchema) });

// ── Upsert a single document for an employee ──────────────────────────────

async function upsertDoc(
  employeeId: number,
  docType: string,
  idNumber: string | null,
  issueDate: string | null,
  expiryDate: string | null,
) {
  if (!idNumber && !issueDate && !expiryDate) return;
  const status = docStatus(expiryDate);
  const [existingDoc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.employeeId, employeeId))
    .then((rows) => rows.filter((r) => r.docType === docType));

  if (existingDoc) {
    await db.update(documentsTable).set({
      idNumber:   idNumber   ?? existingDoc.idNumber,
      issueDate:  issueDate  ?? existingDoc.issueDate,
      expiryDate: expiryDate ?? existingDoc.expiryDate,
      status,
    }).where(eq(documentsTable.id, existingDoc.id));
  } else {
    await db.insert(documentsTable).values({
      employeeId,
      docType,
      idNumber,
      issueDate,
      expiryDate,
      status,
    });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────

router.post("/import-employees/parse", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Thiếu file" }); return; }
  try {
    const name = req.file.originalname.toLowerCase();
    const rows = name.endsWith(".pdf")
      ? await parsePdf(req.file.buffer)
      : await parseExcel(req.file.buffer);
    const filtered = rows.filter((r) => r.HO_TEN || r.SO_HC || r.QUOC_TICH);
    res.json({ rows: filtered, total: filtered.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    res.status(400).json({ error: `Không thể đọc file: ${msg}` });
  }
});

router.post("/import-employees/confirm", async (req, res): Promise<void> => {
  const parsed = ConfirmBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Dữ liệu không hợp lệ" }); return; }

  const results: {
    index: number;
    status: "ok" | "error";
    mode?: "created" | "updated";
    employeeId?: number;
    name?: string;
    error?: string;
  }[] = [];

  for (let i = 0; i < parsed.data.rows.length; i++) {
    const row = parsed.data.rows[i];
    try {
      const genderVal = ["Nam", "Nữ", "Khác"].includes(row.GIOI_TINH) ? row.GIOI_TINH : null;
      const empId = row.id ? parseInt(row.id, 10) : NaN;
      const isUpdate = !isNaN(empId) && empId > 0;

      let finalEmpId: number;
      let mode: "created" | "updated";

      if (isUpdate) {
        // ── UPDATE existing employee ──────────────────────────────────────
        const updatePayload: Record<string, unknown> = {};
        if (row.HO_TEN)    updatePayload.fullName     = row.HO_TEN;
        if (row.NGAY_SINH) updatePayload.dob          = toIsoDate(row.NGAY_SINH);
        if (genderVal)     updatePayload.gender       = genderVal;
        if (row.QUOC_TICH) updatePayload.nationality  = row.QUOC_TICH;
        if (row.CCCD)      updatePayload.cccd         = row.CCCD;
        if (row.SO_HC)     updatePayload.passportNo   = row.SO_HC;
        if (row.HH_HC)     updatePayload.passportExpiry = toIsoDate(row.HH_HC);
        if (row.SO_VISA)   updatePayload.visaNo       = row.SO_VISA;
        if (row.CHUC_VU)   updatePayload.position     = row.CHUC_VU;
        if (row.DIA_CHI)   updatePayload.tempAddress  = row.DIA_CHI;
        if (row.MA_NV)     updatePayload.employeeCode = row.MA_NV;
        if (row.TGCT)      updatePayload.workPeriod   = row.TGCT;
        if (row.company)   updatePayload.company      = row.company;
        if (row.phone)     updatePayload.phone        = row.phone;

        if (Object.keys(updatePayload).length > 0) {
          await db.update(employeesTable).set(updatePayload).where(eq(employeesTable.id, empId));
        }
        finalEmpId = empId;
        mode = "updated";
      } else {
        // ── INSERT new employee ───────────────────────────────────────────
        const [emp] = await db.insert(employeesTable).values({
          fullName:      row.HO_TEN    || "Không rõ",
          dob:           toIsoDate(row.NGAY_SINH),
          gender:        genderVal,
          nationality:   row.QUOC_TICH || "Trung Quốc",
          cccd:          row.CCCD      || null,
          passportNo:    row.SO_HC     || null,
          passportExpiry: toIsoDate(row.HH_HC),
          visaNo:        row.SO_VISA   || null,
          visaExpiry:    null,
          company:       row.company   || null,
          position:      row.CHUC_VU   || null,
          phone:         row.phone     || null,
          employeeCode:  row.MA_NV     || null,
          workPeriod:    row.TGCT      || null,
          email:         null,
          tempAddress:   row.DIA_CHI   || null,
          status:        "active",
        }).returning();
        finalEmpId = emp.id;
        mode = "created";
      }

      // ── Upsert documents ──────────────────────────────────────────────
      if (row.SO_HC || row.CAP_HC || row.HH_HC) {
        await upsertDoc(finalEmpId, "Hộ chiếu", row.SO_HC || null, toIsoDate(row.CAP_HC), toIsoDate(row.HH_HC));
      }
      if (row.SO_TRC || row.capTRC || row.HH_TRC) {
        await upsertDoc(finalEmpId, "Thẻ tạm trú (TRC)", row.SO_TRC || null, toIsoDate(row.capTRC), toIsoDate(row.HH_TRC));
      }
      if (row.SO_VISA || row.CAP_VISA || row.HH_VISA) {
        await upsertDoc(finalEmpId, "Visa", row.SO_VISA || null, toIsoDate(row.CAP_VISA), toIsoDate(row.HH_VISA));
      }
      if (row.soGPLD || row.capGPLD || row.hhGPLD) {
        await upsertDoc(finalEmpId, "Giấy phép lao động", row.soGPLD || null, toIsoDate(row.capGPLD), toIsoDate(row.hhGPLD));
      }
      if (row.soSKSK || row.capSKSK || row.hhSKSK) {
        await upsertDoc(finalEmpId, "Giấy khám sức khỏe", row.soSKSK || null, toIsoDate(row.capSKSK), toIsoDate(row.hhSKSK));
      }
      if (row.soLLTP || row.capLLTP || row.hhLLTP) {
        await upsertDoc(finalEmpId, "Lý lịch tư pháp (LLTP)", row.soLLTP || null, toIsoDate(row.capLLTP), toIsoDate(row.hhLLTP));
      }
      if (row.soXNTT || row.capXNTT || row.hhXNTT) {
        await upsertDoc(finalEmpId, "Xác nhận tạm trú", row.soXNTT || null, toIsoDate(row.capXNTT), toIsoDate(row.hhXNTT));
      }

      results.push({ index: i, status: "ok", mode, employeeId: finalEmpId, name: row.HO_TEN });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      results.push({ index: i, status: "error", name: row.HO_TEN, error: msg });
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const errors = results.filter((r) => r.status === "error").length;
  res.json({ results, ok, errors });
});

export default router;
