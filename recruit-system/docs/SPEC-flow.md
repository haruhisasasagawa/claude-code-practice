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
| F3 | 各ステップの最後に操作行 `.flow-foot`: **左に戻る・右端に主ボタン（`.btn.primary.lg`）**。面接・評価は画面の下に固定（sticky）、準備・報告書は流れの中（**15 章で変更**: 準備・報告書も画面の下に固定〔`.is-pinned`〕し、4 つの画面の主ボタンを同じ位置に。DOM は主ボタンが先〔Tab の順〕） |
| F4 | 面接の本文は **1100px 以上で 2 列**: その段階の最初の質問ブロックより前のブロックを左、最初の質問ブロック以降を右（台本の順のまま「左の列 → 右の列」）。質問ブロックが先頭（⑤）・無い・1100px 未満は 1 列（**14 章で変更**: 質問ブロックの直前の記入欄は右の「聞くこと」へ・右が長ければ 1 問目から左の列の下へ）（**15 章で変更**: ⑤ のように質問が先頭の段階は、質問のあとの話すこと〔合否連絡〕から右の列。カードを動かせない ① は列の幅の比で高さをそろえる） |
| F5 | ブロックの見せ方: must・fields ＝「確かめること」、explain・notify ＝「話すこと」、question ＝「聞くこと」、note ＝ 流れの 1 行。rating は面接に出さない。続けて同じ種類なら見出しは 1 つ。ブロックの題（【説明】【質問】など）は出さない |
| F6 | 「説明した」は **段階×種類（explain／notify）に 1 つ**。押すと対象（短期のみの項目は求人が短期のときだけ）を true、すでに全部済みならその段階のその種類の全項目を外す（今の explain-all と同じ規則）。状態は on／mixed（一部）／off。項目ごとの付け外しは「一部説明しなかった ▾」を開いたときだけ |
| F7 | 短期のみ（`shortOnly`）の項目: 求人「短期」→ 出す（印なし・対象）／「通常」→ 出さない／未選択 → 「短期のみ」の印つきで出す（対象外）。ブロックの注記「※は短期求人に…」は未選択のときだけ |
| F8 | 質問ごとのメモ `cl.notes[質問 id]`（質問カードの下の textarea）。質問ブロックの `memo === false` ならメモ欄を出さない。旧メモ `cl.notes[ブロック id]` は値があるときだけ「（以前のメモ）」で出す（編集可） |
| F9 | 評価の画面で直せるのは **判定に効くもの**（必須条件・確認点・人物像・総合判断）と面接所見・面接時間。メモ・記入欄・説明は表示だけ（カードの「✎ 面接の画面で直す」で面接のその段階へ。タイマーは再開する＝G4） |
| F10 | タイマーは `Date.now()` の差分。面接の段階を表示しているあいだだけ数え、段階の切り替え・面接を離れる・保存・印刷のときに `perStage[段階 id]` へ秒を足す（1 秒未満は持ち越し）。時計が戻ったら 0 とみなす（負にしない）。**dirty にしない・判定を無効にしない** |
| F11 | 面接を表示したとき `startedAt` が無ければ入れる（「面接を始める」以外の経路〔サイドバー・読み込み〕でも）。面接から評価・報告書へ進むと `endedAt`（最後に離れた時刻で上書き）。準備・設定・使い方へ離れたときは止めるだけ |
| F12 | 報告書の面接時間は、評価の画面で入れた分（`timing.min`）があればそれ、無ければ perStage の合計（分に四捨五入。60 秒未満は「1分未満」）。**合計 0 秒で手入力もなければ出さない**（e2e の固定時計 `setFixedTime` で既存の A4 が変わらない）。目安は台本の段階の分の合計 |
| F13 | チップの「✓（済み）」は `perStage` にキーがある（表示したことがある）段階。今の段階には付けない。「省略可」が ✓ より優先（**14 章で変更**: 入力した段階だけ ✓・必須条件が未確認なら「未確認」） |
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
> **2026-10-19（16-8）**: 面接の hint は「話す → 聞く → 確かめる」・`STEP_LEAD[2]` は「台本どおりに 話す → 聞く → 確かめる（答えはメモ）。○△× などの評価は面接のあとで付けます。」（2026-10-18 からの面接のカードの名前と順番に合わせた。○△× は `.ja`）。4 は 15 章の `reportLeadText`。
- 各ステップの HTML の先頭: `<p class="step-lead" id="stepLead"><b>この画面ですること</b><span>{STEP_LEAD[n]}</span></p>`
- `renderStepNav` は今のまま（`data-step` 1〜4・`.done`／`.current`／`.disabled`・番号は完了で ✓）。`#stepSectionTitle`「手順」・ナビ「報告書の作成」・トップバー「面接チェックリスト報告」は変えない。`index.html` の meta description の「3 ステップ」を「準備 → 面接 → 評価 → 報告書の 4 ステップ」に
- `renderStep()` の先頭で `layout.classList.toggle('no-summary', step === 2 || step === 3)`・`paper-stack` は今のまま外す（2026-10-19 に `paper-stack` は削除。報告書は 1 列で右サマリーは `.page.reading .summary` で紙の下。16-9）。`document.documentElement.classList.toggle('flow-pad', view === 'judge' && (step === 2 || step === 3))`（scroll-padding。付録 A。`showView` でほかの画面に移るときも外す）。`--topbar-h` に `.topbar` の `offsetHeight` を入れる（`renderStep` と resize）
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
- （2026-10-19: 操作行は画面の下に固定なので「面接を始める →」はいつも見える。ノート PC の高さで応募者の欄が操作行に隠れるときは操作行に「▼ 下にあと n 項目」。16-7）

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
- `PAPER_BTN_TITLE` を「紙に書くときの A4 1 枚（面接・評価の画面と同じ並び）を印刷」に（**2026-10-19 に「紙に書くときの A4 1 枚（面接 ①〜⑤ → 評価の順。段階の中は台本の順）を印刷」**。2026-10-18 から面接の画面は 話す → 聞く → 確かめる で、記入シートの段階の中〔台本の順〕と違うため。16-8）。はじめての方への手順 2 は「台本の ①〜⑤ を 1 段階ずつ 話す → 聞く → 確かめる」（同）

---

## 3. 面接（step 2。新設の進行画面）

### 3-0. 面接の場面と画面の決め方
- 面接官はノート PC を前に応募者と向き合い、**画面を見るのは台本を読む・答えを短く打つ瞬間だけ**。1 段階 3〜10 分。視線は「上の帯（今どこか・時間）→ 左の列を上から（確かめる・話す）→ 右の列を上から（聞く・メモ）→ 右下の［次へ］」の 1 筆書き
- **読む文字は大きく**: 質問文 17px 太字（そのまま読み上げる）・話すこと 15px・必須条件 15.5px 太字・メモ 15px。**押すものは大きく**: 一致／不一致 42px×84px 以上・説明した 38px・次へ `.btn.lg`（約 46px）。チップ 36px
- 1 画面に 1 段階だけ。評価のボタン（○△×・1〜5・総合判断）は出さない＝押し間違い・迷いを無くす
- 色は状態だけ: 種類の見出しの細い帯（確かめる 青・話す 紫・聞く 青緑）・タイマーの超過（琥珀・赤）・必須条件の案内（赤）・説明した（緑）

### 3-1. ワイヤーフレーム（1440×900・① 勤務条件・短期求人）

> **2026-10-18 に置き換え**: 面接の段階は縦一列の 3 枚のカード（話すこと → 聞くこと → 確かめること）になった。この節の 2 列・種類の見出し・列の分け方の記述は無効。いまの構成は 16 章と `docs/DESIGN.md` 4-3。
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

> **2026-10-18 に置き換え**: 面接の段階は縦一列の 3 枚のカード（話すこと → 聞くこと → 確かめること）になった。この節の 2 列・種類の見出し・列の分け方の記述は無効。いまの構成は 16 章と `docs/DESIGN.md` 4-3。
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

### 3-3. 列の分け方・見出し（実装は `interviewStepHtml` の中の `ivColsHtml(s)`。13-2・14 章）

> **2026-10-18 に置き換え**: 面接の段階は縦一列の 3 枚のカード（話すこと → 聞くこと → 確かめること）になった。この節の 2 列・種類の見出し・列の分け方の記述は無効。いまの構成は 16 章と `docs/DESIGN.md` 4-3。
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

> **2026-10-18 に置き換え**: 評価は 結果カード → 段階のカード（見出し帯つき）→ 人物像 → 総合判断 → 面接所見 → 面接時間（最後）の別々のカード。16-4 と `docs/DESIGN.md` 4-4。
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
- 説明 `.ev-said`: explain は A4 と同じ数え方（短期のみは求人が短期のときだけ）: 全部 →「説明：✓ 説明した（n/n）」／一部 →「説明：一部説明していない（{未チェックの短い名前を「、」で}）」／0 →「説明：していない」。notify は「合否連絡：✓ 伝えた」「合否連絡：一部伝えていない（…）」「合否連絡：伝えていない」。説明・合否連絡の項目が無い段階は出さない。していない・一部していない は琥珀＋⚠（16-8 の 7）、ただし必須条件の不一致で打ち切ったときの省略できる段階（`.cl-skippable`）では中立（16-10 の 7）
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
- 人物像の合計の札 `#clPsState` と 1 点の警告 `#clPsWarn`: mustGate のときは人物像を判定に使わないので、札は中立の「未入力 n（任意）」（全部入れたら出さない）・警告は「1 点の項目があります（…）。」だけ（F15。16-10 の 10）
- 台本 1 枚目の前書きの「最低限の話し方、敬語が可能か」の付け先（今の `.cl-lead-ps`）は `#clPersona` の見出しの下へ移す: `<div class="hint cl-lead-ps" data-ps-ref="ps_speech">→ 台本 1 枚目の「最低限の話し方、敬語が可能か」は、この{ps.title}「{label}」で 1〜5 点を付けます。</div>`（条件は今の `clLeadPsHtml` と同じ。前書きは `sum.pages` の no 1）

---

## 5. 報告書（step 4）・A4・記入シート

### 5-1. 報告書の画面
- 先頭に `#stepLead`。`#scriptWarnings` のボタンを「評価で入力する」（`data-step="3"`）
- 操作行 `<div class="flow-foot no-print" id="rpFoot">`: `#backToChecklist`「← 評価に戻る」（`data-action="to-step" data-step="3"`）・`.spacer`・`#reportPrintBtn`「🖨 A4 で印刷」・`#reportSaveBtn.btn.primary.lg`「💾 報告書を保存（HTML）」（右端）。sticky にしない（印刷・押印カードのクリックと重ねない）
- 右サマリーは今のまま（紙の下に回す `paper-stack` も。2026-10-19 に `paper-stack` は削除。16-9）

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
- **HANDOFF.md**: 冒頭の題と箇条に「2026-10-16: 面接の流れ（準備 → 面接 → 評価 → 報告書）」（副支配人の指示・選択・本書）。1-1 画面を 4 ステップで書き直す（id は本書 2〜5 章）。1-2 に `timingSummary`。1-3 に `timing`・step 1〜4・再開先。1-5 に A4 の質問ごとの行・面接時間、記入シートの並び。1-6 に単体・e2e の件数（E18 を含む）。2 章の表に「Q. 面接の流れ（2026-10-16）」（4 ステップ・1 段階ずつ・評価は面接のあと・説明は段階に 1 つ・タイマー）。3 章の TODO に「面接時間の扱い（タブを隠しても数える・評価で直せる）を実機で確認」「1366×768 の実機（ブラウザの枠で縦 620px 前後）で ① のスクロール量」。4 章の早見表に「面接の画面（`interviewStepHtml`・`ivColsHtml`・`iv-*`・タイマー `ivStart`／`ivStop`／`ivCommit`）」「評価の画面（`evalStepHtml`・`updateEvalUI`）」「はじめての方へ（`recruit.intro.v1`）」
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
0. 段階の本文を組み立てる関数は 3-3 の `ivStageHtml(sec)` ではなく `ivColsHtml(s)`（`interviewStepHtml` の中から呼ぶ。見出し・応募者の 1 行・前書きは `interviewStepHtml` が組む）。2026-10-17 の 14 章で追記
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

## 14. レビュー修正（2026-10-17。29 件）

初見の人がよくする操作（ダブルクリック・チップで先を見る・使い方を見る）と、ノート PC の実際の表示の高さ（1366×768 の画面でブラウザの枠・タスクバーを除いた 1366×657、ブックマークバーありの 1366×625、1280×800 の画面の 1280×680）で見つかった指摘への対応。G1〜G12・F1〜F24 のうち F4・F13 だけを下のとおり変えた（ほかは変えていない）。

### 14-1. 操作
1. **ダブルクリック**: 右下の主ボタンは押すと画面を描き直し、次の画面の主ボタンが同じ位置に出るため、ダブルクリックの 2 回目が次のボタンに当たって段階（① → ③）・画面（⑤ → 報告書）を飛ばしていた。`onContentClick` の先頭で `e.detail > 1`（続けたクリックの 2 回目以降）を捨てる。#stepContent の全ボタンが対象（一致／不一致・説明した・1〜5 点もダブルクリックで戻らない）。キーボード（Enter・Space）と `click()` は `detail` が 0 なので止めない。Ctrl＋Enter は `e.repeat`（押しっぱなし）を捨てる
2. **段階のチップ（F13 を変更）**: ✓ は**その段階で入力した**（必須条件・説明・合否連絡・記入欄・質問のメモ・ブロックのメモが 1 つでもある。確認点とそのメモは評価の画面なので数えない）段階だけ。必須条件が未確認の段階は ✓ を付けず、離れた（または入力した）あとは「**未確認**」（琥珀の文字・枠。`.is-unconf`）。必須条件の不一致で打ち切り（不採用推奨に固定）のときは残りの必須条件は任意なので「未確認」を出さない。判定は `rules.checklistSummary` の段階ごとの `input`・`mustUnknown`（旧 ② の目次用の `done`・`answered`・`gradable` は使う所が無いので外した）
3. **評価の段階の状態**: 見出しの右は 不一致あり（赤）／未確認 n・未入力 n（琥珀。必須条件の未確認と確認点の未入力）／済（必須条件と確認点が全部）。段階ごとの時間は、見ただけ（0 秒で入力なし）の段階は「—」（`evSecTime`）
4. **評価に戻る**: 面接の途中の段階の「評価に戻る」は `endedAt` ではなく、評価まで進んだことがある（`state.maxStepReached >= 3`）とき（旧い記録を評価で開いて「✎ 面接の画面で直す」で来たときも）
5. **使い方から戻る**: 使い方ではサイドバーの手順が隠れるので、上と下に「← （いまの手順）の画面に戻る」（`.help-back`・`data-action="back-to-judge"`）
6. **報告書の「評価で入力する」**: 必須条件の不一致で不採用推奨に固定したとき（評価の画面は「ほかの入力は任意です」）は出さない
7. **「この画面ですること」**: 準備は面接を始めたあと「…確かめて、「面接に戻る」を押します。」（ボタン名と同じ）。評価・サイドバーの説明・はじめての方へは、人物像を使わない設定（評価は人物像を使わない記録も）では「○△×・総合判断」（`stepLeadText`・`evalWhatText`）

### 14-2. 画面の大きさ（F4 を変更）

> **2026-10-18**: 1・2（【質問】の記入欄を聞くことの先頭に・2 列の高さをそろえる）と 3（詰める）は縦一列のカードで無効（16-3）。5（▼ 下にあと n 項目）はどの段階でも出す。
> **2026-10-19**: 5 は準備にも出す（はじめての方へを出したままのノート PC の高さ。4 の「準備は…」の 1 画面に収まる前提は無くした。16-7）
1. **【質問】の記入欄**: 質問ブロックの直前の記入欄（台本の【質問】。既定は ① の 短期／長期の希望・契約開始日の希望・初回契約終了・OPEN／25時）は、その質問の答えを書く欄なので「聞くこと」の先頭（1 問目のカードのすぐ上・同じ列）に置く。列の分け目もその記入欄の前（`ivColsHtml` の `askFields`）。それまでは左の列の下端（「話すこと」のあと）で、1280×800 では操作行の下に隠れ、1 問目のメモにだけ答えを書いて記入欄が「—」のまま残っていた
2. **2 列の高さをそろえる**（`ivBalanceCols`）: 右の列が質問のカードで始まり左の列よりずっと長いとき（② ③ ④: 左は話すことだけ）、1 問目から左の列の末尾へ移す（「聞くこと」の見出しを付ける。右の列の見出しは「聞くこと（つづき）」）。1 枚ずつ移して最も低くなるところで止め、右に 1 枚は残す・24px 未満しか変わらなければ移さない。描いたときに 1 回だけ（入力でメモが伸びても動かさない＝入力中のカードが列を移らない）。台本の順（左の列 → 右の列）・Tab の順は変わらない
3. **詰める**: 面接・評価の画面の上の余白 22 → 14px、部品の間 18 → 12px（準備も）、上の帯の内側の余白 8 → 6px、チップの左右 11 → 10px、段階の余白 14/22/18 → 12/20/14px、質問のカードの余白 10 → 8px・行の高さ 1.55 → 1.45・メモ 42 → 38px、操作行の上下 12 → 8/10px。はじめての方へは見出し・説明・ボタンを 1 行に、4 つの手順は 2 行まで。準備のカードの余白も 2〜6px 詰めた
4. 実測（Chromium・既定の台本・短期求人）: ②〜⑤ は 1366×657・1366×625・1280×680・1440×789 でスクロールなし（段階の下端が操作行より上。② は 1366 幅で段階の高さ 337px）。① は 1440×900 で 38px・1366×657 で約 280px 操作行に掛かる（いちばん長い段階。左の列 383px・右の列 622px）。準備は「はじめての方へ」を出したまま「面接を始める →」の下端が 618px（1366 幅）・636px（1280 幅）
5. **「▼ 下にあと n 項目」**（`#ivMore`・`ivUpdateMore`／`ivShowMore`）: 段階の下の部分が操作行（画面の下に固定。G8 の右下の主ボタン）に隠れているあいだ、操作行の左に隠れている項目（必須条件の行・記入欄・話すことのリスト・質問のカード・メモ・流れの 1 行）の数を琥珀で出す。押すと隠れている分だけスクロール（上の帯の下から見えていた分を超えない＝読み飛ばさない）。描いたとき・入力でメモが伸びたとき・スクロール・画面の大きさが変わったときに数え直し、見えたら消す。840px 以下（1 列で長い）は出さない
6. **タイマーの目安**: 「/ 目安 10分」は 14px・太字・本文の色（それまでは大きさを指定していない small で 10.4px の灰色）。超過の色（琥珀・赤）は今のまま
7. **scroll-padding**: 上の帯の高さ（必須条件の案内・結果カードの折り返しで変わる）を `syncFlowLayout` で測って `--flow-top-h` に入れ、`scroll-padding-top` = トップバー＋上の帯＋8px（それまでは＋80px 固定で、1280px で案内が出ると Shift+Tab で戻った［一致］［不一致］が帯に隠れた）
8. **390px**: 操作行が 2 段に折り返しても主ボタンは右端（`.flow-foot > .btn.primary.lg { margin-left: auto }`）。［一致］［不一致］で必須条件の案内が出る・消えると本文が上下にずれる（狭い画面は上の帯が固定でない）ので、押したボタンが同じ位置に残るようにスクロールで戻す（面接の `cl-set`）。評価・報告書へ移ったときの位置合わせはトップバーの高さ（狭い画面では折り返して 180px 前後）で（それまでは 70px 固定で「この画面ですること」がトップバーの下に隠れた）

### 14-3. タイマー・旧い記録
1. **タイマー導入前の記録**（`state.ivNoTimer`）: 読み込んだ記録に回答があるのに `timing.startedAt` が無い（2026-10-16 より前に面接した記録）ときは、面接の画面を開いても数えない（段階の移動だけ。`ivStart` で時計を動かさない・startedAt を入れない）。タイマーは「—」（title に「タイマーの導入前に保存した記録のため、面接時間は数えません」）。準備の主ボタンは「面接に戻る →」。それまでは「✎ 面接の画面で直す」などで直した時間が「面接時間 1分未満（目安 41分）」として報告書に載った。回答の無い記録（これから面接）は F11 のまま表示したら数える
2. **評価の旧い質問のメモ**: 質問ブロックのメモ（以前のメモ）があるブロックは、以前のメモを先に出し、質問ごとの「（メモなし）」は出さない（答えが記録されていないと読み違えないように）

### 14-4. テスト
- 単体 40 件（#63 を `input`・`mustUnknown` に書き換え）。e2e E1〜E18・369 件（360 件から 9 件追加。すべて緑・約 6 分）
- e2e: E1 の準備を 1366×657・1366×625・1280×680 でも／E2 の ① の列（【質問】の記入欄は 1 問目の上）・② の列の高さ・① のチップ（必須条件を確かめると ✓）／E17 (11) 人物像 OFF の「この画面ですること」・サイドバー・使い方の手順 3／E18 (2) 面接を表示したままの印刷・保存・記入シートで今の段階の秒を入れる（`ivCommit` を消すと落ちる）・タイマー導入前の記録を 40 秒直しても数えない／E18 (6) 段階の見出しの「未確認 1」／E18 (8) A4 の面接時間は `dl.cl-sh-kv` で見る（それまでの `dl.cl-kv` は勤務条件の表で、常に真だった）・以前のメモを先に・「評価に戻る」・タイマーは「—」・準備は「面接に戻る →」／E18 390px の主ボタンの位置・押した行がずれない・評価の位置合わせ／E18 (10) ダブルクリック／(11) チップの ✓ と未確認・評価の時間の「—」／(12) 1366×657・1280×680 の段階の高さと「▼ 下にあと n 項目」／(13) タイマーの目安の大きさ・必須条件の案内が出ているときの Shift+Tab／(14) 使い方から戻る／(15) 不一致で固定のときの「評価で入力する」／(16) 台本の文字（段階名・質問文・説明・記入欄名・流れ）の XSS
- スクリーンショット: p13-*.png を撮り直し、`p13-interview-1366x657.png`（① の「▼ 下にあと n 項目」）を足した

## 15. 補完（2026-10-17。11 件）

初見の人がよくする操作（本番の前に画面を下見する・紙に書いた面接を転記する・氏名を直しに準備へ戻る・Tab で入力していく）と、画面の大きさ（ノート PC・タブレット縦）で残っていた抜けへの対応。G1〜G12 は変えていない。本書の F3（準備・報告書の操作行は流れの中）・F4（⑤ は 1 列）・3-1 の「390px は帯を sticky にしない」・5-1 の「操作行は sticky にしない」・14-3-1 の「タイマー導入前の記録の準備は「面接に戻る →」」を下のとおり変えた。

### 15-1. 準備の主ボタン（抜け 1・6）
- `prepNext()` が行き先と名前を決める（`#saNext` と「この画面ですること」は同じ名前）:
  - 回答（`R.checklistHasInput`〔値・メモ・人物像・総合判断〕と面接所見）が無い →「面接を始める →」。押すと `ivRestart()`（`checklist.timing` を捨てる・`maxStepReached = 1`・`ivItems`・`ivNoTimer` を戻す）→ `goStep(2)`（`ivStart` が最初の段階で startedAt を入れ直す）。本番の前に面接・評価の画面を下見していれば「この画面ですること」に「下見で動いたタイマーは 0 に戻り、① 勤務条件から始まります。」。それまでは下見で startedAt が入ると「面接に戻る →」になり、押すと最後に見た段階（⑤）・下見の秒から数え、① のチップが「未確認」になった
  - 回答があり、報告書まで進んだ（`maxStepReached >= 4`）→「報告書に戻る →」・評価まで（`>= 3`）→「評価に戻る →」・それ以外 →「面接に戻る →」。「この画面ですること」は「応募者の名前と面接の情報を確かめて、「{名前}」を押します。」。評価・報告書へは `goStep(3|4)`（準備から移るので面接のタイマー・endedAt は動かない）。それまでは評価・報告書まで進んだ記録でも「面接に戻る →」で、氏名の誤字を直しに来た人が押すと ⑤ で数え始め、perStage と endedAt が増えた
  - 読み込んだ記録（判定あり → 報告書・回答あり → 評価）・タイマー導入前の記録（`ivNoTimer`。回答があるので評価以上）も同じ規則（14-3-1 の「面接に戻る →」を変更）
- サイドバーの「面接」は今までどおり再開（下見のタイマーも続く。主ボタンだけが数え直す）

### 15-2. 面接時間を確かめる（抜け 2）
- 評価の面接時間の行 `#evTime` の下に常に見える 1 行 `#evTimeHint`「紙（記入シート）から転記した面接・中断した面接は、実際の分を入れてください（空欄ならタイマーの分を使います）」（記入シートの「面接時間 ___分」を写す欄。それまでは title だけ）
- `ivTimeCheck(sum)`: 手入力の分（`timing.min`）が無く、タイマーの合計が**目安の 1/4 未満か 2 倍を超える**とき（紙からの転記で数分・PC のスリープで何十分など）。目安は段階の分の合計（必須条件の不一致で打ち切ったときは省略できる段階を除く＝既定 ① 10 分＋⑤ 10 分）。報告書に面接時間を出さない記録（タイマーの記録なし・0 秒。e2e の固定時計）は確かめない
  - 評価: 結果カードに `#evTimeWarn`「⚠ 面接時間を確かめてください（タイマー 1分20秒・目安 41分） → 面接時間の欄へ」（押すと欄へ。`data-action="ev-time"`）・欄を琥珀（`.ev-time.is-check`）。分を入れると消える
  - 報告書: 確認事項 `#scriptWarnings` に `#rpTimeWarn`（…「紙（記入シート）から転記した面接・中断した面接は、評価の画面で実際の分を入れてください。」）と「評価で面接時間を直す」`#rpTimeFix`（評価の欄にフォーカス）。A4 は今のまま
- 使い方の「面接の進め方」の最後の 1 行も「転記にかかった時間は面接時間ではないので、評価の画面の「面接時間」に記入シートの分を入れます」に

### 15-3. 主ボタンの位置（抜け 3。F3 を変更）

> **2026-10-18 に置き換え**: `.is-pinned`（fixed）と `html.foot-pin` は削除。操作行は 4 画面と設定とも `.page`（1120 の枠）の最後の子の sticky（16-2）。主ボタンの座標は 1440×900 で右から 36px・1366／1280px で 32px・下から 12px。
- 準備 `#saActions`・報告書 `#rpFoot` も `.flow-foot.is-pinned`（`position: fixed`。左 `--sidebar-w + 28px`・右 28px・下 0。840px 以下は左右 16px）。面接・評価の sticky の操作行と同じ座標（主ボタンは右から 28px・下から 10px。1440×900・1366×657・1280×800 で 4 画面とも同じ。それまで準備は右サマリーの左の画面の中ほど、報告書は 2,000px 下）
- `html.foot-pin`（準備・報告書）: `#view-judge` の下に操作行の高さ（`--flow-foot-h`。`syncFlowLayout` が測る。`renderStep` の最後にも呼ぶ）＋12px の余白（最終合否・右サマリー・著作権の行が操作行に隠れない）・`scroll-padding`（トップバー＋8px／操作行＋8px。押印のボタンを画面の下に出しても操作行の上）。準備の右サマリーは固定しない（低い画面で操作行に掛かってもスクロールで見える）
- 5-1 の「sticky にしない（印刷・押印カードのクリックと重ねない）」を変更: 重ならないように余白と scroll-padding を取る

### 15-4. ① の列の幅・⑤ の 2 列（抜け 4。F4 を変更）

> **2026-10-18 に置き換え**: 2 列・列の幅の比（`ivWeightCols`・`--iv-cols`）・⑤ の 2 列は削除（16-3）。
- `ivBalanceCols` = `ivMoveCards`（14 章の質問カードの移動。② ③ ④）→ カードを動かせない・動かしても変わらないときは `ivWeightCols`: 高い列を広くする比（2:3・3:5・1:2）のうち最も低くなるもの（同じなら 1:1 に近いもの。24px 未満しか変わらなければ 1:1）。CSS 変数 `--iv-cols`（1100px 以上の 2 列のときだけ効く `grid-template-columns: var(--iv-cols, 1fr 1fr)`。1100px 未満の 1 列には効かない）。列の中身・台本の順・Tab の順は変えない（【質問】の記入欄は 1 問目のすぐ上のまま）。① は右の列が【質問】の記入欄で始まるのでこちら
  - 実測（Chromium・既定の台本・短期求人）: 1440 幅は 2:3 で左 418／右 527px（1:1 では 383／622）→ 1440×900 は ① もスクロールなし（はみ出し −57px。それまで +38px）・1440×789 は 149 → 54px（スクロール 66px）。1280×800 は 3:5 で 157 → 92px（104px）・1366×657 は 1:2 で 266 → 194px（206px）・1280×680 は 224px
  - 最後の質問（家族の反対）を左の列へ移すと 50px 前後まで縮むが、台本の順（左の列 → 右の列）・Tab の順が崩れるので採らない。【質問】の記入欄を左の列へ移す案も、記入欄が 1 問目から離れて操作行に隠れる（14-2-1 の問題に戻る）ので採らない
- 質問が先頭の段階（⑤）は、質問のあとに話すこと・確かめること（合否連絡）があればそこから右の列（`ivColsHtml` の `qj`。左に聞くこと・右に話すこと〔合否連絡〕）。必須条件の案内が出たままの ⑤ も 1366×657・1366×625・1280×680 でスクロールなし（それまで 1366×657 で「不合格：メール連絡」、1366×625 で合否連絡の 2 行とも操作行の下）

### 15-5. 操作行の Tab の順（抜け 5）
- 4 つの操作行とも DOM は主ボタンが先: `#ivNext` → `#ivToEval` → `#ivPrev` → `#ivMore`／`#toReportBtn` → `#evBack`／`#saNext` → `#saPaperBtn`／`#reportSaveBtn` → `#reportPrintBtn` → `#backToChecklist`。見た目は CSS の `order`（`.ff-start` 0・`.spacer` 1・ほかのボタン 2・主ボタン 3）で左に戻る・右端に主ボタンのまま
- 最後の質問のメモから Tab で主ボタン（Enter で次の段階。それまでは「← 前の段階」〔① は「← 準備に戻る」〕に移り、Enter で前に戻った）。準備のメモ → 面接を始める・面接所見 → 報告書へ

### 15-6. 狭い画面のタイマーと案内（抜け 7。3-1 を変更）
- 840px 以下: `.iv-top`・`.iv-bar` は `display: contents`（箱を作らない）。段階のチップはスクロールで流れ、タイマー `#ivTimer`（`top: var(--topbar-h)`）と必須条件の案内 `#ivMustAlert`（`top: var(--topbar-h) + var(--iv-timer-h)`）だけを sticky の細い帯に（それまでは上の帯ごと固定せず、質問のメモまで進むと案内も経過時間も見えなかった）。`scroll-padding-top` に帯の高さ（`--flow-top-h`。狭い画面ではタイマー＋案内）
- 案内は 840px 以下で 1 行に詰める（13px・ボタンは右。768px では全文が 1 行。2026-10-19 から右端に「該当の行へ」も出すので 601〜840px は全文で 2 行まで・600px 以下は短い文。16-7）。480px 以下は短い文 `#ivMustShort`（「必須条件が不一致」＋「⑤ 逆質問へ」。⑤ では「必須条件が不一致（最大 10 分で終了）」。上長最終判断要の設定は「必須条件が不一致（追加で確認）」）
- 評価の結果カードは狭い画面では今までどおり固定しない

### 15-7. 報告書の 1 行・はじめての方へ（抜け 8）
- `reportLeadText()`: 報告書の「この画面ですること」は「「面接対応者」に押印して、報告書を保存（HTML）します（最終確認・最終合否は副支配人が押します）。」（押印欄・最終合否の名前は設定から。最終合否を使わない設定なら押印欄だけ）。はじめての方への手順 4 は「「面接対応者」だけ押印して保存」（2 行に収める）

### 15-8. トップバーの印刷（抜け 9）
- 「🖨 印刷」→「🖨 報告書を印刷」（title「報告書（A4 の面接チェックリスト報告）を印刷します。紙に書いて面接するときは、準備の画面の「🖨 記入シート（手書き用）」を印刷してください」）。回答が無いうちに押すと `confirm`「まだ面接の回答がありません。報告書（A4 の面接チェックリスト報告）を印刷しますか？ 紙に書いて面接するときは［キャンセル］を押して、準備の画面の「🖨 記入シート（手書き用）」を印刷してください。」。［キャンセル］なら印刷せず `#saPaperBtn` にフォーカス（`onTopPrint`）。回答があれば確かめない。Ctrl+P（beforeprint）は確かめない。使い方の手順 1 にも「上の「🖨 報告書を印刷」は報告書の用紙です」

### 15-9. docs・テスト（抜け 10・11）
- HANDOFF の TODO の旧いステップ番号（「① で選べない」「③ で保存した記録」「② では前書きの下に」「① と ② の「🖨 記入シート」」）を 準備・報告書・評価の画面（`#clPersona .cl-lead-ps`）・準備の `#saPaperBtn` に
- 単体は 40 件のまま（rules.js・storage.js は変えていない）。e2e E1〜E19・382 件（E19 の 13 件を追加。すべて緑・約 7 分）。E19（(1)〜(8)）: (1) 下見してからの「面接を始める」（① の 00:00・開始時刻は押した時刻・下見の秒と終了時刻を捨てる・評価と報告書はまた押せない）と、回答を入れてからの「面接に戻る」（数え直さない）／(2) 評価の「← 面接に戻る」と「✎ 面接の画面で直す」→「評価に戻る」で perStage に足して endedAt を上書き・評価まで進んだ記録の準備は「評価に戻る」・報告書までなら「報告書に戻る」（タイマーは動かない）・面接時間を確かめる（転記の 1〜2 分・スリープの 85 分・必須条件の不一致の目安 20 分・報告書の「評価で面接時間を直す」・25 分を入れると消える）／(3) 4 画面の主ボタンが同じ位置（3 つの画面の大きさ）・報告書の最後が操作行に隠れない・押印のボタンは操作行の上／(4) ① の列の比（1:1 より 50px 以上低い・台本の順と記入欄の位置は同じ）・必須条件の案内が出たままの ⑤ はスクロールなし／(5) 操作行の Tab の順／(6) 390×844・768×1024 のタイマーと案内の固定・チップは流れる・480px 以下の短い文／(7) 報告書の 1 行・はじめての方への手順 4／(8) トップバーの「🖨 報告書を印刷」と回答が無いうちの確かめ
- 変えた既存の確認: E2 の ⑤ は 2 列（左 聞くこと・右 話すこと）／E6 は回答（必須条件）を入れてから準備の「面接に戻る →」／E18 (1) の報告書の 1 行・1440×900 は ① もスクロールなし（それまで「80px 以内」）・時計を止めて通す（数秒で通すと評価に「面接時間を確かめてください」が出て、通しの画面のスクリーンショットに写るため）／(7) の回答なしで準備に戻ったときは「面接を始める →」／(8) の判定のある旧い記録の準備は「報告書に戻る →」・操作行のボタンは見た目の順（左から）で比べる／(13) の Shift+Tab は 1280×600 で、必須条件の行を上の帯の下（帯の下端より 12px 上）に送ってから（① が列の幅の比で短くなり、1280×800 ではページの下端までスクロールしても隠れなくなった。scroll-padding を外すと落ちることを確かめた）／E10・E17 (13) の使い方の文（下見・転記の時間）／スクリーンショットで sticky を外すスタイルに `.flow-foot.is-pinned`・`.iv-timer`・`.iv-must`
- スクリーンショット: p13-*.png を撮り直し、`p13-prep-1366x657.png`（準備の操作行）・`p13-evaluate-time-check.png`（面接時間を確かめる）・`p13-interview-5-must-ng-1366x625.png`（案内が出たままの ⑤）・`p13-interview-768-scrolled.png`（狭い画面の固定の帯）を足した

## 16. 画面の見直し（2026-10-18。`docs/DESIGN.md` v2）

副支配人「各ページ、確かめること、聞くこと、話すことみたいな感じで横並びになっているが境目がわかりにくいから UI は何かしら変更が必要です。また各種ヒアリングや確認ボタンの位置にばらつきがあるのでわかりにくい。もう少し全体的に統一感を。UI の見直しとデザイン力の向上をお願い致します。」への対応。見た目の決まり（色・文字・余白のトークン、部品、画面ごとの構成、ダークモード、用紙の色）は `docs/DESIGN.md` v2 に書いた。本章は画面の構成の変更点だけ（3 章・4 章・14-2・15-3・15-4 を置き換える部分。各節の冒頭に注記）。G1〜G12・データモデル（保存 HTML・`record.checklist`）・判定・用紙の寸法と並び・ids と `data-action` は変えていない。

### 16-1. 決定（変更不可）
- 面接の段階は **縦一列の 3 枚のカード**「話すこと」「聞くこと」「確かめること」（色の帯の見出し）。ボタンはすべて右の同じ列（操作列 280px）
- 順番は **どの段階も 話す → 聞く → 確かめる**（一致／不一致・選択のボタンはいつも最後のカード＝［次へ］のすぐ上）
- 落ち着いた紺を基調に、色は意味だけ（緑＝一致・○、琥珀＝注意、赤＝不一致・×）。TOHO の赤はロゴだけ

### 16-2. 共通（操作行・本文の枠・固定の帯）
- 本文の枠 `.page`（`#judgePage`。`--content-max` 1120px を中央寄せ）。準備は本文＋右サマリー（312px）、面接・評価・報告書・使い方は 920px の 1 列（`.page.reading .judge-layout`）。右サマリーは準備と報告書だけ（報告書は紙の下。14-2-8 の 1280／1366px の切替は無くした）
- 操作行 `.flow-foot` は `.page` の最後の子（`#stepFoot`〔`display: contents`〕に描く。`position: sticky; bottom: 0`。地と上の線は横いっぱい）。準備・面接・評価・報告書・設定で主ボタンは同じ座標（右から: 1440×900 は 36px・1366×768／1280×800 は 32px・840px 以下は 16px。下から 12px）。15-3 の `.is-pinned`（fixed）と `html.foot-pin` は削除。DOM は主ボタンが先（15-5 のまま）。クリックの委譲は `#view-judge`
- 固定の部分の高さは `measureFlow` が測る: `--topbar-h`（840px 以下は 0。トップバーは流れる）・`--flow-top-h`（トップバー＋面接の上の帯〔狭い画面はタイマー＋案内〕・評価の結果カードの下端のいちばん下）・`--flow-foot-h`。`html` の `scroll-padding` に使う。Tab などで移った先が帯・操作行に少しでも掛かったら、帯の下・操作行の上へ送る（`onFocusIn`。マウス・タッチで押した直後〔600ms〕は動かさない）
- アイコンは SVG のスプライト（index.html の `<symbol id="i-…">`。`ico(id)`）。textContent の互換のため、記号（✓ ← → ▾ ▴ ▼ 💾 🖨 ✎ ⚠）は `.sym`（見た目は消す・aria-hidden）で textContent に残す（2026-10-19 から e2e は `.sym` を見ず、見える文字とアイコンの id で比べる。16-9）。段階・手順の番号は `.nb`（丸に数字。`data-no`。中の丸数字の文字は textContent に残す）
- 見出し帯つきのカード（`cardHtml`）: `section.card > header.card-band（アイコン or 番号・h3.card-title〔名前＋small〕・メタ・バッジ・右端の .card-actions）+ .card-body`

### 16-3. 面接（3-1〜3-3・14-2-1〜3・15-4 を置き換え）
- 上の帯 `#ivTop`: 1 行目にチップ（1 行に入らなければ今の段階以外を番号だけ `.is-compact`。`fitChips`）＋タイマー、2 行目に必須条件の案内（1 文目「必須条件が不一致です。」`#ivMustLead`＋続き `#ivMustAlertText`・右端に「該当の行へ」〔`data-action="iv-must-row"`。不一致の最初の行の［不一致］にフォーカス。今の段階に無ければその段階へ移ってから〕と［⑤ 逆質問へ］`#ivMustJump`）。案内の文は `docs/DESIGN.md` 3-11 の表（例「追加で確認し、解消しなければ ⑤ 逆質問へ（最大 10 分で終了）」）
- 段階 `#ivStage`: 見出し（`.nb.lg.fill`・名前・目安・応募者 `#ivWho`・前書き）→ 次のカードを上から（その段階に無い種類は出さない）:
  - **話すこと** `section.card.k-say[data-kind="say"]`（段階×種類〔説明・合否連絡〕に 1 枚。`ivSayCardHtml`）: 帯の右端に「一部説明しなかった ▾」（ゴースト sm・`data-action="iv-said-items"`）と［説明した］／［伝えた］（`.btn.toggle`・幅 280px 固定。`aria-pressed` false／true／mixed。オフ ○・オン ✓ 淡い紺・一部 ✓ 淡い琥珀）。本文は注記 → 読み上げる項目 `.iv-say-list`（17px）→ ブロックのメモ
  - **聞くこと** `section.card.k-ask[data-kind="ask"]`（`ivAskCardHtml`）: 質問は全段階で同じ形（Q 番号 `.q-no`・質問文 17px・すぐ下に答えのメモ `textarea.iv-q-memo`）。ブロックの注記はそのブロックの質問の前。旧い記録の「（以前のメモ）」はそのブロックの質問のあと
  - **確かめること** `section.card.k-check[data-kind="check"]`（`ivCheckCardHtml`）: 行 `.row`（左にラベル・右の操作列 280px）。小見出し「必須条件」（must の行 `.cl-must-row`＋直後の記入欄）・「勤務条件の確認」（ほかの記入欄 `.cl-field`。台本の【質問】の記入欄はここ・注記「応募者に聞いて選ぶ・記入する」〔Q 番号のタグのある欄があれば「（Q1 は聞くことの答え）」。2026-10-19。16-8〕・質問と同じ短い名前の欄に Q 番号のタグ）。［不一致］の行は `.is-ng`（淡い赤の地）
  - 流れの注記 `.iv-flow`（最後のカードの下に 13px）
- 2 列・列の幅の比・質問カードの移動（`ivColsHtml`・`ivBalanceCols`・`ivMoveCards`・`ivWeightCols`・`--iv-cols`・「聞くこと（つづき）」）は削除。⑤ も 話す → 聞く
- 「▼ 下にあと n 項目」（14-2-5）は縦一列では段階が 1 画面に収まらないのが普通なので、どの段階でも出す。数えるのは `.row`・`.iv-say-i`・`.iv-q`・`.iv-oldmemo`・`.iv-memo`・`.iv-flow`。いちばん下までスクロールすれば最後の要素は操作行の上に出る（操作行が中身を隠したままにならない）
- 記入欄の文字の欄の見本: 既定の台本の 出勤不可な繁忙「例：12/24〜12/26」・OPEN／25時「例：タクシー可・25時まで可」（文言が既定のままの欄だけ。`FIELD_EXAMPLES`）、それ以外は「記入」。設定（config.default.js）には足していない（直前の既定の台本と比べる rt_manner の移行〔SPEC-persona 1-6〕を崩さないため）

### 16-4. 評価（4 章を置き換え）
- 結果カード `#evResult`（帯なし・上に固定）→ 段階のカード `#cl-<sec>`（帯: 番号・名前・時間〔メタ〕・状態のバッジ〔不一致あり＝赤・未確認 n／未入力 n＝琥珀・済＝紺＋✓〕・［✎ 面接の画面で直す］。本文: 「面接のメモ」〔値の行 `.kv`（左にラベル・右に値）: 記入欄 → 説明・合否連絡 → Q 番号つきの質問ごとのメモ → 以前のメモ・ブロックのメモ。地 `--surface-2`〕→「必須条件」〔面接と同じ行の部品。ここでも直せる〕→「確認点」〔凡例・○△× の行・メモは行の下 32px〕）→ 人物像 `#clPersona` → 総合判断 `#clOverall` → 面接所見 `#clNotes` → **面接時間 `#evTime`（最後）**。それぞれ見出し帯つきの別のカード（「総評」の見出しは無くした）
- 面接時間のカードの帯のメタ `#evTimeSub` は「タイマー 18分05秒・目安 41分」（括弧なし）。最後の入力欄は面接時間（Tab で［報告書へ →］）
- （2026-10-19）結果カードの未入力の数は押せる（その種類の最初の未入力の行へ）・「✎ 面接の画面で直す」から戻ると直しに行ったカードの高さへ（16-7）

### 16-5. 準備・報告書・使い方・右サマリー・設定・用紙
- 準備: はじめての方へ（`.intro`。4 つの手順の箱）→ 応募者のカード（帯「応募者 9 項目」・ラベルが上の欄・3 行）。右サマリーは小さいカード 3 枚（応募者・面接チェックリスト・報告書）。欄が操作行に隠れているあいだは操作行に「▼ 下にあと n 項目」（2026-10-19。16-7）
- 報告書: 確認事項（`.alert.warn`）→ 用紙の見出しの 1 行 → A4 の用紙（形は変えない）→ 押印（2 欄）→ 最終合否 → 右サマリー（紙の下）。パスワードのダイアログは `.dlg`
- 使い方: 920px の 1 列・帯つきのカード（4 つの手順の箱・番号つきのリスト）・上と下に［← （手順）の画面に戻る］
- 設定: 節ごとに帯つきのカード（アイコン＋題＋数）・左に節のメニュー（今の節を強調。スクロールに合わせる）・欄はラベルが上（`label for`）・台本の編集は 段階（`details.s-stage.s-cl-sec`）→ ブロック（`.s-block.s-cl-block`）→ 項目（`.s-item.s-cl-item`）の入れ子・↑↓削除はアイコンだけのボタン（`aria-label`）・下に保存バー（`.flow-foot.save-bar`。操作行と同じ部品・同じ座標）。設定の文言の「セクション」は「段階」に（段階の名前・段階を追加・不一致のとき案内する段階。検証のエラーの文「…の段階がありません」「…の段階の名前が空です」も）。data-bind・data-action・節の id は変えていない
- 用紙（A4・記入シート・保存 HTML）は色だけ合わせた（`docs/DESIGN.md` 4-9。見出しの線 #1a2e5a・本文 #161e2e・△ #a35a0b など。寸法・文字の大きさ・並び・1 ページの計測は同じ）。保存 HTML の窓のボタンは紺 #223a70（角丸 8・13/700）・用紙の欄のフォーカスの輪とホバーの札は #3b5791。
  2026-10-19（16-8）: 窓の最終合否の［採用］［不採用］はアプリの報告書のセグメントと同じ色（押す前は中立・押した方は 採用＝緑 #146c43・不採用＝赤 #b42318。スタンプのインクの朱・藍は使わない）・窓の文字は題 13/700・補足とラベル 12・窓と保存バーのフォーカスの輪は 2px の #3b5791。
  記入シートの並びは 面接 ①〜⑤ → 評価。**段階の中は台本の順**（用紙の見出し「台本の順に：確かめる → 話す（□）→ 聞く（答えを線に）」）で、面接の画面（どの段階も 話す → 聞く → 確かめる）とは違う（用紙は変えない。準備の［記入シート］の title と使い方はそのように案内し、転記は項目の名前で合わせる）

### 16-6. テスト（9-3 の対応表への追加）
- 決定（16-1）と画面の構成（16-2〜16-5）で**変えた性質**（書き換えた確かめ。下の各行）: 段階が 1 画面に収まる（スクロールなし）→ 操作行が中身を隠さず最後まで届く（▼ 下にあと n 項目）／【質問】の記入欄は 1 問目のすぐ上 → 確かめることの勤務条件の確認で 1 問目と同じ欄に Q1 のタグ／1440px の報告書は右サマリーが紙の横 → どの幅でも紙の下／タイマーの目安は太字 → 15px・400（太さは 400 と 700 だけ）／⑤ は 2 列 → 話す → 聞く。ほかの行は性質は同じで確かめ方だけを書き換えた
- 書き換えで**確かめなくなっていた性質**（2026-10-19 のレビュー修正 C で足した。16-9）: 話すことの見出し帯のトグル（「一部説明しなかった」・［説明した］［伝えた］）に Tab で届くこと（旧 E19 (5) の ⑤ の最後のメモ → ［伝えた］→「一部伝えなかった」→ 主ボタン。いまは段階の見出しから 話す → 聞く → 確かめる → 主ボタン）・目安の太さ（400 を確かめる）・上の帯のタイマーがチップの横（E20 (4) の条件が常に真だった）・ボタンのアイコン（textContent の `.sym` だけを見ていた）
- 単体: #65 の検証の文を「段階」に（「段階がありません」・「③の段階の名前が空です」を確かめる）・#80 の見出しの線の色を #1a2e5a に
- e2e で書き換えた確認（性質は同じ）:
  - E1: 準備の 3 行・説明文はカードの本文（`.card-body`）の中で見る／右サマリーの「応募者」の行は `.card-body` の子で見る
  - E2: ① は 2 列 → 縦一列（カードは同じ左端・同じ幅で上から 話す → 聞く → 確かめる・確かめることは最後・流れの注記はその下・【質問】の記入欄は確かめることの「勤務条件の確認」で 1 問目と同じ欄に Q1・操作列は同じ左端）／② の列の高さそろえ → 縦一列で 話す → 聞く（3 問）／⑤ は 2 列（聞く｜話す）→ 話す → 聞く（どの段階も同じ順）・帯の small「合否連絡 2 項目」／必須条件の案内の文（1 文目＋続き）／右サマリーを出さないことは計算されたスタイル（`display: none`）でも見る（クラスだけ付いて表示されていたのをこの確認で見つけて直した）
  - E8: 報告書の右サマリーはどの幅でも紙の下（1280／1366px の切替は無い）
  - E10・E12: 設定の文言「不一致のとき案内する段階」／必須条件の案内の文（上長最終判断要の設定）
  - E14 (3): 保存 HTML の欄のフォーカスの輪は rgb(59, 87, 145)
  - E17 (1): 総評の「総評」の見出し → 人物像・総合判断・面接所見の 3 枚のカードが続けて並ぶ・前書きの 1 行は凡例の下／(4) スクリーンショットの対象は人物像のカード／(10) 押下中のボタンの文字のコントラストはライトも 4.5:1 以上で見る（琥珀の塗りは濃い文字になったため。緑・赤の塗りは白字）・測るあいだ transition を止める・凡例の折り返しは行の数で見る（点の数字を `<b>` にしたため矩形の数では数えない）／(13) 使い方の文（人物像のカード・ボタンの名前に 🖨 を付けない）
  - E18 (1)・1280×800・(12): 「1 画面に収まる（スクロールなし）」→「操作行が中身を隠さない」（先頭で隠れている項目は「▼ 下にあと n 項目」で数を出し、いちばん下までスクロールすると最後の要素は操作行の上・そのとき案内は消える）。評価の面接のメモは Q 番号つき・値の行は dt／dd で見る／(2)(8) `#evTimeSub` は括弧なし／(3) 案内の文／(5) 評価の質問の見出しは「Q1短期／長期の希望」／(8) 操作行の比べ方から「▼ 下にあと n 項目」を除く／390px の 1 列はカードの左端で見る／(13) 目安は 15px・本文の色（太字にしない）
  - E19 (3): 主ボタンの座標は 1440×900 で 36,12・1366×657 と 1280×800 で 32,12（それまで 28,10）・押印のボタンの当たり判定はボタンの中の要素でもよい／(4) 列の比の確認 → 縦一列の順（話す → 聞く → 確かめる・質問は台本の順・Q1）と、① と案内が出たままの ⑤ も最後まで届く（「▼ 下にあと n 項目」）／(5) 段階の最後の入力欄（① は確かめることの最後の記入欄・②⑤ は最後のメモ）から Tab で主ボタン・評価の最後の入力欄は面接時間／(6) 狭い画面のタイマーの位置は見えている上端（流れたトップバーの下端か画面の上端）から・案内の文／(8) 確かめの文にボタンの名前「記入シート（手書き用）」
  - スクリーンショットで sticky を外すスタイルは `.flow-foot`（`.is-sticky`・`.is-pinned` は無い）。2026-10-19 の仕上げで、操作行は static でなく `position: relative` にした（16-11 の 2）
- e2e に E20 画面の統一（6 件）を追加: (1) どの段階もカードは 話す → 聞く → 確かめる の順（無い種類は飛ばす）・帯はアイコンつきで同じ色／(2) ［説明した］［伝えた］は 3 つの状態（オフ・オン・一部）とも確かめることの行の操作列（幅 280px）と同じ左端・右端／(3) 評価の必須条件の［一致｜不一致］は面接の確かめることと同じ位置／(4) 1366×768・1280×720 でも面接の上の帯は 1 段（チップとタイマーが 1 行・必須条件の案内は帯の 2 行目の 1 行〔48px 以下〕。不一致のままの ① と ⑤）／(5) 案内の「該当の行へ」（⑤ から）で ① へ移り、不一致の行の［不一致］にフォーカス（上の帯の下・操作行の上に見える）／(6) 設定の［設定を保存］も 4 画面の主ボタンと同じ位置（1440×900 で右から 36px・下から 12px。ページの末尾でも）・末尾までスクロールすると節のメニューは「書き出し／読み込み」
- 件数: 単体 40 件（変わらず）・e2e は E1〜E20・388 件（それまで 382 件。2026-10-19 に E21 を足した。16-7。同日に E22 と E9 の 2 件を足した。16-8。同日に E23 ほかを足した。16-9。同日に E24 ほかを足した。16-10。いまは単体 42 件・e2e E1〜E24・427 件。16-12）
- スクリーンショット: `tests/shots/p14-*.png`（準備・面接 ①②・⑤〔不一致〕・評価・報告書・設定・使い方・① のダーク・① の 390px）。e2e ではなく撮影のスクリプトで撮る（`scratchpad/p14/shoot-p14.js`。2026-10-19 の仕上げで `scratchpad/p14c/finish/shoot-p14.js` に直して撮り直した。16-11）

### 16-7. レビュー修正 A（2026-10-19。動きと配置）
レビューの指摘（`scratchpad/p14/findings-verified.json`）のうち、クリックが落ちる不具合・未確認の必須条件・⑤ の合否連絡・評価への戻り・390px の操作行・上の帯・準備の高さの対応。ids・`data-action`・データモデル・判定・用紙は変えていない（足した id・`data-action` は `#saMore`・`ev-miss`）。
1. **入力の直後の 1 回目のクリック**（#11・#18。4ea719b からの退行）: メモ欄・文字の欄に書いた直後にボタンを押すと、押した瞬間（mousedown）にフォーカスが移って change が起き、表示の更新がボタンの中身（アイコン・文字の span）を作り直していたため、押していた要素が外れて click が出なかった（［説明した］［伝えた］・「▼ 下にあと n 項目」・評価の「面接時間を確かめてください → 面接時間の欄へ」。A4 の「説明済み」「合否連絡」が誤った）。
   - 状態の更新でボタンの中身を作り直さない: ［説明した］［伝えた］は `<use>` の href・`.sym`（「✓ 」）・`.iv-said-t` の文字だけを替える（`updateInterviewUI`）。「▼ 下にあと n 項目」は `.iv-more-t`、`#evTimeWarn` は `.ev-tw-t` の文字だけ。評価の未入力の数 `#evMissing` は内容が変わったときだけ入れ直す（`data-k`）
   - `ico()` の `<use>` は閉じタグで書く（ブラウザが返す innerHTML と同じ形。比べて同じなら入れ直さない所〔評価の段階の状態のバッジ〕も毎回入れ直していた）
   - ボタンの中身はクリックの的にしない（`.btn > *, .seg-btn > *, .iv-chip > *, .link-btn > *, .ev-res-time > *, .nav-item > * { pointer-events: none }`。押した要素はいつもボタン自身）
2. **必須条件を確かめないまま［次へ］**（#15）: 右下の主ボタン `#ivNext`（［次へ］・最後の段階の［面接を終えて評価へ］。Ctrl＋Enter も）で、今の段階に未確認の必須条件が残っていれば（必須条件の不一致で打ち切り〔不採用推奨に固定〕のときは残りは任意なので除く）、1 回目は進まずに確かめることの最初の未確認の行を画面の中ほどに出してその［一致］にフォーカスし、未確認の行を琥珀の地（`.row.is-missing`。確かめると消える）に、トースト（warn・4.5 秒）「必須条件がまだです。確かめてから進んでください（もう一度押すとそのまま進みます）」を出す。続けてもう一度押すと進む（案内はその段階を表示しているあいだ 1 回。段階・画面を移ると消える・トーストも消す）。ダブルクリックの 2 回目（`e.detail > 1`）・Ctrl＋Enter の押しっぱなし（`e.repeat`）は今までどおり捨てる（2 回目として進まない）。キーボード（Enter・Space）で［次へ］そのものを押したときはフォーカスを［次へ］に残し、面接のボタンの上の Enter・Space の押しっぱなしは捨てる（16-10 の 12。［一致］へ移すと、次の Enter が［一致］に当たって確かめていない必須条件が一致になったため）。必須条件の不一致の案内（⑤ へ）とチップの「未確認」（14 章）は今までどおり。`ivMustHold`・`ivMustOpen`・`ivMustWarned`
3. **⑤ の合否連絡の順番**（#12）: 並び（話す → 聞く）は変えず、合否連絡（notify）のカードの本文の先頭に順番の 1 行 `.iv-note.iv-order`（`i-arrow-down`）「逆質問（下の「聞くこと」）が終わったら、面接の最後に伝えて［伝えた］を押します」（アプリの文。段階の名前は台本から・その段階に質問があるときだけ・「面接の最後に」は最後の段階のときだけ）。台本の注記「面接の最後に伝えたらチェック」はその下にそのまま（台本の既定の文言は変えない）。使い方の「面接の進め方」も合わせた: 2 行目の末尾に「⑤ の合否連絡（話すこと）だけは、下の聞くこと（逆質問）が終わってから、面接の最後に伝えます。」・7 行目「⑤ の聞くこと（逆質問）が終わったら、上の合否連絡を伝えて［伝えた］を押し、「面接を終えて評価へ」。…」・6 行目の末尾に「確かめないまま［次へ］を押すと、1 回目は進まずに確かめていない必須条件の行へ移ります（もう一度押すとそのまま進みます）。」
4. **評価への戻りと未入力の数**（#13）:
   - 「✎ 面接の画面で直す」→ 面接 →［評価に戻る］（⑤ は［面接を終えて評価へ］・サイドバーの「評価」も）で、評価の先頭ではなく直しに行った段階のカードを押したときと同じ高さ（結果のカードの下より上には出さない）に出し、そのカードの「面接の画面で直す」にフォーカス（`evReturn`。準備・報告書へ移る・新規・読み込みで消す）
   - 結果のカードの「未入力：必須条件 n・確認点 n・人物像 n・総合判断」の各数は文字だけのボタン（`.link-btn`・`data-action="ev-miss"`・`data-miss`＝must／rate／ps／overall・title「未入力の最初の確認点へ」など）。押すとその種類の最初の未入力の行（`.is-missing`）を画面の中ほどに出し、その操作（［一致］・○・人物像はその行のタブ位置〔未入力なら 1〕・採用）にフォーカス。文（textContent）は「未入力：…」のまま
5. **390px の操作行**（#0）: 戻るボタンの文字に `.lbl-x`（「準備に」「面接に」「評価に」）。「前の段階」は `.lbl-x` と CSS の短い文字 `.lbl-s[data-lbl="戻る"]`（`::before`。textContent は「← 前の段階」のまま）→ 480px 以下はどれも「← 戻る」。報告書の［A4 で印刷］も「A4 で」を `.lbl-x`。面接で［評価に戻る］も出すとき（`.flow-foot.has-sub`）は 1099px 以下で主ボタンの段階の名前（`.lbl-t`）を隠す（「次へ：③ →」）。準備の［記入シート（手書き用）］は 1099px 以下で「（手書き用）」を隠す（「▼ 下にあと n 項目」が並ぶため）。390px・480px で 準備・面接 ①〜⑤・評価・評価から直しに来た面接・報告書の操作行は 1 段（64px。それまで ①・報告書・評価から直しに来た面接は 2 段 112px）
6. **841〜1175px のチップ**（#5）: 番号だけ（`.is-compact`）のときは状態の文字（「省略可」「未確認」）も隠す（状態は枠〔点線・琥珀〕と title・aria-label に残る。済みの ✓ は残す）。それでも 1 行に入らなければ今の段階も番号だけ（`.is-tight`。名前は段階の見出しにある。`fitChips` が測り直す）。841・900・960px で、必須条件の不一致（①・⑤）・① を確かめないまま ③ へ進んだときも帯は 1 段（それまで 900px 前後で 2 段 92px）
7. **481〜840px の「該当の行へ」**（#20）: 隠すのは 480px 以下だけ（`docs/DESIGN.md` 3-11 のとおり。それまでは 840px 以下で隠していた）。600px 以下は案内を短い文（`#ivMustShort`）にして 1 行（全文だと「該当の行へ」と［⑤ 逆質問へ］と並んで 481〜530px で 3 行になるため）。601〜840px は全文で 2 行まで（768px は 2 行・48px。15-6 の「768px では全文が 1 行」はこれで変わる）
8. **準備の高さ**（#21。スクロールを認める案）: 「はじめての方へ」を出したままのノート PC の高さ（1366×657・1366×625・1280×680。学生の区分で卒業予定年月が 2 行目に回ると 1366×768・1280×800 も）では応募者の欄が操作行に隠れる。面接と同じ「▼ 下にあと n 項目」を準備の操作行にも出す（`#saMore`。記入シートの右。n は入力部品が操作行に隠れている欄〔`.field`〕の数・押すと隠れている分だけスクロール・見えたら消す・840px 以下は出さない）。主ボタンは操作行（固定）でいつも見える。はじめての方へを閉じれば 1366×625 でも全部見える。2-1・14-2-4 の「1 画面に収まる」はこれに置き換え。関数は `moreCfg`・`hiddenBelow`・`updateMore`・`showMore`（それまでの `ivHiddenBelow`・`ivUpdateMore`・`ivShowMore`。面接と準備で共用）
9. **テスト**（E21 を追加・書き換え。落とした性質は無い）:
   - E21 レビュー修正（7 件）: (1) メモ欄・文字の欄に書いた直後の 1 回目のクリック（［説明した］・もう一度で外れる・［伝えた］・「▼ 下にあと n 項目」〔中央をマウスで。page.click は固定の操作行のボタンでもページをスクロールすることがある〕・「面接時間の欄へ」・未入力の数）と、change ではボタンの中身を作り直さない（MutationObserver）／(2) 必須条件を確かめないまま［次へ］・Ctrl+Enter・打ち切りと必須条件の無い段階は止めない／(3) ⑤ の合否連絡の順番の 1 行／(4) 未入力の数のボタンと評価に戻る位置（③ は［評価に戻る］・⑤ は［面接を終えて評価へ］）／(5) 390px の操作行／(6) 841・900・960px のチップ／(7) 481〜840px の「該当の行へ」
   - 書き換え: E1 の「1 画面に収まる」（操作行が sticky なので主ボタンの下端の確かめは常に真・直前に先頭へスクロールするので scrollY も常に 0 だった）→ 隠れている欄があれば「▼ 下にあと n 項目」（n は隠れている欄の数）・押すと最後の欄まで操作行の上・主ボタンは見える（区分が未選択と学生の両方）／E10 使い方の 2・6・7 行目／E18 (4) 合否連絡の注記は順番の 1 行＋台本の注記／E18 (10) ① の［次へ］のダブルクリックは ① のまま（必須条件の案内）・もう一度押すと ②・Ctrl+Enter の押しっぱなしは ② から ③ だけ／E19 (1) 下見の ① は［次へ］を 2 回
   - 足した確認は、直した処理を壊した版（`scratchpad/p14b/fixA/break/`）で落ちることを確かめた
   - 件数: 単体 40 件（変わらず）・e2e は E1〜E21・395 件（それまで 388 件）

### 16-8. レビュー修正 B（2026-10-19。見た目と文言）
レビューの指摘（`scratchpad/p14/findings-verified.json`）のうち、色・入力欄・記号とアイコン・呼び方・注記・記入シートの案内の対応（`docs/DESIGN.md` 11 章）。ids・`data-action`・データモデル・判定・用紙の寸法と並び・台本の既定の文言は変えていない（足した id は使い方のカード `#helpSettings`）。
1. **保存 HTML の最終合否の窓の色**（#1・#16・#22）: 窓の［採用］［不採用］（`.pop-dec`）はスタンプのインクの色（採用＝朱 #c8232c・不採用＝藍 #1f4e8c。`--dec-hire`／`--dec-reject` を窓の style に置いていた）で、アプリの報告書のセグメント（採用＝緑・不採用＝赤。2026-10-18）と赤の意味が逆だった → アプリと同じ: 押す前は中立（白地・枠 #848fa1・文字 #3c4658・ホバー #eef1f5）・押した方（`.on`）は 採用＝#146c43・不採用＝#b42318 の塗りに白い文字。`--dec-hire`／`--dec-reject` の指定は消した（朱・藍はスタンプの絵だけ。`docs/SPEC-a4.md` 2-2 の CSS も）
2. **保存 HTML の窓の文字とフォーカス**（#10。オーケストレータの決定）: 題 `.pop-h` 13.5/800 → 13/700・補足 `.pop-sub`／`.pop-ref`・ラベル `.pop-l`・全文の窓の項目名 11.5 → 12px・選択と入力欄の文字は 400。窓の選択・入力欄は `:focus` で枠と輪を 2px の #3b5791（輪の間 1）、窓と保存バーのボタンは `:focus-visible` で 2px の #3b5791（輪の間 2）。窓は印刷に出ないので 1 ページの計測は変わらない（E8・E14 の 1 ページの確認はそのまま緑）
3. **面接所見の欄の枠**（#2）: `.card-body > :first-child`／`:last-child`（帯の下の最初の行の線と余白を消す規則）が、本文が欄だけの面接所見 `#clIvNotes` の上の枠と上下の内側の余白まで消していた → 枠のある部品（入力欄・選択・メモ欄・`.alert`・`.panel`）を `:not(:where(…))` で除く（詳細度は同じ）。最後の子の総合判断・人物像の警告の箱（`#overallWarn`・`#clPsWarn`）の下の内側の余白も戻った
4. **○△× のフォント**（#3）: 「この画面ですること」（面接・評価）と使い方の文の ○△× が欧文のフォント（Segoe UI に × だけがあり、× だけ小さい形）→ `jaMarks()`（esc 済みの文の ○△× を `.ja` で包む）を「この画面ですること」と確認点の補足（台本の hint「○＝離職要因なし…」）に、使い方の 2 か所は `<span class="ja">`
5. **帯のアイコンと題**（#4）: 帯（`flex-wrap: wrap`）で題の幅が残りより長いと題だけが次の行へ回った（390px の使い方の 1 枚目・長いアプリ名）→ アイコン・番号の後ろの題に `max-width: calc(100% - 20px - 12px)`（題の中で折り返す。数は題の 2 行目）
6. **右サマリーの押印の ✓**（#6）: 文字の ✓ → `i-check`（紺）＋ `.sym`（textContent は「面接対応者 ✓ 笹川」のまま）
7. **評価の「していない」**（#7）: 説明・合否連絡を全部していないときも 一部のときと同じ ⚠（`i-alert`・琥珀）
8. **設定の呼び方**（#8・#29）: 使い方のカードの題「設定（劇場プロファイル）」→「設定（劇場ルール）」（サイドバー・トップバーと同じ。JSON のファイル名など「劇場プロファイル」の JSON を指す所は変えない）。カードに `id="helpSettings"`（e2e は id で探す）
9. **準備のタクシーの見本**（#9）: 「例: 可・2,500円」→「例：可・2,500円」（ほかの見本と同じ全角のコロン）
10. **勤務条件の確認の注記**（#14）: 「聞くことの答えを選ぶ・記入する」が質問の無い 3 欄（契約開始日の希望・初回契約終了・OPEN／25時）にも掛かっていた → 「応募者に聞いて選ぶ・記入する」＋ Q 番号のタグのある欄があれば「（Q1 は聞くことの答え）」（タグの番号を並べる。タグの無い台本では付けない）。欄の置き場所（確かめること）は変えない
11. **話す → 聞く → 確かめる**（#17）: 面接の「この画面ですること」「台本どおりに話す・聞く・メモ。…」→「台本どおりに 話す → 聞く → 確かめる（答えはメモ）。○△× などの評価は面接のあとで付けます。」・サイドバーの手順のヒント「台本どおりに話す・聞く・メモ」→「話す → 聞く → 確かめる」（1 行に入る長さ）・はじめての方への手順 2「台本の ①〜⑤ を 1 段階ずつ話す・聞く・メモ」→「台本の ①〜⑤ を 1 段階ずつ 話す → 聞く → 確かめる」
12. **記入シートの並びの案内**（#19）: 準備の［記入シート］の title「（面接・評価の画面と同じ並び）」→「（面接 ①〜⑤ → 評価の順。段階の中は台本の順）」・使い方「（面接 → 評価の画面と同じ並び・…）」→「（面接 ①〜⑤ → 評価の順・…）。段階の中は台本の順（確かめる → 話す → 聞く）で、面接の画面（話す → 聞く → 確かめる）とは並びが違うので、転記は項目の名前で合わせます。」。用紙（`paperSheetHtml`・単体 #97・1 ページの計測）は変えない
13. **テスト**（E22 を追加・E9 に 2 件・書き換え。落とした性質は無い）:
   - E9: 保存 HTML の最終合否の窓の［採用］［不採用］の計算された色がアプリの報告書のセグメント（押した採用・押した不採用・押していない）と同じで、インクの朱・藍ではない／窓の題 13/700・補足とラベル 12・開いた窓の担当者の欄と Tab で移った［採用］のフォーカスの輪が solid 2px rgb(59, 87, 145)
   - E22 レビュー修正 B（9 件）: (1) 準備・面接 ①〜⑤・評価・報告書・使い方の見えている ○△× の font-family が --font-ja（掛け算の × は除く）／(2) 面接所見の欄の枠と内側の余白が準備のメモ欄と同じ・カードの入力欄に上の枠の消えたものが無い・最後の警告の箱の内側の余白は上下同じ／(3) 使い方の帯のアイコンと題が同じ行（390・360px・長いアプリ名で 600・390px）／(4) 右サマリーの押印の ✓ は `i-check`（紺）で文字の ✓ は見えない／(5) 評価の「していない」「伝えていない」「一部説明していない」は `i-alert`（琥珀）・「説明した」は `i-check`／(6) 設定の呼び方が使い方・サイドバー・トップバーで同じ／(7) Q のタグの付く欄が無い台本では注記に「聞くことの答え」を付けない／(8) 「この画面ですること」・サイドバー・はじめての方への 3 つが カードの名前と同じ 話す → 聞く → 確かめる／(9) 記入シートの案内が用紙の見出しの順（確かめる → 話す → 聞く）と面接の画面の順を言い、「同じ並び」と言わない
   - 書き換え（文言だけ）: E1 のサイドバーのヒント・タクシーの見本／E2 の「この画面ですること」・勤務条件の確認の注記／E17 (13) の記入シートの並びの文・設定のカードは `#helpSettings` で取る
   - 足した確認は、直した処理を 1 つずつ元に戻した版（`scratchpad/p14b/fixB/break/`・13 版）で、それぞれ狙った確認だけが落ちることを確かめた
   - 件数: 単体 40 件（変わらず）・e2e は E1〜E22・406 件（それまで 395 件。E22 の 9 件と E9 の 2 件）

### 16-9. レビュー修正 C（2026-10-19。テスト・コード・docs）
レビューの指摘（`scratchpad/p14/findings-verified.json` の #23〜#28・#30〜#32）のうち、確かめていない性質・常に真の確認・使われないコード・直書き・docs の食い違いの対応（`docs/DESIGN.md` 12 章）。ids・`data-action`・データモデル・判定・用紙・台本の既定の文言は変えていない（消したのは使われていない処理・class・アイコンだけ）。
1. **アイコンの確かめ**（#23）: e2e はボタンなどのラベルを、`.sym` を除いた見える文字とアイコンの id で比べる（`window.__lbl`。BrowserContext の init script。例「[arrow-left] 準備に戻る」「次へ：② 継続性・報連相 [arrow-right]」「[check] 説明した」「[printer] A4 で印刷」「[chevron-down] 下にあと n 項目」。参照先の `<symbol>` が無ければ「[id?]」）。それまでは textContent（見えない `.sym` の記号）を比べていたので、アイコンの綴りを誤っても（参照先が無いと 16px の空の箱だけが残る）388 件とも通った。書き換えた確かめ: E1（面接を始める・下にあと n 項目）・E2（前の段階・次へ・説明した・一部説明しなかった・伝えた・流れの注記・面接に戻る・報告書へ・保存・A4 で印刷・応募者の 1 行〔2 行目の頭の「・」は `.sym`〕）・E6・E17 (1)（記入シート・人物像の前書きの 1 行）・E18（説明した・面接を終えて評価へ・評価の面接のメモの説明・報告書の戻ると保存・旧い記録の操作行と準備の主ボタン・使い方の戻る・localStorage の使えない環境の準備の主ボタン）・E19（準備の主ボタン・面接時間を確かめる・報告書を印刷）・E21（下にあと n 項目・390px の戻る）。
   - e2e E23 (1): 準備・面接 ①〜⑤・評価・報告書・設定（台本の編集を開く）・使い方・390px・ダークのすべての `<use>` の参照先があり、見えているものは getBBox の幅と高さが 0 より大きい・スプライトのアイコンはどれもどこかで描かれる・主なボタンのアイコンの id（次へ・面接を始める・報告書へ → arrow-right／戻る → arrow-left／説明した → check／一部説明しなかった〔開く〕→ chevron-up／記入シート・印刷 → printer／保存 → download／面接の画面で直す → pencil／ダーク → sun ほか）
   - 単体 #101: src の参照（`ico()`・`icon:`・helpCard／section のアイコン・`href="#i-…"`・トグルの `'#i-' + (…)`）はどれもスプライトにあり、スプライトのアイコンはどれも参照される
2. **上の帯のタイマー**（#24）: E20 (4) の timer の条件は「1 行目〔`.iv-bar-main`〕の矩形に入っているか」で、タイマーがチップの下に回っても真だった → タイマーはチップの並びの右（左端 ≧ チップの並びの右端）で中心の高さがチップと同じ（差 2px 以内）・1 行目の高さは〔チップかタイマーの高いほう〕＋上下の内側 16px（＋2 まで。2 段になると 100px 前後）
3. **確かめなくなっていた性質**（#25）: E19 (5) に、段階の見出し（［次へ］・チップで移ったときのフォーカス先）から Tab で 話す（「一部説明しなかった」→［説明した］）→ 聞く（質問のメモ・台本の順）→ 確かめる（① は行の操作をすべて。日付の欄の年・月・日は 1 つに数える）→ 主ボタン（①②⑤）と、⑤ の［伝えた］は Tab で届き Space で押せる（もう一度で外す）。E18 (13) に目安の太さ 400。16-6 の「落とした性質は無い」は、決定で変えた性質と、確かめなくなっていた性質（ここで足した）を書き分けた
4. **使われないコード**（#26）: 報告書の `paper-stack`（報告書は 1 列〔`.page.reading`〕なので grid の列が 1 つで付かなかった。`fitReportPaper` と `renderStep` の処理・`.judge-layout.paper-stack .summary`）・`.field-row > .f-wide`・スプライトの `i-x`・`cardHtml` の `bandCls`／`bodyCls` を消した。右サマリーを紙の下に回すのは `.page.reading .summary`（DESIGN 4-5）。`.lbl-s` は 16-7 の 5（480px 以下の「← 戻る」）で使うようになったので残した。e2e E8 の使っていない `stack` も消した
5. **e2e のコメントとメッセージ**（#27）: 確かめと違うことを書いていた所を直した（E18 の「②〜⑤ はスクロールなし」「【質問】の記入欄は 1 問目のカードのすぐ上」「1280×800 は ① が列の幅の比で短くなり」「14px 以上」・冒頭と E19 の「① の列の幅」・E2 と E17 の「総評」・E19 (6) の「タイマー（トップバーのすぐ下）」・E18 (2) の「同じ列のすぐ上」）。app.js の必須条件の案内の短い文の幅（600px 以下）のコメントも
6. **docs の食い違い**（#28）: HANDOFF の TODO（840px 以下はトップバーが流れ、固定はタイマーと案内と操作行）・README の E2 と E18 のシナリオ（総評・【質問】の記入欄の場所）・DESIGN 4-5（`paper-stack`）を直した。DESIGN 3-10 の「← 戻る」と 3-11 の「該当の行へ」（480px 以下だけ隠す）は 16-7 で実装が合っている
7. **新しい振る舞いの確かめ**（#30。e2e E23 (2)〜(6)）: (2) 390px で面接 ① の確かめること（8 行）と評価の必須条件（2 行）の操作はラベルの下で行の幅いっぱい（不一致の行も）・［説明した］は帯の内側の幅いっぱい・「一部説明しなかった」はその上の行の右端 (3) 記入欄の見本（既定の台本の「例：12/24〜12/26」「例：タクシー可・25時まで可」・文言を変えた欄は「記入」・台本の欄の placeholder はそのまま） (4) サイドバーの手順の Enter／Space（まだ進めない手順は動かず、Space でページもスクロールしない） (5) ⑤ の案内「必須条件が不一致です。⑤ 逆質問は最大 10 分で終了します」（［⑤ 逆質問へ］なし）・390px の短い文「必須条件が不一致（最大 10 分で終了）」 (6) 準備・面接 ①⑤・評価・報告書・設定・使い方をライト／ダーク × 1440／390px で、見えている文字のコントラスト 4.5:1 以上（24px 以上・18.66px 以上の太字は 3:1）・番号の丸と入力欄の見本も・文字は 12／13／15／17／20／24px・太さは 400／700 だけ（A4 の用紙・無効は除く。測るあいだ transition を止める）
8. **余白の直書き**（#31）: 部品の間の 2px・6px を `--sp-1`・`--sp-2` に（行の補足・劇場名・設定のチェックの補足・はじめての方への手順の箱の中・設定の節のメニュー・600px 以下の値の行・面接時間の内訳・840px 以下のサイドバーの手順〔8 にすると 390px で「報告書」が 2 行になるので 4〕・右サマリーの「さん」と押印の ✓・ダークのロゴの台紙）。位置合わせの値は元の寸法の式に（台本の編集の番号 `calc((var(--h-md) - var(--lh-label) * 1em) / 2)`・使い方の点の left `calc((20px - 6px) / 2)`）。残る例外（位置合わせ・部品の内側の寸法）は DESIGN 1-5 の表に書き、単体 #102 が styles.css の 4 の倍数でない余白を表と照らす（表に無い値・styles.css に無い表の値はどちらも失敗）
9. **テストの重複と正規表現**（#32）: E18 の `fit18`・`seen18`・`IV_ITEMS18` と E19 の `fit19`・`ok19`・`IV_ITEMS19`（同じもの）を共通のヘルパ `ivFit`・`ivSeen`・`IV_ITEMS`（`ivGo` の隣。app.js の `IV_MORE_SEL` に対応）・`ivMoreNow`・`ivHiddenNow` にまとめ、E18 (12) の測り直しを外した。E20 (1) のカードの順は data-kind と data-say の順位（説明 0・合否連絡 1・聞く 2・確かめる 3。前のカードより後ろ）で確かめ、② に合否連絡を足した台本（検証のエラー・警告なし）で「話す（説明）→ 話す（合否連絡）→ 聞く」も確かめる（それまでの正規表現 `^(say\+)?(ask\+)?check$|…` はこの台本を落とした）
10. **テスト**: 単体 42 件（#101・#102 を追加）・e2e は E1〜E23・414 件（それまで 406 件。E23 の 6 件・E19 (5) と E20 (1) に 1 件ずつ）。足した確かめは、直した処理・性質を 1 つずつ壊した版（`scratchpad/p14b/fixC/break/`）で、狙った確かめが落ちることを確かめた


### 16-10. レビュー修正 D（2026-10-19。最終確認の抜け）
最終確認（アートディレクター・初見の利用者・正しさの 3 つの見方）で挙がり、反証者 2 名が本物と判定した 12 件の対応（`docs/DESIGN.md` 13 章）。ids・`data-action`・データモデル・判定・用紙の寸法と並び・台本の既定の文言は変えていない（足した class は `.lbl-nb`・`.iv-who-san`・`.row.has-undo`／`.row-undo`）。
1. **用紙の最終合否の文字の色**: 報告書の紙・保存 HTML・印刷の結果の帯で、「最終合否 採用／不採用」の文字がスタンプのインクの色（`stamp.js` の `decisionSheetHtml` が `.cl-dec-v` に `style="color:朱／藍"`）で、同じ帯の結果のタイル（採用推奨＝緑・不採用推奨＝赤）と色の意味がぶつかっていた（推奨を覆して採用すると「不採用推奨」〔赤〕と「採用」〔朱〕が並ぶ・「不採用」は藍で見出しの紺に近い）→ 文字に色を付けず、用紙の CSS で意味の色（`.cl-decision.is-hire .cl-dec-v`＝#146c43・`.is-reject`＝#b42318）。インク（朱・藍。設定の hireColor／rejectColor）はスタンプの絵だけ。保存 HTML の窓で押し直しても同じ（埋め込みの `decisionSheetHtml` も同じ関数）
2. **保存 HTML の窓の部品の枠**: 窓の担当者の欄（`.pop select, .pop input`）と［取消］［閉じる］の枠が v1 の #c7d0db（白地に 1.56:1。部品の境の 3:1 に届かない）・欄の角丸 6 で、同じ行の［採用｜不採用］（#848fa1）と見た目が 2 種類あった → 枠 #848fa1（`--border-control`）・角丸 8、紺でも押した状態でもないボタンのホバーは #eef1f5（アプリの副ボタン）。寸法（高さ）・紺の［確認］［押印］・保存バーは変えない（`docs/SPEC-a4.md` 2-2）
3. **トースト**: `left: 50%`＋`translateX(-50%)` で、内容に合わせて縮む幅の上限が画面の半分になり、390px で 195px・4 行（下の［いずれか｜両日］に重なる）。PC では画面の中心で、本文の列の中心から 124px 左だった → `left`（841px 以上は `var(--sidebar-w)`、840px 以下は 0）と `right: 0` を決め `margin: 0 auto`・`width: max-content`・最大 `min(100% − サイドバー − 48px, 560px)`（840px 以下は `100% − 32px`）。中心は本文の列（`.main`）の中心・サイドバーに掛からない・390px は左右 16 の余白まで広がって 2 行
4. **評価の結果カードの 390px**: 「⚠ 面接時間を確かめてください（タイマー 6分12秒・目安 41分）→ 面接時間の欄へ」（`#evTimeWarn`）が inline-flex で文と行き先が別の列になり、「タイマ／ー」「面接時間／の欄へ」と語の途中で割れていた（2026-10-18 からの退行）→ ボタンを block にして 1 つの文として流す（⚠ は左の余白に置いて 1 行目・「面接時間の欄へ」は折らない・`line-break: strict` で行頭に「ー」を置かない）。DOM・`.ev-tw-t` の文字だけを替える作りは同じ。未入力の数（`#evMissing`）が 2 行に折れたときも ⚠ は 1 行目（文字だけのボタンの行〔32px〕の中央）
5. **［次へ］の文字・氏名と「さん」**: ［次へ：② 継続性・報連相 →］の「次へ：」「②」「継続性・報連相」が別々の flex の項目で、間がボタンの部品の間（8px）になり不ぞろい（「：」と ② の間 11〜15px）→ 1 つの span `.lbl-nb`（inline-flex）に入れて「：」の直後に番号の丸・丸と名前の間 4。名前を隠す `.lbl-t`（1099px 以下の［評価に戻る］つき）はそのまま。見える文字（`__lbl`）は同じ。面接の見出しの応募者「<b>氏名</b>さん」は間が 0 → `<span class="iv-who-san">さん</span>`（間 4。右サマリー・トップバーと同じ）
6. **準備の選択の文字**: 1280px の準備で面接担当者の欄（186px。文字に使える 136px）が「笹川 晴央（副支配人）」（139〜154px）を「…」で切っていた（2026-10-18 の select の `text-overflow: ellipsis` と右の内側 36px から）→ 2 行目の配分を 面接日 1・面接担当者 1.5・応募した求人 0.75 に（1181px でも 1 行・［通常｜短期］ははみ出さない）。同じ 1 行目の区分の未選択の文言も「選択してください」が 1280px で切れていたので、性別と同じ「選択」に
7. **省略できる段階の「していない」**: 必須条件の不一致で打ち切った ①→⑤ の評価で、省略できる ②〜④（点線の枠・中立の「省略可」）の面接のメモの「説明：していない」が琥珀＋⚠（16-8 の 7 で ⚠ を付けた）で、やり忘れの注意に見えた → `.cl-skippable .kv-v.is-off` は中立（`--text-2`・400・⚠ なし）。実際に行う段階（① と案内先の ⑤）の「していない」「伝えていない」は琥珀＋⚠ のまま。評価で必須条件を一致に戻すと（`.cl-skippable` が外れて）琥珀に戻る（CSS だけ）
8. **設定の単位・コロン・チェックの文**: 得点率・帯の境界の 4 つの欄（そのまま・不採用推奨・面接評価の帯：高・中）は「%」を欄の外の説明に入れていた → 単位つきの欄（`.input-unit`。欄の中の右に「%」。目安の「分」と同じ部品。欄は 96px・説明は欄の右）。ラベル・見本・補足の半角のコロンを全角に（「面接評価の帯：高／中」「版（例：2026-10-08）」「例：「大丈夫です」…」「（例：条件一致：2へ）」「例：笹川 晴央|…」・サイドバーの「判定ルール：」）。チェックボックスの行の文（`.check-row .lbl`）は 15/700 → 15/400（太字は小見出し・ボタンだけ。`docs/DESIGN.md` 1-4）
9. **最終合否の［取消］の位置**: 報告書の押印の欄の［取消］は［押印］の下の行の右端なのに、最終合否の［取消］は見出し帯の右端で、同じ操作の場所が 2 つに分かれていた（2026-10-18 からの退行。Tab も［取消］が先）→ ［採用｜不採用］の下の行の右端（`.row.has-undo` の 2 行目 `.row-undo`。行の間 8・右端は操作列の右端）。Tab は 担当者 → 採用 → 不採用 → 取消。390px でも帯は 1 行（それまで［取消］で 80px）
10. **打ち切りのときの人物像の札**（F15 の漏れ）: 必須条件の不一致で不採用推奨に固定（mustGate）したとき、評価の結果カードは「ほかの入力は任意です」なのに、人物像の合計の札だけ琥珀の「未入力 7・上長最終判断要まで」（判定は人物像を使わないので効かない上限）だった → `updatePersonaUI(ps, root, gate)`: gate のときは下がる上限を出さず、未入力があれば中立の「未入力 n（任意）」・全部入れたら札を出さない。1 点の警告は「1 点の項目があります（…）。」だけ（「結果は…になります」を付けない）。一致に戻すと今までどおり
11. **アプリの用紙の押印行**（`docs/SPEC-a4.md` S13・A10）: 押印の欄のカードの規則（`.stamp-box` の縦並び・`.stamp-meta` の中央寄せ・`.stamp-label` の行の高さ。2026-10-18）が、同じ class を使う用紙（報告書の紙 `#appPaper`・印刷ホスト `#clSheet`）に漏れて、アプリの用紙だけ押印行が縦並び（52 → 89px）になり、面接メモ・所見の枠が短く（長いメモは「…」で切れる量が増える）、保存 HTML の用紙と違っていた → カードの規則を `#mgmtCard` に絞る（用紙は `storage.checklistSheetCss` の形のまま）
12. **キーボードで［次へ］を押したときの必須条件**: 未確認の必須条件で止まる 1 回目（16-7 の 2）が［一致］へフォーカスを移すので、キーボード（Enter・Space）で［次へ］を押した人が案内どおり「もう一度押す」と、そのキーが［一致］に当たり、確かめていない必須条件が一致として記録されていた（Enter の押しっぱなしでも）→ キーボードで［次へ］そのものを押したとき（click の `e.detail` が 0 で、Ctrl＋Enter の経路〔`ivShortcut`〕でないとき）は `ivMustHold(true)` でフォーカスを［次へ］に残す（行を中ほどに出す・琥珀・案内は同じ。もう一度 Enter／Space で進む）。マウスと Ctrl＋Enter は今までどおり［一致］へ移す。面接のボタンの上の Enter・Space の押しっぱなし（`keydown` の `e.repeat`）は捨てる（［一致］［説明した］が付いたり外れたりしない・案内を飛ばして進まない）。案内の文「…（もう一度押すとそのまま進みます）」は変えない（どの押し方でも事実どおり）
13. **テスト**（E24 を追加・E9 に 1 件・単体 #67 と #102 を書き換え。落とした性質は無い）:
   - E24 レビュー修正 D（11 件）: (1) アプリの報告書の紙・印刷ホストの用紙と保存 HTML の用紙のすべての要素の計算されたスタイル（並び・文字・色・余白・枠・大きさ）が同じ（ライト／ダーク）・押印行は横並び／用紙の最終合否の文字は 採用＝緑・不採用＝赤（style の色なし）でスタンプの絵だけが朱・藍 (2) トーストは本文の列の下中央・最大 560・390px で左右 16 の余白まで・2 行 (3) 390・360px の結果カード（面接時間の案内は 1 つの文・「面接時間の欄へ」は割れない・行頭に「ー」なし・⚠ は 1 行目・未入力の数の ⚠ も 1 行目） (4) ［次へ］の「：」の直後に番号・丸と名前の間 4・縦の中心／氏名と「さん」の間 4 (5) 準備の選択の文字が 1181・1280・1366・1440px で切れない (6) 省略できる段階の「していない」は中立・① と ⑤ は琥珀・一致に戻すと琥珀 (7) 打ち切りのときの人物像の札と 1 点の警告 (8) 設定の「%」・全角のコロン・チェックの文 15/400 (9) 最終合否の［取消］の位置・Tab・390px の帯 (10) キーボードで［次へ］を 2 回（Enter・Space）・押しっぱなし（［次へ］・［一致］）
   - E9: 保存 HTML の窓の担当者の欄と副ボタン（押していない合否・取消・閉じる）の枠 #848fa1・角丸 8・［閉じる］のホバー #eef1f5
   - 単体: #67 の `decisionSheetHtml` の期待を「文字に style の色なし・スタンプの stroke はインク・用紙の CSS に意味の色」に、#102 の例外の表に `.ev-res-time > .ico:first-child` の top 1（⚠ を 1 行目にそろえる位置合わせ）
   - 足した確かめは、直した処理を 1 つずつ元に戻した版（`scratchpad/p14b/gapfix/mut/`・13 版）で、それぞれ狙った確かめだけが落ちることを確かめた
   - 件数: 単体 42 件（変わらず）・e2e は E1〜E24・426 件（それまで 414 件。E24 の 11 件と E9 の 1 件）

### 16-11. 仕上げ（2026-10-19。通しの確認・docs の照合・スクリーンショット・見本の手順書）
最終確認の 12 件（16-10）のあと、修正者の確定した指摘なしの状態で通しの確認をした。src・用紙・データモデル・判定・ids・`data-action` は変えていない（変えたのは e2e の撮影のスタイル 2 か所と docs）。
1. **テスト**: `node build.js`（dist は変わらない）・単体 42 passed・e2e ALL PASSED 426 件（2 の前と後の 2 回。ログ 前 `scratchpad/p14c/finish-e2e-1.log`・後 `scratchpad/p14c/finish-e2e.log`）
2. **e2e の全体のスクリーンショット**: E18 の `full18`（`p13-evaluate.png`・`p13-interview-390.png`）と E17 の `shotEl17` は、撮るあいだ固定を外すのに操作行 `.flow-foot` も `position: static` にしていた。操作行の横いっぱいの地 `.flow-foot::before`（`position: absolute; inset: 0 -100vmax`）の基準が操作行からページの先頭の 1 画面（初期包含ブロック）に移り、`.main` の `overflow-x: clip` の外に出るので、全体の画像が 2 倍の幅（1440 → 2880px・390 → 1234px）になり、上 1 画面を地が覆っていた（2026-10-18 から。画像だけで確かめの結果には影響なし）→ 操作行は `position: relative`（`bottom: 0` なので位置は変わらない）。トップバー・上の帯・評価の結果カード・狭い画面のタイマーと案内は今までどおり static（`top` があるので relative にするとずれる）。`docs/DESIGN.md` 3-10 に注記。件数は変わらない
3. **docs の照合**（実装と docs、docs どうし）で直したこと:
   - README: 2026-10-16 の段落の面接の順「確かめる・話す・聞いてメモ」→「話す → 聞く〔答えをメモ〕→ 確かめる」・2026-10-18〜19 の画面の見直しの段落を追加・評価の「上の帯」→「画面の上に固定した結果のカード」・人物像の説明の「評価の画面の総評」（2026-10-18 に「総評」の見出しは無くなった。16-4）→ 総合判断のカードの説明（人物像で下がる条件）と人物像のカードの札（下がる上限）・設定の「不一致のとき案内するセクション」「セクション」→「段階」（設定の画面の文言どおり。16-5）・設計方針の台本の構造を「段階〔`sections`〕」・e2e の件数 E1〜E23・414 → E1〜E24・426・E20 の「スクリーンショット p14-*.png」（e2e では撮らない）・docs の一覧の注記
   - HANDOFF: 1-1 の面接の「480px 以下の案内は短い文」→ 600px 以下・「該当の行へ」は 481px 以上（16-7 の 7）／チップの状態の文字を隠す・`.is-tight`（16-7 の 6）／キーボードで押した［次へ］はフォーカスを残す（16-10 の 12）／TODO のスクロールの量を測り直した（新規の記録・求人は未選択で 1440×900 は ① 923・② 61・③ 122・④ 61・⑤ 0、1366×657 は ① 1,166・②④ 304・③ 365・⑤ 215px。390×844 の不一致の案内つきで見える本文 696px〔タイマー 40・案内 44・操作行 64〕は記載どおり）・副支配人に確認したいことに画面の見直し・用紙のフォント（DESIGN 4-9 の「気づいたこと」）を TODO に／2 の決定事項に R（2026-10-18 の画面の見直しの選択。16-1。変更不可）が無かったので足し、N（評価の「総評」）・Q（面接の並び・操作行）に 2026-10-18 からの注／件数・この回の項目
   - DESIGN: 版の表に 2026-10-19 の追記・3-10 の撮影のときの操作行・3-11 の実装の実測（帯 63.5／枠込み 65.5・不一致なし 77.5／あり 122 ＝ `--flow-top-h` 133.5／178px・1366×768 で不一致のまま見える本文 526px は記載どおり）・8 章の class 名（`.score-seg`・`.summary-card` は実装で `.seg`・`.card.sm`）・14 章
   - 本書: 16-6 の件数・撮影のスタイル・p14 の撮り方の注記、本節
   - 照らしたが食い違いの無かったもの: DESIGN 3-10 の主ボタンの座標（右から・下から 1440×900 は 36,12・1366／1280／1180／1100px は 32,12・1536×864 は 84,12・1920×1080 は 276,12・390px は 16,12、［戻る］の左端 284／280。準備と面接で実測）・DESIGN 1-2 の役割トークンの表（ライト・ダーク。styles.css をスクリプトで照合）・DESIGN 3-8 のチップの番号だけの境目（撮影のフォントで 1176px 以上は付かず 1175px で付く）・使い方の「面接の進め方」と README の 8 行・docs にコードの書式で書いた class・id・関数名・トークン（削除したと書いたもの・e2e のヘルパ・試作の id のほかはどれも src にある。`scratchpad/p14c/finish/doc-idents.py`）
4. **スクリーンショット** `tests/shots/p14-*.png`（10 枚）を撮り直した（`scratchpad/p14c/finish/shoot-p14.js`。`scratchpad/p14/shoot-p14.js` を直したもの）: ① の必須条件を 2 つとも確かめてから［次へ］（未確認のままだと 1 回目は止まる。16-7 の 2）・時計を止めているので待つあいだは `runFor`・スクロールの直後は実時間で待ってから `runFor`（スクロールのイベントは実時間で届き、アプリの requestAnimationFrame は止めた時計で動くので、先に `runFor` すると「▼ 下にあと n 項目」がスクロールの前の数のまま写った）・撮るあいだはトーストの transition を止める・各画面で記録を確かめる（① の説明した・必須条件・メモ・タイマー 06:12・② の一部説明した・⑤ の不一致の案内・評価・報告書の採用推奨）
5. **見本の手順書** `scratchpad/deliver14/walk.js`（deliver13 を今の画面に直したもの。`LANG=C.UTF-8 node walk.js <HTML の絶対パス> <出力フォルダ>`）: 準備（見本 花子・面接担当者は名簿に「笹川」を含む人〔いなければ名簿の最初の人〕・通常求人）→ 面接 ①〜⑤（段階ごとに 話す〔読み上げ〕→ 聞く〔13 問のメモ〕→ メモを書いた直後、メモ欄にフォーカスがあるままマウスで［説明した］／⑤ は［伝えた］→ 確かめる〔① の必須条件・記入欄〕。段階の時間は約 9:00・2:50・9:20・7:00・4:30〔どれも目安の内〕）→ 評価（確認点 ○・人物像 28/35・総合判断「採用」・面接所見）→ 報告書（面接対応者の押印）→ 保存 HTML → その印刷イメージの PDF → 白紙の記入シートの PDF。書いた・押した・選んだこと・段階の時間・用紙の 1 行（説明済み・合否連絡・面接時間）・保存 HTML の記録・PDF のページ数と本文を 92 か所で確かめ、記録されなければその場で止めて報告する（exit 1）。撮るもの: `1_準備.png`・`2_面接_①勤務条件.png`（段階の先頭）・`2b_面接_①勤務条件_確かめること.png`・`3_面接_②継続性・報連相.png`・`4_評価.png`（全体）・`5_報告書.png`・`6_報告書の印刷イメージ.png`・`7_記入シート.png`・`見本_面接チェックリスト報告_見本花子.html`・`見本_報告書の印刷イメージ.pdf`・`面接記入シート_白紙.pdf`。撮影は Windows の見た目のフォント（`scratchpad/p14/tools/fonts.js` と同じ。用紙・PDF には使わない）
   - 公開版の dist（`scratchpad/deliver14-public/`）: ページのエラーなし・PDF は 2 つとも A4 1 ページ・説明済み ① 2/2 ② 3/3 ③ 4/4 ④ 3/3・合否連絡 採用時 ☑ ／ 不合格 ☑・面接時間 33 分（目安 41 分）・採用推奨・人物像 28/35。テスト用の架空のローカル版（`node build.js --local tests/fixtures/local-sample --out …`）でも通る（ロゴ・名簿 2 名・パスワードあり。名簿に「笹川」がいないので最初の人）
   - Playwright の `page.clock` を止めずに（`install()` のまま実時間で）`fastForward` すると、進めた時刻がときどき戻り（試した 5 回のうち 3 回、どれか 1 つの段階で）、その段階の時間が 1 秒になった → アプリの画面は `pauseAt` で止めて `fastForward`・`runFor` で進める（e2e の E18 と同じ）。保存 HTML と記入シートは時計の無い別の BrowserContext で開く。アプリの不具合ではない（`ivCommit` は `Date.now()` が戻ったときはその間を数えない作り。実機で時計が戻るのは時刻を合わせ直したときくらい）
6. 件数: 単体 42 件・e2e は E1〜E24・426 件（変わらず）

### 16-12. 仕上げ 2（2026-10-19。最終回の確認で反証が割れた 2 件をオーケストレータの判断で直した）
最終回の確認（直した 12 件の確認・正しさの回帰・見た目。high／medium だけ）で、12 件はすべて解消していた。挙がった 2 件は 2 名の反証が 1 対 1 に割れたが、どちらも小さく直せて害が無いので直した。
1. **案内から行へ移したときのフォーカス**: 評価の結果カードの未入力の数（16-7 の 4・`data-action="ev-miss"`）と面接の必須条件の案内の「該当の行へ」（`iv-must-row`）は、移った先の行の操作（［一致］・○・1・［採用］／［不一致］）にフォーカスしていた。キーボードで押した人が続けて Enter・Space を押す（押しっぱなしを含む）と、そのキーが操作に当たり、確かめていない値が記録された（「該当の行へ」では［不一致］が外れ、不採用の打ち切りが消えた）。16-10 の 12 と同じ形 → **行そのもの**（`.row`。`tabindex="-1"` を付けて `focus`）にフォーカスする（`focusRow`）。Tab で行の最初の操作へ進む。フォーカスの輪は共通の `:focus-visible`（キーボードで押したときだけ出る）。マウスで押したときも同じ（行は画面の中ほど・帯の下に出て、未入力の行は琥珀の地）
2. **右サマリーの押印の行**: 2 欄とも押すと「面接対応者 ✓笹川／最終確認 ✓笹」＋「川」と、氏名の途中で 2 行に割れていた（1280〜1440px。値の列 224px に 228px。2026-10-19 の ✓ のアイコンで幅が増えた）→ 1 欄ずつ `.sum-stamp`（inline-block・max-width 100%）にまとめ、区切りの「／」は前の欄の末尾、欄の間に `<wbr>`。入らないときは欄と欄の間で折り返す（textContent は同じ）
3. **テスト**（E9 に 1 件・E20 (5)・E21 (1)・E21 (4)・E21 (7) を書き換え。落とした性質は無い）: E9 右サマリーの押印の行は 1440・1366・1280・390px で 1 欄ずつ 1 行／E20 (5) 「該当の行へ」で不一致の行そのものにフォーカス・続けて Enter・Space・Enter で［不一致］は外れない・Tab で［一致］／E21 (1) メモに書いた直後の「未入力：確認点 n」も 1 回目で行そのものへ／E21 (4) 未入力の数で行そのものにフォーカス・Tab で［一致］・○・1・採用・キーボードで押して続けて Enter・Space・Enter でも記録は変わらずフォーカスは同じ行（Space は行の上ではページを送る。ブラウザの既定）／E21 (7) 768px の「該当の行へ」も行そのもの
4. 件数: 単体 42 件・e2e は E1〜E24・427 件（それまで 426 件。E9 の 1 件）
