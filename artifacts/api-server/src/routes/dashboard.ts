import { Router, type IRouter } from "express";
import { eq, count, and, sql } from "drizzle-orm";
import { db, employeesTable, documentsTable } from "@workspace/db";
import {
  GetExpiringDocumentsQueryParams,
  GetDashboardStatsResponse,
  GetExpiringDocumentsResponse,
  GetMissingDocsResponse,
  GetDashboardChartsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Giấy tờ bắt buộc — phải khớp chính xác với tên lưu trong DB
const REQUIRED_DOC_TYPES = ["Visa", "Thẻ tạm trú (TRC)", "Giấy phép lao động"];

// Tính status thực tế từ expiryDate (override status cũ trong DB)
function computeDocStatus(
  dbStatus: string,
  expiryDate: string | null,
  today: Date,
  in60: Date
): string {
  if (dbStatus === "missing") return "missing";
  if (!expiryDate) return "pending";
  const expiry = new Date(expiryDate);
  if (expiry < today) return "expired";
  if (expiry <= in60) return "expiring";
  return "valid";
}

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
  const in60 = new Date(now); in60.setDate(in60.getDate() + 60);
  const in90 = new Date(now); in90.setDate(in90.getDate() + 90);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const [totalEmpRow] = await db.select({ count: count() }).from(employeesTable);
  const [activeRow] = await db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.status, "active"));
  const [resignedRow] = await db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.status, "resigned"));
  const [totalDocRow] = await db.select({ count: count() }).from(documentsTable);

  // Đếm theo expiryDate thực tế (không dùng status field cũ)
  const [exp30Row] = await db.select({ count: count() }).from(documentsTable).where(
    and(
      sql`${documentsTable.expiryDate} IS NOT NULL`,
      sql`${documentsTable.expiryDate} >= ${fmt(now)}`,
      sql`${documentsTable.expiryDate} <= ${fmt(in30)}`
    )
  );
  const [exp60Row] = await db.select({ count: count() }).from(documentsTable).where(
    and(
      sql`${documentsTable.expiryDate} IS NOT NULL`,
      sql`${documentsTable.expiryDate} >= ${fmt(now)}`,
      sql`${documentsTable.expiryDate} <= ${fmt(in60)}`
    )
  );
  const [exp90Row] = await db.select({ count: count() }).from(documentsTable).where(
    and(
      sql`${documentsTable.expiryDate} IS NOT NULL`,
      sql`${documentsTable.expiryDate} >= ${fmt(now)}`,
      sql`${documentsTable.expiryDate} <= ${fmt(in90)}`
    )
  );
  // Đã hết hạn: theo ngày thực tế (không phải status field)
  const [expiredRow] = await db.select({ count: count() }).from(documentsTable).where(
    and(
      sql`${documentsTable.expiryDate} IS NOT NULL`,
      sql`${documentsTable.expiryDate} < ${fmt(now)}`
    )
  );

  // Hồ sơ thiếu: đếm số nhân viên đang làm việc bị thiếu ít nhất 1 loại giấy tờ bắt buộc
  // (nhất quán với bảng "Nhân viên thiếu hồ sơ" phía dưới)
  const activeEmployees = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.status, "active"));
  const allDocs = await db.select({ employeeId: documentsTable.employeeId, docType: documentsTable.docType }).from(documentsTable);

  const empDocMap = new Map<number, Set<string>>();
  for (const doc of allDocs) {
    if (!empDocMap.has(doc.employeeId)) empDocMap.set(doc.employeeId, new Set());
    empDocMap.get(doc.employeeId)!.add(doc.docType);
  }
  let missingCount = 0;
  for (const emp of activeEmployees) {
    const docTypes = empDocMap.get(emp.id) ?? new Set();
    const hasMissing = REQUIRED_DOC_TYPES.some((t) => !docTypes.has(t));
    if (hasMissing) missingCount++;
  }

  res.json(GetDashboardStatsResponse.parse({
    totalEmployees: Number(totalEmpRow?.count ?? 0),
    activeEmployees: Number(activeRow?.count ?? 0),
    resignedEmployees: Number(resignedRow?.count ?? 0),
    totalDocuments: Number(totalDocRow?.count ?? 0),
    expiringIn30: Number(exp30Row?.count ?? 0),
    expiringIn60: Number(exp60Row?.count ?? 0),
    expiringIn90: Number(exp90Row?.count ?? 0),
    expiredDocuments: Number(expiredRow?.count ?? 0),
    missingDocuments: missingCount,
  }));
});

router.get("/dashboard/expiring", async (req, res): Promise<void> => {
  const query = GetExpiringDocumentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const days = query.data.days ?? 90;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const future = new Date(now);
  future.setDate(future.getDate() + days);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  // Chỉ hiển thị giấy tờ sắp hết hạn trong vòng N ngày tính từ hôm nay
  // (giấy tờ đã hết hạn trước đó được thể hiện qua stat card "Đã hết hạn")
  const rows = await db
    .select({
      documentId: documentsTable.id,
      employeeId: documentsTable.employeeId,
      employeeName: employeesTable.fullName,
      docType: documentsTable.docType,
      idNumber: documentsTable.idNumber,
      expiryDate: documentsTable.expiryDate,
      status: documentsTable.status,
    })
    .from(documentsTable)
    .innerJoin(employeesTable, eq(documentsTable.employeeId, employeesTable.id))
    .where(
      and(
        sql`${documentsTable.expiryDate} IS NOT NULL`,
        sql`${documentsTable.expiryDate} >= ${fmt(now)}`,
        sql`${documentsTable.expiryDate} <= ${fmt(future)}`
      )
    )
    .orderBy(documentsTable.expiryDate);

  const result = rows.map((r) => {
    const expiry = new Date(r.expiryDate!);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { ...r, daysUntilExpiry };
  });

  res.json(GetExpiringDocumentsResponse.parse(result));
});

router.get("/dashboard/missing-docs", async (req, res): Promise<void> => {
  const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
  const allDocs = await db.select({ employeeId: documentsTable.employeeId, docType: documentsTable.docType }).from(documentsTable);

  const empDocMap = new Map<number, Set<string>>();
  for (const doc of allDocs) {
    if (!empDocMap.has(doc.employeeId)) empDocMap.set(doc.employeeId, new Set());
    empDocMap.get(doc.employeeId)!.add(doc.docType);
  }

  const result = employees.map((emp) => {
    const docTypes = empDocMap.get(emp.id) ?? new Set();
    const missingDocTypes = REQUIRED_DOC_TYPES.filter((t) => !docTypes.has(t));
    return {
      employeeId: emp.id,
      employeeName: emp.fullName,
      nationality: emp.nationality,
      missingDocTypes,
    };
  }).filter((r) => r.missingDocTypes.length > 0);

  res.json(GetMissingDocsResponse.parse(result));
});

router.get("/dashboard/expired", async (req, res): Promise<void> => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const rows = await db
    .select({
      documentId: documentsTable.id,
      employeeId: documentsTable.employeeId,
      employeeName: employeesTable.fullName,
      docType: documentsTable.docType,
      idNumber: documentsTable.idNumber,
      expiryDate: documentsTable.expiryDate,
      status: documentsTable.status,
    })
    .from(documentsTable)
    .innerJoin(employeesTable, eq(documentsTable.employeeId, employeesTable.id))
    .where(
      and(
        sql`${documentsTable.expiryDate} IS NOT NULL`,
        sql`${documentsTable.expiryDate} < ${fmt(now)}`
      )
    )
    .orderBy(documentsTable.expiryDate);

  const result = rows.map((r) => {
    const expiry = new Date(r.expiryDate!);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { ...r, daysUntilExpiry };
  });

  res.json(GetExpiringDocumentsResponse.parse(result));
});

router.get("/dashboard/charts", async (req, res): Promise<void> => {
  const STATUS_COLORS: Record<string, string> = {
    valid: "#22c55e",
    expiring: "#f97316",
    expired: "#ef4444",
    pending: "#eab308",
    missing: "#6b7280",
  };
  const STATUS_LABELS: Record<string, string> = {
    valid: "Còn hiệu lực",
    expiring: "Sắp hết hạn",
    expired: "Đã hết hạn",
    pending: "Đang xử lý",
    missing: "Thiếu hồ sơ",
  };

  // Tính status thực tế từ ngày hết hạn (không dùng status cũ trong DB)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in60 = new Date(today);
  in60.setDate(in60.getDate() + 60);

  const allDocs = await db
    .select({ status: documentsTable.status, expiryDate: documentsTable.expiryDate })
    .from(documentsTable);

  const computedCounts: Record<string, number> = {};
  for (const doc of allDocs) {
    const s = computeDocStatus(doc.status, doc.expiryDate, today, in60);
    computedCounts[s] = (computedCounts[s] ?? 0) + 1;
  }

  const documentStatusPie = Object.entries(computedCounts)
    .filter(([, v]) => v > 0)
    .map(([status, value]) => ({
      label: STATUS_LABELS[status] ?? status,
      value,
      color: STATUS_COLORS[status] ?? "#888",
    }));

  // Biểu đồ hết hạn theo tháng (6 tháng tới)
  const now = new Date();
  const monthBars = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const end = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const label = d.toLocaleDateString("vi-VN", { month: "short", year: "numeric" });

    const [row] = await db.select({ count: count() }).from(documentsTable).where(
      and(
        sql`${documentsTable.expiryDate} IS NOT NULL`,
        sql`${documentsTable.expiryDate} >= ${start}`,
        sql`${documentsTable.expiryDate} < ${end}`
      )
    );
    monthBars.push({ month: label, count: Number(row?.count ?? 0) });
  }

  res.json(GetDashboardChartsResponse.parse({ documentStatusPie, expirationByMonth: monthBars }));
});

export default router;
