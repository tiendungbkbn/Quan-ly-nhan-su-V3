import { Router, type IRouter } from "express";
import { eq, ilike, and, or, inArray } from "drizzle-orm";
import { db, employeesTable, documentsTable } from "@workspace/db";
import { z } from "zod/v4";
import * as XLSX from "xlsx";

const router: IRouter = Router();

const ExportEmployeesQuery = z.object({
  search: z.string().optional(),
  status: z.enum(["active", "resigned"]).optional(),
});

const ExportDocsParams = z.object({
  id: z.coerce.number().int().positive(),
});

const STATUS_LABEL: Record<string, string> = {
  active: "Đang làm việc",
  resigned: "Đã nghỉ việc",
};

const DOC_STATUS_LABEL: Record<string, string> = {
  valid: "Hợp lệ",
  expiring: "Sắp hết hạn",
  expired: "Đã hết hạn",
  pending: "Chưa có",
};

function formatDate(val: string | null | undefined): string {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString("vi-VN");
}

// Các loại giấy tờ cố định cần xuất ra Excel
const FIXED_DOC_TYPES = [
  "Hộ chiếu",
  "Visa",
  "Thẻ tạm trú (TRC)",
  "Giấy phép lao động",
  "Giấy khám sức khỏe",
  "Lý lịch tư pháp (LLTP)",
  "Xác nhận tạm trú",
] as const;

// Tên cột ngắn gọn cho từng loại giấy tờ
const DOC_SHORT: Record<string, string> = {
  "Hộ chiếu":               "HC",
  "Visa":                    "Visa",
  "Thẻ tạm trú (TRC)":      "TRC",
  "Giấy phép lao động":      "GPLD",
  "Giấy khám sức khỏe":     "SKSK",
  "Lý lịch tư pháp (LLTP)": "LLTP",
  "Xác nhận tạm trú":        "XNTT",
};

// GET /employees/export-excel
router.get("/employees/export-excel", async (req, res): Promise<void> => {
  const query = ExportEmployeesQuery.safeParse(req.query);
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
    .orderBy(employeesTable.createdAt);

  // Lấy tất cả documents của các nhân viên này
  const empIds = rows.map((e) => e.id);
  const allDocs = empIds.length > 0
    ? await db.select().from(documentsTable).where(
        inArray(documentsTable.employeeId, empIds)
      )
    : [];

  // Index: employeeId -> docType -> doc
  const docIndex: Record<number, Record<string, typeof allDocs[0]>> = {};
  for (const doc of allDocs) {
    if (!docIndex[doc.employeeId]) docIndex[doc.employeeId] = {};
    const existing = docIndex[doc.employeeId][doc.docType];
    // Giữ doc mới nhất nếu có nhiều
    if (!existing || new Date(doc.createdAt) > new Date(existing.createdAt)) {
      docIndex[doc.employeeId][doc.docType] = doc;
    }
  }

  const data = rows.map((emp, idx) => {
    const empDocs = docIndex[emp.id] || {};

    const docCols: Record<string, string> = {};
    for (const docType of FIXED_DOC_TYPES) {
      const short = DOC_SHORT[docType] || docType;
      const doc = empDocs[docType];
      docCols[`Số ${short}`]        = doc?.idNumber || "";
      docCols[`Cấp ${short}`]       = formatDate(doc?.issueDate);
      docCols[`HH ${short}`]        = formatDate(doc?.expiryDate);
      docCols[`TT ${short}`]        = doc ? (DOC_STATUS_LABEL[doc.status] || doc.status) : "";
    }

    return {
      "ID": emp.id,
      "STT": idx + 1,
      "Họ và tên": emp.fullName,
      "Ngày sinh": formatDate(emp.dob),
      "Giới tính": emp.gender || "",
      "Quốc tịch": emp.nationality || "",
      "Mã số NV": emp.employeeCode || "",
      "Công ty": emp.company || "",
      "Chức vụ": emp.position || "",
      "Thời gian CT": emp.workPeriod || "",
      "Địa chỉ tạm trú": emp.tempAddress || "",
      "SĐT": emp.phone || "",
      "Trạng thái": STATUS_LABEL[emp.status] || emp.status,
      ...docCols,
      "Ngày tạo hồ sơ": formatDate(emp.createdAt?.toString()),
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);

  // Độ rộng cột: cột cơ bản + 4 cột cho mỗi loại giấy tờ
  const baseCols = [
    { wch: 8 },  // ID
    { wch: 5 },  // STT
    { wch: 25 }, // Họ và tên
    { wch: 12 }, // Ngày sinh
    { wch: 10 }, // Giới tính
    { wch: 12 }, // Quốc tịch
    { wch: 12 }, // Mã số NV
    { wch: 22 }, // Công ty
    { wch: 18 }, // Chức vụ
    { wch: 18 }, // Thời gian CT
    { wch: 28 }, // Địa chỉ tạm trú
    { wch: 14 }, // SĐT
    { wch: 14 }, // Trạng thái
  ];
  const docColWidths = FIXED_DOC_TYPES.flatMap(() => [
    { wch: 16 }, // Số
    { wch: 12 }, // Cấp
    { wch: 12 }, // HH
    { wch: 12 }, // TT
  ]);
  ws["!cols"] = [...baseCols, ...docColWidths, { wch: 14 }]; // +Ngày tạo hồ sơ

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Danh sách nhân viên");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `danh_sach_nhan_vien_${Date.now()}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

// GET /employees/:id/documents/export-excel  (giấy tờ riêng — giữ lại để tương thích)
router.get("/employees/:id/documents/export-excel", async (req, res): Promise<void> => {
  const params = ExportDocsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, params.data.id));
  if (!emp) { res.status(404).json({ error: "Nhân viên không tồn tại" }); return; }

  const docs = await db
    .select().from(documentsTable)
    .where(eq(documentsTable.employeeId, params.data.id))
    .orderBy(documentsTable.createdAt);

  const data = docs.map((doc, idx) => ({
    "STT": idx + 1,
    "Loại giấy tờ": doc.docType,
    "Số / ID": doc.idNumber || "",
    "Ngày cấp": formatDate(doc.issueDate),
    "Ngày hết hạn": formatDate(doc.expiryDate),
    "Trạng thái": DOC_STATUS_LABEL[doc.status] || doc.status,
    "Ghi chú": doc.notes || "",
    "Cập nhật lần cuối": formatDate(doc.updatedAt?.toString()),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 5 }, { wch: 28 }, { wch: 20 }, { wch: 14 },
    { wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Giấy tờ & Hồ sơ pháp lý");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = emp.fullName.replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, "").replace(/\s+/g, "_");
  const filename = `giaytо_${safeName}_${Date.now()}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
});

// GET /employees/:id/export-excel  — xuất kết hợp: Sheet1=Thông tin cá nhân, Sheet2=Giấy tờ
router.get("/employees/:id/export-excel", async (req, res): Promise<void> => {
  const params = ExportDocsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, params.data.id));
  if (!emp) { res.status(404).json({ error: "Nhân viên không tồn tại" }); return; }

  const docs = await db
    .select().from(documentsTable)
    .where(eq(documentsTable.employeeId, params.data.id))
    .orderBy(documentsTable.createdAt);

  // Sheet 1 — Thông tin cá nhân (dạng key-value dọc)
  const personalRows = [
    ["Họ và tên",           emp.fullName],
    ["Ngày sinh",           formatDate(emp.dob)],
    ["Giới tính",           emp.gender || ""],
    ["Quốc tịch",           emp.nationality || ""],
    ["Số CCCD",             emp.cccd || ""],
    ["Mã số NV",            emp.employeeCode || ""],
    ["Số hộ chiếu",         emp.passportNo || ""],
    ["HH hộ chiếu",         formatDate(emp.passportExpiry)],
    ["Số Visa",             emp.visaNo || ""],
    ["HH Visa",             formatDate(emp.visaExpiry)],
    ["Công ty",             emp.company || ""],
    ["Chức vụ",             emp.position || ""],
    ["SĐT",                 emp.phone || ""],
    ["Email",               emp.email || ""],
    ["Địa chỉ tạm trú",     emp.tempAddress || ""],
    ["Thời gian công tác",  emp.workPeriod || ""],
    ["Trạng thái",          STATUS_LABEL[emp.status] || emp.status],
    ["Ngày tạo hồ sơ",      formatDate(emp.createdAt?.toString())],
  ];

  const wsPersonal = XLSX.utils.aoa_to_sheet([["Trường", "Giá trị"], ...personalRows]);
  wsPersonal["!cols"] = [{ wch: 24 }, { wch: 36 }];

  // Sheet 2 — Giấy tờ & Hồ sơ pháp lý
  const docData = docs.map((doc, idx) => ({
    "STT": idx + 1,
    "Loại giấy tờ": doc.docType,
    "Số / ID": doc.idNumber || "",
    "Ngày cấp": formatDate(doc.issueDate),
    "Ngày hết hạn": formatDate(doc.expiryDate),
    "Trạng thái": DOC_STATUS_LABEL[doc.status] || doc.status,
    "Ghi chú": doc.notes || "",
    "Cập nhật lần cuối": formatDate(doc.updatedAt?.toString()),
  }));

  const wsDocs = XLSX.utils.json_to_sheet(docData);
  wsDocs["!cols"] = [
    { wch: 5 }, { wch: 28 }, { wch: 20 }, { wch: 14 },
    { wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsPersonal, "Thông tin cá nhân");
  XLSX.utils.book_append_sheet(wb, wsDocs, "Giấy tờ & Hồ sơ pháp lý");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = emp.fullName.replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, "").replace(/\s+/g, "_");
  const filename = `ho_so_${safeName}_${Date.now()}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
});

export default router;
