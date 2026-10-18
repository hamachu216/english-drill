import { FILES, flattenCards, schedule, answer, buildSession, streak, calendar, wordDiff, englishVoices } from './core.js';

const KEY = 'eng:v1';
const $ = (id) => document.getElementById(id);
const today = () => new Date().toLocaleDateString('sv'); // local YYYY-MM-DD
const files = await Promise.all(FILES.map((f) => fetch(f).then((r) => r.json())));
const cards = flattenCards(files);

// ---- state: one JSON blob in localStorage, replaced wholesale on every change
const DEFAULT = { cards: {}, log: {}, settings: { theme: 'system', goal: 20, newPerDay: 10, voice: '', decks: files[0].decks.map((d) => d.id) } };
const withDefaults = (s) => ({ ...DEFAULT, ...s, settings: { ...DEFAULT.settings, ...s?.settings } });
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
let state = withDefaults(load());
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
const openLevels = new Set();
$('levels').addEventListener('toggle', (e) => {
  const l = e.target.dataset.level;
  e.target.open ? openLevels.add(l) : openLevels.delete(l);
}, true);

function renderLevels() {
  const sel = new Set(state.settings.decks);
  const learned = (cs) => `${cs.filter((c) => state.cards[c.id]).length}/${cs.length}`;
  $('levels').innerHTML = files.map((f) => {
    const ids = f.decks.map((d) => d.id), on = ids.filter((id) => sel.has(id)).length;
    return `<details class="level" data-level="${f.level}" ${openLevels.has(String(f.level)) ? 'open' : ''}>
      <summary><input type="checkbox" data-decks="${ids}" ${on === ids.length ? 'checked' : ''} data-mixed="${on > 0 && on < ids.length}">
        <b>Lv${f.level} ${esc(f.title)}</b><span class="n">${learned(f.decks.flatMap((d) => d.cards))}</span></summary>
      ${f.decks.map((d) => `<label><input type="checkbox" data-decks="${d.id}" ${sel.has(d.id) ? 'checked' : ''}>${esc(d.title)}<span class="n">${learned(d.cards)}</span></label>`).join('')}
    </details>`;
  }).join('');
  for (const c of $('levels').querySelectorAll('[data-mixed="true"]')) c.indeterminate = true;
}
// One handler for every checkbox: each carries the deck ids it controls.
$('levels').onchange = (e) => {
  const sel = new Set(state.settings.decks);
  for (const id of e.target.dataset.decks.split(',')) e.target.checked ? sel.add(id) : sel.delete(id);
  setSettings({ decks: [...sel] });
};

function renderHome() {
  const d = today(), done = state.log[d] || 0, { goal } = state.settings;
  const size = buildSession(cards, state, d).length;
  $('streak').textContent = streak(state.log, d);
  $('today').textContent = done;
  $('due').textContent = buildSession(cards, { ...state, settings: { ...state.settings, newPerDay: 0 } }, d).length;
  $('goal-label').textContent = done >= goal ? `今日の目標 ${goal}問 達成！` : `今日の目標まで あと ${goal - done}問`;
  $('goal-bar').style.width = `${Math.min(100, (done / goal) * 100)}%`;
  $('heatmap').replaceChildren(...calendar(d, 12).map((day) => {
    const n = state.log[day] || 0, cell = el('i', { title: `${day}: ${n}問` });
    cell.dataset.l = Math.min(3, Math.ceil((n / goal) * 3));
    return cell;
  }));
  $('start').textContent = size ? `練習を始める（${size}問）` : state.settings.decks.length ? '今日の分は完了。新規数を増やすか範囲を追加' : '出題範囲を選んでください';
  $('start').disabled = !size;
  $('goal').value = goal;
  $('newPerDay').value = state.settings.newPerDay;
  renderLevels();
}

const clampInput = (id, lo, hi) => ($(id).onchange = () => setSettings({ [id]: Math.min(hi, Math.max(lo, +$(id).value || lo)) }));
clampInput('goal', 5, 200);
clampInput('newPerDay', 0, 50);

$('export').onclick = () => {
  const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' })), download: `english-progress-${today()}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async (e) => {
  try {
    const s = JSON.parse(await e.target.files[0].text());
    if (!s.cards || !s.log) throw 0;
    save(withDefaults(s));
    applyTheme();
    renderHome();
    $('flash').textContent = '進捗を読み込みました';
  } catch { $('flash').textContent = '読み込めないファイルです'; }
  e.target.value = '';
};

const refLink = ({ name, url }) => el('a', { href: url, textContent: name, target: '_blank', rel: 'noopener' });
// One entry per site: "EAP Foundation: Clarifying" → "EAP Foundation".
const siteName = (r) => r.name.split(':')[0];
const sites = new Map(files.flatMap((f) => f.decks.flatMap((d) => d.refs)).map((r) => [siteName(r), r.url]));
$('refs').replaceChildren(...[...sites].map(([name, url]) => {
  const li = el('li');
  li.append(refLink({ name, url }));
  return li;
}));

// ---- study
let queue = [], cur = null, answered = 0;
const show = (view) => { $('home').hidden = view !== 'home'; $('study').hidden = view !== 'study'; scrollTo(0, 0); };
const canHover = matchMedia('(hover: hover)').matches;

function next() {
  cur = queue.shift();
  if (!cur) return finish();
  $('track').textContent = `Lv${cur.level} · ${cur.deckTitle}`;
  $('count').textContent = `${answered + 1} / ${answered + queue.length + 1}`;
  $('ja').textContent = cur.ja;
  $('input').value = '';
  $('answer').hidden = true;
  $('reveal').hidden = false;
  for (const b of document.querySelectorAll('.grades button')) b.querySelector('small').textContent = `${schedule(state.cards[cur.id], +b.dataset.g, today()).ivl}日後`;
  if (canHover) $('input').focus();
}

function reveal() {
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

function grade(g) {
  save(answer(state, cur.id, g, today()));
  answered++;
  if (g === 0) queue.push(cur); // retry within this session
  next();
}

function finish() {
  show('home');
  renderHome();
  $('flash').textContent = answered ? `お疲れさまでした！ ${answered}問 回答・${streak(state.log, today())}日連続` : '';
}

$('start').onclick = () => { queue = buildSession(cards, state, today()); answered = 0; $('flash').textContent = ''; show('study'); next(); };
$('quit').onclick = finish;
$('reveal').onclick = reveal;
for (const b of document.querySelectorAll('.grades button')) b.onclick = () => grade(+b.dataset.g);
document.addEventListener('keydown', (e) => {
  if ($('study').hidden || e.isComposing) return;
  if (e.key === 'Escape') finish();
  else if ($('answer').hidden) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); reveal(); } }
  else if (['1', '2', '3', '4'].includes(e.key)) grade(+e.key - 1);
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
