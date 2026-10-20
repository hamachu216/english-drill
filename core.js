// Pure functions only: state in, new state out. No DOM, no storage.

export const FILES = ['data/1-basic.json', 'data/2-advanced.json', 'data/3-discussion.json', 'data/4-conference.json', 'data/5-defense.json'];

export const addDays = (day, n) => {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Level files → flat card list; each card knows its level, deck title and refs.
export const flattenCards = (files) =>
  files.flatMap((f) => f.decks.flatMap((d) => d.cards.map((c) => ({ ...c, level: f.level, deckTitle: d.title, refs: d.refs }))));

export const ROUND = 10;

export function shuffle(xs, rand = Math.random) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Misses are retried (reshuffled) until none remain; otherwise the next ROUND cards from the pool,
// which is refilled with a fresh shuffle of `all` once used up.
export function nextRound(misses, pool, all, rand) {
  if (misses.length) return { cards: shuffle(misses, rand), pool, retry: true };
  const p = pool.length ? pool : shuffle(all, rand);
  return { cards: p.slice(0, ROUND), pool: p.slice(ROUND), retry: false };
}

// Seconds allowed per card: a fixed number (0 = no limit), or 'auto' = 2s + 0.5s per word of the model answer.
export const timeLimit = (en, limit) => (limit === 'auto' ? Math.round(2 + 0.5 * en.split(/\s+/).length) : limit);

// Consecutive practiced days ending today (or yesterday if today isn't done yet).
export function streak(log, today) {
  let d = log[today] ? today : addDays(today, -1), n = 0;
  for (; log[d]; d = addDays(d, -1)) n++;
  return n;
}

// Last `weeks` full weeks as Sunday-aligned days, oldest first.
export function calendar(today, weeks) {
  const start = addDays(today, -(7 * (weeks - 1) + new Date(today + 'T00:00:00Z').getUTCDay()));
  return Array.from({ length: 7 * weeks }, (_, i) => addDays(start, i)).filter((d) => d <= today);
}

// English voices, best first. Browsers default to the first en-US voice, which on macOS is the
// croaky novelty voice "Albert" (and novelty names are localized, e.g. ささやき声), so keep only
// known-good voices; fall back to any English voice on platforms we don't recognize.
const VOICE_RANK = [
  /natural|neural|premium|enhanced|siri/i,
  /^(Google US English|Samantha|Ava|Allison|Susan|Zoe|Evan|Nathan|Tom|Microsoft (Aria|Jenny|Guy))\b/i,
  /^(Google|Microsoft)/i,
  /^(Daniel|Karen|Moira|Serena|Tessa|Alex)\b/,
];
export function englishVoices(voices) {
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const rank = (v) => VOICE_RANK.findIndex((r) => r.test(v.name));
  const known = en.filter((v) => rank(v) >= 0);
  const score = (v) => rank(v) * 2 + !/^en[-_]US/i.test(v.lang);
  return (known.length ? known : en).sort((a, b) => score(a) - score(b));
}

// Mark which words of the model answer appear (in order) in the user's answer, via word-level LCS.
const norm = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
export function wordDiff(input, model) {
  const a = input.split(/\s+/).map(norm).filter(Boolean);
  const m = model.split(/\s+/).filter(Boolean), b = m.map(norm);
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hit = new Set();
  for (let i = 0, j = 0; i < a.length && j < b.length; )
    if (a[i] === b[j]) hit.add(j++), i++;
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  return m.map((w, k) => ({ w, ok: hit.has(k) }));
}
