import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, documentsTable, documentHistoryTable } from "@workspace/db";
import {
  ListEmployeeDocumentsParams,
  CreateEmployeeDocumentParams,
  CreateEmployeeDocumentBody,
  UpdateDocumentParams,
  UpdateDocumentBody,
  DeleteDocumentParams,
  GetDocumentHistoryParams,
  ListEmployeeDocumentsResponse,
  CreateEmployeeDocumentResponse,
  UpdateDocumentResponse,
  GetDocumentHistoryResponse,
} from "@workspace/api-zod";
import { serializeDates } from "../lib/serialize";

const router: IRouter = Router();

router.get("/employees/:id/documents", async (req, res): Promise<void> => {
  const params = ListEmployeeDocumentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const docs = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.employeeId, params.data.id))
    .orderBy(documentsTable.createdAt);

  res.json(ListEmployeeDocumentsResponse.parse(docs.map(serializeDates)));
});

router.post("/employees/:id/documents", async (req, res): Promise<void> => {
  const params = CreateEmployeeDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateEmployeeDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [doc] = await db
    .insert(documentsTable)
    .values({ ...parsed.data, employeeId: params.data.id })
    .returning();

  await db.insert(documentHistoryTable).values({
    documentId: doc.id,
    changeType: "created",
    newData: JSON.stringify(serializeDates(doc)),
    notes: "Tạo mới",
  });

  res.status(201).json(CreateEmployeeDocumentResponse.parse(serializeDates(doc)));
});

router.patch("/documents/:id", async (req, res): Promise<void> => {
  const params = UpdateDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [old] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!old) {
    res.status(404).json({ error: "Giấy tờ không tồn tại" });
    return;
  }

  const [doc] = await db
    .update(documentsTable)
    .set(parsed.data)
    .where(eq(documentsTable.id, params.data.id))
    .returning();

  await db.insert(documentHistoryTable).values({
    documentId: doc.id,
    changeType: "updated",
    oldData: JSON.stringify(serializeDates(old)),
    newData: JSON.stringify(serializeDates(doc)),
    notes: "Cập nhật",
  });

  res.json(UpdateDocumentResponse.parse(serializeDates(doc)));
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  const params = DeleteDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [doc] = await db.delete(documentsTable).where(eq(documentsTable.id, params.data.id)).returning();
  if (!doc) {
    res.status(404).json({ error: "Giấy tờ không tồn tại" });
    return;
  }

  res.sendStatus(204);
});

router.get("/documents/:id/history", async (req, res): Promise<void> => {
  const params = GetDocumentHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const history = await db
    .select()
    .from(documentHistoryTable)
    .where(eq(documentHistoryTable.documentId, params.data.id))
    .orderBy(documentHistoryTable.createdAt);

  res.json(GetDocumentHistoryResponse.parse(history.map(serializeDates)));
});

export default router;
