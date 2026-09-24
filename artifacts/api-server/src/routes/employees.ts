import { Router, type IRouter } from "express";
import { eq, ilike, and, or, inArray } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, employeesTable, documentsTable } from "@workspace/db";
import {
  ListEmployeesQueryParams,
  CreateEmployeeBody,
  GetEmployeeParams,
  UpdateEmployeeParams,
  UpdateEmployeeBody,
  DeleteEmployeeParams,
  UploadEmployeePhotoParams,
  ListEmployeesResponse,
  CreateEmployeeResponse,
  GetEmployeeResponse,
  UpdateEmployeeResponse,
  UploadEmployeePhotoResponse,
} from "@workspace/api-zod";
import { serializeDates } from "../lib/serialize";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

// ─── Legacy disk storage (read-only for backward compat) ─────────────────────
const PHOTOS_DIR = path.join(process.cwd(), "uploads", "photos");
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

// ─── Memory storage for new uploads (goes to GCS) ────────────────────────────
const photoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận file ảnh"));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const storageService = new ObjectStorageService();

/** Returns true if the path is a private GCS object path */
function isObjectPath(photoUrl: string): boolean {
  return photoUrl.startsWith("/objects/");
}
/** Returns true if the path is a public App Storage path */
function isPublicObjectPath(photoUrl: string): boolean {
  return photoUrl.startsWith("/public-objects/");
}

const router: IRouter = Router();

router.get("/employees", async (req, res): Promise<void> => {
  const query = ListEmployeesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.status) {
    conditions.push(eq(employeesTable.status, query.data.status));
  }
  if (query.data.search) {
    const term = `%${query.data.search}%`;
    conditions.push(
      or(
        ilike(employeesTable.fullName, term),
        ilike(employeesTable.passportNo, term),
        ilike(employeesTable.position, term),
      )
    );
  }

  const rows = await db
    .select()
    .from(employeesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(employeesTable.fullName);

  // Enrich with document summary fields (TRC, GPLD, LLTP, GKSK)
  const empIds = rows.map((e) => e.id);
  const docRows = empIds.length > 0
    ? await db
        .select({
          employeeId: documentsTable.employeeId,
          docType: documentsTable.docType,
          idNumber: documentsTable.idNumber,
        })
        .from(documentsTable)
        .where(
          and(
            inArray(documentsTable.employeeId, empIds),
            inArray(documentsTable.docType, [
              "Hộ chiếu",
              "Visa",
              "Thẻ tạm trú (TRC)",
              "Giấy phép lao động",
              "Lý lịch tư pháp (LLTP)",
              "Giấy khám sức khỏe",
            ])
          )
        )
    : [];

  const docMap = new Map<number, Record<string, string | null>>();
  for (const doc of docRows) {
    if (!docMap.has(doc.employeeId)) docMap.set(doc.employeeId, {});
    docMap.get(doc.employeeId)![doc.docType] = doc.idNumber ?? null;
  }

  const enriched = rows.map(serializeDates).map((emp) => {
    const docs = docMap.get(emp.id) ?? {};
    return {
      ...emp,
      // docs table takes priority; fall back to employee-level fields
      passportNo: docs["Hộ chiếu"] !== undefined ? docs["Hộ chiếu"] : emp.passportNo ?? null,
      visaNo: docs["Visa"] !== undefined ? docs["Visa"] : emp.visaNo ?? null,
      trcNo: docs["Thẻ tạm trú (TRC)"] ?? null,
      gpldNo: docs["Giấy phép lao động"] ?? null,
      lltpNo: docs["Lý lịch tư pháp (LLTP)"] ?? null,
      gkskNo: docs["Giấy khám sức khỏe"] ?? null,
    };
  });

  res.json(ListEmployeesResponse.parse(enriched));
});

router.post("/employees", async (req, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [emp] = await db.insert(employeesTable).values(parsed.data).returning();
  res.status(201).json(CreateEmployeeResponse.parse(serializeDates(emp)));
});

router.get("/employees/:id", async (req, res): Promise<void> => {
  const params = GetEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, params.data.id));
  if (!emp) {
    res.status(404).json({ error: "Nhân viên không tồn tại" });
    return;
  }

  const docs = await db.select().from(documentsTable).where(eq(documentsTable.employeeId, params.data.id));
  res.json(GetEmployeeResponse.parse({
    ...serializeDates(emp),
    documents: docs.map(serializeDates),
  }));
});

router.patch("/employees/:id", async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [emp] = await db
    .update(employeesTable)
    .set(parsed.data)
    .where(eq(employeesTable.id, params.data.id))
    .returning();

  if (!emp) {
    res.status(404).json({ error: "Nhân viên không tồn tại" });
    return;
  }

  res.json(UpdateEmployeeResponse.parse(serializeDates(emp)));
});

router.delete("/employees/:id", async (req, res): Promise<void> => {
  const params = DeleteEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [emp] = await db.delete(employeesTable).where(eq(employeesTable.id, params.data.id)).returning();
  if (!emp) {
    res.status(404).json({ error: "Nhân viên không tồn tại" });
    return;
  }

  // Clean up photo from GCS or disk
  if (emp.photoUrl) {
    if (isObjectPath(emp.photoUrl)) {
      await storageService.deleteObjectEntity(emp.photoUrl);
    } else {
      const oldPath = path.join(PHOTOS_DIR, emp.photoUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
  }

  res.sendStatus(204);
});

// ─── Bulk delete ─────────────────────────────────────────────────────────────
router.post("/employees/bulk-delete", async (req, res): Promise<void> => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids phải là mảng số không rỗng" });
    return;
  }

  // Lấy danh sách để clean up ảnh
  const toDelete = await db
    .select({ id: employeesTable.id, photoUrl: employeesTable.photoUrl })
    .from(employeesTable)
    .where(inArray(employeesTable.id, ids));

  await db.delete(employeesTable).where(inArray(employeesTable.id, ids));

  // Clean up photos (best-effort)
  await Promise.allSettled(
    toDelete
      .filter((e) => e.photoUrl && isObjectPath(e.photoUrl))
      .map((e) => storageService.deleteObjectEntity(e.photoUrl!))
  );

  res.json({ deleted: toDelete.length });
});

// ─── Photo upload ────────────────────────────────────────────────────────────

router.post("/employees/:id/photo", photoUpload.single("photo"), async (req, res): Promise<void> => {
  const params = UploadEmployeePhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "Thiếu file ảnh" });
    return;
  }

  const [existing] = await db.select({ id: employeesTable.id, photoUrl: employeesTable.photoUrl })
    .from(employeesTable)
    .where(eq(employeesTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Nhân viên không tồn tại" });
    return;
  }

  // Delete old photo (GCS or disk)
  if (existing.photoUrl) {
    if (isObjectPath(existing.photoUrl)) {
      await storageService.deleteObjectEntity(existing.photoUrl);
    } else {
      const oldPath = path.join(PHOTOS_DIR, existing.photoUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
  }

  // Upload new photo to GCS
  let objectPath: string;
  try {
    objectPath = await storageService.uploadObjectEntityBuffer(
      req.file.buffer,
      req.file.mimetype,
    );
  } catch (err: any) {
    console.error("[photo-upload] GCS upload failed:", err?.message ?? err);
    res.status(500).json({
      error: "Không thể tải ảnh lên cloud storage",
      detail: err?.message ?? String(err),
    });
    return;
  }

  const [emp] = await db
    .update(employeesTable)
    .set({ photoUrl: objectPath })
    .where(eq(employeesTable.id, params.data.id))
    .returning();

  res.json(UploadEmployeePhotoResponse.parse(serializeDates(emp)));
});

// ─── View photo ──────────────────────────────────────────────────────────────

router.get("/employees/:id/photo", async (req, res): Promise<void> => {
  const params = UploadEmployeePhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [emp] = await db.select({ photoUrl: employeesTable.photoUrl })
    .from(employeesTable)
    .where(eq(employeesTable.id, params.data.id));

  if (!emp || !emp.photoUrl) {
    res.status(404).json({ error: "Không có ảnh" });
    return;
  }

  // Private GCS path
  if (isObjectPath(emp.photoUrl)) {
    try {
      const buffer = await storageService.downloadObjectEntityBuffer(emp.photoUrl);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.send(buffer);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "File ảnh không tìm thấy" });
      } else {
        res.status(500).json({ error: "Lỗi khi lấy ảnh" });
      }
    }
    return;
  }

  // Public App Storage path — redirect to storage serving route
  if (isPublicObjectPath(emp.photoUrl)) {
    res.redirect(`/api/storage${emp.photoUrl}`);
    return;
  }

  // Legacy format: stored on disk
  const filePath = path.join(PHOTOS_DIR, emp.photoUrl);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File ảnh không tìm thấy" });
    return;
  }

  res.setHeader("Cache-Control", "private, max-age=86400");
  res.sendFile(filePath);
});

// ─── Delete photo ─────────────────────────────────────────────────────────────

router.delete("/employees/:id/photo", async (req, res): Promise<void> => {
  const params = UploadEmployeePhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [emp] = await db.select({ id: employeesTable.id, photoUrl: employeesTable.photoUrl })
    .from(employeesTable)
    .where(eq(employeesTable.id, params.data.id));

  if (!emp) {
    res.status(404).json({ error: "Nhân viên không tồn tại" });
    return;
  }

  if (emp.photoUrl) {
    if (isObjectPath(emp.photoUrl)) {
      await storageService.deleteObjectEntity(emp.photoUrl);
    } else if (!isPublicObjectPath(emp.photoUrl)) {
      // Legacy disk — only delete local file; public storage files are not auto-deleted
      const filePath = path.join(PHOTOS_DIR, emp.photoUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.update(employeesTable).set({ photoUrl: null }).where(eq(employeesTable.id, params.data.id));
  }

  res.sendStatus(204);
});

// ─── Set photo from App Storage path ─────────────────────────────────────────
router.put("/employees/:id/photo-path", async (req, res): Promise<void> => {
  const params = UploadEmployeePhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { objectPath } = req.body as { objectPath?: string };
  if (!objectPath || !objectPath.startsWith("/public-objects/")) {
    res.status(400).json({ error: "objectPath không hợp lệ" });
    return;
  }

  const [existing] = await db
    .select({ id: employeesTable.id, photoUrl: employeesTable.photoUrl })
    .from(employeesTable)
    .where(eq(employeesTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Nhân viên không tồn tại" });
    return;
  }

  // Delete old private GCS photo if present (public files are shared, don't delete)
  if (existing.photoUrl && isObjectPath(existing.photoUrl)) {
    await storageService.deleteObjectEntity(existing.photoUrl).catch(() => {});
  }

  const [emp] = await db
    .update(employeesTable)
    .set({ photoUrl: objectPath })
    .where(eq(employeesTable.id, params.data.id))
    .returning();

  res.json(UploadEmployeePhotoResponse.parse(serializeDates(emp)));
});

export default router;
