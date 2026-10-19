import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, schedule, answer, buildSession, streak, calendar, timeLimit, wordDiff, flattenCards, englishVoices } from '../core.js';

const T = '2026-10-19';

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('schedule: new card intervals by grade', () => {
  assert.deepEqual([0, 1, 2, 3].map((g) => schedule(undefined, g, T).ivl), [1, 1, 1, 3]);
  assert.equal(schedule(undefined, 2, T).due, '2026-10-20');
});

test('schedule: Good grows, Again resets, ease has a floor', () => {
  const s = schedule({ ivl: 10, ease: 2.5 }, 2, T);
  assert.equal(s.ivl, 25);
  assert.equal(schedule(s, 0, T).ivl, 1);
  let x = { ivl: 5, ease: 1.35 };
  for (let i = 0; i < 5; i++) x = schedule(x, 0, T);
  assert.equal(x.ease, 1.3);
  assert.ok(schedule({ ivl: 1, ease: 1.3 }, 2, T).ivl > 1, 'Good always progresses');
});

test('answer is pure and counts today', () => {
  const s0 = { cards: {}, log: {}, settings: {} };
  const s1 = answer(s0, 'x', 2, T);
  assert.deepEqual(s0, { cards: {}, log: {}, settings: {} });
  assert.equal(answer(s1, 'y', 2, T).log[T], 2);
});

const files = [
  { level: 1, decks: [{ id: 'a', cards: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }] }] },
  { level: 3, decks: [{ id: 'b', cards: [{ id: 'b1' }, { id: 'b2' }] }, { id: 'c', cards: [{ id: 'c1' }] }] },
];
const cards = flattenCards(files);

test('buildSession: due first, then new round-robin across levels, only selected decks', () => {
  const state = {
    cards: { a1: { due: T }, b1: { due: '2026-10-01' }, a2: { due: '2026-10-30' } },
    settings: { decks: ['a', 'b'], newPerDay: 3 },
  };
  assert.deepEqual(buildSession(cards, state, T).map((c) => c.id), ['b1', 'a1', 'a3', 'b2']);
  assert.equal(cards.find((c) => c.id === 'b2').level, 3);
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
