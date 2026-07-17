import { REST, Routes, Events, type Interaction } from "discord.js";
import { client } from "./client.js";
import { commands } from "./commands.js";
import {
  handleZamow,
  handleZamowienia,
  handleMenu,
  handleKody,
  handleModalSubmit,
  handleButtonInteraction,
  handleDishSelect,
} from "./interactions.js";
import { logger } from "../lib/logger.js";

export async function startBot(): Promise<void> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];
  const guildId = process.env["DISCORD_GUILD_ID"];

  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN nie ustawiony — bot Discord wyłączony");
    return;
  }

  if (!clientId) {
    logger.warn("DISCORD_CLIENT_ID nie ustawiony — rejestracja komend pominięta");
  } else {
    const rest = new REST().setToken(token);
    const commandData = commands.map((c) => c.toJSON());

    try {
      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
        logger.info({ guildId }, "Zarejestrowano komendy dla serwera");
      } else {
        await rest.put(Routes.applicationCommands(clientId), { body: commandData });
        logger.info("Zarejestrowano globalne komendy (może potrwać do 1 godz.)");
      }
    } catch (err) {
      logger.error({ err }, "Błąd rejestracji komend slash");
    }
  }

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Bot Discord gotowy");
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
          case "zamow":
            await handleZamow(interaction);
            break;
          case "zamowienia":
            await handleZamowienia(interaction);
            break;
          case "menu":
            await handleMenu(interaction);
            break;
          case "kody":
            await handleKody(interaction);
            break;
        }
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith("dish_select|")) {
          await handleDishSelect(interaction);
        }
      }
    } catch (err) {
      logger.error({ err }, "Błąd podczas obsługi interakcji");
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction
          .reply({ content: "❌ Wystąpił błąd. Spróbuj ponownie.", ephemeral: true })
          .catch(() => {});
      }
    }
  });

  await client.login(token);
}
