// Adjective + preposition pairs ("interested in"), as pure functions: which sentence to ask, what to show, and how
// one answer moves a pair along its three steps. The pair is what is learned, not a sentence: every time it comes
// up it is asked in a different example sentence.
//
//   step 1 (choose)  pick the preposition from four   ─┐ two right answers, on two different days,
//   step 2 (recall)  say or type it, no choices        ─┘ in two different sentences → next step
//   step 3 (say)     say the whole sentence from Japanese → the usual review boxes (7, 14, 30, 60 days)
// A wrong answer at any step brings the pair back tomorrow.
import { shuffle, addDays, skeleton } from './core.js';
import { SLOW, review, easyFirst } from './plan.js';

export const PREPS = ['about', 'at', 'by', 'for', 'from', 'in', 'of', 'to', 'with'];
export const STEPS = ['', '選ぶ', '思い出す', '文で言う'];
const WINS = 2;

export const stepOf = (rec) => rec?.step ?? 1;
// A different sentence each time the pair comes up (the answer count rotates through them).
export const example = (c, rec) => c.examples[(rec?.n ?? 0) % c.examples.length];
// Prepositions that are right in this sentence: the pair's own, plus any the sentence also allows.
export const accepted = (c, ex) => [c.prep, ...(ex.also ?? [])];
// "She is interested in ML." → "She is interested ___ ML."
export const blank = (c, ex) => ex.en.replace(new RegExp(`\\b(${c.adj}) ${c.prep}\\b`, 'i'), '$1 ___');

// Four choices: the answer, then the prepositions this adjective takes in other pairs (the real confusions),
// then others. Never one that would also be right in this sentence.
export function options(c, ex, items, rand) {
  const ok = accepted(c, ex), rivals = items.filter((x) => x.adj === c.adj && x.prep !== c.prep).map((x) => x.prep);
  const wrong = [...new Set([...shuffle(rivals, rand), ...shuffle(PREPS, rand)])].filter((p) => !ok.includes(p)).slice(0, 3);
  return shuffle([c.prep, ...wrong], rand);
}

// The preposition in a typed or transcribed answer: the word after the adjective, else the only preposition said.
// null when it can't tell (then the learner judges it).
export function heard(text, c) {
  const w = text.toLowerCase().match(/[a-z]+/g) ?? [], i = w.lastIndexOf(c.adj.split(' ').at(-1));
  if (i >= 0 && PREPS.includes(w[i + 1])) return w[i + 1];
  const said = [...new Set(w.filter((x) => PREPS.includes(x)))];
  return said.length === 1 ? said[0] : null;
}

// One answer → the pair's new record: the review record plus {step, wins}. As with review(), only an answer on a
// day the pair is due counts toward moving up; a same-day retry can't. Steps 1–2 come back the next day either way.
export function practise(rec, { grade, hint = false }, day) {
  const step = stepOf(rec), wins = rec?.wins ?? 0;
  if (step === 3) return { ...review(rec, { grade, hint }, day), step, wins: 0 };
  const onTime = !rec?.due || day >= rec.due, ok = grade >= SLOW, w = !ok ? 0 : onTime ? wins + 1 : wins, up = w >= WINS;
  return {
    box: !ok ? 0 : onTime ? 1 : rec.box, n: (rec?.n ?? 0) + 1, last: day, due: ok && !onTime ? rec.due : addDays(day, 1),
    grade, hint, step: step + up, wins: up ? 0 : w,
  };
}

// What the hint button reveals, one at a time (nothing is shown up front; step 1 has its choices instead).
export const hints = (c, step, ex) =>
  step === 1 ? [] : step === 2 ? [['意味', c.ja], ['頭文字', c.prep[0] + '_'.repeat(c.prep.length - 1)]]
  : [['使う形容詞', c.adj], ['使う表現', c.collocation], ['頭文字', skeleton(ex.en)]];

// Other pairs with the same adjective: "happy about（…）/ happy with（…）", for telling them apart.
export const siblings = (c, items) => items.filter((x) => x.kind === 'colloc' && x.adj === c.adj && x !== c);

// The Collocation Drill: every pair, in the order that helps most — due first (longest overdue), then new pairs
// (easy first), then the rest by how long ago they were practiced.
export function drill(items, hist, day) {
  const all = items.filter((c) => c.kind === 'colloc').sort(easyFirst), rec = (c) => hist[c.id];
  const by = (k) => (a, b) => rec(a)[k].localeCompare(rec(b)[k]);
  const due = all.filter((c) => rec(c)?.due <= day).sort(by('due'));
  const rest = all.filter((c) => rec(c) && !(rec(c).due <= day)).sort(by('last'));
  return [...due, ...all.filter((c) => !rec(c)), ...rest];
}

// How far the pairs have come: [not started, step 1, step 2, step 3, settled (step 3, next review a week or more away)],
// in total and per preposition.
export function progress(items, hist) {
  const at = (c) => { const r = hist[c.id]; return !r ? 0 : r.step === 3 && r.box >= 2 ? 4 : stepOf(r); };
  const out = { all: [0, 0, 0, 0, 0] };
  for (const c of items.filter((x) => x.kind === 'colloc')) for (const k of ['all', c.prep]) (out[k] ??= [0, 0, 0, 0, 0])[at(c)]++;
  return out;
}
