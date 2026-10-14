# 詳細仕様書（確定版）: 台本モード（既定）— 応募者 → 面接チェックリスト → 報告書（フェーズ6）

- 対象: `recruit-system/`（ブランチ `claude/toho-shinjuku-hiring-app-quhjtc`。直前コミット ff2d405 = フェーズ5完了。**commit / push はしない**）
- 根拠: 副支配人「なんかちがくて、応募者の名前と属性入れたらもう渡した面接台本のとおりの報告でいいんだよね。。。今までの一旦忘れて欲しいのに。意図を汲み取って」と、オーケストレータの決定（0-2。変更不可）
- 前提資料: `docs/reference/interview-script-1008.md`（台本）、`docs/SPEC-checklist.md`（1 章: `profile.checklist`・`record.checklist`、4 章: `checklistSheetHtml`・`body.print-checklist`）、`docs/SPEC-report.md`（3 章 DOM 一覧・4 章 保存 HTML・`#decision`・`#clPaper`）、`docs/HANDOFF.md`（7〜11 章）
- **実装者は本書だけを見て実装する**。id・class・profile キー・data-bind / data-field / data-cl パス・既定値・文言・テストの expect 文言は本書の値で実装する
- **2026-10-13 追記**: 副支配人「消極属性って意味がわからないから削除でいいかも。ほか、入力が多いのでもう少し端的にできたらお願い」により、**消極属性を全面削除**し、Step① を 1 枚・3 行に圧縮、Step② に「すべて説明した」を追加した（**12 章**）。1〜11 章の消極属性（`header.negatives`・`#saNegatives`・`data-cl-on`・`.cl-attr[data-attr="negatives"]` など）と Step① の旧レイアウトの記述は当時の記録として残す。現行は 12 章が優先
- **2026-10-14 追記**: 副支配人「出力される報告書が煩雑すぎて頭に入ってこない。わかりやすく、かつ1ページで」により、**A4「面接チェックリスト報告」を 1 ページの要約にした**（台本の説明文・質問文・空の記入欄は載せず、結果ストリップを上部に）。13 章。本書のほかの箇所の「A4 1〜2 枚」「判定サマリー 4 タイル（面接評価〔確認点〕・必須条件・総合判断・結果）」は旧版の記述

## 運用フロー（台本モード＝既定）

1. 面接者がアプリで **① 応募者**（氏名と属性・面接日・担当・求人・タクシー・メモ。1 枚・3 行。12 章）を入れる
2. **② 面接チェックリスト**（面接台本 2026-10-08 版の ①〜⑤ ＋総合判断）を台本の順に入力する
3. **③ 報告書** を開くと A4 1 枚の「面接チェックリスト報告」のプレビュー（結果ストリップ＝結果・総合判断・必須条件・確認点＋最終合否。13 章）が出る。押印欄「面接対応者」に電子印 →「報告書を保存（HTML）」→ 社内スレッドに添付
4. 副支配人が HTML を開く（報告書表示）→「最終合否」で採用／不採用（最終確認の印も自動）→「押印を保存」で再出力（`_採用` / `_不採用`）→ スレッドに添付
5. 再出力ファイルはアプリの「読み込み」で押印・合否ごと引き継げる（フェーズ5の往復はそのまま）

---

## 0. 方針

### 0-1. 変えないもの
- 単一 HTML／IIFE・ES5 寄り／外部ライブラリなし。`rules.js` は DOM 非依存
- **詳細モード（`profile.mode === 'full'`）の画面・判定・保存 HTML・印刷は現状（ff2d405）と同一**。既存 e2e E1〜E31・単体 #01〜#71 の expect は 1 つも変えない（7 章: 「詳細モードにする手順」と単体の `P()` だけ変える）
- `schemaVersion: 2`（`record.mode` を足すだけ）。旧レコード（フェーズ1〜5 の HTML。`mode` キーなし）は `'full'` として読む
- 既存の DOM id・見出し・`data-sec` キー・印刷モード（`body.print-handoff` / `body.print-checklist` / 無印）、`window.__setReportView` / `__prepareChecklistSheet` / `__prepareHandoffSheet`、`record.decision`、`profile.management.decision`、ファイル名 `_採用` / `_不採用`、`stamp.js`（**変更なし**）
- 印鑑部分（電子印・最終合否スタンプ・報告書 HTML の往復）はそのまま使う
- build.js の制約（src の JS に `</script` の並び・コメント内の `<!--<script>` を書かない。閉じタグは storage.js の `SCRIPT_END`）
- 名簿の実名は「笹川 晴央」以外を src / dist / テスト / ドキュメントに書かない（例示は「山田 太郎」「台本 花子」）

### 0-2. オーケストレータの決定（要約。変更不可）
| # | 内容 |
| --- | --- |
| S1 | 既定の流れは 3 ステップ（**台本モード**）: ① 応募者 → ② 面接チェックリスト（既存 Step3 の ①〜⑤）→ ③ 報告書（A4 プレビュー＋電子印＋最終合否＋保存 HTML／印刷） |
| S2 | 台本モードでは 面接前の詳細入力（曜日・時間帯・週日数・勤務期間・通勤・高校生例外・外国籍・深夜帯・繁忙期日数・オールナイト…）、留意点（申し送り）、「面接で確認する項目」、シフト貢献度、2 軸マトリクスを**一切表示しない**（画面・サマリー・保存 HTML・印刷・ヘルプ） |
| S3 | 消さずに **詳細モード** として残す。設定の先頭に「運用モード: 台本モード／詳細モード」。既定は台本。`mode` が無ければ `'script'` |
| S4 | M1〜M13（本書 1〜10 章に展開） |

### 0-3. 本書で決めた点（理由つき）
- **Y1 内部ステップキーは 1 / 3 / 4 のまま、表示番号だけ 1 / 2 / 3**。`state.step`・`data-step`・`record.step` は台本モードでも `1`（応募者）・`3`（面接チェックリスト）・`4`（報告書）。理由: `updateChecklistUI` の `state.step !== 3`、`renderStep` の case、`onFieldEvent` の `state.step === 3`、レコードの `step`、`applyRecord` の target がそのまま使え、詳細モードとの往復でステップの意味が変わらない。表示番号は `STEPS[i].no`
- **Y2 分岐の基準**: アプリは `R.isScriptMode(state.profile)`（1 か所の判定関数。`state` に mode を持たない）。保存 HTML・`checklistSheetHtml` は **`R.isScriptRecord(record)`**（保存時の事実）。現在の profile では分岐しない（旧レコード＝詳細を、台本モードのアプリから印刷・保存しても形が壊れない）
- **Y3 `checklistAuto` は台本モードで「手動のみ」**（自動の見込み・自動値・タクシー自動表示・消極属性の自動判定を返さない）。詳細入力が無いので出すと「未確認」「要確認」だらけになるため。`evaluateHiring`（詳細モードの判定エンジン）は profile の mode に関係なく自動ありで呼ぶ（既存の単体・判定結果を変えない）
- **Y4 台本モードの判定 `evaluateScript` の基準は面接者の総合判断**（採用→採用推奨、保留→上長最終判断要、不採用→不採用推奨、未入力→上長最終判断要＋警告）。必須条件の規則・`overallCaps` は既存の設定値を使い、結果は**下げる方向のみ**。確認点 ○△× は面接評価（点数・帯）として報告し、結果は変えない（「採用」なのに × があれば警告 1 行）
- **Y5 台本モードの記録は回答が無くても `has-cl`**（紙プレビュー・A4 報告・`#rtPrintChecklist` を常に出す）。白紙の台本として面接前に印刷できる
- **Y6 台本モードでは留意点（handoff）を作り直さない**（`rebuildHandoff` を呼ばない）。`applyRecord` は従来どおり作る（詳細モードの記録のデータを保持し、モードを戻したときに使えるように）
- **Y7 判定は「③ 報告書」を開いたときに走らせる**（＋保存・印刷時に判定が stale なら再判定する既存の規則）。② で保存した記録は「採用可否判定は未実施」（詳細モードと同じ考え方）
- **Y8 台本モードの「報告書へ進む →」は入力チェックで止めない**（確認点・総合判断が未入力でも進める。報告書に警告を出す）。ボタンは既存の `data-action="judge"` を使う（e2e の `judge()` をそのまま使える）
- **Y9 台本モードのアプリはブラウザの印刷（Ctrl+P・トップバー 🖨）も A4 面接チェックリスト報告**にする（保存 HTML の X3 と同じ考え方）
- **Y10 単体テストの `P()` は詳細モードのプロファイル**（`S.defaults()` に `mode: 'full'`）。既存 #01〜#71 は詳細モードの検証のため。台本モードは新しい `PS()`
- **Y11 e2e の `fresh()` は「localStorage を空にして詳細モードのプロファイルを書き込み、1 回だけ再読込」**。台本モードの新テストは `freshScript()`
- **Y12 既存ユーザーの保存済み設定（mode なし）** は台本モードにし、`report.modeAdded` で 1 回だけ toast で知らせて保存する
- **Y13 設定画面は「同じ data-bind をモードごとに 1 回だけ描く」**（台本モードで常に表示する区分・性別・卒業予定年月・結果タイトル・注記は、詳細モード用の節から外して表示側に移す）
- **Y14 台本モードの結果の本文は `texts.script`**（設定で編集可）。既存の `texts.mustGate` / `texts.adjusted` はシフト貢献度に触れるため台本モードでは使わない

---

## 1. データモデル

### 1-1. `profile.mode`（M1）
- `config.default.js` の `DEFAULT_PROFILE` に `schemaVersion: 2,` の直後へ:
  ```js
  // 運用モード: 'script'=台本モード（既定。応募者 → 面接チェックリスト → 報告書の 3 ステップ）
  //            'full'=詳細モード（応募情報 → 申し送り → 面接チェックリスト → 採用可否判定〔2 軸〕の 4 ステップ。他劇場向け）
  mode: 'script',
  ```
- `storage.normalizeProfile(p, report)`: `enforceLocked(merged)` の後・`merged.schemaVersion = 2` の前に
  ```js
  const rawMode = raw.mode;
  merged.mode = (rawMode === 'script' || rawMode === 'full') ? rawMode : 'script';
  if (report && rawMode !== 'script' && rawMode !== 'full' && Object.keys(raw).length) report.modeAdded = true;
  ```
  （`deepMerge` で入った不正値もここで直す。冪等。空オブジェクト `{}` は「保存済み設定なし」なので `modeAdded` を立てない）
- `storage.validateProfile(p)`: 先頭の検査の前に `if (p.mode !== undefined && p.mode !== 'script' && p.mode !== 'full') errors.push('運用モード（台本モード／詳細モード）が正しくありません。');`
- `storage.defaults()` は変えない（`mode: 'script'` を含む生の既定値を返す）。`loadProfile` が localStorage 空のとき `defaults()` を返すのも変えない（＝台本モード）

### 1-2. `record.mode`（M1）
- `storage.buildRecord(state)`: `step: state.step,` の直後に
  ```js
  // 保存時の運用モード（'script' | 'full'）。保存 HTML の形はこれで決める（旧レコードは無し＝'full'）
  mode: global.RecruitRules.isScriptMode(state.profile) ? 'script' : 'full',
  ```
- `parseRecordFromHTML` は変えない（`mode` はそのまま通る。不正値は `isScriptRecord` が false＝詳細扱い）

### 1-3. `rules.js` に追加・変更（DOM 非依存・export）

| 名前 | 仕様 |
| --- | --- |
| `isScriptMode(profile)` | `return !(profile && profile.mode === 'full');`（mode が無い・不正・profile が null → true） |
| `isScriptRecord(record)` | `return !!record && record.mode === 'script';`（mode の無い旧レコード → false） |
| `OVERALL_RESULT` | `{ hire: 'recommend', hold: 'review', reject: 'reject' }`（総合判断 → 台本モードの結果） |
| `DEFAULT_SCRIPT_TEXTS` | 1-4 の既定値（`texts.script` が無い・空のキーの代わり） |
| `scriptApplicantRows(applicant, cl, profile, management)` | 下記。台本モードの「応募者情報」の行。アプリ（Step② ヘッダー・右サマリー）と保存 HTML（応募者情報の節）で共用 |
| `evaluateScript(applicant, cl, profile, opts)` | 1-3-2。台本モードの判定 |
| `checklistAuto` | 1-3-3 の変更 |
| `evaluateHiring` | `checklistAuto(applicant, cl, profile)` の呼び出しを `checklistAuto(applicant, cl, Object.assign({}, profile, { mode: 'full' }))` にする（Y3。詳細モードの判定は常に自動の見込みと照合する。結果は従来と同じ） |

export に `isScriptMode, isScriptRecord, OVERALL_RESULT, scriptApplicantRows, evaluateScript` を追加（「面接チェックリスト」のコメントの後に `// 運用モード（SPEC-script-mode）` として）。

#### 1-3-1. `scriptApplicantRows(applicant, cl, profile, management)` → `[{ key, label, value }]`
台本順に次の行を作り、**value が空（trim 後 ''）の行は省く**。`a = applicant || {}`、`h = (cl && cl.header) || {}`、`def = clDef(profile)`、`dh = def.header || {}`。

| key | label | value |
| --- | --- | --- |
| `name` | 氏名 | `a.name` |
| `age` | 年齢 | `a.age` が空でなければ `String(a.age).trim() + '歳'` |
| `gender` | 性別 | `a.gender` |
| `category` | 区分 | `a.category` |
| `graduation` | 卒業予定年月 | `a.graduationDate` が `YYYY-MM` なら `YYYY年M月`（例 `2029年3月`。月は数値化して先頭の 0 を落とす）、それ以外はそのまま |
| `posting` | `dh.posting.label`（空なら「応募した求人」） | `h.posting` に一致する `dh.posting.options[].label` |
| `negatives` | 消極属性 | `dh.negatives` のうち `h.negatives[id] === 'on'` の label を「・」で連結（**自動判定は使わない**） |
| `taxi` | タクシー可否・料金 | `h.taxi` |
| `date` | 面接日 | `h.date` が `YYYY-MM-DD` なら `YYYY/MM/DD`（例 `2026/10/10`） |
| `interviewer` | 面接担当者 | `h.interviewer` → 空なら `management[dh.interviewerField].name`（押印の面接対応者） |
| `notes` | 備考（面接者メモ） | `a.reviewerNotes` |

#### 1-3-2. `evaluateScript(applicant, cl, profile, opts)`（M5）
- 入力: `applicant`（本文の `{name}` に使う。詳細項目は使わない）、`cl`（`record.checklist`。オブジェクトでなければ `emptyChecklist()`）、`profile`（`checklist`・`texts`・`evaluation.thresholds`）、`opts = { now }`（`evaluatedAt` に使う。省略時 `new Date()`）
- 前処理:
  ```
  def = clDef(profile); texts = profile.texts || {}; ev = profile.evaluation || {}
  model = interviewModel(profile, {}, cl)          // 常に 'checklist'
  breakdown = evaluateHiring のチェックリスト方式と同じ形（id, label, score, isOverall, mark, markLabel, sectionId, sectionNo, sectionTitle, note）
  total = model.total, max = model.max, pct = model.pct
  recPct = num(th.recommendPct, 70), revPct = num(th.reviewPct, 40); iBand = bandOf(pct, recPct, revPct); bandLabel は texts.bandLabels
  must = mustSummary(def, cl); mustFailResult = oneOf(def.mustFailResult, MUST_FAIL_RESULTS, 'reject')
  mustGate = must.mismatch > 0 && mustFailResult === 'reject'
  ov = overallValue(cl); ovl = overallLabelOf(def, ov)
  titleOf(r) = (texts[r] || {}).title || r
  result = baseResult = ov ? OVERALL_RESULT[ov] : 'review'
  ```
  （breakdown の生成を `evaluateHiring` と共通の小関数にしてもよいが、**`evaluateHiring` の戻り値を 1 文字も変えないこと**＝単体 #54〜#66 で確認）
- 警告（`warnings`。この順）:
  1. `!mustGate` のとき: 未入力の確認点 `n > 0` → `'未入力の確認点が' + n + '件あります（0点として集計）。'`
  2. `!mustGate && !ov` → `'面接者の総合判断が未入力です（結果は' + titleOf('review') + 'として扱います）。'`
- 調整（`down(to, code, reason, alwaysWarn)` は `evaluateHiring` と同じ。**下げるときだけ** `adjustments` と `warnings` に積む。この順）:
  - (a) 必須条件の不一致（`must.mismatch > 0`。`ml = must.mismatchLabels.join('、')`）
    - `mustGate`: `reason = '必須条件が一致しないため（' + ml + '）、不採用推奨とします。'` → `adjustments.push({ code: 'must_conditions', from: result, to: 'reject', reason })`（`from === to` もあり得る）→ `result = 'reject'` → `warnings.unshift(reason)`
    - review 設定: `down('review', 'must_conditions', '必須条件が一致しないため（' + ml + '）、採用推奨ではなく上長最終判断要として扱います。', true)`
  - (b) 必須条件の未確認（`must.mismatch === 0 && must.unknown > 0`。`ul = must.unknownLabels.join('、')`）
    - `oneOf(def.mustUnknownResult, MUST_UNKNOWN_RESULTS, 'none') === 'review'` → `down('review', 'must_unconfirmed', '必須条件に未確認があるため（' + ul + '）、採用推奨ではなく上長最終判断要として扱います。面接チェックリストの ① で一致／不一致を入力してください。', true)`
    - `'none'` → `warnings.push('必須条件に未確認が' + must.unknown + '件あります（' + ul + '）。面接で確認してください。')`
  - (c) 総合判断の上限（`overallCaps`。既存の設定値。`ov` があるときだけ。`alwaysWarn = false`）
    - `ov === 'reject'`: `cap = oneOf(caps.reject, OVERALL_CAP_VALUES, 'reject')`、`cap !== 'none'` なら `down(cap, 'overall_cutoff', '面接者の総合判断が「' + ovl + '」のため、' + tail(cap))`
    - `ov === 'hold'`: `cap = oneOf(caps.hold, OVERALL_CAP_VALUES, 'review')`、`cap !== 'none'` なら `down(cap, 'overall_hold', '面接者の総合判断が「' + ovl + '」のため、' + tail(cap))`
    - `tail(cap) = cap === 'reject' ? '不採用推奨とします。' : '採用推奨ではなく上長最終判断要として扱います。'`
    - 基準が総合判断なので、既定値（hold→review・reject→reject）では調整は起きない。`hold: 'reject'` のように厳しくしたときだけ効く。`'none'` や緩い設定は結果を上げない（台本モードでは `'none'` は効果なし。設定画面の hint に書く＝4-3）
  - (d) ○△× と総合判断の食い違い（結果は変えない）: `!mustGate && ov === 'hire' && model.counts.poor > 0` → `'確認点に × が' + n + '件あります（' + ×の確認点の label を「、」で連結 + '）。総合判断「' + ovl + '」と合わせて確認してください。'`
- 強み・懸念: `evaluateHiring` のチェックリスト方式と同じ（○＝強み、×＝懸念、総合判断は除く、メモがあれば「ラベル（メモ）」）
- 本文 `body`: `sc = 1-4 の texts.script`（キーごとに空なら `DEFAULT_SCRIPT_TEXTS`）。`lowered = adjustments.length > 0 && result !== baseResult`
  ```
  tpl = mustGate ? sc.mustGate : lowered ? sc.adjusted : !ov ? sc.missing : sc[result]
  vars = { name: applicant.name ? applicant.name + 'さん' : '応募者', overallLabel: ovl || '未入力', total, max, pct, band: bandLabel(iBand),
           marks: '○' + good + ' △' + fair + ' ×' + poor, mustLabels: must.mismatchLabels.join('、'),
           resultTitle: titleOf(result), baseTitle: titleOf(baseResult) }
  body = U.fill(tpl, vars)
  ```
- 戻り値（`record.judgment` と同じ形。**詳細モードの判定にあるキーはすべて持つ**＝既存の描画・`applyRecord` の比較・e2e の `judgment()` が落ちない）:
  ```js
  {
    result, title: titleOf(result), body, disclaimer: texts.disclaimer || '',
    total, max, pct,
    thresholds: { recommendPct: recPct, reviewPct: revPct, recommendPts: Math.ceil(max * recPct / 100), reviewPts: Math.ceil(max * revPct / 100) },
    breakdown, strengths, concerns, warnings,
    unresolved: [], adjusted: adjustments.length > 0,
    evaluatedAt: (opts && opts.now ? new Date(opts.now) : new Date()).toISOString(),
    mode: 'script',
    interview: { total, max, pct, band: iBand, bandLabel: bandLabel(iBand) },
    contribution: null, matrix: null, highschool: null,
    baseResult, adjustments,
    interviewMode: 'checklist', scaleMax: CHECKLIST_SCALE,
    checklist: { version: clStr(def.version), counts: model.counts, overall: { value: ov, label: ovl, points: ov ? OVERALL_POINTS[ov] : null }, must },
    must,                                                     // checklist.must と同じ（台本モードの描画用の別名）
    overall: { value: ov, label: ovl, points: ov ? OVERALL_POINTS[ov] : null, tone: ov ? OVERALL_TONE[ov] : 'muted' }
  }
  ```
- 例（既定の台本・満点 16）: 全○＋採用 → 採用推奨 16/16・100%・高。全○＋保留 → 上長最終判断要。全○＋不採用 → 不採用推奨。全○＋未入力 → 上長最終判断要（14/16）＋警告。必須条件 1 つ不一致（既定 reject）→ 不採用推奨（`must_conditions` を必ず記録）

#### 1-3-3. `checklistAuto(applicant, cl, profile)` の変更（M4・Y3）
> 2026-10-13: 消極属性の削除により、台本モードは `return { taxi: { text: '', tone: 'muted' }, fields: {}, must: {} };` だけになった（戻り値から `negatives` を削除。12-3）。
冒頭（`const def = clDef(profile)` の後）に:
```js
// 台本モード: 詳細入力が無いので自動の見込み・自動値は出さない（手動のみ）。消極属性は上書き（'on'/'off'）だけ
if (isScriptMode(profile)) {
  const hdr0 = U.isObj(cl.header) ? cl.header : {};
  const ng0 = U.isObj(hdr0.negatives) ? hdr0.negatives : {};
  const out0 = { taxi: { text: '', tone: 'muted' }, negatives: {}, fields: {}, must: {} };
  (U.isObj(def.header) && Array.isArray(def.header.negatives) ? def.header.negatives : []).forEach(function (n) {
    if (!U.isObj(n) || !n.id) return;
    const ov = ng0[n.id], overridden = ov === 'on' || ov === 'off', on = ov === 'on';
    out0.negatives[n.id] = { autoOn: false, on: on, overridden: overridden, text: on ? clStr(n.label) : '' };
  });
  return out0;
}
```
`checklistSummary` は変えない（`checklistAuto` の結果を使うので、台本モードでは `header.taxi = { text: 入力値 or '', auto: !入力 }`・消極属性 `auto: !overridden`・記入欄の `fromAuto: false`・必須条件の `autoText: ''` になる）。

### 1-4. `texts.script`（config.default.js の `texts` の末尾。Y14）
```js
// 台本モード（運用モード script）の結果の本文。変数: {name} {overallLabel} {total} {max} {pct} {band} {marks} {mustLabels} {resultTitle} {baseTitle}
script: {
  recommend: '{name}は面接者の総合判断が「{overallLabel}」です（面接評価 {total}/{max}点・{pct}%）。採用を推奨します。',
  review: '{name}は面接者の総合判断が「{overallLabel}」です（面接評価 {total}/{max}点・{pct}%）。上長の最終判断が必要です。',
  reject: '{name}は面接者の総合判断が「{overallLabel}」です（面接評価 {total}/{max}点・{pct}%）。不採用を推奨します。',
  missing: '{name}は面接者の総合判断が未入力です（面接評価 {total}/{max}点・{pct}%）。上長の最終判断が必要です。',
  mustGate: '{name}は必須条件（{mustLabels}）が一致しないため、面接者の総合判断・面接評価にかかわらず{resultTitle}とします。',
  adjusted: '{name}は面接者の総合判断が「{overallLabel}」（面接評価 {total}/{max}点）ですが、下記の理由により{resultTitle}とします。'
}
```
`DEFAULT_SCRIPT_TEXTS`（rules.js）は同じ値。旧プロファイルには `normalizeProfile` の `deepMerge` で補われる（追加コード不要）。**どの文にも「シフト貢献度」「2軸」を入れない**（S2）。

### 1-5. state（app.js）
**キーは増やさない**（M1）。`function isScript() { return R.isScriptMode(state.profile); }` を app.js の「小さなヘルパー」に置き、分岐はすべてこれで行う。

---

## 2. アプリ（台本モード）

### 2-1. ステップ・サイドバー・トップバー（M2・Y1）
```js
const STEPS_FULL = [
  { n: 1, no: 1, label: '応募情報', hint: '採用担当が入力' },
  { n: 2, no: 2, label: '面接者への申し送り', hint: '留意点を確認・共有' },
  { n: 3, no: 3, label: '面接チェックリスト', hint: '台本に沿って確認・評価' },
  { n: 4, no: 4, label: '採用可否判定', hint: '判定結果・保存' }
];
const STEPS_SCRIPT = [
  { n: 1, no: 1, label: '応募者', hint: '名前と属性・台本のヘッダー' },
  { n: 3, no: 2, label: '面接チェックリスト', hint: '台本のとおりに確認' },
  { n: 4, no: 3, label: '報告書', hint: '押印・最終合否・保存' }
];
function steps() { return isScript() ? STEPS_SCRIPT : STEPS_FULL; }
```
- 旧 `STEPS` は `STEPS_FULL` に改名し、参照はすべて `steps()` に
- `renderStepNav()`: `steps()` で描く。`.step-num` は完了なら `✓`、それ以外 `s.no`。`done` / `current` / `disabled` は従来どおり `s.n` と `state.step` / `maxStepReached` で判定。`#stepSectionTitle` の文字を `isScript() ? '報告書の作成' : '判定ステップ'`
- `index.html`: `<div class="side-section-title">判定ステップ</div>` → `<div class="side-section-title" id="stepSectionTitle">判定ステップ</div>`
- `goStep(n)`: 先頭に `if (isScript() && n === 2) n = 1;`。`if (n >= 2 && (!state.handoff || state.handoffStale)) rebuildHandoff();` を `if (!isScript() && …)` に（Y6）
- トップバー: 新規・読み込み・保存（HTML）は従来どおり。**🖨 印刷** は `isScript() ? printChecklistSheet() : window.print()`
- `bindGlobal()` に台本モードの印刷（Y9）:
  ```js
  let autoClPrint = false;
  window.addEventListener('beforeprint', function () {
    const bd = document.body;
    if (!isScript() || state.view !== 'judge' || bd.classList.contains('print-checklist') || bd.classList.contains('print-handoff')) return;
    if (clModel().mode !== 'checklist') return;
    if (prepareChecklistSheet(true)) autoClPrint = true;
  });
  window.addEventListener('afterprint', function () { if (autoClPrint) { autoClPrint = false; prepareChecklistSheet(false); } });
  ```

### 2-2. Step① 応募者（M3）`scriptApplicantStepHtml()`
> 2026-10-13: 下の DOM は旧版。現行は 1 枚・3 行（`#saNegatives` なし・補足文なし・メモは 2 行）。**12-2** を参照。
`renderStep` case 1: `if (isScript()) { fillChecklistDefaults(); c.innerHTML = scriptApplicantStepHtml(); applyVisibility(); break; }`（`fillChecklistDefaults` は面接日が空なら今日を入れる既存関数。`applyVisibility` は null 安全なので卒業予定年月の表示切替にそのまま使う）。

```html
<div class="card" id="scriptApplicantCard">
  <div class="card-head"><h2>応募者</h2><p>名前と属性、面接台本のヘッダー（応募した求人・消極属性・タクシー・面接日・担当）を入力します。<span class="req">*</span> は必須です。</p></div>
  <div class="field-row">{fInput('name','氏名',{required:true,placeholder:'例：山田 太郎',autocomplete:'off'})}{fSelect('gender','性別',o.genders)}</div>
  <div class="field-row cols-3">{fInput('age','年齢',{type:'number',min:15,max:99,step:1,suffix:'歳'})}
    {fSelect('category','区分', o.categories の value をそのまま value/label に)}
    {f.graduationDate ? fInput('graduationDate','卒業予定年月',{type:'month',id:'grp-graduation'}) : ''}</div>
  <h3 class="sub">面接の情報（台本のヘッダー）</h3>
  <div class="field-row">
    <div class="field" id="saPosting"><label>{def.header.posting.label || '応募した求人'}</label>{clSegHtml('header.posting', options（cls:'wide'）, {aria})}</div>
    <div class="field"><label for="saInterviewer">面接担当者</label>
      <select id="saInterviewer" data-cl="header.interviewer"><option value="">選択してください</option>
        {managers: <option value="{name}"[ selected]>{name}（{title}）</option>}
        {現在値が名簿に無く空でなければ <option value="{値}" selected>{値}（名簿外）</option>}</select>
      <div class="hint">名簿は設定の「応募者の管理（押印）」で編集します。報告書の押印欄「面接対応者」の初期選択になります。</div></div>
  </div>
  <div class="field-row">
    <div class="field" id="saNegatives"><label>消極属性</label><div class="chip-group">
      {def.header.negatives: <label class="chip[ on]"><input type="checkbox" data-cl="header.negatives.{id}" data-cl-on[ checked]><span>{label}</span></label>}
      </div><div class="hint">台本のヘッダーの「消極属性」。該当するものにチェックします。</div></div>
    <div class="field"><label for="saTaxi">タクシー可否・料金</label><input type="text" id="saTaxi" data-cl="header.taxi" value="…" placeholder="例：可・2,500円／否（終電 23:30）"></div>
  </div>
  <div class="field-row"><div class="field"><label for="saDate">面接日</label><input type="date" id="saDate" data-cl="header.date" value="…"></div></div>
  {fTextarea('reviewerNotes','備考（面接者メモ）',{rows:3,placeholder:'例：電話の受け答えが丁寧。家族の介護で急な休みがあり得るとのこと。'})}
</div>
<div class="actions end"><button type="button" class="btn primary" id="saNext" data-action="script-next">面接チェックリストへ進む →</button></div>
```
- 区分は「（原則対象外）」などの接尾辞を付けない（高校生の方針は台本モードで使わない）。卒業予定年月は `applyVisibility` の既存規則（`features.graduationDate` かつ学生の区分）で表示
- **入力のキーは既存のもの**: `applicant.name / age / gender / category / graduationDate / reviewerNotes`、`checklist.header.posting / negatives.<id> / taxi / date / interviewer`。新しいキーは作らない。台本モードで入力しない applicant の項目は空のまま保存される
- 消極属性のチェック: チェック → `'on'`、外す → `''`（2-6 の `data-cl-on`）
- `script-next`: `validateScriptApplicant()` → `goStep(3)`。
  ```
  missing = checkRequired('#stepContent')（data-required は氏名だけ）→ あれば focusFirst(missing[0], '必須項目（' + n + '件）が未入力です') で false
  age が空でなく整数でない → [data-field="age"] に .invalid、focusFirst(el, '年齢は整数で入力してください') で false
  ```
- 出さないもの（S2）: 通勤・曜日・時間・週日数・勤務期間・かけもち・高校生の例外・外国籍・繁忙期・深夜帯・オールナイト・`#preFill`・`#notesCard`（申し送りコメント）・貢献度メーター・「留意点を生成して申し送りへ」

### 2-3. Step② 面接チェックリスト（M4。`interviewStepHtml()` の差分）
> 2026-10-13: `#clHeader`（台本モード）は 1 行に圧縮（題名・説明文・目安時間なし）、【説明】【合否連絡】に「すべて説明した」を追加。**12-4・12-5** を参照。
`renderStep` case 3: 台本モードは `fillChecklistDefaults(); c.innerHTML = interviewStepHtml(); updateChecklistUI(true);`（`rebuildHandoff`・`applyVisibility`・`updateContribMeters`・`refreshDeferredItems` は呼ばない）。

| 部分 | 詳細モード（変えない） | 台本モード |
| --- | --- | --- |
| `legacyBannerHtml()`・`#legacyScores` | あり | あり。`#legacyScoresMsg` は台本モードでは常に「旧形式の面接評価（参考）です。台本モードの報告書は面接チェックリストの入力から作ります。」 |
| `#unresolvedAlert` | あり | **出さない** |
| `#clHeader` | 入力欄つき（`clHeaderHtml`） | **読み取り専用** `scriptClHeaderHtml(sum)`（下記） |
| `#clNav`・①〜⑤ `#cl-<id>`・`#clOverall` | あり | 同じ（自動表示は 1-3-3 で空） |
| `.cl-group-label` ＋ `#shiftConfirm` | ① の後 | **出さない** |
| 操作 | 「← 申し送りに戻る」・印刷・「採用可否判定を実行 →」 | `<button type="button" class="btn" id="backToApplicant" data-action="to-step" data-step="1">← 応募者に戻る</button>`、`#clPrintBtn`（従来どおり）、`<button type="button" class="btn primary" id="toReportBtn" data-action="judge">報告書へ進む →</button>` |

`scriptClHeaderHtml(sum)`:
```html
<div class="card" id="clHeader"><div class="card-head"><h2>{title} <span class="badge">{version} 版</span></h2><div class="spacer"></div>
  <span class="badge accent lg">{name} さん</span>{intro の p}{目安 合計 の p #clMinutesTotal（既存と同じ）}</div>
  <div class="cl-head-attrs" id="clHeaderAttrs">
    {R.scriptApplicantRows(...) のうち key が name・notes 以外: <span class="cl-attr" data-attr="{key}"><small>{label}</small>{value}</span>}
    <button type="button" class="btn sm ghost" data-action="to-step" data-step="1">応募者を編集</button>
  </div></div>
```
- `rerenderClHeader()` は台本モードなら `scriptClHeaderHtml` で作り直す
- `#clOverall` の hint（台本モード）: `[def.overallHint, '「' + 採用の表示名 + '」は' + resultTitle('recommend') + '、「' + 保留 + '」は' + resultTitle('review') + '、「' + 不採用 + '」は' + resultTitle('reject') + 'として報告します（必須条件が不一致なら' + resultTitle(def.mustFailResult === 'review' ? 'review' : 'reject') + '）。'].join(' ')`
- `#clMustAlert`・`.cl-skippable` は従来どおり（台本の「5へ」）
- `updateChecklistUI` は変更不要（`state.step === 3`）。`#clTaxiAuto`・`#clNeg-*`・`#clInterviewer` が無くても null 安全

### 2-4. Step③ 報告書（M5）`reportStepHtml()`
`renderStep` case 4: 台本モードは `if (!state.judgment) { state.judgment = evaluateNow(); state.judgmentStale = false; } c.innerHTML = reportStepHtml();`（`rebuildHandoff` なし）。`goStep(4)` は従来どおり毎回 `evaluateNow()`。

```js
function evaluateNow() {
  if (isScript()) return R.evaluateScript(state.applicant, ensureChecklist(), state.profile);
  return R.evaluateHiring(state.applicant, state.scores, state.profile, state.handoff, state.handoffChecks, { checklist: ensureChecklist() });
}
```

並び:
```
legacyBannerHtml()
#scriptWarnings     .card（j.warnings が 1 件以上のときだけ）
#appPaperWrap       .report-paper-wrap > .report-paper-cap + #appPaper.report-paper > .cl-sheet.cl-mode-sheet（.cl-decision#appPaperDecision）
#mgmtCard           既存 managementCardHtml()（初期対応者／面接対応者／最終確認）
#decisionCard       既存 decisionCardHtml()
.actions.between.no-print
```
- `#scriptWarnings`: `<div class="card" id="scriptWarnings"><div class="card-head"><h3>確認事項</h3></div><ul class="list-x">{warnings を 1 行ずつ}</ul>` ＋ 総合判断が未入力のときだけ `<div class="actions"><button type="button" class="btn sm" data-action="to-step" data-step="3">面接チェックリストで入力する</button></div>` ＋ `</div>`
- 紙: 
  ```html
  <div class="report-paper-wrap" id="appPaperWrap">
    <div class="report-paper-cap"><b>面接チェックリスト報告（A4 プレビュー）</b><span>保存した HTML も同じ表示で開きます。印刷は「A4 で印刷」で 1〜2 枚</span></div>
    <div class="report-paper" id="appPaper">{reportPaperInnerHtml()}</div></div>
  ```
  `reportPaperInnerHtml() = S.checklistSheetHtml(S.buildRecord(state), state.profile, { mode: 'sheet', stamps: '', decisionId: 'appPaperDecision', decisionSvgId: 'vdAppPaper' })`（押印は下の `#mgmtCard`。保存 HTML の報告書表示と同じ構成）
- `rerenderReportPaper()`: `#appPaper` があれば `innerHTML = reportPaperInnerHtml()`。呼ぶ場所: `onContentClick` の `stamp`・`unstamp`・`undecide`、`decide()` の最後（「紙プレビューは入力・押印の変更で再描画」）
- 操作:
  ```html
  <div class="actions between no-print">
    <button type="button" class="btn" id="backToChecklist" data-action="to-step" data-step="3">← 面接チェックリストに戻る</button>
    <div class="actions"><button type="button" class="btn" id="reportPrintBtn" data-action="print-checklist">🖨 A4 で印刷</button>
      <button type="button" class="btn primary" id="reportSaveBtn" data-action="save">💾 報告書を保存（HTML）</button></div></div>
  ```
- 出さないもの: `.result-card`・`.axis-grid`・マトリクス・`#clBreakdown`・貢献度の内訳・`#busyAllNightResult`・`#applicantSummary`・`#judgeWarnings`・判定履歴（判定結果は紙の【判定サマリー】と右サマリーで示す）
- 押印欄「面接対応者」の初期選択は既存 `managementCardHtml` の規則（`checklist.header.interviewer` が名簿にあればその人）。Step① の担当者がそのまま初期選択になる

### 2-5. 右サマリー（M7）`renderScriptSummary()`
> 2026-10-13: 「応募者」カードは 4 行（`#sumAttrs` は区分の行の中の span。求人が短期のときだけ「短期求人」のチップ 1 つ。消極属性は出さない）。**12-6** を参照。
`renderSummary()` の先頭（`#applicantChip` の更新の後）で `if (isScript()) { $('#summaryPanel').innerHTML = scriptSummaryHtml(); return; }`。詳細モードのサマリーは変えない。

```
.summary-card#sumApplicant   h4「応募者」
  .sum-name  氏名 さん（未入力なら「未入力」）
  .sum-sub   [区分, 年齢歳, 性別].filter(Boolean).join('・')（空なら「区分・年齢未入力」）
  .badges#sumAttrs  消極属性（on のもの・badge warn）・応募した求人（badge info）
  .sum-row#sumDate        面接日 2026/10/10（空は —）
  .sum-row#sumInterviewer 担当   笹川 晴央（空は —）
.summary-card#sumChecklist   h4「面接チェックリスト」
  .sum-row#sumMust     必須条件  既存と同じバッジ（不一致 n / 未確認 n / すべて一致）
  .sum-row#sumMarks    採点      ○n △n ×n（未入力 n）・{total}/{max}点（未入力 0 のときは括弧を出さない）
  .sum-row#sumOverall  総合判断  {label | 未入力}
.summary-card#sumJudgment    h4「報告書」
  .sum-row#sumResult   結果      checklistHasInput なら R.evaluateScript(...) の title を badge lg {tone}、無ければ「—」
  .sum-row#sumStamps   押印      management.fields ごとに「{label} ✓ {short}」または「{label} 未押印」を「／」で連結
  decisionSummaryHtml()（既存 #sumDecision）
  .sum-sub#sumSaved    state.dirty ? '未保存の変更あり' : state.savedAt ? '最終保存 ' + fmtDateTime : '未保存'
```
出さない: 通勤・勤務期間・週日数・シフト適合・シフト貢献度・留意点・面接評価のゲージ・2 軸。値は `R.scriptApplicantRows(state.applicant, state.checklist, state.profile, state.management)` と `R.interviewModel` / `R.mustSummary` から作る。

### 2-6. app.js の変更一覧（関数ごと）
1. ヘッダーコメントを「台本モード（既定）: Step1 応募者 → Step3 面接チェックリスト → Step4 報告書（表示は ①②③）／詳細モード: 従来の 4 ステップ」に
2. `isScript()`・`STEPS_FULL`/`STEPS_SCRIPT`/`steps()`・`renderStepNav`・`goStep`（2-1）
3. `renderStep`（2-2〜2-4）
4. `evaluateNow`（2-4）
5. `onContentClick`:
   - `case 'script-next'`（2-2）
   - `case 'judge'`: 先頭に `if (isScript()) { goStep(4); break; }`（Y8）
   - `case 'cl-set'`: 既存処理の後に `syncClButtons(path)`（`$$('[data-action="cl-set"]')` のうち `data-cl === path` のボタンの `.active` と `aria-pressed` を現在値で更新。Step① の「応募した求人」用。Step② は従来どおり `updateChecklistUI` も更新する）
   - `case 'stamp'` / `case 'unstamp'` / `case 'undecide'`: 既存処理の後に `rerenderReportPaper()`。`decide()` の最後にも
6. `onFieldEvent` の `t.dataset.cl` 分岐: チェックボックスで `t.hasAttribute('data-cl-on')` なら `clSet(path, t.checked ? 'on' : '')`、それ以外は従来（`t.checked`）。`.cl-check` に加えて `const chip = t.closest('.chip'); if (chip) chip.classList.toggle('on', t.checked);`
7. `saveRecord()`: `rebuildHandoff` の分岐を `if (!isScript() && (!state.handoff || state.handoffStale))` に。toast は従来の文言に、台本モードで `R.checklistHasInput(state.checklist)` かつ `!R.OVERALL_POINTS.hasOwnProperty(state.checklist.overall)` のとき `'（総合判断が未入力です）'` を足して kind `'warn'`（保存は止めない＝M5）
8. `applyRecord(rec)`（6 章）
9. 設定の `onSave` / `onReset` / `importProfileText`（6-3）
10. `profileNotice(rep, p)`: `if (rep.modeAdded) msgs.push(MODE_ADDED_MSG);`（`MODE_ADDED_MSG = '運用モードを「台本モード」にしました（応募者 → 面接チェックリスト → 報告書 の 3 ステップ）。従来の 4 ステップは設定の「運用モード」で「詳細モード」に切り替えると使えます。'`）。`init()` の保存条件に `|| rep.modeAdded`、toast 条件にも
11. `helpHtml()`: `if (isScript()) return scriptHelpHtml();`（5 章）
12. 新規: `scriptApplicantStepHtml` / `validateScriptApplicant` / `scriptClHeaderHtml` / `reportStepHtml` / `reportPaperInnerHtml` / `rerenderReportPaper` / `scriptSummaryHtml` / `syncClButtons` / `scriptHelpHtml`
13. `global.RecruitApp` の公開は変えない（`goStep`・`prepareChecklistSheet` などで足りる）

### 2-7. styles.css（「最終合否（Step4）」ブロックの後ろに追加）
```css
/* ---------- 台本モード（docs/SPEC-script-mode.md） ---------- */
.cl-head-attrs { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cl-attr { display: inline-flex; gap: 6px; align-items: baseline; padding: 3px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-2); font-size: 13px; font-weight: 600; }
.cl-attr small { font-size: 11px; font-weight: 600; color: var(--muted); }
.cl-attr[data-attr="negatives"] { border-color: var(--warn); color: var(--warn); }
.report-paper-wrap { max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 4px 2px 14px; }
.report-paper-cap { display: flex; justify-content: space-between; gap: 4px 12px; flex-wrap: wrap; width: 210mm; max-width: 100%; margin: 0 auto 6px; font-size: 12px; color: var(--muted); }
.report-paper-cap b { color: var(--text); }
.report-paper { box-sizing: content-box; width: 190mm; margin: 0 auto; padding: 10mm; background: #fff; color: #111; border: 1px solid #d5dbe3; border-radius: 2px; box-shadow: 0 1px 2px rgba(16,24,40,.08), 0 12px 32px rgba(16,24,40,.12); color-scheme: light; }
.report-paper .cl-mode-sheet .cl-page + .cl-page { margin-top: 8mm; padding-top: 6mm; border-top: 1px dashed #b8c2cf; }
.mode-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.mode-opt { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; background: var(--surface); }
.mode-opt.on { border-color: var(--accent); background: var(--accent-soft); }
.mode-opt .lbl { font-weight: 800; }
.settings-advanced { border: 1px dashed var(--border-strong); border-radius: 12px; padding: 10px 12px; }
.settings-advanced > summary { cursor: pointer; font-weight: 800; padding: 4px 2px; }
.settings-advanced[open] > summary { margin-bottom: 10px; }
@media (max-width: 640px) { .mode-options { grid-template-columns: 1fr; } }
@media print { .report-paper-wrap { display: none !important; } }
```
- `.report-paper` はアプリのダークモードでも白地・黒字（`.cl-sheet.cl-mode-sheet` は `checklistSheetCss` で `background:#fff;color:#111` 固定）。390px では `.report-paper-wrap` の中だけ横スクロール（`.work { min-width: 0 }` は既存）

---

## 3. 保存 HTML（台本モードの記録。M6）

### 3-1. 分岐の原則
- `generateReportHTML(record, profile)` と `checklistSheetHtml(record, profile, o)` の冒頭で `const scriptRec = R.isScriptRecord(record);`。**`record.mode === 'script'` のときだけ**本章の形にし、それ以外（`'full'`・キーなし）は現状と 1 文字も変えない（3-7 の共通修正を除く）
- 計算（`descRows`・`unconfirmed`・留意点・貢献度など）は今のまま走らせてよい（出力に使わない）。出力の組み立てだけ分岐する

### 3-2. body・ツールバー・紙
- body: `<body class="view-report has-cl mode-script" data-filename="…">`（class の順はこのとおり。**回答が無くても `has-cl`**＝Y5）
- `.rtool`: 表示切替（`#rtViewReport` / `#rtViewFull`）はそのまま。印刷は `<span>印刷:</span><button type="button" id="rtPrintChecklist" class="primary">面接チェックリスト報告（A4）</button><button type="button" id="rtPrintAll">レポート全体</button><span class="rtool-hint">面接チェックリスト報告は台本の①〜⑤の記入内容・判定・押印欄を A4 1〜2 枚にまとめます。「レポート全体」は「詳細」の内容を印刷します。</span>`（**`#rtPrintSheet` は出さない**）
- 紙プレビュー `.paper-wrap#reportPaper > .paper#clPaper`（回答の有無に関係なく出す。中身は従来どおり `checklistSheetHtml(record, profile, { mode: 'sheet', stamps: '', decisionId: 'clPaperDecision', decisionSvgId: 'vdPaper' })`）
- 印刷用 `#clSheet.cl-sheet-print`（回答の有無に関係なく。`mgmt` 節の直前）

### 3-3. ヘッダー `.rh` とダッシュ `.dash`
- `.rh-meta` の進捗: `{ 1: '応募者の入力中', 3: '面接チェックリストの入力中', 4: '報告書まで完了' }[record.step] || ''`
- `.rh-main`: `.sheet-title.print-only`（申し送りシートの題）は出さない。チップは `[区分, 年齢歳, 性別, '卒業予定 ' + 年月, 応募した求人の label, 消極属性（on のもの・「・」連結）]` の空でないもの。`hsChip` は出さない
- 判定バッジ `.verdict`: 判定ありなら従来の形で `v-title` = `j.title`、`v-sub` = `'必須条件 ' + (不一致 n | 未確認 n | すべて一致) + '・総合判断 ' + (j.overall.label || '未入力')`。判定なしなら `v-title`「未実施」・`v-sub`「アプリの「報告書」を開くと判定します」
- `#rhDecision`（最終合否）は従来どおり
- `.dash`（4 タイル。各タイルに `data-tile`）:
  | data-tile | t-label | t-val | t-sub |
  | --- | --- | --- | --- |
  | `interview` | 面接評価（確認点） | `{total}<small>/ {max}点</small>`（rated 0 なら「未入力」） | `得点率 {pct}%・{帯}　○n △n ×n` |
  | `must` | 必須条件 | すべて一致／不一致 n（danger 色）／未確認 n | `一致 n・不一致 n・未確認 n` |
  | `overall` | 総合判断 | 採用／保留／不採用／未入力 | 面接者の総合判断 |
  | `result` | 結果 | `<span class="badge lg {tone}">{j.title}</span>`（判定なしは「未実施」） | `台本モード・{判定日時}` |
  値は `interviewModel(clProf, {}, clRec)`・`mustSummary`・`record.judgment`。**シフト貢献度・留意点のタイルは出さない**

### 3-4. 節（`.page` の直下の並び）
```
.rtool → .paper-wrap#reportPaper → header.rh → .dash
section.sec[data-sec="applicant"]   h2「応募者情報」     … table.kv（scriptApplicantRows(a, clRec, clProf, record.management) の全行）。行が無ければ <p class="empty">応募者情報の入力はありません。</p>
section.sec[data-sec="checklist"]   h2「面接チェックリスト」 … 回答あり: checklistSheetHtml(record, profile, { mode: 'section' })／なし: <p class="empty">面接チェックリストは未入力です。</p>＋面接所見
section.sec[data-sec="scores"]      （旧 scores があるときだけ。従来どおり）
section.sec[data-sec="judgment"]    h2「採用可否判定」   … 3-5
#clSheet.cl-sheet-print
section.sec[data-sec="mgmt"]        h2「応募者の管理」   … 従来どおり（#decision・#mgmt・#mgmtSave・.mgmt-note）
.foot
```
**生成しない**: 「応募時の情報」(`pre`)・「面接者への申し送りコメント」(`comment`)・「面接者への申し送り（留意点）」(`handoff`)・「面接で確認した情報／面接前に分かっている情報（未確認）」(`interview`)・「シフト貢献度」(`contrib`)・申し送りシートの印刷ボタン。全体印刷（`#rtPrintAll`・詳細表示の Ctrl+P）でもこの節だけになる。

### 3-5. 「採用可否判定」の節（台本モード）
判定あり:
```html
<div class="result {result}"><div class="result-kicker">採用可否判定（台本モード）</div>
  <div class="result-title">{j.title}</div><div class="result-body">{j.body}</div>
  <table class="kv script-judge">
    <tr><th>必須条件</th><td>一致 n・不一致 n・未確認 n{（不一致: …／未確認: …）}</td></tr>
    <tr><th>面接評価（確認点）</th><td>{total}/{max}点（{pct}%・{帯}）　○n △n ×n</td></tr>
    <tr><th>総合判断</th><td>{label | 未入力}</td></tr>
    <tr><th>結果</th><td>{j.title}</td></tr>
  </table>
  {adjustments があれば: <div class="adj-head">{from===to を含む must_conditions なら「必須条件の不一致により「{title}」に固定」／それ以外「総合判断による結果「{baseTitle}」から「{title}」に調整」}</div><ul class="adj">（従来と同じ li の形）</ul>}
  {warnings のうち adjustments の reason と同じもの以外: <ul class="warn-list">…</ul>}
  <div class="disclaimer">{j.disclaimer}　判定日時: {…}</div></div>
```
判定なし: `<p class="empty">採用可否判定は未実施です（アプリの「報告書」を開くと判定します）。</p>`。値は `j.checklist.must`（無ければ `mustSummary`）・`j.interview`・`j.overall`（無ければ `j.checklist.overall`）を使う。「2軸」「シフト貢献度」「判定方式」「マトリクス」は出さない。

### 3-6. `checklistSheetHtml` の台本分岐（`scriptRec` のとき）
- `prof = Object.assign({}, profile, { checklist: def, mode: scriptRec ? 'script' : 'full' })` を `R.checklistSummary` に渡す（Y2・Y3。詳細の記録は従来どおり自動あり）
- ヘッダー（sheet / section 共通）: タクシーのチップに「（手入力）」を付けない（台本モードは常に手入力）。消極属性は「（自動）」が付かない（1-3-3 で自動なし）。空は従来どおり「—」/「なし」
- sheet のヘッダー: `who = [区分, 年齢歳, 性別]`。卒業予定があれば `<span class="cl-hchip"><b>卒業予定</b>{YYYY年M月}</span>` を足す。**勤務期間・週・希望シフトのチップは出さない**
- 「面接で確認した勤務条件」（`.cl-confirmed`）は出さない
- `.cl-overall`（sheet のみ）: 面接所見の行の後に、`applicant.reviewerNotes` があれば `<div class="cl-ov-row cl-ov-notes"><span class="cl-ov-k">備考</span><span class="cl-ov-v cl-memo-t">{本文}</span></div>`
- 【判定サマリー】のタイル（判定ありのとき。並びはこのとおり・4 枚）:
  1. `<div class="cl-tile {bandTone}"><span class="cl-tile-k">面接評価（確認点）</span><span class="cl-tile-v">{total}<small> / {max}点</small></span><span class="cl-tile-s">{pct}%・{帯}</span></div>`
  2. 必須条件（既存のタイルそのまま。`m.total` が 0 なら出さない）
  3. `<div class="cl-tile {t-ok|t-warn|t-danger|t-muted}"><span class="cl-tile-k">総合判断</span><span class="cl-tile-v">{label | 未入力}</span><span class="cl-tile-s">{def.overallLabel}</span></div>`
  4. 結果（既存の `.cl-tile.cl-tile-res` そのまま）
  シフト貢献度のタイルは出さない。外側 `class="cl-judge"`・`.cl-judge-row`・`.cl-decision`・`<ul class="cl-adj"><li><b>…` の形は従来どおり（単体 #66・#71）。判定なしの「採用可否判定は未実施（…）」も従来どおり

### 3-7. 埋め込みスクリプト 1 の修正（両モード共通・必須）
冒頭の `var b=document.getElementById("rtPrintSheet"),a=document.getElementById("rtPrintAll");if(!b)return;` の **`if(!b)return;` を消し**、`b.addEventListener("click",…)` を `if(b)b.addEventListener("click",…)` にする。台本モードは `#rtPrintSheet` が無いため、このままだと IIFE が抜けて表示切替・`__prepareChecklistSheet`・beforeprint が定義されない。

### 3-8. `.mgmt-note`（台本モード・decision 有効時）
`運用: 面接者はアプリで面接チェックリストを入力し、報告書の「面接対応者」に押印して保存したファイルをスレッドに添付します。副支配人はこのファイルをブラウザで開き、「{label}」で担当者を選んで「{hire}」または「{reject}」を押し（押印欄「最終確認」が未押印なら同じ担当者の印も押されます）、「押印を保存」で再出力したファイルをスレッドに添付してください。レポート上で押した印・合否は「押印を保存」で再出力したファイルにだけ記録されます（保存せずに閉じると消えます）。再出力したファイルはアプリの「読み込み」で押印・合否ごと引き継げます。担当者名簿は設定（劇場ルール）の「応募者の管理」で編集できます。`（詳細モード・decision 無効時は従来の文言）

### 3-9. CSS
`reportCss()`・`checklistSheetCss()` に追加は不要（既存の `.dash`・`table.kv`・`.result`・`.adj`・`.cl-tile` を使う）。`body.view-report.has-cl` の既存規則で、報告書表示は紙＋応募者の管理だけになる。

---

## 4. 設定（M8）

### 4-1. 運用モードの節（先頭。`issuesHtml()` の直後）
```html
<section class="card" id="s-mode"><div class="card-head"><h2>運用モード</h2><p>アプリの流れを選びます。保存すると判定ステップを作り直し、Step1 に戻ります（入力中の応募者のデータは保持されます）。</p></div>
  <div class="mode-options" role="radiogroup" aria-label="運用モード">
    <label class="mode-opt{ on}"><input type="radio" name="s-mode" value="script" data-bind="mode" data-repaint{ checked}>
      <div><div class="lbl">台本モード（既定）</div><div class="hint">応募者 → 面接チェックリスト → 報告書 の 3 ステップ。面接台本のとおりに入力し、A4 の報告書（電子印・最終合否）にします。</div></div></label>
    <label class="mode-opt{ on}"><input type="radio" name="s-mode" value="full" data-bind="mode" data-repaint{ checked}>
      <div><div class="lbl">詳細モード</div><div class="hint">応募情報 → 面接者への申し送り → 面接チェックリスト → 採用可否判定 の 4 ステップ。勤務条件・留意点・シフト貢献度・2 軸判定を使います（他劇場向け）。</div></div></label>
  </div>
  <div class="hint" id="modeChangeNote">「設定を保存」で切り替わります。</div>  ← draft.mode と保存済みの mode が違うときだけ
</section>
```
- 選択は `draft.mode`（無ければ `'script'`）。`coerce` は radio を `t.value` で返す（既存の既定の分岐で OK）。`data-repaint` で選んだ瞬間に下の折りたたみを描き直す
- 設定画面の折りたたみ・表示は **`draft.mode`** で決める（保存前でも選んだモードの並びを見せる）

### 4-2. 並び（Y13）
台本モード（`draft.mode !== 'full'`）:
```
s-mode → s-meta（劇場情報）→ s-applicant（応募者の属性）→ s-checklist（面接チェックリスト）→ s-texts-script（結果文言〔台本モード〕）→ s-mgmt（応募者の管理〔押印〕）→ s-io（書き出し／読み込み）
<details class="settings-advanced" id="s-advanced"><summary>詳細モードの設定（台本モードでは使いません）</summary>
  <p class="hint">詳細モード（4 ステップ）に切り替えたときに使う設定です。台本モードのままでも編集・保存できます。</p>
  s-features（graduationDate を除く）→ s-stages → s-options（categories・genders を除く）→ s-busy → s-params → s-hs → s-rules → s-contrib → s-matrix → s-texts（3 つの title と disclaimer を除く）
</details>
```
詳細モード: `s-mode` → 従来の並び（s-meta, s-features, s-stages, s-options, s-busy, s-params, s-hs, s-rules, s-checklist, s-contrib, s-matrix, s-texts, s-mgmt, s-io）。従来の節の中身・文言は変えない（`s-texts-script`・`s-applicant` は出さない）。

- `s-applicant`「応募者の属性」（台本モードだけ）: 説明「Step① 応募者で選ぶ区分・性別と、学生の卒業予定年月の表示です。」、中身は `sLines('options.categories', '区分', { type: 'categories', hint: '「値|グループ」の形式。グループ: ' + GROUP_HINT })`・`sLines('options.genders', '性別')`（同じ field-row）・`sCheck('features.graduationDate', '卒業予定年月（学生）', '学生の区分のとき Step① に卒業予定年月の欄を出します。')`
- `s-texts-script`「結果文言（台本モード）」（台本モードだけ）: 説明「報告書の「結果」と本文です。」、hint `変数: {name} {overallLabel} {total} {max} {pct} {band} {marks} {mustLabels} {resultTitle} {baseTitle}`、中身: `texts.recommend.title`・`texts.review.title`・`texts.reject.title`（cols-3）、`texts.script.recommend`「採用推奨の本文」、`texts.script.review`「上長最終判断要の本文」、`texts.script.reject`「不採用推奨の本文」、`texts.script.missing`「総合判断が未入力のときの本文」、`texts.script.mustGate`「必須条件の不一致で固定したときの本文」、`texts.script.adjusted`「総合判断の上限などで結果が下がったときの本文」、`sTextarea('texts.disclaimer', '判定結果の注記', { rows: 2 })`
- `optionsHtml(o)` / `featuresHtml(o)` / `textsHtml(o)` に `o.scriptLayout` を足し、true のとき上の「除く」項目を描かない（同じ data-bind を 1 画面に 2 回描かない）
- `nav`（台本モード）: `<a href="#s-mode">運用モード</a><a href="#s-meta">劇場情報</a><a href="#s-applicant">応募者の属性</a><a href="#s-checklist">面接チェックリスト</a><a href="#s-texts-script">結果文言</a><a href="#s-mgmt">応募者の管理（押印）</a><a href="#s-io">書き出し／読み込み</a><a href="#s-advanced">詳細モードの設定</a>`。詳細モード: 従来の nav の先頭に `<a href="#s-mode">運用モード</a>`
- `#s-advanced` の開閉は `paint()` の前に `advOpen = root.querySelector('#s-advanced') ? .open : advOpen` で覚えて描き直す（既定は閉）。`render()` で `advOpen = false`

### 4-3. s-checklist の台本モード向け補足
台本モードのとき、「総合判断「保留」のとき」「総合判断「不採用」のとき」の select の下に hint 1 行: 「台本モードでは総合判断がそのまま結果になります（採用→採用推奨・保留→上長最終判断要・不採用→不採用推奨）。ここで厳しくした場合だけ結果が下がります。」（詳細モードでは出さない）

### 4-4. 保存時の挙動（app.js `showView('settings')` の handlers）
```js
onSave: function (p) {
  const wasScript = isScript();
  state.profile = S.normalizeProfile(p); S.saveProfile(state.profile); renderBrand();
  state.applicant = U.deepMerge(emptyApplicant(state.profile), state.applicant);
  state.handoffStale = true; invalidateJudgment();
  if (wasScript !== isScript()) {
    onModeChanged();   // state.step = 1; state.judgment = null; state.judgmentStale = false;（maxStepReached は保持）
    toast('運用モードを「' + (isScript() ? '台本モード' : '詳細モード') + '」に切り替えました。判定ステップを作り直し、Step1 に戻りました。', 'ok');
  } else toast('設定を保存しました', 'ok');
  Settings.render($('#view-settings'), state.profile, this);
}
```
`onReset`・`importProfileText` も置き換えの前に `wasScript` を取り、変わったら `onModeChanged()`（toast は既存の文言のまま）。

---

## 5. ヘルプ（M9）`scriptHelpHtml()`
詳細モードでは従来の `helpHtml()` のまま。台本モード:
```html
<div class="card"><div class="card-head"><h2>{appTitle} の使い方</h2><p>面接台本（スタッフ面接チェックリスト）のとおりに面接し、その内容をそのまま A4 の報告書にします。応募者の名前と属性を入れたら、あとは台本の順に入力するだけです。</p></div>
  <div class="help-steps">
    <div class="help-step"><span class="n">1</span><h3>応募者</h3><p>氏名（必須）・年齢・性別・区分（学生は卒業予定年月）と、台本のヘッダー（応募した求人・消極属性・タクシー可否・料金・面接日・面接担当者）を入力します。備考には面接者のメモを書けます。</p></div>
    <div class="help-step"><span class="n">2</span><h3>面接チェックリスト</h3><p>①勤務条件 → ②継続性・報連相 → ③仕事内容の説明 → ④集団行動特性 → ⑤逆質問 の順に、必須条件（一致／不一致）・説明のチェック・質問のメモ・確認点の ○△×・総合判断（採用／保留／不採用）を入力します。必須条件が 1 つでも不一致なら不採用推奨です。</p></div>
    <div class="help-step"><span class="n">3</span><h3>報告書</h3><p>A4「面接チェックリスト報告」のプレビューを確認し、押印欄（初期対応者／面接対応者／最終確認）に電子印を押して「報告書を保存（HTML）」します。「A4 で印刷」で 1〜2 枚に印刷できます。</p></div>
  </div></div>
<div class="card" id="helpScriptFlow"><div class="card-head"><h3>報告書（HTML）の流れ</h3></div><ol class="list-plain">
  <li>面接者が「面接対応者」に押印して保存し、社内スレッドに添付します。</li>
  <li>副支配人がファイルをブラウザで開きます（報告書の表示で開きます。「詳細」で全体を表示）。</li>
  <li><b>最終合否</b>：担当者を選んで「採用」または「不採用」を押し（最終確認の印も自動で押されます）、「押印を保存」で再出力します（ファイル名の末尾に _採用 / _不採用）。</li>
  <li>再出力したファイルはアプリの「読み込み」で押印・合否ごと引き継げます。</li></ol></div>
<div class="card"><div class="card-head"><h3>結果（推奨）の決まり方</h3></div><ul class="list-plain">
  <li>必須条件に不一致がある → 不採用推奨（設定で上長最終判断要に変更可）。</li>
  <li>それ以外は面接者の総合判断のとおり（採用 → 採用推奨、保留 → 上長最終判断要、不採用 → 不採用推奨）。総合判断が未入力なら上長最終判断要です。</li>
  <li>確認点の ○△× は面接評価（点数）として報告書に載ります。最終合否（採用／不採用のスタンプ）はこの推奨とは別の、最終確認者の決定です。</li></ul></div>
<div class="card"><div class="card-head"><h3>保存と読み込み</h3></div><ul class="list-plain">
  <li>応募者ごとに 1 ファイル（HTML）。途中で保存しても、読み込むと続きから再開できます。</li>
  <li>応募者データはこの端末のブラウザには残りません（保存したファイルのみが記録です）。</li></ul></div>
<div class="card" id="helpFullMode"><div class="card-head"><h3>詳細モード</h3></div><p>設定（劇場ルール）の先頭「運用モード」で「詳細モード」に切り替えると、従来の 4 ステップ（応募情報 → 面接者への申し送り → 面接チェックリスト → 採用可否判定。面接評価 × シフト貢献度の 2 軸判定）を使えます。他の劇場向けの機能です。</p></div>
<div class="view-footer">{footer}</div>
```

---

## 6. 読み込み・モード差・切替（M10）

### 6-1. `applyRecord(rec)` の変更
- データの取り込みは従来どおり（applicant の詳細・handoffChecks・handoffNote・scores・checklist・management・decision をすべて保持。`state.handoff` も従来どおり作る＝Y6）
- 遷移先: `target = sj ? 4 : (R.checklistHasInput(state.checklist) || Object.keys(state.scores).length) ? 3 : 2`、**台本モードで `target === 2` なら 1**
- toast の組み立て（この順）:
  ```
  msg = name + ' さんのデータを読み込みました'
  劇場が違う → msg = 'このファイルは「…」の設定で保存されています。現在の設定で再判定します。'（従来）
  target === 4 && sj && 判定が違う && (R.isScriptRecord(rec) === isScript()) → msg = '保存時の判定（…）と現在の設定での再判定（…）が異なります'（従来。運用モードが違うときは方式が違うので出さない）
  isScript() && !R.isScriptRecord(rec) → msg += '。詳細モードで保存された記録です（表示されない項目も保持されます）'
  !isScript() && R.isScriptRecord(rec) → msg += '。台本モードで保存された記録です（応募情報の詳細は空です。Step1 で入力できます）'
  確認点の差（従来の追記）
  ```
- 詳細モードの記録を台本モードで読み直して保存すると `record.mode = 'script'` になる（保存時の運用モード）。詳細の項目は記録に残るが、保存 HTML には出ない

### 6-2. モードと記録の組み合わせ
| アプリ | 記録 | 表示 | 判定 |
| --- | --- | --- | --- |
| 台本 | 台本 | 3 ステップ | `evaluateScript` |
| 台本 | 詳細・旧（mode なし） | 3 ステップ（詳細項目は非表示・保持）＋ toast | `evaluateScript`（保存時の判定と違っても「異なります」は出さない） |
| 詳細 | 台本 | 4 ステップ（Step1 の詳細は空）＋ toast | `evaluateHiring`（シフト条件未確定なら incomplete） |
| 詳細 | 詳細・旧 | 従来どおり | 従来どおり |

### 6-3. 運用モードの切替（設定の保存・初期化・JSON 読み込み）
`onModeChanged()`: `state.step = 1; state.judgment = null; state.judgmentStale = false;`（入力データ・`maxStepReached`・`state.decision` は保持）。次に判定画面を開くと新しいモードの Step1。

---

## 7. テスト（M11）

### 7-1. 単体 `tests/rules.test.js`
**準備（既存テストの期待値は変えない）**:
```js
const P = function () { const p = S.defaults(); p.mode = 'full'; return p; };   // 既存 #01〜#71 は詳細モードの検証（Y10）
const PS = function () { return S.defaults(); };                                  // 台本モード（既定）
```
#72〜#77 を末尾（`console.log(passes…)` の前）に追加。`noScript` は各テスト内で `function (h) { return h.replace(/<script>[\s\S]*?<\/script>/g, ''); }` を定義。台本モードの state（#76・#77 で共用）:
```js
function scriptState(over) {
  const p = PS();
  const a = A({ name: '台本 花子', age: '20', gender: '女性', category: '大学2年生', graduationDate: '2029-03', reviewerNotes: '電話の受け答えが丁寧。' }, p);
  const cl = clAll('good', 'hire', null, p);
  cl.header = { date: '2026-10-10', interviewer: '笹川 晴央', posting: 'short', taxi: '可・2,500円', negatives: { short: 'on' } };
  const j = R.evaluateScript(a, cl, p, OPTS);
  return Object.assign({ step: 4, applicant: a, profile: p, handoff: null, handoffChecks: {}, handoffNote: '', scores: {}, checklist: cl,
    interviewNotes: '受け答えが丁寧', judgment: j, management: { interviewer: { name: '笹川 晴央', short: '笹川', title: '副支配人', date: '2026.10.10', at: '' } }, decision: null }, over || {});
}
```

**#72 運用モード（profile.mode・isScriptMode・isScriptRecord・validateProfile）**
- `PS().mode === 'script'`、`P().mode === 'full'`
- `S.normalizeProfile({}).mode === 'script'`、`({ mode: 'full' })` → `'full'`、`({ mode: 'script' })` → `'script'`、`({ mode: 'FULL' })`・`({ mode: 1 })`・`({ mode: null })` → `'script'`
- 冪等: `n1 = plain(S.normalizeProfile({ mode: 'x' }))` → `plain(S.normalizeProfile(n1))` と deepStrictEqual。`plain(S.normalizeProfile(P()))` と `plain(P())` が deepStrictEqual（既存 #26 系と同じ性質）
- report: `raw = PS(); delete raw.mode; r1 = {}; S.normalizeProfile(raw, r1)` → `mode === 'script' && r1.modeAdded === true`。`r2 = {}; S.normalizeProfile(P(), r2)` → `!r2.modeAdded`。`r3 = {}; S.normalizeProfile({}, r3)` → `!r3.modeAdded`
- 旧プロファイル: `S.parseProfileJSON(fs.readFileSync(path.join(FIX, 'v1-profile-other.json'), 'utf8')).mode === 'script'`
- `R.isScriptMode`: `PS()` true・`P()` false・`{}` true・`null` true・`{ mode: 'full' }` false
- `R.isScriptRecord`: `{ mode: 'script' }` true・`{}` false・`{ mode: 'full' }` false・`null` false
- validate: `S.validateProfile(PS()).errors` に「運用モード」を含む要素なし。`S.validateProfile(Object.assign(PS(), { mode: 'x' })).errors` に `'運用モード（台本モード／詳細モード）が正しくありません。'`
- `typeof PS().texts.script.recommend === 'string' && PS().texts.script.recommend.length > 0`、`S.normalizeProfile({}).texts.script.mustGate === PS().texts.script.mustGate`、`texts.script` のどの値にも `シフト貢献度`・`2軸` が無い

**#73 evaluateScript（総合判断で結果・mode=script・判定の形）**（`p = PS()`、`a = A({ name: '台本 花子', age: '20', category: '大学2年生' }, p)`）
- `j = R.evaluateScript(a, clAll('good', 'hire', null, p), p, OPTS)`: `result 'recommend'`・`title '採用推奨'`・`mode 'script'`・`interviewMode 'checklist'`・`scaleMax 2`・`total 16`・`max 16`・`pct 100`・`plain(j.interview)` deepStrictEqual `{ total: 16, max: 16, pct: 100, band: 'high', bandLabel: '高' }`・`contribution === null`・`matrix === null`・`highschool === null`・`unresolved` 空・`adjustments` 空・`adjusted === false`・`warnings` 空・`baseResult 'recommend'`・`evaluatedAt === NOW.toISOString()`・`checklist.must.match === 2`・`plain(j.checklist.overall)` deepStrictEqual `{ value: 'hire', label: '採用', points: 2 }`・`j.must.total === 2`・`breakdown.length === 8`・`strengths.length === 7`・`concerns.length === 0`・`thresholds.recommendPts === 12`・`thresholds.reviewPts === 7`・`body` に `台本 花子さん` と `「採用」` を含み `シフト貢献度` を含まない
- `clAll('good', 'hold', null, p)` → `review`・adjustments 空・body に `「保留」`。`clAll('good', 'reject', null, p)` → `reject`・adjustments 空
- 詳細項目に依存しない: `R.evaluateScript(A({ name: 'x', workPeriod: 'short', sh: { mon: ['10:00', '11:00'] } }, p), clAll('good', 'hire', null, p), p, OPTS)` → `recommend`・warnings 空（応募情報との食い違い警告を出さない）

**#74 evaluateScript（必須条件: 不一致・未確認・設定）**
- `cl = clAll('good', 'hire', null, p); cl.values.must_weekly = 'mismatch'` → `reject`、`plain(j.adjustments)` deepStrictEqual `[{ code: 'must_conditions', from: 'recommend', to: 'reject', reason: '必須条件が一致しないため（土日を含む週3日以上、5時間以上）、不採用推奨とします。' }]`、`warnings[0]` が同じ reason、body に `必須条件（土日を含む週3日以上、5時間以上）` と `面接者の総合判断・面接評価にかかわらず不採用推奨とします` を含み `シフト貢献度` を含まない
- 打ち切り（`cl2 = R.emptyChecklist(); cl2.values.must_weekly = 'mismatch'`）→ `reject`・`adjustments[0].from === 'review'`・warnings に `未入力の確認点` も `総合判断が未入力` も無い
- `p2 = PS(); p2.checklist.mustFailResult = 'review'` ＋ 採用・不一致 → `review`、adjustments deepStrictEqual `[{ code: 'must_conditions', from: 'recommend', to: 'review', reason: '必須条件が一致しないため（土日を含む週3日以上、5時間以上）、採用推奨ではなく上長最終判断要として扱います。' }]`
- 未確認（`cl3 = clAll('good', 'hire', null, p); delete cl3.values.must_busy`）→ `recommend`・adjustments 空・warnings に `'必須条件に未確認が1件あります（指定繁忙期間すべて可（クリスマス・年末年始・春休み・GW・お盆））。面接で確認してください。'`
- `p3.checklist.mustUnknownResult = 'review'` → `review`・`adjustments[0]` が `code 'must_unconfirmed'`・`from 'recommend'`・`to 'review'`・reason に `面接チェックリストの ① で一致／不一致を入力してください。`

**#75 evaluateScript（総合判断の未入力・overallCaps・× の警告・壊れた入力・本文の設定）**
- 未入力（`c1 = clAll('good', 'hire', null, p); c1.overall = ''`）→ `review`・adjustments 空・`total 14`・warnings に `'面接者の総合判断が未入力です（結果は上長最終判断要として扱います）。'`・body に `未入力`
- 確認点の未入力（`delete c2.values.rt_team`）→ `recommend`・warnings に `'未入力の確認点が1件あります（0点として集計）。'`
- `p4.checklist.overallCaps.hold = 'reject'` ＋ 保留 → `reject`、adjustments deepStrictEqual `[{ code: 'overall_hold', from: 'review', to: 'reject', reason: '面接者の総合判断が「保留」のため、不採用推奨とします。' }]`、body は `adjusted` の文（`下記の理由により不採用推奨とします`）
- `overallCaps.reject = 'none'`・`'review'` ＋ 不採用 → どちらも `reject`・adjustments 空（上げない）
- × の警告（`c4.values.rt_team = 'poor'`、採用）→ `recommend`・warnings に `'確認点に × が1件あります（自己判断せずチームで動けるか）。総合判断「採用」と合わせて確認してください。'`・concerns に `自己判断せずチームで動けるか`
- 壊れた入力: `R.evaluateScript({}, null, PS())` が例外なし・`review`・`total 0`。`R.evaluateScript({}, R.emptyChecklist(), { checklist: null })` が例外なし・`max 2`
- 本文の設定: `p5.texts.script.recommend = 'OK {name} {overallLabel}'` → body `'OK 台本 花子さん 採用'`。`p6.texts.script.recommend = ''` → 既定の文（`採用を推奨します。` を含む）

**#76 保存レコードと保存 HTML（台本モードの記録／詳細モードの記録）**
- `rec = S.buildRecord(scriptState())` → `mode 'script'`・`schemaVersion 2`。`S.buildRecord(decisionState()).mode === 'full'`
- `html = S.generateReportHTML(rec, PS())`、`ns = noScript(html)`:
  - `html` に `'<body class="view-report has-cl mode-script" data-filename="応募者_台本_花子_'`
  - 含む: `<h2>応募者情報</h2>`・`<h2>面接チェックリスト</h2>`・`<h2>採用可否判定</h2>`・`<h2>応募者の管理</h2>`・`id="rtPrintChecklist"`・`id="rtPrintAll"`・`id="clPaper"`・`id="clSheet"`・`id="decision"`・`id="rtViewReport"`・`class="kv script-judge"`・`<div class="result recommend">`
  - 含まない: `<h2>応募時の情報</h2>`・`<h2>面接者への申し送りコメント</h2>`・`<h2>面接者への申し送り（留意点）</h2>`・`<h2>面接で確認した情報</h2>`・`<h2>面接前に分かっている情報（未確認）</h2>`・`<h2>シフト貢献度</h2>`・`id="rtPrintSheet"`・`data-sec="contrib"`・`data-sec="handoff"`・`data-sec="pre"`・`data-sec="interview"`・`data-sec="comment"`
  - `ns` に `シフト貢献度`・`2軸` が無い
  - 並び: `<h2>応募者情報</h2>` < `<h2>面接チェックリスト</h2>` < `<h2>採用可否判定</h2>` < `id="clSheet"` < `<h2>応募者の管理</h2>`
  - 応募者情報の節（`<h2>応募者情報</h2>` から `<h2>面接チェックリスト</h2>` まで）に `2029年3月`・`短期求人`・`短期希望`・`可・2,500円`・`2026/10/10`・`笹川 晴央`・`電話の受け答えが丁寧。`
  - `(html.match(/<\/script>/g)||[]).length === (html.match(/<script[ >]/g)||[]).length`、`html.indexOf('if(!b)return;') < 0`
- 回答なし: `rec0 = S.buildRecord(scriptState({ checklist: (function () { const c = R.emptyChecklist(); c.header.date = '2026-10-10'; return c; })(), judgment: null, step: 1 }))` → `html0` に `class="view-report has-cl mode-script"`・`id="clPaper"`・`id="rtPrintChecklist"`・`採用可否判定は未実施です（アプリの「報告書」を開くと判定します）。`
- 詳細の記録は従来どおり: `htmlF = S.generateReportHTML(S.buildRecord(decisionState()), P())` に `<body class="view-report has-cl" data-filename=`・`<h2>面接者への申し送り（留意点）</h2>`・`<h2>シフト貢献度</h2>`・`id="rtPrintSheet"` があり `mode-script` が無い。`old = plain(S.buildRecord(decisionState())); delete old.mode;` → `<h2>シフト貢献度</h2>` を含む（旧レコード＝詳細）。`htmlF.indexOf('if(!b)return;') < 0`

**#77 checklistAuto・scriptApplicantRows・checklistSheetHtml（台本モード）**
- `aD = A({ workPeriod: 'short', sh: { sat: ['08:00', '11:00'] }, lateNight: { availability: 'ok', returnMethod: 'taxi', taxiFare: '2500' } }, PS())`
  - `au = R.checklistAuto(aD, R.emptyChecklist(), PS())` → `au.taxi.text === ''`・`Object.keys(au.fields).length === 0`・`Object.keys(au.must).length === 0`・`au.negatives.short.on === false`・`au.negatives.morningOnly.on === false`
  - `auF = R.checklistAuto(aD, R.emptyChecklist(), P())` → `auF.taxi.text === '可・2,500円（規定3,000円以内）'`・`auF.negatives.short.on === true`・`Object.keys(auF.must).length === 2`（詳細モードは従来どおり）
  - `clH = R.emptyChecklist(); clH.header.negatives.short = 'on'` → `plain(R.checklistAuto(aD, clH, PS()).negatives.short)` deepStrictEqual `{ autoOn: false, on: true, overridden: true, text: '短期希望' }`
- `evaluateHiring` は台本モードのプロファイルでも自動の見込みと照合: `aW = A({ sh: { mon: ['10:00', '12:00'] }, daysMin: '1', daysMax: '1' }, PS())`、`R.evaluateHiring(aW, {}, PS(), HO(aW, PS()), allChecks(HO(aW, PS())), Object.assign({}, OPTS, { checklist: clAll('good', 'hire', null, PS()) })).warnings` に `応募情報と食い違いがあります` を含む行
- rows: `st = scriptState()`、`rows = R.scriptApplicantRows(st.applicant, st.checklist, PS(), st.management)` → key が `['name','age','gender','category','graduation','posting','negatives','taxi','date','interviewer','notes']`、`age '20歳'`・`graduation '2029年3月'`・`posting '短期求人'`・`negatives '短期希望'`・`date '2026/10/10'`。担当が空なら押印から: `cl.header.interviewer = ''` → interviewer の value `'笹川 晴央'`。`R.scriptApplicantRows(A({}, PS()), R.emptyChecklist(), PS(), {})` → `[]`
- sheet（詳細モードの項目も入っている台本モードの記録＝詳細の記録を台本モードで保存し直した想定）: `rec2 = S.buildRecord(scriptState({ applicant: A({ name: '台本 花子', age: '20', category: '大学2年生', workPeriod: 'long', daysMin: '3', daysMax: '4', sh: { sat: ['10:00', '18:00'] }, reviewerNotes: '電話の受け答えが丁寧。' }, PS()) }))`、`sh = S.checklistSheetHtml(rec2, PS(), { mode: 'sheet' })`:
  - 含む: `<span class="cl-tile-k">面接評価（確認点）</span>`・`<span class="cl-tile-k">必須条件</span>`・`<span class="cl-tile-k">総合判断</span>`・`<span class="cl-tile-k">結果</span>`・`class="cl-judge"`・`可・2,500円`・`短期希望`・`短期求人`・`<span class="cl-ov-k">備考</span>`
  - 含まない: `シフト貢献度`・`（自動）`・`（応募情報より）`・`（手入力）`・`<b>希望シフト</b>`・`<b>勤務期間</b>`・`面接で確認した勤務条件`
  - section: `S.checklistSheetHtml(rec2, PS(), { mode: 'section' })` に `可・2,500円` があり `（手入力）`・`（自動）` が無い
  - 詳細の記録は従来どおり: `S.checklistSheetHtml(S.buildRecord(decisionState()), P(), { mode: 'sheet' })` に `<span class="cl-tile-k">シフト貢献度</span>`

単体は **83 件**（既存 77 ＋ 6）すべて緑。

### 7-2. e2e の既存部分への変更（期待値は変えない。「詳細モードにする」手順だけ足す）
ヘルパー（`fresh` を置き換え、2 つ追加）:
```js
// 詳細モード（既存 E1〜E31 の前提）で始める: localStorage を空にし、詳細モードの既定プロファイルを書き込んで 1 回だけ再読込
const fresh = async () => {
  await page.evaluate(() => { try { localStorage.clear(); const p = window.RecruitStorage.defaults(); p.mode = 'full'; localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); } catch (e) {} });
  await page.reload(); await wait(300);
};
// 台本モード（既定）で始める: localStorage を空にして再読込
const freshScript = async () => { await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await page.reload(); await wait(300); };
// 保存済みの設定を詳細モードにする（既に詳細なら何もしない）。旧プロファイルの取り込み・初期化の後に使う
const ensureFullMode = async () => {
  if (await st(() => window.RecruitApp.state.profile.mode) === 'full') return;
  await page.evaluate(() => { const S = window.RecruitStorage; const p = S.loadProfile(); p.mode = 'full'; S.saveProfile(p); });
  await page.reload(); await wait(300);
};
```
挿入場所（**この 6 か所だけ**。いずれも直前の操作で設定が台本モードになるため。5 だけ `toView('settings')` も足す）:
1. 冒頭 `await page.goto(FILE); await wait(300);` の直後（`shot('01-step1-empty.png')` の前）に `await ensureFullMode();`
2. 既存「設定」の `page.click('[data-action="reset"]')` → `expect(… '初期化で新宿既定に戻る')` の直後に `await ensureFullMode();`
3. E3 の `page.evaluate(() => { const p = window.RecruitStorage.defaults(); p.features.graduationDate = false; … saveProfile(p); })` → `reload` → `wait(300)` の直後に `await ensureFullMode();`
4. E9 の他劇場プロファイル読み込み後、`expect(stagesE9, …)` の後・`await toView('judge')` の前に `await ensureFullMode();`
5. E20 の他劇場プロファイル読み込み（`setInputFiles('#profileFileInput', …v1-profile-other.json)` → `await wait(400);`）の直後に `await ensureFullMode(); await toView('settings');`（台本モードの設定画面では `stageOptions.requireDaysMax` が閉じた「詳細モードの設定」の中にあり、続くクリックができないため。再読込で判定画面に戻るので設定画面を開き直す）
6. E29 の他劇場プロファイル読み込み → toast の expect → `await saveSettings();` の後・`await toView('judge')` の前に `await ensureFullMode();`

E9 の「旧プロファイルの移行 toast」（`includes('新しい形式に更新')`）は、移行の toast に運用モードの案内が足されても成立する（文言の追加のみ）。E7・E28 の読込 toast は詳細×詳細なので変わらない。

### 7-3. e2e E32〜E36（E31 の後・最後の `expect(errors.length === 0, 'ERRORS: '…)` の前。E30 の `SASA`・`newReportPage`・`shownIn`・`txtIn`・`dispIn`・`pdfPages30`・`pdfText30`、E25 の `saved25`・`r25` を使う）
ヘッダーのシナリオ一覧に「台本モード（docs/SPEC-script-mode.md 7-3）E32〜E36」を追記。ヘルパー（E32 の先頭）:
```js
const stepNav = () => page.$$eval('#stepNav li', els => els.map(e => [e.dataset.step, e.querySelector('.step-num').textContent, e.querySelector('.step-label').textContent]));
const stepLabels = () => page.$$eval('#stepNav .step-label', els => els.map(e => e.textContent));
const fillScript = async (o) => {
  await page.fill('[data-field="name"]', o.name);
  if (o.age) await page.fill('[data-field="age"]', String(o.age));
  if (o.gender) await page.selectOption('[data-field="gender"]', o.gender);
  if (o.category) await page.selectOption('[data-field="category"]', o.category);
  if (o.graduationDate) await page.fill('[data-field="graduationDate"]', o.graduationDate);
  if (o.posting) await setCl('header.posting', o.posting);
  for (const id of (o.negatives || [])) await page.click('label:has([data-cl="header.negatives.' + id + '"])');
  if (o.taxi) await page.fill('[data-cl="header.taxi"]', o.taxi);
  if (o.interviewer) await page.selectOption('[data-cl="header.interviewer"]', o.interviewer);
  if (o.notes) await page.fill('[data-field="reviewerNotes"]', o.notes);
  await wait(100);
};
```

**E32 台本モード（既定）・3 ステップ・Step① 応募者**（`console.log('\n== E32 台本モード（既定）: 3 ステップ・Step① 応募者 ==')`）
1. mode の無い保存済み設定: `localStorage.clear()` → `p = RecruitStorage.defaults(); delete p.mode;` を `recruit.profile.v1` に保存 → reload → `E32 mode の無い保存済みの設定は台本モードで開き、mode を書き込む（toast で案内）`: `state.profile.mode === 'script'`・toast に `台本モード`・`storedProfile().mode === 'script'`
2. `freshScript()` → `E32 既定（設定なし）は台本モード`: `state.profile.mode === 'script'` かつ `RecruitRules.isScriptMode(state.profile)`
3. `E32 サイドバーは 3 ステップ（応募者／面接チェックリスト／報告書）・見出し「報告書の作成」`: `stepNav()` が `[['1','1','応募者'],['3','2','面接チェックリスト'],['4','3','報告書']]`・`#stepSectionTitle` が `報告書の作成`
4. `E32 Step① に氏名（必須）・年齢・性別・区分・応募した求人・消極属性・タクシー可否・料金・面接日（今日）・面接担当者（名簿）・備考（面接者メモ）`: `#scriptApplicantCard`、`#scriptApplicantCard [data-field="name"][data-required]`、`[data-field="age"]`、`select[data-field="gender"]`、`select[data-field="category"]`、`#saPosting [data-action="cl-set"][data-cl="header.posting"]` が 2 個、`#saNegatives input[type="checkbox"][data-cl="header.negatives.short"]` と `…morningOnly`、`#saTaxi[data-cl="header.taxi"]`、`#saDate[data-cl="header.date"]` の value `2026-10-10`、`#saInterviewer` の option value に `笹川 晴央`、`textarea[data-field="reviewerNotes"]` の `.field` に `備考（面接者メモ）`
5. `E32 Step① に詳細項目（曜日・時間帯・週日数・勤務期間・通勤・かけもち・外国籍・繁忙期・深夜帯・オールナイト・申し送り）が無い`: 次がすべて存在しない `[data-field="workDays"]` `[data-field="anyDay"]` `[data-field="shifts.mon.start"]` `[data-field="daysMin"]` `[data-field="daysMax"]` `[data-field="workPeriod"]` `[data-field="commuteMethod"]` `[data-field="nearestStation"]` `[data-field="sideJob"]` `[data-field="foreign.isForeign"]` `[data-field="vacation.gw"]` `[data-field="lateNight.availability"]` `[data-field="allNight.availability"]` `#preFill` `#notesCard` `[data-action="generate-handoff"]`
6. 区分 `大学2年生` → `visible('#grp-graduation')`、`フリーター` → 非表示 → `E32 卒業予定年月は学生の区分のときだけ表示`
7. 氏名が空のまま `[data-action="script-next"]` → `E32 氏名が空なら面接チェックリストへ進めない`: `step() === 1`・toast に `必須`
8. `fillScript({ name: '台本 花子', age: 20, gender: '女性', category: '大学2年生', graduationDate: '2029-03', posting: 'short', negatives: ['short'], taxi: '可・2,500円', interviewer: '笹川 晴央', notes: '電話の受け答えが丁寧。' })` → `E32 Step① の入力は applicant と checklist.header に入る`: applicant の name / age(`'20'`) / gender / category / graduationDate / reviewerNotes、`checklist.header` の `posting 'short'`・`negatives.short 'on'`・`negatives.morningOnly` は空・`taxi '可・2,500円'`・`interviewer '笹川 晴央'`・`date '2026-10-10'`
9. `E32 右サマリー（台本モード）に氏名・属性・消極属性・求人・担当。貢献度・留意点・通勤は出さない`: `#summaryPanel` の text に `台本 花子`・`大学2年生`・`20歳`・`短期希望`・`短期求人`・`笹川 晴央` があり、`シフト貢献度`・`留意点`・`通勤` が無い
10. 390px → `E32 390px 幅の Step① で横スクロールなし`（`scrollWidth - innerWidth <= 1`）→ 1440px に戻す → `shot('40-script-step1.png', true)`
11. `[data-action="script-next"]` → `E32 「面接チェックリストへ進む」で面接チェックリスト（内部キー 3）へ`: `step() === 3`

**E33 台本モード: 面接チェックリスト → 報告書（判定）**
1. `E33 Step② は ①〜⑤ と総合判断だけ（「面接で確認する項目」・未確認の留意点は出さない）`: `#cl-conditions` `#cl-continuity` `#cl-job` `#cl-teamwork` `#cl-reverse` `#clOverall` があり、`#shiftConfirm` `#unresolvedAlert` `.cl-group-label` が無い
2. `E33 #clHeader の属性は Step① の入力から（読み取り専用・自動の表示なし）`: `#clHeader` の text に `大学2年生`・`20歳`・`短期希望`・`短期求人`・`笹川 晴央`・`2026/10/10`、`自動` を含まない、`#clHeader input, #clHeader select` が無い
3. `E33 必須条件・記入欄に応募情報からの自動表示（見込み・自動: …）を出さない`: `#stepContent .cl-auto, #stepContent .cl-auto-hint` の text がすべて空
4. `E33 戻る＝「← 応募者に戻る」・進む＝「報告書へ進む →」（申し送りへの導線なし）`: `#backToApplicant` の text `← 応募者に戻る`・`#toReportBtn` の text `報告書へ進む →`・`#stepContent [data-action="to-step"][data-step="2"]` が無い
5. `rateAll('good')` → `judge()` → `E33 必須条件すべて一致・確認点すべて○・総合判断「採用」→ 採用推奨（mode=script）`: `step() === 4`・`judgment()` の `mode 'script'`・`result 'recommend'`・adjustments 空
6. `E33 報告書の紙プレビュー: 判定サマリーは 面接評価（確認点）・必須条件・総合判断・結果（貢献度タイルなし）＋最終合否（未押印）`: `#appPaper .cl-sheet.cl-mode-sheet`、`#appPaper .cl-tile .cl-tile-k` の text 列が `['面接評価（確認点）','必須条件','総合判断','結果']`、`#appPaper .cl-judge` の text に `採用推奨` があり `シフト貢献度` が無い、`#appPaper .cl-decision.is-none#appPaperDecision`
7. `E33 報告書: 紙プレビュー → 押印（3 欄）→ 最終合否 → 「報告書を保存（HTML）」「A4 で印刷」`: top が `#appPaperWrap` < `#mgmtCard` < `#decisionCard`、`#mgmtCard .stamp-box` 3 個、`#reportSaveBtn` の text `💾 報告書を保存（HTML）`、`#reportPrintBtn` の text `🖨 A4 で印刷`
8. `E33 報告書ステップに 2軸判定・貢献度・応募情報サマリーを出さない`: `#stepContent` に `.result-card` `#clBreakdown` `.axis-grid` `#busyAllNightResult` `#applicantSummary` `#judgeWarnings` が無く、text に `シフト貢献度` が無い
9. `E33 Step① の面接担当者が押印欄「面接対応者」の初期選択`: `#mgmtCard .stamp-box[data-field-id="interviewer"] select` の value `'0'`
10. `navStep(3)` → `setCl('values.must_weekly', 'mismatch')` → `judge()` → `E33 必須条件を「不一致」にすると不採用推奨（紙の結果タイルも）`: `result 'reject'`・`adjustments[0] === 'must_conditions'`・`#appPaper .cl-tile-res` の text に `不採用推奨`
11. `navStep(3)` → `setCl('values.must_weekly', 'match')` → `setCl('overall', 'hold')` → `judge()` → `E33 総合判断「保留」→ 上長最終判断要`: `result 'review'`・adjustments 空
12. `navStep(3)` → `[data-action="cl-set"][data-cl="overall"][data-value="hold"]` をもう一度押して未入力に → `judge()` → `E33 総合判断が未入力でも報告書へ進め、上長最終判断要＋警告（#scriptWarnings）`: `result 'review'`・`state.checklist.overall === ''`・`#scriptWarnings` の text に `総合判断が未入力`
13. `navStep(3)` → `setCl('overall', 'hire')` → `judge()` → `E33 総合判断「採用」に戻すと採用推奨・警告なし`: `result 'recommend'`・`#scriptWarnings` が無い
14. `E33 右サマリーに必須条件・採点・総合判断・結果・押印状況`: `#sumResult` に `採用推奨`・`#sumMust` に `すべて一致`・`#sumMarks` に `○7`・`#sumOverall` に `採用`・`#sumStamps` に `面接対応者` → `shot('41-script-report.png', true)`

**E34 台本モード: 押印 → 保存 → 保存 HTML（報告書表示・詳細・最終合否）→ 読込**
1. `#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]` → `E34 「面接対応者」に押印（初期選択のまま押せる）`: その欄に `svg.hanko`・`state.management.interviewer.name === '笹川 晴央'`
2. `#decisionManager` で `SASA` → `#decisionCard [data-action="decide"][data-value="hire"]` → `#appPaper .cl-decision.is-hire svg.verdict-stamp` を確認 → `#decisionCard [data-action="undecide"]` → `#appPaper .cl-decision.is-none` を確認 → `#mgmtCard .stamp-box[data-field-id="final"] [data-action="unstamp"]`（自動押印を外す）→ `E34 アプリの最終合否で紙プレビューの合否欄も描き直す（採用 → 取消で未押印）`
3. `saved34 = await saveRecord('script-report.html')` → `E34 保存: record.mode=script・判定（mode=script）・body.view-report.has-cl.mode-script`: `rec.mode 'script'`・`rec.decision == null`・`rec.step === 4`・`rec.management.interviewer.name '笹川 晴央'`・`rec.checklist.header.taxi '可・2,500円'`・`rec.judgment.mode 'script'`・html に `<body class="view-report has-cl mode-script" data-filename="応募者_台本_花子_2026-10-10.html">`
4. `E34 保存 HTML は台本モードの節だけ（留意点・面接で確認した情報・シフト貢献度・申し送りの節と申し送りシートの印刷ボタンなし）`: html に `<h2>応募者情報</h2>` `<h2>面接チェックリスト</h2>` `<h2>採用可否判定</h2>` `<h2>応募者の管理</h2>` `id="rtPrintChecklist"` `id="rtPrintAll"` `id="clPaper"` `id="clSheet"` があり、`<h2>面接者への申し送り（留意点）</h2>` `<h2>シフト貢献度</h2>` `<h2>面接で確認した情報</h2>` `<h2>面接前に分かっている情報（未確認）</h2>` `<h2>応募時の情報</h2>` `<h2>面接者への申し送りコメント</h2>` `id="rtPrintSheet"` `data-sec="contrib"` `data-sec="handoff"` が無い
5. `rp34 = newReportPage(rp34Err)` → `goto('file://' + saved34.file)` → `E34 保存 HTML は報告書表示で開く（紙プレビュー・最終合否・押印。印刷用 #clSheet は非表示）`: body の class に `view-report` と `mode-script`・`shownIn('#clPaper .cl-sheet')`・`!shownIn('.rh')`・`shownIn('#decision')`・`shownIn('#mgmt')`・`dispIn('#clSheet') === 'none'`。続けて `E34 紙プレビューの判定サマリー（総合判断・結果。貢献度なし）`: `#clPaper .cl-judge` の text に `総合判断`・`採用推奨` があり `シフト貢献度` が無い
6. `#rtViewFull` → 4 つの expect:
   - `E34 「詳細」は ヘッダー・ダッシュ・応募者情報・面接チェックリスト・採用可否判定・応募者の管理 だけ`: 見える `section.sec` の data-sec が `['applicant','checklist','judgment','mgmt']`・`.rh` あり・`.dash` の text に `シフト貢献度`・`留意点` が無い
   - `E34 「応募者情報」は Step① の項目だけ`: `section.sec[data-sec="applicant"]` の text に `台本 花子` `20歳` `女性` `大学2年生` `2029年3月` `短期求人` `短期希望` `可・2,500円` `2026/10/10` `笹川 晴央` `電話の受け答えが丁寧。` があり `通勤`・`勤務期間` が無い
   - `E34 「採用可否判定」は台本モードの要約（必須条件・採点・総合判断・結果）`: `section.sec[data-sec="judgment"]` の text に `必須条件` `面接評価（確認点）` `総合判断` `採用推奨` があり `2軸`・`シフト貢献度` が無い
   - `E34 印刷ボタンは「面接チェックリスト報告（A4）」「レポート全体」`: `.rtool button[id^="rtPrint"]` の id 列が `['rtPrintChecklist','rtPrintAll']`
7. `#rtViewReport` → `#decision select` で `SASA` → `#decision [data-act="decide"][data-value="hire"]` → `E34 保存 HTML で「採用」→ 紙に採用スタンプ・最終確認に自動押印・ファイル名 _採用`: `#clPaper .cl-decision svg.verdict-stamp`・`#mgmt .stamp-box[data-field-id="final"] svg.hanko`・`data-filename === '応募者_台本_花子_2026-10-10_採用.html'`
8. `#mgmtSaveBtn` のダウンロードを `OUT/script-report-hire.html`（`file34b`）に保存 → `E34 押印を保存した再出力ファイルに decision（採用）・最終確認・mode=script`: `mode 'script'`・`decision.result 'hire'`・`management.final.name`・`management.interviewer.name` が `笹川 晴央`
9. `rp34.goto('file://' + file34b)` → **emulateMedia しないで** `rp34.pdf({ path: OUT/script-report.pdf, format: 'A4', preferCSSPageSize: true, printBackground: true })` → `E34 報告書表示のまま印刷すると面接チェックリスト報告（A4 2 ページ以内・貢献度なし）`: `pdfPages30` が -1 または 1〜2、`pdfText30` が null または `面接チェックリスト報告` を含み `シフト貢献度` を含まない。`E34 保存 HTML のページエラー・console error なし`: `rp34Err.length === 0` → `rp34.close()`
10. `#btnNew` → `setInputFiles('#fileInput', file34b)` → `E34 アプリで読み込むと台本モードの報告書（Step③）に合否・押印を引き継ぐ`: `step 4`・`#stepNav li` 3 個・`state.decision.result 'hire'`・`state.management.final.name '笹川 晴央'`・`#decisionCard svg.verdict-stamp`・`#appPaper .cl-decision svg.verdict-stamp`・`#sumDecision` に `採用・笹川`
11. `RecruitApp.prepareChecklistSheet(true)` → `emulateMedia({ media: 'print' })` → `page.pdf(OUT/script-report-app.pdf, A4)` → `emulateMedia({ media: null })` → `prepareChecklistSheet(false)` → `E34 アプリの A4 印刷（面接チェックリスト報告）も 2 ページ以内`（-1 または 1〜2）→ `shot('42-script-report-loaded.png', true)`

**E35 台本モード: 詳細モードの記録の読み込み・運用モードの切替・使い方**
1. `#btnNew` → `setInputFiles('#fileInput', saved25.file)` → `E35 詳細モードの記録を台本モードで読むと 3 ステップの報告書で表示（詳細項目は保持・toast）`: toast に `詳細モードで保存された記録です（表示されない項目も保持されます）`・`step 4`・`#stepNav li` 3 個・`state.applicant.workDays.length > 0`・`#stepContent` の text に `シフト貢献度` が無い
2. `saved35 = saveRecord('script-from-full.html')` → `E35 台本モードで保存し直しても応募情報の詳細・留意点のチェックは保持（mode=script）`: `rec.mode 'script'`・`JSON.stringify(rec.applicant.workDays) === JSON.stringify(r25.applicant.workDays)`・`shifts` も同様・`Object.keys(rec.handoff.checks).length === Object.keys(r25.handoff.checks).length`
3. `toView('settings')` → `E35 設定の先頭に「運用モード」（台本）・詳細モードの節は「詳細モードの設定」に畳む（台本・押印・劇場情報・区分・書き出しは常に表示）`: `#view-settings .settings-body > section.card` の最初が `s-mode`・`[data-bind="mode"]:checked` の value `script`・`details.settings-advanced` があり `open === false`・その中に `#s-features #s-stages #s-options #s-busy #s-params #s-hs #s-rules #s-contrib #s-matrix #s-texts`・`#s-mode #s-meta #s-applicant #s-checklist #s-texts-script #s-mgmt #s-io` は存在して details の外・`#s-applicant [data-bind="options.categories"]` がある
4. `label:has([data-bind="mode"][value="full"])` → `E35 詳細モードを選ぶと設定の節を畳まずに表示`（`details.settings-advanced` が無い）→ `saveSettings()` → toast を取得 → `toView('judge')` → `E35 詳細モードに切り替えると 4 ステップ・Step1（詳細の応募情報）に戻る`: `stepLabels()` が `['応募情報','面接者への申し送り','面接チェックリスト','採用可否判定']`・`step() === 1`・`[data-field="workDays"]` がある・`storedProfile().mode === 'full'`・toast に `詳細モード`
5. `toView('settings')` → `label:has([data-bind="mode"][value="script"])` → `saveSettings()` → `toView('judge')` → `E35 台本モードに戻すと 3 ステップ・Step① 応募者`: `stepLabels()` が `['応募者','面接チェックリスト','報告書']`・`step() === 1`・`#scriptApplicantCard`・`storedProfile().mode === 'script'`
6. `toView('help')` → `E35 使い方は台本モード向け（3 ステップ・報告書 HTML の往復・詳細モードは末尾）`: `#view-help .help-step` 3 個・text に `応募者` `面接チェックリスト` `報告書` `最終合否` `詳細モード`・`2軸（マトリクス）` が無い → `toView('judge')`

**E36 台本モードの記録を詳細モードで読む・ダークモード・390px**
1. 設定で詳細モードにして保存 → `toView('judge')` → `#btnNew` → `setInputFiles('#fileInput', file34b)` → `E36 台本モードの記録も詳細モードで読める（詳細項目は空・合否は保持）`: `#stepNav li` 4 個・`applicant.name '台本 花子'`・`applicant.workDays.length === 0`・`step 4`・`decision.result 'hire'`・toast に `台本モードで保存された記録です`
2. 設定で台本モードに戻して保存 → `toView('judge')` → `#btnNew` → `file34b` を読み込み（step 4）
3. `#btnTheme`（ダーク）→ `E36 ダークモードでも報告書の紙プレビューは白地・黒字`: `html[data-theme] === 'dark'`・`#appPaper` の backgroundColor `rgb(255, 255, 255)`・`#appPaper .cl-sheet` の color `rgb(17, 17, 17)` → `shot('43-script-report-dark.png', true)` → `#btnTheme` で戻す
4. 390px: `#appPaperWrap` の `scrollWidth > clientWidth` と全体 `scrollWidth - innerWidth <= 1` → `st(() => window.RecruitApp.goStep(3))` → 全体 ≤ 1 → `st(() => window.RecruitApp.goStep(1))` → 全体 ≤ 1 → `E36 390px 幅で横スクロールなし（報告書は紙だけ横スクロール・面接チェックリスト・応募者も）` → `shot('44-script-narrow.png', true)` → 1440px に戻す
（最後の既存チェック `ERRORS` が console error 0 を確認する）

### 7-4. 完了条件
- `node tests/rules.test.js` → **83 passed, 0 failed**
- `node build.js` → `dist/toho-recruit-judge.html` を更新
- `node tests/e2e.js` → **ALL PASSED**（E1〜E36）
- `git diff HEAD -- tests/e2e.js` の既存部分の差分は 7-2 の `fresh` / `freshScript` / `ensureFullMode` の定義と 6 か所の `await ensureFullMode();`（E20 は `toView('settings')` も）だけ（expect の削除・緩和なし）。`tests/rules.test.js` の既存部分の差分は `P` / `PS` の定義だけ

---

## 8. 実装手順（この順で）
1. `src/config.default.js`: `mode: 'script'`（1-1）、`texts.script`（1-4）
2. `src/rules.js`: `isScriptMode` / `isScriptRecord` / `OVERALL_RESULT` / `DEFAULT_SCRIPT_TEXTS` / `scriptApplicantRows` / `evaluateScript`、`checklistAuto` の台本分岐、`evaluateHiring` の `checklistAuto` 呼び出し、export（1-3）
3. `src/storage.js`: `normalizeProfile`（mode・modeAdded）、`validateProfile`、`buildRecord`（mode）、`checklistSheetHtml`（3-6）、`generateReportHTML`（3-2〜3-5・3-8）、埋め込みスクリプト 1 の修正（3-7）
4. `tests/rules.test.js`: `P` / `PS` → `node tests/rules.test.js` で既存 77 件が緑 → #72〜#77 を追加して 83 件緑
5. `src/index.html`: `#stepSectionTitle`・meta description（10 章）
6. `src/app.js`（2 章・5 章・6 章）→ `src/styles.css`（2-7）→ `src/settings.js`（4 章）
7. `node build.js`
8. `tests/e2e.js`: 7-2（既存への手順追加）→ `node tests/e2e.js` で E1〜E31 が緑のまま → E32〜E36 を追加 → ALL PASSED
9. ドキュメント（10 章）

## 9. 落とし穴
- **build.js**: src の JS に文字列 `</script`（コメント内も）や `<!--<script>` を書かない。保存 HTML の閉じタグは `SCRIPT_END` だけ
- **内部ステップキー（Y1）**: 台本モードでも `state.step` は 1 / 3 / 4。表示を 1/2/3 にしたくて `state.step` を振り直すと、`updateChecklistUI`（`state.step !== 3`）・`onFieldEvent`・`saveRecord`（`state.step === 4`）・`record.step`・`applyRecord` が全部ずれる。表示は `STEPS_SCRIPT[i].no` だけで変える。e2e の `navStep(3)` は台本モードでも面接チェックリスト
- **fresh() と mode**: `S.defaults()` は台本モード。localStorage が空のアプリも台本モード。既存 e2e は詳細モード前提なので 7-2 のとおり `fresh()` が詳細のプロファイルを書き込む。`resetProfile`・旧プロファイル JSON の読み込み・`defaults()` を直接保存するテスト（E3）の後は `ensureFullMode()`
- **checklistAuto は詳細入力に依存**: 台本モードで自動を出すと「未確認」「要確認・満たさない見込み」「（応募情報より）」が並ぶ。台本は 1-3-3 で手動のみ。ただし `evaluateHiring` は `mode: 'full'` を渡して自動ありのまま（単体 #58 などの「応募情報との食い違い」警告を消さない）
- **分岐の基準（Y2）**: 保存 HTML・A4 シートは `record.mode`、アプリは `profile.mode`。`checklistSheetHtml` は `prof` に `mode` を明示して渡す（詳細の記録を台本モードのアプリが描いても自動の表示が変わらないように）
- **埋め込みスクリプト 1 の `if(!b)return;`**（3-7）を消し忘れると、台本モードの保存 HTML で「報告書／詳細」の切替・Ctrl+P の報告・`__prepareChecklistSheet` が動かない（E34 で落ちる）
- **has-cl**: 台本モードの記録は回答なしでも `has-cl`（報告書表示の CSS が `has-cl` で紙を出す）。詳細の記録は従来どおり回答ありのときだけ（単体 #71 の `<body class="view-report" data-filename=`）
- **id の重複**: アプリの紙は `appPaperDecision` / `vdAppPaper`、印刷ホスト `#clSheet` は `clDecision` / `vdSheet`、`#decisionCard` は `vdApp`。紙に押印欄を描かない（`stamps: ''`）＝既存のハンコ数え上げに混ざらない
- **留意点を作り直さない（Y6）**: 台本モードで `rebuildHandoff` を呼ぶと「内容が変わった留意点のチェックを外しました」の toast や handoffChecks の削除が起きる。`goStep`・`renderStep`・`saveRecord` の 3 か所で `!isScript()` を条件に足す。`applyRecord` は従来どおり作る
- **`judge` アクション**: 台本モードでは検証しない（`validateChecklist` が確認点・総合判断の未入力で止めるため）。詳細モードの動きは変えない
- **`cl-set` と Step①**: `updateChecklistUI` は step 3 以外では何もしないので、Step① の「応募した求人」ボタンの `.active` は `syncClButtons(path)` で更新する
- **消極属性のチェック**: `data-cl-on` が無いと `clSet` が `true` / `false` を入れてしまう（`checklistAuto` が `'on'` しか該当と見ない）
- **設定の data-bind の重複（Y13）**: 台本モードで `texts.*.title`・`texts.disclaimer`・`options.categories`・`options.genders`・`features.graduationDate` を表示側と折りたたみ側の両方に描かない
- **toast の上書き**: 設定保存の toast の後に `doSave` が警告つきの toast を出すことがある（既定の設定では警告なし）。E35 は `saveSettings()` の直後に toast を読む
- **単体の `P()`**: `S.defaults()` のまま（台本モード）で既存テストを走らせると、`buildRecord` が `mode: 'script'` を書き、保存 HTML の章のテスト（#52・#53・#66・#71）が落ちる。7-1 のとおり `P()` を詳細に
- **公開リポジトリ**: 名簿・テスト・ドキュメントに笹川 晴央以外の実名を書かない

---

## 10. ドキュメント（M12）
- `docs/SPEC-script-mode.md`: 本書。実装で変えた点は末尾に「11. 実装時の差分」として追記する
- `docs/HANDOFF.md`:
  - 表題を「引き継ぎメモ — フェーズ6（台本モード・既定）完了時点」に。冒頭の箇条に「**フェーズ6: 台本モード（既定）を実装済み**。詳細仕様は `docs/SPEC-script-mode.md`（確定版）。副支配人の要望「応募者の名前と属性入れたらもう渡した面接台本のとおりの報告でいい」への対応。従来の 4 ステップは詳細モードとして残した（12 章）」。1-4 のテスト件数（単体 83 件・e2e E1〜E36）
  - 2 章の表に行を追加: `| H. 台本モード（フェーズ6） | 既定は 3 ステップ（① 応募者〔氏名と属性・台本のヘッダー〕→ ② 面接チェックリスト〔台本 2026-10-08 版の ①〜⑤〕→ ③ 報告書〔A4 プレビュー・電子印・最終合否・保存 HTML／印刷〕）。面接前の詳細入力・留意点・面接で確認する項目・シフト貢献度・2 軸判定は台本モードでは一切表示しない。消さずに「詳細モード」として残し、設定の先頭「運用モード」で切り替える。mode の無い設定・プロファイルは台本モード。印鑑部分（電子印・最終合否・報告書 HTML の往復）はそのまま |`
  - 末尾に「## 12. 台本モード（既定）— 追加分（フェーズ6。詳細は `docs/SPEC-script-mode.md`）」: 12-1 運用フロー（本書冒頭）、12-2 決定事項（S1〜S3・Y1〜Y14 の要約。特に Y1 内部キー 1/3/4、Y2 分岐の基準、Y3 自動なし、Y4 判定の規則、Y5 has-cl）、12-3 触る場所（rules.js `isScriptMode` / `isScriptRecord` / `scriptApplicantRows` / `evaluateScript` / `checklistAuto`、storage.js `normalizeProfile`・`validateProfile`・`buildRecord`・`checklistSheetHtml`・`generateReportHTML`・埋め込みスクリプト 1、app.js `STEPS_SCRIPT`・`scriptApplicantStepHtml`・`scriptClHeaderHtml`・`reportStepHtml`・`scriptSummaryHtml`・`scriptHelpHtml`・`applyRecord`、settings.js `s-mode`・`s-applicant`・`s-texts-script`・`#s-advanced`、config.default.js `mode`・`texts.script`、styles.css「台本モード」）、12-4 テスト（#72〜#77、E32〜E36、既存への変更＝`P()` と `fresh` / `ensureFullMode` の 6 か所、実測ページ数）、12-5 既知の制限（旧形式 v1 の 10 項目×5 点の記録は台本モードの判定に使わない〔Step② に参考表示〕／台本モードで保存し直した詳細の記録は保存 HTML に詳細項目を出さない〔データは残る〕／名簿にない面接担当者は Step① で選べない〔設定の名簿に追加する。押印欄では従来どおり手入力可〕）
- `README.md`: 台本モード中心に書き直す。並び: 概要（「応募者の名前と属性を入れたら、面接台本のとおりの報告書を作るアプリ」）→ 使い方（配布）＝ 3 ステップ → 報告書（HTML）と最終合否（フェーズ5の往復フロー）→ 印刷（A4 面接チェックリスト報告 1〜2 枚）→ 設定（運用モード・面接チェックリスト・応募者の管理・書き出し）→ 開発（build・テスト件数）→ 設計方針 → **詳細モード（他劇場向け）**（末尾。従来の「新宿の運用ルール」「判定モデル」の内容を短く要約して移す）
- `src/index.html` の meta description: `アルバイト面接を面接台本（スタッフ面接チェックリスト）のとおりに入力し、A4 の面接チェックリスト報告（電子印・最終合否つき）を作るアプリ。応募者の名前と属性 → 面接チェックリスト → 報告書の 3 ステップ。設定で詳細モード（留意点の申し送り・シフト貢献度の 2 軸判定）にも切り替えられます。`

---

## 11. 実装時の差分（実装者が記録。2026-10-13）

実装は本書どおり。結果: 単体 `node tests/rules.test.js` 83 passed / 0 failed、`node tests/e2e.js` ALL PASSED（469 件。既存 418 件＋E32〜E36 の 51 件）、台本モードの保存 HTML を報告書表示のまま印刷した `tests/shots/script-report.pdf` は 2 ページ、アプリの A4 印刷 `script-report-app.pdf` も 2 ページ（pdfinfo）。本書から変えた点・補った点は次のとおり。

### 11-1. テストの文言（本書の expect が実装と両立しなかったもの）
- **#76・E34 の「`data-sec="handoff"` などを含まない」**: `reportCss()` の報告書表示の規則（`section.sec:not([data-sec="pre"]):not([data-sec="comment"]):not([data-sec="handoff"]):not([data-sec="interview"])…`）と埋め込みスクリプト 1 の `prep()`（`section.sec[data-sec="handoff"]`）に同じ文字列があり、3-9「CSS は変えない」と両立しない。節を生成しないことを `'<section class="sec" data-sec="' + k + '"'` の形で調べるようにした（contrib / handoff / pre / interview / comment）。`<h2>…</h2>` の不在の確認はそのまま
- **#76 の「`html.indexOf('if(!b)return;') < 0`」**: 押印の埋め込みスクリプト（スクリプト 2）のクリック処理 2 か所にも `var b=ev.target.closest("[data-act]");if(!b)return;` があり、常に失敗する。スクリプト 1 の並び `'getElementById("rtPrintAll");if(!b)return;'` が無いことと、`'if(b)b.addEventListener("click"'` があることで調べるようにした（詳細の記録 `htmlF` も同じ）
- **スクリーンショットの名前**: オーケストレータの指定（`40-script-step1.png` `41-script-step2.png` `42-script-step3.png` `43-script-step3-dark.png` `44-script-report.png` `45-script-report-full.png`）に合わせた。本書 7-3 の `41-script-report.png`→`42-script-step3.png`、`42-script-report-loaded.png`→`46-script-report-loaded.png`、`43-script-report-dark.png`→`43-script-step3-dark.png`、`44-script-narrow.png`→`47-script-narrow.png`。②の画面（`41-script-step2.png`）・保存 HTML の報告書表示（`44`）・詳細（`45`）を追加。アプリの画面は先頭までスクロールし toast を隠してから撮る（`sshot`。sticky のサイドバー・目次が全体撮影で途中に写るため）

### 11-2. 本書に無かった細部（補ったもの）
- `legacyBannerHtml()`（旧形式 v1 の記録のバナー）: 台本モードではシフト貢献度の文を出さず、ボタンを「面接チェックリストを入力する」にした（S2。詳細モードは不変）
- `onFieldEvent`: 区分の変更で Step1 を描き直す条件（`continueKey() !== state.continueAt`）に `!isScript()` を足した（台本モードの Step① では `continueAt` を更新しないため、毎回描き直しになるのを防ぐ）
- `scriptApplicantRows`: 応募した求人の表示名が空なら値を出す。`evaluateScript` は applicant / profile がオブジェクトでなくても動く
- 右サマリー `#sumMust`: 必須条件の項目が台本に無いときは「—」。保存 HTML のヘッダー `.verdict` の副文・ダッシュの必須条件は、項目が無いとき「なし」
- `checklistSheetHtml`（台本の記録）の総合判断タイル: 値は `j.overall`（無ければ `j.checklist.overall`、それも無ければ現在の回答）
- `generateReportHTML`: 詳細モード・旧レコードの本文（申し送りシートのボタン〜「応募者の管理」）を関数 `fullBodyHtml()` に移した（中身は 1 文字も変えていない。単体 #52〜#71・e2e E1〜E31 で確認）
- 設定画面: `#clCapsScriptHint`（4-3 の hint の id）、`#modeChangeNote` は保存済みの mode と違うときだけ。`advOpen` は詳細↔台本の描き直しでも保持
- styles.css: 本書 2-7 に加えて `.cl-attr` の `max-width:100%; overflow-wrap:anywhere`（390px で長い値がはみ出さない）、右サマリーの押印状況 `.sum-stamps`・`#sumStamps .sum-label { white-space: nowrap }`
- docs: README を台本モード中心に書き直し、HANDOFF に 12 章と 2 章の H 行、1 章冒頭に「1〜11 章は詳細モードの記述」の注記

### 11-3. 未実装・残った点
- なし（M1〜M13・本書 1〜10 章はすべて実装・テスト済み）。12-5（HANDOFF）の既知の制限を参照

### 11-4. レビュー後の修正（F1〜F10。2026-10-13）
オーケストレータのレビュー（F1〜F10）を受けて直した点。詳細モードの画面・判定・保存 HTML・印刷は変えていない（F3 の 2 つの文言だけ両モード共通）。

| # | 内容 | 場所 |
| --- | --- | --- |
| F1 | ③ を開かずに保存・A4 印刷しても結果が入る。台本モードで `state.judgment` が無い（または `judgmentStale`・`mode !== 'script'`）ときは `R.evaluateScript` を走らせて `state.judgment` に入れてから保存／印刷する（チェックリストが未入力でも走らせる。副作用は `state.judgment`・`judgmentStale` だけ。③ を開くと `goStep(4)` が同じ入力で判定し直すので同じ結果）。印刷はトップバー 🖨・② の「🖨 面接チェックリスト報告（A4）」・③ の「🖨 A4 で印刷」・beforeprint（Ctrl+P）のすべてが `prepareChecklistSheet(true)` を通るので、そこで判定する（詳細モードは従来どおり判定を勝手に走らせない）。帰結として、③ より前に保存した台本モードの記録（判定が入る）は読み込むと保存したステップ（回答があれば ②、無ければ ①）から再開する（従来の「続きから再開」を保つ） | app.js `ensureScriptJudgment()`（新規）・`saveRecord`・`prepareChecklistSheet`・`applyRecord` |
| F2 | 設定「面接チェックリスト」節（台本モードで常時表示）から詳細モード専用のものを外した。(a) `evaluation.holdOnUnresolvedBlock`・`holdOnHighschoolException` は台本モードでは `#s-advanced` の新しい節 `#s-checklist-full`「採用可否判定の調整（詳細モード）」に描く（詳細モードは従来の位置）。(b) 必須条件・記入欄の「自動表示」（`.auto`）の選択とその設定値（週の日数・繁忙期・初回契約終了）、消極属性の「自動判定」、「朝～12時のみ」の判定の終了時刻、「応募情報から自動表示し、Step3 で上書きできます」は台本モードでは出さない（値は保持。消極属性の見出しは「消極属性（Step① でチェックします）」、行は名前と削除だけ＝styles.css `.s-cl-neg.s-cl-neg-plain`）。(c) 台本モードの帯（報告書の「面接評価（確認点）」の 高・中・低）は `evaluation.thresholds`（`evaluateScript`・`interviewModel`）を使うので、台本モードでは境界の入力 `#clBandInputs`（「面接評価の帯: 高／中」）を同じ節に出し、「2軸判定」の節にはその入力の代わりに `#mxBandNote` を出す（同じ data-bind は 1 回だけ）。説明文は「面接評価の帯（高・中・低）の境界もこの節で設定します。」 | settings.js `checklistHtml(o)`・`clItemHtml`（`draftScript()`）・`clFullJudgeChecksHtml` / `checklistFullHtml`（新規）・`matrixHtml(o)`・`scriptTemplate` |
| F3 | 初期対応者の説明を「応募受付を行った担当者」に（config.default.js・設定の placeholder。保存済みの設定に旧既定の「応募受付・申し送りを行った担当者」がそのまま残っていれば `normalizeProfile` で置き換える。書き換えた説明はそのまま）。設定の「Step3」「Step4」は `stepRef(n)`（台本モード: Step①②③、詳細モード: Step1〜4）で「説明（Step② に表示）」「Step② の説明文」「Step③ に「採用」「不採用」のボタン」に。書き出し／読み込みの注記は「新しい設定項目が既定値で補われます」（両モード共通） | config.default.js、settings.js `stepRef`・`mgmtHtml`・`decisionSettingsHtml`・`ioHtml`、storage.js `normalizeProfile` |
| F4 | 台本モードの画面名: ナビ `.nav-item[data-view=judge]` は「報告書の作成」（index.html の文字を `#navJudgeLabel` に）、トップバー `#topTitle` は「面接チェックリスト報告」、サイドバー `#stepSectionTitle` は「手順」（本書 2-1 の「報告書の作成」から変更）。詳細モードは従来の「応募者判定」「判定ステップ」。運用モードを切り替えると設定画面のままナビも変わる（`renderBrand` から `renderModeLabels`） | app.js `judgeViewTitle`・`renderModeLabels`（新規）・`renderBrand`・`showView`・`renderStepNav`、index.html |
| F5 | ③ の右サマリーの「結果」は `state.judgment` が台本モードの判定ならそれを、無いときだけ入力中の内容で評価（`checklistHasInput` で分岐）。保存時の「（総合判断が未入力です）」はチェックリストの回答の有無に関係なく総合判断が空なら出す（保存は止めない） | app.js `scriptSummaryHtml`・`saveRecord` |
| F6 | 保存 HTML（台本モード）の「採用可否判定」節の見出し: `adjustments` に `must_conditions` があれば from / to に関係なく「必須条件の不一致により「{title}」に固定」、総合判断が未入力なら「（総合判断は未入力）」を添える（総合判断「採用」＋不一致が「総合判断による結果「採用推奨」から「不採用推奨」に調整」と出ていたのを直した） | storage.js `generateReportHTML`（台本の記録） |
| F7 | 設定ナビの「詳細モードの設定」は畳み `details#s-advanced` を開いてから移動する（既定のアンカー移動はそのまま） | settings.js `onClick` |
| F8 | e2e E37 を追加（下記） | tests/e2e.js |
| F9 | README の印刷の節に制限を 1 行（旧形式〔10 項目×5 点〕の記録・判定画面以外の Ctrl+P は画面全体の印刷） | README.md |
| F10 | e2e の PDF ページ数・本文の確認は共通の `pdfPagesOf` / `pdfTextOf` に寄せ、pdfinfo / pdftotext が無いときは `SKIP …` を出す（-1 / null の許容は残す）。本環境（/usr/bin/pdfinfo・pdftotext あり）では SKIP は出ない | tests/e2e.js |

テスト（追加のみ。既存の期待値は変えていない。E32 の `#stepSectionTitle` だけ F4 の文言「手順」に合わせた）:
- 単体 #78: 台本モードの「採用可否判定」節の見出し（採用＋不一致・打ち切り〔総合判断未入力〕・不採用＋不一致・`mustFailResult = review`・総合判断の上限は従来どおり「調整」・調整なし）、初期対応者の説明（既定・旧既定の置き換え・書き換えた説明は残す）
- e2e: 冒頭（詳細モードの画面名）、E32（台本モードの画面名）、E35（台本モードの「面接チェックリスト」節＝詳細モード専用の設定・自動表示・Step3/Step4・2軸判定の文言なし・帯の境界・data-bind の重複なし・押印／書き出しの文言・初期対応者の説明、「詳細モードの設定」リンクで開いて移動、詳細モードの節は従来どおり、詳細モードの画面名）、E37（② から保存 → 記録に判定・保存 HTML の紙の結果タイル・「詳細」の採用可否判定／ヘッダー／ダッシュに結果〔「未実施」なし〕→ ③ を開いても同じ判定 → 読み込むと ② から再開 → beforeprint / afterprint・トップバー 🖨・② の印刷ボタン〔window.print のスタブで body.print-checklist と A4 報告の結果タイルを確認。いずれも判定が無い状態から〕→ 総合判断未入力で保存すると警告・① だけで保存しても警告）
- 結果: 単体 `node tests/rules.test.js` 84 passed / 0 failed、`node tests/e2e.js` ALL PASSED（491 件）、`script-report.pdf` 2 ページ・`script-report-app.pdf` 2 ページ（pdfinfo）

---

## 12. 入力の簡素化（消極属性の削除）（2026-10-13）

根拠: 副支配人「消極属性って意味がわからないから削除でいいかも。ほか、入力が多いのでもう少し端的にできたらお願い」。意図は、台本モードで面接者が入力する項目と手数を減らし、画面を簡潔にすること。オーケストレータの決定 N1〜N8 を実装した。

### 12-1. 消極属性の全面削除（N1。台本モード・詳細モードとも）
| 場所 | 変更 |
| --- | --- |
| config.default.js | `checklist.header.negatives`（短期希望・朝～12時のみ）と `morningOnlyEnd` を削除。`header` は `posting`・`interviewerField` だけ |
| rules.js | `CHECKLIST_AUTO.negatives`（`shortTerm`・`morningOnly`）を削除。`emptyChecklist().header` は `{ date, interviewer, posting, taxi }`。`checklistAuto` の戻り値から `negatives` を削除（台本モードは `{ taxi: { text: '', tone: 'muted' }, fields: {}, must: {} }`）。`checklistSummary().header` から `negatives` を削除。`scriptApplicantRows` から `negatives` の行を削除（並びは name・age・gender・category・graduation・posting・taxi・date・interviewer・notes） |
| storage.js | `normalizeChecklistDef` は `header.negatives`・`header.morningOnlyEnd` を**外す**（旧い設定・記録の台本に残っていても。冪等）。`validateProfile` の「朝～12時のみ」の終了時刻のエラーを削除（使わなくなった `isHHMM` も削除）。`checklistSheetHtml` のヘッダーの消極属性チップ、`generateReportHTML`（台本の記録）の `.rh` のチップの消極属性を削除 |
| settings.js | s-checklist「ヘッダー」の消極属性の行（名前・自動判定・削除・「＋ 消極属性を追加」）、「朝～12時のみ」の終了時刻、`cl-neg-add` / `cl-neg-del` を削除。「ヘッダー」は「担当と連動する押印欄」と「応募した求人」の見出し・選択肢の表示名だけ |
| app.js | Step① の `#saNegatives`、`data-cl-on`（チェック → 'on'）の処理、`ensureChecklist` の `header.negatives = {}`、詳細モードの `clHeaderHtml` の「消極属性」（自動／該当／該当しない・`#clNeg-*`）と `updateChecklistUI` のバッジ、右サマリーの消極属性のチップ、使い方の文言 |
| styles.css | `.cl-negs`・`.cl-neg-row`・`.cl-neg-label`・`.s-cl-neg`・`.s-cl-neg-plain`・`.cl-attr[data-attr="negatives"]` を削除 |

**データ互換**: 旧レコードの `checklist.header.negatives` は読み込んでもエラーにせず**そのまま保持**する（表示・判定・報告には使わない＝読み飛ばす）。旧レコードの `checklistDef.header.negatives` は正規化で外れる。保存 HTML の埋め込み記録（JSON）には旧データが残り得るが、表示部分には出さない。判定（`evaluateScript`・`evaluateHiring`）は従来から消極属性を使っていないので結果は変わらない。

### 12-2. Step① 応募者（N2）`scriptApplicantStepHtml()`
1 枚のカード・3 行。説明文はカード冒頭の 1 行だけ。各入力の下の補足文（名簿の案内など）は出さず、必要なものは `title` 属性に残す。`<h3 class="sub">面接の情報（台本のヘッダー）</h3>` は削除。
```html
<div class="card" id="scriptApplicantCard">
  <div class="card-head"><h2>応募者</h2><p>氏名だけ必須です。あとは分かる範囲で入力してください。</p></div>
  <div class="field-row sa-row sa-row1">   <!-- flex。学生の区分のときだけ末尾に卒業予定年月 -->
    {fInput('name','氏名',{required})}{fInput('age','年齢',{type:'number',suffix:'歳'})}{fSelect('gender','性別',{placeholder:'選択'})}{fSelect('category','区分')}
    {fInput('graduationDate','卒業予定年月',{type:'month',id:'grp-graduation'})}
  </div>
  <div class="field-row cols-3 sa-row sa-row2">
    <div class="field"><label for="saDate">面接日</label><input type="date" id="saDate" data-cl="header.date"></div>   <!-- 既定は今日 -->
    <div class="field"><label for="saInterviewer">面接担当者</label><select id="saInterviewer" data-cl="header.interviewer" title="名簿は設定の「応募者の管理（押印）」で編集します。報告書の押印欄「面接対応者」の初期選択になります。">…</select></div>
    <div class="field" id="saPosting"><label>応募した求人</label>{clSegHtml('header.posting', 「通常」「短期」)}</div>
  </div>
  <div class="field-row sa-row sa-row3">
    <div class="field"><label for="saTaxi">タクシー可否・料金</label><input type="text" id="saTaxi" data-cl="header.taxi" placeholder="例: 可・2,500円"></div>
    {fTextarea('reviewerNotes','メモ（任意）',{rows:2})}
  </div>
</div>
<div class="actions end"><button … id="saNext" data-action="script-next">面接チェックリストへ進む →</button></div>
```
- 求人のボタンの文字は選択肢の表示名から末尾の「求人」を省いたもの（既定「通常」「短期」。`title` に元の表示名）。報告書・右サマリー・② のヘッダーは表示名のまま（「短期求人」）
- 既存の data-field 名・id（`name`・`age`・`gender`・`category`・`graduationDate`・`reviewerNotes`・`#grp-graduation`・`#saPosting`・`#saTaxi`・`#saDate`・`#saInterviewer`・`#saNext`）とレコードのキーは変えない
- CSS（styles.css「台本モード」）: 1 行目 `.sa-row1` は flex（氏名 1.3・年齢 .55・性別 .8・区分 1.1・卒業予定 1.25 の比、各 min-width。性別は 116px＝最長の「回答しない」が ▼ と重ならない幅、未選択の文言は「選択」。年齢の増減ボタンは出さない）。狭くて入らないときだけ卒業予定年月が次の行へ回る。840px 以下は 1 列。3 行目は タクシー 1：メモ 1.4
- 実測（e2e E32）: 1440×900・1280×800 とも `#saNext` の下端 454px（スクロールなし）。1440px では卒業予定年月も 1 行目。390px は 1 列・横スクロールなし

### 12-3. 判定・自動表示
変更なし（消極属性は判定に使っていなかった）。詳細モードの自動表示はタクシー・記入欄・必須条件の見込みだけになった（`checklistAuto` の `negatives` 削除）。

### 12-4. Step② ヘッダー（N4。台本モード）`scriptClHeaderHtml()`
1 行に圧縮。台本の題名・版・説明文（intro）・目安時間（`#clMinutesTotal`）は出さない（詳細モードの `clHeaderHtml` は従来どおり）。
```html
<div class="card cl-head-line" id="clHeader"><div class="cl-head-attrs" id="clHeaderAttrs">
  <span class="cl-attr cl-attr-name" data-attr="name">{氏名}<small>さん</small></span>
  {category・age・posting・taxi・date・interviewer の順: <span class="cl-attr" data-attr="{key}" title="{label}">[<small>タクシー|担当</small>]{value}</span>}
  <button type="button" class="btn sm ghost cl-head-edit" data-action="to-step" data-step="1">応募者を編集</button>
</div></div>
```
区分・年齢・求人・面接日（日付）は値だけで分かるのでラベルを付けない（`title` に項目名）。「応募者を編集」はリンクの見た目（枠なし・右寄せ）。1440px で 1 行（高さ 46px）。
本文が狭い幅（`@media screen and (max-width: 1400px)`。1280px で本文 約 640px）ではチップを一段詰め（余白 2px 6px・12px・間隔 3px）、「応募者を編集」はカード上端の枠線上・右（`position: absolute; top: -9px; right: 12px`、背景はカードと同じ）に出してチップの行から外す → 1366px・1280px でもチップは 1 行（高さ 45px）。390px などさらに狭い画面ではチップが折り返す。印刷には影響しない（screen のみ）。

### 12-5. 「すべて説明した」（N3。Step②・台本モード・詳細モード共通）
- 【説明】（`type: 'explain'`）と【合否連絡】（`type: 'notify'`）の見出し `.cl-block-title` の右に `<button type="button" class="btn sm ghost cl-all-btn" data-action="explain-all" data-block="{blockId}">すべて説明した</button>`
- 対象 = ブロックの項目のうち、`shortOnly` の項目は求人（`checklist.header.posting`）が `short` のときだけ。1 クリックで対象を全部チェック（`values.{id} = true`）
- 対象が全部チェック済みなら文字は「すべて外す」（`aria-pressed="true"`）。押すとブロックの**全項目**を外す（求人が通常のときに手で付けた ※ の項目も。`values` から消える）
- 文字は `updateChecklistUI()` で追従（個別のチェック・求人の切り替え）。対象が 0 件のブロックではボタンを隠す
- app.js `clBlockFind`・`clAllTargets`・`clAllDone`・`clAllBtnHtml`（新規）、`onContentClick` の `explain-all`

### 12-6. 右サマリー（N5。台本モード）
「応募者」カードは 4 行: `.sum-name`（氏名）・`.sum-sub`（区分・年齢・性別＋ `span.sum-attrs#sumAttrs`）・`#sumDate`・`#sumInterviewer`。`#sumAttrs` には求人が `short` のときだけ `<span class="badge info">短期求人</span>` を 1 つ。消極属性・通常求人のチップは出さない。

### 12-7. A4 報告・保存 HTML（N6）
- `checklistSheetHtml`（台本の記録）のヘッダー: 氏名・（区分・年齢・性別）・面接日・担当、チップは 卒業予定 → 応募した求人 → タクシー可否・料金。消極属性のチップと「目安 n分」は出さない（詳細モードの記録は従来どおり タクシー → 応募した求人 → 勤務期間… と目安を出す）
- `generateReportHTML`（台本の記録）の `.rh` のチップ: 区分・年齢・性別・卒業予定・応募した求人（消極属性を削除）。「応募者情報」の表から消極属性の行が消える
- 実測: `tests/shots/script-report.pdf` 2 ページ（pdfinfo）
- 「短期希望」の文字は台本の質問文（「いまのところ、短期希望ですか？…」）と記入欄「短期／長期の希望」の選択肢にだけ残る（ヘッダー・サマリー・応募者情報には出ない）

### 12-8. テスト（N7）
- 単体（`tests/rules.test.js`）: #62 の morningOnly / shortTerm の expect を「`negatives` を返さない・`CHECKLIST_AUTO` / `emptyChecklist` に無い・旧 `header.negatives` があっても落ちない」に置き換え。#64 は旧い設定の `negatives`・`morningOnlyEnd` が正規化で外れること、#65 は `morningOnlyEnd` が壊れていてもエラーにしないこと、#66 は section に消極属性が出ないこと（旧レコードでも）、#76・#77 は応募者情報・`.rh`・A4 ヘッダーに消極属性・短期希望が無いこと・A4 のチップの順。**#79 を追加**（既定の台本に無い・旧設定の正規化〔冪等〕・旧レコード〔`header.negatives`・`checklistDef.header.negatives` 入り〕の保存 HTML 生成・読み込み〔データは保持〕・判定が同じ・ビューモデルに無い）。85 passed
- e2e（`tests/e2e.js`）: E25（詳細モードのヘッダーに消極属性が無い・「すべて説明した」5 個・レポートの節に無い）、E27（A4 ヘッダー・PDF に無い）、E32（Step① が 1 枚・3 行の構成・説明 1 行・補足文なし・`#saNegatives` 無し・求人ボタン「通常」「短期」・メモ 2 行・1440px で卒業予定も 1 行目・1440×900 / 1280×800 でスクロールなしに `#saNext`・390px で 1 列・右サマリー 4 行〔短期求人のチップだけ。通常なら無し〕）、E33（`#clHeader` が 1 行・題名／説明文／目安／消極属性なし・「すべて説明した」で全チェック〔短期なので ※ も〕→ もう一度で全解除・個別に全部チェックでも「すべて外す」・【合否連絡】）、E34（保存 HTML・記録・A4 ヘッダー・応募者情報・PDF に無い）、E35（設定に消極属性の行・自動判定・終了時刻が無い。両モード）、E37（求人が通常なら ※ は付かない・「すべて外す」は手で付けた ※ も外す）、**E38 を追加**（消極属性入りの旧レコードを読み込み → 右サマリー・紙・② のヘッダー・① に出ない → 保存し直しても表示部分に無い → 旧レコードから作った保存 HTML もエラーなし）。ALL PASSED（513 件。12-10 の修正後は 516 件）
- 撮り直し: `tests/shots/40-script-step1.png`・`41-script-step2.png`・`44-script-report.png`・`script-report.pdf`（2 ページ）

### 12-9. 残った点
- 詳細モードの Step3 ヘッダー（`clHeaderHtml`）は入力欄つきのまま（目安時間・説明文も従来どおり）。1 行化は台本モードだけ
- ① の区分の長い選択肢（「専門学校生3年生」など 8 文字）は、1280px で学生の区分（卒業予定年月も 1 行目に出る）のとき末尾が少し切れる（既定の「大学2年生」などは切れない）
- ② の目次（`#clNav`）は 1280px で 2 行に折り返す（従来どおり）

### 12-10. レビュー後の修正（2026-10-14）
1. ① の性別のセレクトの未選択の文言が PC 幅で切れていた（1280px・学生の区分で「選択し」）→ 性別だけ未選択の文言を「選択」（`fSelect('gender', '性別', o.genders, { placeholder: '選択' })`。詳細モードの Step1 は従来どおり「選択してください」）。1 行目の比を 年齢 .55（min 64px）・性別 .8（min 116px）に変え、最長の「回答しない」も ▼ と重ならない。実測: 1440・1366・1280px（学生の区分）とも性別 116px・文字 76px（e2e E32）
2. ② の 1 行ヘッダーが 1280px で 2 行に折り返していた（「担当」と「応募者を編集」が 2 行目）→ 面接日のラベルを外し（値が日付なので分かる。`SCRIPT_HEAD_SHORT` から date を削除）、1400px 以下ではチップを一段詰めて「応募者を編集」をカード上端の右に出す（12-4）。実測: 1440px 高さ 46px（従来どおり 1 行・編集リンクも同じ行）、1366px・1280px 高さ 45px（チップは 1 行・編集リンクはチップと重ならず押せる。e2e E33）
3. メモの呼び名が入力画面「メモ（任意）」と報告書「備考（面接者メモ）」「備考」で食い違っていた → `scriptApplicantRows` の `notes` の見出しを「メモ」、`checklistSheetHtml`（台本の記録・sheet）の行を `<span class="cl-ov-k">メモ</span>` に（保存 HTML の「応募者情報」・A4〔アプリの ③ の紙・保存 HTML〕とも「メモ」。値・保存キー `applicant.reviewerNotes` は不変。詳細モードの「申し送りコメント」は従来どおり）。単体 #76・#77、e2e E34 で確認
- テスト: 単体 85 件・e2e 516 件（E32 性別の幅、E33 1366/1280px のヘッダー、E34 メモの見出しを追加）すべて緑。`tests/shots/40-script-step1.png`・`41-script-step2.png`・`44-script-report.png`・`script-report.pdf`（2 ページ）を撮り直した

## 13. A4 報告を 1 ページの要約に（2026-10-14）

- 依頼: 副支配人「出力される報告書が煩雑すぎて頭に入ってこない。わかりやすく、かつ1ページで」。従来の A4 報告は台本の全文（説明のチェック・質問文・記入欄・メモ・点）を 2 ページに再現していて、読み手（副支配人）には多すぎた
- 設計（オーケストレータの決定）: 副支配人が 10 秒で「誰を・どう判断し・何が気になるか」を掴める A4 1 ページ。台本の説明文・質問文・空の記入欄は載せない。全文は保存 HTML「詳細」の「面接チェックリスト」節（`checklistSheetHtml(…, { mode: 'section' })`。変更なし）に残す
- 仕様の本体は `docs/SPEC-checklist.md` 4 章（4-2 の表＝ブロックの並びと実測の高さ、4-4 の 1 ページ保証、4-5 のページ数、4-6 の旧版）

### 13-1. 並び（`checklistSheetHtml(…, { mode: 'sheet' })`。アプリ ③ の `#appPaper`・保存 HTML の `#clPaper`・印刷用 `#clSheet` 共通）
1. ヘッダー帯（濃紺・22px）「面接チェックリスト報告｜台本 2026-10-08 版｜TOHOシネマズ新宿 ／ 作成 YYYY/MM/DD」
2. 応募者 2 行: 氏名 16px＋区分・年齢・性別＋卒業予定／面接日・担当・応募した求人・タクシー可否・料金（空の項目は省く）
3. 結果ストリップ `.cl-judge`（地色は結果の薄い色）: 結果 `.cl-tile-res`（14px 太字・緑／琥珀／赤。判定前は「未実施」）・総合判断・必須条件・確認点（16/16点・○7 △0 ×0）＋右端に最終合否 `.cl-decision`。調整は下に `ul.cl-adj` 1 行（必須条件の不一致は「必須条件の不一致により「不採用推奨」に固定」＝保存 HTML の「採用可否判定」の見出しと同じ言い方）
4. 必須条件（○一致／×不一致＋文言、土日勤務可否・出勤不可な繁忙）｜勤務条件の確認（短期／長期の希望・契約開始日の希望・初回契約終了・OPEN／25時の可否）
5. 確認点 7 行（①〜⑤｜名前｜○△× の丸バッジ〔未入力は灰「—」〕｜メモ 1 行）
6. 面接メモ（記入があるものだけ。質問の回答は「1 問目の短い名前＋ほか n 問｜回答 2 行まで」・面接所見・Step① のメモ「メモ」。「…」で切れたメモがあれば全文の場所〔保存 HTML の「詳細」〕の案内 1 行）
7. 説明・連絡 1 行（説明済み ① 4/4 ・ ② 3/3 ・ ③ 4/4 ・ ④ 3/3 ｜ 合否連絡 採用時 ☑ ／ 不合格 ☐。※短期求人のみ は求人が短期のときだけ分母に入れる）
8. 押印行（アプリの印刷用だけ。保存 HTML は直後の押印の節を続けて印刷。紙プレビューには出さない）
- 色は結果・○△×（必須条件の一致／不一致を含む）・最終合否だけ。本文 9.5px・ラベル 8.5px・見出し 10.5px（左に 3px の濃紺の線）

### 13-2. 1 ページ保証
- `storage.fitChecklistSheet(sheet, limit)`（= `clFitSheet`）: 押印行（とその上の余白）を除いた高さが上限 `checklistSheetLimit(押印欄の件数)`（3 件まで 950px＝1040 − 押印行 90。4〜6 件 890px）を超えたら `.cl-compact`（本文 9px・質問の回答 2 行のまま・面接所見 10 行まで）→ `.cl-compact-q1`（質問の回答 1 行・所見 6 行）→ `.cl-compact-2`（質問の回答を省いて案内・所見 4 行）→ `zoom`（縮小後の高さを測り直して上限まで下げる）。メモが「…」で切れたら `.cl-nm-cut` で案内 1 行（13-7）
- アプリ: 印刷用（`prepareChecklistSheet(true)` → `fitChecklistSheet()`）と ③ の紙プレビュー（`fitReportPaper()`＝ `renderStep` の ③・`rerenderReportPaper`・画面幅の変更）。保存 HTML: 埋め込みスクリプト 1 に同じ関数のソース（`clFitSheet.toString()`）を入れ、`__prepareChecklistSheet(true)` と紙プレビュー（読み込み時・`setView('report')`・`window.__fitChecklistPaper`）で使う
- ③ の紙プレビューは等倍（本文 9.5px）: 右サマリーの横に紙が入らない幅（1280px・1366px）は右サマリーを紙の下に回す（`.judge-layout.paper-stack`）。それでも列が紙より狭いときだけ `#appPaper` を `zoom` で縮め、縮小は 0.95 倍まで（それより狭い画面は等倍で紙だけ横スクロール。E36）。旧: 0.7 倍まで縮めていた（1280px で 0.80 倍）
- 旧版の `.cl-page`・`.cl-fit`・2 ページ目の強制改ページは削除した

### 13-3. 短い名前（`short`）
- `config.default.js` の質問 13 件・合否連絡 2 件（採用時／不合格）・記入欄 2 件（初回契約終了／OPEN／25時の可否）に `short` を追加。`storage.checklistShortLabel(item)` は short → 文言が既定と同じ項目は既定の short（short の無い旧い設定・保存済みの記録）→ 文言の先頭 14 文字＋「…」（前後の「」は外す）
- `normalizeChecklistDef` は short を整える（前後の空白を外す・空や文字列以外は消す）だけで、補わない（設定で質問文を書き換えたときに古い short が残らないよう、補うのは描画時）。設定の「面接チェックリスト」の質問・合否連絡・記入欄の各行に「報告書（A4 1 枚）での短い名前」の欄
- 設定「A4 報告・保存レポートに質問文も載せる」は「保存レポートの「詳細」に質問文も載せる」に改名（A4 報告は設定に関係なく質問文を載せない）

### 13-4. 変えていないもの
- 'section' モード（保存 HTML「詳細」の面接チェックリスト節）、Step② の入力画面、レコード形式（`schemaVersion: 2`・`record.checklist`・`record.checklistDef`。`short` は台本の項目に増えるだけ）、既存の id（`#clPaper`・`#clSheet`・`#clDecision`・`#clPaperDecision`・`#mgmt`・`#decision`・`#appPaper`・`#appPaperDecision`）、body クラス（`view-report`・`view-full`・`print-checklist`・`print-handoff`）、押印と最終合否の仕組み、申し送りシート（詳細モード）
- 詳細モードの記録も同じ 1 ページの要約（応募者の 2 行目に勤務期間・週・希望シフト、結果ストリップにシフト貢献度のタイル＝5 タイル）。「面接で確認した勤務条件」は要約に載せない（「詳細」の「面接で確認した情報」にある）

### 13-5. テスト
- 単体: #66・#77・#79 の旧レイアウト依存の確認（`.cl-s-ng`・`.cl-hchip`・`.cl-page` で切り出したヘッダー・`.cl-ov-k`・「採用可否判定は未実施（…の時点）」・A4 の hint）を新レイアウトの同じ確認（`.cl-must-ng`・`dl.cl-sh-kv`・`.cl-judge` の前までのヘッダー・`.cl-nm-k`・結果タイル「未実施」・A4 に hint が無いこと）に置き換え。**#80** を追加（説明文・質問文・補足・注記・前書きが無い／確認点 7 行・必須条件 2 行・未入力の行／左右の記入欄／説明済みの分母と求人／面接メモは記入があるものだけ／short のフォールバックと正規化／「未実施」・タイルの順・`.cl-judge`・`.cl-adj`・`.cl-tile-res`・`.cl-decision`／押印行が最下段／詳細モードの記録／CSS と保存 HTML の 1 ページ保証／'section' は全文のまま）
- e2e: E27・E30・E34 の PDF を「1〜2 ページ」→「1 ページ」に。E27 の 2 ページ構成の確認 → 1 ページの要約（`.cl-page` 0・確認点 7 行）、ヘッダーのチップ → `dl.cl-sh-kv`、2 ページ目が重いサンプルの `.cl-fit` → 本文が上限を超えるサンプル（全メモ 300 字・面接所見 2,000 字）の `.cl-compact`、質問文 OFF → 設定 ON／OFF とも質問文なし。E33 のタイルの順（結果・総合判断・必須条件・確認点）、E34 のメモの見出し（`.cl-nm-k`）と PDF の本文（結果・氏名・最終合否・笹川晴央、質問文・説明文なし）。**E39** を追加（7-3 の後）
- 撮り直し: `tests/shots/42-script-step3.png`・`44-script-report.png`・`48-script-report-heavy.png`（新）・`script-report.pdf`・`script-report-app.pdf`・`script-report-heavy.pdf`（新）・`script-report-app-heavy.pdf`（新）

### 13-6. 結果（2026-10-14）
- 単体 `node tests/rules.test.js` 86 passed / 0 failed、`node build.js && node tests/e2e.js` ALL PASSED（526 件。従来 516 件＋E34 の PDF 本文 1 件＋E39 の 9 件）
- PDF（pdfinfo）: `script-report.pdf`・`script-report-app.pdf`・`script-report-heavy.pdf`・`script-report-app-heavy.pdf`・`checklist-app.pdf`・`checklist-app-heavy.pdf`・`checklist-app-page2-heavy.pdf`・`checklist-report.pdf`・`checklist-report-heavy.pdf`・`checklist-report-decision.pdf`・`report-view-print.pdf` すべて 1 ページ
- 紙の高さ（1440px）: 標準のサンプル 552px（E34）／全ブロックにメモ 約 700px／重いサンプル（全メモ 300 字・面接所見 1,500 字）は `.cl-compact` で 943px。結果バッジは紙の上端から 85〜87px
- 設計からの差: (1) 質問の回答はブロックに 1 つのメモ（`notes[block.id]`）なので、「短い名前：回答」の名前はブロックの質問の短い名前を「・」でつないだもの（→ 13-7 で「1 問目の短い名前＋ほか n 問」に変更）。(2) short の補完は正規化ではなく描画時（文言が既定と同じ項目は既定の short）。(3) 各メモ 300 字では本文が上限に届かないため、`.cl-compact` を確かめる重いサンプルは面接所見を 1,500〜2,000 字にした。(4) 右カラム「勤務条件の確認」は「ラベル｜値」の 2 列（4 行）。(5) 押印行は紙プレビューに出さない（従来どおり紙の下の押印欄）。(6) ③ の紙プレビューは 1280px などで縮小して横スクロールを出さない（→ 13-7 で等倍・右サマリーを紙の下へに変更）。(7) 面接所見・Step① のメモは通常は全文（`.cl-compact` で行数を制限）

### 13-7. レビュー後の修正（2026-10-14）
1. **③ の紙プレビューが画面で小さすぎた**: 1280px で 0.80 倍（本文 7.6px・ラベル 6.8px・結果 11.2px）、1366px で 0.91 倍。→ 右サマリーの横に紙が等倍で入らない幅は `.judge-layout.paper-stack` で右サマリーを紙の下に回す（カードは横並び。③ 以外のステップでは外す）。縮小は 0.95 倍まで（本文 9px 以上）。実測: 1280・1366px とも等倍（本文 9.5px・ラベル 8.5px・結果 14px）・横スクロールなし、1440px は従来どおり右サマリーが横（E39）。1064〜1103px は 0.95 倍以上の縮小、サイドバーのある 841〜1,063px（1024px など）と 790px 未満は等倍で紙だけ横スクロール
2. **`.cl-compact` で面接所見が紙を占めた**（所見 1,500 字で 27 行・紙の 35%、質問の回答は 1 行）。→ 所見の行数の上限を固定（`.cl-compact` 10 行 → `.cl-compact-q1` 6 行 → `.cl-compact-2` 4 行。残りの高さまで広げない）。質問の回答は `.cl-compact` では 2 行のまま、超えた分は所見から先に削る。実測: 重いサンプル（全メモ 300 字・所見 1,500 字）は `.cl-compact` で紙 825px、所見 10 行 121px（紙の 15%）、質問の回答 2 行
3. **質問の回答の名前が長すぎた**（3 問の短い名前を「・」でつないで 33〜37 字・2 行、`.cl-compact` で「…」）。→ 1 問目の短い名前＋「ほか n 問」（例「② 前のバイトの期間・退職理由 ほか2問」・1 問だけのブロックは「⑤ 気になる点（逆質問）」）。名前の列 21em → 18em（回答の幅が広がる）。すべて 1 行
4. **所見が「…」で切れても全文の場所が分からなかった**。→ 面接メモ・確認点のメモが「…」で切れていれば `.cl-nm-cut` を付け、面接メモの最後に「「…」で切れたメモの全文は、保存 HTML の「詳細」表示にあります」の 1 行（案内の高さも含めて 1 ページに収める）。`.cl-compact-2` は従来どおり「質問の回答は省略（…）」
5. **保存 HTML の押印の節を固定 90px で見積もっていた**ため、押印欄 4 件（2 段・134px）で所見が長いと 2 ページ。→ 上限を押印欄の件数で決める（`storage.checklistSheetLimit(n)`: 1 段 3 件・2 段目以降 1 段 60px。3 件まで 950・4〜6 件 890・7〜9 件 830px）。保存 HTML は `var CL_LIMIT=` に保存時の件数の値、アプリの印刷用・紙プレビューも同じ値。押印行の上の余白（`margin-top`）も除いて計る（押印行の直前の要素の下端まで）
6. **最終手段の縮小が縮小後の高さを測り直さなかった**（Chromium の zoom は小さいほど比例して縮まず、確認点 +65 件で 0.499 倍・980px → 2 ページ）。→ 縮小後に測り直し、上限に収まるまで倍率を下げる（最大 12 回・下限 0.3 倍）。実測: +65 件で 0.478 倍・945px、+80 件で 0.398 倍・938px。アプリ・保存 HTML とも 1 ページ
- テスト: 単体 #80 に名前（ほか n 問・1 問だけ）・案内（has-q の有無）・CSS（所見の行数・`.cl-compact` で質問の回答を 1 行にしない）・`checklistSheetLimit` と押印欄 4 件の保存 HTML の `CL_LIMIT=890` を追加、**#81** を追加（疑似 DOM で 詰める順・「…」の案内とその高さ・押印行と余白の除外・縮小の測り直し・内容が減ったら外す）。e2e E39 に 1366px、等倍と右サマリーの位置（1280・1366px は紙の下・1440px は横）、重いサンプルの質問の回答 2 行・所見 10 行以内・名前 1 行・案内、PDF 本文の案内、アプリの押印欄 4 件の A4 1 ページ、保存 HTML の境界（所見 4,000 字・押印欄 4 件・確認点 +65 件）を追加
- 結果: 単体 87 passed、e2e ALL PASSED（535 件）。PDF はすべて 1 ページ（pdfinfo）。撮り直し: `42-script-step3.png`・`44-script-report.png`・`48-script-report-heavy.png`・`49-script-step3-1280.png`（新）・`script-report.pdf`・`script-report-heavy.pdf` ほか

