import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
import { db, docxTemplatesTable, employeesTable, documentsTable } from "@workspace/db";
import {
  DeleteTemplateParams,
  GenerateDocsBody,
  ListTemplatesResponse,
  UploadTemplateResponse,
} from "@workspace/api-zod";
import { serializeDates } from "../lib/serialize";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

// ─── Legacy disk storage path (read-only for backward compat) ────────────────
const TEMPLATES_DIR = path.join(process.cwd(), "uploads", "templates");
fs.mkdirSync(TEMPLATES_DIR, { recursive: true });

// ─── Memory storage for new uploads (goes to GCS) ────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".docx") {
      cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận file .docx"));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

const storageService = new ObjectStorageService();

/** Returns true if the fileName is a private GCS object path */
function isObjectPath(fileName: string): boolean {
  return fileName.startsWith("/objects/");
}
/** Returns true if the fileName is a public App Storage path */
function isPublicObjectPath(fileName: string): boolean {
  return fileName.startsWith("/public-objects/");
}

/**
 * Read a template buffer from GCS private, GCS public, or legacy disk.
 */
async function readTemplateBuffer(fileName: string): Promise<Buffer> {
  if (isObjectPath(fileName)) {
    return storageService.downloadObjectEntityBuffer(fileName);
  }
  if (isPublicObjectPath(fileName)) {
    // /public-objects/templates/foo.docx → subPath = templates/foo.docx
    const subPath = fileName.slice("/public-objects/".length);
    return storageService.downloadPublicObjectBuffer(subPath);
  }
  return fs.readFileSync(path.join(TEMPLATES_DIR, fileName));
}

const router: IRouter = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function applyTimesNewRoman(xml: string): string {
  const tnr = "Times New Roman";
  const replacement = `<w:rFonts w:ascii="${tnr}" w:hAnsi="${tnr}" w:eastAsia="${tnr}" w:cs="${tnr}"/>`;
  xml = xml.replace(/<w:rFonts(?:\s[^>]*)?\s*\/>/g, replacement);
  xml = xml.replace(/<w:rFonts(?:\s[^>]*)?>.*?<\/w:rFonts>/gs, replacement);
  return xml;
}

function applyFontToZip(zip: import("pizzip")): void {
  for (const filename of ["word/document.xml", "word/styles.xml"]) {
    const file = zip.files[filename];
    if (!file) continue;
    zip.file(filename, applyTimesNewRoman(file.asText()));
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

router.get("/templates", async (_req, res): Promise<void> => {
  const rows = await db.select().from(docxTemplatesTable).orderBy(docxTemplatesTable.uploadedAt);
  res.json(ListTemplatesResponse.parse(rows.map(serializeDates)));
});

router.post("/templates", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "Thiếu file template" });
    return;
  }

  const { name, description } = req.body as { name?: string; description?: string };
  if (!name) {
    res.status(400).json({ error: "Thiếu tên template" });
    return;
  }

  // Try GCS first; fall back to disk when Object Storage is not configured
  let fileRef: string;
  if (process.env.PRIVATE_OBJECT_DIR) {
    try {
      fileRef = await storageService.uploadObjectEntityBuffer(
        req.file.buffer,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    } catch (err: any) {
      console.error("[template-upload] GCS upload failed:", err?.message ?? err);
      res.status(500).json({
        error: "Không thể tải template lên cloud storage",
        detail: err?.message ?? String(err),
      });
      return;
    }
  } else {
    // Disk fallback — save to uploads/templates/
    const safeName = `${Date.now()}-${Math.floor(Math.random() * 1e9)}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    fs.writeFileSync(path.join(TEMPLATES_DIR, safeName), req.file.buffer);
    fileRef = safeName;
  }

  const [tmpl] = await db.insert(docxTemplatesTable).values({
    name,
    description: description ?? null,
    fileName: fileRef,
  }).returning();

  res.status(201).json(UploadTemplateResponse.parse(serializeDates(tmpl)));
});

router.get("/templates/:id/download", async (req, res): Promise<void> => {
  const parsed = DeleteTemplateParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [tmpl] = await db.select().from(docxTemplatesTable).where(eq(docxTemplatesTable.id, parsed.data.id));
  if (!tmpl) {
    res.status(404).json({ error: "Template không tồn tại" });
    return;
  }

  let buffer: Buffer;
  try {
    buffer = await readTemplateBuffer(tmpl.fileName);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File template không tìm thấy trên cloud storage" });
    } else {
      res.status(404).json({ error: "File template không tìm thấy trên server" });
    }
    return;
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(tmpl.name)}.docx"`);
  res.send(buffer);
});

router.delete("/templates/:id", async (req, res): Promise<void> => {
  const params = DeleteTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [tmpl] = await db.delete(docxTemplatesTable).where(eq(docxTemplatesTable.id, params.data.id)).returning();
  if (!tmpl) {
    res.status(404).json({ error: "Template không tồn tại" });
    return;
  }

  // Delete file from GCS or disk
  if (isObjectPath(tmpl.fileName)) {
    await storageService.deleteObjectEntity(tmpl.fileName);
  } else {
    try {
      fs.unlinkSync(path.join(TEMPLATES_DIR, tmpl.fileName));
    } catch {
      // ignore
    }
  }

  res.sendStatus(204);
});

// ─── Import template từ App Storage (không upload file, chỉ đăng ký path) ────
router.post("/templates/from-storage", async (req, res): Promise<void> => {
  const { objectPath, name, description } = req.body as {
    objectPath?: string;
    name?: string;
    description?: string;
  };

  if (!objectPath || !objectPath.startsWith("/public-objects/templates/")) {
    res.status(400).json({ error: "objectPath không hợp lệ, phải bắt đầu bằng /public-objects/templates/" });
    return;
  }
  if (!name) {
    res.status(400).json({ error: "Thiếu tên template" });
    return;
  }

  const [tmpl] = await db
    .insert(docxTemplatesTable)
    .values({ name, description: description ?? null, fileName: objectPath })
    .returning();

  res.status(201).json(UploadTemplateResponse.parse(serializeDates(tmpl)));
});

router.post("/generate-docs", async (req, res): Promise<void> => {
  const parsed = GenerateDocsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const format = (req.query.format as string) === "pdf" ? "pdf" : "docx";
  const { employeeIds, templateId, soCongVan, ngayNhapCanh, cuaKhau: cuaKhauOverride } = parsed.data;

  const [tmpl] = await db.select().from(docxTemplatesTable).where(eq(docxTemplatesTable.id, templateId));
  if (!tmpl) {
    res.status(404).json({ error: "Template không tồn tại" });
    return;
  }

  let templateBuffer: Buffer;
  try {
    templateBuffer = await readTemplateBuffer(tmpl.fileName);
  } catch {
    res.status(500).json({ error: "Không thể đọc file template" });
    return;
  }

  const validEmployees = (
    await Promise.all(
      employeeIds.map(async (id) => {
        const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
        if (!emp) return null;
        const docs = await db.select().from(documentsTable).where(eq(documentsTable.employeeId, id));
        return { ...emp, _docs: docs };
      })
    )
  ).filter((e): e is NonNullable<typeof e> => e !== null);

  if (validEmployees.length === 0) {
    res.status(400).json({ error: "Không tìm thấy nhân viên hợp lệ" });
    return;
  }

  const { default: Docxtemplater } = await import("docxtemplater");
  const { default: PizZip } = await import("pizzip");

  const today = new Date();
  const ngayTao = `ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

  const empToTags = (emp: (typeof validEmployees)[0], stt: number) => {
    const passportDoc = emp._docs.find((d) => d.docType === "Hộ chiếu");
    const visaDoc = emp._docs.find((d) => d.docType === "Visa");
    const trcDoc = emp._docs.find((d) => d.docType === "Thẻ tạm trú (TRC)");

    const formatDate = (dateStr?: string | null) =>
      dateStr ? dateStr.split("-").reverse().join("/") : "";

    return {
      stt,
      HO_TEN:    emp.fullName ?? "",
      NGAY_SINH: emp.dob ? emp.dob.split("-").reverse().join("/") : "",
      GIOI_TINH: emp.gender ?? "",
      CCCD:      (emp as any).cccd ?? "",
      SO_HC:     passportDoc?.idNumber ?? emp.passportNo ?? "",
      CAP_HC:    formatDate(passportDoc?.issueDate ?? null),
      HH_HC:     formatDate(passportDoc?.expiryDate ?? emp.passportExpiry),
      MA_NV:     (emp as any).employeeCode ?? "",
      QUOC_TICH: emp.nationality ?? "Trung Quốc",
      CHUC_VU:   emp.position ?? "",
      SO_TRC:    trcDoc?.idNumber ?? "",
      HH_TRC:    formatDate(trcDoc?.expiryDate),
      DIA_CHI:   emp.tempAddress ?? "",
      SO_VISA:   visaDoc?.idNumber ?? emp.visaNo ?? "",
      TGCT:      (emp as any).workPeriod ?? "",
      CAP_VISA:  formatDate(visaDoc?.issueDate ?? null),
      HH_VISA:   formatDate(visaDoc?.expiryDate ?? emp.visaExpiry),
      CUA_KHAU:  cuaKhauOverride ?? (emp as any).cuaKhau ?? "",
    };
  };

  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const templateData = {
    ...empToTags(validEmployees[0], 1),
    NGAY: ngayTao,
    SO_CONG_VAN: soCongVan ?? "",
    NGAY_NHAP_CANH: ngayNhapCanh ?? "",
    HAN_1THANG: (() => {
      let base: Date;
      if (ngayNhapCanh) {
        const [dd, mm, yyyy] = ngayNhapCanh.split("/");
        base = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      } else {
        base = today;
      }
      const result = new Date(base);
      result.setMonth(result.getMonth() + 1);
      return `${String(result.getDate()).padStart(2, "0")}/${String(result.getMonth() + 1).padStart(2, "0")}/${result.getFullYear()}`;
    })(),
    HAN_3THANG: (() => {
      let base: Date;
      if (ngayNhapCanh) {
        const [dd, mm, yyyy] = ngayNhapCanh.split("/");
        base = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      } else {
        base = today;
      }
      const result = new Date(base);
      result.setMonth(result.getMonth() + 3);
      return `${String(result.getDate()).padStart(2, "0")}/${String(result.getMonth() + 1).padStart(2, "0")}/${result.getFullYear()}`;
    })(),
    employees: validEmployees.map((emp, idx) => empToTags(emp, idx + 1)),
  };

  const zip = new PizZip(templateBuffer.toString("binary"));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });

  doc.render(templateData);

  const renderedZip = doc.getZip();
  applyFontToZip(renderedZip);

  const buf = Buffer.from(renderedZip.generate({ type: "nodebuffer" }));

  if (format === "pdf") {
    // Convert DOCX → PDF via LibreOffice headless (preserves template layout exactly)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hrm-pdf-"));
    const tmpDocx = path.join(tmpDir, "document.docx");
    const tmpPdf = path.join(tmpDir, "document.pdf");
    try {
      fs.writeFileSync(tmpDocx, buf);
      await execFileAsync("libreoffice", [
        "--headless",
        "--convert-to", "pdf",
        "--outdir", tmpDir,
        tmpDocx,
      ], { timeout: 60_000 });

      if (!fs.existsSync(tmpPdf)) {
        res.status(500).json({ error: "Không thể tạo file PDF" });
        return;
      }

      const pdfBuf = fs.readFileSync(tmpPdf);
      const pdfFileName =
        validEmployees.length === 1
          ? `${(validEmployees[0].fullName ?? "nhanvien").replace(/\s+/g, "_")}.pdf`
          : "ho_so_nhan_vien.pdf";

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(pdfFileName)}"`);
      res.send(pdfBuf);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    return;
  }

  const fileName =
    validEmployees.length === 1
      ? `${(validEmployees[0].fullName ?? "nhanvien").replace(/\s+/g, "_")}.docx`
      : "ho_so_nhan_vien.docx";

  res.setHeader("Content-Type", DOCX_MIME);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.send(buf);
});

export default router;
