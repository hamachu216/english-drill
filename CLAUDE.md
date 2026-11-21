# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

英語スピーキング練習用の静的PWA（Research English Drill）。日本の大学院生向けで、目標は「国際学会で自分の研究を英語で説明し、質問に簡単な英語で1〜3文で答えられる」こと。

| 機能 | 中身 | 今日の練習に |
|---|---|---|
| 今日の練習 | 履歴から組んだ1日分。基礎文法 → 研究英語の構文 → 研究の場面の表現（Lv3〜5）→ 質疑応答の切り返し。30分 | — |
| Phrase Drill | 形容詞＋前置詞と相槌を交互に10問ずつ | 入らない |
| Listening Drill | 4〜6文の話を聞き、問いの答えになる1文を書き取る。3本ずつ | 入らない |
| 模擬質疑応答 | 研究についての質問5問＋追加質問。支援なし | 入らない |
| 自由に練習 | 基礎文法（Lv1〜2）・Lv3〜5 から選んで10問ずつ | — |

ビルド工程・フレームワーク・依存パッケージはない。GitHub Pages で `main` のルートから公開（https://hamachu216.github.io/english-drill/ 、`hamachu216/english-drill`）。**PR を作らず `main` に直接コミットして push してよい**（利用者の指定。テストとヘッドレス確認のあと。push 後は Pages のビルド完了まで確認する）。

## コマンド

```bash
node --test test/*.test.js                         # 全テスト（node --test test/ では動かない）
node --test --test-name-pattern="review" test/plan.test.js   # 名前で絞る
python3 -m http.server 8931 --bind 127.0.0.1       # ローカル確認（fetch() を使うので file:// では動かない）
gh api repos/hamachu216/english-drill/pages/builds/latest --jq '.status+" "+.commit'   # デプロイ状況
```

## アーキテクチャ

サーバ側に処理はない。Pages は静的ファイルを配るだけで、出題・判定・記録はすべてブラウザ内で完結する。通信は自サイトの静的ファイルの GET だけで、学習の記録はどこにも送らない（音声認識だけは、ブラウザによっては提供元のサーバに音声が送られる。アプリの通信ではない）。端末間の移行は JSON の書き出し・読み込みだけ。

```
data/*.json ──catalog──▶ cards（kind・topic・deck・held 付き）
localStorage "eng:v1" ─restore─▶ state {log, hist, days, session, answers, settings}
        planSession（今日の練習）／byNeed（自由練習・ドリル）／mockSession（模擬質疑応答）
            ▼
queue [{id, phase, level?, as?, follow?, check?, retry?}]  1ステップ＝1画面
            ▼  showStep → reveal → grade（review でカードの記録、tally で日次集計）→ 保存 → 次へ
```

学習の判断はすべて純粋関数（`core.js`・`plan.js`・`colloc.js`）にあり、日付・乱数・履歴を引数で受け取る。DOM・ストレージ・時計に触るのは `app.js` だけ。

| ファイル | 役割 |
|---|---|
| `index.html` | マークアップと CSP の `<meta>` |
| `style.css` | 見た目のすべて。色は `:root` のトークン |
| `theme.js` | `<head>` で同期読み込みし、描画前にテーマを当てる |
| `core.js` | 汎用: `catalog`、`restore`/`isBackup`、`seeded`、`shuffle`、`nextRound`、ヒント文字列（`mask`/`slots`/`wordBank`）、`streak`/`calendar`、`englishVoices`、`wordDiff` |
| `plan.js` | 学習アルゴリズム: `review`、`tally`、`shares`/`mix`、`planSession`、`mockSession`、`requeue`、`scaffold`、`choices`、`knownTopics`、`byNeed`、`drillSteps`、`overview`/`weekly`。定数はファイル先頭 |
| `colloc.js` | 形容詞＋前置詞: `example`、`siblings` |
| `app.js` | DOM と状態。トップレベル `await` で全データを fetch。DOM は `el(tag, props, ...kids)` で組み、HTML 文字列は使わない |
| `sw.js` | Service Worker（ネットワーク優先） |
| `test/*.test.js` | `core`・`plan`・`colloc` の単体テスト、データ検査（`data`）、CSP 検査（`security`） |

## データ（`data/`）

形は `{kind?, level?, title, decks:[{id, title, note?, refs?, cards:[…]}]}`。レベル別ファイルは `core.js` の `FILES`（順にレベル 1..N）、それ以外は `DRILLS`。

| ファイル | kind | カードの形と決まり | 使われ方 |
|---|---|---|---|
| `1-basic`・`2-advanced` | `grammar` | `{id, ja, en, note?}`。デッキに1行解説 `note`（必須）。研究の場で使わない形（if only・倒置など）は入れない | 今日の練習・自由練習 |
| `3-discussion`〜`5-defense` | `phrase` | 同上。`en` は1つの内容で12語以内（前置き・付け足しの理由は削る。利用者の指定。テストで検証）。`note` が説明する言い回しは `en` に残す | 今日の練習・自由練習 |
| `patterns` | `pattern` | デッキ＝1つの型（`frame`・`ja`・`note`）。`en` は型の書き出しで始まり、`slots` で `...` の語句を取り出せること。**デッキの並び順＝新しい型が開く順**（質疑応答の答えの書き出しになる `p-limit`・`p-nottested`・`p-because`・`p-diff`・`p-reason`・`p-depends`・`p-plan`・`p-apply` を `p-wonder` の次に置いている。利用者の指定） | 今日の練習 |
| `replies` | `reply` | `{id, scene, ja, frame, en}`。`ja`（と場面 `scene`）を見て `en` を言う。`frame` は答えの後に出す | 今日の練習 |
| `qa` | `qa` | `{id, q, ja, points, frame, en, more}`、デッキに追加質問 `follow`。`points` はどの研究にも当てはまる言い方。`q-intro` だけ PREP 順（結論 → 理由 → 具体例。テストで検証） | 模擬質疑応答 |
| `listening` | `listening` | `{id, scene, task, text, en, ja, textJa}`。`en` は `text` にそのまま含まれる（テストで検証）。話し言葉どおり短縮形（don't・I'm・I'll）で書く（聞き取りにくい音なので。テストで検証）。前置きの長さは本題を拾う練習なので削らない | Listening Drill |
| `collocations` | `colloc` | `{id, adj, prep, collocation, ja, difficulty, note, examples:[{id, scene, en, ja, also?}]}`。`en` に「形容詞 前置詞」がそのまま隣り合って入る（テストで検証） | Phrase Drill |
| `backchannels` | `backchannel` | `{id, said, saidJa, ja, en}`。デッキ＝相槌の機能で `basic`・`more`・`note` を持つ。`en` はどれかの `basic`/`more` で始まる（テストで検証）。`ja` の書き出しを機能ごとにそろえる | Phrase Drill |

- **ID** は `<deckId>-NNN` で全ファイルを通じて一意。学習履歴のキーなので**既存カードの ID は変えない**。
- **取り置き**: 各デッキの最後の2枚は週1回の初見チェック用（`held`。colloc は対象外）。カードは途中に足す。
- **切り返しは短く**: `replies` の `en` は1文に1つの役割で8語以内（テストで検証）。前置き（Just to make sure I understand your point など）は付けない。緊張していても口から出る長さにするため（利用者の指定。以前の Wordvice の定型句を一字一句使う決まりは廃止し、場面だけを参考にしている）。
- **問題文は必ずオリジナル**。`refs` の参考サイト（EnglishClub・British Council など）は構成の参考で、文を写さない。**リポジトリは public** なので、利用者の実名・所属・実際の研究内容や時期を、カードにも CLAUDE.md にも書かない（例文は架空の研究）。

## 今日の練習（`planSession`）

| kind | 1枚の目安 | 新しいカード | 支援とヒント |
|---|---|---|---|
| `grammar` | 60秒 | 得意でないトピックをファイル順に3つずつ（`ROTATION`）。b-be・b-neg・b-prog（`LATER`）は最後 | ヒント: 使う語 |
| `pattern` | 75秒 | 始めた型の続き → 始めた型をどれも一度言えたら新しい型を1〜2個（それぞれ4文、型を表示してすぐ言う。聞いてまねする画面は利用者の指定で廃止） | 型の表示 → 半分隠す → なし。ヒント: 型＋使う語 |
| `phrase` | 75秒 | Lv3・Lv4・Lv5 のトピックを交互に、各トピックの1枚目 → 2枚目 … | 6分に1問。ヒント: 使う語 |
| `reply` | 60秒 | 各場面の1枚目 → 2枚目 … | 10分に1問（利用者の指定で減らし、その分を基礎文法に回した）。意味と場面を見て言う（書き取りではない。質疑応答で要るのは自分で言うことなので、利用者の指定で書き取りをやめた）。ヒント: 使う語 |

- **順番**: 前回言えなかったカード → 基礎文法 → 構文 → Lv3〜5 → 切り返し → 週1回の初見チェック（初回から7日ごと、取り置きの未出題を 基礎3・構文2・Lv3〜5 1・切り返し1、支援なし）。
- **配分**: 時間の 5/6（`SPLIT`）を 基礎:構文 ＝ 1:1 に分けたうちの構文の分を構文に渡し（直近2週間の基礎の出来で基礎は 30〜65% に動く）、残りから切り返しと Lv3〜5 を引いた全部を基礎文法にする。上の秒数で枚数 n に換算する。Lv3〜5 の時間も切り返しを減らして浮いた時間も基礎文法だけが負担・受け取る（利用者の指定。構文の時間は変えない）。ただし基礎文法は分けた時間の20%（`GRAMMAR_MIN`）を下回らない（下回ると基礎文法の復習が出なくなるため）。
- **やり直しの時間**: 言えなかった・ヒントで言えたカードはその場でもう一度出るので、直近2週間でヒントなしで言えなかった割合 f を見込んで枚数を n / (1 + f) にする。削るのは新しいカードだけで、復習・基礎文法の毎日1枚の新規・**新しい型**は削らない。新しい型が枠を超えた分は、基礎文法 → 切り返しの新規から引く（利用者の指定）。どの種類も最低1枚。出来が悪い時期は30分を超える。
- **選び方**: 期限の来た復習（箱の低い順）→ いちばん苦手なトピックの未出題の文を少し → 新規 → 古い順。復習の山が1セッション分より浅ければ枠の半分、2セッション分未満なら1/4を新規に空け、それ以上なら空けない（山を増やし続けないため。シミュレーションで確認）。前回言えなかったカードは枠を超えても必ず翌日に出す。`LATER` の復習は期限から7日（`PATIENCE`）過ぎたら普通の順に戻る。
- **得意なトピック**（`knownTopics`）: 3問以上答えて、どれも最後がヒントなしの「言えた」。その新規は最後に回す。
- **基礎文法の復習は別の文で**: 同じトピックのまだ答えていない文で出し、記録は期限の来たカードに付ける（ステップの `as`）。残っていなければそのカード自身。
- **やり直し**（`requeue`）: 言えなかった・ヒントで言えたカードを4枚後に1回だけ。支援もヒントもなし（下の `bare`）。
- **再現性**: 日付をシードにした乱数で組むので、ホームのメニューと実際のセッションは一致する。

## 記録と判定

- **`review`**: 言えなかった → 翌日（箱0）。言えた → 箱+1（3・7・14・30・60日）。ヒントで言えた → 箱+1 だが7日止まり。箱が上がるのは期限の日（か初回）だけ。`grade` はその日のいちばん悪い回答（やり直しで言えても、その日は言えなかったカード）。**`tally`**: 1回目の回答だけを日次集計に足す。
- **流れ**: 出題 → 声に出す（入力・🎤は任意。音声認識の結果は判定に使わない）→ 回答例 → 自己評価（言えなかった／ヒントで言えた／言えた。ヒントを使ったら「言えた」は出ない）。「わからない」は言えなかったとして記録。時間制限・秒数の計測はない。
- **ヒント**: どの種類も「使う語」1つだけ（答えの語をアルファベット順に並べたもの。構文は `...` に入る語で、型と一緒に出る）。並べ方と文法は自分でやる（詰まるのは語彙のため。頭文字などほかのヒントは利用者の指定で廃止）。例外は Q&A で、架空の研究の答えを並べさせないよう 入れる要素 → 答え方の型 → 質問の意味 を1つずつ。
- **ヒントなしの復習**（`bare`）: 前回（その日のいちばん悪い回答）がヒントなしで言えなかったカード — 言えなかった・ヒントで言えた・わからない — は、支援もヒントも出さない。ただし基礎文法の復習を初めて見る別の文（`as`）で出すときは、見たことのない文なのでヒントあり（その文のやり直しはヒントなし）。今日の練習の中だけのルールで、やり直し・翌日以降の復習の両方で、ヒントなしで一度言えるまで続く（利用者の指定）。初見チェックも同じ。切り返しと、ドリル・自由練習・模擬質疑応答では、復習でもいつもヒントを出す（利用者の指定）。
- **模擬質疑応答**（`mockSession`）: 話題をまたいで5問、英語のみ、追加質問を1つずつ。ヒントは 入れる要素 → 答え方の型 → 質問の意味。Q&A の「言えなかった」は「内容が浮かばなかった／英文にできなかった」に分かれ、回答例との差分は出さない。
- **自由練習・ドリル**（`byNeed`）: 前回間違えた → 期限の来た復習 → 新規 → 古い順の `pool` から10問（Listening は3本）ずつ出し、言えなかった問題だけを繰り返す（`nextRound`）。ラウンドの進行は保存しない。
- **Phrase Drill・Listening Drill**（`inFull`）: 中間は「△ 一部だけ言えた」（ヒントなしでも選べる）で、△ も ✕ も同じラウンドで○になるまで繰り返す。○は全文を自分で言えたとき（回答例と違う言い方でもよい）。聞いてまねする画面はなく、すぐに出題する（利用者の指定）。
  - 形容詞＋前置詞: 覚える単位は組み合わせで、出るたびに別の例文。形容詞は問題文の下に出す。使う語はその日の例文の語。
  - 相槌: 返す内容（`ja`）が問題文で、相手のひと言（`said`）は表示のみ。機能名は出さない。同じ機能の言い方ならどれでも正解。
  - Listening: 話を1文ずつ読み上げ、文字は見せない。答えの後に差分・全文・訳。

## 保存

localStorage の `eng:v1` 1つ。形は `restore` が決め、外から来たデータ（バックアップの読み込み）の唯一の関門として、型の合わない項目と無くなった設定を捨て、古い形式を変換する。

- `log: {日付: 回答数}`、`hist: {cardId: {box, n, last, due, grade}}`（grade 0 言えなかった・1 ヒント・2 言えた）
- `days: {日付: {topicId: [回答数, ヒントなしで言えた], "#check": [...], "#why": [内容, 英文], "#plan:10": [その日に始めた10分版の回数]}}` — 値がすべて数値配列なので合算は足し算だけ。`#plan:分` は今日の練習を始めた長さ（設定の分数・10分版・続きの5分）で、10分版をどれくらい使うかを後で見るため（利用者の指定）
- `session: {day, queue, idx, grades}` — 1問ごとに保存し、同じ日なら続きから再開
- `answers: {cardId: 自分の回答例}` — 実際の研究内容が入るので端末とバックアップの外に出さない
- `settings: {theme, level, voice, minutes, listen}`

練習を始めるタップで `navigator.storage.persist()` を頼む。iPhone Safari の7日で消える仕組みは、ホーム画面に追加すれば対象外。

## 画面

`home`・`study`・`result` の3つの `<section>` を `hidden` で切り替える（`[hidden]{display:none!important}` が必要）。ホームはセクションを並べたグリッドで、間隔はグリッドの `gap` だけ。PC（960px 以上）は幅 70rem・2列で、`grid-template-areas` で2枚ずつ並べ（開閉する `details` は `align-self: start`）、出題画面は「問題・回答 | 回答例・自己評価」の2列。

## ハマりどころ

- **Service Worker**: ネットワーク優先・`cache: 'no-cache'`・`skipWaiting`・`clients.claim`、`app.js` は `controllerchange` で1回だけ再読み込み。Pages の `max-age=600` に対してこれでデプロイが次の再読み込みで反映される。キャッシュ優先や stale-while-revalidate に戻さない（利用者が古いコードから抜けられなくなった）。
- **読み上げの声**: 指定しないと macOS の Chrome はジョーク用音声を使い、その名前はローカライズされる。`englishVoices` は許可リスト方式で、未知の環境では任意の英語音声に戻る。
- **話すのが先**: 入力は任意。🎤は SpeechRecognition、なければ MediaRecorder で録音（CSP の `media-src blob:`）、どちらも無ければボタンが出ないだけ。
- **テーマ**: 硬派な教科書（ライトは紙とインク、ダークは黒板とチョーク）。罫線で組み、影・濃い面・絵文字は使わない。角丸はボタンと入力欄のみ。色は意味のあるところ（蛍光ペン `--hl`・○△✕・レベル `--lv1`〜`--lv5`・記録の濃淡）だけ。読むものは `--serif`、押すものとラベルは `--sans`。ダークモードは `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` と `:root[data-theme="dark"]` の**2か所を必ず揃える**。
- **CSP**: `default-src 'none'` で自サイトと Trusted Types だけを許可。外部の CDN・フォント・インラインコード・`innerHTML` は動かない（`test/security.test.js`）。Service Worker の登録は `sw` ポリシーを通す。フォントは端末のもの。
- **GitHub**: `main` はルールセット `protect-main` で force push と削除を禁止。コミットのメールは GitHub の noreply アドレス。
- **ヘッドレス確認**: `playwright-core` でローカルの Chrome を動かす。`playwright-core` はリポジトリに入れず作業用の一時フォルダに入れる。
