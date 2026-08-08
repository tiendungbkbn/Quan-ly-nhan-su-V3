import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const docxTemplatesTable = pgTable("docx_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocxTemplateSchema = createInsertSchema(docxTemplatesTable).omit({ id: true, uploadedAt: true });
export type InsertDocxTemplate = z.infer<typeof insertDocxTemplateSchema>;
export type DocxTemplate = typeof docxTemplatesTable.$inferSelect;
