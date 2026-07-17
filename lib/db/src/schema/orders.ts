import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "in_delivery",
  "delivered",
]);

export const orderTypeEnum = pgEnum("order_type", [
  "na_miejscu",
  "na_dostawe",
]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  description: text("description").notNull(),
  status: orderStatusEnum("status").notNull().default("pending"),
  customerFullName: text("customer_full_name").notNull(),
  pesel: text("pesel").notNull(),
  deliveryAddress: text("delivery_address"),
  price: text("price"),
  suggestedPrice: text("suggested_price"),
  discountCode: text("discount_code"),
  appliedDiscountCode: text("applied_discount_code"),
  appliedDiscountPercent: integer("applied_discount_percent"),
  workerId: text("worker_id"),
  workerName: text("worker_name"),
  courierId: text("courier_id"),
  courierName: text("courier_name"),
  messageId: text("message_id"),
  channelId: text("channel_id").notNull(),
  orderType: orderTypeEnum("order_type").notNull().default("na_miejscu"),
  guildId: text("guild_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
