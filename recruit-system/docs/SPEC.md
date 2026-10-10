# 詳細仕様書（確定版）: 高校生ポリシー／繁忙期・3連休／オールナイト／2軸判定

- 対象: `recruit-system/`（ブランチ `claude/toho-shinjuku-hiring-app-quhjtc`、基準コミット `32a643e`）。**git commit / push はしない**（作業ツリーに変更を残すだけ）
- 位置づけ: 仕様案 0（現場運用）を骨格にし、案 1（法令・判定の厳密さ・状態管理の修正）と案 2（設定可能性・他劇場展開・移行）を取り込んだ統合版。本書の名前・既定値・式は**確定値**として実装する
- 実装後に更新するもの: `README.md`（Step3/4 の説明、`node tests/rules.test.js`）、`docs/HANDOFF.md`（決定事項 B〜E の追記、TODO の完了チェック）、`node build.js` による `dist/` の再生成

---

## 0. 方針・優先度・既存コードで直す点

### 0-1. 設計方針（変えないこと）

| 方針 | 内容 |
| --- | --- |
| 面接前は申し送り | Step1 で分からない項目は**空欄のまま進める**。空欄は留意点「面接で確認」になる。Step1→2 で止めるのは既存の必須項目と明らかな入力ミスだけ |
| 判定前に確定 | 繁忙期・祝日・土日頻度・オールナイト等は **Step3 の「シフト条件の最終確認」カードで確定**させ、未確定なら Step3→4 で止める（`contribution.requireComplete`） |
| アプリは止めない（方針面） | 高校生の原則対象外・法令に関わる事項は留意点「要判断」とし、進行は止めない。最終判断は採用担当・上長 |
| 調整は下げる方向だけ | 判定の調整（ホールド）は 推奨 → 上長判断 → 不採用 の方向だけ。上げる調整はしない |
| 法令値はコード、運用値は profile | 労基法の深夜帯（22:00〜翌5:00）・年少者年齢（18歳）は `rules.js` の定数 `LAW`（設定不可）。劇場の運用値（深夜帯表示の開始時刻、高校生の終了上限など）は profile |
| 既存互換 | 既存のルール id・applicant の既存パス（`vacation.*`、`lateNight.*` 等）・保存形式（HTML＋`#recruit-record` JSON）・`PROFILE_KEY='recruit.profile.v1'` は変えない。プロファイルは `schemaVersion: 2` |
| コードスタイル | 既存どおり IIFE・`const`/`var`・`function`。外部ライブラリなし。画面は日本語 |

### 0-2. 優先度

- **P0（今回必須）**: 1〜9 章で「P1」と書いていないものすべて。
- **P1（P0 完了後、時間があれば）**: `minor_hours` と推定実労働時間、`under_working_age`／`age15_check`／`minor_documents`、`graduation_past`、`allnight_foreign_hours`、`allnight_shift_conflict`、`evaluation.overallRejectAtOrBelow`、`params.closeShiftStandardEnd`。P1 の profile キーは**既定値だけ P0 で入れておく**（後から入れても移行が要らないように）。

### 0-3. 既存コードの不具合（P0 で併せて直す）

1. `analyzeShifts.isLateNight` が終了時刻だけで判定しており、日付をまたがない早朝勤務（00:30〜05:00、04:00 開始）を検出できない → 時間帯の重なり（`periodicOverlap`）で判定する（3-1）。
2. `goStep(4)` は既存の `state.handoff` を使い回し、`applyRecord` は handoff を作り直さない（target=3/4 で前の応募者の handoff が残る）→ `state.handoffStale` 方式に改める（6-8）。
3. `Number(x) || 既定値` のため 0 を設定すると既定値に戻る（例 `reviewPct=0` → 40）→ 新規キーと、今回触る箇所（`evaluateHiring` の閾値）は `num(v, def)` で読む。
4. 強み `lateNightOk` が 18 歳未満・高校生にも出る → `c.lateNightEligible` を条件に追加。
5. `highschool_hours` の既定文言「高校生は法令上22:00まで」が不正確（法令の基準は年齢）→ 文言変更（移行あり）。
6. `CATEGORY_LABELS` が `rules.js` と `settings.js` に二重定義。`settings.rulesHtml` の `order` に無いカテゴリのルールは設定画面に出ない → `rules.js` から `CATEGORY_LABELS` と `CATEGORY_ORDER` を export し、settings はそれを参照（読み込み順は util → config.default → rules → storage → settings → app なので参照可能）。
7. `graduation_midterm`・`foreign_expiry` が `new Date()` を直接参照しておりテスト不能 → `opts.now` を注入できるようにする。

### 0-4. 共通ヘルパー（rules.js 内に定義し export）

```js
function num(v, def) { const n = Number(v); return (v === '' || v == null || isNaN(n)) ? def : n; }
function round1(x) { return Math.round(x * 10) / 10; }
function isTri(v) { return v === 'ok' || v === 'consult'; }   // ○ または △
function fmtAbs(m) { // 開始日0時からの分 → 'H:MM' / '翌H:MM'
  const x = ((m % 1440) + 1440) % 1440;
  return (m >= 1440 ? '翌' : '') + Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0');
}
```

**注意（U.fill の仕様）**: `U.fill` は値が `''`/`null`/`undefined` のとき「未入力」を埋める。任意の文言断片（空なら何も出さない）を変数にしないこと。数値は `0` を渡せば「0」と出る。

---

## 1. データモデル変更

### 1-1. applicant（`app.js` `emptyApplicant(profile)`）に追加するフィールド

値はすべて文字列（入力欄と同じ扱い。数値化は rules 側で `num()`）。既存フィールドはすべて維持。

| パス | 取りうる値 | 初期値 | 用途 |
| --- | --- | --- | --- |
| `vacationDays` | `{ [vacationItemId]: string }` | `options.vacationItems` の各 id → `''` | 繁忙期ごとの「出られる日数の目安」。単位は期間の `unit` に従う |
| `holidayWork` | `'' \| 'ok' \| 'consult' \| 'ng'` | `''` | 祝日（平日の祝日・振替休日）の勤務可否 |
| `weekendFreq` | `'' \| options.weekendFrequencies[].value` | `''` | 土日の出勤頻度 |
| `allNight.availability` | `'' \| 'ok' \| 'consult' \| 'ng'` | `''` | オールナイト上映シフトの可否 |
| `allNight.frequency` | `'' \| options.allNightFrequencies[].value` | `''` | 入れる頻度 |
| `allNight.note` | string | `''` | 条件メモ（例: 金曜のみ、始発で帰宅） |
| `highschool.careerDecided` | `'' \| 'yes' \| 'no'` | `''` | 進路決定済みか（高3例外用） |
| `highschool.careerPath` | `'' \| options.careerPaths[].value` | `''` | 進路の種別 |
| `highschool.destination` | string | `''` | 進学先・就職先の名前（任意） |
| `continueAfterGraduation` | `'' \| 'yes' \| 'undecided' \| 'no'` | `''` | 卒業後も当劇場で継続する意思（学生全般。高3例外・卒業月ルール・勤務期間の貢献度に共用） |
| `sideJobHoursPerWeek` | 数値文字列 | `''` | かけもち先の週あたり時間（外国籍の週28時間判定に合算） |

- 既存の `vacation`（id → `''|'ok'|'consult'|'ng'`）は**キー名を変えず**「繁忙期の○△×」として使う。
- `emptyApplicant` は `vacationItems` から `vacation` と `vacationDays` の両方を生成する:

```js
const vacation = {}, vacationDays = {};
((profile.options || {}).vacationItems || []).forEach(function (v) { vacation[v.id] = ''; vacationDays[v.id] = ''; });
return { /* 既存 */
  vacation: vacation, vacationDays: vacationDays,
  holidayWork: '', weekendFreq: '',
  allNight: { availability: '', frequency: '', note: '' },
  highschool: { careerDecided: '', careerPath: '', destination: '' },
  continueAfterGraduation: '', sideJobHoursPerWeek: ''
  /* 既存 */ };
```

### 1-2. rules.js の定数（設定不可・export する）

```js
const LAW = {
  MINOR_AGE: 18,              // 年少者（労基法 第6章）
  NIGHT_START: 22 * 60,       // 労基法61条 深夜業 22:00〜
  NIGHT_END: 5 * 60,          //                    〜翌5:00
  DEEP_NIGHT_START: 2 * 60,   // 2:00〜5:00 にかかる勤務＝オールナイト相当（P1 allnight_shift_conflict 用）
  MIN_WORK_AGE: 15,           // P1 労基法56条
  MINOR_DAILY_WORK_MAX: 480,  // P1 労基法60条 1日8h
  MINOR_WEEKLY_WORK_MAX: 2400 // P1 週40h
};
// 設定画面で OFF にできない・重要度を変えられないルール（文言は編集可）
const LOCKED_RULES = { minor_late_night: 'block', allnight_minor: 'block',
                       under_working_age: 'block', minor_hours: 'block' /* P1 */ };
const CATEGORY_LABELS = { legal: '法令', highschool: '高校生', general: '全般', busy: '繁忙期・休日',
  allNight: 'オールナイト', lateNight: '深夜帯', vocational: '専門学校生', foreign: '外国籍', consistency: '入力の整合' };
const CATEGORY_ORDER = ['legal', 'highschool', 'general', 'busy', 'allNight', 'lateNight', 'vocational', 'foreign', 'consistency'];
```

### 1-3. profile の追加・変更（`config.default.js`）

`schemaVersion: 2` に上げる。以下に無いキーは既存のまま。

#### features（追加）
```js
features: {
  /* 既存: graduationDate, vacation, lateNight, taxi, foreignNational, department, applicationRoute */
  vacationDays: true,     // 繁忙期ごとの出られる日数（vacation が前提）
  holidayWork: true,      // 祝日の勤務可否
  weekendFreq: true,      // 土日の出勤頻度
  allNight: true,         // オールナイト上映シフト
  contribution: true      // シフト貢献度と2軸判定（OFF=従来どおり面接評価のみで判定）
}
```
`features.vacation` の意味を「繁忙期（連休・長期休暇）の勤務可否」に拡張（キー名維持）。

#### highschoolPolicy（新設）
```js
highschoolPolicy: {
  mode: 'exceptionOnly',               // 'allow'=従来どおり / 'exceptionOnly'=原則対象外・例外のみ（新宿） / 'deny'=高校生は全員対象外
  exceptionCategories: ['高校3年生'],   // 例外を検討できる区分（options.categories の value と完全一致）
  requireCareerDecided: true,          // 例外条件: 進路決定済み
  allowedCareerPaths: { university: true, vocational: true, employment: false, other: false },
  requireContinue: true,               // 例外条件: 卒業後も当劇場で継続する意思
  nightRestricted: true,               // 18歳以上でも高校在学中は深夜帯・オールナイト不可として扱う（当劇場運用）
  notice: '新宿では高校生は原則採用対象外です。例外は高校3年生で進路（進学）が決定済み、かつ進学後も当劇場でアルバイトを継続する方のみです。'
}
```

#### options（変更・追加）

`categories`・`genders` 等は変更なし。

```js
workPeriods: [
  { value: 'long',  label: '長期（1年以上）',          minMonths: 12, contributionRatio: 1 },
  { value: 'mid',   label: '中期（半年以上〜1年未満）', minMonths: 6,  contributionRatio: 0.5 },
  { value: 'short', label: '短期（半年以下）',          minMonths: 0,  contributionRatio: 0 }
],
// 画面上の名前は「繁忙期」。内部キーは互換のため vacationItems のまま。表示順＝配列順
vacationItems: [
  { id: 'threeday', label: '3連休（祝日を含む連休）', periodNote: '成人の日・海の日・スポーツの日など年数回。1回の3連休で何日出られるか',
    unit: 'perEvent', maxDays: 3, refDays: 2, weight: 3, critical: true },
  { id: 'gw',       label: 'GW',               periodNote: '4月末〜5月上旬（暦により5〜9連休）',
    unit: 'total',    maxDays: 9, refDays: 5, weight: 3, critical: true },
  { id: 'summer',   label: '夏休み期間',        periodNote: '7月下旬〜8月末（お盆を除く）。期間中の週あたり日数',
    unit: 'perWeek',  maxDays: 7, refDays: 4, weight: 2, critical: true },
  { id: 'obon',     label: 'お盆',              periodNote: '8月中旬',
    unit: 'total',    maxDays: 6, refDays: 3, weight: 3, critical: true },
  { id: 'silver',   label: 'シルバーウィーク',  periodNote: '9月の敬老の日・秋分の日前後の連休',
    unit: 'total',    maxDays: 5, refDays: 3, weight: 2, critical: false },
  { id: 'yearend',  label: '年末年始',          periodNote: '12月下旬〜1月上旬',
    unit: 'total',    maxDays: 9, refDays: 4, weight: 3, critical: true },
  { id: 'spring',   label: '春休み期間',        periodNote: '2月〜4月上旬。期間中の週あたり日数',
    unit: 'perWeek',  maxDays: 7, refDays: 3, weight: 1, critical: false }
],
//   unit: 'total'=期間中の合計日数（単位表示「日」）/ 'perWeek'=期間中の週あたり日数（「日/週」）/ 'perEvent'=1回あたり（「日/回」）
//   maxDays: 日数入力の上限（perWeek は 7 固定扱い）。refDays: この日数以上で満点（refDays ≤ maxDays）
//   weight: 繁忙期小計の中での重み（0〜10。0 は「記録のみ・点数と未確認判定に使わない」）
//   critical: × のとき vacation_ng（要判断）の対象。false の期間の × は busy_optional_ng（要確認）
weekendFrequencies: [
  { value: 'every_both', label: '毎週 土日とも',     ratio: 1 },
  { value: 'every_one',  label: '毎週 土日どちらか', ratio: 0.6 },
  { value: 'biweekly',   label: '隔週程度',          ratio: 0.4 },
  { value: 'monthly',    label: '月1回程度',         ratio: 0.2 }
],
allNightFrequencies: [
  { value: 'weekly',   label: '毎週でも可',                 ratio: 1 },
  { value: 'biweekly', label: '月2〜3回',                   ratio: 0.75 },
  { value: 'monthly',  label: '月1回程度',                  ratio: 0.5 },
  { value: 'rare',     label: '繁忙期・特別上映のときのみ', ratio: 0.25 }
],
careerPaths: [
  { value: 'university', label: '大学・短大へ進学' },
  { value: 'vocational', label: '専門学校へ進学' },
  { value: 'employment', label: '就職' },
  { value: 'other',      label: 'その他（浪人・未定など）' }
]
```

#### params（追加）
```js
params: {
  /* 既存はすべて維持 */
  lastTrainBufferMinutes: 15,        // 勤務終了〜終電に必要な余裕（着替え・移動）
  dayBoundaryHour: 5,                // 終電時刻がこの時より前なら翌日扱い（00:35 → 翌0:35）
  allNightShiftStart: '22:00',       // オールナイト勤務の目安（表示用。P1 で時間計算にも使用）
  allNightShiftEnd: '06:00',         //   同 終了（翌日）
  weekendFreqWarnBelow: 0.4,         // 土日頻度の ratio がこれ未満で weekend_freq_low（既定では「月1回程度」）
  groupAgeRanges: {                  // 区分グループと年齢の整合（'' は制限なし）
    highschool: { min: 15, max: 19 },
    university: { min: 18, max: '' },
    vocational: { min: 18, max: '' }
  },
  closeShiftStandardEnd: ''          // P1: クローズ勤務の標準終了時刻（例 '00:30'）。空なら使わない
}
```

#### contribution（新設。4 章）
```js
contribution: {
  items: [                           // 表示順＝配列順。既定合計 100 点（100 でなくてもよい。得点率で判定）
    { id: 'busy',       enabled: true, label: '繁忙期（3連休・GW・お盆・年末年始など）', max: 30 },
    { id: 'weekend',    enabled: true, label: '土日',                                  max: 15 },
    { id: 'holiday',    enabled: true, label: '祝日',                                  max: 5 },
    { id: 'allNight',   enabled: true, label: 'オールナイト',                          max: 15 },
    { id: 'close',      enabled: true, label: 'クローズ・深夜帯',                      max: 10 },
    { id: 'open',       enabled: true, label: 'オープン',                              max: 5 },
    { id: 'weeklyDays', enabled: true, label: '週の勤務日数',                          max: 10 },
    { id: 'period',     enabled: true, label: '勤務期間',                              max: 10 }
  ],
  consultFactor: 0.5,                // △（要相談）を満点の何割として数えるか
  weekendDerived: { both: 0.8, one: 0.4 }, // features.weekendFreq=OFF のとき曜日選択から推定する割合
  weekendOneDayCap: 0.6,             // 土日の片方しか選んでいないときの上限（頻度「毎週 土日とも」との矛盾対策）
  lateNightAvailFactor: 0.5,         // 「22時以降○」をクローズ項目で何割として数えるか（希望シフト外の見込み）
  targets: { closeDaysPerWeek: 2, openDaysPerWeek: 1, weeklyDaysFull: 4 },
  bands: { highPct: 60, midPct: 35 },// 貢献度 高 ≥60%、中 ≥35%、低 <35%
  busyStrongPct: 80,                 // 繁忙期の比率がこれ以上で強み「busyStrong」
  requireComplete: true,             // 判定前に未確認ゼロを必須にする（Step3→4 で停止＋読み込み時は推奨に留めない）
  showBeforeInterview: true          // Step2・申し送りコピー文に「貢献度の見込み（点数）」を出す（OFF=未確認項目だけ出す）
}
```

#### matrix（新設。5 章）
キーは `<面接帯>_<貢献度帯>`（フラット。data-bind しやすいため）。
```js
matrix: {
  cells: {
    high_high: 'recommend', high_mid: 'recommend', high_low: 'review',
    mid_high:  'review',    mid_mid:  'review',    mid_low:  'review',
    low_high:  'reject',    low_mid:  'reject',    low_low:  'reject'
  },
  cellNotes: {
    high_high: '', high_mid: '',
    high_low: '面接評価は高い一方、シフト貢献度（繁忙期・土日祝・オールナイト等）が低めです。配置の見込みを踏まえて上長が最終判断してください。',
    mid_high: 'シフト貢献度が高く、繁忙期・オールナイトの戦力として期待できます。面接評価の懸念点と合わせて前向きに検討してください。',
    mid_mid: '',
    mid_low: '面接評価が標準的で、シフト貢献度も低めです。採用の必要性を踏まえて上長が最終判断してください。',
    low_high: 'シフト貢献度は高いものの、面接評価が基準に達していません（面接評価を優先します）。',
    low_mid: '', low_low: ''
  }
}
```

#### evaluation（追加）
```js
holdOnHighschoolException: true,   // 高校生の「原則対象外」「例外条件未充足/未入力」は確認済みでも採用推奨にしない
overallRejectAtOrBelow: 0          // P1: 総合判断がこの点以下なら不採用推奨（0=無効）
```

#### texts（追加。既存の `recommend/review/reject.body` は**変更しない**＝面接のみ判定で使用）
```js
bandLabels: { high: '高', mid: '中', low: '低' },
matrix: {   // 2軸判定（mode=matrix / incomplete）の本文
  recommend: '{name}は面接評価{interviewPct}%（{interviewBand}）・シフト貢献度{contribPct}%（{contribBand}）で、採用を推奨します。',
  review:    '{name}は面接評価{interviewPct}%（{interviewBand}）・シフト貢献度{contribPct}%（{contribBand}）です。上長の最終判断が必要です。',
  reject:    '{name}は面接評価{interviewPct}%（{interviewBand}）・シフト貢献度{contribPct}%（{contribBand}）で、不採用を推奨します。'
},
busyIntro: '新宿は土日祝、特に3連休以上の連休・長期休暇の貢献を重視します。分からない期間は空欄のまま（面接で確認）で構いません。',
allNightIntro: '終映後〜翌朝までの通し勤務（{allNightShiftStart}〜翌{allNightShiftEnd}目安）です。{lateNightStartHour}時以降の勤務（クローズ）とは別に確認します。',
contributionIntro: '応募情報から計算したシフト貢献度の見込みです。「未確認」は面接で確認し、Step3「シフト条件の最終確認」で入力すると確定します。',
strengths: { /* 既存に追加 */
  allNightOk: 'オールナイト上映のシフトに入れます（{allNightFreq}）',
  holidayOk: '祝日も勤務できます',
  busyStrong: '繁忙期（3連休・長期休暇）の貢献が見込めます（{busyPct}%）'
  /* 既存 vacationOk の既定文言を '繁忙期すべてに対応可能です' に変更（8 章で移行） */
}
```

#### handoffRules
3 章の新規ルールを既定行として追加し、既存ルールの変更（3-4）を反映する。

---

## 2. 入力UI

### 2-0. 共通部品の変更（app.js）

- **`fSeg(path, label, options, o)`** に追加:
  - `o.required` … ラベルに `*` を出し、`.field` に `data-required-seg="<path>"` を付ける
  - `o.bare` … `<label>` を出さない（繁忙期の行内用）
- **`fSelect` / `fInput`** の既存 `required` はそのまま（`data-required`）。区分の表示ラベル変更は既存の `optHtml`（`{value,label}` 対応済み）を使う。
- **必須チェック関数** `checkRequired(scopeSel)` を新設（Step1 と Step3 で共用）:
  - `scopeSel` 内の可視（祖先に `.hidden` が無い）`[data-required]` で値が空 → `.invalid`
  - 可視の `[data-required-seg]` で `U.getPath(state.applicant, path)` が空 → `.field` に `.invalid`
  - 戻り値: 未入力要素の配列
- **部品の切り出し**（Step1 と Step3 で同じ HTML・同じ `data-field` を使う）:
  - `busyFieldsHtml()` … 2-4 の中身
  - `allNightFieldsHtml()` … 2-6 の中身
  - いずれも `state.applicant` を読むだけで副作用なし。`#stepContent` の既存イベント委譲（`onFieldEvent`）でそのまま動く
- 判定ロジックは UI に重複させない。UI の警告表示は `RecruitRules` の公開関数（`highschoolStatus` / `nightStatus` / `lastTrainCheck` / `weeklyDaysCheck` / `ageCategoryCheck` / `computeContribution`）の結果を使う。
- CSS 追加（styles.css、既存トークン `--ok/--warn/--danger/--info` と `*-soft` を使用）: `.field.invalid .seg { border-color: var(--danger); }`、`.busy-row`、`.contrib-meter`、`table.matrix`（6-3）、`.legacy-banner`。

### 2-1. カードの並び（Step1）

基本情報 → 通勤 → 勤務条件 → **繁忙期・土日祝（新）** → 深夜帯 → **オールナイト上映（新）** → 外国籍 → その他。
新カードの見出し右に `<span class="badge info">貢献度に反映</span>` と、そのカードの項目の現在点 `<span class="contrib-meter" data-meter="busy">繁忙期 20.9/30</span>` を表示し、`onFieldEvent` のたびに `updateContribMeters()` で更新（`features.contribution` が OFF なら出さない）。

### 2-2. 基本情報カード

1. **区分プルダウンの表示ラベル**（value は変えない）: `R.highschoolStatus({category: c.value}, profile)` で判定し、
   - `status==='excluded'` になる区分 → `高校1年生（原則対象外）`
   - 例外区分（`isExceptionCategory`）→ `高校3年生（条件付き）`
   - 実装: `fSelect('category', '区分', o.categories.map(c => ({ value: c.value, label: c.value + suffix })), { required: true })`
2. **卒業予定年月の行**に `#grp-continue` を追加（学生グループのとき表示）:
   `fSeg('continueAfterGraduation', '卒業後も当劇場で継続', [{value:'yes',label:'継続する',tone:'ok'},{value:'undecided',label:'未定',tone:'warn'},{value:'no',label:'継続しない',tone:'danger'}], { id: 'grp-continue' })`。任意（止めない）。
3. **区分行の直下にアラート**（すべて初期 `hidden`、`applyVisibility` で切替）:

| id | 種別 | 表示条件 | 文言 |
| --- | --- | --- | --- |
| `#hsPolicyAlert` | `alert danger` | `hs.status==='excluded'` | **原則対象外**：{category}は当劇場の採用対象外です。{notice} 入力は続けられます（申し送りに「要判断」として記載されます）。 |
| `#minorNotice` | `alert info` | `night.isMinor` | 18歳未満：22:00〜翌5:00の勤務・オールナイトはできません（労働基準法第61条）。 |
| `#ageCategoryWarn` | `alert warn` | `ageCategoryCheck().mismatch` | 年齢{age}歳と区分「{category}」が一致しません（想定 {ageRange}）。入力を確認してください。 |

4. **`#grp-hs-exception`**（表示条件: `hs.isExceptionCategory`。つまり mode=`exceptionOnly` かつ区分が `exceptionCategories` に含まれる）:
   - 見出し「高校3年生の例外条件」＋状態ピル `#hsExceptionStatus`:
     `exception_met` → `badge ok`「例外対象（条件充足）」／`exception_unmet` → `badge danger`「例外条件 未充足（要判断）」／`exception_incomplete` → `badge warn`「未入力あり」
   - `fSeg('highschool.careerDecided', '進路', [{value:'yes',label:'決定済み',tone:'ok'},{value:'no',label:'未決定',tone:'danger'}])`
   - `fSelect('highschool.careerPath', '進路の種別', careerPaths(ラベルに allowedCareerPaths[v]!==true なら「（例外対象外）」を付ける), { id: 'grp-hs-path' })` … `careerDecided==='yes'` のとき表示
   - `fInput('highschool.destination', '進学先（任意）', { placeholder: '例：〇〇大学 文学部（指定校推薦で合格）', id: 'grp-hs-dest' })` … 同上
   - ヒント: 「進路決定済み（進学）・卒業後も継続する（上の『卒業後も当劇場で継続』）の両方がそろった場合のみ例外として選考対象です。満たさない場合も入力は続けられ、採用担当が判断します。」
   - いずれも**必須にしない**（未入力は `exception_incomplete` → 留意点 `hs_exception_unmet`（要判断）＋判定ホールド）。
5. `highschoolPolicy.mode==='allow'` のときは 3 の `#hsPolicyAlert` と 4 を出さない（従来動作）。

### 2-3. 勤務条件カード

- 既存の「長期休暇の対応」ブロックを**削除**し、2-4 に移す。
- `#grp-sidejob-detail` 内に `fInput('sideJobHoursPerWeek', 'かけもち先の週あたり時間', { type: 'number', min: 0, max: 60, step: 1, suffix: '時間/週', hint: '外国籍の方は週28時間の判定に合算します' })` を追加（任意）。
- 日数行の直下に:
  - `#daysError`（`alert danger`）: `weeklyDaysCheck().order`（最低 > 最大）→「週の最低勤務日数が最大勤務日数を上回っています」。**Step1→2 で停止**（2-8）
  - `#daysWarn`（`alert warn`）: `weeklyDaysCheck().mismatch` →「勤務可能曜日は{dayCount}日分ですが、週の最大勤務日数が{claimDays}日です」。止めない（留意点 `weekly_days_mismatch`）

### 2-4. 繁忙期・土日祝カード（新。`features.vacation || features.holidayWork || features.weekendFreq` のとき）

```
繁忙期・土日祝                              [貢献度に反映] 繁忙期 20.9/30
{texts.busyIntro}
土日の出勤頻度 [選択してください ▼]     祝日の勤務 ○ / △ / ×
繁忙期ごとの可否と日数                    [すべて ○ にする] [未確認に戻す]
┌─────────────────────┬──────────────────┬────────────────────┐
│ 3連休（祝日を含む連休）│ ○可能 △要相談 ×不可 │ [ 2 ] 日/回（満点2）│
│ 成人の日・海の日…      │                    │                    │
│ …（vacationItems の数だけ行）                                        │
```

- 行1（field-row）:
  - `fSelect('weekendFreq', '土日の出勤頻度', options.weekendFrequencies, { id: 'grp-weekend-freq' })` … 表示条件 `features.weekendFreq && night/shift.weekendCount > 0`
  - `fSeg('holidayWork', '祝日（平日の祝日・振替休日）の勤務', TRI, { id: 'grp-holiday' })` … `features.holidayWork`
- 繁忙期の表（`features.vacation`）: `options.vacationItems` の各要素ごとに `.busy-row[data-busy="<id>"]`:
  - 左: `label`（太字）＋ `periodNote`（`.hint`）。`critical` の行はラベル横に小さく `badge warn「重点」`
  - 中: `fSeg('vacation.<id>', '', TRI, { bare: true })`
  - 右（`features.vacationDays`）: `fInput('vacationDays.<id>', '', { type: 'number', min: 0, max: (unit==='perWeek' ? 7 : maxDays), step: 1, suffix: UNIT_LABEL[unit], id: 'grp-vdays-<id>', placeholder: '満点' + refDays })`
    `UNIT_LABEL = { total: '日', perWeek: '日/週', perEvent: '日/回' }`。**`vacation[id]` が ok/consult のときだけ表示**（値は保持）
- ボタン: `data-action="busy-all-ok"`（全期間の `vacation[id]='ok'`、再描画）、`data-action="busy-clear"`（`vacation` と `vacationDays` を全期間 `''`）
- 日数の丸め（`onFieldEvent` で `vacationDays.*` のとき）: 空はそのまま。数値は `Math.min(上限, Math.max(0, Math.floor(n)))` にし、変わったら入力欄にも書き戻す。
- すべて**任意**（Step1 では止めない）。

### 2-5. 深夜帯カード（既存の改修）

- 説明文の末尾に「オールナイト（翌朝までの通し）は下の『オールナイト上映』で別に確認します。」を追加。
- 先頭に `#lateNightLegal`（`alert danger`）: `night.restricted` のとき
  - 18歳未満: 「18歳未満は22:00〜翌5:00の勤務ができません（労働基準法第61条）。」
  - 高校生（18歳以上・`nightRestricted`）: 「高校在学中は当劇場の運用で{highschoolLatestEnd}以降の勤務はできません（卒業まで）。」
  - 入力欄は**無効化しない**（入力されたら要判断として申し送るため）。
- 終電欄: ラベル「終電時刻（劇場最寄り駅 → 自宅方面の最終）」、ヒント「{dayBoundaryHour}:00 より前の時刻は翌日として扱います」。
- `#lastTrainWarn`（`alert warn`）: `lastTrainCheck().conflict` のとき。文言は `late_night_last_train_early` と同じ。

### 2-6. オールナイト上映カード（新。`features.allNight`）

- 見出し「オールナイト上映」、説明 `texts.allNightIntro`
- `#allNightLegal`（`alert danger`）: `night.restricted` のとき「{nightReason}のため、オールナイト勤務はできません（貢献度は0点で計算）。」＋ 既に ok/consult が入っていれば「入力済みの『{allNightAvail}』は無効として扱います」。値は消さない（年齢の誤入力修正で戻せるように）。`nightReason` = `night.reason`（3-1）
- `fSeg('allNight.availability', 'オールナイトのシフト', TRI, { id: 'grp-allnight-avail' })`
- `fSelect('allNight.frequency', '入れる頻度', options.allNightFrequencies, { id: 'grp-allnight-freq' })` … `isTri(availability) && !night.restricted`
- `fInput('allNight.note', '条件・メモ', { id: 'grp-allnight-note', placeholder: '例：金曜のみ、始発で帰宅' })` … 同上
- `#allNightConflict`（`alert warn`）: `allnight_latenight_conflict` と同条件・同文言

### 2-7. `applyVisibility()` に追加する表示条件

| 要素 | 表示条件 |
| --- | --- |
| `#grp-continue` | `isStudentGroup(group) && (features.graduationDate !== false \|\| hs.isExceptionCategory)`。欄は常に描画する（卒業予定年月 OFF でも高3例外の継続意思を入力できるように） |
| `#hsPolicyAlert` | `hs.status==='excluded'` |
| `#minorNotice` | `night.isMinor` |
| `#ageCategoryWarn` | `ageCategoryCheck(a, profile).mismatch` |
| `#grp-hs-exception` | `hs.isExceptionCategory` |
| `#grp-hs-path`, `#grp-hs-dest` | `a.highschool.careerDecided==='yes'` |
| `#hsExceptionStatus` | クラスと文言を `hs.status` で切替 |
| `#daysError` / `#daysWarn` | 2-3 |
| `#grp-weekend-freq` | `features.weekendFreq && shift.weekendCount > 0` |
| `#grp-vdays-<id>` | `features.vacationDays && isTri(a.vacation[id])` |
| `#lateNightLegal`, `#allNightLegal` | `night.restricted` |
| `#grp-allnight-freq`, `#grp-allnight-note` | `isTri(a.allNight.availability) && !night.restricted` |
| `#allNightConflict` | 3-3 `allnight_latenight_conflict` の条件 |
| `#lastTrainWarn` | `lastTrainCheck(...).conflict` |

`hs = R.highschoolStatus(a, profile)`、`night = R.nightStatus(a, profile)`、`shift = R.analyzeShifts(a, profile)`。Step3 でも同じ `applyVisibility()` が呼ばれる（存在しない要素は `show()` が無視する）。

### 2-8. `validateInput()`（Step1→2）で止める条件

既存（必須項目・曜日・勤務時間）に追加:
1. `age` が入力されていて整数でない → 「年齢は整数で入力してください」
2. `daysMin` / `daysMax` が入力されていて 1〜7 の整数でない → 「週の勤務日数は1〜7の整数で入力してください」
3. `weeklyDaysCheck().order`（最低 > 最大）→ 「週の最低勤務日数が最大勤務日数を上回っています」

それ以外（高校生方針・法令・繁忙期等の未入力・矛盾）は**止めない**。

### 2-9. Step3「シフト条件の最終確認」カード（新）

- 位置: Step3 の「面接評価」カードと「面接所見」カードの間。`features.contribution || features.vacation || features.allNight` のとき表示。
- 見出し「シフト条件の最終確認（面接で確認）」、右に貢献度のライブ表示 `<span class="contrib-meter" data-meter="total">65.4 / 100（高）</span>`（`features.contribution` のとき。**判定結果の見込みは表示しない**＝採点バイアス防止）
- 上部: 未確認があれば `alert warn`「未確認：{missingLabels}。判定の前に入力してください」（`computeContribution().missing`）。無ければ `alert ok`「シフト条件はすべて確認済みです」
- 本文: `busyFieldsHtml()` ＋ `allNightFieldsHtml()` ＋ 1 行の補助行（`fSeg('lateNight.availability', …, TRI)`（`features.lateNight`）、`fInput('daysMin')`, `fInput('daysMax')`）。Step1 と同じ `data-field`。
- **`validateContribution()`**（`data-action="judge"` で `validateScores()` の後に実行）:
  - `features.contribution && contribution.requireComplete && computeContribution(...).incomplete` なら停止
  - toast「判定の前にシフト条件を確定してください：{missingLabels}」、カードへスクロール、`checkRequired('#shiftConfirm')` で該当欄に `.invalid`
  - 必須扱いにする欄は 4-3 の `missing` の定義と一致させる（カード描画時、該当 seg/select/input に `required` を付ける）
- Step3 で値を変えたら `state.handoffStale = true`（6-8）。

---

## 3. 留意点ルール

### 3-1. rules.js の土台

#### 時間帯の重なり
```js
// [s,e)（開始日0時からの絶対分。e-s ≤ 1440）と、毎日繰り返す窓 [ws,we)（we>ws、翌日にまたがってよい）の重なり分数
function periodicOverlap(s, e, ws, we) {
  let t = 0;
  for (let k = -1; k <= 1; k++) t += Math.max(0, Math.min(e, we + k * 1440) - Math.max(s, ws + k * 1440));
  return t;
}
```
- 法定深夜: `periodicOverlap(s, e, LAW.NIGHT_START, 1440 + LAW.NIGHT_END)`
- 劇場の深夜帯（表示・既存ルール用）: `periodicOverlap(s, e, lateStart, 1440 + LAW.NIGHT_END)`
- 深夜 2〜5 時（P1）: `periodicOverlap(s, e, LAW.DEEP_NIGHT_START, LAW.NIGHT_END)`

#### `analyzeShifts` の拡張（既存プロパティは維持）
- entry に追加: `legalNightMinutes`
- res に追加:
  - `isLateNight` … **変更**: `periodicOverlap(startAbs, endAbs, lateStart, 1440 + LAW.NIGHT_END) > 0` のエントリがあれば true（早朝勤務も検出）
  - `hasLegalNight`（法定深夜の重なりがあるエントリあり）、`legalNightMinutes`（合計）
  - `closeDays` … `endAbs >= closeEnd` のエントリ数
  - `legalCloseDays` … `closeEnd <= endAbs <= LAW.NIGHT_START` のエントリ数（年少者・高校生のクローズ）
  - `openDays` … オープン条件を満たすエントリ数
  - `dayCount` … `anyDay ? 7 : workDays.length`
  - `weekendCount` … `anyDay ? 2 : (sat 選択 ? 1 : 0) + (sun 選択 ? 1 : 0)`
  - `latestEndText` … `latestEndAbs != null ? fmtAbs(latestEndAbs) : ''`
  - P1: `hasDeepNight`、`maxEntryMinutes`、`weeklyWorkMinutes`、`earliestStartAbs`

#### 公開する判定関数（純関数・export。rules と UI で共用）

**`highschoolStatus(a, profile)`** → `{ applicable, isExceptionCategory, status, unmet[], missing[], reasonsText }`
```
hp = profile.highschoolPolicy || { mode: 'allow' }
group が highschool でない           → { applicable:false, status:'none' }
hp.mode === 'allow'                  → status 'allowed'
hp.mode === 'deny'                   → status 'excluded'
exceptionCategories に category が無い → status 'excluded'
以下 isExceptionCategory=true:
  if (hp.requireCareerDecided !== false):
    careerDecided ''  → missing「進路決定の有無」
    careerDecided 'no'→ unmet「進路が未決定」
    'yes': careerPath '' → missing「進路の種別」
           allowedCareerPaths[careerPath] !== true → unmet「進路が『{careerPathLabel}』（例外の対象外）」
  if (hp.requireContinue !== false):
    continueAfterGraduation ''          → missing「卒業後の継続意思」
    'undecided' → unmet「卒業後の継続が未定」 / 'no' → unmet「卒業後は継続しない」
  status = unmet.length ? 'exception_unmet' : missing.length ? 'exception_incomplete' : 'exception_met'
reasonsText = unmet.concat(missing.map(m => m + 'が未入力')).join('・')
```

**`nightStatus(a, profile)`** → `{ isMinor, restricted, reason }`
```
age = num(a.age, 0); isHS = group==='highschool'
isMinor    = (age > 0 && age < LAW.MINOR_AGE) || (age === 0 && isHS)
restricted = isMinor || (isHS && (profile.highschoolPolicy||{}).nightRestricted !== false)
reason     = isMinor ? (age ? '18歳未満（' + age + '歳）' : '18歳未満（高校生・年齢未入力）')
           : restricted ? '高校在学中（当劇場の運用）' : ''
```

**`lastTrainCheck(a, profile, shift)`** → `{ applicable, conflict, lastTrainAbs, compareEndAbs }`
```
applicable = features.lateNight && lateNight.returnMethod==='train' && toMinutes(lastTrain)!=null && shift.latestEndAbs!=null
lt = toMinutes(lastTrain); if (lt < num(dayBoundaryHour,5)*60) lt += 1440
compareEndAbs = shift.latestEndAbs   （P1: closeShiftStandardEnd があり lateNight.availability が ○△ なら、その時刻（境界前は+1440）との大きい方）
conflict = applicable && compareEndAbs + num(lastTrainBufferMinutes,15) > lt   （等しいときは間に合う）
```

**`weeklyDaysCheck(a)`** → `{ mismatch, order, dayCount, claimDays }`
```
mn = num(daysMin,0), mx = num(daysMax,0), dayCount = anyDay ? 7 : workDays.length
claimDays = Math.max(mn, mx)
mismatch = !anyDay && dayCount > 0 && claimDays > dayCount
order    = mn > 0 && mx > 0 && mn > mx
```

**`ageCategoryCheck(a, profile)`** → `{ mismatch, ageRange }`
```
r = params.groupAgeRanges[group]; age = num(a.age,0)
min = num(r.min, null), max = num(r.max, null)
mismatch = !!r && age > 0 && ((min != null && age < min) || (max != null && age > max))
ageRange = min!=null && max!=null ? min+'〜'+max+'歳' : min!=null ? min+'歳以上' : max+'歳以下'
```

**`shiftConditionMissing(a, profile, shift, night)`** → `[{ key, label }]`（4-3 の定義。`computeContribution` と `shift_unanswered` が使う）

#### `buildContext(applicant, profile, opts)` に追加
```js
c.now = (opts && opts.now) ? new Date(opts.now) : new Date();
c.category = a.category;
c.hs = highschoolStatus(a, profile);
c.night = nightStatus(a, profile);
c.isMinor = c.night.isMinor;
c.nightRestricted = c.night.restricted;
c.lateNightEligible = !c.night.restricted;
c.allNight = a.allNight || {};
c.hsA = a.highschool || {};
c.sideJobHours = num(a.sideJobHoursPerWeek, 0);
c.periodEntry = (profile.options.workPeriods || []).find(w => w.value === a.workPeriod) || null;
c.monthsLeft = /^\d{4}-\d{2}$/.test(a.graduationDate || '')
  ? (gy * 12 + gm) - (c.now.getFullYear() * 12 + c.now.getMonth() + 1) : null;
c.lastTrain = lastTrainCheck(a, profile, c.shift);
c.days = weeklyDaysCheck(a);
c.ageCat = ageCategoryCheck(a, profile);
c.contribution = computeContribution(a, profile, { shift: c.shift, night: c.night, now: c.now });
```
`buildHandoff(applicant, profile, opts)` / `evaluateHiring(applicant, scores, profile, handoff, checks, opts)` / `computeContribution(applicant, profile, opts)` は省略可能な `opts`（`now` など）を受け取り、`buildContext` に渡す。app からは渡さなくてよい。`foreign_expiry` も `c.now` を使う。

### 3-2. templateVars に追加する変数

| 変数 | 値 |
| --- | --- |
| `{category}` | `a.category` |
| `{ageText}` | `age ? age + '歳' : '年齢未入力'` |
| `{graduationDate}` / `{monthsLeft}` | `a.graduationDate` / `c.monthsLeft` |
| `{workPeriodLabel}` / `{periodMinMonths}` | `labelOf(workPeriods, a.workPeriod)` / `periodEntry.minMonths` |
| `{dayCount}` / `{claimDays}` | `c.days.dayCount` / `c.days.claimDays` |
| `{ageRange}` | `c.ageCat.ageRange` |
| `{latestEnd}` / `{lastTrain}` / `{lastTrainBufferMinutes}` | `fmtAbs(c.lastTrain.compareEndAbs)` / `lateNight.lastTrain` / `params.lastTrainBufferMinutes` |
| `{hsUnmet}` / `{hsExceptionCategories}` | `c.hs.reasonsText` / `exceptionCategories.join('・')` |
| `{careerPathLabel}` / `{destination}` | `labelOf(careerPaths, careerPath)` / `highschool.destination` |
| `{nightReason}` / `{nightWish}` | `c.night.reason` / ルール側で作る |
| `{allNightAvail}` / `{allNightFreq}` | `TRI_LABELS[allNight.availability]` / `labelOf(allNightFrequencies, frequency)` |
| `{allNightShiftStart}` / `{allNightShiftEnd}` | `params.*` |
| `{weekendFreqLabel}` | `labelOf(weekendFrequencies, weekendFreq)` |
| `{sideJobHours}` | `c.sideJobHours`（数値。0 は「0」） |
| `{missingLabels}` | `c.contribution.missing.join('・')` |
| `{contribPct}` / `{busyPct}` | `c.contribution.pct` / 繁忙期項目の `round1(ratio*100)` |

settings.js の `VARS_HINT` にも追記する。

### 3-3. 新規ルール

表記: `TRI(x)` = `isTri(x)`。条件はすべて `CONDITIONS[id](c)`。戻り値がオブジェクトのものは変数として渡す。配置は `config.default.js` `handoffRules` のカテゴリごとのコメント見出しの下。

#### 法令（category `legal`。LOCKED）

| id | sev | 条件 | 既定文言 |
| --- | --- | --- | --- |
| `minor_late_night` | block | `c.isMinor && (c.shift.hasLegalNight \|\| (features.lateNight && TRI(lateNight.availability)))` → `{nightWish}`＝「希望シフトに22:00〜翌5:00の時間帯が含まれている」「深夜帯の勤務希望が『{TRIラベル}』になっている」の該当分を「、」で連結 | {ageText}（18歳未満）は22:00〜翌5:00に勤務できません（労働基準法第61条）。{nightWish}ため、希望を修正するよう面接で説明してください。 |
| `allnight_minor` | block | `c.isMinor && features.allNight && TRI(allNight.availability)` | {ageText}（18歳未満）はオールナイト上映のシフトに入れません（労働基準法第61条）。オールナイトの希望が「{allNightAvail}」になっているため、不可である旨を説明してください（貢献度は0点で計算）。 |
| `under_working_age`（P1） | block | `age > 0 && age < 15` | {age}歳です。労働基準法第56条により中学生以下は雇用できません。年齢・区分の入力を確認してください。 |
| `minor_hours`（P1） | block | `c.isMinor && (shift.maxEntryWorkMinutes > 480 \|\| shift.weeklyWorkMinutes > 2400)` | 18歳未満は1日8時間・週40時間を超えて勤務できません（労働基準法第60条）。希望シフトを範囲内に調整してください。 |
| `minor_documents`（P1） | info | `c.isMinor` | 18歳未満のため、採用時に年齢証明書（住民票記載事項証明書等。労働基準法第57条）と保護者の同意書を受け取ってください。 |

#### 高校生（category `highschool`）

| id | sev | 条件 | 既定文言 |
| --- | --- | --- | --- |
| `hs_out_of_policy` | block | `c.hs.status === 'excluded'` | {category}は当劇場では原則採用対象外です（例外は{hsExceptionCategories}で進路（進学）決定済み・進学後も当劇場で継続する方のみ）。面接実施の可否を採用担当で判断してください。 |
| `hs_exception_unmet` | block | `c.hs.status` が `exception_unmet` または `exception_incomplete` | {category}ですが、例外の条件を満たしていません（{hsUnmet}）。高校生は原則採用対象外のため、面接実施の可否を採用担当で判断してください。 |
| `hs_exception_ok` | warn | `c.hs.status === 'exception_met'` | {category}・進路決定済み（{careerPathLabel}／進学先: {destination}）・卒業後も継続希望のため、例外として選考対象です。合格通知等で進路を確認し、進学後の通学・時間割から卒業後も勤務を続けられるか確認してください。 |
| `hs_exception_period` | warn | `c.hs.status === 'exception_met' && a.workPeriod && a.workPeriod !== 'long'` | 卒業後も継続する意思がある一方、勤務期間の希望が「{workPeriodLabel}」です。どちらが正しいか確認してください。 |
| `hs_night_policy` | block | `c.isHighschool && !c.isMinor && hsPolicy.nightRestricted !== false && ((features.lateNight && TRI(lateNight.availability)) \|\| (features.allNight && TRI(allNight.availability)))` → `{nightWish}`（例「深夜帯の希望が『○ 可能』、オールナイトの希望が『△ 要相談』」） | 高校在学中は当劇場の運用により{highschoolLatestEnd}以降の勤務・オールナイトに入れません（18歳以上でも卒業まで）。{nightWish}となっているため、卒業後の希望として扱うか確認してください。 |

#### 繁忙期・休日（category `busy`）

| id | sev | 条件 | 既定文言 |
| --- | --- | --- | --- |
| `busy_optional_ng` | warn | `features.vacation` かつ `critical === false && weight > 0` の期間が `ng` → `{vacationLabels}` | 繁忙期のうち{vacationLabels}の勤務ができません。代わりに出られる時期があるか確認してください。 |
| `holiday_ng` | warn | `features.holidayWork && a.holidayWork === 'ng'` | 祝日の勤務ができません。3連休・祝日は繁忙のため、出られない理由と例外的に入れる日があるか確認してください。 |
| `holiday_consult` | warn | `features.holidayWork && a.holidayWork === 'consult'` | 祝日の勤務が要相談です。月に何回程度、どの祝日なら入れるか確認してください。 |
| `weekend_freq_low` | warn | `features.weekendFreq && shift.weekendCount > 0 && a.weekendFreq && ratio(weekendFreq) < num(params.weekendFreqWarnBelow, 0.4)` | 土日の出勤頻度が「{weekendFreqLabel}」です。当劇場は土日祝の貢献を重視しているため、増やせる余地があるか確認してください。 |
| `shift_unanswered` | warn | `c.contribution.missing.length > 0`（`features.contribution` に関係なく `shiftConditionMissing` で判定） | 面接で確認が必要なシフト条件があります（{missingLabels}）。面接で確認し、Step3「シフト条件の最終確認」に入力してください。 |

#### オールナイト（category `allNight`。すべて `features.allNight && c.lateNightEligible` が前提）

| id | sev | 条件 | 既定文言 |
| --- | --- | --- | --- |
| `allnight_ok` | info | `availability === 'ok'` | オールナイト上映のシフトに入れます（頻度: {allNightFreq}）。勤務時間（{allNightShiftStart}〜翌{allNightShiftEnd}目安）・休憩・始発での帰宅について説明してください。 |
| `allnight_consult` | warn | `availability === 'consult'` | オールナイト上映のシフトが要相談です（頻度: {allNightFreq}）。入れる曜日・頻度と、始発での帰宅が可能か確認してください。 |
| `allnight_ng` | info | `availability === 'ng'` | オールナイト上映のシフトには入れません。新宿はオールナイト上映が多いため、土日祝・繁忙期での貢献を確認してください。 |
| `allnight_foreign_hours`（P1・category foreign） | info | `c.isForeign && workPermit !== 'na' && TRI(availability)` | オールナイトは1回の勤務が長時間になります。週{foreignWeeklyHourCap}時間の上限内に収まるシフトが組めるか確認してください。 |

#### 深夜帯（category `lateNight`）

| id | sev | 条件 | 既定文言 |
| --- | --- | --- | --- |
| `late_night_return_unknown` | warn | `c.lateNightEligible && features.lateNight && (lateNight.availability が ok/consult \|\| shift.isLateNight) && !lateNight.returnMethod` | {lateNightStartHour}時以降の勤務希望（または希望シフト）がありますが、深夜帯の帰宅手段が未入力です。終電で帰れるか、タクシーの場合は料金が規定（{taxiLimitYen}円）内かを確認してください。 |
| `late_night_last_train_early` | warn | `c.lateNightEligible && c.lastTrain.conflict` | 希望シフトの最も遅い終了（{latestEnd}）から終電（{lastTrain}）まで{lastTrainBufferMinutes}分の余裕がありません。クローズ後に帰宅できるか、終了時刻の調整・帰宅手段を確認してください。 |

#### 外国籍（category `foreign`）

| id | sev | 条件 | 既定文言 |
| --- | --- | --- | --- |
| `foreign_busy_cap` | info | `c.isForeign && workPermit !== 'na' && features.vacation` かつ ○△ の期間がある | 繁忙期の勤務希望があります。週{foreignVacationWeeklyHourCap}時間まで認められるのは、在留資格「留学」で学則上の長期休業期間中のみです。GW・3連休・シルバーウィーク等は週{foreignWeeklyHourCap}時間が上限である旨を説明してください。 |

#### 入力の整合（category `consistency`）

| id | sev | 条件 | 既定文言 |
| --- | --- | --- | --- |
| `age_category_mismatch` | warn | `c.ageCat.mismatch` | 年齢{age}歳と区分「{category}」が一致しません（想定 {ageRange}）。入力誤りでないか、定時制・通信制・社会人学生等でないか確認してください。 |
| `weekly_days_mismatch` | warn | `c.days.mismatch \|\| c.days.order`（order は読み込んだ旧データ向け。新規入力は 2-8 で止まる） | 週の勤務日数の入力に矛盾があります（勤務可能曜日 {dayCount}日分・週{minDays}〜{maxDays}日）。実際に入れる曜日と日数を確認してください。 |
| `allnight_latenight_conflict` | warn | `features.allNight && features.lateNight && c.lateNightEligible && TRI(allNight.availability) && lateNight.availability === 'ng'` | オールナイトは「{allNightAvail}」ですが、{lateNightStartHour}時以降の勤務は「× 不可」です。終電の都合による不可であれば、始発帰宅のオールナイトは可能か確認してください。 |
| `graduation_past`（P1） | warn | `c.isStudent && c.monthsLeft != null && c.monthsLeft < 0` | 卒業予定年月（{graduationDate}）が過去の日付です。入力内容と現在の区分を確認してください。 |
| `allnight_shift_conflict`（P1） | warn | `features.allNight && allNight.availability === 'ng' && shift.hasDeepNight` | 勤務希望時間に深夜2時〜5時の時間帯が含まれていますが、オールナイトは「× 不可」です。入力内容を確認してください。 |

### 3-4. 既存ルールの変更（id は変えない）

| id | 変更内容 |
| --- | --- |
| `graduation_midterm`（general / warn） | **一般化**: `features.graduationDate && c.isStudent && c.monthsLeft != null && c.monthsLeft >= 0 && periodEntry && num(periodEntry.minMonths,0) > 0 && c.monthsLeft < periodEntry.minMonths && a.continueAfterGraduation !== 'yes'` → `{graduationDate, monthsLeft, workPeriodLabel, periodMinMonths}`。新既定文言: 「卒業予定（{graduationDate}）まで約{monthsLeft}か月で、希望の勤務期間「{workPeriodLabel}」（{periodMinMonths}か月以上）を満たさない可能性があります。卒業後も継続できるか確認してください。」 |
| `vacation_ng`（block） | 対象を `critical !== false && weight > 0` の期間に限定。category を `busy`。新既定文言: 「繁忙期（{vacationLabels}）の勤務ができません。新宿は連休・長期休暇の貢献を重視するため、面接実施の可否を判断してください。」 |
| `vacation_consult`（warn） | category を `busy`。新既定文言: 「繁忙期（{vacationLabels}）が要相談です。期間中に何日程度入れるか確認してください。」 |
| `weekend_missing`（warn） | category を `busy`。条件・文言は変更なし |
| `highschool_permission` / `highschool_hours` | 条件に `&& c.hs.status !== 'excluded'` を追加（原則対象外の高1・高2には要判断 1 件だけを出し、ノイズを減らす。mode=allow では従来どおり）。`highschool_hours` の新既定文言: 「18歳未満は法令上22:00〜翌5:00の勤務ができません。当劇場では高校生は年齢にかかわらず{highschoolLatestEnd}までの勤務としている旨を伝えてください。」 |
| `highschool_time_violation`（block） | 条件に `&& !(c.isMinor && c.shift.hasLegalNight)` を追加（18歳未満の深夜は `minor_late_night` で出し、重複させない） |
| `late_night_*`（既存 7 件すべて） | 条件に `c.lateNightEligible` を追加（18歳未満・高校生には法令／方針ルールだけを出す） |
| `foreign_hour_cap_exceeded` | 比較を `shift.weeklyMinutes + c.sideJobHours * 60 > cap` に変更。`{weeklyHours}` は合算後の値。新既定文言: 「希望シフトとかけもちの合計（週{weeklyHours}時間目安。うちかけもち{sideJobHours}時間）が週{foreignWeeklyHourCap}時間の上限を超えています。シフト調整の可否を判断してください。」 |
| `foreign_expiry` | `new Date()` を `c.now` に置換 |

### 3-5. 強み・バッジ（`buildHandoff` / `shiftBadges`）

強み（追加・変更）:
- `lateNightOk`: 条件に `c.lateNightEligible` を追加
- `allNightOk`: `features.allNight && c.lateNightEligible && allNight.availability === 'ok'`
- `holidayOk`: `features.holidayWork && a.holidayWork === 'ok'`
- `busyStrong`: 繁忙期項目の `ratio * 100 >= contribution.busyStrongPct`
- `vacationOk`（既存）: 判定は「`weight > 0` の全期間が ok」に変更

バッジ（追加）:
- 高校生: `hs.status==='excluded'` → `{key:'hs', label:'高校生 原則対象外', tone:'danger'}`／`exception_met` → `'高3 例外対象'`（ok）／`exception_unmet|incomplete` → `'高3 例外未充足'`（danger）。`status==='allowed'` のときだけ既存の `'高校生'`（info）
- `c.isMinor` → `'18歳未満'`（warn）
- オールナイト: restricted で ○△ → `'オールナイト不可(法令/運用)'`（danger）、ok → `'オールナイト可'`（ok）、consult → `'オールナイト△'`（warn）
- 繁忙期: busyStrong → `'繁忙期◎'`（ok）、`critical` の ng あり → `'繁忙期×あり'`（danger）、未確認期間あり → `'繁忙期 未確認'`（warn）
- 祝日 ok → `'祝日可'`（ok）
- `isLateNight` バッジ（既存）は `lateNightEligible` のときだけ

`buildHandoff` の戻り値に `contribution: c.contribution`、`hs: c.hs`、`night: c.night` を追加。

### 3-6. 並び順

`items.sort` を「severity の order → `CATEGORY_ORDER` の順」の安定ソートにする（同一カテゴリ内は handoffRules の並び）。未知カテゴリは末尾。

---

## 4. シフト貢献度スコア

### 4-1. API
```js
computeContribution(applicant, profile, opts) -> {
  enabled: bool,                // features.contribution !== false かつ 有効項目の max 合計 > 0
  total, max, pct,              // total=Σscore（round1）、max=Σmax（applicable のみ）、pct=round1(total/max*100)
  band: 'high'|'mid'|'low'|null, bandLabel,
  incomplete: bool, missing: [string],   // 4-3
  restricted: bool,             // night.restricted
  parts: [{ id, label, max, score, ratio, applicable, detail, flags: [] }],  // contribution.items の順
  busyRows: [{ id, label, unit, avail, days, refDays, weight, critical, ratio }]
}
```
- `opts.shift` / `opts.night` があれば再計算しない。
- 各項目 `score = round1(max * clamp01(ratio))`。`total = round1(Σ score)`。**帯は丸めた `pct` で判定**（表示と判定を一致させる）: `pct >= bands.highPct → high`、`pct >= bands.midPct → mid`、それ以外 `low`。
- `enabled === false`（feature OFF・max 合計 0）のときも `parts`・`missing` は計算して返す（Step3 の未確認表示・`shift_unanswered` に使う）。`band = null`。
- `contribution.items` の未知 id・`enabled === false`・`max <= 0` はスキップ。`flags` の値: `unanswered`（未入力で 0 扱い）、`restricted`（法令・運用で強制 0 点）、`estimated`（推定値）。
- `tri(v)`: ok → 1、consult → `consultFactor`、ng/空 → 0。

### 4-2. 項目ごとの計算（`cf = consultFactor`）

| id | 既定満点 | ratio | 適用外（max から除外） | detail 例 |
| --- | --- | --- | --- | --- |
| `busy` | 30 | 期間 i（`weight > 0` のみ）: `isTri(avail)` でなければ `s=0`。`features.vacationDays` なら `d = num(vacationDays[id], null)`、`d==null` → `s=0`（unanswered）、それ以外 `s = tri(avail) × min(1, d / refDays)`（refDays ≤ 0 なら 1）。`features.vacationDays` OFF なら `s = tri(avail)`。`ratio = Σ(w_i s_i) / Σ w_i` | `!features.vacation`、または Σw = 0 | 「3連休○2/2日・GW○5/5日・夏休み○3/4日週・お盆△2/3日・SW×・…」 |
| `weekend` | 15 | `weekendCount === 0` → 0。`features.weekendFreq` ON: `f = ratio(weekendFreq)`（空 → 0, unanswered）。OFF: `f = weekendCount === 2 ? weekendDerived.both : weekendDerived.one`（estimated）。`weekendCount === 1` なら `f = min(f, weekendOneDayCap)` | なし | 「土のみ・毎週 土日どちらか」 |
| `holiday` | 5 | `tri(holidayWork)`（空は unanswered） | `!features.holidayWork` | 「○ 可能」 |
| `allNight` | 15 | `night.restricted` → 0（restricted、unanswered にしない）。それ以外 `tri(availability) × ratio(frequency)`。availability 空、または ○△ で frequency 空 → 0（unanswered） | `!features.allNight` | 「△・月1回程度」／「対象外（18歳未満）」 |
| `close` | 10 | `r1 = anyDay ? (isClose ? 1 : 0) : min(1, D / targets.closeDaysPerWeek)`。`D = night.restricted ? legalCloseDays : closeDays`（高校生・年少者も 22:00 までのクローズは数える）。`r2 = (features.lateNight && !night.restricted) ? tri(lateNight.availability) × lateNightAvailFactor : 0`。`ratio = max(r1, r2)` | なし | 「クローズ 2日/週（目標2日）／22時以降○」 |
| `open` | 5 | `anyDay ? (isOpen ? 1 : 0) : min(1, openDays / targets.openDaysPerWeek)` | なし | 「オープン 1日/週」 |
| `weeklyDays` | 10 | `base = (mn && mx) ? (mn + mx) / 2 : (mx \|\| mn)`。`!anyDay && workDays.length > 0` なら `base = min(base, workDays.length)`。`ratio = min(1, base / targets.weeklyDaysFull)`。未入力 → 0 | なし | 「週2〜4日（平均3日／満点4日）」 |
| `period` | 10 | `r = periodEntry ? num(periodEntry.contributionRatio, 0) : 0`。学生で `monthsLeft != null` かつ `continueAfterGraduation !== 'yes'` なら `r = min(r, max(0, monthsLeft) / 12)` | なし | 「中期（卒業まで5か月のため上限0.42）」 |

### 4-3. 未確認（incomplete / missing）の定義

`shiftConditionMissing` が返す項目（`label` は表示用。並びはこの順）:

| key | 条件 | label |
| --- | --- | --- |
| `busy` | `features.vacation` かつ `weight > 0` の期間で `vacation[id] === ''` | 繁忙期の可否（{未回答期間ラベルを「・」連結}） |
| `busyDays` | `features.vacation && features.vacationDays` かつ `weight > 0`・`isTri(vacation[id])`・`vacationDays[id] === ''` | 繁忙期の日数（{期間ラベル}） |
| `weekendFreq` | `features.weekendFreq && weekendCount > 0 && !weekendFreq` | 土日の出勤頻度 |
| `holiday` | `features.holidayWork && !holidayWork` | 祝日の勤務 |
| `allNight` | `features.allNight && !night.restricted && !allNight.availability` | オールナイトの可否 |
| `allNightFreq` | `features.allNight && !night.restricted && isTri(allNight.availability) && !allNight.frequency` | オールナイトの頻度 |
| `lateNight` | `features.lateNight && !night.restricted && !lateNight.availability` | 22時以降の勤務 |
| `daysMax` | `!daysMax` | 週の最大勤務日数 |

`incomplete = missing.length > 0`。`busyDays` を必須にするのは、日数を入れた方が空欄より不利になる逆転を避けるため（空欄に既定割合を与えない）。

### 4-4. 計算例（確定値。単体テスト・e2e で照合する）

**例 A（e2e 主シナリオ。now=2026-10-10）**
大学3年・21歳・卒業 2027-03・中期・継続意思 空。月水金土、週2〜4日。月 17:00–23:30／水 10:00–12:00／金 18:00–翌01:00／土 08:00–17:00。深夜帯○。
繁忙期: 3連休○2・GW○5・夏休み○3（週）・お盆△2・SW×・年末年始○4・春休み△2（週）。祝日○。土日頻度「毎週 土日どちらか」。オールナイト△・月1回程度。

| 項目 | 計算 | 点 |
| --- | --- | --- |
| busy | (3·1 + 3·1 + 2·0.75 + 3·(0.5·2/3) + 2·0 + 3·1 + 1·(0.5·2/3)) / 17 = 11.8333/17 = 0.69608 | 20.9 / 30 |
| weekend | 土のみ（count 1）: min(0.6, 0.6) | 9.0 / 15 |
| holiday | ○ | 5.0 / 5 |
| allNight | 0.5 × 0.5 = 0.25 → 3.75 | 3.8 / 15 |
| close | 月・金が 22:00 以降終了 → 2/2 | 10.0 / 10 |
| open | 土 8:00 開始 → 1/1 | 5.0 / 5 |
| weeklyDays | (2+4)/2 = 3（曜日4）→ 3/4 | 7.5 / 10 |
| period | min(0.5, 5/12 = 0.4167) | 4.2 / 10 |
| **合計** | | **65.4 / 100（65.4%・高）** |

面接 39/50（78%・高）→ セル `high_high` = 採用推奨。ただし `foreign_permit_missing`・`late_night_taxi_over`（要判断）が未確認なら `unresolved_block` で上長最終判断要。

**例 B（面接高 × 貢献低）**
25歳フリーター、月火水、各 10:00–16:00、週2〜3日、長期、深夜帯×。繁忙期: 3連休△1、他すべて×。祝日×。オールナイト×。面接すべて5点。
busy = 3·(0.5·1/2)/17 = 0.0441 → 1.3、weekend 0、holiday 0、allNight 0、close 0、open 0、weeklyDays (2+3)/2=2.5 → 6.3、period 10 → **合計 17.6（低）** → `high_low` = 上長最終判断要、`cellNotes.high_low` を表示。

### 4-5. 設定で変えられる範囲

| 設定 | 範囲 |
| --- | --- |
| `contribution.items[i].enabled / label / max` | max 0〜100 の整数（追加・削除・並べ替えなし） |
| `consultFactor`、`weekendDerived.both/one`、`weekendOneDayCap`、`lateNightAvailFactor` | 0〜1（step 0.05） |
| `targets.closeDaysPerWeek / openDaysPerWeek / weeklyDaysFull` | 1〜7 |
| `bands.highPct > bands.midPct` | 0〜100 |
| `busyStrongPct` | 0〜100 |
| `requireComplete` / `showBeforeInterview` | ON/OFF |
| 繁忙期 `label / periodNote / unit / maxDays / refDays / weight / critical` | maxDays 1〜62、refDays 1〜maxDays、weight 0〜10 |
| `weekendFrequencies[i] / allNightFrequencies[i]` の `label / ratio` | ratio 0〜1（件数固定） |
| `workPeriods[i].minMonths / contributionRatio` | 0〜60 / 0〜1 |

---

## 5. 2軸マトリクス（`evaluateHiring` の拡張）

### 5-1. 帯の区切り（境界値は上の帯に含める）

| 軸 | 高 | 中 | 低 | 設定キー |
| --- | --- | --- | --- | --- |
| 面接評価 得点率（既存 `pct`＝round1） | ≥ 70% | ≥ 40% | < 40% | `evaluation.thresholds.recommendPct` / `reviewPct`（既存キー。`num()` で読む） |
| シフト貢献度 得点率（`pct`＝round1） | ≥ 60% | ≥ 35% | < 35% | `contribution.bands.highPct` / `midPct` |

### 5-2. 既定のマトリクス（行=面接、列=貢献度）

| 面接 ＼ 貢献度 | 高（≥60%） | 中（35〜60%） | 低（<35%） |
| --- | --- | --- | --- |
| **高（≥70%）** | 採用推奨 | 採用推奨 | **上長最終判断要** |
| **中（40〜70%）** | 上長最終判断要（前向き注記） | 上長最終判断要 | 上長最終判断要 |
| **低（<40%）** | 不採用推奨 | 不採用推奨 | 不採用推奨 |

従来（面接のみ）との差は「高×低」の 1 マスだけ（決定事項 E の例）。

### 5-3. 判定アルゴリズム

```
RANK = { reject:0, review:1, recommend:2 }
down(r, to) = RANK[to] < RANK[r] ? to : r
iBand  = pct >= recPct ? 'high' : pct >= revPct ? 'mid' : 'low'
legacy = { high:'recommend', mid:'review', low:'reject' }[iBand]
contrib = computeContribution(applicant, profile, opts)

if (!contrib.enabled)                                   mode='interviewOnly'; result=legacy
else if (contrib.incomplete && contribution.requireComplete)
                                                        mode='incomplete';    result=legacy  → 調整(1)
else                                                    mode='matrix'; cellKey=iBand+'_'+contrib.band
                                                        result = valid(cells[cellKey]) ? cells[cellKey] : legacy（不正値なら warning「マトリクス設定が不正なため面接評価のみで判定しました」）
baseResult = result
調整（この順・下げる方向のみ。実際に変わったときだけ adjustments に積む）:
 (1) contribution_incomplete : mode==='incomplete' → down(result,'review')
 (2) overall_cutoff (P1)     : overallRejectAtOrBelow > 0 && 総合判断の点 <= その値 → down(result,'reject')
 (3) highschool_hold         : evaluation.holdOnHighschoolException && hs.status ∈ {excluded, exception_unmet, exception_incomplete}
                               → down(result,'review')（チェックの有無に関係なく外れない）
 (4) legal_hold              : 未確認（checks に無い）の category 'legal' の block がある → down(result,'review')（設定に関係なく常に）
 (5) unresolved_block        : 既存 holdOnUnresolvedBlock && 未確認の block がある → down(result,'review')
```
- 各調整は `adjustments.push({ code, from, to, reason })`、`reason` は warnings にも追加:
  - `contribution_incomplete`: 「シフト貢献度の入力が不足しているため（{missingLabels}）、面接評価のみで判定し、採用推奨には留めません。」（このメッセージは result が変わらなくても mode=incomplete なら warnings に入れる）
  - `highschool_hold`: 「高校生の採用方針（原則対象外／例外条件の未充足）に該当するため、採用推奨ではなく上長最終判断要として扱います。」
  - `legal_hold`: 「法令に関わる要判断の留意点が未確認のため、採用推奨ではなく上長最終判断要として扱います。」
  - `unresolved_block`: 既存文言のまま
- 既存の warnings（総合判断低評価・未採点・未確認留意点）は維持。追加 warning: mode=matrix で `contrib.band==='low'` のとき「シフト貢献度が{contribPct}%と低めです（主な不足: {得点率の低い上位2項目のラベル}）。」
- `adjusted = adjustments.length > 0`（既存フィールド互換）。

### 5-4. 戻り値（既存キーはすべて維持。`total/max/pct/thresholds/breakdown` は面接評価の値のまま）

```js
{ /* 既存 */ result, title, body, disclaimer, total, max, pct, thresholds, breakdown,
  strengths, concerns, warnings, unresolved, adjusted, evaluatedAt,
  /* 追加 */
  mode: 'matrix' | 'incomplete' | 'interviewOnly',
  interview: { total, max, pct, band, bandLabel },
  contribution: <computeContribution の結果>,
  matrix: { cellKey: 'high_low' | null, cellResult: 'review' | null, note: '' ,
            table: { high_high: 'recommend', ... },     // 判定時点の cells のスナップショット（監査・レポート用）
            bands: { interview: { high: 70, mid: 40 }, contribution: { high: 60, mid: 35 } } },
  baseResult: 'recommend',
  adjustments: [{ code, from, to, reason }],
  highschool: { status, reasonsText }
}
```
- `title = texts[result].title`
- `body`: mode が `matrix`/`incomplete` → `texts.matrix[result]`、`interviewOnly` → 従来の `texts[result].body`
- 本文変数: `{name}{total}{max}{pct}` ＋ `{interviewPct}{interviewBand}{contribTotal}{contribMax}{contribPct}{contribBand}`。mode=incomplete のとき `{contribBand}` は「未確定」
- `matrix.note = cellNotes[cellKey]`（mode=matrix のときのみ）。本文の下に別段落で表示

---

## 6. 結果表示

### 6-1. Step2（申し送り）

- 応募者カード（既存）の表に高校生の状態行を追加: `hs.applicable && status !== 'allowed'` のとき「高校生: 原則対象外（高校2年生）」等。
- 既存 2 カードの間に **「シフト貢献度（面接前の見込み）」カード**（`features.contribution` のとき）:
  - `showBeforeInterview` ON: 見出し右に `{total} / {max}点（{bandLabel}・暫定）`、`texts.contributionIntro`、内訳バー（`.bars` を流用: ラベル｜バー｜`score/max`｜detail）。`unanswered` に `badge warn 未確認`、`restricted` に `badge danger 法令/運用で対象外`
  - 繁忙期ミニ表: 期間｜○△×｜日数（`2日/回 ／ 満点2`）。未確認セルは `--warn-soft` 背景
  - 下部「面接で確認すること」: `missing` の各 label と、ratio < 0.5 の項目ラベル（例「オールナイトの可否と頻度」）
  - `showBeforeInterview` OFF: 点数とバーを出さず、繁忙期ミニ表と「面接で確認すること」だけ

### 6-2. Step3（面接評価）

- 先頭の未確認留意点 alert（既存）は維持。
- 2-9 の「シフト条件の最終確認」カードを追加（面接評価と面接所見の間）。

### 6-3. Step4（採用可否判定）

1. **結果カード**（`.result-card`）: タイトル・本文・判定メモ（`matrix.note`、`.result-note`）・metrics 3 ブロック:
   - 面接評価 `39 / 50点` `78%` ＋ バッジ「高」
   - シフト貢献度 `65.4 / 100点` `65.4%` ＋ バッジ「高」（mode=incomplete は「未確定」、interviewOnly は「—」）
   - **3×3 ミニマトリクス** `table.matrix`: 行=面接（高/中/低、境目%併記）、列=貢献度。各セルに短縮名（推奨／上長／不採用）を `--ok/--warn/--danger` の soft 色で。該当セルは `td.current`（太枠＋「▶」）。調整で最終結果が変わったら表の下に「マトリクス: 採用推奨 → 最終: 上長最終判断要（{理由}）」を `adjustments` から列挙
   - disclaimer（既存）
   - mode=interviewOnly ではマトリクスを出さない（従来の 4 metrics）
2. 確認事項（既存。新 warnings を含む）
3. `grid-2`: 左「面接評価の内訳」（既存バー）、右「シフト貢献度の内訳」（6-1 と同じバー）
4. 「繁忙期・オールナイト」カード: 繁忙期表＋祝日／土日頻度／オールナイト（頻度・メモ）
5. 面接での強み／懸念、面接所見、応募情報サマリー（既存）
6. 判定履歴: 「Step 3　シフト貢献度 {total}/{max}（{bandLabel}）」行を追加。Step4 行は「{title}　面接{iBand}×貢献{cBand}」＋ adjustments の要約（例「（要判断未確認のため調整）」）
7. 旧形式バナー（8-3）

### 6-4. 右サマリー（`renderSummary`）

- **応募者**: 区分の下に高校生バッジ・「18歳未満」バッジ
- **シフト適合 → 「シフト貢献度」に改名**: 上段 `{total} / {max}（{bandLabel}）` と横バー（中・高の境目に目盛り線）。中段 未確認があれば `badge warn 未確認 n` ＋ 1 行で missing。下段 既存＋新バッジ。入力中からライブ更新（`R.buildHandoff(a,p).contribution` を使う）。`features.contribution` OFF なら従来の「シフト適合」
- **面接評価**: 得点率の右に帯（高/中/低）
- **判定**: 判定後は既存バッジ＋「面接 高 × 貢献 高」の一行、調整があれば「（要判断未確認のため調整）」。判定前は「面接評価とシフト貢献度の2軸で判定します」

### 6-5. 申し送りコピー文（`buildHandoffText`）

`describeApplicant` の行の後に追加（`features.contribution` のとき）:
```
■シフト貢献度（面接前の見込み）65.4/100点（高・暫定）     ← showBeforeInterview OFF なら行ごと省略
繁忙期 20.9/30・土日 9/15・祝日 5/5・オールナイト 3.8/15・クローズ/深夜 10/10・オープン 5/5・週日数 7.5/10・勤務期間 4.2/10
■面接で確認すること
・オールナイトの頻度
・繁忙期の日数（夏休み期間）
```
既存の要判断／要確認／共有ブロックで、`legal` と `highschool` カテゴリの項目には先頭に `[法令]` `[高校生]` を付ける。

### 6-6. `describeApplicant` の追加・変更

| ラベル | 値の例 | 条件 |
| --- | --- | --- |
| 高校生の例外 | `例外対象（条件充足）：大学・短大へ進学（〇〇大学）／卒業後 継続する` ｜ `原則対象外` ｜ `例外条件 未充足（進路が未決定）` | `hs.applicable && status !== 'allowed'` |
| 卒業後の継続 | `継続する` | 学生かつ入力あり |
| かけもち | 既存＋`（週{n}時間）` | `sideJobHoursPerWeek` 入力あり |
| 繁忙期（旧「長期休暇」から改名） | `3連休:○2日/回　GW:○5日　夏休み期間:○3日/週　お盆:△2日　SW:×　…` 未回答は `未確認` | `features.vacation` |
| 祝日 | `○ 可能` | `features.holidayWork` かつ入力あり |
| 土日の頻度 | `毎週 土日どちらか` | `features.weekendFreq` かつ入力あり |
| オールナイト | `△ 要相談 / 月1回程度 / 金曜のみ` ｜ `対象外（18歳未満）` | `features.allNight` |
| 深夜帯 | 既存＋`lastTrainCheck().conflict` なら末尾に「（終電に間に合わない可能性）」 | 既存 |

### 6-7. 保存レポート（`storage.generateReportHTML`）

- 章の順: 応募情報 → 申し送り → 強み → 追記 → **シフト貢献度** → 面接評価 → 面接所見 → **採用可否判定**
- 「シフト貢献度」: 表 `項目｜得点｜満点｜内容`、合計行・帯、`incomplete` なら「未確認: {missing}」の注記。値は `record.contribution`（保存時点のスナップショット）から描く。無い（旧データ）なら「シフト貢献度は未計算です」
- 「採用可否判定」: 既存の結果ボックスに「面接 {pct}%（{帯}）× 貢献 {pct}%（{帯}）」行、3×3 表（`judgment.matrix.table` から。該当セル強調）、判定メモ、adjustments の経緯を追加。`judgment.interview` が無い旧形式は従来表示にフォールバック
- レポート内 `<style>` に追加: `.mx{border-collapse:collapse}.mx td{text-align:center}.mx td.recommend{background:#e3f6ee}.mx td.review{background:#fdf1dc}.mx td.reject{background:#fde8e8}.mx td.cur{outline:3px solid #1a2233;font-weight:800}`。セルには結果名の文字も入れる（白黒印刷対策）
- styles.css の印刷 CSS: `.matrix, .bars { break-inside: avoid; }`

### 6-8. 状態管理（handoff の鮮度）

- `state.handoffStale`（boolean）を追加。次で `true` にする: `onFieldEvent` で `data-field` が変わったとき（Step1・Step3 とも）、設定の保存・プロファイル読み込み・初期化のとき。
- `rebuildHandoff()` を新設:
  ```
  old = state.handoff
  state.handoff = R.buildHandoff(state.applicant, state.profile)
  old の同じ id で text が変わった項目は handoffChecks[id] を削除し、件数 n > 0 なら toast「内容が変わった留意点のチェックを外しました（n件）」
  消えた id の handoffChecks も削除
  state.handoffStale = false
  ```
- `goStep(n)`: `n >= 2 && (!state.handoff || state.handoffStale)` なら `rebuildHandoff()`。`n === 4` は常に `evaluateHiring` を再実行（既存）。※ 既存の「`n===2` なら常に作り直す」は上記に置き換え（作り直しは stale のときだけ）。
- `applyRecord`: チェックを復元した後、**必ず** `state.handoff = R.buildHandoff(...)`（`handoffStale=false`）してから `goStep(target)`。
- `newRecord`: 既存のリセットに `handoffStale=false`、`legacyRecord=null` を追加。
- `renderStep` の case 2/3/4 も `!state.handoff || state.handoffStale` なら `rebuildHandoff()`（設定画面から `showView('judge')` で戻ったときも古い留意点を出さない）。`buildHandoffText` で作り直したときは Step2/3 を描き直す。
- `state.judgmentStale`: 判定後に `data-field`・留意点チェック・面接点・繁忙期の一括ボタン・設定の保存/初期化/読み込みで `invalidateJudgment()`（`state.judgment=null`、`judgmentStale=true`）。Step4 を描くと再判定、サマリーは「再判定してください」を表示、`saveRecord` は保存前に `evaluateHiring` をやり直す（古い判定を記録に残さない）。
- Step3「シフト条件の最終確認」の週日数にも `#daysError`/`#daysWarn` を置き、判定ボタンは `validateScores() && validateDays() && validateContribution()`（Step1 と同じ 1〜7 の整数・最低≦最大）。

---

## 7. 設定画面（settings.js `template()`）

### 7-1. 共通

- ナビに追加: `高校生の扱い`（`#s-hs`）、`繁忙期`（`#s-busy`）、`シフト貢献度`（`#s-contrib`）、`2軸判定`（`#s-matrix`）。並び: 劇場情報 → 入力項目のON/OFF → 選択肢 → 繁忙期 → 判定パラメータ → 高校生の扱い → 申し送りルール → 面接評価 → シフト貢献度 → 2軸判定 → 結果文言 → 書き出し／読み込み
- `data-repaint` 属性: これが付いた入力は `change` イベントで `paint(window.scrollY)` する（合計点・境界値の表示更新用）。`onEdit` の末尾で `if (e.type === 'change' && t.hasAttribute('data-repaint')) paint(window.scrollY)`
- `CATEGORY_LABELS` のローカル定義を削除し `global.RecruitRules.CATEGORY_LABELS` を参照。`rulesHtml` の `order` を `RecruitRules.CATEGORY_ORDER` にし、order に無いカテゴリは末尾に「その他」として出す
- **LOCKED ルール**（`RecruitRules.LOCKED_RULES` の id）: スイッチと重要度 select を `disabled`、`<span class="badge danger">法令（OFF不可）</span>` を付ける。文言は編集可
- **保存時チェック**: `save` の前に `RecruitStorage.validateProfile(draft)` → `{ errors: [], warnings: [] }`。errors があれば保存せず `toast(errors[0], 'error')`。warnings は保存後に toast
  - errors: `recommendPct > reviewPct`（0〜100）、`bands.highPct > bands.midPct`（0〜100）、`vacationItems` の id が空・重複、`refDays < 1`、`refDays > maxDays`、ratio・係数が 0〜1 の範囲外、`matrix.cells.*` が recommend/review/reject 以外、`params.dayBoundaryHour` が 0〜12 外、時刻欄（`allNightShiftStart/End`、`highschoolLatestEnd`）の書式
  - warnings: 有効な貢献度項目の max 合計が 0（2 軸判定は自動で無効）、`exceptionCategories` に `options.categories` に無い値

### 7-2. 追加・変更する項目（data-bind パス）

| セクション | data-bind | 部品・単位 |
| --- | --- | --- |
| `#s-features` | `features.vacation`（ラベル変更「繁忙期（連休・長期休暇）の勤務可否」） | sCheck |
| | `features.vacationDays` 「繁忙期ごとの出られる日数」 / `features.holidayWork` 「祝日の勤務可否」 / `features.weekendFreq` 「土日の出勤頻度」 / `features.allNight` 「オールナイト上映のシフト」 / `features.contribution` 「シフト貢献度と2軸判定（OFFで従来の面接評価のみの判定）」 | sCheck |
| `#s-options` | `options.workPeriods[i].minMonths`（0〜60, か月）、`options.workPeriods[i].contributionRatio`（0〜1, step 0.05） | 既存ラベル行の横に sInput number（i=0..2） |
| | `options.careerPaths[i].label`（i=0..3。value は `<code>` 表示のみ） | sInput |
| | **削除**: `options.vacationItems` の pairs テキストエリア（weight 等が消えるため。`#s-busy` へ移動） | |
| `#s-busy`（新） | `options.vacationItems[i].label` / `.periodNote`（text）/ `.unit`（select: total=期間の合計日数 / perWeek=週あたり日数 / perEvent=1回あたり日数）/ `.maxDays`（1〜62）/ `.refDays`（1〜62）/ `.weight`（0〜10）/ `.critical`（checkbox「重点（×で要判断）」）。id は `<code>` 表示のみ | 行エディタ（評価項目と同じ操作感）。`data-action="busy-add"`（`{ id: U.uid('busy'), label: '新しい期間', periodNote: '', unit: 'total', maxDays: 7, refDays: 3, weight: 1, critical: false }` を push）／`busy-up`／`busy-down`／`busy-del`（confirm あり）。下に「重みの合計 {n}」とヒント「3連休以上の期間を重くするのがおすすめ」 |
| | `options.weekendFrequencies[i].label` / `.ratio`（i=0..3）、`options.allNightFrequencies[i].label` / `.ratio`（i=0..3） | 固定行（value は表示のみ）。ratio は number 0〜1 step 0.05 |
| | `params.weekendFreqWarnBelow` | number 0〜1 「土日頻度がこの割合未満で要確認」 |
| `#s-params` | `params.lastTrainBufferMinutes`（分）、`params.dayBoundaryHour`（0〜12 時、ヒント「これより前の終電は翌日扱い」）、`params.allNightShiftStart` / `params.allNightShiftEnd`（time）、`params.groupAgeRanges.highschool.min` / `.max`、`.university.min` / `.max`、`.vocational.min` / `.max`（歳。空欄=制限なし）、P1 `params.closeShiftStandardEnd`（time、空欄=使わない） | sInput |
| `#s-hs`（新） | `highschoolPolicy.mode` | sSelect: `allow`=制限なし（従来）／`exceptionOnly`=原則対象外・例外のみ選考（新宿）／`deny`=高校生は対象外 |
| | `highschoolPolicy.exceptionCategories` | sLines（区分の値と完全一致） |
| | `highschoolPolicy.requireCareerDecided` / `highschoolPolicy.requireContinue` / `highschoolPolicy.nightRestricted` | sCheck（nightRestricted のヒント「18歳以上の高3も卒業まで深夜帯・オールナイト不可として扱う」） |
| | `highschoolPolicy.allowedCareerPaths.<value>`（careerPaths の数だけ） | sCheck「{label}は例外の対象」 |
| | `highschoolPolicy.notice` | sTextarea |
| `#s-eval` | `evaluation.thresholds.*` は**ここから削除し `#s-matrix` へ移動**（同じパスを 2 か所に出さない）。`evaluation.holdOnUnresolvedBlock` は残す。追加 `evaluation.holdOnHighschoolException`（sCheck）、P1 `evaluation.overallRejectAtOrBelow`（number、0=無効） | |
| `#s-contrib`（新） | `contribution.items[i].enabled`（switch）/ `.label`（text）/ `.max`（number 0〜100、`data-repaint`）。下に `#contribSum`「合計 {n} 点（得点率で判定するので 100 でなくても可）」 | 固定行（i=0..7） |
| | `contribution.consultFactor`、`contribution.weekendDerived.both` / `.one`、`contribution.weekendOneDayCap`、`contribution.lateNightAvailFactor`、`contribution.targets.closeDaysPerWeek` / `.openDaysPerWeek` / `.weeklyDaysFull`、`contribution.busyStrongPct` | sInput number。係数類は `<details><summary>詳細設定</summary>` に畳む |
| | `contribution.requireComplete`（「判定の前にシフト条件の未確認をゼロにする」）、`contribution.showBeforeInterview`（「申し送り（面接前）に貢献度の点数を表示する」） | sCheck |
| `#s-matrix`（新） | `evaluation.thresholds.recommendPct` / `reviewPct`（ラベル「面接評価: 高（%以上）」「面接評価: 中（%以上）」、点数換算も表示、`data-repaint`） | sInput number |
| | `contribution.bands.highPct` / `contribution.bands.midPct`（「貢献度: 高／中（%以上）」、`data-repaint`） | sInput number |
| | `matrix.cells.<i>_<c>`（i,c ∈ high/mid/low の 9 個） | 3×3 表の各セルに sSelect（選択肢ラベルは `texts.recommend/review/reject.title`）。行・列見出しに現在の境界値 |
| | `matrix.cellNotes.<i>_<c>`（9 個） | `<details>` 内に sInput |
| `#s-texts` | 変数ヒントを `{name} {total} {max} {pct} {interviewPct} {interviewBand} {contribTotal} {contribMax} {contribPct} {contribBand}` に更新 | |
| | `texts.matrix.recommend` / `.review` / `.reject`（「2軸判定の本文」）、`texts.bandLabels.high` / `.mid` / `.low` | sInput |
| | `texts.busyIntro`、`texts.allNightIntro`、`texts.contributionIntro` | sTextarea |
| | `texts.strengths.allNightOk` / `.holidayOk` / `.busyStrong`、`texts.strengths.vacationOk`（ラベル「繁忙期すべて可」） | sInput |
| `#s-rules` | `VARS_HINT` に 3-2 の変数を追加。カテゴリ順・LOCKED 表示は 7-1 | |

`coerce`（既存）は number を `Number` に、空を `''` にする。`groupAgeRanges.*.max` 等の空欄は `''` のまま保存し、rules 側は `num(v, null)` で「制限なし」と解釈する。

---

## 8. 後方互換と移行

### 8-1. `storage.normalizeProfile(p, report)`（冪等: `normalize(normalize(x))` と `normalize(x)` が deepEqual）

```
raw = p || {}
fromVersion = Number(raw.schemaVersion) || 1
base = defaults()
merged = U.deepMerge(base, raw)
既存: handoffRules に不足ルールを末尾追加、evaluation.items が空なら既定
if (fromVersion < 2) { migrateV1(merged, base, raw); if (report) report.migratedFrom = fromVersion; }
fillArrays(merged, base)   // 毎回
enforceLocked(merged)      // 毎回
merged.schemaVersion = 2
```

**`migrateV1(merged, base, raw)`**（v1 → v2 のときだけ 1 回）:
1. `vacationItems`: 既定にあって raw に無い id（`threeday`・`silver`・`spring`）を、既定配列での位置（直前の既定 id の後ろ。無ければ先頭）に挿入。ラベルを変えている既存 id はラベルを維持
2. `handoffRules`: `V1_DEFAULT_TEXTS[id]` と**完全一致**する `text` だけ v2 の既定文言に置換（対象: `graduation_midterm`、`vacation_ng`、`vacation_consult`、`highschool_hours`、`foreign_hour_cap_exceeded`）。`vacation_ng`／`vacation_consult`／`weekend_missing` の `category === 'general'` は `'busy'` に変更
3. `texts.strengths.vacationOk` が v1 既定（「長期休暇期間すべてに対応可能です」）なら v2 既定に置換
4. 劇場ごとの既定の振り分け（他劇場の従来動作を黙って変えない）: `raw.highschoolPolicy` が無い場合
   - `raw.meta.theaterName === 'TOHOシネマズ新宿'`（または meta 無し）→ v2 既定のまま（`exceptionOnly`、`features.contribution/allNight = true`）
   - それ以外 → `highschoolPolicy.mode = 'allow'`、`features.contribution = false`、`features.allNight = false`

`V1_DEFAULT_TEXTS` は storage.js の定数。値は**現行 `config.default.js`（コミット 32a643e）の文言を一字一句コピー**する。

**`fillArrays(merged, base)`**（毎回。deepMerge が配列を丸ごと置換するため要素単位で補完）:
- `options.vacationItems`: 各要素に、同じ id の既定要素の欠けたキーを補う。未知 id は `{ periodNote: '', unit: 'total', maxDays: 7, refDays: 3, weight: 1, critical: false }` で補う。数値キーが NaN なら補完値
- `options.workPeriods`: `minMonths` / `contributionRatio` を同じ value の既定から補う（未知 value は 0 / 0）
- `options.weekendFrequencies` / `allNightFrequencies` / `careerPaths`: 配列でない・空なら既定をコピー。`ratio` が無ければ 0
- `contribution.items`: 配列でない・空なら既定。既定に無い id は削除（計算関数が無いため）。足りない既定 id は末尾に追加。各要素の欠けたキー（enabled/label/max）を既定から補い、`max` は Number（NaN なら既定）
- `matrix.cells`: 9 キーそれぞれ、値が recommend/review/reject 以外なら既定。`matrix.cellNotes` の各値を文字列化
- `highschoolPolicy.mode` が allow/exceptionOnly/deny 以外なら既定。`exceptionCategories` が配列でなければ既定

**`enforceLocked(merged)`**: `LOCKED_RULES` の id の行は `enabled = true`、`severity` を固定値に。

**移行の通知**: `loadProfile(report)` / `parseProfileJSON(text, report)` は report を normalize に渡す。app の `init()` は `const rep = {}; state.profile = S.loadProfile(rep); if (rep.migratedFrom) { S.saveProfile(state.profile); toast('劇場ルールを新しい形式に更新しました（高校生の扱い・繁忙期・オールナイト・2軸判定を追加）。設定画面で確認してください。'); }`。`importProfileText` も同様に toast。

### 8-2. `storage.validateProfile(p)`
7-1 の errors / warnings を返す純関数（DOM 非依存。単体テスト対象）。

### 8-3. 応募者レコード

- `buildRecord`: `schemaVersion: 2`、`profile: { theaterName, version, schemaVersion: 2 }`、`contribution: R.computeContribution(state.applicant, state.profile)`（Step1・2 での保存でも入れる）。`judgment` は 5-4 の拡張形をそのまま deepClone
- `parseRecordFromHTML`: 変更なし（`kind` で判定）
- `applyRecord(rec)`:
  1. `state.applicant = U.deepMerge(emptyApplicant(profile), rec.applicant)`（新フィールドは空で補われる。旧ファイルの `vacation.summer/obon/yearend/gw` はそのまま繁忙期の○△×として使われ、`threeday/silver/spring` は未確認）
  2. `state.legacyRecord = (rec.schemaVersion || 1) < 2 ? { savedJudgment: rec.judgment ? { result, title, total, max, pct } : null } : null`
  3. チェック等の復元 → **`state.handoff = R.buildHandoff(...)`**、`handoffStale = false`
  4. `goStep(target)`（既存の target 決定ロジック）
  5. target が 4 で `rec.judgment && rec.judgment.result !== state.judgment.result` なら toast「保存時の判定（{旧タイトル}）と現在の設定での再判定（{新タイトル}）が異なります」
- **旧形式バナー**（`state.legacyRecord` があるとき Step2〜4 の最上部、`alert warn .legacy-banner`）: 「旧形式（v1）で保存されたデータです。繁忙期の日数・祝日・オールナイト等が未入力のため、シフト貢献度は未確定です（採用推奨には留めません）。保存時の判定: {title}（{total}/{max}点・面接評価のみ）」＋ボタン「シフト条件を入力する」（`data-action="to-step" data-step="3"`）
- 旧ファイルは `incomplete` になるため、再判定は「面接のみ・採用推奨には留めない」。保存時の「採用推奨」が黙って変わることはない（バナーと差分 toast で示す）
- `generateReportHTML`: 6-7 のフォールバックどおり

### 8-4. 設定変更時の応募者データ
既存の `state.applicant = U.deepMerge(emptyApplicant(newProfile), state.applicant)`（`onSave`／`importProfileText`）で、追加された繁忙期 id の `vacation`／`vacationDays` が補われる。削除された期間のキーは applicant に残るが、計算・表示は profile の一覧でループするので無害。`onReset` にも同じ補完を追加し、3 か所とも `state.handoffStale = true`。

### 8-5. 変えないもの（互換の約束）
既存 handoffRules の id、applicant の既存パス、`judgment.result/title/body/total/max/pct/thresholds/adjusted/warnings/unresolved/breakdown`、`recruit-record` の埋め込み方式、`PROFILE_KEY='recruit.profile.v1'`（キー名は変えず中身の schemaVersion で判別）、`texts.recommend/review/reject.body` の既定文言。

---

## 9. テスト観点

### 9-0. 事前準備（**実装に着手する前に**行う。コミットはしない）

```
cd recruit-system
mkdir -p tests/fixtures
cp tests/shots/saved.html tests/fixtures/v1-record.html      # 現行ビルドで保存した v1 レコード（tests/shots は .gitignore 対象なので退避）
node -e "const vm=require('vm'),fs=require('fs'),cp=require('child_process');const ctx=vm.createContext({});ctx.window=ctx;vm.runInContext(cp.execSync('git show 32a643e:recruit-system/src/config.default.js','utf8'),ctx);const p=JSON.parse(JSON.stringify(ctx.RECRUIT_DEFAULT_PROFILE));fs.writeFileSync('tests/fixtures/v1-profile-shinjuku.json',JSON.stringify(p,null,2));p.meta.theaterName='TOHOシネマズ テスト';p.handoffRules.find(r=>r.id==='commute_warn').text='独自文言 {commuteTime}分';fs.writeFileSync('tests/fixtures/v1-profile-other.json',JSON.stringify(p,null,2))"
```
（`tests/shots/saved.html` が無ければ、現行コードのまま `node build.js && node tests/e2e.js` を一度実行して作る）

### 9-1. 単体テスト `tests/rules.test.js`（新規。外部依存なし、`node tests/rules.test.js`、失敗で exit 1）

```js
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const ctx = vm.createContext({ console }); ctx.window = ctx;
['util.js', 'config.default.js', 'rules.js', 'storage.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), ctx, { filename: f }));
const R = ctx.RecruitRules, S = ctx.RecruitStorage, P = () => S.defaults();
const NOW = new Date(2026, 9, 10); // 2026-10-10 固定
// 各テストは test(name, fn) で包み、失敗を集計して最後に process.exit(fails ? 1 : 0)
```
ヘルパー `A(over)` で既定の applicant（e2e の emptyApplicant 相当）に上書きして作る。

| # | 観点 | 入力 | 期待 |
| --- | --- | --- | --- |
| 1 | 法定深夜の境界 | 17:00〜22:00 / 17:00〜22:01 | `hasLegalNight` false / true |
| 2 | 早朝 | 05:00〜09:00 / 04:59〜09:00 / 00:30〜05:00 | false / true / true（`isLateNight` も true＝既存バグの回帰） |
| 3 | 年少者の深夜 | 17歳・大学1年・18:00〜22:30 ／ 18歳 | `minor_late_night` あり（+`age_category_mismatch`）／なし |
| 4 | 年少者の深夜帯希望のみ | 17歳・シフト〜21:00・lateNight=consult | `minor_late_night` あり、`late_night_consult` なし |
| 5 | 高校生ポリシー | 高校2年・16歳 | `hs_out_of_policy` のみ（`highschool_permission`/`hours`/`hs_exception_*` なし） |
| 6 | 例外充足 | 高校3年・17歳・careerDecided yes・university・continue yes | `hs_exception_ok`、unmet なし |
| 7 | 例外未充足 | decided no ／ path employment ／ continue undecided ／ 全部空 | `hs_exception_unmet`、`{hsUnmet}` がそれぞれ「進路が未決定」「進路が『就職』（例外の対象外）」「卒業後の継続が未定」「…が未入力」を含む |
| 8 | mode | allow で高2 ／ deny で条件充足の高3 | hs_* なし・`highschool_permission` あり ／ `hs_out_of_policy` |
| 9 | 要件 OFF | `requireContinue=false`、continue 空 | `exception_met` |
| 10 | 18歳の高3 | 18歳・高3・allNight=ok・lateNight=ok | `hs_night_policy`（block）。`allnight_minor`・`allnight_ok`・`late_night_*` は出ない。allNight 0点（restricted）。`nightRestricted=false` にすると `allnight_ok` が出て 0点でなくなる |
| 11 | 年少者のオールナイト | 17歳・高3・allNight=ok | `allnight_minor`（block）。allNight score 0・flags restricted。close は `legalCloseDays` で数える（17:00〜22:00 のシフトは加点、17:00〜23:00 は加点しない） |
| 12 | 深夜×オールナイト | 21歳・lateNight=ng・allNight=ok | `allnight_latenight_conflict` |
| 13 | 終電 | 最遅終了 23:30・buffer 15、終電 23:45 / 23:44 / 00:20 / 04:59 / 05:00 | なし / あり / なし / なし / あり |
| 14 | 曜日数×週日数 | 曜日3・max3 ／ 曜日3・max4 ／ anyDay・max7 ／ min5・max3 | なし ／ mismatch ／ なし ／ order |
| 15 | 卒業残月 | NOW、卒業 2027-03×mid（5<6）／ 2027-04×mid（6）／ 2027-09×long（11）／ 2027-10×long（12）／ 2027-03×mid・continue yes | あり ／ なし ／ あり ／ なし ／ なし |
| 16 | 年齢区分 | 14歳×高1 ／ 15歳×高1 ／ 19歳×高3 ／ 20歳×高3 ／ 17歳×大学1年 | あり ／ なし ／ なし ／ あり ／ あり |
| 17 | 繁忙期 critical | summer=ng ／ silver=ng | `vacation_ng` ／ `busy_optional_ng`（vacation_ng なし） |
| 18 | 外国籍＋かけもち | 週24h＋かけもち4h ／ ＋5h | exceeded なし ／ あり（`{sideJobHours}`=5） |
| 19 | 貢献度 例A | 4-4 例A の入力 | 各項目 20.9 / 9 / 5 / 3.8 / 10 / 5 / 7.5 / 4.2、total 65.4、band high、incomplete false |
| 20 | 貢献度 例B | 4-4 例B | total 17.6、band low |
| 21 | 繁忙期 ratio | days=refDays → 1、days=refDays+5 → 1、ng に days → 0、○で days 空 → 0＋missing「繁忙期の日数」、全 weight 0 → busy は applicable=false（max から除外） | 表のとおり |
| 22 | 帯の境界（丸め後） | pct 60.0 / 59.9 / 35.0 / 34.9 | high / mid / mid / low |
| 23 | 面接の境界 | 35/50、34/50、20/50、19/50 | high / mid / mid / low |
| 24 | feature OFF | `features.allNight=false` ／ 全 items enabled=false | max 85・allNight が parts で applicable=false ／ `enabled=false`・mode interviewOnly |
| 25 | マトリクス | 面接高×貢献低（例B＋全5点、checks 全済） | `result='review'`、`matrix.cellKey='high_low'`、`note` あり、adjustments 空 |
| 26 | 入力不足 | 面接高・繁忙期1期間未回答 ／ 面接低・同 | mode incomplete・review・adjustments[0].code `contribution_incomplete` ／ reject のまま |
| 27 | 高校生ホールド | 面接高×貢献高・高2・全 checks 済み | review（`highschool_hold`）。`holdOnHighschoolException=false` なら recommend |
| 28 | 法令ホールド | 面接高×貢献高・17歳 深夜シフト・`minor_late_night` 未チェック・`holdOnUnresolvedBlock=false` | review（`legal_hold`） |
| 29 | 下げるだけ | `matrix.cells.low_low='recommend'` に変更＋高2 | recommend → review（上げる調整は起きない）。`baseResult='recommend'` |
| 30 | 不正セル | `cells.high_high='xxx'` | normalize 後は既定に戻る。normalize を通さず evaluate すると legacy＋warning |
| 31 | 0 の扱い | `reviewPct=0`、面接 0点 | 面接帯 mid（`||` で既定に戻らない） |
| 32 | normalize v1（新宿） | `v1-profile-shinjuku.json` | schemaVersion 2、vacationItems 7 件で既定順、`vacation_ng.text` が新文言・category busy、`highschoolPolicy.mode='exceptionOnly'`、report.migratedFrom=1 |
| 33 | normalize v1（他劇場） | `v1-profile-other.json` | `commute_warn` の独自文言は維持、`mode='allow'`、`features.contribution=false`、`features.allNight=false` |
| 34 | 冪等・削除の保持 | normalize 2 回 ／ v2 で silver を削除 → normalize | deepEqual ／ silver は復活しない |
| 35 | LOCKED | `minor_late_night.enabled=false, severity='info'` を normalize | enabled true・severity block |
| 36 | validateProfile | highPct ≤ midPct ／ refDays > maxDays ／ id 重複 | errors にそれぞれ 1 件 |
| 37 | 既存回帰 | 現行 e2e と同じ applicant（新フィールド空） | 新規ルール（`shift_unanswered` 等）と `graduation_midterm` 以外の留意点 id 集合が現行と同じ |

### 9-2. e2e（`tests/e2e.js` の改修・追加）

- 先頭に `const fails = []; const expect = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };`、最後に `ERRORS` が空であることも expect し、`if (fails.length) process.exit(1)`
- `page.goto` の前に `await page.clock.setFixedTime(new Date('2026-10-10T09:00:00+09:00'))`（Playwright 1.56.1 で利用可）
- 既存の `page.on('dialog', d => d.accept())` は維持

| ID | シナリオ | 確認 |
| --- | --- | --- |
| E1 | 既存の主シナリオを改修（大学3年・21歳）。Step1 では繁忙期を GW○5・年末年始○4 だけ入力、他は空欄 | Step1→2 で止まらない。Step2 に `shift_unanswered`、貢献度カードに「未確認」。Step3 で採点後に「判定」→ **step が 3 のまま**・toast。Step3 カードで 4-4 例A の残りを入力 → 判定 → `judgment.contribution.total===65.4`、`matrix.cellKey==='high_high'`、`baseResult==='recommend'`、`result==='review'`、adjustments に `unresolved_block`。Step2 に戻って全チェック → 再判定で `recommend`。`state.handoff` に `shift_unanswered` が残っていない（stale 再生成の確認） |
| E2 | 高校2年・16歳 | 区分 option の文字に「原則対象外」、`#hsPolicyAlert` 可視（`.alert.danger`）、`#grp-hs-exception` 非表示、`#minorNotice` 可視。Step2 に `hs_out_of_policy`（block）、`highschool_permission` なし。全5点・全チェックでも `result==='review'`（`highschool_hold`） |
| E3 | 高校3年・17歳・決定済み・大学進学・継続する、オールナイト○を選択 | `#hsExceptionStatus` が ok、`#allNightLegal` 可視、Step2 に `hs_exception_ok` と `allnight_minor`、contribution の allNight が 0・restricted |
| E4 | 高校3年・18歳・進路未決定・深夜帯○ | `hs_exception_unmet`（文言に「進路が未決定」）、`hs_night_policy`。`minor_late_night` なし |
| E5 | 4-4 例B の入力＋面接すべて5点＋全チェック | `result==='review'`、Step4 の `table.matrix td.current` が「高×低」、`cellNotes.high_low` の文言が表示。設定で `matrix.cells.high_low` を「不採用推奨」に変更・保存 → 再判定で `reject` |
| E6 | 大学生・月 17:00〜23:50・深夜帯○・帰宅=終電・終電 00:00 | `#lastTrainWarn` 可視、Step2 に `late_night_last_train_early`。終電 00:05 にすると消える |
| E7 | `tests/fixtures/v1-record.html` を読み込む | エラーなし、`.legacy-banner` 表示（保存時の判定タイトルを含む）、`state.handoff` が再生成されている（`generatedAt` が読込後）、`judgment.mode==='incomplete'`、`result !== 'recommend'` |
| E8 | 設定画面 | 繁忙期に期間追加（label「話題作の公開週」）→ 保存 → Step1 に行が増え、未回答だと `shift_unanswered` に含まれる。貢献度 allNight を OFF → `#contribSum` が 85。LOCKED ルールのスイッチが disabled。`bands.highPct` を 30（≤ midPct）で保存 → エラー toast・保存されない |
| E9 | プロファイル移行 | `localStorage['recruit.profile.v1']` に `v1-profile-shinjuku.json` を入れて reload → 移行 toast、設定画面に「繁忙期・休日」「オールナイト」カテゴリのルール。`#profileFileInput` で `v1-profile-other.json` → `highschoolPolicy.mode==='allow'` |
| E10 | 整合・ボタン | 曜日2つ＋daysMax 4 → `#daysWarn`。daysMin 5／daysMax 3 → Step1 に留まり `#daysError`。17歳＋大学1年 → `#ageCategoryWarn`。「すべて ○ にする」→ 全期間 ok・日数欄が表示 |
| E11 | 回帰 | `features.contribution=false` で Step4 が従来の 4 metrics・マトリクスなし、判定は面接のみ |
| E12 | 保存 | 保存 HTML に「シフト貢献度」セクションと `.mx` 表、埋め込み JSON に `"schemaVersion":2` と `contribution` |

スクリーンショット追加: `12-step1-highschool.png`、`13-step1-busy-allnight.png`、`14-step3-shift-confirm.png`、`15-step4-matrix.png`、`16-settings-contrib.png`、`17-legacy-banner.png`（既存 01〜11 の番号は維持）。

### 9-3. 完了条件
`cd recruit-system && node tests/rules.test.js && node build.js && node tests/e2e.js` がすべて成功（exit 0、`ERRORS: none`）。

### 9-4. 推奨の実装順
1. 9-0 の fixtures 退避 → 2. rules.js の定数・ヘルパー・`analyzeShifts` 拡張・公開判定関数（単体テストを書きながら）→ 3. config.default.js → 4. CONDITIONS（新規・変更）→ 5. `computeContribution`・`evaluateHiring` → 6. storage（normalize/migrate/validate/record/report）→ 7. app.js（共通部品 → Step1 → handoffStale → Step2 → Step3 カード → Step4 → サマリー → applyRecord）→ 8. settings.js → 9. styles.css → 10. e2e → 11. README / HANDOFF 更新 → 12. P1

---

## 10. 決定事項と理由・残るリスク

### 10-1. 統合時に決めた既定値と理由（すべて設定で変更可能）

| # | 決定 | 理由 |
| --- | --- | --- |
| 1 | **入力フローは案0**（Step1 は空欄可、Step3 で確定、Step3→4 で未確認ゼロを必須） | 応募書類に GW の日数等は書かれていない。面接前は申し送り（決定事項 A）を守りつつ、判定時には「どの期間に出られるか」が必ず明確になる（決定事項 C）。案1の「Step1 で全部必須」は採らない |
| 2 | **マトリクス既定は従来との差を「高×低」の 1 マスだけ**（中×低も上長判断） | 導入時の違和感を最小にし、決定事項 E の例を満たす。案0/案2 の「中×低＝不採用推奨」は `matrix.cells.mid_low` を 1 クリックで変えられる |
| 3 | **未確認は 0 点でマトリクスに当てない**（mode=incomplete → 面接のみ・推奨に留めない） | 入力漏れが減点として働き不採用に落ちるのを防ぐ（案2 の欠点を回避） |
| 4 | **○△ の繁忙期は日数も必須**（空欄に既定割合を与えない） | 「日数を入れた方が空欄より不利」という逆転を防ぐ。Step3 で確定させる前提なので運用負担は限定的 |
| 5 | **高校生ホールド**（原則対象外・例外未充足は確認済みでも採用推奨にしない） | 決定事項 B「基本 NG」と判定表示の整合。外すには `holdOnHighschoolException` を OFF |
| 6 | **高3例外は「進学」のみ既定で許可**（就職・その他は対象外。`allowedCareerPaths` で変更可） | ユーザーの言葉「進学先へ行っても」に忠実にした |
| 7 | **18歳以上の高3も深夜・オールナイト不可**（`nightRestricted=true`） | HANDOFF の「18歳以上の高3の扱い」に対し安全側。法令上は可能なので設定で外せる |
| 8 | **法令値はコード定数・法令ルールは OFF 不可**（文言は編集可） | 設定ミスで労基法違反の見落としが起きないように。運用値（`lateNightStartHour` 等）とは分離 |
| 9 | **繁忙期 7 期間・critical は 3連休/GW/夏休み/お盆/年末年始**、SW・春休みは × でも要確認止まり | 「3連休以上」を重点にしつつ、SW・春休みだけで要判断が出て保留が多発するのを防ぐ |
| 10 | **配点 繁忙期30・土日15・オールナイト15・祝日5・クローズ10・オープン5・週日数10・期間10**、帯 60%/35% | 3案の中央値。繁忙期＋土日祝＋オールナイトで 65 点＝ユーザーの重点が過半になる |
| 11 | 夏休み・春休みは「週あたり日数」、3連休は「1回あたり日数」で入力 | 長い期間の合計日数は応募者が答えにくい（案2 の unit を採用） |
| 12 | 帯は**丸めた pct** で判定 | 「60.0%（中）」のような表示と判定の矛盾を防ぐ |
| 13 | 高校生でも 22:00 までのクローズは加点（`legalCloseDays`） | 合法な貢献を落とさない（案1 の一律 0 点は採らない）。オールナイトと 22 時以降の加点だけ強制 0 |
| 14 | 未確認の申し送りは `shift_unanswered` 1 件に集約 | 期間ごと・項目ごとの info/warn を並べると申し送りが長くなる（案1 の約 30 件の反省） |
| 15 | Step3 で貢献度の点は見せるが**判定の見込みは見せない** | 採点者が結果から逆算するバイアスを防ぐ。面接前の点数表示も `showBeforeInterview` で消せる |
| 16 | 旧プロファイル移行は劇場名で振り分け（新宿以外は高校生 allow・2軸 OFF・オールナイト OFF）＋移行 toast | 他劇場の従来動作を黙って変えない（案2）。推定が外れても toast で設定確認を促す |
| 17 | `graduation_midterm` は id を維持して一般化、`continueAfterGraduation=yes` なら出さない | 新 id にすると旧プロファイルでの ON/OFF・文言編集が引き継がれない |
| 18 | handoff は stale 方式で再生成、文言が変わった項目だけチェックを外す | Step3 で条件を変えたときの古い留意点・ホールドの効き漏れ、`applyRecord` の前応募者 handoff 残りを解消 |
| 19 | 既存 `texts.*.body` は変えず、2軸用本文は `texts.matrix.*` に分離 | 文言移行を最小化し、面接のみ判定（feature OFF）では従来の文言をそのまま使う |
| 20 | P1 に回したもの（年少者の時間上限・就労年齢・足切り・クローズ標準終了・オールナイトの外国籍時間・卒業過去日） | P0 の範囲を確実に仕上げるため。キーの既定値だけ P0 で入れて移行不要にする |

### 10-2. 副支配人に確認したいこと（試行後に設定で調整）

1. マトリクス「面接中×貢献高」を採用推奨に上げるか、「面接中×貢献低」を不採用推奨に下げるか
2. 配点・帯・繁忙期の重み／満点日数（`refDays`）は仮置き。過去の採用者 5〜10 人分を入力し、「良かった人」が高く出るか試し打ちして調整したい
3. 高3例外で「就職」を含めるか。指定校推薦（秋）と一般入試（2〜3月）で「決定済み」の時期が違う点、合格見込みを決定済みとみなすか
4. 18 歳到達・卒業後（4 月以降）の区分更新は運用（記録上の区分変更）で対応する想定でよいか
5. オールナイトの実際の時間帯（22:00〜翌6:00 は仮）、休憩・始発帰宅のルール、タクシー規定との関係
6. 土日頻度の選択肢（毎週両日／毎週片方／隔週／月1）と割合が現場の感覚に合うか
7. 面接前（Step2）に貢献度の点数を見せるか（バイアスが気になれば `showBeforeInterview` OFF）

### 10-3. 残るリスク

- **Step3 の入力負担**: 未確認ゼロが判定の条件になるため、面接で聞き漏らすと判定に進めない。`shift_unanswered` と Step2「面接で確認すること」で事前に可視化して緩和。どうしても確認できない場合は `requireComplete` を OFF（未確認は 0 点としてマトリクスに当たる）
- **旧保存ファイルの再判定**: 繁忙期の追加期間などが未入力のため「採用推奨 → 上長最終判断要」に下がって見える（安全側）。バナーと差分 toast で保存時の判定を併記
- **自己申告の拘束力**: 繁忙期の日数・進路決定は申告ベース。合格通知の確認方法と個人情報の扱い（コピーを取らない等）は運用で決める
- **年齢は整数の自己申告**: 誕生日直前の 17/18 歳の境目、勤務開始日時点の年齢は面接で年齢証明書により確認する前提（P1 `minor_documents`）
- **外国籍の長期休業特例**: 週40時間は「留学」かつ学則上の長期休業のみ。アプリは学則の期間を知らないため説明文（`foreign_busy_cap`）を出すだけで、貢献度は割り引かない
- **劇場名による移行推定**: 新宿以外が劇場名を「TOHOシネマズ新宿」のまま使っていると新宿既定が入る（toast で確認を促す）
- **今回の範囲外（HANDOFF の TODO に残す）**: 評価項目の重み、懸念 N 件で一段下げる処理、ノーコードの条件ビルダー、ver4.4 ファイルの読み込み、申し送りの印刷レイアウト、`returnMethods`／`workPermitStates` のラベル編集、生年月日入力
