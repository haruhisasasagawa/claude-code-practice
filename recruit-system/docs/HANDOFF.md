# 引き継ぎメモ — 最終承認のパスワード・用紙を埋めるレイアウト（2026-10-14。ロックの迂回・長いメモの空き罫線・公開版との localStorage の共有・古いタブ・計測の固まり・狭い画面の切れの修正を含む）完了時点

- フェーズ1〜3: UI の骨格・新宿の運用要件・入力の段階分け（2026-10-14 に削除。末尾「削除済み機能」）
- **フェーズ4: 面接チェックリスト（面接台本 2026-10-08 版）**。詳細仕様は `docs/SPEC-checklist.md`。副支配人「添付の面接台本のチェックリスト（採点リスト）を入力して出力・報告できるようにしたほうがいい」への対応
- **フェーズ5: 保存 HTML の「報告書」表示と最終合否スタンプ（採用／不採用）**。詳細仕様は `docs/SPEC-report.md`。運用「面接者が報告書 HTML を出力 → 副支配人が開いて合否＋電子印 → 再出力してスレッドに添付」への対応
- **フェーズ6: 3 ステップ（応募者 → 面接チェックリスト → 報告書）**。詳細仕様は `docs/SPEC-script-mode.md`。副支配人「応募者の名前と属性入れたらもう渡した面接台本のとおりの報告でいい」への対応
- **2026-10-13: 入力の簡素化**（消極属性の削除・① 応募者を 1 枚 3 行・② のヘッダーを 1 行・「すべて説明した」）。`docs/SPEC-script-mode.md` 12 章
- **2026-10-14: A4「面接チェックリスト報告」を 1 ページの要約に**。副支配人「出力される報告書が煩雑すぎて頭に入ってこない。わかりやすく、かつ1ページで」。`docs/SPEC-checklist.md` 4 章・`docs/SPEC-script-mode.md` 13 章
- **2026-10-14: 面接特化**。副支配人「初期対応者の欄は削ってもらって構わない。面接に特化したソフトにしたい。面接までの経緯はクリアしているので省いてよい。他にもいらない機能があれば削ってくれ」。作業仕様は `docs/SPEC-slim.md`（末尾「削除済み機能」）
- **2026-10-14: 保存 HTML を A4 縦の用紙 1 枚に**。副支配人「出力の HTML は A4 たてがたをイメージ。その様式で印刷もしたい（別にしない）」。「詳細」表示は無くして A4 1 枚だけ（切れたメモはクリックで全文）、押印・最終合否は用紙の欄を直接クリック（窓）。作業仕様は `docs/SPEC-a4.md`
- **2026-10-14: 最終承認のパスワード**。副支配人「最終承認の押印はパスワードが必要な感じの方がいいかもしれないね」。最終確認の押印・取消と最終合否の決定・取消の前にパスワード（③ と保存 HTML。面接対応者は不要）。平文は持たず `management.finalLock = { salt, hash }`。ローカル版の初期パスワードは `local/final-password.txt`。`docs/SPEC-a4.md` 11 章
- **2026-10-14: 用紙を埋めるレイアウト**（「印刷すると空白が多くなる」への対応。オーケストレータの判断）。押印行は用紙の内寸の下端・その上の「面接メモ・所見」の枠が残りの高さいっぱい（記入なしでも手書き用の罫線）・内容が少なければゆったり（`.cl-roomy`）。`docs/SPEC-a4.md` 12 章
- **2026-10-14: レビュー修正（ロックの迂回・長いメモの空き罫線）**。(1) 設定の「押印欄と連動」を「連動しない」・別の欄に変えて保存すると、パスワードなしで最終確認の押印ができた → ロックの対象は常に既定の最終確認欄 `'final'` と `decision.stampField` の欄の両方（`storage.finalLockFields`）。ロックがあるとき、押印欄と連動・最終合否の ON/OFF・押印欄の構成（追加・削除・id）を変える保存と JSON の読み込みは現在のパスワード（表示名・説明だけなら不要）。`docs/SPEC-a4.md` 11 章 L1b・L5c。(2) 重いサンプルの `.cl-compact` で面接所見が「…」で切れているのに枠の下に罫線の空き（46mm）が残った → `clFitSheet` が段階を決めたあと、切れたメモの行数の上限を罫線の空きまで広げる（面接所見 → メモ → 質問の回答。重いサンプルの面接所見 10 → 23 行・空き 3.5mm）。シートは用紙の内寸より高くならない（`max-height:100%`。狭い画面の縮小で伸びた分は枠が縮んで吸収）。`docs/SPEC-a4.md` 12 章 F5・F6
- **2026-10-14: 2 回目のレビュー修正**。(1) 同じ file:// の localStorage を公開版と共有するため、ローカル版で設定を保存していない端末で公開版の［設定を保存］を押すとローカル版のロックが外れた → 空のロック（`{ salt: '', hash: '' }`）は未設定＝既定のロック、［パスワードを外す］は「外した」印 `{ salt: '', hash: '', off: true }`（印を書けるのは有効なロックを外すときだけ。ロックの無い JSON はいまのロックのまま）。`docs/SPEC-a4.md` 11 章 L6c。(2) 古いタブがロックの無いまま ③ で押せた・表示名だけの保存で別のタブのロックを上書きした → storage イベント・タブに戻ったとき・保存／読み込み／初期化／③ の押印・合否・解錠の直前に localStorage と比べて読み込み直す（下書きで変えていたパスワードは、別のタブでロックが変わっていれば取り消す。パスワードのダイアログ中に別のタブでロックが変わったら保存しない）。11 章 L5d。(3) 折り返せない幅広の書記素のメモで `clFitSheet` の `grow()` が無限ループ（保存 HTML・アプリ ③ が固まる）→ 縦のはみ出しだけを見る・進まなければやめる・1 要素 200 回まで。12 章 F5。(4) 保存 HTML を約 540px 以下で開くと面接メモ・所見の枠の最後の 1.5〜3 行が切れた（zoom の縮小で内容が伸び、F6 の `overflow:hidden` が切る）→ 狭い画面の縮小を `transform:scale` に（レイアウトは原寸のまま。画面と印刷の行・折り返しが同じ）。12 章 F7
- `docs/SPEC-checklist.md`・`SPEC-report.md`・`SPEC-script-mode.md` は各フェーズの確定版のまま（冒頭の注記のとおり、詳細モード・初期対応者・旧 10 項目評価・レポート全体印刷の記述、および保存 HTML の報告書／詳細表示・`#clPaper`／`#clSheet`・`#mgmt`／`#decision`・'section' モードの記述は無効）

## 1. 現状の到達点

### 1-1. 画面（3 ステップ。内部キーは 1 / 3 / 4、表示は ①②③）
- ナビ「報告書の作成」・トップバー「面接チェックリスト報告」・サイドバー「手順」（`index.html` に直書き）。右サマリー、ダークモード、390px 対応
- **① 応募者** `#scriptApplicantCard`（1 枚・3 行）: 氏名*・年齢・性別・区分（学生は卒業予定年月 `#grp-graduation`）／面接日 `#saDate`・面接担当者 `#saInterviewer`（名簿）・応募した求人 `#saPosting`（通常／短期）／タクシー可否・料金 `#saTaxi`・メモ。「面接チェックリストへ進む →」`#saNext`。氏名だけ必須
- **② 面接チェックリスト**: 1 行の読み取り専用ヘッダー `#clHeader`（チップ＋「応募者を編集」）→ 目次 → 台本の ①〜⑤（必須条件 一致／不一致・説明のチェックと「すべて説明した」・質問とメモ・記入欄・確認点 ○△× とメモ・合否連絡）→ 総合判断・面接所見 `#clOverall` →「← 応募者に戻る」`#backToApplicant`・「🖨 面接チェックリスト報告（A4）」`#clPrintBtn`・「報告書へ進む →」`#toReportBtn`（入力チェックで止めない）
- **③ 報告書**: 確認事項 `#scriptWarnings` → A4 縦の用紙 `#appPaperWrap > #appPaper.a4`（保存 HTML と同じ部品: 210×297mm・白地＋下線の見出し・押印行も用紙の中。等倍。1280px・1366px は右サマリーを用紙の下へ。用紙の欄はクリックしても何もしない）→ 押印 `#mgmtCard`（**面接対応者・最終確認の 2 欄・2 列**）→ 最終合否 `#decisionCard`（最終承認のパスワードがあり未解錠なら、最終確認の欄と最終合否は操作の代わりに `.final-lock` のパスワード欄と［確認］。正しければページを閉じるまで解錠）→「← 面接チェックリストに戻る」`#backToChecklist`・「🖨 A4 で印刷」`#reportPrintBtn`・「💾 報告書を保存（HTML）」`#reportSaveBtn`
- 右サマリー: 応募者（氏名・区分/年齢/性別〔短期求人ならチップ〕・面接日・担当）／面接チェックリスト（必須条件・採点・総合判断）／報告書（結果・押印状況 `#sumStamps`・最終合否 `#sumDecision`・保存状態）

### 1-2. 判定エンジン `src/rules.js`
- `interviewModel(profile, cl)`: 確認点 ○2 △1 ×0 ＋総合判断 採用 2・保留 1・不採用 0 の得点率と帯（既定 16 点満点、高 ≥ 70%・中 ≥ 40%）
- `evaluateScript`: 結果は総合判断のとおり（未入力は上長最終判断要＋警告）。必須条件の不一致は不採用推奨に固定（`mustFailResult` で上長最終判断要に変更可）、未確認は警告（`mustUnknownResult`）、`overallCaps` は下げる方向のみ。戻り値は `record.judgment` と同じ形（`mode: 'script'`。保存済みの記録と揃えるため使わないキーも null で残す）
- `checklistSummary`（② ③・右サマリー・保存 HTML・A4 報告で共用のビューモデル。記入欄・タクシーは手入力の値だけ）、`scriptApplicantRows`、`mustSummary`、`checklistDiff`

### 1-3. 設定・保存
- 設定画面は 5 節: `#s-meta` 劇場情報 → `#s-applicant` 応募者の属性 → `#s-checklist` 面接チェックリスト（判定・面接評価の帯の境界・総合判断・ヘッダー・台本の編集。「印刷」〔`checklist.print.showQuestions`＝「詳細」に質問文を載せる〕の行は 2026-10-14 に削除。キーは互換のため正規化で残す）→ `#s-mgmt` 応募者の管理（押印 2 欄・名簿・手入力・最終合否）→ `#s-io` 書き出し／読み込み。結果の文言（`texts`）は画面に出さない（JSON でだけ変更）
- 最終承認のパスワード（`docs/SPEC-a4.md` 11 章）: `profile.management.finalLock = { salt, hash }`（`src/lock.js`。hash = sha256Hex(salt + ':' + パスワード)。hash が空＝なし。公開版の既定は空）。`normalizeProfile` が形を正し（キーが無い・空・形が違えば未設定＝既定のロック〔ローカル版ならローカルのロック、公開版はなし〕。［パスワードを外す］は「外した」印 `off: true` を書き、印があるときだけ外したまま。未設定なだけでは保存し直さない。11 章 L6c）、`validateProfile` が壊れた値を止める。設定 `#s-mgmt` の「最終承認のパスワード」で設定・変更・外す（現在のパスワードが要る・［設定を保存］で確定）。JSON の読み込み・初期化でロックが変わる／外れるときは現在のパスワードのダイアログ `#pwDialog`（ロックも印も無い JSON はいまのロックのまま）。別のタブで保存された設定は storage イベント・タブに戻ったとき・保存や押印の直前に読み込み直す（`app.refreshProfileFromStorage`。11 章 L5d）
- 最終承認のロックの対象（11 章 L1b・L5c。2026-10-14 のレビュー修正）: 押印のロックは常に既定の最終確認欄 `'final'` と、そのときの `decision.stampField` の欄の両方（`storage.finalLockFields(profile)`。「連動しない」でも最終確認欄はロックのまま）。ロックがあるとき、ロックの対象を変える設定（`decision.stampField`・`decision.enabled`・`management.fields` の id の並び。`storage.finalLockScope(profile)` で比べる）を変える［設定を保存］とプロファイル JSON の読み込みは、現在のパスワードのダイアログ（`#pwDialog`。`app.js` `finalScopeChanges`）を通す（違えば・キャンセルなら保存しない／読み込まない。下書きは残す）。表示名・説明・名簿だけなら不要。`Settings` の `onSave` は保存したかどうか（ダイアログのときは Promise）を返し、`doSave` は保存したときだけ注意の toast を出す
- `storage.normalizeProfile`: 許可したキーだけで組み立てる（`schemaVersion, meta, features, management, options, evaluation, checklist, texts` の 8 個）。押印欄 `initial` は外す（独自の欄は残す。空なら既定の 2 欄）。担当・最終合否と連動する押印欄が無くなったら面接対応者／最終確認に直す。v1 は移行せず既定（`report.v1Reset`）、mode: 'full' は `report.fullModeRemoved`、読み飛ばしたキーがあれば `report.stripped` → `app.init` が保存し直す（toast は前 2 つだけ）。冪等
- 保存レコード（`buildRecord`）: `kind, schemaVersion: 2, savedAt, profile, step, applicant（6 キー: name, gender, age, category, graduationDate, reviewerNotes）, checklist, checklistDef, interviewNotes, management, decision, judgment`。`mode`・`handoff`・`scores`・`contribution` などは書かない
- 読み込み（`storage.normalizeRecord` → `app.applyRecord`）: 応募者は 6 キーだけ拾う。`management.initial` は読み飛ばす。`legacy`（v1／旧評価の点数／旧 mode: 'full' の記録／初期対応者の印）を返し、app が toast で案内。旧 mode の記録の判別は `mode === 'full'`、または mode が 'script' でなく `handoff` がある（今の記録はどちらも書かないので誤判定しない）。旧い形式の記録は ② で開く（回答と判定があれば ③）
- localStorage のキー `recruit.profile.v1` は変えていない。応募者データはブラウザに残らない

### 1-4. 保存 HTML（`storage.generateReportHTML`。docs/SPEC-a4.md）
- **A4 縦の用紙 1 枚そのもの**: `<body class="a4-doc" data-filename="…">` の直下に用紙 `main.a4#a4`（210×297mm 固定・内側の余白 8mm／10mm・`overflow:hidden`）→ 用紙の外の 1 行 `footer.a4-foot`（画面だけ）→ 埋め込み JSON `#recruit-record`・`#recruit-mgmt-config`（常に出す。`interviewerField` を含む）→ スクリプト 1 本。`<title>` は `面接チェックリスト報告 - {氏名}さん | {劇場名}`
- 画面: 灰色の背景（#e6e9ee）に用紙を中央寄せ（上下 24px・影）。狭い画面（幅 < 用紙＋32px）は `<html>` の `--a4-zoom` で用紙ごと縮小（`@media screen` だけ。`transform:scale`＝レイアウトは原寸のまま。用紙の箱の余白で縮小後の大きさに合わせる。12 章 F7）。印刷: `@page{size:A4 portrait;margin:0}`・影と外側の余白なしで用紙をそのまま 1 ページ（画面と同じ要素・寸法・文字組み）。**印刷のための切替はしない**（beforeprint を使わない。読み込み時に計測して確定した状態のまま印刷）
- 押印・最終合否は**用紙の欄を直接クリック**（Enter／Space も）→ 窓 `#a4Pop.pop`（body 直下。担当者 select〔名簿＋手入力〕・押印／取消／閉じる、合否は 採用／不採用／取消／閉じる＋アプリの判定・食い違いの注記）。Esc・窓の外のクリックで閉じる。エラーは窓の中の 1 行（「担当者を選んでください」「氏名を入力してください」）。変更すると画面の右下に保存バー `#saveBar.savebar`（「押印・合否を変更しました［押印を保存］」→ 書き出し後「保存しました（保存できなかったときは再保存）［再保存］［×］」。［×］で閉じる。出ているあいだは `body.a4-sb` で下に余白を足し、いちばん下までスクロールすれば用紙に重ならない。当初の右上は 1280／1366px で用紙の右上〔最終合否〕、390px で見出し・氏名を隠したので 2026-10-14 のレビューで右下へ）。窓を閉じると欄にフォーカスが戻るが、印刷ではフォーカス枠を出さない（`@media print` で outline なし）。合否が判定と食い違うときだけ窓を開いたまま注記を見せる
- 最終承認のパスワード: `#recruit-mgmt-config` に保存時の `finalLock`（無ければ null）と `lockField`（`decision.stampField`。互換のため残す）・`lockFields`（パスワードが要る押印欄＝`'final'` と `decision.stampField` の欄。`a4PageScript` の `needPw` はこれで判定）。最終確認の欄・最終合否の窓は未解錠ならパスワード欄 `.pop-pw` と［確認］だけ（違えば「パスワードが違います」）。解錠は変数だけ（書き出しに残らない＝開き直すとまたロック）。照合は埋め込んだ `RecruitLock.source()`（sha256Hex・hashPassword・isLocked・verify）
- 「…」で切れたメモ（`.cl-cut`）はクリックで全文の窓（埋め込み JSON の値を textContent で）。`.cl-compact-2` で質問の回答を省いたときは案内の行（`.cl-nm-ref`）のクリックで全メモ
- 窓・保存バー・押せる欄の印（`body.a4-live`・`data-a4-t`・`tabindex`・`role`・`aria-*`）・`--a4-zoom`・`body.a4-sb`／`--a4-sbh` はスクリプトが付ける。書き出しは `documentElement.cloneNode(true)` の複製から外して `outerHTML`（ファイル名 `_採用` / `_不採用` の規則は従来どおり。dirty のまま閉じると beforeunload で確認）
- スクリプト: `clFitSheet` のソース＋ `RecruitStamp.source()`（stampSvg・shortName・verdictSvg・decisionSheetHtml・decisionFilename）＋ `RecruitLock.source()` ＋ `var LIMIT=1052,PAPER_W=793.7;` ＋ `storage.js` の `a4PageScript` のソース（ES5 の関数を `toString()` で埋め込み、同じ IIFE の中で呼ぶ。関数内にコメント・閉じタグを書かない）。`SCRIPT_END = '</scr' + 'ipt>'`。埋め込み JSON は `< > &` を `\u` 形式（`jsonForScript`。書き戻しも同じ）。テスト用に `window.__a4Fit`（計測をやり直して段階を返す）
- 削除したもの: 報告書／詳細の切替 `.rtool`（`#rtViewReport`・`#rtViewFull`・`#rtPrintChecklist`）・紙プレビュー `#reportPaper`/`#clPaper`・印刷専用の複製 `#clSheet.cl-sheet-print`・`body.print-checklist`・ヘッダー `.rh`・節 `section.sec`（応募者情報・面接チェックリストの台本全文・採用可否判定・応募者の管理）・押印カード `#mgmt`・合否パネル `#decision`・`#mgmtSave`・`__prepareChecklistSheet`／`__setReportView`／`__fitChecklistPaper`
- 旧い保存 HTML（2026-10-14 より前。報告書／詳細の切替つき）はそれぞれ自分のスクリプトで動くのでそのまま開ける。アプリの読み込みは埋め込み JSON なので互換は維持（読み込んで保存し直すと A4 の用紙になる。e2e E14 の fixture `legacy-report-view.html`）

### 1-5. A4「面接チェックリスト報告」（1 ページの要約。アプリ ③・アプリの印刷・保存 HTML で同じ部品）
- `storage.checklistSheetHtml(record, profile, { decisionId, decisionSvgId, stampSvgPrefix })` が `.cl-sheet.cl-mode-sheet` を返す（常に 1 ページの要約。'section' は削除）。用紙の箱 `.a4` と中身の CSS は `checklistSheetCss()`（アプリは起動時に 1 回、保存 HTML は `reportCss()` の後ろ）。SVG の id: 保存 HTML `a4Decision`／`vdA4`／`a4s{n}`、③ `appPaperDecision`／`vdAppPaper`／`ap{n}`、アプリの印刷 `clDecision`／`vdSheet`／`cl{n}`
- 並び: 見出し `.cl-title`（白地＋濃紺 2px の下線。左にロゴ〔`storage.brandLogo()`。高さ 7mm〕と「面接チェックリスト報告」、右に 台本 … 版 ／ 劇場名 ／ 作成日）→ 応募者 2 行 → 結果ストリップ（結果・総合判断・必須条件・確認点＋最終合否 `.cl-decision`。調整は 1 行）→ 必須条件｜勤務条件の確認 → 確認点 7 行 → **面接メモ・所見の枠** `.cl-blk-notes > .cl-nm-box`（常に出す。残りの高さいっぱい。記入があれば上から、その下・記入なしなら枠全体に 7.5mm 間隔の点線の罫線 `.cl-nm-lines`）→ 説明・連絡 1 行 → 押印行 `.cl-stamps`（`record.management` から。2 欄なら `.cols-2`。**用紙の内寸の下端**。シートは `display:flex;flex-direction:column;min-height:100%`）
- 1 ページ保証: `clFitSheet(sheet, limit)`（上限は定数 `CL_SHEET_LIMIT_PX = 1052`＝用紙の内寸 281mm ≒ 1062px から 10px の余裕。**押印行を含むシート全体の内容の高さ**〔`.cl-measure` で用紙いっぱいに伸ばさない状態〕で計る。まず `.cl-roomy`〔本文 10.5px。枠に罫線 38mm を残せるときだけ。38mm の最低の高さは計測中＝`.cl-measure` のときだけ付け、表示中は付けない＝狭い画面の `--a4-zoom` で行の高さが丸められて内容が 3% ほど伸びても罫線の部分が縮んで吸収し、押印行は下端のまま〕→ 通常 → `.cl-compact` → `.cl-compact-q1` → `.cl-compact-2` → zoom〔測り直し〕。zoom でも押印行は下端）。「…」で切れたメモに `.cl-cut`、1 つでもあれば案内 1 行「「…」で切れたメモは、画面でクリックすると全文を表示します」（アプリ ③ の紙はクリックしても窓を出さないので `o.refWhere` で「保存した HTML の画面でクリックすると…」。アプリの印刷・保存 HTML は「画面で」）。祖先に zoom が掛かった状態で計らない（保存 HTML は `--a4-zoom` を外して計る）。段階を決めたあと（zoom を除く）、「…」で切れた面接メモ（`.cl-nm-v.cl-cut`）が残り枠に罫線の空きがあれば、面接所見 → ① のメモ → 質問の回答・ブロックのメモの順に、要素のインラインの `-webkit-line-clamp` で行数の上限を広げる（上限 1052px を超えない・罫線は 0 行まで使う・計測中は `.cl-grow` で `.cl-roomy` の罫線 38mm を外す。全部入れば `.cl-cut`・案内も外れる。最初にインラインの行数を外して測るので、書き出したファイルを開き直しても同じ。12 章 F5）。シートは `min-height:100%;max-height:100%`（`.cl-measure` は `max-height:none`）、枠の `.cl-blk-notes`・`.cl-nm-box`・`.cl-nm` は `min-height:0`、`.cl-nm` は `overflow:hidden`＝内容が多すぎても押印行は用紙の中・下端のまま（F6。狭い画面の縮小は F7 で transform にしたので、縮小で内容は伸びない＝記入は切れない）。広げる処理は縦のはみ出しがあるあいだだけ（横にはみ出す幅広の書記素でも固まらない）
- アプリの印刷: 印刷ホスト `#clSheet`（①②③・トップバー・Ctrl+P のどこからでも印刷できるよう ③ の紙とは別に持つ）に `div.a4` ＋同じ部品を描き、同じ計測をしてから `body.print-checklist`・`@page a4sheet{size:A4 portrait;margin:0}` で用紙そのものを 1 ページに印刷

### 1-6. テスト（すべて緑）
- `node tests/rules.test.js` … 単体 33 件（2 回目のレビュー修正で #90 に縮小は transform・#92 に空のロックは未設定＝既定のロック・「外した」印・#93 に横にはみ出す要素と行数を上げても進まない要素で固まらない、を足した。#53〜#55・#63〜#71・#73〜#93。#93 切れたメモを罫線の空きまで広げる〔疑似 DOM〕・#92 に `lockFields`・`finalLockFields`・`finalLockScope`・#80 に F5／F6 の CSS（2026-10-14 のレビュー修正）。#91 lock.js〔sha256 の既知ベクタ・verify・source〕・#92 finalLock の正規化・検証・保存 HTML のロック〔平文なし〕。12 章で #76・#80・#81 を用紙を埋めるレイアウトに合わせた。削除した機能のテストは外し、番号は振り直していない。2026-10-14 の A4 化で #53・#66・#71・#76〜#81・#87〜#89 を用紙の構造に書き換え、#90 保存 HTML の構成を追加）。#82 既定プロファイル（8 キー・押印欄 2 つ）、#83 正規化（initial を外す・独自の欄・削除キー・冪等）、#84 v1 → 既定・`parseProfileJSON`、#85 `normalizeRecord`（fixtures の旧レコード 3 種）、#86 `buildRecord` のキー、#87 保存 HTML に削除した機能が無い、#88 公開 API
- `node build.js && node tests/e2e.js` … e2e E1〜E16・266 件（2 回目のレビュー修正で E15 (6) に「ロックの無い JSON はいまのロックのまま」・E15 (10) 公開版と localStorage を共有 2 件・E15 (11) 古いタブ 5 件〔パスワードのダイアログ中に別のタブでロックが変わる、を含む〕・E16 に狭い画面〔540〜320px〕で記入が切れない・幅広の書記素のメモで固まらない・アプリ ③ の紙を少し縮めても切れない、の 11 件を追加。E15 最終承認のパスワード・E16 用紙を埋めるレイアウトを追加。レビュー修正で E15 (9) ロックの迂回〔連動しない・最終合否 OFF・押印欄の構成の JSON はパスワード・表示名だけなら不要・保存後も最終確認欄はロック〕4 件・E16 に重いサンプルの面接所見の行数と罫線の空き・画面と印刷・390px・書き出して開き直す・面接所見 4,000 字の 4 件・E8 の面接所見の確認を「罫線の空きまで広げる」に変更・E14 の `a4State` にインラインの行数。E16 は上限近くのゆったりを狭い画面〔430・390・360px〕で開いても押印行が下端にあることも確かめる。E8・E14 (5) の高さは `.cl-measure` で内容の高さを測るように直し、押印行が下端にあることも確かめる）（日時は 2026-10-10 に固定。`fresh()` は `localStorage.clear()` だけ）。E1〜E8 は旧 E32〜E39（期待値は変えず、削除した機能の期待値だけを「無いこと」に置き換えた。E2 に必須条件の不一致の案内〔旧 E26〕を追加）、E9 押印欄 2 つ、E10 設定 5 節・data-bind の許可リスト・旧い JSON、E11 保存 HTML の印刷と A4 PDF 1 ページ、E12 設定の反映・読み込みの toast・手入力の押印・保存 HTML の用紙の窓での取消・最終合否の ON/OFF（旧 E22・E26・E28・E31 のうち残した機能）、E13 ロゴ（サイドバー・③ の紙・保存 HTML の用紙の見出し）、E14 A4 用紙（寸法 210×297mm・画面のスクリーンショットと PDF〔pdftoppm〕の画像が同じ様式・欄クリックの窓〔Esc・外のクリック・Enter／Space〕・キーボード操作の直後に印刷してもフォーカス枠が出ない〔PDF の画像を画素単位で比較〕・窓とバーは印刷されず書き出しにも残らない・保存バーは右下で見出し・氏名・最終合否を隠さない〔1280×768・390×844〕・長いメモの全文〔上下に入らなければ画面の中〕・390px の縮小表示〔重いサンプルを 390px で最初から開いても 1440px と同じ詰め方・書き出しに `--a4-zoom` なし〕・アプリの印刷と保存 HTML の印刷が同じ見出しの 1 ページ・旧い保存 HTML の互換）。E9 に採用×不採用推奨の注記、E12 に面接対応者の窓の初期選択（台本の担当）・名簿の担当者での押印と書き出し・合否の取消後のフォーカス。保存 HTML の操作は `openStamp`／`openDecision`／`popSel`／`popAct`／`#saveBarBtn` のヘルパーで行う
- fixtures: `v1-record.html`（v1）、`v1-profile-other.json`（v1 プロファイル → 既定）、`legacy-full-checklist.html`（full-mode-last の詳細モード・回答 16 件・2 軸判定）、`legacy-full-stamps3.html`（初期対応者／面接対応者／最終確認の 3 印）、`legacy-profile-full.json`（mode: 'full'・初期対応者の表示名「受付担当」）、`legacy-report-view.html`（a9e39cb＝A4 化の前の保存 HTML。報告書／詳細の切替つき）。fixtures に入れてよい実名は笹川 晴央だけ

## 2. ユーザー決定事項（変更しないこと）

| 項目 | 決定 |
| --- | --- |
| 配布形態 | 単一 HTML（`dist/`）。開発は `src/` 分割 + `build.js`。外部ライブラリ・CDN なし |
| ルール管理 | アプリ内の設定画面 + 劇場プロファイル JSON |
| 保存方式 | HTML ファイル（ブラウザ内の応募者一覧は持たない） |
| 利用端末 | 事務所 PC（ブラウザ） |
| G. 面接チェックリスト（フェーズ4） | 面接評価は面接台本（スタッフ面接チェックリスト 2026-10-08 版）のチェックリスト（10 項目×5 点は廃止）。面接評価の点数は確認事項／確認点の ○△× と面接者の総合判断から算出。必須条件が 1 つでも不一致なら不採用推奨（台本どおり。設定で上長最終判断要に変更可） |
| H. 3 ステップ（フェーズ6） | ① 応募者〔1 枚・3 行。氏名だけ必須〕→ ② 面接チェックリスト〔台本の ①〜⑤。【説明】【合否連絡】は「すべて説明した」で一括チェック〕→ ③ 報告書〔A4 プレビュー・電子印・最終合否・保存 HTML／印刷〕。結果は面接者の総合判断のとおり。印鑑部分（電子印・最終合否・報告書 HTML の往復）はそのまま。消極属性は削除（2026-10-13） |
| I. 台本の採点範囲（2026-10-13 確認済み） | 不採用推奨の足切りに使う必須条件は台本 PPTX の実配置どおり **2 項目**（土日含む週3日以上・5時間以上／指定繁忙期間すべて可）。シフト提出・電話連絡・欠勤連絡の 3 つは ② の【説明】チェックのまま。確認点（○△×）は **7 項目**（16 点満点）。副支配人が「現状のまま」を選択 |
| K. A4 縦 1 枚（2026-10-14） | 保存 HTML は **A4 縦の用紙 1 枚**そのもの。「詳細」表示（台本の全文）は無くし、「…」で切れたメモは画面でクリックすると全文（印刷は常に 1 枚）。押印と最終合否は**用紙の欄を直接クリック**して小さな窓で担当者を選んで押す（用紙の外に常設の操作パネルは置かない。窓・保存バーは印刷されない。保存バーは変更したときだけ画面の右下に出る）。印刷は画面と同じ用紙 1 枚（別の様式にしない）。アプリ ③ の紙・アプリの印刷も同じ用紙。③ の押印カード・最終合否カードは残す |
| L. 最終承認のパスワード（2026-10-14） | 最終確認の押印・取消と最終合否の決定・取消の前にパスワード（アプリ ③ と保存 HTML。面接対応者は不要）。正しければそのページを閉じるまで解錠。平文は保存せず salt と hash だけ。保存 HTML は保存時点のロックで照合。変更・外す・JSON の読み込み・初期化でロックが変わるときは現在のパスワード。誤操作を防ぐ鍵で、HTML を書き換える人までは防げない。ローカル版の初期パスワードは `local/final-password.txt`（実際の値はリポジトリ〔src・dist・tests・docs〕に入れない。テスト用は `tests/fixtures/local-sample/final-password.txt` の架空の値） |
| M. 用紙を埋める（2026-10-14） | 押印行は用紙の内寸の下端。その上の「面接メモ・所見」の枠が残りの高さ（記入なしでも手書き用の点線の罫線）。内容が少なければゆったり（本文 10.5px）。1 ページ・画面と印刷の一致は維持 |
| J. 面接特化（2026-10-14） | 詳細モード・面接前の機能・押印欄「初期対応者」・旧 10 項目×5 点の評価・v1 プロファイルの移行・保存 HTML の「レポート全体」印刷とダッシュを**コードごと削除**（オーケストレータの決定。履歴はタグ `full-mode-last`）。押印欄は 面接対応者・最終確認 の 2 つ。旧い保存ファイルは読める（削除した機能のデータは読み飛ばす） |

## 3. TODO

### 3-1. 副支配人に確認したいこと
- [ ] 総合判断の重み（今は確認点 1 行と同じ 2 点）。もっと重くするか
- [ ] 総合判断「保留」→ 上長最終判断要、「不採用」→ 不採用推奨 でよいか（`checklist.overallCaps`）
- [ ] 必須条件が「未確認」のまま判定したとき、警告だけ（既定）でよいか（`checklist.mustUnknownResult`）
- [ ] 面接評価の帯の境界（高 70%・中 40%）が台本の感覚に合うか（16 点満点で 12 点以上が「高」、7 点以上が「中」）
- [ ] 「OPEN／25時までの可否」を自由記述でよいか（選択式にするか）
- [ ] 紙の台本の代わりに「空欄のチェックリスト」も印刷できると便利か（今は ① のあと回答なしで A4 報告を白紙の台本として印刷できる）

### 3-2. 保存・互換・UI
- [ ] 保存ファイル名の規則（現在 `応募者_氏名_YYYY-MM-DD.html`）。Playwright の Chromium では日本語のファイル名が `download` になる（自動テスト環境の挙動とみられる）。実機の Edge / Chrome で名前どおり保存されるか確認すること
- [ ] 名簿にない面接担当者は ① で選べない（設定の名簿に追加する。押印欄では手入力できる。読み込んだ記録の担当が名簿外なら「（名簿外）」として残す）
- [ ] 新宿の所属メンバー 15 名（支配人 1・副支配人 1・MGR 13）と公式ロゴ（TC_logo_1L.eps）は副支配人から受領済み。**リポジトリが非公開になった後に `config.default.js` の `management.managers` と `src/brand.js` の `logo` へ反映する**（公開リポジトリに実名・商標を置かないため）。それまでは `recruit-system/local/`（.gitignore 済み）に `logo.png`・`logo-alt.txt`・`managers.txt` を置き、`node build.js --local` で作った `local/dist/toho-recruit-judge.html` を直接渡す（README「ロゴ・名簿入りの版」）。local/ はコンテナにしか無いので、新しいセッションでは EPS と名簿から作り直す
- [ ] 最終承認のパスワード: Chrome では file:// の localStorage を全ファイルで共有する（公開版とローカル版で設定も共有）。公開版で保存しても空のロックは「未設定」なのでローカル版のロックは外れない（11 章 L6c）。ローカル版で［パスワードを外す］で外した設定は公開版でも外れたまま。ローカル版で一度設定を保存すると、公開版もそのロックで施錠される。c7c3a4f の版で外した設定は初期パスワードに戻る（外し直す）。複数のタブで設定を同時に編集したときは、ロック以外の項目は最後に保存したタブの内容になる（ロックは最新のものを使う。11 章 L5d）
- [ ] 最終承認のパスワード: 連続失敗の回数制限はしていない（指示どおり）。`decision.stampField` を「連動しない」・別の欄にしても最終確認欄（`final`）はロックのまま（連動する欄もロック）。押印欄の id を JSON で `final` 以外に変えた劇場では、ロックされるのは連動する欄だけ（その変更自体に現在のパスワードが要る）
- [ ] 面接メモ・所見の枠: 切れたメモは罫線の空きまで広げるので、重い記録では手書き用の罫線が 1 行分未満になる（記入が短い記録は従来どおり罫線が残る）。前回の報告では「狭い画面（スマホ）で記入の最後の行が少し隠れることがある」としていたが、実際は 1.5〜3 行（390px で 18px・320px で 34px）が切れていた → 縮小を transform にして解消（どの幅でも印刷と同じ行数・切れなし）
- 既知の制限: ブラウザ以外（メールやチャットのプレビュー等）で開くとスクリプトが動かず、合否・押印は押せない（表示は保存時点の内容）。判定画面以外（設定・使い方）での Ctrl+P は画面全体の印刷
- 既知の制限（A4 化）: スクリプトが動かない環境では 1 ページ保証の計測もされないため、アプリから初めて保存したファイル（詰め方のクラスなし）で内容が長い記録は用紙の下で切れる（`overflow:hidden`。2 ページにはならない）。ブラウザで一度開いて「押印を保存」したファイルは開いたときの詰め方のまま残る。ブラウザの印刷設定で余白を「デフォルト」「なし」以外にすると用紙が 1 ページに収まらないことがある

## 4. 触る場所の早見表

| やりたいこと | 場所 |
| --- | --- |
| 台本の文言・項目を変える | 既定値は `src/config.default.js` `checklist`（セクション → ブロック → 項目。id はテスト・保存データのキーなので変えない）。劇場ごとには設定画面「面接チェックリスト」（`settings.js` `checklistHtml`）。補完・検証は `storage.js` `normalizeChecklistDef` / `fillChecklist` / `validateChecklist`。② の描画は `app.js` `interviewStepHtml`（`scriptClHeaderHtml` / `clSectionHtml` / `clBlockHtml`）、入力時の更新は `updateChecklistUI` |
| 判定・必須条件の扱いを変える | 設定 `checklist.mustFailResult`・`mustUnknownResult`・`overallCaps`。ロジックは `rules.js` `evaluateScript`、面接評価の点は `interviewModel` |
| A4 報告の見た目を変える | `src/storage.js` `checklistSheetHtml`（= `clOnePageHtml`。見出し・押印行を含む）と `checklistSheetCss`（用紙 `.a4` の箱を含む。用紙の中に `@media (max-width…)` を置かない）。1 ページ保証は `clFitSheet`（= `fitChecklistSheet`。上限 `CL_SHEET_LIMIT_PX`）。アプリは `prepareChecklistSheet`・`fitReportPaper`、保存 HTML は `a4PageScript` の `fit`。保存 HTML のページ（背景・縮小・窓・保存バー・印刷）は `reportCss`。ロゴは `brandLogo`。短い名前は台本の項目の `short`（`checklistShortLabel`）。切れたメモを罫線の空きまで広げるのは `clFitSheet` の `grow`（F5） |
| 最終承認のパスワード | `src/lock.js`（SHA-256・照合）。既定値 `config.default.js` `management.finalLock`（`build.js --local` が `final-password.txt` から差し込む）。正規化・検証 `storage.js` `normalizeLock` / `validateProfile`、保存 HTML は `generateReportHTML` の `#recruit-mgmt-config` と `a4PageScript` の `needPw` / `doUnlock`。アプリは `app.js` `finalNeedsPw` / `unlockFinal` / `askFinalPassword`、設定は `settings.js` `finalLockHtml` / `lockApply`。ロックの対象は `storage.js` `finalLockFields`（`final`＋連動する欄）、対象を変える設定の比較は `finalLockScope`（app.js `finalScopeChanges`・設定の `onSave`・`importProfileText`） |
| 押印欄・名簿・最終合否 | 既定値は `config.default.js` `management`（押印欄は `interviewer`・`final`）。正規化は `storage.js` `fillManagement` / `decisionFields`。アプリは `app.js` `managementCardHtml` / `decisionCardHtml` / `decide`（用紙の押印行は `storage.checklistSheetHtml` が `record.management` から描く）、保存 HTML は `storage.js` `a4PageScript`（欄クリックの窓 `openPop`・押印 `doStamp`・合否 `doDecide`・保存バー `renderBar`・書き出し `exportHtml`）。ハンコ・合否スタンプは `stamp.js` |
| 設定画面に項目を追加 | `src/settings.js` の各節（`data-bind` のパスを書くだけ。表示を描き直す欄は `repaint: true`）。`storage.normalizeProfile` の許可したキーにも足すこと（足さないと保存時に落ちる）。e2e E10 の data-bind の許可リストも更新 |
| 保存データの項目を追加 | `src/storage.js` `buildRecord` / `normalizeRecord` / `generateReportHTML`、復元は `app.js` `applyRecord`（単体 #85・#86） |
| 応募者の項目を追加 | `storage.js` `APPLICANT_KEYS`・`app.js` `emptyApplicant` / `scriptApplicantStepHtml`・`rules.js` `scriptApplicantRows` |

変更後は `node tests/rules.test.js`、`node build.js` で `dist/` を再生成、`node tests/e2e.js` を通すこと。

## 5. 削除済み機能（2026-10-14）

- ① 経緯: 副支配人「初期対応者の欄は削ってもらって構わない。面接に特化したソフトにしたい。面接までの経緯はクリアしているので省いてよい」。削除: 詳細モード（面接前の詳細入力〔勤務条件・通勤・繁忙期・深夜帯・オールナイト・外国籍など〕・面接者への申し送り〔留意点〕・面接で確認する項目・シフト貢献度・2 軸判定・高校生の採用方針・入力の段階・申し送りシート印刷）、押印欄「初期対応者」、旧 10 項目×5 点の面接評価、v1 プロファイルの移行、保存 HTML の「レポート全体」印刷とダッシュ、設定の運用モード・結果文言の節。レビュー後に、どこにも表示しなくなった台本の題名・説明文（`checklist.title`・`intro`。設定欄ごと。旧い設定・記録に残っていれば正規化で外す）と、使われなくなった CSS（styles.css の `.table`・`.empty`・`.chip`・`.alert.info/.ok`・`.btn.ok/.link/.block`・`.cl-row.missing`、reportCss の `.badge`・`.tag`・`.muted`）も削除。区分のグループは学生かどうか（卒業予定年月の欄）にしか効かないため、既定のフリーター・主婦・主夫・ダブルワーカーは `other`
- ② 削除前のコードはタグ `full-mode-last`（df3b339）。git log でも追える
- ③ 削除した機能の仕様は `docs/archive/SPEC.md`（フェーズ2: 高校生・繁忙期・オールナイト・2 軸判定）・`docs/archive/SPEC-stages.md`（フェーズ3: 入力の段階）
- ④ 旧データの扱い: 旧い保存ファイルは読める（応募者は 6 キーだけ・面接チェックリストの回答・押印〔面接対応者・最終確認〕・最終合否を引き継ぎ、面接前の詳細・留意点・旧評価・初期対応者の印は読み飛ばして toast で案内）。旧い設定は開いたときに正規化して保存し直す。v1 プロファイルは既定の設定にする
- ⑤ 作業仕様（削除一覧・正規化・テストの整理）は `docs/SPEC-slim.md`
