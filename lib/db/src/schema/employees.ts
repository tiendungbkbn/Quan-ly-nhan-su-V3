import { pgTable, text, serial, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  dob: date("dob", { mode: "string" }),
  gender: text("gender"),
  nationality: text("nationality").notNull().default("Trung Quốc"),
  cccd: text("cccd"),
  passportNo: text("passport_no"),
  passportExpiry: date("passport_expiry", { mode: "string" }),
  visaNo: text("visa_no"),
  visaExpiry: date("visa_expiry", { mode: "string" }),
  company: text("company"),
  position: text("position"),
  phone: text("phone"),
  email: text("email"),
  tempAddress: text("temp_address"),
  employeeCode: text("employee_code"),
  workPeriod: text("work_period"),
  cuaKhau: text("cua_khau"),
  photoUrl: text("photo_url"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
