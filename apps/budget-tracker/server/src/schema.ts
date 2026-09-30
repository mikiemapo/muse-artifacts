import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  paycheckCents: integer("paycheck_cents").notNull(),
  nextPayday: text("next_payday").notNull(),
  cadence: text("cadence").notNull(),
  focusAccount: text("focus_account").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const bills = sqliteTable("bills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  amountCents: integer("amount_cents"),
  dueDate: text("due_date"),
  status: text("status", { enum: ["pending", "covered", "paid", "needs_attention"] }).notNull(),
  priority: integer("priority").notNull(),
  category: text("category").notNull(),
  account: text("account").notNull(),
  note: text("note").notNull(),
  recurring: text("recurring", { enum: ["none", "monthly", "biweekly"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const allocations = sqliteTable("allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  amountCents: integer("amount_cents").notNull(),
  sortOrder: integer("sort_order").notNull(),
  protected: integer("protected", { mode: "boolean" }).notNull(),
  note: text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
