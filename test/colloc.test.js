import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES, DRILLS, catalog, addDays, seeded } from '../core.js';
import { MISS, HINT, OK, planSession, requeue, byNeed } from '../plan.js';
import { example, blank, heard, practise, hints, siblings, progress, stepOf } from '../colloc.js';

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

test('blank hides the preposition after the adjective, and only that one', () => {
  const c = pair('interested in');
  assert.equal(blank(c, { en: 'She is interested in machine learning in Japan.' }), 'She is interested ___ machine learning in Japan.');
  const fed = pair('fed up with');
  assert.equal(blank(fed, { en: "I'm fed up with this." }), "I'm fed up ___ this.");
  for (const c of pairs) for (const e of c.examples) assert.equal(blank(c, e).split('___').length, 2, e.id);
});

test('the four-choice step is gone: a new pair, or one saved at the old step 1, starts by recalling the preposition', () => {
  assert.deepEqual([stepOf(undefined), stepOf({ step: 1, box: 1 }), stepOf({ step: 3 })], [2, 2, 3]);
});

test('heard: the preposition after the adjective, else the only one said; otherwise unknown', () => {
  const c = pair('interested in');
  assert.equal(heard('in', c), 'in');
  assert.equal(heard(' With ', c), 'with');
  assert.equal(heard('she is interested in machine learning', c), 'in');
  assert.equal(heard('I am interested at it', c), 'at');
  assert.equal(heard('', c), null);
  assert.equal(heard('maybe at or in', c), null);
  assert.equal(heard('えーと', c), null);
});

test('practise: two right answers, three days apart, move a pair up a step; one wrong answer resets the count', () => {
  let r = practise(undefined, OK, T);
  assert.deepEqual([r.step, r.wins, r.box, r.due], [2, 1, 1, addDays(T, 3)]);
  const again = practise(r, OK, T);
  assert.deepEqual([again.step, again.wins, again.due], [2, 1, r.due], 'answering again the same day does not count');
  const miss = practise(r, MISS, r.due);
  assert.deepEqual([miss.step, miss.wins, miss.box, miss.due], [2, 0, 0, addDays(r.due, 1)], 'a miss: back tomorrow, count reset');
  r = practise(r, OK, r.due);
  assert.deepEqual([r.step, r.wins], [3, 0], 'saying the sentence after two days');
  const hinted = practise(undefined, HINT, T);
  assert.deepEqual([hinted.wins, hinted.box, hinted.due], [0, 1, addDays(T, 3)], 'a hint is not a win, but not a miss either: back in 3 days');
});

test('practise at step 3: saying the sentence well stretches the interval; failing brings it back tomorrow', () => {
  let r = { box: 1, n: 4, last: T, due: addDays(T, 1), step: 3, wins: 0 };
  const day = r.due;
  r = practise(r, OK, day);
  assert.deepEqual([r.step, r.due], [3, addDays(day, 7)]);
  const later = practise(r, OK, r.due);
  assert.equal(later.due, addDays(r.due, 14));
  const fail = practise(later, MISS, later.due);
  assert.deepEqual([fail.step, fail.box, fail.due], [3, 0, addDays(later.due, 1)]);
  assert.equal(practise(r, OK, day).due, r.due, 'same-day repeat does not stretch it');
});

test('a pair reaches step 3 only after being right in different sentences on different days', () => {
  let rec, day = T;
  const used = [];
  while (stepOf(rec) < 3) { used.push(example(pair('satisfied with'), rec).id); rec = practise(rec, OK, day); day = rec.due; }
  assert.equal(used.length, 2);
  assert.equal(new Set(used).size, 2, 'two different sentences');
});

test('hints: the meaning then the first letter for recall, the adjective then the pair for saying it', () => {
  const c = pair('satisfied with'), e = c.examples[0];
  assert.deepEqual(hints(c, 2, e).map(([k]) => k), ['意味', '頭文字']);
  assert.equal(hints(c, 2, e)[1][1], 'w___');
  assert.deepEqual(hints(c, 3, e).slice(0, 2), [['使う形容詞', 'satisfied'], ['使う表現', 'satisfied with']]);
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
  const hist = Object.fromEntries(chosen.map((c, i) => [c.id, practise(undefined, i ? OK : MISS, T)]));
  const next = planSession({ items, hist, days: {}, day: addDays(T, 1), minutes: 30, rand: seeded('n') });
  assert.equal(next[0].id, chosen[0].id, 'the missed pair opens the next session');
  assert.equal(next[0].phase, 'review');
  const again = next.filter((s) => s.phase === 'colloc').map((s) => s.id);
  assert.ok(chosen.slice(1).every((c) => !again.includes(c.id)), 'pairs recalled right are not back the next day');
  const later = planSession({ items, hist, days: {}, day: addDays(T, 3), minutes: 30, rand: seeded('l') }).map((s) => s.id);
  assert.ok(chosen.slice(1).filter((c) => later.includes(c.id)).length >= 2, 'but three days later, for the second recall');
  assert.equal(requeue(queue, queue.indexOf(steps[0]), MISS, 'colloc').filter((s) => s.id === steps[0].id).length, 2, 'a miss is retried later in the session');
});

test('a month of practice moves pairs through the steps without dropping the other kinds', () => {
  let hist = {};
  for (let i = 0; i < 30; i++) {
    const day = addDays(T, i), q = planSession({ items, hist, days: {}, day, minutes: 30, rand: seeded(day) });
    assert.ok(q.some((s) => s.phase === 'pattern') && q.some((s) => s.phase === 'qa'));
    for (const s of q.filter((s) => items.find((c) => c.id === s.id).kind === 'colloc')) hist = { ...hist, [s.id]: practise(hist[s.id], OK, day) };
  }
  const p = progress(items, hist).all;
  assert.equal(p.reduce((a, b) => a + b), pairs.length);
  assert.ok(p[2] + p[3] >= 10, `pairs said in a sentence after a month: ${p}`);
  assert.ok(pairs.length - p[0] >= 30, `and new ones keep coming: ${p}`);
});

test('drill: every pair — wrong last time, then due, then new ones (easy first), then the rest', () => {
  const a = pair('afraid of'), b = pair('good at'), c = pair('bored with');
  const hist = {
    [a.id]: practise(undefined, MISS, addDays(T, -2)),
    [b.id]: practise(undefined, OK, T),
    [c.id]: practise(undefined, OK, addDays(T, -3)),
  };
  const today = byNeed(pairs, hist, T), wrongToday = byNeed(pairs, { ...hist, [b.id]: practise(hist[b.id], MISS, T) }, T);
  assert.deepEqual(today.slice(0, 2).map((x) => x.id), [a.id, c.id], 'wrong last time first, then due');
  assert.equal(wrongToday[1].id, b.id, 'a pair missed a moment ago is up front for the next sitting too');
  assert.equal(today.length, pairs.length);
  assert.equal(today.at(-1).id, b.id, 'practiced today: last');
  assert.equal(today[2].difficulty, 1, 'then new pairs, easy first');
  assert.equal(byNeed(pairs, {}, T).length, pairs.length);
});

test('progress counts pairs per step, overall and per preposition', () => {
  const c = pair('interested in');
  const p = progress(items, { [c.id]: { step: 2, box: 1 }, [pair('afraid of').id]: { step: 3, box: 2 } });
  assert.deepEqual(p.all, [pairs.length - 2, 1, 0, 1]);
  assert.deepEqual(p.in.slice(1), [1, 0, 0]);
  assert.equal(p.of[3], 1);
});
