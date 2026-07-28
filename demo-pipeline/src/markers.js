// Shared success-marker evaluation: markers assert that the workflow still
// behaves as taught (files created, expected strings on screen). Used by the
// authoring stage and by the scheduled drift check.
import fs from 'fs';
import path from 'path';

export const stripAnsi = s => s
  .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
  .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
  .replace(/\x1b[()][A-Z0-9]/g, '')
  .replace(/[\x00-\x08\x0b-\x1f]/g, '');

export const squash = s => stripAnsi(s).replace(/\s+/g, '');

export function castOutputText(castPath) {
  return fs.readFileSync(castPath, 'utf8').trim().split('\n').slice(1)
    .map(l => JSON.parse(l)).filter(e => e[1] === 'o').map(e => e[2]).join('');
}

export function evalMarkers(markerSpecs, castSquashed, workdir) {
  return markerSpecs.map(({ step, marker: m }) => {
    let ok;
    if (m.type === 'fileExists') ok = fs.existsSync(path.join(workdir, m.path));
    else if (m.type === 'castIncludes') ok = castSquashed.includes(m.text.replace(/\s+/g, ''));
    else if (m.type === 'castIncludesAny') ok = m.texts.some(t => castSquashed.includes(t.replace(/\s+/g, '')));
    else ok = false;
    return { step, marker: m, ok };
  });
}

export function recipeMarkerSpecs(recipe) {
  return recipe.steps.flatMap(s => (s.markers || []).map(m => ({ step: s.id, marker: m })));
}

export function productVersion(castSquashed) {
  const m = castSquashed.match(/ClaudeCodev([\d.]+)/);
  return m ? m[1] : null;
}
