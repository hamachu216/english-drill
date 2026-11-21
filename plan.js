// The learning algorithm as pure functions: history in, today's session out. No DOM, no storage, no clock.
//
// Data it works on:
//   hist[cardId] = { box, n, last, due, grade }   one record per card ever answered
//   days[date]   = { [topicId]: [answers, said],  counters per day (first attempts only), plus
//                    '#check': [n, said], '#why': [content, english], '#plan:10': [daily sessions of 10 minutes started] }
//   queue        = [{ id, phase, level?, as?, intro?, follow?, check?, retry? }]   one step per screen (`as`: the card the answer is recorded on)
//
// The daily session is grammar, sentence frames, research phrases (Lv3–5) and Q&A replies. Research questions are
// asked in the mock Q&A only.
import { addDays, shuffle, mask, wordBank, slots } from './core.js';
import { example, previous } from './colloc.js';

export const MISS = 0, HINT = 1, OK = 2;
export const GRADE = { miss: MISS, content: MISS, english: MISS, hint: HINT, ok: OK };

const INTERVAL = [1, 3, 7, 14, 30, 60]; // days until the next review, by box
const KINDS = ['grammar', 'pattern', 'phrase', 'reply']; // the daily session's; every other kind has a drill of its own
// Rough time one card takes — saying it, reading the example and its note, judging it: turns minutes into card counts.
const SECONDS = { grammar: 60, pattern: 75, phrase: 75, reply: 60 };
// Kinds outside the split, one card per this many minutes: 5 Q&A replies and 5 research phrases in 30 minutes.
// The phrases' time comes out of grammar's share (the user's choice: the frames keep theirs), but grammar keeps at
// least GRAMMAR_MIN of the split, or its reviews would stop coming.
const EVERY = { reply: 6, phrase: 6 };
const GRAMMAR_MIN = 0.2;
const NEUTRAL = 0.65; // fluency at which the split is the default: half grammar, half frames
const BLOCK = 4; // sentences drilled on the day a frame is introduced, after the one to listen to and repeat
const MOCK = 5; // questions in a mock Q&A, each with a follow-up
const CHECK = { grammar: 3, pattern: 2, phrase: 1, reply: 1 }; // weekly first-sight check
const WEEK = 7;
const HINT_BOX = 2; // answers with a hint alone get a card this far (7 days)
const LATER = new Set(['b-be', 'b-neg', 'b-prog']); // the present-tense basics, drilled to death on the first days: their cards go last
const PATIENCE = 7; // ...but a LATER review waiting this many days past its due date rejoins the others, or it would wait for ever
const KNOWN = 3; // grammar answers, all said, after which a topic counts as known and its new cards wait
const ROTATION = 3; // grammar topics taking new cards at a time

// One answer → the card's new record. A box is only climbed on a day the card was due (or new):
// answering again the same day, or early, can lower the box but never raise it or push the due date.
// miss → tomorrow; said → one box up (3, 7, 14, 30, 60 days); said with a hint → the same, but never past 7 days.
// The grade is the day's worst: a card missed and then said on its retry is still one that wasn't said.
const TOP = [0, HINT_BOX, INTERVAL.length - 1];
export function review(rec, grade, day) {
  const { box = 0, n = 0, due, last, grade: before = grade } = rec ?? {};
  const onTime = !due || day >= due, said = grade > MISS;
  const next = !said ? 0 : !onTime ? box : Math.max(box, Math.min(box + 1, TOP[grade]));
  return { box: next, n: n + 1, last: day, due: said && !onTime ? due : addDays(day, INTERVAL[next]), grade: last === day ? Math.min(before, grade) : grade };
}

// Counters are maps of number arrays, so adding two days (or one answer to a day) is the same operation.
const plus = (a = [], b = []) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
const merge = (a, b) => Object.keys(b).reduce((out, k) => ({ ...out, [k]: plus(a[k], b[k]) }), a);

// One first-attempt answer folded into its day.
export const tally = (day = {}, card, { grade, why, check }, said = +(grade === OK)) => merge(day, {
  [card.topic]: [1, said],
  ...(check && { '#check': [1, said] }),
  ...((why === 'content' || why === 'english') && { '#why': [+(why === 'content'), +(why === 'english')] }),
});

// Counters summed over the days in [from, to].
export const span = (days, from, to) => Object.keys(days).filter((d) => d >= from && d <= to).reduce((sum, d) => merge(sum, days[d]), {});

// Topic counters → [answers, said] per kind.
export function byKind(counters, items) {
  const kindOf = Object.fromEntries(items.map((c) => [c.topic, c.kind])), out = {};
  for (const [topic, v] of Object.entries(counters)) if (kindOf[topic]) out[kindOf[topic]] = plus(out[kindOf[topic]], v);
  return out;
}

// Share of the session per kind. Fluency = the share said without a hint; too little data counts as NEUTRAL.
// Weak grammar pulls time toward grammar (never above 65%); solid grammar frees it for the sentence frames
// (grammar never below 30%).
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const fluency = ([n, said] = [0]) => (n < 8 ? NEUTRAL : said / n);
export function shares(recent) {
  const grammar = clamp(0.5 + (NEUTRAL - fluency(recent.grammar)) * 0.6, 0.3, 0.65);
  return { grammar, pattern: 1 - grammar };
}
// The last two weeks of answers per kind, and today's split from them.
const recent = (days, items, day) => byKind(span(days, addDays(day, -2 * WEEK + 1), day), items);
export const mix = (days, items, day) => shares(recent(days, items, day));

// Topics with at least two cards missed last time (back tomorrow), worst first.
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

// New cards one topic at a time in turn, easy ones first (grammar and questions have no difficulty: just in turn),
// so every topic is tried early and topics are mixed.
export const easyFirst = (a, b) => (a.difficulty ?? 0) - (b.difficulty ?? 0) || a.nth - b.nth;

// Grammar topics already known: at least KNOWN cards answered, each said without a hint last time and none missed.
// Their new cards go after everyone else's, so the time goes where it is needed. One miss and the topic is back.
export function knownTopics(items, hist) {
  const said = {};
  for (const c of items) if (c.kind === 'grammar' && hist[c.id]) (said[c.topic] ??= []).push(hist[c.id]);
  return new Set(Object.keys(said).filter((t) => said[t].length >= KNOWN && said[t].every((r) => r.grade === OK && r.box >= 1)));
}
const newFirst = (wait) => (a, b) => wait.has(a.topic) - wait.has(b.topic) || easyFirst(a, b);

// Several kinds in one set (the Phrase Drill): taken in turn, each in its own order.
const alternate = (xs) => {
  const lanes = [...new Set(xs.map((c) => c.kind))].map((k) => xs.filter((c) => c.kind === k));
  return Array.from({ length: Math.max(0, ...lanes.map((l) => l.length)) }, (_, i) => lanes.map((l) => l[i])).flat().filter(Boolean);
};

// Two lists taken in turn, each in its own order; whichever is longer ends the list.
const weave = (a, b) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flat().filter(Boolean);

// Free practice and the Phrase Drill: a set of cards in the order that helps most — wrong last time, due
// (longest overdue first), new (as in the daily session), then the rest, longest ago first. Cards kept for the
// weekly first-sight check stay unseen.
export function byNeed(pool, hist, day) {
  const rec = (c) => hist[c.id], by = (k) => (a, b) => rec(a)[k].localeCompare(rec(b)[k]);
  return alternate([...new Set([
    ...pool.filter((c) => rec(c)?.box === 0).sort(by('last')),
    ...pool.filter((c) => rec(c)?.due <= day).sort(by('due')),
    ...pool.filter((c) => !rec(c) && !(c.held && c.kind in CHECK)).sort(newFirst(knownTopics(pool, hist))),
    ...pool.filter(rec).sort(by('last')),
  ])]);
}

// The drills show before they ask, the first time only: a new pair, and the first card of a function or frame none of
// whose cards has been answered, get a step to listen to and repeat first (one answered and missed is asked bare, as in
// `scaffold`). A pair's step names the sentence it is asked in (`nth`), so that a round repeating what wasn't said in
// full asks the same sentence again.
export function drillSteps(cards, hist) {
  const started = new Set(Object.keys(hist).map((id) => id.replace(/-\d+$/, '')));
  const unseen = (c, i) => (c.kind === 'colloc' ? !hist[c.id] : !started.has(c.topic) && cards.findIndex((x) => x.topic === c.topic) === i);
  const ask = (c) => ({ id: c.id, phase: 'free', ...(c.examples && { nth: c.examples.indexOf(example(c, hist[c.id])) }) });
  return cards.flatMap((c, i) => [...(unseen(c, i) ? [{ ...ask(c), intro: true }] : []), ask(c)]);
}

// What a step to listen to and repeat shows: the thing to learn, its meaning and note, and one sentence that uses it.
// For the drills that is never the sentence asked next (a frame's is another card of its deck): it is then used, not copied.
export function lesson(c, rec) {
  if (c.kind === 'colloc') { const e = previous(c, rec); return { head: c.collocation, ja: c.ja, note: c.note, en: e.en, meaning: e.ja }; }
  if (c.kind !== 'backchannel') return { head: c.deck.frame, ja: c.deck.ja, note: c.deck.note, en: c.en, meaning: c.ja };
  // Another card of the function, one that opens with a reaction to say yourself (`basic`), not one only to recognise.
  const other = c.deck.cards.findLast((x) => x.id !== c.id && c.deck.basic.some((p) => x.en.startsWith(p.replace('...', '').trim())));
  return { head: c.deck.basic.join(' / '), ja: c.deck.title, note: c.deck.note, said: other.said, en: other.en, meaning: other.ja };
}

// How far a set has come: [not started, practising, settled (next review a week or more away)].
export const progress = (items, hist) => items.reduce((n, c) => (n[!hist[c.id] ? 0 : hist[c.id].box >= 2 ? 2 : 1]++, n), [0, 0, 0]);

// A mock Q&A, outside the daily session: MOCK research questions from any topic, English only, each followed by one
// of its topic's follow-ups — questions already met first, then new ones.
export function mockSession(items, hist, rand = Math.random) {
  const qs = items.filter((c) => c.kind === 'qa'), met = qs.filter((c) => hist[c.id]);
  return [...shuffle(met, rand), ...shuffle(qs.filter((c) => !hist[c.id]), rand)].slice(0, MOCK).flatMap((c) => [
    { id: c.id, phase: 'mock' }, { id: c.id, phase: 'mock', follow: Math.floor(rand() * c.deck.follow.length) }]);
}

// Today's session. Per kind: reviews that are due (weakest first), then unseen cards from the weakest topic that has any,
// then new cards, then — when nothing is left — the cards practiced longest ago. While the review pile is shallower
// than a session half of each kind is kept for new cards, a quarter while it is under two sessions deep, none beyond (but grammar always keeps one):
// new cards bring reviews (about five each, over two months), so without that the pile grows faster than it can be
// worked off — in a simulation, cards overdue by weeks after two months. A card missed last time never waits for
// this: those always come back (as many as fit). Reviews and new cards are asked in turn, not one block after the other.
// Every kind gets at least one card, so research English is touched no matter how grammar is going.
// Order: cards failed last time → grammar → sentence frames → Q&A replies → (weekly) first-sight check.
// In grammar, the LATER topics come after the rest, as reviews (until PATIENCE days overdue) and as new cards.
export function planSession({ items, hist, days, day, minutes, rand = Math.random }) {
  const rec = (c) => hist[c.id];
  const due = (c) => rec(c)?.due <= day;
  const sore = (c) => rec(c)?.box === 0;
  const idle = (c) => rec(c) && !due(c) && rec(c).last < day;
  const stage = stageOf(items, hist), weak = weakTopics(items, hist).filter((t) => !LATER.has(t)), wait = new Set([...knownTopics(items, hist), ...LATER]);
  const later = (c) => LATER.has(c.topic) && !(rec(c)?.due <= addDays(day, -PATIENCE));
  const counts = recent(days, items, day), share = shares(counts), fixed = Object.fromEntries(Object.entries(EVERY).map(([k, m]) => [k, Math.max(1, Math.round(minutes / m))]));
  // The split covers what the replies leave; the phrases' seconds come out of grammar's part.
  const rest = minutes * 60 - fixed.reply * SECONDS.reply;
  const split = { grammar: Math.max(rest * share.grammar - fixed.phrase * SECONDS.phrase, rest * GRAMMAR_MIN), pattern: rest * share.pattern };
  const rank = {}, topics = {}; // a phrase topic's place among its level's topics
  for (const c of items) if (c.kind === 'phrase' && !(c.topic in rank)) rank[c.topic] = topics[c.level] = (topics[c.level] ?? -1) + 1;

  // → [cards, fit − room]: how many cards past the room the retries leave (negative: over it, for a new frame)
  const pick = (kind, less = 0) => {
    const pool = items.filter((c) => c.kind === kind), n = fixed[kind] ?? Math.max(1, Math.round(split[kind] / SECONDS[kind]));
    const fresh = pool.filter((c) => !rec(c) && !c.held);
    const pile = pool.filter(due).sort((a, b) => sore(b) - sore(a) || later(a) - later(b) || rec(a).box - rec(b).box || rec(a).due.localeCompare(rec(b).due));
    // The LATER reviews are put off on purpose, so they don't count as pile: only what is being worked on does.
    const depth = pile.filter((c) => !later(c)).length, quarter = Math.min(n, Math.max(kind === 'pattern' ? 2 : 1, Math.ceil(n / 4)));
    // Grammar never goes without a new card, even under a deep pile: a day with nothing new is hard on the learner, and one
// card a day (about five reviews over two months) is a load the slot can carry. In a simulation the pile then stays level
// (it grew without limit with two new cards, or with new frames and replies too, which each need more than one slot).
    const quota = depth < n ? Math.ceil(n / 2) : depth < 2 * n ? quarter : +(kind === 'grammar');
    const reviews = pile.slice(0, Math.max(n - quota, pile.filter(sore).length));
    const rested = pool.filter(idle).sort((a, b) => rec(a).last.localeCompare(rec(b).last));
    // Extra practice for the weakest topic means its unseen sentences: one said well yesterday wouldn't move today.
    const worst = weak.find((t) => fresh.some((c) => c.topic === t));
    const focus = fresh.filter((c) => c.topic === worst).slice(0, Math.ceil(n / 5));
    // New frames: more sentences for frames already started, then (once every started frame has been said
    // at least once) one or two new frames, one sentence to repeat and BLOCK to say.
    // New grammar: ROTATION topics at a time, in file order (so Lv2 waits for Lv1), each until it is known.
    const learning = [...new Set(fresh.map((c) => c.topic))].filter((t) => !wait.has(t)).slice(0, ROTATION);
    const open = fresh.filter((c) => c.topic in stage);
    const ready = pool.every((c) => !(c.topic in stage) || stage[c.topic] >= 1) && n - reviews.length - focus.length - open.length >= 2;
    const untouched = [...new Set(fresh.filter((c) => !(c.topic in stage)).map((c) => c.topic))].slice(0, n > 6 ? 2 : 1);
    const frames = kind === 'pattern' && ready ? untouched.flatMap((t) => fresh.filter((c) => c.topic === t).slice(0, 1 + BLOCK)) : [];
    // A card not said unaided comes back in the session (`requeue`), so n cards' time holds n / (1 + share not said)
    // cards and their retries. What doesn't fit comes out of the new cards, never out of the reviews, grammar's one new
    // card a day, or a new frame (`less`: what a new frame took from the pattern time, taken from the other kinds).
    const fit = Math.round(n / (2 - fluency(counts[kind])));
    const room = Math.max(fit - less, reviews.length + +(kind === 'grammar') + frames.length, 1);
    const added = {
      grammar: [...fresh.filter((c) => learning.includes(c.topic)).sort(easyFirst), ...[...fresh].sort(newFirst(wait))],
      pattern: open,
      // Lv3, Lv4 and Lv5 mixed: the first card of each level's first topic, then of its second topics …, then the second cards.
      phrase: [...fresh].sort((a, b) => a.nth - b.nth || rank[a.topic] - rank[b.topic] || a.level - b.level),
      reply: [...fresh].sort(easyFirst),
    }[kind];
    return [[...new Set([...reviews, ...frames, ...focus, ...added, ...pile, ...rested])].slice(0, room), fit - room];
  };

  // The frames go first: the time a new frame takes past their room comes out of new grammar, then new replies.
  const [pattern, frameLeft] = pick('pattern'), owed = Math.max(0, -frameLeft) * SECONDS.pattern;
  const [grammar, gave] = pick('grammar', Math.ceil(owed / SECONDS.grammar));
  const [reply] = pick('reply', Math.max(0, Math.ceil((owed - Math.max(0, gave) * SECONDS.grammar) / SECONDS.reply)));
  const chosen = { grammar, pattern, phrase: pick('phrase')[0], reply };
  const old = (k) => shuffle(chosen[k].filter((c) => rec(c) && !sore(c)), rand).sort((a, b) => later(a) - later(b)), added = (k) => chosen[k].filter((c) => !rec(c)).sort((a, b) => later(a) - later(b));
  const level = (c) => (c.kind === 'pattern' ? stage[c.topic] ?? 0 : undefined);
  const step = (phase) => (c) => ({ id: c.id, phase, level: level(c) });
  // A grammar card coming back is asked in another sentence of its topic, one never answered (`as` names the card the
  // answer is recorded on): what has to stay is the grammar, not the sentence, and every day brings sentences not seen.
  // The sentence comes from the far end of the topic, where new cards arrive last, and differs at each review (n).
  const taken = new Set(KINDS.flatMap((k) => chosen[k]).map((c) => c.id));
  const again = (phase) => (c) => {
    const spare = c.kind === 'grammar' && rec(c) ? items.filter((x) => x.topic === c.topic && !x.held && !rec(x) && !taken.has(x.id)).sort((a, b) => b.nth - a.nth) : [];
    const other = spare[rec(c)?.n % spare.length];
    if (other) taken.add(other.id);
    return other ? { id: other.id, phase, as: c.id } : step(phase)(c);
  };

  const firstDay = Object.keys(days).sort()[0], lastCheck = Object.keys(days).filter((d) => days[d]['#check']).sort().at(-1);
  const check = firstDay && day >= addDays(lastCheck ?? firstDay, WEEK) ? Object.keys(CHECK).flatMap((k) => {
    const unseen = items.filter((c) => c.kind === k && c.held && !rec(c)), known = unseen.filter((c) => c.topic in stage);
    return shuffle(known.length >= CHECK[k] ? known : unseen, rand).slice(0, CHECK[k]);
  }) : [];

  return [
    ...KINDS.flatMap((k) => chosen[k].filter(sore)).map(again('review')),
    ...weave(old('grammar'), added('grammar')).sort((a, b) => later(a) - later(b)).map(again('grammar')),
    // A new frame opens with its first sentence to listen to and repeat; that sentence is recalled on a later day.
    ...weave(old('pattern').map(step('pattern')), added('pattern').map((c, i, a) => (c.topic in stage || a[i - 1]?.topic === c.topic ? step('pattern')(c) : { id: c.id, phase: 'pattern', intro: true }))),
    ...weave(old('phrase'), added('phrase')).map(step('phrase')),
    ...weave(old('reply'), added('reply')).map(step('reply')),
    ...check.map((c) => ({ id: c.id, phase: 'check', level: 2, check: true })),
  ];
}

// A card not said unaided (missed, or said with a hint) comes back once in the same session a few cards later, with no
// support and no hint (`scaffold`): what was just seen is said again from memory, before days pass.
export function requeue(queue, i, grade) {
  const s = queue[i];
  if (grade === OK || s.retry || s.check) return queue;
  const at = Math.min(queue.length, i + 4);
  return [...queue.slice(0, at), { ...s, retry: true }, ...queue.slice(at)];
}

// What a step shows up front and what the hint button reveals. The hint is the words of the answer in alphabetical
// order (`wordBank`): the words are given, putting them in order and the grammar are left to do.
//   frame card   0: frame shown · 1: frame half hidden · 2: nothing; the hint is the frame and the words that fill it
//   sentence     nothing; the hint is its words (`en`: the sentence asked, for a pair the example of the day)
//   question     nothing; the hints, one at a time: what to include, a frame to answer in, the question in Japanese
// A card whose last answer was not said unaided (`bare`: missed, said with a hint, or given up) and the weekly check
// show nothing and have no hints: what was seen is said from memory.
// Whether a step is asked bare: its card's last answer was not said unaided, and the sentence is one already seen —
// not a grammar review asked in a sentence never answered (`as`), unless that sentence is being retried.
export const bare = (step, hist) => step.follow == null && hist[step.as ?? step.id]?.grade < OK && (!step.as || !!step.retry);
export function scaffold(c, { level = 2, bare, check, follow }, en = c.en) {
  if (bare || check) return { shown: [], hints: [] };
  const q = c.deck.follow?.[follow] ?? (c.q && c);
  if (q) return { shown: [], hints: [['入れる要素', q.points], ['答え方の型', q.frame], ['質問の意味', q.ja]] };
  if (c.kind !== 'pattern') return { shown: [], hints: [['使う語', wordBank(en)]] };
  const frame = ['型', c.deck.frame], words = ['使う語', wordBank(slots(c.deck.frame, en).join(' '))];
  return level === 0 ? { shown: [frame], hints: [words] } : { shown: level === 1 ? [['型（一部）', mask(c.deck.frame)]] : [], hints: [frame, words] };
}

// The self-evaluation buttons on offer: couldn't say it, said it with a hint, or said it.
// For a question, "couldn't say it" is split by where it broke down: no content, or content but no English.
// In the Phrase Drill (`partly`) there is always a middle: the pair or the reaction came, the rest of the sentence didn't.
export const choices = (talk, hinted, partly) => [...(talk ? ['content', 'english'] : ['miss']), ...(hinted || partly ? ['hint'] : []), ...(hinted ? [] : ['ok'])];

// Where things stand, for the home screen. Deliberately coarse: counts, not scores.
export function overview(items, hist, day) {
  const stage = stageOf(items, hist), of = (k) => items.filter((c) => c.kind === k);
  const frames = [...new Set(of('pattern').map((c) => c.topic))];
  return {
    due: items.filter((c) => hist[c.id]?.due <= day).length,
    weak: weakTopics(of('grammar'), hist),
    known: [...knownTopics(items, hist)],
    frames: [0, 1, 2].map((s) => frames.filter((t) => stage[t] === s).length),
    framesTotal: frames.length,
    ...Object.fromEntries(['qa', 'reply', 'phrase'].map((k) => [k, [0, 1, 2].map((l) => of(k).filter((c) => hist[c.id] && Math.min(2, hist[c.id].box) === l).length)])),
  };
}

// The last `weeks` Sunday-aligned weeks, newest first: counters per kind, the grammar topics that went worst, the check.
export function weekly(days, items, day, weeks = 4) {
  const sunday = addDays(day, -new Date(day + 'T00:00:00Z').getUTCDay());
  const grammar = new Set(items.filter((c) => c.kind === 'grammar').map((c) => c.topic));
  const fails = ([n, said]) => n - said;
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDays(sunday, -WEEK * i), sum = span(days, from, addDays(from, WEEK - 1));
    const weak = Object.keys(sum).filter((t) => grammar.has(t) && fails(sum[t]) >= 2).sort((a, b) => fails(sum[b]) - fails(sum[a])).slice(0, 2);
    return { from, kinds: byKind(sum, items), weak, check: sum['#check'], why: sum['#why'] };
  });
}
