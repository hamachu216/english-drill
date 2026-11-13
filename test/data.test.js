import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES, DRILLS } from '../core.js';

const read = (f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const levels = FILES.map(read), [patterns, qa] = DRILLS.map(read), files = [...levels, patterns, qa];

test('levels are 1..N in file order', () => assert.deepEqual(levels.map((f) => f.level), levels.map((_, i) => i + 1)));

test('deck and card ids are globally unique and prefixed by their deck', () => {
  const decks = files.flatMap((f) => f.decks);
  const ids = decks.flatMap((d) => d.cards.map((c) => (assert.ok(c.id.startsWith(d.id + '-'), c.id), c.id)));
  assert.equal(new Set(decks.map((d) => d.id)).size, decks.length);
  assert.equal(new Set(ids).size, ids.length);
});

test('every card has ja and en; refs are https links', () => {
  for (const d of files.flatMap((f) => f.decks)) {
    assert.ok(d.title && d.cards.length, d.id);
    for (const r of d.refs ?? []) assert.match(r.url, /^https:\/\//, d.id);
    for (const c of d.cards) assert.ok(c.ja?.trim() && c.en?.trim(), c.id);
  }
});

test('the daily grammar decks (Lv1–2) each explain their grammar in one line', () => {
  for (const d of levels.slice(0, 2).flatMap((f) => f.decks)) assert.ok(d.note?.trim(), d.id);
});

test('sentence frames: every card reuses its frame with different content', () => {
  assert.equal(patterns.kind, 'pattern');
  for (const d of patterns.decks) {
    assert.ok(d.frame.includes('...') && d.ja && d.note, d.id);
    assert.ok(d.cards.length >= 6, `${d.id}: enough sentences to practice and to hold two back for the weekly check`);
    for (const c of d.cards) assert.ok(c.en.startsWith(d.frame.split('...')[0].trim()), c.id);
    assert.equal(new Set(d.cards.map((c) => c.en)).size, d.cards.length, d.id);
  }
});

test('questions: an English question with its meaning, an answer frame, keywords and example answers; follow-ups per topic', () => {
  assert.equal(qa.kind, 'qa');
  for (const d of qa.decks) {
    assert.ok(d.follow.length >= 2 && d.follow.every((f) => f.q && f.ja && f.frame && f.en), d.id);
    for (const c of d.cards) assert.ok(c.q.endsWith('?') && c.frame.includes('...') && c.keys.length >= 2 && c.more?.trim(), c.id);
  }
});
