// Stage 4 — PUBLISH: assemble the LMS-embeddable lesson page from the
// produced assets: video + captions track + the written guide, stamped with
// the verification date. In Phase 1 this would push to the LMS; here it
// writes publish/lesson.html for review.
//
// Usage: node src/publish.js
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const arg = (n, f) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : f; };
const recipe = JSON.parse(fs.readFileSync(path.resolve(root, arg('recipe', 'workflows/daily-briefing.json')), 'utf8'));
const outdir = path.resolve(root, arg('outdir', 'output'));
const pubdir = path.resolve(root, 'publish');
fs.mkdirSync(pubdir, { recursive: true });

const guide = fs.readFileSync(path.join(outdir, 'guide.md'), 'utf8');
const verified = new Date().toISOString().slice(0, 10);
const hasMp4 = fs.existsSync(path.join(outdir, 'daily-briefing.mp4'));

// Minimal markdown → HTML (headings, code fences, inline code/bold, lists).
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function mdToHtml(md) {
  const out = [];
  let inCode = false, inList = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode; continue;
    }
    if (inCode) { out.push(esc(line)); continue; }
    let l = esc(line)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^_(.+)_$/, '<em>$1</em>');
    if (/^### /.test(l)) l = `<h3>${l.slice(4)}</h3>`;
    else if (/^## /.test(l)) l = `<h2>${l.slice(3)}</h2>`;
    else if (/^# /.test(l)) l = `<h1>${l.slice(2)}</h1>`;
    else if (/^- /.test(l) || /^\d+\. /.test(l)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      l = `<li>${l.replace(/^(- |\d+\. )/, '')}</li>`;
    } else if (inList && l.trim() === '') { out.push('</ul>'); inList = false; }
    else if (l.trim() !== '') l = `<p>${l}</p>`;
    out.push(l);
  }
  if (inList) out.push('</ul>');
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(recipe.title)}</title><style>
body { font-family: system-ui, sans-serif; margin:0; background:#0d1420; color:#e8edf5; }
main { max-width: 860px; margin: 0 auto; padding: 32px 20px 80px; }
h1 { font-size: 30px; } h2 { margin-top: 36px; border-bottom: 1px solid #2a3648; padding-bottom: 6px; }
video { width: 100%; border-radius: 10px; border: 1px solid #2a3648; background:#000; }
pre { background:#141b28; border:1px solid #2a3648; border-radius:8px; padding:14px; overflow-x:auto; }
code { font-family: "DejaVu Sans Mono", monospace; font-size: 14px; color:#c6d0de; }
.stamp { color:#7d8a9c; font-size: 14px; margin: 10px 0 26px; }
a { color:#7aa2f7; }
em { color:#9aa7b8; }
</style></head><body><main>
<h1>${esc(recipe.title)}</h1>
<p class="stamp">Auto-generated from a live Claude session &middot; verified as of ${verified} &middot; captions and <a href="../output/transcript.md">transcript</a> included</p>
<video controls preload="metadata">
  ${hasMp4 ? '<source src="../output/daily-briefing.mp4" type="video/mp4">' : ''}
  <source src="../output/daily-briefing.webm" type="video/webm">
  <track kind="captions" src="../output/captions.vtt" srclang="en" label="English" default>
</video>
${mdToHtml(guide)}
</main></body></html>`;
fs.writeFileSync(path.join(pubdir, 'lesson.html'), html);
console.log('[publish] wrote publish/lesson.html');
