// Pure functions only: state in, new state out. No DOM, no storage.

export const FILES = ['data/1-basic.json', 'data/2-advanced.json', 'data/3-discussion.json', 'data/4-conference.json', 'data/5-defense.json'];

export const addDays = (day, n) => {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Research-English sentence frames, research Q&A, adjective + preposition pairs and the first words of a Q&A reply:
// same deck shape as a level file, tagged with a `kind`.
export const DRILLS = ['data/patterns.json', 'data/qa.json', 'data/collocations.json', 'data/replies.json'];

// Every card of every file, tagged with what the rest needs: its kind, its topic (deck id), the deck itself,
// and whether it is held back for the weekly first-sight check (the last HOLD cards of each deck; none for collocations,
// which are each practiced in several sentences instead).
const HOLD = 2;
export const catalog = (files) =>
  files.flatMap((f) => f.decks.flatMap((d) => d.cards.map((c, nth) => ({
    ...c, kind: f.kind ?? (f.level <= 2 ? 'grammar' : 'phrase'), level: f.level, topic: d.id, deck: d, nth, held: f.kind !== 'colloc' && nth >= d.cards.length - HOLD,
  }))));

// Saved state → current shape. This is also the migration: v1 stored only {log, settings}, so whatever is
// missing gets its default and settings that no longer exist are dropped. Idempotent.
export const DEFAULT = { theme: 'system', level: 1, limit: 10, voice: '', minutes: 30, listen: true };
export const restore = (s) => ({
  log: s?.log ?? {}, hist: s?.hist ?? {}, days: s?.days ?? {}, answers: s?.answers ?? {}, session: s?.session ?? null,
  settings: Object.fromEntries(Object.entries(DEFAULT).map(([k, v]) => [k, s?.settings?.[k] ?? v])),
});

// A backup file is saved state: an object whose records, where present, are plain objects, with a log or a history.
const record = (x) => x == null || (typeof x === 'object' && !Array.isArray(x));
export const isBackup = (s) => record(s) && s != null && (s.log != null || s.hist != null) && ['log', 'hist', 'days', 'answers', 'settings'].every((k) => record(s[k]));

// Deterministic random numbers from a string (FNV-1a seed → mulberry32): the same day plans the same session.
export function seeded(text) {
  let a = [...text].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hints that cue a sentence without giving it away.
// skeleton: first letters only ("I am a student." → "I a_ a s______."); opening: the first two words;
// mask: every second word of a frame blanked ("We chose this method because ..." → "We _____ this ______ because ...").
export const skeleton = (en) => en.replace(/[A-Za-z][A-Za-z']*/g, (w) => w[0] + '_'.repeat(w.length - 1));
export const opening = (en) => en.split(/\s+/).slice(0, 2).join(' ') + ' …';
export const mask = (frame) => { let i = 0; return frame.replace(/[A-Za-z']+/g, (w) => (i++ % 2 ? '_'.repeat(w.length) : w)); };
// slots: what a sentence puts into its frame's "..." — the phrases to learn
// ("We used ... to ...", "We used an accelerometer to measure movement." → ["an accelerometer", "measure movement"]).
export const literal = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const slots = (frame, en) => en.match(new RegExp(`^${frame.split('...').map(literal).join('(.+?)')}[.?!]?$`, 'i'))?.slice(1).map((s) => s.trim()) ?? [];

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

// An answer counts as attempted only once it has English letters: no peeking at the answer without trying.
export const hasEnglish = (text) => /[a-z]/i.test(text);

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
