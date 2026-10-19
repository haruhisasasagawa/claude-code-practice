# SPEC-a4 — 保存 HTML を「A4 縦の用紙 1 枚」にする（作業仕様）

作成 2026-10-14。基準コミット `a9e39cb`（全テスト緑: 単体 29 件・e2e E1〜E13 190 チェック）。**commit / push はしない**。
**追記 2026-10-14（基準 `38e46bd`）**: 11 章「最終承認のパスワード」・12 章「用紙を埋めるレイアウト」。旧 11 章「実装メモ」は 13 章。S4（押印行は内容の直後）は 12 章で変更した。
**行番号はすべて a9e39cb 時点の目安**。関数名・定数名・id で探すこと。作業用ファイルは scratchpad に置く。
**追記 2026-10-16（`docs/SPEC-flow.md` 5-2）**: 面接メモ・所見の枠の質問の回答は**質問ごとの行** `.cl-nm-row.cl-nm-q[data-cl-note=質問 id]`（キー「①短い名前」・値は 2 行まで。2026-10-16 より前の記録の質問ブロックのメモは今までどおり `data-cl-block` の「1 問目 ほか n 問」の行）。保存 HTML の窓 `memoOf` は `data-cl-note` → `data-cl-block` の順に探す。応募者の 2 行目（`dl.cl-sh-kv`）の末尾に「面接時間 18分（目安 41分）」（評価で入れた分か、タイマーの合計。記録が無い・0 秒なら出さない）。1 ページ保証（`clFitSheet` の段階・広げる処理）・押印行・画面と印刷の一致は変えない（質問ごとの行が 13 行の重いサンプルは `.cl-compact-q1` で 1 ページ）。アプリの ③ は報告書（step 4）。**追記 2026-10-17（SPEC-flow 15-2・15-3）**: 用紙は変えていない。アプリの報告書の操作行（保存・印刷）は画面の右下に固定し、本文の下に操作行の高さの余白（押印・最終合否のカードは操作行に隠れない）。面接時間がタイマーの合計（手入力なし）で目安の 1/4 未満か 2 倍を超えるときは、報告書の確認事項に「面接時間を確かめてください」（用紙には出さない）

---

## 0. 目的・前提・決定事項

### 0-1. ユーザー（副支配人）の指示
> あと出力のHTMLはa4たてがたをイメージ。その様式で印刷もしたい。（別にしない）

### 0-2. ユーザーの選択（変更不可）
- 「詳細」表示（台本の全文・長いメモの全文）は**なくして A4 1 枚だけ**。メモが長くて「…」で切れたときは、画面でそのメモをクリックすると全文を表示（印刷は常に 1 枚）
- 押印と最終合否は**用紙の欄を直接クリック**。小さな窓（ポップオーバー）で担当者を選んで押す。用紙の外に常設の操作パネルは置かない（窓は印刷されない）

### 0-3. オーケストレータの設計（A1〜A13。要約。本書はこれを具体化する）
A1 保存 HTML は body 直下の用紙 `main.a4#a4`（210×297mm 固定・内側の余白 8mm／10mm）そのもの。画面と印刷で同じ要素・寸法・文字組み。印刷専用の複製・詳細表示・操作カード類は削除 ／ A2 中身は現行の 1 ページ要約＋押印行（最下段） ／ A3 見出しは白地＋濃紺 2px の下線・左にロゴ＋題・右に版／劇場／作成日 ／ A4 押印行込みの用紙を内寸の高さで計測（読み込み時に確定し、印刷時に切り替えない） ／ A5 押印は欄クリックの窓 ／ A6 最終合否は `.cl-decision` クリックの窓 ／ A7 右上の通知バーで保存（レビュー後に**右下**へ変更。13 章） ／ A8 切れたメモはクリックで全文 ／ A9 狭い画面は縮小表示 ／ A10 アプリ ③ の紙と A4 印刷も同じ用紙 ／ A11 旧い保存 HTML の互換 ／ A12 テスト ／ A13 docs

### 0-4. 本書の決定（S1〜S16。迷ったらここに従う）
| # | 決定 |
| --- | --- |
| S1 | 用紙の中身は `storage.checklistSheetHtml(record, profile, o)` が作る `.cl-sheet.cl-mode-sheet`（**常に 1 ページの要約**。`o.mode` は無視し、`'section'` は削除）。押印行も同じ関数が `record.management` と `profile.management.fields` から描く（`o.stamps` の HTML 文字列渡しは廃止。`app.checklistStampsHtml` は削除） |
| S2 | 用紙の箱 `.a4` の規則（寸法・余白・白地・影・`overflow:hidden`）は**共有の `checklistSheetCss()`** に置く（アプリ ③ と保存 HTML とアプリの印刷で同じ規則）。ページ配置（灰色の背景・上下 24px・`@page`）は保存 HTML 用の `reportCss()`、アプリ用は `styles.css` |
| S3 | 1 ページの上限は**定数 `CL_SHEET_LIMIT_PX = 1052`**（内寸 281mm ≒ 1062.0px から 10px の余裕）。`.cl-sheet` 全体（押印行を含む）の高さで計る。`checklistSheetLimit(n)`・`CL_SHEET_PAGE_PX`・`CL_SHEET_STAMPS_PX`・`CL_SHEET_STAMP_ROW_PX`・`CL_SHEET_BODY_PX` は削除 |
| S4 | 押印行は内容の直後（`margin-top:10px`）に置く。用紙の下端に固定しない（固定すると計測が複雑になり、縮小時の位置もずれるため）。用紙の下の余白は空白のまま。**→ 12 章で変更**: 押印行は用紙の内寸の下端・空いた高さは面接メモ・所見の枠（計測は `.cl-measure` で内容の高さ） |
| S5 | 保存 HTML のスクリプトは**1 本**（計測・縮小・窓・押印・合否・長いメモ・保存バー・書き出し）。窓 `.pop` と保存バー `.savebar` は**スクリプトが必要なときに body の末尾に作る**（生成 HTML には無い）。押せる欄の印（`data-a4-t`・`tabindex` など）もスクリプトが付ける |
| S6 | 書き出しは `document.documentElement.cloneNode(true)` の**複製を掃除してから** `outerHTML`（窓・バー・`body.a4-live`・`data-a4-t` 系の属性・`--a4-zoom` を外す）。生きているページは書き換えない |
| S7 | 狭い画面の縮小は **CSS 変数 `--a4-zoom` を `<html>` に置き、`@media screen{.a4{zoom:var(--a4-zoom,1)}}`**。計測（`clFitSheet`）は必ず `--a4-zoom` を外した状態で行う（試作で確認: 祖先の zoom 0.5 で `getBoundingClientRect` は 735→380px、`offsetHeight` も文字の折り返しが変わって 736→760px になる） |
| S8 | `beforeprint`/`afterprint`/`matchMedia('print')` は保存 HTML では**使わない**（印刷のための切替なし）。`resize` では縮小だけをやり直し、計測はしない |
| S9 | 計測のやり直しは「スクリプト実行時」「`window` の `load`」「`document.fonts.ready`」「押印・合否を変えたあと（render）」だけ（`load`・`fonts.ready` は、フォントか画像の読み込みの状態が前の計測から変わったときだけ。12 章 F8） |
| S10 | 窓の中のエラーは `alert()` ではなく窓の中の 1 行（`.pop-err`）。文言は従来どおり「担当者を選んでください」「氏名を入力してください」 |
| S11 | 押印・取消・合否の取消のあとは窓を閉じる。**採用／不採用を押した結果が判定と食い違うとき（採用×不採用推奨・不採用×採用推奨）だけ、窓を開いたまま注記を見せる** |
| S12 | 長いメモの全文は埋め込み JSON の `rec` から取る（`rec.checklist.notes[ブロック id／確認点 id]`・`rec.interviewNotes`・`rec.applicant.reviewerNotes`。無ければ要素の `textContent`）。窓には `textContent` で入れる（innerHTML にしない） |
| S13 | アプリの印刷は印刷ホスト `#clSheet` を**残す**（① ② ③・トップバー・Ctrl+P のどこからでも印刷でき、紙プレビューは ③ にしか無いため。入れ子の要素だけを印刷する CSS は壊れやすい）。ただしホストの中身は ③ と**同じ部品**（`div.a4` ＋同じ関数・同じ CSS・同じ計測）にする＝見た目の差が出ない |
| S14 | 用紙の下（用紙の外・灰色の余白）に画面専用の 1 行 `footer.a4-foot`（`meta.footer`＋「このファイルはアプリの「読み込み」で再度開けます。埋め込みデータは編集しないでください」）。操作は置かない。印刷しない |
| S15 | `<title>` は `面接チェックリスト報告 - {氏名}さん | {劇場名}`。body は `<body class="a4-doc" data-filename="…">` |
| S16 | ロゴの検証は `storage.brandLogo()` 1 か所（`/^data:image\/(png\|jpeg\|webp\|svg\+xml);base64,[A-Za-z0-9+/=]+$/`。alt は `logoAlt` → `meta.theaterName`。エスケープする）。app.js `renderBrand` もこれを使う |

### 0-5. 試作で確かめたこと（scratchpad/a4exp。Chromium 1194・Playwright 1.56.1）
- `.a4{box-sizing:border-box;width:210mm;height:297mm;padding:8mm 10mm}` の画面の寸法は **793.69×1122.52px**
- `@page{size:A4 portrait;margin:0}`＋印刷で `.a4{margin:0;box-shadow:none}` → `page.pdf({format:'A4',printBackground:true})` は `preferCSSPageSize` が true / false のどちらでも **1 ページ**（高さ 297mm ちょうどでも 2 ページ目は出ない）
- 画面の要素スクリーンショットと `pdftoppm -r 96` の画像（どちらも 794×1123）を 400×566 に縮めると、白以外の外接矩形は小数 4 桁まで一致、8×8 ブロックの平均差 0.78（最大 21.7）
- 390px で `--a4-zoom:0.451` → 横スクロールなし。その状態の `page.pdf` も 1 ページ（`@media screen` の zoom は印刷に効かない）

---

## 1. 保存 HTML の DOM（確定値）

### 1-1. 全体
```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>面接チェックリスト報告 - 台本 花子さん | TOHOシネマズ新宿</title>
<style>{reportCss()}\n{checklistSheetCss()}</style>
</head>
<body class="a4-doc" data-filename="応募者_台本_花子_2026-10-10.html">
<main class="a4" id="a4">{checklistSheetHtml(record, profile, { decisionId: 'a4Decision', decisionSvgId: 'vdA4', stampSvgPrefix: 'a4s' })}</main>
<footer class="a4-foot" id="a4Foot">{meta.footer}　このファイルはアプリの「読み込み」で再度開けます。埋め込みデータは編集しないでください。</footer>
<script type="application/json" id="recruit-record">{jsonForScript(record)}</script>
<script type="application/json" id="recruit-mgmt-config">{jsonForScript(cfg)}</script>
<script>(function(){ … 3 章 … })();</script>
</body>
</html>
```
- `recruit-mgmt-config` は**常に出す**（押印欄 0・合否 OFF でも。長いメモの窓は常に使うため）。形: `{ fields:[{id,label,hint}], managers:[…], allowFreeName:bool, interviewerField:string, decision:{label,hireLabel,rejectLabel,hireColor,rejectColor,stampField,autoStampFinal,filenameSuffix,hint,sub}|null }`（`interviewerField` は `clProf.checklist.header.interviewerField`。新規キー）
- ファイル名（`data-filename`）の規則は現行どおり（`Stamp.decisionFilename(baseName, dec, dcfg)`。合否 OFF なら付けない）
- script 要素は 3 つ（JSON 2・コード 1）。閉じタグは `SCRIPT_END = '</scr' + 'ipt>'`

### 1-2. 用紙の中（`checklistSheetHtml` が返すもの）
```html
<div class="cl-sheet cl-mode-sheet">
  <div class="cl-sheet-head">
    <div class="cl-title">
      <img class="cl-title-logo" src="data:image/png;base64,…" alt="…">   <!-- brandLogo() があるときだけ -->
      <span class="cl-title-t">面接チェックリスト報告</span>
      <span class="cl-title-r">台本 2026-10-08 版 ／ TOHOシネマズ新宿 ／ 作成 2026/10/10</span>
    </div>
    <div class="cl-who">…（現行のまま）…</div>
  </div>
  <div class="cl-judge" data-result="recommend">…<div class="cl-decision is-none" id="a4Decision" data-result="">…</div></div>  <!-- 合否 OFF なら .cl-decision なし（現行どおり） -->
  <div class="cl-cols">…</div>
  <section class="cl-blk cl-blk-rate">…</section>
  <section class="cl-blk cl-blk-notes">… <p class="cl-nm-ref has-q"><span class="cl-nm-ref-c">…</span><span class="cl-nm-ref-q">…</span></p></section>
  <div class="cl-exline">…</div>
  <div class="cl-stamps"><div class="stamp-row cl-stamps-row cols-2">
    <div class="stamp-box" data-field-id="interviewer"><div class="stamp-label">面接対応者</div>
      <div class="stamp-area"><svg class="hanko" …id="a4s0"…>…</svg></div><div class="stamp-meta">笹川 晴央（副支配人）　2026.10.10</div></div>
    <div class="stamp-box" data-field-id="final"><div class="stamp-label">最終確認</div>
      <div class="stamp-area"><div class="stamp-empty">未押印</div></div><div class="stamp-meta"></div></div>
  </div></div>
</div>
```
- 見出し: 旧 `.cl-band`（濃紺の帯・3 つの span）を `.cl-title` に置き換える。`.cl-title-r` は `[版（def.version があれば「台本 {version} 版」）, meta.theaterName, '作成 ' + 作成日]` の空でないものを ` ／ ` で連結
- 押印行: 押印欄が 0 件なら `.cl-stamps` を出さない。`cols-2` は 2 件のときだけ。ハンコは `Stamp.render(e, { size: 46, id: o.stampSvgPrefix + idx })`（既定 prefix `'cl'`）。`stamp-meta` は `name（title）　date`
- 案内 1 行の文言（A8）: `.cl-nm-ref-c`「「…」で切れたメモは、画面でクリックすると全文を表示します」／ `.cl-nm-ref-q`「質問の回答は省略（画面でこの行をクリックすると、回答と「…」で切れたメモの全文を表示します）」
  - アプリ ③ の紙（`#appPaper`）だけは `o.refWhere = '保存した HTML の画面で'` を渡し、「「…」で切れたメモは、保存した HTML の画面でクリックすると全文を表示します」「質問の回答は省略（保存した HTML の画面でこの行をクリックすると、…）」と言い換える（③ の紙はクリックしても窓を出さないため。アプリの印刷 `#clSheet` と保存 HTML は「画面で」のまま＝印刷物の文言は同じ）
- id: 保存 HTML `a4Decision`/`vdA4`/`a4s{n}`、アプリ ③ `appPaperDecision`/`vdAppPaper`/`ap{n}`、アプリ印刷 `clDecision`/`vdSheet`/`cl{n}`（既定値）

### 1-3. スクリプトが付けるもの（生成 HTML には無い。書き出しの複製からは外す）
| 対象 | 付けるもの |
| --- | --- |
| `body` | class `a4-live`（スクリプトが動いている印。ホバーの案内・押せる見た目はこれが条件） |
| `<html>` | `style="--a4-zoom:0.451"`（狭い画面のときだけ） |
| `#a4 .cl-stamps .stamp-box[data-field-id]`（`cfg.fields` にある欄・`stampSvg` があるとき） | `data-a4-t="stamp"` `tabindex="0"` `role="button"` `aria-haspopup="dialog"` `aria-label="{label}の押印"` |
| `#a4Decision`（`cfg.decision` があるとき。描き直すたびに付け直す） | `data-a4-t="decision"` ほか同じ（`aria-label="{D.label}"`） |
| `.cl-nm-v.cl-cut`, `.cl-rt-nt.cl-cut`（切れたメモ） | `data-a4-t="memo"` ほか同じ（`aria-label="メモの全文を表示"`） |
| `.cl-nm-ref`（表示されているとき） | `data-a4-t="memos"` ほか同じ（`aria-label="面接メモの全文を表示"`） |
| 窓を開いている欄 | `aria-expanded="true"`（閉じると外す） |

`.cl-cut` は `clFitSheet` が付ける（4-2）。アプリの紙にも付くが、`body.a4-live` が無いので見た目は変わらない。

### 1-4. 窓（`.pop`。1 つだけ。開くときに作り、閉じると DOM から外す）
```html
<div class="pop" id="a4Pop" role="dialog" aria-labelledby="a4PopH" data-kind="stamp|decision|memo|memos">
  <div class="pop-h" id="a4PopH">最終確認</div>
  <div class="pop-sub">採用可否を最終確認した上長</div>            <!-- stamp: 欄の hint（空なら出さない） -->
  <div class="pop-b">
    <!-- stamp / decision -->
    <label class="pop-l"><span>担当者</span><select class="pop-sel"><option value="">担当者を選択</option><option value="0">笹川 晴央（副支配人）</option>…<option value="__free">名簿にない担当者（手入力）</option></select></label>
    <input class="pop-free" type="text" placeholder="氏名（例：山田 太郎）" hidden>   <!-- allowFreeName のときだけ -->
    <!-- decision だけ -->
    <div class="pop-ref">アプリの判定：採用推奨</div>                       <!-- rec.judgment があるとき -->
    <div class="pop-note">※ アプリの判定「採用推奨」と異なる最終合否です（記録はそのまま残ります）。</div>  <!-- 食い違うときだけ -->
    <div class="pop-err" role="alert"></div>
    <!-- memo --> <div class="pop-text">（全文。textContent）</div>
    <!-- memos --> <dl class="pop-memos"><dt>②前のバイトの期間・退職理由 ほか2問</dt><dd>（全文）</dd>…</dl>
  </div>
  <div class="pop-f">
    <!-- stamp -->    <button type="button" class="primary" data-act="stamp">押印</button><button type="button" data-act="unstamp">取消</button><button type="button" data-act="close">閉じる</button>
    <!-- decision --> <button type="button" class="pop-dec pop-hire [on]" data-act="decide" data-value="hire" aria-pressed="…">採用</button><button type="button" class="pop-dec pop-reject" data-act="decide" data-value="reject">不採用</button><button type="button" data-act="undecide">取消</button><button type="button" data-act="close">閉じる</button>
    <!-- memo / memos --> <button type="button" data-act="close">閉じる</button>
  </div>
</div>
```
- 取消（`unstamp`/`undecide`）は押印済み／合否ありのときだけ出す。採用／不採用のボタンの色は ~~`--dec-hire`/`--dec-reject`（`D.hireColor`/`D.rejectColor`）を窓の style に置く~~ → **2026-10-19 からアプリの報告書のセグメントと同じ**（押す前は中立・押した方〔`.on`〕は 採用＝緑 #146c43・不採用＝赤 #b42318 の塗り。スタンプのインクの色はハンコの絵だけ。`docs/DESIGN.md` 4-9・`docs/SPEC-flow.md` 16-8）。用紙の「最終合否 採用／不採用」の文字（`decisionSheetHtml` の `.cl-dec-v`）も 2026-10-19 からインクの style を付けず、用紙の CSS で 採用＝#146c43・不採用＝#b42318（`.cl-decision.is-hire`／`.is-reject`。同じ帯の結果のタイルと同じ意味の色。16-10 の 1）。窓の選択・入力欄と［取消］［閉じる］の枠は #848fa1・角丸 8（16-10 の 2。2-2）
- 担当者の初期選択: stamp = その欄の押印者 → （欄が `cfg.interviewerField` なら）`rec.checklist.header.interviewer` → なし。decision = `rec.management[D.stampField]` の押印者 → `rec.decision.by` → なし。名簿に無い名前は `__free`＋氏名欄に入れる（`allowFreeName` のとき）
- 見出し: stamp = 欄の label、decision = `D.label`、memo = 行の名前（`.cl-nm-k` の文字。確認点は「{①} {確認点の名前} のメモ」）、memos =「面接メモ（全文）」

### 1-5. 保存バー（`.savebar`。最初の変更で作る）
```html
<div class="savebar" id="saveBar" role="status" aria-live="polite"><span class="savebar-msg" id="saveBarMsg">押印・合否を変更しました</span><button type="button" class="savebar-btn" id="saveBarBtn">押印を保存</button>
  <button type="button" class="savebar-x" id="saveBarClose" aria-label="閉じる" title="閉じる" hidden>×</button></div>
```
- 変更あり（dirty）: 「押印・合否を変更しました」［押印を保存］（閉じられない）／書き出し後（saved かつ !dirty）:「保存しました（保存できなかったときは再保存）」［再保存］［×］。［×］でバーを外す（saved を下ろす）。どちらでもないときは作らない
- 位置は**画面の右下**（`position:fixed; right:12px; bottom:12px`）。当初の右上（A7）は 1280／1366px で用紙の右上（見出しの右端・最終合否の欄）に重なり、390px では縮小した用紙の見出し・氏名を隠し続けた（縦にスクロールできない）ため、レビュー後に右下へ移した。右下なら 390px では縮小した用紙の下の余白に出る
- バーが出ているあいだは `body.a4-sb`（`@media screen` で `padding-bottom: バーの高さ＋12px`。高さは `--a4-sbh` を body に置く）。いちばん下までスクロールすれば用紙と注記がバーに重ならない。印刷には効かない（`@media screen`。`--a4-sbh` は変数だけ）

### 1-6. 保存 HTML から削除するもの
`.page`・`.rtool`（`#rtViewReport`/`#rtViewFull`/`#rtPrintChecklist`/`.rtool-hint`）・`body.view-report`/`view-full`/`has-cl`/`mode-script`・`.paper-wrap#reportPaper`/`.paper-cap`/`.paper#clPaper`/`#clPaperDecision`・印刷専用 `#clSheet.cl-sheet-print`/`#clDecision`・`body.print-checklist`・ヘッダー `header.rh`（`.rh-*`・`.rh-mark`・`.rh-logo`・`.verdict`・`#rhDecision`）・`section.sec[data-sec=applicant|checklist|judgment|mgmt]`（`table.kv`・`.script-judge`・`.result`・`.adj`・`.warn-list`・`.disclaimer`）・`#mgmt`（大きい押印カード・`.stamp-ctl`・`.stamp-hint`）・`#decision`（`.decision`/`.dec-*`）・`#mgmtSave`/`#mgmtSaveMsg`/`#mgmtSaveBtn`・`.mgmt-note`・`.foot`・`window.__prepareChecklistSheet`/`__fitChecklistPaper`/`__setReportView`・beforeprint/afterprint の処理・`checklistSheetHtml` の `'section'` モード

---

## 2. CSS

### 2-1. 共有 `checklistSheetCss()`（アプリと保存 HTML）
追加:
```css
.a4{display:block;box-sizing:border-box;width:210mm;height:297mm;padding:8mm 10mm;margin:0 auto;background:#fff;color:#111;color-scheme:light;overflow:hidden;
  box-shadow:0 1px 3px rgba(16,24,40,.12),0 12px 32px rgba(16,24,40,.16)}
.cl-mode-sheet .cl-title{display:flex;align-items:center;gap:8px;min-height:7mm;padding:0 1px 3px;border-bottom:2px solid #24324a}
.cl-mode-sheet .cl-title-logo{flex:none;display:block;height:7mm;width:auto;max-width:50mm;object-fit:contain}
.cl-mode-sheet .cl-title-t{flex:none;font-size:13px;font-weight:800;letter-spacing:.04em;line-height:1.3;color:#1a2233}
.cl-mode-sheet .cl-title-r{margin-left:auto;min-width:0;font-size:8.5px;color:#3a4556;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cl-sheet .stamp-box,.cl-mode-sheet .cl-decision{position:relative}
.cl-sheet .hanko,.cl-sheet .verdict-stamp{filter:none !important}
```
- `.cl-mode-sheet .cl-band*` の規則は削除（`.cl-title` に置き換え）。`print-color-adjust` の並びの `.cl-sheet .cl-band` も `.cl-sheet .cl-title-logo` に替える
- `filter:none !important` は、アプリのダークテーマの `:root[data-theme="dark"] .hanko{filter:brightness(1.25)}`（詳細度 0,3,0）が用紙のハンコに効くのを止めるため（紙プレビューに押印行が入るので必要になる）
- 削除: `'section'` 用の規則すべて（`.cl-sheet .cl-s*`・`.cl-2col`・`.cl-b*`・`.cl-bt`・`.cl-must`・`.cl-rate`・`dl.cl-fields`・`ul.cl-checks`・`.cl-box`・`ol.cl-qs`・`.cl-memo*`・`.cl-hint`・`.cl-mode-section *`・`.cl-sflow`・`.cl-overall`・`.cl-ov-*`・`.cl-sheet table…`（sheet は `.cl-mode-sheet table.cl-mtab/.cl-rt` を持つので不要。消す前に sheet の表が崩れないか確認）・`.cl-sheet tr.t-*`）、印刷ホストの規則（`.cl-sheet-host,.cl-sheet-print{…}`・`body.print-checklist …` すべて・`@page clsheet`）、`@media print` 内の `.cl-mode-section` の規則
- 残す: `.cl-sheet{…}`・`.cl-sheet *{box-sizing}`・`.cl-sheet .cl-blank`・`.cl-mode-sheet …`（`.cl-compact` 系・`.cl-nm-ref` 系を含む）・`.cl-sheet .stamp-*`・`print-color-adjust:exact` の並び（`@media print` の外に出してよい）
- **用紙の中に画面幅で変わる規則（`@media (max-width…)`）を置かない**（画面と印刷で文字組みが変わり計測がずれる）

### 2-2. 保存 HTML 専用 `reportCss()`（作り直し。旧規則は全部消す）
> 色は 2026-10-18 に `docs/DESIGN.md` 4-9 の値へ置き換えた（このブロックの #1a2233・#5b6675・#1f5fbf などはその前の値）。窓 `.pop` の文字・フォーカス・最終合否のボタンは 2026-10-19 に下のとおり（`docs/SPEC-flow.md` 16-8）。
```css
:root{color-scheme:light}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#e6e9ee;color:#111;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,"Noto Sans JP",system-ui,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
body>.a4{margin:24px auto}
.a4-foot{width:210mm;max-width:calc(100% - 32px);margin:0 auto 24px;font-size:11px;line-height:1.5;color:#5b6675;text-align:center}
@media screen{
  .a4{zoom:var(--a4-zoom,1)}
  body.a4-live .a4 [data-a4-t]{cursor:pointer}
  body.a4-live .a4 [data-a4-t="stamp"]:hover,body.a4-live .a4 [data-a4-t="decision"]:hover,body.a4-live .a4 [aria-expanded="true"]{outline:2px solid rgba(31,95,191,.4);outline-offset:1px}
  body.a4-live .a4 [data-a4-t]:focus-visible{outline:2px solid #1f5fbf;outline-offset:1px}
  body.a4-live .a4 [data-a4-t="stamp"]:hover::after{content:"クリックで押印"}
  body.a4-live .a4 [data-a4-t="decision"]:hover::after{content:"クリックで合否を押す"}
  body.a4-live .a4 [data-a4-t="stamp"]:hover::after,body.a4-live .a4 [data-a4-t="decision"]:hover::after{position:absolute;right:3px;bottom:2px;padding:0 4px;border-radius:3px;background:#1f5fbf;color:#fff;font-size:8px;line-height:1.5;white-space:nowrap;pointer-events:none}
  body.a4-live .a4 [data-a4-t="decision"]:hover::after{right:-1px;bottom:100%;margin-bottom:3px}   /* 最終合否の欄（未押印で 86×58px）は欄の上の辺の外に 1 行 */
  body.a4-live .a4 [data-a4-t="memo"]:hover,body.a4-live .a4 [data-a4-t="memos"]:hover{color:#1f4e8c;text-decoration:underline dotted}
}
.pop{position:absolute;z-index:30;width:260px;max-width:calc(100vw - 16px);padding:10px 12px;background:#fff;color:#1a2233;border:1px solid #c9d2dd;border-radius:8px;box-shadow:0 8px 24px rgba(16,24,40,.18);font-size:13px;line-height:1.5}
.pop[data-kind="memo"],.pop[data-kind="memos"]{width:380px;max-height:60vh;display:flex;flex-direction:column}
.pop[data-kind="memo"] .pop-b,.pop[data-kind="memos"] .pop-b{flex:1 1 auto;min-height:0;overflow:auto}   /* 本文だけスクロール。見出しと［閉じる］は常に見える */
.pop-h{font-weight:700;font-size:13px}.pop-sub,.pop-ref{font-size:12px;color:#525d70}   /* 2026-10-19: 13.5/800・11.5 → アプリの段階 */
.pop-b{display:flex;flex-direction:column;gap:6px;margin:8px 0}
.pop-l{display:flex;flex-direction:column;gap:2px;font-size:12px;font-weight:700;color:#525d70}
.pop select,.pop input{font:inherit;font-size:13px;font-weight:400;padding:5px 8px;border:1px solid #848fa1;border-radius:8px;background:#fff;color:#161e2e;width:100%}   /* 2026-10-19 レビュー修正 D: 枠 #c7d0db・角丸 6 → アプリの入力欄と同じ #848fa1（地に 3:1）・8。寸法はそのまま */
.pop select:focus,.pop input:focus{border-color:#3b5791;outline:2px solid #3b5791;outline-offset:1px}   /* 2026-10-19: ブラウザ既定の黒い輪 → --focus */
.pop button:focus-visible,.savebar button:focus-visible{outline:2px solid #3b5791;outline-offset:2px}
.pop-note{font-size:12px;color:#9a5b00;background:#fdf1dc;border:1px solid #f3cf8a;border-radius:6px;padding:3px 8px}
.pop-err{font-size:12px;font-weight:700;color:#b42318}.pop-err:empty{display:none}
.pop-text{white-space:pre-wrap;overflow-wrap:anywhere}
.pop-memos{margin:0}.pop-memos dt{font-size:12px;font-weight:700;color:#525d70;margin-top:6px}.pop-memos dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.pop-f{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.pop-f button,.savebar-btn{font:inherit;font-size:12.5px;font-weight:700;padding:5px 12px;border-radius:6px;border:1px solid #c7d0db;background:#fff;color:#1a2233;cursor:pointer}
.pop-f button.primary,.savebar-btn{background:#1f5fbf;border-color:#1f5fbf;color:#fff}
/* 2026-10-19 レビュー修正 D: 窓のボタンの枠も #c7d0db → #848fa1（［採用｜不採用］と［取消］［閉じる］で副ボタンの見た目を 1 つに）・副ボタンのホバー #eef1f5（紺の［確認］［押印］と押した合否は変えない） */
.pop-f button{border-color:#848fa1}.pop-f button:not(.primary):not(.on):hover{background:#eef1f5}
/* 最終合否の［採用］［不採用］（2026-10-19。それまではインクの --dec-hire／--dec-reject で 採用＝朱・不採用＝藍）: アプリの報告書のセグメントと同じ色 */
.pop-f .pop-dec{border-color:#848fa1;color:#3c4658}.pop-f .pop-dec:hover{background:#eef1f5;color:#161e2e}
.pop-f .pop-hire.on{background:#146c43;border-color:#146c43;color:#fff}.pop-f .pop-reject.on{background:#b42318;border-color:#b42318;color:#fff}
.savebar{position:fixed;z-index:40;right:12px;bottom:12px;max-width:calc(100vw - 24px);display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;border-radius:8px;background:#fdf1dc;border:1px solid #f3cf8a;box-shadow:0 4px 14px rgba(16,24,40,.15);font-size:13px}
.savebar-x{font:inherit;font-size:16px;line-height:1;padding:3px 6px;border:0;border-radius:6px;background:transparent;color:#5b6675;cursor:pointer}.savebar-x:hover{background:rgba(0,0,0,.06)}
@media screen{body.a4-sb{padding-bottom:calc(var(--a4-sbh,49px) + 12px)}}
@page{size:A4 portrait;margin:0}
@media print{
  html,body{background:#fff}
  body>.a4{margin:0;box-shadow:none}
  .a4-foot,.pop,.savebar{display:none !important}
  .a4 [data-a4-t],.a4 [data-a4-t]:focus,.a4 [data-a4-t]:focus-visible{outline:none !important}   /* 窓を閉じると欄にフォーカスが戻る。キーボード操作の直後に印刷してもフォーカス枠を紙に出さない */
}
```
- ホバーの案内・枠は **outline と position:absolute の ::after だけ**（用紙の寸法・文字組みを変えない）。`::after` の土台の `position:relative` は 2-1 で常時付けておく（ホバーで付け外ししない）
- 単体 #87 が見ている `.stamp-row.cols-2{…}` と `@media (max-width:720px){.stamp-row…}` は削除する（後者は狭い画面で用紙の押印行を 1 列にしてしまう）。#87 を直す（7-1）

### 2-3. アプリ（`styles.css`）
- `.report-paper{…}` を削除し、`#appPaper.a4{margin:0 auto}`（寸法・余白・白地・影は共有の `.a4`）。`.report-paper-wrap`・`.report-paper-cap` は残す（cap の文言は 5 章）
- 印刷ホスト（「面接チェックリスト報告（A4）の印刷ホスト」の節）を置き換える:
```css
.cl-sheet-host{display:none}
body.print-checklist .cl-sheet-host{display:block;position:absolute;left:-10000px;top:0}
@page a4sheet{size:A4 portrait;margin:0}
@media print{
  .cl-nav,.cl-skip-note{display:none !important}
  body.print-checklist{page:a4sheet;background:#fff}
  body.print-checklist .app,body.print-checklist .toast{display:none !important}
  body.print-checklist .cl-sheet-host{position:static;left:auto}
  body.print-checklist .cl-sheet-host .a4{margin:0;box-shadow:none}
  body:not(.print-checklist) .cl-sheet-host{display:none !important}
}
```
- アプリの全体の `@page{size:A4;margin:10mm 11mm}`（設定・使い方の画面の印刷用）はそのまま
- **アプリの部品の規則を用紙に漏らさない**（2026-10-19 レビュー修正 D。`docs/SPEC-flow.md` 16-10 の 11）: 用紙は `.stamp-box`・`.stamp-label`・`.stamp-meta` など、報告書のカード「応募者の管理（押印）」と同じ class を使う。カードの規則（縦並び・中央寄せ・行の高さ。2026-10-18）が `#appPaper`・`#clSheet` の用紙に効いて、押印行が縦並び（52 → 89px）になり、保存 HTML の用紙と違っていた（S13・A10）→ カードの規則は `#mgmtCard` に絞る。e2e E24 (1) が、アプリの報告書の紙・印刷ホストの用紙と保存 HTML の用紙の全要素の計算されたスタイル（並び・文字・色・余白・枠・大きさ）を比べる

### 2-4. 寸法の根拠
- 96dpi: 1mm = 3.7795px。210mm = 793.7px、297mm = 1122.5px、内寸 190×281mm = 718.1×1062.0px
- 上限 1052px＝内寸の高さ − 10px（画面と印刷の文字の幅のわずかな差で 1 行増えても押印行が切れない余裕。`.a4` は `overflow:hidden` で用紙が伸びることはない＝印刷は常に 1 ページ）

---

## 3. 埋め込みスクリプト（ES5・文字列連結。`'</scr'+'ipt>'`）

### 3-1. 構成（この順で 1 つの IIFE）
```js
(function(){
var de=document.documentElement,a4=document.getElementById("a4"),sheet=a4&&a4.querySelector(".cl-sheet");if(!sheet)return;
var recNode=document.getElementById("recruit-record"),cfgNode=document.getElementById("recruit-mgmt-config");
var rec={},cfg={fields:[],managers:[],allowFreeName:true,interviewerField:"",decision:null};
try{rec=JSON.parse(recNode.textContent)||{};}catch(e){rec={};}
try{if(cfgNode)cfg=JSON.parse(cfgNode.textContent)||cfg;}catch(e){}
rec.management=rec.management||{};var D=cfg.decision||null;
{clFitSheet.toString()}
{Stamp ? Stamp.source() : ''}                          // stampSvg・shortName・verdictSvg・decisionSheetHtml・decisionFilename
var LIMIT={CL_SHEET_LIMIT_PX},PAPER_W=793.7,canStamp=typeof stampSvg==="function"&&cfg.fields.length>0;
var dirty=false,saved=false,pop=null,anchor=null,bar=null,rz=0;
function esc(s){…&<>"' をエスケープ…}  function pad(n){…}  function today(){… YYYY.MM.DD …}
function scale(){…}  function fit(){…}  function mark(el,t,label){…}  function unmark(el){…}  function markTargets(){…}
function renderStamps(){…}  function renderDecision(){…}  function renderBar(){…}  function render(){renderStamps();renderDecision();fit();renderBar();}
function changed(){dirty=true;saved=false;render();}
function closePop(ret){…}  function place(){…}  function openPop(t){…}  function popStamp(id){…}  function popDecision(){…}  function popMemo(el){…}  function popMemos(){…}
function pickPerson(){…}  function onPopClick(ev){…}  function exportHtml(){…}
document.body.classList.add("a4-live");
sheet.addEventListener("click",…);sheet.addEventListener("keydown",…);
document.addEventListener("mousedown",…,true);document.addEventListener("keydown",…);   // 窓の外・Esc
window.addEventListener("resize",…);window.addEventListener("load",fit);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);
window.addEventListener("beforeunload",function(e){if(dirty){e.preventDefault();e.returnValue="";}});
window.__a4Fit=fit;                                    // テスト用（計測をやり直して段階を返す）
render();
})();
```

### 3-2. 計測（fit）と縮小（scale）
```js
function scale(){var w=de.clientWidth,z=w<PAPER_W+32?Math.max(0.2,Math.floor((w-32)/PAPER_W*1000)/1000):1;
  if(z<1)de.style.setProperty("--a4-zoom",String(z));else de.style.removeProperty("--a4-zoom");}
function fit(){de.style.removeProperty("--a4-zoom");var lv=clFitSheet(sheet,LIMIT);markTargets();scale();if(pop)place();return lv;}
```
- `de.clientWidth`（縦スクロールバーを除いた幅）を使う。外す → 測る → 付け直す は同じ処理の中なので画面はちらつかない
- resize: `requestAnimationFrame` で間引いて `scale(); if(pop)place();`（**計測しない**）

### 3-3. 押せる欄の印（markTargets）
1-3 の表のとおり。`unmark` は `data-a4-t tabindex role aria-haspopup aria-label aria-expanded` を外す。メモは毎回: `.cl-cut` なら mark、そうでなく `data-a4-t="memo"` なら unmark。`.cl-nm-ref` は `getClientRects().length` があれば mark（`memos`）、無ければ unmark。

### 3-4. 窓（openPop・place・closePop）
- クリック: `sheet` に委譲。`var t=ev.target.closest("[data-a4-t]")`（SVG の中のクリックでも closest で欄に届く）。同じ欄の窓が開いていれば閉じる（トグル）、別の欄なら作り直す
- キー: 欄の上で Enter / Space → 開く（`preventDefault` でスクロールさせない）
- 作り方: `pop=document.createElement("div")` を **body の末尾**に追加（`.a4` の中に入れない＝`overflow:hidden` で切れない・zoom が掛からない）。中身は文字列連結で作り、名前は `esc()`、メモ本文は `textContent`。開いたら select（memo は［閉じる］）にフォーカス、`anchor.setAttribute("aria-expanded","true")`
- 位置（document 座標の `position:absolute`）:
```js
function place(){if(!pop||!anchor)return;var r=anchor.getBoundingClientRect(),pw=pop.offsetWidth,ph=pop.offsetHeight,vw=de.clientWidth,vh=window.innerHeight;
  var top=r.bottom+6;if(top+ph>vh-8)top=r.top-6-ph>=8?r.top-6-ph:Math.max(8,vh-ph-8);   // 上にも下にも入らなければ画面の中に収める
  var left=Math.min(Math.max(8,r.left),Math.max(8,vw-pw-8));
  pop.style.left=(left+window.pageXOffset)+"px";pop.style.top=(top+window.pageYOffset)+"px";}
```
  （`getBoundingClientRect` は `--a4-zoom` 込みの見た目の座標を返す。試作で確認）
- 閉じ方: Esc（フォーカスを欄に戻す）・［閉じる］（戻す）・窓と欄の外の `mousedown`（capture。戻さない）・押印／取消のあと（戻す）。`closePop` は窓を DOM から外し、`aria-expanded` を外す
- select で `__free` を選ぶと氏名欄を出してフォーカス、ほかを選ぶと隠す。`.pop-err` は操作のたびに空にする

### 3-5. 押印・取消（data-kind="stamp"）
```js
// 押印
var p=pickPerson();if(!p)return;   // 未選択→「担当者を選んでください」、__free で空→「氏名を入力してください」を .pop-err に
rec.management[id]={name:p.name,short:p.short,title:p.title,date:today(),at:new Date().toISOString()};closePop(true);changed();
// 取消
delete rec.management[id];closePop(true);changed();
```
`pickPerson` は従来の `pickPerson(sel,inp)` と同じ（名簿 → `{name,short:m.short||shortName(m.name),title}`、手入力 → `{name,short:shortName(name),title:""}`）。
`renderStamps`: 各欄の `.stamp-area` を `stampSvg({name:e.short||shortName(e.name),title,date,size:46,id:"a4s"+idx})` か `<div class="stamp-empty">未押印</div>`、`.stamp-meta` を `textContent`。

### 3-6. 最終合否（data-kind="decision"。`D` があるときだけ）
- 採用／不採用: `rec.decision={result:r,label:r==="hire"?D.hireLabel:D.rejectLabel,date:today(),at:…,by:{name,short,title}}`。`D.autoStampFinal` かつ `D.stampField` が `cfg.fields` にあり未押印なら同じ担当者・同じ日付で押印（現行どおり）。`changed()` のあと、`noteText(rec.decision)` が空でなければ窓を作り直して（ボタンの on・取消・注記を反映）開いたまま、空なら `closePop(true)`
- 取消: `rec.decision=null`（押印は消さない）→ `changed();closePop(true);`（この順。`changed()` → `renderDecision` が `#a4Decision` を outerHTML で置き換え、窓の anchor を新しい欄に付け替えてから `closePop(true)` がそこへフォーカスを戻す。逆順だとフォーカスしていた古い欄が DOM から消えて body に落ちる）
- `renderDecision`: `#a4Decision` を `decisionSheetHtml(d,{id:"a4Decision",svgId:"vdA4",title:D.label,hireLabel,rejectLabel,hireColor,rejectColor,sub:D.sub||"",size:64})` の outerHTML で置き換え（印は markTargets が付け直す）、`body[data-filename]` を `decisionFilename(現在の名前,d,D)` に
- `noteText` と `.pop-ref`・`.pop-note` の文言は 1-4。`D` が null なら欄も窓も出さない

### 3-7. 長いメモ（memo / memos）
```js
function memoOf(el){var notes=(rec.checklist&&rec.checklist.notes)||{},row=el.closest(".cl-nm-row"),tr=el.closest("tr[data-cl-item]"),k,v;
  if(row){k=(row.querySelector(".cl-nm-k")||{}).textContent||"メモ";var b=row.getAttribute("data-cl-block");
    if(b&&notes[b]!=null)v=notes[b];else if(row.classList.contains("cl-nm-iv"))v=rec.interviewNotes;else if(row.classList.contains("cl-nm-memo"))v=(rec.applicant||{}).reviewerNotes;}
  else if(tr){var id=tr.getAttribute("data-cl-item");k=((tr.querySelector(".cl-rt-no")||{}).textContent||"")+" "+((tr.querySelector(".cl-rt-lbl")||{}).textContent||"")+" のメモ";v=notes[id];}
  if(v==null||v==="")v=el.textContent;return {k:k||"メモ",v:String(v)};}
```
- memo: 見出し k・本文 v（`.pop-text` の textContent）
- memos（`.cl-nm-ref`。`.cl-compact-2` で質問の回答を省いたときも）: 用紙の全 `.cl-nm-row`（非表示の `.cl-nm-q` も含む）を `memoOf(row.querySelector(".cl-nm-v"))` で `<dl class="pop-memos">` に（dt・dd とも textContent で入れる）

### 3-8. 保存バーと書き出し
```js
function barSpace(){…bar があれば body に class a4-sb と --a4-sbh（bar.offsetHeight+"px"）、無ければ外す（style が空なら属性ごと）…}
function renderBar(){if(!dirty&&!saved){if(bar){bar.parentNode.removeChild(bar);bar=null;}barSpace();return;}
  if(!bar){…1-5 の要素を作って body に追加。［押印を保存］は exportHtml、［×］は saved=false;renderBar()…}
  msg.textContent=dirty?"押印・合否を変更しました":"保存しました（保存できなかったときは再保存）";btn.textContent=dirty?"押印を保存":"再保存";x.hidden=dirty;barSpace();}
function exportHtml(){closePop(false);
  recNode.textContent=JSON.stringify(rec).replace(/[<>&  ]/g,function(c){return "\\u"+("000"+c.charCodeAt(0).toString(16)).slice(-4);});
  var root=de.cloneNode(true);
  Array.prototype.forEach.call(root.querySelectorAll(".pop,.savebar"),function(n){n.parentNode.removeChild(n);});
  Array.prototype.forEach.call(root.querySelectorAll("[data-a4-t]"),unmark);
  var bd=root.querySelector("body");if(bd){bd.classList.remove("a4-live");bd.classList.remove("a4-sb");bd.style.removeProperty("--a4-sbh");if(!bd.getAttribute("style"))bd.removeAttribute("style");}
  root.style.removeProperty("--a4-zoom");if(!root.getAttribute("style"))root.removeAttribute("style");
  var html="<!DOCTYPE html>\n"+root.outerHTML;
  …Blob＋a.download（document.body の data-filename。無ければ "applicant.html"）＋revoke（現行どおり）…
  dirty=false;saved=true;renderBar();}
```
- 置換の正規表現・`recNode.textContent=JSON.stringify(rec).replace(/[<>&` の書き方は現行の文字列のまま（単体 #53 がこの文字列を見ている）
- 用紙の `.cl-compact*`・`.cl-nm-cut`・`.cl-cut`・`style="zoom:…"` は残してよい（その時点の確定状態。開いたときに計り直す）
- `beforeunload` は dirty のときだけ確認

---

## 4. storage.js の変更

### 4-1. 定数・公開 API
- 追加 `const CL_SHEET_LIMIT_PX = 1052;` を `RecruitStorage.CL_SHEET_LIMIT_PX` で公開。`fitChecklistSheet(sheet, limit)` の既定は `CL_SHEET_LIMIT_PX`
- 削除 `CL_SHEET_PAGE_PX`・`CL_SHEET_STAMPS_PX`・`CL_SHEET_STAMP_ROW_PX`・`CL_SHEET_BODY_PX`・`checklistSheetLimit`（公開 API からも）・`CL_TONE_CLASS`（'section' 専用）
- 追加 `brandLogo()` → `{ src, alt } | null`（S16）を公開。`checklistSheetHtml` の見出しと `app.renderBrand` が使う

### 4-2. `clFitSheet(sheet, limit)`（保存 HTML にソースを埋め込む。ES5・関数内にコメントを書かない）
- `hOf` は `sheet.getBoundingClientRect().height`（`.cl-stamps` を除く処理を消す）
- `cut()` は**全部の** `.cl-nm-v,.cl-rt-nt` を見て、表示されていて切れている要素に `cl-cut` を付け、それ以外から外す（`v.classList` が無いもの〔単体のモック〕は飛ばす）。1 つでもあればシートに `cl-nm-cut`
- 段階の順・縮小の測り直しは現行どおり

### 4-3. `checklistSheetHtml(record, profile, o)`
- `o = { decisionId, decisionSvgId, stampSvgPrefix, refWhere }`（`mode`・`stamps` は無視。`refWhere` は 1-2 の案内の言い換え）。'section' の分岐とそのヘルパーを削除し、常に `clOnePageHtml`
- 見出し（1-2）・押印行（1-2）・案内の文言（1-2）

### 4-4. `generateReportHTML(record, profile)`
1-1 の形に作り直す。残すもの: `baseName`/`filename`（`decisionFilename`）・`jsonForScript`・`SCRIPT_END`・`mgmtConfig`（＋`interviewerField`）。削除: `sec`・`notesHtml`・`checklistSecHtml`・`sRows`/`rowVal`・`ivS`/`cntS`/`ovV`/`ovL`/`mustShort`/`mustCounts`/`jMust`/`jOv`・`stepText`/`chipsHtml`/`verdictHtml`/`brandMarkHtml`/`headerHtml`・`applicantSecHtml`・`sj`/`judgmentSecHtml`・`stampBoxes`・`decPanelHtml`・`saveBarHtml`・`mgmtNoteHtml`・`mgmtHtml`・旧スクリプト 2 本。`R.scriptApplicantRows`・`R.interviewModel` などは rules.js に残す（アプリが使う）。

### 4-5. `reportCss()`
2-2 の内容に置き換える（旧規則は残さない）。

---

## 5. アプリ側（app.js・styles.css・index.html）
- ③ の紙: `reportStepHtml` の `<div class="report-paper" id="appPaper">` を `<div class="a4" id="appPaper">` に。中身は `S.checklistSheetHtml(S.buildRecord(state), state.profile, { decisionId: 'appPaperDecision', decisionSvgId: 'vdAppPaper', stampSvgPrefix: 'ap' })`（押印行入り）。cap の文言:「<b>面接チェックリスト報告（A4）</b><span>保存した HTML はこの用紙 1 枚で開きます。押印・合否は下のカードで（保存した HTML では用紙の欄をクリック）</span>」。紙の欄にはクリックの処理を付けない（A10）。押印・取消・合否で `rerenderReportPaper()`（現行どおり呼ばれている）
- `fitReportPaper`: `S.fitChecklistSheet(sh)`（上限は既定）。縮小（0.95 まで）・`.paper-stack` の処理はそのまま（2026-10-19 に `.paper-stack` は削除。報告書は 1 列〔`.page.reading`〕で右サマリーはいつも紙の下。`docs/SPEC-flow.md` 16-9）
- 印刷: `prepareChecklistSheet(true)` は `#clSheet` に `'<div class="a4">' + S.checklistSheetHtml(rec, state.profile, {}) + '</div>'` を描いて `body.print-checklist`、`S.fitChecklistSheet($('#clSheet .cl-sheet'))`。`printChecklistSheet`・beforeprint/afterprint・`#btnPrint`・`#clPrintBtn`・`#reportPrintBtn` の経路は変えない
- 削除: `checklistStampsHtml`・app 内の `checklistSheetLimit`。`renderBrand` は `S.brandLogo()` を使う
- index.html: `#clSheet` のコメントを「A4 の用紙（③ と同じ部品）を印刷の直前だけ描く」に
- `#mgmtCard`・`#decisionCard`・右サマリーは変えない

---

## 6. 削除範囲のまとめ
| 場所 | 削除 |
| --- | --- |
| storage.js | 'section' の描画（`checklistSheetHtml` 内の `showQ` 以下〜 `cl-mode-section` を返すまで）・`CL_TONE_CLASS`・4-1 の定数と `checklistSheetLimit`・`generateReportHTML` の 4-4 の部品・旧 `reportCss` の全規則・`checklistSheetCss` の 2-1 の削除分 |
| app.js | `checklistStampsHtml`・`checklistSheetLimit`（app 内）・`o.stamps` の受け渡し |
| styles.css | `.report-paper{…}`・旧印刷ホスト規則（2-3 で置き換え） |
| tests | 'section'・詳細表示・`#clPaper`/`#clSheet`（保存 HTML）・`#mgmt`/`#decision`・`view-report`・`rtView*`・`__prepareChecklistSheet` を見る確認（7 章の対応表で置き換え） |

---

## 7. テスト計画

### 7-1. 単体（`node tests/rules.test.js`）。番号は振り直さない
| # | 書き換え |
| --- | --- |
| 53 | 「応募者の管理」節の位置 → 押印行が用紙の中（`<div class="cl-stamps"><div class="stamp-row cl-stamps-row cols-2">`）。`id="mgmtSaveBtn"` → スクリプトに `saveBarBtn`。ハンコ 1 個・`data-field-id="final"`・`recruit-mgmt-config`・悪い名前のエスケープ・`recNode.textContent=JSON.stringify(rec).replace(/[<>&`・beforeunload はそのまま。旧レコード（management なし）は `.cl-stamps` と「未押印」。名簿なし・手入力 OFF は `noScript(html2)` に `__free` なし |
| 66 | `data-sec="checklist"`・`cl-s-no`・`cl-mk`・「未入力です」→ 用紙の同等（`cl-rt-no`・`cl-mark`・`.cl-judge`・回答なしは白紙の用紙で結果「未実施」）。「保存時点の台本の文言」は**確認点か必須条件の文言**を p2 で変えて、用紙が `record.checklistDef` の文言のままか確かめる（説明の文言は用紙に出ない）。メモのエスケープ（`長期希望 &lt;/script&gt;&lt;!--x`）は用紙で |
| 71 | body `<body class="a4-doc" data-filename="…_採用.html">`・`id="a4"`・`id="a4Decision"`・無い id（`rtViewReport rtViewFull reportPaper clPaper clPaperDecision clDecision decision rhDecision mgmt mgmtSave`）・合否スタンプは用紙の 1 つ・`beforeprint` を含まない・`function verdictSvg(` あり・script の開閉数。食い違い注記はスクリプトの中にだけある（`noScript` に無い）。回答なし・OFF（`a4Decision`・`cl-decision` なし・cfg.decision null・ファイル名に付けない・JSON に decision は残る）。'section' の確認は「`{mode:'section'}` を渡しても 1 ページの要約」に |
| 76 | 節・印刷ボタン・`kv script-judge`・`result` → 用紙の部品の有無と順（`cl-sheet-head` < `cl-judge` < `cl-stamps` < `</main>` < `recruit-record`）。無いもの（`<section class="sec"`・`class="rh"`・`class="rtool`）|
| 77 | 'section' の確認を削除（タクシー・担当は用紙の `.cl-who` で確認済み） |
| 78 | `adj-head` → 用紙の `.cl-adj li b`（r1〜r3「必須条件の不一致により「不採用推奨」に固定」、r4「…「上長最終判断要」に固定」、p5「上長最終判断要 → 不採用推奨」、調整なし []）。押印欄の説明の確認はそのまま |
| 79 | `<h2>応募者情報</h2>`・`id="clSheet"` → `id="a4"`・`cl-who` |
| 80 | 見出し `<div class="cl-title"><span class="cl-title-t">面接チェックリスト報告</span><span class="cl-title-r">台本 2026-10-08 版 ／ TOHOシネマズ新宿 ／ 作成 `。押印行は record.management から（`o.stamps` の文字列は使わない。押印 1 件 → `svg.hanko` 1・`data-field-id` 2・`cols-2`）。CSS: `@page clsheet` → 無い、`.a4{…width:210mm;height:297mm;padding:8mm 10mm` がある、`.cl-band` が無い。保存 HTML: `function clFitSheet(sheet, limit)`・`var LIMIT=1052,`・`window.__a4Fit=fit;`。`checklistSheetLimit`・`CL_SHEET_BODY_PX` の確認を「`S.CL_SHEET_LIMIT_PX === 1052`・`S.checklistSheetLimit === undefined`」に。案内の文言（1-2） |
| 81 | 押印行を除く確認 → 「`.cl-stamps` があってもシート全体の高さで計る」。省略時の上限は `CL_SHEET_LIMIT_PX`。モックの要素に classList を持たせ、切れた要素だけ `cl-cut`・非表示の要素は付かない |
| 87 | 削除した機能の文字列に `rtViewFull`・`print-checklist`・`__prepareChecklistSheet`・`data-sec=`・`class="rh"` を足す。印刷ボタン・`#mgmt`・beforeprint の確認は削除。CSS の確認を `.cl-sheet .stamp-row.cols-2{…}` だけに、`@media (max-width:720px){.stamp-row` が**無い**ことに |
| 88 | `checklistSheetLimit` が無い・`brandLogo`・`CL_SHEET_LIMIT_PX` がある |
| 89 | `.rh-brand`/`.rh-mark`/`.rh-logo` → 用紙の見出し: ロゴあり `<img class="cl-title-logo" src="…" alt="TOHO &quot;CINEMAS&quot; &lt;x&gt;">`、なし／不正な URL（5 種）は img なし（マークも無い）、alt が空なら劇場名。CSS `.cl-mode-sheet .cl-title-logo{…height:7mm` |
| 追加 90 | `generateReportHTML` の DOM: `main.a4#a4` が body の最初の要素・`footer.a4-foot` に `meta.footer`・`<title>面接チェックリスト報告 - `・script 3 つ・生成 HTML に `class="pop`/`class="savebar`/`data-a4-t=`/`a4-live`（`<style>`・`<script>` の中を除く）が無い・`reportCss()` に `@page{size:A4 portrait;margin:0}` と `@media screen{.a4{zoom:var(--a4-zoom,1)}` がある・`</script` を含まない |

### 7-2. e2e（`node build.js && node tests/e2e.js`）。既存の確認の置き換え
保存 HTML を開く操作の共通ヘルパーを足す: `openStamp(pg, id)` = `pg.click('#a4 .stamp-box[data-field-id="'+id+'"]')`、`openDecision(pg)` = `pg.click('#a4Decision')`、`popSel(pg, label)` = `pg.selectOption('#a4Pop select', { label })`、`popAct(pg, act, v)` = `pg.click('#a4Pop [data-act="'+act+'"]'+(v?'[data-value="'+v+'"]':''))`、`saveBtn` = `#saveBarBtn`。
| 場所 | 旧 | 新（確かめる性質は同じ） |
| --- | --- | --- |
| E2 | ③ の紙（押印行なし） | 追加: `#appPaper.a4` の中に `.cl-title`・`.cl-stamps .stamp-box` 2 つ（押印すると紙のハンコも出る） |
| E5 | ダークの紙は白地・黒字 | 追加: 紙のハンコ（`#appPaper .cl-stamps svg.hanko`）の `filter` が `none` |
| E3 | body `view-report has-cl mode-script` | `<body class="a4-doc" data-filename="応募者_台本_花子_2026-10-10.html">` |
| E3 | in34（h2 4 つ・rtPrintChecklist・clPaper・clSheet）／out34 | in: `id="a4"`・`class="cl-title"`・`id="a4Decision"`・`class="cl-stamps"`。out に `id="rtViewFull"`・`id="clPaper"`・`id="clSheet"`・`id="mgmt"`・`id="decision"`・`<section class="sec"`・`class="rh"` を足す（削除した機能の文字列はそのまま） |
| E3 | 開いたとき報告書表示（`#clPaper`・`#decision`・`#mgmt` 表示・`#clSheet` 非表示・`.rh` 非表示） | `#a4 .cl-sheet` 表示・`#a4Decision` 表示・`#a4 .cl-stamps .stamp-box` 2 つ表示・`body.a4-live`・`.pop`/`.savebar` なし・pageerror なし |
| E3 | hd34（紙・印刷用・.rh のヘッダー） | `#a4 .cl-sheet-head` だけで同じ文言（短期求人を含む）・消極属性／短期希望／目安なし |
| E3 | 「詳細」（secs34・app34・memo34・jd34・pb34） | 「詳細表示が無い」（`#rtViewFull`・`section.sec`・`.rh`・`.rtool` なし）＋用紙の `.cl-who` に app34 の項目・`.cl-nm-memo` に「電話の受け答えが丁寧。」・`.cl-nm-k` に「メモ」（「備考」なし）・`.cl-judge` に 必須条件／総合判断／確認点／採用推奨（2軸・シフト貢献度なし） |
| E3 | `#decision select`→decide hire・`#mgmt` の final・`#mgmtSaveBtn` | `openDecision`→`popSel(SASA)`→`popAct('decide','hire')`→窓が閉じる（採用×採用推奨は注記なし）・`#a4Decision svg.verdict-stamp`・`#a4 .stamp-box[data-field-id="final"] svg.hanko`・ファイル名 `_採用`・`#saveBar` に「押印・合否を変更しました」→ `#saveBarBtn` で書き出し・「保存しました（保存できなかったときは再保存）」「再保存」 |
| E3 | 再出力ファイルの PDF 1 枚・本文 | そのまま（`page.pdf` は切替なし）。アプリで読込 → さらに `saveRecord` → 開くと `#a4Decision.is-hire`・押印 2 つ・pageerror なし（A11 の往復） |
| E6 | `#clPaper .cl-tile-res`・詳細の判定節・`.rh .verdict` | `#a4 .cl-tile-res` に採用推奨（「未実施」なし）。詳細の確認は削除 |
| E8 | `paperOf` の order | 末尾に `cl-stamps` を足す |
| E8 | `h <= 950`（③・重いサンプル） | `h <= 1052`（押印行込み） |
| E8 | wide39 の `#reportPaper` | 保存 HTML の `scrollWidth - innerWidth <= 1` と `--a4-zoom` 無し（1280px 以上は縮小しない） |
| E8 | rv39 `#clPaper` | `#a4` |
| E8 | 案内の文言（nm39・t39・fit39 の ref） | 「「…」で切れたメモは、画面でクリックすると全文を表示します」（PDF は空白を詰めて比べる） |
| E8 | rh39 `#clPaper .cl-sheet` | `#a4 .cl-sheet` |
| E8 | fit39（`__prepareChecklistSheet(true)`・`#clSheet`・`section[data-sec="mgmt"]`・stamps4 `h <= 890`・zoom `h <= 950`） | 読み込んだまま `#a4 .cl-sheet` の class・zoom・高さ、`#a4 .cl-stamps .stamp-box` の数。全件 `h <= 1052`・**押印行の下端が用紙の内寸の下端（`#a4` の上端＋8mm＋281mm）より上**・PDF 1 枚 |
| E9 | `<div class="stamp-row cols-2" id="mgmt">`・g9（`#mgmt` 2 列・390px で 1 列） | `#a4 .cl-stamps .stamp-row.cols-2`・2 列。**390px でも 2 列のまま（用紙ごと縮小）**・横スクロールなし |
| E9 | `#decision` で reject | `openDecision`→`popSel`→`popAct('decide','reject')`→ 採用推奨と食い違うので**窓が開いたまま `.pop-note` に注記**→［閉じる］。final の印・`_不採用` |
| E9 | アプリ印刷 `#clSheet .cl-stamps` | `#clSheet .a4 .cl-stamps`（そのほか同じ） |
| E11 | `.rtool` のボタン・beforeprint の切替・詳細表示の印刷・`#rtPrintChecklist` | 「`.rtool`・`#rtPrintChecklist`・`__prepareChecklistSheet` が無い」・`beforeprint`/`afterprint` を投げても `body` と `#a4 .cl-sheet` の class・zoom が変わらない（切替なし）・PDF 1 枚（押印二郎・面接対応者・最終確認・初期対応者なし）・PDF に台本の全文（「歌舞伎町ですので」）が無い |
| E11 | アプリの A4 印刷 `#clSheet .cl-stamps` | `#clSheet .a4 .cl-stamps .stamp-box` 2・1 ページ |
| E12 | `#mgmt` の取消・手入力・`#mgmtSave.show`・`#decision` の取消・`#clPaper` の合否・`#mgmtSaveBtn` | `openStamp('interviewer')`→`popAct('unstamp')` で印が消え `#saveBar` 表示 → `openStamp`→`popSel`（`__free`）→`.pop-free` に「佐藤 次郎」→`popAct('stamp')`→`.stamp-meta` に佐藤 次郎 → `openDecision`→`popAct('undecide')`→`#a4Decision.is-none`・ファイル名 `_不採用` が外れる → `#saveBarBtn`。追加: 未選択で押印 →「担当者を選んでください」、手入力の氏名が空 →「氏名を入力してください」（どちらも押印されない） |
| E12 | 合否 OFF: `#decision`・`[data-act="decide"]` なし・`#mgmt` あり | `#a4Decision`・`.cl-decision` なし・結果ストリップをクリックしても窓が出ない・`#a4 .cl-stamps` あり |
| E13 | `#rtViewFull` → `.rh-logo` 28px | 開いたまま `#a4 .cl-title-logo`（alt SAMPLE LOGO・naturalWidth 220・高さ 26.5px±1＝7mm）・アプリ ③ の `#appPaper .cl-title-logo` も。公開版の保存 HTML・③ は `.cl-title-logo` なしで `.cl-title-t` が「面接チェックリスト報告」 |

### 7-3. 追加（E14「A4 用紙」。A12 (1)〜(7)）
対象は E9 の `saved9`（押印二郎・押印 2 つ）と E8 の `saved39`（重いサンプル）。保存 HTML のページは `newReportPage`（1440×1000）で開き、測る前に `pg.mouse.move(0,0)`。
1. **寸法**: `#a4` の rect が 793.7±1 × 1122.5±1、`getComputedStyle(de).getPropertyValue('--a4-zoom')` が空。`#a4` の padding が 30.2px／37.8px（8mm／10mm）
2. **画面と印刷が同じ様式**: viewport を 1440×1300 にして `pg.locator('#a4').screenshot()` → `page.pdf({format:'A4',printBackground:true})` → `pdftoppm -r 96 -png -singlefile -f 1 -l 1 x.pdf x`。2 枚を data URL でページの canvas に 400×566 で描き、灰度 < 235 の外接矩形（幅・高さで割った値）の 4 辺がそれぞれ ±0.02 以内、8×8 ブロックの平均差 ≤ 4（試作 0.78）。pdftoppm が無ければ SKIP
3. **窓**: `openStamp('final')` → `#a4Pop` 表示・`role="dialog"`・`#a4PopH`「最終確認」・フォーカスが select → Esc で `#a4Pop` が無く、フォーカスが欄に戻る。Enter / Space でも開く。窓の外のクリックで閉じる。ホバーで `getComputedStyle(box,'::after').content` に「クリックで押印」、`emulateMedia({media:'print'})` では出ない。押印を 1 つ変えて**窓を開き保存バーも出した状態で** `page.pdf` → PDF 1 枚・本文に「閉じる」「押印を保存」「押印・合否を変更しました」「クリックで押印」「担当者を選択」が無い。書き出したファイル（`<style>`・`<script>` の中を除く）に `class="pop`・`id="a4Pop"`・`class="savebar`・`id="saveBar"`・`a4-live`・`data-a4-t=`・`--a4-zoom` が無く、JSON に変更が入っている。そのファイルを開くと窓・バーなし・`body.a4-live`・寸法 1 と同じ。アプリ ③ の `#appPaper .stamp-box` をクリックしても `.pop` が出ず state も変わらない（A10）
4. **長いメモ**: `saved39` を開き `#a4 [data-a4-t="memo"]` が 1 つ以上。`.cl-nm-iv .cl-nm-v.cl-cut` をクリック → `#a4Pop .pop-text` の textContent が埋め込み記録の `interviewNotes`（1,500 字）と一致 → Esc。`.cl-rt-nt.cl-cut` → `rec.checklist.notes[行の data-cl-item]` と一致。`mk39({ q: 300, iv: 2000, extra: 20 })`（`.cl-compact-2` にならなければ extra を増やす）で `.cl-nm-ref[data-a4-t="memos"]` → `.pop-memos dd` の数が `.cl-nm-row` の数（非表示の質問の回答を含む）・本文が記録と一致。用紙の注記行の文言（1-2）
5. **390px**: `setViewportSize({width:390,height:844})` → `scrollWidth - innerWidth <= 1`・`--a4-zoom` ≈ 0.451・`#a4` の rect 幅が 358±2・縦横比 297/210±0.01・押印行は 2 列のまま。窓を開くと左右とも画面内（left ≥ 0・right ≤ 390）。この幅で `page.pdf` → 1 枚・`#a4 .cl-sheet` の class と zoom が PDF の前後で同じ（計測し直さない）
6. **ロゴ**: E13（7-2）
7. **アプリと保存 HTML の印刷**: 同じ記録（`saved9`）で、アプリ（③ で読み込み → `prepareChecklistSheet(true)` → print メディア → `page.pdf`）と保存 HTML（開いたまま `page.pdf`）がどちらも 1 ページ、pdftotext（空白を詰める）の見出しが同じ（「面接チェックリスト報告」と「台本2026-10-08版／TOHOシネマズ新宿／作成2026/10/10」がどちらにもある）。2 の方法で 2 つの PDF の画像の外接矩形も ±0.02 以内
- レビュー後の追加（13 章）: キーボード操作の直後（Esc で欄に戻る・Shift+Tab で「最終合否」）に印刷の表示で `outlineStyle` が `none`・その状態の PDF の画像がフォーカスなしの印刷と画素単位で同じ／ホバーの案内は 1 行・最終合否の欄の案内は欄の上の辺の外（未押印・押した後）／保存バーは 1280×768 で右下・見出し・氏名・最終合否に重ならない（スクロール 0／120px）・いちばん下までスクロールすれば用紙・注記に重ならない・保存後は［×］で閉じる・書き出しに `a4-sb` が残らない、390×844 で用紙・見出し・氏名・最終合否に重ならない／1366×768 で全文の窓が欄の上下どちらにも入らないときは画面の中（本文だけスクロール・［閉じる］が見える）／重いサンプルを 390px で**最初から**開いても 1440px と同じ class・zoom・印刷の表示でシートが 1052px 以内で押印行が内寸に収まる・PDF 1 枚・この幅で書き出したファイルに `--a4-zoom` が無い。E8: ③ の紙の案内は「保存した HTML の画面で…」・③ の紙のクリックで窓は出ない・アプリの印刷の PDF は「画面でクリックすると全文」。E9: 採用×不採用推奨の注記。E12: 未押印の面接対応者の窓は台本の担当を名簿から初期選択・そのまま押印した名簿の値（役職つき）が書き出したファイルに入る・キーボードで合否を取り消すとフォーカスが新しい欄に戻る
- そのほか: 各保存 HTML の pageerror・console error なし。`tests/fixtures/legacy-full-stamps3.html`・`legacy-full-checklist.html` を直接開いても pageerror なし（旧い保存 HTML は自分のスクリプトで動く。A11）
- e2e 冒頭のシナリオ一覧に E14 を足し、E3・E9・E11・E12・E13 の説明を新しい内容に直す

---

## 8. 実装順
1. storage.js: 定数（4-1）→ `clFitSheet`（4-2）→ `checklistSheetHtml`（見出し・押印行・案内・'section' 削除）→ `brandLogo` → `checklistSheetCss`（2-1）。単体 #66・#71（sheet 部分）・#77・#80・#81 を直して緑に
2. app.js・styles.css・index.html（5 章・2-3）。`node build.js` → e2e の E2・E5・E6・E8（アプリ部分）・E9（アプリ部分）・E11（アプリ部分）が緑
3. `reportCss`（2-2）・`generateReportHTML`（1 章・4-4）・埋め込みスクリプト（3 章）。単体 #53・#71・#76・#78・#79・#87〜#90 を緑に
4. e2e の保存 HTML 部分（7-2）→ E14（7-3）。スクリーンショットで画面の用紙（1440px・390px・窓を開いた状態）と PDF を目で確かめる
5. docs（10 章）。README・HANDOFF のテスト件数は実数に

## 9. 落とし穴
1. **書き出しに窓・バーが残る**: 生きている DOM の outerHTML をそのまま使わない。複製を掃除（3-8）。テストは `<style>`・`<script>` の中を除いて調べる（CSS とスクリプトに `.pop`・`savebar`・`data-a4-t` の文字列があるため）
2. **計測を印刷時にやり直さない**: beforeprint・matchMedia を使わない。resize は縮小だけ（Chrome は印刷プレビューで resize を出すことがある）
3. **zoom と計測**: `--a4-zoom` が付いたまま `clFitSheet` を呼ぶと高さを小さく測り、詰め方が変わる（0-5）。`fit()` の最初で必ず外す。縮小は `@media screen` の中だけ（印刷・PDF に効かない）。用紙の中に `@media (max-width…)` を置かない
4. **build.js の閉じタグ制限**: storage.js の文字列リテラル・コメントに `</script` を書かない（`SCRIPT_END`）。埋め込む関数（`clFitSheet`・stamp.js）の中にコメントを書かない（`toString()` で埋め込まれる）
5. **data URL の検証**: ロゴは `brandLogo()` を通したものだけ。alt はエスケープ。`javascript:`・http(s)・`data:text/html`・引用符入り・base64 でない SVG は出さない（#89）
6. **XSS**: 名簿の名前・手入力の氏名・メモは利用者の入力。窓の HTML は `esc()`、本文は `textContent`。埋め込み JSON は `< > &` を `\u` 形式（書き戻しも同じ）
7. **ホバーで寸法を変えない**: 枠は outline、案内は `position:absolute` の `::after`（土台の `position:relative` は常時）。border・padding を足すと用紙の高さが変わる
8. **窓は body 直下**: `.a4` の中に入れると `overflow:hidden` で切れ、zoom も掛かる
9. **描き直しで印が消える**: `#a4Decision` は outerHTML で置き換えるので、render のあと必ず `markTargets()`（fit の中で呼ぶ）。窓が開いていれば `place()`
10. **SVG の id**: 用紙のハンコ・合否スタンプの filter id は文書内で一意（保存 HTML `a4s{n}`・`vdA4`、③ `ap{n}`・`vdAppPaper`、印刷ホスト `cl{n}`・`vdSheet`）。描き直しは置き換え（重複させない）
11. **アプリのダークテーマ**: 紙に押印行が入るので `.cl-sheet .hanko{filter:none !important}`（2-1）。E5 で紙のハンコの filter が none か確かめる
12. **Playwright の日本語ファイル名**: ダウンロード名は `download` になることがある。ファイル名は `body[data-filename]` で確かめる（現行どおり）
13. **スクリプトが動かない環境**（メールのプレビュー等）: 初回の書き出しには詰め方のクラスが無いので、長い記録は用紙の下で切れる（`overflow:hidden`。2 ページにはならない）。既知の制限として HANDOFF に書く

## 10. docs（A13）
- `docs/SPEC-a4.md`: 本書
- `docs/HANDOFF.md`: 冒頭の一覧に「2026-10-14: 保存 HTML を A4 縦 1 枚に」。1-1 ③ の紙プレビューに押印行・見出し。**1-4 を書き直す**（`body.a4-doc`・`main.a4#a4`・欄クリックの窓・保存バー・書き出しの掃除・詳細表示なし・印刷の切替なし・旧い保存 HTML の互換）。**1-5**（見出しは白地＋下線・ロゴ、押印行は用紙の中、上限 `CL_SHEET_LIMIT_PX` 1052 で押印行込み、案内の文言、アプリ ③・アプリの印刷・保存 HTML で同じ部品）。1-6 のテスト件数（単体 30 件〔#90 追加〕・e2e E1〜E14 の実数）。2 章の表に「K. A4 縦 1 枚（2026-10-14）: 保存 HTML は A4 縦の用紙 1 枚そのもの・詳細表示なし（切れたメモはクリックで全文）・押印と最終合否は用紙の欄を直接クリック（窓）・印刷は画面と同じ用紙 1 枚」。3-2 の既知の制限に 9-13。4 章の早見表（A4 報告の見た目・押印欄の行の場所名を新しい関数名に）
- `README.md`: 「報告書（HTML）と最終合否」（2・3・4 を用紙の欄クリック・窓・右上の保存バーに）、「印刷」（保存 HTML はそのまま印刷＝画面と同じ 1 枚、詳細表示の記述を削除、見出しの説明、「…」の案内の文言、上限の説明）、テストの説明（E14・件数）、ロゴの節（「保存レポートの「詳細」表示のヘッダー」→「用紙の見出し（アプリ ③・印刷・保存 HTML）」）
- `docs/SPEC-report.md`・`docs/SPEC-script-mode.md`・`docs/SPEC-checklist.md`（4 章）の冒頭の注記に 1 行:「> 2026-10-14 に保存 HTML を A4 縦 1 枚へ変更（docs/SPEC-a4.md）。報告書表示／詳細表示の切替・`#clPaper`／`#clSheet`（保存 HTML）・`#mgmt`／`#decision`・「A4 で印刷（1 ページ）」・'section' モードの記述は無効」

---

## 11. 最終承認のパスワード（2026-10-14 追記）

### 11-0. 指示と決定
> 最終承認の押印はパスワードが必要な感じの方がいいかもしれないね。パスワードは「（ローカル版の初期値）」て初期登録しといて

（実際の値は `local/final-password.txt` にだけ置く。リポジトリ〔src・dist・tests・docs〕には実際の値もそのハッシュも入れない）

| # | 決定 |
| --- | --- |
| L1 | 対象は **押印欄 `management.decision.stampField`（既定 `'final'` 最終確認）の押印・取消**と **最終合否（採用／不採用）の決定・取消**（押印欄は L1b で拡げた）。アプリ（③ の `#mgmtCard` の最終確認・`#decisionCard`）と保存 HTML（用紙の最終確認欄・最終合否欄の窓）の両方。面接対応者の押印には要らない。`stampField` が `''`（連動しない）なら最終合否だけ |
| L1b | （2026-10-14 追記・ロックの迂回を塞ぐ）押印のロック対象は「ロックを設定した時点の欄」でも `decision.stampField` だけでもなく、**常に既定の最終確認欄 id `'final'` と、そのときの `decision.stampField` の欄の両方**（重複は 1 つ。`storage.finalLockFields(profile)` → `['final']`・`['final', 'extra']`）。「押印欄と連動」を「連動しない」や別の欄に変えても、最終確認欄の押印・取消にはパスワードが要る（アプリ ③・保存 HTML とも）。L1 の「`stampField` が `''` なら最終合否だけ」は廃止 |
| L2 | データは `profile.management.finalLock = { salt, hash }`。`hash = sha256Hex(salt + ':' + パスワード)`（16 進 64 文字・小文字）、`salt` は 16 進 32 文字の乱数（`crypto.getRandomValues`、無ければ `Math.random`）。`hash` が空＝パスワードなし（公開版の既定）。平文はどこにも持たない |
| L3 | `src/lock.js` の `RecruitLock = { sha256Hex, hashPassword(salt, pw), verify(lock, pw), isLocked(lock), newSalt(), makeLock(pw), source() }`。`sha256Hex` は外部参照のない ES5 の純関数（Node の crypto と 310 ケースで一致を確認済みの実装）。`verify` はロックが無ければ true。`source()` は `sha256Hex`・`hashPassword`・`isLocked`・`verify` のソース（保存 HTML に埋め込む） |
| L4 | ロックがあり、そのページでまだ解錠していないとき、対象の操作の前にパスワード欄（`type=password`・`autocomplete="off"`）と［確認］を出す（操作のボタンは出さない）。違えば「パスワードが違います」を 1 行出して何もしない。空なら「パスワードを入力してください」。Enter で確定。正しければ**そのページを閉じる／読み込み直すまで解錠**（変数だけ。localStorage・書き出すファイルには残さない）。解錠済みならパスワード欄を出さない。連続失敗の回数制限はしない |
| L5 | 設定 `#s-mgmt` の「最終承認のパスワード」（`#s-finalLock`）: 状態 `#finalLockStatus`（設定済み／未設定、下書きが保存済みと違えば「未保存の変更です。「設定を保存」で確定します。」）・［変更］（未設定なら［設定する］）`#finalLockChange` → `#lockCur`（設定済みのとき）・`#lockNew`・`#lockNew2`・［変更する］`#finalLockApply`／［キャンセル］・［パスワードを外す］`#finalLockRemove` → `#lockCur`・［パスワードを外す］`#finalLockRemoveApply`。エラーは `#finalLockErr` の 1 行（「現在のパスワードを入力してください」「現在のパスワードが違います」「新しいパスワードを入力してください」「新しいパスワード（確認）が一致しません」）。新しいパスワードは 1 文字以上。入力欄は `data-bind` を持たない（下書きに平文を入れない）。変更は下書きの `management.finalLock` に入り、［設定を保存］で確定（［変更を破棄］で戻る） |
| L5b | プロファイル JSON の読み込み・［初期設定に戻す］でロックが変わる（salt か hash が違う）・外れるときは、**現在のロックがあれば**現在のパスワードを小さなダイアログ（`#pwDialog`・`#pwDialogInput`・`#pwDialogErr`・［キャンセル］［確認］。Esc でキャンセル）で求める。違えば「パスワードが違います」でダイアログに留まり、キャンセルなら読み込まない／戻さない（toast「プロファイルを読み込みませんでした（最終承認のパスワードを確認できません）」「初期設定に戻しませんでした（…）」）。同じロックの JSON はそのまま読む |
| L5c | （2026-10-14 追記・ロックの迂回を塞ぐ）ロックがあるとき、**ロックの対象を変える設定**＝`decision.stampField`（押印欄と連動）・`decision.enabled`（最終合否のスタンプの ON/OFF）・`management.fields` の構成（欄の追加・削除・id。id の並びで比べる）を変えて［設定を保存］するには、L5b と同じ「現在のパスワード」ダイアログ（`#pwDialog`）を通す。違えば「パスワードが違います」でダイアログに留まり、キャンセル・Esc なら保存しない（toast「設定を保存しませんでした（最終承認のパスワードを確認できません）」。下書きは残す）。プロファイル JSON の読み込みも同じ（パスワードが同じでも対象が変わればダイアログ。toast は L5b と同じ）。表示名・説明（label・hint）・名簿だけの変更は確認不要。比べるキーは `storage.finalLockScope(profile)`（正規化後の `decisionConfig` の enabled・stampField と fields の id の並び）。［初期設定に戻す］はロックが変わるときだけ（L5b。既定の対象は 最終確認欄＋連動 'final'＋合否 ON で、戻しても対象が狭まらない）。そのページで解錠済みでも求める |
| L5c' | （2026-10-14 追記・3 回目のレビュー）**押印欄の表示名（`management.fields[].label`）もロックの対象を変える設定**に含める（`finalLockScope` に表示名の並び `labels`）。面接対応者の欄（パスワード不要）の表示名を「最終確認」に・最終確認の欄を「面接対応者」に入れ替えると、③ と保存 HTML の用紙で「最終確認」と書かれた欄をパスワードなしに押せ、紙だけ見る人にはパスワードなしの最終確認印に見えたため。L5c の「表示名・説明（label・hint）・名簿だけの変更は確認不要」は「**押印欄の説明（hint）・最終合否の表示名・名簿**だけの変更は確認不要」に変える。ダイアログ・設定・使い方の文言に「押印欄の表示名」を足す |
| L5d | （2026-10-14 追記・古いタブ）別のタブ（ウィンドウ）で設定が保存・初期化されたとき、古いタブが読み込み時のロックのまま ③ でパスワードなしに押せたり、表示名だけの保存で新しいロックを空・古いパスワードで上書きしたりしないよう、アプリは localStorage の設定（このタブが最後に読んだ・書いた `recruit.profile.v1` の文字列）と比べて、変わっていれば読み込み直す（`app.refreshProfileFromStorage`）。比べるのは `storage` イベント・タブに戻ったとき（`focus`・`visibilitychange`）と、**設定の保存・JSON の読み込み・初期化・③ の押印／取消・合否の決定／取消・解錠の直前**（`storage` イベントが届かなくても古い値で上書きしない）。読み込み直したら toast（「別のタブ（ウィンドウ）で保存された最新の設定を読み込みました」など）。③ は描き直す（ロックが付いていればパスワード欄。押そうとした操作はしない）。設定画面は、未保存の変更が無ければ最新の設定で描き直す（［設定を保存］を押したときは保存しない）。変更があれば下書きを残し、ロックが変わっていたときだけ下書きのロックを最新にする（下書きでパスワードを変えていた＝古いロックで確かめた変更なら取り消して保存しない。toast「…このタブでのパスワードの変更を取り消しました…」）。パスワードのダイアログ（L5b・L5c）を出しているあいだに別のタブでロックが変わったら、（古いロックの）正しいパスワードを入れても保存・読み込み・初期化をやめる（`app.lockMovedSince`。toast「…パスワードが変わったため、やめました…」）。ロック以外の項目は従来どおり保存したタブの内容（最後に保存したものが残る） |
| L5e | （2026-10-14 追記・3 回目のレビュー。L5d の続き）③ の**［報告書を保存（HTML）］・トップバーの［💾 保存］（`saveRecord`）の直前**にも `refreshProfileFromStorage` を呼ぶ（storage イベントが届かない古いタブが、読み込み時のロック〔ロックなし・前のパスワード〕を入れたファイルを書き出さない。読み込み直したら判定もやり直す）。設定画面で未保存の変更が無いときの描き直し（L5d）は `Settings.reload(fresh, keepLock)`: ロックが変わっていなければ、開いているパスワードの入力欄（［変更］［パスワードを外す］。下書きには入らない）と入力中の値・フォーカスを残し、下書きだけ最新にする（スクロール位置・台本の節の開閉も残す）。ロックが変わっていれば入力欄を閉じ、toast「別のタブ（ウィンドウ）で最終承認のパスワードが変わったため、最新の設定を読み込み、入力中のパスワードの欄を閉じました」 |
| L6 | `node build.js --local [dir]` は `<dir>/final-password.txt` の 1 行目（前後の空白・BOM を除く）があれば、build のたびに salt を作って hash を計算し、`config.default.js` の `finalLock: { salt: '', hash: '' }` を差し込む（平文は出力しない。ログは「最終承認のパスワード」とだけ出す）。テスト用は `tests/fixtures/local-sample/final-password.txt`（架空の値） |
| L6b | ブラウザに保存済みの設定（localStorage）に `management.finalLock` のキーが**無ければ**既定（ローカル版ならローカルのロック）を使う。キーが無いだけでは `report.stripped` を立てない＝開いただけでは既定のロックを localStorage に固定しない（`local/final-password.txt` を変えて build し直すと、設定を保存していない端末では新しい初期パスワードになる）。キーがあって空なら「外した」状態のまま（→ L6c で変更: 空も未設定。外した状態は「外した」印） |
| L6c | （2026-10-14 追記・公開版との localStorage の共有）Chrome などは file:// の localStorage を全ファイルで共有するので、ローカル版で設定を一度も保存していない端末で公開版（ロックなし）の［設定を保存］を押すと、空のロック `{ salt: '', hash: '' }` が書かれ、L6b の「キーがあって空なら外した状態」でローカル版のロックが外れていた。**空のロック・形の違うロックは未設定**（キーが無いのと同じ＝既定のロック。`storage.lockUnset`・`resolveLock`）とし、［パスワードを外す］は **「外した」印 `{ salt: '', hash: '', off: true }`** を書く（`normalizeLock` が印を残す。`isLocked` は false＝ロックなし）。印があるときだけ既定のロックを使わない。未設定なだけでは保存し直さない（`report.stripped` を立てない＝既定のロックを localStorage に固定しない。L6b と同じ）。印を書けるのは、有効なロックを外すとき（現在のパスワードを確かめる）か、すでに外してあるときだけ（`app.keepLockOff`: 設定の保存・JSON の読み込みで、ロックも印も無い状態から印を書こうとしたら未設定に戻す＝公開版で印の入った JSON を読み込んでもローカル版のロックは外れない）。JSON にロックも印も無ければ（公開版が書き出した空のロック・キーなし）、読み込んでも**いまのロックのまま**（ダイアログなし）。旧い版（c7c3a4f）で外した設定（空のロック）は既定のロック（ローカル版の初期パスワード）に戻る（設定で外し直す） |
| L6d | （2026-10-14 追記・3 回目のレビュー。公開版で決めたパスワードへの差し替え）ローカル版で設定を一度も保存していない端末では localStorage のロックが未設定のまま（L6b）で、同じ localStorage を使う公開版はそれを「ロックなし」として扱うため、公開版の［設定する］（現在のパスワード不要）や JSON の読み込み（ダイアログなし）で書いたロックを、ローカル版が有効なロックとして使っていた（初期パスワードを知らなくても公開版で好きなパスワードを決めればローカル版で最終確認・最終合否を押せる。善意で決めた場合はローカル版の利用者が初期パスワードで締め出される）。**ロック・「外した」印に「既定のロックからつながっている」印 `chain: true`** を持たせる: 既定のロック（ローカル版の初期パスワード。`storage.defaults()`）は chain の根（`chain: true`）。書き込むロック・印の chain は**いまのロックのものを引き継ぐ**（`app.inheritChain`。設定の保存・JSON の読み込み。同じロック・現在のパスワードを確かめた変更・すでに外してある状態からの設定は、いまの chain のまま）。ロックの無い状態（公開版の未設定）から付けた・外したもの・JSON から読んだものには chain を付けない（JSON の chain は使わない）。**既定のロックを持つ版（ローカル版）は chain の無いロック・印を使わない**（`storage.lockIgnored` → 既定のロック。開いただけでは保存し直さない＝公開版のロックを localStorage から消さない）。公開版は chain の有無にかかわらずロックを使い、chain は残す（正規化 `normalizeLock` は chain: true をロックと印にだけ残す）。保存 HTML の `finalLock` は salt と hash だけ（chain は入れない）。結果: 公開版で決めたパスワードは公開版だけのもの（ローカル版は初期パスワードのまま）。ローカル版で決めた・外した設定は公開版でも有効で、公開版で現在のパスワードを確かめて変えるとローカル版も新しいパスワード。ローカル版で設定を保存すると（ローカル版のロックを書くので）公開版で決めたパスワードは置き換わる。この版より前（c7c3a4f・5567f0c）にローカル版で変えた・外した設定（chain なし）は初期パスワードに戻る（設定し直す） |
| L7 | 保存 HTML の `#recruit-mgmt-config` に保存時の `finalLock`（ロックが無ければ `null`）と `lockField`（`decision.stampField`。互換のため残す）・`lockFields`（L1b の対象の欄。`finalLockFields`）を入れ、保存 HTML はそれで照合する（保存後にアプリでパスワードを変えても、出したファイルは出した時点のパスワード）。書き出すファイルに解錠状態・パスワード欄を残さない |
| L7b | （2026-10-14 追記・3 回目のレビュー）**ロックの無いアプリ**（公開版・外した設定。`finalLockNow()` が null）で、ロック付きで保存した HTML を読み込んだら、その記録には**ファイルの保存時のロック**（`#recruit-mgmt-config` の `finalLock`。`storage.parseRecordFromHTML(html, info)` が `info.finalLock` に入れる）を使う（`state.fileLock`・`app.stepLockNow()`）: ③ の最終確認・最終合否はそのパスワード欄（取消もパスワード）、保存し直すファイルの `finalLock` もそのロック（パスワードで押した承認の保護を、公開版で開いて保存し直すだけで外さない）。守る欄はアプリの設定の `finalLockFields`。読み込みの toast に「このファイルは最終承認のパスワード付きで保存されています。…（保存し直したファイルにも引き継ぎます）」。新規・ロックの無い記録の読み込みで外れる。アプリにロックがあれば従来どおりアプリのロック（L7）。設定の変更・JSON・初期化で確かめるのはアプリのロックだけ |
| L8 | README・HANDOFF・使い方（`#helpFinalLock`）に「誤操作を防ぐための鍵で、HTML をテキストで開いて書き換える人までは防げない」「平文は保存しない」「ローカル版の初期パスワードは `local/final-password.txt`（実際の値は書かない）」（2026-10-14 追記・3 回目のレビュー: 現場の利用者が読む使い方〔`#helpFinalLock`。公開版にも出る〕にはリポジトリ内のパスを出さず「ロゴ・名簿入りの版（ローカル版）の初期パスワードは管理者に確認してください（公開版には初期パスワードはありません）」とする。README・HANDOFF はパスのまま）。使い方のステップ 3 に「最終確認と最終合否は、副支配人が保存した HTML で押します。最終承認のパスワードがあるときはその入力が必要です」、「報告書（HTML）の流れ」の 3 に「最終承認のパスワードがあるときは、最初にパスワードを入力します」 |

### 11-1. 正規化・検証（storage.js）
- `fillManagement` の戻り値に `finalLock: resolveLock(mg.finalLock, bm.finalLock)`（L6c。未設定＝キーなし・空・形が違う → 既定のロック、それ以外 → `normalizeLock(mg.finalLock)`）。`normalizeLock` は salt（16 進 32 文字）と hash（16 進 64 文字）を小文字にして返し、どちらかが形に合わなければ、`off: true` なら `{ salt: '', hash: '', off: true }`、それ以外は `{ salt: '', hash: '' }`（余分なキーは落とす）。`lockUnset(l)`（ロックも印も無い）は公開 API
- `validateProfile`: `finalLock.hash` が空でないのに hash が 16 進 64 文字でない・salt が 16 進 32 文字でない、または `finalLock` がオブジェクトでないときエラー「最終承認のパスワードの設定が壊れています。パスワードを設定し直してください。」
- プロファイル JSON の書き出し・読み込みに `finalLock`（salt・hash）を含める

### 11-2. アプリ（app.js）
- `finalLockNow()`（ロックがあればそれ）・`finalNeedsPw(fid)`（`fid === ''` は最終合否、それ以外は `S.finalLockFields(profile)` に `fid` があるとき＝`'final'` と `decisionConfig().stampField`。解錠済み＝`finalUnlockedKey === salt + ':' + hash` なら false）。ロックが変わる（設定の保存・JSON・初期化）とキーが合わなくなり、また求める
- ③ の `#mgmtCard` の対象の欄と `#decisionCard` は、`finalNeedsPw` のとき操作（担当者の select・押印／取消・採用／不採用／取消）の代わりに `.final-lock`（「🔒 最終承認にはパスワードが必要です」・`.final-lock-pw`・［確認］`data-action="unlock-final"`・`.final-lock-err`）を出す。正しければ両方のカードを描き直し、押そうとしたカードの担当者の select にフォーカス、toast「最終承認のパスワードを確認しました（このページを閉じるまで有効）」
- `stamp`／`unstamp`／`decide`／`undecide` の処理の入口でも `finalNeedsPw` なら何もしない（念のため）
- ③ の紙（`#appPaper`）は従来どおりクリックしても何もしない
- （L5c）設定の `onSave(p)`: `next = normalizeProfile(p)`。`finalScopeChanges(next)`（現在のロックがあり `S.finalLockScope(next) !== S.finalLockScope(state.profile)`）なら `askFinalPassword('「押印欄と連動」・最終合否のスタンプの ON/OFF・押印欄の構成を変えると、最終承認のパスワードで守る欄が変わります。保存するには現在のパスワードを入力してください。')` → 正しければ保存、だめなら toast だけ。`onSave` は保存したかどうか（ダイアログのときは Promise）を返し、settings.js の `doSave` は保存したときだけ注意（warnings）の toast を出す。`importProfileText` は `finalLockChanges(p)`（ロックが変わる）か `finalScopeChanges(p)` ならダイアログ（文言はロックが変わるときは L5b のまま、対象だけが変わるときは「読み込むプロファイルでは「押印欄と連動」・最終合否のスタンプの ON/OFF・押印欄の構成が変わり、最終承認のパスワードで守る欄が変わります。…」）
- 設定画面の説明: 「押印欄と連動」の説明と「最終承認のパスワード」の説明、使い方の `#helpFinalLock` に L1b・L5c を 1 文ずつ
- （L5d）`storedRaw`（このタブが最後に読んだ・書いた設定の文字列。設定の保存は `persistProfile` で行い、書いた値を覚える）・`refreshProfileFromStorage()`（変わっていれば `S.loadProfile()` で読み込み直して描き直し、`{ prev, lockMoved, draftClean, lockReverted }` を返す。変わっていなければ null）。`storage`（キー `recruit.profile.v1`・`null`）・`focus`・`visibilitychange` で呼ぶ。`onSave` の最初（`draftClean`・`lockReverted` なら保存しない。`lockMoved` なら下書きのロックを最新に）・`importProfileText`・`onReset`・`onContentClick` の `stamp`／`unstamp`／`decide`／`undecide`／`unlock-final`（変わっていれば操作しない）でも呼ぶ。`lockMovedSince(sig)`: 保存の `commit`・JSON の `apply`・初期化の `doReset` の直前に読み込み直し、始めたときのロック（`lockSig`）と違えばやめる。settings.js に `isDraftOf(p)`（下書きが p と同じ）・`syncLock(prev, fresh)`（ロックが変わっていれば下書きのロックを最新にして描き直す。下書きで変えていたら true）
- （L6c）`keepLockOff(next)`: 次の設定のロックが「外した」印で、いまロックが無く印も無ければ `{ salt: '', hash: '' }` に戻す（`onSave`・`importProfileText`）。`importProfileText` は JSON の生の `management.finalLock` が `S.lockUnset` ならいまのロックをそのまま使う。settings.js の［パスワードを外す］は `{ salt: '', hash: '', off: true }`
- （L6d）storage.js: `defaults()` は既定のロックに `chain: true`。`normalizeLock` は `chain: true`（真偽値）をロックと印にだけ残す。`lockIgnored(l, def)`（未設定、または既定のロックがあり l に chain が無い）・`resolveLock`（使わないなら既定のロックに chain: true）。`normalizeProfile` の `report.stripped` は使わないロックも比べない。`generateReportHTML` の `finalLock` は `{ salt, hash }`。`normalizeLock` を公開 API に。app.js: `inheritChain(p)`（p のロック・印の chain を、いまの `state.profile` のロックの chain にそろえる）を `onSave` の正規化の前と、`importProfileText` で JSON のロック（`S.normalizeLock(rawLock)`）を使うときに呼ぶ
- （L5e）`saveRecord` の最初（応募者名の確認のあと）に `refreshProfileFromStorage()`。`refreshProfileFromStorage` の設定画面の描き直しは `Settings.reload(fresh, !lockMoved)`（入力欄を閉じたら true → toast の文言を変える）
- （L7b）`state.fileLock`・`stepLockNow()`（`finalLockNow() || state.fileLock`）を `finalNeedsPw`・`unlockFinal` で使う。`onFileChosen` → `S.parseRecordFromHTML(text, info)` → `applyRecord(rec, info.finalLock)`。`saveRecord` はアプリにロックが無くファイルのロックがあれば、`management.finalLock` だけ差し替えた設定の写しで `generateReportHTML`。`newRecord` で `state.fileLock = null`
- ③ の最終合否カードの連動の案内（「「採用」「不採用」を押すと、押印欄「最終確認」が未押印なら同じ担当者の印も押します。」）は、パスワード欄のあいだ（`finalNeedsPw('')`）は出さない（ボタンが無いため。3 回目のレビュー）
- 設定「押印欄と連動」の説明を 3 文に分ける（3 回目のレビュー。「ここ・」が分かりにくかった）:「合否を押したとき、この押印欄にも同じ担当者の印を押せます。最終承認のパスワードがあるときは、最終確認の欄（final）とこの欄の押印にパスワードが要ります。また、この「押印欄と連動」・最終合否のスタンプの ON/OFF・押印欄の構成（追加・削除）・押印欄の表示名を変えて保存するには、現在のパスワードが要ります。」

### 11-3. 保存 HTML（a4PageScript）
- 埋め込みスクリプトは `clFitSheet` → stamp.js の関数 → `RecruitLock.source()`（`sha256Hex`・`hashPassword`・`isLocked`・`verify`）→ `a4PageScript` の順の 1 本の IIFE
- `LK = cfg.finalLock`・`lockF = cfg.lockField`・`lockFs = cfg.lockFields（配列）に "final" を足したもの`（`lockFields` の無い設定は `["final", lockF]`）・`locked = !!LK && isLocked(LK)`・`unlocked = false`。`needPw(kind, id)` は `locked && !unlocked && (kind === "decision" || (kind === "stamp" && !!id && lockFs.indexOf(id) >= 0))`（L1b）
- 窓（`#a4Pop`）: `needPw` のとき本文は「最終承認にはパスワードが必要です」・`.pop-pw`（`type=password`・`autocomplete=off`）・`.pop-err`、フッターは［確認］`data-act="unlock"`・［閉じる］。フォーカスは `.pop-pw`。Enter・［確認］で `verify(LK, 値)` → 正しければ `unlocked = true` で同じ欄の窓を開き直す（担当者の select にフォーカス）。違えば `.pop-err` に「パスワードが違います」
- `onPopClick` でも `needPw` なら押印・合否の操作をしない（念のため）
- 書き出しは従来どおり窓を閉じてから複製するので、パスワード欄・解錠状態は残らない。開き直すとまたロック

### 11-4. テスト
- 単体 #91（sha256Hex の既知ベクタ ''・'abc'・'あ'・Node の crypto と一致・hashPassword・verify・isLocked・newSalt・makeLock・source を新しい vm で実行）・#92（finalLock の正規化〔大文字→小文字・不正→空・キーが無ければ既定・stripped を立てない〕・validateProfile・JSON・保存 HTML の `#recruit-mgmt-config`〔保存時のロック・lockField・平文なし・スクリプトの構文〕）。#81 は 12 章のゆったりを足した
- e2e E15（公開版はロックなし・dist にテスト用／local のパスワードもハッシュも無い〔local の値は出力しない〕・`build.js --local` の差し込み・③ の最終確認と最終合否・面接対応者は不要・違うと押せない・Enter で解錠して続けて押せる・localStorage に平文なし・保存 HTML の窓・開き直すとまたロック・設定の変更／外す・変えた後の保存 HTML は新しいパスワード／先に出したファイルは前のパスワード・JSON の読み込み・初期化）。E10 は設定の data-action に `lock-change`、使い方の `#helpFinalLock` を足した
- （L1b・L5c）単体 #92 に `lockFields`（既定 `["final"]`・「連動しない」でも `["final"]`・別の欄なら `["final","extra"]`）・`finalLockFields`・`finalLockScope`（表示名・説明・名簿では変わらず、連動・ON/OFF・欄の追加／削除／id／並びで変わる）・保存 HTML の `lockFs` を足した。e2e E15 (9)（ローカル版）: 「連動しない」に変えて保存 → ダイアログ（違うと「パスワードが違います」・キャンセルで保存しない・下書きは残る）→ 正しいと保存 → 表示名だけの変更はダイアログなし → 最終合否 OFF もダイアログ（Esc で保存しない）→ 押印欄の構成が変わる JSON（同じロック）もダイアログ → ③ の最終確認欄・最終合否はパスワード欄のまま → 保存 HTML の `lockFields` は `["final"]`・最終確認欄の窓はパスワード欄（正しいと解錠）。E15 (4) に `lockFields` を足した
- （L5d・L6c）単体 #92 に、空のロック・形の違うロック（`{ salt: lock.salt, hash: '' }`・文字列・null・`{ off: 'true' }`）は未設定＝既定のロックで `report.stripped` を立てない・「外した」印は外したまま（冪等・`validateProfile` は通る・保存 HTML の `finalLock` は null）・印があってもロックが正しければロック・公開版は空も印もロックなし、を足した。e2e E15 (6) の「ロックを外す JSON」は「外した」印の JSON に変え、ロックの無い JSON（空のロック・キーなし）はダイアログなしでいまのパスワードのまま、を足した。E15 (7) は外して保存すると印（`off: true`）。E15 (10) 公開版と localStorage を共有（ローカル版を開いたまま公開版で［設定を保存］→ 空のロックが書かれてもローカル版はパスワード欄・公開版で印の入った JSON を読み込んでも外れない・ローカル版で外した印は公開版で保存しても外れたまま）。E15 (11) 古いタブ（A でパスワードを付けると B は読み込み直して ③ はパスワード欄・B で表示名だけ保存しても A のロックのまま・B の下書きのパスワードの変更は A でロックが変わると取り消し、ほかの下書きは残る・ロック以外だけが変わったときは B の変更は残る・B でパスワードのダイアログを出しているあいだに A でパスワードが変わると、B で前のパスワードを入れても保存しない・B のページで localStorage を書き換えて storage イベントが届かない場合も保存と ③ の押印の直前に比べる）
- （3 回目のレビュー）単体 #92: 既定のロックは `chain: true`・chain の無いロック／印（公開版で付けた・外したもの、`chain: 'true'` など）はローカル版では既定のロックで `report.stripped` を立てない・chain のあるロック／印はそのまま・公開版は chain の有無にかかわらずロック（chain は残す）・保存 HTML の `finalLock` は salt と hash だけ・`normalizeLock`。`finalLockScope` は押印欄の表示名（入れ替え・「最終確認」への変更）で変わり、説明・最終合否の表示名・名簿では変わらない。e2e E15 (10) に「公開版でロックの無い状態から付けたパスワード・読み込んだ JSON（chain: true 入り）のパスワードでは、ローカル版は解錠できない（初期パスワードのまま）・公開版は自分のパスワードで施錠・ローカル版は開いただけでは公開版のロックを消さない」。E15 (9) の「表示名だけの変更はパスワード不要」は「押印欄の説明だけの変更は不要・押印欄の表示名の入れ替えはダイアログ（キャンセルで保存しない）・正しければ保存」に。E15 (11) の別のタブのローカル版を装う書き込み（`putLock`）は chain つきに、「表示名だけ変えて保存」は説明（hint）に。E15 (11) に ③ の保存（HTML）の直前に比べる（storage イベントなしでもファイルは最新のロック）・入力中のパスワードの欄は別のタブでロック以外が保存されても閉じない（入力が残り、下書きは最新）／パスワードが変わると閉じる。E15 (12) ロックの無い公開版でローカル版の採用済みファイルを読み込む（最終確認・最終合否はファイルのパスワード欄・取消もできない・保存し直したファイルにもそのロック・正しいパスワードで取消・新規で外れる）。E15 の ③ に、パスワード欄のあいだは連動の案内を出さない・解錠すると出す。E10 の使い方に「初期パスワードは管理者に確認してください」・リポジトリ内のパス（`local/`・`final-password`）が無い・押印欄の表示名・「報告書（HTML）の流れ」とステップ 3 のパスワードの手順
- 変異の確認（3 回目のレビュー修正）: 修正前の src（5567f0c）に新しいテストを当てると、単体 #92・#93 と e2e の E8 の追加 4 件・E10 の 2 件・E15 の連動の案内・表示名の入れ替え・公開版で付けたパスワード・保存（HTML）の直前に比べる、ほか chain つきの書き込みを前提にした E15 (10)(11) の確認が FAIL（入力中のパスワードの欄の確認で打ち切り）。修正後の src から `Settings.reload` の代わりに描き直す（入力欄を閉じる）・`stepLockNow` をアプリのロックだけに戻す、の 2 つを戻した版では、E15 の「入力中のパスワードの欄」と「ロックの無いアプリでロック付きの記録を読み込む」の 2 件だけが FAIL

## 12. 用紙を埋めるレイアウト（2026-10-14 追記）

### 12-0. 指示と決定
ユーザーは以前「印刷すると空白が多くなる」と指摘。通常の記録では内容が用紙の上 55% ほどで終わり、押印行の下に 80〜130mm の空白が残っていた（0-4 S4「押印行は内容の直後。用紙の下の余白は空白のまま」を本章で変更）。

| # | 決定 |
| --- | --- |
| F1 | 押印行（`.cl-stamps`）は**用紙の内寸の下端**（書類の最下段）。`.cl-sheet.cl-mode-sheet` を `display:flex;flex-direction:column;min-height:100%`（`.a4` の内寸 281mm）にする。シートに `zoom` が掛かっても（縮小の段階）`min-height:100%` は親の内寸で決まるので押印行は下端のまま（Chromium 141 で確認） |
| F2 | 押印行の上に「**面接メモ・所見**」の枠（`.cl-blk-notes` の見出しを「面接メモ・所見」に、中身を `.cl-nm-box` の枠に）。**常に出し**、残りの高さいっぱいに広げる（`.cl-blk-notes`・`.cl-nm-box` が `flex:1 1 auto`）。記入があれば `.cl-nm`（行）→ `.cl-nm-ref`（案内）を上から、その下は手書き用の罫線 `.cl-nm-lines`（`<i>` 38 本・高さ 7.5mm・`border-bottom:1px dotted #b8c2cf`・`flex:1 1 0;min-height:0;overflow:hidden`＝内容の高さに入らない）。記入が無ければ `.cl-nm-box.is-empty`（罫線 1 本分 7.5mm を最低の高さ）。説明・連絡の 1 行（`.cl-exline`）は枠の下・押印行の直前 |
| F3 | 内容が少ないときは **`.cl-roomy`**（本文 10.5px・行の高さ 1.5・確認点の行 上下 6px と ○△× 19px・ラベル 9.5px・見出し 11.5px・ブロックの間隔 13px）。ゆったりは面接メモ・所見の枠に罫線 38mm を残せるときだけ（`.cl-roomy.cl-measure .cl-nm-box .cl-nm-lines{min-height:38mm}`＝計測中だけ最低 38mm にして計る。表示中は最低の高さを付けないので、狭い画面の `--a4-zoom`〔0.45 前後〕で行の高さが丸められて内容が 3% ほど伸びても罫線の部分が縮んで吸収し、押印行は用紙の内寸の下端のまま） |
| F3b | 計測 `clFitSheet(sheet, limit)`: `.cl-measure`（`min-height:0 !important`＝用紙いっぱいに伸ばさない）を付けて内容の高さを測る。順は **`.cl-roomy` → 通常 → `.cl-compact` → `.cl-compact-q1` → `.cl-compact-2` → 縮小**。戻り値は `'cl-roomy'`・`''`・`'cl-compact'`…・`'zoom'`。各段階で「…」の判定（`.cl-cut`・`.cl-nm-cut`）をやり直す。印刷のときに計測し直さない（画面と印刷が同じ）。上限は従来どおり `CL_SHEET_LIMIT_PX = 1052` |
| F4 | 1 ページ・画面と印刷の一致・重いサンプルで 1 ページ（E8／E14）は維持。アプリ ③ の紙・アプリの印刷も同じ部品・同じ計測。段階ごとの面接所見の行数の上限（`.cl-compact` 10 行…）は段階を決めるための値で、決めたあとに残った罫線の空きは F5 で切れたメモに回す（F4 の「罫線の余白が残ることがある」は F5 で解消） |
| F5 | （2026-10-14 追記・長いメモが空き罫線を残して切れる）`clFitSheet` で段階を決めたあと（縮小〔`'zoom'`〕のときを除く）、「…」で切れた面接メモ（`.cl-nm-v.cl-cut`）が残り、面接メモ・所見の枠に空き（罫線の部分）があれば、**切れたメモの行数の上限を広げて空きを使う**。順は **面接所見（`.cl-nm-iv`）→ ① のメモ（`.cl-nm-memo`）→ 質問の回答・ブロックのメモ（`.cl-nm-q`・`.cl-nm-b`。用紙の順）**、それぞれ要素のインラインの `-webkit-line-clamp`（`style.setProperty`）で。行数は「見えていない行数」と「空きの行数〔(limit − 内容の高さ) ÷ 行の高さ〕」の小さい方をまず試し、上限を超えたら +1 行だけ試し、それも超えたら戻して次の要素へ（上限 `limit`＝1052px を超えない＝押印行は下端のまま・1 ページ）。罫線の空きは 0 行まで使う（計測中は `.cl-grow` を付け、`.cl-roomy` の罫線 38mm〔`.cl-roomy.cl-measure:not(.cl-grow)`〕を外す。ゆったりの段階でも広げる）。全部入りきれば `.cl-cut` が外れ、ほかに切れたもの（確認点のメモ `.cl-rt-nt` を含む）が無ければ `.cl-nm-cut`（「…」の案内 `.cl-nm-ref`）も外れる（案内 1 行が消える分も使う）。`clFitSheet` は最初に `.cl-nm-v` のインラインの行数を外してから測るので、書き出したファイル（インラインの行数が残る）を開き直しても・アプリで描き直しても同じ結果。計測は従来どおり読み込み時・押印／合否の変更後（保存 HTML）とアプリの再描画時だけで、印刷のときにやり直さない（画面と印刷が同じ）。`getComputedStyle` の無い環境では広げない。**広げるのは縦のはみ出し（`scrollHeight − clientHeight`）があるあいだだけ**（2026-10-14 追記）: `.cl-cut` は横のはみ出し（折り返せない幅広の書記素。ZWJ でつながった絵文字など）でも付くので、`.cl-cut` を条件に繰り返すと縦に全部見えたあとも止まらず固まっていた。縦に全部見えたら次の要素へ、行数の上限を上げても見えない高さが減らなければ戻してやめる、1 要素 200 回まで（横のはみ出しの `.cl-cut` と案内は残る） |
| F6 | （F5 に伴う）シートは用紙の内寸より高くならない（`.cl-sheet.cl-mode-sheet{…;min-height:100%;max-height:100%}`・`.cl-measure{min-height:0 !important;max-height:none !important}`）。面接メモ・所見の枠の `.cl-blk-notes`・`.cl-nm-box`・`.cl-nm` に `min-height:0`、`.cl-nm` に `overflow:hidden`。F5 で罫線の空きを使い切ると、狭い画面の `--a4-zoom`（0.41〜0.45）で行の高さ・折り返しが変わって内容が 3% ほど伸びた分を罫線が吸収できないため、枠（記入の部分）が縮んで吸収し、押印行は用紙の内寸の下端のまま（記入の最後の行が画面で少し隠れることがある。印刷・1440px では縮まない）。スクリプトが動かず段階が付かないファイルでも、長い記入は枠の中で切れて押印行は用紙の中に残る。（F7 で狭い画面の縮小を transform にしたので、保存 HTML では縮小で内容は伸びず、枠は縮まない。`max-height`・`overflow:hidden` は安全策として残す） |
| F7 | （2026-10-14 追記・狭い画面で記入が切れる）F5 で罫線の空きを使い切ると、保存 HTML を約 540px 以下で開いたとき、`.a4{zoom:var(--a4-zoom)}` の縮小で行の高さ・折り返しが変わって内容が伸びた分（390px で 18px・320px で 34px）を F6 の `.cl-nm{overflow:hidden}` が黙って切っていた（「メモ」の行・「…」が見えない。印刷と一致しない）。狭い画面の縮小は **`transform:scale(var(--a4-zoom))`（`transform-origin:0 0`）** にする（描画だけを縮め、レイアウトは計測した原寸のまま＝画面と印刷の行・折り返しが同じ）。用紙の箱は原寸のまま流れに残るので、`body>.a4` の余白で縮小後の大きさに合わせる: 上 `24px×倍率`、下 `24px×倍率 − 297mm×(1 − 倍率)`、左 `max(0px, (100% − 210mm×倍率) / 2)`（旧い zoom のときと同じ位置・同じ大きさ。`--a4-zoom` が無ければ transform は無効〔none〕で、余白は従来の中央寄せと同じ）。`@media screen` だけ。計測（fit）の前に `--a4-zoom` を外すのは従来どおり（transform ではレイアウトが変わらないので外さなくても同じ値）。アプリ ③ の紙は従来どおり zoom 0.95〜1（それより狭いと横スクロール）で、重いサンプルでも切れないことを E16 で確かめる |
| F5b | （2026-10-14 追記・3 回目のレビュー）F5 の「縮小（`'zoom'`）のときを除く」を廃止。**縮小の段階でも、縮小の測り直しのあと（内容の高さが上限以内なら）切れたメモを空きまで広げる**。縮小の測り直し（`z * limit / h` から 0.005 ずつ下げる）は比例しないので空きが残り、確認点 +40 件＋長いメモ（many40・縮小 0.677）で罫線の部分の空き 18px（面接所見の行 8.2px の 2 行分）を残したまま面接所見・メモが「…」で切れていた。空きの行数は縮小後の行の高さ（`lineHeight × 倍率`）で見積もる（`grow` の `Math.floor((limit - h) / (lh * z))`。z は縮小しないとき 1）。上限 1052px を超えない・1 ページ・押印行は下端は従来どおり。実測: many40 は面接所見が全文（隠れていた 12px → 0）、確認点 +65 件＋全メモ 300 字（縮小 0.485）は面接所見の隠れが 85px → 72px・まるごと空いた罫線 1 本 → 0 本 |
| F8 | （2026-10-14 追記・3 回目のレビュー。開いたときの固まり）保存 HTML は開いたときに同じ計測（`clFitSheet`）をスクリプト実行時・`load`・`document.fonts.ready` の 3 回、アプリは記録の読み込みで ③ を 2 回描いて 2 回していた（確認点 +65 件＋全メモ 300 字で、保存 HTML は操作できるまで 1.2〜1.5 秒、アプリは 1.3〜1.4 秒の long task）。**保存 HTML: `load`・`fonts.ready` では、前の計測のあとでフォントの読み込みの状態（`document.fonts.status`）か画像（ロゴの `<img>`）の `complete` が変わったときだけ測り直す**（`a4PageScript` の `layoutKey`・`refit`。計測のあとの状態を覚える。システムフォントだけでロゴの無い保存 HTML は 1 回。ロゴの読み込みが計測に間に合わなければ `load` でもう 1 回）。押印・合否の変更後・`__a4Fit()` は従来どおり必ず測る。S9 の「`load`・`fonts.ready` で測り直す」はこの条件つきに変える。**アプリ: `applyRecord` は ③ を `showView` の 1 回だけ描く**（`goStep` を呼ばず、③ を開くときは `goStep(4)` と同じく判定をやり直してから `showView`）。実測（Chromium 141）: 保存 HTML の +65 件＋全メモは long task 1 つ・操作できるまで 0.56〜0.88 秒（+65 件・メモなしは 0.40〜0.50 秒）。アプリの読み込みは計測 1 回・long task 0.44〜0.70 秒 |
| F9 | （2026-10-14 追記・3 回目のレビュー。df3b339 からの既存の問題）最終合否欄（`.cl-decision`）は最大幅なし（`flex:0 0 auto`）・担当者名（`.cl-dec-by`）は折り返さないため、担当者名が改行できない長い 1 語（URL 80 字・ZWJ でつながった絵文字）だと最終合否欄が広がり、左の 4 枚のタイル（結果・総合判断・必須条件・確認点）が「…」で潰れたり見えなくなったり、最終合否欄が用紙の外にはみ出していた。**`.cl-decision{min-width:0;max-width:48%}`・`.cl-dec-by`・`.cl-dec-date` に `overflow:hidden;text-overflow:ellipsis`**（担当者名は「…」で切る。全文は保存 HTML の窓・③ のカードにある）。48% は現実的な最長（役職「エリアマネージャー（新宿・日比谷・池袋 兼務）」・「Bartholomew-Montgomery-Fitzgerald（Assistant Manager）」で 332px＝結果ストリップの約 47%）を切らない幅。応募者名そのものが改行できない長い 1 語のときに用紙の右端で切れるのは従来どおり（`.a4{overflow:hidden}`） |

### 12-1. 実測（Chromium 141・1440px。tests/shots）
| 記録 | 段階 | 内容の高さ | 押印行の下端と内寸の下端の差 | 面接メモ・所見の枠 | PDF |
| --- | --- | --- | --- | --- | --- |
| 通常（E3 の採用・押印済み。`a4-form.png`・`a4-form-print.png`） | `.cl-roomy` | 890px | 0mm | 90.9mm（罫線 11 本） | 1 ページ |
| 記入なし（`a4-form-empty.html`） | `.cl-roomy` | 863px | 0mm | 91.4mm（罫線 12 本） | — |
| 重い（全メモ 300 字・面接所見 1,500 字。`a4-form-heavy.png`） | `.cl-compact` | 891px → F5 で 1049px | 0mm | 133mm（罫線の空き 46mm → F5 で 3.5mm。面接所見 10 行 → 23 行） | 1 ページ |
| 面接所見 4,000 字・全メモ 300 字（E16 `a4-form-iv4000.html`） | `.cl-compact` | 1047px（F5） | 0mm | 罫線の空き 4.0mm・面接所見 23 行 | 1 ページ |
| 確認点 +65 件（E8） | `.cl-compact-2`＋縮小 0.499 | ≤ 1052px | 0mm | — | 1 ページ |

面接所見の長さによる段階（アプリの印刷ホスト・回答なしの記録）: 0 字・300 字 → `.cl-roomy`、1,000 字 → 通常、3,000 字 → `.cl-compact`

F5 の実測（Chromium・1440px。scratchpad の生成記録・保存 HTML。段階は F5 の前後で同じ）:

| 記録 | 段階 | F5 の前 | F5 の後 | 390px（`--a4-zoom` 0.451） |
| --- | --- | --- | --- | --- |
| 重い（全メモ 300 字＋面接所見 1,500 字） | `.cl-compact` | 面接所見 10 行「…」・罫線の空き 45.8mm | 面接所見 23 行「…」・罫線の空き 4.0mm・内容 1047px | 同じ 23 行・押印行は下端（差 −0.01mm。F6 が無いと −4.1mm）。ただし zoom の縮小で記入が 18px 切れていた → F7（transform）で切れなし・差 0mm |
| 面接所見 3,000 字だけ | `.cl-compact` | 10 行「…」・空き 95.5mm | 38 行「…」・空き 5.6mm | 押印行は下端 |
| 質問の回答 300 字×5 だけ | 通常 | 各 2 行「…」・空き 74.2mm・案内あり | 各 6 行（全文）・空き 7.7mm・案内なし（「…」なし） | 押印行は下端 |
| 質問の回答 1 問だけ 600 字 | `.cl-roomy` | 2 行「…」・空き 75.7mm | 14 行（全文）・空き 29.9mm | 押印行は下端 |
| 確認点 +65 件（縮小） | `.cl-compact-2`＋縮小 0.49 | F5 なし（縮小の段階は広げない） | 同じ | 押印行の位置は F6 で −58.9mm → −32.9mm（縮小の段階は従来どおり狭い画面で下にはみ出す） |

計測の時間（保存 HTML の `__a4Fit()`・1440px）: 重い 72ms → 66ms、面接所見 3,000 字 42ms → 54ms（行数は見積もってから確かめるので、1 行ずつ測り直さない）

F7 の実測（保存 HTML・Chromium。`.cl-nm` の `scrollHeight − clientHeight`＝記入が隠れている高さ。zoom → transform）:

| 記録 | 540px | 480px | 430px | 390px | 375px | 360px | 320px |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 重い（全メモ 300 字＋面接所見 1,500 字・押印あり） | 3 → 0 | 5 → 0 | 13 → 0 | 18 → 0 | 27 → 0 | 30 → 0 | 34 → 0 |
| 質問の回答 600 字×5 | 0 → 0 | 3 → 0 | 10 → 0 | 11 → 0 | 15 → 0 | 21 → 0 | 27 → 0 |
| 面接所見 4,000 字＋全メモ 300 字 | 1 → 0 | 3 → 0 | 11 → 0 | 16 → 0 | 25 → 0 | 28 → 0 | 32 → 0 |
| 押印欄 4 件 | 2 → 0 | 5 → 0 | 12 → 0 | 17 → 0 | 27 → 0 | 29 → 0 | 34 → 0 |

transform では罫線の部分の高さ・行数（インラインの行数）・各行の高さ（縮小前）が 1440px と同じ（通常の記録の罫線は zoom のとき 320px で 79.8 → 68.3mm に縮んでいたが、transform では 79.8mm のまま）。押印行は内寸の下端（差 0mm）・横スクロールなし・用紙の位置と大きさ（左右 16px・上 24px×倍率）は zoom のときと同じ。アプリ ③ の紙（zoom 0.962〜0.997）は 3px 刻みで 790〜1110px を測って切れなし

F5 の固まり（2026-10-14 追記）: 質問のメモに折り返せない幅広の書記素（`'メモ' + '👨' + '‍👨'.repeat(60)`）があると、旧い `grow()` は保存 HTML・アプリ ③ の読み込みで 10 秒以上応答しなかった。縦のはみ出しだけを見るようにして 0.3 秒で開く（`.cl-cut` は付く）。面接所見 800 字＋同じ書記素（`.cl-compact`）は面接所見を 17 行まで広げて縦に全部見え、横のはみ出しの `.cl-cut` が残る

### 12-2. テストの変更
- 内容の高さで計っていた確認（E8 の `paperOf`・境界の記録・E14 (5)）は `.cl-measure` を付けて測る（`getBoundingClientRect().height` は用紙いっぱいの 1062px になるため）。境界の記録と E14 (5) には「押印行の下端が内寸の下端から 2mm 以内」を足した
- 単体 #76（並びの確認を `<section class="cl-blk cl-blk-notes">` で）・#80（記入なしでも空の枠と罫線 38 本・枠 → 説明・連絡 → 押印行・CSS）・#81（ゆったり → 通常 → 詰める段階・`.cl-measure` で測る・表示されていない用紙）
- e2e E16（通常の記録: ゆったり・押印行の下端 2mm 以内・枠 30mm 以上・罫線 7.5mm 間隔の点線・枠 → 説明・連絡 → 押印行・画面と PDF の画像が同じで下端 95% まで使う／重いサンプル: `.cl-compact`・1 ページ・押印行は下端／記入なし: 空の枠／ゆったりの付け外し／アプリ ③ の紙・アプリの印刷も同じ）
- （F5・F6）単体 #80（CSS: `max-height:100%`・`.cl-measure` の `max-height:none`・枠の `min-height:0`・`.cl-nm{min-height:0;overflow:hidden}`・`.cl-roomy.cl-measure:not(.cl-grow)`。保存 HTML の計測に広げる処理〔`setProperty('-webkit-line-clamp'`・`cl-grow`〕。旧い「`webkitLineClamp` を含まない」は削除）・#93（追加: 疑似 DOM で 面接所見 → メモ → 質問の回答の順・上限を超えず 1 行分の空きも残さない・全部入れば `.cl-cut`・`.cl-nm-cut` を外す・案内 1 行が消える分も使う・空きが無ければ広げない〔インラインを付けない〕・測り直すと同じ・`getComputedStyle` が無ければ広げない・見積もりで測る回数を抑える）
- e2e E8 の「面接所見は 10 行まで（紙の 2 割未満）」を「罫線の空きまで広げる（10 行より多い・まだ切れているので罫線の空き 7mm 未満・1052px 以内）」に変えた。E14 の `a4State` にインラインの行数を足した（390px で開いても 1440px と同じ）。E16 (2) に 面接所見の行数（> 10）・罫線の空き（切れたメモが残るとき 7mm 未満）・案内が残る・画面と印刷の画像が同じ（`a4-form-heavy-print.png`）・390px でも同じ行数で押印行は下端・押印を変えて書き出したファイルを開き直しても・`__a4Fit()` で測り直しても同じ行数・面接所見 4,000 字＋全メモ 300 字でも 1 ページ（`a4-form-iv4000.pdf`）を足した
- （F5 の固まり・F7）単体 #90 は reportCss の縮小を `transform:scale(var(--a4-zoom))`・余白の式・`zoom:var(--a4-zoom` が無いこと・transform は `@media print` より前（画面だけ）に変えた。#93 に、横にはみ出す面接所見（縦は全部見えたら止まる・`.cl-cut` は残る・続けてメモ・質問の回答も広げる）と、行数を上げても見える行が増えない要素（戻してやめる）を足した（疑似 DOM は 3,000 回測ったら「無限ループ」で止める）。e2e E16 に、狭い画面（540・430・390・360・320px）で重いサンプル・質問の回答 600 字×5・面接所見 4,000 字・押印欄 4 件の `.cl-nm` が切れない（`scrollHeight ≦ clientHeight + 1`）・行数と各行の高さが 1440px と同じ・`zoom` は 1・押印行は下端・横スクロールなし、と、幅広の書記素のメモで保存 HTML・アプリ ③ が 10 秒以内に開く（`.cl-cut` は付く・面接所見は縦に全部見えて止まる）、アプリ ③ の紙を 0.95〜1 に縮めた幅（1080・800px）でも重いサンプルが切れない、を足した
- 変異の確認（2 回目のレビュー修正）: `grow()` のループを `.cl-cut` の条件に戻す・縮小を zoom に戻す・`resolveLock` を「キーが無ければ既定」に戻す・`refreshProfileFromStorage`／`keepLockOff`／JSON のロックの引き継ぎを外す、をまとめて戻した版で、e2e の E15 の追加 5 件（JSON の読み込み・公開版と共有・古いタブ 3 件）と E16 の追加 2 件（狭い画面・幅広の書記素。10 秒で打ち切って続ける）が FAIL になることを確かめた。単体 #93 は `grow()` のループを戻すと「無限ループ」で FAIL。`lockMovedSince` だけを外した版では、E15 の「ダイアログを出しているあいだに A でパスワードが変わる」が FAIL（B が A の新しいロックを前のロックと「連動しない」で上書きした）
- 変異の確認: `grow()` を呼ばない・`finalNeedsPw`／`needPw` を `stampField` だけに戻す・保存／JSON のダイアログを外す、をまとめて戻した版で、単体 #92・#93 と e2e の E8（面接所見の行数）・E15 (9) の 4 件・E16 の追加 4 件が FAIL になることを確かめた。`max-height:100%` を外した版は、重いサンプルを 390px で開くと押印行が内寸の下端から −4.1mm（E16 の 390px の確認〔−0.1mm 以上〕で落ちる値）になることを計測で確かめた
- （3 回目のレビュー）単体 #93 に (5d) 縮小の段階でも縮小後の空きまで広げる（疑似 DOM の縮小は固定分が縮まない非比例。面接所見 10 → 11 行・上限以内・1 行分の空きを残さない。広げる処理を外した版では FAIL）。e2e E8 に、確認点 +40 件＋長いメモ（`zoomNotes`）の縮小の段階で面接所見のインラインの行数が付き、切れたメモが残るなら空きは縮小後の 1 行未満・保存 HTML を開いたときの計測は 1 回（4 件とも。`DOMTokenList.add` の `cl-roomy` を数える）・アプリで保存 HTML を読み込むと ③ の計測は 1 回・最終合否の担当者名が URL 80 字・ZWJ の絵文字でも最終合否欄は結果ストリップの 48% まで・タイルは切れない・用紙からはみ出さない

---

## 13. 実装メモ（実装時に決めたこと・本書からの差分。2026-10-14 の追記で 11 章から 13 章へ番号を移した）
- 埋め込みスクリプトの本体は文字列連結ではなく、`storage.js` の ES5 の関数 `a4PageScript(LIMIT, PAPER_W)` を `toString()` で埋め込む（`clFitSheet`・`RecruitStamp.source()` と同じやり方。`node --check` で構文を確かめられる）。生成されるのは 3-1 と同じ 1 本の IIFE: `clFitSheet` → stamp.js の関数 → `var LIMIT=1052,PAPER_W=793.7;` → `(function a4PageScript(LIMIT, PAPER_W){…})(LIMIT,PAPER_W);`。関数内の文字列は旧い埋め込みスクリプトと同じ二重引用符（`addEventListener("beforeunload"`・`recNode.textContent=JSON.stringify(rec).replace(/[<>&` は従来の文字列のまま）。テスト用の公開名は `window.__a4Fit = fit;`
- 埋め込み JSON（`#recruit-record`）が読めないときは押印・合否の欄に印を付けない（書き出しで記録を壊さない）。長いメモの窓は要素の `textContent` で出す
- 合否の窓にも見出しの下に `D.hint`（「最終確認者が合否を決めて押します」）を `.pop-sub` で出す。手入力の氏名欄で Enter を押すと押印
- `.pop input[hidden]{display:none}` を足した（`.pop input` に display を書いたときに hidden が効かなくならないよう）
- 設定画面「面接チェックリスト」の「印刷」行（`checklist.print.showQuestions`＝保存 HTML の「詳細」に質問文を載せる）を削除した（「詳細」表示ごと無くなり効き先が無い）。キーは旧い設定・記録の互換のため `normalizeChecklistDef` で残す。e2e E10 の data-bind の許可リストからも外した
- アプリの文言: ③ の紙の見出し（cap）・押印カードの説明・設定「応募者の管理（押印）」の説明・使い方の「報告書（HTML）の流れ」を、用紙の欄をクリックして押す流れに直した（「詳細」「レポート上で」の記述を削除）
- 互換の fixture `tests/fixtures/legacy-report-view.html` を追加（a9e39cb の `generateReportHTML` の出力。報告書／詳細の切替つき）。e2e E14 (A11) で「そのまま開いて詳細へ切り替えられる」「アプリで読み込み → 保存し直すと A4 の用紙（押印を引き継ぐ）」を確かめる
- 単体: #53・#66・#71・#76〜#81・#87〜#89 を書き換え、#90 を追加（30 件）。e2e: E2・E3・E5・E6・E8・E9・E10・E11・E12・E13 を書き換え、E14 を追加
- レビュー修正（2026-10-14）:
  - 印刷の `@media print` に `.a4 [data-a4-t]{outline:none !important}`（:focus・:focus-visible も）。Esc・Enter・Tab の直後に Ctrl+P を押すと、欄の既定のフォーカス枠（黒い角丸）が紙に出ていた
  - 保存バーを右下へ（1-5）。保存後は［×］で閉じられる。出ているあいだは `body.a4-sb` で下に余白（画面だけ）。書き出しの複製からは `a4-sb`・`--a4-sbh` も外す
  - 最終合否の欄のホバーの案内は 1 行（`white-space:nowrap`）で欄の上の辺の外に出す（未押印の欄では 2 行に折り返して「未押印」を隠していた。押した後は日付に重なっていた）
  - アプリ ③ の紙の案内は「保存した HTML の画面で…」（`o.refWhere`。1-2）
  - `place()`: 欄の上にも下にも入らないときは `top=max(8, vh-ph-8)`。メモの窓は本文（`.pop-b`）だけスクロールし、見出しと［閉じる］は常に見える
  - 合否の取消は `changed()` → `closePop(true)` の順（3-6）。フォーカスが body に落ちていた
  - テスト: 単体 #66（`print.showQuestions` は正規化で残るが用紙の出力は変わらない）・#71（食い違い注記は用紙に出ない＝noScript 側だけ）・#80（`refWhere`）を直した。e2e は 7-3 の「レビュー後の追加」（213 → 221 件）。直したコード（印刷の outline・保存バーの位置・案内の位置・`place()` の収め方・取消の順・食い違い注記の採用×不採用推奨・面接対応者の初期選択・`fit()` と書き出しの `--a4-zoom` の外し方）を元に戻した変異版で、対応する確認が FAIL になることを確かめた

---

## 14. 人物像の追加による用紙の変更（2026-10-16 追記）

作業仕様は `docs/SPEC-persona.md`（4 章 A4 報告・5 章 面接記入シート・11 章 実装時の差分）。ここでは用紙（`checklistSheetHtml`＝`clOnePageHtml`・`checklistSheetCss`・`a4PageScript`）の変更点だけをまとめる。アプリ ③ の紙・アプリの印刷・保存 HTML で共通。

- **結果ストリップは 5 タイル**: 結果・総合判断・必須条件・確認点・**人物像**（人物像を使う記録だけ。並びのクラスは `.cl-tiles.has-ps`。`n5` は使わない）。人物像のタイル `.cl-tile.cl-tile-ps`: 値 `28<small>/35点</small>`（入力が無ければ「未入力」）・下段 `80%`（未入力があれば「未入力 n」）・1 点の項目があれば `.is-ng`（赤）と「・1点あり」。題は設定の見出しから末尾の（…）を外したもの（既定「人物像」）。人物像を使わない記録（`checklist.persona === null`＝導入前に保存した記録・設定で OFF・台本に persona なし）は従来の 4 タイル
- **最終合否欄の上限は 36%**（`.cl-decision{max-width:36%}`。12 章 F9 の 48% を置き換え）。5 タイルを「…」で潰さない。担当者名が改行できない長い 1 語（URL 80 字・ZWJ でつながった絵文字）でも結果ストリップの 36% まで・用紙からはみ出さない（e2e E8 の `dec39`）。レビュー指摘（`docs/SPEC-persona.md` 11-8 の 5）で、5 タイルの列を `minmax(min-content, …)`（タイルは中身の幅より狭くならない）にし、`.cl-judge-main{flex-basis:0%;min-width:min-content}`・`.cl-decision{flex-shrink:1}` を足した（タイルの中身が入らないときだけ最終合否欄が縮んで担当者名を「…」で切る）。36% の上限だけでは、担当者名が 18 文字前後（氏名＋役職）で結果「上長最終判断要」・人物像「未入力 3・1点あり」が「…」で切れていた。4 タイル（人物像なし）の規則は変えていない（36% の上限と `.cl-judge-main`／`.cl-decision` の flex は 4 タイルにも効く。人物像の導入前の記録・設定で OFF の 4 タイルも長い担当者名でタイルが切れないことを e2e E8 の `dec39` で確かめる。`docs/SPEC-persona.md` 11-9 の 8）
- **確認点｜人物像の 2 カラム**: 必須条件｜勤務条件の確認 の下を `div.cl-cols.cl-cols-eval`（50:50）にし、左に確認点の表 `section.cl-blk.cl-blk-rate`、右に人物像 `section.cl-blk.cl-blk-persona`（見出しに凡例「1 不採用レベル　3 普通　5 とても良い」と合計 `.cl-ps-sum`。表 `table.cl-ps` の行 `tr[data-ps-item]`〔点で `s-1`〜`s-5`、未入力は `s-0`〕・目盛り `.cl-ps-bar` の `i.on`・点 `.cl-ps-v`〔未入力は「—」〕）。人物像を使わない記録は確認点の表だけ（全幅。`.cl-cols-eval` なし）
- **確認点のメモは面接メモ・所見の枠へ**: 確認点の表からメモの列（`col.c-nt`・`td.cl-rt-nt`）を外し（`col.c-lbl{width:auto}`。列の CSS・保存 HTML の窓の `tr` の分岐はレビュー指摘 13 で削除。旧い保存 HTML は保存時の CSS・スクリプトを自分で持つ）、枠の 1 行 `div.cl-nm-row.cl-nm-b.cl-nm-rt`「確認点のメモ」（`span.cl-nm-rt-i[data-cl-item]` に `<b>①具体性</b>：…` を `span.cl-nm-rt-sep`「／」でつなぐ。質問の回答の後・面接所見の前）。行数は `.cl-nm-b`（ブロックのメモ）と同じ（2 行・`.cl-compact-q1` 以降は 1 行）で、「…」で切れたら F5 の広げる順にも乗る。保存 HTML の窓（`a4PageScript` の `memoOf`）は 1 項目 1 行
- **用紙の並び**（1-2 の更新）: 見出し → 応募者 → 結果ストリップ（5 タイル＋最終合否）→ 必須条件｜勤務条件の確認 → 確認点 6 行｜人物像 7 行 → 面接メモ・所見の枠（質問の回答・確認点のメモ・面接所見・① のメモ → 罫線）→ 説明・連絡 1 行 → 押印行（用紙の内寸の下端）
- `clFitSheet`（1 ページ保証・F5 の広げる処理）は**変えていない**（単体 #93 の疑似 DOM がセレクタ文字列で照合している。確認点のメモの行を `.cl-nm-b` にしたのはこのため）。CSS は足すだけ（`.cl-tiles.has-ps`・`.cl-cols-eval`・`.cl-ps*`・`.cl-nm-rt*`・ゆったり／詰めの `.cl-ps`。`@media`・`n5`・`print-checklist` は書かない）。既存の規則で変えたのは `.cl-rt col.c-lbl{width:auto}`（メモの列を外したため）と `.cl-decision` の `max-width`（48% → 36%）だけ
- 見出しは報告書と面接記入シートで共通の内部関数 `clTitleHtml(meta, def, label, dateText)` に切り出した（報告書の出力は 1 文字も変えていない。単体 #80・#89）
- 実測（Chromium・既定の台本・1440px。e2e E17 (7)）: 全部 4 点・確認点すべて ○・面接所見 1 行 → `.cl-roomy` 880px（上限 1052px）・確認点｜人物像の幅 351px／351px・押印行は用紙の内寸の下端（差 0）・保存 HTML をそのまま印刷して PDF 1 ページ・画面と印刷の画像が同じ様式（平均の差 1.33）。アプリの A4 印刷も同じ段階で 1 ページ。重いサンプル（確認点のメモ 300 字×6・人物像 4,5,1,3,4,2,5）→ `.cl-compact` 1044px・1 ページ・確認点のメモの行は「…」
- テストの見本の選び直し: e2e E8 の `zoomNotes`（縮小の段階でも広げる。F5b）は確認点 +40 件・面接所見 400 字 → +46 件・600 字（確認点のメモが枠の 1 行に移って高さが変わり、縮小後の空きが縮小後の 1 行〔8.2px〕に 0.1px 足りず広げようがなかった。縮小後の空きは zoom の刻みしだい）。E16 (3b) の上限近くのゆったりの見本は面接所見を 40〜600 字・20 字刻みで探す（今は 140 字・1051px）
- **面接記入シート**（手書き用。`docs/SPEC-persona.md` 5 章）は、同じ用紙の箱 `.a4` と見出し `.cl-title` を使う**別の用紙**（`paperSheetHtml`・`paperSheetCss`・`fitPaperSheet`。1 ページに収めるのは質問の罫線の本数 3 → 2 → 1 → 詰め → 縮小）。アプリの印刷ホスト `#clSheet`（`div.a4.pp-a4`）と `body.print-checklist`・`@page a4sheet` で印刷する（印字するのは ① の欄のとおり。面接日が空なら記入用の線。印刷で記録を書き換えない。片付けは報告書と同じ afterprint／3 秒。`docs/SPEC-persona.md` 11-9 の 3・9）。保存 HTML には入らない（保存 HTML の用紙・スクリプトは変えていない。変えたのは `memoOf` の確認点のメモの行だけ）
