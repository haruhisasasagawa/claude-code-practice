# 引き継ぎメモ — フェーズ3（入力の段階分け）完了時点

- フェーズ1（Fable 5.1）: UI と骨格（4 ステップ・設定画面・HTML 保存・判定エンジンの土台）
- **フェーズ2（Opus）: 新宿の運用要件（高校生ポリシー／繁忙期・3連休／オールナイト／2軸判定）を実装済み**。詳細仕様は `docs/SPEC.md`（確定版）
- **フェーズ3: 入力の段階分け（面接前に入力／面接時に確認）を実装済み**。詳細仕様は `docs/SPEC-stages.md`（確定版）。副支配人の要望「面接前の確認項目が多すぎる。繁忙期の出勤頻度などは面接の時に確認したい。面接に進めるかの判断は週何日・時間帯・勤務期間くらい。あとは留意点を引き継げるフリーコメントがあれば十分」への対応
- 本メモは「現状」「決定事項」「ver4.4 からの移植状況」「残 TODO」をまとめたもの。フェーズ2の記述のうちフェーズ3で変わった点は 1-7 に書いた（1-1〜1-4 はフェーズ2時点の記述に、フェーズ3の変更を追記している）

## 1. 現状の到達点

### 1-1. 画面
- 4 ステップ UI、右サマリーパネル（シフト貢献度のライブ表示・帯の目盛り）、ダークモード、印刷 CSS
- Step1 応募情報: カード順 = 基本情報 → 通勤 → 勤務条件 → **繁忙期・土日祝** → 深夜帯 → **オールナイト上映** → 外国籍 → その他（**フェーズ3で変更**: 基本情報（外国籍の該当を含む）→ 通勤 → 勤務条件 → 折りたたみ `#preFill`「面接前に分かっている項目があれば入力（任意）」→ `#notesCard` 申し送りコメント。1-7 参照）
  - 区分の選択肢に「（原則対象外）」「（条件付き）」を表示。高1・高2は `#hsPolicyAlert`（赤）、高3は「例外条件」パネル（進路決定・進路の種別・進学先、状態ピル）
  - 18歳未満の注意、年齢と区分の不一致、週の勤務日数の矛盾（最低>最大は Step1 で停止）、終電に間に合わない警告、オールナイト×深夜帯の矛盾
  - 繁忙期の表（○△× ＋ 日数。単位は 合計／週あたり／1回あたり、上限で自動丸め）、「すべて ○ にする」「未確認に戻す」
  - 新カードの見出しに貢献度の現在点（例「繁忙期 20.9/30」）
- Step2 申し送り: 高校生の状態行、「シフト貢献度（面接前の見込み）」カード（内訳バー・繁忙期ミニ表・面接で確認すること）、コピー文に貢献度と `[法令]` `[高校生]` の接頭辞（**フェーズ3**: 先頭に申し送りコメント、`#interviewTodo`「面接で確認すること」を独立カードに）
- Step3 面接評価: 「シフト条件の最終確認」カード（Step1 と同じ項目。未確認が残ると判定に進めない・該当欄に赤枠）（**フェーズ3**: 「面接で確認する項目」に拡張。id `#shiftConfirm` は維持）
- Step4 採用可否判定: 面接評価・シフト貢献度の点数と帯、3×3 マトリクス（該当マスに ▶）、マスの判定メモ、調整の経緯（「マトリクス: 採用推奨 → 最終: 上長最終判断要」）、両軸の内訳、繁忙期・オールナイトの表、判定履歴
- 旧形式（v1）ファイルの読み込み時は旧形式バナー（保存時の判定を併記）と、再判定が異なる場合の toast

### 1-2. 判定エンジン `src/rules.js`
- 法令定数 `LAW`（深夜 22:00〜翌5:00、年少者 18 歳ほか）と `LOCKED_RULES`（法令ルールは OFF・重要度変更不可）
- `analyzeShifts` … 時間帯の重なり（`periodicOverlap`）で深夜帯を判定（早朝勤務の取りこぼしを修正）、法定深夜、22 時までのクローズ日数（`legalCloseDays`）
- 公開判定関数 … `highschoolStatus` / `nightStatus` / `lastTrainCheck` / `weeklyDaysCheck` / `ageCategoryCheck` / `shiftConditionMissing` / `computeContribution`（UI と留意点で共用）
- `buildHandoff` … 留意点（重要度 → カテゴリ順の安定ソート）、強み、バッジ、貢献度・高校生・深夜の状態
- `evaluateHiring` … 面接評価 × シフト貢献度のマトリクス判定＋下げる方向だけの調整（`contribution_incomplete` / `unresolved_block` / `highschool_hold` / `legal_hold` / `overall_cutoff`）。`features.contribution=false` で従来の面接のみ判定
- 日時は `opts.now` で注入可能（単体テストで固定）

### 1-3. 設定・保存
- 設定画面の構成: 劇場情報 / 入力項目 / 選択肢 / 繁忙期・オールナイト / 判定パラメータ / 高校生の扱い / 申し送りルール / 面接評価 / シフト貢献度 / 2軸判定 / 結果文言 / 書き出し
  - 繁忙期は行エディタ（追加・並べ替え・削除、単位・上限・満点日数・重み・重点）。貢献度は項目ごとの ON/OFF・満点と合計表示。マトリクスは 9 マスのプルダウン＋帯の境界
  - 保存時に `RecruitStorage.validateProfile` で検証（エラーがあれば保存しない・一覧表示）
- `storage.normalizeProfile` … v1 → v2 移行（冪等）。劇場名が新宿なら新宿既定、他劇場は従来動作（高校生 allow・2軸 OFF・オールナイト OFF・繁忙期の日数／祝日／土日頻度の欄 OFF・v1 に無かった期間〈3連休・SW・春休み〉は追加しない・`shift_unanswered` ルール OFF）。移行時は toast
- 保存レコード `schemaVersion: 2`（保存時点の `contribution` と `highschool` のスナップショット付き）。レポートは 応募情報 → 申し送り → 強み → 追記 → シフト貢献度 → 面接評価 → 面接所見 → 採用可否判定（`.mx` 表、白黒印刷でも読める）

### 1-4. テスト（すべて緑）
- `node tests/rules.test.js` … 単体テスト 58 件（SPEC 9-1 の #1〜#37 ＋並び順・describeApplicant・P1・非破壊・保存レポートの繁忙期タグ、SPEC-stages 7-1 の #43〜#52）
- `node build.js && node tests/e2e.js` … 通しテスト 261 件の確認（SPEC 9-2 の E1〜E12 ＋ E13 高3例外を Step3 で入力 → 採用推奨 → 保存・読込、E14 showBeforeInterview=OFF、SPEC-stages 7-2 の E15〜E21。日時は 2026-10-10 に固定）
  - E1 主シナリオ（例A: 貢献度 65.4・high_high → 要判断未確認で上長判断 → 全チェックで採用推奨）／E12 保存 → 読込で新項目が復元
  - E2 高2（原則対象外・highschool_hold）／E3 高3 例外充足・17歳のオールナイト／E4 高3 18歳・未決定・深夜帯○
  - E5 例B（17.6・high_low・上長判断）→ 設定でマスを不採用推奨に変更して再判定
  - E6 終電の突合／E7 旧形式ファイル／E8 設定（期間追加・貢献度合計・LOCKED・検証エラー）／E9 旧プロファイル移行／E10 入力の整合／E11 2軸 OFF
  - E15 Step1 は面接前の項目だけ（必須も変わらない）→ Step2「面接で確認すること」→ Step3 で面接時の項目を入力して 2軸判定／E16 折りたたみで先行入力（`#preFillCount`・コピー文「■面接前に分かっている情報」）と区分の変更で「卒業後の継続」の置き場所が移る／E17 設定で段階を切り替える（busy・lateNight を pre にすると Step1 に出てメーター表示、外国籍の制約、一括ボタン、`requireDaysMax`、不正値の normalize）／E18 外国籍の該当だけ面接前（`#deferredItems` のチェック・入力、Step4 の「面接で確認」タグ）／E19 保存 → 読込（レポートの章・`inputStages` のスナップショット・段階情報の無い旧 v2 レコード・390px で横スクロールなし）／E20 面接で確認する項目の表示（外国籍「該当しない」で Step3 に外国籍のブロックなし・`#preFill` の summary は関係するセクションだけ・strict では `#deferredItems` に `shift_unanswered` なし・右サマリーの「うち要判断」・他劇場の旧プロファイルで「すべて確認済み」にしない／週の最大勤務日数の欄）
  - フェーズ3で既存シナリオに足した確認: E1（繁忙期カードは閉じた `#preFill` 内、Step2 の申し送りコメント・`#interviewTodo`・`shift_unanswered` が一覧に無い、コピー文の並び、Step3 の見出しと先行入力値）、E7（v1 ファイルの面接時の項目が Step3・折りたたみに出る、保存し直すと新しいレポート構成）、E9（他劇場の旧プロファイルも既定の段階）、E12（レポートの 2 章・`inputStages`・申し送りコメントの復元）、E14（`#contribPreview` を出さない）
  - e2e のヘルパー: `openPreFill` / `checkDeferred` / `setStage` / `copyHandoff` / `saveRecord`、`fillBasic({ preFill: false })` で折りたたみを開かない。`checkAll` は Step2 に出る項目（deferred・aggregate 以外）だけ検証。閉じた `<details>` の中身は Chromium で `offsetParent` が残るので `visible` / `shown` は `checkVisibility()` も使う
- fixtures: `tests/fixtures/v1-record.html`（フェーズ1で保存したレコード）、`v1-profile-shinjuku.json`、`v1-profile-other.json`。段階分け導入前の v2 レコードは E19 で保存ファイルから `inputStages` と印を取り除いて作る（fixture は増やしていない）

### 1-5. フェーズ2の最後に直した不具合
- 設定の保存・初期化・読み込みのあと、ナビで判定画面に戻ると古い留意点（Step2/3）と古い判定（Step4・サマリー・保存レポート）が残っていた → `renderStep` で stale なら作り直し、`invalidateJudgment()`（`state.judgmentStale`）で判定を無効化。入力・チェック・面接点の変更後も同様。保存時は現在の内容で再判定してから記録する
- 卒業予定年月を OFF にすると「卒業後も当劇場で継続」が描画されず、高3例外が満たせなかった → 常に描画（表示は学生かつ graduationDate ON、または高3例外の対象区分）
- Step3 の週日数で 2.5 や最低＞最大がそのまま通った → `validateDays()` を Step1 と共用、Step3 にも `#daysError`/`#daysWarn`
- かけもち「なし」に戻しても隠れた時間が外国籍の週28時間判定に合算された → `sideJob==='yes'` のときだけ合算
- 深夜帯○で帰宅手段が空欄だと深夜帯の留意点が1件も出なかった → `late_night_return_unknown`（要確認）を追加
- e2e の `checkAll` がスムーズスクロール中にクリックを取りこぼし、E11 が時々失敗した → スクロール停止を待ち `check()` で入れ、全件チェックを検証
- 設定画面で、再描画を伴う欄（帯の境界・重み・マトリクス等）を編集した直後に「設定を保存」などのボタンを押すと、`change` での再描画がクリックの途中でボタンを作り直し、**クリックが無視される**ことがあった（保存されない・エラーも出ない）。マウスを押している間は再描画を待つよう `settings.js`（`requestRepaint` / `bindPointer`）を修正。e2e E8 で検出

### 1-6. 完全性チェック後の修正
- 高3例外の入力欄（進路・進路の種別・進学先・卒業後も継続）を Step3「シフト条件の最終確認」にも表示（Step1 と同じ data-field）。`#shiftConfirmStatus` に「高3例外: 〇〇が未入力」。**判定は止めない**（決定事項 B「アプリは止めない」）。未入力のまま判定すると `highschool_hold` で上長最終判断要
- `highschool_hold` の理由文を状態ごとに分けた（原則対象外／例外条件が未入力／例外条件を満たさない）
- 副支配人回答の反映: 高3で進路が就職（`rejectCareerPaths`）なら `highschool_hold` で不採用推奨（継続意思が未入力でも。Step3 の案内文・例外条件バッジもそう表示）。調整で結果が下がったときは本文を `texts.adjusted` にし、マスの注記（`matrix.note`）は出さない（`matrix.cellNote` に残す）
- `contribution.showBeforeInterview=false` が右サマリー（`#sumContrib`）と Step1 のカード見出しメーターにも効くように（Step1・2 は点数・ゲージを出さず未確認のみ。Step3 以降は表示）。設定ヒントも実際の表示範囲に合わせた
- `migrateV1`（他劇場）: 上記 1-3 のとおり従来動作を保つ。2軸 OFF かつ `shift_unanswered` OFF・オールナイト OFF の劇場では Step3 の「シフト条件の最終確認」カードを出さない（`shiftConfirmOn()`）
- `validateProfile` に SPEC 4-5 の範囲チェック（貢献度の満点 0〜100 の整数、targets 1〜7、busyStrongPct 0〜100、勤務期間の最低月数 0〜60、繁忙期の上限日数 1〜62）
- 保存レポートの繁忙期表: 「重点」は `critical && weight>0` のときだけ。重み 0 の期間は「記録のみ」（アプリ表示とそろえた）
- Step3 で条件を変えると、上部の「未確認の留意点 N 件」を作り直す（入力欄は再描画しない。文言が変わった項目は未確認として数える＝判定時の rebuildHandoff と同じ件数）

### 1-7. フェーズ3: 入力の段階分け（`docs/SPEC-stages.md`）
- **セクションと段階**: `rules.js` `INPUT_SECTIONS`（13 セクション。`basic`・`work`・`notes` は固定で面接前）と `profile.inputStages`（10 セクション、`'pre'` / `'interview'`）。既定は 面接前 = 通勤・高3の例外条件・外国籍の該当、面接時 = 卒業後の継続（高3以外の学生）・外国籍の詳細・かけもち・繁忙期・土日祝・深夜帯・オールナイト・希望部署/応募経路。`stageOf` は `inputStages` が無い・不正なら `'pre'`、外国籍が面接時なら詳細も面接時に固定。`stageOptions.requireDaysMax`（**既定 ON**。最終修正で変更・SPEC-stages D9 改訂）・`preFillAlwaysOpen`（既定 OFF）
- **rules.js**: `INPUT_STAGES` / `INPUT_STAGE_LABELS` / `INPUT_SECTIONS` / `DEFERRABLE_RULES` / `AGGREGATE_RULES` と `stageOf` / `sectionLabel` / `sectionAsk` / `sectionActive` / `sectionRelevant` / `continueSection` / `sectionHasInput` / `interviewConfirm`。`buildHandoff` は面接時のセクションが空欄なだけの留意点に `deferred: true, section`、`shift_unanswered` に `aggregate: true` を付ける（条件・判定は変えない。判定時は従来どおり未確認として数える）。`describeApplicant` の行に `section`、`templateVars` に `{confirmSummary}` / `{confirmSections}`
- **Step1**: 段階 pre のセクションだけ表示。面接時のセクションは閉じた折りたたみ `#preFill` に同じ部品・同じ `data-field` で置く（必須にしない・メーターなし。値があれば自動で開き、`#preFillCount` に入力済みのセクション）。必須は 氏名・年齢・区分・通勤方法・通勤時間・曜日・時間・**週の最大勤務日数**・勤務期間（週の最大勤務日数は設定で任意にできる）。申し送りコメント（`reviewerNotes`）は最後の `#notesCard`。外国籍「該当する」で `#foreignStageHint`（在留カードの持参依頼）。「卒業後の継続」は 1 画面 1 か所（`state.continueAt`）
- **Step2**: 申し送りコメント（`#handoffComment`）→ 応募者 → `#interviewTodo`「面接で確認すること」（セクションごとに 未入力／未入力: …／入力済み（面接で再確認）、判定前に入力が必要）→ 留意点（`shownItems` = deferred・aggregate を除く。進捗と右サマリーも同じ分母）→ 貢献度の見込み（`showBeforeInterview` OFF ならカードごと出さない）→ 追記。コピー文は ■申し送りコメント → ■応募時の情報 → ■面接前に分かっている情報 → ■面接で確認すること → 留意点 → ■強み → ■シフト貢献度（面接前の見込み）→ ■追記（申し送りコメントの補足）（「■担当者所見」は廃止）。面接時に聞くセクション（繁忙期など）に未回答がある間は、貢献度の見込みの点数・帯を Step2・コピー文・右サマリーに出さない（「面接後に確定」。SPEC-stages D21）
- **Step3**: `interviewConfirmHtml()`「面接で確認する項目」に面接時のセクションを全項目表示（先行入力の値も表示・修正可）。`#shiftConfirmStatus` に「未入力（判定は止めません）」と「まだ入力のない項目」（かけもち・卒業後の継続など記録用の空欄も含め、空欄が残る間は「すべて確認済み」にしない）、`#deferredItems` で未入力のまま確認済みにできる（シフト条件が判定前に必須の設定では `shift_unanswered` は出さない）。外国籍「該当しない」の応募者には外国籍のブロックを出さない。他劇場（シフト条件を確定しない設定）でも週の最大勤務日数が空なら「週の勤務日数」を出す。上部の未確認件数は判定時と同じ全件（うち何件が Step3 で解消するかを併記）。`requireComplete`・`validateDays`・`validateContribution` は維持
- **Step4・保存**: 未確認の留意点に「面接で確認」タグと「面接で確認する項目へ」ボタン。サマリーは「応募時の情報」「面接で確認した情報」の 2 表。保存レコードに `inputStages` のスナップショット・items に `deferred` / `section` / `aggregate`（applicant のフィールド名・`schemaVersion: 2` は不変）。レポートは 応募時の情報 → 申し送りコメント → 申し送り（留意点）→ 強み・追記 → 面接で確認した情報（保存時点で未入力の一覧）→ シフト貢献度 → 面接評価 → 所見 → 判定。読込は現在の設定の段階で表示
- **設定**: `#s-stages`「入力の段階（面接前に入力／面接時に確認）」（セクションごとの select、`requireDaysMax`・`preFillAlwaysOpen`、「既定に戻す」「すべて面接前に入力（従来の並び）」）。`normalizeProfile` が `inputStages` / `stageOptions` を補い不正値を既定に戻す（冪等）。`shift_unanswered` の文言と `texts.contributionIntro` は旧既定と完全一致のときだけ新しい既定に差し替える
- **最終修正（抜け漏れ）**:
  - Step3 の入力から出た留意点（繁忙期× → `vacation_ng`〈要判断〉、オールナイト× → `allnight_ng`、22時以降× → `late_night_ng` など）が Step3 でチェックできず、Step2 に戻る往復が必要だった（戻らずに判定すると `unresolved_block`）→ Step3 に `#interviewNewItems`「面接で入力した内容から出た留意点」を追加（`#deferredItems` の直前）。対象は Step2 までの留意点（`state.handoffBase`）に無かった・文言が変わった項目と、段階が面接時のセクション（busy・allNight・lateNight・foreignDetail）のカテゴリの項目。上部アラートの「うち m 件は下で確認」と Step4 の「面接で確認する項目へ」ボタンにも含める（SPEC-stages 4-4b・D23、e2e E21）
  - `vacation_ng` の既定文言を「…面接実施の可否を判断してください」→「…事情と代わりに出られる時期を確認し、採用可否を判断してください」（繁忙期は既定で面接後に入力されるため）。旧既定と完全一致のプロファイルだけ normalize で差し替え（`V2_TEXT_UPGRADES.rules`）。重要度「要判断」の説明も「採用担当が面接実施・採用の可否を判断」に（rules.js `SEVERITY`・設定画面の凡例・README）
  - 週の最大勤務日数を既定で Step1 の必須に（`stageOptions.requireDaysMax` 既定 true）。ユーザー要望「面接に進めるかは週何日・入れる時間帯・勤務期間」に合わせた。設定で OFF にできる。他劇場の旧プロファイルも既定どおり ON
  - 面接前（Step1・2、判定なし）に保存したレポートでは、面接時の項目の章を「面接前に分かっている情報（未確認）」と表示（コピー文の「■面接前に分かっている情報」と表記をそろえた）。面接後・判定後は従来どおり「面接で確認した情報」
  - Step2 の応募者表の外国籍: 折りたたみで在留資格などを先に入れていれば値（＋「（面接で再確認）」）を出す（空のときだけ「該当（詳細は面接で確認）」）
  - Step2 の「担当者からの追記」を「追記（申し送りコメントの補足・任意）」に改名し、空のときは閉じた折りたたみ（フリーコメントは Step1 の申し送りコメントが基本。`handoff.note` の保存形式は不変）。コピー文・レポートの見出しも「追記（申し送りコメントの補足）」
- **フェーズ3の最後に直した不具合**: 設定画面の下部の保存バー（`.save-bar`）が 840px 以下で左右の余白（16px）と合わず、390px 幅で 12px 横にはみ出していた → `styles.css` に狭い画面用の余白を追加（E19 で確認）

## 2. ユーザー決定事項（変更しないこと）

| 項目 | 決定 |
| --- | --- |
| 配布形態 | 単一 HTML（`dist/`）。開発は `src/` 分割 + `build.js`。外部ライブラリ・CDN なし |
| ルール管理 | アプリ内の設定画面 + 劇場プロファイル JSON |
| 保存方式 | HTML ファイル（ブラウザ内の応募者一覧は持たない） |
| 利用端末 | 事務所 PC（ブラウザ） |
| A. フロー | 面接後の採用可否判定が主役。面接前は合否ゲートではなく「面接者への留意点の申し送り」（要判断 / 要確認 / 共有） |
| 追加項目 | 深夜帯（22 時以降）可否＋タクシー帰宅時の規定金額内確認、外国籍・在留資格・日本語レベル |
| B. 高校生 | 原則対象外。例外は高校3年生で進路が決定済み、かつ進学先へ行っても当劇場でアルバイトを継続する人のみ。高1・高2は「原則対象外」を赤で明示。高3は「進路決定済み」「卒業後も継続」を入力し、両方満たす場合のみ例外。それ以外は「要判断」で採用担当が最終決定（アプリは止めない） |
| C. 繁忙期 | 土日祝、特に世間一般の3連休以上（GW・お盆・SW・年末年始・夏休み等）の貢献度を重視。期間ごとに ○△× と出られる日数を入力させる。期間一覧は設定で増減可 |
| D. オールナイト | 深夜〜早朝の通しシフトに入れるか（○△×・頻度）を、22 時以降の深夜帯とは別軸で判定材料にする。18 歳未満は法令上不可 |
| E. 判定モデル | 面接評価とシフト貢献度を別々に点数化し、2軸マトリクスで最終判定。両軸の点数と内訳を画面と保存レポートに表示。配点・区切りは設定で編集可。「要判断が未確認なら採用推奨に留めない」は維持 |
| F. 入力の段階（フェーズ3） | 面接前（Step1）に入力するのは 基本情報（氏名・性別・年齢・区分・卒業予定年月）・高校生の表示と高3の例外条件・外国籍の該当（する／しない）・通勤・勤務条件（曜日・時間・週の最低/最大日数・勤務期間）・面接者への申し送りコメント。繁忙期ごとの可否と日数・祝日・土日の頻度、深夜帯（可否・帰宅手段・終電・タクシー料金）、オールナイト、かけもち、外国籍の詳細、希望部署・応募経路などは面接時（Step3）。段階は設定でセクションごとに変更可。判定ロジックは段階に依存しない |

統合時に決めた既定値と理由は `docs/SPEC.md` 10-1 を参照（未確認は 0 点にせず判定を保留、高3例外は進学のみ、18 歳以上の高3も深夜・オールナイト不可、など）。フェーズ3の決定事項（D1〜D20: セクション単位の段階、閉じた折りたたみでの先行入力、Step3 は全項目表示、`shift_unanswered` の条件は変えない、deferred / aggregate の印、週の最大勤務日数は既定で必須にしない、など）とリスクは `docs/SPEC-stages.md` 8 章。

## 3. ver4.4（水戸内原）からの移植状況

| ver4.4 のロジック | 新版での扱い |
| --- | --- |
| 60 歳以上は即不採用 | `age_limit` 要判断（採用担当の判断に委ねる） |
| 短期希望は即不採用 | `short_period` 要判断。勤務期間は貢献度（期間 10 点）にも反映 |
| 来年 3 月卒業 × 中期 → 要確認 | `graduation_midterm` 要確認。**フェーズ2で一般化**: 卒業までの残月数 < 勤務期間の最低月数（`workPeriods[].minMonths`）。「卒業後も継続する」なら出さない |
| かけもち（学生／非学生で文言分岐） | `side_job_student` / `side_job_nonstudent` 共有。かけもち先の週時間を外国籍の週28時間判定に合算 |
| 週最大 1 日 → 不可、2 日 → 要確認 | `weekly_days_one` 要判断、`weekly_days_low` 要確認。曜日数との矛盾は `weekly_days_mismatch`。貢献度（週日数 10 点） |
| 1 日 3 時間未満 → 要確認 | `short_shift` 要確認（`params.minShiftMinutes`） |
| オープン（7〜8 時開始）／クローズ（22 時以降）加点 | 強みバッジ＋**貢献度に反映**（オープン 5 点・クローズ/深夜 10 点。高校生・18 歳未満は 22 時までのクローズのみ加点） |
| 平日朝〜夕方は社保スタッフで埋まる → 要確認 | `weekday_daytime` 要確認（新宿で成り立つかは未確認） |
| 土日両方なし → 要確認 | `weekend_missing` 要確認。**フェーズ2**: 土日の出勤頻度（`weekend_freq_low`）と貢献度（土日 15 点） |
| マイカー加点、内原駅加点 | 削除。`commute_car` を共有（新宿は駐車場なし）に置換 |
| 通勤 90 分以上不可、60 分超マイナス | `commute_block` 要判断、`commute_warn` 要確認 |
| フリーター → 社保確認 | `freeter_insurance` 共有 |
| 夏休み・お盆 ×→不可、△→要確認 | **フェーズ2**: 「繁忙期」7 期間（3連休・GW・夏休み・お盆・SW・年末年始・春休み。設定で増減）。重点期間の × は `vacation_ng` 要判断、重点外の × は `busy_optional_ng` 要確認、△は `vacation_consult`。日数は貢献度（繁忙期 30 点）。祝日は `holiday_ng` / `holiday_consult` |
| 高校生: 許可確認、21 時まで運用 | **フェーズ2**: 新宿は原則対象外（`hs_out_of_policy`）、高3 例外（`hs_exception_ok` / `hs_exception_unmet` / `hs_exception_period`）、18 歳以上の高3の深夜（`hs_night_policy`）。`mode=allow` の劇場では従来の `highschool_permission` / `highschool_hours`（上限 `params.highschoolLatestEnd`=22:00）/ `highschool_time_violation` |
| （なし） | **フェーズ2 新規**: 法令ルール `minor_late_night` / `allnight_minor`（OFF 不可）、P1 の `under_working_age` / `minor_hours` / `minor_documents` |
| （なし） | **フェーズ2 新規**: オールナイト `allnight_ok` / `allnight_consult` / `allnight_ng`、`allnight_latenight_conflict`、`allnight_shift_conflict`、外国籍 `allnight_foreign_hours`。貢献度（オールナイト 15 点） |
| （なし） | **フェーズ2 新規**: 終電 `late_night_last_train_early`（最遅終了＋余裕 vs 終電）、`shift_unanswered`（面接で確認するシフト条件の集約）、`age_category_mismatch`、`graduation_past`、`foreign_busy_cap` |
| 専門学校生: 許可確認 | `vocational_permission` |
| 面接評価 10 項目 × 5 点、35 点以上推奨／20 点以上上長判断 | 同じ 10 項目。得点率 70% / 40% は**面接評価の帯（高/中/低）**として 2 軸判定に使う。2 軸 OFF の劇場は従来どおり |
| 総合判断 1〜2 点で警告 | `evaluation.overallWarnBelow`=3。足切り `overallRejectAtOrBelow`（既定 0 = 無効）を追加 |
| Step1 のスコア（4 点以上で面接進行可） | **廃止**。面接前の合否は採用担当の判断とし、アプリは留意点を出すのみ。代わりに Step2 で「シフト貢献度の見込み」を共有 |

その他の新規: `foreign_*`（資格外活動許可・週 28h・在留期限・日本語レベル）、`late_night_*`（可否・終電・タクシー規定額）、`shift_times_missing`、`weekly_days_unknown`、`holdOnUnresolvedBlock`（要判断が未確認なら採用推奨に留めない）、`holdOnHighschoolException`。

## 4. TODO

### 4-1. 副支配人に確認したいこと（試行後に設定で調整。SPEC 10-2）
- [x] マトリクス「面接中×貢献低」→ 不採用推奨に変更済み（副支配人回答）。「面接中×貢献高」は上長判断のまま
- [ ] 配点・帯・繁忙期の重み／満点日数は仮置き。過去の採用者 5〜10 人分を入力して試し打ちし調整
- [x] 高3 例外に「就職」は含めない。就職は不採用推奨（`highschoolPolicy.rejectCareerPaths`。進路ごとに設定可）。その他（浪人・未定など）は回答の対象外のため上長最終判断要のまま。推薦（秋）と一般入試（2〜3 月）の時期差・合格見込みの扱いは運用で判断（副支配人回答）
- [ ] 18 歳到達・卒業後（4 月以降）の区分更新は運用（記録上の区分変更）でよいか
- [ ] オールナイトの実際の時間帯（22:00〜翌6:00 は仮）、休憩・始発帰宅、タクシー規定との関係
- [ ] 土日頻度・オールナイト頻度の選択肢と割合が現場の感覚に合うか
- [ ] 面接前（Step2）に貢献度の点数を見せるか（`showBeforeInterview`）
- [ ] 留意点の文言・重要度・しきい値の精査（`config.default.js` → `handoffRules` / `params`）、設定画面のヒント文言
- [ ] 平日日中帯ルール（`weekday_daytime`）が新宿でも成り立つか

- [ ] **フェーズ3（SPEC-stages 8-3）**: 週の最大勤務日数を Step1 の必須にした（`stageOptions.requireDaysMax` 既定 ON。ユーザー要望に合わせた判断）ことでよいか。最低勤務日数は任意のまま
- [ ] **フェーズ3**: Step3「面接で入力した内容から出た留意点」に、Step2 で既にチェックした面接時のセクションの項目（例: 土日両日にチェックなし `weekend_missing`）も並ぶ（チェック状態は共通なので済みの表示）。多すぎると感じるなら対象を「Step2 までに無かった項目」だけに絞る（`app.js` `interviewNewItems`）
- [ ] **フェーズ3**: 「面接前に分かっている項目」を常に開いて表示するか（`stageOptions.preFillAlwaysOpen`）
- [ ] **フェーズ3**: 通勤・高3の例外条件・外国籍の該当を面接前のままでよいか、かけもち・外国籍の詳細・学生の卒業後の継続を面接時でよいか（`inputStages`）
- [ ] **フェーズ3**: 面接前（Step2）に貢献度の見込みカードを出すか（`contribution.showBeforeInterview`。OFF ならカードごと出さない）

### 4-2. 判定ロジック
- [x] `graduation_midterm` を「卒業までの残月数 < 勤務期間」の一般形に拡張
- [x] 週勤務日数と選択曜日数の矛盾チェック（`weekly_days_mismatch`、最低>最大は Step1 で停止）
- [x] 終電時刻 vs 最も遅い終了時刻の突合（`late_night_last_train_early`。P1 `params.closeShiftStandardEnd` で標準終了時刻とも突合可）
- [x] 外国籍の週時間推定にかけもち分を加算（`sideJobHoursPerWeek`）
- [x] 年齢と区分の整合（`age_category_mismatch`、`params.groupAgeRanges`）
- [x] シフト適合度を採用判定に反映（シフト貢献度＋2軸マトリクス。`features.contribution` で ON/OFF）
- [x] 「総合判断 N 点以下で不採用推奨」の足切り（`evaluation.overallRejectAtOrBelow`、既定 OFF）
- [x] 高校生の終了上限と 18 歳以上の高3の扱い（`highschoolPolicy.nightRestricted`）
- [ ] 長期休暇中 40h 上限の扱い（現状は `foreign_busy_cap` で説明のみ。学則の期間を知らないため貢献度は割り引かない）
- [ ] 評価項目ごとの重み（`evaluation.items[].weight`）
- [ ] 懸念項目（2 点以下）が N 件以上で一段階下げる
- [ ] 希望部署を判定に使うか（現状は記録用、既定 OFF）
- [ ] 生年月日入力（年齢は整数の自己申告。17/18 歳の境目・勤務開始日時点の年齢は面接で年齢証明書により確認する前提）
- [ ] マトリクスで「面接の帯が低いほど結果が良い」ような設定をしても警告しない（調整は下げる方向のみなので仕様上は許容）。必要なら `validateProfile` に警告を追加

- [ ] 段階が面接時の項目を面接で聞き漏らすと、deferred の要判断（資格外活動許可の空欄など）は Step2 に出ないまま判定時に未確認として残り上長最終判断要になる（安全側。SPEC-stages R4）。試行で運用上の負担にならないか確認

### 4-3. 設定画面
- [x] プロファイルのバージョン管理（`schemaVersion: 2`、移行は `storage.normalizeProfile` に集約）
- [x] 保存前の検証（`validateProfile`。エラーは保存しない）
- [ ] 留意点ルールの条件をノーコードで追加する簡易ビルダー（現状は条件＝コード、文言＝設定）
- [ ] `returnMethods` / `workPermitStates` のラベル編集（`careerPaths` はフェーズ2で編集可にした）
- [ ] 繁忙期エディタの「単位」プルダウンが 1440px 幅で文字切れ（動作には影響なし）
- [ ] `shift_unanswered` の文言や `texts.contributionIntro` を編集済みの劇場は、旧表記（「シフト条件の最終確認」）が残る（normalize は旧既定と完全一致のときだけ差し替える。設定画面で直せる。SPEC-stages R9）

### 4-4. 保存・互換
- [x] 旧形式（v1）の保存ファイル・プロファイルの読み込み（バナーと差分 toast。シフト条件未確定として採用推奨に留めない）
- [ ] ver4.4 形式ファイルの読み込み互換（DOM 解析で移行）が必要か確認
- [ ] 保存ファイル名の規則（現在 `応募者_氏名_YYYY-MM-DD.html`）。Playwright の Chromium では日本語のファイル名が `download` になる（アプリではなく自動テスト環境の挙動とみられる）。実機の Edge / Chrome で名前どおり保存されるか確認すること
- `app.js` は `schemaVersion < 2` かつ `vacationDays` が無いファイルを旧形式とみなす（新しい保存は `schemaVersion: 2`）

### 4-5. UI の細部
- [ ] Step2 の申し送り印刷レイアウト（Step4・保存レポートの印刷は対応済み）
- [ ] 時刻入力が OS ロケールにより 12 時間表記になる点の案内
- [ ] キーボード操作・フォーカス順（必須チェックは `checkRequired` で Step1・Step3 共通化済み）
- [ ] Step4「判定履歴」の留意点件数は判定時と同じ全件（deferred・aggregate を含む）。Step1・2 の「確認済み x/y」と右サマリーの要判断／要確認／共有は Step2 に出る項目だけを数え、面接で確認する分は「ほかに … n 件（うち要判断 k 件）」と内訳で出す（SPEC-stages D16・D22）。同じ応募者でも Step3 以降と数が違って見える（分かりにくければ履歴に内訳を出す）
- [ ] 保存レポートの見出し「応募情報」は「応募時の情報」「面接で確認した情報」（面接前の保存では「面接前に分かっている情報（未確認）」）に変わった。印刷手順書などで旧見出しを参照していれば更新が必要（SPEC-stages R10）

## 5. 触る場所の早見表

| やりたいこと | 場所 |
| --- | --- |
| 留意点の条件を追加 | `src/rules.js` `CONDITIONS` に関数追加 → `src/config.default.js` `handoffRules` に既定行追加（カテゴリは `CATEGORY_ORDER` のいずれか）。旧プロファイルへの追加は `storage.normalizeProfile` が既定行を補う |
| 法令値・ロックするルール | `src/rules.js` `LAW` / `LOCKED_RULES` |
| 文言・しきい値・繁忙期・配点・マトリクスの既定値 | `src/config.default.js` |
| 入力項目を追加 | `app.js` `emptyApplicant` → `rules.js` `INPUT_SECTIONS` のどのセクションに属するか（`fields`）→ 部品（`busyFieldsHtml` / `allNightFieldsHtml` など。Step1 本体・`preFillHtml`・`interviewConfirmHtml` で共用）→ `applyVisibility`、表示は `rules.js` `describeApplicant`（行に `section`） |
| 入力の段階（面接前／面接時）を変える | 既定値は `config.default.js` `inputStages` / `stageOptions`、補完は `storage.js` `fillStages`、判定は `rules.js` `stageOf`。新しいセクションは `INPUT_SECTIONS` と `inputStages` の両方に追加（単体テスト #43 が集合の一致を確認） |
| 未入力が原因の留意点を Step2 から外す | `rules.js` `DEFERRABLE_RULES`（セクションと「空欄のときだけ」の判定）。Step2 に出さないものは `AGGREGATE_RULES` |
| シフト貢献度の計算 | `src/rules.js` `computeContribution`（未確認の定義は `shiftConditionMissing`） |
| 採用判定の計算 | `src/rules.js` `evaluateHiring`、結果表示は `app.js` `resultStepHtml` / `axisMetricsHtml` / `matrixTableHtml` |
| 設定画面に項目を追加 | `src/settings.js` `template()`（`data-bind` のパスを書くだけ。合計や表を描き直す欄は `repaint: true`） |
| プロファイルの移行・検証 | `src/storage.js` `normalizeProfile` / `validateProfile`（単体テスト #30〜#36） |
| 保存データの項目を追加 | `src/storage.js` `buildRecord` / `generateReportHTML`、復元は `app.js` `applyRecord` |

変更後は `node tests/rules.test.js`、`node build.js` で `dist/` を再生成、`node tests/e2e.js` を通すこと。

## 7. 応募者の管理（押印）— 追加分

- 保存レポート末尾に「応募者の管理」セクション。`profile.management.fields`（既定: initial 初期対応者 / interviewer 面接対応者 / final 最終確認）ごとに押印枠。
- 名簿は `profile.management.managers`（`{ name, short, title }`）。設定画面「応募者の管理（押印）」で `氏名|印字名|役職` の行形式で編集。印字名を省略すると姓（スペースの前）。`allowFreeName` で名簿にない氏名の手入力を許可。
- ハンコは `src/stamp.js` の `stampSvg`（外部参照なしの純関数）。レポートには `RecruitStamp.source()` で関数ソースを埋め込み、レポート単体でも押印できる。
- レコードは `management: { <fieldId>: { name, short, title, date, at } }`。アプリ（Step2/Step4 の押印カード）とレポート（`#mgmt` + 「押印を保存」で `document.documentElement.outerHTML` を再出力）の両方で編集でき、読込で引き継ぐ。
- 既定の名簿はリポジトリ上では「笹川 晴央（副支配人）」のみ。新宿の所属メンバー 15 名（支配人 1・副支配人 1・MGR 13）は副支配人から受領済みで、**リポジトリが非公開になった後に `config.default.js` の `management.managers` へ反映する**（公開リポジトリに実名を置かないため）。それまでは名簿入りの配布 HTML を直接渡す。異動時は設定画面の名簿（氏名|印字名|役職|等級）を編集する。
- テスト: rules.test.js #53、e2e E22（アプリで押印 → 保存 → レポート上で押印・再出力 → 読込 → 印刷時の表示）。
