import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(),
  idNumber: text("id_number"),
  status: text("status").notNull().default("valid"),
  issueDate: date("issue_date", { mode: "string" }),
  expiryDate: date("expiry_date", { mode: "string" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const documentHistoryTable = pgTable("document_history", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  changeType: text("change_type").notNull(),
  oldData: text("old_data"),
  newData: text("new_data"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;

export const insertDocumentHistorySchema = createInsertSchema(documentHistoryTable).omit({ id: true, createdAt: true });
export type InsertDocumentHistory = z.infer<typeof insertDocumentHistorySchema>;
export type DocumentHistory = typeof documentHistoryTable.$inferSelect;
