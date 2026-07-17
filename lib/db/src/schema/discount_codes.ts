import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const discountCodes = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  percentage: integer("percentage").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

export type DiscountCode = typeof discountCodes.$inferSelect;
