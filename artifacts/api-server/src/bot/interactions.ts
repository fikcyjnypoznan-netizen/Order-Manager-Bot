import {
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { db, ordersTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { buildOrderEmbed, buildOrderComponents } from "./embeds.js";
import { logger } from "../lib/logger.js";

const ORDERS_CHANNEL_ID = process.env["DISCORD_ORDERS_CHANNEL_ID"];

export async function handleZamow(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const description = interaction.options.getString("opis", true);
  const customerId = interaction.user.id;
  const customerName =
    interaction.user.displayName || interaction.user.username;
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.editReply("❌ Ta komenda działa tylko na serwerze Discord.");
    return;
  }

  // Determine target channel for the order embed
  let channelId: string;

  if (ORDERS_CHANNEL_ID) {
    channelId = ORDERS_CHANNEL_ID;
  } else {
    channelId = interaction.channelId;
  }

  const targetChannel = await interaction.client.channels
    .fetch(channelId)
    .catch(() => null);

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    await interaction.editReply(
      "❌ Nie znaleziono kanału zamówień. Skontaktuj się z administratorem (ustaw DISCORD_ORDERS_CHANNEL_ID).",
    );
    return;
  }

  const orderType = interaction.options.getString("typ", true) as
    | "na_miejscu"
    | "na_dostawe";

  // Create order record
  const [order] = await db
    .insert(ordersTable)
    .values({
      customerId,
      customerName,
      description,
      orderType,
      channelId,
      guildId,
      status: "pending",
    })
    .returning();

  if (!order) {
    await interaction.editReply("❌ Błąd podczas tworzenia zamówienia.");
    return;
  }

  // Post embed to the orders channel
  const message = await targetChannel.send({
    embeds: [buildOrderEmbed(order)],
    components: buildOrderComponents(order),
  });

  // Save messageId so we can edit it later
  await db
    .update(ordersTable)
    .set({ messageId: message.id })
    .where(eq(ordersTable.id, order.id));

  await interaction.editReply(
    `✅ Zamówienie **#${order.id}** zostało złożone! Czeka na potwierdzenie przez pracownika.`,
  );

  logger.info({ orderId: order.id, customerId, guildId }, "Order created");
}

export async function handleZamowienia(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply("❌ Ta komenda działa tylko na serwerze Discord.");
    return;
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.guildId, guildId),
        ne(ordersTable.status, "delivered"),
      ),
    )
    .orderBy(ordersTable.createdAt);

  if (orders.length === 0) {
    await interaction.editReply("📭 Brak aktywnych zamówień.");
    return;
  }

  const statusEmoji: Record<string, string> = {
    pending: "🔵",
    confirmed: "🟡",
    in_delivery: "🟠",
    delivered: "🟢",
  };

  const lines = orders.map((o) => {
    const emoji = statusEmoji[o.status] ?? "⚪";
    const desc = o.description.length > 50
      ? o.description.substring(0, 47) + "…"
      : o.description;
    return `${emoji} **#${o.id}** — ${desc} *(${o.customerName})*`;
  });

  await interaction.editReply(
    `📋 **Aktywne zamówienia (${orders.length}):**\n${lines.join("\n")}`,
  );
}

export async function handleButtonInteraction(
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;

  let action: "confirm" | "deliver" | "complete";
  let orderIdStr: string;

  if (customId.startsWith("confirm_")) {
    action = "confirm";
    orderIdStr = customId.slice("confirm_".length);
  } else if (customId.startsWith("deliver_")) {
    action = "deliver";
    orderIdStr = customId.slice("deliver_".length);
  } else if (customId.startsWith("complete_")) {
    action = "complete";
    orderIdStr = customId.slice("complete_".length);
  } else {
    return;
  }

  const orderId = parseInt(orderIdStr, 10);
  if (isNaN(orderId)) return;

  await interaction.deferUpdate();

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!order) {
    await interaction.followUp({
      content: "❌ Nie znaleziono zamówienia.",
      ephemeral: true,
    });
    return;
  }

  const userId = interaction.user.id;
  const userName =
    interaction.user.displayName || interaction.user.username;

  if (action === "confirm" && order.status === "pending") {
    const [updated] = await db
      .update(ordersTable)
      .set({ status: "confirmed", workerId: userId, workerName: userName })
      .where(eq(ordersTable.id, orderId))
      .returning();

    if (updated) {
      await interaction.editReply({
        embeds: [buildOrderEmbed(updated)],
        components: buildOrderComponents(updated),
      });

      // Send DM to customer
      try {
        const customer = await interaction.client.users.fetch(order.customerId);
        const orderTypeLabel =
          order.orderType === "na_dostawe" ? "🚚 Dostawa" : "🪑 Na miejscu";
        await customer.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Twoje zamówienie zostało przyjęte!")
              .setDescription(`**Zamówienie #${orderId}:**\n> ${order.description}`)
              .setColor(0xf39c12)
              .addFields(
                { name: "🛎️ Typ", value: orderTypeLabel, inline: true },
                { name: "👷 Pracownik", value: userName, inline: true },
                { name: "📊 Status", value: "🟡 W przygotowaniu", inline: true },
              )
              .setTimestamp()
              .setFooter({ text: "Otrzymasz kolejną wiadomość, gdy kurier odbierze zamówienie." }),
          ],
        });
      } catch {
        // Customer may have DMs disabled — not a fatal error
        logger.info(
          { orderId, customerId: order.customerId },
          "Nie udało się wysłać DM do klienta (wyłączone PW?)",
        );
      }

      logger.info({ orderId, workerId: userId }, "Order confirmed by worker");
    }
  } else if (action === "deliver" && order.status === "confirmed") {
    if (order.workerId === userId) {
      await interaction.followUp({
        content: "❌ Pracownik nie może być jednocześnie kurierem tego zamówienia.",
        ephemeral: true,
      });
      return;
    }

    const [updated] = await db
      .update(ordersTable)
      .set({ status: "in_delivery", courierId: userId, courierName: userName })
      .where(eq(ordersTable.id, orderId))
      .returning();

    if (updated) {
      await interaction.editReply({
        embeds: [buildOrderEmbed(updated)],
        components: buildOrderComponents(updated),
      });
      logger.info({ orderId, courierId: userId }, "Order picked up by courier");
    }
  } else if (action === "complete" && order.status === "in_delivery") {
    if (order.courierId !== userId) {
      await interaction.followUp({
        content:
          "❌ Tylko kurier przypisany do tego zamówienia może oznaczyć je jako dostarczone.",
        ephemeral: true,
      });
      return;
    }

    const [updated] = await db
      .update(ordersTable)
      .set({ status: "delivered" })
      .where(eq(ordersTable.id, orderId))
      .returning();

    if (updated) {
      await interaction.editReply({
        embeds: [buildOrderEmbed(updated)],
        components: [],
      });
      logger.info({ orderId }, "Order delivered");
    }
  } else {
    await interaction.followUp({
      content:
        "❌ Ta akcja nie jest możliwa w obecnym stanie zamówienia.",
      ephemeral: true,
    });
  }
}
