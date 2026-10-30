# VANTA Moderation Bot

## Commands
Moderation: `/ban`, `/unban`, `/kick`, `/timeout`, `/untimeout`, `/warn`, `/warnings`, `/clearwarnings`, `/unwarn`, `/purge`, `/lock`, `/unlock`, `/slowmode`, `/modlogs`
Setup: `/autorole set|remove|view`, `/joinping channel|message|mention|timer|test|disable`, `/logs set|disable`, `/help`

## Before deploying
1. Create a Discord application and bot in the Discord Developer Portal.
2. Enable **Server Members Intent** and **Message Content Intent** under Bot settings.
3. Invite the bot with `bot` and `applications.commands` scopes and the permissions it needs: Manage Roles, Ban Members, Kick Members, Moderate Members, Manage Messages, Manage Channels, View Channels, Send Messages, Read Message History, Embed Links.
4. Set `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID` in Railway Variables. `GUILD_ID` is already the server ID supplied by you: `694270550524035112`.
5. Add a Railway **Volume** and mount it at `/data`. Set `DB_PATH=/data/vanta.sqlite` so warning history/settings survive redeploys.
6. Push these files to a GitHub repository and deploy that repository as a Railway service.
7. In Railway, run `npm run deploy-commands` once (Railway service command or one-off command). Then set the service start command to `npm start`.
8. Move the bot's role above roles it needs to assign/moderate. Do not give it Administrator unless you have a specific reason.

## Security and notes
- Never upload your real bot token or `.env` file to GitHub.
- This is a starter implementation; test permissions and each command in a private server before using it live.
- Auto-delete timers are in-memory timers and work while the bot process stays running; a restart can interrupt a pending deletion.
- Discord only permits bulk deletion of messages newer than 14 days.
