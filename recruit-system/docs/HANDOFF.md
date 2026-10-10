# 引き継ぎメモ — フェーズ2完了時点

- フェーズ1（Fable 5.1）: UI と骨格（4 ステップ・設定画面・HTML 保存・判定エンジンの土台）
- **フェーズ2（Opus）: 新宿の運用要件（高校生ポリシー／繁忙期・3連休／オールナイト／2軸判定）を実装済み**。詳細仕様は `docs/SPEC.md`（確定版）
- 本メモは「現状」「決定事項」「ver4.4 からの移植状況」「残 TODO」をまとめたもの

## 1. 現状の到達点

### 1-1. 画面
- 4 ステップ UI、右サマリーパネル（シフト貢献度のライブ表示・帯の目盛り）、ダークモード、印刷 CSS
- Step1 応募情報: カード順 = 基本情報 → 通勤 → 勤務条件 → **繁忙期・土日祝** → 深夜帯 → **オールナイト上映** → 外国籍 → その他
  - 区分の選択肢に「（原則対象外）」「（条件付き）」を表示。高1・高2は `#hsPolicyAlert`（赤）、高3は「例外条件」パネル（進路決定・進路の種別・進学先、状態ピル）
  - 18歳未満の注意、年齢と区分の不一致、週の勤務日数の矛盾（最低>最大は Step1 で停止）、終電に間に合わない警告、オールナイト×深夜帯の矛盾
  - 繁忙期の表（○△× ＋ 日数。単位は 合計／週あたり／1回あたり、上限で自動丸め）、「すべて ○ にする」「未確認に戻す」
  - 新カードの見出しに貢献度の現在点（例「繁忙期 20.9/30」）
- Step2 申し送り: 高校生の状態行、「シフト貢献度（面接前の見込み）」カード（内訳バー・繁忙期ミニ表・面接で確認すること）、コピー文に貢献度と `[法令]` `[高校生]` の接頭辞
- Step3 面接評価: 「シフト条件の最終確認」カード（Step1 と同じ項目。未確認が残ると判定に進めない・該当欄に赤枠）
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
- `node tests/rules.test.js` … 単体テスト 46 件（SPEC 9-1 の #1〜#37 ＋並び順・describeApplicant・P1・非破壊・保存レポートの繁忙期タグ）
- `node build.js && node tests/e2e.js` … 通しテスト 150 件の確認（SPEC 9-2 の E1〜E12 ＋ E13 高3例外を Step3 で入力 → 採用推奨 → 保存・読込、E14 showBeforeInterview=OFF。日時は 2026-10-10 に固定）
  - E1 主シナリオ（例A: 貢献度 65.4・high_high → 要判断未確認で上長判断 → 全チェックで採用推奨）／E12 保存 → 読込で新項目が復元
  - E2 高2（原則対象外・highschool_hold）／E3 高3 例外充足・17歳のオールナイト／E4 高3 18歳・未決定・深夜帯○
  - E5 例B（17.6・high_low・上長判断）→ 設定でマスを不採用推奨に変更して再判定
  - E6 終電の突合／E7 旧形式ファイル／E8 設定（期間追加・貢献度合計・LOCKED・検証エラー）／E9 旧プロファイル移行／E10 入力の整合／E11 2軸 OFF
- fixtures: `tests/fixtures/v1-record.html`（フェーズ1で保存したレコード）、`v1-profile-shinjuku.json`、`v1-profile-other.json`

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
- `contribution.showBeforeInterview=false` が右サマリー（`#sumContrib`）と Step1 のカード見出しメーターにも効くように（Step1・2 は点数・ゲージを出さず未確認のみ。Step3 以降は表示）。設定ヒントも実際の表示範囲に合わせた
- `migrateV1`（他劇場）: 上記 1-3 のとおり従来動作を保つ。2軸 OFF かつ `shift_unanswered` OFF・オールナイト OFF の劇場では Step3 の「シフト条件の最終確認」カードを出さない（`shiftConfirmOn()`）
- `validateProfile` に SPEC 4-5 の範囲チェック（貢献度の満点 0〜100 の整数、targets 1〜7、busyStrongPct 0〜100、勤務期間の最低月数 0〜60、繁忙期の上限日数 1〜62）
- 保存レポートの繁忙期表: 「重点」は `critical && weight>0` のときだけ。重み 0 の期間は「記録のみ」（アプリ表示とそろえた）
- Step3 で条件を変えると、上部の「未確認の留意点 N 件」を作り直す（入力欄は再描画しない。文言が変わった項目は未確認として数える＝判定時の rebuildHandoff と同じ件数）

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

統合時に決めた既定値と理由は `docs/SPEC.md` 10-1 を参照（未確認は 0 点にせず判定を保留、高3例外は進学のみ、18 歳以上の高3も深夜・オールナイト不可、など）。

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
- [x] 高3 例外に「就職」は含めない。就職・その他の進路は不採用推奨（`highschoolPolicy.disallowedPathResult`）。推薦（秋）と一般入試（2〜3 月）の時期差・合格見込みの扱いは運用で判断（副支配人回答）
- [ ] 18 歳到達・卒業後（4 月以降）の区分更新は運用（記録上の区分変更）でよいか
- [ ] オールナイトの実際の時間帯（22:00〜翌6:00 は仮）、休憩・始発帰宅、タクシー規定との関係
- [ ] 土日頻度・オールナイト頻度の選択肢と割合が現場の感覚に合うか
- [ ] 面接前（Step2）に貢献度の点数を見せるか（`showBeforeInterview`）
- [ ] 留意点の文言・重要度・しきい値の精査（`config.default.js` → `handoffRules` / `params`）、設定画面のヒント文言
- [ ] 平日日中帯ルール（`weekday_daytime`）が新宿でも成り立つか

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

### 4-3. 設定画面
- [x] プロファイルのバージョン管理（`schemaVersion: 2`、移行は `storage.normalizeProfile` に集約）
- [x] 保存前の検証（`validateProfile`。エラーは保存しない）
- [ ] 留意点ルールの条件をノーコードで追加する簡易ビルダー（現状は条件＝コード、文言＝設定）
- [ ] `returnMethods` / `workPermitStates` のラベル編集（`careerPaths` はフェーズ2で編集可にした）
- [ ] 繁忙期エディタの「単位」プルダウンが 1440px 幅で文字切れ（動作には影響なし）

### 4-4. 保存・互換
- [x] 旧形式（v1）の保存ファイル・プロファイルの読み込み（バナーと差分 toast。シフト条件未確定として採用推奨に留めない）
- [ ] ver4.4 形式ファイルの読み込み互換（DOM 解析で移行）が必要か確認
- [ ] 保存ファイル名の規則（現在 `応募者_氏名_YYYY-MM-DD.html`）。Playwright の Chromium では日本語のファイル名が `download` になる（アプリではなく自動テスト環境の挙動とみられる）。実機の Edge / Chrome で名前どおり保存されるか確認すること
- `app.js` は `schemaVersion < 2` かつ `vacationDays` が無いファイルを旧形式とみなす（新しい保存は `schemaVersion: 2`）

### 4-5. UI の細部
- [ ] Step2 の申し送り印刷レイアウト（Step4・保存レポートの印刷は対応済み）
- [ ] 時刻入力が OS ロケールにより 12 時間表記になる点の案内
- [ ] キーボード操作・フォーカス順（必須チェックは `checkRequired` で Step1・Step3 共通化済み）

## 5. 触る場所の早見表

| やりたいこと | 場所 |
| --- | --- |
| 留意点の条件を追加 | `src/rules.js` `CONDITIONS` に関数追加 → `src/config.default.js` `handoffRules` に既定行追加（カテゴリは `CATEGORY_ORDER` のいずれか）。旧プロファイルへの追加は `storage.normalizeProfile` が既定行を補う |
| 法令値・ロックするルール | `src/rules.js` `LAW` / `LOCKED_RULES` |
| 文言・しきい値・繁忙期・配点・マトリクスの既定値 | `src/config.default.js` |
| 入力項目を追加 | `app.js` `emptyApplicant` → `inputStepHtml`（Step3 でも確定させるなら `busyFieldsHtml` / `allNightFieldsHtml` / `shiftConfirmHtml`）→ `applyVisibility`、表示は `rules.js` `describeApplicant` |
| シフト貢献度の計算 | `src/rules.js` `computeContribution`（未確認の定義は `shiftConditionMissing`） |
| 採用判定の計算 | `src/rules.js` `evaluateHiring`、結果表示は `app.js` `resultStepHtml` / `axisMetricsHtml` / `matrixTableHtml` |
| 設定画面に項目を追加 | `src/settings.js` `template()`（`data-bind` のパスを書くだけ。合計や表を描き直す欄は `repaint: true`） |
| プロファイルの移行・検証 | `src/storage.js` `normalizeProfile` / `validateProfile`（単体テスト #30〜#36） |
| 保存データの項目を追加 | `src/storage.js` `buildRecord` / `generateReportHTML`、復元は `app.js` `applyRecord` |

変更後は `node tests/rules.test.js`、`node build.js` で `dist/` を再生成、`node tests/e2e.js` を通すこと。
