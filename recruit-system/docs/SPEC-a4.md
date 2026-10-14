# SPEC-a4 — 保存 HTML を「A4 縦の用紙 1 枚」にする（作業仕様）

作成 2026-10-14。基準コミット `a9e39cb`（全テスト緑: 単体 29 件・e2e E1〜E13 190 チェック）。**commit / push はしない**。
**行番号はすべて a9e39cb 時点の目安**。関数名・定数名・id で探すこと。作業用ファイルは scratchpad に置く。

---

## 0. 目的・前提・決定事項

### 0-1. ユーザー（副支配人）の指示
> あと出力のHTMLはa4たてがたをイメージ。その様式で印刷もしたい。（別にしない）

### 0-2. ユーザーの選択（変更不可）
- 「詳細」表示（台本の全文・長いメモの全文）は**なくして A4 1 枚だけ**。メモが長くて「…」で切れたときは、画面でそのメモをクリックすると全文を表示（印刷は常に 1 枚）
- 押印と最終合否は**用紙の欄を直接クリック**。小さな窓（ポップオーバー）で担当者を選んで押す。用紙の外に常設の操作パネルは置かない（窓は印刷されない）

### 0-3. オーケストレータの設計（A1〜A13。要約。本書はこれを具体化する）
A1 保存 HTML は body 直下の用紙 `main.a4#a4`（210×297mm 固定・内側の余白 8mm／10mm）そのもの。画面と印刷で同じ要素・寸法・文字組み。印刷専用の複製・詳細表示・操作カード類は削除 ／ A2 中身は現行の 1 ページ要約＋押印行（最下段） ／ A3 見出しは白地＋濃紺 2px の下線・左にロゴ＋題・右に版／劇場／作成日 ／ A4 押印行込みの用紙を内寸の高さで計測（読み込み時に確定し、印刷時に切り替えない） ／ A5 押印は欄クリックの窓 ／ A6 最終合否は `.cl-decision` クリックの窓 ／ A7 右上の通知バーで保存（レビュー後に**右下**へ変更。11 章） ／ A8 切れたメモはクリックで全文 ／ A9 狭い画面は縮小表示 ／ A10 アプリ ③ の紙と A4 印刷も同じ用紙 ／ A11 旧い保存 HTML の互換 ／ A12 テスト ／ A13 docs

### 0-4. 本書の決定（S1〜S16。迷ったらここに従う）
| # | 決定 |
| --- | --- |
| S1 | 用紙の中身は `storage.checklistSheetHtml(record, profile, o)` が作る `.cl-sheet.cl-mode-sheet`（**常に 1 ページの要約**。`o.mode` は無視し、`'section'` は削除）。押印行も同じ関数が `record.management` と `profile.management.fields` から描く（`o.stamps` の HTML 文字列渡しは廃止。`app.checklistStampsHtml` は削除） |
| S2 | 用紙の箱 `.a4` の規則（寸法・余白・白地・影・`overflow:hidden`）は**共有の `checklistSheetCss()`** に置く（アプリ ③ と保存 HTML とアプリの印刷で同じ規則）。ページ配置（灰色の背景・上下 24px・`@page`）は保存 HTML 用の `reportCss()`、アプリ用は `styles.css` |
| S3 | 1 ページの上限は**定数 `CL_SHEET_LIMIT_PX = 1052`**（内寸 281mm ≒ 1062.0px から 10px の余裕）。`.cl-sheet` 全体（押印行を含む）の高さで計る。`checklistSheetLimit(n)`・`CL_SHEET_PAGE_PX`・`CL_SHEET_STAMPS_PX`・`CL_SHEET_STAMP_ROW_PX`・`CL_SHEET_BODY_PX` は削除 |
| S4 | 押印行は内容の直後（`margin-top:10px`）に置く。用紙の下端に固定しない（固定すると計測が複雑になり、縮小時の位置もずれるため）。用紙の下の余白は空白のまま |
| S5 | 保存 HTML のスクリプトは**1 本**（計測・縮小・窓・押印・合否・長いメモ・保存バー・書き出し）。窓 `.pop` と保存バー `.savebar` は**スクリプトが必要なときに body の末尾に作る**（生成 HTML には無い）。押せる欄の印（`data-a4-t`・`tabindex` など）もスクリプトが付ける |
| S6 | 書き出しは `document.documentElement.cloneNode(true)` の**複製を掃除してから** `outerHTML`（窓・バー・`body.a4-live`・`data-a4-t` 系の属性・`--a4-zoom` を外す）。生きているページは書き換えない |
| S7 | 狭い画面の縮小は **CSS 変数 `--a4-zoom` を `<html>` に置き、`@media screen{.a4{zoom:var(--a4-zoom,1)}}`**。計測（`clFitSheet`）は必ず `--a4-zoom` を外した状態で行う（試作で確認: 祖先の zoom 0.5 で `getBoundingClientRect` は 735→380px、`offsetHeight` も文字の折り返しが変わって 736→760px になる） |
| S8 | `beforeprint`/`afterprint`/`matchMedia('print')` は保存 HTML では**使わない**（印刷のための切替なし）。`resize` では縮小だけをやり直し、計測はしない |
| S9 | 計測のやり直しは「スクリプト実行時」「`window` の `load`」「`document.fonts.ready`」「押印・合否を変えたあと（render）」だけ |
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
- 取消（`unstamp`/`undecide`）は押印済み／合否ありのときだけ出す。採用／不採用のボタンの色は `--dec-hire`/`--dec-reject`（`D.hireColor`/`D.rejectColor`）を窓の style に置く
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
.pop-h{font-weight:800;font-size:13.5px}.pop-sub,.pop-ref{font-size:11.5px;color:#5b6675}
.pop-b{display:flex;flex-direction:column;gap:6px;margin:8px 0}
.pop-l{display:flex;flex-direction:column;gap:2px;font-size:11.5px;font-weight:700;color:#5b6675}
.pop select,.pop input{font:inherit;font-size:13px;padding:5px 8px;border:1px solid #c7d0db;border-radius:6px;background:#fff;color:#1a2233;width:100%}
.pop-note{font-size:12px;color:#9a5b00;background:#fdf1dc;border:1px solid #f3cf8a;border-radius:6px;padding:3px 8px}
.pop-err{font-size:12px;font-weight:700;color:#b42318}.pop-err:empty{display:none}
.pop-text{white-space:pre-wrap;overflow-wrap:anywhere}
.pop-memos{margin:0}.pop-memos dt{font-size:11.5px;font-weight:700;color:#5b6675;margin-top:6px}.pop-memos dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.pop-f{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.pop-f button,.savebar-btn{font:inherit;font-size:12.5px;font-weight:700;padding:5px 12px;border-radius:6px;border:1px solid #c7d0db;background:#fff;color:#1a2233;cursor:pointer}
.pop-f button.primary,.savebar-btn{background:#1f5fbf;border-color:#1f5fbf;color:#fff}
.pop-dec{color:var(--dec) !important;border:1.5px solid var(--dec) !important}.pop-hire{--dec:var(--dec-hire,#c8232c)}.pop-reject{--dec:var(--dec-reject,#1f4e8c)}
.pop-dec:hover,.pop-dec.on{background:var(--dec) !important;color:#fff !important}
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
- `fitReportPaper`: `S.fitChecklistSheet(sh)`（上限は既定）。縮小（0.95 まで）・`.paper-stack` の処理はそのまま
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
- レビュー後の追加（11 章）: キーボード操作の直後（Esc で欄に戻る・Shift+Tab で「最終合否」）に印刷の表示で `outlineStyle` が `none`・その状態の PDF の画像がフォーカスなしの印刷と画素単位で同じ／ホバーの案内は 1 行・最終合否の欄の案内は欄の上の辺の外（未押印・押した後）／保存バーは 1280×768 で右下・見出し・氏名・最終合否に重ならない（スクロール 0／120px）・いちばん下までスクロールすれば用紙・注記に重ならない・保存後は［×］で閉じる・書き出しに `a4-sb` が残らない、390×844 で用紙・見出し・氏名・最終合否に重ならない／1366×768 で全文の窓が欄の上下どちらにも入らないときは画面の中（本文だけスクロール・［閉じる］が見える）／重いサンプルを 390px で**最初から**開いても 1440px と同じ class・zoom・印刷の表示でシートが 1052px 以内で押印行が内寸に収まる・PDF 1 枚・この幅で書き出したファイルに `--a4-zoom` が無い。E8: ③ の紙の案内は「保存した HTML の画面で…」・③ の紙のクリックで窓は出ない・アプリの印刷の PDF は「画面でクリックすると全文」。E9: 採用×不採用推奨の注記。E12: 未押印の面接対応者の窓は台本の担当を名簿から初期選択・そのまま押印した名簿の値（役職つき）が書き出したファイルに入る・キーボードで合否を取り消すとフォーカスが新しい欄に戻る
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

## 11. 実装メモ（実装時に決めたこと・本書からの差分）
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
