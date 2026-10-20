# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

瞬間英作文形式（日本語の問題 → 英語で言う → 模範解答を表示）の英語スピーキング練習用の静的PWA。日本の博士課程学生向けで、基礎文法から研究ディスカッション・国際学会のQ&A・博士公聴会までを扱う。ビルド工程・フレームワーク・依存パッケージはない。GitHub Pages で `main` ブランチのルートから公開しており（https://hamachu216.github.io/english-drill/ 、リポジトリ `hamachu216/english-drill`）、`main` に push するとそのまま本番に反映される。

## コマンド

```bash
node --test test/*.test.js                         # 全テスト（node --test test/ では動かない）
node --test --test-name-pattern="nextRound" test/core.test.js   # 1つのテストだけ
python3 -m http.server 8931 --bind 127.0.0.1       # ローカル確認（fetch() を使うので file:// では動かない）
gh api repos/hamachu216/english-drill/pages/builds/latest --jq '.status+" "+.commit'   # デプロイ状況
```

このマシンではポート 8765/8766 が使用中のことが多い。`scc` は未導入（Xcode のライセンス未同意で Homebrew が使えない）ため、行数は `grep -cvE '^\s*($|//)' file` で数える。

## アーキテクチャ

データ → 純粋関数 → DOM の3層構成。

- `data/{1..5}-*.json` — レベルごとに1ファイル。中身のデータはこれだけ。形は `{level, title, decks:[{id, title, refs:[{name,url}], cards:[{id, ja, en, note?}]}]}`。カードIDは `<deckId>-NNN` 形式で、全体で一意であること（`test/data.test.js` で検証）。ファイル一覧は `core.js` の `FILES` にあり、レベルはその順に 1..N であること。
- `core.js` — 純粋関数のみ（DOM・ストレージに触らない）で、すべて単体テスト済み: `flattenCards`、`shuffle(xs, rand)`、`nextRound(misses, pool, all, rand)`（ラウンド進行の中核）、`timeLimit`、`streak`、`calendar`、`englishVoices`、`wordDiff`。
- `app.js` — DOM と状態のすべて。`<script type="module">` 1つで、トップレベル `await` により全データファイルを fetch する。

学習の流れ: レベルを1つ選ぶ → そのレベルのカードをシャッフルしてメモリ上の `pool` に入れる → `ROUND`（10）問ずつのラウンドで出題する。各回答は ○/✕ で判定し（`results[i]`）、ラウンド終了後は `misses()` を次のラウンドとして（`retry: true`）、全問○になるまで繰り返す。その後は pool から次の10問を出し、pool が空になったらシャッフルし直して補充する。カード単位の情報は意図的に保存しない。再読み込みすると pool と出し直し待ちの問題はリセットされる。

保存: localStorage のキー `eng:v1` 1つに `{log: {"YYYY-MM-DD": その日の回答数}, settings: {theme, goal, level, limit, voice}}` を入れる。`restore()` は `DEFAULT` にあるキーだけを残すため、旧バージョンの不要な項目は捨てられる。`log` を元に連続日数・目標リング・12週間のヒートマップを表示する。テーマは `<head>` 内のインラインスクリプトが描画前に読み、ちらつきを防いでいる。

画面は3つの `<section>`（`home`、`study`、`result`）を `hidden` で切り替える。多くの要素が `display` を指定しているため、グローバルの `[hidden]{display:none!important}` が必要。

## ハマりどころ

- **Service Worker**（`sw.js`）: ネットワーク優先で `cache: 'no-cache'` を付けて取得し、`skipWaiting` と `clients.claim` を使う。`app.js` は `controllerchange` で1回だけ再読み込みする。GitHub Pages は `max-age=600` を返すため、この組み合わせでデプロイが次の再読み込みで反映される。キャッシュ優先や stale-while-revalidate に戻さないこと（以前それで利用者が古いコードから抜けられなくなった）。
- **読み上げの声**: 声を指定しないと、macOS の Chrome はかすれ声のジョーク用音声「Albert」を使う。ジョーク用音声は名前がローカライズされる（例: ささやき声）ため除外リスト方式は使えない。`englishVoices` は品質の良い声の許可リストだけを残し、未知の環境では任意の英語音声にフォールバックする。
- **制限時間**: `#timer` に CSS の `@keyframes drain` アニメーションを掛け、答えを表示したら `animationPlayState` で止める。これとは別に `setTimeout` を1つ置き、時間切れで `reveal(true)` を呼ぶ。既定は10秒。`'auto'` は 2秒 + 1単語0.5秒。
- **テーマ**: 色は `:root` の CSS カスタムプロパティで定義する。ダークモードは `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` と `:root[data-theme="dark"]` の2か所で再定義しているので、両方を必ず揃えること。レベルごとのアクセント色は `--lv1`〜`--lv5` で、`--lv` 経由で適用する。
- **問題文**: 必ずオリジナルで書く。`refs` に載せた参考サイトは分野構成の参考にしただけで、文をコピーしてはいけない。リポジトリは public なので、カードに利用者の実名や所属を入れないこと。
- **ヘッドレス確認**: Chrome 拡張は使えないことが多い。セッションのスクラッチパッドに `playwright-core` を入れ、`executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'` で起動する。このリポジトリには入れないこと。
