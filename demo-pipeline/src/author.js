// Stage 1 — AUTHOR: run the workflow live in real Claude Code, inside a PTY,
// and capture the raw terminal session (asciicast v2) plus a step timeline
// and success markers. This is the "agent performs the task for real" stage.
//
// Usage: node src/author.js [--recipe workflows/daily-briefing.json]
//                           [--outdir recordings] [--workdir /home/user/briefing-demo]
import pty from 'node-pty';
import fs from 'fs';
import path from 'path';
import { stripAnsi, squash, evalMarkers, recipeMarkerSpecs } from './markers.js';

const root = path.resolve(import.meta.dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const recipePath = path.resolve(root, arg('recipe', 'workflows/daily-briefing.json'));
const outdir = path.resolve(root, arg('outdir', 'recordings'));
const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
const workdir = path.resolve(arg('workdir', path.join('/home/user', recipe.workdirName)));
const home = path.join(root, '.demo-home');

const COLS = 100, ROWS = 28;
const QUIET_MS = 3500;          // no PTY output for this long = Claude is waiting
const STEP_TIMEOUT_MS = 300000; // hard cap per step
const MAX_DIALOGS_PER_STEP = 8;

// ---------- fresh environment ----------
for (const d of [home, workdir]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(workdir, { recursive: true });
fs.mkdirSync(outdir, { recursive: true });

// Skip onboarding + pre-trust the demo folder so the take starts at the product, not setup.
fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({
  theme: 'dark',
  hasCompletedOnboarding: true,
  projects: { [workdir]: { hasTrustDialogAccepted: true, allowedTools: [] } },
}, null, 2));

for (const [name, content] of Object.entries(recipe.seedFiles || {})) {
  fs.writeFileSync(path.join(workdir, name), content);
}

// ---------- spawn real Claude Code ----------
const env = { ...process.env, HOME: home };
delete env.CLAUDE_CODE_CHILD_SESSION; // avoid the nested-session banner in the UI

const started = Date.now();
const cast = [];      // asciicast v2 events
const steps = [];     // {id, castStart, castEnd}
let lastOut = Date.now();
let exited = false;
let p = null;

const now = () => (Date.now() - started) / 1000;

function spawnClaude() {
  exited = false;
  p = pty.spawn('claude', [], {
    name: 'xterm-256color', cols: COLS, rows: ROWS, cwd: workdir, env,
  });
  p.onData(d => {
    cast.push([now(), 'o', d]);
    lastOut = Date.now();
  });
  p.onExit(() => { exited = true; });
}
spawnClaude();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// A permission dialog keeps the spinner animating, so the PTY never goes
// quiet while one is up. Detect dialogs from what was painted in the last
// couple of seconds — while a dialog is on screen its text keeps being
// redrawn, and once answered it stops appearing in fresh frames.
function recentOutput(seconds) {
  const cutoff = now() - seconds;
  let s = '';
  for (let i = cast.length - 1; i >= 0 && cast[i][0] >= cutoff; i--) {
    if (cast[i][1] === 'o') s = cast[i][2] + s;
    if (s.length > 30000) break;
  }
  return s;
}

function pendingDialog() {
  const tail = squash(recentOutput(2.5));
  const m = tail.match(/Doyouwant[^]*?1\.Yes|Doyoutrust[^]*?1\.Yes/);
  return m ? m[0].slice(-120) : null;
}

async function type(text) {
  for (let i = 0; i < text.length; i++) {
    p.write(text[i]);
    await sleep(30 + ((i * 7) % 45)); // deterministic human-ish cadence
  }
}

async function runStep(step) {
  const rec = { id: step.id, castStart: now() };
  console.log(`[author] step: ${step.id}`);
  if (step.kind === 'prompt') {
    await type(step.input);
    await sleep(700); // let any autocomplete menu settle before submitting
    p.write('\r');
    lastOut = Date.now();
  }
  // Wait for Claude to finish, answering any permission dialogs along the way.
  const start = Date.now();
  let dialogs = 0, lastAnswer = 0;
  for (;;) {
    if (exited) throw new Error(`claude exited during step ${step.id}`);
    if (Date.now() - start > STEP_TIMEOUT_MS) throw new Error(`timeout in step ${step.id}`);
    if (step.kind === 'prompt' && Date.now() - lastAnswer > 4000) {
      const dlg = pendingDialog();
      if (dlg) {
        if (dialogs++ >= MAX_DIALOGS_PER_STEP) throw new Error(`too many dialogs in ${step.id}`);
        console.log(`[author]   answering dialog: ...${dlg.slice(-60)}`);
        p.write('1'); // "Yes"
        lastAnswer = Date.now();
        await sleep(300);
        continue;
      }
    }
    if (Date.now() - lastOut >= QUIET_MS) break; // idle → step done
    await sleep(250);
  }
  rec.castEnd = now();
  steps.push(rec);
}

// Relaunch Claude so it picks up newly created custom commands; bridge the
// gap with a short synthetic shell frame so the recording stays continuous.
async function restartClaude() {
  p.kill();
  await sleep(600);
  cast.push([now(), 'o', '\x1b[2J\x1b[H\x1b[0m\r\n\x1b[32mbriefing-demo\x1b[0m $ ']);
  await sleep(400);
  for (const ch of 'claude') { cast.push([now(), 'o', ch]); await sleep(90); }
  await sleep(400);
  cast.push([now(), 'o', '\r\n']);
  spawnClaude();
  lastOut = Date.now();
  const start = Date.now();
  while (Date.now() - lastOut < QUIET_MS) {
    if (Date.now() - start > 60000) throw new Error('timeout during restart');
    await sleep(200);
  }
}

// ---------- run ----------
try {
  for (const step of recipe.steps) {
    if (step.kind === 'outro') { await sleep(1500); steps.push({ id: step.id, castStart: now(), castEnd: now() + 1 }); continue; }
    if (step.kind === 'restart') {
      const rec = { id: step.id, castStart: now() };
      console.log('[author] step: restart');
      await restartClaude();
      rec.castEnd = now();
      steps.push(rec);
      continue;
    }
    await runStep(step);
  }
  await sleep(1000);
} catch (e) {
  console.error('[author] FAILED:', e.message);
  console.error(stripAnsi(recentOutput(10)).slice(-1500));
  p.kill();
  process.exit(1);
}
p.kill();

// ---------- write outputs ----------
const header = {
  version: 2, width: COLS, height: ROWS,
  title: recipe.title, env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
};
fs.writeFileSync(path.join(outdir, 'session.cast'),
  JSON.stringify(header) + '\n' + cast.map(e => JSON.stringify(e)).join('\n') + '\n');
fs.writeFileSync(path.join(outdir, 'steps.json'), JSON.stringify(steps, null, 2));

const castSquashed = squash(cast.filter(e => e[1] === 'o').map(e => e[2]).join(''));
const markers = evalMarkers(recipeMarkerSpecs(recipe), castSquashed, workdir);
fs.writeFileSync(path.join(outdir, 'markers.json'), JSON.stringify(markers, null, 2));

// Keep the artifacts real Claude created — they feed the written guide.
const artDir = path.join(outdir, 'artifacts');
fs.rmSync(artDir, { recursive: true, force: true });
fs.mkdirSync(artDir, { recursive: true });
for (const rel of recipe.artifacts || []) {
  const src = path.join(workdir, rel);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(artDir, path.basename(rel)));
}

const failed = markers.filter(m => !m.ok);
console.log(`[author] done — ${cast.length} events, ${(cast.at(-1)?.[0] ?? 0).toFixed(1)}s of session`);
for (const m of markers) console.log(`[author]   marker ${m.ok ? 'OK  ' : 'FAIL'} ${m.step}: ${JSON.stringify(m.marker)}`);
process.exit(failed.length ? 2 : 0);
