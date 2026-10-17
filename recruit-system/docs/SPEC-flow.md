# SPEC-flow — 面接の流れ（準備 → 面接 → 評価 → 報告書）・1 段階ずつの進行画面・タイマー（作業仕様）

作成 2026-10-16。基準コミット `4df75ad`（全テスト緑: 単体 37 件・e2e E1〜E17 326 チェック）。**commit / push はしない**。
行番号は書かない（関数名・定数名・id で探すこと）。作業用は `scratchpad/p13/`（このセッションの scratchpad。試作 `proto-iv.js`＋`proto.css`〔面接の画面〕・`proto-paper.js`〔記入シート〕・`clocktest*.js`〔page.clock〕・`sticky.js`〔sticky と Playwright のクリック〕）。
リポジトリは公開中: 実名は笹川 晴央だけ・実ロゴ・実パスワードを入れない。`local/` の中身を出力しない。`node build.js --local`（引数なし）は実行しない。

---

## 0. 目的・前提・決定事項

### 0-1. 副支配人の指示
「今のままだと、使い方が全然分かっていないと適切な対応ができないため、もうちょっとインターフェースを簡単にして、初見でも分かりやすい感じで進めていければいい。なかなかチェック項目ばかりで、流れるような面接といったところで判断すると、まだまだな部分が多い。実際の面接を想定したかたちにしてほしい」

### 0-2. 選択（AskUserQuestion の回答。変更不可）
- 面接中の画面は **1 段階ずつの進行画面**（台本の ①〜⑤ を 1 画面ずつ。「話すこと」「確かめること」「聞くこと（その場でメモ）」だけを大きく出し、［次へ］で進む）
- 評価（○△×・人物像・総合判断）は **面接のあとにまとめて**（面接中は話す・聞く・メモだけ。必須条件だけは面接中に付ける〔不一致なら ⑤ への案内〕）
- 説明のチェックは **段階ごとに 1 つ**（話す内容は読み上げ用に並べ、チェックは段階ごとに「説明した」1 つ。説明しなかった項目があるときだけ、その項目を外せる）
- タイマーは **出す**（画面の上に「06:12 / 10分」。目安を過ぎたら色が変わるだけで止めない。面接全体の時間も報告書に残る）

### 0-3. オーケストレータの決定（G1〜G12。本書はこれを具体化する）
G1 ステップ 4 つ（準備・面接・評価・報告書。内部 step 1〜4。サイドバーに 1 行の説明・各画面の最上部に「この画面ですること」）／G2 準備（入力は今と同じ・「面接を始める →」・記入シート・はじめての方へ）／G3 面接（段階のチップ・タイマー・1 段階だけ・確かめる／話す／聞く・必須条件の案内・前へ／次へ／終える・右サマリーなし）／G4 タイマー（startedAt・perStage・endedAt・Date.now・page.clock）／G5 評価（結果カード・段階ごとのメモと ○△×・総評）／G6 報告書（A4 の面接メモは質問ごと）／G7 データ（`notes[質問 id]`・旧メモ保持・`timing`・schemaVersion 2）／G8 初見のわかりやすさ（動詞のボタン・右下の主ボタン・専門語なし・使い方）／G9 記入シート（面接 → 評価の並び・1 ページ）／G10 設定は変えない／G11 テスト（ヘルパの書き換え・既存の性質を落とさない・(1)〜(9) の追加）／G12 docs

### 0-4. 本書の決定（F1〜F24。迷ったらここに従う）
| # | 決定 |
| --- | --- |
| F1 | 内部 step ＝ 表示番号 1〜4（1 準備・2 面接・3 評価・4 報告書）。`goStep` の「2 → 1 の読み替え」をやめる。`normalizeRecord` の step は 1〜4 を通す（それ以外は 1） |
| F2 | 右サマリーは **準備・報告書だけ**。面接・評価は `.judge-layout.no-summary`（1 列で広く使う）。評価は上部の結果カードが右サマリーの代わり |
| F3 | 各ステップの最後に操作行 `.flow-foot`: **左に戻る・右端に主ボタン（`.btn.primary.lg`）**。面接・評価は画面の下に固定（sticky）、準備・報告書は流れの中 |
| F4 | 面接の本文は **1100px 以上で 2 列**: その段階の最初の質問ブロックより前のブロックを左、最初の質問ブロック以降を右（台本の順のまま「左の列 → 右の列」）。質問ブロックが先頭（⑤）・無い・1100px 未満は 1 列 |
| F5 | ブロックの見せ方: must・fields ＝「確かめること」、explain・notify ＝「話すこと」、question ＝「聞くこと」、note ＝ 流れの 1 行。rating は面接に出さない。続けて同じ種類なら見出しは 1 つ。ブロックの題（【説明】【質問】など）は出さない |
| F6 | 「説明した」は **段階×種類（explain／notify）に 1 つ**。押すと対象（短期のみの項目は求人が短期のときだけ）を true、すでに全部済みならその段階のその種類の全項目を外す（今の explain-all と同じ規則）。状態は on／mixed（一部）／off。項目ごとの付け外しは「一部説明しなかった ▾」を開いたときだけ |
| F7 | 短期のみ（`shortOnly`）の項目: 求人「短期」→ 出す（印なし・対象）／「通常」→ 出さない／未選択 → 「短期のみ」の印つきで出す（対象外）。ブロックの注記「※は短期求人に…」は未選択のときだけ |
| F8 | 質問ごとのメモ `cl.notes[質問 id]`（質問カードの下の textarea）。質問ブロックの `memo === false` ならメモ欄を出さない。旧メモ `cl.notes[ブロック id]` は値があるときだけ「（以前のメモ）」で出す（編集可） |
| F9 | 評価の画面で直せるのは **判定に効くもの**（必須条件・確認点・人物像・総合判断）と面接所見・面接時間。メモ・記入欄・説明は表示だけ（カードの「✎ 面接の画面で直す」で面接のその段階へ。タイマーは再開する＝G4） |
| F10 | タイマーは `Date.now()` の差分。面接の段階を表示しているあいだだけ数え、段階の切り替え・面接を離れる・保存・印刷のときに `perStage[段階 id]` へ秒を足す（1 秒未満は持ち越し）。時計が戻ったら 0 とみなす（負にしない）。**dirty にしない・判定を無効にしない** |
| F11 | 面接を表示したとき `startedAt` が無ければ入れる（「面接を始める」以外の経路〔サイドバー・読み込み〕でも）。面接から評価・報告書へ進むと `endedAt`（最後に離れた時刻で上書き）。準備・設定・使い方へ離れたときは止めるだけ |
| F12 | 報告書の面接時間は、評価の画面で入れた分（`timing.min`）があればそれ、無ければ perStage の合計（分に四捨五入。60 秒未満は「1分未満」）。**合計 0 秒で手入力もなければ出さない**（e2e の固定時計 `setFixedTime` で既存の A4 が変わらない）。目安は台本の段階の分の合計 |
| F13 | チップの「✓（済み）」は `perStage` にキーがある（表示したことがある）段階。今の段階には付けない。「省略可」が ✓ より優先 |
| F14 | 必須条件の案内は面接の全段階の上部（sticky）。「⑤ 逆質問へ」は案内先の段階を表示しているときは出さない。`mustFailResult = 'review'` のときは文言を変え、ボタン・省略可を出さない（今の `gateReject` と同じ） |
| F15 | 評価の「未入力」の強調・数は、必須条件の不一致で不採用推奨に固定（mustGate）のときは付けない（確認点・人物像・総合判断は任意） |
| F16 | 「はじめての方へ」は準備の画面だけ。localStorage `recruit.intro.v1` に `'1'`（読み書きは try/catch。使えなければページの変数で閉じたことを覚える） |
| F17 | 読み込みの再開先は 6-5 の表。旧レコードの step 3（旧 ②）は回答があれば評価・無ければ面接 |
| F18 | A4 の面接メモは **質問ごとの行** `.cl-nm-row.cl-nm-q[data-cl-note=<質問 id>]`（キーは「①＋短い名前」・値は 2 行まで）。旧メモの行は今のまま（`data-cl-block`・「1 問目 ほか n 問」）。`clFitSheet` は変えない。保存 HTML の `memoOf` は `data-cl-note` → `data-cl-block` の順に探す |
| F19 | A4 の面接時間は応募者の 2 行目（`dl.cl-sh-kv`）の末尾に「面接時間 32分（目安 41分）」 |
| F20 | 記入シートは「面接」（2 列: ①② ｜ ③④⑤。確かめる・話す〔□〕・聞く〔質問ごとに短い名前＋答えの線〕）→「評価」（確認点 2 列・人物像 2 列・総合判断・面接所見）。段階は `pp-a3 → pp-a2 → pp-a1 → pp-a1 pp-compact → zoom`。既定の白紙は pp-a2（質問ごとに 2 本） |
| F21 | 削除: ② の `#clHeader`・`#clGuide`・目次 `#clNav`・`.cl-page-head`・質問の 1 行表示（`q-toggle`／`q-all`）・「すべて説明した」（`explain-all`）・`#clPrintBtn`・`#clPaperBtn`・`#clMustAlert`・`cl-jump`・`#clScore`・`#clMustSummary`・`rerenderClHeader`・`syncQAll`／`setQOpen`。使わなくなった CSS も外す（付録 A-3） |
| F22 | data-action: 残す `cl-set`・`ps-set`・`script-next`・`to-step`・`judge`・`print-paper`・`print-checklist`・`save`・`stamp` ほか報告書のもの。新規 `iv-go`・`iv-prev`・`iv-next`・`iv-end`・`iv-said`・`iv-said-items`・`intro-ok`・`show-help` |
| F23 | キーボード: 面接で **Ctrl＋Enter（Mac は ⌘＋Enter）＝右下の主ボタン**（変換中は無視）。質問のメモは Tab で次の質問のメモへ（カードの中にほかのタブ位置を置かない）。段階を出したら見出し（`tabindex="-1"`）にフォーカスし、ページの先頭へ |
| F24 | 設定（G10）は構成・キーを変えない。画面の文言の「Step①②③」だけステップの名前（「準備」「面接」「評価」「報告書」）に（8 章） |

### 0-5. 試作で確かめたこと（scratchpad/p13。Chromium・既定の台本・公開版の dist に試作の DOM と CSS を差し込んで計測）
- **面接の画面**（付録 A の CSS。チップ 1 行・タイマー・2 列）: ②〜⑤ は 1440×900・1366×768・1280×800 でスクロールなし（段階の下端が操作行より上。②: 1280×800 で 679px）。① は最も長く、1440×900 で通常求人ならぴったり・短期求人で 50px・必須条件の案内つきで 110px はみ出す。1280×800・1366×768 は 120〜180px のスクロール（右の列の質問は全部見える）。390px は 1 列・横スクロールなし。必須条件の案内と「省略可」が出ると 1280px ではタイマーが 2 行目に回る（許容）
- **記入シート**（5-3 の構成）: 既定の白紙で pp-a3 1191px・**pp-a2 1050px**（面接所見の計測の最低 24mm）・pp-a1 910px・pp-a1 pp-compact 821px（上限 1052px）。所見の最低を 20mm にすると pp-a2 ≈ 1035px（実装で決めて e2e に入れる）。人物像を 1 列のままだと pp-a2 が 1172px で入らない → 人物像・確認点は 2 列
- **page.clock**（Playwright 1.56.1）: `setFixedTime` の後でも `install({ time })` できる。`pauseAt(未来)` で止めた時計でもクリック・入力・`waitForFunction` は動く。止めた時刻で数え始めて `runFor(372000)` で経過はちょうど 372 秒。`setFixedTime` を後から呼ぶと時計が戻る（アプリは負の経過を 0 にすること）
- **sticky と Playwright**: 上に sticky 2 段・下に sticky の操作行でも、画面外のボタンのクリックは失敗しない（`scroll-padding` があると少し速い）

---

## 1. 4 ステップ共通

### 1-1. STEPS・サイドバー・「この画面ですること」
```js
const STEPS = [
  { n: 1, no: 1, label: '準備', hint: '応募者の名前と面接の情報' },
  { n: 2, no: 2, label: '面接', hint: '台本どおりに話す・聞く・メモ' },
  { n: 3, no: 3, label: '評価', hint: '面接のあとに ○△×・人物像・総合判断' },
  { n: 4, no: 4, label: '報告書', hint: '押印・合否・保存' }
];
const STEP_LEAD = {
  1: '応募者の名前と面接の情報を入れて、「面接を始める」を押します。',
  2: '台本どおりに話す・聞く・メモ。○△× などの評価は面接のあとで付けます。',
  3: '面接のメモを見ながら、○△×・人物像・総合判断を付けます。',
  4: '用紙を確かめて押印し、報告書を保存（HTML）します。'
};
```
- 各ステップの HTML の先頭: `<p class="step-lead" id="stepLead"><b>この画面ですること</b><span>{STEP_LEAD[n]}</span></p>`
- `renderStepNav` は今のまま（`data-step` 1〜4・`.done`／`.current`／`.disabled`・番号は完了で ✓）。`#stepSectionTitle`「手順」・ナビ「報告書の作成」・トップバー「面接チェックリスト報告」は変えない。`index.html` の meta description の「3 ステップ」を「準備 → 面接 → 評価 → 報告書の 4 ステップ」に
- `renderStep()` の先頭で `layout.classList.toggle('no-summary', step === 2 || step === 3)`・`paper-stack` は今のまま外す。`document.documentElement.classList.toggle('flow-pad', view === 'judge' && (step === 2 || step === 3))`（scroll-padding。付録 A。`showView` でほかの画面に移るときも外す）。`--topbar-h` に `.topbar` の `offsetHeight` を入れる（`renderStep` と resize）
- `renderStep` の case: 1 `fillChecklistDefaults(); c.innerHTML = prepStepHtml(); applyVisibility();`／2 は 3-6／3 `fillChecklistDefaults(); c.innerHTML = evalStepHtml(); updateChecklistUI(true);`／4 は今のまま（先頭に `#stepLead`・操作行は 5-1）

### 1-2. ステップの移動
```js
function goStep(n) {
  n = [1, 2, 3, 4].indexOf(Number(n)) >= 0 ? Number(n) : 1;     // 2 → 1 の読み替えはしない（F1）
  if (state.step === 2 && n !== 2) ivStop(n >= 3);                // 面接を離れる: 数えた秒を足して止める。評価・報告書へなら endedAt（F11）
  if (n === 4) { state.judgment = evaluateNow(); state.judgmentStale = false; }
  state.step = n;
  state.maxStepReached = Math.max(state.maxStepReached, n);
  renderStepNav(); renderStep(); renderSummary();
  // スクロール（今のまま）。面接は段階の見出しにフォーカス（3-9）
}
```
- `showView(v)`: `v !== 'judge'` なら先に `ivStop(false)`（設定・使い方を見ているあいだは数えない。戻れば `renderStep` が再開）
- `newRecord()`・`applyRecord()`: 先に `ivStop(false)`
- `saveRecord()`・`prepareChecklistSheet(true)`・`preparePaperSheet(true)`: 先に `ivCommit()`（保存・印刷に今の段階の秒も入れる。止めない）

---

## 2. 準備（step 1）

### 2-1. ワイヤーフレーム（1280〜1440px）
```
┌ サイドバー ┐┌ トップバー: 面接チェックリスト報告  [● 山田 太郎 さん・未保存]      [＋新規][📂読み込み][💾保存（HTML）][🖨印刷] ┐
│ 手順        ││ [この画面ですること] 応募者の名前と面接の情報を入れて、「面接を始める」を押します。                                │
│ ① 準備      ││ ┌ はじめての方へ（#introCard。初回だけ）────────────────────────────────────────────┐ ┌右サマリー┐ │
│  応募者の…  ││ │ 面接台本のとおりに 4 つの手順で進めると、A4 1 枚の報告書ができます。                        │ │応募者    │ │
│ ② 面接      ││ │ [1 準備]名前と面接の情報  [2 面接]1 段階ずつ話す・聞く・メモ  [3 評価]面接のあとに…  [4 報告書]… │ │面接チェッ│ │
│ ③ 評価      ││ │                                               [使い方を見る] [わかった]               │ │クリスト  │ │
│ ④ 報告書    ││ └──────────────────────────────────────────────────────────────┘ │報告書    │ │
│             ││ ┌ 応募者（#scriptApplicantCard。今のまま 3 行）──────────────────────────────────┐ └─────────┘ │
│             ││ │ 氏名* 年齢 性別 区分（卒業予定）／面接日 面接担当者 応募した求人［通常］［短期］／タクシー メモ │             │
│             ││ └──────────────────────────────────────────────────────────────┘             │
│             ││ [🖨 記入シート（手書き用）]                                          [ 面接を始める → ]              │
└────────────┘└─────────────────────────────────────────────────────────────────────────────┘
```
- 1280×800 で、はじめての方への表示があっても「面接を始める →」はスクロールなしで見える（今の `#saNext` の下端 454px＋表示 約 150px＋1 行 約 34px）

### 2-2. DOM（確定値）
```html
<p class="step-lead" id="stepLead">…</p>
<section class="intro no-print" id="introCard" aria-labelledby="introH">           <!-- 閉じていなければ -->
  <h2 id="introH">はじめての方へ</h2>
  <p class="intro-lead">面接台本のとおりに 4 つの手順で進めると、A4 1 枚の報告書ができます。</p>
  <ol class="intro-steps">
    <li><b>準備</b><span>応募者の名前と面接の情報を入れる（氏名だけ必須）</span></li>
    <li><b>面接</b><span>台本の ①〜⑤ を 1 段階ずつ。話す・聞く・メモだけ</span></li>
    <li><b>評価</b><span>面接のあとに、メモを見ながら ○△×・人物像・総合判断</span></li>
    <li><b>報告書</b><span>用紙を確かめて押印し、保存（HTML）</span></li>
  </ol>
  <div class="intro-foot"><button type="button" class="btn sm ghost" data-action="show-help">使い方を見る</button>
    <button type="button" class="btn sm primary" id="introOk" data-action="intro-ok">わかった</button></div>
</section>
<div class="card" id="scriptApplicantCard">…今のまま（見出し「応募者」・説明 1 行・3 行の入力）…</div>
<div class="flow-foot" id="saActions">
  <button type="button" class="btn" id="saPaperBtn" data-action="print-paper" title="{PAPER_BTN_TITLE}">🖨 記入シート（手書き用）</button>
  <span class="spacer"></span>
  <button type="button" class="btn primary lg" id="saNext" data-action="script-next">面接を始める →</button>   <!-- startedAt があれば「面接に戻る →」 -->
</div>
```
- `script-next`: 今の `validateScriptApplicant()`（氏名必須・年齢は整数）→ `goStep(2)`（面接の表示で startedAt。F11）
- `intro-ok`: `try { localStorage.setItem('recruit.intro.v1', '1'); } catch (e) {}`・`introClosed = true`・`#introCard` を外し、`#saNext` は動かさない（フォーカスは `[data-field="name"]`）。`show-help`: `showView('help')`
- 表示の判定: `!introClosed && !(try localStorage.getItem('recruit.intro.v1') === '1')`
- `PAPER_BTN_TITLE` を「紙に書くときの A4 1 枚（面接・評価の画面と同じ並び）を印刷」に

---

## 3. 面接（step 2。新設の進行画面）

### 3-0. 面接の場面と画面の決め方
- 面接官はノート PC を前に応募者と向き合い、**画面を見るのは台本を読む・答えを短く打つ瞬間だけ**。1 段階 3〜10 分。視線は「上の帯（今どこか・時間）→ 左の列を上から（確かめる・話す）→ 右の列を上から（聞く・メモ）→ 右下の［次へ］」の 1 筆書き
- **読む文字は大きく**: 質問文 17px 太字（そのまま読み上げる）・話すこと 15px・必須条件 15.5px 太字・メモ 15px。**押すものは大きく**: 一致／不一致 42px×84px 以上・説明した 38px・次へ `.btn.lg`（約 46px）。チップ 36px
- 1 画面に 1 段階だけ。評価のボタン（○△×・1〜5・総合判断）は出さない＝押し間違い・迷いを無くす
- 色は状態だけ: 種類の見出しの細い帯（確かめる 青・話す 紫・聞く 青緑）・タイマーの超過（琥珀・赤）・必須条件の案内（赤）・説明した（緑）

### 3-1. ワイヤーフレーム（1440×900・① 勤務条件・短期求人）
```
[この画面ですること] 台本どおりに話す・聞く・メモ。○△× などの評価は面接のあとで付けます。
┌ #ivTop（sticky: トップバーの下）───────────────────────────────────────────────────────────┐
│ ┌ #ivBar ─────────────────────────────────────────────────────────────────────────────┐ │
│ │ (①勤務条件) (②継続性・報連相 ✓) (③仕事内容の説明 省略可) (④集団行動特性) (⑤逆質問)    この段階 06:12 / 目安 10分   合計 18:40 │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌ #ivMustAlert（不一致のときだけ。赤）──────────────────────────────────────────────────────┐ │
│ │ ⚠ 必須条件が合いません。追加で確認し、解消しなければ ⑤ 逆質問へ進んで最大 10 分で終了します   [⑤ 逆質問へ] │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────┘
┌ #ivStage ─────────────────────────────────────────────────────────────────────────────────┐
│ ① 勤務条件                                                       台本 花子さん・大学2年生・20歳・短期求人 │
│ 必須条件と報連相の意識・具体性を確認。最低限の話し方、敬語が可能か。必須条件が不一致なら…（1 行・…で切る）        │
│ ┃確かめること  1つでも不一致なら不採用（…「⑤」へ）    ┃聞くこと                                          │
│ 土日を含む週3日以上、5時間以上        [ 一致 ][不一致]   ┌────────────────────────────────────────┐ │
│ 指定繁忙期間すべて可（クリスマス…）   [ 一致 ][不一致]   │「いまのところ、短期希望ですか？…」or「…」（17px）  │ │
│ 土日勤務可否 [いずれか][両日]  出勤不可な繁忙 [____]    │ [答えをメモ_______________________________] │ │
│ ┃話すこと              [✓ 説明した][一部説明しなかった▾] └────────────────────────────────────────┘ │
│ ・交通費（往復500円まで/日）（15px）                     ┌ 「最初の2か月で勤務条件が満たせない可能性は？…」┐ │
│ ・営業開始・終了時間、タクシー条件の説明                   │ [答えをメモ_______________________________] │ │
│ ・初回契約は2か月間(契約日の翌月末)。                      └────────────────────────────────────────┘ │
│ ・長期への切り替えあり。本人希望と勤務状況等で判断          ┌ 「歌舞伎町ですので、ご家族の反対などあれば…」  ┐ │
│ ┃確かめること                                          │ [答えをメモ_______________________________] │ │
│ 短期／長期の希望 [短期希望][長期希望] 契約開始日 [____]   └────────────────────────────────────────┘ │
│ 初回契約終了 [____]  OPEN／25時までの可否 [____]          → 条件一致：2へ ／ 必須条件不一致：…「５」へ        │
└────────────────────────────────────────────────────────────────────────────────────┘
[← 前の段階 / ← 準備に戻る]                                          [評価に戻る] [ 次へ：② 継続性・報連相 → ]  ← #ivFoot（sticky: 画面の下）
```
- ⑤ 逆質問は 1 列（質問 → 話すこと〔合否連絡。［伝えた］〕）。主ボタンは「面接を終えて評価へ →」
- 390px: 1 列・帯は sticky にしない（チップは折り返す）・操作行だけ下に固定

### 3-2. DOM（確定値）
```html
<p class="step-lead" id="stepLead">…</p>
<div class="iv-top" id="ivTop">
  <div class="iv-bar" id="ivBar">
    <nav class="iv-chips" id="ivChips" aria-label="面接の段階">
      <!-- 段階ごと。今の段階 .is-current＋aria-current="step"、済み .is-done（✓）、省略可 .is-skip -->
      <button type="button" class="iv-chip is-current" data-action="iv-go" data-sec="conditions" aria-current="step">
        <span class="iv-chip-no">①</span><span class="iv-chip-t">勤務条件</span><span class="iv-chip-s"></span></button>
    </nav>
    <div class="iv-timer" id="ivTimer" role="timer" aria-live="off">
      <span class="iv-t-stage" id="ivTStage">この段階 <b class="num" id="ivTStageVal">00:00</b> <small id="ivTStageGoal">/ 目安 10分</small></span>
      <span class="iv-t-total">合計 <b class="num" id="ivTTotal">00:00</b></span>
    </div>
  </div>
  <div class="iv-must hidden" id="ivMustAlert" role="alert"><span class="ico" aria-hidden="true">⚠</span><span id="ivMustAlertText"></span>
    <button type="button" class="btn sm" id="ivMustJump" data-action="iv-go" data-sec="reverse">⑤ 逆質問へ</button></div>   <!-- 案内先が無ければボタンなし -->
</div>
<section class="iv-stage" id="ivStage" data-sec="conditions" aria-labelledby="ivStageH">
  <header class="iv-stage-head">
    <h2 id="ivStageH" tabindex="-1"><span class="iv-no">①</span>勤務条件</h2>
    <span class="iv-who" id="ivWho"><b>台本 花子</b>さん・大学2年生・20歳・短期求人</span>   <!-- 空の項目は省く。氏名が空なら「氏名未入力」 -->
    <p class="iv-lead" title="{全文}">{その段階が台本のページの最初の段階なら pages[].lead（1 行・…）}</p>
  </header>
  <div class="iv-cols is-two">                       <!-- 左の列が無ければ is-two なし（F4） -->
    <div class="iv-col">…左のブロック…</div>
    <div class="iv-col">…右のブロック…</div>
  </div>
</section>
<div class="flow-foot is-sticky" id="ivFoot">
  <button type="button" class="btn" id="ivPrev" data-action="iv-prev">← 前の段階</button>          <!-- 最初の段階は「← 準備に戻る」 -->
  <span class="spacer"></span>
  <button type="button" class="btn" id="ivToEval" data-action="iv-end">評価に戻る</button>    <!-- endedAt があり、最後の段階でないときだけ描く（hidden 属性は .btn の display に負けるので使わない） -->
  <button type="button" class="btn primary lg" id="ivNext" data-action="iv-next">次へ：② 継続性・報連相 →</button>
  <!-- 最後の段階: data-action="iv-end"・「面接を終えて評価へ →」 -->
</div>
```
グループとブロック（列の中。続けて同じ種類なら 1 つの `.iv-grp` に入れる）:
```html
<div class="iv-grp k-check" data-kind="check">
  <h3 class="iv-k"><span>確かめること</span><small>{must ブロックの note（あれば）}</small></h3>
  <!-- must: 項目ごと -->
  <div class="cl-must-row" data-item="must_weekly"><div class="cl-label">土日を含む週3日以上、5時間以上</div>
    <div class="score-seg cl-seg" role="group" aria-label="{label}">
      <button type="button" class="seg-btn wide match" data-action="cl-set" data-cl="values.must_weekly" data-value="match" aria-pressed="false">一致</button>
      <button type="button" class="seg-btn wide mismatch" data-action="cl-set" data-cl="values.must_weekly" data-value="mismatch" aria-pressed="false">不一致</button></div></div>
  <!-- fields: 今の .cl-field と同じ部品（choice は cl-set のボタン、text/date/month は input[data-cl]）。ラベルは全文 -->
  <div class="iv-fields" data-block="conditions_f1"><div class="field cl-field" data-item="weekend"><label>土日勤務可否</label>…</div>…</div>
</div>
<div class="iv-grp k-say" data-kind="say">
  <h3 class="iv-k"><span>話すこと</span>{notify なら <small>合否連絡</small>}
    <span class="iv-k-act">
      <button type="button" class="btn iv-said" data-action="iv-said" data-sec="conditions" data-kind="explain" aria-pressed="false">説明した</button>
      <button type="button" class="btn sm ghost iv-said-part" data-action="iv-said-items" data-sec="conditions" data-kind="explain" aria-expanded="false">一部説明しなかった ▾</button>
    </span></h3>
  <p class="iv-note">{注記。F7・3-4}</p>
  <ul class="iv-say-list" data-sec="conditions" data-kind="explain">              <!-- 項目ごとのモードは .is-items -->
    <li class="iv-say-i" data-item="ex_fare">交通費（往復500円まで/日）</li>
    <li class="iv-say-i short-only" data-item="ex_contract">初回契約は2か月間(契約日の翌月末)。<span class="tag">短期のみ</span></li>   <!-- 印は求人が未選択のときだけ -->
    <!-- .is-items のとき: <li class="iv-say-i is-on" data-item="…"><label><input type="checkbox" data-cl="values.ex_fare" checked><span>…</span></label></li> -->
  </ul>
</div>
<div class="iv-grp k-ask" data-kind="ask">
  <h3 class="iv-k"><span>聞くこと</span></h3>
  <p class="iv-note">{question ブロックの note（例 ⑤「※業務の大変な面も率直に伝える。」）}</p>
  <div class="iv-q" data-item="q_term"><div class="iv-q-text">「いまのところ、短期希望ですか？…」</div>
    <textarea class="iv-q-memo" data-cl="notes.q_term" rows="1" placeholder="答えをメモ" aria-label="短期／長期の希望 の答え"></textarea></div>
  <div class="field iv-oldmemo" data-block="conditions_q"><label>（以前のメモ）</label><textarea rows="2" data-cl="notes.conditions_q">…</textarea></div>  <!-- 値があるときだけ -->
</div>
<p class="iv-flow" data-block="conditions_flow">→ 条件一致：2へ　／　必須条件不一致：…</p>
```
- 質問文は全文（`label` を esc）。先頭が「「」でなければ「」で囲む
- 質問以外のブロックで `memo === true`（台本の編集で付けたもの）は、そのブロックの最後に `<div class="field iv-memo" data-block><label>{memoLabel||'メモ'}</label><textarea rows="2" data-cl="notes.{block id}"></textarea></div>`（rating ブロックのメモは評価の画面に出す）

### 3-3. 列の分け方・見出し（`ivStageHtml(sec)`）
- 対象: `sum.sections` の段階 `s` の `s.blocks` から rating を除いたもの。`qi = 最初の question ブロックの位置`。`qi > 0` なら `blocks[0..qi)` を左・`blocks[qi..]` を右、それ以外は 1 列
- 種類: `{ must: 'check', fields: 'check', explain: 'say', notify: 'say', question: 'ask', note: 'flow' }`。前のブロックと種類が同じなら同じ `.iv-grp` に足す。note はグループを閉じて `.iv-flow`
- 「説明した」の組は段階×種類（explain／notify）で 1 つ: その段階で**最初の** explain（notify）ブロックの位置に、段階のその種類の全項目を 1 つのリストで描き、2 つ目以降の同じ種類のブロックは描かない（台本の編集で離れて置かれても、`[data-action="iv-said"][data-sec][data-kind]` は段階に 1 つ）。explain と notify が続くときはグループを分ける（ボタンが別）

### 3-4. 話すこと（F6・F7）
```js
// 段階 sec の種類 kind（'explain'|'notify'）の項目。all: 全項目 id／shown: 画面に出す項目／targets: 「説明した」の対象
function ivSayItems(sec, kind) {
  const posting = String(state.checklist.header.posting || '');
  const its = []; secBlocks(sec).filter(b => b.type === kind).forEach(b => b.items.forEach(it => its.push(it)));
  return { all: its.map(it => it.id), shown: its.filter(it => !(it.shortOnly && posting === 'regular')),
           targets: its.filter(it => !it.shortOnly || posting === 'short') };
}
// 状態: targets が 1 つ以上で全部 true → 'on'／targets か shown のどれかが true → 'mixed'／それ以外 'off'
```
- `iv-said`: 'on' なら `all` を全部外す（`clSet('values.'+id, false)`＝キーを消す）、それ以外は `targets` を全部 true。`touchChecklist()`・`updateChecklistUI()`
- ボタン: off「説明した」(aria-pressed="false")／on「✓ 説明した」(true。緑)／mixed「✓ 一部説明した（{targets の true の数}/{targets の数}）」(mixed。琥珀の枠)。notify は「伝えた」「✓ 伝えた」「✓ 一部伝えた（n/m）」、開くボタンは「一部伝えなかった ▾」
- `iv-said-items`: `state.ivItems[sec + ':' + kind]`（画面の状態。`state.ivItems = {}` で始め、`newRecord`・`applyRecord` で空に戻す。記録に入れない）を反転し、そのリストだけ描き直す（`.is-items`。開くと ▴・aria-expanded="true"）。描き直したとき状態が mixed なら最初から開く。チェックボックスは `data-cl="values.{id}"`（`onFieldEvent` の今の処理: true／外すと消す）
- 読み上げモード（閉じている）の `li` にはタブ位置・クリックの処理を付けない（読むだけ。押し間違いで付け外ししない）
- 注記 `.iv-note`: explain ブロックの `note` は、求人が未選択で短期のみの項目を出しているときだけ。notify の `note`（「面接の最後に伝えたらチェック」）は常に

### 3-5. 聞くこと（F8・F23）
- カード 1 枚＝質問 1 つ。メモは `rows="1"` から内容に合わせて伸ばす（`ivAutosize(el)`: `height='auto'` → `min(scrollHeight+2, 168px)`。超えたら `overflow-y:auto`）。`onFieldEvent` で `.iv-q-memo` の input のたび・描いた直後に全部
- Tab の順は DOM の順（左の列 → 右の列 → 操作行）。質問カードの中はメモ欄だけがタブ位置＝Tab で次の質問のメモへ
- メモの入力は今の `data-cl="notes.*"` の経路（`clSet`・`touchChecklist`・`updateChecklistUI`）。入力で段階を描き直さない（フォーカス・変換を保つ）

### 3-6. 段階の移動
```js
function ivSections() { return clSummary().sections; }            // 台本の段階（設定の編集が反映される）
function ivCurrentSec() { const t = ivTiming(), ss = ivSections(); return ss.some(s => s.id === t.stage) ? t.stage : (ss[0] || {}).id; }
function ivShow(sec) { ivTiming().stage = sec; renderStep(); ivFocusHead(); }   // renderStep の case 2 が ivStart(ivCurrentSec())
```
- `iv-go`（チップ・案内の「⑤ 逆質問へ」・評価の「✎ 面接の画面で直す」）: 面接にいれば `ivShow(sec)`、ほかのステップからなら `ivTiming().stage = sec; goStep(2)`
- `iv-next`: 次の段階へ `ivShow`。`iv-prev`: 前の段階へ（最初の段階なら `goStep(1)`）。`iv-end`: `goStep(3)`
- `renderStep` の case 2: `fillChecklistDefaults(); const sec = ivCurrentSec(); ivStart(sec); c.innerHTML = interviewStepHtml(sec); ivAfterRender(); updateChecklistUI(true);`（`ivAfterRender`: メモの高さ・`--topbar-h`）
- チップの状態（`updateInterviewUI`）: `.is-current`（今の段階）＞ `.is-skip`（`gateReject` かつ 必須条件の段階より後・案内先より前。`.iv-chip-s`「省略可」）＞ `.is-done`（`perStage` にキーがある。`.iv-chip-s`「✓」）

### 3-7. タイマー（F10〜F12。app.js）
```js
let ivClock = null;   // { sec, since: Date.now() の値, iv: setInterval の id }。数えているのは 1 つだけ
function ivTiming() { const cl = ensureChecklist(); if (!U.isObj(cl.timing)) cl.timing = {}; if (!U.isObj(cl.timing.perStage)) cl.timing.perStage = {}; return cl.timing; }
function ivElapsed() { return ivClock ? Math.max(0, Math.floor((Date.now() - ivClock.since) / 1000)) : 0; }   // 時計が戻ったら 0
function ivCommit() {                                   // 数えた秒を perStage に足す（1 秒未満は持ち越す）。止めない
  if (!ivClock) return;
  const now = Date.now(), add = Math.max(0, Math.floor((now - ivClock.since) / 1000)), t = ivTiming();
  if (now < ivClock.since) { ivClock.since = now; return; }
  if (add) { t.perStage[ivClock.sec] = (Number(t.perStage[ivClock.sec]) || 0) + add; ivClock.since += add * 1000; }
}
function ivStop(ended) {
  if (ivClock) { ivCommit(); clearInterval(ivClock.iv); ivClock = null; }
  const cl = state.checklist;
  if (ended && cl && U.isObj(cl.timing) && cl.timing.startedAt) cl.timing.endedAt = new Date(Date.now()).toISOString();
}
function ivStart(sec) {
  ivStop(false);
  const t = ivTiming();
  if (!t.startedAt) t.startedAt = new Date(Date.now()).toISOString();
  t.stage = sec;
  if (!Object.prototype.hasOwnProperty.call(t.perStage, sec)) t.perStage[sec] = 0;
  ivClock = { sec: sec, since: Date.now(), iv: setInterval(ivTick, 1000) };
}
function ivStageSec(sec) { return (Number(ivTiming().perStage[sec]) || 0) + (ivClock && ivClock.sec === sec ? ivElapsed() : 0); }
function ivTotalSec() { const p = ivTiming().perStage; return Object.keys(p).reduce((a, k) => a + (Number(p[k]) || 0), 0) + ivElapsed(); }
function ivTick() {          // 表示だけ（#ivTStageVal・#ivTStage の色・#ivTTotal）。記録・判定・dirty・右サマリーは触らない
  if (!ivClock || !$('#ivTimer')) return;
  const s = ivSections().find(x => x.id === ivClock.sec) || {}, sec = ivStageSec(ivClock.sec), lim = (s.minutes || 0) * 60;
  setText('#ivTStageVal', fmtClock(sec)); setText('#ivTTotal', fmtClock(ivTotalSec()));
  const st = $('#ivTStage'); st.classList.toggle('is-over', lim > 0 && sec > lim); st.classList.toggle('is-late', lim > 0 && sec >= lim * 1.5);
}
function fmtClock(sec) { const m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }   // 60 分以上は「61:05」
```
- 目安の表示 `#ivTStageGoal`: `minutes > 0` なら `(minutesMax ? '/ 最大 ' : '/ 目安 ') + minutes + '分'`、0 なら空（色も変えない）。目安を過ぎたら `.is-over`（琥珀）・1.5 倍で `.is-late`（赤）。止めない・音を出さない・toast を出さない
- 描いた直後に `ivTick()` を 1 回（00:00 から始まらない）
- タブを隠しても止めない（面接は続いている）。面接のステップを離れたとき・設定／使い方を開いたときだけ止める
- 保存（buildRecord の前）・印刷（A4・記入シート）の前に `ivCommit()`

### 3-8. 必須条件の案内（F14。`updateInterviewUI`）
- `mm = sum.must.mismatch > 0`、`gateReject = mm && def.mustFailResult !== 'review'`、`jump = sum.sections.find(s => s.id === def.mustFailJumpTo)`
- 文言 `#ivMustAlertText`（`#ivMustAlert` の `title` に「不一致: {mismatchLabels を「、」で}」）:
  - gateReject・jump あり: `'必須条件が合いません。追加で確認し、解消しなければ ' + jump.noMark + ' ' + jump.title + 'へ進んで' + (jump.minutesText ? jump.minutesText.replace(/(\d+)分/, ' $1 分') : '') + 'で終了します'` → 既定「必須条件が合いません。追加で確認し、解消しなければ ⑤ 逆質問へ進んで最大 10 分で終了します」（分が無ければ「…へ進んで終了します」）
  - gateReject・jump なし: 「必須条件が合いません。追加で確認し、解消しなければ面接を終了します」
  - review: 「必須条件が合いません。追加で確認してください（このまま続けると、結果は上長最終判断要以下になります）」（「上長最終判断要」は `resultTitle('review')`）
- `#ivMustJump`: gateReject・jump があり、今の段階が jump でないときだけ（`.hidden`）。ボタン名 `jump.noMark + ' ' + jump.title + 'へ'`
- 「省略可」のチップは 3-6

### 3-9. キーボード・フォーカス（F23）
- `onContentKey` の先頭（人物像の処理の前）: `state.step === 2 && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing && e.keyCode !== 229` → `preventDefault`・`#ivNext` を click
- 段階を出したら（`ivShow`・`goStep(2)`）`#ivStageH.focus({ preventScroll: true })`・`window.scrollTo(0, 0)`（見出しはフォーカス枠を出さない `outline:none`）
- 必須条件・choice のボタンは今の `button`（Enter／Space）。チップも `button`

### 3-10. 表示の更新 `updateInterviewUI()`
`updateChecklistUI(noSummary)` は step で振り分ける:
```js
function updateChecklistUI(noSummary) {
  if (state.view === 'judge' && state.step === 2 && $('#ivStage')) updateInterviewUI();
  else if (state.view === 'judge' && state.step === 3 && $('#clOverall')) updateEvalUI();
  if (!noSummary) renderSummary();
}
```
`updateInterviewUI`: `cl-set` の押下（今の処理）・「説明した」のボタン（3-4）と項目モードの `li.is-on`・必須条件の案内（3-8）・チップ（3-6）。段階の中身は描き直さない

---

## 4. 評価（step 3。新設）

### 4-1. ワイヤーフレーム
```
[この画面ですること] 面接のメモを見ながら、○△×・人物像・総合判断を付けます。
┌ #evTop（sticky）──────────────────────────────────────────────────────────────────────────┐
│ ┃いまの結果 [上長最終判断要]  総合判断が未入力のため            未入力：確認点 6・人物像 7・総合判断          │
│ ┃面接評価 —/14　人物像 —/35                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────┘
面接時間 [ 18 ]分（タイマー 18分05秒・目安 41分）　① 15:00 ② 3:05 ③ — ④ — ⑤ —
┌ #cl-conditions（段階のカード）────────────────────── 15:00（目安 10分） [済] [✎ 面接の画面で直す] ┐
│ ┌ 面接のメモ（.ev-memo。灰色の地）───────────────────────────────────────────────┐            │
│ │ 土日を含む週3日以上、5時間以上      [一致][不一致]                                      │            │
│ │ 指定繁忙期間すべて可（…）           [一致][不一致]                                      │            │
│ │ 土日勤務可否 両日 ／ 出勤不可な繁忙 — ／ 短期／長期の希望 長期希望 ／ 契約開始日の希望 —  …    │            │
│ │ 説明：✓ 説明した（4/4）                                                                 │            │
│ │ 短期／長期の希望      長期で働きたい。卒業まで                                              │            │
│ │ 最初の2か月で…        問題なし                                                           │            │
│ │ 家族の反対            （メモなし）                                                        │            │
│ └────────────────────────────────────────────────────────────────────────┘            │
│ 確認点  ○ できている／△ やや不安／× できていない                                                       │
│ ┃勤務条件の一致に「具体性」があるか  「大丈夫です」のみ連呼は…   [○][△][×]  [メモ（任意）______]  ← 未入力は琥珀の帯 │
└──────────────────────────────────────────────────────────────────────────────────────┘
… ② ③ ④ ⑤ のカード …
┌ #clOverall 総評（今のまま）: 人物像 7 行×1〜5 → 総合判断［採用］［保留］［不採用］→ 説明 → 面接所見 ┐
└──────────────────────────────────────────────────────────────────────────────────────┘
[← 面接に戻る]                                                                        [ 報告書へ → ]  ← #evFoot（sticky）
```

### 4-2. DOM（確定値）
```html
<p class="step-lead" id="stepLead">…</p>
<div class="ev-top" id="evTop">
  <div class="ev-result" id="evResult" data-result="review">         <!-- recommend / review / reject -->
    <span class="ev-res-k">いまの結果</span>
    <span class="badge lg warn" id="evResultTitle">上長最終判断要</span>
    <span class="ev-res-why" id="evResultWhy" title="{理由の全文（adjustments の reason を改行でつなぐ）}">総合判断が未入力のため</span>
    <span class="ev-res-miss" id="evMissing">未入力：確認点 6・人物像 7・総合判断</span>   <!-- 無ければ .is-none「未入力はありません」 -->
    <span class="ev-res-score" id="clNavScore">面接評価 —/14　人物像 —/35</span>     <!-- 今の #clNavScore と同じ文言 -->
  </div>
</div>
<div class="ev-time" id="evTime">面接時間
  <input type="number" id="evTimeMin" data-cl="timing.min" min="1" max="600" step="1" placeholder="{タイマーの分}" value="{timing.min}" aria-label="面接時間（分）"
    title="紙から転記したときなどは、実際の時間（分）を入れてください。空にするとタイマーの値を使います">分
  <span class="ev-time-sub">（タイマー {m}分{ss}秒・目安 {goalMin}分）</span>        <!-- タイマーの記録が無ければ「（タイマーの記録なし・目安 41分）」 -->
  <span class="ev-time-st"><span class="ev-t-i">① 15:00</span>…</span></div>        <!-- 表示したことのない段階は「—」 -->
<section class="card cl-sec ev-sec" id="cl-conditions" data-sec="conditions">      <!-- 省略可は .cl-skippable（今の CSS） -->
  <div class="card-head"><h2><span class="cl-no">①</span>勤務条件</h2>
    <span class="ev-sec-time">15:00（目安 10分）</span><span class="cl-sec-state" id="clState-conditions"></span>
    <span class="cl-skip-note">必須条件不一致のため省略可</span>
    <button type="button" class="btn sm ghost ev-fix" data-action="iv-go" data-sec="conditions">✎ 面接の画面で直す</button></div>
  <div class="ev-memo">
    <div class="ev-must"><div class="cl-must-row" data-item="must_weekly">…面接と同じ部品（cl-set）…<span class="badge warn ev-miss">未確認</span></div></div>
    <dl class="ev-kv"><div data-item="weekend"><dt>土日勤務可否</dt><dd>両日</dd></div>…</dl>             <!-- 短い名前・値（日付は 2026/10/10・月は 2026年10月・空は —） -->
    <p class="ev-said" data-kind="explain">説明：✓ 説明した（4/4）</p>
    <dl class="ev-qa"><div data-item="q_term"><dt>短期／長期の希望</dt><dd>長期で働きたい</dd></div>
      <div data-item="q_family" class="is-empty"><dt>家族の反対</dt><dd>（メモなし）</dd></div></dl>
    <div class="ev-oldmemo" data-block="conditions_q"><span class="ev-memo-k">（以前のメモ）</span><div class="ev-memo-v">…</div></div>   <!-- 値があるとき -->
    <div class="ev-bmemo" data-block="…"><span class="ev-memo-k">{memoLabel||'メモ'}</span><div class="ev-memo-v">…</div></div>       <!-- 質問以外のブロックのメモ -->
  </div>
  <div class="ev-rate"><div class="ev-rate-h">確認点<span class="cl-legend">○ できている／△ やや不安／× できていない</span></div>
    <div class="cl-row cl-rate-row" data-item="rt_concrete">…今の確認点の行（.cl-row-main〔ラベル・hint・<span class="badge warn ev-miss">未入力</span>〕・○△× の cl-set・input.cl-note[data-cl="notes.rt_concrete"]）…</div></div>   <!-- バッジは .cl-row-main の中（グリッドの列を増やさない）。人物像の行は .cl-ps-main の中 -->
</section>
<div class="card" id="clOverall">…今の総評（見出し「総評」・#clPersona〔+ 4-6 の前書きの 1 行〕・#clPersonaOff・.cl-overall-row・説明の .hint・#overallWarn・面接所見）…</div>
<div class="flow-foot is-sticky" id="evFoot">
  <button type="button" class="btn" id="evBack" data-action="to-step" data-step="2">← 面接に戻る</button>
  <span class="spacer"></span>
  <button type="button" class="btn primary lg" id="toReportBtn" data-action="judge">報告書へ →</button>
</div>
```
- 文字はすべて `esc`（質問の短い名前・メモ・記入欄の値・項目名は設定・記録から入る）。メモは `white-space:pre-wrap`
- 説明 `.ev-said`: explain は A4 と同じ数え方（短期のみは求人が短期のときだけ）: 全部 →「説明：✓ 説明した（n/n）」／一部 →「説明：一部説明していない（{未チェックの短い名前を「、」で}）」／0 →「説明：していない」。notify は「合否連絡：✓ 伝えた」「合否連絡：一部伝えていない（…）」「合否連絡：伝えていない」。説明・合否連絡の項目が無い段階は出さない
- 記入欄・説明・質問の無い段階はその部分を出さない。確認点の無い段階は `.ev-rate` を出さない

### 4-3. 結果カード（`updateEvalUI`。入力のたびに `R.evaluateScript(state.applicant, cl, profile)` で計算〔`state.judgment` には入れない〕）
- `#evResult[data-result]`・`#evResultTitle` は結果の題とトーン（`RESULT_TONE`）
- 理由 `#evResultWhy`: adjustments があれば短い言い方を「・」でつなぎ「…のため」（`must_conditions` 必須条件が不一致／`must_unconfirmed` 必須条件に未確認／`overall_cutoff`・`overall_hold` 総合判断「{label}」／`persona_unscored` 人物像に未入力／`persona_total` 人物像の合計 {total}/{max}／`persona_one` 人物像に 1 点）。無ければ 総合判断ありで「総合判断「{label}」のとおり」・未入力で「総合判断が未入力のため」
- 未入力 `#evMissing`: mustGate なら「必須条件の不一致のため、ほかの入力は任意です」。それ以外は 必須条件の未確認 n・確認点の未入力 n・人物像の未入力 n（人物像を使う記録だけ）・総合判断（未入力なら）を「・」でつなぎ「未入力：…」、無ければ `.is-none`「未入力はありません」
- `#clNavScore`: 今の `updateChecklistUI` の文言のまま

### 4-4. 段階のカード（未入力の強調・省略可）
- `.is-missing`（琥珀の左の帯＋`.ev-miss` のバッジ）: 必須条件の未確認の行・確認点の未入力の行・人物像の未入力の行（`.cl-ps-row`）・総合判断が未入力の `.cl-overall-row`。**mustGate のときは付けない**（F15）
- `#clState-<sec>`: 不一致あり（赤）／確認点が全部入力「済」（緑）／一部「未入力 n」（琥珀）／確認点の無い段階は空
- 省略可: `gateReject` のとき 必須条件の段階より後・案内先より前のカードに `.cl-skippable`（今の CSS。点線の枠と「必須条件不一致のため省略可」）

### 4-5. 面接時間の行（F12）
- `#evTimeMin` の入力: `onFieldEvent` で `data-cl="timing.min"` を特別に扱う（1〜600 の整数なら `ivTiming().min = n`、それ以外・空なら `delete`）→ `touchChecklist()`。placeholder はタイマーの分（`timingSummary` の `timerMin`。記録が無ければ空）
- 段階ごと `① 15:00` は `perStage` から（表示したことのない段階は「—」）

### 4-6. 総評
- 今の `clOverallHtml` から `#clScore`・`#clMustSummary` を外す（結果カードにある）。人物像・総合判断・説明（`personaRuleText` を含む）・`#overallWarn`・面接所見は今のまま（e2e E17 の総評の確認がそのまま使える）
- 台本 1 枚目の前書きの「最低限の話し方、敬語が可能か」の付け先（今の `.cl-lead-ps`）は `#clPersona` の見出しの下へ移す: `<div class="hint cl-lead-ps" data-ps-ref="ps_speech">→ 台本 1 枚目の「最低限の話し方、敬語が可能か」は、この{ps.title}「{label}」で 1〜5 点を付けます。</div>`（条件は今の `clLeadPsHtml` と同じ。前書きは `sum.pages` の no 1）

---

## 5. 報告書（step 4）・A4・記入シート

### 5-1. 報告書の画面
- 先頭に `#stepLead`。`#scriptWarnings` のボタンを「評価で入力する」（`data-step="3"`）
- 操作行 `<div class="flow-foot no-print" id="rpFoot">`: `#backToChecklist`「← 評価に戻る」（`data-action="to-step" data-step="3"`）・`.spacer`・`#reportPrintBtn`「🖨 A4 で印刷」・`#reportSaveBtn.btn.primary.lg`「💾 報告書を保存（HTML）」（右端）。sticky にしない（印刷・押印カードのクリックと重ねない）
- 右サマリーは今のまま（紙の下に回す `paper-stack` も）

### 5-2. A4 の面接メモ（`storage.clOnePageHtml` の 6）・面接時間（F18・F19）
```js
sum.sections.forEach(function (s) {
  s.blocks.forEach(function (b) {
    if (b.type === 'question') {
      b.items.forEach(function (it) {                     // 質問ごと（新）
        const t = asStr(it.note).trim(); if (!t) return;
        qRows++;
        memoRows.push('<div class="cl-nm-row cl-nm-q" data-cl-note="' + esc(it.id) + '"><div class="cl-nm-k"><span class="cl-nm-no">' + esc(s.noMark) + '</span>' + esc(shortOf(it)) + '</div>' +
          '<div class="cl-nm-v">' + esc(t) + '</div></div>');
      });
    }
    // ブロックのメモ（旧レコードの質問ブロックのメモ・質問以外のブロックのメモ）は今のまま（data-cl-block・「1 問目 ほか n 問」・cl-nm-q／cl-nm-b）
  });
});
```
- 並び: 段階の順・ブロックの順・質問の順 → 確認点のメモ → 面接所見 → メモ（今のまま）。1 ページ保証（`clFitSheet`・`.cl-compact-q1` で 1 行・`.cl-compact-2` で質問の行を省いて案内）は**変えない**
- 面接時間: `sum.timing`（6-4）の `text` が空でなく、記録がある（`startedAt` か `min`）とき、`kvPush('面接時間', text + (goalMin ? '（目安 ' + goalMin + '分）' : ''))` を `タクシー可否・料金` の後に
- 保存 HTML の窓 `memoOf`（`a4PageScript`。ES5・関数内にコメントを書かない）: `b = row.getAttribute("data-cl-note") || row.getAttribute("data-cl-block");` に変える（以下は今のまま）。全メモの窓（`memos`）は行の順に出るのでそのまま

### 5-3. 記入シート（G9・F20。`storage.paperSheetHtml`・`paperSheetCss`・`fitPaperSheet`）
```
┌ 面接記入シート                                   台本 2026-10-08 版 ／ TOHOシネマズ新宿 ／ 印刷 2026/10/10 ┐
│ 氏名 ________ さん  面接日 ______  担当 ______  応募した求人 □通常求人 □短期求人  タクシー可否・料金 ______ │
│ ■面接 台本の順に：確かめる → 話す（□）→ 聞く（答えを線に）                                           │
│ ┃①勤務条件 目安 10分                         ┃③仕事内容の説明 目安 10分                              │
│ 土日を含む週3日以上、5時間以上   □一致 □不一致   話す □コンセ／フロア □多忙・立ち仕事・清掃 …              │
│ 指定繁忙期間すべて可（…）       □一致 □不一致   聞く 前職で大切にしていたこと ………………………             │
│ 土日勤務可否 □いずれか □両日   出勤不可な繁忙 __      ……………………………………………………………            │
│ 話す □交通費 □営業時間・タクシー □初回契約2か月※ …   前職の失敗談 ………………………………             │
│ 短期／長期の希望 □短期希望 □長期希望  契約開始日 __    …                                              │
│ 聞く 短期／長期の希望 ……………………………………      ┃④集団行動特性 目安 8分 …                                │
│      ……………………………………………………………        ┃⑤逆質問 最大10分                                          │
│      最初の2か月で条件を満たせない可能性 ………      聞く 気になる点（逆質問） ………………                     │
│ ┃②継続性・報連相 目安 3分 …                     合否連絡 □採用時 □不合格                                │
│ ■評価 面接のあとに付ける                                                                            │
│ 確認点（○ できている △ やや不安 × できていない）                                                       │
│ ① 勤務条件の一致に「具体性」があるか ○ △ ×     ③ 業務理解と接客の実行可能性 ○ △ ×                       │
│ ② 報連相できるか ○ △ ×  ② 離職要因は… ○ △ ×   ④ … ⑤ …                                               │
│ 人物像（接客） 1 不採用レベル … 5 とても良い                                           合計 ____ / 35 点 │
│ 1 挨拶ができていたか 1 2 3 4 5 … 4 声の…        5 目を見て… 1 2 3 4 5 … 7 志望動機…                       │
│ 面接者の総合判断  採用  保留  不採用（○で囲む）                                                         │
│ 面接所見 …………………………（残りの高さいっぱい）                                                            │
└────────────────────────────────────────────────────────────────────────────────────┘
```
- DOM: `.pp-sheet` > `.cl-title`（今のまま）・`dl.pp-who`（今のまま）・`<div class="pp-part" data-part="iv">面接<small>台本の順に：確かめる → 話す（□）→ 聞く（答えを線に）</small></div>`・`.pp-cols > .pp-col×2`（台本のページで分ける＝今のまま）> `section.pp-sec[data-sec]`（`h3.pp-h`: 番号＋題＋`<small>`「目安 10分」／「最大10分」）＞ ブロックの順に:
  - must: 今の `table.pp-t.pp-must`（`tr[data-pp-item]`）／fields: 今の `dl.pp-fields`
  - explain・notify: `div.pp-ex[data-pp-block]` の見出しを「話す」／「合否連絡」に（□短い名前・※は短期のみ・注記は今のまま）
  - question: `<div class="pp-qs" data-pp-block="{id}">` ＞ 質問ごと `<div class="pp-qa" data-pp-q="{id}"><span class="pp-k pp-qk">{1 問目だけ「聞く」}</span><span class="pp-qi">{短い名前}</span><span class="pp-ql"></span></div><div class="pp-qx" aria-hidden="true"><i></i><i></i></div>`（`memo === false` の質問ブロックは `.pp-ql`・`.pp-qx` なし）
  - rating: ここには出さない
- `<section class="pp-sum">`（残りの高さ）: `<div class="pp-part" data-part="ev">評価<small>面接のあとに付ける</small></div>` → `<div class="pp-k pp-rate-h">確認点（○ できている　△ やや不安　× できていない）</div>` → `<div class="pp-ev-cols">` に `table.pp-t.pp-rate` 2 つ（前半 ceil(n/2)・後半。行は `tr[data-pp-item]` > `td.pp-no`〔段階の番号〕・`td.pp-lbl`〔全文〕・`td.pp-mk`〔○△×〕）→ 人物像 `.pp-ps`（見出し・凡例・合計は今のまま。表を `.pp-ev-cols` の 2 つの `table.pp-ps-t` に前半 ceil(n/2)・後半。行は今の `tr[data-pp-ps]`。項目名は折り返してよい）→ 総合判断 `.pp-ov`（今のまま）→ 面接所見 `.pp-notes`（今のまま）。確認点が無い台本は確認点の部分を、人物像を使わない設定は人物像を出さない
- 段階 `fitPaperSheet`: `[['pp-a3'], ['pp-a2'], ['pp-a1'], ['pp-a1', 'pp-compact']]` → 縮小（`all = ['pp-a3','pp-a2','pp-a1','pp-compact']`。形は今のまま）。CSS: `.pp-sheet.pp-a2 .pp-qx i:nth-child(n+2){display:none}`・`.pp-sheet.pp-a1 .pp-qx{display:none}`。計測中の面接所見の最低は 20〜24mm（実装で測って、既定の白紙が pp-a2・① 入力ありも pp-a2 になる値。試作 24mm で 1050px＝ぎりぎり）
- 削除: `.pp-q`・`.pp-qn`・`.pp-qsep`・`PP_Q_LINES`・`pp-q3`〜`pp-q0` の規則

---

## 6. データモデル（G7）

### 6-1. 質問ごとのメモ
- `record.checklist.notes[質問 id]`（文字列。空にすると消す＝今の `clSet` の規則）。`checklistSummary` は今でも項目ごとに `r.note = notes[it.id]` を返すので、question の項目の `note` がそのまま使える
- 旧メモ `notes[ブロック id]` はそのまま保持（読み込み・表示・保存）。`checklistHasInput` は今のまま（どちらのメモも入力として数える）

### 6-2. `record.checklist.timing`（キーの追加だけ。schemaVersion 2 のまま）
```js
timing: {
  startedAt: '2026-10-10T00:00:00.000Z',   // 面接を初めて表示した時刻（ISO。無ければ ''）
  endedAt: '2026-10-10T00:32:10.000Z',     // 面接から評価・報告書へ最後に進んだ時刻（ISO。無ければ ''）
  stage: 'continuity',                     // 面接で最後に表示していた段階（再開先）
  perStage: { conditions: 900, continuity: 185 },   // 段階 id → 表示していた秒（整数）。表示したことがある段階はキーがある（0 でも）
  min: 35                                  // 評価で入れた面接時間（分。1〜600 の整数。任意）
}
```
- `R.emptyChecklist()` には足さない（無い記録＝タイマーの記録なし。単体 #96 の形のまま）。アプリは `ivTiming()` で必要になったとき作る

### 6-3. 正規化・保存
- `storage.normalizeTiming(t)`: object でなければ null。`startedAt`・`endedAt` は `Date.parse` できる文字列だけ（他は ''）・`stage` は `CL_ID_RE` に合う文字列（他は ''）・`perStage` は `CL_ID_RE` のキーで 0 以上の有限の数（`Math.floor`、86400 まで）・`min` は 1〜600 の整数だけ。ほかのキーは捨てる
- `normalizeRecord`: deepMerge のあとで `const tm = normalizeTiming(U.isObj(rec.checklist) ? rec.checklist.timing : null); if (tm) checklist.timing = tm; else delete checklist.timing;`。step は `[1, 2, 3, 4]` を通す（他は 1）
- `buildRecord`: 今のまま（`checklist` の deepClone に timing が入る）。呼ぶ前に `ivCommit()`（1-2）
- 往復: 保存 → 読み込み → 保存で `timing` が同じ（単体 #98）

### 6-4. 判定エンジン（rules.js）
```js
// 面接の時間（docs/SPEC-flow.md 6-4）。記録が無い（startedAt も min も無い）ときは null
function timingSummary(def, cl) → {
  startedAt, endedAt, stage, totalSec,            // perStage の合計（秒）
  timerMin: totalSec >= 60 ? Math.round(totalSec / 60) : null,
  manualMin: min | null, goalMin,                 // goalMin = 台本の段階の minutes の合計（既定 41）
  text: manualMin ? manualMin + '分' : totalSec >= 60 ? timerMin + '分' : totalSec > 0 ? '1分未満' : '',   // 報告書の値（'' は出さない）
  stages: [{ id, noMark, title, sec, visited, minutes, minutesMax, over: minutes > 0 && sec > minutes*60, late: minutes > 0 && sec >= minutes*90 }]
}
```
- `checklistSummary` の戻り値に `timing: timingSummary(def, cl)` を足す。`global.RecruitRules` に `timingSummary` を公開（単体 #88 の一覧にも）

### 6-5. 読み込みの再開先（F17。`app.applyRecord`。hasCl = `R.checklistHasInput`・sj = 保存時の判定あり・t = `checklist.timing`）
| 記録 | 条件 | 開く | 
| --- | --- | --- |
| 旧い形式（v1・mode: 'full'） | 回答あり＋判定あり／回答あり／回答なし | 4／3／**2** |
| step 4 | 判定あり／判定なし（回答あり・なし） | 4／3・2 |
| step 3（旧 ② を含む） | 回答あり／なし | **3**／**2** |
| step 2 | — | 2 |
| step 1 | 回答あり（t.startedAt あり・t.endedAt なし＝面接の途中）／回答あり（それ以外）／回答なし | 2／3／1 |
- `state.maxStepReached = Math.max(target, sj ? 4 : 0, hasCl ? 3 : 0, t && t.startedAt ? 2 : 0)`
- 面接で開くとき startedAt が無ければその時刻（F11。読み込んだ v1 の記録など）。toast は今のまま

---

## 7. 使い方・README（G8）

### 7-1. `helpHtml()`（`#view-help`）
1. 冒頭のカード: 見出し「{appTitle} の使い方」・説明「面接台本のとおりに 準備 → 面接 → 評価 → 報告書 の 4 つの手順で進めると、A4 1 枚の報告書ができます。」・`.help-steps` に 4 つ:
   - 1 準備: 応募者の名前（必須）・年齢・性別・区分、面接日・面接担当者・応募した求人、タクシー可否とメモを入れて「面接を始める」。紙に書いて面接するときは「🖨 記入シート（手書き用）」を印刷します。
   - 2 面接: 台本の ①〜⑤ を 1 段階ずつ表示します。上から 確かめること（必須条件は［一致］［不一致］）・話すこと（読み上げたら［説明した］）・聞くこと（答えを短くメモ）。［次へ］で次の段階へ。
   - 3 評価: 面接のあとに、段階ごとのメモを見ながら 確認点の ○△×・人物像（1〜5 点）・総合判断（採用／保留／不採用）・面接所見を付けます。上の「いまの結果」で推奨と未入力が分かります。
   - 4 報告書: A4 1 枚の用紙を確かめ、「面接対応者」に押印して「報告書を保存（HTML）」。最終確認と最終合否は副支配人が保存した HTML で押します（最終承認のパスワードがあるときはその入力が必要です）。
2. `<div class="card" id="helpInterview">` 見出し「面接の進め方（1 分で読めます）」・`ol.list-plain`:
   - 「面接を始める」でタイマーが動き、① 勤務条件から 1 段階ずつ表示します。
   - 1 つの段階は上から順に進めます：確かめること → 話すこと → 聞くこと（2 列の画面では左の列のあと右の列）。
   - 話すことは読み上げたら［説明した］を 1 回。言わなかった項目があるときだけ「一部説明しなかった」から外します（※短期求人のみの項目は、求人が短期のときだけ出ます）。
   - 聞くことは質問の下に答えを短くメモします（Tab で次の質問のメモへ）。○△× などの評価は面接のあとでまとめて付けます。
   - 上の帯に、この段階の経過時間と目安（過ぎると色が変わります。止まりません）・合計が出ます。段階の番号を押すとその段階へ移れます。
   - 必須条件が 1 つでも［不一致］になると赤い案内が出ます。追加で確認して解消しなければ ⑤ 逆質問へ進み、最大 10 分で終えます。
   - ⑤ の最後に合否連絡を伝えて［伝えた］を押し、「面接を終えて評価へ」。Ctrl＋Enter でも次へ進めます。
   - 1 対 1 でない面接は記入シートに書き、終わったら面接の画面に転記してください（報告書の面接時間は評価の画面で直せます）。
3. `#helpScriptFlow`（今のまま）→ `#helpPersona`（「Step② の総評」→「評価の画面の総評」・記入シートの場所「準備の画面の「🖨 記入シート（手書き用）」（「面接を始める →」の左）」・「面接中はメモを中心に」の項目は `#helpInterview` に移したので外す。rt_manner の注記は残す）→ 結果の決まり方・保存と読み込み（「途中で保存しても、読み込むと続きの段階から再開できます」）・設定・`#helpFinalLock`（「③ 報告書」→「報告書の画面」）は今の文言を手直し
- 項目名・目盛り・結果の表示名は今のまま `esc`

### 7-2. README（使い方〔配布〕）
- 3 ステップの説明を 4 ステップに置き換え、「面接の進め方」を 7-1 の 8 行で。記入シートの節は「面接 → 評価の並び・質問ごとに答えの線」に。HANDOFF の 1-1 と同じ内容

---

## 8. 設定（G10・F24。settings.js の文言だけ）
- `stepRef(n)` → `'「' + ({ 1: '準備', 2: '面接', 3: '評価', 4: '報告書' }[n] || n) + '」'`。呼ぶ側の前後の空白を外す（例 `stepRef(3) + 'の総評で'`・`'説明（' + stepRef(3) + 'に表示）'`・`stepRef(4) + 'に「採用」「不採用」のボタン'`）
- 必須条件の不一致の説明（`mustFailResult` の hint）の「`stepRef(3)` では…案内します」→ `stepRef(2)`（案内は面接の画面）。`GROUP_HINT`・応募者の属性の節の「Step①」→「「準備」」
- 構成・キー・data-bind・保存の規則は変えない

---

## 9. テスト計画（G11）

### 9-1. 単体（`node tests/rules.test.js`）
- 書き換え: #85 `normalizeRecord`（`legacy-full-stamps3` の step は 2・`{ step: 2 }` は 2）／#88 公開 API に `timingSummary`／#97 記入シート（新しい並び: `.pp-part` の順・`.pp-qa[data-pp-q]` 13 個・`.pp-ql`・確認点が評価の部分にあり段階の中に無い・人物像 2 表・CSS の文字列 `pp-a2`／`pp-a1`）／#63 `checklistSummary` に `timing`
- 追加 #98 `timing` の正規化と往復（壊れた値・範囲外・未知のキー・`min`・保存 → 読み込み → 保存で同じ・`R.emptyChecklist()` に timing が無い）
- 追加 #99 `timingSummary`（合計・目安 41・over／late の境界〔600/601 秒・900 秒〕・59 秒「1分未満」・0 秒は ''・手入力が優先・記録なし null）
- 追加 #100 A4 の面接メモ（質問ごとの行が段階順・キー「①短い名前」・`data-cl-note`・旧メモの行は「ほか n 問」のまま並存・面接時間の kv がある／無い〔0 秒・記録なし〕・面接時間 `esc`）・保存 HTML の `memoOf` が `data-cl-note` を見る（生成した HTML の文字列で）

### 9-2. e2e のヘルパ（`tests/e2e.js`）
```js
const goTo = async (n) => { await st(n => window.RecruitApp.goStep(n), n); await wait(250); };    // サイドバーの無効を通らない移動
const ivGo = async (sec) => { await page.click('#ivChips [data-action="iv-go"][data-sec="' + sec + '"]'); await wait(150); };
const clWhere = (id) => st(id => { const x = window.RecruitRules.checklistItems(window.RecruitApp.state.profile.checklist).find(x => x.item.id === id); return x ? { type: x.block.type, sec: x.section.id } : null; }, id);
// setCl: 押すボタンが今の画面に無ければ出す（header.* → 準備・必須条件／確認点／総合判断 → 評価・記入欄 → 面接のその段階）
const setCl = async (path, v) => {
  const cur = await st(p => window.RecruitUtil.getPath(window.RecruitApp.state.checklist, p) || '', path);
  if (cur === v) return;
  const sel = `[data-action="cl-set"][data-cl="${path}"][data-value="${v}"]`;
  if (!(await page.$(sel))) {
    if (path.indexOf('header.') === 0) await goTo(1);
    else { const w = path === 'overall' ? { type: 'rating' } : await clWhere(path.replace(/^values\./, ''));
      if (!w || w.type === 'rating' || w.type === 'must') await goTo(3); else { await goTo(2); await ivGo(w.sec); } }
  }
  await page.click(sel);
};
// setPs: ps-set が無ければ評価へ。rateAll: 先に評価へ（必須条件・確認点・総合判断・人物像は全部評価の画面にある）
// judge: #toReportBtn があれば押す・無ければ goTo(4)
// said(sec, kind='explain'): 面接のその段階で [data-action="iv-said"][data-sec][data-kind] を押す（旧 exAll）
// fillMemos(text): 面接の各段階で #ivStage textarea[data-cl^="notes."] を埋め、評価で input.cl-note を埋める（旧 E8 の重いサンプル）
// mk39（記録を直接作る E8・E14・E16 の用紙の確認）: 今の o.q（ブロックのメモ＝旧レコードの形）はそのまま残す（互換の確認になる）。
//   o.qi（質問ごとのメモ `cl.notes[質問 id]` に Lx(o.qi)）と o.tm（`cl.timing`）を足し、新しい形の 1 ページの確認（E18 (5)・E8）に使う
```
- `navStep(n)`・`fillScript`・`fresh()`・`saveRecord`・`stepNav`・`judgment` は今のまま。`navStep(3)` は評価（必須条件・確認点・総合判断がある画面）に着くので、「② に戻って直す」の呼び出しはほぼそのまま通る
- `script-next` の後の `step()` は 2。sticky を外して要素を撮る `shotEl17` の style に `.iv-top,.ev-top,.flow-foot.is-sticky{position:static !important}` を足す

### 9-3. 既存の確認の対応（落とさない性質）
| 既存 | 新しい確認 |
| --- | --- |
| E1 サイドバー 3 ステップ・`script-next` で 3・1280×800 で「面接チェックリストへ進む」が見える | 4 ステップ `[['1','1','準備'],['2','2','面接'],['3','3','評価'],['4','4','報告書']]`＋hint・`script-next` で 2・はじめての方への表示ありで「面接を始める →」が 1440×900・1280×800 でスクロールなしに見える |
| E2 ② の構成（①〜⑤＋総合判断）・`#clHeader` 1 行・「すべて説明した」・戻る／進む・必須条件の案内（文言・省略可・⑤ へ移動）・判定 | 面接: `#ivChips` 5 個・`#ivStage[data-sec]`・種類の見出し・`#ivWho`（氏名・区分・年齢・短期求人。消極属性なし）・1366／1280px でチップ 1 行。「説明した」（9-4 (4)）。戻る／進むの文言（「← 準備に戻る」「次へ：② 継続性・報連相 →」「← 面接に戻る」「報告書へ →」）。必須条件の案内（9-4 (3)）。評価に `#cl-<sec>` 5 枚＋`#clOverall`。判定・紙・押印 2 欄は今のまま |
| E4 旧レコードの読み込み（full 3 印は 3・v1 は 3） | full 3 印（回答なし）は **2**・v1（回答なし）は **2**・full の回答＋判定ありは 4（今のまま） |
| E5 390px で ②・① の横スクロールなし | 面接（① と ⑤）・評価・準備で横スクロールなし |
| E6 ② から保存・② で再開・② の印刷ボタン・「すべて説明した」（通常求人） | 評価から保存（`rec.step === 3`・判定入り）→ 読み込むと評価で再開・面接から保存（step 2）→ 面接の同じ段階で再開・トップバー 🖨 と Ctrl+P（beforeprint）は今のまま・`#clPrintBtn` の確認は削除・通常求人の「説明した」は 9-4 (4) |
| E7 消極属性の旧レコードで ② のヘッダーに出さない | 面接の `#ivWho`・評価に消極属性を出さない |
| E8 重いサンプル（ブロックのメモ 300 字） | 質問ごとのメモ 13 個に 300 字＋確認点のメモ＋面接所見 1,500 字（`fillMemos`）→ 1 ページ・押印行が下端・1052px 以内（段階は実測の値に合わせる） |
| E10 設定の文言「Step②」「Step③」・使い方 3 ステップ | 「「評価」」「「報告書」」・使い方 4 ステップ＋`#helpInterview` |
| E12 mustFailResult=review の案内・確認点の増減が ② に反映 | `#ivMustAlertText` の review の文言・ボタンと省略可なし／評価の `#cl-<sec> .cl-rate-row` の数・面接 ① の必須条件の新しい文言 |
| E17 ② の案内・目次「総評」・前書きの 1 行・質問の 1 行表示 | 削除（9-4 で置き換え）。前書きの 1 行は `#clPersona .cl-lead-ps`。人物像（クリック・数字キー・合計・1 点・状態）・総評の並び・ダークの押下のコントラストは評価の画面で今の確認のまま |
| E17 記入シート（PDF 1 ページ・面接日の線・本物の print の経路・3 秒の片付け・人物像 7 行・確認点 6 行・必須条件 2 行・2 段） | 今の確認＋新しい並び（9-4 (9)） |
| E3・E9・E11・E13〜E16（押印・合否・保存 HTML・パスワード・ロゴ・A4 の用紙・用紙を埋める） | ヘルパの書き換えだけで今の期待値のまま（面接時間は固定時計で 0 秒＝A4 に出ない） |

### 9-4. E18 面接の流れ（追加。G11 (1)〜(9)）
1. **初見の通し**（画面のボタンだけ。`st` で状態を書き換えない）: `fresh()` → `#introCard` → ［わかった］ → 氏名 → 「面接を始める →」→ ① 一致×2・記入欄・［説明した］・メモ 3 → ［次へ］…（②〜④ も説明した・メモ）→ ⑤［伝えた］・メモ → 「面接を終えて評価へ →」→ 確認点 6 つに ○・人物像 7 つに 4・総合判断「採用」・所見 →「報告書へ →」→ 採用推奨 → 面接対応者に押印 → 保存（`rec.step === 4`・`notes.q_*` 13 個・`timing.startedAt`／`endedAt`／`perStage` 5 キー）・ページエラーなし
2. **段階のチップとタイマー**（別の BrowserContext: `ctx18 = browser.newContext(...)`・`p.clock.install({ time: NOW })` → goto → `p.clock.pauseAt(new Date(+NOW + 60000))`）: 開始直後「00:00」「/ 目安 10分」→ `runFor(372000)` で「06:12」・色なし → 601 秒で `.is-over` → 900 秒で `.is-late`・合計「15:00」→ ［次へ］で ②「00:00」・① のチップ ✓ → `runFor(185000)` で合計「18:05」→ ① のチップで戻ると「15:00」から → ⑤ の目安「/ 最大 10分」→ 終えると `endedAt`・評価 `#evTime`「タイマー 18分05秒・目安 41分」・placeholder「18」→ 報告書の A4「面接時間 18分（目安 41分）」→ `#evTimeMin` に 35 →「面接時間 35分」→ 保存 → 読み込みで `timing` が同じ。設定・使い方を開いているあいだは数えない
3. **必須条件の不一致**: ① で［不一致］→ `#ivMustAlert` が出る・文言が 3-8 の既定の文・②③④ のチップ「省略可」・「⑤ 逆質問へ」で ⑤ が今の段階・⑤ ではボタンなし（案内は残る）・評価で ②〜④ のカードが `.cl-skippable`・未入力の強調なし・結果「不採用推奨」→ ① を［一致］に戻すと案内・省略可が消える
4. **説明した**: 通常求人の ① は 2 項目（短期のみなし）→［説明した］で `ex_fare`・`ex_hours` が true・「✓ 説明した」aria-pressed="true" →「一部説明しなかった ▾」で 2 つのチェック → `ex_hours` を外すと「✓ 一部説明した（1/2）」・mixed →［説明した］で全部 → もう一度で全部外れる（キーが消える）／短期求人は 4 項目・4 つとも true／未選択は 4 項目（「短期のみ」2 つ）・押すと 2 つだけ true・注記が出る／⑤［伝えた］で `nt_hire`・`nt_reject`
5. **質問ごとのメモ**: `notes.q_term` に入る・Tab で `q_two_months` のメモへ（`document.activeElement`）・メモが伸びる（3 行で高さが増える）・評価の ① のカードに「短期／長期の希望」と答え・報告書の A4 に `.cl-nm-q[data-cl-note="q_term"]`（キー「①短期／長期の希望」）・保存 HTML で切れたメモの窓が全文。質問文・メモの `<img onerror>` は文字のまま（XSS）
6. **評価の画面**（面接で必須条件を 2 つとも一致にしたあと）: 入力前「上長最終判断要」・「未入力：確認点 6・人物像 7・総合判断」・`.is-missing` が確認点 6・人物像 7・総合判断 1 → 確認点を 1 つ付けると 5 → 全部入れて「採用推奨」「未入力はありません」・理由「総合判断「採用」のとおり」→ 保留で「総合判断「保留」のため」・`#clNavScore`・必須条件の未確認は「未確認」バッジ
7. **はじめての方へ**: 閉じると `localStorage['recruit.intro.v1'] === '1'`・再読込で出ない・`fresh()` で出る・localStorage が例外を投げても閉じられる（`page.addInitScript` で `Storage.prototype.getItem/setItem` を throw にした別ページ）・「使い方を見る」で使い方
8. **旧レコード**: `legacy-pre-persona.html` の記録を step 3・`notes.continuity_q` ありに書き換えた HTML（`<script type="application/json" id="recruit-record">` だけの最小の HTML でよい）→ 評価で開く・② のカードに「（以前のメモ）」と本文・面接の ② に `.iv-oldmemo textarea[data-cl="notes.continuity_q"]`・A4 は「②前のバイトの期間・退職理由 ほか2問」の行（今のまま）・timing なし（`#evTime` は「タイマーの記録なし」・A4 に面接時間なし）。回答なしの step 3 は面接で開く
9. **記入シート**: 準備の「🖨 記入シート」→ `.pp-part` が「面接」「評価」の順・`.pp-qa[data-pp-q]` が 13 個・どれにも `.pp-ql`・既定の白紙は `pp-a2`・確認点 6 行が評価の部分・人物像 7 行・PDF 1 ページ・① 入力ありでも 1 ページ
- そのほか: 1440×900 で ②〜⑤ は段階の下端が操作行より上（スクロールなし）・① ははみ出し 80px 以内／1280×800 で ②〜⑤ はスクロールなし／390px で面接・評価の横スクロールなし／ダークで「✓ 説明した」・今のチップ・タイマーの超過の文字のコントラスト 4.5:1 以上（今の E17 の測り方）／Ctrl+Enter で次の段階

### 9-5. スクリーンショット（tests/shots。git 管理外）
`p13-prep-intro.png`（準備・はじめての方へ）・`p13-iv-1.png`（面接 ①・1440×900）・`p13-iv-1-mm.png`（必須条件の案内）・`p13-iv-5.png`（⑤）・`p13-iv-390.png`・`p13-eval.png`（評価 全体）・`p13-report.png`（A4: 質問ごとのメモ・面接時間）・`p13-paper.png`（記入シート）

---

## 10. 実装順
1. rules.js: `timingSummary`・`checklistSummary.timing`・公開 → 単体 #99・#63・#88
2. storage.js: `normalizeTiming`・`normalizeRecord`（timing・step 1〜4）→ #98・#85。A4 の質問ごとの行・面接時間・`memoOf` → #100。記入シート（構成・CSS・`fitPaperSheet`）→ #97
3. app.js: STEPS・`STEP_LEAD`・`goStep`／`showView`／`renderStep`（no-summary・flow-pad・--topbar-h）→ 準備（intro・`#saActions`）→ 面接（描画・`iv-*`・タイマー・`updateInterviewUI`・キー）→ 評価（描画・`updateEvalUI`・時間の入力）→ 報告書の文言 → `applyRecord` の再開先 → 保存・印刷の `ivCommit` → 使い方 → 消すもの（F21）
4. styles.css: 付録 A を足し、A-3 を消す。settings.js の `stepRef`。index.html の description
5. `node tests/rules.test.js` → `node build.js` → e2e のヘルパ → E1・E2・E4〜E8・E10・E12・E17 → E18 → 全部緑（約 6 分）
6. docs（12 章）・スクリーンショット

## 11. 落とし穴
1. `goStep` の `if (n === 2) n = 1;` と `normalizeRecord` の `[1, 3, 4]` を両方直す（片方だけだと面接で保存した記録が準備で開く）。旧 `legacy-full-stamps3`（mode: 'full'・step 2）は旧い形式の分岐が先なので面接（回答なし）で開く
2. `updateChecklistUI` の「`state.step !== 3` なら何もしない」をそのまま残すと面接の画面が更新されない。`renderStep` の case の番号（3 → 2 と 3）
3. タイマーの tick で `touchChecklist`・`invalidateJudgment`・`renderSummary` を呼ばない（毎秒 dirty・判定のやり直し・右サマリーの描き直しになる）。setInterval は常に 1 つ（`ivStart` が先に `ivStop`）。`renderStep` を何度呼んでも二重に数えない
4. Date.now が戻ることがある（PC の時計・e2e の `setFixedTime`）。経過は `Math.max(0, …)`
5. e2e は `setFixedTime(NOW)` で時計が止まっている＝perStage は 0。A4・評価の時間は「出さない／記録あり 0 秒」の扱いになる（F12）。タイマーの確認は別の BrowserContext（9-4 (2)）。止めた時計では toast が消えない・`afterPrintOnce` の 3 秒が来ない
6. 段階の切り替え・面接を離れる・保存・印刷の前に `ivCommit()`。忘れると保存した記録に今の段階の秒が入らない
7. 面接で段階の中身を入力のたびに描き直さない（メモの変換中の文字・フォーカスが消える）。「説明した」の項目モードの切り替えはそのリストだけ描き直す
8. 「説明した」を外すときは段階のその種類の全項目（通常求人のときに付けていた短期のみも）。付けるときは対象だけ（今の explain-all と同じ）
9. 評価の未入力の強調は mustGate で付けない。評価の結果は `state.judgment` に入れない（報告書へ進むときに `goStep(4)` が判定する）
10. A4 の `clFitSheet` の関数・セレクタ文字列は変えない（単体 #93 の疑似 DOM）。質問ごとの行は `.cl-nm-q` なので段階・広げる順にそのまま乗る
11. 保存 HTML の `a4PageScript` は ES5・関数内にコメントを書かない・閉じタグを書かない（build.js が src の `</script` を拒否）
12. sticky: `.iv-top`／`.ev-top` は `top: var(--topbar-h)`（トップバーの高さは折り返しで変わる）。840px 以下は sticky にしない。`html.flow-pad` の scroll-padding で Tab のフォーカス・Playwright のクリックが固定の帯に隠れない
13. 全体のスクリーンショット（fullPage）では sticky の要素が途中に写る。撮るときは `.iv-top,.ev-top,.flow-foot.is-sticky` を static にする
14. グローバルの `textarea { min-height: 84px }` を `.iv-q-memo` で打ち消す（1 行から伸ばすため）
15. `fresh()` のたびに「はじめての方へ」が出る（準備の要素の位置が下がる）。位置を測る既存の確認は表示ありで測る
16. 設定で台本の段階を消すと `timing.stage`・`perStage` に無い段階 id が残る。`ivCurrentSec` は無ければ最初の段階・合計は全キーの和（費やした時間）・評価の段階ごとの表示は今の段階だけ
17. ダーク: 新しい色（`--k-say`・`--k-ask`・`--warn-text`）は `:root[data-theme="dark"]` と `@media (prefers-color-scheme: dark)` の両方に

## 12. docs（G12）
- **HANDOFF.md**: 冒頭の題と箇条に「2026-10-16: 面接の流れ（準備 → 面接 → 評価 → 報告書）」（副支配人の指示・選択・本書）。1-1 画面を 4 ステップで書き直す（id は本書 2〜5 章）。1-2 に `timingSummary`。1-3 に `timing`・step 1〜4・再開先。1-5 に A4 の質問ごとの行・面接時間、記入シートの並び。1-6 に単体・e2e の件数（E18 を含む）。2 章の表に「Q. 面接の流れ（2026-10-16）」（4 ステップ・1 段階ずつ・評価は面接のあと・説明は段階に 1 つ・タイマー）。3 章の TODO に「面接時間の扱い（タブを隠しても数える・評価で直せる）を実機で確認」「1366×768 の実機（ブラウザの枠で縦 620px 前後）で ① のスクロール量」。4 章の早見表に「面接の画面（`interviewStepHtml`・`ivStageHtml`・`iv-*`・タイマー `ivStart`／`ivStop`／`ivCommit`）」「評価の画面（`evalStepHtml`・`updateEvalUI`）」「はじめての方へ（`recruit.intro.v1`）」
- **README.md**: 7-2
- **SPEC-persona.md**: 冒頭に注記「2026-10-16 の SPEC-flow で ② は 面接（進行画面）と 評価 に分かれた。3-1（上部の案内・記入シートのボタン）・3-5（質問の 1 行表示）・目次は無効。総評カード `#clOverall` は評価の画面（3-2〜3-4 は有効）。前書きの 1 行（`.cl-lead-ps`）は `#clPersona` の中。5 章の記入シートの並びは SPEC-flow 5-3」
- **SPEC-a4.md**: 冒頭に注記「面接メモ・所見の枠の質問の回答は質問ごとの行（`data-cl-note`）・応募者の 2 行目に面接時間（SPEC-flow 5-2）。1 ページ保証・押印行・画面と印刷の一致は変えない」
- 本書の末尾に「13. 実装時の差分」を実装者が足す（実測した値・本書と変えたこと）

---

## 付録 A. CSS（styles.css。試作 `proto.css` を整えたもの）

### A-1. 追加
```css
/* ---------- 4 ステップの流れ（準備 → 面接 → 評価 → 報告書。docs/SPEC-flow.md） ---------- */
:root { --k-check: var(--accent); --k-say: #7c3aed; --k-ask: #0f766e; --warn-text: #b45309; }
:root[data-theme="dark"] { --k-say: #b392f0; --k-ask: #2dd4bf; --warn-text: var(--warn); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --k-say: #b392f0; --k-ask: #2dd4bf; --warn-text: var(--warn); } }
.step-lead { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 13.5px; line-height: 1.5; }
.step-lead > b { flex: none; padding: 1px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 800; }
.judge-layout.no-summary { grid-template-columns: minmax(0, 1fr); }
.judge-layout.no-summary .summary { display: none; }
.flow-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.flow-foot .spacer { flex: 1 1 auto; }
.flow-foot.is-sticky { position: sticky; bottom: 0; z-index: 12; padding: 12px 0; background: linear-gradient(to bottom, transparent, var(--bg) 12px); }
.btn.lg { padding: 11px 22px; font-size: 15.5px; border-radius: 9px; }
@media (min-width: 841px) { html.flow-pad { scroll-padding-top: calc(var(--topbar-h, 57px) + 80px); scroll-padding-bottom: 84px; } }
/* はじめての方へ */
.intro { padding: 14px 18px; border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border)); border-radius: var(--radius); background: var(--accent-soft); }
.intro h2 { font-size: 15px; font-weight: 800; }
.intro-lead { margin: 2px 0 8px; font-size: 13px; color: var(--muted); }
.intro-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; counter-reset: intro; }
.intro-steps li { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--surface); font-size: 12.5px; line-height: 1.45; color: var(--muted); }
.intro-steps li b { font-size: 14px; color: var(--text); }
.intro-steps li b::before { counter-increment: intro; content: counter(intro) " "; color: var(--accent); }
.intro-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
@media (max-width: 840px) { .intro-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .intro-steps { grid-template-columns: minmax(0, 1fr); } }
/* 面接（進行画面） */
.iv-top, .ev-top { position: sticky; top: var(--topbar-h, 57px); z-index: 15; display: flex; flex-direction: column; gap: 8px; margin-top: -8px; padding-top: 8px; background: var(--bg); }
.iv-bar { display: flex; align-items: center; gap: 8px 16px; flex-wrap: wrap; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
.iv-chips { display: flex; gap: 5px; flex-wrap: wrap; min-width: 0; }
.iv-chip { display: inline-flex; align-items: center; gap: 5px; min-height: 36px; padding: 3px 11px; border: 1px solid var(--border-strong); border-radius: 999px; background: var(--surface); color: var(--text); font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.iv-chip:hover { background: var(--surface-3); }
.iv-chip-s { font-size: 11.5px; font-weight: 800; } .iv-chip-s:empty { display: none; }
.iv-chip.is-done .iv-chip-s { color: var(--ok); }
.iv-chip.is-skip { border-style: dashed; color: var(--muted); } .iv-chip.is-skip .iv-chip-s { color: var(--danger); }
.iv-chip.is-current { background: var(--accent); border-color: var(--accent); color: var(--on-accent); } .iv-chip.is-current .iv-chip-s { color: inherit; }
.iv-timer { margin-left: auto; display: flex; align-items: baseline; gap: 6px 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--muted); white-space: nowrap; }
.iv-timer b { font-size: 20px; font-weight: 800; color: var(--text); }
.iv-t-stage { padding: 1px 10px; border-radius: 8px; }
.iv-t-stage.is-over { background: var(--warn-soft); } .iv-t-stage.is-over b { color: var(--warn-text); }
.iv-t-stage.is-late { background: var(--danger-soft); } .iv-t-stage.is-late b { color: var(--danger); }
.iv-must { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; padding: 8px 14px; border: 1px solid color-mix(in srgb, var(--danger) 50%, transparent); border-radius: var(--radius-sm); background: var(--danger-soft); font-size: 14.5px; font-weight: 700; line-height: 1.5; }
.iv-must .btn { margin-left: auto; }
.iv-stage { padding: 14px 22px 18px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
.iv-stage-head { display: flex; align-items: baseline; gap: 4px 14px; flex-wrap: wrap; margin-bottom: 12px; }
.iv-stage-head h2 { font-size: 20px; font-weight: 800; outline: none; }
.iv-no { color: var(--accent); margin-right: 6px; }
.iv-who { margin-left: auto; min-width: 0; font-size: 13px; color: var(--muted); overflow-wrap: anywhere; } .iv-who b { font-size: 15px; color: var(--text); }
.iv-lead { width: 100%; font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.iv-cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px 32px; align-items: start; }
@media (min-width: 1100px) { .iv-cols.is-two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.iv-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.iv-grp { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.iv-grp.k-check { --k: var(--k-check); } .iv-grp.k-say { --k: var(--k-say); } .iv-grp.k-ask { --k: var(--k-ask); }
.iv-k { display: flex; align-items: center; gap: 4px 8px; flex-wrap: wrap; min-height: 24px; font-size: 12.5px; font-weight: 800; letter-spacing: .08em; color: var(--k); }
.iv-k::before { content: ""; width: 4px; height: 15px; border-radius: 2px; background: currentColor; }
.iv-k > span:first-of-type { white-space: nowrap; }
.iv-k small { font-size: 12px; font-weight: 600; letter-spacing: 0; color: var(--muted); }
.iv-k-act { margin-left: auto; display: flex; align-items: center; gap: 6px; letter-spacing: 0; }
.iv-note { font-size: 12.5px; color: var(--muted); }
.iv-grp .cl-must-row { display: flex; align-items: center; gap: 6px 14px; flex-wrap: wrap; padding: 2px 0 6px; border-bottom: 1px dashed var(--border); }
.iv-grp .cl-must-row .cl-label { flex: 1 1 14em; font-size: 15.5px; font-weight: 700; line-height: 1.45; }
.iv-grp .cl-must-row .seg-btn { height: 42px; min-width: 84px; font-size: 15px; }
.iv-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 16px; }
.iv-fields .field { margin-bottom: 4px; gap: 4px; } .iv-fields .field > label { font-size: 13px; }
.iv-fields input, .iv-fields select { padding: 7px 10px; } .iv-fields .seg-btn { height: 38px; }
.iv-fields input[type="date"], .iv-fields input[type="month"] { width: auto; min-width: 11em; }
.iv-say-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.iv-say-i { display: flex; align-items: baseline; gap: 8px; font-size: 15px; line-height: 1.6; overflow-wrap: anywhere; }
.iv-say-i::before { content: "・"; flex: none; color: var(--k); font-weight: 800; }
.iv-say-list.is-items .iv-say-i::before { content: none; }
.iv-say-i label { display: flex; align-items: baseline; gap: 8px; cursor: pointer; }
.iv-say-i input { flex: none; width: 18px; height: 18px; margin: 0; transform: translateY(3px); }
.iv-say-list.is-items .iv-say-i:not(.is-on) > label > span { color: var(--muted); }
.btn.iv-said { min-width: 8.5em; padding: 7px 16px; font-size: 14.5px; }
.btn.iv-said[aria-pressed="true"] { background: var(--ok); border-color: var(--ok); color: var(--on-status); }
.btn.iv-said[aria-pressed="mixed"] { background: var(--warn-soft); border-color: var(--warn); color: var(--warn-text); }
.iv-q { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--border); border-left: 3px solid var(--k-ask); border-radius: var(--radius-sm); background: var(--surface-2); }
.iv-q-text { font-size: 17px; font-weight: 700; line-height: 1.55; overflow-wrap: anywhere; }
textarea.iv-q-memo { min-height: 0; height: 42px; resize: none; overflow: hidden; padding: 8px 12px; font-size: 15px; line-height: 1.5; }
.iv-oldmemo textarea, .iv-memo textarea { min-height: 60px; }
.iv-flow { padding: 8px 12px; border-left: 3px solid var(--accent); border-radius: var(--radius-sm); background: var(--accent-soft); font-size: 13.5px; font-weight: 600; }
/* 評価 */
.ev-result { display: flex; align-items: center; gap: 4px 14px; flex-wrap: wrap; padding: 10px 14px; border: 1px solid var(--border); border-left: 5px solid var(--muted); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
.ev-result[data-result="recommend"] { border-left-color: var(--ok); } .ev-result[data-result="review"] { border-left-color: var(--warn); } .ev-result[data-result="reject"] { border-left-color: var(--danger); }
.ev-res-k { font-size: 12px; font-weight: 700; color: var(--muted); }
.ev-res-why { flex: 1 1 14em; min-width: 0; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev-res-miss { font-size: 13px; font-weight: 700; color: var(--warn-text); } .ev-res-miss.is-none { color: var(--ok); }
.ev-res-score { width: 100%; font-size: 12.5px; font-weight: 600; color: var(--muted); }
.ev-time { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }
.ev-time input { width: 5.5em; min-width: 0; padding: 5px 8px; }
.ev-time-st { display: inline-flex; gap: 10px; flex-wrap: wrap; }
.ev-sec .card-head { align-items: baseline; margin-bottom: 10px; }
.ev-sec-time { font-size: 12.5px; color: var(--muted); }
.ev-fix { margin-left: auto; }
.ev-memo { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--surface-2); }
.ev-memo .cl-must-row { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; padding: 0; border: 0; background: none; }
.ev-memo .cl-must-row .cl-label { flex: 1 1 14em; }
dl.ev-kv { margin: 0; display: flex; flex-wrap: wrap; gap: 2px 18px; font-size: 13.5px; }
dl.ev-kv > div { display: flex; gap: 6px; align-items: baseline; } dl.ev-kv dt { font-size: 12.5px; font-weight: 700; color: var(--muted); } dl.ev-kv dd { margin: 0; font-weight: 700; }
.ev-said { font-size: 13.5px; font-weight: 600; }
dl.ev-qa { margin: 0; display: flex; flex-direction: column; gap: 4px; }
dl.ev-qa > div { display: grid; grid-template-columns: minmax(8em, 15em) minmax(0, 1fr); gap: 2px 12px; }
dl.ev-qa dt { font-size: 13px; font-weight: 700; color: var(--muted); }
dl.ev-qa dd { margin: 0; font-size: 14.5px; white-space: pre-wrap; overflow-wrap: anywhere; } dl.ev-qa .is-empty dd { color: var(--muted); }
.ev-memo-k { font-size: 12.5px; font-weight: 700; color: var(--muted); } .ev-memo-v { white-space: pre-wrap; overflow-wrap: anywhere; }
.ev-rate-h { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; font-size: 13.5px; font-weight: 700; }
.ev-miss { display: none; }
.cl-rate-row.is-missing, .ev-memo .cl-must-row.is-missing, .cl-ps-row.is-missing { box-shadow: inset 4px 0 0 var(--warn); border-color: color-mix(in srgb, var(--warn) 60%, var(--border)); }
.cl-overall-row.is-missing { padding: 6px 10px; border: 1px solid var(--warn); border-radius: var(--radius-sm); }
.is-missing .ev-miss { display: inline-flex; }
@media (max-width: 840px) {
  .iv-top, .ev-top { position: static; margin-top: 0; padding-top: 0; }
  .iv-timer { margin-left: 0; } .iv-fields { grid-template-columns: minmax(0, 1fr); }
  .iv-stage { padding: 12px 14px 14px; } .iv-who { margin-left: 0; width: 100%; }
  dl.ev-qa > div { grid-template-columns: minmax(0, 1fr); }
}
@media print { .intro, .iv-top, .ev-top, .flow-foot { display: none !important; } }
```

### A-2. 記入シート（`paperSheetCss()` に足す。`.pp-q*` の規則と置き換え）
```css
.pp-part{display:flex;align-items:baseline;gap:8px;margin:7px 0 4px;padding:2px 6px;border-radius:3px;background:#24324a;color:#fff;font-size:11.5px;font-weight:800;letter-spacing:.06em}
.pp-part small{font-size:9.5px;font-weight:600;letter-spacing:0;color:#d5dbe3}
.pp-qs{padding-bottom:2px;border-bottom:1px solid #e6eaef}
.pp-qa{display:flex;align-items:flex-end;gap:6px;padding:3px 3px 0;min-width:0}
.pp-qk{flex:none;width:2.6em;margin-right:0}
.pp-qa .pp-qi{flex:none;max-width:60%;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-qa .pp-ql{flex:1 1 auto;min-width:12mm;height:6.2mm;border-bottom:1px dotted #8a94a3}
.pp-qx{padding-left:calc(3px + 2.6em + 6px)}
.pp-qx i{display:block;height:6.2mm;border-bottom:1px dotted #8a94a3}
.pp-sheet.pp-a2 .pp-qx i:nth-child(n+2){display:none}
.pp-sheet.pp-a1 .pp-qx{display:none}
.pp-sheet.pp-compact .pp-qa .pp-ql,.pp-sheet.pp-compact .pp-qx i{height:5.5mm}
.pp-ev-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 14px}
.pp-rate td.pp-no{width:16px;font-size:10px;color:#5b6675;text-align:center}
.pp-ps-t .pp-sc{width:43mm}.pp-ps-t .pp-sc span{width:8.4mm}
.pp-sheet.pp-measure .pp-notes .pp-lines{min-height:24mm}   /* 今の 30mm から。実装で 20〜24mm を測って決める（5-3） */
.pp-sheet .pp-ql,.pp-sheet .pp-qx i,.pp-sheet .pp-part{-webkit-print-color-adjust:exact;print-color-adjust:exact}
```

### A-3. 消す（F21）
styles.css の `.cl-head-attrs`・`.cl-attr*`・`.card.cl-head-line` 以下と `@media screen and (max-width:1400px)` の `.cl-head-line`・`.cl-all-btn`・`.cl-nav*`・`.cl-chip*`・`.cl-page-head*`・`.cl-block*`・`.cl-checks`／`.cl-check*`・`.cl-questions`・`.cl-q*`（`.cl-q-list` を含む）・`.cl-memo`・`.cl-notify-note`・`.cl-flow`・`.cl-guide*`・`.cl-unknown*`・`.cl-score*`・`.cl-must-summary`・`.cl-ms-label`・印刷の `.cl-nav, .cl-skip-note`。残す: `.cl-row`・`.cl-rate-row`・`.cl-must-row`・`.cl-label`・`.cl-note`・`.cl-field`・`.cl-seg`・`.seg-btn.*`・`.cl-legend`・`.cl-sec`・`.cl-no`・`.cl-sec-state`・`.cl-skip-note`・`.cl-skippable`・`.cl-overall-row`・`.cl-notes-field`・`.cl-persona`／`.cl-ps-*`・`.cl-lead-ps`（`#clPersona` の中用に `.cl-persona .cl-lead-ps { margin: -2px 0 8px; font-weight: 600; }`）

---

## 13. 実装時の差分（2026-10-16。実装者）

### 13-1. 実測（Chromium・既定の台本。e2e の値）
- 準備（「はじめての方へ」を出したまま）: 右下の「面接を始める →」の下端は 733px（1440×900・1280×800 ともスクロールなし）
- 面接（短期求人・記入欄と質問のメモを入れた状態）: 1440×900 で ① は段階の下端が操作行に 27px かかる（縦スクロール 45px）・②〜⑤ は段階の下端が操作行より 152〜251px 上（スクロールなし）。1280×800 で ① は 159px かかる（スクロール 177px）・②〜⑤ は 52〜109px 上（スクロールなし）。390px は 1 列・横スクロールなし・操作行は画面の下
- 記入シート: 計測中の面接所見の最低 `PP_NOTES_MIN` は **20mm**（24mm では既定の白紙が pp-a1 の 1055px になる）。既定の白紙・準備に入力ありとも `pp-a2` 1039px（上限 1052px）・面接所見の罫線 3 本・PDF 1 ページ
- A4: 質問ごとのメモ 13 個（各 300 字）＋確認点のメモ＋準備のメモ 300 字＋面接所見 1,500 字の重いサンプルは `.cl-compact.cl-compact-q1`（質問の回答 1 行）1040px・面接所見は罫線の空きまで 17 行に広げる。E8 の期待値（質問の回答 2 行 → 1 行・名前のキー 5 → 13 行）と E16 の `__a4Fit()`（'cl-compact' → 'cl-compact-q1'）をこの段階に合わせた。質問ごとのメモ 13 個・面接時間ありの記録を直接作った保存 HTML も 1 ページ（E8 の fit39 'qi'）
- A4 のキーの列（18em）に入らない長い短い名前（「①最初の2か月で条件を満たせない可能性」）は通常 2 行・`.cl-compact` 以降は 1 行で「…」（1 ページ保証の CSS は変えていない）
- テスト: 単体 40 件（#98〜#100 を追加。#63・#85・#88・#97 を書き換え）・e2e E1〜E18・360 件（うち E18 は 23 件）

### 13-2. 本書と変えたこと
1. 面接の前書き `.iv-lead`: 台本のページの最初の段階ならページの前書きに加えて、その段階の前書き（`sections[].lead`。既定は ⑤「ミスマッチを解消するための時間」）も「　」でつないで出す（3-2 はページの前書きだけ）
2. 話すことの注記（F7・3-4）: 短期のみの項目を含む説明ブロックの注記は求人が未選択のときだけ。短期のみの項目が無い説明ブロックの注記と合否連絡の注記は常に出す（台本の編集で付けた注記を消さない）
3. `ivSayItems` の `shown`: 短期のみの項目は求人が「短期」か未選択のときだけ出す（3-4 の式は求人が 'regular' のときだけ隠すので、JSON で 3 つ目の求人を足すと対象外の項目が印なしで出る）
4. 「説明した」「伝えた」のボタンは対象が 0 個のときは出さない（台本の編集で説明が短期のみの項目だけになった段階を通常求人で開いたときなど）
5. 評価の理由 `#evResultWhy`: 調整が無く総合判断があるとき、結果が採用推奨なら「総合判断「採用」のとおり」、それ以外は「総合判断「保留」のため」（4-3 はどちらも「のとおり」）
6. `#evMissing` に、必須条件の不一致で不採用推奨に固定したときの `.is-gate`（文字の色を変える）
7. 評価の質問と答え `dl.ev-qa`: メモを取らない質問ブロック（`memo: false`）の質問は、メモが無ければ出さない
8. タイマー: 読むだけの `ivTimingRead()` を足し、チップ・タイマーの表示・評価の画面は timing を作らない（3-7 の式の `ivTiming()` は読むだけでも記録に `timing` を作る＝面接を開いていない記録の形が変わる）。`perStage` の秒は正規化で 86400 まで
9. 記入シートの「評価」の総合判断の行に「面接時間 ___分」を足した（紙で面接したときに報告書の面接時間へ転記するため。5-3 には無い）
10. 面接・評価の画面（`html.flow-pad`）: 本文の高さを画面いっぱいにして操作行を画面の右下に置く（`#stepContent` の min-height・操作行の margin-top:auto）。画面の下の余白（`.view` の padding-bottom）と著作権の 1 行（`#footerText`）は面接・評価では出さない（出すと短い段階でも 114px 縦にスクロールし、操作行が画面の下端に来ない）
11. 840px 以下（サイドバーが本文の上に並ぶ）では、面接の段階を出したときページの先頭ではなく本文（トップバー）の先頭へスクロールする（`ivFocusHead`。3-9 の `scrollTo(0, 0)` だと［次へ］のたびにサイドバーに戻る）
12. 色: ライトの `--warn-text` を #b45309 → #a3480a（`--warn-soft` の地で 4.49 → 5.39:1）。`--danger-text`（#b91c1c。タイマーの赤 5.51:1）と `--ok-strong`（#047857。「✓ 説明した」の地。白字 5.48:1）を足した。ダークは明るい色（`--warn`・`--danger`・`--ok`）のまま（濃い文字 `--on-status`）
13. 文言: 詳細モードの設定を開いたときの toast を「詳細モードは終了しました。準備 → 面接 → 評価 → 報告書の 4 ステップで開きます。」、v1 の記録の toast を「旧形式の面接評価（10 項目×5 点）は読み込みません。評価の画面で評価し直してください」
14. スクリーンショットはオーケストレータの指定の名前（`p13-prep.png`・`p13-interview-1.png`・`p13-interview-2.png`・`p13-interview-must-ng.png`・`p13-evaluate.png`・`p13-report.png`・`p13-paper.png`・`p13-interview-390.png`）。9-5 の名前は使っていない
15. e2e: 9-3・9-4 のほかに、E6 に面接の画面からのトップバー 🖨（今の段階の秒を入れてから印刷）、E8 に質問ごとのメモと面接時間ありの記録（`mk39` の `o.qi`・`o.tm`）、E18 (2) にライトのタイマーの超過・「✓ 説明した」・今のチップのコントラスト（4.5:1 以上）、E18 (3) に評価の「✎ 面接の画面で直す」、E18 (7) に localStorage が使えないときも面接から準備に戻って「はじめての方へ」が出ないことを足した。E17 の質問の 1 行表示と ② の案内の段組みの確認は削除（人物像の凡例の折り返し・390px は評価の画面で残した）
