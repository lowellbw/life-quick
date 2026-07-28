// Stage 5 — MAINTAIN: the scheduled health check. Re-runs the workflow in a
// fresh live Claude session and compares the result against the expectations
// the published video was recorded under:
//
//   - every success marker must still hold (files created, key strings on screen)
//   - the product version fingerprint is compared (a change is a soft signal
//     to review even when markers still pass)
//
// No drift  → exit 0, the published video stands.
// Drift     → exit 3, a report names what changed; with --auto-rerecord the
//             fresh session is promoted and the video, captions, guide and
//             lesson page are regenerated with no code changes — leaving the
//             new take in output/ for human sign-off before publishing.
//
// --expectations <file> lets you point at an older expectation set, which is
// also how DRIFT-DEMO.md demonstrates the loop without waiting months for a
// real interface change.
//
// Usage: node src/check-drift.js [--expectations baselines/expectations.json]
//                                [--auto-rerecord]
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { squash, castOutputText, evalMarkers, productVersion } from './markers.js';

const root = path.resolve(import.meta.dirname, '..');
const arg = (n, f) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : f; };
const flag = n => process.argv.includes('--' + n);

const expectations = JSON.parse(fs.readFileSync(path.resolve(root, arg('expectations', 'baselines/expectations.json')), 'utf8'));
const recipe = JSON.parse(fs.readFileSync(path.resolve(root, arg('recipe', 'workflows/daily-briefing.json')), 'utf8'));
const refreshDir = path.join(root, '.demo-work', 'refresh-recordings');
// Same canonical workdir as the published take: author.js recreates it from
// scratch, and a re-recorded take must show the same on-screen path.
const refreshWorkdir = path.join('/home/user', recipe.workdirName);

console.log('[check] re-running the workflow in a fresh live Claude session…');
try {
  execFileSync('node', [path.join(root, 'src/author.js'),
    '--outdir', refreshDir, '--workdir', refreshWorkdir],
    { stdio: ['ignore', 'inherit', 'inherit'] });
} catch (e) {
  if (e.status !== 2) throw e; // 2 = session ran but recipe markers failed — that IS drift
}

const castSquashed = squash(castOutputText(path.join(refreshDir, 'session.cast')));
const results = evalMarkers(expectations.markers, castSquashed, refreshWorkdir);
const version = productVersion(castSquashed);

const hardDrift = results.filter(r => !r.ok);
const versionChanged = expectations.productVersion && version !== expectations.productVersion;

const report = {
  checkedAt: new Date().toISOString(),
  productVersion: { expected: expectations.productVersion, observed: version, changed: !!versionChanged },
  markers: results,
  drift: hardDrift.length > 0,
  rerecorded: false,
};

if (!report.drift) {
  console.log(`[check] no drift — all ${results.length} markers hold; the published video stands.`);
  if (versionChanged) console.log(`[check] note: product version ${expectations.productVersion} → ${version}; markers still pass, flagging for periodic human audit.`);
} else {
  console.log(`[check] DRIFT DETECTED — ${hardDrift.length}/${results.length} expectation(s) no longer hold:`);
  for (const r of hardDrift) console.log(`[check]   step "${r.step}": ${JSON.stringify(r.marker)}`);
  if (versionChanged) console.log(`[check]   product version changed: ${expectations.productVersion} → ${version}`);
  if (flag('auto-rerecord')) {
    console.log('[check] promoting the fresh session and re-recording the video…');
    for (const f of ['session.cast', 'steps.json', 'markers.json']) {
      fs.copyFileSync(path.join(refreshDir, f), path.join(root, 'recordings', f));
    }
    const art = path.join(refreshDir, 'artifacts');
    if (fs.existsSync(art)) fs.cpSync(art, path.join(root, 'recordings', 'artifacts'), { recursive: true });
    for (const script of ['record.js', 'postproduce.js', 'publish.js']) {
      execFileSync('node', [path.join(root, 'src', script)], { stdio: 'inherit' });
    }
    report.rerecorded = true;
    console.log('[check] new take is in output/ — queued for human sign-off before publishing.');
  }
}

fs.writeFileSync(path.join(root, 'output', 'drift-report.json'), JSON.stringify(report, null, 2));
console.log('[check] report written to output/drift-report.json');
process.exit(report.drift ? 3 : 0);
