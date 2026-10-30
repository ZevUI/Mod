require("dotenv").config();
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionFlagsBits,
  ChannelType
} = require("discord.js");
const Database = require("better-sqlite3");
const path = require("node:path");
const fs = require("node:fs");

const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "vanta.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS settings (guild_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY(guild_id,key));
CREATE TABLE IF NOT EXISTS cases (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, target_id TEXT NOT NULL, moderator_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
`);
const getSetting = db.prepare("SELECT value FROM settings WHERE guild_id=? AND key=?");
const setSetting = db.prepare("INSERT INTO settings(guild_id,key,value) VALUES(?,?,?) ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value");
const delSetting = db.prepare("DELETE FROM settings WHERE guild_id=? AND key=?");
const addCase = db.prepare("INSERT INTO cases(guild_id,target_id,moderator_id,action,reason,created_at,active) VALUES(?,?,?,?,?,?,1)");
const listCases = db.prepare("SELECT * FROM cases WHERE guild_id=? AND target_id=? ORDER BY id DESC LIMIT 10");
const listWarnings = db.prepare("SELECT * FROM cases WHERE guild_id=? AND target_id=? AND action='WARN' AND active=1 ORDER BY id DESC");
const color = Number(process.env.EMBED_COLOR || 7506394);
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message]
});
const val = (guild, key, fallback = null) => getSetting.get(guild, key)?.value ?? fallback;
const record = (i, target, action, reason, active = 1) => {
  const info = addCase.run(i.guildId, String(target), i.user.id, action, reason || "No reason provided", Date.now());
  return Number(info.lastInsertRowid);
};
const embed = (title, description) => new EmbedBuilder().setColor(color).setTitle(`VANTA • ${title}`).setDescription(description).setTimestamp();
async function sendLog(guild, description) {
  const id = val(guild.id, "log_channel");
  if (!id) return;
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (channel?.isTextBased()) await channel.send({ embeds: [embed("Moderation Log", description)] }).catch(() => {});
}
function fillMessage(text, member) {
  return text.replaceAll("{user}", `<@${member.id}>`).replaceAll("{username}", member.user.username).replaceAll("{server}", member.guild.name);
}
async function reply(i, content, ephemeral = true) {
  if (i.deferred || i.replied) return i.followUp({ content, ephemeral });
  return i.reply({ content, ephemeral });
}
async function canActOn(i, member) {
  if (!member) { await reply(i, "That member is no longer in this server."); return false; }
  if (member.id === i.user.id) { await reply(i, "You cannot moderate yourself."); return false; }
  if (member.id === i.guild.ownerId) { await reply(i, "You cannot moderate the server owner."); return false; }
  const actor = await i.guild.members.fetch(i.user.id);
  if (i.user.id !== i.guild.ownerId && actor.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
    await reply(i, "Your highest role must be above the target member's highest role."); return false;
  }
  if (!member.manageable && !member.kickable && !member.bannable) {
    await reply(i, "My role is not high enough to moderate that member."); return false;
  }
  return true;
}
client.once("ready", () => console.log(`VANTA online as ${client.user.tag}`));

client.on("guildMemberAdd", async member => {
  const roleId = val(member.guild.id, "autorole");
  if (roleId) {
    const role = await member.guild.roles.fetch(roleId).catch(() => null);
    if (role && role.position < member.guild.members.me.roles.highest.position) {
      await member.roles.add(role, "VANTA autorole").catch(err => console.error("Autorole failed:", err.message));
    }
  }
  const channelId = val(member.guild.id, "join_channel");
  const text = val(member.guild.id, "join_message", "Welcome {user} to **{server}**!");
  if (channelId && text) {
    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const target = val(member.guild.id, "join_mention", "user");
      const content = fillMessage(text, member);
      const message = await channel.send({
        content: target === "user" ? `<@${member.id}> ${content}` : content,
        allowedMentions: target === "user" ? { users: [member.id] } : { parse: [] }
      }).catch(() => null);
      const seconds = Number(val(member.guild.id, "join_timer", "0"));
      if (message && seconds > 0) setTimeout(() => message.delete().catch(() => {}), seconds * 1000).unref?.();
    }
  }
});

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand() || !i.guild) return;
  const name = i.commandName;
  const reason = i.options.getString("reason") || "No reason provided";
  try {
    if (name === "help") {
      return reply(i, "**VANTA Moderation**\n`/ban` `/unban` `/kick` `/timeout` `/untimeout` `/warn` `/warnings` `/unwarn` `/clearwarnings` `/purge` `/lock` `/unlock` `/slowmode` `/modlogs` `/autorole` `/joinping` `/logs`");
    }
    if (name === "autorole") {
      const sub = i.options.getSubcommand();
      if (sub === "set") {
        const role = i.options.getRole("role");
        if (role.managed || role.position >= i.guild.members.me.roles.highest.position) return reply(i, "I can't assign that role. Move my bot role above it and choose a normal role.");
        setSetting.run(i.guildId, "autorole", role.id);
        return reply(i, `Autorole set to ${role}.`);
      }
      if (sub === "remove") { delSetting.run(i.guildId, "autorole"); return reply(i, "Autorole disabled."); }
      return reply(i, `Current autorole: ${val(i.guildId, "autorole") ? `<@&${val(i.guildId, "autorole")}>` : "not configured"}.`);
    }
    if (name === "joinping") {
      const sub = i.options.getSubcommand();
      if (sub === "channel") { setSetting.run(i.guildId, "join_channel", i.options.getChannel("channel").id); return reply(i, "Join message channel saved."); }
      if (sub === "message") { setSetting.run(i.guildId, "join_message", i.options.getString("text")); return reply(i, "Join message saved. Placeholders: `{user}`, `{username}`, `{server}`."); }
      if (sub === "mention") { setSetting.run(i.guildId, "join_mention", i.options.getString("target")); return reply(i, `Join mention set to **${i.options.getString("target")}**.`); }
      if (sub === "timer") { setSetting.run(i.guildId, "join_timer", String(i.options.getInteger("seconds"))); return reply(i, `Join message deletion timer set to ${i.options.getInteger("seconds")} seconds. Use 0 to keep messages.`); }
      if (sub === "disable") { delSetting.run(i.guildId, "join_channel"); return reply(i, "Join messages disabled."); }
      if (sub === "test") {
        const channelId = val(i.guildId, "join_channel");
        const channel = channelId ? await i.guild.channels.fetch(channelId).catch(() => null) : null;
        if (!channel?.isTextBased()) return reply(i, "Set a valid channel first with `/joinping channel`.");
        const text = fillMessage(val(i.guildId, "join_message", "Welcome {user} to **{server}**!"), i.member);
        const target = val(i.guildId, "join_mention", "user");
        const m = await channel.send({ content: target === "user" ? `<@${i.user.id}> ${text}` : text, allowedMentions: target === "user" ? { users: [i.user.id] } : { parse: [] } });
        const seconds = Number(val(i.guildId, "join_timer", "0"));
        if (seconds > 0) setTimeout(() => m.delete().catch(() => {}), seconds * 1000).unref?.();
        return reply(i, `Test message sent in ${channel}.`);
      }
    }
    if (name === "logs") {
      if (i.options.getSubcommand() === "set") { setSetting.run(i.guildId, "log_channel", i.options.getChannel("channel").id); return reply(i, "Moderation log channel saved."); }
      delSetting.run(i.guildId, "log_channel"); return reply(i, "Moderation logs disabled.");
    }
    if (name === "ban" || name === "kick" || name === "timeout" || name === "untimeout" || name === "warn") {
      const user = i.options.getUser("user");
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      if (name === "warn") {
        if (!await canActOn(i, member)) return;
        const id = record(i, user.id, "WARN", reason);
        await user.send(`You were warned in **${i.guild.name}**.\nReason: ${reason}\nCase: #${id}`).catch(() => {});
        await sendLog(i.guild, `**WARN** ${user.tag} (\`${user.id}\`) by ${i.user.tag}\nReason: ${reason}\nCase: #${id}`);
        return reply(i, `Warned ${user.tag}. Case #${id}.`);
      }
      if (!await canActOn(i, member)) return;
      if (name === "ban") await member.ban({ reason: `${reason} | Moderator: ${i.user.tag}` });
      if (name === "kick") await member.kick(`${reason} | Moderator: ${i.user.tag}`);
      if (name === "timeout") await member.timeout(i.options.getInteger("minutes") * 60000, `${reason} | Moderator: ${i.user.tag}`);
      if (name === "untimeout") await member.timeout(null, `${reason} | Moderator: ${i.user.tag}`);
      const action = ({ban:"BAN",kick:"KICK",timeout:"TIMEOUT",untimeout:"UNTIMEOUT"})[name];
      const id = record(i, user.id, action, reason);
      await sendLog(i.guild, `**${action}** ${user.tag} (\`${user.id}\`) by ${i.user.tag}\nReason: ${reason}\nCase: #${id}`);
      return reply(i, `${action} completed for ${user.tag}. Case #${id}.`);
    }
    if (name === "unban") {
      const id = i.options.getString("user_id");
      await i.guild.members.unban(id, `${reason} | Moderator: ${i.user.tag}`);
      const caseId = record(i, id, "UNBAN", reason);
      await sendLog(i.guild, `**UNBAN** \`${id}\` by ${i.user.tag}\nReason: ${reason}\nCase: #${caseId}`);
      return reply(i, `Unbanned \`${id}\`. Case #${caseId}.`);
    }
    if (name === "warnings" || name === "clearwarnings" || name === "modlogs") {
      const user = i.options.getUser("user");
      if (name === "warnings") {
        const rows = listWarnings.all(i.guildId, user.id);
        return reply(i, rows.length ? rows.map(r => `#${r.id} — <t:${Math.floor(r.created_at/1000)}:d> — ${r.reason}`).join("\n") : `${user.tag} has no active warnings.`);
      }
      if (name === "clearwarnings") {
        db.prepare("UPDATE cases SET active=0 WHERE guild_id=? AND target_id=? AND action='WARN'").run(i.guildId, user.id);
        return reply(i, `Cleared active warnings for ${user.tag}.`);
      }
      const rows = listCases.all(i.guildId, user.id);
      return reply(i, rows.length ? rows.map(r => `#${r.id} **${r.action}** — <t:${Math.floor(r.created_at/1000)}:R> — ${r.reason}`).join("\n") : `No cases found for ${user.tag}.`);
    }
    if (name === "unwarn") {
      const id = i.options.getInteger("case_id");
      const result = db.prepare("UPDATE cases SET active=0 WHERE id=? AND guild_id=? AND action='WARN' AND active=1").run(id, i.guildId);
      return reply(i, result.changes ? `Warning #${id} removed.` : `Active warning #${id} wasn't found.`);
    }
    if (name === "purge") {
      const amount = i.options.getInteger("amount");
      const channel = i.channel;
      const deleted = await channel.bulkDelete(amount, true);
      await reply(i, `Deleted ${deleted.size} messages.`);
      await sendLog(i.guild, `**PURGE** ${deleted.size} messages in ${channel} by ${i.user.tag}`);
      return;
    }
    if (name === "lock" || name === "unlock") {
      const channel = i.options.getChannel("channel") || i.channel;
      if (!channel.isTextBased() || !channel.permissionOverwrites) return reply(i, "Choose a text channel.");
      await channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: name === "unlock" ? null : false });
      return reply(i, `${channel} ${name === "lock" ? "locked" : "unlocked"}.`);
    }
    if (name === "slowmode") {
      const channel = i.options.getChannel("channel") || i.channel;
      await channel.setRateLimitPerUser(i.options.getInteger("seconds"));
      return reply(i, `Slowmode set to ${i.options.getInteger("seconds")} seconds in ${channel}.`);
    }
  } catch (err) {
    console.error(`Command /${name} failed:`, err);
    const msg = err.code === 50013 ? "I don't have the required Discord permissions or my role is too low." : (err.code === 50035 ? "Discord rejected that action. Check the user ID and command options." : "That command failed. Check my permissions and role hierarchy.");
    return reply(i, msg).catch(() => {});
  }
});

client.on("messageDelete", async message => {
  if (!message.guild || message.author?.bot) return;
  await sendLog(message.guild, `**MESSAGE DELETED** in ${message.channel}\nAuthor: ${message.author?.tag || "Unknown"}\nContent: ${(message.content || "[no text content]").slice(0, 1200)}`);
});
client.on("messageUpdate", async (before, after) => {
  if (!after.guild || before.author?.bot || before.content === after.content) return;
  await sendLog(after.guild, `**MESSAGE EDITED** in ${after.channel}\nAuthor: ${after.author?.tag || "Unknown"}\nBefore: ${(before.content || "[empty]").slice(0, 700)}\nAfter: ${(after.content || "[empty]").slice(0, 700)}`);
});
client.on("guildMemberRemove", async member => sendLog(member.guild, `**MEMBER LEFT** ${member.user.tag} (\`${member.id}\`)`));
client.login(process.env.DISCORD_TOKEN);
