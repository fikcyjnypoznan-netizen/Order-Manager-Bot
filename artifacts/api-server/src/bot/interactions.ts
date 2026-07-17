import {
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { db, ordersTable, discountCodes } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { buildOrderEmbed, buildOrderComponents, buildMenuEmbed } from "./embeds.js";
import { MENU_ITEMS, getMenuItem, buildOrderDescription } from "./menu.js";
import { logger } from "../lib/logger.js";

const ORDERS_CHANNEL_ID = process.env["DISCORD_ORDERS_CHANNEL_ID"];
const MANAGER_ROLE_ID = "1527564304021196910";

// Max dishes selectable per order type (Discord modal limit: 5 fields)
// na_miejscu: name(1) + pesel(1) + dishes(up to 3) [+ discount if room]
// na_dostawe: name(1) + pesel(1) + address(1) + dishes(up to 2) [+ discount if room]
const MAX_DISHES: Record<"m" | "d", number> = { m: 3, d: 2 };

// ─── /menu ───────────────────────────────────────────────────────────────────

export async function handleMenu(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.reply({ embeds: [buildMenuEmbed()], ephemeral: true });
}

// ─── /zamow — dish selection view ────────────────────────────────────────────

export async function handleZamow(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const orderType = interaction.options.getString("typ", true) as
    | "na_miejscu"
    | "na_dostawe";

  const typeKey = orderType === "na_dostawe" ? "d" : "m";

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`dish_select|${typeKey}`)
    .setPlaceholder("Wybierz dania (możesz zaznaczyć kilka)")
    .setMinValues(1)
    .setMaxValues(MENU_ITEMS.length)
    .addOptions(
      MENU_ITEMS.map((item) => ({
        label: `${item.name} — ${item.price} zł`,
        value: item.id,
        emoji: item.emoji,
      })),
    );

  // No dishes selected yet — dishes will be encoded in customId after selection
  const continueBtn = new ButtonBuilder()
    .setCustomId(`zamow_continue|${typeKey}|`)
    .setLabel("Kontynuuj →")
    .setStyle(ButtonStyle.Primary);

  await interaction.reply({
    embeds: [buildMenuEmbed()],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(continueBtn),
    ],
    ephemeral: true,
  });
}

// ─── Dish select menu changed ─────────────────────────────────────────────────

export async function handleDishSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const typeKey = interaction.customId.split("|")[1]!;
  const orderType = typeKey === "d" ? "na_dostawe" : "na_miejscu";
  const selected = interaction.values;

  // Encode selected dishes directly in the button customId (no server state needed)
  const dishesEncoded = selected.join(",");

  const names = selected
    .map((id) => getMenuItem(id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .map((i) => `${i.emoji} ${i.name}`)
    .join(", ");

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`dish_select|${typeKey}`)
    .setPlaceholder("Wybierz dania (możesz zaznaczyć kilka)")
    .setMinValues(1)
    .setMaxValues(MENU_ITEMS.length)
    .addOptions(
      MENU_ITEMS.map((item) => ({
        label: `${item.name} — ${item.price} zł`,
        value: item.id,
        emoji: item.emoji,
        default: selected.includes(item.id),
      })),
    );

  const typeLabel = orderType === "na_dostawe" ? "🚚 Dostawa" : "🪑 Na miejscu";
  const continueBtn = new ButtonBuilder()
    .setCustomId(`zamow_continue|${typeKey}|${dishesEncoded}`)
    .setLabel(`Kontynuuj → (${typeLabel})`)
    .setStyle(ButtonStyle.Primary);

  await interaction.update({
    content: `✅ Wybrano: ${names}`,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(continueBtn),
    ],
  });
}

// ─── "Kontynuuj" button → show personal details modal ────────────────────────

export async function handleZamowContinue(
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split("|");
  const typeKey = parts[1]!;
  const dishesStr = parts[2] ?? "";
  const orderType = typeKey === "d" ? "na_dostawe" : "na_miejscu";
  const selected = dishesStr ? dishesStr.split(",") : [];

  if (selected.length === 0) {
    await interaction.reply({
      content: "❌ Najpierw wybierz co najmniej jedno danie z listy.",
      ephemeral: true,
    });
    return;
  }

  const dishNames = selected
    .flatMap((id) => { const m = getMenuItem(id); return m ? [m.name] : []; })
    .join(", ");

  const qtyPlaceholder = selected.map(() => "1").join(", ");

  const nameInput = new TextInputBuilder()
    .setCustomId("full_name")
    .setLabel("Imię i nazwisko")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder("Jan Kowalski");

  const peselInput = new TextInputBuilder()
    .setCustomId("pesel")
    .setLabel("PESEL")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(11)
    .setMaxLength(11)
    .setPlaceholder("12345678901");

  const qtyInput = new TextInputBuilder()
    .setCustomId("quantities")
    .setLabel(`Ilości dań: ${dishNames}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(30)
    .setPlaceholder(`${qtyPlaceholder} (zostaw puste = po 1 sztuce)`);

  const discountInput = new TextInputBuilder()
    .setCustomId("discount_code")
    .setLabel("Kod rabatowy (opcjonalnie)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(20)
    .setPlaceholder("np. LATO2025");

  const rows: ActionRowBuilder<TextInputBuilder>[] = [
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(peselInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(qtyInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(discountInput),
  ];

  if (orderType === "na_dostawe") {
    const addressInput = new TextInputBuilder()
      .setCustomId("address")
      .setLabel("Adres dostawy")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200)
      .setPlaceholder("ul. Przykładowa 1/2, 00-000 Warszawa");
    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput));
  }

  // Encode selected dishes in modal customId so handleCustomerModal can read them
  const modal = new ModalBuilder()
    .setCustomId(`zamow_modal|${typeKey}|${selected.join(",")}`)
    .setTitle(orderType === "na_dostawe" ? "🚚 Zamówienie — dostawa" : "🪑 Zamówienie — na miejscu")
    .addComponents(...rows);

  await interaction.showModal(modal);
}

// ─── Customer modal submit — creates the order ────────────────────────────────

export async function handleCustomerModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const modalParts = interaction.customId.split("|");
  const typeKey = modalParts[1]!;
  const dishesStr = modalParts[2] ?? "";
  const orderType: "na_miejscu" | "na_dostawe" =
    typeKey === "d" ? "na_dostawe" : "na_miejscu";

  const fullName = interaction.fields.getTextInputValue("full_name").trim();
  const pesel = interaction.fields.getTextInputValue("pesel").trim();
  const qtyRaw = interaction.fields.getTextInputValue("quantities").trim();
  const discountCodeRaw = interaction.fields.getTextInputValue("discount_code").trim().toUpperCase();
  const address =
    orderType === "na_dostawe"
      ? interaction.fields.getTextInputValue("address").trim()
      : null;

  if (!/^\d{11}$/.test(pesel)) {
    await interaction.editReply("❌ PESEL musi zawierać dokładnie 11 cyfr.");
    return;
  }

  // Dishes are encoded in the modal customId
  const selectedIds = dishesStr ? dishesStr.split(",") : [];

  if (selectedIds.length === 0) {
    await interaction.editReply("❌ Nie wybrano żadnych dań. Spróbuj ponownie przez `/zamow`.");
    return;
  }

  // Parse quantities
  let quantities: number[];
  if (qtyRaw === "") {
    quantities = selectedIds.map(() => 1);
  } else {
    const parts = qtyRaw.split(",").map((s) => parseInt(s.trim(), 10));
    if (
      parts.length !== selectedIds.length ||
      parts.some((n) => isNaN(n) || n < 1 || n > 99)
    ) {
      const example = selectedIds.map(() => "1").join(", ");
      await interaction.editReply(
        `❌ Ilości muszą być liczbami oddzielonymi przecinkami (${selectedIds.length} liczb, np. \`${example}\`).`,
      );
      return;
    }
    quantities = parts;
  }

  const { description, totalPrice } = buildOrderDescription(selectedIds, quantities);

  // Validate discount code
  let appliedDiscountCode: string | null = null;
  let appliedDiscountPercent: number | null = null;

  if (discountCodeRaw) {
    const [codeRow] = await db
      .select()
      .from(discountCodes)
      .where(and(eq(discountCodes.code, discountCodeRaw), eq(discountCodes.isActive, true)));

    if (!codeRow) {
      await interaction.editReply(
        `❌ Kod rabatowy \`${discountCodeRaw}\` jest nieprawidłowy lub nieaktywny.`,
      );
      return;
    }

    appliedDiscountCode = codeRow.code;
    appliedDiscountPercent = codeRow.percentage;
  }

  // Calculate suggested price (with discount if applied)
  const suggestedRaw = appliedDiscountPercent
    ? totalPrice * (1 - appliedDiscountPercent / 100)
    : totalPrice;
  const suggestedPrice = suggestedRaw.toFixed(2).replace(".", ",") + " zł";

  const customerId = interaction.user.id;
  const customerName = interaction.user.displayName || interaction.user.username;
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.editReply("❌ Ta komenda działa tylko na serwerze Discord.");
    return;
  }

  const rawChannelId = ORDERS_CHANNEL_ID ?? interaction.channelId;
  if (!rawChannelId) {
    await interaction.editReply("❌ Nie znaleziono kanału zamówień.");
    return;
  }
  const channelId: string = rawChannelId;

  const targetChannel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    await interaction.editReply("❌ Nie znaleziono kanału zamówień.");
    return;
  }

  const [order] = await db
    .insert(ordersTable)
    .values({
      customerId,
      customerName,
      customerFullName: fullName,
      pesel,
      description,
      orderType,
      deliveryAddress: address,
      appliedDiscountCode,
      appliedDiscountPercent,
      suggestedPrice,
      channelId,
      guildId,
      status: "pending",
    })
    .returning();

  if (!order) {
    await interaction.editReply("❌ Błąd podczas tworzenia zamówienia.");
    return;
  }

  const message = await targetChannel.send({
    embeds: [buildOrderEmbed(order)],
    components: buildOrderComponents(order),
  });

  await db
    .update(ordersTable)
    .set({ messageId: message.id })
    .where(eq(ordersTable.id, order.id));

  const discountNote =
    appliedDiscountCode && appliedDiscountPercent
      ? ` Zastosowano rabat **-${appliedDiscountPercent}%** (kod: \`${appliedDiscountCode}\`).`
      : "";

  const priceHint = appliedDiscountPercent
    ? ` Sugerowana cena po rabacie: **${(totalPrice * (1 - appliedDiscountPercent / 100)).toFixed(2)} zł**.`
    : ` Łączna wartość koszyka: **${totalPrice} zł**.`;

  await interaction.editReply(
    `✅ Zamówienie **#${order.id}** złożone!${discountNote}${priceHint}\nCzeka na potwierdzenie przez pracownika.`,
  );

  logger.info({ orderId: order.id, customerId, orderType, totalPrice }, "Order created");
}

// ─── Worker confirm modal — sets price and confirms ──────────────────────────

export async function handleWorkerConfirmModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const orderId = parseInt(interaction.customId.replace("worker_confirm_", ""), 10);
  if (isNaN(orderId)) return;

  await interaction.deferReply({ ephemeral: true });

  const priceRaw = interaction.fields
    .getTextInputValue("price")
    .trim()
    .replace(",", ".");
  const priceNum = parseFloat(priceRaw);

  if (isNaN(priceNum) || priceNum <= 0) {
    await interaction.editReply("❌ Podaj prawidłową kwotę (np. 45.00 lub 45,00).");
    return;
  }

  const priceFormatted = priceNum.toFixed(2).replace(".", ",") + " zł";
  const userId = interaction.user.id;
  const userName = interaction.user.displayName || interaction.user.username;

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));

  if (!order || order.status !== "pending") {
    await interaction.editReply("❌ Zamówienie nie istnieje lub zostało już przetworzone.");
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: "confirmed", workerId: userId, workerName: userName, price: priceFormatted })
    .where(eq(ordersTable.id, orderId))
    .returning();

  if (!updated) {
    await interaction.editReply("❌ Błąd podczas aktualizacji zamówienia.");
    return;
  }

  if (order.messageId) {
    try {
      const channel = await interaction.client.channels.fetch(order.channelId).catch(() => null);
      if (channel?.type === ChannelType.GuildText) {
        const msg = await channel.messages.fetch(order.messageId).catch(() => null);
        if (msg) {
          await msg.edit({ embeds: [buildOrderEmbed(updated)], components: buildOrderComponents(updated) });
        }
      }
    } catch { /* message may be deleted */ }
  }

  try {
    const customer = await interaction.client.users.fetch(order.customerId);
    const typeLabel = order.orderType === "na_dostawe" ? "🚚 Dostawa" : "🪑 Na miejscu";
    const discountField =
      order.appliedDiscountCode && order.appliedDiscountPercent
        ? [{ name: "🎫 Kod rabatowy", value: `\`${order.appliedDiscountCode}\` (-${order.appliedDiscountPercent}%)`, inline: true }]
        : [];

    await customer.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ Twoje zamówienie zostało przyjęte!")
          .setDescription(`**Zamówienie #${orderId}:**\n${order.description}`)
          .setColor(0xf39c12)
          .addFields(
            { name: "🛎️ Typ", value: typeLabel, inline: true },
            { name: "👷 Pracownik", value: userName, inline: true },
            { name: "💰 Kwota do zapłaty", value: priceFormatted, inline: true },
            ...discountField,
            { name: "📊 Status", value: "🟡 W przygotowaniu", inline: true },
          )
          .setTimestamp()
          .setFooter({ text: "Otrzymasz kolejną wiadomość gdy kurier odbierze zamówienie." }),
      ],
    });
  } catch {
    logger.info({ orderId, customerId: order.customerId }, "Nie udało się wysłać DM do klienta");
  }

  await interaction.editReply(`✅ Zamówienie **#${orderId}** potwierdzone. Kwota: **${priceFormatted}**`);
  logger.info({ orderId, workerId: userId, price: priceFormatted }, "Order confirmed");
}

// ─── /zamowienia ──────────────────────────────────────────────────────────────

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
    .where(and(eq(ordersTable.guildId, guildId), ne(ordersTable.status, "delivered")))
    .orderBy(ordersTable.createdAt);

  if (orders.length === 0) {
    await interaction.editReply("📭 Brak aktywnych zamówień.");
    return;
  }

  const statusEmoji: Record<string, string> = {
    pending: "🔵", confirmed: "🟡", in_delivery: "🟠", delivered: "🟢",
  };

  const lines = orders.map((o) => {
    const emoji = statusEmoji[o.status] ?? "⚪";
    const desc = o.description.length > 60 ? o.description.substring(0, 57) + "…" : o.description;
    const type = o.orderType === "na_dostawe" ? "🚚" : "🪑";
    const price = o.price ? ` · **${o.price}**` : "";
    const discount = o.appliedDiscountCode ? ` 🎫\`${o.appliedDiscountCode}\`` : "";
    return `${emoji}${type} **#${o.id}** — ${o.customerFullName}${price}${discount}\n↳ ${desc}`;
  });

  await interaction.editReply(`📋 **Aktywne zamówienia (${orders.length}):**\n\n${lines.join("\n\n")}`);
}

// ─── /kody ───────────────────────────────────────────────────────────────────

export async function handleKody(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // Role check
  const member = interaction.member;
  const hasRole =
    member &&
    "roles" in member &&
    typeof member.roles === "object" &&
    member.roles !== null &&
    "cache" in member.roles &&
    // @ts-expect-error — GuildMemberRoleManager
    (member.roles.cache.has(MANAGER_ROLE_ID) || member.roles.cache.has(interaction.guild?.roles.everyone.id));

  const isManager =
    member &&
    "roles" in member &&
    // @ts-expect-error — GuildMemberRoleManager
    member.roles.cache.has(MANAGER_ROLE_ID);

  if (!isManager) {
    await interaction.reply({
      content: "❌ Nie masz uprawnień do zarządzania kodami rabatowymi.",
      ephemeral: true,
    });
    return;
  }

  const sub = interaction.options.getSubcommand(true);

  if (sub === "dodaj") {
    const name = interaction.options.getString("nazwa", true).trim().toUpperCase();
    const percent = interaction.options.getInteger("procent", true);

    if (!/^[A-Z0-9]+$/.test(name)) {
      await interaction.reply({
        content: "❌ Nazwa kodu może zawierać tylko litery (A-Z) i cyfry (0-9).",
        ephemeral: true,
      });
      return;
    }

    try {
      await db.insert(discountCodes).values({
        code: name,
        percentage: percent,
        createdBy: interaction.user.id,
      });

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Kod rabatowy dodany")
            .setColor(0x2ecc71)
            .addFields(
              { name: "🏷️ Kod", value: `\`${name}\``, inline: true },
              { name: "💸 Rabat", value: `**-${percent}%**`, inline: true },
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });

      logger.info({ code: name, percent, addedBy: interaction.user.id }, "Discount code added");
    } catch (err: unknown) {
      const isDupe =
        typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
      await interaction.reply({
        content: isDupe
          ? `❌ Kod \`${name}\` już istnieje.`
          : "❌ Błąd podczas dodawania kodu.",
        ephemeral: true,
      });
    }
  } else if (sub === "lista") {
    const rows = await db
      .select()
      .from(discountCodes)
      .where(eq(discountCodes.isActive, true))
      .orderBy(discountCodes.createdAt);

    if (rows.length === 0) {
      await interaction.reply({ content: "📭 Brak aktywnych kodów rabatowych.", ephemeral: true });
      return;
    }

    const lines = rows.map((r) => `\`${r.code}\` — **-${r.percentage}%**`);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎫 Aktywne kody rabatowe")
          .setColor(0x3498db)
          .setDescription(lines.join("\n"))
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  } else if (sub === "usun") {
    const name = interaction.options.getString("nazwa", true).trim().toUpperCase();

    const [existing] = await db
      .select()
      .from(discountCodes)
      .where(and(eq(discountCodes.code, name), eq(discountCodes.isActive, true)));

    if (!existing) {
      await interaction.reply({
        content: `❌ Aktywny kod \`${name}\` nie istnieje.`,
        ephemeral: true,
      });
      return;
    }

    await db
      .update(discountCodes)
      .set({ isActive: false })
      .where(eq(discountCodes.code, name));

    await interaction.reply({
      content: `✅ Kod \`${name}\` został dezaktywowany.`,
      ephemeral: true,
    });

    logger.info({ code: name, removedBy: interaction.user.id }, "Discount code deactivated");
  }
}

// ─── Modal submit router ──────────────────────────────────────────────────────

export async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (interaction.customId.startsWith("zamow_modal|")) {
    await handleCustomerModal(interaction);
  } else if (interaction.customId.startsWith("worker_confirm_")) {
    await handleWorkerConfirmModal(interaction);
  }
}

// ─── Button interactions ──────────────────────────────────────────────────────

export async function handleButtonInteraction(
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;

  // Dish selection continue button
  if (customId.startsWith("zamow_continue|")) {
    await handleZamowContinue(interaction);
    return;
  }

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

  // Confirm shows a price modal — fetch order first to pre-fill suggested price
  if (action === "confirm") {
    const [orderForModal] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));

    const suggested = orderForModal?.suggestedPrice ?? "";

    const modal = new ModalBuilder()
      .setCustomId(`worker_confirm_${orderId}`)
      .setTitle(`💰 Zamówienie #${orderId} — wpisz kwotę`)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("price")
            .setLabel("Kwota za zamówienie (zł)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20)
            .setPlaceholder("np. 45,00")
            .setValue(suggested),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  await interaction.deferUpdate();

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));

  if (!order) {
    await interaction.followUp({ content: "❌ Nie znaleziono zamówienia.", ephemeral: true });
    return;
  }

  const userId = interaction.user.id;
  const userName = interaction.user.displayName || interaction.user.username;

  if (action === "deliver" && order.status === "confirmed") {
    const [updated] = await db
      .update(ordersTable)
      .set({ status: "in_delivery", courierId: userId, courierName: userName })
      .where(eq(ordersTable.id, orderId))
      .returning();

    if (updated) {
      await interaction.editReply({ embeds: [buildOrderEmbed(updated)], components: buildOrderComponents(updated) });
      logger.info({ orderId, courierId: userId }, "Order picked up by courier");
    }
  } else if (action === "complete" && order.status === "in_delivery") {
    if (order.courierId !== userId) {
      await interaction.followUp({
        content: "❌ Tylko kurier przypisany do tego zamówienia może oznaczyć je jako dostarczone.",
        ephemeral: true,
      });
      return;
    }

    const discountCode = Array.from({ length: 5 }, () =>
      "ABCDEFGHJKLMNPQRSTUVWXYZ123456789"[Math.floor(Math.random() * 33)],
    ).join("");

    const [updated] = await db
      .update(ordersTable)
      .set({ status: "delivered", discountCode })
      .where(eq(ordersTable.id, orderId))
      .returning();

    if (updated) {
      await interaction.editReply({ embeds: [buildOrderEmbed(updated)], components: [] });

      try {
        const customer = await interaction.client.users.fetch(order.customerId);
        await customer.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("🎉 Dziękujemy za zakup!")
              .setDescription(
                "Dziękujemy za zaufanie i zakup w naszej restauracji.\nZ tej okazji oferujemy kod na kolejne zamówienie **-20%**.",
              )
              .setColor(0x2ecc71)
              .addFields({ name: "🎟️ Twój kod rabatowy", value: `\`\`\`${discountCode}\`\`\``, inline: false })
              .setTimestamp()
              .setFooter({ text: "Kod jednorazowy · do wykorzystania przy następnym zamówieniu" }),
          ],
        });
      } catch {
        logger.info({ orderId, customerId: order.customerId }, "Nie udało się wysłać DM z kodem rabatowym");
      }

      await interaction.followUp({
        content: `✅ Zamówienie **#${orderId}** dostarczone.\n🎟️ Kod rabatowy dla klienta: \`${discountCode}\``,
        ephemeral: true,
      });

      logger.info({ orderId, discountCode }, "Order delivered, discount code generated");
    }
  } else {
    await interaction.followUp({
      content: "❌ Ta akcja nie jest możliwa w obecnym stanie zamówienia.",
      ephemeral: true,
    });
  }
}
