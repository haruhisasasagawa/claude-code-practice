# SPEC-slim — 面接特化（詳細モード・初期対応者の押印・旧評価の削除）作業仕様

作成 2026-10-14。基準コミット `df3b339`（= タグ `full-mode-last`。全テスト緑）。
**行番号はすべて df3b339 時点の目安**。実装中にずれるので、関数名・定数名で探すこと。

---

## 0. 目的・前提・決定事項

### 0-1. ユーザー（副支配人）の指示
> 応募者の管理（押印）の部分なんだけど、初期対応者の欄は削ってもらって構わない。この件に関してはもう面接に特化したソフトにしたいから、（中略）面接までの経緯っていうのはクリアしてるから面接に進んでるので、ある程度ははしょっちゃって大丈夫なので、初期対応者の押印を要らない。とりあえず。他にもいらない機能があれば削ってくれ。

オーケストレータの決定（変更不可）: 面接に特化する。詳細モードと面接前の機能はコードごと削除する（履歴はタグ `full-mode-last` に残る）。

### 0-2. 残すもの（挙動・DOM id を変えない）
- 台本モードの 3 ステップ（① 応募者 → ② 面接チェックリスト → ③ 報告書）。DOM id: `#scriptApplicantCard`、`#saDate` `#saInterviewer` `#saPosting` `#saTaxi` `#saNext`、`#clHeader`、①〜⑤ のブロック UI と「すべて説明した」（`data-action="explain-all"`）、`#appPaper`、`#mgmtCard`、`#decisionCard`、`#reportSaveBtn` `#reportPrintBtn`、`#clPrintBtn` `#toReportBtn` `#backToApplicant` `#backToChecklist`、`#scriptWarnings`。
- `evaluateScript` と `checklistSummary`、A4 1 ページ報告（`checklistSheetHtml` の `'sheet'`、`.cl-compact` 系の計測 `clFitSheet`）。
- 保存 HTML: `view-report` / `view-full`、`#clPaper` / `#clSheet`、`#clDecision` / `#clPaperDecision`、`#mgmt`、`#decision`、「押印を保存」、ファイル名 `_採用` / `_不採用`。
- ハンコ・合否スタンプ（stamp.js は変更不要）、プロファイル JSON の書き出し／読み込み、ダークモード、390px 対応。
- レコードは `schemaVersion: 2` のまま（キーは減る。`mode` は書かない）。localStorage のキー `recruit.profile.v1` も変えない。

### 0-3. 設計上の決定（D1〜D14。実装者は迷ったらここに従う）
| # | 決定 |
| --- | --- |
| D1 | **ステップの内部キーは 1 / 3 / 4 のまま**（表示は ①②③）。`data-step="3"` `"4"`、`record.step`、`goStep(2)` は 1 に読み替え、を維持。e2e のセレクタを壊さないため |
| D2 | `STEPS_FULL`・`isScript()`・`R.isScriptMode`・`R.isScriptRecord` は削除し、常に台本の分岐を通す（`if (isScript())` は then 側だけ残す） |
| D3 | 応募者データは **6 キーだけ**: `name, gender, age, category, graduationDate, reviewerNotes`（すべて文字列）。旧レコードの他のキーは読み込み時に捨てる（再保存しない） |
| D4 | 押印欄: 既定は `[{id:'interviewer',label:'面接対応者',hint:'面接を行った担当者'},{id:'final',label:'最終確認',hint:'採用可否を最終確認した上長'}]`。正規化では **id `initial` の欄だけ外す**（JSON で足した独自の欄は残す。空になったら既定）。旧レコードの `management.initial` は読み飛ばす |
| D5 | プロファイルの正規化は**ホワイトリスト**（3-1）。削除したキー（mode・handoffRules・contribution など）は読み込み時に落ち、保存・書き出しに出ない |
| D6 | v1 プロファイル（`schemaVersion` < 2。キーが 1 つ以上ある JSON）は**移行せず既定値**にし、toast「古い形式のため既定の設定を使います」 |
| D7 | `R.interviewModel(profile, scores, cl)` → **`R.interviewModel(profile, cl)`**（旧評価の引数を削除）。戻り値の `mode` は `'checklist'` 固定で残す（判定の形 `interviewMode: 'checklist'` も維持） |
| D8 | 台本の「自動表示」（`auto` / `autoParams`、`checklistAuto`、`CHECKLIST_AUTO`）は削除。台本モードでは元々何も出していない。旧設定・旧記録の台本に残っていれば正規化で外す |
| D9 | 保存 HTML の body クラスは `view-report has-cl mode-script` のまま（CSS と e2e が参照）。印刷ボタンは `#rtPrintChecklist` だけで、表示名を「A4 で印刷（1 ページ）」に変える |
| D10 | 押印欄が 2 件のとき `.stamp-row` に `cols-2` を付け 2 列にする（アプリ `#mgmtCard`・A4 の `.cl-stamps`・保存 HTML `#mgmt`）。3 件以上は従来の 3 列のまま。`checklistSheetLimit(n)` は汎用のまま残す（行数は 2 件でも 1 段） |
| D11 | 設定画面は 5 節（劇場情報／応募者の属性／面接チェックリスト／応募者の管理（押印）／書き出し・読み込み）。結果文言（`texts`）は画面から外す（JSON の書き出し／読み込みでだけ変更可。値は既定に残る） |
| D12 | 旧レコードの判別: **詳細モードの記録 = `rec.mode === 'full'` または（`rec.mode !== 'script'` かつ `rec.handoff` がオブジェクト）**。スリム後の記録は `mode` も `handoff` も書かないので誤判定しない |
| D13 | 静的な画面名にする: ナビ「報告書の作成」・トップバー「面接チェックリスト報告」・サイドバー「手順」（index.html に直書き。`renderModeLabels` 削除） |
| D14 | `meta.version` は変えない。README・HANDOFF のテスト件数は実装後の実数に直す |

---

## 1. 削除一覧（ファイル別）

凡例: **削除** = 丸ごと消す／**縮小** = 一部を残す／**改** = 中身を書き換える。

### 1-1. `src/config.default.js`（623 行 → 目安 260 行）
| 行 | 対象 | 扱い |
| --- | --- | --- |
| 1–10 | 冒頭コメント（handoffRules・CONDITIONS の説明） | 改（台本・押印・結果文言だけの説明に） |
| 17–19 | `mode` | 削除 |
| 28–42 | `features` | 縮小 → `{ graduationDate: true }` だけ |
| 44–57 | `inputStages` | 削除 |
| 58–63 | `stageOptions` | 削除 |
| 65–80 | `highschoolPolicy` | 削除 |
| 85 | `management.fields` の `{ id: 'initial', … }` | 削除（K1）。82 行のコメント「3 つの押印欄」→「2 つ」 |
| 111–195 | `options` | 縮小 → `genders`・`categories` だけ（`commuteMethods`〜`applicationRoutes`、`workPeriods`・`vacationItems`・頻度・進路・在留資格などは削除） |
| 197–224 | `params` | 削除 |
| 226–368 | `handoffRules` | 削除 |
| 370–397 | `evaluation` | 縮小 → `{ thresholds: { recommendPct: 70, reviewPct: 40 } }` だけ（`scaleMax`・`items`・`overallItemId`・`overallWarnBelow`・`holdOn*`・`overallRejectAtOrBelow` 削除） |
| 399–529 | `checklist` | 残す。ただし項目の `auto` / `autoParams`（must_weekly・must_busy・weekend・busy_ng・term・first_end・open_late）と、コメントの「2 軸判定に使う」「auto: 応募情報からの自動表示」を削除 |
| 531–551 | `contribution` | 削除 |
| 553–569 | `matrix` | 削除 |
| 571–620 | `texts` | 縮小 → `recommend/review/reject` は `{ title }` だけ、`disclaimer`、`bandLabels`、`script`（6 文）。`body`・`handoffIntro`・`matrix`・`adjusted`・`mustGate`・`busyIntro`・`allNightIntro`・`contributionIntro`・`preFill*`・`interviewConfirmIntro`・`reviewerNotesIntro`・`strengths` は削除 |

スリム後の既定プロファイルのトップレベルキーは **`schemaVersion, meta, features, management, options, evaluation, checklist, texts` の 8 個だけ**（単体テストで固定する）。

### 1-2. `src/rules.js`（2,375 行 → 目安 600 行）
| 行 | 対象 | 扱い |
| --- | --- | --- |
| 1–16 | 冒頭コメント | 改（面接チェックリストの評価と台本モードの判定だけ） |
| 22–69 | `DAYS`・`SEVERITY`・`LAW`・`LOCKED_RULES`・`CATEGORY_LABELS`・`CATEGORY_ORDER` | 削除 |
| 70–71, 74–136 | `TRI_LABELS`・`UNIT_LABEL`・`DEFAULT_ADJUSTED_BODY`・`DEFAULT_MUST_GATE_BODY`・`BANDS`・`CONTINUE_LABELS`・`INPUT_STAGES`・`INPUT_STAGE_LABELS`・`INPUT_SECTIONS`・`SECTION_MAP`・`DEFERRABLE_RULES`・`AGGREGATE_RULES`・`NEVER_DEFER_CATEGORIES`・`MISSING_KEY_SECTION` | 削除（**`RESULT_RANK`（72）は残す**） |
| 138–144 | `num`・`round1` は残す（app の `fmtNum` が `R.round1`）。`isTri`・`clamp01` | 削除 |
| 146–192 | `fmtAbs`〜`estimateWorkMinutes` | 削除 |
| 194–201 | `categoryGroup`・`isStudentGroup` | **残す**（① の卒業予定年月の表示判定） |
| 203–213 | `labelOf`・`ratioOf` | 削除 |
| 215–655 | `busyItems`・`analyzeShifts`・`highschoolStatus`・`nightStatus`・`lastTrainCheck`・`weeklyDaysCheck`・`ageCategoryCheck`・`shiftConditionMissing`・`stageOf`〜`interviewConfirm`・`monthsUntil` | 削除 |
| 656–658 | `bandOf` | **残す** |
| 660–1240 | `busyScore`・`computeContribution`・`vacLabels`・`CONDITIONS`・`buildContext`・`templateVars`・`categoryRank`・`buildHandoff`・`shiftBadges` | 削除 |
| 1262–1265 | `CHECKLIST_AUTO` | 削除（D8） |
| 1276 | `yen` | 削除 |
| 1313–1319 | `hasNumericScore` | 削除（K3） |
| 1341–1397 | `interviewModel` | 改（D7: 引数 `(profile, cl)`、`'legacy'` 分岐と `ev.items` 参照を削除。`cl` がオブジェクトでなければ `emptyChecklist()`） |
| 1412–1555 | `firstContractEnd`・`autoParam`・`checklistAuto` | 削除（D8） |
| 1557–1678 | `checklistSummary` | 改（2 章 B1） |
| 1692–1975 | `evaluateHiring` | 削除 |
| 1980–1981 | `isScriptMode`・`isScriptRecord` | 削除 |
| 2029–2174 | `evaluateScript` | 改（2 章 B2。`interviewModel` の呼び方だけ） |
| 2176–2288 | `describeShifts`・`hsStatusText`・`describeApplicant` | 削除 |
| 2290–2374 | `global.RecruitRules` | 改（残す公開: `RESULT_RANK, num, round1, bandOf, categoryGroup, isStudentGroup, CHECKLIST_BLOCK_TYPES, CHECKLIST_FIELD_KINDS, CHECKLIST_SCALE, RATING_MARKS, OVERALL_POINTS, OVERALL_TONE, MUST_VALUES, CHECKLIST_OVERALL_ID, MUST_FAIL_RESULTS, MUST_UNKNOWN_RESULTS, OVERALL_CAP_VALUES, circled, emptyChecklist, checklistHasInput, checklistItems, interviewModel, mustSummary, checklistSummary, checklistDiff, OVERALL_RESULT, DEFAULT_SCRIPT_TEXTS, scriptApplicantRows, evaluateScript`） |

### 1-3. `src/storage.js`（2,253 行 → 目安 1,300 行）
| 行 | 対象 | 扱い |
| --- | --- | --- |
| 21–42 | `V1_DEFAULT_TEXTS`・`V1_VACATION_*`・`SHINJUKU`・`BUSY_ITEM_FALLBACK`・`RESULTS`・`HS_MODES`・`MATRIX_KEYS` | 削除（`isNum`（43）は残す） |
| 45–109 | `migrateV1` | 削除（K5） |
| 111–171 | 最終合否（`DECISION_FALLBACK`〜`decOpts`） | 残す |
| 173–265 | `fillArrays` | 縮小 → `fillManagement(raw, base)`（押印欄・名簿・手入力・最終合否だけ。`initial` を外す。初期対応者の旧ヒント移行 248–250 は削除）。繁忙期・勤務期間・頻度・貢献度・マトリクス・高校生の補完は削除 |
| 267–280 | `STAGES`・`fillStages` | 削除 |
| 284–289 | `CL_AUTO_PARAM_RULES` | 削除（D8） |
| 299–421 | `normalizeChecklistDef` | 縮小: `autos` 変数（306）・`baseItems`（339–341）・auto/autoParams の検査（384–403）を削除し、代わりに各項目で `delete it.auto; delete it.autoParams;` |
| 434–503 | `validateChecklist` | 縮小: auto/autoParams の検査（472–478）を削除 |
| 506–533 | `V2_TEXT_UPGRADES`・`upgradeTexts`・`enforceLocked` | 削除 |
| 536–565 | `normalizeProfile` | 改（3-1） |
| 568–649 | `validateProfile` | 改（4-4） |
| 651–676 | `loadProfile`・`parseProfileJSON` | 改（3-1） |
| 710–757 | `buildRecord` | 改（3-3） |
| 759–772 | `parseRecordFromHTML` | 残す ＋ 新規 `normalizeRecord(rec)` をこの直後に追加（3-2） |
| 775–788 | `HS_STATUS_LABELS`・`MODE_LABELS`・`SHORT_RESULT`・`FLAG_LABELS` | 削除 |
| 791–993 | `reportCss` | 縮小（1-6 の後半） |
| 1081–1229 | `checklistSheetHtml` | 改（`scriptRec` 分岐を台本側に固定。`fromAuto` の注記・「目安」行・タクシー／求人の並び替えの詳細側を削除。`checklistSummary` に `scores` を渡さない） |
| 1235–1426 | `clOnePageHtml` | 改（引数 `scriptRec` を削除し常に台本の応募者 2 行。詳細モード用の `workPeriod`・週・希望シフト（1271–1278）、`contribTile` と `.n5`（1300–1308, 1318）を削除。`rvNotes` は常に出す） |
| 1429–1604 | `checklistSheetCss` | 縮小（`.cl-tiles.n5`、`print-handoff` を含む規則。`.cl-sheet .stamp-row.cols-2` を追加） |
| 1606–2223 | `generateReportHTML` | 改（2 章 B5。台本の本文だけ。`fullBodyHtml`・`.dash`・旧評価の節・申し送りシート印刷を削除） |
| 2225–2252 | `global.RecruitStorage` | 改（`V1_DEFAULT_TEXTS` を外し、`normalizeRecord` を追加） |

### 1-4. `src/settings.js`（1,268 行 → 目安 600 行）
| 行 | 対象 | 扱い |
| --- | --- | --- |
| 26 | `advOpen` | 削除 |
| 29–31 | `categoryLabels`・`categoryOrder`・`lockedRules` | 削除 |
| 34–45 | `VARS_HINT`・`RESULT_VARS_HINT`・`UNIT_OPTIONS`・`BANDS` | 削除（`GROUP_HINT` は残す） |
| 125–127 | `offNotice` | 削除 |
| 134–137 | `bandLabel` | 削除（`resultTitle` は残す） |
| 140–142 | `draftScript`・`stepRef` | `draftScript` 削除。`stepRef(n)` は `{1:'①',3:'②',4:'③'}` の固定 |
| 144–160 | `modeHtml`（s-mode） | 削除 |
| 172–185 | `textsScriptHtml`（s-texts-script） | 削除（D11） |
| 187–193 | `rulesSectionHtml` | 削除 |
| 196–242 | `template`・`scriptTemplate`・`fullTemplate` | 改 → 1 つの `template()`（4-1） |
| 258–523 | `featuresHtml`・`STAGE_*`・`stagesHtml`・`optionsHtml`・`busyHtml`・`paramsHtml`・`hsHtml`・`rulesHtml` | 削除 |
| 528–538 | `CL_MUST_AUTO`・`CL_FIELD_AUTO` | 削除 |
| 551–556 | `clMax` | 改（`Rr.interviewModel(draft, Rr.emptyChecklist()).max` だけ。旧評価のフォールバック削除） |
| 574–616 | `clItemHtml` | 縮小（`scr` 変数・must の auto セレクト・`autoParams` 入力・`cl-period`・fields の auto セレクト・firstEnd の入力を削除。fields の `kind` セレクトと選択肢は残す） |
| 661–671 | `legacyEvalHtml` | 削除（K3） |
| 673–760 | `checklistHtml(o)` | 改（引数なし。`o.scriptLayout` の分岐は台本側で固定: 帯の境界 `#clBandInputs`・`#clCapsScriptHint` を常に出す。`clFullJudgeChecksHtml()` 呼び出しと「旧形式」見出しを削除） |
| 762–768 | `clFullJudgeChecksHtml`・`checklistFullHtml` | 削除 |
| 839–852 | `clOnClick` の `'cl-period'` | 削除 |
| 865–887 | `clOnBindChange` | 縮小（`auto` の分岐を削除。`kind` を `choice` にしたら選択肢の見本を入れる処理だけ残す） |
| 889–1022 | `contribHtml`・`matrixHtml`・`textsHtml` | 削除 |
| 1024–1040 | `mgmtHtml` | 残す（説明のプレースホルダ「例：応募受付を行った担当者」→「例：面接を行った担当者」） |
| 1113–1114 | `onEdit` の `.rule-row, .s-contrib-row` | 削除 |
| 1171–1178 | `onClick` の `#s-advanced` リンク処理 | 削除 |
| 1206–1236 | `onClick` の `busy-*`・`stages-*`・`rule-default` | 削除（`busy` 変数も） |
| 1246–1247, 1262 | `paint`・`render` の `advOpen` | 削除 |

### 1-5. `src/app.js`（3,645 行 → 目安 1,450 行）
| 行 | 対象 | 扱い |
| --- | --- | --- |
| 1–9 | 冒頭コメント | 改 |
| 22–27 | `STEPS_FULL` | 削除（`STEPS_SCRIPT` を `STEPS` に改名してよい） |
| 34–59 | `state` | 縮小 → `view, step, maxStepReached, profile, applicant, checklist, interviewNotes, judgment, judgmentStale, management, decision, savedAt, dirty`（`handoff*`・`scores`・`legacyRecord`・`lastHandoffText`・`preFillOpen`・`continueAt`・`cfSnap` 削除） |
| 62–73, 77–91 | `PART_SHORT`・`CONFIRM_HINT`・`BAND_TONE`※・`ADJUST_SHORT`・`CONTINUE_OPTS` | 削除（※ `BAND_TONE` は `updateChecklistUI` の `#clScoreBand` で使うので**残す**。`RESULT_SHORT` は未使用なら削除、`RESULT_TONE` は残す） |
| 92–102 | `MIGRATION_MSG`・`CHECKLIST_ADDED_MSG`・`MODE_ADDED_MSG`・`profileNotice` | 改（3-1 の toast 2 種だけ） |
| 107–121 | `init` | 改（`rep.v1Reset || rep.fullModeRemoved || rep.stripped` のとき `saveProfile`） |
| 131–159 | `emptyApplicant(profile)` | 改 → 引数なしで 6 キー（D3） |
| 163–189 | `isScript`・`steps`・`feat`・`contribOn`・`shiftConfirmOn`・`hidePointsBeforeInterview`・`partShort`・`lateHour`・`adjustSummary`・`liveRuleText` | 削除（`fmtNum`・`resultTitle`・`setText` は残す） |
| 191–225 | 入力の段階のヘルパー一式 | 削除 |
| 227–268 | `bindGlobal` | 縮小（`#btnPrint` → 常に `printChecklistSheet()`。beforeprint は `state.view !== 'judge' \|\| print-checklist` のときだけ除外。`print-handoff`・`clModel().mode` の判定を削除） |
| 270–285 | `judgeViewTitle`・`renderModeLabels`・`renderBrand` | `renderModeLabels` 削除（D13）。`judgeViewTitle()` は定数 '面接チェックリスト報告' |
| 308–360 | `showView` の `onSave`・`onReset` | 縮小（`wasScript`・`onModeChanged`・`handoffStale`・`deepMerge(emptyApplicant…)` を削除。保存後 `invalidateJudgment()` と toast「設定を保存しました」） |
| 367–371 | `evaluateNow` | 改 → `R.evaluateScript(state.applicant, ensureChecklist(), state.profile)` だけ |
| 373–377 | `onModeChanged` | 削除 |
| 379–397 | `goStep` | 縮小（`n === 2 → 1` は残す。`rebuildHandoff`・`cfSnap` 削除） |
| 399–407 | `ensureScriptJudgment` | 改 → `ensureJudgment()`（`isScript`・`mode === 'script'` の判定を削除） |
| 417–441 | `rebuildHandoff` | 削除 |
| 443–493 | `renderStepNav`・`renderStep` | 縮小（見出しは '手順' 固定。`case 2` と詳細側の分岐を削除） |
| 550–574 | `fSeg`・`TRI`・`alertHtml`・`meterHtml` | 削除（`optHtml`・`labelHtml`・`fSelect`・`fInput`・`fTextarea`・`checkRequired` は残す） |
| 593–961 | `timeRowHtml`〜`inputStepHtml`（Step1 詳細入力・`#preFill`） | 削除 |
| 1030–1036 | `laterSummaryText` | 削除 |
| 1044–1160 | `applyVisibility` | 縮小 → `#grp-graduation` の表示だけ（`R.categoryGroup`・`R.isStudentGroup`） |
| 1162–1261 | `updateTimeDisplays`・`updateContribMeters` | 削除 |
| 1263–1365 | `onFieldEvent` | 縮小（vacationDays の丸め・区分変更の再描画・`handoffStale`・Step3 の追従・`data-check`・`data-note="handoff"` を削除。`data-note="interview"` は残す） |
| 1367–1498 | `onContentClick` | 縮小（`generate-handoff`・`print-handoff`・`copy-handoff`・`busy-all-ok`・`busy-clear`・`print` を削除。`judge` は `goStep(4)` だけ） |
| 1507–1532, 1537–1570 | `validateInput`・`validateDays`・`validateContribution` | 削除（`focusFirst`・`isIntText` は残す） |
| 1575–1653 | `flagBadges`・`contribBarsHtml`・`busyTableHtml`・`lowRatioHints`・`legacyBannerHtml` | 削除 |
| 1655–2136 | Step2 申し送り・「面接で確認する項目」（`#shiftConfirm`）・`#deferredItems`・`#unresolvedAlert` 一式、`buildHandoffText`・`copyHandoffText` | 削除 |
| 2142–2145 | `clModel`・`clSummary` | 改（`R.interviewModel(state.profile, state.checklist)`、`checklistSummary(…, { management })`） |
| 2171–2177 | `mustGateReject` | 削除（詳細モードの `judge` 専用） |
| 2218–2249 | `clHeaderHtml`（詳細モードの台本ヘッダー） | 削除 |
| 2386–2411 | `clOverallHtml` | 縮小（`capTxt` と詳細側の hint を削除。台本側の hint だけ） |
| 2414–2424 | `legacyScoresHtml`（`#legacyScores`） | 削除（K3） |
| 2426–2469 | `interviewStepHtml` | 縮小（`legacyBannerHtml`・`legacyScoresHtml`・`#unresolvedAlert`・`interviewConfirmHtml`・詳細側のボタン列を削除。`#clPrintBtn` は常に表示） |
| 2477–2483 | `rerenderClHeader` | 縮小（`scriptClHeaderHtml()` だけ） |
| 2490–2655 | `updateChecklistUI` | 縮小（必須条件の `data-auto-must`・記入欄の自動表示と「短期／長期の食い違い」警告・`#clTaxiAuto`・`#clInterviewer`・`#legacyScoresMsg`・`model.mode === 'legacy'` を削除） |
| 2657–2677 | `validateChecklist` | 削除（台本モードは入力チェックで止めない） |
| 2679–2914 | Step4（`bandLabelOf`〜`resultStepHtml`、2 軸マトリクス） | 削除 |
| 2958–2978 | `reportStepHtml` | 縮小（`legacyBannerHtml()` を削除） |
| 2983–3028 | `contribSummaryHtml` | 削除 |
| 3076–3174 | `renderSummary` | 改 → 台本の分岐（チップ＋`scriptSummaryHtml()`）だけ |
| 3179–3208 | `saveRecord` | 縮小（`rebuildHandoff`・`isScript()` を削除。再判定は `ensureJudgment()`。`rejudged` の toast は残す） |
| 3226–3282 | `applyRecord` | 改（3-2） |
| 3293–3308 | `importProfileText` | 縮小（`wasScript`・`onModeChanged`・`handoffStale` 削除。toast は `profileNotice`） |
| 3310–3323 | `newRecord` | 縮小（state の削除キーに合わせる） |
| 3332–3351 | `prepareHandoffSheet`・`printHandoffSheet` | 削除 |
| 3401–3411 | `printChecklistSheet` | 縮小（旧評価のガード削除） |
| 3418–3450 | `managementCardHtml` | 残す（`.stamp-row` に D10 の `cols-2`） |
| 3359–3371 | `checklistStampsHtml` | 残す（同上） |
| 3580–3626 | `scriptHelpHtml`・`helpHtml` | `helpHtml` は `scriptHelpHtml` に一本化。押印欄の文言を「面接対応者／最終確認」に、`#helpFullMode` カードを削除 |
| 3641–3644 | `global.RecruitApp` | 縮小 → `state, goStep, showView, emptyApplicant, prepareChecklistSheet, evaluateNow`（`buildHandoffText`・`prepareHandoffSheet` 削除） |

### 1-6. CSS（`src/styles.css` 1,130 行 → 目安 750 行、`reportCss`）
**styles.css で削除するブロック**（見出しコメント単位）: 「申し送り」(354–378 の `.handoff-*`・`.progress*`・`.strength-list`)、「面接評価」のうち `.eval-*`・`.seg-btn.active.s1〜s5`・`.scale-legend`・`.score-total`、「判定結果」(`.result-card`・`.metric*`・`.bars`・`.bar-*`・`.timeline`・`.tl-item`)、右サマリーのゲージ・件数（`.gauge*`・`.sum-counts`・`.sum-count`・`.sum-later`）、設定の `.mode-options`/`.mode-opt`・`.settings-advanced`・`.s-busy-*`・`.s-contrib-row`・2 軸の編集表・`.rule-row`・`.legend`・`.s-stage-row`・`.s-cl-legacy*`・`.s-cl-periods`・`.s-off`、「必須チェック（セグメント）」の `.seg`/`.seg-opt`（`fSeg` 用）、「高校生・例外条件」「繁忙期・土日祝」「シフト貢献度の内訳」「2軸判定」「右サマリー（貢献度）」「入力の段階」(665–726)、`.legacy-banner`、`#clTaxiAuto`/`.cl-auto`（自動表示）、`.cl-head-grid`・`.cl-legacy-table`、**「申し送りシート（A4 1枚）印刷」(890–943 の `body.print-handoff` 全部)**。
**残す（共有なので消さない）**: `.score-seg`・`.seg-btn`（`clSegHtml` が使う）、`.table`・`.table.kv`、`.list-plain`・`.list-x`、`.empty`、`.grid-2`（使用箇所を grep してから判断）、`.chip`、`.alert`・`.badge`・`.card`。
**reportCss で削除**: `.dash`・`.tile`・`.meter`・`.counts`、`table.list`、`.bars`・`.bar`・`.total-line`、`.hgroup*`・`ul.hlist`・`li.h*`・`ul.strengths`、`.callout*`、`.axes`・`.axis`・`.mx*`・`.result-note`、`.print-only`・`.sheet-title`、`@page sheet` と `body.print-handoff …` の全規則、`body.view-report:not(.has-cl)…` の 2 規則、各セレクタの `:not(.print-handoff)`・`body.print-handoff #decision`・`body.print-handoff .rh-decision` の部分、`@media (max-width:720px)` 内の `.dash`・`ul.strengths`・`.bar` の部分、`@media print` 全体印刷の `.dash`・`.tile`・`li.h`・`.bars`・`.axes`・`.mx*` の部分。**残す**: `.rh*`・`.chip`・`.verdict*`・`.sec*`・`table.kv`・`.badge`・`.tag`・`.note`・`.muted`・`.empty`・`.result*`（台本の判定節）・`.adj*`・`.warn-list`・`.disclaimer`・`.foot`・押印・最終合否・`.rtool*`・`.paper*`。
**追加**: `.stamp-row.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}` を styles.css・reportCss・checklistSheetCss（`.cl-sheet .stamp-row.cols-2`）に（D10）。**詳細度に注意**: `.stamp-row.cols-2` は既存の狭い画面の 1 列化（styles.css `@media (max-width:760px){.stamp-row{…1fr}}`・reportCss `@media (max-width:720px){.stamp-row{…}}`）より強いので、その 2 つのメディアクエリに `.stamp-row.cols-2` も並べて 1 列に戻す（390px で横にはみ出さないこと）。

未使用クラスの洗い出し（目安。動的に組み立てるクラス `tone-*`・`is-*`・`dec-*`・`decide-*`・`t-*`・`m-*`・`cl-mode-*`・`sev-*` は手で確認）:
```
cd recruit-system
for c in $(grep -oE '\.[a-z][a-z0-9-]+' src/styles.css | sort -u | sed 's/^\.//'); do grep -q -- "$c" src/app.js src/settings.js src/storage.js src/stamp.js src/index.html || echo "$c"; done
```

### 1-7. `src/index.html`
- `<meta name="description">` を「アルバイト面接を面接台本（スタッフ面接チェックリスト）のとおりに入力し、A4 の面接チェックリスト報告（電子印・最終合否つき）を作るアプリ。応募者の名前と属性 → 面接チェックリスト → 報告書の 3 ステップ。」に（詳細モードの文を削除）。
- `#navJudgeLabel` → 「報告書の作成」、`#topTitle` → 「面接チェックリスト報告」、`#stepSectionTitle` → 「手順」（D13）。
- **`#clSheet`（A4 印刷用ホスト）は残す**。

### 1-8. テスト・fixtures → 5 章

### 1-9. docs
- `docs/SPEC.md`・`docs/SPEC-stages.md` を `git mv` で `docs/archive/` へ。各ファイルの 1 行目の直後に `> full-mode-last 時点の仕様（現行には無い）。現行は docs/SPEC-slim.md。` を 1 行足す。
- `docs/reference/` はそのまま。
- `README.md`・`docs/HANDOFF.md`・src のコメント・tests のコメントにある `docs/SPEC.md` / `docs/SPEC-stages.md` へのリンクは、残す文なら `docs/archive/…` に、詳細モードの説明ならその文ごと削除。
- `docs/SPEC-checklist.md`・`SPEC-report.md`・`SPEC-script-mode.md` は本文を直さず、冒頭に 1 行「2026-10-14 の面接特化（docs/SPEC-slim.md）で、詳細モード・初期対応者・旧 10 項目評価・レポート全体印刷に関する記述は無効」を足す（推奨）。
- README・HANDOFF の書き換えは 6 章の段階 7。

---

## 2. 残す関数が削除対象に依存している箇所と置き換え

| # | 箇所 | 現在の依存 | 置き換え |
| --- | --- | --- | --- |
| B1 | `rules.checklistSummary(applicant, cl, profile, opts)` | `checklistAuto`（autos）、`interviewModel(profile, opts.scores, cl).mode`、`opts.scores` | `autos` を削除し、必須条件の `autoText/autoTone`・記入欄の `autoText/fromAuto` は作らない（`r.effective = v`）。ヘッダーの `taxi` は `{ text: 手入力の値, tone: 値があれば 'info' さもなくば 'muted', auto: false }`。戻り値から `mode`・`autos` を外す（`hasInput, def, header, must, ratings, overall, score, sections, pages, minutesTotal` は維持）。`opts` は `{ management }` だけ |
| B2 | `rules.evaluateScript` | `interviewModel(profile, {}, cl)` | `interviewModel(profile, cl)`。戻り値の形（`mode:'script'`・`contribution/matrix/highschool: null`・`interviewMode:'checklist'`・`scaleMax`・`checklist`・`must`・`overall`）は**変えない**（保存済み記録・e2e が参照） |
| B3 | `rules.interviewModel` | `ev.items`・`hasNumericScore` | D7。`th = (profile.evaluation||{}).thresholds` だけ参照 |
| B4 | `storage.buildRecord(state)` | `computeContribution`・`highschoolStatus`・`isScriptMode`・`state.handoff`・`state.scores`・`profile.inputStages` | 3-3 の形で書く |
| B5 | `storage.generateReportHTML(record, profile)` | `describeApplicant`・`stageOf`・`interviewConfirm`・`highschoolStatus`・`SEVERITY`・`CATEGORY_LABELS`・`UNIT_LABEL`・`TRI_LABELS`・`isTri`・`labelOf`・`isScriptRecord`・`interviewModel(…, record.scores, …)`・`record.handoff`・`record.contribution`・`profile.evaluation.items` | 残すのは: 冒頭の準備（esc・Stamp・`dcfg`・`dec`・`filename`・`decSvg`・`meta`・`name`・`savedAt`・`texts`・`titleOf`）、`clRec`・`clHas`・`clProf`・`clMust`、`sec`・`notesHtml`・`checklistSecHtml`（`clHas` なら節、無ければ「未入力」＋所見）、旧 `scriptHeaderHtml`（→ `headerHtml` に改名）・`scriptApplicantSecHtml`・`scriptJudgmentSecHtml`、押印・最終合否（`mgmtHtml`・`reportScript`。`mgmtNoteHtml` は台本の文だけ）。**削除**: `scriptRec`、`descRows`〜`unconfirmed`、`hs*`、留意点・強み、貢献度、旧評価（`scoreRows`〜`interviewTotal`・`legacySecHtml`）、詳細の `judgmentHtml`・`headerHtml`・`tile*`・`dashHtml`、`scriptDashHtml`（K4 の `.dash`）、`fullBodyHtml`、`stepLabel` の詳細版。`ivS` は `interviewModel(clProf, clRec)`。本文の並び: `rtool` → `#reportPaper` → ヘッダー → 応募者情報 → 面接チェックリスト → 採用可否判定 → `#clSheet.cl-sheet-print` → 応募者の管理 → foot |
| B6 | 保存 HTML の埋め込みスクリプト（generateReportHTML 末尾） | `rtPrintSheet`・`rtPrintAll`・`prep()`・`window.__prepareHandoffSheet`・`printingAll`・beforeprint の `has-cl`/`print-handoff` 判定 | `b`・`a`・`prep`・`__prepareHandoffSheet`・`printingAll` を削除。beforeprint は `if(!bd.classList.contains("view-report")\|\|bd.classList.contains("print-checklist"))return;` だけ（詳細表示の Ctrl+P はブラウザ既定＝全文）。`__prepareChecklistSheet`・`__fitChecklistPaper`・`__setReportView` は残す。ES5・文字列連結のまま |
| B7 | `storage.checklistSheetHtml` | `R.isScriptRecord`・`prof.mode`・`record.scores` | `prof = Object.assign({}, profile, { checklist: def })`、`R.checklistSummary(a, cl, prof, { management: record.management })`。`clOnePageHtml(record, profile, o, def, sum)` |
| B8 | `storage.normalizeChecklistDef`・`validateChecklist` | `R.CHECKLIST_AUTO`・`CL_AUTO_PARAM_RULES` | D8。検査は `kind`・選択肢・id・文言・総合判断・必須条件の設定だけ |
| B9 | `storage.decisionConfig`・`decisionFields` | `management.fields`（既定 3 欄） | 変更不要（`stampField` が欄に無ければ `'final'`、無ければ `''`）。既定 2 欄で `'final'` が残る |
| B10 | `storage.parseProfileJSON` | `obj.handoffRules` を必須にしている | `obj.meta` があり、かつ `checklist`・`management`・`handoffRules` のどれかがあれば受け付ける（スリム後の書き出しと旧 JSON の両方を読む） |
| B11 | `app.applyRecord` | `R.buildHandoff`・`state.scores`・`legacyRecord`・`R.isScriptRecord`・`emptyApplicant(p)` の deepMerge | 3-2 の `S.normalizeRecord` を使う |
| B12 | `app.renderSummary` | `R.buildHandoff`・`interviewModel(p, state.scores, …)`・`contribSummaryHtml` | 台本の分岐だけ。`scriptSummaryHtml` 内の `R.interviewModel(p, {}, cl)` → `(p, cl)` |
| B13 | `app.saveRecord` | `rebuildHandoff`・`isScript` | `const rejudged = state.judgmentStale && !state.judgment; ensureJudgment();` |
| B14 | `app.applyVisibility` | `analyzeShifts` ほか多数 | `#grp-graduation` だけ: `show('#grp-graduation', f.graduationDate !== false && R.isStudentGroup(R.categoryGroup(p, a.category)))` |
| B15 | `app.bindGlobal` の beforeprint | `clModel().mode !== 'checklist'`・`print-handoff` | `if (state.view !== 'judge' \|\| document.body.classList.contains('print-checklist')) return;` |
| B16 | `settings.clMax` | `interviewModel(draft, {}, emptyChecklist())`・`evaluation.items` | `interviewModel(draft, emptyChecklist()).max` |
| B17 | `settings.coerce` | data-type `lines`/`managers`/`options`/`categories` | 変更不要（4 種とも残る節で使う） |
| B18 | `app.managementCardHtml`・`checklistStampsHtml`・保存 HTML `#mgmt` | `.stamp-row` 3 列 | D10: `fields.length === 2` のとき `class="stamp-row cols-2"` |

`interviewModel(` の呼び出し箇所は全部直すこと: `grep -n "interviewModel(" src/*.js tests/*.js`。

---

## 3. 旧データの正規化（落ちないこと）

### 3-1. プロファイル（`storage.normalizeProfile(p, report)`）
```
function normalizeProfile(p, report) {
  const raw = U.isObj(p) ? p : {};
  const base = defaults();
  if (Object.keys(raw).length && (Number(raw.schemaVersion) || 1) < 2) {      // K5・D6
    if (report) report.v1Reset = true;
    return base;
  }
  if (report && raw.mode === 'full') report.fullModeRemoved = true;
  if (report && REMOVED_KEYS.some(k => raw[k] !== undefined)) report.stripped = true;
  // REMOVED_KEYS = ['mode','inputStages','stageOptions','highschoolPolicy','params','handoffRules','contribution','matrix']
  const out = { schemaVersion: 2 };
  out.meta     = 4 つの文字列（theaterName / appTitle / version / footer）。文字列でなければ既定
  out.features = { graduationDate: raw.features?.graduationDate === undefined ? base値 : raw.features.graduationDate !== false }
  out.options  = { genders: 空でない文字列配列なら採用・なければ既定,
                   categories: {value:非空文字列, group:文字列（無ければ 'other'）} の配列。0 件なら既定 }
  out.evaluation = { thresholds: { recommendPct, reviewPct } }   // 数値でなければ既定値（範囲の検査は validateProfile）
  out.texts    = { recommend:{title}, review:{title}, reject:{title}, disclaimer, bandLabels:{high,mid,low},
                   script:{recommend,review,reject,missing,mustGate,adjusted} }   // 各値は文字列なら採用・なければ既定
  out.management = fillManagement(raw.management, base)        // D4: id 'initial' を除外、名簿・decision は従来どおり
  out.checklist  = fillChecklist(raw, base)                     // normalizeChecklistDef（auto/autoParams/negatives を外す）
  // 担当と連動する押印欄が無くなったら直す
  if (out.checklist.header.interviewerField && !欄にある) out.checklist.header.interviewerField = 欄に 'interviewer' があれば 'interviewer'、無ければ ''
  return out;
}
```
- **冪等**: `normalizeProfile(normalizeProfile(x))` と `normalizeProfile(x)` が同じ JSON（単体テスト）。
- `loadProfile(report)`: 保存なし → `defaults()`。JSON が壊れていたら `defaults()`。
- app の toast（`profileNotice(rep)`）:
  - `rep.v1Reset` → **「古い形式のため既定の設定を使います」**（この文で始める。続けて「（劇場名・名簿などは設定画面で入れ直してください）」可）
  - `rep.fullModeRemoved` → 「詳細モードは終了しました。面接チェックリストの 3 ステップで開きます。」
  - `init()` は `rep.v1Reset || rep.fullModeRemoved || rep.stripped` のとき `S.saveProfile(state.profile)`（localStorage から古いキーを消す。toast は前 2 つだけ）。
  - `importProfileText`: 確認ダイアログ → 置き換え → `toast(profileNotice(rep) || 'プロファイルを読み込みました')`。
- 書き出し（`onExport`）は正規化済みの draft なので削除キーは出ない。

### 3-2. 応募者レコード（新規 `storage.normalizeRecord(rec)`。DOM 非依存・単体テスト対象）
```
const APPLICANT_KEYS = ['name','gender','age','category','graduationDate','reviewerNotes'];
function normalizeRecord(rec) {
  rec = U.isObj(rec) ? rec : {};
  const R = global.RecruitRules;
  const src = U.isObj(rec.applicant) ? rec.applicant : {};
  const applicant = {}; APPLICANT_KEYS.forEach(k => applicant[k] = src[k] == null ? '' : String(src[k]));
  const mg = {}; if (U.isObj(rec.management)) Object.keys(rec.management).forEach(k => {
    if (k !== 'initial' && U.isObj(rec.management[k]) && rec.management[k].name) mg[k] = U.deepClone(rec.management[k]); });
  const ver = Number(rec.schemaVersion) || 1;
  const scores = U.isObj(rec.scores) ? rec.scores : {};
  const legacy = {
    v1: ver < 2,
    scores: ver < 2 || Object.keys(scores).some(k => isNum(scores[k])),          // K3
    full: rec.mode === 'full' || (rec.mode !== 'script' && U.isObj(rec.handoff)), // D12
    initial: U.isObj(rec.management) && U.isObj(rec.management.initial) && !!rec.management.initial.name
  };
  return {
    applicant,
    checklist: U.deepMerge(R.emptyChecklist(), U.isObj(rec.checklist) ? U.deepClone(rec.checklist) : {}),  // header/values/notes を補う
    checklistDef: U.isObj(rec.checklistDef) ? rec.checklistDef : null,
    interviewNotes: typeof rec.interviewNotes === 'string' ? rec.interviewNotes : '',
    management: mg,
    decision: normalizeDecision(rec.decision),
    judgment: U.isObj(rec.judgment) && rec.judgment.result ? rec.judgment : null,   // 再開ステップと「異なります」の判定にだけ使う
    step: [1, 3, 4].indexOf(Number(rec.step)) >= 0 ? Number(rec.step) : 1,         // 2（申し送り）は 1
    savedAt: rec.savedAt || null,
    theaterName: U.isObj(rec.profile) ? String(rec.profile.theaterName || '') : '',
    legacy
  };
}
```
`app.applyRecord(rec)` は `const n = S.normalizeRecord(rec)` を使って state を作り直す（`scores`・`handoff` 系は持たない）。`ensureChecklist()` を呼ぶ。
**再開ステップ**（`hasCl = R.checklistHasInput(n.checklist)`）:
```
if (n.legacy.full || n.legacy.v1) target = hasCl && n.judgment ? 4 : 3;   // 旧評価・詳細モードの記録は評価を入れ直す前提で ② を開く
else if (n.judgment && n.step === 4) target = 4;
else target = hasCl ? 3 : 1;                                              // ② で保存した記録は ② から再開（E6）
```
**toast**（順に連結。「。」区切り）:
1. 既定: `{name} さんのデータを読み込みました`／劇場名が違えば「このファイルは「X」の設定で保存されています。現在の設定で判定し直します」
2. `legacy.full` → 「詳細モードで保存された記録です。面接前の詳細（勤務条件・留意点・シフト貢献度など）は読み込みません（元のファイルはそのまま残ります）」
3. `legacy.scores` → 「旧形式の面接評価（10 項目×5 点）は読み込みません。面接チェックリストで評価し直してください」
4. `legacy.initial` → 「初期対応者の押印欄は廃止したため表示しません」
5. 旧 `legacy.*` が無く、`target === 4` で保存時の判定と再判定の `result` が違う → 従来の「保存時の判定（…）と現在の設定での再判定（…）が異なります」
6. `checklistDef` の確認点の差（`checklistDiff`）→ 従来の文

旧レコードの `reviewerNotes`（詳細モードでは「面接者への申し送りコメント」）は ① の「メモ」として表示・再保存される（仕様として許容）。

### 3-3. 保存レコードの形（`buildRecord(state)`）
```
{ kind: 'recruit-applicant-record', schemaVersion: 2, savedAt, profile: { theaterName, version, schemaVersion: 2 },
  step, applicant /* 6 キー */, checklist, checklistDef, interviewNotes, management, decision, judgment }
```
削除: `mode`・`inputStages`・`handoff`・`scores`・`contribution`・`highschool`。`judgment` は `evaluateScript` の戻り値（`mode: 'script'` を含む。D9・B2）。

### 3-4. 入力 → 期待結果（テストで固定）
| 入力 | 期待 |
| --- | --- |
| localStorage が空 | 既定（8 キー・押印 2 欄）。toast なし |
| 保存済み設定 `mode:'full'`＋handoffRules など | 3 ステップで開く・toast「詳細モードは終了しました…」・localStorage から削除キーが消える |
| 保存済み設定の押印欄 3 つ（初期対応者の表示名を変えたもの含む） | `interviewer`・`final` の 2 欄（表示名は保存値を維持） |
| v1 プロファイル（`v1-profile-other.json`） | 既定値・toast「古い形式のため既定の設定を使います」 |
| スリム後に書き出した JSON | そのまま読める（`handoffRules` 無しでも可） |
| `v1-record.html`（schemaVersion 1・scores） | エラーなし・② を開く・toast に「旧形式の面接評価」 |
| `legacy-full-checklist.html`（詳細モード・回答あり・2 軸の判定） | エラーなし・③ 報告書・回答は保持・toast に「詳細モードで保存された記録です」・再保存で `mode/handoff/scores/contribution/highschool/inputStages` が無い・applicant は 6 キー以内 |
| `legacy-full-stamps3.html`（初期対応者／面接対応者／最終確認を押印） | `state.management` に `initial` が無い・押印欄 2 つに印・再保存 HTML に `data-field-id="initial"`・「初期対応者」が無い |
| 既存の台本モード記録（E3 で作る）・消極属性入り記録（E7） | 従来どおり |

---

## 4. 削除後の設定画面

### 4-1. 節と並び（ナビの `href` も同じ 5 つ）
`#s-meta` 劇場情報 → `#s-applicant` 応募者の属性 → `#s-checklist` 面接チェックリスト → `#s-mgmt` 応募者の管理（押印） → `#s-io` プロファイルの書き出し／読み込み。先頭に `issuesHtml()`、末尾に `.save-bar`（変更を破棄／設定を保存）。
**無くなる節**: `s-mode`・`s-texts-script`・`s-advanced`（`details.settings-advanced`）・`s-features`・`s-stages`・`s-options`・`s-busy`・`s-params`・`s-hs`・`s-rules`・`s-checklist-full`・`s-contrib`・`s-matrix`・`s-texts`。

### 4-2. `data-bind` 一覧（これ以外は出さない。e2e E10 で照合）
- `s-meta`: `meta.theaterName` `meta.appTitle` `meta.version` `meta.footer`
- `s-applicant`: `options.categories`（data-type categories）`options.genders`（lines）`features.graduationDate`
- `s-checklist`:
  - 判定: `checklist.mustFailResult` `checklist.mustUnknownResult` `checklist.overallCaps.hold` `checklist.overallCaps.reject` `checklist.mustFailJumpTo` `evaluation.thresholds.recommendPct` `evaluation.thresholds.reviewPct`
  - 総合判断: `checklist.overallLabel` `checklist.overallHint` `checklist.overallOptions.hire` `.hold` `.reject`
  - ヘッダー: `checklist.header.interviewerField` `checklist.header.posting.label` `checklist.header.posting.options[m].label`
  - 印刷: `checklist.print.showQuestions`
  - 台本: `checklist.title` `checklist.version` `checklist.intro` `checklist.pages[k].title` `checklist.pages[k].lead`、`checklist.sections[i].title|minutes|minutesMax|page|lead`、`…blocks[j].title|note|memo|memoLabel`、`…items[k].label`、`…items[k].hint`（rating）、`…items[k].shortOnly`（explain）、`…items[k].short`（question・notify・fields）、`…items[k].kind`・`…items[k].options`（fields。data-type options）
- `s-mgmt`: `management.fields[i].label` `management.fields[i].hint`（欄の数だけ。既定 2）`management.managers`（data-type managers）`management.allowFreeName` `management.decision.enabled|label|hireLabel|rejectLabel|hint|stampField|autoStampFinal|filenameSuffix`
- `s-io`: なし（ボタンだけ）
- **消える bind**: `mode`、`texts.*`、`evaluation.holdOn*`、`…items[k].auto`・`…autoParams.*`、`features.*`（graduationDate 以外）、`options.*`（2 つ以外）、`inputStages.*`、`stageOptions.*`、`params.*`、`highschoolPolicy.*`、`handoffRules[*]`、`contribution.*`、`matrix.*`

### 4-3. `data-action`
残す: `save` `discard` `export` `import` `reset`、`cl-sec-add|del|up|down` `cl-block-add|del|up|down` `cl-item-add|del|up|down` `cl-default`。削除: `busy-*` `stages-*` `rule-default` `cl-period`。

### 4-4. `validateProfile` に残す検査
面接評価の帯（高 > 中・0〜100%）、`validateChecklist`（auto 系を除く）、最終合否の表示名、`stampField`・`interviewerField` が欄に無いときの警告。`mode`・貢献度・繁忙期・割合・マトリクス・時刻・高校生の検査は削除。

### 4-5. 文言
節の説明から「詳細モード」「Step3」「Step4」「2軸判定」「応募情報から」「貢献度」を消す（`stepRef` は ①②③）。`s-io` の注記「古い形式の JSON を読み込んだ場合は、新しい設定項目が既定値で補われます」→「v1 形式の JSON は読み込むと既定の設定になります。削除した機能の設定は読み飛ばします」。

---

## 5. テストの整理

### 5-1. 単体（`tests/rules.test.js`。87 件 → 目安 30 件）
- 冒頭: `P()` を `S.defaults()` に、`PS()` は `P()` に統合。読み込むファイルは今と同じ（util・stamp・config・rules・storage）。
- ヘルパー: `emptyApplicant`・`A`・`allAnswered`・`judge`・`exampleB`・`strongApplicant`・`HO`・`allChecks`・`scoresAll` を削除。`merge`・`clAll`・`clMarks`・`CL_ID`・`clAllIds`・`hasWarn` は残す。`judgeCL` は削除し、`judgeS(cl, p) = R.evaluateScript({ name: 'テスト 太郎' }, cl, p || P(), OPTS)` を足す。`A(...)` を使っていた残すテストは `SA(over)`（6 キーの応募者）に置き換える。
- **削除**: #01〜#52（詳細モードの判定・留意点・貢献度・マトリクス・v1 移行・段階・describeApplicant・保存レポートの詳細）、#56（旧評価との切り替え）、#57〜#60（`evaluateHiring` のチェックリスト版。台本版は #73〜#75 にある）、#62（checklistAuto・firstContractEnd）、#72（運用モード）。
- **改**: #53 押印（`initial` → `interviewer`/`final`。2 欄の HTML）、#54（`P().evaluation.items` の確認 → `evaluation` のキーが `thresholds` だけ・項目に `auto` が無い）、#55（`judgeCL` → `judgeS`。点数・帯・`thresholds.*Pts`・`breakdown`・counts は同じ期待値、警告文は evaluateScript の文に）、#61 の強み・懸念を #73 に移す（旧方式の部分は削除）、#63（autos・mode を外す）、#64（auto/autoParams の検査 → 「外れること」の検査に）、#65（auto の検査を削除）、#66（保存レコード: 3-3 の形、`scores`・`handoff` が無い。v1 fixture は #85 へ）、#69（`v1-profile-other.json` を使う部分を新しい v2 の JSON に）、#71・#76・#77（詳細モードの記録・checklistAuto の部分を削除）、#80・#81（`isScriptRecord`・`mode` を使っていれば外す）。
- **追加**（#82〜）:
  - #82 既定プロファイル: トップレベル 8 キー、`management.fields` の id が `['interviewer','final']`、`features` は `graduationDate` だけ、`options` は 2 つ、台本の全項目に `auto`/`autoParams` が無い、`texts` のキー。
  - #83 `normalizeProfile`: 3 欄（初期対応者の表示名を変更）→ 2 欄・表示名維持、独自の欄（`extra3`）は残る、`fields: []` → 既定、`interviewerField: 'initial'` → `'interviewer'`、`decision.stampField: 'initial'` → `'final'`、`legacy-profile-full.json` → 削除キーが無い・`report.fullModeRemoved`・`report.stripped`、冪等。
  - #84 v1 → `defaults()` と同じ・`report.v1Reset`、`{}` は toast なし、`parseProfileJSON` がスリムの書き出し（handoffRules なし）を読み、`{}`・`{foo:1}`・meta なしを拒否。
  - #85 `normalizeRecord`: `v1-record.html`（applicant 6 キー・`legacy.v1/scores/full`）、`legacy-full-checklist.html`（回答の件数が同じ・`legacy.full`）、`legacy-full-stamps3.html`（`initial` が無い・`legacy.initial`）、年齢が数値 → 文字列、`step: 2` → 1、`null`・`{}`・`applicant: 'x'` で例外なし。
  - #86 `buildRecord`: キーが 3-3 と一致（`mode`・`handoff`・`scores`・`contribution`・`highschool`・`inputStages` なし）。
  - #87 `generateReportHTML`: `class="dash"`・`rtPrintSheet`・`rtPrintAll`・`__prepareHandoffSheet`・`print-handoff`・`printingAll`・「初期対応者」・「詳細モード」・「シフト貢献度」・「留意点」が無い（埋め込み JSON を除いた部分で）、`#rtPrintChecklist` の表示名「A4 で印刷（1 ページ）」、`#mgmt .stamp-box` が 2 つ・`stamp-row cols-2`、body クラス `view-report has-cl mode-script`、record に `scores` があっても旧評価の節を出さない。
  - #88 公開 API: `R.buildHandoff`・`evaluateHiring`・`computeContribution`・`isScriptMode`・`isScriptRecord`・`checklistAuto`・`hasNumericScore`・`firstContractEnd`・`CHECKLIST_AUTO`・`S.V1_DEFAULT_TEXTS` が `undefined`、`R.interviewModel(P(), cl)` の新しい引数で #55 と同じ点。

### 5-2. e2e（`tests/e2e.js`。E1〜E39 → E1〜E11）
**振り直し表**（期待値は緩めない。削除した機能に関する期待値だけを「無いこと」の確認に置き換える）
| 新 | 旧 | 内容・変更点 |
| --- | --- | --- |
| E1 | E32 | 3 ステップ・① 応募者。最初の「mode の無い設定 → 台本モード（toast）」は「`mode:'full'`＋handoffRules の保存済み設定 → 3 ステップで開く・toast『詳細モードは終了しました』・保存済み設定から `mode`・`handoffRules` が消える」に置換。`isScriptMode` の確認は削除。`absent32`（詳細項目なし）はそのまま |
| E2 | E33 | ② → ③。「押印（3 欄）」→ **2 欄**（`#mgmtCard .stamp-box` が `interviewer`・`final` の 2 つ、`.stamp-row.cols-2`） |
| E3 | E34 | 押印 → 保存 → 保存 HTML。`r34.mode === 'script'` → `!('mode' in rec) && !('handoff' in rec) && !('scores' in rec)`。`in34` から `rtPrintAll` を外し `out34` に `id="rtPrintAll"`・`id="rtPrintSheet"`・`class="dash"` を追加。`dash34` → `.dash` が無いこと。`pb34` → `['rtPrintChecklist']`＋表示名「A4 で印刷（1 ページ）」。節の並び `['applicant','checklist','judgment','mgmt']` は維持 |
| E4 | E35 | **書き換え**: 旧レコードの読み込み（3-4 の表の fixtures 3 つ）。`saved25`/`r25` の代わりに `tests/fixtures/legacy-full-checklist.html` と、その埋め込み JSON を `parseRecord` で読む。設定画面・使い方の確認は E10 へ移す。運用モードの切替部分は削除 |
| E5 | E36 | 「台本モードの記録を詳細モードで読む」部分（前半）を削除。ダークの紙・390px は維持 |
| E6 | E37 | 先頭の `names37`（詳細 → 台本に戻した画面名）は「画面名は 報告書の作成／面接チェックリスト報告／手順」の確認として残す（文言だけ直す）。`dr37`（`.dash [data-tile="result"]`）→ `.dash` が無いこと（結果はヘッダー `.rh .verdict` と紙の `.cl-tile-res` で確認済み） |
| E7 | E38 | 変更なし |
| E8 | E39 | 押印欄 4 件のケース: `mk39` の `for (let i = 3; …)` を `for (let i = p.management.fields.length; i < (o.fields \|\| 0); i++)` に、アプリ側は 2 件 push して 2 件 pop（4 件・2 段・1 ページの期待値は維持） |
| E9 | 新 | 押印欄 2 つ: アプリ `#mgmtCard`・紙 `#appPaper`・印刷用 `#clSheet .cl-stamps`・保存 HTML `#mgmt`・右サマリー `#sumStamps`・設定 `s-mgmt` に「初期対応者」が無く欄は 2 つ。localStorage に 3 欄の設定（初期対応者の表示名を変更）を入れて再読込 → 2 欄・表示名維持。最終合否で「最終確認」に自動押印 |
| E10 | 新 | 設定画面: 節が 4-1 の 5 つだけ（順序も）・ナビ 5 リンク・`data-bind` が 4-2 の許可リスト（正規表現で照合）だけ・重複なし・「詳細モード」「2軸」「貢献度」「留意点」「初期対応者」の文字が無い・保存／破棄／初期化・書き出した JSON に `mode`・`handoffRules` 等が無い・`v1-profile-other.json` の読み込みで toast「古い形式のため既定の設定を使います」・`legacy-profile-full.json` の読み込みで 2 欄。使い方: help-step 3 つ・「詳細モード」「初期対応者」「2軸」の文字が無い |
| E11 | 新 | 保存 HTML の印刷: `#rtPrintChecklist` だけ・`.dash`/`#rtPrintSheet`/`#rtPrintAll`/`window.__prepareHandoffSheet` が無い・報告書表示で `emulateMedia('print')`＋beforeprint 相当 → `print-checklist` が付き PDF 1 ページ・詳細表示では `print-checklist` が付かない（全文）。アプリの ③「A4 で印刷」も PDF 1 ページ（押印 2 欄） |

**ヘルパーの整理**
- `fresh()` は `localStorage.clear()`＋reload だけ（K8）。`freshScript` は削除して `fresh` に統一。`ensureFullMode`・`fillBasic`・`busyAllFull`・`checkAll`・`toHandoff`・`checkDeferred`・`setStage`・`copyHandoff`・`inPreFill`・`preFillOpen`・`openPreFill`・`handoffIds`・`handoffItem`・`contribution` を削除。`judgment()` から貢献度・マスの項目を外す。
- 旧 E30 の中で定義されている `shownIn`・`txtIn`・`dispIn`・`SASA`・`newReportPage`（と `pdfPages30`/`pdfText30` は `pdfPagesOf`/`pdfTextOf` に置換）、旧 E32 の `stepNav`・`stepLabels`・`fillScript`・`overflowX`・`sshot` を**ヘルパー節（`// ---------- helpers ----------`）へ移す**。
- 起動部（旧 196–202）の `ensureFullMode()`・`shot('01-step1-empty.png')`・`names0` の確認を削除（`setFixedTime`・`goto`・`wait` は残す）。
- ファイル冒頭のシナリオ一覧コメントを新番号で書き直す。スクリーンショット名（40-…〜49-…）はそのままでよい。
- 未使用になったヘルパーは消す（`node --check tests/e2e.js` と名前の grep で確認）。

### 5-3. fixtures（`tests/fixtures/`）
| ファイル | 扱い |
| --- | --- |
| `v1-record.html` | 残す（K8） |
| `v1-profile-other.json` | 残す（v1 → 既定の toast の確認に使う） |
| `v1-profile-shinjuku.json` | 削除（v1 移行専用） |
| `legacy-full-checklist.html` | **追加**: full-mode-last の e2e が出力する `tests/shots/saved-checklist.html`（詳細モード・回答 16 件・判定 matrix。応募者「面接 花子」） |
| `legacy-full-stamps3.html` | **追加**: 同 `tests/shots/saved-stamps-3.html`（初期対応者／面接対応者／最終確認の 3 印。応募者「押印 太郎」） |
| `legacy-profile-full.json` | **追加**: full-mode-last の既定プロファイル＋`mode:'full'`＋劇場名「TOHOシネマズ テスト」＋初期対応者の表示名「受付担当」 |

作り方（**変更を始める前に**。既に変更していてもタグから作れる）:
```
cd /home/user/claude-code-practice
git worktree add <scratchpad>/fml full-mode-last
cd <scratchpad>/fml/recruit-system && node build.js && node tests/e2e.js     # tests/shots を作る（数分）
cp tests/shots/saved-checklist.html  /home/user/claude-code-practice/recruit-system/tests/fixtures/legacy-full-checklist.html
cp tests/shots/saved-stamps-3.html   /home/user/claude-code-practice/recruit-system/tests/fixtures/legacy-full-stamps3.html
node -e 'const vm=require("vm"),fs=require("fs");const c=vm.createContext({});c.window=c;["util.js","config.default.js"].forEach(f=>vm.runInContext(fs.readFileSync("src/"+f,"utf8"),c));
const p=JSON.parse(JSON.stringify(c.RECRUIT_DEFAULT_PROFILE));p.mode="full";p.meta.theaterName="TOHOシネマズ テスト";p.management.fields[0].label="受付担当";
fs.writeFileSync("/home/user/claude-code-practice/recruit-system/tests/fixtures/legacy-profile-full.json",JSON.stringify(p,null,2)+"\n");'
cd /home/user/claude-code-practice && git worktree remove <scratchpad>/fml
```
（df3b339 の作業ツリーに未変更なら、今ある `recruit-system/tests/shots/` の同名ファイルをコピーしてもよい。mtime は commit 後。）
fixtures に入れてよい実名は「笹川 晴央」だけ。上の 2 ファイルの応募者名・名簿は架空名（と笹川 晴央）であることを `grep` で確認する。

---

## 6. 実装順（壊れにくい順）と各段階の確認

各段階の共通確認: `cd recruit-system && node build.js`（`</script` 検査を通ること）。
スモーク（ページエラーなしで 3 画面を開ける。scratchpad に置いて実行）:
```
node -e 'const {chromium}=(()=>{try{return require("playwright")}catch(e){return require("/opt/node-tools/node_modules/playwright")}})();
(async()=>{const b=await chromium.launch(),p=await b.newPage(),E=[];p.on("pageerror",e=>E.push(e.message));p.on("dialog",d=>d.accept());
await p.goto("file://"+process.cwd()+"/dist/toho-recruit-judge.html");for(const v of ["settings","help","judge"]){await p.click(`.nav-item[data-view="${v}"]`);await p.waitForTimeout(200);}
console.log(E.length?E:"no pageerror");await b.close();})()'
```

| 段階 | 作業 | 確認 |
| --- | --- | --- |
| 0 準備 | 5-3 の fixtures を作る。基準値を記録: `git show full-mode-last:recruit-system/dist/toho-recruit-judge.html \| wc -c`、`for f in src/*.js src/styles.css; do echo "$f $(git show full-mode-last:recruit-system/$f \| wc -l)"; done` | fixtures 3 つが存在・`grep -c "recruit-record"` が 1 |
| 1 テスト | 5 章のとおり単体・e2e を書き換え（新しい期待値で書く） | `node --check tests/rules.test.js tests/e2e.js`。単体を走らせ、失敗が「新規・変更したテスト」だけであることを一覧で控える |
| 2 設定 | settings.js（4 章） | build・スモーク。`grep -nE "draftScript\|modeHtml\|s-advanced\|contrib\|matrix\|handoffRules\|inputStages\|CHECKLIST_AUTO\|legacyEval" src/settings.js` が空 |
| 3 app | app.js（1-5・2・3-2 の applyRecord）、index.html（1-7）、styles.css（1-6） | build・スモーク・`node tests/e2e.js`（この時点の失敗は storage/config 由来＝ `rtPrintAll`・`.dash`・押印 2 欄・レコードのキー・toast の項目だけのはず）。`grep -nE "isScript\(|buildHandoff\|handoff\|computeContribution\|scores\|legacy\|print-handoff\|preFill\|shiftConfirm" src/app.js` が空（`state.applicant` の 6 キーと toast 文言を除く） |
| 4 storage | storage.js（3-1〜3-3、2 章 B4〜B10、reportCss） | 単体 #82〜#88 のうち storage 分が通る。`node tests/e2e.js` の E3・E4・E9〜E11 が通る |
| 5 rules | rules.js（1-2）。**先に** `grep -noE "R\.[A-Za-z_]+" src/app.js src/storage.js src/settings.js \| sort -u` で残る参照が 1-2 の公開一覧に収まることを確かめてから消す | 単体全件（config 依存の #82 以外）・スモーク |
| 6 config | config.default.js（1-1） | **単体全件・e2e 全件が通る**（`ALL PASSED`・`ERRORS: none`）。PDF は pdfinfo があれば 1 ページ |
| 7 docs | 1-9。README（詳細モードの節 135 行以降・運用モード・設定・テスト件数・ファイル構成・設計方針の 留意点/2軸/運用モード を削除・更新）、HANDOFF（下記）、SPEC の移動 | `grep -rnE "SPEC\.md\|SPEC-stages\.md" README.md docs/*.md src tests` が archive への参照だけ |

HANDOFF の書き換え: 見出しの「フェーズ6 完了時点」→「面接特化（2026-10-14）完了時点」。1 章（現状）は台本モードの 3 ステップ・保存 HTML・押印 2 欄・設定 5 節だけに書き直す。2 章の決定事項は G・H・I を残し、A〜F を削除して新しい行「J. 面接特化（2026-10-14）: 詳細モード・面接前の機能・初期対応者の押印を削除」を追加。3 章（ver4.4 の移植状況）・4 章のうち詳細モードの TODO・5 章の早見表の詳細モード行・7〜9 章を削除（押印は 2 欄の記述に直して残す）。末尾に **「削除済み機能」節（5 行程度）**: ① 2026-10-14 の副支配人の指示と削除した範囲（詳細モード〔面接前の詳細入力・申し送り・面接で確認する項目・シフト貢献度・2軸判定・高校生方針・入力の段階〕、初期対応者の押印欄、旧 10 項目×5 点の評価、v1 プロファイルの移行、保存 HTML の「レポート全体」印刷とダッシュ）② 削除前のコードはタグ `full-mode-last`（df3b339）③ 仕様は `docs/archive/SPEC.md`・`SPEC-stages.md` ④ 旧データの扱い（旧レコードは読めるが詳細・旧評価・初期対応者の印は読み飛ばす。v1 プロファイルは既定）⑤ 作業仕様は `docs/SPEC-slim.md`。

**最終確認**（全部 exit 0）:
```
cd /home/user/claude-code-practice/recruit-system
node tests/rules.test.js
node build.js && node tests/e2e.js
grep -rnE "isScriptMode|isScriptRecord|buildHandoff|computeContribution|evaluateHiring|inputStages|handoffRules|print-handoff|__prepareHandoffSheet|rtPrintAll|rtPrintSheet|hasNumericScore|checklistAuto|V1_DEFAULT_TEXTS|初期対応者" src/
#   → 空。例外として許すのは storage.normalizeProfile の REMOVED_KEYS（'handoffRules','inputStages' の文字列）と normalizeRecord の 'initial' 判定・コメントだけ
grep -c "詳細モード" src/*.js   # → app.js の toast・storage/settings の正規化コメント以外 0
git status --short               # 想定外のファイルが無いこと（コミット・push はしない）
```
**サイズの報告（K9）**: `wc -c dist/toho-recruit-judge.html`（前 808,821 bytes）と、src の行数の表（前: util 92・stamp 209・config 623・rules 2,375・storage 2,253・settings 1,268・app 3,645 ＝ JS 計 10,465 行、styles 1,130、index 79）。**JS 計が 6,279 行以下（40% 以上減）**であること。テスト件数（単体・e2e のチェック数）の前後も添える。

---

## 7. 落とし穴

1. **build.js の閉じタグ検査**: src の JS に `</script` という文字列があると build が止まる。保存 HTML のスクリプトは `SCRIPT_END = '</scr' + 'ipt>'` を使う。コメントにも閉じタグを書かない（この仕様の説明をコメントに貼らない）。
2. **保存 HTML の埋め込みスクリプト**（generateReportHTML 末尾の 2 本目の `<script>`）: `window.__prepareHandoffSheet = prep`・`prep()`・`rtPrintSheet`（変数 `b`）・`rtPrintAll`（変数 `a`）・`printingAll` が 1 本のスクリプトに絡んでいる。`printingAll` は beforeprint でも参照しているので、片方だけ消すと **ReferenceError（保存 HTML のページエラー）** になる。ES5（`var`・文字列連結）のまま書く。`clFitSheet.toString()` を埋め込んでいるので `clFitSheet` 内にコメントを書かない・ES5 のまま。
3. **CSS の print-handoff**: styles.css（890–943）と reportCss（`@page sheet`・`body.print-handoff …`）の両方にある。reportCss の `@media screen` の 4 規則は `:not(.print-checklist):not(.print-handoff)` の連結なので、`:not(.print-handoff)` だけ消して `:not(.print-checklist)` は残す。`@media print` の `body.print-checklist #decision,body.print-handoff #decision,body.print-handoff .rh-decision` も前半を残す。
4. **index.html の `#clSheet`** はアプリの A4 印刷のホスト（`prepareChecklistSheet`）なので消さない。保存 HTML 側の `#clSheet.cl-sheet-print` とは別物。
5. **共有 CSS**: `.score-seg`・`.seg-btn` は「面接評価」の見出しの下にあるが、台本の ○△×・一致／不一致・求人のボタン（`clSegHtml`）が使う。`.table`・`.list-x`（`#scriptWarnings`）・`.empty` も残す。
6. **`interviewModel` の引数変更**（D7）: rules（checklistSummary 内 2 か所・evaluateScript）、app（`clModel`・`scriptSummaryHtml`）、storage（generateReportHTML の `ivS`）、settings（`clMax`）、単体テスト。古い 3 引数の呼び出しが残ると `cl` に `{}` が入り、点が 0 になる（例外にならないので気づきにくい）。
7. **`U.deepMerge` は配列を丸ごと置き換え、知らないキーも残す**。プロファイルは deepMerge に頼らずホワイトリストで組み立てる（3-1）。応募者も `deepMerge(emptyApplicant(), rec.applicant)` をやめて 6 キーだけ拾う。
8. **`R.round1`**（app の `fmtNum`）、**`R.categoryGroup`・`R.isStudentGroup`**（卒業予定年月の表示）、**`RESULT_RANK`**（evaluateScript）、**`bandOf`** は消さない。
9. **ステップの内部キー**（D1）: `STEPS` を 1・2・3 に詰めると、e2e の `[data-step="3"]`・`navStep(3)`・`record.step === 4`・`goStep(4)` がすべて壊れる。
10. **e2e のヘルパーが削除範囲（旧 E30・E32）で定義されている**（5-2）。範囲ごと消す前に移す。
11. **E8（旧 E39）の押印欄 4 件**: 既定が 2 欄になるので、`i = 3` から足すと 3 件にしかならない（期待値 `boxes === 4`・上限 890px が外れる）。正規化は独自の欄を残す（D4）ので、`normalizeProfile` 後も 4 件のまま。
12. **`checklist.header.interviewerField`・`decision.stampField` に `'initial'` が入った旧設定**: 3-1 の補正と `decisionFields` で直る。直さないと ② の担当の初期選択や「最終確認に自動押印」が効かない。
13. **parseProfileJSON の判定**（B10）: スリム後に書き出した JSON には `handoffRules` が無い。今のままだと自分で書き出した JSON を読めない。
14. **localStorage の旧設定**: 正規化しても保存し直さないと、毎回 toast が出る・古いキーが残る（`init` で保存。3-1）。
15. **`mode-script`・`has-cl` の body クラス**は e2e（E3）と reportCss が参照するので、削除せず固定で付ける（D9）。
16. **旧レコードの判定**（D12）: `rec.mode !== 'script'` だけで判定すると、`mode` を書かないスリム後の記録まで「詳細モードの記録」と誤判定する。`handoff` の有無と組み合わせる。
17. **settings の `data-bind` の重複**: 帯の境界 `evaluation.thresholds.*` は `s-checklist` に 1 回だけ描く（`s-matrix` は消える）。
18. **ドキュメントのリンク切れ**: SPEC を archive に移したら README・HANDOFF・SPEC-checklist・src/tests のコメントの参照を直す。
19. **公開リポジトリ**: fixtures・テスト・ドキュメントに実在の人名を入れない（笹川 晴央 以外）。`git commit` / `push` はしない。
20. **dist はコミット対象**: 最後に必ず `node build.js` し直し、`dist/toho-recruit-judge.html` を更新した状態にする。
21. **`.stamp-row.cols-2` と狭い画面**: 2 クラスのセレクタは `@media` 内の `.stamp-row` より詳細度が高い。メディアクエリ側にも `.stamp-row.cols-2` を書かないと 390px で 2 列のまま（1-6）。
