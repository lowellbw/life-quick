# Paste-into-local-Claude prompt: record the real desktop-app take on a Mac

Copy everything below into a LOCAL Claude Code session on a Mac with the Claude desktop app
installed. (Written by the cloud session that built the pipeline.)

---

I want you to record a proof-of-concept demo video of the REAL Claude desktop app on this Mac,
using a pipeline that already exists in a repo. Here is the full context — read it before running
anything.

## Background

The repo lowellbw/life-quick (branch: claude/daily-briefing-example-8exnc7) contains
demo-pipeline/, a working proof of concept for "self-updating AI demo videos": an agent performs a
workflow in a real product, records itself, and produces a captioned teaching video, with success
markers gating every take. It already works end-to-end for the Claude Code CLI surface (see
demo-pipeline/README.md and DRIFT-DEMO.md). This session's job is the SECOND surface: the Claude
desktop app.

The lesson being recorded is "Make a daily briefing in Claude" — three typed prompts:
(1) paste your day, get a one-minute briefing; (2) turn it into a reusable morning prompt;
(3) schedule it for 9am weekdays. The recipe is workflows/daily-briefing-desktop.json.

The desktop driver is surfaces/desktop/record-desktop.js. The Claude desktop app is Electron, so
the driver launches it with --remote-debugging-port, attaches Playwright over CDP, types each
recipe prompt at human speed into the chat input, waits for the response to finish (streaming
indicator gone + response text stable), records the window via CDP Page.startScreencast, assembles
an h264 MP4 with ffmpeg-static, burns in a caption bar it injects into the page DOM, writes a
sidecar captions.vtt, and evaluates DOM success markers. Exit 0 = all markers passed; exit 2 =
marker failed → the take must be redone, never published. This driver chain is already validated
against a test rig; the ONLY things unverified on a real machine are (a) the app launch path and
(b) three DOM selectors in surfaces/desktop/desktop-config.json, which are educated guesses until
calibrated. Calibration is config-only — do not rewrite the driver unless something is actually
broken.

## Setup (do these in order, tell me before anything destructive)

1. Confirm this is a LOCAL session on my Mac (not a cloud/remote environment) and that
   /Applications/Claude.app exists. If the app isn't installed, stop and tell me.
2. Clone and install:
     git clone https://github.com/lowellbw/life-quick.git
     cd life-quick && git checkout claude/daily-briefing-example-8exnc7 && cd demo-pipeline
     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
   (The desktop driver only uses Playwright's CDP client — no browser download needed. Skip it to
   save ~150MB. Node 18+ required.)
3. IMPORTANT — what's on screen gets recorded: the recorder captures whatever the app window
   shows. Ask me to either sign the app into a test account or confirm I'm happy recording under
   my own account with a brand-new empty conversation. Wait for my answer. Also ask me to fully
   quit the Claude app (Cmd+Q, check the menu bar) before you launch it — a running instance will
   grab focus and won't have the debug port.

## Calibrate (once)

4. Run: node surfaces/desktop/record-desktop.js --dump-dom
   This launches the app with debugging enabled, attaches, and prints candidate DOM elements
   (test ids, aria labels, placeholders, button texts). From that output, update the three
   "selectors" entries in surfaces/desktop/desktop-config.json:
     - input: the chat composer (likely a contenteditable div or textarea)
     - assistantMessage: the container of one assistant reply (the driver reads the LAST one)
     - streaming: something present only while a reply is generating (a stop button is ideal)
   If the CDP endpoint never appears (driver times out), launch the app yourself in another
   terminal with: /Applications/Claude.app/Contents/MacOS/Claude --remote-debugging-port=9333
   then set "attachOnly": true in desktop-config.json and re-run. If the app has multiple CDP
   targets, the driver picks the one whose URL matches "claude" — adjust window.urlMatch if the
   main window's URL is different.

## Record

5. Make sure the app shows a fresh empty conversation, then run: npm run desktop
   Expect ~2–4 minutes: three prompts typed live, real Claude responses, real thinking time.
   Output lands in output-desktop/: daily-briefing-desktop.mp4 (captions burned in),
   captions.vtt, steps.json, markers.json.
6. Verify before showing me: markers.json all "ok": true, and extract 2–3 frames from the MP4
   (ffmpeg is at node_modules/ffmpeg-static/ffmpeg) to visually confirm the app UI, the typed
   prompts, and the caption bar are visible and legible. If a marker failed or the take looks
   wrong (empty responses, dialog in the way, wrong window), diagnose, fix (selector/config or a
   retake — the responses are live and vary), and re-run. Do NOT hand me a take that failed its
   markers.
7. Likely small issues and their fixes — try these before anything bigger:
   - Enter inserts a newline instead of sending → the app may need a send-button click; add a
     "send" selector to the config and click it after typing (this one MAY need a small driver
     tweak — keep it minimal).
   - Driver reads the wrong "last message" → tighten assistantMessage selector.
   - Step never completes → the streaming selector doesn't match; find the real stop-button /
     streaming attribute in --dump-dom output.
   - A modal/update dialog appears on launch → dismiss it manually once, or note it to me.

## Afterwards

8. Show me: the MP4 path, duration, marker results, and 2–3 extracted frames.
9. If I'm happy with the take, commit ONLY the calibrated config + any minimal driver fix +
   the recording outputs (output-desktop/ is gitignored — use git add -f for the mp4, vtt and
   markers.json if I say I want them in the repo), on branch claude/daily-briefing-example-8exnc7,
   and push to origin. Never push to any other branch. If you changed record-desktop.js, explain
   the diff to me in one paragraph before committing.

Optional warm-up if I ask for it: npm run desktop:poc records the same lesson through a stand-in
chat window whose replies come live from the local `claude` CLI (badged as a PoC render). It needs
the CLI authenticated (`claude` works in my terminal). Useful to sanity-check recording before
touching the real app, but the real-app take is the goal.

Work through this autonomously where safe (reading, installing, dump-dom, editing the config,
recording, verifying), but stop and ask me at: the account/recording-privacy question in step 3,
anything that would modify the app or system settings, and before the final commit/push.
