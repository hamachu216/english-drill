// The learning algorithm as pure functions: history in, today's session out. No DOM, no storage, no clock.
//
// Data it works on:
//   hist[cardId] = { box, n, last, due, grade, hint }   one record per card ever answered
//   days[date]   = { [topicId]: [answers, slow, solo],  counters per day (first attempts only), plus
//                    '#time:<kind>': [seconds, n], '#start': [seconds, n], '#check': [n, ok], '#why': [content, english] }
//   queue        = [{ id, phase, level?, intro?, follow?, check?, retry? }]   one step per screen
import { addDays, shuffle, skeleton, opening, mask } from './core.js';

export const MISS = 0, HINT = 1, SLOW = 2, SOLO = 3;
export const GRADE = { miss: MISS, content: MISS, english: MISS, hint: HINT, slow: SLOW, solo: SOLO };

const INTERVAL = [1, 3, 7, 14, 30, 60]; // days until the next review, by box
const KINDS = ['grammar', 'colloc', 'pattern', 'reply', 'qa'];
const SECONDS = { grammar: 35, colloc: 30, pattern: 45, reply: 30, qa: 90 }; // rough cost of one card: turns minutes into card counts
// Short kinds outside the split, one card per this many minutes: 5 adjective + preposition pairs and 6 Q&A replies in 30 minutes.
const EVERY = { colloc: 6, reply: 5 };
const NEUTRAL = 0.65; // fluency at which the split is the default 15 : 10 : 5 minutes
const BLOCK = 4; // sentences drilled on the day a frame is introduced
const UNLOCK = 6; // questions answered without hesitation on a second day or later, before impromptu Q&A starts
const CHECK = { grammar: 3, pattern: 2, reply: 1, qa: 1 }; // weekly first-sight check
const WEEK = 7;
const SLOW_BOX = 2; // slow answers alone get a card this far

// One answer → the card's new record. A box is only climbed on a day the card was due (or new):
// answering again the same day, or early, can lower the box but never raise it or push the due date.
// miss/hint → tomorrow; solo → one box up (3, 7, 14, 30, 60 days); slow → one box up but never past 7 days.
export function review(rec, { grade, hint = false }, day) {
  const { box = 0, n = 0, due } = rec ?? {};
  const onTime = !due || day >= due, ok = grade >= SLOW;
  const next = !ok ? 0 : !onTime ? box : grade === SOLO ? Math.min(box + 1, INTERVAL.length - 1) : Math.max(box, Math.min(box + 1, SLOW_BOX));
  return { box: next, n: n + 1, last: day, due: ok && !onTime ? due : addDays(day, ok ? INTERVAL[next] : 1), grade, hint };
}

// Counters are maps of number arrays, so adding two days (or one answer to a day) is the same operation.
const plus = (a = [], b = []) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
const merge = (a, b) => Object.keys(b).reduce((out, k) => ({ ...out, [k]: plus(a[k], b[k]) }), a);

// One first-attempt answer folded into its day. Seconds are capped so a card left open doesn't skew the average.
export const tally = (day = {}, card, { grade, secs, start, why, check }) => merge(day, {
  [card.topic]: [1, +(grade === SLOW), +(grade === SOLO)],
  ...(check && { '#check': [1, +(grade >= SLOW)] }),
  ...(secs != null && grade >= SLOW && { ['#time:' + card.kind]: [Math.round(Math.min(secs, 60)), 1] }),
  ...(start != null && { '#start': [Math.round(Math.min(start, 60)), 1] }),
  ...((why === 'content' || why === 'english') && { '#why': [+(why === 'content'), +(why === 'english')] }),
});

// Counters summed over the days in [from, to].
export const span = (days, from, to) => Object.keys(days).filter((d) => d >= from && d <= to).reduce((sum, d) => merge(sum, days[d]), {});

// Topic counters → [answers, slow, solo] per kind.
export function byKind(counters, items) {
  const kindOf = Object.fromEntries(items.map((c) => [c.topic, c.kind])), out = {};
  for (const [topic, v] of Object.entries(counters)) if (kindOf[topic]) out[kindOf[topic]] = plus(out[kindOf[topic]], v);
  return out;
}

// Share of the session per kind. Fluency = solo counts fully, slow half; too little data counts as NEUTRAL.
// Weak grammar pulls time toward grammar (never above 65%); solid grammar frees it for research English
// (grammar never below 30%); and the better the frames go, the more of the research part is Q&A.
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const fluency = ([n, slow, solo] = [0]) => (n < 8 ? NEUTRAL : (solo + slow / 2) / n);
export function shares(recent) {
  const grammar = clamp(0.5 + (NEUTRAL - fluency(recent.grammar)) * 0.6, 0.3, 0.65);
  const talk = clamp(1 / 3 + (fluency(recent.pattern) - NEUTRAL) * 0.8, 0.25, 0.6);
  return { grammar, pattern: (1 - grammar) * (1 - talk), qa: (1 - grammar) * talk };
}
// Today's split, from the last two weeks of answers.
export const mix = (days, items, day) => shares(byKind(span(days, addDays(day, -2 * WEEK + 1), day), items));

// Topics with at least two cards that were last answered with a hint or not at all, worst first.
export function weakTopics(items, hist) {
  const n = {};
  for (const c of items) if (hist[c.id]?.box === 0) n[c.topic] = (n[c.topic] ?? 0) + 1;
  return Object.keys(n).filter((t) => n[t] >= 2).sort((a, b) => n[b] - n[a]);
}

// How far each started topic has come: the highest box among its cards, capped at 2.
// For a sentence frame this is the support level: 0 = frame shown, 1 = frame half hidden, 2 = no frame.
export function stageOf(items, hist) {
  const stage = {};
  for (const c of items) if (hist[c.id]) stage[c.topic] = Math.min(2, Math.max(stage[c.topic] ?? 0, hist[c.id].box));
  return stage;
}

// New cards one topic at a time in turn, easy ones first (questions have no difficulty: just in turn).
export const easyFirst = (a, b) => (a.difficulty ?? 0) - (b.difficulty ?? 0) || a.nth - b.nth;

// Questions that can be answered without hesitation, not just once: what unlocks impromptu Q&A.
const fluent = (items, hist) => items.filter((c) => c.kind === 'qa' && hist[c.id]?.box >= 2 && hist[c.id].grade === SOLO).length;

// Today's session. Per kind: reviews that are due (weakest first), then extra cards from the weakest topic,
// then new cards, then — when nothing is left — the cards practiced longest ago. Unless the review pile is
// more than two sessions deep, a quarter of each kind is kept for new cards, so there is progress every day.
// Every kind gets at least one card, so research English is touched no matter how grammar is going.
// Order: cards failed last time → grammar → adjective + preposition → sentence frames → Q&A replies → Q&A → (weekly) first-sight check.
export function planSession({ items, hist, days, day, minutes, rand = Math.random }) {
  const rec = (c) => hist[c.id];
  const due = (c) => rec(c)?.due <= day;
  const sore = (c) => rec(c)?.box === 0;
  const idle = (c) => rec(c) && !due(c) && rec(c).last < day;
  const stage = stageOf(items, hist), weak = weakTopics(items, hist);
  const share = mix(days, items, day), fixed = Object.fromEntries(Object.entries(EVERY).map(([k, m]) => [k, Math.max(1, Math.round(minutes / m))]));
  const rest = minutes - Object.entries(fixed).reduce((s, [k, n]) => s + (n * SECONDS[k]) / 60, 0); // the 15:10:5 split covers what they leave
  const unlocked = fluent(items, hist) >= UNLOCK;

  const pick = (kind) => {
    const pool = items.filter((c) => c.kind === kind), n = fixed[kind] ?? Math.max(1, Math.round((rest * 60 * share[kind]) / SECONDS[kind]));
    const fresh = pool.filter((c) => !rec(c) && !c.held);
    const pile = pool.filter(due).sort((a, b) => rec(a).box - rec(b).box || rec(a).due.localeCompare(rec(b).due));
    const quota = pile.length < 2 * n ? Math.min(n, Math.max(kind === 'pattern' ? 2 : 1, Math.ceil(n / 4))) : 0;
    const reviews = pile.slice(0, n - quota);
    const rested = pool.filter(idle).sort((a, b) => rec(a).last.localeCompare(rec(b).last));
    const worst = weak.find((t) => pool.some((c) => c.topic === t));
    const focus = [...fresh, ...rested].filter((c) => c.topic === worst).slice(0, Math.ceil(n / 5));
    // New frames: more sentences for frames already started, then (once every started frame has been said
    // at least once) one or two new frames, BLOCK sentences each. New questions: one per topic in turn.
    const open = fresh.filter((c) => c.topic in stage);
    const ready = pool.every((c) => !(c.topic in stage) || stage[c.topic] >= 1) && n - reviews.length - focus.length - open.length >= 2;
    const untouched = [...new Set(fresh.filter((c) => !(c.topic in stage)).map((c) => c.topic))].slice(0, n > 6 ? 2 : 1);
    const added = {
      grammar: fresh,
      pattern: [...open, ...(ready ? untouched.flatMap((t) => fresh.filter((c) => c.topic === t).slice(0, BLOCK)) : [])],
      qa: [...fresh].sort(easyFirst),
      reply: [...fresh].sort(easyFirst),
      colloc: [...fresh].sort(easyFirst),
    }[kind];
    return [...new Set([...reviews, ...focus, ...added, ...pile, ...rested])].slice(0, n);
  };

  const chosen = Object.fromEntries(KINDS.map((k) => [k, pick(k)]));
  const old = (k) => shuffle(chosen[k].filter((c) => rec(c) && !sore(c)), rand), added = (k) => chosen[k].filter((c) => !rec(c));
  const level = (c) => (c.kind === 'pattern' ? stage[c.topic] ?? 0 : c.q ? Math.min(2, rec(c)?.box ?? 0) : undefined);
  const step = (phase) => (c) => ({ id: c.id, phase, level: level(c) });

  const talk = [...old('qa'), ...added('qa')];
  const wild = !unlocked ? [] : added('qa').length ? added('qa') : talk.slice(-1); // impromptu: unseen questions first
  const firstDay = Object.keys(days).sort()[0], lastCheck = Object.keys(days).filter((d) => days[d]['#check']).sort().at(-1);
  const check = firstDay && day >= addDays(lastCheck ?? firstDay, WEEK) ? Object.keys(CHECK).flatMap((k) => {
    const unseen = items.filter((c) => c.kind === k && c.held && !rec(c)), known = unseen.filter((c) => c.topic in stage);
    return shuffle(known.length >= CHECK[k] ? known : unseen, rand).slice(0, CHECK[k]);
  }) : [];

  return [
    ...KINDS.flatMap((k) => chosen[k].filter(sore)).map(step('review')),
    ...[...old('grammar'), ...added('grammar')].map(step('grammar')),
    ...[...old('colloc'), ...added('colloc')].map(step('colloc')),
    ...old('pattern').map(step('pattern')),
    ...added('pattern').flatMap((c, i, a) => [...(c.topic in stage || a[i - 1]?.topic === c.topic ? [] : [{ id: c.id, phase: 'pattern', intro: true }]), step('pattern')(c)]),
    ...[...old('reply'), ...added('reply')].map(step('reply')),
    ...talk.flatMap((c) => (wild.includes(c)
      ? [{ id: c.id, phase: 'impromptu', level: 2 }, { id: c.id, phase: 'impromptu', level: 2, follow: Math.floor(rand() * c.deck.follow.length) }]
      : [step('qa')(c)])),
    ...check.map((c) => ({ id: c.id, phase: 'check', level: 2, check: true })),
  ];
}

// A failed card comes back once in the same session with full support: a question right away, others a few cards later.
export function requeue(queue, i, grade, kind) {
  const s = queue[i];
  if (grade >= SLOW || s.retry || s.check || s.follow != null) return queue;
  const at = Math.min(queue.length, i + (kind === 'qa' || kind === 'reply' ? 1 : 4));
  return [...queue.slice(0, at), { ...s, retry: true }, ...queue.slice(at)];
}

// What a step shows up front and what the hint button reveals, in order. Support fades with the level:
//   frame card   0: frame shown · 1: frame half hidden · 2: nothing
//   question     0 (Beginner): keywords + answer frame · 1 (Intermediate): keywords · 2 (Advanced): nothing
// A retry shows everything; the weekly check shows nothing and has no hints.
export function scaffold(c, { level = 2, retry, check, follow }) {
  const f = c.deck.follow?.[follow];
  const [ladder, shown] =
    f ? [[['答え方の型', f.frame], ['質問の意味', f.ja]], 0]
    : c.q ? [[['キーワード', c.keys.join(' / ')], ['答え方の型', c.frame], ['質問の意味', c.ja]], retry ? 3 : 2 - level]
    : c.kind === 'pattern' ? [[...(level === 1 && !retry ? [['型（一部）', mask(c.deck.frame)]] : []), ['型', c.deck.frame], ['頭文字', skeleton(c.en)]], retry || level < 2 ? 1 : 0]
    : [[['出だし', opening(c.en)], ['頭文字', skeleton(c.en)]], 0];
  return check ? { shown: [], hints: [] } : { shown: ladder.slice(0, shown), hints: ladder.slice(shown) };
}

// The self-evaluation buttons on offer. A hint rules out "unaided"; a timeout rules out "solo".
// For a question, "couldn't say it" is split by where it broke down: no content, or content but no English.
export const choices = (talk, hinted, late) => [...(talk ? ['content', 'english'] : ['miss']), ...(hinted ? ['hint'] : late ? ['slow'] : ['slow', 'solo'])];

// Where things stand, for the home screen. Deliberately coarse: counts, not scores.
export function overview(items, hist, day) {
  const stage = stageOf(items, hist), of = (k) => items.filter((c) => c.kind === k);
  const frames = [...new Set(of('pattern').map((c) => c.topic))];
  return {
    due: items.filter((c) => hist[c.id]?.due <= day).length,
    weak: weakTopics(of('grammar'), hist),
    frames: [0, 1, 2].map((s) => frames.filter((t) => stage[t] === s).length),
    framesTotal: frames.length,
    ...Object.fromEntries(['qa', 'reply'].map((k) => [k, [0, 1, 2].map((l) => of(k).filter((c) => hist[c.id] && Math.min(2, hist[c.id].box) === l).length)])),
    unlock: Math.max(0, UNLOCK - fluent(items, hist)),
  };
}

// The last `weeks` Sunday-aligned weeks, newest first: counters per kind, the grammar topics that went worst, timings, check.
export function weekly(days, items, day, weeks = 4) {
  const sunday = addDays(day, -new Date(day + 'T00:00:00Z').getUTCDay());
  const grammar = new Set(items.filter((c) => c.kind === 'grammar').map((c) => c.topic));
  const fails = ([n, slow, solo]) => n - slow - solo;
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDays(sunday, -WEEK * i), sum = span(days, from, addDays(from, WEEK - 1));
    const weak = Object.keys(sum).filter((t) => grammar.has(t) && fails(sum[t]) >= 2).sort((a, b) => fails(sum[b]) - fails(sum[a])).slice(0, 2);
    return { from, kinds: byKind(sum, items), weak, time: sum['#time:grammar'], start: sum['#start'], check: sum['#check'], why: sum['#why'] };
  });
}
