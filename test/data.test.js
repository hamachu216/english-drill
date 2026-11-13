import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES, DRILLS } from '../core.js';

const read = (f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const levels = FILES.map(read), [patterns, qa, colloc] = DRILLS.map(read), files = [...levels, patterns, qa, colloc];

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
    for (const c of d.cards) assert.ok(c.ja?.trim() && (c.en ?? c.examples?.[0]?.en)?.trim(), c.id);
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

test('adjective + preposition: every pair has its fields and at least two sentences in different scenes', () => {
  assert.equal(colloc.kind, 'colloc');
  const PREPS = ['about', 'at', 'by', 'for', 'from', 'in', 'of', 'to', 'with'];
  assert.deepEqual(colloc.decks.map((d) => d.prep), PREPS, 'one deck per preposition, in order');
  const pairs = colloc.decks.flatMap((d) => d.cards), sentences = pairs.flatMap((c) => c.examples);
  assert.equal(new Set(pairs.map((c) => c.collocation)).size, pairs.length, 'each pair once');
  for (const d of colloc.decks) assert.ok(d.note && d.refs.some((r) => r.url.includes('englishclub.com')), d.id);
  for (const c of pairs) {
    assert.ok(c.adj && c.ja && c.note && [1, 2, 3].includes(c.difficulty) && c.steps.length, c.id);
    assert.equal(c.collocation, `${c.adj} ${c.prep}`, c.id);
    assert.ok(c.examples.length >= 2 && new Set(c.examples.map((e) => e.scene)).size >= 2, `${c.id}: several contexts`);
    for (const e of c.examples) {
      assert.ok(e.id.startsWith(c.id + '-') && e.ja && ['daily', 'lab', 'meeting', 'conference'].includes(e.scene), e.id);
      assert.match(e.en, new RegExp(`\\b${c.adj} ${c.prep}\\b`, 'i'), `${e.id}: the pair appears as written, so it can be blanked`);
      assert.ok(!(e.also ?? []).includes(c.prep), e.id);
    }
  }
  assert.equal(new Set(sentences.map((e) => e.id)).size, sentences.length);
  assert.equal(new Set(sentences.map((e) => e.en)).size, sentences.length, 'no sentence twice');
  for (const scene of ['daily', 'lab', 'meeting', 'conference'])
    assert.ok(sentences.filter((e) => e.scene === scene).length >= sentences.length * 0.15, `${scene}: at least 15% of the sentences`);
});

test('adjective + preposition: the pairs that change meaning with the preposition are all there', () => {
  const have = new Set(colloc.decks.flatMap((d) => d.cards.map((c) => c.collocation)));
  for (const pair of ['happy about', 'happy with', 'angry about', 'angry at', 'angry with', 'disappointed at', 'disappointed in',
    'disappointed with', 'surprised at', 'surprised by', 'skilled at', 'skilled in', 'interested in', 'good at', 'satisfied with'])
    assert.ok(have.has(pair), pair);
});
