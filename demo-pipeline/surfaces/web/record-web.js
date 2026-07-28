// Browser-surface driver: performs the recipe in Claude in a web browser and
// records the take with Playwright's built-in video recording.
//
// Two configs share this driver:
//   web-config.json — the REAL claude.ai website. Requires (a) network access
//     to claude.ai (the build sandbox blocks it; run on a normal machine) and
//     (b) a logged-in test-account session exported as storage-state.json.
//     Selectors are best-guess until calibrated with --probe.
//   poc-config.json — a local chat page whose responses come LIVE from the
//     authenticated `claude` CLI (real model, real answers, real thinking
//     time). Runs anywhere the CLI is authenticated; the page badges itself
//     as a PoC render on every frame.
//
// Same contract as the desktop surface: typed prompts at human speed,
// streaming-aware completion detection, captions burned in during the take,
// DOM success markers gating publishability (exit 2 on failure = retake).
//
// Usage:
//   node surfaces/web/record-web.js --config surfaces/web/poc-config.json
//   node surfaces/web/record-web.js --probe        # screenshot + selector dump
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

const config = JSON.parse(fs.readFileSync(path.resolve(root, arg('config', 'surfaces/web/web-config.json')), 'utf8'));
const recipe = JSON.parse(fs.readFileSync(path.resolve(root, arg('recipe', config.recipe || 'workflows/daily-briefing-desktop.json')), 'utf8'));
const outdir = path.resolve(root, config.output.dir);
fs.mkdirSync(outdir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- optional local server (the PoC page) ----------
let server = null;
if (config.server) {
  let cmd = config.server.command;
  if (!path.isAbsolute(cmd) && cmd.includes('/')) cmd = path.join(root, cmd);
  server = spawn(cmd, config.server.args, { stdio: 'ignore', cwd: root, env: process.env });
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      await new Promise((res, rej) => http.get(config.url, r => { r.resume(); res(); }).on('error', rej));
      break;
    } catch {
      if (Date.now() > deadline) throw new Error('PoC server never came up');
      await sleep(300);
    }
  }
}

// ---------- browser ----------
const executablePath = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath });
const storageStatePath = config.storageState && path.resolve(root, config.storageState);
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: flag('probe') ? undefined : { dir: path.join(outdir, '.video'), size: { width: 1280, height: 720 } },
  ...(storageStatePath && fs.existsSync(storageStatePath) ? { storageState: storageStatePath } : {}),
});
const page = await ctx.newPage();
await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(config.timing.pageSettleMs ?? 2500);

if (flag('probe')) {
  await page.screenshot({ path: path.join(outdir, 'probe.png') });
  const dump = await page.evaluate(() => {
    const pick = els => [...els].slice(0, 20).map(e => ({
      tag: e.tagName, id: e.id, cls: (e.className || '').toString().slice(0, 80),
      testid: e.getAttribute('data-testid'), aria: e.getAttribute('aria-label'),
      placeholder: e.getAttribute('placeholder'), text: (e.innerText || '').slice(0, 60),
    }));
    return {
      url: location.href,
      inputs: pick(document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]')),
      buttons: pick(document.querySelectorAll('button')),
      testids: pick(document.querySelectorAll('[data-testid]')),
    };
  });
  console.log(JSON.stringify(dump, null, 2));
  console.log(`[web] probe.png written to ${path.relative(root, outdir)} — if this is a login page, export a logged-in test-account session first (see SETUP-WEB.md).`);
  await browser.close();
  if (server) server.kill();
  process.exit(0);
}

// ---------- caption bar (burned into the take) ----------
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

// ---------- drive ----------
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const steps = [];
const markerResults = [];

const lastAssistantText = () => page.evaluate(sel => {
  const els = document.querySelectorAll(sel);
  return els.length ? (els[els.length - 1].innerText || '') : '';
}, config.selectors.assistantMessage);
const isStreaming = () => page.evaluate(sel => !!document.querySelector(sel), config.selectors.streaming);

async function runPrompt(step) {
  const input = page.locator(config.selectors.input).first();
  await input.click({ timeout: 10000 });
  for (const ch of step.input) {
    await page.keyboard.type(ch);
    await sleep(config.timing.typeDelayMs);
  }
  await sleep(500);
  if (config.selectors.send) await page.locator(config.selectors.send).first().click();
  else await page.keyboard.press('Enter');

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

for (const step of recipe.steps) {
  const rec = { id: step.id, start: now() };
  console.log(`[web] step: ${step.id}`);
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
await sleep(800);

// ---------- outputs ----------
await ctx.close();
const vpath = await page.video().path();
const webm = path.join(outdir, `${config.output.video}.webm`);
fs.copyFileSync(vpath, webm);
fs.rmSync(path.join(outdir, '.video'), { recursive: true, force: true });
await browser.close();
if (server) server.kill();

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
fs.writeFileSync(path.join(outdir, 'steps.json'), JSON.stringify(steps, null, 2));
fs.writeFileSync(path.join(outdir, 'markers.json'), JSON.stringify(markerResults, null, 2));

const mp4 = path.join(outdir, `${config.output.video}.mp4`);
try {
  execFileSync(require('ffmpeg-static'), ['-y', '-i', webm, '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: ['ignore', 'ignore', 'pipe'] });
} catch { console.log('[web] mp4 conversion unavailable; webm only'); }

const failed = markerResults.filter(m => !m.ok);
console.log(`[web] wrote ${path.relative(root, mp4)} (${steps.at(-1).end.toFixed(1)}s)`);
for (const m of markerResults) console.log(`[web]   marker ${m.ok ? 'OK  ' : 'FAIL'} ${m.step}: ${JSON.stringify(m.marker)}`);
if (failed.length) { console.log('[web] take FAILED marker checks — do not publish; retake.'); process.exit(2); }
console.log('[web] take passed all markers — queue for human sign-off.');
