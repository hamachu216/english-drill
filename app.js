import { FILES, ROUND, flattenCards, nextRound, streak, calendar, timeLimit, wordDiff, englishVoices } from './core.js';

const KEY = 'eng:v1';
const $ = (id) => document.getElementById(id);
const today = () => new Date().toLocaleDateString('sv'); // local YYYY-MM-DD
const files = await Promise.all(FILES.map((f) => fetch(f).then((r) => r.json())));
const cards = flattenCards(files);

// ---- state: settings + answers per day (for the streak). Nothing per card.
const DEFAULT = { theme: 'system', goal: 20, level: 1, limit: 10, voice: '' };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const restore = (s) => ({ log: s?.log ?? {}, settings: Object.fromEntries(Object.entries(DEFAULT).map(([k, v]) => [k, s?.settings?.[k] ?? v])) });
let state = restore(load());
const save = (s) => { state = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
const setSettings = (patch) => { save({ ...state, settings: { ...state.settings, ...patch } }); renderHome(); };

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
const el = (tag, props) => Object.assign(document.createElement(tag), props);
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function renderHome() {
  const d = today(), done = state.log[d] || 0, { goal, level } = state.settings;
  $('streak').textContent = streak(state.log, d);
  $('today').textContent = done;
  $('goal-label').textContent = done >= goal ? `今日の目標 ${goal}問 達成！` : `今日の目標まで あと ${goal - done}問`;
  $('goal-bar').style.width = `${Math.min(100, (done / goal) * 100)}%`;
  $('heatmap').replaceChildren(...calendar(d, 12).map((day) => {
    const n = state.log[day] || 0, cell = el('i', { title: `${day}: ${n}問` });
    cell.dataset.l = Math.min(3, Math.ceil((n / goal) * 3));
    return cell;
  }));
  $('levels').innerHTML = files.map((f) => `<label class="level"><input type="radio" name="level" value="${f.level}" ${f.level === level ? 'checked' : ''}>
    <b>Lv${f.level} ${esc(f.title)}</b><span class="n">${f.decks.reduce((n, d) => n + d.cards.length, 0)}問</span></label>`).join('');
  $('goal').value = goal;
  $('limit').value = state.settings.limit;
}

$('levels').onchange = (e) => { pool = []; setSettings({ level: +e.target.value }); };
$('goal').onchange = () => setSettings({ goal: Math.min(200, Math.max(5, +$('goal').value || 5)) });
$('limit').onchange = () => setSettings({ limit: $('limit').value === 'auto' ? 'auto' : +$('limit').value });

const refLink = ({ name, url }) => el('a', { href: url, textContent: name, target: '_blank', rel: 'noopener' });
// One entry per site: "EAP Foundation: Clarifying" → "EAP Foundation".
const siteName = (r) => r.name.split(':')[0];
const sites = new Map(files.flatMap((f) => f.decks.flatMap((d) => d.refs)).map((r) => [siteName(r), r.url]));
$('refs').replaceChildren(...[...sites].map(([name, url]) => {
  const li = el('li');
  li.append(refLink({ name, url }));
  return li;
}));

// ---- study: rounds of ROUND cards; misses come back as the next round until all are correct
let pool = [], round = { cards: [] }, idx = 0, misses = [], answered = 0, timer = 0, cur = null;
const VIEWS = ['home', 'study', 'result'];
const show = (view) => { for (const v of VIEWS) $(v).hidden = v !== view; scrollTo(0, 0); };
const canHover = matchMedia('(hover: hover)').matches;
const levelCards = () => cards.filter((c) => c.level === state.settings.level);

function play(r) {
  round = r;
  pool = r.pool;
  idx = 0;
  misses = [];
  show('study');
  showCard();
}

function showCard() {
  cur = round.cards[idx];
  const sec = timeLimit(cur.en, state.settings.limit);
  $('track').textContent = `${round.retry ? '復習 · ' : ''}Lv${cur.level} · ${cur.deckTitle}`;
  $('count').textContent = `${idx + 1} / ${round.cards.length}${sec ? ` · ${sec}秒` : ''}`;
  $('ja').textContent = cur.ja;
  $('input').value = '';
  $('answer').hidden = true;
  $('reveal').hidden = false;
  if (canHover) $('input').focus();
  startTimer(sec);
}

// The bar shrinks via a CSS transition; one timeout reveals the answer when time is up.
function startTimer(sec) {
  clearTimeout(timer);
  const bar = $('timer');
  $('timer-track').hidden = !sec;
  if (!sec) return;
  bar.style.transition = 'none';
  bar.style.width = '100%';
  bar.getBoundingClientRect(); // commit 100% before animating to 0
  bar.style.transition = `width ${sec}s linear`;
  bar.style.width = '0%';
  timer = setTimeout(() => reveal(true), sec * 1000);
}

function reveal(timedOut = false) {
  clearTimeout(timer);
  Object.assign($('timer').style, { width: getComputedStyle($('timer')).width, transition: 'none' }); // freeze: shows time left
  $('timeout').hidden = !timedOut;
  const typed = $('input').value.trim();
  $('en').replaceChildren(...(typed ? wordDiff(typed, cur.en).flatMap(({ w, ok }) => [el('span', { className: ok ? 'hit' : 'miss', textContent: w }), ' ']) : [cur.en]));
  $('en').className = typed ? 'en diff' : 'en';
  $('note').textContent = cur.note || '';
  $('note').hidden = !cur.note;
  $('card-refs').replaceChildren('参考: ', ...cur.refs.flatMap((r, i) => (i ? [' / ', refLink(r)] : [refLink(r)])));
  $('answer').hidden = false;
  $('reveal').hidden = true;
  document.activeElement.blur();
}

function judge(ok) {
  const d = today();
  save({ ...state, log: { ...state.log, [d]: (state.log[d] || 0) + 1 } });
  answered++;
  if (!ok) misses.push(cur);
  if (++idx < round.cards.length) showCard();
  else showResult();
}

function showResult() {
  const n = round.cards.length, wrong = misses.length;
  show('result');
  $('result-title').textContent = wrong ? `${n - wrong} / ${n} 正解` : `${n} / ${n} 全問正解！`;
  $('result-list').replaceChildren(...misses.map((c) => {
    const li = el('li', { className: 'card' });
    li.append(el('p', { className: 'muted', textContent: c.ja }), el('p', { className: 'en', textContent: c.en }));
    return li;
  }));
  $('next-round').textContent = wrong ? `間違えた${wrong}問をもう一度` : `次の${ROUND}問へ`;
}

function finish() {
  clearTimeout(timer);
  show('home');
  renderHome();
  $('flash').textContent = answered ? `お疲れさまでした！ ${answered}問 回答・${streak(state.log, today())}日連続` : '';
}

$('start').onclick = () => { answered = 0; $('flash').textContent = ''; play(nextRound([], pool, levelCards())); };
$('next-round').onclick = () => play(nextRound(misses, pool, levelCards()));
$('quit').onclick = $('home-btn').onclick = finish;
$('reveal').onclick = () => reveal();
$('ng').onclick = () => judge(false);
$('ok').onclick = () => judge(true);
document.addEventListener('keydown', (e) => {
  if (!$('home').hidden || e.isComposing) return;
  if (e.key === 'Escape') finish();
  else if (!$('result').hidden) { if (e.key === 'Enter') $('next-round').click(); }
  else if ($('answer').hidden) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); reveal(); } }
  else if (e.key === '1' || e.key === 'ArrowLeft') judge(false);
  else if (e.key === '2' || e.key === 'ArrowRight') judge(true);
  else if (e.key === 's') speak(cur.en);
});

// ---- speech: read model answer aloud with a natural English voice, optional voice input
let voices = [];
function speak(text) {
  const v = voices.find((x) => x.name === state.settings.voice) || voices[0];
  speechSynthesis.cancel();
  speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { voice: v ?? null, lang: v?.lang ?? 'en-US', rate: 0.95 }));
}
function renderVoices() {
  voices = englishVoices(speechSynthesis.getVoices());
  $('voice').replaceChildren(
    el('option', { value: '', textContent: `自動（${voices[0]?.name ?? '既定'}）` }),
    ...voices.map((v) => el('option', { value: v.name, textContent: `${v.name} · ${v.lang}` })),
  );
  $('voice').value = voices.some((v) => v.name === state.settings.voice) ? state.settings.voice : '';
}
if ('speechSynthesis' in window) {
  $('speak').onclick = () => speak(cur.en);
  $('voice').onchange = () => { setSettings({ voice: $('voice').value }); speak('Thank you for your question. That is a great point.'); };
  speechSynthesis.onvoiceschanged = renderVoices;
  renderVoices();
} else $('speak').hidden = $('voice-row').hidden = true;

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
  $('mic').hidden = false;
  $('mic').onclick = () => {
    const r = Object.assign(new Recognition(), { lang: 'en-US', interimResults: true });
    r.onresult = (e) => ($('input').value = [...e.results].map((x) => x[0].transcript).join(''));
    r.onend = () => $('mic').classList.remove('on');
    $('mic').classList.add('on');
    r.start();
  };
}

applyTheme();
renderHome();
if ('serviceWorker' in navigator) {
  // A new deploy's worker took over: reload once so this page runs the new code too.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => hadController && location.reload());
  navigator.serviceWorker.register('sw.js');
}
