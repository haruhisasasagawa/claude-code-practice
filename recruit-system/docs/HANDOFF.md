# 引き継ぎメモ — 詳細ロジックの詰め込み用

UI と骨格（Fable 5.1 担当）は完成済み。本メモは、判定ロジックの詳細を詰める次フェーズ（Opus 担当）向けの「現状」と「TODO」。

## 1. 現状の到達点

- 4 ステップ UI、右サマリーパネル、ダークモード、印刷 CSS
- 設定画面（劇場プロファイル編集・JSON 書き出し／読み込み・初期化）
- HTML 保存／読込（JSON 埋め込み方式）
- 判定エンジン `src/rules.js`
  - `analyzeShifts` … オープン／クローズ／深夜帯／平日日中／土日／週時間の解析
  - `buildHandoff` … 留意点（要判断・要確認・共有）と強みの生成
  - `evaluateHiring` … 面接評価の得点率から採用可否を判定
- `tests/e2e.js` で通しテスト済み（留意点生成 → 採点 → 判定 → 保存 → 読込 → 設定変更）

## 2. ユーザー決定事項（変更しないこと）

| 項目 | 決定 |
| --- | --- |
| 配布形態 | 単一 HTML（`dist/`）。開発は `src/` 分割 + `build.js` |
| ルール管理 | アプリ内の設定画面 + 劇場プロファイル JSON |
| 保存方式 | HTML ファイル（ブラウザ内の応募者一覧は持たない） |
| 利用端末 | 事務所 PC（ブラウザ） |
| フロー | 面接後の採用可否判定が主役。面接前は合否ゲートではなく「面接者への留意点の申し送り」 |
| 追加項目 | 深夜帯（22 時以降）可否＋タクシー帰宅時の規定金額内確認、外国籍・在留資格・日本語レベル |

## 3. ver4.4（水戸内原）からの移植状況

| ver4.4 のロジック | 新版での扱い |
| --- | --- |
| 60 歳以上は即不採用 | `age_limit` 要判断（採用担当の判断に委ねる） |
| 短期希望は即不採用 | `short_period` 要判断 |
| 来年 3 月卒業 × 中期 → 要確認 | `graduation_midterm` 要確認（「来年 3 月」固定のまま） |
| かけもち（学生／非学生で文言分岐） | `side_job_student` / `side_job_nonstudent` 共有 |
| 週最大 1 日 → 不可、2 日 → 要確認 | `weekly_days_one` 要判断、`weekly_days_low` 要確認 |
| 1 日 3 時間未満 → 要確認 | `short_shift` 要確認（`params.minShiftMinutes`） |
| オープン（7〜8 時開始）／クローズ（22 時以降）加点 | 強みバッジとして表示（採用判定の点数には未反映） |
| 平日朝〜夕方は社保スタッフで埋まる → 要確認 | `weekday_daytime` 要確認 |
| 土日両方なし → 要確認 | `weekend_missing` 要確認 |
| マイカー加点、内原駅加点 | 削除。`commute_car` を共有（新宿は駐車場なし）に置換 |
| 通勤 90 分以上不可、60 分超マイナス | `commute_block` 要判断、`commute_warn` 要確認 |
| フリーター → 社保確認 | `freeter_insurance` 共有 |
| 夏休み・お盆 ×→不可、△→要確認 | `vacation_ng` 要判断、`vacation_consult` 要確認。項目は 夏休み／お盆／年末年始／GW に拡張（設定で増減可） |
| 高校生: 許可確認、21 時まで運用 | `highschool_permission` / `highschool_hours`（上限は `params.highschoolLatestEnd`=22:00。新宿の運用に合わせて要確認）、`highschool_time_violation` 要判断 |
| 専門学校生: 許可確認 | `vocational_permission` |
| 面接評価 10 項目 × 5 点、35 点以上推奨／20 点以上上長判断 | 同じ 10 項目。閾値は得点率 70% / 40%（= 35 / 20 点）に換算 |
| 総合判断 1〜2 点で警告 | `evaluation.overallWarnBelow`=3 |
| Step1 のスコア（4 点以上で面接進行可） | **廃止**。面接前の合否は採用担当の判断とし、アプリは留意点を出すのみ |

新規追加: `foreign_*`（資格外活動許可・週 28h・在留期限・日本語レベル）、`late_night_*`（可否・終電・タクシー規定額）、`shift_times_missing`、`weekly_days_unknown`、`holdOnUnresolvedBlock`（要判断が未確認なら採用推奨に留めない）。

## 4. TODO（詳細を詰める項目）

### 4-1. 留意点ルールの精査（新宿の運用と照合）
- [ ] 各ルールの文言・重要度・しきい値を現場の基準に合わせる（`config.default.js` → `handoffRules` / `params`）
- [ ] 高校生の終了上限（22:00 固定でよいか。18 歳以上の高 3 の扱い）
- [ ] 平日日中帯ルールが新宿でも成り立つか（社保スタッフの配置状況）
- [ ] `graduation_midterm` を「卒業までの残月数 < 勤務期間」の一般形に拡張
- [ ] 週勤務日数と選択曜日数の矛盾チェック（例: 曜日 2 つなのに最大 4 日）

### 4-2. 条件の追加・精度向上（`rules.js` の `CONDITIONS`）
- [ ] 終電時刻 vs クローズ終了時刻の突合（`lastTrain` が最も遅い終了時刻より早ければ要確認）。現状は未入力のみ検知
- [ ] 外国籍の週時間推定にかけもち分を加算（`sideJobDetail` は自由記述のため数値欄の追加を検討）
- [ ] 長期休暇中 40h 上限の扱い（現状は文言で案内のみ）
- [ ] 年齢と区分の整合（例: 15 歳で大学生）
- [ ] 希望部署を判定に使うか（現状は記録用、既定 OFF）

### 4-3. 採用可否判定の拡張（`evaluateHiring`）
- [ ] シフト適合度（オープン／クローズ／土日／長期）を採用判定に加点するか。設定で ON/OFF できる形が望ましい
- [ ] 項目ごとの重み（`evaluation.items[].weight`）
- [ ] 「総合判断 1 点なら自動で不採用推奨」のような足切り条件
- [ ] 懸念項目（2 点以下）が N 件以上で一段階下げる、など

### 4-4. 設定画面
- [ ] 留意点ルールの条件をノーコードで追加する簡易ビルダー（現状は条件＝コード、文言＝設定）
- [ ] `returnMethods` / `workPermitStates` のラベル編集（現状は値固定）
- [ ] プロファイルのバージョン管理（`schemaVersion` の移行処理は `storage.normalizeProfile` に集約）

### 4-5. 保存・互換
- [ ] ver4.4 形式ファイルの読み込み互換（DOM 解析で移行）が必要か確認
- [ ] 保存ファイル名の規則（現在 `応募者_氏名_YYYY-MM-DD.html`）

### 4-6. UI の細部
- [ ] 印刷レイアウトの最適化（Step4 の印刷を想定済み。Step2 の申し送り印刷も要るか）
- [ ] 時刻入力が OS ロケールにより 12 時間表記になる点の案内
- [ ] キーボード操作・フォーカス順、必須チェックの強化

## 5. 触る場所の早見表

| やりたいこと | 場所 |
| --- | --- |
| 留意点の条件を追加 | `src/rules.js` `CONDITIONS` に関数追加 → `src/config.default.js` `handoffRules` に既定行追加 |
| 文言・しきい値の既定値を変更 | `src/config.default.js` |
| 入力項目を追加 | `app.js` `emptyApplicant` → `inputStepHtml` → `applyVisibility`、表示は `rules.js` `describeApplicant` |
| 採用判定の計算を変更 | `src/rules.js` `evaluateHiring`、結果表示は `app.js` `resultStepHtml` |
| 設定画面に項目を追加 | `src/settings.js` `template()`（`data-bind` のパスを書くだけ） |
| 保存データの項目を追加 | `src/storage.js` `buildRecord` / `generateReportHTML`、復元は `app.js` `applyRecord` |

変更後は `node build.js` で `dist/` を再生成し、`node tests/e2e.js` を通すこと。
