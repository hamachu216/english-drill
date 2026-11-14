// Adjective + preposition pairs ("interested in"), as pure functions: which sentence to ask and what to show.
// The pair is what is learned, not a sentence: it is said as a whole English sentence from Japanese, in a different
// example every time it comes up, with the adjective given (the preposition is what goes wrong, and Japanese alone
// doesn't say which adjective is wanted). Its record is the usual review(). (Records saved when a pair was first
// recalled as a lone preposition carry {step, wins}; nothing reads them any more.)
import { skeleton } from './core.js';

// A different sentence each time the pair comes up (the answer count rotates through them).
export const example = (c, rec) => c.examples[(rec?.n ?? 0) % c.examples.length];

// The sentence before that one: what is shown to listen to and repeat before the pair is asked.
export const previous = (c, rec) => c.examples.at(((rec?.n ?? 0) - 1) % c.examples.length);

// The one hint: the first letters of the sentence (naming the pair would give the answer away).
export const hints = (ex) => [['頭文字', skeleton(ex.en)]];

// Other pairs with the same adjective: "happy about（…）/ happy with（…）", for telling them apart.
export const siblings = (c, items) => items.filter((x) => x.kind === 'colloc' && x.adj === c.adj && x !== c);
