// Pure functions only: state in, new state out. No DOM, no storage.

export const FILES = ['data/1-basic.json', 'data/2-advanced.json', 'data/3-discussion.json', 'data/4-conference.json', 'data/5-defense.json'];

export const addDays = (day, n) => {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Level files → flat card list; each card knows its level and deck.
export const flattenCards = (files) =>
  files.flatMap((f) => f.decks.flatMap((d) => d.cards.map((c) => ({ ...c, level: f.level, deck: d.id, deckTitle: d.title, refs: d.refs }))));

// Simplified SM-2. grade: 0 Again, 1 Hard, 2 Good, 3 Easy.
const EASE_DELTA = [-0.2, -0.15, 0, 0.15];
const NEXT_IVL = [
  () => 1,
  (i) => Math.max(1, Math.round(i * 1.2)),
  (i, e) => (i ? Math.max(i + 1, Math.round(i * e)) : 1),
  (i, e) => (i ? Math.max(i + 2, Math.round(i * e * 1.3)) : 3),
];

export function schedule({ ivl = 0, ease = 2.5 } = {}, grade, today) {
  const e = Math.max(1.3, ease + EASE_DELTA[grade]);
  const next = NEXT_IVL[grade](ivl, e);
  return { ivl: next, ease: +e.toFixed(2), due: addDays(today, next) };
}

export const answer = (state, id, grade, today) => ({
  ...state,
  cards: { ...state.cards, [id]: schedule(state.cards[id], grade, today) },
  log: { ...state.log, [today]: (state.log[today] || 0) + 1 },
});

// Due reviews (oldest first), then up to newPerDay unseen cards, round-robin across levels.
export function buildSession(cards, { cards: seen, settings }, today) {
  const picked = cards.filter((c) => settings.decks.includes(c.deck));
  const due = picked.filter((c) => seen[c.id]?.due <= today).sort((a, b) => seen[a.id].due.localeCompare(seen[b.id].due));
  const byLevel = Object.values(Object.groupBy(picked.filter((c) => !seen[c.id]), (c) => c.level));
  const fresh = [];
  for (let i = 0; fresh.length < settings.newPerDay && byLevel.some((l) => i < l.length); i++)
    for (const l of byLevel) if (i < l.length && fresh.length < settings.newPerDay) fresh.push(l[i]);
  return [...due, ...fresh];
}

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
