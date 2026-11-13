import { FILES, DRILLS, ROUND, catalog, restore, isBackup, seeded, nextRound, streak, calendar, timeLimit, wordDiff, englishVoices, hasEnglish, slots, literal } from './core.js';
import { MISS, HINT, OK, GRADE, review, byNeed, progress, tally, requeue, scaffold, choices, planSession, mix, overview, weekly } from './plan.js';
import { example, hints as pairHints, siblings } from './colloc.js';

const KEY = 'eng:v1';
const $ = (id) => document.getElementById(id);
const today = () => new Date().toLocaleDateString('sv'); // local YYYY-MM-DD
const files = await Promise.all([...FILES, ...DRILLS].map((f) => fetch(f).then((r) => r.json())));
const levels = files.filter((f) => f.level);
const cards = catalog(files), byId = new Map(cards.map((c) => [c.id, c]));
const topicTitle = Object.fromEntries(cards.map((c) => [c.topic, c.deck.title]));

// ---- state: settings, answers per day, one record per card, counters per day, today's session, own Q&A answers.
// Shape and migration live in core.js (restore); the learning rules in plan.js.
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
let state = restore(load());
const save = (patch) => { state = { ...state, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
const setSettings = (patch) => { save({ settings: { ...state.settings, ...patch } }); renderHome(); };

// ---- theme
const THEMES = { system: '◐ 自動', light: '☀ ライト', dark: '☾ ダーク' };
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  $('theme').textContent = THEMES[t];
}
$('theme').onclick = () => {
  const keys = Object.keys(THEMES);
  setSettings({ theme: keys[(keys.indexOf(state.settings.theme) + 1) % keys.length] });
  applyTheme();
};

// ---- home
// DOM is only ever built from nodes (never HTML strings), so data can't inject markup.
const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const LEVEL_ICONS = ['📘', '🚀', '💬', '🎤', '🎓'];
const PHASE = {
  review: ['🔁', '前回の苦手を復習'], grammar: ['📘', '基礎文法'], pattern: ['🧩', '研究英語の構文'],
  reply: ['🗣', '質疑応答の切り返し'], qa: ['💬', 'Research Q&A'], impromptu: ['⚡', '即興 Q&A'], check: ['📝', '週1回の初見チェック'],
};
const QA_LEVEL = ['Beginner', 'Intermediate', 'Advanced'];

// Today's session if there is one (finished or not). A session from another day, or one whose cards are gone, is ignored.
const session = () => (state.session?.day === today() && state.session.queue.every((s) => byId.has(s.id)) ? state.session : null);
const left = (s) => s.queue.length - s.idx;
// Seeded by the date, so the menu shown on the home screen is exactly the session that starts.
const plan = (minutes, salt = '') => planSession({ items: cards, hist: state.hist, days: state.days, day: today(), minutes, rand: seeded(today() + salt) });
const fresh = (minutes, salt) => ({ day: today(), queue: plan(minutes, salt), idx: 0, grades: [] });

const menuRows = (queue) => Object.entries(PHASE).flatMap(([phase, [icon, name]]) => {
  const steps = queue.filter((s) => s.phase === phase), asked = steps.filter((s) => !s.intro && s.follow == null);
  const count = asked.reduce((n, s) => n.set(byId.get(s.id).deck.title, (n.get(byId.get(s.id).deck.title) ?? 0) + 1), new Map());
  const frames = steps.filter((s) => s.intro).map((s) => byId.get(s.id).deck.frame);
  const detail = frames.length ? `新しい型: ${frames.join(' / ')}`
    : phase === 'grammar' || phase === 'pattern' ? [...count].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t).join('・') : '';
  return asked.length ? [el('li', {},
    el('span', { className: 'icon', textContent: icon }),
    el('span', {}, el('b', { textContent: name }), el('span', { className: 'sub', textContent: detail })),
    el('span', { className: 'pill', textContent: `${asked.length}問` }))] : [];
});

// The Phrase Drill: adjective + preposition pairs and backchannels, mixed, outside the daily session.
const drill = (c) => c.kind === 'colloc' || c.kind === 'backchannel';
const drillCards = cards.filter(drill), replyCount = cards.filter((c) => c.kind === 'reply').length;
const stepLine = ([, practising, settled]) => `練習中 ${practising} ・ 定着 ${settled}`;
const sum = (...xs) => xs.reduce((a, b = []) => a.map((v, i) => v + (b[i] ?? 0)), [0, 0]);
const tenths = ([n = 0, said = 0] = []) => (n < 5 ? '—' : `${Math.round((said / n) * 10)}割`);
const pair = (k, v) => [el('dt', { textContent: k }), el('dd', { textContent: v })];

function renderHome() {
  const d = today(), s = session(), done = s && !left(s), { minutes, level } = state.settings;
  const queue = s ? s.queue : plan(minutes);
  const hour = new Date().getHours();
  $('greet').textContent = hour < 5 || hour >= 18 ? 'Good evening 🌙' : hour < 11 ? 'Good morning ☀️' : 'Good afternoon 🌤';
  $('streak').textContent = streak(state.log, d);
  $('today').textContent = s ? s.idx : 0;
  $('goal-of').textContent = `/ ${queue.length}`;
  $('ring').style.setProperty('--p', s && queue.length ? (s.idx / queue.length) * 100 : 0);
  $('goal-label').textContent = done ? '🎉 今日の練習は完了！' : s ? `あと${left(s)}問で今日は完了` : '';
  $('menu-time').textContent = done ? '' : s ? `残り${left(s)}問` : `約${minutes}分`;
  $('menu').replaceChildren(...(done
    ? [el('li', { className: 'muted', textContent: '今日のメニューは終わりました。明日は今日の結果をもとに、新しいメニューが自動で用意されます。' })]
    : menuRows(queue.slice(s?.idx ?? 0))));
  const share = mix(state.days, cards, d).grammar;
  $('mix').textContent = done ? '' : share > 0.55 ? '最近の結果から、基礎文法を多めにしています。' : share < 0.45 ? '基礎が安定してきたので、研究英語を多めにしています。' : '';
  $('start').textContent = done ? '＋ もう少し練習する（約5分）' : s ? '▶ 続きから再開する' : '▶ 今日の練習を始める';
  $('short').hidden = !!s;

  const o = overview(cards, state.hist, d), pr = progress(drillCards, state.hist);
  $('status').replaceChildren(
    ...pair('復習待ち', `${o.due}問`),
    ...pair('苦手な文法', o.weak.length ? o.weak.slice(0, 3).map((t) => topicTitle[t]).join('・') : 'なし'),
    ...pair('得意な文法', o.known.length ? o.known.map((t) => topicTitle[t]).join('・') : 'なし'),
    ...pair('構文', `言える ${o.frames[2]} ・ 練習中 ${o.frames[0] + o.frames[1]} ／ ${o.framesTotal}`),
    ...pair('切り返し', `書き取れる ${o.reply[2]} ・ 練習中 ${o.reply[0] + o.reply[1]} ／ ${replyCount}`),
    ...pair('Q&A', QA_LEVEL.map((name, i) => `${name} ${o.qa[i]}`).join(' ・ ')),
    ...pair('即興Q&A', o.unlock ? `あと${o.unlock}問で解放` : '出題中'),
    ...pair('フレーズ', `${stepLine(pr)} ／ ${drillCards.length}`));
  const wrong = drillCards.filter((c) => state.hist[c.id]?.box === 0).length;
  $('cd-summary').textContent = `未学習 ${pr[0]} ・ ${stepLine(pr)}${wrong ? ` ・ ✕ 前回間違えた ${wrong}（次の「始める」で最初に出ます）` : ''}`;
  // This week, plus earlier weeks that have something to show.
  $('weekly').tBodies[0].replaceChildren(...weekly(state.days, cards, d).filter((w, i) => !i || Object.keys(w.kinds).length).flatMap((w) => {
    const [, m, dd] = w.from.split('-').map(Number), qa = w.kinds.qa;
    const notes = [
      w.weak.length && `苦手: ${w.weak.map((t) => topicTitle[t]).join('・')}`,
      w.why && `Q&Aのつまずき: 内容 ${w.why[0]}・英文 ${w.why[1]}`,
    ].filter(Boolean);
    return [
      el('tr', {}, ...[`${m}/${dd}〜`, tenths(w.kinds.grammar), tenths(sum(w.kinds.colloc, w.kinds.backchannel)), tenths(w.kinds.pattern), qa ? `${qa[1]}問` : '—', w.check ? `${w.check[1]}/${w.check[0]}` : '—'].map((t) => el('td', { textContent: t }))),
      ...(notes.length ? [el('tr', { className: 'weak' }, el('td', { colSpan: 6, textContent: notes.join(' ／ ') }))] : []),
    ];
  }));

  $('heatmap').replaceChildren(...calendar(d, 12).map((day) => {
    const n = state.log[day] || 0, cell = el('i', { title: `${day}: ${n}問` });
    cell.dataset.l = Math.min(3, Math.ceil(n / 15));
    return cell;
  }));
  // Lv1 and Lv2 are one set, mixed as in the daily session; Lv3–5 (free practice only) one set each.
  const sets = [{ level: 1, name: '基礎文法（Lv1〜2）', decks: levels.slice(0, 2).flatMap((f) => f.decks) }, ...levels.slice(2).map((f) => ({ level: f.level, name: `Lv${f.level} ${f.title}`, decks: f.decks }))];
  $('levels').replaceChildren(...sets.map((f) => {
    const label = el('label', { className: 'level' },
      el('input', { type: 'radio', name: 'level', value: f.level, checked: f.level === (level <= 2 ? 1 : level) }),
      el('span', { className: 'icon', textContent: LEVEL_ICONS[f.level - 1] }),
      el('span', {},
        el('span', { className: 'name', textContent: f.name }),
        el('span', { className: 'sub', textContent: `${f.decks.length}トピック · ${f.decks.reduce((n, d) => n + d.cards.length, 0)}問` })),
      el('span', { className: 'check', textContent: '✓' }));
    label.style.setProperty('--lv', `var(--lv${f.level})`);
    return label;
  }));
  $('minutes').value = minutes;
  $('listen-on').checked = state.settings.listen;
  $('limit').value = state.settings.limit;
}

$('levels').onchange = (e) => { pool = []; setSettings({ level: +e.target.value }); };
$('minutes').onchange = () => setSettings({ minutes: +$('minutes').value });
$('listen-on').onchange = () => setSettings({ listen: $('listen-on').checked });
$('limit').onchange = () => setSettings({ limit: $('limit').value === 'auto' ? 'auto' : +$('limit').value });

const refLink = ({ name, url }) => el('a', { href: url, textContent: name, target: '_blank', rel: 'noreferrer' });
// One entry per site: "EAP Foundation: Clarifying" → "EAP Foundation".
const siteName = (r) => r.name.split(':')[0];
const sites = new Map(files.flatMap((f) => f.decks.flatMap((d) => d.refs ?? [])).map((r) => [siteName(r), r.url]));
$('refs').replaceChildren(...[...sites].map(([name, url]) => el('li', {}, refLink({ name, url }))));

// ---- study: one screen per step of `run.queue`.
// A daily run is {day, queue, idx, grades} and is saved after every answer, so it survives quitting and reloading.
// A free run (one level, rounds of ROUND, misses repeated until none remain) adds {free, retry} and is never saved.
let run = null, now = null, pool = [], answered = 0, timer = 0;
const VIEWS = ['home', 'study', 'result'];
const show = (view) => { for (const v of VIEWS) $(v).hidden = v !== view; scrollTo(0, 0); };
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pop = (node) => calm || node.animate([{ opacity: 0, transform: 'translateY(10px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
const persist = () => run.free || save({ session: run });
const isTalk = () => now.cur.kind === 'qa'; // a research question, answered in your own words
const SAY = $('input').placeholder;
const hintRow = ([label, text]) => pair(label, text);

function begin(r) {
  keep();
  answered = 0;
  $('flash').textContent = r.queue.length ? '' : '今日はもう出せる問題がありません。また明日！';
  if (!r.queue.length) return;
  run = r;
  persist();
  if (left(run)) { show('study'); showStep(); } else showResult();
}

// Free practice: rounds of ROUND from a set — all the grammar (Lv1–2), Lv3–5, or the Phrase Drill's cards —
// in the order that helps most (wrong last time, due, new, then the rest).
const levelCards = () => cards.filter((c) => (state.settings.level <= 2 ? c.kind === 'grammar' : c.level === state.settings.level));
const phraseCards = () => drillCards;
let freeList = levelCards;
function playFree(missed = []) {
  const r = nextRound(missed, pool, byNeed(freeList(), state.hist, today()));
  pool = r.pool;
  begin({ free: true, retry: r.retry, queue: r.cards.map((c) => ({ id: c.id, phase: 'free' })), idx: 0, grades: [] });
}

const TALK_GUIDE = ['まずは1文で。時間は気にしなくてOK', 'キーワードを使って、1〜2文で', 'ヒントなしで、2〜3文で'];
function showStep() {
  const step = run.queue[run.idx], cur = byId.get(step.id), rec = state.hist[cur.id];
  // An adjective + preposition pair is said in an example sentence it hasn't just had (`ex` is set for pairs only).
  const ex = cur.kind === 'colloc' ? example(cur, rec) : null;
  const { shown, hints } = ex ? { shown: [], hints: pairHints(cur, ex) } : scaffold(cur, step);
  // A Q&A reply is dictation: the stock phrase is read aloud and written down, with the asker's question as the prompt.
  // A backchannel answers what someone just said (`cur.said`, read aloud) with a short reaction and one more sentence.
  const dictate = cur.kind === 'reply', back = cur.kind === 'backchannel', ask = cur.deck.follow?.[step.follow] ?? cur;
  now = { step, cur, ask, pending: [...hints], hinted: false, model: '', said: '', ex, dictate, audio: step.intro || dictate ? cur.en : back ? cur.said : ask.q }; // audio: what 🔊 reads
  const talk = isTalk(), [icon, name] = PHASE[step.phase] ?? [];
  // Free practice keeps its timer setting (not the Collocation Drill: composing a sentence takes its time);
  // an Intermediate question gets a gentle 45s bar that never cuts you off.
  const sec = run.free && !drill(cur) ? timeLimit(cur.en, state.settings.limit) : talk && step.level === 1 && !step.retry ? 45 : 0;
  $('study').style.setProperty('--lv', `var(--lv${cur.level ?? (cur.q ? 4 : drill(cur) ? 5 : 3)})`);
  $('track').textContent = [
    step.retry && '🔁 もう一度',
    run.free ? `${run.retry ? '🔁 復習 · ' : ''}${drill(cur) ? 'Phrase Drill' : `Lv${cur.level}`}` : `${icon} ${name}`,
    !ex && cur.deck.title, // a pair's deck is its preposition: the answer
    step.follow != null ? '追加質問' : step.intro ? '新しい型' : talk && !step.check && step.phase !== 'impromptu' && QA_LEVEL[step.retry ? 0 : step.level],
  ].filter(Boolean).join(' · ');
  $('count').textContent = `${run.idx + 1} / ${run.queue.length}${sec ? ` · ⏱${sec}秒` : ''}`;
  $('dots').className = run.queue.length > 20 ? 'dots many' : 'dots';
  $('dots').replaceChildren(...run.queue.map((_, i) => el('i', { className: i === run.idx ? 'now' : run.grades[i] >= OK ? 'ok' : run.grades[i] != null ? 'ng' : i < run.idx ? 'seen' : '' })));
  pop($('qcard'));
  $('prompt').textContent = step.intro ? cur.deck.frame : talk || dictate ? now.ask.q : back ? cur.said : (ex ?? cur).ja;
  $('sub').textContent = step.intro ? `${cur.deck.ja}　例文を聞いて、まねして声に出そう`
    : ex ? '形容詞＋前置詞を使って、英文全体を声に出そう'
    : dictate ? `場面：${cur.scene}　🔊 流れる返事を聞いて、書き取ろう`
    : back ? '🔊 相手のひと言に、相槌＋ひと言で返そう'
    : step.check ? '初見チェック：ヒントなしで、どこまで言えるか試そう'
    : !talk ? ''
    : step.follow != null ? '追加の質問です。1文でいいので、続けて答えよう'
    : step.retry ? '型を見ながら、もう一度声に出そう'
    : step.phase === 'impromptu' ? '初めての質問です。まず1文、言えたら2〜3文' : TALK_GUIDE[step.level];
  $('hints').replaceChildren(...(step.intro
    ? [...pair('ポイント', cur.deck.note), el('dt', { textContent: '例文' }), el('dd', { className: 'en' }, ...mark(cur.en, phrases(cur))), ...pair('意味', cur.ja)]
    : shown.flatMap(hintRow)));
  $('listen').hidden = !canSpeak || !now.audio;
  $('input').hidden = $('hint').hidden = !!step.intro;
  $('mic').hidden = !!step.intro || dictate || !canHear;
  $('input').placeholder = dictate ? '聞こえた英文を入力しよう' : SAY;
  $('unknown').hidden = !!step.intro;
  $('input').value = '';
  $('hint').disabled = !hints.length;
  $('playback').hidden = true;
  $('reveal').textContent = step.intro ? 'まねして言えた、次へ →' : '✓ 回答した';
  $('answer').hidden = true;
  $('reveal').hidden = false;
  startTimer(sec, run.free && !drill(cur));
  if (now.audio && (dictate || back || state.settings.listen)) speak(now.audio);
}

// The bar drains via a CSS animation (turning red near the end); in free practice one timeout reveals the answer.
function startTimer(sec, forced) {
  clearTimeout(timer);
  const bar = $('timer');
  $('timer-track').hidden = !sec;
  if (!sec) return;
  bar.style.animation = 'none';
  bar.getBoundingClientRect(); // restart the animation
  bar.style.animation = `drain ${sec}s linear forwards`;
  if (forced) timer = setTimeout(() => reveal(true), sec * 1000);
}

const LABEL = {
  miss: '✕ 言えなかった', content: '✕ 内容が浮かばなかった', english: '✕ 英文にできなかった', hint: '💡 ヒントで言えた',
  ok: ['○ 言えた', '○ 答えられた'],
};
const WROTE = { miss: '✕ 書き取れなかった', hint: '💡 ヒントで書き取れた', ok: '○ 書き取れた' }; // the same choices, for dictation

// The phrases to learn, highlighted in the sentence: an adjective + preposition pair, or what fills a frame.
const mark = (en, parts) => parts.reduce((nodes, p) => nodes.flatMap((n) => {
  const m = typeof n === 'string' && p && n.match(new RegExp(`(?<![A-Za-z])${literal(p)}(?![A-Za-z])`, 'i'));
  return m ? [n.slice(0, m.index), el('mark', { textContent: m[0] }), n.slice(m.index + m[0].length)] : [n];
}), [en]);
const phrases = (c) => (c.kind === 'colloc' ? [c.collocation] : c.kind === 'pattern' ? slots(c.deck.frame, c.en)
  : c.kind === 'backchannel' ? [...c.deck.basic, ...c.deck.more].map((p) => p.replace('...', '').trim()) : []);

function reveal(timedOut = false) {
  clearTimeout(timer);
  stopMic();
  $('timer').style.animationPlayState = 'paused'; // freeze: shows time left
  const { cur, ask, step } = now, talk = isTalk(), typed = $('input').value.trim();
  now.said = typed || now.said;
  const { ex } = now;
  now.model = ex ? ex.en : talk && step.level === 2 && !step.retry && ask.more ? `${ask.en} ${ask.more}` : ask.en;
  $('timeout').hidden = !timedOut;
  $('model-label').textContent = talk ? '回答例（あくまで一例）' : '';
  // Accuracy practice compares your words with the model; fluency practice (Q&A) never marks your English.
  const compare = typed && !talk;
  $('en').replaceChildren(...(compare ? wordDiff(typed, now.model).flatMap(({ w, ok }) => [el('span', { className: ok ? 'hit' : 'miss', textContent: w }), ' ']) : mark(now.model, phrases(cur))));
  $('en').className = compare ? 'en diff' : 'en';
  $('note').textContent = talk ? '' : cur.deck.basic ? `基本：${cur.deck.basic.join(' / ')}${cur.deck.more.length ? `　ほかに：${cur.deck.more.join(' / ')}` : ''}` : cur.note ?? '';
  $('tip').textContent = ask.frame ? `答え方の型：${ask.frame}` : cur.deck.note ? `${cur.deck.frame ?? cur.deck.title}：${cur.deck.note}` : '';
  $('mine').textContent = talk && step.follow == null && state.answers[cur.id] ? `前回のあなたの回答：${state.answers[cur.id]}` : '';
  if (ex) {
    $('note').textContent = `${cur.collocation} ＝ ${cur.ja}`;
    $('tip').textContent = cur.note;
  }
  const sibs = ex ? siblings(cur, cards) : [];
  $('caveat').textContent = talk ? 'まず伝わることが大事。自分の研究の内容で1文でも言えればOKで、文法の細かい正しさは気にしなくて大丈夫です。' : [
    ex?.also && `この文では ${ex.also.join(' / ')} も使えます。`,
    sibs.length && `同じ形容詞の別の組み合わせ：${sibs.map((s) => `${s.collocation}（${s.ja}）`).join(' ／ ')}`,
    now.dictate ? `${compare ? '緑＝書き取れた語。' : ''}黒い語は聞き取れなかったところ。🔊 でもう一度聞いてみよう。`
      : `${compare ? '緑＝あなたの回答にもあった語（文字起こしは不正確なこともあります）。' : ''}模範解答と違う言い方でも、意味と文法が合っていれば正解です。`,
  ].filter(Boolean).join('\n');
  $('card-refs').replaceChildren(...(cur.deck.refs?.length ? ['参考: ', ...cur.deck.refs.flatMap((r, i) => (i ? [' / ', refLink(r)] : [refLink(r)]))] : []));
  // "I don't know" is a miss, with nothing to judge. "Answer again" keeps the first attempt's hint use and so its choices.
  const verdict = now.gaveUp && !talk ? '✕ わからなかった — 次へ' : null;
  const keys = now.gaveUp ? (talk ? ['content', 'english'] : ['miss']) : choices(talk, now.hinted);
  $('judge').replaceChildren(...keys.map((key) =>
    el('button', { className: key, onclick: () => grade(key), textContent: verdict ?? (now.dictate ? WROTE[key] : key === 'ok' ? LABEL.ok[+talk] : LABEL[key]) })));
  $('judge-label').hidden = verdict != null;
  $('again').hidden = !talk;
  $('answer').hidden = false;
  $('reveal').hidden = $('unknown').hidden = true;
  pop($('answer'));
  $('answer').scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
  document.activeElement.blur();
}

function grade(key) {
  const d = today(), { cur, step, said } = now, talk = isTalk(), g = GRADE[key], before = state.hist[cur.id];
  const after = review(before, g, d);
  save({
    log: { ...state.log, [d]: (state.log[d] || 0) + 1 },
    // A follow-up question is practice only; a retry updates the card (it can't raise it) but isn't counted again.
    hist: step.follow == null ? { ...state.hist, [cur.id]: after } : state.hist,
    days: step.retry ? state.days : { ...state.days, [d]: tally(state.days[d], cur, { grade: g, why: key, check: step.check }) },
    answers: talk && step.follow == null && hasEnglish(said) ? { ...state.answers, [cur.id]: said } : state.answers,
  });
  answered++;
  run.grades[run.idx] = g;
  if (!run.free) run.queue = requeue(run.queue, run.idx, g, cur.kind);
  advance();
}

function advance() {
  run.idx++;
  persist();
  if (left(run)) showStep();
  else showResult();
}

const CONFETTI = ['--accent', '--accent-2', '--lv1', '--lv2', '--lv3', '--lv5'];
function confetti() {
  if (calm) return;
  for (let i = 0; i < 40; i++) {
    const c = el('i', { className: 'confetti' });
    Object.assign(c.style, { left: `${Math.random() * 100}vw`, background: `var(${CONFETTI[i % CONFETTI.length]})`, animationDelay: `${Math.random() * 0.4}s` });
    document.body.append(c);
    setTimeout(() => c.remove(), 2200);
  }
}

function showResult() {
  const firsts = run.queue.map((s, i) => [s, run.grades[i]]).filter(([s, g]) => g != null && !s.retry);
  const n = firsts.length, count = (g) => firsts.filter(([, x]) => x === g).length, ok = firsts.filter(([, g]) => g >= OK).length, rate = n ? ok / n : 1;
  run.missed = [...new Set(firsts.filter(([, g]) => g === MISS).map(([s]) => byId.get(s.id)))];
  const wrong = run.missed.length;
  show('result');
  $('result-emoji').textContent = !wrong ? '🎉' : rate >= 0.7 ? '👍' : '💪';
  $('result-score').textContent = `${ok}/${n}`;
  $('result-ring').style.setProperty('--p', rate * 100);
  $('result-title').textContent = run.free ? (!wrong ? (run.retry ? '全部言えた！' : 'パーフェクト！') : rate >= 0.7 ? 'いい調子！' : 'ここから伸びる！') : '今日の練習、完了！';
  $('result-sub').textContent = `${LABEL.ok[0]} ${ok} ・ ${LABEL.hint} ${count(HINT)} ・ ${LABEL.miss} ${count(MISS)}`;
  $('result-next').textContent = run.free ? (wrong ? `言えなかった${wrong}問を、言えるまで繰り返そう` : `次の${ROUND}問に進もう`)
    : wrong ? '言えなかった問題は、明日のメニューの最初にもう一度出ます。' : '明日は今日の結果をもとに、新しいメニューが用意されます。';
  $('miss-head').textContent = run.free ? 'もう一度チャレンジする問題' : '明日もう一度出る問題';
  $('miss-head').hidden = !wrong;
  pop($('result'));
  if (!wrong || !run.free) confetti();
  $('result-list').replaceChildren(...run.missed.map((c) =>
    el('li', { className: 'card' }, el('p', { className: 'muted', textContent: c.ja ?? '' }), el('p', { className: 'en', textContent: (c.kind === 'qa' ? c.q : c.en) ?? c.collocation }))));
  $('next-round').textContent = !run.free ? '＋ もう少し続ける（約5分）' : wrong ? `🔁 言えなかった${wrong}問にもう一度挑戦` : `次の${ROUND}問へ →`;
}

function finish() {
  clearTimeout(timer);
  stopMic();
  if (canSpeak) speechSynthesis.cancel();
  show('home');
  renderHome();
  $('flash').textContent = answered ? `お疲れさまでした！ ${answered}問 回答・${streak(state.log, today())}日連続` : '';
}

// The one button: start today's session, resume it, or — once it is done — add about five more minutes.
const more = () => begin(fresh(5, `+${state.log[today()] || 0}`));
$('start').onclick = () => { const s = session(); if (!s) begin(fresh(state.settings.minutes)); else if (left(s)) begin(s); else more(); };
$('short').onclick = () => begin(fresh(10));
$('free').onclick = () => { if (freeList !== levelCards) { freeList = levelCards; pool = []; } playFree(); };
$('next-round').onclick = () => (run.free ? playFree(run.missed) : more());
$('cd-start').onclick = () => { if (freeList !== phraseCards) { freeList = phraseCards; pool = []; } playFree(); };
$('quit').onclick = $('home-btn').onclick = finish;
// The hint button stays enabled while hints are left; it does nothing once the answer is out.
$('hint').onclick = () => {
  if (!$('answer').hidden) return;
  now.hinted = true;
  $('hints').append(...hintRow(now.pending.shift()));
  $('hint').disabled = !now.pending.length;
};
$('unknown').onclick = () => { now.gaveUp = true; reveal(); };
$('reveal').onclick = () => (now.step.intro ? advance() : reveal());
// Say it once more after seeing the example. The self-evaluation still describes the first attempt.
$('again').onclick = () => {
  $('answer').hidden = true;
  $('reveal').hidden = false;
  $('input').value = '';
  if (state.settings.listen) speak(now.ask.q);
};

// ---- speech: read English aloud with a natural voice; speak your answer into the mic.
const canSpeak = 'speechSynthesis' in window;
let voices = [];
function speak(text) {
  if (!canSpeak) return;
  const v = voices.find((x) => x.name === state.settings.voice) || voices[0];
  speechSynthesis.cancel();
  speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text.replaceAll('...', ',')), { voice: v ?? null, lang: v?.lang ?? 'en-US', rate: 0.95 }));
}
function renderVoices() {
  voices = englishVoices(speechSynthesis.getVoices());
  $('voice').replaceChildren(
    el('option', { value: '', textContent: `自動（${voices[0]?.name ?? '既定'}）` }),
    ...voices.map((v) => el('option', { value: v.name, textContent: `${v.name} · ${v.lang}` })),
  );
  $('voice').value = voices.some((v) => v.name === state.settings.voice) ? state.settings.voice : '';
}
if (canSpeak) {
  $('speak').onclick = () => speak(now.model);
  $('listen').onclick = () => speak(now.audio);
  $('voice').onchange = () => { setSettings({ voice: $('voice').value }); speak('Thank you for your question. That is a great point.'); };
  speechSynthesis.onvoiceschanged = renderVoices;
  renderVoices();
} else $('speak').hidden = $('voice-row').hidden = true;

// The mic transcribes where the browser can (the transcript is shown, never judged); elsewhere it records,
// and the recording can be played back next to the model answer. Without either, you just speak and tap.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const canHear = !!(Recognition || (navigator.mediaDevices?.getUserMedia && window.MediaRecorder));
let stopMic = () => {};
const micOff = () => { $('mic').classList.remove('on'); stopMic = () => {}; };
function transcribe() {
  const r = Object.assign(new Recognition(), { lang: 'en-US', interimResults: true, continuous: true });
  r.onresult = (e) => { $('input').value = [...e.results].map((x) => x[0].transcript).join(''); };
  r.onend = micOff;
  stopMic = () => r.stop();
  r.start();
}
async function record() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), rec = new MediaRecorder(stream), chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    for (const t of stream.getTracks()) t.stop();
    URL.revokeObjectURL($('playback').src);
    $('playback').src = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
    $('playback').hidden = false;
    micOff();
  };
  stopMic = () => rec.stop();
  rec.start();
}
$('mic').onclick = async () => {
  if ($('mic').classList.contains('on')) return stopMic();
  $('mic').classList.add('on');
  try { await (Recognition ? transcribe() : record()); } catch { micOff(); }
};

// ---- keeping the record: ask the browser not to evict it, and back it up to / restore it from a file.
// persist() is asked on a tap that starts practice: Firefox shows a prompt, others decide by site engagement.
async function showKept() {
  const kept = await navigator.storage?.persisted?.();
  $('kept').textContent = kept == null ? '' : kept ? '✓ このブラウザは記録を自動では消さない設定になっています。' : 'ブラウザの空き容量が少ないと、記録が自動で消されることがあります。ときどき書き出しておくと安心です。';
}
const keep = async () => { if (await navigator.storage?.persist?.()) showKept(); };

$('export').onclick = () => {
  const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' })), download: `english-drill-${today()}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('backup-msg').textContent = `書き出しました（${a.download}）`;
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async () => {
  const file = $('import-file').files[0];
  $('import-file').value = ''; // choosing the same file again still fires
  let data = null;
  try { data = JSON.parse(await file.text()); } catch {}
  if (!isBackup(data)) { $('backup-msg').textContent = 'このファイルは記録のバックアップではないようです。'; return; }
  const days = (s) => Object.keys(s.log ?? {}).length, cards = (s) => Object.keys(s.hist ?? {}).length;
  if (!confirm(`「${file.name}」の記録（${days(data)}日分・${cards(data)}問）で、いまの記録（${days(state)}日分・${cards(state)}問）を置き換えます。よろしいですか？`)) return;
  save(restore(data));
  applyTheme();
  renderHome();
  if (canSpeak) renderVoices();
  $('backup-msg').textContent = '読み込みました。';
};

applyTheme();
renderHome();
showKept();
if ('serviceWorker' in navigator) {
  // A new deploy's worker took over: reload once so this page runs the new code too.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => hadController && location.reload());
  // The CSP enforces Trusted Types: the 'sw' policy can only ever produce this one script URL.
  navigator.serviceWorker.register(window.trustedTypes?.createPolicy('sw', { createScriptURL: () => 'sw.js' }).createScriptURL('sw.js') ?? 'sw.js');
}
