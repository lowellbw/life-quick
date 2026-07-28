// Desktop-surface driver: performs the recipe in the REAL Claude desktop app
// (an Electron app) and records the take.
//
// How it works:
//   1. Launches the app with --remote-debugging-port (or attaches to a running
//      instance with attachOnly), then connects Playwright over CDP.
//   2. Types each recipe prompt into the chat input at human speed and submits.
//   3. Waits for the response to finish: the streaming indicator must be gone
//      AND the last assistant message text stable for `settleMs`.
//   4. Records the window via CDP Page.startScreencast → frames → h264, then
//      burns the caption bar (drawtext) and writes captions.vtt.
//   5. Evaluates DOM success markers; a failed marker fails the take (retake,
//      don't publish).
//
// Unlike the CLI surface there is no capture-then-replay: the app renders live,
// so the deterministic part is the scripted driver itself, and a take is only
// publishable when every marker passes. Same review gate before publishing.
//
// Usage:
//   node surfaces/desktop/record-desktop.js                       # real app (per-OS path in config)
//   node surfaces/desktop/record-desktop.js --config <file>       # e.g. the test rig
//   node surfaces/desktop/record-desktop.js --dump-dom            # selector calibration helper
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const arg = (n, f) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : f; };
const flag = n => process.argv.includes('--' + n);

const config = JSON.parse(fs.readFileSync(path.resolve(root, arg('config', 'surfaces/desktop/desktop-config.json')), 'utf8'));
const recipe = JSON.parse(fs.readFileSync(path.resolve(root, arg('recipe', 'workflows/daily-briefing-desktop.json')), 'utf8'));
const outdir = path.resolve(root, config.output.dir);
const framesDir = path.join(outdir, '.frames');
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = config.attach.port;

// ---------- launch or attach ----------
let child = null;
if (!config.attach.attachOnly) {
  const app = config.app[process.platform];
  if (!app || !app.command) {
    console.error(`[desktop] no app command configured for platform "${process.platform}".`);
    console.error('[desktop] install the Claude desktop app and set its path in desktop-config.json,');
    console.error('[desktop] or start it yourself with --remote-debugging-port and use attachOnly.');
    process.exit(1);
  }
  let cmd = app.command.replace(/%([A-Z_]+)%/g, (_, v) => process.env[v] || '');
  if (!path.isAbsolute(cmd) && cmd.includes('/')) cmd = path.join(root, cmd);
  console.log(`[desktop] launching ${cmd}`);
  child = spawn(cmd, [...app.args, `--remote-debugging-port=${port}`], { stdio: 'ignore', cwd: root });
}

async function waitForCdp() {
  const deadline = Date.now() + config.attach.connectTimeoutMs;
  for (;;) {
    try {
      await new Promise((res, rej) => {
        http.get({ host: '127.0.0.1', port, path: '/json/version' }, r => { r.resume(); res(); }).on('error', rej);
      });
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`CDP endpoint never appeared on port ${port}`);
      await sleep(300);
    }
  }
}
await waitForCdp();
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
let page = null;
for (let tries = 0; tries < 50 && !page; tries++) {
  const pages = browser.contexts().flatMap(c => c.pages());
  page = pages.find(p => new RegExp(config.window.urlMatch, 'i').test(p.url())) || pages[0] || null;
  if (!page) await sleep(300);
}
if (!page) throw new Error('no app window found over CDP');
console.log(`[desktop] attached to window: ${page.url()}`);
await page.setViewportSize({ width: config.window.width, height: config.window.height }).catch(() => {});

if (flag('dump-dom')) {
  // Calibration helper: list plausible input / message / button elements.
  const dump = await page.evaluate(() => {
    const pick = els => [...els].slice(0, 20).map(e => ({
      tag: e.tagName, id: e.id, cls: (e.className || '').toString().slice(0, 80),
      testid: e.getAttribute('data-testid'), aria: e.getAttribute('aria-label'),
      placeholder: e.getAttribute('placeholder'), text: (e.innerText || '').slice(0, 60),
    }));
    return {
      inputs: pick(document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]')),
      buttons: pick(document.querySelectorAll('button')),
      testids: pick(document.querySelectorAll('[data-testid]')),
    };
  });
  console.log(JSON.stringify(dump, null, 2));
  process.exit(0);
}

// ---------- caption bar (burned into the take, like the CLI surface) ----------
await page.evaluate(() => {
  const d = document.createElement('div');
  d.id = '__demo_caption';
  d.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);' +
    'max-width:84%;padding:10px 22px;border-radius:12px;background:rgba(10,14,22,.88);' +
    'border:1px solid rgba(122,162,247,.4);color:#fff;font:20px/1.4 sans-serif;' +
    'text-align:center;z-index:2147483647;opacity:0;transition:opacity .3s;pointer-events:none;';
  document.body.appendChild(d);
});
const setCaption = text => page.evaluate(t => {
  const d = document.getElementById('__demo_caption');
  if (d) { d.textContent = t; d.style.opacity = t ? 1 : 0; }
}, text);

// ---------- screencast ----------
const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async ev => {
  frames.push({ t: ev.metadata.timestamp, data: ev.data });
  await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });

// ---------- drive the recipe ----------
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const steps = [];

async function lastAssistantText() {
  return page.evaluate(sel => {
    const els = document.querySelectorAll(sel);
    return els.length ? (els[els.length - 1].innerText || '') : '';
  }, config.selectors.assistantMessage);
}

async function isStreaming() {
  return page.evaluate(sel => !!document.querySelector(sel), config.selectors.streaming);
}

async function runPrompt(step) {
  const input = page.locator(config.selectors.input).first();
  await input.click({ timeout: 10000 });
  for (const ch of step.input) {
    await page.keyboard.type(ch);
    await sleep(config.timing.typeDelayMs);
  }
  await sleep(500);
  await page.keyboard.press('Enter');

  // Wait for completion: not streaming AND last assistant text stable.
  const deadline = Date.now() + config.timing.stepTimeoutMs;
  let stableSince = null, lastText = '';
  for (;;) {
    if (Date.now() > deadline) throw new Error(`timeout in step ${step.id}`);
    await sleep(400);
    const streaming = await isStreaming();
    const text = await lastAssistantText();
    if (!streaming && text === lastText && text.length > 0) {
      stableSince ??= Date.now();
      if (Date.now() - stableSince >= config.timing.settleMs) return text;
    } else {
      stableSince = null;
      lastText = text;
    }
  }
}

const markerResults = [];
try {
  for (const step of recipe.steps) {
    const rec = { id: step.id, start: now() };
    console.log(`[desktop] step: ${step.id}`);
    if (step.narration) await setCaption(step.narration);
    if (step.kind === 'prompt') {
      const responseText = await runPrompt(step);
      for (const m of step.markers || []) {
        const ok = m.type === 'domIncludesAny'
          ? m.texts.some(t => responseText.toLowerCase().includes(t.toLowerCase()))
          : false;
        markerResults.push({ step: step.id, marker: m, ok });
      }
    } else {
      await sleep((step.targetSeconds || 4) * 1000);
    }
    rec.end = now();
    steps.push(rec);
  }
} finally {
  await sleep(800);
  await cdp.send('Page.stopScreencast').catch(() => {});
}

// ---------- assemble video ----------
fs.mkdirSync(outdir, { recursive: true });
if (frames.length < 2) throw new Error('no screencast frames captured');
const base = frames[0].t;
frames.forEach((f, i) => fs.writeFileSync(path.join(framesDir, `f${String(i).padStart(6, '0')}.jpg`), Buffer.from(f.data, 'base64')));
const concat = frames.map((f, i) => {
  const dur = i + 1 < frames.length ? Math.max(0.02, frames[i + 1].t - f.t) : 0.5;
  return `file 'f${String(i).padStart(6, '0')}.jpg'\nduration ${dur.toFixed(3)}`;
}).join('\n') + '\n';
fs.writeFileSync(path.join(framesDir, 'list.txt'), concat);

// Captions timed by real step boundaries (video time == wall time here).
const captions = [];
for (const st of steps) {
  const spec = recipe.steps.find(s => s.id === st.id);
  if (spec?.narration) captions.push({ id: st.id, text: spec.narration, start: st.start, end: 0 });
}
captions.forEach((c, i) => { c.end = i + 1 < captions.length ? captions[i + 1].start : steps.at(-1).end; });
fs.writeFileSync(path.join(outdir, 'captions.json'), JSON.stringify(captions, null, 2));

const ts = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`;
fs.writeFileSync(path.join(outdir, 'captions.vtt'),
  'WEBVTT\n\n' + captions.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n'));

const ffmpeg = require('ffmpeg-static');
const runFF = args => {
  try {
    execFileSync(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    console.error('[desktop] ffmpeg failed:\n' + (e.stderr ? e.stderr.toString().split('\n').slice(-12).join('\n') : e.message));
    throw new Error('ffmpeg failed');
  }
};
const raw = path.join(outdir, '.raw.mp4');
runFF(['-y', '-f', 'concat', '-safe', '0', '-i', path.join(framesDir, 'list.txt'),
  '-vsync', 'vfr', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '21', raw]);

// Captions are already burned in (injected into the page during the take);
// the raw assembly is the final cut. Sidecar VTT ships alongside.
const finalMp4 = path.join(outdir, `${config.output.video}.mp4`);
fs.renameSync(raw, finalMp4);
fs.rmSync(framesDir, { recursive: true, force: true });
fs.writeFileSync(path.join(outdir, 'steps.json'), JSON.stringify(steps, null, 2));
fs.writeFileSync(path.join(outdir, 'markers.json'), JSON.stringify(markerResults, null, 2));

if (child) child.kill();
await browser.close().catch(() => {});

const failed = markerResults.filter(m => !m.ok);
console.log(`[desktop] wrote ${path.relative(root, finalMp4)} (${(fs.statSync(finalMp4).size / 1e6).toFixed(1)} MB), ${frames.length} frames, ${steps.at(-1).end.toFixed(1)}s`);
for (const m of markerResults) console.log(`[desktop]   marker ${m.ok ? 'OK  ' : 'FAIL'} ${m.step}: ${JSON.stringify(m.marker)}`);
if (failed.length) { console.log('[desktop] take FAILED marker checks — do not publish; retake.'); process.exit(2); }
console.log('[desktop] take passed all markers — queue for human sign-off.');
process.exit(0);
