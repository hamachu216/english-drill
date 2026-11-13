// Adjective + preposition pairs ("interested in"), as pure functions: which sentence to ask, what to show, and how
// one answer moves a pair along its steps. The pair is what is learned, not a sentence: every time it comes
// up it is asked in a different example sentence.
//
//   step 2 (recall)  type or say the preposition: two right answers, on two due days, in two different sentences
//   step 3 (say)     say the whole sentence from Japanese → the usual review boxes (7, 14, 30, 60 days)
// A wrong answer at any step brings the pair back tomorrow. There is no step 1 any more: choosing from four was
// too easy (the pairs were recognized; recalling them is the work), so records saved at step 1 count as step 2.
import { skeleton } from './core.js';
import { OK, review } from './plan.js';

export const PREPS = ['about', 'at', 'by', 'for', 'from', 'in', 'of', 'to', 'with'];
export const STEPS = { 2: '思い出す', 3: '文で言う' };
const WINS = 2;

export const stepOf = (rec) => Math.max(2, rec?.step ?? 2);
// A different sentence each time the pair comes up (the answer count rotates through them).
export const example = (c, rec) => c.examples[(rec?.n ?? 0) % c.examples.length];
// Prepositions that are right in this sentence: the pair's own, plus any the sentence also allows.
export const accepted = (c, ex) => [c.prep, ...(ex.also ?? [])];
// "She is interested in ML." → "She is interested ___ ML."
export const blank = (c, ex) => ex.en.replace(new RegExp(`\\b(${c.adj}) ${c.prep}\\b`, 'i'), '$1 ___');

// The preposition in a typed or transcribed answer: the word after the adjective, else the only preposition said.
// null when it can't tell (then the learner judges it).
export function heard(text, c) {
  const w = text.toLowerCase().match(/[a-z]+/g) ?? [], i = w.lastIndexOf(c.adj.split(' ').at(-1));
  if (i >= 0 && PREPS.includes(w[i + 1])) return w[i + 1];
  const said = [...new Set(w.filter((x) => PREPS.includes(x)))];
  return said.length === 1 ? said[0] : null;
}

// One answer → the pair's new record: the review record plus {step, wins}. At step 2 the review box stops at 1, so a
// pair said (with or without a hint) is back in 3 days and a miss tomorrow. Only a right answer without a hint on a
// day the pair is due is a win; a same-day retry can't be.
export function practise(rec, grade, day) {
  const step = stepOf(rec), wins = rec?.wins ?? 0;
  if (step === 3) return { ...review(rec, grade, day), step, wins: 0 };
  const onTime = !rec?.due || day >= rec.due, w = grade !== OK ? 0 : onTime ? wins + 1 : wins, up = w >= WINS;
  return { ...review(rec, grade, day, 1), step: step + up, wins: up ? 0 : w };
}

// What the hint button reveals, one at a time (nothing is shown up front).
export const hints = (c, step, ex) =>
  step === 2 ? [['意味', c.ja], ['頭文字', c.prep[0] + '_'.repeat(c.prep.length - 1)]]
  : [['使う形容詞', c.adj], ['使う表現', c.collocation], ['頭文字', skeleton(ex.en)]];

// Other pairs with the same adjective: "happy about（…）/ happy with（…）", for telling them apart.
export const siblings = (c, items) => items.filter((x) => x.kind === 'colloc' && x.adj === c.adj && x !== c);

// How far the pairs have come: [not started, recall, say, settled (step 3, next review a week or more away)],
// in total and per preposition.
export function progress(items, hist) {
  const at = (c) => { const r = hist[c.id]; return !r ? 0 : r.step === 3 && r.box >= 2 ? 3 : stepOf(r) - 1; };
  const out = { all: [0, 0, 0, 0] };
  for (const c of items.filter((x) => x.kind === 'colloc')) for (const k of ['all', c.prep]) (out[k] ??= [0, 0, 0, 0])[at(c)]++;
  return out;
}
