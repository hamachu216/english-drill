import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES, DRILLS, slots } from '../core.js';

const read = (f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const levels = FILES.map(read), [patterns, qa, colloc, replies, backchannels] = DRILLS.map(read), files = [...levels, patterns, qa, colloc, replies, backchannels];

test('levels are 1..N in file order', () => assert.deepEqual(levels.map((f) => f.level), levels.map((_, i) => i + 1)));

test('deck and card ids are globally unique and prefixed by their deck', () => {
  const decks = files.flatMap((f) => f.decks);
  const ids = decks.flatMap((d) => d.cards.map((c) => (assert.ok(c.id.startsWith(d.id + '-'), c.id), c.id)));
  assert.equal(new Set(decks.map((d) => d.id)).size, decks.length);
  assert.equal(new Set(ids).size, ids.length);
});

test('every card has ja and en; refs are https links', () => {
  for (const d of files.flatMap((f) => f.decks)) {
    assert.ok(d.title && d.cards.length, d.id);
    for (const r of d.refs ?? []) assert.match(r.url, /^https:\/\//, d.id);
    for (const c of d.cards) assert.ok(c.ja?.trim() && (c.en ?? c.examples?.[0]?.en)?.trim(), c.id);
  }
});

test('the daily grammar decks (Lv1–2) each explain their grammar in one line', () => {
  for (const d of levels.slice(0, 2).flatMap((f) => f.decks)) assert.ok(d.note?.trim(), d.id);
});

test('sentence frames: every card reuses its frame with different content', () => {
  assert.equal(patterns.kind, 'pattern');
  for (const d of patterns.decks) {
    assert.ok(d.frame.includes('...') && d.ja && d.note, d.id);
    assert.ok(d.cards.length >= 6, `${d.id}: enough sentences to practice and to hold two back for the weekly check`);
    for (const c of d.cards) assert.ok(c.en.startsWith(d.frame.split('...')[0].trim()) && slots(d.frame, c.en).every(Boolean) && slots(d.frame, c.en).length, `${c.id}: fits its frame, so its phrases can be shown`);
    assert.equal(new Set(d.cards.map((c) => c.en)).size, d.cards.length, d.id);
  }
});

test('questions: an English question with its meaning, an answer frame, keywords and example answers; follow-ups per topic', () => {
  assert.equal(qa.kind, 'qa');
  for (const d of qa.decks) {
    assert.ok(d.follow.length >= 2 && d.follow.every((f) => f.q && f.ja && f.frame && f.en), d.id);
    for (const c of d.cards) assert.ok(c.q.endsWith('?') && c.frame.includes('...') && c.keys.length >= 2 && c.more?.trim(), c.id);
  }
});

// The stock phrases of the Wordvice handout on research Q&A (typos fixed: rationale, identify; where the handout is
// blunt — "Please speak slowly and clearly.", "I'd rather discuss …" — the cards use politer wording). Each is the answer
// (or the question) of a card that is not held back, so every one of them comes up in the daily practice.
const HANDOUT = [
  "I didn't catch all of that.", 'repeat your question', "I'm afraid I don't understand.",
  'Could you please rephrase the question?', "I don't quite understand.", 'Are you asking about', 'Are you referring to', 'Do you mean',
  'more specific', "I'm sorry. I still don't understand your question.", 'Could I come back to you later?',
  'Could you please talk to me after the session?', "That's a great question. Thank you for asking.",
  'I appreciate your question and am happy to answer it.', "What a thoughtful question! I'm glad you asked.",
  "What an interesting question! I'll do my best to answer.", "I'm sorry. I'm afraid I don't know the answer to that question.",
  'I will look into that and follow up with you.', "I can't answer now, but I will try to find out more about this.",
  "I'm sorry—could we discuss this issue after the session?", 'discuss this issue privately',
  "We aren't aware of any details at this time.", "We don't have information about this yet.", 'We are awaiting further research on this.',
  'We are awaiting further research on this issue.', 'We need to do more studies to answer this.',
  'Please give me a moment to think about this question.', 'Just one moment—I need to consider my answer.', 'Just so I understand',
  'are you referring to the methods of analysis or to the experiment?', 'What information are you referring to exactly?',
  'Which data are you referring to exactly?', 'No, but thank you for your input. We will look into this.',
  'We considered this approach. But there were some problems.', 'There were several reasons for this. First,',
  'We found several other methods to be problematic.', 'We have explained our rationale fully in the paper.',
  "We didn't identify any specific limitations.", 'We did identify a couple of limitations. These include',
  'Yes. What results would you like to know about?', "I'm afraid I can't say more about the findings now.",
  'Most importantly, these findings imply that', 'There are several implications here. First,',
  "I'm afraid I can't say more about the implications now.", 'These results might impact areas of',
  'We need more information to answer this question.', 'Our conclusions are limited to this area of research.',
  'As I mentioned earlier,', "Let's look at this slide again.", 'Yes. Looking at slide', "Let's take a look at this figure again.",
  'As you can see in this', 'Let me explain this figure again.',
  // questions
  'Have you used this approach?', 'Why did you use this method of analysis?', 'What limitations to the study did you identify?',
  'Could you elaborate on the results of', 'What are the implications of these findings?',
  'Could this study impact any other related areas of research?', 'Could you repeat what methods of analysis you used?',
  'Are the data in Figure 4 representative of all sample groups?', 'What is being measured in Table 2.2?',
  'When is the latest version of this study going to be published?', 'Were all sample groups in the study in the same cohort?',
  'What about the data collected between',
];

test('Q&A handling: every phrase of the handout is practiced, each question with the situation it answers', () => {
  assert.equal(replies.kind, 'reply');
  const handling = replies.decks;
  for (const d of handling) {
    assert.ok(d.refs.some((r) => r.url.includes('wordvice')) && d.cards.length >= 6, d.id);
    for (const c of d.cards) assert.ok(c.scene?.trim() && c.q.endsWith('?') && c.frame.includes('...') && /[。？]$/.test(c.ja), c.id);
  }
  const asked = handling.flatMap((d) => d.cards.slice(0, -2)).flatMap((c) => [c.q, c.en]);
  for (const p of HANDOUT) assert.ok(asked.some((t) => t.includes(p)), p);
});

test('backchannels: each function lists its reactions, and every answer opens with one of them', () => {
  assert.equal(backchannels.kind, 'backchannel');
  const stem = (p) => p.replace(/\s*\.\.\.$/, '').replace(/[.!?,]$/, '');
  for (const d of backchannels.decks) {
    assert.ok(d.note && d.basic.length >= 2 && Array.isArray(d.more) && d.cards.length >= 5, d.id);
    for (const c of d.cards) {
      assert.ok(/[.?!]$/.test(c.said) && /[。？）]$/.test(c.ja), c.id);
      assert.ok([...d.basic, ...d.more].some((p) => c.en.startsWith(stem(p))), `${c.id}: opens with a reaction of its function`);
    }
  }
});

test('adjective + preposition: every pair has its fields and at least two sentences in different scenes', () => {
  assert.equal(colloc.kind, 'colloc');
  const PREPS = ['about', 'at', 'by', 'for', 'from', 'in', 'of', 'to', 'with'];
  assert.deepEqual(colloc.decks.map((d) => d.prep), PREPS, 'one deck per preposition, in order');
  const pairs = colloc.decks.flatMap((d) => d.cards), sentences = pairs.flatMap((c) => c.examples);
  assert.equal(new Set(pairs.map((c) => c.collocation)).size, pairs.length, 'each pair once');
  for (const d of colloc.decks) assert.ok(d.note && d.refs.some((r) => r.url.includes('englishclub.com')), d.id);
  for (const c of pairs) {
    assert.ok(c.adj && c.ja && c.note && [1, 2, 3].includes(c.difficulty), c.id);
    assert.equal(c.collocation, `${c.adj} ${c.prep}`, c.id);
    assert.ok(c.examples.length >= 2 && new Set(c.examples.map((e) => e.scene)).size >= 2, `${c.id}: several contexts`);
    for (const e of c.examples) {
      assert.ok(e.id.startsWith(c.id + '-') && e.ja && ['daily', 'lab', 'meeting', 'conference'].includes(e.scene), e.id);
      assert.ok(!e.ja.includes('|'), `${e.id}: the Japanese is the prompt, with no stray marks`);
      assert.match(e.en, new RegExp(`\\b${c.adj} ${c.prep}\\b`, 'i'), `${e.id}: the pair appears as written, so it can be highlighted`);
      assert.ok(!(e.also ?? []).includes(c.prep), e.id);
    }
  }
  assert.equal(new Set(sentences.map((e) => e.id)).size, sentences.length);
  assert.equal(new Set(sentences.map((e) => e.en)).size, sentences.length, 'no sentence twice');
  for (const scene of ['daily', 'lab', 'meeting', 'conference'])
    assert.ok(sentences.filter((e) => e.scene === scene).length >= sentences.length * 0.15, `${scene}: at least 15% of the sentences`);
});

test('adjective + preposition: the pairs that change meaning with the preposition are all there', () => {
  const have = new Set(colloc.decks.flatMap((d) => d.cards.map((c) => c.collocation)));
  for (const pair of ['happy about', 'happy with', 'angry about', 'angry at', 'angry with', 'disappointed at', 'disappointed in',
    'disappointed with', 'surprised at', 'surprised by', 'skilled at', 'skilled in', 'interested in', 'good at', 'satisfied with'])
    assert.ok(have.has(pair), pair);
});
