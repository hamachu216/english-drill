import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES, DRILLS, catalog, addDays, seeded } from '../core.js';
import { MISS, HINT, SLOW, SOLO, review, tally, shares, weakTopics, planSession, requeue, scaffold, choices, quick, graded, overview, weekly, knownTopics, byNeed } from '../plan.js';

const items = catalog([...FILES, ...DRILLS].map((f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)))));
const byId = new Map(items.map((c) => [c.id, c]));
const T = '2026-11-16'; // a Monday
const plan = (hist = {}, days = {}, day = T, minutes = 30) => planSession({ items, hist, days, day, minutes, rand: seeded(day) });
const kinds = (queue) => queue.filter((s) => !s.intro && s.follow == null).reduce((n, s) => ({ ...n, [byId.get(s.id).kind]: (n[byId.get(s.id).kind] ?? 0) + 1 }), {});

// A learner who answers every step of every day's session with grade(card); returns the state after `n` days.
function practice(n, grade, from = T) {
  let hist = {}, days = {};
  const sessions = [];
  for (let i = 0; i < n; i++) {
    const day = addDays(from, i), queue = plan(hist, days, day);
    sessions.push(queue);
    for (const s of queue) {
      if (s.intro) continue;
      const c = byId.get(s.id), g = grade(c, s);
      if (s.follow == null) hist = { ...hist, [c.id]: review(hist[c.id], { grade: g }, day) };
      days = { ...days, [day]: tally(days[day], c, { grade: g, check: s.check }) };
    }
  }
  return { hist, days, sessions, next: addDays(from, n) };
}

test('review: miss and hint come back tomorrow, solo in 3 days, repeated solo in 7 and more', () => {
  assert.deepEqual(review(undefined, { grade: MISS }, T), { box: 0, n: 1, last: T, due: addDays(T, 1), grade: MISS, hint: false });
  assert.equal(review(undefined, { grade: HINT, hint: true }, T).due, addDays(T, 1));
  const once = review(undefined, { grade: SOLO }, T);
  assert.equal(once.due, addDays(T, 3));
  const twice = review(once, { grade: SOLO }, once.due);
  assert.equal(twice.due, addDays(once.due, 7));
  assert.ok(review(twice, { grade: SOLO }, twice.due).due > addDays(twice.due, 7));
});

test('review: slow answers alone never get past the 7-day box; a miss resets a well-known card', () => {
  const slow = review(undefined, { grade: SLOW }, T);
  assert.deepEqual([slow.box, slow.due], [1, addDays(T, 3)]);
  let rec = slow;
  for (let i = 0; i < 4; i++) rec = review(rec, { grade: SLOW }, rec.due);
  assert.deepEqual([rec.box, rec.due], [2, addDays(rec.last, 7)]);
  const known = { box: 4, n: 6, last: T, due: addDays(T, 30) };
  assert.deepEqual([review(known, { grade: SLOW }, known.due).box, review(known, { grade: MISS }, known.due).box], [4, 0]);
});

test('review: answering again the same day never moves the due date forward or raises the box', () => {
  const first = review(undefined, { grade: SOLO }, T);
  let again = first;
  for (let i = 0; i < 5; i++) again = review(again, { grade: SOLO }, T);
  assert.deepEqual([again.box, again.due, again.n], [first.box, first.due, 6]);
  const missed = review(undefined, { grade: MISS }, T), retried = review(missed, { grade: SOLO }, T);
  assert.deepEqual([retried.box, retried.due], [0, addDays(T, 1)], 'a miss still comes back tomorrow after a successful retry');
  assert.equal(review(first, { grade: MISS }, T).due, addDays(T, 1), 'but a same-day miss does pull it back');
});

test('first use: about 30 minutes with grammar, 5 adjective + preposition pairs, new sentence frames and Beginner Q&A, in that order', () => {
  const queue = plan(), n = kinds(queue);
  assert.ok(n.grammar >= 20 && n.pattern >= 6 && n.qa >= 3 && n.colloc === 5 && n.reply === 6, JSON.stringify(n));
  assert.ok(n.grammar > n.pattern && n.pattern > n.qa);
  assert.deepEqual([...new Set(queue.map((s) => s.phase))], ['grammar', 'colloc', 'pattern', 'reply', 'qa'], 'no review, impromptu or check on day one');
  const grammar = queue.filter((s) => byId.get(s.id).kind === 'grammar').map((s) => byId.get(s.id));
  assert.ok(grammar.every((c) => c.nth === 0), 'new grammar: the first card of each topic in turn, not one topic at a time');
  assert.ok(grammar.slice(0, 15).every((c) => c.level === 1), 'Lv1 topics first in each round');
  const frames = queue.filter((s) => s.phase === 'pattern');
  assert.ok(frames[0].intro, 'a frame is explained, with its first sentence to repeat, before it is used');
  const first = frames.filter((s) => byId.get(s.id).topic === byId.get(frames[0].id).topic);
  assert.equal(first.filter((s) => !s.intro).length, 4, 'then reused in several other sentences');
  assert.ok(!first.some((s) => !s.intro && s.id === frames[0].id), 'the repeated sentence is not recalled the same day');
  assert.ok(frames.filter((s) => !s.intro).every((s) => s.level === 0));
  assert.ok(queue.filter((s) => s.phase === 'qa').every((s) => s.level === 0), 'questions start at Beginner');
  assert.equal(new Set(queue.filter((s) => s.phase === 'qa').map((s) => byId.get(s.id).topic)).size, n.qa, 'one question per topic');
  assert.ok(queue.every((s) => !byId.get(s.id).held), 'cards held for the weekly check are not used up');
  assert.deepEqual(plan(), queue, 'the same day plans the same session');
});

test('the 10-minute session is shorter and still has both grammar and research English', () => {
  const short = kinds(plan({}, {}, T, 10)), full = kinds(plan());
  assert.ok(short.grammar < full.grammar && short.grammar >= 5 && short.pattern >= 2 && short.qa >= 1 && short.colloc >= 1 && short.reply >= 1, JSON.stringify(short));
});

test('shares: 15/10/5 by default; weak grammar gets more time, solid grammar gives it to research English', () => {
  const base = shares({}), near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(base.grammar, 15 / 30) && near(base.pattern, 10 / 30) && near(base.qa, 5 / 30));
  const weak = shares({ grammar: [40, 4, 4] }), solid = shares({ grammar: [40, 4, 34] });
  assert.ok(weak.grammar > base.grammar && solid.grammar < base.grammar);
  assert.ok(solid.pattern > base.pattern && solid.qa > base.qa);
  assert.ok(shares({ grammar: [40, 0, 0] }).grammar <= 0.65 && shares({ grammar: [40, 0, 40] }).grammar >= 0.3, 'bounded both ways');
  assert.ok(shares({ pattern: [20, 2, 18] }).qa > base.qa, 'frames going well → more Q&A');
  for (const s of [weak, solid]) assert.ok(near(s.grammar + s.pattern + s.qa, 1));
});

test('a learner who struggles with grammar gets more grammar; one who improves gets more research English', () => {
  const grammarOnly = (g) => (c) => (c.kind === 'grammar' ? g : SLOW);
  const weak = practice(3, grammarOnly(MISS)), solid = practice(3, grammarOnly(SOLO));
  const first = kinds(plan()), w = kinds(plan(weak.hist, weak.days, weak.next)), s = kinds(plan(solid.hist, solid.days, solid.next));
  assert.ok(w.grammar > first.grammar, `${w.grammar} > ${first.grammar}`);
  assert.ok(s.grammar < first.grammar && s.pattern + s.qa > first.pattern + first.qa, JSON.stringify([first, s]));
  assert.ok(w.pattern >= 1 && w.qa >= 1, 'even then, research English is touched every day');
});

test('cards that were missed stay in review on the following days, and open the session', () => {
  const missed = (id) => id === 'b-be-001' || id === 'b-neg-001';
  const { hist, days, next } = practice(1, (c) => (missed(c.id) ? MISS : SOLO));
  const queue = plan(hist, days, next);
  assert.deepEqual(queue.slice(0, 2).map((s) => [s.id, s.phase]).sort(), [['b-be-001', 'review'], ['b-neg-001', 'review']]);
  const later = plan(hist, days, addDays(next, 5));
  assert.ok(later.some((s) => s.id === 'b-be-001' && s.phase === 'review'), 'still due if a day is skipped');
});

test('no card twice in a session, and cards answered well do not come back the next day', () => {
  const { hist, days, sessions, next } = practice(4, () => SOLO);
  for (const q of [...sessions, plan(hist, days, next)]) {
    const ids = q.filter((s) => !s.intro && s.follow == null).map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  const seen = (q) => new Set(q.filter((s) => !s.intro).map((s) => s.id)); // a sentence only repeated is said on a later day
  assert.equal([...seen(sessions[1])].filter((id) => seen(sessions[0]).has(id)).length, 0);
});

test('a weak grammar topic is named and gets extra cards', () => {
  const { hist, days, next } = practice(2, (c) => (c.topic === 'b-neg' ? MISS : SOLO));
  assert.equal(weakTopics(items, hist)[0], 'b-neg');
  assert.deepEqual(overview(items, hist, next).weak, ['b-neg']);
  const queue = plan(hist, days, next), negs = queue.filter((s) => byId.get(s.id).topic === 'b-neg');
  assert.ok(negs.length > queue.filter((s) => byId.get(s.id).kind === 'grammar').length / 5);
  assert.ok(negs.every((s) => s.phase === 'review' || !hist[s.id]), 'the extras are unseen sentences, not ones said well yesterday');
});

test('a weak topic with no unseen sentences left gets only its misses back; the rest goes to other topics', () => {
  const be = items.filter((c) => c.topic === 'b-be' && !c.held), day = '2026-11-13', next = '2026-11-14';
  const hist = Object.fromEntries(be.map((c, i) => [c.id, review(undefined, { grade: i % 2 ? SOLO : MISS }, day)]));
  const queue = plan(hist, {}, next), bes = queue.filter((s) => byId.get(s.id).topic === 'b-be');
  assert.deepEqual(bes.map((s) => s.id).sort(), be.filter((_, i) => !(i % 2)).map((c) => c.id).sort(), 'only the misses');
  assert.ok(new Set(queue.filter((s) => s.phase === 'grammar').map((s) => byId.get(s.id).topic)).size >= 10);
});

test('a grammar topic said quickly three times is known: its new cards wait, and one miss brings it back', () => {
  const day = '2026-11-13', next = '2026-11-14', said = (g) => (id) => [id, review(undefined, { grade: g }, day)];
  const hist = Object.fromEntries(['b-be-001', 'b-be-002', 'b-be-003', 'b-neg-001', 'b-neg-002'].map(said(SOLO)));
  assert.deepEqual([...knownTopics(items, hist)], ['b-be'], 'two quick answers are not enough');
  const fresh = plan(hist, {}, next).filter((s) => s.phase === 'grammar' && !hist[s.id]).map((s) => byId.get(s.id).topic);
  assert.ok(fresh.length && !fresh.includes('b-be'), 'its new cards wait while the others go on');
  assert.deepEqual(overview(items, hist, next).known, ['b-be']);
  assert.equal(knownTopics(items, { ...hist, 'b-be-002': review(hist['b-be-002'], { grade: MISS }, next) }).size, 0, 'a miss and it is back');
  assert.equal(knownTopics(items, { ...hist, 'b-be-002': review(undefined, { grade: SLOW }, day) }).size, 0, 'slow is not known');
});

test('free practice of grammar: Lv1 and Lv2 together, wrong first, then due, then new as in the daily session', () => {
  const grammar = items.filter((c) => c.kind === 'grammar'), day = '2026-11-13';
  const hist = { 'b-be-001': review(undefined, { grade: MISS }, day), ...Object.fromEntries(['b-neg-001', 'b-neg-002', 'b-neg-003'].map((id) => [id, review(undefined, { grade: SOLO }, day)])) };
  const order = byNeed(grammar, hist, '2026-11-14');
  assert.equal(order[0].id, 'b-be-001');
  assert.deepEqual(new Set(order.slice(1, 26).map((c) => c.level)), new Set([1, 2]), 'both levels, mixed');
  const fresh = order.filter((c) => !hist[c.id]);
  assert.ok(fresh.slice(-15).every((c) => c.topic === 'b-neg') && fresh.filter((c) => c.topic === 'b-neg').length === 15, 'new cards of a known topic come last');
  assert.ok(!order.some((c) => c.held), 'the weekly check keeps its unseen cards');
});

test('sentence frames fade their support: frame shown → half hidden → none', () => {
  const frame = items.find((c) => c.id === 'p-because-001'), text = frame.deck.frame;
  assert.deepEqual(scaffold(frame, { level: 0 }).shown, [['型', text]]);
  const half = scaffold(frame, { level: 1 });
  assert.ok(half.shown[0][1].includes('_') && half.shown[0][1] !== text);
  assert.equal(half.hints[0][1], text, 'the full frame is one hint away');
  assert.deepEqual(scaffold(frame, { level: 2 }).shown, []);
  assert.deepEqual(scaffold(frame, { level: 0 }).hints[0], ['語句', 'we have limited data'], 'the first hint is the phrase that fills the frame');
  assert.deepEqual(scaffold(frame, { level: 2, retry: true }).shown.map(([label]) => label), ['型', '語句'], 'a retry shows both');
  // The level follows the learner: said with the frame today → half hidden next time → no frame after that.
  const { hist, days, sessions, next } = practice(8, () => SOLO);
  const topic = byId.get(sessions[0].find((s) => s.intro).id).topic;
  const levels = sessions.flatMap((q) => q.filter((s) => !s.intro && byId.get(s.id).topic === topic && !s.check).map((s) => s.level));
  assert.deepEqual([...new Set(levels)], [0, 1, 2]);
  assert.ok(overview(items, hist, next).frames[2] >= 1);
  assert.ok(plan(hist, days, next).length > 0);
});

test('"said it" is split by the clock: quick for the length of the example is solo, slower is slow', () => {
  const en = 'We chose this method because we have limited data.'; // 9 words → 9 seconds; a question gets 6 more
  assert.equal(quick(en, false), 9);
  assert.equal(quick(en, true), 15);
  assert.deepEqual([graded('ok', 8, en, false), graded('ok', 13, en, false), graded('ok', 13, en, true)], [SOLO, SLOW, SOLO]);
  assert.equal(graded('ok', Infinity, en, true), SLOW, 'a timeout is never quick');
  assert.deepEqual(['miss', 'hint', 'content', 'english'].map((k) => graded(k, 1, en, false)), [MISS, HINT, MISS, MISS]);
});

test('a new frame waits until every started frame has been said at least once', () => {
  const stuck = practice(3, (c) => (c.kind === 'pattern' ? MISS : SOLO));
  assert.equal(new Set(stuck.sessions.flat().filter((s) => s.intro).map((s) => byId.get(s.id).topic)).size, 2, 'only the first day introduces frames');
  const moving = practice(3, () => SLOW);
  assert.ok(new Set(moving.sessions.flat().filter((s) => s.intro).map((s) => byId.get(s.id).topic)).size > 2);
});

test('Q&A: a hint is always available, and a failed question is asked again right away with its answer frame', () => {
  const q = items.find((c) => c.id === 'q-method-001');
  for (const level of [0, 1, 2]) assert.ok(scaffold(q, { level }).hints.length > 0, `level ${level}`);
  assert.deepEqual(scaffold(q, { level: 0 }).shown.map(([label]) => label), ['キーワード', '答え方の型'], 'Beginner');
  assert.deepEqual(scaffold(q, { level: 1 }).shown.map(([label]) => label), ['キーワード'], 'Intermediate');
  assert.deepEqual(scaffold(q, { level: 2 }).shown, [], 'Advanced');
  assert.deepEqual(scaffold(q, { level: 2 }).hints.at(1), ['答え方の型', q.frame]);
  assert.deepEqual(choices(true, true), ['content', 'english', 'hint'], 'after a hint it cannot count as unaided');
  assert.deepEqual(choices(false, false), ['miss', 'ok']);
  const queue = [{ id: q.id, phase: 'qa', level: 2 }, { id: 'x', phase: 'qa' }];
  const again = requeue(queue, 0, MISS, 'qa');
  assert.deepEqual(again[1], { id: q.id, phase: 'qa', level: 2, retry: true });
  assert.ok(scaffold(q, again[1]).shown.some(([, text]) => text === q.frame));
  assert.equal(requeue(again, 1, MISS, 'qa'), again, 'only one retry');
  assert.equal(requeue(queue, 0, SOLO, 'qa'), queue);
  const grammar = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, phase: 'grammar' }));
  assert.equal(requeue(grammar, 0, HINT, 'grammar').findIndex((s) => s.retry), 4, 'other cards come back a few cards later');
  assert.equal(requeue(grammar, 6, MISS, 'grammar').at(-1).retry, true);
});

test('Q&A levels rise with the learner, then impromptu questions with a follow-up begin', () => {
  const early = practice(2, () => SOLO), late = practice(12, () => SOLO);
  assert.ok(overview(items, early.hist, early.next).unlock > 0);
  assert.ok(early.sessions.flat().every((s) => s.phase !== 'impromptu'));
  const o = overview(items, late.hist, late.next);
  assert.equal(o.unlock, 0);
  assert.ok(o.qa[2] >= 6, 'questions answered unaided on separate days are Advanced');
  const wild = plan(late.hist, late.days, late.next).filter((s) => s.phase === 'impromptu');
  assert.equal(wild.length, 2 * wild.filter((s) => s.follow != null).length, 'each impromptu question brings one follow-up');
  const main = wild.find((s) => s.follow == null), follow = wild.find((s) => s.follow != null);
  assert.deepEqual(scaffold(byId.get(main.id), main).shown, [], 'English question only');
  assert.ok(byId.get(follow.id).deck.follow[follow.follow].q);
  assert.ok(scaffold(byId.get(follow.id), follow).hints.length > 0);
  const slowOnly = practice(12, () => SLOW);
  assert.ok(overview(items, slowOnly.hist, slowOnly.next).unlock > 0, 'not unlocked by slow answers alone');
});

test('weekly check: after a week, a few never-seen cards from every kind, with no support and no hints', () => {
  const { hist, days, sessions, next } = practice(7, () => SOLO);
  assert.ok(sessions.flat().every((s) => !s.check), 'not in the first week');
  const queue = plan(hist, days, next), check = queue.filter((s) => s.check);
  assert.deepEqual(kinds(check), { grammar: 3, pattern: 2, reply: 1, qa: 1 });
  assert.ok(check.every((s) => !hist[s.id] && byId.get(s.id).held));
  assert.deepEqual(queue.slice(-check.length), check, 'at the end of the session');
  assert.deepEqual(scaffold(byId.get(check[0].id), check[0]), { shown: [], hints: [] });
  assert.equal(requeue(check, 0, MISS, 'grammar'), check, 'and no second try');
  const c = byId.get(check[0].id), done = { ...days, [next]: tally(days[next], c, { grade: SOLO, check: true }) };
  assert.ok(plan(hist, done, addDays(next, 1)).every((s) => !s.check), 'once a week');
  assert.ok(plan(hist, done, addDays(next, 7)).some((s) => s.check));
});

test('tally and weekly: per-week unaided counts, weak grammar topics, timings and the check', () => {
  const g = byId.get('b-passive-001'), q = byId.get('q-goal-001');
  let day = {};
  for (const grade of [MISS, HINT, SLOW, SOLO]) day = tally(day, g, { grade, secs: 100 });
  day = tally(day, q, { grade: MISS, why: 'english', start: 4 });
  day = tally(day, q, { grade: SOLO, check: true, start: 6 });
  assert.deepEqual(day, { 'b-passive': [4, 1, 1], '#time:grammar': [120, 2], 'q-goal': [2, 0, 1], '#why': [0, 1], '#start': [10, 2], '#check': [1, 1] });
  const [thisWeek, lastWeek] = weekly({ [T]: day, [addDays(T, -7)]: tally({}, g, { grade: SOLO }) }, items, addDays(T, 2));
  assert.equal(thisWeek.from, addDays(T, -1), 'weeks start on Sunday');
  assert.deepEqual(thisWeek.kinds, { grammar: [4, 1, 1], qa: [2, 0, 1] });
  assert.deepEqual([thisWeek.weak, thisWeek.time, thisWeek.start, thisWeek.check, thisWeek.why], [['b-passive'], [120, 2], [10, 2], [1, 1], [0, 1]]);
  assert.deepEqual([lastWeek.kinds, lastWeek.weak], [{ grammar: [1, 0, 1] }, []]);
});

test('state survives a reload: history and an unfinished session round-trip through JSON', async () => {
  const { restore } = await import('../core.js');
  const { hist, days, next } = practice(2, (c) => (c.nth % 3 ? SOLO : MISS));
  const session = { day: next, queue: plan(hist, days, next), idx: 7, grades: [SOLO, MISS, null] };
  const saved = JSON.parse(JSON.stringify({ log: { [T]: 40 }, hist, days, answers: { 'q-goal-001': 'My goal is to ...' }, session, settings: {} }));
  const state = restore(saved);
  assert.deepEqual([state.hist, state.days, state.answers], [hist, days, { 'q-goal-001': 'My goal is to ...' }]);
  assert.deepEqual(state.session.queue, session.queue.map((s) => JSON.parse(JSON.stringify(s))));
  assert.equal(state.session.idx, 7, 'resume where it stopped');
  assert.deepEqual(plan(state.hist, state.days, next), session.queue, 'and the plan is unchanged by the round-trip');
});

test('when everything has been seen and nothing is due, the cards practiced longest ago come back', () => {
  const hist = Object.fromEntries(items.map((c, i) => [c.id, { box: 3, n: 3, last: addDays(T, -1 - (i % 5)), due: addDays(T, 20) }]));
  const queue = plan(hist, {});
  assert.ok(queue.length > 20);
  assert.ok(queue.every((s) => hist[s.id].last === addDays(T, -5)));
});
