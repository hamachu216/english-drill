import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES, DRILLS, catalog, addDays, seeded, restore, skeleton, slots } from '../core.js';
import { MISS, HINT, OK, review, tally, shares, weakTopics, planSession, requeue, scaffold, choices, overview, mockSession, weekly, knownTopics, byNeed } from '../plan.js';

const items = catalog([...FILES, ...DRILLS].map((f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)))));
const byId = new Map(items.map((c) => [c.id, c]));
const T = '2026-11-16'; // a Monday
const plan = (hist = {}, days = {}, day = T, minutes = 30) => planSession({ items, hist, days, day, minutes, rand: seeded(day) });
// A learner who said everything unaided lately: no retries to make room for.
const FLUENT = { [addDays(T, -1)]: { 'b-past': [20, 20], 'p-goal': [20, 20], 'r-start': [20, 20] } };
const minutesOf = (queue, retried) => queue.reduce((t, s) => t + { grammar: 60, pattern: 75, reply: 60 }[byId.get(s.id).kind] * (1 + retried), 0) / 60;
const LATER = (s) => ['b-be', 'b-neg', 'b-prog'].includes(byId.get(s.id).topic);
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
      if (s.follow == null) hist = { ...hist, [s.as ?? c.id]: review(hist[s.as ?? c.id], g, day) };
      days = { ...days, [day]: tally(days[day], c, { grade: g, check: s.check }) };
    }
  }
  return { hist, days, sessions, next: addDays(from, n) };
}

test('review: a miss comes back tomorrow, said in 3 days, said again in 7 and more', () => {
  assert.deepEqual(review(undefined, MISS, T), { box: 0, n: 1, last: T, due: addDays(T, 1), grade: MISS });
  const once = review(undefined, OK, T);
  assert.equal(once.due, addDays(T, 3));
  const twice = review(once, OK, once.due);
  assert.equal(twice.due, addDays(once.due, 7));
  assert.ok(review(twice, OK, twice.due).due > addDays(twice.due, 7));
});

test('review: answers with a hint wait 3 days but never get past the 7-day box; a miss resets a well-known card', () => {
  const hinted = review(undefined, HINT, T);
  assert.deepEqual([hinted.box, hinted.due], [1, addDays(T, 3)]);
  let rec = hinted;
  for (let i = 0; i < 4; i++) rec = review(rec, HINT, rec.due);
  assert.deepEqual([rec.box, rec.due], [2, addDays(rec.last, 7)]);
  const known = { box: 4, n: 6, last: T, due: addDays(T, 30) };
  assert.deepEqual([review(known, HINT, known.due).box, review(known, MISS, known.due).box], [4, 0]);
});

test('review: answering again the same day never moves the due date forward or raises the box', () => {
  const first = review(undefined, OK, T);
  let again = first;
  for (let i = 0; i < 5; i++) again = review(again, OK, T);
  assert.deepEqual([again.box, again.due, again.n], [first.box, first.due, 6]);
  const missed = review(undefined, MISS, T), retried = review(missed, OK, T);
  assert.deepEqual([retried.box, retried.due], [0, addDays(T, 1)], 'a miss still comes back tomorrow after a successful retry');
  assert.equal(review(first, MISS, T).due, addDays(T, 1), 'but a same-day miss does pull it back');
});

test('first use: about 30 minutes with grammar, new sentence frames and Q&A replies, in that order — no research questions', () => {
  const queue = plan(), n = kinds(queue);
  assert.ok(n.grammar >= 5 && n.pattern === 8 && n.reply >= 3 && !n.qa && !n.colloc && !n.listening, JSON.stringify(n));
  const minutes = minutesOf(queue.filter((s) => !s.intro), 0.35);
  assert.ok(minutes > 25 && minutes <= 32, `about 30 minutes with the retries a typical learner makes: ${minutes}`);
  assert.deepEqual([...new Set(queue.map((s) => s.phase))], ['grammar', 'pattern', 'reply'], 'no review or check on day one');
  const grammar = queue.filter((s) => byId.get(s.id).kind === 'grammar').map((s) => byId.get(s.id));
  assert.deepEqual([...new Set(grammar.map((c) => c.topic))], ['b-past', 'b-future', 'b-modal'], 'new grammar: three topics at a time, the present-tense basics (b-be, b-neg, b-prog) left for last');
  assert.deepEqual(grammar.slice(0, 3).map((c) => c.nth), [0, 0, 0], 'taken in turn, not one topic at a time');
  const frames = queue.filter((s) => s.phase === 'pattern');
  assert.ok(frames[0].intro, 'a frame is explained, with its first sentence to repeat, before it is used');
  const first = frames.filter((s) => byId.get(s.id).topic === byId.get(frames[0].id).topic);
  assert.equal(first.filter((s) => !s.intro).length, 4, 'then reused in several other sentences');
  assert.ok(!first.some((s) => !s.intro && s.id === frames[0].id), 'the repeated sentence is not recalled the same day');
  assert.ok(frames.filter((s) => !s.intro).every((s) => s.level === 0));
  assert.ok(queue.every((s) => !byId.get(s.id).held), 'cards held for the weekly check are not used up');
  assert.deepEqual(plan(), queue, 'the same day plans the same session');
});

test('the 10-minute session is shorter and still has both grammar and research English', () => {
  const short = kinds(plan({}, {}, T, 10)), full = kinds(plan());
  assert.ok(short.grammar < full.grammar && short.grammar >= 1 && short.pattern >= 1 && short.reply >= 1, JSON.stringify(short));
});

test('the retries a learner makes come out of the new cards: reviews stay, and grammar keeps one new card a day', () => {
  const hist = dueLong(ofTopics('b-past').slice(0, 3)), struggling = { [addDays(T, -1)]: { 'b-past': [20, 4], 'p-goal': [20, 4], 'r-start': [20, 4] } };
  const fluent = plan(hist, FLUENT, T), weak = plan(hist, struggling, T), old = (q) => q.filter((s) => hist[s.as ?? s.id]).length;
  const added = (q, kind) => q.filter((s) => !s.intro && byId.get(s.id).kind === kind && !hist[s.as ?? s.id]).length;
  assert.equal(old(weak), old(fluent), 'every review stays');
  assert.ok(added(weak, 'reply') < added(fluent, 'reply'), 'fewer new replies');
  assert.equal(added(weak, 'pattern'), added(fluent, 'pattern'), 'a new frame is never cut: its time comes out of new grammar and replies');
  assert.equal(weak.filter((s) => s.phase === 'pattern' && !s.intro).length, 8, 'two new frames, each said in four sentences');
  assert.ok(added(weak, 'grammar') >= 1, 'grammar still gets a new card');
  const minutes = minutesOf(weak.filter((s) => !s.intro), 0.8);
  assert.ok(minutes <= 34, `still about 30 minutes, retries included: ${minutes}`);
});

test('shares: half and half by default; weak grammar gets more time, solid grammar gives it to the sentence frames', () => {
  const base = shares({}), near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.deepEqual(base, { grammar: 0.5, pattern: 0.5 });
  const weak = shares({ grammar: [40, 6] }), solid = shares({ grammar: [40, 36] });
  assert.ok(weak.grammar > base.grammar && solid.grammar < base.grammar);
  assert.ok(solid.pattern > base.pattern);
  assert.ok(shares({ grammar: [40, 0] }).grammar <= 0.65 && shares({ grammar: [40, 40] }).grammar >= 0.3, 'bounded both ways');
  for (const s of [weak, solid]) assert.ok(near(s.grammar + s.pattern, 1));
});

test('a learner who struggles with grammar gets more grammar; one who improves gets more research English', () => {
  const grammarOnly = (g) => (c) => (c.kind === 'grammar' ? g : OK);
  const weak = practice(3, grammarOnly(MISS)), solid = practice(3, grammarOnly(OK));
  const first = kinds(plan()), w = kinds(plan(weak.hist, weak.days, weak.next)), s = kinds(plan(solid.hist, solid.days, solid.next));
  assert.ok(w.grammar > first.grammar, `${w.grammar} > ${first.grammar}`);
  assert.ok(s.pattern > first.pattern && s.pattern / s.grammar > first.pattern / first.grammar, JSON.stringify([first, s]));
  assert.ok(w.pattern >= 1, 'even then, research English is touched every day');
});

test('cards that were missed stay in review on the following days, and open the session', () => {
  const missed = (id) => id === 'b-future-001' || id === 'b-past-001';
  const { hist, days, next } = practice(1, (c) => (missed(c.id) ? MISS : OK));
  const queue = plan(hist, days, next);
  assert.deepEqual(queue.slice(0, 2).map((s) => [s.as, s.phase]).sort(), [['b-future-001', 'review'], ['b-past-001', 'review']], 'recorded on the missed cards, asked in other sentences of their topics');
  const later = plan(hist, days, addDays(next, 5));
  assert.ok(later.some((s) => s.as === 'b-future-001' && s.phase === 'review'), 'still due if a day is skipped');
});

test('no card twice in a session, and cards answered well do not come back the next day', () => {
  const { hist, days, sessions, next } = practice(4, () => OK);
  for (const q of [...sessions, plan(hist, days, next)]) {
    const ids = q.filter((s) => !s.intro && s.follow == null).map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  const seen = (q) => new Set(q.filter((s) => !s.intro).map((s) => s.id)); // a sentence only repeated is said on a later day
  assert.equal([...seen(sessions[1])].filter((id) => seen(sessions[0]).has(id)).length, 0);
});

test('a weak grammar topic is named and gets extra cards', () => {
  const { hist, days, next } = practice(4, (c) => (c.topic === 'b-past' ? MISS : OK));
  assert.equal(weakTopics(items, hist)[0], 'b-past');
  assert.deepEqual(overview(items, hist, next).weak, ['b-past']);
  const queue = plan(hist, days, next), negs = queue.filter((s) => byId.get(s.id).topic === 'b-past');
  assert.ok(negs.length > queue.filter((s) => byId.get(s.id).kind === 'grammar').length / 5);
  assert.ok(negs.every((s) => s.phase === 'review' || !hist[s.id]), 'the extras are unseen sentences, not ones said well yesterday');
});

test('a weak topic with no unseen sentences left gets only its misses back; the rest goes to other topics', () => {
  const be = items.filter((c) => c.topic === 'b-be' && !c.held), day = '2026-11-13', next = '2026-11-14';
  const hist = Object.fromEntries(be.map((c, i) => [c.id, review(undefined, i % 2 ? OK : MISS, day)]));
  const queue = plan(hist, {}, next), bes = queue.filter((s) => byId.get(s.id).topic === 'b-be');
  assert.deepEqual(bes.map((s) => s.id).sort(), be.filter((_, i) => !(i % 2)).map((c) => c.id).sort(), 'only the misses');
  assert.ok(queue.some((s) => s.phase === 'grammar' && byId.get(s.id).topic !== 'b-be'), 'the room left goes to new cards of other topics');
});

test('a grammar topic said without a hint three times is known: its new cards wait, and one miss brings it back', () => {
  const day = '2026-11-13', next = '2026-11-14', said = (g) => (id) => [id, review(undefined, g, day)];
  const hist = Object.fromEntries(['b-be-001', 'b-be-002', 'b-be-003', 'b-neg-001', 'b-neg-002'].map(said(OK)));
  assert.deepEqual([...knownTopics(items, hist)], ['b-be'], 'two answers are not enough');
  const fresh = plan(hist, {}, next).filter((s) => s.phase === 'grammar' && !hist[s.id]).map((s) => byId.get(s.id).topic);
  assert.ok(fresh.length && !fresh.includes('b-be'), 'its new cards wait while the others go on');
  assert.deepEqual(overview(items, hist, next).known, ['b-be']);
  assert.equal(knownTopics(items, { ...hist, 'b-be-002': review(hist['b-be-002'], MISS, next) }).size, 0, 'a miss and it is back');
  assert.equal(knownTopics(items, { ...hist, 'b-be-002': review(undefined, HINT, day) }).size, 0, 'said with a hint is not known');
});

test('free practice of grammar: Lv1 and Lv2 together, wrong first, then due, then new as in the daily session', () => {
  const grammar = items.filter((c) => c.kind === 'grammar'), day = '2026-11-13';
  const hist = { 'b-be-001': review(undefined, MISS, day), ...Object.fromEntries(['b-neg-001', 'b-neg-002', 'b-neg-003'].map((id) => [id, review(undefined, OK, day)])) };
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
  assert.deepEqual(scaffold(frame, { level: 0 }).hints.map(([label]) => label), ['使う語', '頭文字'], 'the words that fill the frame, then the first letters');
  assert.deepEqual(scaffold(frame, { level: 0 }).hints[0][1].split(' / ').sort(), slots(text, frame.en).join(' ').split(' ').sort(), 'the words of the phrases only');
  assert.deepEqual(scaffold(frame, { level: 2, retry: true }).shown, [['型', text]], 'a retry shows the frame');
  for (const c of items.filter((x) => x.kind === 'pattern')) for (const step of [{ level: 0 }, { level: 1 }, { level: 2 }, { retry: true }]) {
    const { shown, hints } = scaffold(c, step);
    // The words to use are given on purpose (out of order): a phrase of one word is then given away, as a hint.
    assert.ok(![...shown, ...hints].some(([k, v]) => k !== '使う語' && v.includes(c.en.slice(c.deck.frame.indexOf('...')).replace(/[.?!]$/, ''))), `${c.id}: nothing spells out the answer`);
  }
  // The level follows the learner: said with the frame today → half hidden next time → no frame after that.
  const { hist, days, sessions, next } = practice(8, () => OK);
  const topic = byId.get(sessions[0].find((s) => s.intro).id).topic;
  const levels = sessions.flatMap((q) => q.filter((s) => !s.intro && byId.get(s.id).topic === topic && !s.check).map((s) => s.level));
  assert.deepEqual([...new Set(levels)], [0, 1, 2]);
  assert.ok(overview(items, hist, next).frames[2] >= 1);
  assert.ok(plan(hist, days, next).length > 0);
});

test('a new frame waits until every started frame has been said at least once', () => {
  const stuck = practice(3, (c) => (c.kind === 'pattern' ? MISS : OK));
  assert.equal(new Set(stuck.sessions.flat().filter((s) => s.intro).map((s) => byId.get(s.id).topic)).size, 2, 'only the first day introduces frames');
  const moving = practice(3, () => OK);
  assert.ok(new Set(moving.sessions.flat().filter((s) => s.intro).map((s) => byId.get(s.id).topic)).size > 2);
});

test('a missed card comes back the next day even when its kind has room for only a couple of cards', () => {
  const missed = { box: 0, n: 1, last: T, due: addDays(T, 1), grade: MISS };
  const queue = plan({ 'r-hear-001': missed, 'r-check-001': missed }, {}, addDays(T, 1), 10);
  assert.deepEqual(queue.filter((s) => s.phase === 'review').map((s) => s.id).sort(), ['r-check-001', 'r-hear-001']);
  assert.deepEqual(plan({ 'q-goal-001': missed }, {}, addDays(T, 1)).filter((s) => byId.get(s.id).kind === 'qa'), [], 'a question missed in the mock Q&A stays out of the daily session');
});

test('new grammar comes from three topics at a time: a known topic hands over to the next, and Lv2 waits until Lv1 is nearly known', () => {
  const said = (ids) => Object.fromEntries(ids.map((id) => [id, review(undefined, OK, T)]));
  const topics = (hist) => [...new Set(plan(hist, {}, addDays(T, 1)).filter((s) => s.phase === 'grammar' && !hist[s.id]).map((s) => byId.get(s.id).topic))];
  assert.deepEqual(topics(said(['b-past-001', 'b-past-002', 'b-past-003'])), ['b-future', 'b-modal', 'b-inf'], 'b-past is known: b-inf takes its place');
  const lv1 = items.filter((c) => c.kind === 'grammar' && c.level === 1 && c.nth < 3).map((c) => c.id);
  assert.ok(topics(said(lv1)).every((t) => t.startsWith('a-')), 'every Lv1 topic known: Lv2 begins');
  assert.deepEqual(topics(said(lv1.slice(18))), ['b-past', 'b-future', 'b-modal'], 'three Lv1 topics still being learned (b-be, b-neg and b-prog wait): no Lv2 yet');
});

// The state the learner was in on 2026-11-18: dozens of present-tense cards due, a few others.
const dueLong = (ids, day = addDays(T, -5)) => Object.fromEntries(ids.map((id) => [id, review(undefined, OK, day)]));
const ofTopics = (...t) => items.filter((c) => t.includes(c.topic) && !c.held).map((c) => c.id);
const grammarOf = (hist) => plan(hist, {}, T).filter((s) => s.phase === 'grammar'), fresh = (hist) => (s) => !hist[s.as ?? s.id]; // a card never answered, whatever sentence it is asked in

test('reviews put off on purpose (b-be, b-neg, b-prog) are not a pile: new grammar still comes, in turn with the other reviews', () => {
  const hist = { ...dueLong(ofTopics('b-be', 'b-neg', 'b-prog')), ...dueLong(ofTopics('b-past').slice(0, 4)) };
  const grammar = plan(hist, FLUENT, T).filter((s) => s.phase === 'grammar'), head = grammar.filter((s) => !LATER(s)).slice(0, 6).map(fresh(hist));
  assert.ok(Object.keys(hist).length >= 50 && grammar.filter(fresh(hist)).length >= grammar.length / 2 - 1, 'half is new');
  assert.deepEqual(head, [false, true, false, true, false, true], 'old, new, old, new …');
  assert.ok(plan(hist, {}, T).filter((s) => s.phase === 'pattern' && !s.intro).every((s) => !hist[s.id]), 'the other kinds are untouched');
  assert.ok(grammar.filter((s) => s.as).every((s) => byId.get(s.id).topic === byId.get(s.as).topic && !hist[s.id]), 'a review is another sentence of its topic, one never answered');
});

test('a really deep pile of reviews takes the grammar slot, all but one new card: no day is without one', () => {
  const hist = dueLong(ofTopics('b-past', 'b-future', 'b-modal', 'b-inf'));
  const grammar = grammarOf(hist);
  assert.ok(grammar.length >= 10 && grammar.filter(fresh(hist)).length === 1, 'one new card, the rest due');
  const deepPatterns = dueLong(ofTopics('p-goal', 'p-focus', 'p-problem', 'p-important', 'p-because'));
  assert.ok(plan(deepPatterns, {}, T).filter((s) => s.phase === 'pattern').every((s) => deepPatterns[s.id]), 'frames and replies keep to reviews');
});

test('the present-tense basics (b-be, b-neg, b-prog) come after the other grammar — as reviews and as new cards', () => {
  const { hist, days, next } = practice(4, () => OK), grammar = plan(hist, days, next).filter((s) => s.phase === 'grammar');
  const last = grammar.findLastIndex((s) => !LATER(s)), first = grammar.findIndex(LATER);
  assert.ok(first < 0 || first > last, 'none of them before another topic');
  const day1 = plan().filter((s) => s.phase === 'grammar');
  assert.ok(!day1.some(LATER), 'a new learner meets them after the other topics have had their turn');
});

test('a grammar review is asked in a sentence never answered, differently each time, and recorded on the card that was due', () => {
  const day = addDays(T, -5), hist = dueLong(ofTopics('b-past').slice(0, 3), day);
  const asks = (h) => plan(h, {}, T).filter((s) => s.as);
  const first = asks(hist);
  assert.equal(first.length, 3);
  assert.deepEqual(first.map((s) => s.as).sort(), Object.keys(hist).sort());
  assert.ok(first.every((s) => !hist[s.id] && !byId.get(s.id).held && byId.get(s.id).topic === 'b-past'));
  const all = plan(hist, {}, T).map((s) => s.id);
  assert.equal(new Set(all).size, all.length, 'no sentence twice in a session, new cards included');
  // Answering records the due card, not the sentence asked; the next review is yet another sentence.
  const done = { ...hist, 'b-past-001': review(hist['b-past-001'], OK, T) };
  const again = plan(done, {}, addDays(T, 10)).find((s) => s.as === 'b-past-001');
  assert.ok(again && again.id !== first.find((s) => s.as === 'b-past-001').id, 'not the same sentence twice');
  // A topic with every other sentence answered has nothing else to ask: the card itself comes back.
  const used = Object.fromEntries(ofTopics('b-past').map((id) => [id, review(undefined, OK, day)]));
  assert.ok(plan(used, {}, T).filter((s) => byId.get(s.id).topic === 'b-past').every((s) => !s.as));
});

test('a grammar card retried in the session shows its grammar and its opening up front', () => {
  const c = byId.get('b-subjunctive-001');
  assert.deepEqual(scaffold(c, { retry: true }).shown.map(([label]) => label), ['文法', '出だし']);
  assert.deepEqual(scaffold(c, { retry: true }).hints.map(([label]) => label), ['使う語', '頭文字']);
  assert.deepEqual(scaffold(c, {}).shown, []);
  const [[, bank]] = scaffold(c, {}).hints;
  assert.deepEqual(bank.split(' / ').sort(), c.en.replace(/[.,?!]/g, '').split(' ').sort(), 'every word of the sentence, without punctuation');
  assert.notEqual(bank, c.en.replace(/[.,?!]/g, '').split(' ').join(' / '), 'out of order (alphabetical)');
});

test('Q&A reply: dictation — nothing shown up front, the first letters and word lengths as the hint', () => {
  const r = items.find((c) => c.id === 'r-hear-001'), queue = plan({}, FLUENT);
  assert.deepEqual(scaffold(r, {}).shown, []);
  assert.deepEqual(scaffold(r, {}).hints, [['頭文字', skeleton(r.en)]]);
  assert.deepEqual(scaffold(r, { retry: true }).shown.map(([label]) => label), ['頭文字'], 'a retry shows them up front');
  assert.ok(queue.filter((s) => s.phase === 'reply').every((s) => s.level === undefined), 'no Beginner / Advanced ladder');
  const i = queue.findIndex((s) => s.phase === 'reply');
  assert.equal(requeue(queue, i, MISS, 'reply').findIndex((s, j) => j > i && s.retry), i + 4, 'a missed phrase comes back a few cards later, not straight away');
});

test('Q&A: the question alone, a hint always available; a missed card of the daily session comes back a few cards later', () => {
  const q = items.find((c) => c.id === 'q-method-001');
  assert.deepEqual(scaffold(q, {}).shown, []);
  assert.deepEqual(scaffold(q, {}).hints, [['入れる要素', q.points], ['答え方の型', q.frame], ['質問の意味', q.ja]]);
  assert.deepEqual(choices(true, true), ['content', 'english', 'hint'], 'after a hint it cannot count as unaided');
  assert.deepEqual(choices(false, false), ['miss', 'ok']);
  assert.deepEqual(choices(false, false, true), ['miss', 'hint', 'ok'], 'the Phrase Drill: the target came, the rest of the sentence did not');
  assert.deepEqual(choices(false, true, true), ['miss', 'hint']);
  const grammar = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, phase: 'grammar' }));
  const again = requeue(grammar, 0, MISS);
  assert.deepEqual(again[4], { id: 'g0', phase: 'grammar', retry: true }, 'a few cards later');
  assert.equal(requeue(again, 4, MISS), again, 'only one retry');
  assert.deepEqual(requeue(grammar, 0, HINT)[4], { id: 'g0', phase: 'grammar', retry: true }, 'said with a hint: said again from memory');
  assert.equal(requeue(grammar, 0, OK), grammar);
  assert.equal(requeue(grammar, 6, MISS).at(-1).retry, true);
});

test('the daily session never asks a research question', () => {
  const late = practice(12, () => OK);
  assert.ok(late.sessions.flat().every((s) => byId.get(s.id).kind !== 'qa' && s.follow == null), 'no questions or follow-ups in the daily session');
  assert.deepEqual(overview(items, late.hist, late.next).qa, [0, 0, 0]);
});

test('mock Q&A: five questions from across the topics, met ones first, each with a follow-up of its topic', () => {
  const hist = { 'q-goal-001': review(undefined, OK, T), 'q-method-001': review(undefined, MISS, T) }, met = items.filter((c) => hist[c.id]);
  const q = mockSession(items, hist, seeded('m'));
  assert.equal(q.length, 10);
  const main = q.filter((s) => s.follow == null), follow = q.filter((s) => s.follow != null);
  assert.ok(main.every((s, i) => s.phase === 'mock' && follow[i].id === s.id));
  assert.deepEqual(main.slice(0, 2).map((s) => s.id).sort(), met.map((c) => c.id).sort(), 'questions already met come first');
  assert.ok(follow.every((s) => byId.get(s.id).deck.follow[s.follow]));
  assert.deepEqual(scaffold(byId.get(main[0].id), main[0]).shown, [], 'English question only');
  assert.deepEqual(scaffold(byId.get(follow[0].id), follow[0]).hints.map(([k]) => k), ['入れる要素', '答え方の型', '質問の意味']);
  assert.equal(mockSession(items, {}, seeded('m')).length, 10, 'from the start, with new questions');
});

test('weekly check: after a week, a few never-seen cards from every kind, with no support and no hints', () => {
  const { hist, days, sessions, next } = practice(7, () => OK);
  assert.ok(sessions.flat().every((s) => !s.check), 'not in the first week');
  const queue = plan(hist, days, next), check = queue.filter((s) => s.check);
  assert.deepEqual(kinds(check), { grammar: 3, pattern: 2, reply: 1 });
  assert.ok(check.every((s) => !hist[s.id] && byId.get(s.id).held));
  assert.deepEqual(queue.slice(-check.length), check, 'at the end of the session');
  assert.deepEqual(scaffold(byId.get(check[0].id), check[0]), { shown: [], hints: [] });
  assert.equal(requeue(check, 0, MISS), check, 'and no second try');
  const c = byId.get(check[0].id), done = { ...days, [next]: tally(days[next], c, { grade: OK, check: true }) };
  assert.ok(plan(hist, done, addDays(next, 1)).every((s) => !s.check), 'once a week');
  assert.ok(plan(hist, done, addDays(next, 7)).some((s) => s.check));
});

test('tally and weekly: per-week counts said without a hint, weak grammar topics and the check', () => {
  const g = byId.get('b-passive-001'), q = byId.get('q-goal-001');
  let day = {};
  for (const grade of [MISS, HINT, OK, OK]) day = tally(day, g, { grade });
  day = tally(day, q, { grade: MISS, why: 'english' });
  day = tally(day, q, { grade: OK, check: true });
  assert.deepEqual(day, { 'b-passive': [4, 2], 'q-goal': [2, 1], '#why': [0, 1], '#check': [1, 1] });
  const [thisWeek, lastWeek] = weekly({ [T]: day, [addDays(T, -7)]: tally({}, g, { grade: OK }) }, items, addDays(T, 2));
  assert.equal(thisWeek.from, addDays(T, -1), 'weeks start on Sunday');
  assert.deepEqual(thisWeek.kinds, { grammar: [4, 2], qa: [2, 1] });
  assert.deepEqual([thisWeek.weak, thisWeek.check, thisWeek.why], [['b-passive'], [1, 1], [0, 1]]);
  assert.deepEqual([lastWeek.kinds, lastWeek.weak], [{ grammar: [1, 1] }, []]);
});

test('state survives a reload: history and an unfinished session round-trip through JSON', async () => {
  const { restore } = await import('../core.js');
  const { hist, days, next } = practice(2, (c) => (c.nth % 3 ? OK : MISS));
  const session = { day: next, queue: plan(hist, days, next), idx: 7, grades: [OK, MISS, null] };
  const saved = JSON.parse(JSON.stringify({ log: { [T]: 40 }, hist, days, answers: { 'q-goal-001': 'My goal is to ...' }, session, settings: {} }));
  const state = restore(saved);
  assert.deepEqual([state.hist, state.days, state.answers], [hist, days, { 'q-goal-001': 'My goal is to ...' }]);
  assert.deepEqual(state.session.queue, session.queue.map((s) => JSON.parse(JSON.stringify(s))));
  assert.equal(state.session.idx, 7, 'resume where it stopped');
  assert.deepEqual(plan(state.hist, state.days, next), session.queue, 'and the plan is unchanged by the round-trip');
});

test('when everything has been seen and nothing is due, the cards practiced longest ago come back', () => {
  const hist = Object.fromEntries(items.map((c, i) => [c.id, { box: 3, n: 3, last: addDays(T, -1 - (i % 5)), due: addDays(T, 20) }]));
  const queue = plan(hist, FLUENT);
  assert.ok(queue.length > 20);
  assert.ok(queue.every((s) => hist[s.id].last === addDays(T, -5)));
});

test('odd values in a restored backup are dropped, and do not stop the planner', () => {
  const day = '2026-11-14';
  for (const w of [5, null, 'x', [], {}, { box: 'a', due: 7, last: null }]) {
    const s = restore({ log: { [day]: w }, hist: { 'b-be-001': w, 'ap-about-001': w }, days: { [day]: { 'b-be': w, '#time:grammar': w }, other: w }, session: { queue: w } });
    assert.ok(Array.isArray(planSession({ items, hist: s.hist, days: s.days, day, minutes: 30, rand: seeded(day) })), JSON.stringify(w));
    overview(items, s.hist, day); weekly(s.days, items, day); byNeed(items, s.hist, day);
  }
  assert.deepEqual(restore({ log: { a: 'x', b: 3 }, days: { d: { t: [1, 'x'], u: [1, 1] } } }), { ...restore({}), log: { b: 3 }, days: { d: { u: [1, 1] } } });
});

test('restore: records saved while answers were timed — grades 2 and 3 become said, counters [answers, said], timings gone', () => {
  const old = { d: { 'b-be': [5, 2, 1], '#time:grammar': [40, 3], '#start': [9, 1], '#check': [2, 1], '#why': [1, 0] } };
  const now = { d: { 'b-be': [5, 3], '#check': [2, 1], '#why': [1, 0] } };
  assert.deepEqual(restore({ days: old }).days, now);
  assert.deepEqual(restore({ days: now }).days, now, 'idempotent');
  assert.deepEqual(restore({ days: { d: { '#plan:10': [1], '#plan:30': [2] } } }).days.d, { '#plan:10': [1], '#plan:30': [2] }, 'the length of the sessions started is kept');
  const card = { box: 1, n: 1, last: T, due: T };
  assert.deepEqual([3, 2, 1].map((grade) => restore({ hist: { x: { ...card, grade } } }).hist.x.grade), [2, 2, 1], 'said quickly or slowly: said');
});
