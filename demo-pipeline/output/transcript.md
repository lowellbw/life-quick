# Transcript — Make a daily briefing in Claude

_Narration script with timestamps. The on-screen content is a live Claude Code session;
user prompts typed during the session are shown in quotes._

**[00:01]** Open your terminal and type “claude”. This is a real Claude session — everything you're about to see is live.
**[00:02]** Step 1 — Ask in plain English for a reusable /briefing command. Claude writes it and saves it to .claude/commands.
**[00:23]** Restart Claude — custom commands are loaded at startup.
**[00:27]** Step 2 — Run /briefing. Claude reads your calendar, to-dos and inbox, and delivers your morning briefing.
**[00:38]** Step 3 — Ask Claude to write the schedule: every weekday at 9am, the briefing arrives automatically.
**[00:55]** That's it — a daily morning briefing in Claude, built in one short conversation.

## Prompts typed in the session

- `Create a slash command called /briefing that reads calendar.md, todo.md and inbox.md and gives me a punchy one-minute morning briefing: today's meetings, my top 3 priorities, and anything urgent from my inbox. Keep it under 150 words.`
- `/briefing`
- `Save the exact cron line for my laptop into a new file called schedule.cron (just create that one file, don't run anything) so this briefing saves into briefings/ automatically every weekday at 9am.`
