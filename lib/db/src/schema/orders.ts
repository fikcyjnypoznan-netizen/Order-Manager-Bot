import {
  pgTable,
  serial,
  text,
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

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  description: text("description").notNull(),
  status: orderStatusEnum("status").notNull().default("pending"),
  workerId: text("worker_id"),
  workerName: text("worker_name"),
  courierId: text("courier_id"),
  courierName: text("courier_name"),
  messageId: text("message_id"),
  channelId: text("channel_id").notNull(),
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
