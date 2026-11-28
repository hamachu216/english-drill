import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { FILES, DRILLS } from '../core.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const saved = JSON.parse(read('sw.js').match(/const FILES = (\[[^\]]*\])/)[1].replaceAll("'", '"').replace(/,\s*\]/, ']'));

test('the service worker saves every file the app loads, so it opens offline after one visit', () => {
  const html = read('index.html'), scripts = ['app.js', 'core.js', 'plan.js', 'colloc.js'];
  const needed = [
    './', 'index.html', ...scripts,
    ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
    ...scripts.flatMap((f) => [...read(f).matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1])),
    ...FILES, ...DRILLS,
    ...JSON.parse(read('manifest.webmanifest')).icons.map((i) => i.src),
  ];
  for (const f of needed) assert.ok(saved.includes(f), `${f} is saved for offline`);
  for (const f of saved) assert.ok(f === './' || existsSync(new URL('../' + f, import.meta.url)), `${f} exists: one missing file fails the whole install`);
});
