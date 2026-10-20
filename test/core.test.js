import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, ROUND, shuffle, nextRound, streak, calendar, timeLimit, wordDiff, flattenCards, englishVoices } from '../core.js';

const T = '2026-10-19';

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('flattenCards tags each card with level, deck title and refs', () => {
  const [c] = flattenCards([{ level: 3, decks: [{ title: 'T', refs: [1], cards: [{ id: 'x' }] }] }]);
  assert.deepEqual(c, { id: 'x', level: 3, deckTitle: 'T', refs: [1] });
});

const seq = (...xs) => () => (xs.length > 1 ? xs.shift() : xs[0]); // deterministic rand

test('shuffle is a pure permutation', () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = shuffle(xs, seq(0.9, 0.1, 0.5, 0.3));
  assert.deepEqual(xs, [1, 2, 3, 4, 5]);
  assert.deepEqual([...ys].sort(), xs);
  assert.notDeepEqual(ys, xs);
});

test('nextRound: ROUND cards from the pool, refilled when empty', () => {
  const all = Array.from({ length: 25 }, (_, i) => i);
  const r1 = nextRound([], [], all);
  assert.equal(r1.cards.length, ROUND);
  assert.equal(r1.pool.length, 25 - ROUND);
  assert.equal(r1.retry, false);
  const r2 = nextRound([], r1.pool, all), r3 = nextRound([], r2.pool, all);
  assert.equal(r3.cards.length, 5, 'last partial round');
  assert.deepEqual([...r1.cards, ...r2.cards, ...r3.cards].sort((a, b) => a - b), all, 'no repeats before the pool is used up');
  assert.equal(nextRound([], r3.pool, all).cards.length, ROUND, 'refilled');
});

test('nextRound: misses are retried and the pool is kept', () => {
  const r = nextRound(['a', 'b'], ['x', 'y'], ['x', 'y', 'a', 'b']);
  assert.equal(r.retry, true);
  assert.deepEqual([...r.cards].sort(), ['a', 'b']);
  assert.deepEqual(r.pool, ['x', 'y']);
});

test('streak counts back from today or yesterday', () => {
  const log = { '2026-10-16': 3, '2026-10-17': 1, '2026-10-18': 5 };
  assert.equal(streak(log, T), 3);
  assert.equal(streak({ ...log, [T]: 1 }, T), 4);
  assert.equal(streak({}, T), 0);
});

test('calendar starts on Sunday and ends today', () => {
  const days = calendar(T, 2);
  assert.equal(new Date(days[0] + 'T00:00:00Z').getUTCDay(), 0);
  assert.equal(days.at(-1), T);
  assert.equal(days.length, 7 + 2); // 2026-10-19 is Monday
});

test('wordDiff marks model words found in order, ignoring case/punctuation', () => {
  const r = wordDiff('i am graduate student', 'I am a graduate student.');
  assert.deepEqual(r.map((x) => x.ok), [true, true, false, true, true]);
  assert.equal(r.at(-1).w, 'student.');
  assert.ok(wordDiff('', 'Hello').every((x) => !x.ok));
});

test('englishVoices keeps known-good voices, natural US first; falls back to any English', () => {
  const v = (name, lang = 'en-US') => ({ name, lang });
  const names = (vs) => englishVoices(vs).map((x) => x.name);
  assert.deepEqual(names([v('Albert'), v('ささやき声'), v('Daniel', 'en-GB'), v('Kyoko', 'ja-JP'), v('Samantha'), v('Ava (Premium)'), v('Eddy (英語（アメリカ）)')]), ['Ava (Premium)', 'Samantha', 'Daniel']);
  assert.deepEqual(names([v('English India', 'en-IN'), v('English United States'), v('Kyoko', 'ja-JP')]), ['English United States', 'English India']);
});

test('timeLimit: fixed seconds, 0 disables, auto grows with answer length', () => {
  assert.equal(timeLimit('I am a graduate student.', 10), 10);
  assert.equal(timeLimit('anything', 0), 0);
  assert.equal(timeLimit('I am a graduate student.', 'auto'), 5);
  assert.ok(timeLimit('word '.repeat(20).trim(), 'auto') > timeLimit('short one', 'auto'));
});
