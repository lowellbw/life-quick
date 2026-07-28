// Stage 2 — PERFORM & RECORD: deterministic replay of the captured real
// Claude session into an xterm.js terminal, with normalized pacing, burned-in
// captions and an outro card, recorded to video by Playwright.
//
// The content on screen is the raw output of the live session author.js
// captured — nothing is re-generated here; this stage only controls pacing
// and presentation, which is what makes every take clean and identical.
//
// Usage: node src/record.js [--recipe workflows/daily-briefing.json]
//                           [--recordings recordings] [--outdir output]
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const arg = (n, f) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : f; };

const recipe = JSON.parse(fs.readFileSync(path.resolve(root, arg('recipe', 'workflows/daily-briefing.json')), 'utf8'));
const recDir = path.resolve(root, arg('recordings', 'recordings'));
const outdir = path.resolve(root, arg('outdir', 'output'));
fs.mkdirSync(outdir, { recursive: true });
fs.mkdirSync(path.join(outdir, 'frames'), { recursive: true });

const castLines = fs.readFileSync(path.join(recDir, 'session.cast'), 'utf8').trim().split('\n');
const header = JSON.parse(castLines[0]);
const events = castLines.slice(1).map(l => JSON.parse(l)).filter(e => e[1] === 'o');
const stepTimes = JSON.parse(fs.readFileSync(path.join(recDir, 'steps.json'), 'utf8'));

// ---------- time-warp: map cast time -> video time, per step ----------
const MAX_GAP = 1.0; // never leave more than 1s of dead air
const phases = stepTimes.map(st => {
  const spec = recipe.steps.find(s => s.id === st.id) || {};
  return { ...st, narration: spec.narration || '', target: spec.targetSeconds || 15 };
});
const phaseOf = t => phases.findLast(p => t >= p.castStart) || phases[0];

let videoT = 0.5, prevT = 0;
const scheduled = [];   // {v, data}
const phaseVideoStart = {};
for (const ev of events) {
  const [t, , data] = ev;
  const ph = phaseOf(t);
  const real = Math.max(0.001, ph.castEnd - ph.castStart);
  const scale = Math.min(1, ph.target / real);
  const delta = Math.min((t - prevT) * scale, MAX_GAP);
  videoT += delta;
  prevT = t;
  if (!(ph.id in phaseVideoStart)) phaseVideoStart[ph.id] = videoT;
  scheduled.push({ v: videoT, data, phase: ph.id });
}
const playEnd = videoT;

const captions = phases.filter(p => p.narration).map((p, i, arr) => ({
  id: p.id,
  text: p.narration,
  start: p.id === 'outro' ? playEnd : (phaseVideoStart[p.id] ?? 0),
  end: 0, // filled below
}));
for (let i = 0; i < captions.length; i++) {
  captions[i].end = i + 1 < captions.length ? captions[i + 1].start : playEnd + (recipe.steps.at(-1).targetSeconds || 6);
}
fs.writeFileSync(path.join(outdir, 'captions.json'), JSON.stringify(captions, null, 2));

// ---------- page ----------
const xtermJs = fs.readFileSync(path.join(root, 'node_modules/@xterm/xterm/lib/xterm.js'), 'utf8');
const xtermCss = fs.readFileSync(path.join(root, 'node_modules/@xterm/xterm/css/xterm.css'), 'utf8');
const verified = new Date().toISOString().slice(0, 10);

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${xtermCss}
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:1280px; height:720px; overflow:hidden;
  background: radial-gradient(120% 140% at 20% 0%, #1e2a3a 0%, #0d1420 55%, #0a0f18 100%);
  font-family: 'DejaVu Sans', sans-serif; }
#win { position:absolute; left:50%; top:34px; transform:translateX(-50%);
  border-radius:10px; overflow:hidden; box-shadow:0 24px 70px rgba(0,0,0,.55);
  border:1px solid #2a3648; background:#0f131a; }
#bar { height:34px; background:linear-gradient(#1c2431,#161d28); display:flex; align-items:center; padding:0 14px; gap:8px; }
.dot { width:12px; height:12px; border-radius:50%; }
#title { flex:1; text-align:center; color:#8b98ab; font-size:13px; }
#term { padding:10px 12px 6px; }
#cap { position:absolute; left:50%; bottom:16px; transform:translateX(-50%);
  max-width:1080px; padding:12px 26px; border-radius:12px;
  background:rgba(10,14,22,.88); border:1px solid rgba(122,162,247,.35);
  color:#e8edf5; font-size:21px; line-height:1.4; text-align:center;
  opacity:0; transition:opacity .35s; }
#outro { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  background:rgba(8,11,17,.92); opacity:0; transition:opacity .8s; pointer-events:none; }
#card { max-width:760px; text-align:center; color:#e8edf5; }
#card h1 { font-size:34px; margin-bottom:22px; font-weight:600; }
#card ol { text-align:left; display:inline-block; font-size:21px; line-height:1.9; color:#c6d0de; }
#card .stamp { margin-top:26px; font-size:15px; color:#7d8a9c; }
</style></head><body>
<div id="win"><div id="bar">
  <span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>
  <span id="title">learner@laptop — claude</span><span style="width:52px"></span>
</div><div id="term"></div></div>
<div id="cap"></div>
<div id="outro"><div id="card">
  <h1>Your daily briefing in Claude</h1>
  <ol>
    <li>Ask Claude to create a <b>/briefing</b> command</li>
    <li>Run <b>/briefing</b> each morning — or&hellip;</li>
    <li>Schedule it: every weekday, 9am, automatically</li>
  </ol>
  <div class="stamp">Recorded from a live Claude session &middot; verified as of ${verified}</div>
</div></div>
<script>${xtermJs}</script>
<script>
const term = new Terminal({
  cols: ${header.width}, rows: ${header.height},
  fontFamily: '"DejaVu Sans Mono", monospace', fontSize: 14, lineHeight: 1.12,
  theme: { background:'#0f131a', foreground:'#d5dce6', cursor:'#7aa2f7',
           black:'#0f131a', blue:'#7aa2f7', cyan:'#7dcfff', green:'#9ece6a',
           magenta:'#bb9af7', red:'#f7768e', white:'#d5dce6', yellow:'#e0af68',
           brightBlack:'#565f89' },
  cursorBlink: false, scrollback: 0, convertEol: false,
});
term.open(document.getElementById('term'));
window.__ready = true;
window.play = async (events, captions) => {
  const t0 = performance.now();
  const cap = document.getElementById('cap');
  let ci = -1;
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    const idx = captions.findLastIndex(c => t >= c.start - 0.05);
    if (idx !== ci && idx >= 0) { ci = idx; cap.textContent = captions[idx].text; cap.style.opacity = 1; }
  };
  const capTimer = setInterval(tick, 120);
  for (const ev of events) {
    const wait = ev.v * 1000 - (performance.now() - t0);
    if (wait > 4) await new Promise(r => setTimeout(r, wait));
    term.write(ev.data);
    if (window.onPhase && ev.phase !== window.__lastPhase) { window.__lastPhase = ev.phase; window.onPhase(ev.phase); }
  }
  clearInterval(capTimer);
  return true;
};
window.showOutro = () => {
  document.getElementById('cap').style.opacity = 0;
  document.getElementById('outro').style.opacity = 1;
};
</script></body></html>`;

const pagePath = path.join(recDir, 'replay.html');
fs.writeFileSync(pagePath, html);

// ---------- record ----------
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: path.join(outdir, '.video'), size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
await page.exposeFunction('onPhase', async phase => {
  try { await page.screenshot({ path: path.join(outdir, 'frames', `${phase}.png`) }); } catch {}
});
await page.goto('file://' + pagePath);
await page.waitForFunction('window.__ready');
await page.waitForTimeout(600);

console.log(`[record] replaying ${scheduled.length} events over ${playEnd.toFixed(1)}s of video`);
await page.evaluate(([evs, caps]) => window.play(evs, caps), [[scheduled, captions]][0] ? [scheduled, captions] : null);
await page.screenshot({ path: path.join(outdir, 'frames', 'final.png') });
await page.evaluate('window.showOutro()');
const outroHold = (recipe.steps.at(-1).targetSeconds || 6) * 1000;
await page.waitForTimeout(outroHold);
await page.screenshot({ path: path.join(outdir, 'frames', 'outro.png') });

await ctx.close();
const video = page.video();
const vpath = await video.path();
fs.copyFileSync(vpath, path.join(outdir, 'daily-briefing.webm'));
fs.rmSync(path.join(outdir, '.video'), { recursive: true, force: true });
await browser.close();

console.log(`[record] wrote output/daily-briefing.webm (${(fs.statSync(path.join(outdir, 'daily-briefing.webm')).size / 1e6).toFixed(1)} MB)`);
