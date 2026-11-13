import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES, DRILLS, catalog, addDays, seeded } from '../core.js';
import { MISS, OK, review, planSession, requeue, byNeed } from '../plan.js';
import { example, hints, siblings, progress } from '../colloc.js';

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

test('daily session: five pairs, new ones easy first and from different prepositions, missed ones reviewed first next day, right ones in three days', () => {
  const queue = planSession({ items, hist: {}, days: {}, day: T, minutes: 30, rand: seeded(T) });
  const steps = queue.filter((s) => s.phase === 'colloc'), chosen = steps.map((s) => items.find((c) => c.id === s.id));
  assert.equal(steps.length, 5);
  assert.ok(chosen.every((c) => c.difficulty === 1));
  assert.ok(new Set(chosen.map((c) => c.prep)).size >= 4, 'interleaved across prepositions');
  const hist = Object.fromEntries(chosen.map((c, i) => [c.id, review(undefined, i ? OK : MISS, T)]));
  const next = planSession({ items, hist, days: {}, day: addDays(T, 1), minutes: 30, rand: seeded('n') });
  assert.equal(next[0].id, chosen[0].id, 'the missed pair opens the next session');
  assert.equal(next[0].phase, 'review');
  const again = next.filter((s) => s.phase === 'colloc').map((s) => s.id);
  assert.ok(chosen.slice(1).every((c) => !again.includes(c.id)), 'pairs said are not back the next day');
  const later = planSession({ items, hist, days: {}, day: addDays(T, 3), minutes: 30, rand: seeded('l') }).map((s) => s.id);
  assert.ok(chosen.slice(1).filter((c) => later.includes(c.id)).length >= 2, 'but three days later');
  assert.equal(requeue(queue, queue.indexOf(steps[0]), MISS, 'colloc').filter((s) => s.id === steps[0].id).length, 2, 'a miss is retried later in the session');
});

test('a month of practice settles pairs without dropping the other kinds', () => {
  let hist = {};
  for (let i = 0; i < 30; i++) {
    const day = addDays(T, i), q = planSession({ items, hist, days: {}, day, minutes: 30, rand: seeded(day) });
    assert.ok(q.some((s) => s.phase === 'pattern') && q.some((s) => s.phase === 'qa'));
    for (const s of q.filter((s) => items.find((c) => c.id === s.id).kind === 'colloc')) hist = { ...hist, [s.id]: review(hist[s.id], OK, day) };
  }
  const p = progress(items, hist).all;
  assert.equal(p.reduce((a, b) => a + b), pairs.length);
  assert.ok(p[2] >= 10, `pairs settled after a month: ${p}`);
  assert.ok(pairs.length - p[0] >= 30, `and new ones keep coming: ${p}`);
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

test('progress counts pairs not started, practising and settled, overall and per preposition', () => {
  const c = pair('interested in');
  const p = progress(items, { [c.id]: { box: 1 }, [pair('afraid of').id]: { box: 2 } });
  assert.deepEqual(p.all, [pairs.length - 2, 1, 1]);
  assert.deepEqual(p.in.slice(1), [1, 0]);
  assert.equal(p.of[2], 1);
});
