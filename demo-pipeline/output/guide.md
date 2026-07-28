# Make a daily briefing in Claude — written guide

Teach a learner to build a reusable /briefing command in Claude Code, run it, and schedule it every weekday at 9am.

_This guide was generated from the same live Claude session as the video._

## Steps

### 1. Open your terminal and type “claude”. This is a real Claude session — everything you're about to see is live.

### 2. Step 1 — Ask in plain English for a reusable /briefing command. Claude writes it and saves it to .claude/commands.

Type into Claude:

```
Create a slash command called /briefing that reads calendar.md, todo.md and inbox.md and gives me a punchy one-minute morning briefing: today's meetings, my top 3 priorities, and anything urgent from my inbox. Keep it under 150 words.
```

### 3. Restart Claude — custom commands are loaded at startup.

### 4. Step 2 — Run /briefing. Claude reads your calendar, to-dos and inbox, and delivers your morning briefing.

Type into Claude:

```
/briefing
```

### 5. Step 3 — Ask Claude to write the schedule: every weekday at 9am, the briefing arrives automatically.

Type into Claude:

```
Save the exact cron line for my laptop into a new file called schedule.cron (just create that one file, don't run anything) so this briefing saves into briefings/ automatically every weekday at 9am.
```

## What Claude created

`.claude/commands/briefing.md`:

```markdown
---
description: Punchy one-minute morning briefing from calendar, todo, and inbox
---

Read `calendar.md`, `todo.md`, and `inbox.md` in the current directory, then produce a punchy morning briefing under 150 words total, formatted as:

**Today's Meetings** — each calendar entry as a terse one-liner (time + what), in chronological order.

**Top 3 Priorities** — the 3 things that matter most today, synthesized from todo.md and any deadlines in calendar.md. Cross-reference: if inbox.md changes a deadline or urgency for something in todo.md, use the updated info and flag the conflict briefly.

**Urgent from Inbox** — only items marked urgent or time-critical (skip newsletters/FYI-only items).

Rules:
- Total output must be under 150 words. Be terse — fragments over full sentences.
- No preamble, no meta-commentary, no "here's your briefing" — just the briefing.
- If a deadline conflicts between files (e.g. inbox moves a time earlier), call it out explicitly and briefly.
```

The schedule line for your crontab (`crontab -e`):

```
0 9 * * 1-5 cd /home/user/briefing-demo && claude -p "/briefing" > briefings/$(date +\%Y-\%m-\%d).md 2>&1
```
