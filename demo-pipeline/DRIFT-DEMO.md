# Drift-detection demonstration

The brief's Phase 0 success test has two parts. This file documents both, run on 2026-07-28.
Every `[author]`/`[check]` line below is from a session against **real Claude Code v2.1.220**
with live model calls — nothing mocked.

## Part 1 — the pipeline produces a publishable video

`npm run demo` ran all five stages:

```
[author] step: launch
[author] step: create-command
[author]   answering dialog: ...Doyouwanttocreatebriefing.md?❯1.Yes
[author] step: restart
[author] step: run-briefing
[author] step: schedule
[author] done — 860 events, 93.6s of session
[author]   marker OK   create-command: {"type":"fileExists","path":".claude/commands/briefing.md"}
[author]   marker OK   create-command: {"type":"castIncludes","text":"briefing.md"}
[author]   marker OK   run-briefing:   {"type":"castIncludesAny","texts":["priorit","Priorit"]}
[author]   marker OK   run-briefing:   {"type":"castIncludesAny","texts":["urgent","Urgent","URGENT"]}
[author]   marker OK   schedule:       {"type":"fileExists","path":"schedule.cron"}
[author]   marker OK   schedule:       {"type":"castIncludesAny","texts":["09**1-5","09***1-5"]}
[author]   marker OK   schedule:       {"type":"castIncludes","text":"cron"}
[record] replaying 860 events over 57.0s of video
[record] wrote output/daily-briefing.webm
[postproduce] wrote daily-briefing.mp4
[postproduce] wrote captions.vtt, transcript.md, guide.md
[publish] wrote publish/lesson.html
[pipeline] baselines/expectations.json + reference frames stored. Done.
```

Result: `output/daily-briefing.mp4` — ~1 minute, 720p, burned-in captions, plus VTT,
transcript, written guide and lesson page, all generated from the same live run.

## Part 2 — a re-run detects an interface change and re-records with no code changes

**Clean check first.** `npm run check` re-performed the whole workflow in a fresh live
Claude session and compared it against the expectations the video was recorded under:

```
[check] re-running the workflow in a fresh live Claude session…
[check] no drift — all 7 markers hold; the published video stands.
[check] report written to output/drift-report.json
```

**Then the drift case.** Real interface drift takes weeks to occur naturally, so it is
demonstrated the way it would present in production: the checker was pointed at
`baselines/expectations-simulated-april.json` — the expectation set as it would have been
frozen by a hypothetical April 2026 recording, when (in this simulation) the scheduling
flow showed a "Scheduled task created" confirmation panel and the product was v2.0.9:

```
[check] re-running the workflow in a fresh live Claude session…
[check] DRIFT DETECTED — 1/8 expectation(s) no longer hold:
[check]   step "schedule": {"type":"castIncludes","text":"Scheduled task created"}
[check]   product version changed: 2.0.9 → 2.1.220
[check] promoting the fresh session and re-recording the video…
[record] replaying 867 events over 55.3s of video
[record] wrote output/daily-briefing.webm
[postproduce] wrote daily-briefing.mp4
[postproduce] wrote captions.vtt, transcript.md, guide.md
[publish] wrote publish/lesson.html
[check] new take is in output/ — queued for human sign-off before publishing.
[check] report written to output/drift-report.json
```

Exit code 3 signalled drift. The video, captions, transcript, guide and lesson page were
all regenerated from the fresh live session **without touching any code** — exactly the
maintenance loop the concept depends on. Human sign-off then re-froze
`baselines/expectations.json` and the reference frames against the accepted take; the
assets committed in `output/` and `baselines/` are that promoted take.

The command that ran the drift case:

```
node src/check-drift.js --expectations baselines/expectations-simulated-april.json --auto-rerecord
```

One note from doing this for real: an earlier iteration re-ran the health check in a
*different* scratch directory, and the re-recorded take leaked that path onto screen —
caught at the review gate. The checker now re-performs the workflow in the same
canonical directory as the published take, which is why the review gate exists.
