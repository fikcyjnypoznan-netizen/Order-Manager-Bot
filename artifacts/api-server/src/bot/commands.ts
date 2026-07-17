import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("zamow")
    .setDescription("Złóż nowe zamówienie")
    .addStringOption((opt) =>
      opt
        .setName("typ")
        .setDescription("Sposób realizacji zamówienia")
        .setRequired(true)
        .addChoices(
          { name: "🪑 Na miejscu", value: "na_miejscu" },
          { name: "🚚 Dostawa", value: "na_dostawe" },
        ),
    ),

  new SlashCommandBuilder()
    .setName("zamowienia")
    .setDescription("Wyświetl listę aktywnych zamówień"),

  new SlashCommandBuilder()
    .setName("menu")
    .setDescription("Wyświetl aktualne menu restauracji"),

  new SlashCommandBuilder()
    .setName("kody")
    .setDescription("Zarządzanie kodami rabatowymi (tylko dla managera)")
    .addSubcommand((sub) =>
      sub
        .setName("dodaj")
        .setDescription("Dodaj nowy kod rabatowy")
        .addStringOption((opt) =>
          opt
            .setName("nazwa")
            .setDescription("Nazwa kodu (np. LATO2025)")
            .setRequired(true)
            .setMaxLength(20),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("procent")
            .setDescription("Wartość rabatu w procentach (1–99)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(99),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("lista")
        .setDescription("Wyświetl aktywne kody rabatowe"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("usun")
        .setDescription("Dezaktywuj kod rabatowy")
        .addStringOption((opt) =>
          opt
            .setName("nazwa")
            .setDescription("Nazwa kodu do dezaktywacji")
            .setRequired(true),
        ),
    ),
];
