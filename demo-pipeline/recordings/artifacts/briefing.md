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
