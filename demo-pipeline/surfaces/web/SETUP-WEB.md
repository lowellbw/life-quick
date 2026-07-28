# Recording the take on the real claude.ai website

The web surface drives **real claude.ai in a real browser**: Playwright types the recipe's
prompts into the site's chat input, waits for each live response to finish streaming,
records the browser video, burns in captions, and checks DOM success markers. A take that
fails any marker exits non-zero (retake); every publishable take gets human sign-off.

## Requirements

1. **Network access to claude.ai.** The cloud build sandbox's egress policy blocks it
   (verified: connection reset) — run on a normal machine, or open the environment's
   network policy to `claude.ai` and `*.anthropic.com` if recording from the cloud.
2. **A logged-in session for a dedicated test account.** Use a test account so no
   personal chats, projects or names appear on screen. Export the session:

   ```bash
   npx playwright codegen --save-storage=surfaces/web/storage-state.json https://claude.ai
   # log in in the window that opens, wait for the chat UI, then close the window
   ```

   `storage-state.json` holds live session cookies: it is **gitignored — never commit
   it**, and treat it like a password. Sessions can be IP/device-checked (Cloudflare):
   a session exported on the machine that will do the recording is the most reliable;
   replaying it from a datacenter IP may hit a challenge page.

## Calibrate (once per site revision)

The four selectors in `web-config.json` are best-guess until confirmed:

```bash
npm run web:probe
```

This opens claude.ai with the stored session and writes `output-web/probe.png` plus a
dump of candidate elements (inputs, buttons, test ids). If probe.png shows a login or
challenge page, redo the storage-state export. Otherwise update in `web-config.json`:

- `input` — the chat composer (contenteditable div on claude.ai)
- `send` — the send button (falls back to pressing Enter if omitted)
- `assistantMessage` — the container of one assistant reply (driver reads the last one)
- `streaming` — present only while a reply is generating (the Stop button is ideal)

Config-only, no code changes — same calibrate-once flow as the other surfaces.

## First authoring run, then record

The recipe (`workflows/daily-briefing-desktop.json` — shared with the desktop surface) was
written blind to the current claude.ai UI. On the first run, sanity-check step 3 against
the account's actual features: if the account has scheduled tasks, phrase step 3 to use
them for real; otherwise keep the "set this up to run every weekday at 9am" phrasing and
let Claude answer with the real mechanism. Freeze the recipe once the take reads well.

```bash
npm run web        # → output-web/daily-briefing-web.mp4 + captions.vtt + steps/markers
```

Exit 0 = markers passed, queue for sign-off. Exit 2 = marker failed, retake (responses
are live and vary — retakes are normal and cheap).

## What to commit back

Only the calibrated `web-config.json` (and the recipe if step 3's wording changed), on
branch `claude/daily-briefing-example-8exnc7`. The take itself (`output-web/`) is
gitignored by default; `git add -f` it if the reviewed take should live in the repo.
Never the storage state.

## Scheduled refresh on this surface

Like the desktop surface, the site renders live, so the health check and the take are the
same run: schedule `npm run web` (monthly) on a runner with egress + a maintained test
session; all markers pass → the published video stands, any marker fails → that is drift,
with the failing step named — re-record and route to sign-off.
