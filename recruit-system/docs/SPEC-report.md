# 詳細仕様書（確定版）: 報告書表示と最終合否スタンプ（フェーズ5）

> 2026-10-14 の面接特化（docs/SPEC-slim.md）で、詳細モード・初期対応者・旧 10 項目評価・レポート全体印刷に関する記述は無効。
> 2026-10-14 に保存 HTML を A4 縦 1 枚へ変更（docs/SPEC-a4.md）。報告書表示／詳細表示の切替・`#clPaper`／`#clSheet`（保存 HTML）・`#mgmt`／`#decision`・「A4 で印刷（1 ページ）」・'section' モード・押印欄の件数による上限（`checklistSheetLimit`）の記述は無効。保存 HTML は用紙 `main.a4#a4` 1 枚で、押印・最終合否は用紙の欄を直接クリックして押す。

- 対象: `recruit-system/`（ブランチ `claude/toho-shinjuku-hiring-app-quhjtc`。直前コミット 6f32341 = フェーズ4完了。**commit / push はしない**）
- 根拠: ユーザー決定 D1〜D12（下記 0-2 に要約。変更不可）
- 前提資料: `docs/SPEC-checklist.md`（4 章: A4 報告 `checklistSheetHtml`・`body.print-checklist`）、`docs/HANDOFF.md`（7〜10 章: 押印・申し送りシート・改ページ・チェックリスト）
- 実装者は本書だけを見て実装する。id・class・profile キー・data-bind パス・既定値・文言・テストの expect 文言は本書の値で実装する

## 運用フロー（本フェーズの目的）

1. 面接者がアプリで面接チェックリストを入力・判定し、Step4 の押印欄「面接対応者」に電子印を押して「保存（HTML）」→ 社内スレッドに添付
2. 副支配人がその HTML をブラウザで開く（**常に「報告書」表示**＝A4 の面接チェックリスト報告の紙プレビュー＋「最終合否・押印」パネル）
3. 担当者（自分）を選んで「採用」または「不採用」を押す → 合否スタンプが押され、押印欄「最終確認」が未押印なら同じ担当者の電子印も自動で押される → 「押印を保存」で再出力（ファイル名の末尾に `_採用` / `_不採用`）→ スレッドに添付
4. 再出力ファイルをアプリの「読み込み」で開いても、合否・押印はすべて引き継がれる

---

## 0. 方針

### 0-1. 変えないもの
- 単一 HTML／IIFE・ES5 寄り／外部ライブラリなし。`rules.js` は触らない（合否は判定エンジンの外の「人の決定」）
- `schemaVersion: 2`（`record.decision` を足すだけ。旧レコードは decision 無しとして読める）
- 既存の見出し（h2「応募時の情報」「面接者への申し送りコメント」「面接者への申し送り（留意点）」「面接前に分かっている情報（未確認）」「面接で確認した情報」「シフト貢献度」「面接評価」「採用可否判定」「応募者の管理」）、`section.sec[data-sec=...]` のキー、既存 id（`#mgmt #mgmtSave #mgmtSaveMsg #mgmtSaveBtn #rtPrintSheet #rtPrintChecklist #rtPrintAll #clSheet #recruit-record #recruit-mgmt-config`）、`window.__prepareHandoffSheet` / `window.__prepareChecklistSheet`
- 印刷モードと **印刷用 CSS（`@media print` の既存規則）**: `body.print-handoff`（申し送りシート A4 1 枚）、`body.print-checklist`（面接チェックリスト報告 A4 1〜2 枚）、無印（レポート全体）。本フェーズの画面用 CSS はすべて `@media screen` に閉じる
- `.cl-judge` の外側 class は `class="cl-judge"`（単体 #66 が文字列 `class="cl-judge"` を検証）／`<ul class="cl-adj"><li><b>…` の形（単体 #66 の正規表現）
- 既存テストは変更しない（追加のみ）。担当者名簿の実名は「笹川 晴央」以外を src・dist に入れない

### 0-2. ユーザー決定（D1〜D12 の要約）
| # | 内容 |
| --- | --- |
| D1 | 保存 HTML は常に「報告書」表示で開く。チェックリスト回答あり → A4「面接チェックリスト報告」の紙プレビュー＋その下に「応募者の管理」節（最終合否パネル＋押印欄）だけ。回答なし → 申し送りシート相当（pre/comment/handoff/interview/mgmt の節）。ツールバーに「報告書」「詳細」（`#rtViewReport` / `#rtViewFull`、`body.view-report` / `body.view-full`）。表示は localStorage に保存しない。印刷 3 種は表示に依存しない |
| D2 | `stamp.js` に純関数 `verdictSvg(opts)`（角丸長方形・二重枠・太字ゴシック・下に日付・-3°・feTurbulence のにじみ・`class="verdict-stamp"`・`role="img"`・`aria-label`）。採用 朱 `#c8232c`／不採用 藍 `#1f4e8c`。`RecruitStamp.verdict` で公開し `source()` に含める |
| D3 | `record.decision = { result:'hire'\|'reject', label, date:'YYYY.MM.DD', at:ISO, by:{ name, short, title } }`（無いときは null）。state・buildRecord・applyRecord・parseRecordFromHTML で往復。不正値は null |
| D4 | `profile.management.decision`（既定値は 1-3）。normalizeProfile で補完。設定画面 s-mgmt に項目 |
| D5 | 押す場所 2 か所: (a) 保存 HTML の「最終合否」パネル `#decision`、(b) アプリ Step4 の `#decisionCard`。autoStampFinal で最終確認欄も押す。合否ありの再出力ファイル名は `基本名_採用.html` / `基本名_不採用.html` |
| D6 | 合否スタンプの表示: (1) A4 報告の【判定サマリー】の右端 `.cl-decision`（sheet のみ）、(2) 保存 HTML のパネル、(3) Step4 カード、(4) 全体レポートのヘッダー `.rh` の判定バッジの横（小） |
| D7 | 合否は判定とは独立。再判定で消えない。「取消」でだけ消える。食い違いは注記 1 行のみ（止めない） |
| D8 | mgmt-note・README・HANDOFF に運用フロー |
| D9 | 業務ツールらしい落ち着いた見た目。ダークでも紙は白地。1280/1440px で崩れない。390px は紙だけ横スクロール可 |
| D10 | 単体（normalize・往復・verdictSvg・不正値）、e2e E30・E31、既存全件緑・console error 0 |
| D11 | 本書・HANDOFF 11 章・README |
| D12 | `node build.js` が通る |

### 0-3. 本書で決めた点（設計判断。理由つき）
- **X1 紙プレビューは `#clSheet` とは別の要素 `#clPaper`**。e2e E27 が「保存レポートを画面で開いたとき `#clSheet` は display:none」を検証し、E27 の print-checklist 印刷で `.page > *` の見える要素が `clSheet,mgmt` だけであることも検証しているため。`generateReportHTML` は `checklistSheetHtml(..., {mode:'sheet'})` を 2 回描く（`#clPaper` = 画面用、`#clSheet` = 印刷用。後者は従来どおり）。`.cl-decision` の id は `#clPaper` 側 `clPaperDecision`、`#clSheet` 側 `clDecision`（D6 の「#clSheet 内は id="clDecision"」）。紙プレビュー（`.paper-wrap`）は `.page` の直下に置くので、既存の `body.print-checklist .page>:not(#clSheet):not(section[data-sec="mgmt"])` で印刷から自動的に外れる
- **X2 報告書表示の CSS はすべて `@media screen`、かつ `body:not(.print-checklist):not(.print-handoff)` に限定**。`__prepareChecklistSheet(true)` は画面上で `#clSheet` を画面外 190mm 幅に置いて 1 ページ目の高さを測る（`.cl-fit` の判定）。報告書表示の「隠す」規則がこの間も効くと `#clSheet` が隠れて高さ 0 になり判定が狂うため、印刷準備中は報告書表示の規則を外す
- **X3 報告書表示（チェックリスト回答あり）のまま印刷すると「面接チェックリスト報告」になる**（D1 の「望ましい」）。`beforeprint` で `print-*` クラスが無ければ `prepCl(true)`、`afterprint` で戻す。「レポート全体」ボタンは表示に関係なく全体を印刷する（`printingAll` フラグで beforeprint の切替を抑止）。**注意: Playwright の `page.pdf()` も beforeprint/afterprint を発火する（Chromium で確認済み）**。このため既存 E24 の「レポート全体の PDF ≤ 6 ページ」は報告書表示で開いたファイルに対して実行され、PDF は面接チェックリスト報告（1〜2 枚程度。印刷メディアのエミュレート中に計測するため `.cl-fit` の判定が画面と異なりうるが、≤ 6 は必ず満たす）になる（E24 の全 expect はそのまま成立する。テストは変更しない）。全体レポートの「6 ページ以内」は **E31 で「詳細」表示から検証し直す**（3〜6 ページ）。回答なしの記録は beforeprint で切り替えない（従来どおり全体）
- **X4 ファイル名の検証は `body[data-filename]` と再出力 HTML の `data-filename`** で行う。file:// のページから blob をダウンロードすると Playwright の `suggestedFilename()` は `'download'` になる（確認済み。既存 E22 も `|| 'download'` を許容している）
- **X5 「取消」は合否だけを消す**。自動で押した「最終確認」の印は残す（押印は押印欄の「取消」で消す。操作の対象を 1 つに絞り、誤操作で押印まで消えないようにする）
- **X6 合否の描画・ファイル名は `stamp.js` の純関数 3 つに 1 か所化**（`verdictSvg` / `decisionSheetHtml` / `decisionFilename`）。アプリ・storage・保存 HTML の埋め込みスクリプトが同じ関数を使う（`source()` で埋め込み）
- **X7 A4 報告の高さを増やさない**: `.cl-decision` は【判定サマリー】見出し＋タイルの右に置き（`.cl-judge-row`）、`.cl-adj` は全幅のまま下に置く。スタンプは幅 64px（高さ 41px）でタイル（約 45px）以下。未押印でも点線枠を出す（高さはタイル以下）
- **X8 色は設定値（hireColor / rejectColor）、文字は記録時の `decision.label`**（設定で表示名を変えても過去の記録は当時の文言）
- **X9 `decision.enabled=false`** のとき: 合否の UI（パネル・カード・`.cl-decision`・ヘッダー・サマリー・ファイル名の接尾辞）を一切出さない。`record.decision` は消さずに往復する（データは保持）
- **X10 食い違い注記の条件**: (合否=採用 かつ 判定=reject) または (合否=不採用 かつ 判定=recommend)。上長最終判断要（review）や判定なしでは出さない。文言 `※ アプリの判定「{判定の title}」と異なる最終合否です（記録はそのまま残ります）。`
- **X11 印刷時の最終合否パネル**: 未押印のパネルは印刷しない（全体印刷のページ数を増やさない＝E24/E31 の 6 ページ）。`print-checklist` では `.cl-decision` が代わりに出るのでパネルは出さない。`print-handoff`（A4 1 枚の保証）でもパネルとヘッダーの合否は出さない。全体印刷では押印済みのときだけ操作部品を除いて出す
- **X12 保存 HTML はライトテーマ固定**（既存方針。`reportCss` の `color-scheme:light`）。ダークモードでも紙・パネルとも明るいまま。アプリ（styles.css）はトークンでダーク対応
- **X13 合否スタンプの副文 `sub`** は劇場名から「TOHOシネマズ」を除いたもの（新宿 → `新宿`）。日付の後ろに小さく入る

---

## 1. データモデル

### 1-1. `record.decision`（D3）
```js
decision: {
  result: 'hire' | 'reject',
  label: '採用' | '不採用',          // 押した時点の表示名（設定 hireLabel / rejectLabel）
  date: '2026.10.10',               // RecruitStamp.stampDate（YYYY.MM.DD）
  at: '2026-10-10T00:00:00.000Z',   // ISO
  by: { name: '笹川 晴央', short: '笹川', title: '副支配人' }
} | null
```
- `buildRecord(state)` は常にキー `decision` を書く: `decision: normalizeDecision(state.decision)`（無ければ `null`）。位置は `management` の直後
- `parseRecordFromHTML(html)` は返す前に `rec.decision = normalizeDecision(rec.decision)`（キーが無い旧レコードも `null` になる）
- `schemaVersion` は 2 のまま

### 1-2. `normalizeDecision(d)`（storage.js。export `RecruitStorage.normalizeDecision`）
| 入力 | 結果 |
| --- | --- |
| オブジェクトでない／`result` が `'hire'`・`'reject'` 以外 | `null` |
| `by` がオブジェクトでない、または `String(by.name).trim()` が空 | `null`（押した人のいない決定は無効） |
| `label` が文字列でない／trim 後に空 | `result` に応じ `'採用'` / `'不採用'` |
| `date` が `/^\d{4}\.\d{2}\.\d{2}$/` に一致しない | `''` |
| `at` が文字列でない | `''` |
| `by.short` が空 | `global.RecruitStamp ? RecruitStamp.shortName(by.name) : by.name`（既存の名簿正規化と同じ書き方） |
| `by.title` | 文字列化して trim（無ければ `''`） |
| その他のキー | 捨てる |

戻り値は `{ result, label, date, at, by: { name, short, title } }`（新しいオブジェクト）。冪等。

### 1-3. `profile.management.decision`（D4。config.default.js の `management` に追加）
```js
decision: {
  enabled: true,
  label: '最終合否',
  hireLabel: '採用',
  rejectLabel: '不採用',
  hireColor: '#c8232c',
  rejectColor: '#1f4e8c',
  stampField: 'final',       // 連動する押印欄の id（'' = 連動しない）
  autoStampFinal: true,      // 合否を押したとき stampField の欄が未押印なら同じ担当者の印も押す
  filenameSuffix: true,      // 合否ありの保存ファイル名に _採用 / _不採用 を付ける
  hint: '最終確認者が合否を決めて押します'
}
```
正規化（`storage.js` の `fillArrays` 内、`mg.allowFreeName = ...` の直後。`mg.fields` 確定後に行う）:
- `mg.decision` がオブジェクトでなければ既定値のコピー
- `enabled` = `!== false`／`autoStampFinal` = `!== false`／`filenameSuffix` = `!== false`
- `label`・`hireLabel`・`rejectLabel`: 文字列で trim 後が空でなければ trim 値、そうでなければ既定
- `hint`: 文字列ならそのまま、そうでなければ既定
- `hireColor`・`rejectColor`: `/^#[0-9a-fA-F]{6}$/` に一致しなければ既定
- `stampField`: 文字列でなければ既定（`'final'`）。空でない値が `mg.fields` の id に無ければ、`'final'` が fields にあれば `'final'`、無ければ `''`
- 未知のキーはそのまま残す（冪等性のため削除も追加もしない）
- 旧プロファイル JSON（decision なし）も `deepMerge` と上記で既定が入る

### 1-4. `decisionConfig(profile)`（storage.js。export `RecruitStorage.decisionConfig`）
正規化前の profile（単体テストの `P()` 等）でも使えるよう、既定値に `profile.management.decision` を `Object.assign` し、1-3 と同じ規則で値を整えたコピーを返す。加えて:
- `sub`: `String(profile.meta.theaterName || '').replace(/^TOHOシネマズ\s*/, '').trim()`（新宿 → `'新宿'`）

アプリ（Step4・保存）、`checklistSheetHtml`、`generateReportHTML`、設定のプレビューはすべてこれを使う。

### 1-5. `validateProfile` の追加（`validateChecklist(p, errors, warnings)` の直後・return の前）
```
const dc = (p.management || {}).decision;
if (U.isObj(dc) && dc.enabled !== false) {
  hl = asStr(dc.hireLabel).trim(), rl = asStr(dc.rejectLabel).trim()
  !hl || !rl → errors.push('最終合否の「採用」「不採用」の表示名を入力してください。')
  hl === rl  → errors.push('最終合否の「採用」と「不採用」の表示名が同じです。')
  dc.stampField が空でなく management.fields の id に無い → warnings.push('最終合否と連動する押印欄が見つかりません。')
}
```

---

## 2. stamp.js（純関数。D2・X6）

ファイル冒頭コメントを「日付印（ハンコ）と最終合否スタンプの SVG」に更新。追加する 3 関数は **ES5（var・function 式。アロー・const・let・テンプレート文字列禁止）**、外部参照なし（`decisionSheetHtml` が同じ `source()` 内の `verdictSvg` を呼ぶことだけ許す）。関数本体のコメントに「`</script`」「`<!--`」「`<script`」を書かない（`toString()` で HTML に埋め込まれるため）。

### 2-1. `verdictSvg(opts)` → SVG 文字列
- `opts`: `{ label, date, color, size, id, sub }`。既定 `label='採用'`, `date=''`, `color='#c8232c'`, `size=120`（幅 px）, `sub=''`, `id='vd' + 文字数 + 日付の数字`（stampSvg と同じ作り方）
- 内部に `esc`（stampSvg と同じ実装）と `units`（ASCII・半角カナ 0.62em、それ以外 1em）を持つ
- 出力（`W = size`, `H = Math.round(size * 76 / 120)`。属性の順はこのとおり）:
```
<svg class="verdict-stamp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 76" width="W" height="H" role="img" aria-label="LABEL DATE[ SUB]">
 <defs><filter id="ID" x="-10%" y="-10%" width="120%" height="120%">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>
 </filter></defs>
 <g filter="url(#ID)" transform="rotate(-3 60 38)" opacity="0.93">
  <rect x="6" y="6" width="108" height="64" rx="9" fill="none" stroke="C" stroke-width="3.2"/>
  <rect x="11" y="11" width="98" height="54" rx="6" fill="none" stroke="C" stroke-width="1.2"/>
  <line x1="18" y1="50" x2="102" y2="50" stroke="C" stroke-width="1"/>
  <g fill="C" font-family="'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','YuGothic',Meiryo,'Noto Sans JP',sans-serif" font-weight="800" text-anchor="middle">
   <text x="60" y="42.5" font-size="FS" letter-spacing="LS"[FIT]>LABEL</text>
   <text x="60" y="61" font-size="10" letter-spacing="0.4"[FIT2]>DATE[ SUB]</text>
  </g>
 </g></svg>
```
  （実際は改行・インデントなしで連結。`aria-label` は `label + ' ' + date + (sub ? ' ' + sub : '')` を trim してエスケープ）
- 文字の大きさ: `units(label)` ≤ 2 → FS 28・LS 4／≤ 3 → 24・2／≤ 4 → 20・1／それ以上 → 18・0。`units*FS + LS*(文字数-1)` が 88 を超えるときだけ `textLength="88" lengthAdjust="spacingAndGlyphs"`
- 下段（日付＋副文）: `units(text)*10` が 86 を超えるときだけ `textLength="86" lengthAdjust="spacingAndGlyphs"`。日付も副文も空なら下段の `<text>` と `<line>` を出さない
- すべての可変値は `esc` する。class に `hanko` を含めない（既存テストのハンコ数え上げに混ざらないように）

### 2-2. `decisionSheetHtml(dec, o)` → `.cl-decision` 要素の HTML（外側の div を含む）
- `dec`: 正規化済みの decision または null。`o`: `{ id, svgId, title, hireLabel, rejectLabel, hireColor, rejectColor, sub, size }`（既定 `title='最終合否'`, `size=64`, `svgId=(o.id || 'cl') + 'Svg'`）
- 未押印（`!dec || (dec.result !== 'hire' && dec.result !== 'reject')`）:
```
<div class="cl-decision is-none" id="ID" data-result=""><div class="cl-dec-empty"><span>TITLE</span><span>未押印</span></div></div>
```
- 押印済み（`C` = hire なら hireColor、reject なら rejectColor。`L` = `dec.label` が空なら hireLabel / rejectLabel）:
```
<div class="cl-decision is-hire|is-reject" id="ID" data-result="hire|reject">
 <div class="cl-dec-stamp">{verdictSvg({ label:L, date:dec.date, color:C, size:o.size, id:o.svgId, sub:o.sub })}</div>
 <div class="cl-dec-meta">
  <span class="cl-dec-kv"><span class="cl-dec-k">TITLE</span><b class="cl-dec-v">L</b></span>   ← 2026-10-19 から style="color:C" を付けない（文字は用紙の CSS の意味の色 .cl-decision.is-hire／.is-reject。C はスタンプの絵だけ。docs/SPEC-flow.md 16-10）
  <span class="cl-dec-by">氏名（役職）</span>   ← by.title が空なら「氏名」だけ。by.name が空なら span ごと省略
  <span class="cl-dec-date">DATE</span>
 </div></div>
```
- `o.id` が空なら id 属性を出さない。すべてエスケープ

### 2-3. `decisionFilename(fn, dec, o)` → ファイル名（D5）
- `o`: `{ filenameSuffix, hireLabel, rejectLabel }`
- 手順: ① 拡張子（`/\.html?$/i`、無ければ `.html`）を外して基本名に ② 基本名の末尾が `'_' + clean(x)` のものを 1 回だけ外す（x は `'不採用'`, `'採用'`, `o.rejectLabel`, `o.hireLabel` の空でないもの。長い順に試す。正規表現の特殊文字はエスケープ） ③ `o.filenameSuffix !== false` かつ dec の result が hire/reject なら `'_' + clean(dec.label || 既定ラベル)` を付ける ④ 拡張子を戻す
- `clean(s)` = `String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_')`（`storage.safeName` と同じ文字を置換。長さは切らない）
- 冪等: `F(F(x,d,o),d,o) === F(x,d,o)`

### 2-4. 公開名と `source()`
```js
global.RecruitStamp = {
  svg: stampSvg, render: render, stampDate: stampDate, shortName: shortName,
  verdict: verdictSvg, decisionSheet: decisionSheetHtml, decisionFilename: decisionFilename,
  source: function () { return [stampSvg, shortName, verdictSvg, decisionSheetHtml, decisionFilename].map(function (f) { return f.toString(); }).join('\n'); }
};
```
埋め込みスクリプト側では関数名 `stampSvg / shortName / verdictSvg / decisionSheetHtml / decisionFilename` で呼ぶ。埋め込みスクリプトの他の識別子にこれらの名前を使わない。

---

## 3. DOM 一覧（テストが使う確定値）

### 3-1. 保存 HTML（generateReportHTML）
| 対象 | 確定値 |
| --- | --- |
| body | `<body class="view-report has-cl" data-filename="…">`（回答あり）／`<body class="view-report" data-filename="…">`（回答なし）。属性はこの順。`has-cl` = `R.checklistHasInput(record.checklist)`（既存の `clHas`） |
| 表示モード | `body.view-report` / `body.view-full`（どちらか一方）。読み込み時は必ず `view-report` |
| 表示切替 | `.rtool > .rtool-view[role="group"][aria-label="表示"] > button#rtViewReport` 「報告書」・`button#rtViewFull` 「詳細」。選択中は `class="on"`・`aria-pressed="true"` |
| 紙プレビュー | `.page > div.paper-wrap#reportPaper > (div.paper-cap) + div.paper#clPaper > div.cl-sheet.cl-mode-sheet`（回答ありのときだけ。`.rtool` の直後・`header.rh` の前） |
| A4 報告の合否 | `#clPaper .cl-decision#clPaperDecision`、`#clSheet .cl-decision#clDecision`（sheet のみ。decision 有効時のみ）。押印済み `.is-hire\|.is-reject` ＋ `svg.verdict-stamp`、未押印 `.is-none` ＋ `.cl-dec-empty`（「最終合否」「未押印」） |
| ヘッダーの合否 | `header.rh .rh-main > div.rh-decision#rhDecision`（`.verdict` の直後。中身は `svg.verdict-stamp`（幅 72）または空。decision 有効時のみ要素を出す） |
| 最終合否パネル | `section.sec[data-sec="mgmt"] > div.decision#decision`（h2「応募者の管理」の直後・`#mgmt` の前。`#mgmt` の外）。`data-result="hire\|reject\|"`、class `decision is-none\|is-hire\|is-reject` |
| パネル内 | `.dec-head > .dec-title`（「最終合否」）`+ .dec-hint`、`.dec-stamp`（`svg.verdict-stamp` 幅 120 / 未押印 `.dec-empty`「未押印」）、`.dec-body > .dec-meta`（`採用・笹川 晴央（副支配人）　2026.10.10` / 空）、`.dec-note`（注記 / 空）、`.dec-ctl > select[aria-label="最終合否 担当者"]` ＋ `input[type="text"]`（allowFreeName のときだけ）＋ `button.dec-btn.dec-hire[data-act="decide"][data-value="hire"]` ＋ `button.dec-btn.dec-reject[data-act="decide"][data-value="reject"]` ＋ `button.dec-undo[data-act="undecide"]`（未押印なら `style="display:none"`） |
| select の option | `value=""` 担当者を選択／`value="0..n"` 名簿（`氏名（役職）`）／`value="__free"` 名簿にない担当者（手入力）（allowFreeName のときだけ。**OFF なら '__free' を HTML に一切出さない**＝単体 #53） |
| 合否 svg の filter id | 紙 `vdPaper`・印刷用 `vdSheet`・パネル `vdPanel`・ヘッダー `vdHead`（同じ文書内で一意。display:none の中で定義された filter を他から参照すると描かれないため） |
| グローバル | `window.__setReportView('report'\|'full')`（テスト・将来用）、既存 `__prepareHandoffSheet` / `__prepareChecklistSheet` |
| 埋め込み設定 | `#recruit-mgmt-config` の JSON に `decision`（1-4 の値。無効なら `null`） |

### 3-2. アプリ（app.js）
| 対象 | 確定値 |
| --- | --- |
| Step4 カード | `div.card.decision-card#decisionCard`（`#mgmtCard` の直後・操作ボタン行の前）。class に `is-none\|is-hire\|is-reject`、`data-result` |
| カード内 | h2「最終合否」、`#decisionStamp`（`svg.verdict-stamp` 幅 120 / `.verdict-empty`「未押印」）、`#decisionMeta`（`採用・笹川 晴央（副支配人）　2026.10.10` / `まだ押されていません`）、`#decisionNote`（注記があるときだけ要素を出す）、`.decision-ctl.no-print > select#decisionManager[data-decision-select]` ＋ `input#decisionFree.stamp-free.hidden`（allowFreeName のとき）＋ `button[data-action="decide"][data-value="hire\|reject"]` ＋ `button[data-action="undecide"]`（押印済みのときだけ） |
| 右サマリー | `#sumJudgment` 内の末尾（最終保存の行の前）に `div.sum-row#sumDecision`（有効かつ押印済みのときだけ）: ラベル「最終合否」、値 `<span class="badge dec-hire\|dec-reject">採用・笹川</span>`（`label・by.short`） |
| state | `state.decision`（初期 `null`） |
| svg の filter id | カード `vdApp`、A4 印刷シート `vdSheet`（`#clSheet` の `.cl-decision#clDecision`） |

### 3-3. 設定（settings.js の s-mgmt）
`data-bind`: `management.decision.enabled`（checkbox）、`management.decision.label`、`management.decision.hireLabel`、`management.decision.rejectLabel`、`management.decision.hint`、`management.decision.stampField`（select）、`management.decision.autoStampFinal`（checkbox）、`management.decision.filenameSuffix`（checkbox）。プレビュー `.verdict-preview`（採用・不採用の 2 つ、id `stVdHire` / `stVdReject`）。

---

## 4. 保存 HTML の構造変更（storage.js `generateReportHTML`）

### 4-1. 冒頭で用意する値
storage.js のモジュール直下に補助関数を 1 つ置く（4-7 と共用）:
```js
function decOpts(dcfg, id, svgId) { return { id: id, svgId: svgId, title: dcfg.label, hireLabel: dcfg.hireLabel, rejectLabel: dcfg.rejectLabel, hireColor: dcfg.hireColor, rejectColor: dcfg.rejectColor, sub: dcfg.sub, size: 64 }; }
```
`generateReportHTML` の冒頭（`const Stamp = global.RecruitStamp;` を**関数の先頭に移す**。現在は押印欄の直前で宣言しているので、そのままだと const の TDZ で落ちる）:
```js
const Stamp = global.RecruitStamp;
const dcfg = decisionConfig(profile);
const dec = dcfg.enabled ? normalizeDecision(record.decision) : null;   // 表示用
const baseName = '応募者_' + safeName(a.name) + '_' + U.fmtDate(record.savedAt || new Date()) + '.html';
const filename = Stamp ? Stamp.decisionFilename(baseName, dec, dcfg) : baseName;   // 既存の filename の定義を置き換え（押印欄の直前の定義は消す）
```
埋め込む JSON（`#recruit-record`）は従来どおり `record` そのもの（`buildRecord` が decision を正規化済み）。

### 4-2. 並び（`.page` の直下）
```
.rtool（表示切替＋印刷）
.paper-wrap#reportPaper（回答ありのとき）
header.rh（.rh-main の .verdict の後ろに .rh-decision#rhDecision）
.dash
section[data-sec=pre] [comment] handoff interview contrib checklist [scores] judgment
#clSheet.cl-sheet-print（回答ありのとき。従来どおり。decisionId 'clDecision'）
section[data-sec=mgmt]（h2「応募者の管理」→ #decision → #mgmt → #mgmtSave → .mgmt-note）
.foot
```
`section.sec` を新しく増やさない（E23/E27 が見える節の並びを検証）。

### 4-3. ツールバー `.rtool`
```html
<div class="rtool no-print">
  <div class="rtool-view" role="group" aria-label="表示"><button type="button" id="rtViewReport" class="on" aria-pressed="true">報告書</button><button type="button" id="rtViewFull" aria-pressed="false">詳細</button></div>
  <span class="rtool-sep"></span>
  <span>印刷:</span>（既存の #rtPrintSheet / #rtPrintChecklist / #rtPrintAll と .rtool-hint をそのまま）
</div>
```

### 4-4. 紙プレビュー（回答ありのとき）
```html
<div class="paper-wrap" id="reportPaper">
  <div class="paper-cap"><b>面接チェックリスト報告（A4 プレビュー）</b><span>印刷は「面接チェックリスト報告（A4）」で 1〜2 枚。全体は「詳細」</span></div>
  <div class="paper" id="clPaper">{checklistSheetHtml(record, profile, { mode: 'sheet', stamps: '', decisionId: 'clPaperDecision', decisionSvgId: 'vdPaper' })}</div>
</div>
```
`stamps: ''`（押印は下の「応募者の管理」節に出る。印刷の print-checklist と同じ構成。紙の中にハンコを描かない＝既存のハンコ数え上げに影響しない）。

### 4-5. ヘッダーの合否
`headerHtml` の `verdictHtml` の直後に、decision 有効時だけ `<div class="rh-decision" id="rhDecision">' + (dec ? Stamp.verdict({ label:…, date:dec.date, color:…, size:72, id:'vdHead', sub:dcfg.sub }) : '') + '</div>'`。

### 4-6. 最終合否パネル（`mgmtHtml` の先頭。decision 有効時だけ）
```html
<div class="decision is-none|is-hire|is-reject" id="decision" data-result="" style="--dec-hire:#c8232c;--dec-reject:#1f4e8c">
  <div class="dec-head"><span class="dec-title">最終合否</span><span class="dec-hint">最終確認者が合否を決めて押します</span></div>
  <div class="dec-stamp">{dec ? verdict(size 120, id 'vdPanel') : '<div class="dec-empty">未押印</div>'}</div>
  <div class="dec-body">
    <div class="dec-meta">{dec ? L + '・' + by.name + (by.title ? '（' + by.title + '）' : '') + '　' + dec.date : ''}</div>
    <div class="dec-note">{注記（X10）または空}</div>
    <div class="dec-ctl">
      <select aria-label="最終合否 担当者"><option value="">担当者を選択</option>{名簿}{allowFreeName ? '<option value="__free">名簿にない担当者（手入力）</option>' : ''}</select>
      {allowFreeName ? '<input type="text" placeholder="氏名（例：山田 太郎）" style="display:none">' : ''}
      <button type="button" class="dec-btn dec-hire" data-act="decide" data-value="hire" aria-pressed="false">採用</button>
      <button type="button" class="dec-btn dec-reject" data-act="decide" data-value="reject" aria-pressed="false">不採用</button>
      <button type="button" class="dec-undo" data-act="undecide" style="display:none">取消</button>
    </div>
  </div>
</div>
```
- 文言（「最終合否」「採用」「不採用」「最終確認者が…」）と色は `dcfg` の値。押した方のボタンに `class="… on"`・`aria-pressed="true"`、押印済みなら取消の `style` を外す
- select の初期選択（サーバー側。スクリプトも読み込み時に同じ規則で選び直す＝4-9 initDecSel）: 「`stampField` の欄の押印者名」→ 無ければ「`dec.by.name`」の順に名簿の `name` と一致する option を `selected`。一致しない名前で allowFreeName のときは `__free` を選び input に名前を入れて表示
- `mgFields` が空でも decision 有効ならパネル＋従来の「押印欄は設定されていません。」
- 注記（X10）は `record.judgment`（保存時点の判定）で判断

### 4-7. `checklistSheetHtml` の変更（storage.js）
- 新しい `o.decisionId`（既定 `'clDecision'`）・`o.decisionSvgId`（既定 `'vdSheet'`）
- `mode === 'sheet'` かつ `decisionConfig(profile).enabled` かつ `global.RecruitStamp` があるときだけ `decHtml = global.RecruitStamp.decisionSheet(normalizeDecision(record.decision), decOpts(dcfg, o.decisionId || 'clDecision', o.decisionSvgId || 'vdSheet'))`
- `judgeHtml` の組み立て: `decHtml` があるとき
```
<div class="cl-judge"><div class="cl-judge-row"><div class="cl-judge-main"><div class="cl-bt">【判定サマリー】</div><div class="cl-tiles">…</div></div>{decHtml}</div>{<ul class="cl-adj">…</ul>}</div>
<div class="cl-judge cl-judge-none"><div class="cl-judge-row"><div class="cl-judge-main"><div class="cl-bt">【判定サマリー】</div><p>採用可否判定は未実施（…）</p></div>{decHtml}</div></div>
```
  `decHtml` が無いとき（section・無効）は**現行の HTML をそのまま**出す。外側の class は `cl-judge` / `cl-judge cl-judge-none` のまま（単体 #66）
- アプリの印刷（`prepareChecklistSheet`）も `S.buildRecord(state)` に decision が入るので自動で出る（既定 id で `#clDecision`）

### 4-8. 埋め込みスクリプト 1（既存の印刷ツールバーの IIFE を拡張）
既存（`prep` / `prepCl` / 各ボタン）は変えずに、次を IIFE の末尾に足す（ES5）:
```js
var vr=document.getElementById("rtViewReport"),vf=document.getElementById("rtViewFull");
function setView(v){var r=v!=="full",bd=document.body;bd.classList.toggle("view-report",r);bd.classList.toggle("view-full",!r);
  if(vr){vr.classList.toggle("on",r);vr.setAttribute("aria-pressed",String(r));}if(vf){vf.classList.toggle("on",!r);vf.setAttribute("aria-pressed",String(!r));}}
window.__setReportView=setView;
if(vr)vr.addEventListener("click",function(){setView("report");});
if(vf)vf.addEventListener("click",function(){setView("full");});
setView("report");   // 保存時に「詳細」だったファイルも必ず報告書表示で開く（D1）
var autoCl=false,printingAll=false;
window.addEventListener("beforeprint",function(){var bd=document.body;
  if(printingAll||!bd.classList.contains("view-report")||!bd.classList.contains("has-cl")||bd.classList.contains("print-handoff")||bd.classList.contains("print-checklist"))return;
  if(prepCl(true))autoCl=true;});
window.addEventListener("afterprint",function(){if(autoCl){autoCl=false;prepCl(false);}});
```
追加コードは IIFE の末尾（`if(c)c.addEventListener(…)` の行の後）に置く（`prepCl`・`host` が定義済みの位置）。既存の `if(a)a.addEventListener("click",function(){window.print();});` は `if(a)a.addEventListener("click",function(){printingAll=true;try{window.print();}finally{printingAll=false;}});` に変える（`var printingAll` は var の巻き上げで先に使えるが、宣言は末尾の追加コードにまとめてよい）。

### 4-9. 埋め込みスクリプト 2（押印・合否。`reportScript`）
- 生成条件: `Stamp && (mgFields.length || dcfg.enabled)`（従来は `mgFields.length` のみ）
- `#recruit-mgmt-config` の JSON: `{ fields, managers, allowFreeName, decision: dcfg.enabled ? { label, hireLabel, rejectLabel, hireColor, rejectColor, stampField, autoStampFinal, filenameSuffix, hint, sub } : null }`（`jsonForScript`）
- 冒頭: 従来の `if(!recNode||!cfgNode||!root)return;` を `if(!recNode||!cfgNode)return;` にし、JSON を読んだ直後に `var D=cfg.decision||null,dpanel=D?document.getElementById("decision"):null;if(!root&&!dpanel)return;` を置く。`root` を使う既存の処理（render の押印枠のループ・`root` の change/click リスナー）は `if(root)` で囲む
- `Stamp.source()` で 5 関数が入る（2-4）
- 追加する関数（ES5。文字列連結で組み立て、閉じタグは書かない）:
```js
function hasField(id){return !!id&&cfg.fields.some(function(f){return f.id===id;});}
function curDec(){var d=rec.decision;return d&&(d.result==="hire"||d.result==="reject")&&d.by&&d.by.name?d:null;}
function decLabel(d){return d.label||(d.result==="hire"?D.hireLabel:D.rejectLabel);}
function decColor(d){return d.result==="hire"?D.hireColor:D.rejectColor;}
function decSvg(d,size,id){return verdictSvg({label:decLabel(d),date:d.date||"",color:decColor(d),size:size,id:id,sub:D.sub||""});}
function decOpts(id,svgId){return {id:id,svgId:svgId,title:D.label,hireLabel:D.hireLabel,rejectLabel:D.rejectLabel,hireColor:D.hireColor,rejectColor:D.rejectColor,sub:D.sub||"",size:64};}
function noteText(d){var j=rec.judgment;if(!d||!j)return "";if((d.result==="hire"&&j.result==="reject")||(d.result==="reject"&&j.result==="recommend"))return "※ アプリの判定「"+(j.title||"")+"」と異なる最終合否です（記録はそのまま残ります）。";return "";}
function pickPerson(sel,inp){ /* 押印と同じ規則: "__free" → 入力名（空なら alert("氏名を入力してください") で null）、名簿 index → {name,short,title}、未選択 → alert("担当者を選んでください") で null */ }
function initDecSel(){ /* 4-6 の初期選択規則（stampField の押印者 → decision.by）。読み込み時に 1 回だけ */ }
function renderDecision(){if(!D)return;var d=curDec();
  [["clPaperDecision","vdPaper"],["clDecision","vdSheet"]].forEach(function(x){var el=document.getElementById(x[0]);if(el)el.outerHTML=decisionSheetHtml(d,decOpts(x[0],x[1]));});
  if(dpanel){dpanel.className="decision "+(d?"is-"+d.result:"is-none");dpanel.setAttribute("data-result",d?d.result:"");
    dpanel.querySelector(".dec-stamp").innerHTML=d?decSvg(d,120,"vdPanel"):'<div class="dec-empty">未押印</div>';
    dpanel.querySelector(".dec-meta").textContent=d?(decLabel(d)+"・"+d.by.name+(d.by.title?"（"+d.by.title+"）":"")+"　"+(d.date||"")):"";
    dpanel.querySelector(".dec-note").textContent=noteText(d);
    Array.prototype.forEach.call(dpanel.querySelectorAll('[data-act="decide"]'),function(b){var on=!!d&&b.getAttribute("data-value")===d.result;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on));});
    var un=dpanel.querySelector('[data-act="undecide"]');if(un)un.style.display=d?"":"none";}
  var rh=document.getElementById("rhDecision");if(rh)rh.innerHTML=d?decSvg(d,72,"vdHead"):"";
  document.body.setAttribute("data-filename",decisionFilename(document.body.getAttribute("data-filename")||"applicant.html",d,D));}
```
- 既存の `render()` の末尾（保存バーの更新の前）で `renderDecision()` を呼ぶ。読み込み時は `initDecSel(); render();`
- パネルのイベント（`dpanel` があるとき）:
  - `change`: select が `__free` なら input を表示・focus、それ以外は隠す
  - `click` `[data-act="decide"]`: `r=data-value`（hire/reject 以外は無視）→ `p=pickPerson(...)`（null なら終了）→ `var dt=today(),at=new Date().toISOString();rec.decision={result:r,label:r==="hire"?D.hireLabel:D.rejectLabel,date:dt,at:at,by:{name:p.name,short:p.short,title:p.title}};` → `D.autoStampFinal && hasField(D.stampField)` かつ `rec.management[D.stampField]` に name が無ければ `rec.management[D.stampField]={name:p.name,short:p.short,title:p.title,date:dt,at:at};` → `dirty=true;render();`
  - `click` `[data-act="undecide"]`: `rec.decision=null;dirty=true;render();`（押印は消さない＝X5）
- 「押印を保存」の処理・エスケープの行（`recNode.textContent=JSON.stringify(rec).replace(/[<>&` …）・`beforeunload`・保存バーの文言は**変えない**（単体 #53 が文字列を検証）。`render()` で `data-filename` が更新済みなので、書き出す HTML と `a.download` に合否付きの名前が入る
- `rec.management=rec.management||{}` は既存どおり（decision だけの文書でも必要）

### 4-10. `mgmt-note` の文言（D8）
`運用: 面接者はアプリで面接チェックリストを入力・判定し、「面接対応者」に押印して保存したファイルをスレッドに添付します。副支配人はこのファイルをブラウザで開き、「最終合否」で担当者を選んで「採用」または「不採用」を押し（押印欄「最終確認」が未押印なら同じ担当者の印も押されます）、「押印を保存」で再出力したファイルをスレッドに添付してください。レポート上で押した印・合否は「押印を保存」で再出力したファイルにだけ記録されます（保存せずに閉じると消えます）。再出力したファイルはアプリの「読み込み」で押印・合否ごと引き継げます。担当者名簿は設定（劇場ルール）の「応募者の管理」で編集できます。`
（decision 無効時は従来の文言のまま。）

### 4-11. ファイル名（D5）
- 保存 HTML の `data-filename` とアプリの保存名は `RecruitStamp.decisionFilename(基本名, 有効なら decision, dcfg)`。基本名 `応募者_<safeName(氏名)>_<YYYY-MM-DD>.html`（従来どおり）
- 例: `応募者_合否_太郎_2026-10-10.html` → 採用 `応募者_合否_太郎_2026-10-10_採用.html` → 不採用に変更 `…_不採用.html` → 取消 `応募者_合否_太郎_2026-10-10.html`

---

## 5. CSS

### 5-1. `reportCss()` に追加（既存の `.rtool` 行の後ろ。配列の要素として 1 行ずつ）
```css
.rtool-view{display:inline-flex;border:1px solid #c7d0db;border-radius:7px;overflow:hidden;background:#fff}
.rtool .rtool-view button{border:none;border-radius:0;padding:5px 14px;color:var(--muted);background:#fff}
.rtool .rtool-view button+button{border-left:1px solid #c7d0db}
.rtool .rtool-view button.on{background:#24324a;color:#fff}
.rtool-sep{width:1px;height:20px;background:var(--border);margin:0 4px}
.paper-wrap{display:none}
.paper-cap{display:flex;justify-content:space-between;gap:4px 12px;flex-wrap:wrap;width:210mm;max-width:100%;margin:0 auto 6px;font-size:12px;color:var(--muted)}.paper-cap b{color:var(--text)}
.paper{box-sizing:content-box;width:190mm;margin:0 auto;padding:10mm;background:#fff;color:#111;border:1px solid #d5dbe3;border-radius:2px;box-shadow:0 1px 2px rgba(16,24,40,.08),0 12px 32px rgba(16,24,40,.12)}
.paper .cl-mode-sheet .cl-page+.cl-page{margin-top:8mm;padding-top:6mm;border-top:1px dashed #b8c2cf}
@media screen{
body.view-report.has-cl:not(.print-checklist):not(.print-handoff) .page>:not(.rtool):not(.paper-wrap):not(section[data-sec="mgmt"]):not(.foot){display:none}
body.view-report.has-cl:not(.print-checklist):not(.print-handoff) .paper-wrap{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 2px 14px}
body.view-report.has-cl:not(.print-checklist):not(.print-handoff) section.sec[data-sec="mgmt"]{max-width:210mm;margin:12px auto 0}
body.view-report.has-cl:not(.print-checklist):not(.print-handoff) section.sec[data-sec="mgmt"] h2::before{display:none}
body.view-report:not(.has-cl):not(.print-checklist):not(.print-handoff) .dash{display:none}
body.view-report:not(.has-cl):not(.print-checklist):not(.print-handoff) section.sec:not([data-sec="pre"]):not([data-sec="comment"]):not([data-sec="handoff"]):not([data-sec="interview"]):not([data-sec="mgmt"]){display:none}
}
.decision{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 18px;align-items:center;padding:12px 16px;margin:0 0 14px;border:1px solid var(--border);border-left:4px solid #24324a;border-radius:10px;background:var(--surface-2)}
.decision.is-hire{border-left-color:var(--dec-hire,#c8232c)}.decision.is-reject{border-left-color:var(--dec-reject,#1f4e8c)}
.dec-head{grid-column:1/-1;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.dec-title{font-size:14px;font-weight:800}.dec-hint{font-size:12px;color:var(--muted)}
.dec-stamp{width:124px;height:80px;display:grid;place-items:center}
.dec-empty{width:116px;height:70px;border:2px dashed #c7d0db;border-radius:9px;display:grid;place-items:center;font-size:12px;font-weight:700;color:var(--muted);background:#fff}
.dec-body{min-width:0;display:flex;flex-direction:column;gap:8px}
.dec-meta{font-size:13.5px;font-weight:700;min-height:1.4em}.dec-meta:empty::before{content:"まだ押されていません";color:var(--muted);font-weight:600}
.dec-note{font-size:12.5px;color:#9a5b00;background:var(--warn-soft);border:1px solid #f3cf8a;border-radius:6px;padding:4px 10px}.dec-note:empty{display:none}
.dec-ctl{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.dec-ctl select,.dec-ctl input{font:inherit;font-size:12.5px;padding:5px 8px;border:1px solid #c7d0db;border-radius:6px;background:#fff;color:var(--text);max-width:100%}
.dec-ctl button{font:inherit;font-size:13px;font-weight:800;padding:5px 16px;border-radius:6px;cursor:pointer;background:#fff;color:var(--text);border:1px solid #c7d0db}
.dec-ctl .dec-btn{color:var(--dec);border:1.5px solid var(--dec)}.dec-ctl .dec-hire{--dec:var(--dec-hire,#c8232c)}.dec-ctl .dec-reject{--dec:var(--dec-reject,#1f4e8c)}
.dec-ctl .dec-btn:hover,.dec-ctl .dec-btn.on{background:var(--dec);color:#fff}
.verdict-stamp{mix-blend-mode:multiply}
.rh-decision{flex:0 0 auto;display:grid;place-items:center}.rh-decision:empty{display:none}
@media (max-width:720px){.decision{grid-template-columns:1fr}}
@media print{.paper-wrap,.dec-ctl,.dec-hint{display:none !important}.decision.is-none{display:none !important}body.print-checklist #decision,body.print-handoff #decision,body.print-handoff .rh-decision{display:none !important}.decision{break-inside:avoid;padding:6px 10px;margin-bottom:8px;gap:4px 12px}.dec-stamp{width:100px;height:64px}.dec-stamp .verdict-stamp{width:96px;height:61px}.decision,.verdict-stamp,.dec-empty{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
```
- 既存の `@media (max-width:720px)`・`@media print` の規則は変更しない（追加だけ）
- `.page` の内幅は 860px（900−40）。紙は外寸 210mm＋2px ≒ 796px で 1280/1440px でも収まる。390px では `.paper-wrap` の中だけ横スクロール

### 5-2. `checklistSheetCss()` に追加（`.cl-mode-sheet .cl-stamps` の行の前あたり）
```css
.cl-mode-sheet .cl-judge-row{display:flex;gap:6px;align-items:stretch}
.cl-mode-sheet .cl-judge-main{flex:1 1 auto;min-width:0}
.cl-mode-sheet .cl-decision{flex:0 0 auto;display:flex;align-items:center;gap:5px;margin-top:2px;padding:2px 6px;border:1px solid #c9d2dd;border-radius:4px;background:#fff}
.cl-mode-sheet .cl-dec-stamp{flex:none;display:grid;place-items:center}.cl-mode-sheet .cl-dec-stamp .verdict-stamp{width:64px;height:41px;mix-blend-mode:multiply;filter:none}
.cl-mode-sheet .cl-dec-meta{display:flex;flex-direction:column;min-width:0;line-height:1.3}
.cl-mode-sheet .cl-dec-kv{display:flex;align-items:baseline;gap:4px}.cl-mode-sheet .cl-dec-k{font-size:8.5px;font-weight:700;color:#5b6675}.cl-mode-sheet .cl-dec-v{font-size:12px;font-weight:800}
.cl-mode-sheet .cl-dec-by,.cl-mode-sheet .cl-dec-date{font-size:8.5px;color:#3a4556;white-space:nowrap}
.cl-mode-sheet .cl-dec-empty{width:64px;height:38px;border:1.5px dashed #b8c2cf;border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:8.5px;line-height:1.25;color:#5b6675;text-align:center}
.cl-sheet .cl-decision,.cl-sheet .verdict-stamp,.cl-sheet .cl-dec-empty{-webkit-print-color-adjust:exact;print-color-adjust:exact}
```
`checklistSheetCss()` に `</script` を含めない（単体 #66）。

### 5-3. `styles.css`（アプリ）に追加（「応募者の管理（押印）」ブロックの後ろ）
```css
/* ---------- 最終合否（Step4） ---------- */
.decision-body { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px 20px; align-items: center; }
.decision-stamp { width: 128px; height: 82px; display: grid; place-items: center; }
.verdict-empty { width: 118px; height: 72px; border: 2px dashed var(--border-strong); border-radius: 9px; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: var(--muted); background: var(--surface); }
.decision-main { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.decision-meta { font-weight: 700; }
.decision-note { font-size: 12.5px; color: var(--warn); background: var(--warn-soft); border-radius: 6px; padding: 4px 10px; }
.decision-ctl { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.decision-ctl select { width: auto; max-width: 100%; padding: 6px 8px; font-size: 13px; }
.decision-ctl .stamp-free { width: auto; min-width: 12em; padding: 6px 8px; font-size: 13px; }
.btn.decide-btn { font-weight: 800; color: var(--dec); border: 1.5px solid var(--dec); }
.btn.decide-btn:hover, .btn.decide-btn.on { background: var(--dec); color: #fff; }
.badge.dec-hire { background: transparent; border: 1.5px solid #c8232c; color: #c8232c; }
.badge.dec-reject { background: transparent; border: 1.5px solid #1f4e8c; color: #1f4e8c; }
:root[data-theme="dark"] #decisionCard .verdict-stamp { filter: brightness(1.35); }
:root[data-theme="dark"] .badge.dec-hire { color: #ff8f95; border-color: #ff8f95; }
:root[data-theme="dark"] .badge.dec-reject { color: #9dbcf0; border-color: #9dbcf0; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) #decisionCard .verdict-stamp { filter: brightness(1.35); } :root:not([data-theme="light"]) .badge.dec-hire { color: #ff8f95; border-color: #ff8f95; } :root:not([data-theme="light"]) .badge.dec-reject { color: #9dbcf0; border-color: #9dbcf0; } }
@media (max-width: 760px) { .decision-body { grid-template-columns: 1fr; } }
@media print { #decisionCard.is-none { display: none !important; } #decisionCard .verdict-stamp { width: 96px; height: 61px; } }
```
ボタンの色は `style="--dec:<hireColor|rejectColor>"` を各ボタンに付けて渡す（設定の色に追従）。

### 5-4. 印刷への影響（ゼロであることの確認表）
| 印刷 | 本フェーズで変わること | 既存テスト |
| --- | --- | --- |
| print-handoff（レポート） | なし（`#decision`・`.rh-decision` は隠す。`.paper-wrap` も隠す。`section.sec` は増やさない） | E23・E27 の節の並び、1 枚 |
| print-checklist（レポート） | `#clSheet` の【判定サマリー】右に `.cl-decision`（高さはタイル以下）。`.paper-wrap` は既存の `.page>:not(#clSheet)…` で隠れる。`#decision` は隠す | E27 `.page > *` = `clSheet,mgmt`、1〜2 枚、`section[data-sec="mgmt"] svg.hanko` = 1 |
| print-checklist（アプリ） | 同上（`.cl-decision`）。`#decisionCard` は `.app` ごと隠れる | E27 1〜2 枚・`.cl-fit` |
| 全体（レポート） | 合否ありのときだけ `#decision`（操作部品なし）・`.rh-decision` が出る。未押印なら変化なし | E24（X3 のとおり報告書表示では beforeprint で報告に切り替わる）、E31 で「詳細」から 6 ページ以内 |
| 全体（アプリ Step4） | 合否ありのときだけ `#decisionCard`（操作部品なし）が出る | E24 アプリ 5 ページ以内（未押印なので変化なし） |

---

## 6. app.js の変更

1. `state.decision: null`（コメント: 最終合否（人の決定）: `{ result, label, date, at, by }`。判定とは独立。再判定で消さない）
2. `newRecord()`: `state.decision = null;`
3. `applyRecord(rec)`: `state.management` の直後に `state.decision = S.normalizeDecision(rec.decision);`
4. `decisionCfg()` = `S.decisionConfig(state.profile)`
5. `decisionNoteText(d, j)`（X10。j = `state.judgment`）
6. `decisionCardHtml()`（3-2 の DOM。`dcfg.enabled` でなければ `''`）
   - 見出し `<div class="card-head"><h2>最終合否</h2><p>{hint}。アプリの判定（推奨）とは別に、最終確認者が「採用」「不採用」を決めて押します。保存した HTML 上でも押せます。</p></div>`
   - `#decisionMeta` の文言は保存 HTML のパネルと同じ形式（`採用・笹川 晴央（副支配人）　2026.10.10`）。未押印は `まだ押されていません`
   - select の初期選択: 4-6 と同じ規則（`state.management[stampField]` → `state.decision.by`）。手入力名なら `__free` を選び `#decisionFree` に名前・`hidden` を外す
   - ボタン: `<button type="button" class="btn sm decide-btn decide-hire[ on]" data-action="decide" data-value="hire" style="--dec:#c8232c">採用</button>`（不採用も同様）、押印済みなら `<button type="button" class="btn sm ghost" data-action="undecide">取消</button>`
   - autoStampFinal かつ stampField の欄があるとき、ctl の下に `<div class="hint">「採用」「不採用」を押すと、押印欄「{欄の label}」が未押印なら同じ担当者の印も押します。</div>`
7. `rerenderDecisionCard()`（`rerenderManagementCard` と同じ置き換え方式）
8. `resultStepHtml()`: `html += managementCardHtml();` の直後に `html += decisionCardHtml();`
9. `onFieldEvent`: 冒頭（`data-stamp-select` の処理の後）に `data-decision-select` の処理（`#decisionFree` の `hidden` を `value !== '__free'` で切替、`__free` なら focus して return）
10. `onContentClick`:
    - `'decide'`: dcfg 無効なら break。`r = b.dataset.value`（hire/reject 以外 break）。担当者は押印と同じ規則（`#decisionManager` の値、`__free` は `#decisionFree`。未選択 → toast `担当者を選んでください`、手入力が空 → toast `氏名を入力してください`）。`const dt = Stamp.stampDate(new Date()), at = new Date().toISOString();` `state.decision = { result: r, label: r === 'hire' ? dcfg.hireLabel : dcfg.rejectLabel, date: dt, at: at, by: { name, short, title } };` autoStampFinal かつ stampField が fields にあり未押印なら `state.management[stampField] = { name, short, title, date: dt, at: at }`。`state.dirty = true; rerenderDecisionCard(); rerenderManagementCard(); renderSummary();` toast `{氏名} さんが「{label}」を押しました` ＋（自動押印したら `（{欄の label}にも押印）`）、kind `'ok'`
    - `'undecide'`: `state.decision = null; state.dirty = true; rerenderDecisionCard(); renderSummary();` toast `最終合否を取り消しました`
11. `renderSummary()`: `#sumJudgment` の判定バッジ等の後・「最終保存」の行の前に、dcfg 有効かつ `state.decision` があれば `<div class="sum-row" id="sumDecision"><span class="sum-label">最終合否</span><span class="sum-val"><span class="badge dec-hire">採用・笹川</span></span></div>`（値は `label + '・' + (by.short || shortName(by.name))`）
12. `saveRecord()`: ダウンロード名を `Stamp.decisionFilename('応募者_' + S.safeName(a.name) + '_' + U.fmtDate(new Date()) + '.html', dcfg.enabled ? state.decision : null, dcfg)` に
13. 判定・再判定・設定保存（`invalidateJudgment` / `goStep(4)`）では `state.decision` に触れない（D7）
14. 使い方（`helpHtml`）の「保存と読み込み」に 1 行: `<li><b>最終合否</b>：副支配人は保存ファイル（HTML）をブラウザで開き、「最終合否」で「採用」「不採用」を押して「押印を保存」で再出力します（最終確認の印も自動で押されます）。アプリの判定（推奨）とは別の記録です。</li>`

---

## 7. settings.js の変更（`mgmtHtml()` の末尾、`allowFreeName` の sCheck の後）
```js
'<h3 class="sub">最終合否（採用／不採用のスタンプ）</h3>' +
sCheck('management.decision.enabled', '最終合否のスタンプを使う', '保存ファイル（HTML）と Step4 に「採用」「不採用」のボタンを出します。アプリの判定（推奨）とは別の、最終確認者の決定として記録します。') +
'<div class="field-row">' +
  '<div>' + sInput('management.decision.label', '表示名') + sInput('management.decision.hireLabel', '「採用」の表示名') + sInput('management.decision.rejectLabel', '「不採用」の表示名') +
    sInput('management.decision.hint', '説明（任意）') + '</div>' +
  '<div><div class="field"><label>スタンプのプレビュー</label><div class="stamp-preview verdict-preview">' + 採用・不採用の 2 つ（RecruitStamp.verdict、size 96、id stVdHire / stVdReject、日付は今日、sub は decisionConfig(draft).sub、色は draft の色） + '</div></div></div>' +
'</div>' +
sSelect('management.decision.stampField', '押印欄と連動', fields.map(function (fl) { return { value: fl.id, label: fl.label + '（' + fl.id + '）' }; }).concat([{ value: '', label: '連動しない' }]), '合否を押したとき、この押印欄にも同じ担当者の印を押せます。') +
sCheck('management.decision.autoStampFinal', '合否を押すと、連動する押印欄にも同じ担当者の印を押す（未押印のときだけ）') +
sCheck('management.decision.filenameSuffix', '合否を付けて保存するとき、ファイル名の末尾に「_採用」「_不採用」を付ける')
```
- 既存の section 説明文・名簿・押印欄の HTML は変えない。`.verdict-preview` は `.stamp-preview` と同じ見た目で、2 つを横に並べる（`display:flex;gap:12px;justify-content:center` を styles.css に追加）

---

## 8. テスト

### 8-1. 単体（tests/rules.test.js の末尾、`console.log(passes…)` の前に追加。既存 72 件はそのまま）

**#67 最終合否スタンプ（verdictSvg・decisionSheetHtml・source）**
- `ST.verdict({ label:'採用', date:'2026.10.10', color:'#c8232c', size:120, id:'vt1' })` が `'<svg class="verdict-stamp"'` で始まり、`role="img"`・`aria-label="採用 2026.10.10"`・`>採用</text>`・`>2026.10.10</text>`・`stroke="#c8232c"`・`feTurbulence`・`id="vt1"`・`url(#vt1)`・`rotate(-3 `・`width="120"`・`height="76"` を含み、`class="hanko"` を含まない
- `ST.verdict({ label:'不採用', date:'2026.10.10', color:'#1f4e8c' })` に `>不採用</text>` と `stroke="#1f4e8c"`、既定サイズ `width="120"`
- sub: `ST.verdict({ label:'採用', date:'2026.10.10', sub:'新宿' })` の aria-label が `採用 2026.10.10 新宿`、下段 `>2026.10.10 新宿</text>`
- エスケープ: `ST.verdict({ label:'<b>', date:'"x' })` に `&lt;b&gt;` があり `<b>` が無い
- 長いラベル `ST.verdict({ label:'アルバイト採用決定' })` に `textLength="88"`、2 文字には `textLength` が無い
- `ST.decisionSheet(null, { id:'clDecision' })` に `class="cl-decision is-none"`・`id="clDecision"`・`未押印` があり `verdict-stamp` が無い
- `ST.decisionSheet({ result:'hire', label:'採用', date:'2026.10.10', at:'', by:{ name:'笹川 晴央', short:'笹川', title:'副支配人' } }, { id:'x', hireColor:'#c8232c' })` に `is-hire`・`data-result="hire"`・`verdict-stamp`・`笹川 晴央（副支配人）`・`2026.10.10`・~~`style="color:#c8232c"`~~ → 2026-10-19 から `stroke="#c8232c"`（スタンプの絵）・`<b class="cl-dec-v">採用</b>`（文字に style の色なし）・用紙の CSS に `.cl-decision.is-hire .cl-dec-v{color:#146c43}`（不採用は `#1f4e8c` の stroke・`#b42318` の文字）
- `ST.source()` に `function verdictSvg(`・`function decisionSheetHtml(`・`function decisionFilename(`・`function stampSvg(`・`function shortName(` があり、`</script`・`<!--` が無い
- 外部参照なし: `vm.runInNewContext(ST.source() + '\n;[verdictSvg({label:"採用",date:"2026.10.10"}).indexOf("<svg class=\\"verdict-stamp\\""), decisionSheetHtml({result:"reject",label:"不採用",date:"2026.10.10",by:{name:"笹川 晴央",title:""}},{}).indexOf("is-reject") > 0, decisionFilename("a.html",{result:"hire",label:"採用"},{})]', {})` を `plain(...)` して（別 realm の配列なので）`[0, true, 'a_採用.html']` と deepStrictEqual

**#68 decisionFilename**
- `F('応募者_A_2026-10-10.html', {result:'hire',label:'採用'}, {filenameSuffix:true})` = `応募者_A_2026-10-10_採用.html`
- `F('応募者_A_2026-10-10_採用.html', {result:'reject',label:'不採用'}, {})` = `応募者_A_2026-10-10_不採用.html`
- `F('応募者_A_2026-10-10_不採用.html', null, {})` = `応募者_A_2026-10-10.html`
- `F('応募者_A_2026-10-10_採用.html', {result:'hire',label:'採用'}, {filenameSuffix:false})` = `応募者_A_2026-10-10.html`
- `F('x_OK.html', {result:'hire',label:'合格 A'}, {hireLabel:'OK', rejectLabel:'NG'})` = `x_合格_A.html`
- 冪等: 上の各ケースで `F(F(x,d,o),d,o) === F(x,d,o)`

**#69 normalizeProfile（management.decision）・validateProfile**
- `plain(P().management.decision)` が 1-3 の既定値と deepStrictEqual
- `raw = P(); delete raw.management.decision` → `S.normalizeProfile(raw).management.decision` が既定値
- 旧プロファイル JSON: `S.parseProfileJSON(fs.readFileSync(path.join(FIX, 'v1-profile-other.json'), 'utf8')).management.decision.enabled === true` かつ `hireLabel === '採用'`
- 不正値: `{ enabled:'x', label:'  ', hireLabel:'', rejectLabel:5, hireColor:'red', rejectColor:'#1F4E8C', stampField:'nope', autoStampFinal:false, filenameSuffix:0, hint:null }` → `enabled:true, label:'最終合否', hireLabel:'採用', rejectLabel:'不採用', hireColor:'#c8232c', rejectColor:'#1F4E8C', stampField:'final', autoStampFinal:false, filenameSuffix:true, hint:'最終確認者が合否を決めて押します'`
- fields に final が無い（`fields:[{id:'a',label:'A'}]`）で `stampField:'final'` → `''`、`enabled:false` は保持
- 冪等: `normalizeProfile(normalizeProfile(x))` と `normalizeProfile(x)` の decision が同じ
- `S.decisionConfig(P()).sub === '新宿'`
- validate: `hireLabel=''` → errors に `最終合否の「採用」「不採用」の表示名を入力してください。`、`hireLabel=rejectLabel='採用'` → errors に `最終合否の「採用」と「不採用」の表示名が同じです。`、既定 → 最終合否のエラーなし

**#70 record.decision の正規化と往復（buildRecord・parseRecordFromHTML）**
- `S.normalizeDecision`: `null`・`{}`・`'hire'`・`{result:'maybe',by:{name:'x'}}`・`{result:'hire'}`・`{result:'hire',by:{name:'  '}}` → すべて `null`
- `S.normalizeDecision({ result:'hire', label:'', date:'2026/10/10', at:5, by:{ name:' 笹川 晴央 ', title:'副支配人', x:1 }, extra:1 })` deepStrictEqual `{ result:'hire', label:'採用', date:'', at:'', by:{ name:'笹川 晴央', short:'笹川', title:'副支配人' } }`
- `buildRecord`（#66 と同じ state ＋ `decision: DEC`）の `rec.decision` が DEC と deepStrictEqual、`rec.schemaVersion === 2`。decision なしの state → `rec.decision === null`
- parseRecordFromHTML（vm には DOMParser が無いので、このテストの中だけスタブを置き、最後に `delete ctx.DOMParser`）:
```js
ctx.DOMParser = function () {};
ctx.DOMParser.prototype.parseFromString = function (h) { const m = h.match(/<script type="application\/json" id="recruit-record">([\s\S]*?)<\/script>/); return { querySelector: function () { return m ? { textContent: m[1] } : null; } }; };
```
  - `S.parseRecordFromHTML(S.generateReportHTML(rec, p)).decision` が DEC と deepStrictEqual
  - decision キーを消したレコード（旧レコード）→ `decision === null`、`{ result:'x' }` → `null`
  - `<!--<script>` を含む by.name（`'Y<!--<script>'`）でも往復し、`#recruit-record` のブロックに生の `< > &` が無い

**#71 保存レポートの報告書表示・最終合否（generateReportHTML・checklistSheetHtml）**
（#66 と同じ state で回答あり・判定 recommend の `rec`、`recH = rec ＋ decision 採用（笹川）`）
- `htmlH` に `<body class="view-report has-cl" data-filename="応募者_山田_花子_` と `_採用.html">`、`id="rtViewReport"`・`id="rtViewFull"`・`id="reportPaper"`・`id="clPaper"`・`id="clPaperDecision"`・`id="clDecision"`・`id="decision"`・`id="rhDecision"`
- 並び: `id="clPaper"` < `<header class="rh">`、`<h2>応募者の管理</h2>` < `id="decision"` < `id="mgmt"`
- `noScript(htmlH)` 中の `<svg class="verdict-stamp"` が 4 個（紙・印刷用・パネル・ヘッダー）、`<svg class="hanko"` は state の management どおり（#53 の数え方）
- `#recruit-mgmt-config` の JSON の `decision.hireLabel === '採用'`・`decision.sub === '新宿'`・`decision.stampField === 'final'`
- `htmlH` に `addEventListener("beforeprint"`・`__setReportView`・`function verdictSvg(` があり、`(htmlH.match(/<\/script>/g)||[]).length === (htmlH.match(/<script[ >]/g)||[]).length`
- 食い違い注記: `rec ＋ decision 不採用`（判定 recommend）→ `アプリの判定「` を含む。`recH`（採用・recommend）→ 含まない
- 回答なし（`checklist: R.emptyChecklist(), judgment: null, step: 2`）→ `<body class="view-report" data-filename=`（has-cl なし）・`id="clPaper"` なし・`id="decision"` あり・`id="rtViewReport"` あり
- decision 無効（`p.management.decision.enabled = false`）＋ `recH` → `id="decision"`・`cl-decision`・`id="rhDecision"` が無く、data-filename に `_採用` が無い。埋め込み JSON の decision は残る
- `S.checklistSheetHtml(recH, p, { mode:'section' })` に `cl-decision` が無い。`S.checklistSheetHtml(rec, p, { mode:'sheet' })` に `cl-decision is-none` と `未押印`・`class="cl-judge"`・`cl-judge-row`
- `S.reportCss()` と `S.checklistSheetCss()` に `</` + `script` が無い

### 8-2. e2e E30（tests/e2e.js。**E29 の後・最後の `expect(errors.length === 0, 'ERRORS: '…` の前**に追加）
E29 の終わりで他劇場のプロファイルが入っているので `fresh()` から始める。ヘルパー（E30 の先頭で定義）:
```js
const pdfPages30 = (f) => { try { return Number((require('child_process').execSync('pdfinfo "' + f + '"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().match(/Pages:\s+(\d+)/) || [])[1]); } catch (e) { return -1; } };
const pdfText30 = (f) => { try { return require('child_process').execSync('pdftotext -layout "' + f + '" -', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/\s+/g, ''); } catch (e) { return null; } };
const shownIn = (pg, sel) => pg.evaluate(s => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0 && (!el.checkVisibility || el.checkVisibility()); }, sel);
const txtIn = (pg, sel) => pg.evaluate(s => (document.querySelector(s) || {}).textContent || '', sel);
const SASA = '笹川 晴央（副支配人）';
const newReportPage = async (errs) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); }); p.on('dialog', d => d.accept()); await p.clock.setFixedTime(NOW); return p; };
```
手順と expect（文言はこのとおり。`+ ': ' + 詳細` は付けてよい）:
1. 入力 → 判定: `fresh()` → `fillBasic({ name: '合否 太郎', age: 20, category: '大学2年生', graduationDate: '2029-03', shifts: [['sat','10:00','18:00'],['sun','10:00','18:00']], daysMin: 2, daysMax: 3, workPeriod: 'long', preFill: false })` → `toHandoff()` → `[data-action="to-step"][data-step="3"]` → E25 と同じ「面接で確認する項目」の入力（`busyAllFull()`、weekendFreq `every_both`、holidayWork `ok`、allNight.availability `ng`、lateNight.availability `ok`＋returnMethod `taxi`＋taxiFare `2500`、sideJob `no`、continueAfterGraduation `undecided`）→ `rateAll('good')` → `navStep(2)` → `checkAll()` → step 3 → `judge()` → `const j30 = await judgment();`
   - `E30 判定後の Step4 に「最終合否」カード（未押印）`: step 4・`#decisionCard` があり text に `未押印`・`#decisionCard svg.verdict-stamp` なし・`#sumDecision` なし
2. Step4 の `#mgmtCard .stamp-box[data-field-id="interviewer"]` で `SASA` を選び押印 → `const saved30 = await saveRecord('saved-decision.html');`
   - `E30 保存（面接対応者の押印あり・合否なし）: body.view-report.has-cl・紙プレビュー・最終合否パネル`: `saved30.rec.decision == null`・`rec.management.interviewer.name === '笹川 晴央'`・html に `<body class="view-report has-cl" data-filename="応募者_合否_太郎_2026-10-10.html">`・`id="clPaper"`・`id="decision"`・`id="rtViewReport"`
3. `const rp30Err = []; const rp30 = await newReportPage(rp30Err); await rp30.goto('file://' + saved30.file);`
   - `E30 保存HTMLは報告書表示で開く（紙の報告シート・最終合否・押印だけ。ヘッダー・ダッシュ・判定の節は隠し、印刷用 #clSheet は非表示のまま）`: body に `view-report`（`view-full` なし）・`shownIn('#clPaper .cl-sheet')`・`!shownIn('.rh')`・`!shownIn('section.sec[data-sec="judgment"]')`・`.dash` display `none`・`shownIn('#decision')`・`shownIn('#mgmt')`・`#clSheet` display `none`
   - `E30 紙プレビュー（白地・影・シート幅 190mm）`: `#clPaper` の backgroundColor `rgb(255, 255, 255)`・boxShadow が `none` でない・`#clPaper .cl-sheet` の幅が 718.1±2px
4. `#rtViewFull` クリック → `E30 「詳細」で全体レポート（ヘッダー・ダッシュ・全節）に切り替わる`: body `view-full`（`view-report` なし）・`.rh`・`.dash`・`section.sec[data-sec="judgment"]` が見え・`#clPaper` が見えず・`#decision` が見える
5. `#rtViewReport` クリック → `E30 「報告書」で報告書表示に戻る`: body `view-report`・`#clPaper .cl-sheet` が見える
6. `rp30.selectOption('#decision select', { label: SASA })` → `#decision [data-act="decide"][data-value="hire"]` クリック
   - `E30 「採用」で報告シート（紙・印刷用）・最終合否パネル・ヘッダーに朱の採用スタンプ`: `#clPaper .cl-decision` に `svg.verdict-stamp`・text に `採用` と `笹川 晴央`・svg の aria-label が `採用` で始まる・svg 内の最初の `rect` の stroke が `#c8232c`・`#clSheet .cl-decision` の id が `clDecision` で `svg.verdict-stamp` あり・`#decision svg.verdict-stamp` あり・`#decision .dec-meta` に `採用・笹川 晴央`・`#rhDecision svg.verdict-stamp` あり
   - `E30 最終確認欄に同じ担当者の電子印が自動で押され、保存バーと「取消」が出る`: `#mgmt .stamp-box[data-field-id="final"] svg.hanko` あり・その `.stamp-meta` に `笹川 晴央`・`#mgmtSave` に `show`・`#decision [data-act="undecide"]` の display が `none` でない
   - `E30 ファイル名（data-filename）が _採用.html になる`: `document.body.getAttribute('data-filename') === '応募者_合否_太郎_2026-10-10_採用.html'`
7. `#rtViewFull` をクリックしてから（「詳細」のまま保存しても報告書で開くことの確認）`[dl30] = Promise.all([rp30.waitForEvent('download'), rp30.click('#mgmtSaveBtn')])` → `file30b = path.join(OUT, 'saved-decision-hire.html')` に saveAs → `html30b` / `rec30b = parseRecord(html30b)`
   - `E30 押印を保存したファイル名は 基本名_採用.html`: `suggestedFilename()` が `応募者_合否_太郎_2026-10-10_採用.html` または `download`（X4）かつ html30b に `data-filename="応募者_合否_太郎_2026-10-10_採用.html"`
   - `E30 再出力ファイルの埋め込みデータに decision（採用・笹川・2026.10.10）と最終確認の押印`: `rec30b.decision` が `result 'hire'`・`label '採用'`・`date '2026.10.10'`・`at` が空でない文字列・`by` が `{ name:'笹川 晴央', short:'笹川', title:'副支配人' }`、`rec30b.management.final.name === '笹川 晴央'`・`rec30b.management.interviewer.name === '笹川 晴央'`・`rec30b.schemaVersion === 2`
8. `rp30.goto('file://' + file30b)`
   - `E30 再出力ファイルは報告書表示で開き、合否・押印が残る（担当者は最終確認の人を初期選択）`: body `view-report`（`view-full` なし）・`#clPaper .cl-decision svg.verdict-stamp`・`#mgmt .stamp-box[data-field-id="final"] svg.hanko`・`#mgmtSave` に `show` なし・`#decision select` の選択中 option の text に `笹川 晴央`
9. `rp30.evaluate(() => window.__prepareChecklistSheet(true))` → `emulateMedia({ media: 'print' })` → 見える `.page > *`（E27 と同じ式）・`#clSheet .cl-decision svg.verdict-stamp` の display・`#decision` の display を取得 → `rp30.pdf({ path: OUT/checklist-report-decision.pdf, format:'A4', preferCSSPageSize:true, printBackground:true })`
   - `E30 面接チェックリスト報告の印刷（A4 1〜2 枚）に合否スタンプ・パネルは出さない`: 見える要素 `clSheet,mgmt`・svg が見える・`#decision` は `none`・pdfinfo が -1 または 1〜2・pdftotext が null または `最終合否` と `笹川晴央` を含む
   - 後始末: `emulateMedia({ media: 'screen' })` → `__prepareChecklistSheet(false)`
10. 報告書表示のまま印刷（Ctrl+P 相当。**emulateMedia しないで** `rp30.pdf({ path: OUT/report-view-print.pdf, … })`。page.pdf が beforeprint/afterprint を発火する）
   - `E30 報告書表示のまま印刷すると面接チェックリスト報告（A4 1〜2 枚）・印刷後は報告書表示に戻る`: pages -1 または 1〜2・pdftotext が null または `面接チェックリスト報告` を含む・body に `print-checklist` なし・`view-report` あり
11. アプリで読み込み: `page.click('#btnNew')` → `page.setInputFiles('#fileInput', file30b)` → wait 500
   - `E30 アプリの「読み込み」で Step4 の最終合否カードと右サマリーに「採用・笹川」`: step 4・`state.decision.result === 'hire'`・`state.decision.by.name === '笹川 晴央'`・`state.management.final.name === '笹川 晴央'`・`txtIn(page,'#decisionCard')` に `採用・笹川`・`#decisionCard svg.verdict-stamp` あり・`txtIn(page,'#sumDecision')` に `採用・笹川`
12. `navStep(3)` → `judge()` → `E30 再判定しても最終合否は消えない`: step 4・`state.decision.result === 'hire'`
13. `const saved30c = await saveRecord('saved-decision-resave.html');` → `E30 アプリで再保存しても decision が残り、ファイル名に _採用`: `rec.decision.result === 'hire'`・`by.name === '笹川 晴央'`・`date === '2026.10.10'`・html に `data-filename="応募者_合否_太郎_2026-10-10_採用.html"`
14. `await shot('35-step4-decision.png', true);` → `E30 レポートのページエラー・console error なし`: `rp30Err.length === 0` → `rp30.close()`

### 8-3. e2e E31（E30 の直後）
1. `const rp31Err = []; const rp31 = await newReportPage(rp31Err); await rp31.goto('file://' + file30b);` → `const hanko31 = (await rp31.$$('#mgmt svg.hanko')).length;` → select `SASA` → `[data-act="decide"][data-value="reject"]`
   - `E31 「不採用」に切り替え（藍のスタンプ・最終確認の印は増えない・ファイル名の接尾辞を置き換え）`: `#clPaper .cl-decision` text に `不採用`・svg aria-label が `不採用` で始まる・最初の rect の stroke `#1f4e8c`・`#mgmt svg.hanko` の数 === hanko31・data-filename === `応募者_合否_太郎_2026-10-10_不採用.html`・不採用ボタンの `aria-pressed === 'true'`
   - `E31 判定（{j30.result}）と食い違う合否には注記を出す（止めない）`: `#decision .dec-note` が見えて文字があること === `(j30.result === 'recommend')`
2. `[data-act="undecide"]` クリック
   - `E31 「取消」で未押印に戻る（最終確認の印は残る・ファイル名の接尾辞も外れる）`: `#clPaper .cl-decision` に svg なし・text に `未押印`・`#clSheet .cl-decision` に svg なし・`#decision` に svg なし・`#rhDecision` の innerHTML が `''`・取消ボタンの display `none`・`#mgmt svg.hanko` の数 === hanko31・data-filename === `応募者_合否_太郎_2026-10-10.html`・`#mgmtSave` に `show`
3. 押印を保存 → `file31 = OUT/saved-decision-undone.html` → `E31 取消して保存すると decision は null・最終確認の印は残る`: `rec.decision === null`・`rec.management.final.name === '笹川 晴央'`・html に `data-filename="応募者_合否_太郎_2026-10-10.html"`
4. `rp31.goto('file://' + savedE22.file)`（E22 の Step2 保存＝チェックリスト回答なし）
   - `E31 チェックリスト無しの記録の報告書表示は申し送りシート相当（応募時・コメント・留意点・面接で確認・押印＋最終合否）`: body に `view-report` あり `has-cl` なし・見える `section.sec` の data-sec が `pre,comment,handoff,interview,mgmt` または `pre,handoff,interview,mgmt`・`.dash` display `none`・`#clPaper` が存在しない・`.rh` と `#decision` が見える
   - `#rtViewFull` クリック → `E31 チェックリスト無しの記録も「詳細」で全節`: 見える節に `contrib` と `judgment`・`.dash` が見える
5. `rp31.goto('file://' + savedE23.file)` → `#rtViewFull` → `emulateMedia({ media:'print' })` → `rp31.pdf({ path: OUT/full-report-detail-view.pdf, … })`
   - `E31 「詳細」表示の印刷は全体レポート（3〜6 ページ・#clSheet なし）`: pages が -1 または 3〜6・`#clSheet` display `none`・`section.sec[data-sec="checklist"]` display が `none` でない → `emulateMedia({ media:'screen' })`
6. ダーク: `rp31.emulateMedia({ colorScheme: 'dark' })` → `goto(file30b)`
   - `E31 ダークモードでも紙プレビューは白地・黒字`: `#clPaper` backgroundColor `rgb(255, 255, 255)`・`#clPaper .cl-sheet` color `rgb(17, 17, 17)`・`#clPaper .cl-decision svg.verdict-stamp` が見える（file30b は採用）
   - `rp31.screenshot({ path: OUT/33-report-view-decision.png, fullPage: true })` → `emulateMedia({ colorScheme: 'light' })`
7. 幅: 1280 と 1440（height 900）で `E31 {w}px 幅で紙プレビューが画面内に収まる`: `scrollWidth - innerWidth <= 1`・`#clPaper` の rect が `left >= 0` かつ `right <= innerWidth`。390 で `E31 390px 幅では紙プレビューだけ横スクロール（ページ全体は横スクロールしない）`: `scrollWidth - innerWidth <= 1`・`.paper-wrap` の `scrollWidth > clientWidth`・overflowX `auto` → `rp31.screenshot(OUT/34-report-view-narrow.png, fullPage)` → `E31 レポートのページエラー・console error なし`（`rp31Err.length === 0`）→ `rp31.close()`
8. アプリ Step4（E30 の再保存の後なので Step4・採用・最終確認押印済み）
   - `#decisionCard [data-action="undecide"]` → `E31 アプリの「取消」で未押印に戻る`: `state.decision === null`・`#decisionCard` の text に `未押印`・`#sumDecision` なし
   - `#mgmtCard .stamp-box[data-field-id="final"] [data-action="unstamp"]` → `page.selectOption('#decisionManager', { label: SASA })` → `#decisionCard [data-action="decide"][data-value="reject"]`
   - `E31 アプリ Step4 で「不採用」→ 未押印の最終確認欄にも自動で押印・右サマリーに「不採用・笹川」`: `state.decision.result === 'reject'`・`label === '不採用'`・`by.name === '笹川 晴央'`・`state.management.final.name === '笹川 晴央'`・`final.date === '2026.10.10'`・`state.dirty === true`・`#decisionCard svg.verdict-stamp`・`#mgmtCard .stamp-box[data-field-id="final"] svg.hanko`・`#sumDecision` の text に `不採用・笹川`
9. 設定: `toView('settings')`
   - `E31 設定「応募者の管理」に最終合否（有効・表示名・採用／不採用・押印欄と連動・ファイル名）`: `[data-bind="management.decision.enabled"]` checked・`label` 値 `最終合否`・`hireLabel` 値 `採用`・`rejectLabel` 値 `不採用`・`stampField` 値 `final`・`autoStampFinal` checked・`filenameSuffix` checked
   - `page.click('label:has([data-bind="management.decision.enabled"])')` → `saveSettings()` → `toView('judge')` → `E31 最終合否を OFF にすると Step4 のカード・サマリーを出さない（記録は保持）`: step 4・`#decisionCard` なし・`#sumDecision` なし・`state.decision.result === 'reject'`
   - もう一度 ON にして保存 → `toView('judge')` → `E31 ON に戻すと Step4 のカードが戻る`: `#decisionCard svg.verdict-stamp` あり
   - （この後に既存の最終チェック `ERRORS` が続く。main の `errors` が 0 件であること）

---

## 9. ドキュメント（D8・D11）
- `docs/SPEC-report.md`: 本書
- `docs/HANDOFF.md`:
  - 表題を「引き継ぎメモ — フェーズ5（報告書表示・最終合否スタンプ）完了時点」に、1-4 のテスト件数（単体 77 件・e2e E1〜E31）を更新
  - 末尾に **「## 11. 報告書表示・最終合否スタンプ — 追加分（フェーズ5。詳細は `docs/SPEC-report.md`）」**: 11-1 運用フロー（本書冒頭の 1〜4）、11-2 決定事項（D1〜D12 と X1〜X13 の要約。特に X1 紙プレビュー＝`#clPaper`、X3 beforeprint と E24 の関係、X5 取消は合否だけ）、11-3 触る場所（stamp.js `verdictSvg`/`decisionSheetHtml`/`decisionFilename`、storage.js `normalizeDecision`/`decisionConfig`/`checklistSheetHtml` の `.cl-judge-row`/`generateReportHTML` の `.rtool-view`・`.paper-wrap`・`#decision`・`#rhDecision`・2 つの埋め込みスクリプト、app.js `decisionCardHtml`/`decide`/`undecide`/`#sumDecision`、settings.js `mgmtHtml`、config.default.js `management.decision`）、11-4 テスト（#67〜#71、E30・E31 の要点、実測ページ数）、11-5 既知の制限（回答なしの記録で Ctrl+P は全体印刷のまま／申し送りシートの印刷には合否を出さない／ブラウザのメニューから印刷しても beforeprint で報告書になる／ブラウザ以外（メールのプレビュー等）ではスクリプトが動かず押せない）
- `README.md` の「使い方（配布）」に「最終合否（採用／不採用）」の小見出しを足し、運用フロー（面接者が出力 → 副支配人が開いて合否＋電子印 → 押印を保存で再出力 → 読み込みで引き継ぎ）と、保存 HTML が「報告書」表示で開くこと・「詳細」で全体レポート・印刷ボタン 3 種・ファイル名の `_採用` / `_不採用`・設定（応募者の管理 → 最終合否）を書く。「開発」節のテスト件数も更新

---

## 10. 実装手順（この順で）
1. `src/config.default.js`: `management.decision`（1-3）
2. `src/stamp.js`: `verdictSvg` / `decisionSheetHtml` / `decisionFilename`、公開名、`source()`（2 章）
3. `src/storage.js`: `normalizeDecision`・`decisionConfig`・`fillArrays` の decision 正規化・`validateProfile`・`buildRecord`・`parseRecordFromHTML`・`checklistSheetHtml`（4-7）・`checklistSheetCss`（5-2）・`reportCss`（5-1）・`generateReportHTML`（4 章。2 つの埋め込みスクリプト）・export に `normalizeDecision` / `decisionConfig`
4. `node tests/rules.test.js`（既存 72 件が緑のまま）→ #67〜#71 を追加して緑
5. `src/app.js`（6 章）→ `src/styles.css`（5-3）→ `src/settings.js`（7 章）
6. `node build.js`（`dist/toho-recruit-judge.html` を更新）
7. `tests/e2e.js` に E30・E31 を追加 → `node tests/e2e.js` で **ALL PASSED**（既存の E1〜E29 を含む）
8. ドキュメント（9 章）

## 11. 落とし穴
- **build.js**: src の JS に文字列 `</script` があると失敗（コメント内も）。閉じタグは `SCRIPT_END`（`'</scr' + 'ipt>'`）だけで書く。コメントに `<!--<script>` も書かない。`source()` に入る関数のコメントも同じ
- **source() の純関数**: 2-4 の 5 関数は `RecruitStamp`・`RecruitUtil`・`window` を参照しない（`decisionSheetHtml` → `verdictSvg` だけ可）。ES5。#67 が空の vm で実行して確かめる
- **埋め込みスクリプトの文字列**: storage.js では JS コードを JS の文字列として連結する。二重引用符・バックスラッシュ・正規表現のエスケープに注意（正規表現は `decisionFilename` に寄せ、埋め込み側に新しい正規表現を書かない）。`today()`・`pad()`・`render()`・`dirty` などの既存の名前を使い回す。`source()` の関数名と衝突させない
- **E27**: 画面で `#clSheet` は display:none のまま。紙は `#clPaper`。print-checklist で見える `.page > *` は `clSheet,mgmt` だけ（紙・パネルを `.page` 直下の別要素にしない／パネルは mgmt 節の中）
- **E23/E27 の申し送りシート**: 見える `section.sec` は増やさない。`#decision` は print-handoff で隠す
- **E22**: `#mgmt .stamp-box` は 3 個のまま（パネルは `#mgmt` の外）。合否の svg に `hanko` クラスを付けない。保存バー・`再保存`・ファイル名（合否なしなら従来どおり）
- **単体 #53**: allowFreeName OFF のとき `__free` をパネルにも出さない。`recNode.textContent=JSON.stringify(rec).replace(/[<>&` の行・`addEventListener("beforeunload"` を残す
- **単体 #66**: `class="cl-judge"` の文字列と `<ul class="cl-adj"><li><b>` の形を保つ（wrapper は内側に入れる）。script 要素の開始・終了の数を揃える（新しい script 要素は作らず既存の 2 つに足す）
- **X2**: 報告書表示の隠す規則は `:not(.print-checklist):not(.print-handoff)` を必ず付ける（`prepCl` の計測中に `#clSheet` を隠すと `.cl-fit` が狂い、重いサンプルが 3 ページになる）
- **X3**: `page.pdf()` は beforeprint を発火する。E30 の「報告書表示のまま印刷」は `emulateMedia('print')` をせずに pdf を取る（screen のまま beforeprint で計測させる）。「レポート全体」ボタンは `printingAll` で切替を抑止
- **filter id**: 同じ文書に合否 svg が最大 4 つ（紙・印刷用・パネル・ヘッダー）。id を 3-1 の値で分ける（`#clSheet` は display:none なので、そこで定義した filter を他の svg が参照すると描かれない）
- **select の初期選択**: `outerHTML` は select の現在値を保存しない。読み込み時にスクリプトで選び直す（initDecSel）
- **data-filename**: `render()` のたびに `decisionFilename` で付け直す（冪等）。書き出す HTML と `a.download` の両方に入る
- **設定保存**: `onSave` は `invalidateJudgment()` するが `state.decision` には触れない
- **公開リポジトリ**: 名簿・テスト・ドキュメントに笹川 晴央以外の実名を書かない（例示は「山田 太郎」）

---

## 12. 実装時の差分（実装者メモ。2026-10-13）
本書どおりに実装し、次の点だけ変えた・補った（いずれもテストは緑: 単体 77 件・e2e 418 件 ALL PASSED）。
- `decisionFilename` の外す候補に `dec.label` も入れた（表示名を「合格 A」などに変えたとき、#68 の冪等 `F(F(x)) === F(x)` を満たすため）。比較は正規表現ではなく末尾の文字列一致
- `verdictSvg` は日付も副文も空のとき、表示名のベースラインを 48 にして枠の中央に置く（2-1 は下段ありの 42.5 のみ記載）
- `validateProfile` の表示名チェックは「空」と「同一」を else-if にした（両方空のときにエラーを 2 件出さない）
- `mgFields` が空で decision 有効のときも、パネルの保存ができるよう保存バー `#mgmtSave` と注記を出す（4-6 は「押印欄は設定されていません。」のみ記載。通常は fields が空にならないので実害なし）
- `RecruitStorage.reportCss` を export した（#71 が `S.reportCss()` を呼ぶため）
- 単体 #71 の注記・無効時の確認は、埋め込みスクリプトに同じ文言・関数ソースがあるため script 要素を除いた HTML（`noScript`）で調べる
- 設定画面: 「採用」「不採用」の表示名の欄は `data-repaint`（プレビューを更新）。プレビューの下に説明を 1 行追加
- アプリ: `rerenderDecisionCard` は無効時にカードを外す。未押印のカードの `#decisionMeta` は muted 表示
- e2e E30 の 9 の後始末は `emulateMedia({ media: null })`（`'screen'` に固定すると、続く 10 の `page.pdf()` が screen で描かれ全体レポート 7 ページになるため）
- スクリーンショット名: `33-report-view.png`（報告書表示・採用押印後）、`34-report-view-dark.png`、`35-report-full.png`（詳細）、`36-step4-decision.png`、`37-report-view-narrow.png`（390px）。8-2・8-3 の名前（33-report-view-decision / 34-report-view-narrow / 35-step4-decision）から変更

