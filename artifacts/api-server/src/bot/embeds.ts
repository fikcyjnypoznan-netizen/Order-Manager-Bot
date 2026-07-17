import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { Order } from "@workspace/db";
import { MENU_ITEMS } from "./menu.js";

const STATUS_COLORS: Record<Order["status"], number> = {
  pending: 0x3498db,     // niebieski
  confirmed: 0xf39c12,   // żółty
  in_delivery: 0xe67e22, // pomarańczowy
  delivered: 0x2ecc71,   // zielony
};

const STATUS_LABELS: Record<Order["status"], string> = {
  pending: "🔵 Oczekuje na potwierdzenie",
  confirmed: "🟡 Potwierdzone przez pracownika",
  in_delivery: "🟠 W dostawie",
  delivered: "🟢 Dostarczone",
};

const ORDER_TYPE_LABELS: Record<Order["orderType"], string> = {
  na_miejscu: "🪑 Na miejscu",
  na_dostawe: "🚚 Dostawa",
};

export function buildMenuEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🍽️ Menu restauracji")
    .setColor(0xe67e22)
    .setDescription("Wybierz dania składając zamówienie przez `/zamow`.")
    .addFields(
      MENU_ITEMS.map((item) => ({
        name: `${item.emoji} ${item.name}`,
        value: `**${item.price} zł**`,
        inline: true,
      })),
    )
    .setFooter({ text: "Ceny brutto · menu może ulec zmianie" });
}

export function buildOrderEmbed(order: Order): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📦 Zamówienie #${order.id}`)
    .setDescription(`> ${order.description}`)
    .setColor(STATUS_COLORS[order.status])
    .addFields(
      { name: "👤 Klient (Discord)", value: order.customerName, inline: true },
      { name: "🪪 Imię i nazwisko", value: order.customerFullName, inline: true },
      { name: "🆔 PESEL", value: order.pesel, inline: true },
      { name: "🛎️ Typ", value: ORDER_TYPE_LABELS[order.orderType], inline: true },
      { name: "📊 Status", value: STATUS_LABELS[order.status], inline: true },
    )
    .setTimestamp(order.createdAt)
    .setFooter({ text: `ID: ${order.id}` });

  if (order.suggestedPrice) {
    embed.addFields({ name: "💡 Cena sugerowana", value: order.suggestedPrice, inline: true });
  }

  if (order.appliedDiscountCode && order.appliedDiscountPercent) {
    embed.addFields({
      name: `🎫 Kod rabatowy klienta`,
      value: `\`${order.appliedDiscountCode}\` — **-${order.appliedDiscountPercent}%**`,
      inline: true,
    });
  }

  if (order.price) {
    embed.addFields({ name: "💰 Kwota końcowa", value: order.price, inline: true });
  }

  if (order.discountCode) {
    embed.addFields({
      name: "🎟️ Kod dla klienta (-20%)",
      value: `\`${order.discountCode}\``,
      inline: true,
    });
  }

  if (order.orderType === "na_dostawe" && order.deliveryAddress) {
    embed.addFields({ name: "📍 Adres dostawy", value: order.deliveryAddress, inline: false });
  }

  if (order.workerId && order.workerName) {
    embed.addFields({ name: "👷 Pracownik", value: order.workerName, inline: true });
  }

  if (order.courierId && order.courierName) {
    embed.addFields({ name: "🚚 Kurier", value: order.courierName, inline: true });
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
