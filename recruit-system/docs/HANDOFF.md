# 引き継ぎメモ — フェーズ6（台本モード・既定）完了時点

- フェーズ1（Fable 5.1）: UI と骨格（4 ステップ・設定画面・HTML 保存・判定エンジンの土台）
- **フェーズ2（Opus）: 新宿の運用要件（高校生ポリシー／繁忙期・3連休／オールナイト／2軸判定）を実装済み**。詳細仕様は `docs/SPEC.md`（確定版）
- **フェーズ3: 入力の段階分け（面接前に入力／面接時に確認）を実装済み**。詳細仕様は `docs/SPEC-stages.md`（確定版）。副支配人の要望「面接前の確認項目が多すぎる。繁忙期の出勤頻度などは面接の時に確認したい。面接に進めるかの判断は週何日・時間帯・勤務期間くらい。あとは留意点を引き継げるフリーコメントがあれば十分」への対応
- **フェーズ4: 面接チェックリスト（面接台本 2026-10-08 版）を実装済み**。詳細仕様は `docs/SPEC-checklist.md`（確定版）。副支配人の要望「印鑑部分以外なんか微妙。添付の面接台本のチェックリスト（採点リスト）を入力して出力・報告できるようにしたほうがいい」への対応。Step3 の 10 項目×5 点の採点を台本のチェックリストに置き換え、A4「面接チェックリスト報告」を追加した（10 章）
- **フェーズ5: 保存 HTML の「報告書」表示と最終合否スタンプ（採用／不採用）を実装済み**。詳細仕様は `docs/SPEC-report.md`（確定版）。運用「面接者が報告書 HTML を出力 → 副支配人が開いて合否＋電子印 → 再出力してスレッドに添付」への対応（11 章）
- **フェーズ6: 台本モード（既定）を実装済み**。詳細仕様は `docs/SPEC-script-mode.md`（確定版）。副支配人の要望「応募者の名前と属性入れたらもう渡した面接台本のとおりの報告でいい」への対応。従来の 4 ステップは詳細モードとして残した（12 章）
- **2026-10-13: 入力の簡素化（消極属性の削除）を実装済み**。副支配人「消極属性って意味がわからないから削除でいいかも。ほか、入力が多いのでもう少し端的にできたらお願い」への対応。消極属性を両モードから全面削除し、① 応募者を 1 枚・3 行に、② のヘッダーを 1 行に圧縮、【説明】【合否連絡】に「すべて説明した」を追加（12-7、`docs/SPEC-script-mode.md` 12 章）
- 本メモは「現状」「決定事項」「ver4.4 からの移植状況」「残 TODO」をまとめたもの。**1 章〜11 章はフェーズ5までの記述で、すべて詳細モード（`profile.mode === 'full'`）の話**。既定の台本モードは 12 章。フェーズ2の記述のうちフェーズ3で変わった点は 1-7 に書いた（1-1〜1-4 はフェーズ2時点の記述に、フェーズ3の変更を追記している）

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
- `node tests/rules.test.js` … 単体テスト 85 件（SPEC 9-1 の #1〜#37 ＋並び順・describeApplicant・P1・非破壊・保存レポートの繁忙期タグ、SPEC-stages 7-1 の #43〜#52、押印の #53、SPEC-checklist 7-1 の #54〜#66、SPEC-report 8-1 の #67〜#71、**SPEC-script-mode 7-1 の #72〜#78（台本モード。#78 は 12-6）、#79（消極属性の削除・旧設定／旧レコードの互換＝12-7）**。#01〜#71 の `P()` は詳細モードのプロファイル）
- `node build.js && node tests/e2e.js` … 通しテスト 516 件の確認（**E1〜E31 は詳細モード**、E32〜E38 は台本モード＝12-4・12-7。SPEC 9-2 の E1〜E12 ＋ E13 高3例外を Step3 で入力 → 採用推奨 → 保存・読込、E14 showBeforeInterview=OFF、SPEC-stages 7-2 の E15〜E21、押印の E22、印刷の E23・E24、SPEC-checklist 7-2 の E25〜E29、SPEC-report 8-2・8-3 の E30・E31。日時は 2026-10-10 に固定）
  - フェーズ4: 既存シナリオの `scoreAll`（10 項目の採点）は `setCl` / `rateAll`（必須条件すべて一致・確認点すべて同じ印・総合判断）に置き換えた。E1 は ○4 △3＋採用 = 13/16（81.3%・高）でマトリクスの結果は従来どおり。E25〜E29 は 10-4
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
| G. 面接チェックリスト（フェーズ4） | Step3 の面接評価を面接台本（スタッフ面接チェックリスト 2026-10-08 版）のチェックリストに**置き換える**（10 項目×5 点は廃止）。面接評価の点数は台本の確認事項／確認点の ○△× と面接者の総合判断から算出し、2 軸判定（面接評価 × シフト貢献度）は維持。必須条件が 1 つでも不一致なら不採用推奨（台本どおり。設定で上長最終判断要に変更可）。必須条件は台本 PPTX の配置どおり ① の 2 件（土日含む週3日・5時間以上／指定繁忙期すべて可）。当初の決定で必須条件に挙げていたシフト提出ルール・シフト連絡は電話・欠勤・遅刻連絡は、PPTX では ② の【説明】だったため説明済みチェックにした（抽出テキストの誤読。8-3 で要確認）。「面接チェックリスト報告」を A4 1〜2 枚で印刷でき（台本と同じ ①〜⑤・記入済みチェック・メモ・確認点・判定・押印欄）、保存レポートにも同じ章を入れる |
| H. 台本モード（フェーズ6） | 既定は 3 ステップ（① 応募者〔1 枚・3 行: 氏名*・年齢・性別・区分（学生は卒業予定年月）／面接日・面接担当者・応募した求人（通常／短期）／タクシー可否・料金・メモ。氏名だけ必須〕→ ② 面接チェックリスト〔台本 2026-10-08 版の ①〜⑤。【説明】【合否連絡】は「すべて説明した」で一括チェック〕→ ③ 報告書〔A4 プレビュー・電子印・最終合否・保存 HTML／印刷〕）。面接前の詳細入力・留意点・面接で確認する項目・シフト貢献度・2 軸判定は台本モードでは一切表示しない。消さずに「詳細モード」として残し、設定の先頭「運用モード」で切り替える。mode の無い設定・プロファイルは台本モード。印鑑部分（電子印・最終合否・報告書 HTML の往復）はそのまま。**消極属性（短期希望・朝～12時のみ）は削除**（2026-10-13。両モードとも。旧レコードに残っていても読み飛ばす。12-7） |
| I. 台本の採点範囲（2026-10-13 確認済み） | 不採用推奨の足切りに使う必須条件は台本 PPTX の実配置どおり **2 項目**（土日含む週3日以上・5時間以上／指定繁忙期間すべて可）。シフト提出・電話連絡・欠勤連絡の 3 つは ② の【説明】チェックのまま（足切りには使わない）。確認点（○△×）は **7 項目**（報連相できるか／離職要因はないか を分け、台本冒頭の「最低限の話し方・敬語が可能か」を追加。16 点満点）。副支配人に選択肢で確認し「現状のまま」を選択。8-3 の要確認は解消 |
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

- [ ] **フェーズ4（SPEC-checklist 8-3・要回答）**: 確認点の分け方（② を「報連相」「離職要因」に分割、台本 1 枚目冒頭の「最低限の話し方・敬語」を ① に追加）でよいか。現在は確認点 7 行＋総合判断＝16 点満点。台本の字面どおり 5 行（①具体性・②報連相／離職要因・③業務理解・④チーム・⑤ミスマッチ）＋総合判断＝12 点にするなら、`config.default.js` の `rt_manner` を削除し `rt_hourensou`／`rt_turnover` を 1 行にまとめる（設定画面の削除でも同じ）。その場合は単体 #54（rating 7・max 16）・#55・#63 と e2e E25（13/16）・E28（満点 14→16）の期待値を直す。**未回答のため既定は 16 点のまま**
- [ ] **フェーズ4**: 総合判断の重み（今は確認点 1 行と同じ 2 点）。もっと重くするか
- [ ] **フェーズ4**: 総合判断「保留」→ 上長最終判断要、「不採用」→ 不採用推奨 の上限でよいか（`checklist.overallCaps`）
- [ ] **フェーズ4**: 必須条件が「未確認」のまま判定したとき、警告だけ（既定）でよいか、採用推奨に留めないか（`checklist.mustUnknownResult`）
- [ ] **フェーズ4**: 得点率の境界（高 70%・中 40%）が台本の感覚に合うか（16 点満点で 12 点以上が「高」、7 点以上が「中」）
- [ ] **フェーズ4**: 必須条件「土日を含む週3日以上、5時間以上」の見込みの判定（週の最低日数・1 回の拘束 5 時間）でよいか。「クリスマス」を年末年始に含めてよいか
- [ ] **フェーズ4**: 「OPEN／25時までの可否」を自由記述でよいか（選択式にするか）
- [ ] **フェーズ4**: A4 報告に質問文を載せるか（既定は載せる。`checklist.print.showQuestions`）、押印欄 3 つをそのまま載せてよいか
- [ ] **フェーズ4（重要）**: 必須条件（不一致で不採用推奨に固定）は台本 PPTX どおり ① の 2 件でよいか。「シフト提出は木曜23時」「シフト連絡は原則電話のみ」「欠勤・遅刻は分かった時点で連絡」は ② の【説明】（説明済みチェック）にした。これらも不採用ゲートにするなら設定で ①【必須条件】に行を追加する。既定を 5 件にする場合は `config.default.js` の `conditions_must` に `ex_submit`／`ex_phone`／`ex_absence` を移し（② の `continuity_explain` から外す）、単体 #54（must 2・explain 14）・#63（must 2）と e2e E25（`.cl-must-row` 2 行・`#clBreakdown` 必須 2 行）・E26 の文言、SPEC-checklist 1-3・3-6・3-7 を直す。**未回答のため既定は PPTX の配置（2 件）のまま**
- [ ] **フェーズ4**: 紙の台本の代わりに、Step2 から「空欄のチェックリスト（A4 2 枚）」も印刷できると便利か（今回は対象外）

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
| 台本の文言・項目を変える | 既定値は `src/config.default.js` `checklist`（セクション → ブロック → 項目。id はテスト・保存データのキーなので変えない）。劇場ごとには設定画面「面接チェックリスト」（`settings.js` `checklistHtml`）。補完・検証は `storage.js` `normalizeChecklistDef` / `fillChecklist` / `validateChecklist`。Step3 の描画は `app.js` `interviewStepHtml`（`clHeaderHtml` / `clSectionHtml` / `clBlockHtml`）、入力時の更新は `updateChecklistUI` |
| 必須条件の扱いを変える | 設定 `checklist.mustFailResult`（不一致: reject / review）・`mustUnknownResult`（未確認: none / review）・`overallCaps`。ロジックは `rules.js` `evaluateHiring` の (0a) must_conditions・(0b) must_unconfirmed・(2) 総合判断、面接評価の点は `interviewModel`、Step3 の判定前チェックは `app.js` `validateChecklist` |
| A4 報告の見た目を変える | `src/storage.js` `checklistSheetHtml`（HTML。'section' = レポートの章、'sheet' = A4 報告）と `checklistSheetCss`（アプリは起動時に `<style id="clSheetCss">` へ注入、レポートは `reportCss` の後ろ）。改ページ解除（1 ページ目があふれたとき、または 2 ページ目だけがあふれて全体なら 2 枚に収まるとき）はアプリ `app.js` `fitChecklistSheet` とレポートのインラインスクリプト `__prepareChecklistSheet`（どちらも 1040px）。'section' にも台本ヘッダー（面接日・担当（押印より）・目安・タクシー可否・料金・消極属性・応募した求人）とページ題名・前書き（`.cl-page-h`、「台本1枚目」）、確認点の hint（`.cl-hint`）を出す（sheet では hint は `print.showQuestions` ON のときだけ）。ヘッダーのチップは `.cl-hchip`、流れの注記は `.cl-sflow`（アプリ styles.css の Step3 用 `.cl-chip` / `.cl-flow` と名前を分けている。同じ名前にすると印刷で消える）。ページ数は e2e E27 で固定 |（※消極属性は 2026-10-13 に削除＝12-7）

変更後は `node tests/rules.test.js`、`node build.js` で `dist/` を再生成、`node tests/e2e.js` を通すこと。

## 7. 応募者の管理（押印）— 追加分

- 保存レポート末尾に「応募者の管理」セクション。`profile.management.fields`（既定: initial 初期対応者〔説明「応募受付を行った担当者」〕/ interviewer 面接対応者 / final 最終確認）ごとに押印枠。
- 名簿は `profile.management.managers`（`{ name, short, title }`）。設定画面「応募者の管理（押印）」で `氏名|印字名|役職` の行形式で編集（区切りは半角 `|` と全角 `｜` のどちらも可）。印字名を省略すると姓（スペースの前）。`allowFreeName` で名簿にない氏名の手入力を許可。
- ハンコは `src/stamp.js` の `stampSvg`（外部参照なしの純関数）。レポートには `RecruitStamp.source()` で関数ソースを埋め込み、レポート単体でも押印できる。
- レコードは `management: { <fieldId>: { name, short, title, date, at } }`。アプリ（Step2/Step4 の押印カード）とレポート（`#mgmt` + 「押印を保存」で `document.documentElement.outerHTML` を再出力）の両方で編集でき、読込で引き継ぐ。
- 既定の名簿はリポジトリ上では「笹川 晴央（副支配人）」のみ。新宿の所属メンバー 15 名（支配人 1・副支配人 1・MGR 13）は副支配人から受領済みで、**リポジトリが非公開になった後に `config.default.js` の `management.managers` へ反映する**（公開リポジトリに実名を置かないため）。それまでは名簿入りの配布 HTML を直接渡す。異動時は設定画面の名簿（氏名|印字名|役職|等級）を編集する。
- ハンコの文字は外周（r=42）の内側（半径 38.5）に収まるよう、印字名・役職の文字数で大きさを決め、それでも弦の幅を超えるときだけ `textLength` で詰める（`stamp.js` の `fitAttr`）。
- 埋め込み JSON（`#recruit-record`・`#recruit-mgmt-config`、レポート内の再出力も）は `< > &` を `\u` 形式にする（`storage.jsonForScript`）。値に閉じタグやコメント開始が入っても script 要素が壊れない。
- レポート上の押印は「押印を保存」まで未保存。未保存のまま離れると beforeunload で確認し、保存後も「再保存」できるよう保存バーを残す（書き出すファイルではバーは閉じた状態）。
- テスト: rules.test.js #53、e2e E22（アプリで押印 → 保存 → レポート上で押印・再出力・再保存 → 読込 → 印刷時の表示 → 特殊文字の手入力名 → 離脱時の確認）。

## 8. 申し送りシート（A4 1枚）— 追加分

- 方針: 「留意点・申し送りは基本 A4 ぺら 1」（副支配人）。Step2 の `[data-action="print-handoff"]` と保存レポートの `#rtPrintSheet` が `body.print-handoff` を付けて印刷する。
- アプリ: `styles.css` の `@media print body.print-handoff` ブロック。表示するのは `.sheet-head`（印刷専用見出し）・`#handoffCard`・`#interviewTodo`・`#handoffItems`・`#handoffNoteCard`（追記があるときだけ）・`#mgmtCard`（押印のみ）。留意点 9 件以上で `#handoffItems.sheet-2col`（グリッド 2 段組み）。`@page sheet` で余白 7mm/9mm。
- レポート: `section.sec[data-sec]`（pre / comment / handoff / interview / contrib / scores / judgment / mgmt）で絞り込み。`window.__prepareHandoffSheet(on)` を e2e から呼べる。
- 検証: tests/e2e.js E23 が最も重いサンプル（留意点 13 件・外国籍・深夜帯）で Playwright の `page.pdf` → `pdfinfo` のページ数 = 1 を確認（pdfinfo が無い環境では省略）。
- 1 枚に収まらない極端なケース（留意点 20 件超など）は 2 枚目に流れる。その場合は留意点ルールの ON/OFF で減らす運用。

## 9. 全体印刷の改ページ — 追加分

- 症状: 「出力する HTML を印刷すると空白が多い」。原因は `.result`（判定カード）や `.card` に `break-inside: avoid` が付いており、収まらないブロックが丸ごと次ページへ送られていたこと。
- 対応: 大きなブロック（`.sec` / `.card` / `.result`）は `break-inside: auto`、小さな行（`li.h` / `.bar` / `tr` / `.tile` など）だけ `avoid`。見出しは `break-after: avoid`。印刷時の余白・文字サイズを画面用より詰めた（レポート: `storage.js` の `@media print{...}`、アプリ: `styles.css` の `@media print`）。
- 結果（留意点 13 件のサンプル）: レポート 6 → 5 ページ（途中ページの下部空白は最大 15%）、アプリ Step4 の印刷 7 → 4 ページ。e2e E24 でページ数の上限を固定。

## 10. 面接チェックリスト — 追加分（フェーズ4。詳細は `docs/SPEC-checklist.md`）

### 10-1. 現状
- Step3 は「面接チェックリスト」。台本の順（① 勤務条件 10分 → ② 継続性・報連相 3分 → ③ 仕事内容の説明 10分 → ④ 集団行動特性 8分 → ⑤ 逆質問 最大10分・合否連絡）で、必須条件 一致／不一致、説明のチェック、質問文の表示とメモ、記入欄、確認点の ○△× と一言メモ、総合判断（採用／保留／不採用）を入力する。ヘッダーは面接日（自動で今日）・担当（名簿）・応募した求人・タクシー可否・料金と消極属性（応募情報から自動表示、手で上書き可）。既存の「面接で確認する項目」は ① の直後。（※消極属性は 2026-10-13 に削除＝12-7）
- 面接評価 = 確認点 ○2 △1 ×0 ＋総合判断 2/1/0 の得点率（既定 16 点満点）。2 軸判定・マトリクスはそのまま。必須条件に不一致があれば先頭の調整 (0a) で不採用推奨（設定で上長最終判断要）。不一致で打ち切ったときは確認点・総合判断・シフト条件が空でも判定に進める。
- Step4 と右サマリーに必須条件の結果と「面接チェックリストの結果」。保存レポートに「面接チェックリスト」の章（`data-sec="checklist"`）。A4「面接チェックリスト報告」は `body.print-checklist`（アプリ: `#clSheet.cl-sheet-host` に描いて印刷、レポート: `#clSheet.cl-sheet-print` ＋ 押印の節だけを印刷）。
- 旧データ: 10 項目×5 点の `record.scores` があり、チェックリスト未入力のファイルは旧方式で再判定し、Step3 に `#legacyScores`（読み取り専用）、レポートは「面接評価（旧形式・10項目×5点）」の表。チェックリストに 1 つでも入力するとチェックリスト方式に切り替わる（旧点数は参考としてレポートに残る）。`evaluation.items` は旧レコードの表示・再判定専用で、設定画面では読み取り専用。

### 10-2. 決定事項（SPEC-checklist 8-1 D1〜D20 の要約）
- D1〜D4: 10 項目×5 点を廃止し台本の ○△× ＋総合判断に。台本は `profile.checklist` のデータ（ブロック 7 種、判定に効くのは must・rating・総合判断だけ）。`evaluateHiring` は評価項目の出どころだけ `interviewModel` で差し替え（旧単体テスト #01〜#53 は無修正で緑）。
- D5: 確認点は 7（② を「報連相」「離職要因」に分割、「最低限の話し方・敬語」を ① に追加）。D6〜D8: 必須条件の不一致は (0a) で不採用推奨（既定）。reject 設定では結果が変わらなくても `must_conditions` を adjustments に積み、本文は `texts.mustGate`（点数を理由にしない）・理由は warnings の先頭・マスの注記は出さない。reject 設定時は確認点・総合判断・シフト条件が空でも判定可（review 設定では「省略可」「⑤ へ」の案内を出さず、確認点・総合判断は必須）、未確認は警告のみ（既定）。D9: 総合判断「保留」「不採用」で上限（`overallCaps`）。
- D10: 回答は項目 id キーのフラットな map（`record.checklist`）＋保存時点の台本 `record.checklistDef`（レポートは保存時の文言）。`schemaVersion` は 2 のまま。D11〜D12: 記入欄・タクシー・消極属性・必須条件の見込みは応募情報から自動「表示」するだけで、回答や応募情報へは書き込まない。（※消極属性は 2026-10-13 に削除＝12-7）
- D13〜D16: 質問は質問文＋ブロックのメモ、※短期求人のみの説明は短期求人のとき強調、⑤ にメモ欄を追加、担当は名簿の datalist（押印とは初期値を補い合うだけで自動押印しない）。
- D17〜D18: A4 報告は台本の 2 枚＝2 ページ。描画は storage.js の 1 関数をアプリとレポートで共用。D19: Step3 の名前は「面接チェックリスト」、軸の名前は「面接評価」のまま。D20: 旧プロファイルには既定の台本を補い、他劇場には toast で見直しを促す。

### 10-3. 触る場所
- `config.default.js` `checklist`（台本の既定値）、`evaluation`（旧形式専用）
- `rules.js` `interviewModel` / `mustSummary` / `checklistAuto` / `checklistSummary` / `checklistDiff` / `firstContractEnd`、`evaluateHiring` の (0a)(0b)(2)
- `app.js` `interviewStepHtml` / `updateChecklistUI` / `validateChecklist` / `checklistBreakdownHtml` / `prepareChecklistSheet` / `fitChecklistSheet` / `checklistStampsHtml`、`applyRecord`（`state.checklist` の復元・確認点の差の toast）
- `storage.js` `checklistSheetHtml` / `checklistSheetCss` / `normalizeChecklistDef` / `fillChecklist` / `validateChecklist`、`generateReportHTML`（章・ダッシュボードのタイル・判定ボックスの必須条件の行・ツールバー `#rtPrintChecklist`・`#clSheet`・`window.__prepareChecklistSheet`）
- `settings.js` `checklistHtml`（判定・総合判断・ヘッダー・印刷・台本の編集）

### 10-4. テスト
- 単体 #54〜#66（既定の台本・得点率・方式の切り替え・必須条件ゲート・未確認・総合判断の上限・マトリクス等価・強み/懸念・自動表示・ビューモデル・normalize・validate・保存とレポート〔章・A4 報告・メモのエスケープ・保存時の文言・質問文 OFF・旧形式・面接前〕）。
- e2e E25（入力 → 判定 → Step4 → 保存 → 読込 → レポート）、E26（必須条件ゲート）、E27（A4 報告。アプリ・レポートとも PDF 1〜2 ページを pdfinfo で確認。メモ 150 字・確認点メモ 40 字・説明すべて☑・面接所見 200 字の重いサンプルも 2 ページ。2 ページ目だけが重いサンプル〈④ 回答 800 字・所見 1,200 字〉も 2 ページ。印刷メディアでヘッダーのチップが表示され、PDF のテキストにタクシー可否・消極属性があること〈pdftotext〉）、E28（設定で台本を変更）、E29（旧データ・他劇場・390px・ダークモード）。E7 に v1 ファイルの旧方式（39/50）と保存し直したレポートの確認、E24 のレポート全体印刷の上限を 6 ページ（章が 1 つ増えた分）に変更。（※消極属性は 2026-10-13 に削除＝12-7）
- 実測（2026-10-13）: A4 報告 標準 2 ページ・重い 2 ページ（1 ページ目の高さ 約 810〜880px で、改ページ解除の 1040px までは余裕あり）。レポート全体印刷 6 ページ、アプリ Step4 の全体印刷 4 ページ。

### 10-5. フェーズ4で直した既存の不具合
- 同じ応募者ファイルを続けて読み込むと何も起きなかった（`#fileInput` の値を「読み込み」ボタン経由でしか空にしていなかったため、同じファイルを選び直すと change が起きない）。`onFileChosen` / `onProfileFileChosen` で読み取り後に値を空にした。フェーズ4の作業中、e2e の E24（E23 と同じ saved.html を続けて読み込む）が読込に失敗したまま空の Step1 を印刷して「2 ページ」と数えていることが分かった（上限内なので PASS していた）。修正後は実際の Step4 を 4 ページで印刷している。

## 11. 報告書表示・最終合否スタンプ — 追加分（フェーズ5。詳細は `docs/SPEC-report.md`）

### 11-1. 運用フロー
1. 面接者がアプリで面接チェックリストを入力・判定し、Step4 の押印欄「面接対応者」に電子印を押して「保存（HTML）」→ 社内スレッドに添付
2. 副支配人がその HTML をブラウザで開く（常に「報告書」表示＝A4 の面接チェックリスト報告の紙プレビュー＋「応募者の管理」節〔最終合否パネル＋押印欄〕）
3. 担当者（自分）を選んで「採用」または「不採用」を押す → 合否スタンプが押され、押印欄「最終確認」が未押印なら同じ担当者の電子印も自動で押される → 「押印を保存」で再出力（ファイル名の末尾に `_採用` / `_不採用`）→ スレッドに添付
4. 再出力ファイルをアプリの「読み込み」で開いても、合否・押印はすべて引き継がれる（Step4 の「最終合否」カード・右サマリー「採用・笹川」）

### 11-2. 決定事項（D1〜D12・X1〜X13 の要約）
- D1: 保存 HTML は常に報告書表示（`body.view-report`）で開く。表示は localStorage に保存しない。ツールバー `.rtool-view` の `#rtViewReport`「報告書」/ `#rtViewFull`「詳細」（`body.view-full`＝従来の全体レポート）。回答ありの記録（`body.has-cl`）は紙プレビュー＋「応募者の管理」節、回答なしは申し送りシート相当（pre / comment / handoff / interview / mgmt の節。`.dash` は隠す）。印刷 3 種（申し送りシート／面接チェックリスト報告／レポート全体）は表示に依存しない
- **X1 紙プレビューは `#clPaper`（`.paper-wrap#reportPaper > .paper#clPaper`）で、印刷用の `#clSheet` とは別に描く**。E27 が「画面で `#clSheet` は非表示」「報告印刷で見える `.page > *` は `clSheet,mgmt` だけ」を検証しているため。`checklistSheetHtml(..., { mode: 'sheet' })` を 2 回描く（紙 = `decisionId: 'clPaperDecision'`・`vdPaper`、印刷用 = 既定の `clDecision`・`vdSheet`）
- X2: 報告書表示の CSS はすべて `@media screen` かつ `body:not(.print-checklist):not(.print-handoff)`。`__prepareChecklistSheet(true)` の高さ計測（`.cl-fit`）中に `#clSheet` を隠さないため
- **X3: 報告書表示（回答あり）のままブラウザで印刷すると面接チェックリスト報告になる**（`beforeprint` で `prepCl(true)`、`afterprint` で戻す。「レポート全体」ボタンは `printingAll` で切替を抑止。回答なしは従来どおり全体）。**Playwright の `page.pdf()` も beforeprint / afterprint を発火する**ため、既存 E24 の「レポートの全体印刷 ≤ 6 ページ」は報告書表示で開いたファイルに対して面接チェックリスト報告（実測 2 ページ）を印刷して通る（E24 は変更していない）。全体レポートのページ数は E31 で「詳細」表示から検証し直している（実測 6 ページ）
- D2: `stamp.js` の `verdictSvg`（角丸二重枠・太字ゴシック・日付＋劇場名の副文・-3°・feTurbulence のにじみ・`class="verdict-stamp"`・`role="img"`・`aria-label`）。採用 朱 `#c8232c`／不採用 藍 `#1f4e8c`（色は設定値、文字は記録時の `decision.label`＝X8）。`hanko` クラスは付けない（既存のハンコ数え上げに混ざらない）
- D3: `record.decision = { result: 'hire'|'reject', label, date: 'YYYY.MM.DD', at, by: { name, short, title } } | null`。`buildRecord` は常にキーを書き、`parseRecordFromHTML` / `applyRecord` は `normalizeDecision` で整える（旧レコード・不正値は null）。`schemaVersion` は 2 のまま
- D4: `profile.management.decision`（`enabled` / `label` / `hireLabel` / `rejectLabel` / `hireColor` / `rejectColor` / `stampField: 'final'` / `autoStampFinal` / `filenameSuffix` / `hint`）。`normalizeProfile`（`fillArrays`）で補完、`validateProfile` は採用・不採用の表示名の空・同一をエラー、連動欄が無いと警告
- D5: 押す場所は保存 HTML の `#decision` パネルとアプリ Step4 の `#decisionCard`（同じ振る舞い）。`autoStampFinal` で `stampField` の欄が未押印なら同じ担当者の印も押す。ファイル名は `decisionFilename`（`基本名_採用.html`。付いている接尾辞は置き換え、冪等）
- **X5: 「取消」は合否だけを消す**。自動で押した「最終確認」の印は残る（押印は押印欄の「取消」で消す）
- D6: 合否の表示は (1) A4 報告の【判定サマリー】右端 `.cl-decision`（sheet のみ。未押印は点線枠「最終合否 未押印」。高さはタイル以下）、(2) `#decision` パネル、(3) Step4 カード、(4) 全体レポートのヘッダー `#rhDecision`。保存 HTML で押すと埋め込みスクリプトの `renderDecision()` が (1)(2)(4) と `data-filename` を描き直す
- D7・X10: 合否は判定とは独立（再判定・設定保存で消えない）。食い違い（採用 × 不採用推奨、不採用 × 採用推奨）は注記 1 行だけ
- X9: `decision.enabled=false` で合否の UI（パネル・カード・`.cl-decision`・ヘッダー・サマリー・ファイル名の接尾辞）を一切出さない。`record.decision` は消さずに往復する
- X11: 未押印の `#decision` は印刷しない（全体印刷のページ数を増やさない）。`print-checklist` / `print-handoff` ではパネルを出さない（報告には `.cl-decision` が出る）。申し送りシートには合否を出さない
- X12: 保存 HTML はライトテーマ固定（ダークモードでも紙・パネルとも明るい）。アプリのカードはトークンでダーク対応

### 11-3. 触る場所
- `stamp.js` `verdictSvg` / `decisionSheetHtml` / `decisionFilename`（`RecruitStamp.verdict` / `.decisionSheet` / `.decisionFilename`。`source()` に 5 関数。ES5・外部参照なし）
- `storage.js` `normalizeDecision` / `decisionConfig` / `decisionFields`（正規化）/ `decOpts`、`fillArrays`・`validateProfile`・`buildRecord`・`parseRecordFromHTML`、`checklistSheetHtml`（`.cl-judge-row` / `.cl-judge-main` / `.cl-decision`。外側の `class="cl-judge"` と `<ul class="cl-adj">` の形は単体 #66 のため維持）、`checklistSheetCss`（`.cl-decision` 系）、`reportCss`（`.rtool-view`・`.paper-wrap`・`.paper`・報告書表示の `@media screen`・`.decision` パネル）、`generateReportHTML`（`body.view-report[.has-cl]`・`.rtool-view`・`#reportPaper`・`#rhDecision`・`#decision`・mgmt-note の運用文言・埋め込み設定の `decision`、埋め込みスクリプト 1 の `setView` / `__setReportView` / beforeprint・afterprint、埋め込みスクリプト 2 の `renderDecision` / `initDecSel` / `pickPerson` / decide・undecide）
- `app.js` `state.decision`、`decisionCardHtml` / `rerenderDecisionCard` / `decide` / `decisionSummaryHtml`（`#sumDecision`）、`onContentClick` の `decide` / `undecide`、`onFieldEvent` の `data-decision-select`、`applyRecord` / `newRecord` / `saveRecord`（合否付きファイル名）、使い方
- `settings.js` `decisionSettingsHtml`（s-mgmt の末尾。プレビュー `#stVdHire` / `#stVdReject`）、`config.default.js` `management.decision`、`styles.css`「最終合否（Step4）」

### 11-4. テスト
- 単体 #67（verdictSvg・decisionSheetHtml・source を空の vm で実行）、#68（decisionFilename の付け外し・冪等）、#69（normalizeProfile の既定・不正値・stampField・冪等、decisionConfig の sub、validateProfile）、#70（normalizeDecision、buildRecord・parseRecordFromHTML の往復。DOMParser はこのテストの中だけスタブ）、#71（body の class・ファイル名・id の並び・合否 svg 4 つ・埋め込み設定・注記・回答なし・無効・section に出さない）
- e2e E30（アプリで面接 → 判定 → 面接対応者の押印 → 保存 → file:// で開くと報告書表示〔紙は白地・影・シート幅 718px〕→ 詳細／報告書の切替 → 笹川で「採用」〔紙・印刷用・パネル・ヘッダーに朱のスタンプ、最終確認の自動押印、`data-filename` が `_採用.html`〕→「詳細」のまま押印を保存 → 再出力ファイルは報告書表示・合否と押印が残り担当者を初期選択 → 面接チェックリスト報告の PDF〔2 ページ・「最終合否」「笹川晴央」を含む〕→ 報告書表示のままの印刷も報告〔2 ページ〕で、印刷後は報告書表示に戻る → アプリで読込〔Step4・右サマリー「採用・笹川」〕→ 再判定・再保存でも残る）
- e2e E31（不採用への切替〔藍・最終確認の印は増えない・接尾辞の付け替え・食い違いの注記〕→ 取消〔未押印・接尾辞なし・最終確認の印は残る・保存すると decision は null〕→ E22 の Step2 保存ファイルは申し送りシート相当 → 「詳細」で全節 → E23 のファイルを「詳細」から全体印刷 6 ページ → ダークモードでも紙は白地・黒字 → 1280/1440px で紙が画面内・390px は紙だけ横スクロール → アプリの取消・最終確認を外して「不採用」で自動押印・右サマリー「不採用・笹川」→ 設定の項目・OFF でカードとサマリーが消え記録は残る・ON で戻る）
- 実測（2026-10-13）: 面接チェックリスト報告（合否入り）2 ページ、報告書表示のままの印刷 2 ページ、「詳細」からの全体印刷 6 ページ、E24（報告書表示のまま全体印刷の経路）2 ページ。単体 77 件・e2e 418 件すべて緑
- e2e の注意: `emulateMedia({ media: 'screen' })` で戻すと、その後の `page.pdf()` も screen で描かれて印刷用 CSS が効かない（Playwright の挙動）。印刷のエミュレートを解除するときは `emulateMedia({ media: null })` を使う（E30 の「報告書表示のまま印刷」の前）
- スクリーンショット（`tests/shots/`）: `33-report-view.png`（報告書表示 1440px・採用押印後）、`34-report-view-dark.png`（ダークモード）、`35-report-full.png`（詳細・ヘッダーに合否）、`36-step4-decision.png`（アプリ Step4）、`37-report-view-narrow.png`（390px）。PDF `checklist-report-decision.pdf`（2 ページ）

### 11-5. 既知の制限
- チェックリストの回答が無い記録は、報告書表示のまま Ctrl+P しても全体印刷のまま（申し送りシートは「申し送りシート（A4 1枚）」ボタンで印刷する）
- 申し送りシートの印刷には合否を出さない（面接前の資料のため）
- ブラウザのメニューから印刷しても beforeprint で面接チェックリスト報告に切り替わる（報告書表示・回答ありのとき）。全体を印刷したいときは「詳細」に切り替えるか「レポート全体」ボタンを使う
- ブラウザ以外（メールやチャットのプレビュー等）で開くとスクリプトが動かず、合否・押印は押せない（表示は保存時点の内容）
- Playwright（Chromium）で file:// のページの「押印を保存」をダウンロードすると `suggestedFilename()` が `download` になることがあるため、e2e はファイル名を `body[data-filename]` と再出力 HTML の `data-filename` で検証している（実際のブラウザでは `a.download` に合否付きの名前を渡している）

## 12. 台本モード（既定）— 追加分（フェーズ6。詳細は `docs/SPEC-script-mode.md`）

### 12-1. 運用フロー
1. 面接者がアプリで **① 応募者**（氏名と属性・面接日・担当・求人・タクシー・メモ。1 枚・3 行＝12-7）を入れる
2. **② 面接チェックリスト**（面接台本 2026-10-08 版の ①〜⑤ ＋総合判断）を台本の順に入力する
3. **③ 報告書** を開くと A4「面接チェックリスト報告」のプレビュー（判定サマリー＝面接評価〔確認点〕・必須条件・総合判断・結果）が出る。押印欄「面接対応者」に電子印 →「報告書を保存（HTML）」→ 社内スレッドに添付
4. 副支配人が HTML を開く（報告書表示）→「最終合否」で採用／不採用（最終確認の印も自動）→「押印を保存」で再出力（`_採用` / `_不採用`）→ スレッドに添付
5. 再出力ファイルはアプリの「読み込み」で押印・合否ごと引き継げる（フェーズ5の往復はそのまま）

### 12-2. 決定事項（S1〜S3・Y1〜Y14 の要約）
- S1〜S3: 既定は 3 ステップ。詳細入力・留意点・面接で確認する項目・シフト貢献度・2 軸は台本モードで一切出さない（画面・サマリー・保存 HTML・印刷・ヘルプ）。詳細モード（`profile.mode === 'full'`）は ff2d405 と同じ動き
- **Y1 内部ステップキーは 1 / 3 / 4 のまま**（`state.step`・`data-step`・`record.step`）。表示番号だけ `STEPS_SCRIPT[i].no` で ①②③。`updateChecklistUI` の `state.step !== 3` などはそのまま。e2e の `navStep(3)` は台本モードでも面接チェックリスト
- **Y2 分岐の基準**: アプリは `R.isScriptMode(state.profile)`（app.js の `isScript()`。mode が 'full' 以外はすべて台本）。保存 HTML・`checklistSheetHtml` は保存時の `R.isScriptRecord(record)`（`record.mode === 'script'` だけ。mode の無い旧レコードは詳細）
- **Y3 `checklistAuto` は台本モードで自動なし**（手入力のみ。タクシー・記入欄・必須条件の見込みを出さない。消極属性は 2026-10-13 に削除）。`evaluateHiring` は常に `mode: 'full'` を渡して自動の見込みと照合する（詳細モードの判定は不変）
- **Y4 判定 `evaluateScript`**: 総合判断が基準（採用→採用推奨・保留→上長最終判断要・不採用→不採用推奨・未入力→上長最終判断要＋警告）。必須条件の不一致（既定 reject）は不採用推奨に固定し `must_conditions` を必ず記録、未確認は警告（設定で review）、`overallCaps` は下げる方向のみ（既定値では効かない）。○△× は面接評価として報告するだけ（採用なのに × があれば警告 1 行）。戻り値は `record.judgment` と同じ形（`mode: 'script'`、`contribution` / `matrix` / `highschool` は null、`must`・`overall` を追加）
- **Y5 台本モードの記録は回答が無くても `has-cl`**（紙プレビュー・A4 報告を常に出す。白紙の台本として印刷できる）
- Y6 台本モードでは留意点を作り直さない（`goStep`・`renderStep`・`saveRecord`）。`applyRecord` は従来どおり作る（詳細の記録のデータを保持）
- Y7 判定は ③ 報告書を開いたときに走らせる（③ を開かずに保存・A4 印刷したときもその場で判定する＝12-6 F1）。Y8「報告書へ進む →」は入力チェックで止めない（`data-action="judge"` のまま）。Y9 台本モードのアプリは Ctrl+P・トップバー 🖨 も A4 報告
- Y10・Y11 テスト: 単体の `P()` は詳細モード（`PS()` が台本）、e2e の `fresh()` は詳細モードの設定を書き込む（台本は `freshScript()`）
- Y12 mode の無い保存済みの設定は台本モードにし、`report.modeAdded` で 1 回だけ toast（`MODE_ADDED_MSG`）して保存
- Y13 設定画面は同じ data-bind をモードごとに 1 回だけ描く（台本モードでは区分・性別・卒業予定年月を「応募者の属性」、結果タイトル・注記を「結果文言（台本モード）」に描き、詳細モード用の節は `details.settings-advanced#s-advanced` に畳む）
- Y14 台本モードの本文は `texts.script`（recommend / review / reject / missing / mustGate / adjusted。シフト貢献度・2軸に触れない）

### 12-3. 触る場所
- `rules.js` `isScriptMode` / `isScriptRecord` / `OVERALL_RESULT` / `DEFAULT_SCRIPT_TEXTS` / `scriptApplicantRows`（台本順の応募者情報の行。アプリの Step② ヘッダー・右サマリーと保存 HTML で共用）/ `evaluateScript`、`checklistAuto` の台本分岐、`evaluateHiring` の `checklistAuto` 呼び出し
- `storage.js` `normalizeProfile`（mode・`report.modeAdded`）・`validateProfile`（運用モードのエラー）・`buildRecord`（`mode`）・`checklistSheetHtml`（`scriptRec`: 判定サマリー 4 枚・ヘッダーのチップ・備考・「面接で確認した勤務条件」なし）・`generateReportHTML`（`body.view-report.has-cl.mode-script`・`.rtool` の印刷 2 種・ヘッダー・ダッシュ 4 枚 `data-tile`・`applicant` / `checklist` / `judgment`〔`table.kv.script-judge`〕/ `#clSheet` / `mgmt`・mgmt-note。詳細モードの本文は `fullBodyHtml()` に移しただけで中身は不変）、**埋め込みスクリプト 1 の `if(!b)return;` を削除**（`#rtPrintSheet` が無い台本モードの記録で表示切替・`__prepareChecklistSheet`・beforeprint が動くように。両モード共通）
- `app.js` `STEPS_FULL` / `STEPS_SCRIPT` / `steps()` / `isScript()` / `onModeChanged()`、`renderStepNav`（`#stepSectionTitle`）・`goStep`・`renderStep`・`evaluateNow`、`scriptApplicantStepHtml` / `validateScriptApplicant`（`#scriptApplicantCard`・`#saPosting`・`#saTaxi`・`#saDate`・`#saInterviewer`・`#saNext`。`#saNegatives`〔`data-cl-on`〕は 2026-10-13 に削除）、`scriptClHeaderHtml`（`#clHeaderAttrs`）・`syncClButtons`、`interviewStepHtml` の台本分岐（`#backToApplicant`・`#toReportBtn`）、`reportStepHtml` / `reportPaperInnerHtml` / `rerenderReportPaper`（`#scriptWarnings`・`#appPaperWrap` > `#appPaper`・`#backToChecklist`・`#reportPrintBtn`・`#reportSaveBtn`）、`scriptSummaryHtml`（`#sumApplicant` … `#sumSaved`）、`scriptHelpHtml`、`applyRecord`（遷移先・toast）、設定の `onSave` / `onReset` / `importProfileText`、`bindGlobal`（🖨 と beforeprint）、`legacyBannerHtml` の台本分岐
- `settings.js` `modeHtml`（`#s-mode`・`[data-bind="mode"]` のラジオ）・`applicantHtml`（`#s-applicant`）・`textsScriptHtml`（`#s-texts-script`）・`scriptTemplate` / `fullTemplate`・`featuresHtml(o)` / `optionsHtml(o)` / `textsHtml(o)` / `checklistHtml(o)` の `scriptLayout`・`advOpen`
- `config.default.js` `mode: 'script'`・`texts.script`、`styles.css`「台本モード」（`.cl-head-attrs`・`.cl-attr`・`.report-paper*`・`.mode-opt`・`.settings-advanced`）、`index.html` `#stepSectionTitle`・meta description

### 12-4. テスト
- 単体 #72（mode の既定・不正値・冪等・modeAdded・旧プロファイル・isScriptMode / isScriptRecord・validate・texts.script）、#73（evaluateScript: 採用・保留・不採用・判定の形・詳細項目に依存しない）、#74（必須条件の不一致・打ち切り・review 設定・未確認・mustUnknownResult）、#75（総合判断の未入力・確認点の未入力・overallCaps・× の警告・壊れた入力・本文の設定）、#76（buildRecord の mode、台本の記録の保存 HTML〔節・並び・応募者情報・`mode-script`・回答なし〕、詳細・旧レコードは従来どおり）、#77（checklistAuto の台本／詳細、evaluateHiring の照合、scriptApplicantRows、checklistSheetHtml の台本分岐）。既存部分の変更は `P()` / `PS()` の定義だけ
- e2e E32〜E36（台本モード。7-3）。既存 E1〜E31 は期待値を変えず、`fresh()`（詳細モードの設定を書き込む）・`freshScript()`・`ensureFullMode()` を足し、`await ensureFullMode();` を 6 か所（冒頭の goto 後・設定の初期化後・E3 の `defaults()` 保存後・E9 / E20 / E29 の他劇場プロファイル取り込み後。E20 は `toView('settings')` も）に入れた
- 実測（2026-10-13）: 台本モードの保存 HTML を報告書表示のまま印刷 2 ページ（`tests/shots/script-report.pdf`）、アプリの A4 印刷 2 ページ（`script-report-app.pdf`）。単体 83 件・e2e 469 件すべて緑
- スクリーンショット（`tests/shots/`）: `40-script-step1.png`（① 応募者）、`41-script-step2.png`（② 面接チェックリスト）、`42-script-step3.png`（③ 報告書）、`43-script-step3-dark.png`（③ ダークモード・紙は白地）、`44-script-report.png`（保存 HTML の報告書表示）、`45-script-report-full.png`（保存 HTML の詳細）、`46-script-report-loaded.png`（再出力ファイルの読込）、`47-script-narrow.png`（390px）

### 12-5. 既知の制限
- 旧形式 v1 の 10 項目×5 点の記録は台本モードの判定に使わない（② に参考表示。報告書の判定は面接チェックリストの入力から作る）
- 台本モードで保存し直した詳細の記録は、保存 HTML に詳細項目を出さない（データは記録に残り、詳細モードで読むと使える）
- 名簿にない面接担当者は ① で選べない（設定の名簿に追加する。押印欄では従来どおり手入力できる。読み込んだ記録の担当が名簿外なら「（名簿外）」として選択肢に残す）
- 台本モードの保存 HTML でも `reportCss` と埋め込みスクリプト 1 には詳細モード用のセレクタ（`data-sec="handoff"` など）の文字列が残る（節は生成しない）。単体 #76・e2e E34 は節の有無を `<section class="sec" data-sec="…"` の形で調べている
- 結果の帯（面接評価の高・中・低）の境界 `evaluation.thresholds` は、台本モードでは設定の「面接チェックリスト」の節（`#clBandInputs`）、詳細モードでは「2軸判定」の節で編集する（12-6 F2）
- 旧形式（10 項目×5 点）の記録（面接チェックリスト未入力）を開いているとき、および判定画面以外（設定・使い方）での Ctrl+P は画面全体の印刷になる（旧形式の記録では 🖨 ボタンは案内を出して印刷しない）

### 12-6. レビュー後の修正（F1〜F10。2026-10-13。詳細は `docs/SPEC-script-mode.md` 11-4）
- F1 ③ を開かずに保存・A4 印刷しても結果が入る: app.js `ensureScriptJudgment()`（台本モードで判定が無ければ `evaluateNow()`。副作用は `state.judgment` だけ）を `saveRecord` と `prepareChecklistSheet(true)`（🖨・② の印刷ボタン・③ の印刷・beforeprint が通る）で呼ぶ。③ を開くと同じ判定。③ より前に保存した台本モードの記録は読み込むと保存したステップ（②／①）から再開（`applyRecord`）
- F2 設定「面接チェックリスト」節（台本モード）: 詳細モード専用の判定設定（要判断の留意点・高校生の方針）は `#s-advanced` の `#s-checklist-full` に移し、自動表示（`.auto`）の選択・消極属性の自動判定・「朝～12時のみ」の終了時刻・「応募情報から自動表示し…」は出さない（値は保持）。面接評価の帯の境界は同じ節 `#clBandInputs` に出す（2軸判定の節は `#mxBandNote` の案内だけ）
- F3 初期対応者の説明「応募受付を行った担当者」（保存済みの旧既定の文言は `normalizeProfile` で置き換え）。設定の Step 表記は `stepRef(n)`（台本 Step①②③／詳細 Step1〜4）。書き出しの注記「新しい設定項目が既定値で補われます」
- F4 画面名（台本モード）: ナビ「報告書の作成」（`#navJudgeLabel`）・トップバー「面接チェックリスト報告」・サイドバー「手順」。詳細モードは「応募者判定」「判定ステップ」（app.js `judgeViewTitle` / `renderModeLabels`）
- F5 右サマリーの結果は台本モードの `state.judgment` を優先（無いときだけ入力中の評価）。保存時の「（総合判断が未入力です）」は回答の有無に関係なく総合判断が空なら出す
- F6 保存 HTML（台本）の「採用可否判定」の見出し: `must_conditions` があれば常に「必須条件の不一致により「…」に固定」（総合判断が未入力なら「（総合判断は未入力）」）
- F7 設定ナビ「詳細モードの設定」は畳みを開いてから移動
- F8〜F10 テスト・README: 単体 #78、e2e E37（② から保存・印刷・再開・印刷の経路・総合判断未入力の保存）と E32 / E35 / 冒頭の画面名・設定の確認。README に印刷の制限。e2e の PDF 確認は pdfinfo / pdftotext が無いと `SKIP` を出す
- 実測（2026-10-13）: 単体 84 件・e2e 491 件すべて緑。`script-report.pdf` 2 ページ・`script-report-app.pdf` 2 ページ（pdfinfo）。スクリーンショット 40〜47 を撮り直した

### 12-7. 入力の簡素化（消極属性の削除。2026-10-13。詳細は `docs/SPEC-script-mode.md` 12 章）
- 依頼: 副支配人「消極属性って意味がわからないから削除でいいかも。ほか、入力が多いのでもう少し端的にできたらお願い」。決定 N1〜N8（オーケストレータ）
- **N1 消極属性を全面削除**（台本モード・詳細モードとも）: config.default.js `checklist.header.negatives`・`morningOnlyEnd`、rules.js `CHECKLIST_AUTO.negatives`・`emptyChecklist().header.negatives`・`checklistAuto` / `checklistSummary` の `negatives`・`scriptApplicantRows` の行、storage.js `normalizeChecklistDef`（旧い設定・記録の台本からは**外す**）・`validateProfile`（終了時刻のエラー）・`checklistSheetHtml` / `generateReportHTML` のチップ、settings.js s-checklist「ヘッダー」の消極属性の行・自動判定・終了時刻・`cl-neg-add` / `cl-neg-del`、app.js Step① `#saNegatives`・`data-cl-on`・詳細モードの `#clHeader` の 3 択と `#clNeg-*`・右サマリーのチップ・使い方、styles.css の関連規則。**旧レコードの `checklist.header.negatives` は読んでもエラーにせず保持するが、表示・判定・報告には使わない**
- N2 ① 応募者は 1 枚・3 行（`.sa-row1` flex: 氏名*・年齢・性別・区分〔学生は末尾に卒業予定年月〕／`.sa-row2`: 面接日〔既定は今日〕・面接担当者・応募した求人〔「通常」「短期」〕／`.sa-row3`: タクシー可否・料金〔placeholder「例: 可・2,500円」〕・メモ（任意・2 行））。説明はカード冒頭の 1 行「氏名だけ必須です。あとは分かる範囲で入力してください。」だけ。名簿の案内は `#saInterviewer` の title。id・data-field は不変。性別の未選択の文言は「選択」（1 行目が狭くても切れない。min 116px）。1440×900・1280×800 でスクロールなしに「面接チェックリストへ進む →」まで見える（下端 454px）。390px は 1 列
- N3 ②（両モード）の【説明】【合否連絡】の見出しの右に「すべて説明した」（`data-action="explain-all" data-block`）: 1 クリックで全部チェック（※短期求人のみ の項目は求人が短期のときだけ）、全部チェック済みなら「すべて外す」（ブロックの全項目を外す）。app.js `clBlockFind` / `clAllTargets` / `clAllDone` / `clAllBtnHtml`
- N4 ② のヘッダー（台本モード）`#clHeader.cl-head-line` は 1 行: 氏名・区分・年齢・求人・タクシー・面接日・担当 のチップと「応募者を編集」（リンクの見た目）。題名・説明文・目安時間は出さない（詳細モードの `clHeaderHtml` は従来どおり）。面接日はラベルなしの日付。1440px で 1 行。1400px 以下はチップを一段詰めて「応募者を編集」をカード上端の右に出す → 1366px・1280px でもチップは 1 行
- N5 右サマリー「応募者」は 4 行（氏名・区分/年齢/性別・面接日・担当）。`#sumAttrs` は区分の行の中で、求人が短期のときだけ「短期求人」のチップ 1 つ
- N6 A4 報告・保存 HTML（台本の記録）のヘッダー: 氏名・区分・年齢・性別・卒業予定・求人・タクシー・面接日・担当（消極属性のチップ・目安を削除。詳細の記録は目安を残す）。`script-report.pdf` 2 ページ
- N7 テスト: 消極属性の expect は「出ないこと／返さないこと」に置き換え（それ以外は変えていない）。単体 #79、e2e E32（3 行構成・1 画面）・E33（1 行ヘッダー・「すべて説明した」）・E37（求人が通常）・E38（消極属性入りの旧レコード）を追加。**単体 85 件・e2e 516 件すべて緑**（レビュー後の修正を含む）
- レビュー後の修正（2026-10-14。SPEC 12-10）: ① 性別のセレクトの文言が PC 幅で切れる → 未選択は「選択」・幅 116px 以上／② のヘッダーが 1280px で折り返す → 面接日のラベルを外し、1400px 以下は詰めて「応募者を編集」をカード上端へ／メモの呼び名を報告書・保存 HTML でも「メモ」に統一（旧「備考（面接者メモ）」「備考」）
- 「短期希望」の文字は台本の質問文と記入欄「短期／長期の希望」の選択肢にだけ残る（台本どおり）
