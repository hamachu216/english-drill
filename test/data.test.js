import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES } from '../core.js';

const files = FILES.map((f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url))));

test('levels are 1..N in file order', () => assert.deepEqual(files.map((f) => f.level), files.map((_, i) => i + 1)));

test('deck and card ids are globally unique and prefixed by their deck', () => {
  const decks = files.flatMap((f) => f.decks);
  const ids = decks.flatMap((d) => d.cards.map((c) => (assert.ok(c.id.startsWith(d.id + '-'), c.id), c.id)));
  assert.equal(new Set(decks.map((d) => d.id)).size, decks.length);
  assert.equal(new Set(ids).size, ids.length);
});

test('every card has ja and en; refs are https links', () => {
  for (const d of files.flatMap((f) => f.decks)) {
    assert.ok(d.title && d.cards.length, d.id);
    for (const r of d.refs) assert.match(r.url, /^https:\/\//, d.id);
    for (const c of d.cards) assert.ok(c.ja?.trim() && c.en?.trim(), c.id);
  }
});
