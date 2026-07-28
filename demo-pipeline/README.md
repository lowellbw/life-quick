# Self-updating AI demo videos — Phase 0 proof of concept

First worked example for the concept in *"AI-Generated Demo Videos That Keep Themselves
Up to Date"*: an agent performs a workflow **in the real product**, records itself, turns
the recording into a captioned demo video, and re-runs on a schedule so the video
re-records itself when the interface changes.

**The example:** teaching someone how to make a daily briefing in Claude. A real,
authenticated Claude Code session (live model calls, nothing mocked or simulated) in
which the learner:

1. asks Claude to create a reusable `/briefing` command,
2. restarts and runs `/briefing` to get their morning briefing, and
3. asks Claude to write the schedule (`schedule.cron`) that delivers it automatically every weekday at 9am.

**Deliverables in this repo:**

| File | What it is |
|---|---|
| `output/daily-briefing.mp4` (+ `.webm`) | the demo video — ~1 minute, 720p, burned-in captions |
| `output/captions.vtt`, `output/transcript.md` | accessibility assets, generated from the same run |
| `output/guide.md` | written step guide, including the command file and cron line real Claude produced |
| `publish/lesson.html` | the embeddable lesson page (video + captions track + guide + "verified as of" stamp) |
| `recordings/session.cast` | the raw captured live session (asciicast v2) |
| `DRIFT-DEMO.md` | evidence for both parts of the Phase 0 success test |

## How it maps to the brief's five stages

| Stage | Implementation |
|---|---|
| **Author** | `src/author.js` — runs the recipe (`workflows/daily-briefing.json`) in real Claude Code inside a PTY: types each prompt at human speed, answers permission dialogs, captures raw output + timings as an asciicast, evaluates success markers, and keeps the artifacts Claude created. |
| **Perform & record** | `src/record.js` — deterministic replay of the captured session into an xterm.js terminal (Chromium via Playwright), with per-step time-warping to the recipe's target pacing, burned-in captions, window chrome and an outro card. The take is clean and repeatable; the content is untouched live output. |
| **Post-produce** | `src/postproduce.js` — MP4 (h264), WebVTT captions, narration transcript, and the written guide generated from the same run. |
| **Publish** | `src/publish.js` — `publish/lesson.html`, stamped "verified as of &lt;date&gt;". |
| **Maintain** | `src/check-drift.js` — re-performs the workflow in a fresh live session and compares it to `baselines/expectations.json` (success markers + product-version fingerprint). No drift → the video stands. Drift → exit 3 with a report; with `--auto-rerecord` the whole set of assets regenerates from the fresh session, gated on human sign-off. |

The brief's key design decision is preserved: the **agent authors and repairs** (live,
imperfect, retried as needed) while a **deterministic replay performs every take**
(clean, identical, reviewable). Because the surface is the real product, drift caught by
the checker is real drift.

## Running it

```bash
cd demo-pipeline
npm install            # Playwright browsers are pre-provisioned; do not run "playwright install"

npm run demo           # full pipeline: author (live Claude) → record → post-produce → publish
npm run check          # scheduled health check: re-run live, compare, report
npm run refresh        # check + auto re-record on drift (leaves new take for sign-off)
```

Requires an authenticated `claude` CLI. Each `demo`/`check` run performs a real ~90s
Claude Code session (a handful of model calls — the "few dollars or less per refresh"
economics from the brief). In production the `check` would run monthly from a scheduler;
the human reviews `output/` and re-freezes `baselines/` on sign-off.

## Honest notes / what is stubbed

- **Narration audio (TTS)** — no TTS keys in this environment. The narration ships as
  timed captions + `transcript.md`, ready to feed ElevenLabs/OpenAI TTS and mux in
  post-produce. This is the commoditised layer the brief recommends buying, not building.
- **Scheduling the check** — `npm run check` is the unit a scheduler (cron / CI) would
  invoke monthly; the scheduler itself isn't part of Phase 0.
- **Drift demonstration** — real interface drift takes weeks; `DRIFT-DEMO.md` shows the
  loop end-to-end using a simulated stale expectation set. The detection path exercised
  is exactly the one a real change would take.
- **claude.ai web surface** — the same pipeline design (recipe → live session → replay →
  markers) ports to the claude.ai website via a Playwright adapter, but that surface
  needs a dedicated logged-in test account (per the brief's guardrails). First Phase 1
  task once a test account exists.

## Second surface: the Claude desktop app

`surfaces/desktop/` extends the pipeline to the **real Claude desktop app** (Electron,
driven over the Chrome DevTools Protocol): same recipe format
(`workflows/daily-briefing-desktop.json`), typed prompts, streaming-aware completion
detection, screencast recording with burned-in captions, and DOM success markers gating
every take.

The app only runs on macOS/Windows with a logged-in account, so the *published* desktop
take must be recorded on a machine that has it — see
`surfaces/desktop/SETUP-DESKTOP.md` for the calibrate-and-record steps (config only, no
code changes) and the options for running it autonomously. The driver's full chain is
already validated headlessly here against a watermarked Electron test rig
(`surfaces/desktop/rig/`, evidence in `output-desktop-rigtest/` — plumbing smoke-test
only, never publishable content):

```bash
xvfb-run -a node surfaces/desktop/record-desktop.js --config surfaces/desktop/rig-config.json
```

## Third surface: Claude in the browser (real claude.ai)

`surfaces/web/` drives **real claude.ai in a real browser** with Playwright: same recipe,
typed prompts, streaming-aware completion detection, burned-in captions, marker-gated
takes, video via Playwright's recorder. It needs two things this build sandbox doesn't
have — network egress to claude.ai (the sandbox policy blocks it) and a logged-in
**test-account** session (`storage-state.json`, gitignored) — so the real-site take runs
on a normal machine: see `surfaces/web/SETUP-WEB.md`, or paste
`surfaces/web/LOCAL-RUN-PROMPT-WEB.md` into a local Claude Code session and let it do the
calibration and recording.

```bash
npm run web:probe   # calibrate: screenshot + selector dump of the logged-in site
npm run web         # record the take → output-web/
npm run web:poc     # stand-in page with LIVE claude-CLI responses (badged PoC render)
```

## Repo layout

```
workflows/daily-briefing.json   the agent-authored recipe: steps, prompts, narration, success markers
src/                            the five stages + orchestrator (pipeline.js) + shared marker logic
recordings/                     captured live session (cast, step timeline, markers, Claude's artifacts)
baselines/                      expectations the published video was recorded under + reference frames
output/                         generated assets (video, captions, transcript, guide, drift report)
publish/                        the lesson page
```
