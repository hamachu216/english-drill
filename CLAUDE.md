# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

英語スピーキング練習用の静的PWA。日本の博士課程学生向けで、目標は「国際学会で自分の研究を英語で説明し、質問に簡単な英語で1〜3文で答えられる」こと。ホームの「今日の練習を始める」を押すと、学習履歴から自動で組んだ1日分（基礎文法 → 形容詞＋前置詞 → 研究英語の構文 → 質疑応答の切り返し → Research Q&A）が始まる。形容詞＋前置詞（interested in など）は「Collocation Drill」として単独でも練習できる。レベル（Lv1〜5: 基礎文法〜博士公聴会）を選ぶ従来の瞬間英作文も「自由に練習」として残っている。ビルド工程・フレームワーク・依存パッケージはない。GitHub Pages で `main` ブランチのルートから公開しており（https://hamachu216.github.io/english-drill/ 、リポジトリ `hamachu216/english-drill`）、`main` に push するとそのまま本番に反映される。

## コマンド

```bash
node --test test/*.test.js                         # 全テスト（node --test test/ では動かない）
node --test --test-name-pattern="review" test/plan.test.js   # 名前で絞る
python3 -m http.server 8931 --bind 127.0.0.1       # ローカル確認（fetch() を使うので file:// では動かない）
gh api repos/hamachu216/english-drill/pages/builds/latest --jq '.status+" "+.commit'   # デプロイ状況
```

このマシンではポート 8765/8766 が使用中のことが多い。`scc` は未導入（Xcode のライセンス未同意で Homebrew が使えない）ため、行数は `grep -cvE '^\s*($|//)' file` で数える。

## アーキテクチャ

データ → 純粋関数 → DOM の3層構成。

- `data/{1..5}-*.json` — レベルごとに1ファイル。形は `{level, title, decks:[{id, title, note?, refs:[{name,url}], cards:[{id, ja, en, note?}]}]}`。Lv1〜2 のデッキには文法の1行解説 `note` が必須。ファイル一覧は `core.js` の `FILES` にあり、レベルはその順に 1..N であること。
- `data/patterns.json`（`kind: "pattern"`）— 研究英語の構文。デッキ＝1つの型（`frame: "We chose this method because ..."`、意味 `ja`、構造の解説 `note`）で、カードはその型に別の内容を当てはめた文（`en` は必ず型の書き出しで始まる）。
- `data/qa.json`（`kind: "qa"`）— 研究Q&A。デッキ＝話題で、カードは `{q, ja, frame, keys, en, more}`（英語の質問・その意味・答え方の型・キーワード・1文の回答例・続きの1〜2文）。デッキの `follow:[{q, ja, frame, en}]` は即興Q&Aで使う追加質問。
- `data/collocations.json`（`kind: "colloc"`）— 形容詞＋前置詞。デッキ＝前置詞（`ap-about` … `ap-with`、`prep` と前置詞の感覚 `note`）で、カードは1つの組み合わせ `{id, adj, prep, collocation, ja, difficulty, steps, note, examples:[{id, scene, en, ja, also?}]}`。`en` には必ず「形容詞 前置詞」がこの綴りのまま隣り合って入る（空欄を作るため。テストで検証）。`also` はその文でほかにも自然に使える前置詞で、選択肢の不正解には出さず、答えれば正解にする。収録する組み合わせは EnglishClub の一覧を参考にしたが、例文・訳・解説はオリジナル。
- `data/replies.json`（`kind: "reply"`）— 質疑応答の切り返し（聞き返す・お礼・答えられないとき・時間をもらう・図に戻る など、質問への最初のひと言）。カードは Q&A と同じ形に、答え方を決める場面 `scene`（日本語）を足したもの。場面は出題時に必ず表示する。Wordvice の資料「研究発表の質疑応答対処法」の英文（定型句と質問例）は利用者の指定で必須として収録しており、`test/data.test.js` の `HANDOUT` が、どれも取り置きでないカードに入っていることを検証する（綴りの誤り rational / identity は直した）。定型句以外（場面・具体的な中身・訳）はオリジナル。
- 4ファイルの一覧は `core.js` の `DRILLS`。
- カードIDは `<deckId>-NNN` 形式で全ファイルを通じて一意（`test/data.test.js` で検証）。IDは学習履歴のキーなので、既存カードのIDは変えないこと。各デッキの最後の2枚は「週1回の初見チェック」用に取り置かれる（`catalog` の `held`）ので、カードを足すときは末尾ではなく途中に入れるか、末尾2枚が初見用になることを踏まえる。
- `core.js` — 純粋関数のみ（DOM・ストレージに触らない）: `catalog`（全ファイル → `kind`/`topic`/`deck`/`held` 付きのカード一覧）、`restore`（保存データ → 現在の形。旧データの移行を兼ねる）、`seeded`（日付から決まる乱数）、`skeleton`/`opening`/`mask`（ヒント文字列）、`shuffle`、`nextRound`（自由練習のラウンド進行）、`timeLimit`、`hasEnglish`、`streak`、`calendar`、`englishVoices`、`wordDiff`。
- `plan.js` — 学習アルゴリズム。これも純粋関数のみ: `review`（1回の回答 → カードの次回復習日）、`tally`（1回の回答 → その日の集計）、`shares`/`mix`（直近2週間の出来 → 基礎:構文:Q&A の配分）、`planSession`（今日のセッション）、`requeue`（言えなかったカードを同じセッションでもう一度）、`scaffold`（最初に見せる支援とヒントの順）、`choices`（出す自己評価ボタン）、`overview`・`weekly`（ホームの表示用）。定数（間隔・配分・解放条件）はファイル先頭にまとまっている。
- `colloc.js` — 形容詞＋前置詞の純粋関数: `practise`（1回の回答 → 組み合わせの記録。Step の上下を含む）、`example`（毎回別の例文）、`blank`・`options`・`accepted`・`heard`（出題と判定）、`hints`、`siblings`（同じ形容詞の別の前置詞）、`drill`（Collocation Drill の出題リスト）、`progress`（Step ごとの数）。
- `app.js` — DOM と状態のすべて。`<script type="module">` 1つで、トップレベル `await` により全データファイルを fetch する。DOM は `el(tag, props, ...kids)` でノードから組み立て、HTML 文字列は使わない。
- `index.html`（マークアップのみ）、`style.css`、`theme.js` — インラインの `<script>`・`<style>`・`style=""` は CSP で禁止しているので、すべて別ファイルに置く。

### 今日の練習（`planSession`）

カードは5種類: `grammar`（Lv1〜2）、`colloc`、`pattern`、`reply`、`qa`。Lv3〜5（`phrase`）は自由練習専用。セッションは「画面1枚＝1ステップ」の配列 `[{id, phase, level?, intro?, follow?, check?, retry?}]` で、順番は 前回言えなかったカード（`review`）→ 基礎文法 → 形容詞＋前置詞 → 構文 → 質疑応答の切り返し → Q&A（→ 即興Q&A）→ 週1回の初見チェック。

- **配分**: 既定は30分を 15:10:5（1枚あたり 35/45/90 秒で枚数に換算）。基礎文法の出来が悪いと基礎が増え（上限65%）、良いと研究英語が増える（基礎の下限30%）。どの種類も最低1枚は入る。
- **選び方**（種類ごと）: 期限が来た復習（箱の低い順）→ いちばん苦手なトピックの追加 → 新規 → 何もなければ最後に練習した日が古い順。復習の山が2セッション分未満なら枠の1/4は新規用に空ける。
- **間隔反復**（`review`）: 言えなかった/ヒント → 翌日（箱0）。自力 → 箱+1（3・7・14・30・60日）。時間はかかった → 箱+1 だが7日止まり。箱が上がるのは期限が来た日（か初回）だけで、同じ日に何度正解しても進まない。
- **支援の減らし方**（`scaffold`）: 構文は型の進み具合（そのデッキの最大の箱）で 型を表示 → 半分隠す → なし。Q&A はカードの箱で Beginner（キーワード＋型）→ Intermediate（キーワード、45秒のゆるいバー）→ Advanced（質問のみ、「話し始める」で回答開始までの時間を記録）。ヒントボタンは残りを1つずつ出し、押したら「自力」は選べない。
- **即興Q&A**: すぐ答えられる質問（箱2以上かつ最後が自力）が6問たまると解放。未出題の質問を英語のみで出し、同じ話題の追加質問を1つ続ける。
- **形容詞＋前置詞**（`colloc.js`）: 配分の外で、6分に1組（30分なら5組）。覚える単位は文ではなく組み合わせで、出るたびに別の例文を使う。Step 1 は4択（同じ形容詞の別の前置詞を優先して不正解にする）、Step 2 は前置詞を入力か音声で（読み取れなければ自己判定）、Step 3 は日本語から文全体を言う（自己評価）。Step 1・2 は「期限の来た日に正解」を2回（＝別の日・別の例文）で次の Step へ、間違えたら翌日。Step 3 は通常の箱（7・14・30・60日）。履歴は `hist[組み合わせID]` に `step`・`wins` を足して入れる。初見チェックには入れない（`held` なし）。
- **質疑応答の切り返し**: 形容詞＋前置詞と同じく配分の外で、5分に1問（30分なら6問）。選び方・支援・自己評価は Q&A と同じ（質問を持つカードは `c.q` で判定）で、即興Q&Aの解放には数えない。
- **初見チェック**: 初回の練習日から7日ごと。取り置きの未出題カード（基礎3・構文2・切り返し1・Q&A1）を支援もヒントもなしで出す。
- 自己評価は 言えなかった / ヒントで言えた / 時間はかかった / 自力で言えた。Q&A では「言えなかった」が「内容が浮かばなかった」「英文にできなかった」に分かれる。音声認識の結果は表示するだけで判定には使わない。Q&A では回答と模範の差分も出さない（流暢さ優先）。

自由練習は従来どおり: レベルを選ぶ → シャッフルした `pool` から `ROUND`（10）問ずつ → 言えなかった問題だけを全部言えるまで繰り返す。回答はカードの履歴と日次集計には反映されるが、ラウンドの進行自体は保存しない。

### 保存

localStorage のキー `eng:v1` 1つに次を入れる（`restore` が形を決める。旧版の `{log, settings}` だけのデータもそのまま読め、無くなった設定は捨てる）。

- `log: {"YYYY-MM-DD": その日の回答数}` — 連続日数とヒートマップ用。
- `hist: {cardId: {box, n, last, due, grade, hint}}` — カードごとの履歴。
- `days: {"YYYY-MM-DD": {topicId: [回答数, 時間はかかった, 自力], "#time:<kind>": [秒の合計, 回数], "#start": [...], "#check": [出題, 言えた], "#why": [内容, 英文]}}` — 1回目の回答だけを数えた日次カウンタ。値がすべて数値配列なので、日の合算も週の合算も同じ足し算。
- `session: {day, queue, idx, grades}` — 今日のセッション。1問ごとに保存するので、中断・再読み込み後に続きから再開できる。日付が変わると無視される。
- `answers: {cardId: 最後に自分が答えた文}` — Q&A で入力・文字起こしした自分の回答（次回「前回のあなたの回答」として出す）。
- `settings: {theme, level, limit, voice, minutes, listen}`。

記録はブラウザの中にしかないので、消えないように2つ対策している。①練習を始めるタップで `navigator.storage.persist()` を頼む（容量不足による自動削除から外す。Firefox では許可のダイアログが出る）。②設定の「記録のバックアップ」で状態全体を JSON に書き出し、読み込みで丸ごと置き換える（確認ダイアログあり。中身は `isBackup` で検査してから `restore` を通す）。iPhone の Safari は7日間開かないサイトの記録を消すが、ホーム画面に追加したアプリは対象外。

テーマは `<head>` で同期読み込みする `theme.js` が描画前に読み、ちらつきを防いでいる。ホームのメニューは日付をシードにした乱数で組むので、表示したメニューと実際に始まるセッションは一致する。

### 画面

画面は3つの `<section>`（`home`、`study`、`result`）を `hidden` で切り替える。多くの要素が `display` を指定しているため、グローバルの `[hidden]{display:none!important}` が必要。幅 960px 以上（PC）では最大 90rem まで横に広げ、ホームは `.today`（今日のメニューと開始ボタン）・`.status`（いまの状況と週ごとの変化）・`.more`（記録・自由練習・設定）をグリッドに配置し、出題画面は `#qcard` を「問題・回答 | 回答例・自己評価」の2列にする。スマホ幅では HTML の順に縦に並ぶ。

## ハマりどころ

- **Service Worker**（`sw.js`）: ネットワーク優先で `cache: 'no-cache'` を付けて取得し、`skipWaiting` と `clients.claim` を使う。`app.js` は `controllerchange` で1回だけ再読み込みする。GitHub Pages は `max-age=600` を返すため、この組み合わせでデプロイが次の再読み込みで反映される。キャッシュ優先や stale-while-revalidate に戻さないこと（以前それで利用者が古いコードから抜けられなくなった）。
- **読み上げの声**: 声を指定しないと、macOS の Chrome はかすれ声のジョーク用音声「Albert」を使う。ジョーク用音声は名前がローカライズされる（例: ささやき声）ため除外リスト方式は使えない。`englishVoices` は品質の良い声の許可リストだけを残し、未知の環境では任意の英語音声にフォールバックする。
- **制限時間**: `#timer` に CSS の `@keyframes drain` アニメーションを掛け、答えを表示したら `animationPlayState` で止める。自由練習ではこれとは別に `setTimeout` を1つ置き、時間切れで `reveal(true)` を呼ぶ（既定は10秒。`'auto'` は 2秒 + 1単語0.5秒）。今日の練習では時間で打ち切らない（Intermediate の Q&A にバーが出るだけ）。
- **話すのが先**: 回答は声に出すだけでよく、入力は任意（以前あった「英語を入力するまで答えを見られない」制限は、音声認識のない端末で詰むので外した）。🎤 は SpeechRecognition があれば文字起こし、なければ MediaRecorder で録音して回答例の横で再生する。どちらも無い端末ではボタンが出ないだけで練習は完了できる。録音の再生のために CSP に `media-src blob:` がある。
- **テーマ**: 色は `:root` の CSS カスタムプロパティで定義する。ダークモードは `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` と `:root[data-theme="dark"]` の2か所で再定義しているので、両方を必ず揃えること。レベルごとのアクセント色は `--lv1`〜`--lv5` で、`--lv` 経由で適用する。
- **問題文**: 必ずオリジナルで書く（例外は上の `replies.json` の定型句だけ）。`refs` に載せた参考サイトは分野構成の参考にしただけで、文をコピーしてはいけない。リポジトリは public なので、カードに利用者の実名や所属、実際の研究内容・結果を入れないこと（構文とQ&Aの例は架空の研究で、型を使い回す練習用）。
- **CSP（セキュリティ）**: リポジトリは public で、`main` がそのまま本番になる。`index.html` 先頭の `<meta>` CSP は `default-src 'none'` で、自サイトの読み込みと Trusted Types（`require-trusted-types-for 'script'`）だけを許可している。外部の CDN・フォント・インラインコード・`innerHTML` を足すと動かなくなる（`test/security.test.js` でも検査している）。Service Worker の登録だけは `sw` ポリシーを通す。フォントは端末のもの（Apple 端末ではヒラギノ丸ゴ）を使い、Google Fonts は外部への通信をなくすためにやめた。`main` はルールセット `protect-main` で force push と削除を禁止している。コミットのメールアドレスは GitHub の noreply アドレスにする。
- **ヘッドレス確認**: Chrome 拡張は使えないことが多い。セッションのスクラッチパッドに `playwright-core` を入れ、`executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'` で起動する。このリポジトリには入れないこと。
