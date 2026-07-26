# Ready — Life in the UK Test

Gets you from cold to a calibrated ~95% chance of passing the Life in the UK
test in about two focused hours, then tells you to stop studying and book it.

No streaks, no lives, no mascot. The success metric is time-to-ready, going
down. We want to be uninstalled.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Works entirely in the browser (guest mode, progress in localStorage). No
backend required.

## Accounts & sync (optional, Supabase)

1. Create a Supabase project.
2. Run `supabase/migrations/0001_init.sql` (SQL editor or `supabase db push`).
3. `cp .env.example .env.local` and fill in the URL + anon key.

You get email magic-link sign-in, cross-device state sync, an append-only
event log, and post-test outcome collection (the calibration loop). Guest
mode keeps working regardless.

## Deploy

Static Vite build — deploys to Vercel as-is (`vite` framework preset,
`npm run build`, output `dist/`). Set the two `VITE_SUPABASE_*` env vars in
the Vercel project when you want accounts on.

## Commands

```bash
npm test              # 45 tests: model anchors, scheduler invariants,
                      # calibration E2E (synthetic users through the real
                      # reducer), pipeline validation, UI smoke
npm run build         # typecheck + production bundle
npm run build:bank    # data/*.csv + data/cards.json -> src/content/bank.json
```

## How it's put together

- `data/` — 408 scraped questions (17 real practice exams), 96 human-readable
  topic cards, provenance docs. See `data/README.md`.
- `scripts/build-bank.ts` — deterministic content pipeline: clusters the 408
  questions into 280 testable facts, joins cards, computes difficulty priors
  and exam weights, validates everything.
- `src/model/` — the readiness model: per-fact Beta posteriors, a global
  ability offset, honesty-audit discounting, decay, and a two-level Monte
  Carlo that turns all of it into "you'd have an 84% chance of passing".
- `src/scheduler/` — what to ask next: value-per-second scoring, repeat
  ladder, leech rule, silent audit injection, mock sampling.
- `src/session/machine.ts` — one pure reducer over the whole product arc.
- `src/ui/` — the screens. Calm arcade: serif questions, amber (never red)
  for wrong answers, one decision per screen.

The full design rationale, every tunable constant, and the flow diagrams are
in [DESIGN.md](DESIGN.md).
