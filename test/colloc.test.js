import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES, DRILLS, catalog, addDays, seeded } from '../core.js';
import { MISS, OK, review, planSession, byNeed, progress, scaffold } from '../plan.js';
import { example, hints, siblings } from '../colloc.js';

const items = catalog([...FILES, ...DRILLS].map((f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)))));
const pairs = items.filter((c) => c.kind === 'colloc');
const pair = (text) => pairs.find((c) => c.collocation === text);
const T = '2026-11-16';

test('every pair is in the catalog, none held back, each asked in a different sentence every time', () => {
  assert.ok(pairs.length >= 90);
  assert.ok(pairs.every((c) => !c.held && c.topic === `ap-${c.prep}`));
  const c = pair('interested in'), seen = [0, 1, 2].map((n) => example(c, { n }).id);
  assert.equal(new Set(seen).size, 3);
  assert.equal(example(c, undefined), c.examples[0]);
});

test('hints: the adjective, then the pair, then the first letters of the sentence', () => {
  const c = pair('satisfied with'), e = c.examples[0];
  assert.deepEqual(hints(c, e).map(([k]) => k), ['使う形容詞', '使う表現', '頭文字']);
  assert.deepEqual(hints(c, e).slice(0, 2), [['使う形容詞', 'satisfied'], ['使う表現', 'satisfied with']]);
});

test('siblings: the other prepositions the same adjective takes', () => {
  assert.deepEqual(siblings(pair('angry about'), items).map((c) => c.collocation).sort(), ['angry at', 'angry with']);
  assert.deepEqual(siblings(pair('interested in'), items), []);
});

test('pairs belong to the Collocation Drill alone: never in the daily session, not even when missed', () => {
  const missed = Object.fromEntries(pairs.slice(0, 10).map((c) => [c.id, review(undefined, MISS, addDays(T, -1))]));
  for (const hist of [{}, missed]) assert.ok(planSession({ items, hist, days: {}, day: T, minutes: 30, rand: seeded(T) }).every((s) => !s.id.startsWith('ap-')));
});

test('drill: every pair — wrong last time, then due, then new ones (easy first), then the rest', () => {
  const a = pair('afraid of'), b = pair('good at'), c = pair('bored with');
  const hist = {
    [a.id]: review(undefined, MISS, addDays(T, -2)),
    [b.id]: review(undefined, OK, T),
    [c.id]: review(undefined, OK, addDays(T, -3)),
  };
  const today = byNeed(pairs, hist, T), wrongToday = byNeed(pairs, { ...hist, [b.id]: review(hist[b.id], MISS, T) }, T);
  assert.deepEqual(today.slice(0, 2).map((x) => x.id), [a.id, c.id], 'wrong last time first, then due');
  assert.equal(wrongToday[1].id, b.id, 'a pair missed a moment ago is up front for the next sitting too');
  assert.equal(today.length, pairs.length);
  assert.equal(today.at(-1).id, b.id, 'practiced today: last');
  assert.equal(today[2].difficulty, 1, 'then new pairs, easy first');
  assert.equal(byNeed(pairs, {}, T).length, pairs.length);
});

test('progress counts cards not started, practising and settled', () => {
  const p = progress(pairs, { [pair('interested in').id]: { box: 1 }, [pair('afraid of').id]: { box: 2 } });
  assert.deepEqual(p, [pairs.length - 2, 1, 1]);
});

const backs = items.filter((c) => c.kind === 'backchannel');

test('the Phrase Drill mixes pairs and backchannels in turn, each in its own order', () => {
  const order = byNeed([...pairs, ...backs], {}, T);
  assert.equal(order.length, pairs.length + backs.length);
  assert.ok(order.slice(0, 10).every((c, i, a) => !i || c.kind !== a[i - 1].kind), 'a round of ten is half and half');
  const missed = { [backs[5].id]: review(undefined, MISS, addDays(T, -1)) };
  assert.equal(byNeed([...pairs, ...backs], missed, T)[0].id, backs[5].id, 'a missed card still comes first');
  assert.ok(planSession({ items, hist: missed, days: {}, day: T, minutes: 30, rand: seeded(T) }).every((s) => !s.id.startsWith('bc-')), 'never in the daily session');
});

test('backchannels: hints are the meaning of what was said, the basic reactions, then the first letters', () => {
  const c = backs[0];
  assert.deepEqual(scaffold(c, {}).hints.map(([k]) => k), ['意味', '使う相槌', '頭文字']);
  assert.equal(scaffold(c, {}).hints[1][1], 'Exactly. / That\'s right. / Absolutely.');
});
