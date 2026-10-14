# 引き継ぎメモ — 面接特化（2026-10-14）完了時点

- フェーズ1〜3: UI の骨格・新宿の運用要件・入力の段階分け（2026-10-14 に削除。末尾「削除済み機能」）
- **フェーズ4: 面接チェックリスト（面接台本 2026-10-08 版）**。詳細仕様は `docs/SPEC-checklist.md`。副支配人「添付の面接台本のチェックリスト（採点リスト）を入力して出力・報告できるようにしたほうがいい」への対応
- **フェーズ5: 保存 HTML の「報告書」表示と最終合否スタンプ（採用／不採用）**。詳細仕様は `docs/SPEC-report.md`。運用「面接者が報告書 HTML を出力 → 副支配人が開いて合否＋電子印 → 再出力してスレッドに添付」への対応
- **フェーズ6: 3 ステップ（応募者 → 面接チェックリスト → 報告書）**。詳細仕様は `docs/SPEC-script-mode.md`。副支配人「応募者の名前と属性入れたらもう渡した面接台本のとおりの報告でいい」への対応
- **2026-10-13: 入力の簡素化**（消極属性の削除・① 応募者を 1 枚 3 行・② のヘッダーを 1 行・「すべて説明した」）。`docs/SPEC-script-mode.md` 12 章
- **2026-10-14: A4「面接チェックリスト報告」を 1 ページの要約に**。副支配人「出力される報告書が煩雑すぎて頭に入ってこない。わかりやすく、かつ1ページで」。`docs/SPEC-checklist.md` 4 章・`docs/SPEC-script-mode.md` 13 章
- **2026-10-14: 面接特化**。副支配人「初期対応者の欄は削ってもらって構わない。面接に特化したソフトにしたい。面接までの経緯はクリアしているので省いてよい。他にもいらない機能があれば削ってくれ」。作業仕様は `docs/SPEC-slim.md`（末尾「削除済み機能」）
- `docs/SPEC-checklist.md`・`SPEC-report.md`・`SPEC-script-mode.md` は各フェーズの確定版のまま（冒頭の注記のとおり、詳細モード・初期対応者・旧 10 項目評価・レポート全体印刷の記述は無効）

## 1. 現状の到達点

### 1-1. 画面（3 ステップ。内部キーは 1 / 3 / 4、表示は ①②③）
- ナビ「報告書の作成」・トップバー「面接チェックリスト報告」・サイドバー「手順」（`index.html` に直書き）。右サマリー、ダークモード、390px 対応
- **① 応募者** `#scriptApplicantCard`（1 枚・3 行）: 氏名*・年齢・性別・区分（学生は卒業予定年月 `#grp-graduation`）／面接日 `#saDate`・面接担当者 `#saInterviewer`（名簿）・応募した求人 `#saPosting`（通常／短期）／タクシー可否・料金 `#saTaxi`・メモ。「面接チェックリストへ進む →」`#saNext`。氏名だけ必須
- **② 面接チェックリスト**: 1 行の読み取り専用ヘッダー `#clHeader`（チップ＋「応募者を編集」）→ 目次 → 台本の ①〜⑤（必須条件 一致／不一致・説明のチェックと「すべて説明した」・質問とメモ・記入欄・確認点 ○△× とメモ・合否連絡）→ 総合判断・面接所見 `#clOverall` →「← 応募者に戻る」`#backToApplicant`・「🖨 面接チェックリスト報告（A4）」`#clPrintBtn`・「報告書へ進む →」`#toReportBtn`（入力チェックで止めない）
- **③ 報告書**: 確認事項 `#scriptWarnings` → A4 の紙プレビュー `#appPaperWrap > #appPaper`（等倍。1280px・1366px は右サマリーを紙の下へ）→ 押印 `#mgmtCard`（**面接対応者・最終確認の 2 欄・2 列**）→ 最終合否 `#decisionCard` →「← 面接チェックリストに戻る」`#backToChecklist`・「🖨 A4 で印刷」`#reportPrintBtn`・「💾 報告書を保存（HTML）」`#reportSaveBtn`
- 右サマリー: 応募者（氏名・区分/年齢/性別〔短期求人ならチップ〕・面接日・担当）／面接チェックリスト（必須条件・採点・総合判断）／報告書（結果・押印状況 `#sumStamps`・最終合否 `#sumDecision`・保存状態）

### 1-2. 判定エンジン `src/rules.js`
- `interviewModel(profile, cl)`: 確認点 ○2 △1 ×0 ＋総合判断 採用 2・保留 1・不採用 0 の得点率と帯（既定 16 点満点、高 ≥ 70%・中 ≥ 40%）
- `evaluateScript`: 結果は総合判断のとおり（未入力は上長最終判断要＋警告）。必須条件の不一致は不採用推奨に固定（`mustFailResult` で上長最終判断要に変更可）、未確認は警告（`mustUnknownResult`）、`overallCaps` は下げる方向のみ。戻り値は `record.judgment` と同じ形（`mode: 'script'`。保存済みの記録と揃えるため使わないキーも null で残す）
- `checklistSummary`（② ③・右サマリー・保存 HTML・A4 報告で共用のビューモデル。記入欄・タクシーは手入力の値だけ）、`scriptApplicantRows`、`mustSummary`、`checklistDiff`

### 1-3. 設定・保存
- 設定画面は 5 節: `#s-meta` 劇場情報 → `#s-applicant` 応募者の属性 → `#s-checklist` 面接チェックリスト（判定・面接評価の帯の境界・総合判断・ヘッダー・印刷・台本の編集）→ `#s-mgmt` 応募者の管理（押印 2 欄・名簿・手入力・最終合否）→ `#s-io` 書き出し／読み込み。結果の文言（`texts`）は画面に出さない（JSON でだけ変更）
- `storage.normalizeProfile`: 許可したキーだけで組み立てる（`schemaVersion, meta, features, management, options, evaluation, checklist, texts` の 8 個）。押印欄 `initial` は外す（独自の欄は残す。空なら既定の 2 欄）。担当・最終合否と連動する押印欄が無くなったら面接対応者／最終確認に直す。v1 は移行せず既定（`report.v1Reset`）、mode: 'full' は `report.fullModeRemoved`、読み飛ばしたキーがあれば `report.stripped` → `app.init` が保存し直す（toast は前 2 つだけ）。冪等
- 保存レコード（`buildRecord`）: `kind, schemaVersion: 2, savedAt, profile, step, applicant（6 キー: name, gender, age, category, graduationDate, reviewerNotes）, checklist, checklistDef, interviewNotes, management, decision, judgment`。`mode`・`handoff`・`scores`・`contribution` などは書かない
- 読み込み（`storage.normalizeRecord` → `app.applyRecord`）: 応募者は 6 キーだけ拾う。`management.initial` は読み飛ばす。`legacy`（v1／旧評価の点数／旧 mode: 'full' の記録／初期対応者の印）を返し、app が toast で案内。旧 mode の記録の判別は `mode === 'full'`、または mode が 'script' でなく `handoff` がある（今の記録はどちらも書かないので誤判定しない）。旧い形式の記録は ② で開く（回答と判定があれば ③）
- localStorage のキー `recruit.profile.v1` は変えていない。応募者データはブラウザに残らない

### 1-4. 保存 HTML（`storage.generateReportHTML`）
- `body.view-report.has-cl.mode-script` で開く（報告書表示: 紙プレビュー `#reportPaper > #clPaper` ＋「応募者の管理」節〔`#decision`・`#mgmt`〕）。「詳細」`#rtViewFull` でヘッダー `.rh`・応募者情報・面接チェックリスト（台本の全文。`checklistSheetHtml` の 'section'）・採用可否判定（`table.kv.script-judge`）・応募者の管理
- 印刷は「A4 で印刷（1 ページ）」`#rtPrintChecklist` だけ（`#clSheet.cl-sheet-print` ＋押印の節）。報告書表示のままの Ctrl+P も beforeprint で A4 報告（`window.__prepareChecklistSheet`）。「詳細」表示の Ctrl+P はブラウザの既定（全文）
- 埋め込みスクリプトは ES5・文字列連結（`clFitSheet` のソースを埋め込む）。`SCRIPT_END = '</scr' + 'ipt>'`。埋め込み JSON は `< > &` を `\u` 形式（`jsonForScript`）
- 押印・最終合否は保存 HTML 上でも押せて、「押印を保存」で再出力（ファイル名 `_採用` / `_不採用`）

### 1-5. A4「面接チェックリスト報告」（1 ページの要約）
- 並び: ヘッダー帯 → 応募者 2 行 → 結果ストリップ（結果・総合判断・必須条件・確認点＋最終合否。調整は 1 行）→ 必須条件｜勤務条件の確認 → 確認点 7 行 → 面接メモ（記入があるものだけ）→ 説明・連絡 1 行 → 押印行（2 欄・2 列 `.stamp-row.cols-2`）
- 1 ページ保証: `clFitSheet`（上限は `checklistSheetLimit(押印欄の件数)`。3 件まで 950px。超えたら `.cl-compact` → `.cl-compact-q1` → `.cl-compact-2` → zoom〔測り直し〕）。「…」で切れたメモがあれば案内 1 行。アプリの印刷用・③ の紙プレビュー・保存 HTML の印刷用・紙プレビューで同じ関数

### 1-6. テスト（すべて緑）
- `node tests/rules.test.js` … 単体 28 件（#53〜#55・#63〜#71・#73〜#88。削除した機能のテストは外し、番号は振り直していない）。#82 既定プロファイル（8 キー・押印欄 2 つ）、#83 正規化（initial を外す・独自の欄・削除キー・冪等）、#84 v1 → 既定・`parseProfileJSON`、#85 `normalizeRecord`（fixtures の旧レコード 3 種）、#86 `buildRecord` のキー、#87 保存 HTML に削除した機能が無い、#88 公開 API
- `node build.js && node tests/e2e.js` … e2e E1〜E12・182 件（日時は 2026-10-10 に固定。`fresh()` は `localStorage.clear()` だけ）。E1〜E8 は旧 E32〜E39（期待値は変えず、削除した機能の期待値だけを「無いこと」に置き換えた。E2 に必須条件の不一致の案内〔旧 E26〕を追加）、E9 押印欄 2 つ、E10 設定 5 節・data-bind の許可リスト・旧い JSON、E11 保存 HTML の印刷と A4 PDF 1 ページ、E12 設定の反映・読み込みの toast・手入力の押印・保存 HTML 上の取消・最終合否の ON/OFF（旧 E22・E26・E28・E31 のうち残した機能）
- fixtures: `v1-record.html`（v1）、`v1-profile-other.json`（v1 プロファイル → 既定）、`legacy-full-checklist.html`（full-mode-last の詳細モード・回答 16 件・2 軸判定）、`legacy-full-stamps3.html`（初期対応者／面接対応者／最終確認の 3 印）、`legacy-profile-full.json`（mode: 'full'・初期対応者の表示名「受付担当」）。fixtures に入れてよい実名は笹川 晴央だけ

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
- 既知の制限: ブラウザ以外（メールやチャットのプレビュー等）で開くとスクリプトが動かず、合否・押印は押せない（表示は保存時点の内容）。判定画面以外（設定・使い方）での Ctrl+P は画面全体の印刷

## 4. 触る場所の早見表

| やりたいこと | 場所 |
| --- | --- |
| 台本の文言・項目を変える | 既定値は `src/config.default.js` `checklist`（セクション → ブロック → 項目。id はテスト・保存データのキーなので変えない）。劇場ごとには設定画面「面接チェックリスト」（`settings.js` `checklistHtml`）。補完・検証は `storage.js` `normalizeChecklistDef` / `fillChecklist` / `validateChecklist`。② の描画は `app.js` `interviewStepHtml`（`scriptClHeaderHtml` / `clSectionHtml` / `clBlockHtml`）、入力時の更新は `updateChecklistUI` |
| 判定・必須条件の扱いを変える | 設定 `checklist.mustFailResult`・`mustUnknownResult`・`overallCaps`。ロジックは `rules.js` `evaluateScript`、面接評価の点は `interviewModel` |
| A4 報告の見た目を変える | `src/storage.js` `checklistSheetHtml`（'sheet' = `clOnePageHtml`、'section' = 「詳細」の台本全文）と `checklistSheetCss`。1 ページ保証は `clFitSheet`（= `fitChecklistSheet`）。アプリは `prepareChecklistSheet`・`fitReportPaper`、保存 HTML は `__prepareChecklistSheet`・`fitPaper`。短い名前は台本の項目の `short`（`checklistShortLabel`） |
| 押印欄・名簿・最終合否 | 既定値は `config.default.js` `management`（押印欄は `interviewer`・`final`）。正規化は `storage.js` `fillManagement` / `decisionFields`。アプリは `app.js` `managementCardHtml` / `checklistStampsHtml` / `decisionCardHtml` / `decide`、保存 HTML は `generateReportHTML` の `#mgmt`・`#decision` と埋め込みスクリプト 2。ハンコ・合否スタンプは `stamp.js` |
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
