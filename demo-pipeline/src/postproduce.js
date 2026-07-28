// Stage 3 — POST-PRODUCE: turn the raw recording into course-ready assets:
// an MP4, WebVTT captions, a narration transcript, and a written step guide
// generated from the same recipe + the artifacts real Claude created.
//
// Narration audio (TTS) is intentionally stubbed in this sandbox — captions
// and the timed narration script are TTS-ready (see README).
//
// Usage: node src/postproduce.js
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const arg = (n, f) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : f; };

const recipe = JSON.parse(fs.readFileSync(path.resolve(root, arg('recipe', 'workflows/daily-briefing.json')), 'utf8'));
const outdir = path.resolve(root, arg('outdir', 'output'));
const recDir = path.resolve(root, arg('recordings', 'recordings'));
const captions = JSON.parse(fs.readFileSync(path.join(outdir, 'captions.json'), 'utf8'));

// ---------- captions.vtt ----------
const ts = s => {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = (s % 60).toFixed(3).padStart(6, '0');
  return `${h}:${m}:${sec}`;
};
const vtt = 'WEBVTT\n\n' + captions.map((c, i) =>
  `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
fs.writeFileSync(path.join(outdir, 'captions.vtt'), vtt);

// ---------- transcript.md ----------
const transcript = [
  `# Transcript — ${recipe.title}`,
  '',
  '_Narration script with timestamps. The on-screen content is a live Claude Code session;',
  'user prompts typed during the session are shown in quotes._',
  '',
  ...captions.map(c => `**[${ts(c.start).slice(3, 8)}]** ${c.text}`),
  '',
  '## Prompts typed in the session',
  '',
  ...recipe.steps.filter(s => s.kind === 'prompt').map(s => `- \`${s.input}\``),
  '',
].join('\n');
fs.writeFileSync(path.join(outdir, 'transcript.md'), transcript);

// ---------- guide.md (written walkthrough from the same run) ----------
const cmdArtifact = path.join(recDir, 'artifacts', 'briefing.md');
const cmdContent = fs.existsSync(cmdArtifact) ? fs.readFileSync(cmdArtifact, 'utf8') : null;

// The schedule line comes verbatim from the schedule.cron file Claude wrote —
// never reconstructed from wrapped terminal output.
const cronArtifact = path.join(recDir, 'artifacts', 'schedule.cron');
const cronLine = fs.existsSync(cronArtifact) ? fs.readFileSync(cronArtifact, 'utf8').trim() : null;

const guide = [
  `# ${recipe.title} — written guide`,
  '',
  `${recipe.description}`,
  '',
  '_This guide was generated from the same live Claude session as the video._',
  '',
  '## Steps',
  '',
  ...recipe.steps.filter(s => s.kind !== 'outro').flatMap((s, i) => [
    `### ${i + 1}. ${s.narration}`,
    '',
    ...(s.kind === 'prompt' ? ['Type into Claude:', '', '```', s.input, '```', ''] : []),
  ]),
  '## What Claude created',
  '',
  ...(cmdContent ? ['`.claude/commands/briefing.md`:', '', '```markdown', cmdContent.trim(), '```', ''] : []),
  ...(cronLine ? ['The schedule line for your crontab (`crontab -e`):', '', '```', cronLine, '```', ''] : []),
].join('\n');
fs.writeFileSync(path.join(outdir, 'guide.md'), guide);

// ---------- mp4 ----------
const webm = path.join(outdir, 'daily-briefing.webm');
const mp4 = path.join(outdir, 'daily-briefing.mp4');
try {
  const ffmpeg = require('ffmpeg-static');
  execFileSync(ffmpeg, ['-y', '-i', webm, '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  console.log(`[postproduce] wrote daily-briefing.mp4 (${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB)`);
} catch (e) {
  console.log('[postproduce] mp4 conversion unavailable, shipping webm only:', e.message.split('\n')[0]);
}
console.log('[postproduce] wrote captions.vtt, transcript.md, guide.md');
