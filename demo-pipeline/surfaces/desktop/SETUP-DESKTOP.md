# Recording the take in the real Claude desktop app

The desktop surface drives the **real Claude desktop app** — an Electron app — over the
Chrome DevTools Protocol: it types the recipe's prompts at human speed, waits for each
live response to finish streaming, records the window, burns in captions, and checks the
DOM success markers. A take that fails any marker exits non-zero and must be retaken,
and every publishable take goes through human sign-off, same as the CLI surface.

## Why this cannot run in the build sandbox

Two hard constraints, both environmental:

1. The official desktop app ships for **macOS and Windows only** — the Linux build
   sandbox cannot install it.
2. The app needs a **logged-in claude.ai account**. Per the project guardrails, that
   should be a dedicated test account, so no personal data ever appears on screen.

Everything except those two things is already validated: the driver's full chain
(launch → CDP attach → typing → streaming-aware completion detection → screencast →
MP4 with burned captions → marker gate) passes against a watermarked Electron test rig
(`rig/`, output in `output-desktop-rigtest/`). The rig exists **only** to smoke-test the
plumbing headlessly; it never produces publishable content.

## One-time setup (on a Mac with the app installed)

```bash
git clone <this repo> && cd life-quick/demo-pipeline
npm install
```

Sign the app into the **test account**, then quit it (the driver launches its own
instance with debugging enabled).

## Calibrate the selectors (once per app version)

The chat input / assistant message / streaming-indicator selectors in
`desktop-config.json` are best-guess until confirmed against the real app's DOM:

```bash
node surfaces/desktop/record-desktop.js --dump-dom
```

This launches the app, attaches, and prints candidate elements (test ids, aria labels,
placeholders). Update the three `selectors` entries in `desktop-config.json` to match.
This is the desktop equivalent of the CLI surface's "author once" step — config only,
no code changes. If the app is already running, start it yourself with
`--remote-debugging-port=9333` and set `attach.attachOnly: true` instead.

## Record the take

```bash
node surfaces/desktop/record-desktop.js
```

Outputs land in `output-desktop/`:

- `daily-briefing-desktop.mp4` — the take, captions burned in
- `captions.vtt`, `captions.json`, `steps.json` — accessibility + timing
- `markers.json` — the success-marker results for this take

Exit code 0 = all markers passed, queue for sign-off. Exit 2 = marker failure, retake.
The first real run should also confirm step 3's wording against the app's current
scheduled-tasks UI, then freeze the recipe (`workflows/daily-briefing-desktop.json`).

## The refresh loop on this surface

On the CLI surface the health check and the recording are separate stages (capture once,
replay deterministically). The desktop app renders live, so **the check and the take are
the same run**: schedule `record-desktop.js` monthly; markers all pass → the new take
matches expectations and the old video stands (or swap it in — it's already recorded);
any marker fails → that is drift, and the failing marker names the step, for repair and
review. Version-fingerprint the app (`Claude.app` bundle version) alongside, as
`check-drift.js` does with the CLI version string.

## Running it autonomously (no human at the keyboard)

To close the full self-refreshing loop on this surface you need a machine that can run
the app unattended:

- a **macOS runner** (e.g. a Mac mini in CI, MacStadium, EC2 Mac) with the app installed
  and the test account signed in — the driver then runs exactly as above on a schedule; or
- treat the desktop app as the manual-recording surface and put the scheduled loop on the
  **claude.ai web adapter** instead (same design, Playwright against the website, runs in
  Linux CI) once a test account exists — the web and desktop apps share the same
  underlying UI, so selector calibration largely transfers.
