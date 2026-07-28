// Orchestrator for the whole loop.
//
//   node src/pipeline.js            author → record → postproduce → publish,
//                                   then store the expectation set the video
//                                   was recorded under (baselines/).
//   node src/pipeline.js --check    scheduled refresh: re-run the workflow
//                                   live and compare against expectations;
//                                   add --auto-rerecord to regenerate the
//                                   video automatically when drift is found.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { squash, castOutputText, recipeMarkerSpecs, productVersion } from './markers.js';

const root = path.resolve(import.meta.dirname, '..');
const flag = n => process.argv.includes('--' + n);
const run = (script, args = []) =>
  execFileSync('node', [path.join(root, 'src', script), ...process.argv.slice(2).filter(a => !['--check', '--auto-rerecord'].includes(a)), ...args], { stdio: 'inherit' });

if (flag('check')) {
  run('check-drift.js', flag('auto-rerecord') ? ['--auto-rerecord'] : []);
  process.exit(0);
}

run('author.js');
run('record.js');
run('postproduce.js');
run('publish.js');

// Freeze the expectations this take was recorded under — the drift check
// compares future live runs against exactly this.
const recipe = JSON.parse(fs.readFileSync(path.join(root, 'workflows/daily-briefing.json'), 'utf8'));
const castSquashed = squash(castOutputText(path.join(root, 'recordings/session.cast')));
fs.mkdirSync(path.join(root, 'baselines'), { recursive: true });
fs.writeFileSync(path.join(root, 'baselines/expectations.json'), JSON.stringify({
  recordedAt: new Date().toISOString(),
  productVersion: productVersion(castSquashed),
  markers: recipeMarkerSpecs(recipe),
}, null, 2));
fs.cpSync(path.join(root, 'output/frames'), path.join(root, 'baselines/frames'), { recursive: true });
console.log('[pipeline] baselines/expectations.json + reference frames stored. Done.');
