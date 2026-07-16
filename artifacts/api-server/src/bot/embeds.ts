import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { Order } from "@workspace/db";

const STATUS_COLORS: Record<Order["status"], number> = {
  pending: 0x3498db,    // niebieski
  confirmed: 0xf39c12,  // żółty
  in_delivery: 0xe67e22, // pomarańczowy
  delivered: 0x2ecc71,  // zielony
};

const STATUS_LABELS: Record<Order["status"], string> = {
  pending: "🔵 Oczekuje na potwierdzenie",
  confirmed: "🟡 Potwierdzone przez pracownika",
  in_delivery: "🟠 W dostawie",
  delivered: "🟢 Dostarczone",
};

export function buildOrderEmbed(order: Order): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📦 Zamówienie #${order.id}`)
    .setDescription(`> ${order.description}`)
    .setColor(STATUS_COLORS[order.status])
    .addFields(
      { name: "👤 Klient", value: order.customerName, inline: true },
      { name: "📊 Status", value: STATUS_LABELS[order.status], inline: true },
    )
    .setTimestamp(order.createdAt)
    .setFooter({ text: `ID: ${order.id}` });

  if (order.workerId && order.workerName) {
    embed.addFields({
      name: "👷 Pracownik",
      value: order.workerName,
      inline: true,
    });
  }

  if (order.courierId && order.courierName) {
    embed.addFields({
      name: "🚚 Kurier",
      value: order.courierName,
      inline: true,
    });
  }

  return embed;
}

export function buildOrderComponents(
  order: Order,
): ActionRowBuilder<ButtonBuilder>[] {
  if (order.status === "pending") {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_${order.id}`)
          .setLabel("✅ Potwierdź zamówienie")
          .setStyle(ButtonStyle.Success),
      ),
    ];
  }

  if (order.status === "confirmed") {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`deliver_${order.id}`)
          .setLabel("🚚 Przyjmij jako kurier")
          .setStyle(ButtonStyle.Primary),
      ),
    ];
  }

  if (order.status === "in_delivery") {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`complete_${order.id}`)
          .setLabel("✔️ Oznacz jako dostarczone")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];
  }

  return [];
}
