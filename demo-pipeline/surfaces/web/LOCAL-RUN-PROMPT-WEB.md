# Paste-into-local-Claude prompt: record the real claude.ai take on your machine

Copy everything below into a LOCAL Claude Code session (terminal `claude` is safest — the
recording only involves a browser, so no app needs quitting). Written by the cloud session
that built the pipeline.

---

I want you to record a demo video of the REAL claude.ai website in a real browser on this
machine, using a pipeline that already exists in a repo. Read this fully before running
anything.

## Background

The repo lowellbw/life-quick (branch: claude/daily-briefing-example-8exnc7) contains
demo-pipeline/, a proof of concept for "self-updating AI demo videos": an agent performs a
workflow in a real product, records itself, and produces a captioned teaching video, with
DOM success markers gating every take. The CLI surface already ships a finished video
(demo-pipeline/output/) and the desktop-app surface exists; this session's job is the
BROWSER surface: surfaces/web/record-web.js driving https://claude.ai with a real login.

The lesson is "Make a daily briefing in Claude" — three typed prompts (see
workflows/daily-briefing-desktop.json): paste your day → one-minute briefing; make it a
reusable morning prompt; set it up for 9am weekdays. The driver types each prompt at human
speed, waits for the live response to finish (streaming indicator gone + text stable),
records browser video, burns in a caption bar, writes captions.vtt, and evaluates markers.
Exit 0 = publishable candidate; exit 2 = marker failed → retake. The driver is already
validated end-to-end; only the four selectors in surfaces/web/web-config.json are
best-guess until calibrated against the live site. Calibration is config-only — do not
rewrite the driver unless something is actually broken.

## Setup

1. Confirm this is a LOCAL session (not a cloud environment) with normal internet access.
2. Clone and install:
     git clone https://github.com/lowellbw/life-quick.git
     cd life-quick && git checkout claude/daily-briefing-example-8exnc7 && cd demo-pipeline
     npm install
   (This surface needs Playwright's chromium: if launch complains, run
   `npx playwright install chromium`.)
3. PRIVACY GATE — ask me and wait for my answer: the recording captures whatever the
   logged-in claude.ai account shows (sidebar chat titles included). I should use a
   dedicated test account. Then have ME do the login myself:
     npx playwright codegen --save-storage=surfaces/web/storage-state.json https://claude.ai
   I log in in the window that opens and close it when the chat UI is loaded. Do not ask
   me to give you the password; the storage-state file is gitignored and must NEVER be
   committed or printed.

## Calibrate

4. Run: npm run web:probe
   Look at output-web/probe.png. If it shows a login or Cloudflare challenge page, the
   session didn't stick — redo step 3. Once it shows the logged-in chat UI, use the
   printed element dump to update the four "selectors" in surfaces/web/web-config.json:
   input (the contenteditable composer), send (send button), assistantMessage (one reply
   container; the driver reads the LAST match), streaming (present only while generating —
   the Stop button is ideal).

## First authoring run, then record

5. Sanity-check step 3 of the recipe against the account's real features: if this account
   has scheduled tasks in the claude.ai UI, rephrase step 3 to actually use them; if not,
   keep the current phrasing and let Claude answer with the real mechanism. Tell me what
   you chose and why in one sentence.
6. Run: npm run web
   Expect a few minutes: three prompts typed live into real claude.ai, real responses.
   Output: output-web/daily-briefing-web.mp4 (+ .webm), captions.vtt, steps.json,
   markers.json.
7. Verify before showing me: all markers "ok": true, then extract 2–3 frames
   (node_modules/ffmpeg-static/ffmpeg) and confirm the real claude.ai UI, the typed
   prompts, and the caption bar are visible and legible. Marker fail or bad take →
   diagnose (usually a selector), fix config, retake. Do NOT hand me a failed take.
   Likely small issues: Enter makes a newline → set the "send" selector so the driver
   clicks the button instead; wrong "last message" → tighten assistantMessage; step never
   completes → streaming selector doesn't match the real stop-button.

## Afterwards

8. Show me: the MP4 path, duration, marker results, 2–3 frames.
9. If I approve, commit ONLY the calibrated web-config.json (plus the recipe if step 3's
   wording changed), on branch claude/daily-briefing-example-8exnc7, and push to origin —
   never another branch. If I want the take in the repo, git add -f the mp4 + vtt +
   markers.json from output-web/. Triple-check storage-state.json is not staged
   (git status must not show it). If you changed record-web.js at all, explain the diff
   in one paragraph before committing.

Work autonomously where safe (reading, installing, probe, config edits, recording,
verifying) but stop and ask me at: the privacy gate in step 3, the step-5 recipe decision
if the scheduled-tasks situation is ambiguous, and before the final commit/push.
