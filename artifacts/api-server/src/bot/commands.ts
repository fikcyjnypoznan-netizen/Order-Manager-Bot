import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("zamow")
    .setDescription("Złóż nowe zamówienie")
    .addStringOption((opt) =>
      opt
        .setName("opis")
        .setDescription("Opis zamówienia (max 500 znaków)")
        .setRequired(true)
        .setMaxLength(500),
    )
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
];
