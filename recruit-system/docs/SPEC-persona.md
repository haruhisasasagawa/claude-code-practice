# SPEC-persona — 人物像（1〜5 点）・面接記入シート（手書き用）・面接中はメモ中心（作業仕様）

作成 2026-10-16。基準コミット `c0d20ce`（全テスト緑: 単体 33 件・e2e E1〜E16 276 チェック）。**commit / push はしない**。
行番号は書かない（関数名・定数名・id で探すこと）。作業用ファイルは `scratchpad/p12/`（このセッションの scratchpad。試作 `proto-paper.js`・`proto-a4.js`、fixture の元 `make-legacy-pre-persona.js`・`legacy-pre-persona.html`）。
リポジトリは公開中: 実名は笹川 晴央だけ（台本の作成者などの名前を書かない）・実ロゴ・実パスワードを入れない。`local/` の中身を出力しない。`node build.js --local`（引数なし）は実行しない。

---

## 0. 目的・前提・決定事項

### 0-1. 使った人のフィードバック（副支配人経由）
1. 1 対 1 でなければ面接しながらの運用は苦慮するかも。**メモを有効活用**することをあらかじめ認識しておけば 1 対 1 は問題なさそう
2. 紙で書きたい人は、面接後の報告の際に**転記**するでも、フォーマットが統一されて良いかも
3. 面接チェックリストは全部質問するわけではないので**内容を厳選**してもよい。**笑顔や声のトーンなどの接客評価項目がない**（接客業でご意見につながるポイント）ので最後の総評に入れてもいい。どんなにシフトや条件が良くても**話し方や表情で NG** はこれまでの傾向でも大いにある。内容をコンパクトにすれば報告書として双方の負担軽減
- 副支配人の指示: 「元々入れていた 1 から 5 点形式の人物像の項目を入れておきたい。ほか修正案をできる限り反映させてほしい」

### 0-2. 副支配人の選択（変更不可）
- 人物像は**接客重視の 7 項目**（1 挨拶ができていたか／2 第一印象・身だしなみ（服装・清潔感）／3 笑顔・表情／4 声のトーン・ハキハキさ／5 目を見て話していたか／6 言葉遣い・説明のわかりやすさ／7 志望動機・接客で大切にしたいこと）。各 1〜5 点（1=不採用レベル・2=やや不安・3=普通・4=良い・5=とても良い）。35 点満点。設定画面で編集できる
- 判定への反映: 得点率 70% 以上はそのまま、40% 以上 70% 未満は「上長最終判断要」まで、40% 未満は「不採用推奨」。1 点の項目が 1 つでもあれば「上長最終判断要」まで。**下げる方向だけ**（`down()` と同じ扱いで adjustments に理由）
- 台本の確認点（○△×）は残し、人物像は最後の総評（総合判断）のところに追加
- 紙: **A4 1 枚の記入シートを印刷**できる（アプリと同じ並び）。面接中は紙に書き、終わったらアプリに転記

### 0-3. オーケストレータの決定（P1〜P10。本書はこれを具体化する）
P1 データ `profile.checklist.persona`・回答 `record.checklist.persona` ／ P2 `evaluateScript` の人物像の上限・旧レコードは判定を変えない ／ P3 確認点 `rt_manner` を既定から外す（6 項目）・旧既定と同一の保存済み台本だけ置き換え ／ P4 ② の総評カード・面接中はメモ中心の案内・質問の 1 行表示 ／ P5 A4 報告（ストリップ・確認点｜人物像の 2 カラム・確認点のメモを面接メモの枠へ・1 ページ維持） ／ P6 面接記入シート ／ P7 右サマリー・設定・使い方 ／ P8 テスト ／ P9 docs ／ P10 仕上げ

### 0-4. 本書の決定（D1〜D20。迷ったらここに従う）
| # | 決定 |
| --- | --- |
| D1 | 人物像は**面接評価（○△×＋総合判断の点・帯）には入れない**。`interviewModel` は変えない（確認点 6 項目＝面接評価 14 点満点）。人物像は別の合計（35 点満点）と別の規則 |
| D2 | 「人物像を使わない記録」の印は **`record.checklist.persona === null`**。新しい記録は `{}`（未入力）から始まる。`normalizeRecord` が「回答のキーが無く、その記録の `checklistDef` にも `persona` が無い」記録を `null` にする（1-3）。`null` は保存し直しても残る＝読み込み直しても判定が変わらない。**補完 1（11-9）**: ② の回答がまだ無い記録（① だけ保存した記録・② で評価し直す v1 など。守る保存時の判定が無い）は台本に `persona` が無くても `{}`（これから面接して人物像も入れる） |
| D3 | `normalizeChecklistDef` は **`persona` のキーがあるときだけ**正規化する（無ければ足さない＝旧レコードの台本は人物像なしのまま）。プロファイルは `fillChecklist` の `deepMerge(base.checklist, rc)` で既定の `persona` が入る |
| D4 | 判定の順: 既存の (a) 必須条件の不一致 → (b) 未確認 → (c) 総合判断の上限 → **(e) 人物像（未入力 → 得点率 → 1 点）** → (d) × の警告。必須条件で不採用推奨に固定（`mustGate`）したときは人物像の規則も警告も使わない |
| D5 | 得点率の比較は整数で厳密に（`total*100 < keepPct*max` など）。表示の % は **切り捨て**（`Math.floor(total*100/max)`。20/35 → 57%）。境界: 25/35（71%）そのまま・24/35（68%）上長最終判断要・14/35（40%）上長最終判断要・13/35（37%）不採用推奨 |
| D6 | 理由・警告の項目名は「短い名前（`short`。無ければ `label`）」を「、」でつなぐ（「笑顔・表情」の「・」と区別） |
| D7 | ② の総評カードは `#clOverall` のまま。見出し「総評」、上から 人物像 → 総合判断 → 面接所見。人物像のボタンは `data-action="ps-set" data-persona=<id> data-score=<n>`（もう一度押すと未入力に戻す。他の `cl-set` と同じ） |
| D8 | キーボード: 各行は 1 つのタブ位置（押下中のボタン、無ければ 1）。数字キー 1〜5 で入力して次の行へ、←→ で行内、↑↓ で上下の行に移動（入力はしない）。Enter／Space はボタンの押下（同じ点なら未入力に戻す） |
| D9 | 質問は 1 行（`button.cl-q`）。短い名前を太字＋全文を薄く・はみ出しは「…」。クリック／Enter で全文（`.open`）。ブロック見出しに「全文」⇔「たたむ」。開閉は画面の状態だけ（記録・設定に入れない。描き直すとたたむ） |
| D10 | A4 の結果ストリップは 5 タイル（結果・総合判断・必須条件・確認点・**人物像**）＋最終合否。タイルの並びのクラスは `.cl-tiles.has-ps`（`n5` は使わない。単体 #80・#87 が禁じている）。**最終合否欄の上限を 48% → 36%** にして、長い担当者名でも 5 タイルを「…」で切らない（試作で確認）。**レビュー指摘 5 で追加**: 各タイルは中身の幅（min-content）より狭くせず、足りないときは最終合否欄のほうが縮む（11-8） |
| D11 | A4 の本文は 必須条件｜勤務条件 の下を `div.cl-cols.cl-cols-eval`（確認点｜人物像。50:50）。確認点の表から**メモの列を外し**、確認点のメモは面接メモ・所見の枠の 1 行「確認点のメモ」に。人物像が無い記録（`null`・設定で OFF）は確認点の表だけ（全幅・メモの列なし） |
| D12 | 確認点のメモの行は **`div.cl-nm-row.cl-nm-b.cl-nm-rt`**（`.cl-nm-b`＝ブロックのメモと同じ行数・広げる順に乗る）。`clFitSheet` の関数・セレクタは**変えない**（単体 #93 の疑似 DOM がセレクタ文字列で照合している） |
| D13 | 記入シートは `storage.paperSheetHtml(record, profile, o)`／`paperSheetCss()`／`fitPaperSheet(sheet, limit)`。用紙の箱は報告書と同じ `.a4`、見出しは同じ `.cl-title`（ロゴ・題・版／劇場／日付）。本文は 2 段（台本の 1 枚目 ①② ｜ 2 枚目 ③④⑤）＋全幅の総評。1 ページに収めるのは質問の罫線の本数（3 → 2 → 1）→ 詰め → 縮小 |
| D14 | 記入シートの印刷は報告書の印刷と同じ仕組み（印刷ホスト `#clSheet`・`body.print-checklist`・`@page a4sheet` 余白 0）。`app.preparePaperSheet(on)` / `printPaperSheet()`。保存しない。Ctrl+P は従来どおり報告書 |
| D15 | 記入シートは**白紙の記入用**: 印字するのは ① の応募者（氏名・区分/年齢/性別・面接日・担当・求人・タクシー）だけ。② の回答は印字しない。人物像の行は設定（`def.persona`）で決める（記録の `persona === null` は見ない） |
| D16 | 既定の台本に `short` を足す: 説明（explain）14 項目と確認点（rating）6 項目（表 1-2）。記入シートの説明・確認点のメモの行で使う。設定画面の短い名前の欄を説明・確認点にも出す |
| D17 | `rt_manner` の移行は**プロファイルだけ**（`fillChecklist`）。保存済みの台本の `sections` が「直前の既定（c0d20ce。rt_manner あり）」と同じ（説明・確認点の項目の `short` は比べない）なら新しい既定の `sections` に置き換え、`report.mannerMoved = true` → toast 1 回。記録の `checklistDef` は移行しない。**レビュー指摘 3 で追加**: その前の既定（2026-10-13〜14。short が 1 つも無い）と同じ台本も移行する（11-8） |
| D18 | 旧レコードの読み込み（`persona === null`）: ② は人物像の行を出さず 1 行の注記 `#clPersonaOff`。③ の用紙は 4 タイル・確認点の表だけ。toast に「人物像の導入前に保存された記録のため、人物像は使いません」 |
| D19 | 人物像の項目が保存時と違う記録（両方に人物像あり）は toast「保存時と人物像の項目が異なります（追加 a・削除 r）。現在の項目で再判定します」（`R.personaDiff`。確認点の差の toast と同じ扱い） |
| D20 | 設定の人物像の項目は 1 行「項目名|短い名前|説明」の textarea（`data-type="persona"`）。id は**項目名が同じ既存の項目の id を引き継ぐ**（並べ替え・短い名前の変更では点が消えない）。新しい行は `U.uid('ps')` |

### 0-5. 試作で確かめたこと（scratchpad/p12。Chromium 1194・既定の台本・1440px）
- **記入シート**（`proto-paper.js`。本書 5 章と付録 A の DOM・CSS・fit そのまま）: 白紙・① 入力ありとも `pp-q3`（質問の罫線 3 本）で内容 933px／916px（上限 1052px）。面接所見の罫線 9 本（64〜69mm）。PDF 1 ページ（pdfinfo）。pdftotext に 面接記入シート・人物像・挨拶ができていたか・一致・不一致・総合判断・採用・保留・不採用・○△× がすべて出る。2 段の高さ 495px（左右とも）・総評 475px・人物像 7 行 174px。`pp-q2` 854px・`pp-q1` 797px（詰める余地あり）。画像 `paper-blank.png`・`paper-filled.png`
- **A4 報告**（`proto-a4.js`。現行の保存 HTML を 4 章の DOM・付録 B の CSS に組み替えて `__a4Fit()`）: 記入なし → `.cl-roomy` 853px・確認点｜人物像の 2 カラムは左右とも 222px（ゆったり）／161px（通常）で揃う。重いサンプル（全メモ 300 字・確認点のメモ 300 字×6・面接所見 1,500 字）→ `.cl-compact` 1051px・面接所見 22 行に広がる・PDF 1 ページ・押印行は下端（差 0mm）。面接所見 4,000 字 → `.cl-compact` 1049px・1 ページ。最終合否欄 36%（253px）＋長い担当者名（URL 80 字）でもタイル 5 枚（115/76/76/76/76px）に「…」なし。画像 `a4-normal.png`・`a4-heavy.png`
- 旧レコードの再判定（現行コード）: `legacy-full-checklist.html`・`legacy-report-view.html` は採用推奨・警告 0（新しいコードでも同じであること＝7-2 E17）

---

## 1. データモデル・正規化・検証・移行（config.default.js・rules.js・storage.js・app.js）

### 1-1. `profile.checklist.persona`（既定値。キーの並びもこのとおり＝正規化の出力の並び）
`checklist` の中で `overallCaps` の直後・`header` の前に置く。
```js
persona: {
  enabled: true,
  title: '人物像（接客）',
  scaleMax: 5,                                         // 固定（正規化で常に 5）
  scaleLabels: ['不採用レベル', 'やや不安', '普通', '良い', 'とても良い'],
  items: [                                             // { id, label, short?, hint? }（この並び）
    { id: 'ps_greeting', label: '挨拶ができていたか', short: '挨拶' },
    { id: 'ps_impression', label: '第一印象・身だしなみ', short: '身だしなみ', hint: '服装・清潔感' },
    { id: 'ps_smile', label: '笑顔・表情', short: '笑顔・表情' },
    { id: 'ps_voice', label: '声のトーン・ハキハキさ', short: '声のトーン' },
    { id: 'ps_eye', label: '目を見て話していたか', short: '目線' },
    { id: 'ps_speech', label: '言葉遣い・説明のわかりやすさ', short: '言葉遣い' },
    { id: 'ps_motivation', label: '志望動機・接客で大切にしたいこと', short: '志望動機' }
  ],
  keepPct: 70,              // 得点率がこれ以上なら下げない
  rejectBelowPct: 40,       // これ未満なら不採用推奨（その間は上長最終判断要まで）
  onePointResult: 'review', // 1 点の項目があるとき: none / review / reject
  unscoredResult: 'review'  // 未入力の項目があるとき: none / review / reject
}
```
config の先頭コメント（判定に効くもの・short の説明）に人物像と D16 の short を書き足す。

### 1-2. 既定の台本の変更（P3・D16）
- `conditions_rate` から `rt_manner`（最低限の話し方、敬語が可能か）を削除（コメントは「人物像の言葉遣いと重なるため 2026-10-16 に既定から外した。docs/SPEC-persona.md」）。確認点は 6 項目（① 1・② 2・③ 1・④ 1・⑤ 1）＝面接評価 14 点満点（確認点 12＋総合判断 2）。帯の境界の点は 高 10 点以上・中 6 点以上
- `short` を足す（**キーは `id, label, short, …` の順に挿入し、既存のキーの並びは変えない**＝移行の比較 D17 のため）:

| id | short | id | short |
| --- | --- | --- | --- |
| ex_fare | 交通費 | ex_start | コンセ／フロア |
| ex_hours | 営業時間・タクシー | ex_busy | 多忙・立ち仕事・清掃 |
| ex_contract | 初回契約2か月 | ex_opinion | ご意見対応 |
| ex_switch | 長期への切替 | ex_rules | ルール・接客指導 |
| ex_submit | シフト提出 | ex_team | チーム分業 |
| ex_phone | 連絡は電話 | ex_sudden | 急な指示 |
| ex_absence | 欠勤・遅刻の連絡 | ex_radio | 無線で確認 |
| rt_concrete | 具体性 | rt_understand | 業務理解 |
| rt_hourensou | 報連相 | rt_team | チーム行動 |
| rt_turnover | 離職要因 | rt_mismatch | ミスマッチ |

- 台本の文言（label・質問文・ページの前書き）は変えない。版 `version` は `'2026-10-08'` のまま

### 1-3. 回答 `record.checklist.persona`
- 形: `{ [itemId]: 1|2|3|4|5 }`（未入力はキーなし）または **`null`（人物像を使わない記録。D2）**
- `rules.emptyChecklist()` → `{ v: 1, header: {...}, values: {}, notes: {}, overall: '', persona: {} }`
- `rules.personaScore(cl, id)`: 値が整数 1〜5 の数値、または `/^[1-5]$/` の文字列なら数値、それ以外 `null`（`true`・`0`・`''` は未入力）
- `rules.checklistHasInput(cl)`: 既存の条件に「`cl.persona` が object で有効な点が 1 つ以上」を足す
- `storage.normalizeRecord(rec)`: `checklist` を作ったあと（`deepMerge(emptyChecklist(), …)` は無い persona に `{}` を入れてしまうので**元の値で上書き**する）
  ```js
  const rp = U.isObj(rec.checklist) ? rec.checklist.persona : undefined;
  const defHas = U.isObj(rec.checklistDef) && U.isObj(rec.checklistDef.persona);
  checklist.persona = rp === null ? null : U.isObj(rp) ? U.deepClone(rp) : (rp === undefined && (defHas || !R.checklistHasInput(checklist)) ? {} : null);   // 補完 1（11-9）で !checklistHasInput を足した
  ```
  ＝明示の `null` は `null`／object はそのまま／キーが無ければ、記録の台本に人物像があるとき、**または ② の回答がまだ無いとき（補完 1）**は `{}`、ほかは `null`（② の回答がある v1・詳細モード・2026-10-16 より前の記録・壊れた値）。戻り値のキーは増やさない（`legacy` も変えない。単体 #85 の `deepStrictEqual(now.legacy, …)` を壊さない）
- `storage.buildRecord`: 変更なし（`state.checklist` の `persona`〔`null` を含む〕と `state.profile.checklist`〔`persona` を含む〕をそのまま書く）
- `app.ensureChecklist()`: `if (cl.persona !== null && !U.isObj(cl.persona)) cl.persona = {};` を足す（`null` を `{}` に戻さない）

### 1-4. `normalizeChecklistDef(def, baseDef)` の persona（D3）
`'persona' in out` のときだけ `out.persona = normalizePersonaDef(out.persona, base.persona || 既定)`（storage.js の内部関数）。冪等・未知のキーは残す（既知のキーは下の順で組み立て、未知のキーはその後ろ）。

| キー | 規則 |
| --- | --- |
| (全体) | object でなければ既定の persona の複製 |
| enabled | `src.enabled !== false` |
| title | 文字列ならそのまま（空も残す＝検証でエラー）、それ以外は既定 |
| scaleMax | 常に 5 |
| scaleLabels | 長さ 5 の配列で各要素が文字列ならそれ（trim）、足りない・文字列以外の要素は既定の同じ位置 |
| items | 配列でなければ既定の複製。配列なら object だけ残し、各項目を `{ id, label, short?, hint? }` に: `id` は `CL_ID_RE` に合い persona の中で重複しなければそれ、ほかは `'ps_' + (i+1)`（使用済みなら `_2`…）／`label` は `asStr`（空も残す＝検証）／`short`・`hint` は空でない文字列なら trim して残す、ほかは外す。空の配列は空のまま（検証でエラー） |
| keepPct・rejectBelowPct | 数値として読める（`isNum`）なら `Number`、ほかは既定（範囲は検証）。**範囲外（0 ≦ 不採用推奨 ＜ そのまま ≦ 100 でない）なら 2 つとも既定**（JSON の読み込みは検証を通らないため。レビュー指摘 2。11-8） |
| onePointResult・unscoredResult | `none`／`review`／`reject` のどれかでなければ既定 |

- `fillChecklist(raw, base, report)`（`normalizeProfile` から report を渡す）: 既存どおり `deepMerge(base.checklist, rc)` → `normalizeChecklistDef`（旧い設定にも既定の persona が入る）→ 1-6 の移行
- 既定のプロファイル・既定の台本は正規化しても**バイト単位で同じ**（キーの並びを 1-1 と同じにする。`normalizeProfile(P())` の `report` が `{}` のまま＝単体 #82）

### 1-5. `validateProfile`（`validateChecklist` に追加。`persona` が object で `enabled !== false` のときだけ）
接頭辞は既存の `P0 = '面接チェックリスト'`。文言（確定）:
- 項目 0 件: `面接チェックリストの人物像の項目がありません（1 つ以上入力するか、「人物像を使う」を外してください）。`
- 項目名が空: `面接チェックリストの人物像の{k}行目の項目名が空です。`
- id の形式・重複（JSON の読み込みのときだけ起きる）: `面接チェックリストの人物像の{k}行目の id「{id}」が正しくありません（英字で始まる英数字・_・-）。`／`…が重複しています。`
- 見出しが空: `面接チェックリストの人物像の見出しが空です。`
- 境界: `!(isNum(r) && isNum(k) && 0 <= r && r < k && k <= 100)` → `面接チェックリストの人物像の得点率の境界（0 ≦ 不採用推奨 ＜ そのまま ≦ 100%）が正しくありません。`
- 結果: `面接チェックリストの人物像の「1 点の項目があるとき」の設定が正しくありません。`／`…「未入力の項目があるとき」の設定が正しくありません。`
- 警告は足さない（単体 #65 の warnings の配列を変えない）

### 1-6. rt_manner の移行（P3・D17）
```js
const MANNER_ITEM = { id: 'rt_manner', label: '最低限の話し方、敬語が可能か', hint: '面接全体を通して（台本1枚目の冒頭）' };
// 説明・確認点の項目の short を外した sections の JSON（c0d20ce の既定には説明・確認点の short が無かった）
function scriptSig(sections) { /* deepClone → explain・rating ブロックの各項目から short を delete → JSON.stringify */ }
// 直前の既定（c0d20ce）の sections = 新しい既定の sections に rt_manner を conditions_rate の 2 番目へ戻したもの
function isPrevDefaultScript(sections, base) {
  const prev = U.deepClone(base.sections);
  const rb = (prev[0] && prev[0].blocks || []).find(function (b) { return b.id === 'conditions_rate'; });
  if (!rb) return false;
  rb.items.splice(1, 0, U.deepClone(MANNER_ITEM));
  const prevN = normalizeChecklistDef(Object.assign({}, base, { sections: prev }), base).sections;   // 遅延で 1 回だけ作ってよい
  return scriptSig(sections) === scriptSig(prevN);
}
// fillChecklist の最後:
if (isPrevDefaultScript(out.sections, base.checklist)) { out.sections = U.deepClone(base.checklist.sections); if (report) report.mannerMoved = true; }
```
- 比べるのは `sections` だけ（`mustFailResult`・総合判断・ヘッダー・版・ページ・persona の変更は残す）。質問・合否連絡・記入欄の `short` は比べる（c0d20ce の既定にあった）＝それを変えた台本は「編集した台本」として rt_manner を残す
- （レビュー指摘 3 で追加）2026-10-13〜14（6f32341〜95737b5）の既定には質問・合否連絡・記入欄の `short` も無い（df3b339 で既定に足した）。その版で保存した設定は `deepMerge` が配列を保存値で置き換えるので今も short が無い。そこで、**short を 1 つも持たない台本**は short を全部外した直前の既定と比べる（`scriptSig(sections, true)`）。short を 1 つでも持つ台本は上の比較だけ（質問の short を変えた台本は今までどおり残す）
- `tests/fixtures/legacy-profile-full.json` の台本は直前の既定と同じ（確認済み）→ 移行される（7-2 E1 で確かめる）
- `app.profileNotice(rep)`: `rep.mannerMoved` なら `確認点「最低限の話し方、敬語が可能か」は人物像の「言葉遣い・説明のわかりやすさ」と重なるため、既定の台本から外しました。` を足す（`init`・JSON の読み込みの toast。`stripped` も立つので init は保存し直す＝次からは出ない）
- 記録の台本（`checklistDef`）・`normalizeChecklistDef` 単体では移行しない（保存時の台本で表示）

### 1-7. 読み込み（`app.applyRecord`）の toast（D18・D19）
- `state.checklist.persona === null && hasCl && 現在の設定で人物像が有効` → `人物像（1〜5 点）の導入前に保存された記録のため、人物像は使いません`
- `R.personaDiff(n.checklistDef, p.checklist)`（両方に有効な persona があるときだけ id を比べ `{ added, removed }`。どちらかに無ければ空）に差があり `state.checklist.persona !== null && hasCl` → `保存時と人物像の項目が異なります（追加 {a}・削除 {r}）。現在の項目で再判定します`

---

## 2. 判定（rules.js）

### 2-1. 追加する定数・関数（`global.RecruitRules` に公開）
- `PERSONA_SCALE = 5`、`PERSONA_RESULTS = ['none', 'review', 'reject']`
- `personaScore(cl, id)`（1-3）
- `personaModel(def, cl)` → `null` または:
  ```
  { title, scaleMax: 5, scaleLabels: [5], keepPct, rejectBelowPct, onePointResult, unscoredResult,
    items: [{ id, label, short, hint, name /* short || label */, score /* 1..5 | null */ }],
    total /* 入力済みの合計 */, max /* 項目数×5 */, pct /* Math.floor(total*100/max) */, scored, unscored, complete /* unscored === 0 */,
    ones: [name…] /* 1 点の項目 */, unscoredNames: [name…],
    band /* complete のときだけ: total*100 < rejectBelowPct*max → 'reject'・< keepPct*max → 'review'・ほか 'keep'。未完了は null */ }
  ```
  `null` になる条件: `def.persona` が object でない／`enabled === false`／有効な項目が 0／**`cl.persona === null`**。`cl.persona` が `undefined` なら `{}`（全部未入力）として扱う（def が決める）。数値の設定は `num(x, 既定)`、結果の設定は `oneOf(x, PERSONA_RESULTS, 'review')` で読む（検証していない JSON でも落ちない）
- `personaDiff(defA, defB)`（1-7）
- `checklistSummary(...)` の戻り値に `persona: personaModel(def, cl)` を足す

### 2-2. `evaluateScript` の (e) 人物像（D4。既存の (c) の後・(d) の前。`lowered`・本文の決定より前）
```js
const ps = personaModel(def, cl);
const capTail = function (cap) { return cap === 'reject' ? '不採用推奨とします。' : '採用推奨ではなく上長最終判断要として扱います。'; };
if (ps && !mustGate) {
  // e1 未入力: 警告は常に 1 行。unscoredResult まで下げる（下がったときだけ adjustments。理由は警告に重ねない）
  if (ps.unscored) {
    warnings.push('人物像に未入力が ' + ps.unscored + ' 項目あります（' + ps.unscoredNames.join('、') + '）。');
    if (ps.unscoredResult !== 'none' && RESULT_RANK[ps.unscoredResult] < RESULT_RANK[result]) {
      adjustments.push({ code: 'persona_unscored', from: result, to: ps.unscoredResult, reason: '人物像に未入力が ' + ps.unscored + ' 項目あるため、' + capTail(ps.unscoredResult) });
      result = ps.unscoredResult;
    }
  }
  // e2 得点率（全部入っているときだけ）
  if (ps.complete && ps.band !== 'keep') down(ps.band, 'persona_total', '人物像の合計 ' + ps.total + '/' + ps.max + '（' + ps.pct + '%）のため、' + capTail(ps.band));
  // e3 1 点の項目（未入力があっても）
  if (ps.ones.length && ps.onePointResult !== 'none') down(ps.onePointResult, 'persona_one', '人物像に 1 点の項目（' + ps.ones.join('、') + '）があるため、' + capTail(ps.onePointResult));
}
```
- `down()` は既存のまま（下がったときだけ adjustments に記録し、理由を warnings に足す）。e2・e3 は下がらなければ何も出さない（総評・A4 の人物像の列と結果ストリップで見える）
- `mustGate`（必須条件の不一致で不採用推奨に固定）では人物像の規則・警告を使わない（打ち切った面接は入力不要。既存の確認点・総合判断の未入力の警告と同じ扱い）。`mustFailResult = 'review'` の不一致は人物像も効く（不採用推奨まで下がりうる）
- 例の文言（確定）: `人物像に 1 点の項目（笑顔・表情）があるため、採用推奨ではなく上長最終判断要として扱います。`／`人物像の合計 20/35（57%）のため、採用推奨ではなく上長最終判断要として扱います。`／`人物像の合計 12/35（34%）のため、不採用推奨とします。`／警告 `人物像に未入力が 7 項目あります（挨拶、身だしなみ、笑顔・表情、声のトーン、目線、言葉遣い、志望動機）。`
- 本文: 既存の `adjusted` テンプレート（下がったとき）がそのまま使える。A4 の `.cl-adj` は既存の規則（`採用推奨 → 上長最終判断要：理由`）

### 2-3. 戻り値
`persona: ps ? { title, total, max, pct, scored, unscored, ones, items: ps.items.map(({ id, label, score })) } : null` を足す（`ones` は短い名前）。ほかのキーは変えない。

### 2-4. 規則の例（既定・総合判断「採用」・必須条件すべて一致）
| 人物像 | 合計 | % | 結果 | adjustments |
| --- | --- | --- | --- | --- |
| 全部 4 | 28 | 80 | 採用推奨 | なし |
| 4,4,4,4,3,3,3 | 25 | 71 | 採用推奨 | なし |
| 全部 3 | 21 | 60 | 上長最終判断要 | persona_total |
| 4,4,4,4,4,4,1 | 25 | 71 | 上長最終判断要 | persona_one |
| 全部 2 | 14 | 40 | 上長最終判断要 | persona_total |
| 1,1,2,2,2,2,2 | 12 | 34 | 不採用推奨 | persona_total（e3 は下がらないので記録なし） |
| 3 項目だけ入力 | — | — | 上長最終判断要 | persona_unscored ＋警告 |
| 総合判断「保留」＋全部 1 | 7 | 20 | 不採用推奨 | persona_total（review → reject） |
| 必須条件の不一致＋全部 1 | — | — | 不採用推奨 | must_conditions だけ（人物像の警告なし） |
| 設定で OFF／記録が `null`／台本に persona なし | — | — | 総合判断のとおり | 人物像なし・`persona: null` |

---

## 3. ② 面接チェックリストの画面（app.js・styles.css）

### 3-1. 上部の案内（フィードバック①）と記入シートのボタン
`interviewStepHtml`: `scriptClHeaderHtml()` の直後・`clNavHtml(sum)` の前に
```html
<div class="cl-guide" id="clGuide" role="note"><span class="ico" aria-hidden="true">💡</span>
  <span class="cl-guide-t">面接中はメモを中心に。○△×・人物像・総合判断は面接後にまとめて入力できます</span>
  <button type="button" class="btn sm" id="clPaperBtn" data-action="print-paper" title="紙に書くときの A4 1 枚（この画面と同じ並び）を印刷">🖨 記入シート（手書き用）</button></div>
```
① の操作行: `<div class="actions between" id="saActions"><button type="button" class="btn" id="saPaperBtn" data-action="print-paper" title="…同じ">🖨 記入シート（手書き用）</button><button … id="saNext" …>面接チェックリストへ進む →</button></div>`（`.actions.end` → `.actions.between`。カードの中は変えない＝E1 の「1 枚・3 行」・1280×800 で「進む」が見える を保つ）。`onContentClick` の `case 'print-paper': printPaperSheet();`（① では氏名が空でも印刷できる。必須チェックをしない）

### 3-2. 総評カード `#clOverall`（DOM 確定値）
`clOverallHtml(sum)` を次の順に（`sum.persona` は `checklistSummary` の `persona`）:
```html
<div class="card" id="clOverall"><div class="card-head"><h2>総評</h2></div>
  <!-- 人物像（sum.persona があるとき） -->
  <section class="cl-persona" id="clPersona" aria-labelledby="clPersonaH">
    <div class="cl-ps-head"><h3 id="clPersonaH">人物像（接客）</h3>
      <span class="cl-ps-legend" id="clPsLegend">1 不採用レベル　2 やや不安　3 普通　4 良い　5 とても良い</span></div>
    <div class="cl-ps-rows">
      <div class="cl-ps-row" data-ps-row="ps_greeting">        <!-- 入力済み .is-set・1 点 .is-one -->
        <div class="cl-ps-main"><span class="cl-ps-no">1</span><span class="cl-label b">挨拶ができていたか</span><!-- hint があれば <span class="hint">服装・清潔感</span> --></div>
        <div class="score-seg cl-seg cl-ps-seg" role="group" aria-label="挨拶ができていたか">
          <button type="button" class="seg-btn cl-ps-btn s1" data-action="ps-set" data-persona="ps_greeting" data-score="1" aria-pressed="false" tabindex="0" title="1 不採用レベル">1</button>
          <!-- data-score 2〜5（title「2 やや不安」…）。押下中は .active・aria-pressed="true"。tabindex は 3-3 -->
        </div></div>
      <!-- 7 行 -->
    </div>
    <div class="cl-ps-total" id="clPsTotal" aria-live="polite">合計 <b class="num" id="clPsSum">—</b> / <span class="num" id="clPsMax">35</span>点<span class="num" id="clPsPct"></span><span class="badge" id="clPsState"></span></div>
    <div class="alert warn hidden" id="clPsWarn"><span class="ico">⚠</span><span id="clPsWarnText"></span></div>
  </section>
  <!-- 人物像を使わない記録（cl.persona === null かつ設定で有効）: 代わりに 1 行 -->
  <p class="hint cl-ps-off" id="clPersonaOff">この記録は人物像（1〜5 点）の導入前に保存されたため、人物像は判定に使いません。</p>
  <!-- ここから既存のまま: .cl-overall-row（総合判断）・hint・#clScore・#clMustSummary・#overallWarn・面接所見 -->
```
- 凡例は `scaleLabels` から（`n + ' ' + label` を全角空白で）。見出しは `title`。設定で OFF なら `#clPersona`・`#clPersonaOff` とも出さない
- 総合判断の hint の末尾（人物像が有効なとき）に `人物像の合計・1 点の項目で結果が下がることがあります。` を足す（**補完 4（11-9）で設定から組み立てる文に変えた**: `personaRuleText()`＝使い方の「結果（推奨）の決まり方」の 1 行と同じ。既定「人物像（1〜5 点）の合計が低い・1 点の項目がある・未入力があると、結果を上長最終判断要（合計が 40% 未満なら不採用推奨）まで下げます。」）
- 目次の最後のチップの文字を「総合判断」→「総評」（`data-sec="__overall"` は同じ）
- `#clNavScore` の末尾に（人物像があるとき）`　人物像 {scored ? total : '—'}/{max}`

### 3-3. キーボード（D8。`onContentKey` の先頭で `t.dataset.persona` なら `onPersonaKey(e, t)`）
| キー | 動き |
| --- | --- |
| Tab／Shift+Tab | 行ごとに 1 つのタブ位置（押下中のボタン、無ければ 1 のボタンが `tabindex="0"`、ほかは `-1`。`updateChecklistUI` が付け直す） |
| 1〜5（テンキーも。Ctrl・Alt・Meta 付きは無視） | その行をその点にする（同じ点でも外さない）→ 次の行のタブ位置のボタンにフォーカス（最後の行はそのまま） |
| ←／→ | 行の中で前後のボタンへフォーカス（入力しない・端で止まる） |
| ↑／↓ | 上下の行の同じ点のボタンへフォーカス（入力しない） |
| Enter／Space | ボタンの押下（`ps-set`。同じ点なら未入力に戻す） |
矢印・数字は `preventDefault`（ページをスクロールしない）。最終承認のパスワード欄の Enter（既存）は変えない。

### 3-4. 入力と表示の更新
- `onContentClick` の `case 'ps-set'`: `psSet(id, psGet(id) === n ? 0 : n)`。`psSet` は `cl.persona` が object のときだけ、1〜5 は数値で入れ、0 は `delete` → `touchChecklist()`（dirty・判定の無効化）→ `updateChecklistUI()`。全体は描き直さない（フォーカスを保つ）
- `updateChecklistUI`（`sum.persona` があるとき）: 各行の `.is-set`・`.is-one`、ボタンの `.active`・`aria-pressed`・`tabindex`／`#clPsSum`＝`scored ? total : '—'`、`#clPsMax`＝max、`#clPsPct`＝`complete ? '（' + pct + '%）' : ''`／`#clPsState`: 未入力あり → `badge muted`「未入力 {n}」、`band` keep → `badge ok`「{keepPct}% 以上」、review → `badge warn`「{resultTitle('review')}まで」、reject → `badge danger`「{resultTitle('reject')}」（**補完 4（11-9）で、人物像で下がる結果の上限〔未入力・合計・1 点のいちばん低いもの。「調整しない」は数えない〕を出すように変えた**: 上限 review → `warn`「{review}まで」・reject → `danger`「{reject}」、未入力があれば前に「未入力 {n}・」、下がらなければ `ok`「{keepPct}% 以上」／未入力だけなら `muted`「未入力 {n}」）／`#clPsWarn`: `ones` があるとき表示、文言 `1 点の項目があります（{names}）。` ＋（onePointResult が review なら `結果は{上長最終判断要}以下になります。`、reject なら `結果は{不採用推奨}になります。`、none なら付けない）
- ③ の `#scriptWarnings` の「面接チェックリストで入力する」ボタンは、総合判断が未入力**または人物像に未入力がある**ときに出す

### 3-5. 質問の 1 行表示（P4・D9。`clBlockHtml` の `case 'question'`）
```html
<div class="cl-block-title">…【質問】…<button type="button" class="btn sm ghost cl-q-all" data-action="q-all" data-block="continuity_q" aria-pressed="false">全文</button></div>
<ol class="cl-questions cl-q-list">
  <li data-item="q_prev_job"><button type="button" class="cl-q" data-action="q-toggle" aria-expanded="false" title="クリックで全文を表示">
    <span class="cl-q-no">1</span><b class="cl-q-short">前のバイトの期間・退職理由</b><span class="cl-q-full">「前のアルバイトの期間と退職理由は？差し支えなければ退職理由は？」</span></button></li>
</ol>
<!-- メモ欄（.cl-memo textarea）は従来どおり -->
```
- 短い名前は `S.checklistShortLabel(it)`（short → 既定の short → 先頭 14 文字＋「…」）。質問が 0 件のブロックはボタンも出さない
- `q-toggle`: そのボタンの `.open`・`aria-expanded`・`title`（「クリックでたたむ」）を切り替え、ブロックの `q-all` を同期。`q-all`: ブロックの全部が開いていれば全部たたむ、ほかは全部開く。同期: 全部開いていれば文字「たたむ」・`aria-pressed="true"`、ほかは「全文」・`false`

### 3-6. CSS（styles.css。ダークテーマは既存の変数で追従）
```css
.cl-guide { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; padding: 8px 12px; border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--radius-sm); background: var(--accent-soft); font-size: 13.5px; font-weight: 600; }
.cl-guide-t { flex: 1 1 0; min-width: 16em; }   /* レビュー指摘 8 で追加（11-8） */
.cl-guide .btn { margin-left: auto; }
.cl-persona { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px dashed var(--border); }
.cl-ps-head { display: flex; align-items: baseline; gap: 4px 12px; flex-wrap: wrap; margin-bottom: 8px; }
.cl-ps-head h3 { font-size: 14.5px; font-weight: 700; }
.cl-ps-legend { font-size: 12px; font-weight: 600; color: var(--muted); }
.cl-ps-legend > span { white-space: nowrap; }   /* レビュー指摘 9 で追加（凡例は「点 意味」ごとの span。11-8） */
.cl-ps-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 14px; align-items: center; padding: 6px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); margin-bottom: 6px; }
.cl-ps-row.is-one { border-color: color-mix(in srgb, var(--danger) 55%, var(--border)); background: var(--danger-soft); }
.cl-ps-main { min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.cl-ps-no { color: var(--muted); font-weight: 800; }
.seg-btn.cl-ps-btn { width: 44px; height: 38px; font-size: 16px; font-weight: 800; }
.seg-btn.cl-ps-btn.active.s1 { background: var(--danger); color: var(--on-status); }   /* 文字色はレビュー指摘 10 で #fff → --on-status（ライト #fff・ダーク #0b1220。11-8） */
.seg-btn.cl-ps-btn.active.s2 { background: var(--warn); color: var(--on-status); }
.seg-btn.cl-ps-btn.active.s4, .seg-btn.cl-ps-btn.active.s5 { background: var(--ok); color: var(--on-status); }
.cl-ps-btn:focus-visible, .cl-q:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.cl-ps-total { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 8px; font-size: 14px; font-weight: 600; }
.cl-ps-total #clPsSum { font-size: 22px; }
#clPsWarn { margin-top: 6px; }
.cl-ps-off { margin: 0 0 10px; }
.cl-q-list { list-style: none; padding-left: 0; gap: 4px; }
.cl-q { display: flex; align-items: baseline; gap: 10px; width: 100%; min-width: 0; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font: inherit; font-size: 14px; line-height: 1.5; text-align: left; cursor: pointer; }
.cl-q:hover { background: var(--surface-3); }
.cl-q-no { flex: none; color: var(--muted); font-weight: 700; font-size: 12.5px; }
.cl-q-short { flex: none; font-weight: 700; white-space: nowrap; }
.cl-q-full { flex: 1 1 auto; min-width: 0; color: var(--muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-q.open { align-items: flex-start; }
.cl-q.open .cl-q-full { white-space: normal; overflow: visible; color: var(--text); font-size: 15px; line-height: 1.7; overflow-wrap: anywhere; }
.cl-q-all { margin-left: auto; }
@media (max-width: 840px) { .cl-ps-row { grid-template-columns: minmax(0, 1fr); } .cl-q { flex-wrap: wrap; } .cl-q-short { white-space: normal; } }
@media (max-width: 480px) { .seg-btn.cl-ps-btn { width: 40px; } }
```
（`.cl-questions li` の既存の規則〔15px・1.7〕は `.cl-q-list` では効かせない: `.cl-q-list li { font-size: inherit; line-height: inherit; }`）

---

## 4. A4 報告（storage.js `clOnePageHtml`・`checklistSheetCss`・`a4PageScript`。アプリ ③・アプリの印刷・保存 HTML で共通）

`clOnePageHtml` の中で `const ps = sum.persona;`（`null` なら人物像の部品は一切出さない＝旧レコード・OFF は従来の 4 タイル）。

### 4-1. 結果ストリップ（D10）
- `ps` があるとき `.cl-tiles` に `has-ps` を足し、確認点タイルの後ろに:
```html
<div class="cl-tile cl-tile-ps[ is-ng]"><span class="cl-tile-k">人物像</span><span class="cl-tile-v">28<small>/35点</small></span><span class="cl-tile-s">80%</span></div>
```
  - タイルの名前 = `title` の末尾の「（…）」を外したもの（既定「人物像」。空なら「人物像」）
  - 全部入力: v `{total}<small>/{max}点</small>`・s `{pct}%`（1 点ありなら `・1点あり`）／一部: v 同じ・s `未入力 {n}`（1 点ありなら `・1点あり`）／入力なし: v `未入力`・s なし
  - `ones` があれば `is-ng`（既存の `.cl-tile.is-ng .cl-tile-v` で値が赤）
- CSS: `.cl-mode-sheet .cl-tiles.has-ps{grid-template-columns:minmax(0,1.5fr) repeat(4,minmax(0,1fr))}`（レビュー指摘 5 で `minmax(min-content,…)` に。11-8）を**足す**（既存の `.cl-tiles` の規則は 4 タイル用に残す）。`.cl-decision` の `max-width:48%` を **`max-width:36%`** に（規則の文字列ごと置き換え。コメントも「5 枚のタイルを潰さない」に）

### 4-2. 確認点｜人物像の 2 カラム（D11）
確認点の表（`rateHtml`）から `<col class="c-nt">` とメモのセル `td.cl-rt-nt` を外す（`colgroup` は `c-no`・`c-lbl`・`c-mk`）。`ps` があれば:
```html
<div class="cl-cols cl-cols-eval">
  <section class="cl-blk cl-blk-rate">（既存の見出し＋表。メモの列なし）</section>
  <section class="cl-blk cl-blk-persona"><h3 class="cl-h">人物像（接客）<small>1 不採用レベル　3 普通　5 とても良い</small><span class="cl-ps-sum">28/35点・80%</span></h3>
    <table class="cl-ps"><colgroup><col class="c-no"><col class="c-lbl"><col class="c-sc"><col class="c-v"></colgroup><tbody>
      <tr data-ps-item="ps_greeting" class="s-4"><td class="cl-ps-no">1</td><td class="cl-ps-lbl">挨拶ができていたか</td>
        <td class="cl-ps-sc"><span class="cl-ps-bar" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i></i></span></td><td class="cl-ps-v">4</td></tr>
      <!-- 未入力の行: class="s-0"・目盛りは全部空・値 <span class="cl-blank">—</span> -->
    </tbody></table></section>
</div>
```
- 見出しの小さい文字は `1 {labels[0]}　3 {labels[2]}　5 {labels[4]}`。`.cl-ps-sum` は全部入力 `{total}/{max}点・{pct}%`、一部 `{total}/{max}点・未入力 {n}`、入力なし `未入力`
- 項目名は `label`（1 行。はみ出しは「…」）。補足（hint）は載せない
- 確認点が 0 件の台本は人物像の節だけ（全幅）、`ps` が無ければ確認点の節だけ（全幅。メモの列なし）。どちらも `.cl-cols-eval` で包まない
- 並び（子要素）: `cl-sheet-head` → `cl-judge` → `cl-cols` → **`cl-cols.cl-cols-eval`** → `cl-blk.cl-blk-notes` → `cl-exline` → `cl-stamps`

### 4-3. 確認点のメモを面接メモ・所見の枠へ（D12）
`memoRows` の質問の回答・ブロックのメモの行の**後ろ**、面接所見の前に（確認点のメモが 1 つ以上あるとき）:
```html
<div class="cl-nm-row cl-nm-b cl-nm-rt"><div class="cl-nm-k">確認点のメモ</div><div class="cl-nm-v">
  <span class="cl-nm-rt-i" data-cl-item="rt_concrete"><b>①具体性</b>：土日両日可と具体的に回答</span><span class="cl-nm-rt-sep">／</span><span class="cl-nm-rt-i" data-cl-item="rt_team"><b>④チーム行動</b>：…</span></div></div>
```
（`<b>` は `noMark + clShortOf(項目)`。行数は `.cl-nm-b` と同じ＝通常・`.cl-compact` 2 行、`.cl-compact-q1`・`.cl-compact-2` 1 行。切れたら `.cl-cut`、`clFitSheet` の `grow` の 3 番目〔質問の回答・ブロックのメモ〕で広がる）

### 4-4. CSS（`checklistSheetCss` に足す。付録 B に全文）
- 単体 #80・#87・#89 が `indexOf` で照合している既存の規則の文字列は**変えない**（`.cl-compact-q1 .cl-nm-q …,.cl-compact-q1 .cl-nm-b …{-webkit-line-clamp:1}` など）。変えるのは `.cl-rt col.c-lbl{width:40%}` → `width:auto` と `.cl-decision` の `max-width` だけ
- `checklistSheetCss` に `@media`・`print-checklist`・`</script` を入れない（単体 #80 (8)）
- 印刷の色: `.cl-sheet .cl-ps-bar i{-webkit-print-color-adjust:exact;print-color-adjust:exact}` を別の規則で足す（既存の長い一覧は触らない）

### 4-5. 1 ページ保証への影響
- `clFitSheet`（段階・`grow`・セレクタ）は変えない。確認点のメモが表の 1 行（`nowrap`）から枠の 2 行に移り、確認点 7 行 → 6 行・人物像 7 行が横に並ぶので、高さはほぼ同じ（0-5 の実測）
- 最終合否欄 36% で 5 タイルに「…」が出ないこと（E8 の長い担当者名の確認）・重いサンプル・面接所見 4,000 字・押印欄 4 件・縮小の段階でも 1 ページ・押印行は下端（E8・E16 の既存の確認がそのまま通ること）

### 4-6. 保存 HTML の窓（`a4PageScript` の `memoOf`。ES5・関数内にコメントを書かない）
`row` の分岐に `.cl-nm-rt` を足す: `else if (row.classList.contains("cl-nm-rt")) { v = []; each(row.querySelectorAll(".cl-nm-rt-i"), function (s) { v.push(s.textContent); }); v = v.join("\n"); }`（窓の見出しは「確認点のメモ」、本文は 1 項目 1 行の全文。`.cl-nm-rt` は `data-cl-block` を持たないので既存の分岐の後ろでよい）。`markTargets` は変えない（`.cl-nm-v` の `.cl-cut` で押せる）。レビュー指摘 13 で、確認点の表のメモの列（`.cl-rt-nt`）用に残っていた `memoOf` の `tr` の分岐・`markTargets` のセレクタ・`checklistSheetCss` の規則を削除（今のコードはその列を出さない。旧い保存 HTML は保存時の CSS・スクリプトを自分で持つ。`clFitSheet` のセレクタは D12 のとおり残す）

---

## 5. 面接記入シート（手書き用。P6・D13〜D15）

### 5-1. API（storage.js。`global.RecruitStorage` に公開）
- `paperSheetHtml(record, profile, o)` → `<div class="pp-sheet">…</div>`（DOM 非依存の文字列）。`def = normalizeChecklistDef(record.checklistDef || profile.checklist, defaults().checklist)`。`o.now`（日付。既定 `new Date()`）
- `paperSheetCss()` → 付録 A（`@media`・`</script` なし）。アプリは `injectChecklistSheetCss()` で `<style id="paperSheetCss">` も 1 回入れる
- `fitPaperSheet(sheet, limit)` → 付けた段階 `'pp-q3'`／`'pp-q2'`／`'pp-q1'`／`'pp-q1 pp-compact'`／`'pp-q0 pp-compact'`／`'zoom'`（上限の既定 `CL_SHEET_LIMIT_PX`）
- 見出しは報告書と共通の内部関数 `clTitleHtml(meta, def, label, rightDate)` に切り出す（報告書の出力は**1 文字も変えない**: 単体 #80・#89 が見出しの HTML を照合）。記入シートは label「面接記入シート」、右「台本 {version} 版 ／ {劇場名} ／ 印刷 {YYYY/MM/DD}」

### 5-2. DOM（確定値。試作 `proto-paper.js` の `paperHtml` がこのとおり）
```html
<div class="pp-sheet">
  <div class="cl-title">[ロゴ]<span class="cl-title-t">面接記入シート</span><span class="cl-title-r">台本 2026-10-08 版 ／ TOHOシネマズ新宿 ／ 印刷 2026/10/10</span></div>
  <dl class="pp-who">
    <div class="pp-f pp-f-name"><dt>氏名</dt><dd>記入 太郎<small>さん</small><span class="pp-who-s">大学3年生・21歳・男性</span></dd></div>  <!-- 空: <dd><span class="pp-line"></span><small>さん</small></dd> -->
    <div class="pp-f"><dt>面接日</dt><dd>2026/10/10</dd></div>              <!-- 空なら <span class="pp-line"></span> -->
    <div class="pp-f"><dt>担当</dt><dd>笹川 晴央</dd></div>                  <!-- header.interviewer → 担当と連動する押印欄の氏名 → 線 -->
    <div class="pp-f"><dt>応募した求人</dt><dd>短期求人</dd></div>          <!-- 空なら <span class="pp-box"></span>通常求人<span class="pp-box"></span>短期求人 -->
    <div class="pp-f"><dt>タクシー可否・料金</dt><dd>可・2,500円</dd></div>
  </dl>
  <div class="pp-cols"><div class="pp-col"><!-- page 1 のセクション --></div><div class="pp-col"><!-- page 2 以降 --></div></div>
  <section class="pp-sum"><h3 class="pp-h"><span>総評</span></h3>
    <div class="pp-ps"><div class="pp-ps-head"><b>人物像（接客）</b><span class="pp-legend">1 不採用レベル　2 やや不安　3 普通　4 良い　5 とても良い</span><span class="pp-ps-sum">合計 <span class="pp-line"></span> / 35 点</span></div>
      <table class="pp-ps-t"><tr data-pp-ps="ps_greeting"><td class="pp-no">1</td><td class="pp-lbl">挨拶ができていたか</td><td class="pp-sc"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></td></tr><!-- hint は <small> --></table></div>
    <div class="pp-ov"><span class="pp-k">面接者の総合判断</span><span class="pp-ov-o">採用</span><span class="pp-ov-o">保留</span><span class="pp-ov-o">不採用</span><small>（○で囲む）</small></div>
    <div class="pp-notes"><span class="pp-k">面接所見</span><div class="pp-lines" aria-hidden="true"><i></i>（40 本）</div></div>
  </section>
</div>
```
セクション（台本の順・ブロックの順。説明・質問・確認点は短い名前／確認点・必須条件は全文）:
```html
<section class="pp-sec" data-sec="conditions"><h3 class="pp-h"><span>① 勤務条件</span><small>10分</small></h3>
  <table class="pp-t pp-must"><tr data-pp-item="must_weekly"><td class="pp-lbl">土日を含む週3日以上、5時間以上</td><td class="pp-ch"><span class="pp-box"></span>一致<span class="pp-box"></span>不一致</td></tr></table>
  <dl class="pp-fields"><div data-pp-item="weekend"><dt>土日勤務可否</dt><dd><span class="pp-box"></span>いずれか<span class="pp-box"></span>両日</dd></div>
    <div data-pp-item="busy_ng"><dt>出勤不可な繁忙</dt><dd><span class="pp-line"></span></dd></div></dl>          <!-- choice は □選択肢、ほかは線 -->
  <div class="pp-ex" data-pp-block="conditions_explain"><span class="pp-k">説明</span><span class="pp-ck"><span class="pp-box"></span>交通費</span>…<span class="pp-ck"><span class="pp-box"></span>初回契約2か月※</span><span class="pp-note">※短期求人のみ</span></div>
  <div class="pp-q" data-pp-block="conditions_q"><div class="pp-qn"><span class="pp-k">質問</span><span class="pp-qi">短期／長期の希望</span><span class="pp-qsep">・</span>…</div><div class="pp-lines" aria-hidden="true"><i></i><i></i><i></i></div></div>  <!-- memo が false のブロックは罫線なし -->
  <table class="pp-t pp-rate"><tr data-pp-item="rt_concrete"><td class="pp-lbl">勤務条件の一致に「具体性」があるか</td><td class="pp-mk"><span>○</span><span>△</span><span>×</span></td></tr></table>
</section>
```
- 合否連絡（notify）は `pp-ex` の見出し「合否連絡」・□＋短い名前。注記（note）・質問文の全文・説明の全文・ブロックの注記は載せない
- 2 段の振り分け: `page === 1` のセクションを左、`page >= 2` を右（既定は ①② ｜ ③④⑤＝台本の 1 枚目・2 枚目）。どちらかが空になる台本は前半 `ceil(n/2)` を左・残りを右
- 人物像は `def.persona` が有効で項目があるときだけ（記録の `persona === null` は見ない。D15）。項目名は `label`、hint は `<small>`

### 5-3. CSS
付録 A（`paperSheetCss()`）。要点: 本文 9.5px・見出しは報告書と同じ寸法・罫線 7mm の点線・□ 9px の枠・2 段 `grid 1fr 1fr gap 14px`・シートは縦の flex で用紙の内寸いっぱい（`min-height:100%;max-height:100%`）・面接所見の罫線が残りの高さ（`flex:1 1 0;overflow:hidden`）。計測中（`.pp-measure`）は `min-height:0;max-height:none` で、面接所見の罫線は最低 30mm（4 本）。

### 5-4. 1 ページに収める `fitPaperSheet`（ES5。clFitSheet と同じ形）
段階 `[['pp-q3'], ['pp-q2'], ['pp-q1'], ['pp-q1','pp-compact'], ['pp-q0','pp-compact']]` を順に付け、`.pp-measure` を付けた高さが `limit` 以下になった最初の段階で止める。どれも超えたら clFitSheet と同じ縮小（`style.zoom` を `limit/h` で下げて測り直す。最大 12 回・0.3 まで）。高さ 0（描かれていない）なら何もしない。試作では既定の台本で `pp-q3`（933px）。

### 5-5. 印刷（app.js。D14）
```js
function preparePaperSheet(on) {   // 印刷ホスト #clSheet に記入シートの用紙を描いて計測（off で片付け）
  const host = $('#clSheet'); if (!host) return false;
  if (on) { injectChecklistSheetCss(); ensureChecklist(); /* 補完 3（11-9）: fillChecklistDefaults から。今日の日付で埋めない */ host.innerHTML = '<div class="a4 pp-a4">' + S.paperSheetHtml(S.buildRecord(state), state.profile, {}) + '</div>';
    document.body.classList.add('print-checklist'); const sh = $('#clSheet .pp-sheet'); if (sh) S.fitPaperSheet(sh); }
  else { document.body.classList.remove('print-checklist'); host.innerHTML = ''; }
  return true;
}
function printPaperSheet() { /* printChecklistSheet と同じ: prepare(true) → afterprint／3 秒で prepare(false) → window.print() */ }
```
- 判定は走らせない（`ensureJudgment` を呼ばない）。`beforeprint` の自動切替は `print-checklist` が付いているので何もしない（既存の条件）。`RecruitApp.preparePaperSheet` を公開（e2e 用）
- `index.html` の `#clSheet` のコメントに「記入シートの印刷にも使う」を足す

---

## 6. 右サマリー・設定・使い方（P7）

### 6-1. 右サマリー
`#sumChecklist` の `#sumMarks` の後ろに（`R.personaModel(def, cl)` があるとき）`row('sumPersona', '人物像', 値)`:
全部入力 `{total}/{max}点・{pct}%`（1 点ありなら ` <span class="badge danger">1点あり</span>`）／一部 `{total}/{max}点 <span class="badge muted">未入力 {n}</span>`（＋1点あり）／入力なし `<span class="badge muted">未入力 {n}</span>`。人物像を使わない記録・OFF は行を出さない。

### 6-2. 設定（settings.js `checklistHtml`。総合判断の小見出しの後ろ・ヘッダーの前）
```
<h3 class="sub" id="s-persona">人物像（1〜5 点）</h3>
<div class="hint">Step② の総評で項目ごとに 1〜5 点（1 不採用レベル・2 やや不安・3 普通・4 良い・5 とても良い）を付けます。結果（推奨）は下げる方向にだけ使います（上げることはありません）。</div>
sCheck('checklist.persona.enabled', '人物像を使う', 'OFF にすると Step② に出さず、判定にも使いません。保存済みの報告書（HTML）は保存したときのままです。')
<div class="s-cl-max" id="clPsMaxNote">人物像 <b>7</b> 項目 × 5 点 ＝ 満点 <b>35</b> 点</div>
field-row: sInput('checklist.persona.title', '見出し（Step② と報告書）')
<div class="field"><label>項目（1 行に「項目名|短い名前|説明」）</label><textarea data-bind="checklist.persona.items" data-type="persona" data-repaint rows="8">…</textarea>
  <div class="hint">短い名前（判定の理由・記入シート）と説明（Step② に小さく表示）は省略できます。上から表示の順です。項目名を変えなければ、並べ替えても入力済みの点は引き継ぎます。</div></div>
field-row: sInput('checklist.persona.keepPct', 'そのまま（得点率）', { type: 'number', min: 0, max: 100, repaint: true, suffix: '% 以上（満点 35 点では 25 点以上）' })
           sInput('checklist.persona.rejectBelowPct', '不採用推奨（得点率）', { …, suffix: '% 未満（14 点未満。その間は上長最終判断要まで）' })
field-row: sSelect('checklist.persona.onePointResult', '1 点の項目があるとき', capOpts)
           sSelect('checklist.persona.unscoredResult', '未入力の項目があるとき', capOpts)
```
- 点の表示は `ceil(max*keepPct/100)` 点以上・`ceil(max*rejectBelowPct/100)` 点未満（`max` は下書きの項目数×5）。`capOpts` は既存（調整しない／上長最終判断要まで／不採用推奨）
- `coerce` に `data-type="persona"`: 行を `/[|｜]/` で分け `[label, short, hint…]`（trim。hint は残りを `|` でつなぐ）。空行は捨てる。id は D20（`U.getPath(draft, bind)` の既存の項目から、項目名が同じでまだ使っていないものの id。無ければ `U.uid('ps')`）。出力は `{ id, label }`＋空でない `short`・`hint`
- textarea の表示: `label` に `short`・`hint` を `|` でつなぎ、末尾の空は省く（短い名前が空で説明があれば `項目名||説明`）
- 説明・確認点の項目にも「報告書（A4 1 枚）での短い名前」の欄（既存の `shortTag`。D16）。プレースホルダの文言は既存のまま
- 「既定の台本に戻す」の確認文に「（人物像の項目・境界も既定に戻ります）」を足す（`checklist` ごと置き換えるので persona も既定）
- 節の説明文（`section('s-checklist', …)` の desc）に「人物像（1〜5 点）」を足す。削除した機能の語（E10 の禁止語: 詳細モード・申し送り・旧形式 など）を使わない
- `normalizeProfile` の許可キーは変えない（persona は `checklist` の中）。e2e E10 の `ALLOW` に `/^checklist\.persona\.(enabled|title|items|keepPct|rejectBelowPct|onePointResult|unscoredResult)$/` を足す。設定の `data-action` は増やさない

### 6-3. 使い方（`helpHtml`。`.help-step` は 3 つのまま）
- ステップ 2 の文: 「…確認点の ○△×・**総評（人物像 1〜5 点・総合判断・面接所見）**を入力します。面接中はメモを中心に、○△×・人物像・総合判断は面接後にまとめて入力できます。…」
- 新しいカード `#helpPersona`「人物像（1〜5 点）と記入シート」（`#helpScriptFlow` の後ろ）: ① 面接中はメモ中心（~~1 対 1 でなくても回せる~~ → **補完 2（11-9）**: 1 対 1 の面接のとき。1 対 1 でない面接は記入シートに書いて面接後に転記〔フィードバック ①②〕）／② 人物像 7 項目と 1〜5 の目安・35 点満点／③ 判定への反映（70% 以上はそのまま・40% 以上 70% 未満は上長最終判断要まで・40% 未満は不採用推奨・1 点が 1 つでもあれば上長最終判断要まで・未入力があれば上長最終判断要まで。下げる方向だけ。設定で変更可）／④ 記入シート（① と ② の上部の「🖨 記入シート（手書き用）」で A4 1 枚〔**補完 5（11-9）**: ① のボタンはカードの下の操作行。使い方は「Step① の…（カードの下、「面接チェックリストへ進む →」の左）か、Step② の上部の同じボタン」〕。② と同じ並び。面接後にアプリへ転記）／⑤ 確認点「最低限の話し方、敬語が可能か」は人物像の言葉遣いと重なるため既定から外した
- 「結果（推奨）の決まり方」カードに 1 行: 人物像の合計・1 点・未入力で下がる（③ の内容を短く）。確認点の行は「確認点の ○△× は面接評価（点数）として報告書に載ります」のまま

---

## 7. テスト計画（P8）

### 7-1. 単体（`node tests/rules.test.js`）。既存の書き換え（確認点 7→6・16→14 点）
| # | 書き換え |
| --- | --- |
| ヘルパー | `clAll()` の最後で `((def.persona||{}).items||[]).forEach(it => cl.persona[it.id] = 4)`（28/35＝80%＝規則に掛からない）。`over` で上書きできる。`clMarks` の配列は 6 要素（`rt_manner` の位置を除く） |
| #54 | 種類ごとの件数 `rating: 6`（explain 14・question 13 は同じ）・`interviewModel(...).max === 14`・`checklistItems(def,'rating')[5]` が `rt_mismatch`（no 5・⑤）。足す: 確認点の id の並び `['rt_concrete','rt_hourensou','rt_turnover','rt_understand','rt_team','rt_mismatch']`・既定に `rt_manner` が無い・説明と確認点に short（1-2 の表） |
| #55 | 例の表を 14 点満点に: 全○ 14/100/high・`[g,g,g,g,f,f]` 12/85.7/high・`[g,g,g,f,f,p]` 10/71.4/high・`[g,g,f,f,f,p]` 9/64.3/mid・全△ 8/57.1/mid・`[g,g,p,p,p,p]` 6/42.9/mid・`[g,f,f,p,p,p]`＋保留 5/35.7/low・全× 2/14.3/low。`max` 14・`recommendPts` 10・`reviewPts` 6・`breakdown.length` 7（最後 `[6]` が総合判断）・counts `{good:6,…}`・cl1 total 12・cl2 total 12・cl3 total 10・`interviewModel(P(), null).max` 14 |
| #63 | `ratings.length` 6・`score.max` 14。① の done: 必須条件を入れた時点で false → `rt_concrete='good'` で true（`rt_manner` の行を削除）。s5 の total `2 + 1`（確認点 1 件＋保留）。checklistDiff は `rt_concrete` を削除・④ に追加 → `{ added: ['rt_new'], removed: ['rt_concrete'] }`・max 14 |
| #66 | `judgment.total` 13・sheetNoJ の確認点タイル `13<small>/14点</small>`・html5 の `m-none` 6 個 |
| #73 | total・max 14・interview `{14,14,100,'high','高'}`・breakdown 7・strengths 6・recommendPts 10・reviewPts 6。強み・懸念は `clMarks(['good','poor','good','fair','poor','good'])`（期待値は同じ） |
| #75 | j1.total 12 |
| #80 | 確認点の行 6・番号 `['①','②','②','③','④','⑤']`・`<td class="cl-rt-nt">` の確認を「`<span class="cl-nm-rt-i" data-cl-item="rt_concrete"><b>①具体性</b>：土日両日可と具体的に回答</span>` が面接メモの枠にある」に・sh2 の行 6・`○4 △0 ×0 未入力2`・面接メモの行 `['…cl-nm-q','…cl-nm-b cl-nm-rt','…cl-nm-iv','…cl-nm-memo']`・タイル `['結果','総合判断','必須条件','確認点','人物像']`・`14<small>/14点</small>`・`○6 △0 ×0` |
| #85 | `now`（今の形式の記録）の `checklist.persona` が object のまま往復（足すだけ。`legacy` の期待値は変えない） |
| #88 | `clMarks(['good','good','good','fair','fair','poor'])` → total 10・max 14・pct 71.4・high。公開 API に `personaModel`・`personaScore`・`personaDiff`・`PERSONA_SCALE`・`PERSONA_RESULTS`（R）、`paperSheetHtml`・`paperSheetCss`・`fitPaperSheet`（S）を足す |

追加（番号は続き。計 37 件）:
- **#94 人物像の設定（正規化・検証）**: 既定の persona（1-1 と同じ値・並び）・`normalizeProfile(P())` が P() と同じで report `{}`・壊れた値（enabled 文字列・scaleMax 3・scaleLabels 短い・items 文字列・id 欠落／重複／不正・short 空白・keepPct 'x'・結果 'up'）を既定で補う・冪等・`persona` の無い旧い設定に既定が入る・`normalizeChecklistDef(persona の無い台本)` に persona が**足されない**・`validateProfile` のエラー 1 件ずつ（項目 0・項目名が空・見出しが空・境界 40/40・境界 -1/70・境界 40/101・結果 2 種）・OFF なら項目 0 でもエラーなし
- **#95 evaluateScript の人物像**: 2-4 の表をすべて（結果・adjustments の code・理由の文言）・未入力 → 上長最終判断要＋警告の文言・3 項目だけ入力の警告の名前・境界 25/24/14/13 点・`unscoredResult:'none'` は警告だけ・`onePointResult:'reject'` → 不採用推奨・`enabled:false`／台本に persona なし／`cl.persona === null` は `persona: null` で結果・警告が人物像なしと同じ・必須条件の不一致（mustGate）は adjustments が must_conditions だけ・`mustFailResult:'review'`＋全部 1 → 不採用推奨（must_conditions と persona_total）・戻り値 persona の形・`checklistHasInput`（人物像だけ入力でも true）・`personaScore`（'3'→3・true/0/6/2.5→null）・`personaDiff`
- **#96 rt_manner の移行と旧レコード**: 直前の既定と同じ台本（新しい既定＋`rt_manner`、説明・確認点の short なし）→ 既定の 6 項目・`report.mannerMoved`・`mustFailResult` の変更は残る／文言を 1 つ変えた台本・質問の short を変えた台本は `rt_manner` を残す／冪等（2 回目は report なし）／`parseProfileJSON` でも移行／`normalizeChecklistDef(記録の台本)` は移行しない・`normalizeRecord`: persona のキーなし＋台本に persona なし → `null`・キーなし＋台本に persona あり → `{}`・明示の `null` → `null`（台本に persona があっても）・object → そのまま／fixture `legacy-full-checklist.html`・`legacy-report-view.html`・`legacy-pre-persona.html` を `normalizeRecord` → `evaluateScript(…, P())` で保存時と同じ結果・警告 0・`persona: null`
- **#97 A4 と記入シートの HTML**: 人物像ありの用紙（タイル 5・`.cl-tiles has-ps`・`.cl-cols.cl-cols-eval` の中に `cl-blk-rate`→`cl-blk-persona`・人物像の行 7・`tr.s-1`・目盛りの `i.on` の数・`.cl-ps-sum`・1 点ありのタイル `is-ng` と `・1点あり`）／`persona === null` の記録は 4 タイル・`cl-cols-eval` なし・`cl-blk-persona` なし／`.cl-adj` に人物像の理由／CSS（`has-ps`・`max-width:36%`・`.cl-ps`・`@media` なし）／`paperSheetHtml`: 見出し・`pp-who`（空の氏名は `pp-line`・入力ありは氏名と区分）・2 段の振り分け（左 conditions・continuity／右 job・teamwork・reverse）・必須条件 2 行・記入欄 6・確認点 6 行（○△×）・人物像 7 行（1〜5）・総合判断の 3 つ・質問の短い名前・設定で項目を 3 つにすると 3 行・OFF なら人物像なし・`paperSheetCss` に `</script`・`@media` なし／`fitPaperSheet`（疑似 DOM で `pp-q3`→`pp-q2`→`pp-q1`→`pp-compact`→`zoom` の順・高さ 0 は何もしない）

### 7-2. e2e（`node build.js && node tests/e2e.js`）。既存の書き換え
| 場所 | 書き換え |
| --- | --- |
| ヘルパー `rateAll(level, o)` | 最後に人物像を `o.ps`（既定 4。`false` で触らない）にする: `state.checklist.persona` が object のときだけ、各項目 `setPs(id, n)`（今の値と違うときだけ `[data-action="ps-set"][data-persona=…][data-score=…]` を押す。再押下で外れるため） |
| ヘルパー `mk39` | `o.ps`（既定 4。`null` で未入力のまま）で `cl.persona` を埋める |
| E1 | 詳細モードの保存済みの設定（`legacy-profile-full.json`）: 保存し直した設定に `rt_manner` が無い・`checklist.persona.enabled === true`・toast に「既定の台本から外しました」（再読込では出ない） |
| E2 | 紙のタイル `['結果','総合判断','必須条件','確認点','人物像']`・右サマリー `○6` |
| E8 | 確認点の行 7 → 6（3 か所）・並び `['cl-sheet-head','cl-judge','cl-cols','cl-cols.cl-cols-eval','cl-blk.cl-blk-notes','cl-exline','cl-stamps']`・長い担当者名の確認（dec39）は `cl.persona` を 4 で埋める（結果が採用推奨のまま。5 タイルが切れない・最終合否欄は 36% 以下〔`decW <= rowW*0.36+1`〕） |
| E12 | 確認点の削除を `rt_turnover`（②）に: 削除後「確認点 5 項目」「満点 12 点」・右サマリー `/12点`、④ に追加で `満点 14 点`、② の確認点 6 件（① 1・④ 2・`rt_turnover` なし）・`/14点`。読込の toast「（追加 1・削除 1）」は同じ。「既定の台本に戻す」で `rt_manner` **なし**・`rt_turnover` あり・満点 14・`interviewModel(...).max === 14` |
| E14 (4) | 確認点のメモの窓: `#a4 .cl-nm-rt .cl-nm-v.cl-cut` をクリック → 見出し「確認点のメモ」・本文が `①具体性：{全文}` などの行（記録の notes と一致） |
| E16 (3b) | 上限近くのゆったりの見本は `iv` を 40〜600 字・20 字刻みで探す（新しい高さで 1030〜1052px に入るものを選ぶ）。条件は同じ |

追加 **E17 人物像・記入シート・質問の 1 行表示**（`fresh()` から。スクリーンショットは 7-4）:
1. ② の構成: `#clGuide` の文言（「面接中はメモを中心に。○△×・人物像・総合判断は面接後にまとめて入力できます」）・`#clPaperBtn`・目次の「総評」・`#clOverall h2` が「総評」・`#clPersona` → `.cl-overall-row` → `.cl-notes-field` の順・行 7・各行のボタン 5（`data-persona`・`data-score` 1〜5）・凡例の文言・① に `#saPaperBtn`
2. クリック: ps_greeting に 4 → `state.checklist.persona.ps_greeting === 4`・`aria-pressed`・`#clPsSum` 4・`#clPsState`「未入力 6」・もう一度 4 で未入力に戻る
3. キーボード: 1 行目の「1」にフォーカス → `4` → 2 行目へフォーカス → `5 4 4 3 4 5` で 7 行入る（合計 29・`#clPsPct`「（82%）」・`#clPsState`「70% 以上」）。Tab で次の行（1 行 1 タブ位置）・→ でフォーカスだけ動き点は変わらない
4. 1 点: ps_smile を 1 → `#clPsWarn` に「笑顔・表情」・行に `.is-one` → ③ で上長最終判断要・`adjustments` に `persona_one`・理由の文言・`#scriptWarnings` と A4 の `.cl-adj` に理由・タイル `is-ng`・`・1点あり`・`tr.s-1[data-ps-item="ps_smile"]`
5. 合計 40% 未満（`1,1,2,2,2,2,2`）→ 不採用推奨（`persona_total`）。全部 3 → 上長最終判断要（`persona_total`・「人物像の合計 21/35（60%）のため…」）。**全部 4 以上 → 採用推奨・adjustments なし・警告なし**
6. 未入力: 人物像を入れずに総合判断「採用」→ 上長最終判断要・警告「人物像に未入力が 7 項目あります（…）」・「面接チェックリストで入力する」ボタン
7. A4: `.cl-cols-eval` の確認点 6 行｜人物像 7 行・タイルの値 `28/35点`・`80%`・保存 HTML とアプリの印刷が PDF 1 ページ・押印行は下端（E16 の `okGap`）・保存 HTML を開いた画面と PDF の画像が同じ様式（E14 の `cmp14`）・重いサンプル（全メモ 300 字・確認点のメモ 300 字・人物像入り）も 1 ページ
8. 右サマリー `#sumPersona`（`28/35点・80%`・1 点ありのバッジ・未入力 n）
9. 記入シート: `window.print` をスタブ → `#saPaperBtn`（① で氏名が空）→ 印刷の瞬間に `body.print-checklist` と `#clSheet .pp-sheet`・afterprint で外れる・判定は走らない（`state.judgment === null`）。`preparePaperSheet(true)`＋印刷の表示で PDF → 1 ページ・本文に 面接記入シート・人物像の 7 項目名・1〜5・○△×・一致／不一致・総合判断（採用・保留・不採用）・面接所見。DOM: 空の氏名は `.pp-f-name .pp-line`・人物像 7 行×5・確認点 6 行・必須条件 2 行・`.pp-sheet` の内容の高さ ≦ 1052・面接所見の罫線 4 本以上。① に入力（記入 太郎・区分・担当・短期求人・タクシー）→ ② の `#clPaperBtn` で印刷 → 氏名・担当・短期求人・タクシーが印字（PDF の本文）
10. 質問の 1 行表示: `.cl-q` 13 個・各 1 行（高さ ≦ 行の高さ×1.6）・長い質問は `.cl-q-full` が「…」（scrollWidth > clientWidth）・クリックで `.open`・`aria-expanded="true"`・高さが増える・もう一度で閉じる・Enter でも開閉・`q-all` で全部開く（文字「たたむ」）→ もう一度で全部閉じる（「全文」）・メモ欄は残る・390px で横スクロールなし
11. 設定: `#s-persona` の欄（data-bind 7 種）・項目を 3 行に変えて保存 → ② の行 3・満点 15・A4 の人物像 3 行・記入シート 3 行（`preparePaperSheet`）。並べ替えても点が残る（項目名が同じ）。`rejectBelowPct 50`・`keepPct 30` → 検証エラーで保存されない（`#settingsIssues` に「得点率の境界」）・項目を空に → 「人物像の項目がありません」・OFF で保存 → ② に人物像なし・総合判断「採用」で採用推奨（人物像の警告なし）。最後に既定に戻す
12. 旧レコード: `legacy-full-checklist.html`・`legacy-report-view.html`・`legacy-pre-persona.html` を読み込む → `state.checklist.persona === null`・判定が保存時と同じ（採用推奨）・人物像の警告なし・toast「人物像（1〜5 点）の導入前に保存された記録のため…」・② に `#clPersonaOff`（`#clPersona` なし）・③ の紙は 4 タイル・`cl-blk-persona` なし。`legacy-pre-persona.html` を保存し直す → 記録の `checklist.persona === null` → もう一度読み込んでも同じ判定
13. 使い方 `#helpPersona`（人物像・記入シート・面接中はメモを中心に）・`.help-step` は 3 つのまま
- **E13** に 1 つ: ロゴ入りの版で `preparePaperSheet(true)` → `#clSheet .pp-sheet .cl-title-logo`（題名の左・高さ 7mm）

### 7-3. fixture
- `tests/fixtures/legacy-pre-persona.html` を足す: `scratchpad/p12/make-legacy-pre-persona.js` が `git show c0d20ce:./src/…` を vm で読み、c0d20ce のコードで作った保存 HTML（応募者「保存 花子」・確認点は `rt_manner` だけ △・総合判断「採用」・判定 採用推奨 15/16・面接対応者と最終確認に笹川 晴央・最終合否 採用・persona のキーなし）。`scratchpad/p12/legacy-pre-persona.html` をそのままコピーしてよい（作り直すときは `node make-legacy-pre-persona.js <recruit-system> <出力>`）。実名は笹川 晴央だけ

### 7-4. スクリーンショット（tests/shots。git 管理外）
`p12-step2-persona.png`（`#clOverall` の要素・全部 4＋1 点を 1 つ）・`p12-step2-questions.png`（`#cl-continuity`。1 つ開いた状態）・`p12-report.png`（保存 HTML の `#a4`）・`p12-report-print.png`（その PDF の 1 ページ目を `pdftoppm`）・`p12-paper-sheet.png`（白紙の記入シートの PDF 1 ページ目）・`p12-paper-sheet-filled.png`（① 入力ありの記入シートの PDF 1 ページ目）

---

## 8. 実装順
1. config（persona・rt_manner 削除・short）→ rules（personaScore・personaModel・personaDiff・emptyChecklist・checklistHasInput・checklistSummary・evaluateScript (e)）→ 単体 #54〜#88 の書き換え＋#95
2. storage（normalizePersonaDef・normalizeChecklistDef・validate・fillChecklist の移行・normalizeRecord）→ #94・#96
3. storage の A4（clTitleHtml の切り出し・タイル・2 カラム・確認点のメモの行・CSS・memoOf）→ #80・#97 の A4 部分。`proto-a4.js` の数字と比べる
4. storage の記入シート（paperSheetHtml・paperSheetCss・fitPaperSheet）→ #97 の残り
5. app（ensureChecklist・総評カード・キーボード・質問の 1 行表示・案内・印刷・右サマリー・toast・使い方）→ settings（人物像の節・coerce・short の欄）→ styles
6. `node build.js` → e2e の書き換え（7-2 の表）→ E17・E13 → 全部緑 → docs（10 章）

## 9. 落とし穴
1. **`emptyChecklist` に `persona: {}` が入るので、人物像を入れない既存のテスト・サンプルはすべて「上長最終判断要」になる**。単体の `clAll`・e2e の `rateAll`・`mk39`・E8 の dec39 を 4 で埋める（7-1・7-2）
2. 旧レコードの `null` を守る: `normalizeRecord` は `deepMerge` の後で元の値から決め直す。`ensureChecklist`・`buildRecord`・`checklistSheetHtml` で `null` を `{}` にしない。`personaModel` は `cl.persona === null` を最初に見る
3. `normalizeChecklistDef` は persona を**足さない**（記録の台本）。プロファイルに既定の persona が入るのは `fillChecklist` の `deepMerge`
4. persona の正規化の出力のキーの並びを既定と同じにする（`normalizeProfile` の `report.stripped` は JSON の文字列で比べる。並びが違うと毎回保存し直す・単体 #82 が落ちる）
5. 移行の比較で `short` を外すのは説明・確認点だけ。新しい既定に `short` を足すときに既存のキーの並びを変えない（`{ id, label, short, hint }`。`rt_concrete` は `id, label, short, hint` の順になるが比較では short を外すので c0d20ce の `id, label, hint` と一致）
6. A4 の CSS は**足すだけ**（#80・#87・#89 が既存の規則の文字列を照合）。`n5`・`@media`・`print-checklist` を `checklistSheetCss` に書かない。`paperSheetCss` も同じ
7. `clFitSheet` を触らない（#93 の疑似 DOM がセレクタ文字列で照合）。確認点のメモの行を `.cl-nm-b` にするのはこのため
8. `a4PageScript` は ES5・関数内にコメントなし・`</script` を書かない（build.js が止める）。保存 HTML のスクリプトは `toString()` で埋め込まれる
9. 記入シートの印刷中も `beforeprint` の自動切替が報告書を描かないこと（`print-checklist` が付いているので既存の条件で抜ける）。`afterprint` と 3 秒のタイマーで必ず片付ける（`window.print` がブロックしない環境・スタブでも残らない）
10. キーボード: 数字キーは人物像のボタンにフォーカスがあるときだけ。テキスト欄の入力を奪わない。Ctrl+P などの修飾キー付きは触らない
11. ② の描き直し（`renderStep`）で質問の開閉はたたまれる（仕様）。`updateChecklistUI` は質問の開閉を触らない
12. E10 の `ALLOW` と禁止語・`data-action` の一覧（設定には新しい `data-action` を足さない）。`.help-step` は 3 つのまま（E10）
13. 試作の高さ（0-5）は c0d20ce のフォントでの値。E16 (3b) の上限近くの見本は探し直す
14. 公開リポジトリ: fixture・docs・テストに実名（笹川 晴央以外）を書かない。`local/` を読まない・出さない

## 10. docs（P9）
- **docs/HANDOFF.md**: 冒頭の一覧に「2026-10-16: 人物像（1〜5 点）・記入シート・面接中はメモ中心（フィードバック ①②③）。docs/SPEC-persona.md」／1-1 ②（案内・総評・質問の 1 行表示・記入シートのボタン）・右サマリー（人物像）／1-2 `personaModel`・evaluateScript の (e)／1-3 設定の人物像の節・rt_manner の移行／1-5 A4（5 タイル・2 カラム・確認点のメモ）・記入シートの印刷／1-6 テスト件数（単体 37・e2e の件数）・fixture `legacy-pre-persona.html`／2 章の決定事項の表に「N. 人物像」「O. 記入シート」の行を足し、「I.」の「確認点 7 項目（16 点満点）」を「6 項目（面接評価 14 点満点。2026-10-16 に rt_manner を人物像と重なるため外した）」に／3-1 TODO の帯の境界の例を 14 点満点（10 点以上が高・6 点以上が中）に・「空欄のチェックリストも印刷できると便利か」は記入シートで済み／4 章の触る場所に「人物像（config `checklist.persona`・rules `personaModel`・evaluateScript (e)・storage `normalizePersonaDef`・A4 の `clOnePageHtml`・app の総評カード `clOverallHtml`・`onPersonaKey`・settings の人物像の節）」「記入シート（storage `paperSheetHtml`・`paperSheetCss`・`fitPaperSheet`、app `preparePaperSheet`・`printPaperSheet`）」「質問の 1 行表示（app `clBlockHtml` の question・`q-toggle`／`q-all`）」
- **README.md**: 使い方の ①（記入シートのボタン）・②（案内・質問の 1 行表示・確認点 6 項目・総評〔人物像・総合判断・面接所見〕）／「結果（推奨）の決まり方」に人物像の規則と例の表（2-4）、面接評価の例の表を 14 点満点に（全○＋採用 14/100/高・○4△2＋採用 12/85.7/高・○3△2×1＋採用 10/71.4/高・○2△3×1＋採用 9/64.3/中・全△＋採用 8/57.1/中・○1△2×3＋保留 5/35.7/低）／「印刷」に記入シート（手書き用）の節・A4 の並び 3（5 タイル）・5（確認点｜人物像）・6（確認点のメモ）／設定の 3 に人物像の節
- **docs/SPEC-a4.md**: 13 章の後ろに「14. 人物像の追加による用紙の変更（2026-10-16 追記）」: 結果ストリップの 5 タイルと `has-ps`・最終合否欄 36%（F9 の 48% を置き換え）・確認点｜人物像の 2 カラム・確認点のメモの行（`.cl-nm-b.cl-nm-rt`。窓は 1 項目 1 行）・用紙の並び（1-2 の並びの更新）・clFitSheet は変えていない・記入シートは同じ用紙の部品を使う別の用紙（本書 5 章）
- 本書の末尾に「11. 実装時の差分」を作り、実装で決めたこと・本書からの差分を書く

---

## 付録 A. 記入シートの CSS（`paperSheetCss()`。試作で使ったもの）
```
.pp-sheet{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,"Noto Sans JP",system-ui,sans-serif;font-size:9.5px;line-height:1.4;color:#111;background:#fff;display:flex;flex-direction:column;min-height:100%;max-height:100%}
.pp-sheet.pp-measure{min-height:0 !important;max-height:none !important}
.pp-sheet *{box-sizing:border-box}
.pp-sheet .cl-title{display:flex;align-items:center;gap:8px;min-height:7mm;padding:0 1px 3px;border-bottom:2px solid #24324a}
.pp-sheet .cl-title-logo{flex:none;display:block;height:7mm;width:auto;max-width:50mm;object-fit:contain}
.pp-sheet .cl-title-t{flex:none;font-size:13px;font-weight:800;letter-spacing:.04em;line-height:1.3;color:#1a2233}
.pp-sheet .cl-title-r{margin-left:auto;min-width:0;font-size:8.5px;color:#3a4556;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-who{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px;margin:0;padding:6px 2px 5px;border-bottom:1px solid #d5dbe3}
.pp-who>div{display:flex;align-items:baseline;gap:5px;min-width:0;max-width:100%}
.pp-who dt{flex:none;font-size:8.5px;font-weight:700;color:#5b6675}
.pp-who dd{margin:0;min-width:0;font-weight:700;overflow-wrap:anywhere}
.pp-f-name dd{font-size:14px;font-weight:800}.pp-f-name small{font-size:9px;font-weight:600;margin-left:2px}.pp-f-name .pp-who-s{font-size:9px;font-weight:600;color:#3a4556;margin-left:6px}
.pp-line{display:inline-block;width:26mm;height:1.1em;border-bottom:1px solid #5b6675;vertical-align:-3px}
.pp-f-name .pp-line{width:46mm}
.pp-box{display:inline-block;width:9px;height:9px;border:1px solid #3a4556;margin:0 2px 0 6px;vertical-align:-1px}
.pp-box:first-child{margin-left:0}
.pp-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 14px;margin-top:7px}
.pp-col{min-width:0}
.pp-sec{margin-top:7px}.pp-col>.pp-sec:first-child{margin-top:0}
.pp-h{display:flex;align-items:baseline;gap:6px;margin:0 0 2px;padding:0 0 0 6px;border-left:3px solid #24324a;font-size:10.5px;font-weight:800;line-height:1.35;color:#1a2233}
.pp-h small{font-size:8.5px;font-weight:600;color:#5b6675}
.pp-k{flex:none;font-size:8.5px;font-weight:700;color:#5b6675;margin-right:4px}
table.pp-t{width:100%;border-collapse:collapse}
.pp-t td{padding:2px 3px;border-bottom:1px solid #e6eaef;vertical-align:middle}
.pp-t .pp-lbl{font-weight:600}
.pp-t .pp-ch{white-space:nowrap;text-align:right;font-weight:700}
.pp-t .pp-mk{white-space:nowrap;text-align:right;width:62px}
.pp-mk span{display:inline-block;width:18px;text-align:center;font-size:11.5px;font-weight:700}
.pp-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 8px;margin:0}
.pp-fields>div{display:flex;flex-wrap:wrap;align-items:baseline;gap:1px 4px;min-width:0;padding:2px 3px;border-bottom:1px solid #e6eaef}   ← レビュー指摘 6 で flex-wrap（11-8）
.pp-fields dt{flex:none;font-size:8.5px;font-weight:700;color:#5b6675}
.pp-fields dd{margin:0;min-width:0;flex:1 1 auto;white-space:nowrap}
.pp-fields dd .pp-line{width:100%}
.pp-ex{display:flex;flex-wrap:wrap;align-items:baseline;gap:1px 9px;padding:2px 3px;border-bottom:1px solid #e6eaef}
.pp-ck{white-space:nowrap}
.pp-note{font-size:8px;color:#5b6675}
.pp-q{padding:2px 3px 0;border-bottom:1px solid #e6eaef}
.pp-qn{line-height:1.35}
.pp-qi{white-space:nowrap}.pp-qsep{color:#8a94a3;margin:0 3px}
.pp-lines i{display:block;height:7mm;border-bottom:1px dotted #8a94a3}
.pp-sheet.pp-q2 .pp-q .pp-lines i:nth-child(n+3){display:none}
.pp-sheet.pp-q1 .pp-q .pp-lines i:nth-child(n+2){display:none}
.pp-sheet.pp-q0 .pp-q .pp-lines{display:none}
.pp-sum{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;margin-top:9px}
.pp-ps{margin-top:1px}
.pp-ps-head{display:flex;align-items:baseline;gap:10px;padding:0 3px 1px}
.pp-ps-head b{font-size:9.5px}
.pp-legend{font-size:8.5px;color:#3a4556}
.pp-ps-sum{margin-left:auto;font-size:9px;font-weight:700;white-space:nowrap}.pp-ps-sum .pp-line{width:12mm}
table.pp-ps-t{width:100%;border-collapse:collapse}
.pp-ps-t td{padding:2.5px 3px;border-bottom:1px solid #e6eaef;vertical-align:middle}
.pp-ps-t .pp-no{width:14px;font-size:8.5px;color:#5b6675;text-align:center}
.pp-ps-t .pp-lbl{font-weight:600}.pp-ps-t .pp-lbl small{font-size:8.5px;font-weight:500;color:#5b6675;margin-left:4px}
.pp-ps-t .pp-sc{white-space:nowrap;text-align:right;width:44mm}
.pp-ps-t .pp-sc span{display:inline-block;width:8mm;text-align:center;font-size:12px;font-weight:700}
.pp-ov{display:flex;align-items:baseline;gap:6px;margin-top:5px;padding:2px 3px}
.pp-ov-o{font-size:12.5px;font-weight:800;padding:0 10px}
.pp-ov small{font-size:8.5px;color:#5b6675}
.pp-notes{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;margin-top:3px;padding:0 3px}
.pp-notes .pp-lines{flex:1 1 0;min-height:0;overflow:hidden}
.pp-sheet.pp-measure .pp-notes .pp-lines{min-height:30mm}
.pp-sheet.pp-compact{font-size:9px;line-height:1.3}
.pp-sheet.pp-compact .pp-sec{margin-top:4px}
.pp-sheet.pp-compact .pp-t td,.pp-sheet.pp-compact .pp-fields>div,.pp-sheet.pp-compact .pp-ex,.pp-sheet.pp-compact .pp-ps-t td{padding-top:1px;padding-bottom:1px}
.pp-sheet.pp-compact .pp-lines i{height:6mm}
.pp-sheet .pp-box,.pp-sheet .pp-line,.pp-sheet .pp-lines i{-webkit-print-color-adjust:exact;print-color-adjust:exact}
```
注意: 計測中の面接所見の罫線は `min-height`（`flex:none` にすると罫線 40 本ぶんの高さを測ってしまう＝試作で 1878px になった）。

## 付録 B. A4 報告の追加・変更の CSS（`checklistSheetCss()`）
変更（2 つだけ）: `.cl-mode-sheet .cl-rt col.c-lbl{width:40%}` → `{width:auto}`／`.cl-mode-sheet .cl-decision{…;max-width:48%;…}` → `max-width:36%`。追加:
```
.cl-mode-sheet .cl-tiles.has-ps{grid-template-columns:minmax(min-content,1.5fr) repeat(4,minmax(min-content,1fr))}   ← レビュー指摘 5 で minmax(0,…) から（11-8）
.cl-mode-sheet .cl-judge-main{flex-basis:0%;min-width:min-content}.cl-mode-sheet .cl-decision{flex-shrink:1}   ← レビュー指摘 5 で追加（11-8）
.cl-mode-sheet .cl-cols.cl-cols-eval{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.cl-mode-sheet .cl-blk-persona .cl-h{display:flex;align-items:baseline}.cl-mode-sheet .cl-ps-sum{margin-left:auto;font-size:9px;font-weight:800;color:#1a2233}
.cl-mode-sheet table.cl-ps{width:100%;border-collapse:collapse;table-layout:fixed}
.cl-mode-sheet .cl-ps col.c-no{width:16px}.cl-mode-sheet .cl-ps col.c-sc{width:64px}.cl-mode-sheet .cl-ps col.c-v{width:18px}
.cl-mode-sheet .cl-ps td{padding:3px 4px;border-bottom:1px solid #e6eaef;vertical-align:middle}
.cl-mode-sheet .cl-ps-no{font-size:8.5px;color:#5b6675;text-align:center}
.cl-mode-sheet .cl-ps-lbl{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cl-mode-sheet .cl-ps-bar{display:flex;gap:2px}.cl-mode-sheet .cl-ps-bar i{flex:1 1 0;height:9px;border:1px solid #b8c2cf;border-radius:2px;background:#fff}
.cl-mode-sheet .cl-ps-bar i.on{background:#3a4556;border-color:#3a4556}
.cl-mode-sheet .cl-ps tr.s-2 .cl-ps-bar i.on{background:#c98a1b;border-color:#c98a1b}.cl-mode-sheet .cl-ps tr.s-1 .cl-ps-bar i.on{background:#b42318;border-color:#b42318}
.cl-mode-sheet .cl-ps-v{text-align:center;font-weight:800}.cl-mode-sheet .cl-ps tr.s-1 .cl-ps-v{color:#b42318}
.cl-mode-sheet.cl-roomy .cl-ps td{padding-top:6px;padding-bottom:6px}.cl-mode-sheet.cl-roomy .cl-ps-bar i{height:11px}.cl-mode-sheet.cl-roomy .cl-ps-no{font-size:9.5px}
.cl-mode-sheet.cl-compact .cl-ps td{padding-top:2px;padding-bottom:2px}
.cl-mode-sheet .cl-nm-rt-i b{font-weight:700;color:#3a4556}.cl-mode-sheet .cl-nm-rt-sep{margin:0 5px;color:#8a94a3}
.cl-sheet .cl-ps-bar i{-webkit-print-color-adjust:exact;print-color-adjust:exact}
```
色は既存の方針（結果・○△×・最終合否・ハンコだけに色）に、人物像の 1 点（赤）・2 点（琥珀）を足す。3〜5 点は濃い灰色。

---

## 11. 実装時の差分（2026-10-16。実装で決めたこと・本書からの差分・仕上げ）

実装は本書（1〜7 章・D1〜D20）とオーケストレータの決定 P1〜P10 のとおりで、未実装は無い（照合の結果は 11-7）。以下は本書に無かった細部・本書と変えたところ・テストの書き換え・仕上げで直したもの。

### 11-1. 結果
- `node tests/rules.test.js` 単体 37 件（#94〜#97 を追加）・`node build.js && node tests/e2e.js` e2e E1〜E17・326 件、すべて緑（`dist/toho-recruit-judge.html` 461.5 KB）。途中経過のコミット（07998d1）の時点は 308 件で、仕上げ（11-7）で E17 に 1 件、レビュー指摘の修正（11-8）で E17 に 8 件、補完（11-9）で E8 に 1 件・E17 に 8 件足した
- 判定（2-4 の表のとおり。単体 #95・e2e E17 (4)〜(6)）: 全部 4 → 採用推奨 28/35（80%）／4,4,4,4,3,3,3 → 採用推奨 25/35（71%）／全部 3 → 上長最終判断要（`persona_total`「人物像の合計 21/35（60%）のため、採用推奨ではなく上長最終判断要として扱います。」）／4,4,4,4,4,4,1 → 上長最終判断要（`persona_one`「人物像に 1 点の項目（志望動機）があるため、…」）／全部 2 → 上長最終判断要 14/35（40%）／1,1,2,2,2,2,2 → 不採用推奨 12/35（34%）／3 項目だけ → 上長最終判断要（`persona_unscored`）＋警告「人物像に未入力が 4 項目あります（声のトーン、目線、言葉遣い、志望動機）。」／保留＋全部 1 → 不採用推奨 7/35（20%）／必須条件の不一致＋全部 1 → 不採用推奨（`must_conditions` だけ・人物像の警告なし）
- A4 報告（E17 (7)。Chromium・既定の台本・1440px）: 全部 4 点・確認点すべて ○ → `.cl-roomy` 880px（上限 1052px）・確認点｜人物像 351px／351px・押印行は用紙の内寸の下端・保存 HTML の PDF 1 ページ・画面と印刷の画像が同じ様式・アプリの A4 印刷も同じ段階で 1 ページ。重いサンプル（確認点のメモ 300 字×6・人物像 4,5,1,3,4,2,5）→ `.cl-compact` 1044px・1 ページ
- 記入シート（E17 (9)）: 白紙 `pp-q3` 933px（用紙の内寸いっぱいで 1062px）・210×297mm・面接所見の罫線 9 本・PDF 1 ページ。① 入力あり（記入 太郎・短期求人・タクシー）`pp-q3` 916px・PDF 1 ページ。試作（0-5）と同じ値
- スクリーンショット（7-4）: `tests/shots/p12-step2-persona.png`・`p12-step2-questions.png`・`p12-report.png`・`p12-report-print.png`・`p12-paper-sheet.png`・`p12-paper-sheet-filled.png`

### 11-2. データ・判定
- `checklistSummary` の確認点（`ratings`）の項目にも `short` を載せた（A4 の「確認点のメモ」の行の短い名前。表示は `clShortOf` の規則〔既定の台本と項目名が同じなら既定の short〕）
- `personaModel` の `title` は空なら「人物像」。`scaleLabels` は正規化で 5 個に揃え、空の位置は既定の文言（`normalizePersonaDef`）
- `normalizePersonaDef`: 項目のキーは `id`・`label`・`short`・`hint` だけ（ほかは落とす）。object でない行は落とす。検証（`validateChecklist`）は object でない行を「面接チェックリストの人物像の{k}行目が正しくありません。」で止める（本書 1-5 の一覧に足した 1 件）
- `isPrevDefaultScript`: 新しい既定に `rt_manner` があるとき（将来既定に戻したとき）は比べない（false）＝二重に足さない
- `emptyChecklist` の `persona: {}`・`checklistHasInput` は人物像だけの入力でも true（本書どおり）

### 11-3. 画面（② ・右サマリー・設定・使い方）
- ② の上部の案内は、人物像を使わない記録（`null`）・設定で OFF のとき「面接中はメモを中心に。○△×・総合判断は面接後にまとめて入力できます」（人物像を外す）
- キーボード: 数字はテンキー（`Numpad1`〜`Numpad5`）も。6〜9・0 は何もしない（既定の動作のまま）。最後の行で数字を押したときは、その行の押したボタンにフォーカス（次の行が無いため）。Ctrl・Alt・Meta 付きは触らない
- ③ の確認事項の「面接チェックリストで入力する」は、総合判断の未入力に加えて人物像の未入力の警告があるときも出す
- 目次の右の点数は「面接評価 n/14　人物像 n/35」。1280〜1440px では目次が 2 行（1440px はチップの行と点数の行で高さ 75px）。c0d20ce でも 2 行（「総合判断」のチップが 2 行目に回って 84px）だったので、人物像の追加で目次は高くなっていない（チップの名前が「総評」に短くなった分 9px 低い。1366・1280px は 84px で同じ）
- 印刷の片付けは `afterPrintOnce(cleanup)`（afterprint と 3 秒の早い方で 1 回だけ。遅れて来たほうが次の印刷の用紙を消さない）を報告書（`printChecklistSheet`）と記入シート（`printPaperSheet`）で共用。`paperSheetHtml` が無い（古い storage）ときは toast でやめる
- 設定の人物像の項目（`coerce` の `persona`）: id は項目名が同じ項目を**下書きと保存済みの設定の両方**から探して引き継ぐ（同じ項目名が 2 行あれば 2 行目は新しい id）。「既定の台本に戻す」の確認に「（人物像の項目・境界も既定に戻ります）」を足した
- 設定の境界の欄の後ろに「（n 点以上）」「（n 点未満）」（満点×% の切り上げ。既定 25 点以上・14 点未満）。満点の注記 `#clPsMaxNote`
- 使い方のカード `#helpPersona` の数字（項目数・満点・境界・1 点のときの結果）は設定から描く。設定で人物像を OFF にしたときはカードの先頭に「いまの設定では人物像を使いません」（`#helpPersonaOff`）、「結果（推奨）の決まり方」の人物像の 1 行の末尾にも同じ断り。その 1 行の不採用推奨の境界（既定 40%）も設定から（仕上げで追加。11-7）

### 11-4. A4・記入シート
- 記入シートの説明・合否連絡の見出しはブロックの `title`（無ければ「説明」「合否連絡」）。表は `<tbody>` 付き（5-2 の DOM と同じ要素・クラス。テストはセレクタで見る）
- 記入シートは ① で氏名が空でも印刷できる（判定は走らない・`state.judgment` は null のまま）。応募した求人が未選択なら □ と設定の選択肢（既定 □通常求人 □短期求人）
- A4 の確認点の表は `colgroup` を `c-no`・`c-lbl`・`c-mk` の 3 列に（メモの列なし）。`.cl-rt col.c-lbl{width:auto}`・`.cl-decision{max-width:36%}` の 2 つだけ既存の規則を変えた（コメントも更新）
- 保存 HTML の窓（`memoOf`）は確認点のメモの行を 1 項目 1 行（`.cl-nm-rt-i` の textContent を改行でつなぐ）

### 11-5. テストの書き換え（7-1・7-2 の表以外）
- 単体: #54 の「最低限の話し方」が無いことは項目名だけで見る（ページの説明文〔`page.lead`〕には今も「最低限の話し方」がある）。#80 の空の `<i></i>` の数は `.cl-nm-lines` の中だけ数える（人物像の目盛りの空の `i` があるため）。#95 の「1 点が 2 つ」の例は合計の規則に掛からない [1,5,1,5,5,5,5]（27/35・77%）
- e2e E8 `zoomNotes`: 確認点 +40 件・面接所見 400 字 → +46 件・600 字。確認点のメモが面接メモ・所見の枠の 1 行に移って用紙の高さが変わり、+40 件では縮小後の空き 8.1px が縮小後の 1 行（8.2px）に足りず広げようがなかった（縮小の刻みしだい）。面接所見 400 字は縮小率によっては 4 行に収まって「…」にならないので 600 字に
- e2e E16 (3b): 上限近くのゆったりの見本を面接所見 40〜600 字・20 字刻みで探す（9 章の 13。今は 140 字・1051px）
- e2e E17 (3) の点の比べ方はキーの順を問わない（未入力に戻すとキーを消し、入れ直すと最後に付く）。E17 (9) の PDF の本文の確認は「必須条件」ではなく必須条件の項目名（5-2 の DOM に「必須条件」の見出しは無い）。E17 (12) は ③ に進んでから保存し直す（② で保存した記録は ② で開き、判定は ③ で走る）

### 11-6. できていないこと・確かめていないこと・そのままにした動き
- 実機のブラウザ（Edge / Chrome）の印刷ダイアログでの記入シート・報告書の印刷は確かめていない（Playwright の PDF・`window.print` のスタブで確認）。補完 9（11-9）でヘッドレスの Chromium の本物の `window.print`（スタブなし）の経路と 3 秒の片付けは確かめた。残る確認の手順は 11-9 の末尾
- 人物像を OFF にした設定で保存した記録（`checklist.persona` は `{}`・保存時の台本の `persona.enabled` は false）を、ON の設定のアプリで読み込むと、人物像は「未入力」として現在の設定で再判定する（上長最終判断要＋未入力の警告。導入前の記録〔`null`〕とは違い、人物像を使う）。③ で保存した記録なら既存の toast「保存時の判定（…）と現在の設定での再判定（…）が異なります」で分かる。D19 の項目の差の toast は両方の台本で人物像が ON のときだけ（本書どおり）
- 台本 1 枚目の前書き（`pages[0].lead`）には「最低限の話し方、敬語が可能か」が残る（台本の文言は変えない＝1-2。確認点の rt_manner だけを外した）。補完 6（11-9）で、② の前書きの下に付ける場所（人物像の「言葉遣い・説明のわかりやすさ」）を 1 行で示す

### 11-7. 仕上げ（2026-10-16。照合の結果と、仕上げで直したもの）
中断した実装（07998d1）を、本書の 1〜7 章・D1〜D20 とオーケストレータの決定 P1〜P10 に 1 つずつ照らした結果、**未実装・途中のものは無かった**（下の表）。直したのは使い方の 1 か所・スクリーンショットの撮り方・テストの補強・docs の誤り。

| 決定・章 | 実装（主な場所） | テスト |
| --- | --- | --- |
| P1 データ（本書 1-1・1-3・1-4・D2・D3） | config `checklist.persona`・rules `emptyChecklist`／`personaScore`／`checklistHasInput`・storage `normalizePersonaDef`／`normalizeChecklistDef`／`normalizeRecord`・app `ensureChecklist` | 単体 #94・#96 |
| P2 判定（2 章・D1・D4〜D6） | rules `personaModel`・`personaDiff`・`evaluateScript` の (e)・戻り値の `persona` | 単体 #95・e2e E17 (4)〜(6)・(12) |
| P3 rt_manner（1-2・1-6・D16・D17） | config（確認点 6 項目・説明と確認点の short）・storage `isPrevDefaultScript`（`fillChecklist`）・app `profileNotice` | 単体 #54・#96・e2e E1・E12 |
| P4 ②（3 章・D7〜D9） | app `interviewStepHtml`（`#clGuide`・`#clPaperBtn`）・`clOverallHtml`／`clPersonaHtml`・`psSet`／`updatePersonaUI`・`onPersonaKey`・`clBlockHtml` の question（`q-toggle`／`q-all`）・styles.css | e2e E17 (1)〜(3)・(10) |
| P5 A4（4 章・D10〜D12） | storage `clOnePageHtml`（タイル・`.cl-cols-eval`・確認点のメモの行）・`checklistSheetCss`・`a4PageScript` の `memoOf`。`clFitSheet` は変えていない | 単体 #80・#97・e2e E2・E8・E14・E16・E17 (7) |
| P6 記入シート（5 章・D13〜D15） | storage `clTitleHtml`・`paperSheetHtml`・`paperSheetCss`・`fitPaperSheet`・app `preparePaperSheet`／`printPaperSheet`／`afterPrintOnce`・`#saPaperBtn` | 単体 #97・e2e E13・E17 (9) |
| P7 右サマリー・設定・使い方（6 章・D20） | app `personaSummaryRow`・settings の人物像の節（`coerce` の `persona`・説明と確認点の短い名前の欄）・app `helpPersonaHtml` | e2e E10・E17 (8)・(11)・(13) |
| 1-7 読み込みの toast（D18・D19） | app `applyRecord` | e2e E17 (12)（D18: 旧い記録 3 件。D19: 項目を変えた設定で人物像ありの保存 HTML を読み込む〔レビュー指摘 11 で追加。仕上げの時点では D19 を通るテストが無く、この行は誤りだった〕） |
| P8 テスト（7 章） | 単体 37 件（#94〜#97 を追加）・e2e E17 を追加し E1・E2・E8・E10・E12〜E14・E16 を書き換え（11-5）。確認点 7→6・16→14 点の期待値の書き換えのほかは、確かめる性質を落としていない（落とした確認は無く、E14 (4) の確認点のメモの窓・E12 の満点の増減は新しい並びで同じことを確かめる） | — |
| P9 docs（10 章） | 本書 11 章・`docs/HANDOFF.md`・`README.md`・`docs/SPEC-a4.md` 14 章 | — |
| P10 スクリーンショット（7-4） | `tests/shots/p12-*.png` の 6 枚（e2e E17 が出力） | — |

仕上げで直したもの:
1. **使い方**: 設定で人物像を OFF にしても「人物像（1〜5 点）と記入シート」のカードが人物像を使う前提のままだった → OFF のときはカードの先頭に「いまの設定では人物像を使いません」（`#helpPersonaOff`）、「結果（推奨）の決まり方」の 1 行にも同じ断り。その 1 行の不採用推奨の境界（40%）を設定から描く。e2e E17 (11) に 1 件（308 → 309 件）、E17 (13) に「ON では断りが無い・境界 40%」を足した
2. **スクリーンショット** `p12-step2-persona.png`・`p12-step2-questions.png`: sticky のトップバー・目次が要素の上端に重なり、「総評」の見出しが隠れていた。マウスのホバー（総合判断の「不採用」）と面接所見の入力欄のフォーカス枠も写っていた → e2e E17 の `shotEl17`（撮るあいだだけ sticky を外す・マウスを外す・要素の中のフォーカスを外す）
3. **単体 #96**: 移行の見本（新しい既定から組み立て直した直前の既定）に加えて、本物の c0d20ce の既定の台本（fixture `legacy-pre-persona.html` の `checklistDef`＝c0d20ce の config.default.js の台本そのもの）を持つ設定が移行され、設定全体が新しい既定とバイト単位で同じになることを確かめる（組み立て直した見本が実物とずれても気づける）
4. **docs**: 本書 11 章の名前（実装メモ → 実装時の差分）と目次の 2 行の記述（11-3。c0d20ce から 2 行）、`docs/SPEC-a4.md` 14 章の未入力の行のクラス（`s-n` → `s-0`）、README の e2e の E12 の満点（14／16 → 12／14）と件数、HANDOFF の決定事項に「P. 確認点 rt_manner の整理」

### 11-8. レビュー指摘の修正（2026-10-16。13 件）
仕上げのあとのレビューで確定した指摘を、最小の差分で直した。テストは緩めていない（期待値を書き換えたのは、直した CSS の文字列〔単体 #97〕と、常に真だった E12 の `manner` を外したことだけ。E8 dec39・E14 (4) は確かめる内容を足した）。各項目の「テスト」は直す前のコードで FAIL することを確かめた（単体は変異で、e2e はこの節の末尾。12 の E12 は外しただけなので対象外）。

| # | 指摘 | 直したこと | テスト |
| --- | --- | --- | --- |
| 1 | 使い方（`helpPersonaHtml`）と設定の人物像の節の説明が、人物像の項目名・目盛りの文言・結果の表示名を esc せずに HTML にしていた（設定の画面・JSON の読み込みから `<img onerror>` が入り、使い方・設定で実行された） | `helpPersonaHtml` の項目名・目盛りの文言・`resultTitle`・`capName` と、settings.js の人物像の節の説明（`psLabels`）を `esc` に通す | e2e E17 (13): 設定の画面で項目名に img → 使い方・② で実行されない・文字のまま。JSON の読み込みで短い名前・目盛りの文言・`texts.review.title` に img → 設定・使い方・② で実行されない |
| 2 | JSON で読み込んだ人物像の境界（`keepPct`・`rejectBelowPct`）が範囲外でも検証されずに判定に効いた（keepPct 500 で全部 5 点が上長最終判断要・100/100 で全部 4 点が不採用推奨） | `normalizePersonaDef`: 0 ≦ 不採用推奨 ＜ そのまま ≦ 100 でなければ 2 つとも既定（70/40）に戻す（結果の設定〔`onePointResult` など〕と同じく正規化で直す。設定画面は保存前の検証で止めるのは今までどおり）。保存済みの設定・記録の台本も同じ | 単体 #94（範囲外 8 組 → 70/40・範囲内 4 組はそのまま・`parseProfileJSON` の 500 で全部 5 点が採用推奨・100/100 で全部 4 点が採用推奨・記録の台本も）。e2e E17 (13)（読み込んだ 500 → 70） |
| 3 | rt_manner の移行が c0d20ce の既定だけを見ていて、2026-10-13〜14（6f32341〜95737b5）の版で保存した設定（質問・合否連絡・記入欄にも short が無い）は移行されなかった（確認点 7 項目・16 点満点のまま） | `isPrevDefaultScript`: short を 1 つも持たない台本は、short を全部外した直前の既定と比べる（`scriptSig(sections, true)`）。short を 1 つでも持つ台本は従来の比較だけ（質問の short を変えた台本は残す。1-6） | 単体 #96（c0d20ce の既定から short を全部外した台本 → 移行して設定全体が新しい既定と同じ・冪等・文言の変更／確認点の追加／質問の short を 1 つ足した台本は残す）。scratchpad の `p12b/fix/scripts/vers-migrate.js` で 6f32341〜c0d20ce の 11 版の既定（そのまま・その版の `normalizeProfile` で保存したもの、c0d20ce を経由したもの）がすべて移行することを確認 |
| 4 | 使い方の「結果（推奨）の決まり方」の人物像の 1 行が、1 点・未入力のときの設定を反映せず、同じページの「判定への反映」と食い違った | `helpPersonaRuleLi()`: 上長最終判断要まで下げる条件と不採用推奨にする条件を、`onePointResult`・`unscoredResult`・不採用推奨の境界から組み立てる（既定は従来と同じ文言） | e2e E17 (13)（既定の文言・1 点＝不採用推奨・未入力＝調整しない・60/30 で「人物像（1〜5 点）の合計が低いと、結果を上長最終判断要（合計が 30% 未満・1 点の項目があるなら不採用推奨）まで下げます（…）。」） |
| 5 | A4 の結果ストリップ: 最終合否の担当者名（氏名＋役職）が 18 文字前後で、結果「上長最終判断要」・人物像「未入力 3・1点あり」が「…」で切れた（c0d20ce では切れない） | `.cl-tiles.has-ps` の列を `minmax(min-content, …)` に（タイルは中身の幅より狭くならない）。`.cl-judge-main{flex-basis:0%;min-width:min-content}`・`.cl-decision{flex-shrink:1}`（タイルの中身が入らないときだけ最終合否欄が縮んで担当者名を「…」で切る。36% の上限はそのまま）。4 タイル（人物像なし）の規則は変えない | e2e E8 dec39（結果「上長最終判断要」・人物像「未入力 3・1点あり」・確認点「○3 △1 ×0 未入力2」と採用推奨の 2 つの状態 × 担当者名 4 種〔5・18・80・184 文字〕: タイルは切れない・36% 以下・用紙からはみ出さない・ストリップの高さ 58px・18 文字の担当者名は切れない）。単体 #97（CSS）。scratchpad の `p12b/fix/rv/m-strip.js`（総合判断 4 種〔採用・保留・不採用・未入力〕× 人物像 6 種 × 確認点 2 種 × 担当者名 6 種に、必須条件の未確認・不一致を足した 360 通り）で、直す前は 112 通りで切れ、直した後は 0。最終合否欄が直す前より狭くなったのは 3 通り（担当者名 23 文字以上で、もとから「…」）・新しく切れる担当者名は 0 |
| 6 | 記入シート ①: 「短期／長期の希望 □短期希望 □長期希望」が欄から 7.2px はみ出し、隣の欄の見出し「契約開始日の希望」とつながって見えた | `.pp-fields>div` に `flex-wrap:wrap`（見出しと □選択肢 が 1 行に入らない欄は □選択肢 を次の行へ。入る欄は 1 行のまま）。記入シートの高さは変わらない（白紙 933px・入力あり 916px・`pp-q3`） | e2e E17 (9)（白紙・① 入力ありとも記入欄の中身が欄の右端を越えない・「短期／長期の希望」は □選択肢 が見出しの下の行） |
| 7 | 使い方の人物像のカードが項目名を「・」でつなぎ、「7 項目（挨拶・身だしなみ・笑顔・表情・…）」が 8 項目に読めた | 「、」でつなぐ（D6・判定の理由と同じ） | e2e E17 (13)（「7 項目（挨拶、身だしなみ、笑顔・表情、声のトーン、目線、言葉遣い、志望動機）」） |
| 8 | ② の上部の案内が 1440px 未満で 2 段（ボタンだけの行。高さ 80px）・390px で 💡 だけの行 | `.cl-guide-t{flex:1 1 0;min-width:16em}`（文言は残りの幅で折り返し、ボタンと同じ行に並ぶ。文言が 16em 未満になるほど狭い画面だけボタンを次の行へ）。高さ 768〜1366px 61px（80px から）・390px 101px（131px から）・1440px 50px（1 行のまま） | e2e E17 (10)（1440px は 1 行・1280px はボタンが文言と同じ行・高さ 64px 以下・390px は 💡 と文言が同じ行でボタンは次の行） |
| 9 | 390px で人物像の凡例が「5 とても／良い」と語の途中で折り返した | 凡例を「点 意味」ごとの `span`（`white-space:nowrap`）にし、全角空白でつなぐ（`textContent` は従来と同じ） | e2e E17 (10)（390・1280・1440px で 5 つの span がどれも 2 行に割れない） |
| 10 | ダークモードで押下中の人物像のボタン・○△×・一致／不一致・総合判断の白字のコントラストが低い（2.0〜3.1:1） | トークン `--on-status`（ライト `#ffffff`・ダーク `#0b1220`。`:root[data-theme="dark"]` と `prefers-color-scheme: dark` の両方）を足し、押下中の `.seg-btn.active.{match,good,hire,fair,hold,mismatch,poor,reject}` と `.cl-ps-btn.active.s1/s2/s4/s5` の文字色に使う。ダークは 6.0〜9.2:1（ライトは白字のまま＝見た目は変えない） | e2e E17 (10)（data-theme と prefers-color-scheme のダークで 人物像 1〜5・○△×・一致・保留 が 4.5:1 以上・ライトは白字） |
| 11 | D19 の toast「保存時と人物像の項目が異なります」を確かめるテストが無く、11-7 の表は E17 (12) で確かめたことにしていた | テストを追加し、11-7 の表を直した | e2e E17 (12)（志望動機を外して「電話応対の丁寧さ」を足した設定で、7 項目すべて 4 点の保存 HTML を読み込む → toast「保存時と人物像の項目が異なります（追加 1・削除 1）。現在の項目で再判定します」・足した項目は未入力 → 上長最終判断要〔persona_unscored〕・記録の点はそのまま。既定の項目に戻すと出ない） |
| 12 | E14 (4) の全メモの窓の期待値で、確認点のメモの行（`rt`）の期待値が `notes['rt']`（undefined）になり、しかもその分岐を通る記録が無かった。E12 の `!cl12.manner` は常に真 | E14 (4): 記録に確認点のメモ（`rn`）を入れ、`rt` の期待値を「番号＋短い名前：メモ」を台本順に 1 行ずつ（記録の `checklistDef` と `notes` から組み立て）に。行に `rt` があること・見出し「確認点のメモ」・行数（6＋足した確認点）も確かめる。E12 の `manner` は外した（削除したのが rt_turnover になったので、その確認は `turnover`） | e2e E14 (4)・E12 |
| 13 | storage.js に確認点のメモの列（`.cl-rt-nt`）を扱う死んだコード（CSS・`markTargets` のセレクタ・`memoOf` の `tr` の分岐）と誤ったコメント「旧い保存 HTML 用」 | 3 か所を削除・コメントを直した。`clFitSheet` の `.cl-nm-v,.cl-rt-nt` は D12（単体 #93 の疑似 DOM）のため残す | 単体 #97（CSS に `.cl-rt-nt` が無い・保存 HTML に `tr[data-cl-item]` の分岐と `".cl-nm-v,.cl-rt-nt"` が無い） |

テスト件数: 単体 37 件（件数は同じ。#94・#96・#97 に確認を足した）・e2e E1〜E17・317 件（309 件から、E17 に 8 件〔(9) 記入欄・(10) 案内と凡例・ダークのコントラスト・(12) D19 の toast と既定に戻したとき・(13) 項目名の区切りと決まり方・設定を変えたときの決まり方・XSS と境界〕を足した。E8 dec39・E14 (4)・E12 は同じ件数で確かめる内容を足した）。e2e の変異（scratchpad の作業コピーで 1・2・4〜11 の修正をまとめて直す前に戻し、確認点のメモの窓を改行でなく空白でつなぐ変異を足した版）: 317 件中 12 件が FAIL（E8 dec39・E14 (4) の 2 件・E17 (9) 記入欄の 2 件・E17 (10) 案内と凡例・ダークのコントラスト・E17 (12) D19 の toast・E17 (13) の 3 件・ERRORS〔img の読み込みの失敗〕）。足した・書き換えた確認はすべて FAIL し（D19 の「既定に戻すと出ない」は否定の確認なので PASS のまま）、ほかの 305 件は PASS。3 と 2 の正規化・13 は単体の変異で確かめた（#94・#96・#97 が FAIL）

### 11-9. 補完（2026-10-16。照合で見つかった抜け 9 件）
11-8 のあとの照合（副支配人の選択・P1〜P10・フィードバック ①〜③ と実装・使い方・README の突き合わせ）で見つかった抜けを、最小の差分で埋めた。テストは緩めていない。期待値を書き換えたのは、直した表示・文言（E17 (1)(2) の人物像の状態の表示・(1) の総合判断の説明・(13) の「1 対 1」）と、② の回答が無い導入前の記録の `normalizeRecord` の結果（単体 #96。`null` を確かめていた 3 行は、② の回答がある記録で `null` を確かめる形に置き換えた）だけ。

| # | 抜け | 直したこと | テスト |
| --- | --- | --- | --- |
| 1 | 人物像の導入前に ① だけ保存した記録（② の回答なし）を面接の日に読み込むと、`normalizeRecord` が `null`（導入前の記録）にして、これから行う面接でも人物像を入力できなかった（記入シートには人物像の行が出るので、紙で丸を付けても転記する場所が無い。保存し直しても `null` のまま） | `normalizeRecord`: persona のキーが無い記録は、記録の台本に人物像がある**か、② の回答がまだ無い**（`!R.checklistHasInput`）とき `{}`。② の回答（○△×・一致／不一致・説明のチェック・メモ・総合判断のどれか）がある導入前の記録は従来どおり `null`（保存時の判定を変えない。D2・P2）。① の入力（面接日・担当・求人・タクシー）は回答に数えない。② で評価し直す v1（checklist なし）も `{}`。明示の `null`・壊れた値は従来どおり `null` | 単体 #96（② の回答 4 種 × 台本の人物像なし／台本なしで `null`・① だけ・回答なし・v1・`normalizeRecord(null)` で `{}`・明示の `null` は回答が無くても `null`・fixture を ① の段階に戻した記録 → `{}`・未入力 7 で上長最終判断要〔persona_unscored〕・全部 4 で採用推奨・保存し直しても `{}`）。e2e E17 (12)（fixture を ① の段階に戻した保存 HTML を読み込む → 導入前の toast・注記なし・② に人物像 7 行・記入シートも 7 行・点を入れて採用推奨〔5 タイル〕・保存し直して読み込んでも点が残る） |
| 2 | 使い方の「（1 対 1 でなくても回せます）」がフィードバック ①（1 対 1 でなければ面接しながらの運用は苦慮・1 対 1 ならメモを活用すれば問題ない）・README と逆の案内（本書 6-3 が由来） | 「1 対 1 の面接なら、質問の回答などはメモ欄に書き、…面接のあとでまとめて入力できます。1 対 1 でない面接は、面接しながらアプリに入力するのが難しいので、記入シート（手書き用。下）に書いて、面接のあとでアプリに転記してください。」（フィードバック ②）。README の記入シートの節の末尾も同じ趣旨に | e2e E17 (13)（新しい 2 文・「1 対 1 でなくても」が無い） |
| 3 | ① で面接日を消しても記入シートに今日の日付が印字され、印刷すると記録の面接日が今日で書き戻された（① の欄・右サマリーは空のまま＝画面と記録が食い違う）。面接日を手書きにする白紙を作れなかった | `preparePaperSheet` は `fillChecklistDefaults()` をやめて `ensureChecklist()` だけ（印刷で記録を書き換えない）。① の面接日が空なら記入用の線（前もって刷っておく白紙）。② を開いたとき面接日を今日で埋めるのは従来どおり（`renderStep`。画面に出ているとおりに印字） | e2e E17 (9)（既定は今日の日付を印字・① で面接日を空にすると線・印刷の前後で記録・① の欄・右サマリーの面接日は空のまま・白紙の PDF〔p12-paper-sheet.png〕は面接日も線） |
| 4 | ② の総評: 総合判断の説明が固定文「人物像の合計・1 点の項目で結果が下がることがあります。」（既定で結果を下げる「未入力」に触れない・1 点を「調整しない」にしても出る）。人物像の状態の表示は、未入力なら灰「未入力 n」だけ（そのまま ③ に進むと上長最終判断要になることが分からない）、1 点の項目があっても合計が 70% 以上なら緑「70% 以上」（すぐ下の警告と色の意味が逆。p12-step2-persona.png がこの状態） | 説明は使い方の「結果（推奨）の決まり方」の 1 行と同じ文を設定から組み立てる（`personaRuleText()` を共用。既定「人物像（1〜5 点）の合計が低い・1 点の項目がある・未入力があると、結果を上長最終判断要（合計が 40% 未満なら不採用推奨）まで下げます。」）。状態の表示は人物像で下がる結果の上限（未入力・合計・1 点のうちいちばん低いもの。設定で「調整しない」のものは数えない）: 琥珀「上長最終判断要まで」・赤「不採用推奨」、未入力があれば前に「未入力 n・」。下がらなければ緑「70% 以上」（全部入力）・灰「未入力 n」 | e2e E17 (1)（既定の説明・入力前は琥珀「未入力 7・上長最終判断要まで」）・(2)（「未入力 6・上長最終判断要まで」）・(4)（1 点ありで 71% → 琥珀「上長最終判断要まで」・緑にしない）・(13)（1 点＝不採用推奨・未入力＝調整しない・60/30: 説明がその設定の文・全部 4 は緑「60% 以上」・1 項目を未入力に戻すと灰「未入力 1」・1 点を入れると赤「未入力 1・不採用推奨」と警告「…結果は不採用推奨になります。」） |
| 5 | 使い方のほかの箇所: ステップ 3「「A4 で印刷」で 1 枚（結果・必須条件・確認点・面接メモ・押印）」に人物像が無い／「Step① と Step② の上部の「🖨 記入シート（手書き用）」」（① のボタンはカードの下の操作行で、上部ではない）／設定のカード「面接チェックリスト（台本の文言・項目・確認点）」に人物像が無い | ステップ 3「（結果・必須条件・確認点・人物像・面接メモ・押印）」／「Step① の「🖨 記入シート（手書き用）」（カードの下、「面接チェックリストへ進む →」の左）か、Step② の上部の同じボタンで…」／「面接チェックリスト（台本の文言・項目・確認点・人物像）」。② の「🖨 面接チェックリスト報告（A4）」の title にも人物像を足した | e2e E17 (13)（3 か所の文言・古い文言が無い）・(1)（① のボタンはカードの下で「進む」の左＝使い方の説明どおり） |
| 6 | ② の 1 枚目の前書き「必須条件と報連相の意識・具体性を確認。最低限の話し方、敬語が可能か。…」が残り（台本の文言は変えない＝1-2）、確認点から外した話し方・敬語をどこで付けるのか ② では分からない | 前書きの下に 1 行「→ 話し方・敬語は確認点ではなく、最後の総評の人物像（接客）「言葉遣い・説明のわかりやすさ」で 1〜5 点を付けます。」（`clLeadPsHtml`。前書きが話し方・敬語に触れ、確認点に話し方・敬語の項目が無く〔rt_manner を残した台本では出さない〕、人物像に言葉遣いの項目〔`ps_speech`、無ければ項目名に言葉遣い・敬語〕があるときだけ。人物像を使わない記録・OFF では出さない）。使い方の rt_manner の行にも「台本 1 枚目の前書きにある話し方・敬語は、この人物像の項目で付けます」 | e2e E17 (1)（1 枚目の前書きの直後にだけ出る・2 枚目には出ない）・(13)（使い方） |
| 7 | README の記入シートの説明「（① に入れた氏名・区分/年齢/性別・面接日・…。空なら記入用の線・□）」が区分・年齢・性別（空なら何も出さない）と面接日（3 のとおり空にならなかった）に当てはまらない | 実装（本書 5-2・D15。空の氏名は線＋「さん」だけ）に合わせて README を直した: 空の氏名・面接日・担当・タクシー可否・料金は記入用の線、未選択の求人は □通常求人 □短期求人、区分/年齢/性別は入力があるときだけ氏名の横（空なら欄も出さない）。面接日は ① の欄のとおり（3 で空にできるようにした。前もって刷る白紙の作り方も README に） | —（文書。3 のテストで面接日の線を確かめる） |
| 8 | 人物像のタイルが無い 4 タイルの結果ストリップで長い担当者名を確かめる e2e が無くなっていた（c0d20ce の E8 dec39 は 4 タイルを見ていた。最終合否欄の上限 48% → 36% と `.cl-judge-main`／`.cl-decision` の flex〔11-8 の 5〕は 4 タイルにも効く） | E8 dec39 に 4 タイルの 3 状態（人物像の導入前の記録＝`persona: null` の採用推奨・上長最終判断要、設定で人物像を OFF の上長最終判断要）× 担当者名 4 種（5・18・80・184 文字）の 12 通りを足した（5 タイルの 8 通りは従来どおり） | e2e E8（4 タイル: タイルは「…」で切れない・最終合否欄は 36% 以下・用紙からはみ出さない・最終合否欄とタイルの間 5px 以上・ストリップ 58px・18 文字の担当者名は切れない・5 文字より 80 文字の担当者名の欄が広い） |
| 9 | 記入シートの印刷を本物の `window.print`（印刷ダイアログ）で通していなかった（E17 (9) はスタブ、PDF は `preparePaperSheet(true)`＋`page.pdf`） | 実装は変えていない。ヘッドレスの Chromium の本物の `window.print`（スタブなし。ダイアログを出さずに beforeprint → afterprint を送る）で通した: beforeprint の時点の印刷ホストは記入シート（beforeprint の自動切替で報告書に替えない・氏名は線）・afterprint で片付け・判定は走らない・面接日は変わらない。afterprint が来ないとき（スタブ）は 3 秒で片付け、前の印刷の 3 秒のタイマーが次の印刷の用紙を消さない（`afterPrintOnce` の 1 回だけ）ことを `page.clock` で確かめた。用紙の設定は `page.pdf` の引数で代用した（scratchpad `p12c/look/print2.js`）: CSS の用紙（A4 縦・余白 0）・A4・倍率 90%・背景なしは 1 ページ、Letter は 1 ページのまま下端（約 18mm）が切れる。`page.pdf` の余白の指定（10mm）は CSS の `@page` の余白 0 が優先されて出力が変わらず、実機の「余白: 最小／カスタム」の代わりにはならない。**実機の印刷ダイアログは未確認のまま**（下の手順） | e2e E17 (9) 2 件（本物の window.print の経路・3 秒の片付けと 1 回だけ） |

実機（Edge / Chrome）の印刷ダイアログで確かめること（ヘッドレスでは確かめられない。報告書の印刷も同じ仕組み）:
1. ① の「🖨 記入シート（手書き用）」→ 印刷プレビューが A4 縦 1 枚（2 枚目が無い）・罫線と □ が出る（用紙 A4・余白「デフォルト」・倍率 100%）
2. 印刷プレビューを 3 秒以上開いたままにしてから印刷・PDF に保存しても、記入シートが出る（白紙・報告書にならない）。`window.print` がダイアログの間スクリプトを止めない環境では、3 秒の片付けが先に走るため
3. キャンセルで閉じると画面は元のまま（① の入力・面接日が変わらない。印刷用の用紙が画面に残らない）
4. ② の上部の同じボタン、③ の「🖨 A4 で印刷」（報告書）も 1〜3 と同じ
5. 余白「最小」「カスタム」・倍率「ページに合わせる」にしたときに 1 枚に収まるか（収まらなければ README の「余白はデフォルト・倍率 100%」の案内のまま運用する）

テスト件数: 単体 37 件（件数は同じ。#96 に確認を足した）・e2e E1〜E17・326 件（317 件から、E8 に 4 タイル 1 件、E17 に (1) 前書きの注記 1 件・(9) 面接日 1 件と本物の印刷 2 件・(12) ① だけ保存した導入前の記録 1 件・(13) 「1 対 1」1 件・使い方のほかの箇所 1 件・② の説明と状態 1 件の 9 件）。
変異（各項目のテストが直す前のコードで FAIL すること）: scratchpad の作業コピー `p12c/mutA`（src を補完の前に戻し、4 タイルの列を `minmax(0,0.6fr) repeat(3,minmax(0,1fr))` に・`afterPrintOnce` の 1 回だけの印を外した版）で e2e 326 件中 13 件が FAIL（E8 の 4 タイル・E17 (1) の総合判断の説明と前書きの注記と入力前の状態・(2)・(4)・(9) の面接日の線 2 件と 3 秒の片付け・(12) の ① だけ保存した記録・(13) の 3 件）、ほかの 313 件は PASS。`p12c/mutB`（3 秒の片付けを外した版）は (9) の 3 秒の 1 件だけ FAIL。(9) の本物の window.print の確認と同じ手順（scratchpad `p12c/look/real17.js`）は、beforeprint の自動切替が記入シートを報告書に替える変異（`p12c/mutC`。beforeprint の `print-checklist` の条件を外す）で FAIL する（スタブで印刷する従来の確認では捕まらない）。単体 #96 は直す前の `normalizeRecord` で FAIL（「① だけ保存した導入前の記録」）。
