require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

const commands = [
  new SlashCommandBuilder().setName("ban").setDescription("Ban a member").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("unban").setDescription("Unban by Discord user ID").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName("user_id").setDescription("User ID").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("kick").setDescription("Kick a member").setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("1–40320 minutes").setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("untimeout").setDescription("Remove timeout").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("warn").setDescription("Warn a member").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500)),
  new SlashCommandBuilder().setName("warnings").setDescription("View a member's warnings").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("clearwarnings").setDescription("Clear a member's warnings").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("unwarn").setDescription("Remove a warning by case number").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption(o => o.setName("case_id").setDescription("Warning case ID").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("purge").setDescription("Delete 1–100 recent messages").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("amount").setDescription("Number of messages").setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName("lock").setDescription("Lock a text channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o => o.setName("channel").setDescription("Channel to lock").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("unlock").setDescription("Unlock a text channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o => o.setName("channel").setDescription("Channel to unlock").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("slowmode").setDescription("Set slowmode seconds (0–21600)").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(o => o.setName("seconds").setDescription("Seconds").setRequired(true).setMinValue(0).setMaxValue(21600))
    .addChannelOption(o => o.setName("channel").setDescription("Text channel").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("modlogs").setDescription("View recent moderation cases for a member").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("autorole").setDescription("Configure role assigned to new members").setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(s => s.setName("set").setDescription("Set the join role").addRoleOption(o => o.setName("role").setDescription("Role to assign").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Disable autorole"))
    .addSubcommand(s => s.setName("view").setDescription("View autorole setting")),
  new SlashCommandBuilder().setName("joinping").setDescription("Configure the new-member join message").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("channel").setDescription("Choose join message channel").addChannelOption(o => o.setName("channel").setDescription("Text channel").setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName("message").setDescription("Set message; placeholders: {user}, {username}, {server}").addStringOption(o => o.setName("text").setDescription("Message text").setRequired(true).setMaxLength(1800)))
    .addSubcommand(s => s.setName("mention").setDescription("Choose mention target").addStringOption(o => o.setName("target").setDescription("Mention target").setRequired(true).addChoices({name:"Mention joining member",value:"user"},{name:"No mention",value:"none"})))
    .addSubcommand(s => s.setName("timer").setDescription("Set auto-delete timer in seconds (0 means never)").addIntegerOption(o => o.setName("seconds").setDescription("Seconds, 0–86400").setRequired(true).setMinValue(0).setMaxValue(86400)))
    .addSubcommand(s => s.setName("test").setDescription("Preview join message"))
    .addSubcommand(s => s.setName("disable").setDescription("Disable join messages")),
  new SlashCommandBuilder().setName("logs").setDescription("Configure moderation log channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("set").setDescription("Set log channel").addChannelOption(o => o.setName("channel").setDescription("Log channel").setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName("disable").setDescription("Disable moderation logs")),
  new SlashCommandBuilder().setName("help").setDescription("Show VANTA bot commands")
];

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
if (!token || !clientId) throw new Error("Set DISCORD_TOKEN and CLIENT_ID in your environment.");
const rest = new REST({ version: "10" }).setToken(token);
(async () => {
  const body = commands.map(c => c.toJSON());
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`Registered ${body.length} commands to guild ${guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(`Registered ${body.length} global commands.`);
  }
})().catch(err => { console.error(err); process.exit(1); });
