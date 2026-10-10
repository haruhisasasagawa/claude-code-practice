# 詳細仕様書（確定版）: 入力の段階分け（面接前に入力／面接時に確認）

- 対象: `recruit-system/`（ブランチ `claude/toho-shinjuku-hiring-app-quhjtc`）。**git commit / push はしない**（作業ツリーに変更を残すだけ）
- 位置づけ: 仕様案 0（現場運用の軽さ）を画面構成の骨格にし、仕様案 1（汎用性・設定・互換）の rules/profile の分担、Step3 での未入力留意点のチェック、設定画面の一括ボタンを取り込んだ統合版。本書の名前・profile キー・data-bind パス・既定値・文言は**確定値**として実装する。`docs/SPEC.md`（フェーズ2の確定仕様）は変更しない
- 背景（副支配人の要望）: 「面接前の確認項目が多すぎる。繁忙期の出勤頻度などは面接の時に確認したい。面接に進めるかの判断に使うのは、週何日勤務できるか・入れる時間帯・勤務期間くらい。あとは留意点を引き継げるフリーコメントがあれば十分」
- 実装後に更新するもの: `README.md`（使い方 Step1〜3、設定の章、テストの説明に E15〜E19）、`docs/HANDOFF.md`（1-1 画面・1-2・1-3・1-4、決定事項、TODO）、`src/app.js` の `helpHtml()`・`STEPS`、`node build.js` で `dist/` を再生成

---

## 0. 方針

### 0-1. 変えないこと

| 方針 | 内容 |
| --- | --- |
| 判定ロジック | `evaluateHiring`・`computeContribution`・`shiftConditionMissing`・各 `CONDITIONS` の**条件**は変えない。段階は「どの画面で入力するか」「申し送りでどう見せるか」の問題として扱う。rules.js に足すのはセクションのカタログ・純関数・`buildHandoff` の item に付ける印（`deferred` / `aggregate` / `section`）・テンプレート変数だけ |
| 互換 | applicant のフィールド名・構造、ルール id、`PROFILE_KEY='recruit.profile.v1'`、保存形式（HTML＋`#recruit-record` JSON、`schemaVersion: 2`）は変えない。profile の `schemaVersion` も 2 のまま（キー追加と既定文言の差し替えだけ） |
| 劇場固有値の置き場所 | 既定の段階・文言は `config.default.js` の profile。rules.js はセクションの構造（どのフィールドがどのセクションか）だけを持ち、段階の既定値は持たない |
| 判定前に確定 | 既存の `contribution.requireComplete`（シフト条件の未確認ゼロで判定へ）・`validateDays`・`validateContribution` は維持 |
| アプリは止めない | 段階が「面接時」の項目は Step1 で必須にしない。高校生・法令の留意点は段階に関係なく常に Step2 に出す |
| コードスタイル | 既存どおり IIFE・`const`/`var`・`function`。外部ライブラリなし。日本語 UI |

### 0-2. 画面の流れ（既定の段階）

```
Step1 応募情報（採用担当・目安2〜3分）
  基本情報（氏名* 性別 年齢* 区分* 卒業予定年月／高校生の表示／高3例外条件／外国籍 該当する・しない）
  通勤（通勤方法* 通勤時間* 最寄り駅）
  勤務条件（勤務可能曜日* 週の最低・最大勤務日数 勤務希望時間* 勤務期間*）
  ▶ 面接前に分かっている項目があれば入力（任意）  … 閉じた折りたたみ（繁忙期・土日祝／深夜帯／オールナイト／かけもち／外国籍の詳細／卒業後の継続 …）
  面接者への申し送りコメント（自由記述）
Step2 面接者への申し送り
  申し送りコメント → 応募者 → 「面接で確認すること」 → 留意点（未入力が原因のものは除く） → 貢献度の見込み → 追記
Step3 面接評価
  採点 → 「面接で確認する項目」（面接時の項目を全項目。Step1 で入れた値も表示）→ 面接所見
Step4 採用可否判定（変更なし。未入力のまま判定した項目に「面接で確認」の印）
```

---

## 1. セクションの定義と既定の段階

### 1-1. セクション一覧（rules.js `INPUT_SECTIONS`。配列の順＝Step2・Step3・設定画面・レポートの並び）

| id | 表示名（`label`） | フィールド（applicant のパス。名前は変えない） | 段階 | 有効条件 `sectionActive` | 応募者ごとの対象 `sectionRelevant`（有効条件に加えて） |
| --- | --- | --- | --- | --- | --- |
| `basic` | 基本情報 | `name` `gender` `age` `category` `graduationDate` | **固定 pre** | 常に | 常に |
| `hsException` | 高校3年生の例外条件 | `highschool.careerDecided` `highschool.careerPath` `highschool.destination`、`continueAfterGraduation`（例外対象区分のとき） | 既定 pre | `highschoolPolicy.mode !== 'allow'`（policy 欠落は allow 扱い） | `highschoolStatus().isExceptionCategory` |
| `continuation` | 卒業後の継続 | `continueAfterGraduation`（例外対象区分以外の学生） | 既定 interview | `features.graduationDate !== false` | 学生グループ（`isStudentGroup`）かつ例外対象区分でない |
| `foreignFlag` | 外国籍 | `foreign.isForeign` | 既定 pre | `!!features.foreignNational` | 常に |
| `foreignDetail` | 外国籍の詳細 | `foreign.residenceStatus` `foreign.workPermit` `foreign.residenceExpiry` `foreign.japaneseLevel` | 既定 interview | `!!features.foreignNational` | `foreign.isForeign === 'yes'` |
| `commute` | 通勤 | `commuteMethod` `commuteMinutes` `nearestStation` | 既定 pre | 常に | 常に |
| `work` | 勤務条件 | `workDays` `anyDay` `shifts` `daysMin` `daysMax` `workPeriod` | **固定 pre** | 常に | 常に |
| `sideJob` | かけもち | `sideJob` `sideJobDetail` `sideJobHoursPerWeek` | 既定 interview | 常に | 常に |
| `busy` | 繁忙期・土日祝 | `vacation.*` `vacationDays.*` `weekendFreq` `holidayWork` | 既定 interview | `features.vacation \|\| features.holidayWork \|\| features.weekendFreq` | 常に |
| `lateNight` | 深夜帯（{h}時以降） | `lateNight.availability` `.returnMethod` `.lastTrain` `.taxiFare` | 既定 interview | `!!features.lateNight` | 常に（年少者・高校生でも法令・運用の注意を出すため表示する） |
| `allNight` | オールナイト上映 | `allNight.availability` `.frequency` `.note` | 既定 interview | `!!features.allNight` | 常に（同上） |
| `extras` | 希望部署・応募経路 | `department` `applicationRoute` | 既定 interview | `features.department \|\| features.applicationRoute` | 常に |
| `notes` | 面接者への申し送りコメント | `reviewerNotes` | **固定 pre** | 常に | 常に |

- `{h}` は `params.lateNightStartHour`（`num(…, 22)`）で埋める（既定「深夜帯（22時以降）」。`describeApplicant` の行ラベルと一致）。
- **制約**: `foreignFlag` が interview のとき `foreignDetail` は interview に固定（normalize と `stageOf` の両方で強制）。該当の有無が分からないまま詳細だけ面接前に聞くことはないため。
- `continueAfterGraduation` は 1 つのフィールドだが、例外対象区分（高3）では `hsException`、それ以外では `continuation` に属する（`continueSection`）。1 画面に 1 回だけ描く（同じ name の radio が 2 組あると選択が壊れる）。
- **Step1 の必須**は 氏名・年齢・区分・通勤方法・通勤時間・勤務可能曜日・勤務希望時間・勤務期間 のまま（`commute` を interview にしたときは通勤方法・通勤時間も必須から外す）。**週の最大勤務日数も既定で必須**（`stageOptions.requireDaysMax`、既定 true。設定で外せる。8-1 D9 改訂）。
- 副支配人の要望との対応: 面接前に残るのは基本情報・高校生の表示と高3の例外条件・外国籍の該当の有無・通勤・勤務条件（曜日・時間・週日数・勤務期間）・申し送りコメント。繁忙期・祝日・土日の頻度、深夜帯（可否・帰宅手段・終電・タクシー料金）、オールナイト、かけもち、外国籍の詳細、学生の卒業後の継続、希望部署・応募経路は面接時。

### 1-2. rules.js に追加する定数（export する）

```js
// 入力の段階（profile.inputStages の値）
const INPUT_STAGES = ['pre', 'interview'];
const INPUT_STAGE_LABELS = { pre: '面接前に入力（Step1）', interview: '面接時に確認（Step3）' };
// 入力セクション（構造だけ。既定の段階は config の inputStages。fixed は常に pre）
const INPUT_SECTIONS = [
  { id: 'basic',         label: '基本情報', fixed: true, ask: '氏名・性別・年齢・区分・卒業予定年月',
    fields: ['name', 'gender', 'age', 'category', 'graduationDate'] },
  { id: 'hsException',   label: '高校3年生の例外条件', ask: '進路（決定済みか・種別・進学先）と、卒業後も当劇場で継続するか',
    fields: ['highschool.careerDecided', 'highschool.careerPath', 'highschool.destination', 'continueAfterGraduation'] },
  { id: 'continuation',  label: '卒業後の継続', ask: '卒業後も当劇場でアルバイトを継続するか',
    fields: ['continueAfterGraduation'] },
  { id: 'foreignFlag',   label: '外国籍', ask: '外国籍に該当するか',
    fields: ['foreign.isForeign'] },
  { id: 'foreignDetail', label: '外国籍の詳細', ask: '在留資格・資格外活動許可（在留カード裏面）・在留期限・日本語レベル',
    fields: ['foreign.residenceStatus', 'foreign.workPermit', 'foreign.residenceExpiry', 'foreign.japaneseLevel'] },
  { id: 'commute',       label: '通勤', ask: '通勤方法・通勤時間・最寄り駅',
    fields: ['commuteMethod', 'commuteMinutes', 'nearestStation'] },
  { id: 'work',          label: '勤務条件', fixed: true, ask: '勤務可能曜日・勤務希望時間・週の勤務日数・勤務期間',
    fields: ['workDays', 'anyDay', 'shifts', 'daysMin', 'daysMax', 'workPeriod'] },
  { id: 'sideJob',       label: 'かけもち', ask: 'かけもちの有無・かけもち先・週あたり時間',
    fields: ['sideJob', 'sideJobDetail', 'sideJobHoursPerWeek'] },
  { id: 'busy',          label: '繁忙期・土日祝', ask: '繁忙期ごとの可否と出られる日数・土日の出勤頻度・祝日の勤務',
    fields: ['vacation', 'vacationDays', 'weekendFreq', 'holidayWork'] },
  { id: 'lateNight',     label: '深夜帯（{h}時以降）', ask: '{h}時以降の勤務の可否・帰宅手段（終電時刻・タクシー料金）',
    fields: ['lateNight.availability', 'lateNight.returnMethod', 'lateNight.lastTrain', 'lateNight.taxiFare'] },
  { id: 'allNight',      label: 'オールナイト上映', ask: 'オールナイトの可否・頻度・条件',
    fields: ['allNight.availability', 'allNight.frequency', 'allNight.note'] },
  { id: 'extras',        label: '希望部署・応募経路', ask: '希望部署・応募経路',
    fields: ['department', 'applicationRoute'] },
  { id: 'notes',         label: '面接者への申し送りコメント', fixed: true, ask: '',
    fields: ['reviewerNotes'] }
];
// 未入力が原因で出る留意点のうち、セクションが「面接時」なら Step2 の一覧から外すもの（条件は変えない）
const DEFERRABLE_RULES = {
  late_night_return_unknown: { section: 'lateNight' },
  late_night_last_train:     { section: 'lateNight' },
  late_night_taxi_unknown:   { section: 'lateNight' },
  // 'no' / 'unknown' は回答なので対象外（空欄のときだけ）
  foreign_permit_missing:    { section: 'foreignDetail', byBlank: function (c) { return !(c.a.foreign.workPermit || ''); } },
  foreign_expiry:            { section: 'foreignDetail', byBlank: function (c) { return !c.a.foreign.residenceExpiry; } }
};
// Step2 では「面接で確認すること」カードがこの内容を表すため、一覧に出さないルール
const AGGREGATE_RULES = { shift_unanswered: true };
```

### 1-3. rules.js に追加する関数（DOM 非依存・export する）

| 関数 | 仕様 |
| --- | --- |
| `stageOf(profile, id)` | `fixed` のセクション・未知の id → `'pre'`。`id === 'foreignDetail'` かつ `stageOf(profile, 'foreignFlag') === 'interview'` → `'interview'`。`profile.inputStages[id]` が `'pre'` / `'interview'` ならその値。キー欠落・不正値・`inputStages` 自体が無い（未 normalize の profile）→ `'pre'`（＝従来どおり全部 Step1・deferred なし） |
| `sectionLabel(profile, id)` | `label` の `{h}` を `num(params.lateNightStartHour, 22)` で置換 |
| `sectionAsk(profile, id)` | `ask` の `{h}` を同様に置換 |
| `sectionActive(profile, id)` | 1-1「有効条件」 |
| `sectionRelevant(a, profile, id)` | `sectionActive` かつ 1-1「応募者ごとの対象」 |
| `continueSection(a, profile)` | `highschoolStatus(a, profile).isExceptionCategory ? 'hsException' : 'continuation'`（学生以外も `'continuation'`。描画位置を区分の変更で動かさないため） |
| `sectionHasInput(a, profile, id)` | そのセクションのフィールドのどれかに値がある。`vacation` / `vacationDays` は profile の期間（`busyItems`）のどれか、`shifts` はどれかの曜日の start/end、`workDays` は 1 つ以上、`anyDay` は true、`continueAfterGraduation` は `continueSection(a, profile) === id` のときだけ数える |
| `interviewConfirm(a, profile, opts)` | 1-4。`opts`: `{ shift, night, hs, contribution }`（省略時は内部で計算） |

### 1-4. `interviewConfirm(a, profile, opts)` — 「面接で確認する項目」の元データ

```
戻り値 {
  strict: bool,          // contribution.enabled && profile.contribution.requireComplete !== false（required が判定を止めるか）
  sections: [{           // INPUT_SECTIONS の順。sectionActive なものだけ
    id, label, ask,      // label / ask は sectionLabel / sectionAsk
    stage,               // stageOf
    fixed: bool,
    relevant: bool,      // sectionRelevant
    toAsk: bool,         // stage === 'interview' && relevant && !(night.restricted && (id === 'lateNight' || id === 'allNight'))
    hasInput: bool,      // sectionHasInput
    missing: [{ key, label, level }],   // level: 'required' | 'check' | 'optional'（下表）
    blocking: bool       // strict && missing に required がある
  }],
  items: [{ section, sectionLabel, key, label, level }],  // sections[].missing を平らにしたもの（同じ順）
  summary: string,       // required だけをセクションごとに '{label}：{a}、{b}' にして '／' で連結（無ければ ''）
  sectionLabels: [string]// missing が 1 つ以上あるセクションの label（順序は INPUT_SECTIONS）
}
```

**missing に入れる範囲**
- `toAsk` のセクション → 下表の全 level
- `stage === 'pre'` のセクション（fixed を含む）・`toAsk` でない interview のセクション → `required` だけ（判定に必要な未入力。例: 週の最大勤務日数、busy を pre にして空欄で来た場合）

**level の意味**
- `required` … `shiftConditionMissing` の項目。`strict` なら Step3→4 で止まる（既存 `validateContribution`）
- `check` … 空欄のままだと留意点（deferred）や確認漏れが残る項目。Step3 の `#shiftConfirmStatus` に「判定は止めません」として出す。**対応する留意点ルール（`late_night_return_unknown` / `late_night_last_train` / `late_night_taxi_unknown` / `foreign_permit_missing` / `foreign_expiry`）を劇場が OFF にしているときは `optional` に下げる**（OFF なら空欄でも留意点は残らないため）
- `optional` … 空欄でも判定には何も起きない（記録用）。Step2 のカードと、Step3 の `#shiftConfirmStatus` の「まだ入力のない項目」（4-3 の 3）に出す

| section | key | label | level | 条件 |
| --- | --- | --- | --- | --- |
| work | `daysMax` | `shiftConditionMissing` の label（週の最大勤務日数） | required | `missingKeys` に `daysMax` |
| commute | `commuteMethod` / `commuteMinutes` | 通勤方法 / 通勤時間 | optional | 空欄（interview にした場合だけ起こる） |
| hsException | `highschool` | `highschoolStatus().missing` の各要素（進路決定の有無・進路の種別・卒業後の継続意思） | check | 例外対象区分 |
| continuation | `continueAfterGraduation` | 卒業後も当劇場で継続するか | optional | 空欄 |
| foreignFlag | `foreign.isForeign` | 外国籍の該当 | check | 空欄 |
| foreignDetail | `foreign.residenceStatus` | 在留資格 | optional | 空欄 |
| foreignDetail | `foreign.workPermit` | 資格外活動許可（在留カード裏面） | check | 空欄 |
| foreignDetail | `foreign.residenceExpiry` | 在留期限 | check | 空欄 かつ `workPermit !== 'na'` |
| foreignDetail | `foreign.japaneseLevel` | 日本語レベル | optional | 空欄 |
| sideJob | `sideJob` | かけもちの有無 | optional | 空欄 |
| sideJob | `sideJobHoursPerWeek` | かけもち先の週あたり時間 | optional | `sideJob==='yes'` かつ外国籍 `yes` かつ空欄（週28時間の判定に使うため） |
| busy | `busy` / `busyDays` / `weekendFreq` / `holiday` | `shiftConditionMissing` の label をそのまま（期間名を含む） | required | 同関数のとおり |
| lateNight | `lateNight` | 同上（22時以降の勤務） | required | 同上 |
| lateNight | `lateNight.returnMethod` | 帰宅手段 | check | `CONDITIONS.late_night_return_unknown` と同じ条件 |
| lateNight | `lateNight.lastTrain` | 終電時刻 | check | `CONDITIONS.late_night_last_train` と同じ条件 |
| lateNight | `lateNight.taxiFare` | タクシー料金の目安 | check | `CONDITIONS.late_night_taxi_unknown` と同じ条件 |
| allNight | `allNight` / `allNightFreq` | `shiftConditionMissing` の label | required | 同関数のとおり |
| extras | `department` / `applicationRoute` | 希望部署 / 応募経路 | optional | 機能 ON かつ空欄 |

- lateNight の check 3 項目は、該当する `CONDITIONS` 関数を `buildContext` の結果で呼んで判定する（条件を二重に書かない）。`interviewConfirm` は `buildContext` からも呼ばれるため、`buildContext` 内では c を組み立て終えた後に `c.confirm = interviewConfirm(a, profile, { shift, night, hs, contribution, ctx: c })` とし、`ctx` が渡されたらそれを使う（渡されなければ `buildContext` を呼ぶ。再帰しないよう `buildContext` 側は `ctx` 付きで呼ぶ）。
- 例（大学3年・Step1 の必須だけ・daysMax 空・既定 profile）: `summary` は `勤務条件：週の最大勤務日数／繁忙期・土日祝：繁忙期の可否（3連休（祝日を含む連休）・GW・…）、祝日の勤務／深夜帯（22時以降）：22時以降の勤務／オールナイト上映：オールナイトの可否`（土日を選んでいれば「土日の出勤頻度」も入る）。

### 1-5. `buildContext` / `buildHandoff` / `templateVars` / `describeApplicant` の変更

1. `buildContext`: 末尾に `c.confirm = interviewConfirm(...)`（1-4）。
2. `buildHandoff`:
   - `items.push` の直後に印を付ける（**項目の追加・削除・並び・件数・文言は変えない**）:
     ```js
     if (AGGREGATE_RULES[rule.id]) item.aggregate = true;
     const df = DEFERRABLE_RULES[rule.id];
     if (df && stageOf(profile, df.section) === 'interview' && (!df.byBlank || df.byBlank(c))) { item.deferred = true; item.section = df.section; }
     ```
     該当しない item にはキー自体を付けない（既存の item の形を変えない）。`legal`・`highschool` カテゴリのルールは対象に入れない。
   - 戻り値に `confirm: c.confirm` を追加（`contribution` と同じ扱い）。
3. `templateVars` に追加: `confirmSummary: c.confirm.summary`、`confirmSections: c.confirm.sectionLabels.join('・')`。既存の `{missingLabels}` は残す（劇場が編集した文言の互換）。
4. `describeApplicant`: 各行に `section` を付ける（label・value・並びは**変えない**。例外は 5 のラベル変更だけ）。

   | 行ラベル | section |
   | --- | --- |
   | 氏名・性別・年齢・区分・卒業予定・**高校生の例外** | `basic`（高校生の方針〈原則対象外〉は段階に関係なく面接前に伝えるため） |
   | 卒業後の継続 | `continueSection(a, profile)` |
   | 通勤方法・通勤時間・最寄り駅 | `commute` |
   | 勤務可能曜日・週勤務日数・希望シフト・勤務期間 | `work` |
   | かけもち | `sideJob` |
   | 繁忙期・祝日・土日の頻度 | `busy` |
   | オールナイト | `allNight` |
   | 深夜帯（…時以降） | `lateNight` |
   | 外国籍 | 詳細（在留資格・許可・期限・日本語）が 1 つでもあれば `foreignDetail`、「該当」「該当なし」だけなら `foreignFlag` |
   | 希望部署・応募経路 | `extras` |
   | 申し送りコメント（旧「担当者所見」） | `notes` |
5. `describeApplicant` の `担当者所見` 行のラベルを **`申し送りコメント`** に変える（app.js の除外リスト・コピー文・レポートも合わせる）。
6. `evaluateHiring`・`computeContribution`・`shiftConditionMissing`・`CONDITIONS` は変更なし。deferred / aggregate の項目も未チェックなら従来どおり `unresolved` に入る（未入力のまま判定すれば、`foreign_permit_missing` のような要判断は `unresolved_block` で採用推奨に留めない＝安全側）。

---

## 2. profile の追加キー・normalizeProfile・設定画面

### 2-1. `config.default.js`

`features` の直後に追加:

```js
// 入力の段階: 'pre'=面接前に入力（Step1 に表示） / 'interview'=面接時に確認（Step3 に表示。Step1 では折りたたみで任意入力）
// 基本情報・勤務条件（曜日・時間・週日数・勤務期間）・面接者への申し送りコメントは常に面接前（ここには書かない）
inputStages: {
  commute: 'pre',
  hsException: 'pre',
  continuation: 'interview',
  foreignFlag: 'pre',
  foreignDetail: 'interview',   // foreignFlag が 'interview' のときは自動で 'interview'
  sideJob: 'interview',
  busy: 'interview',
  lateNight: 'interview',
  allNight: 'interview',
  extras: 'interview'
},
// 入力の段階まわりの運用設定
stageOptions: {
  requireDaysMax: true,         // true: 週の最大勤務日数を Step1 の必須にする（D9 改訂で既定 true）
  preFillAlwaysOpen: false      // true: Step1 の「面接前に分かっている項目」を常に開いて表示する
},
```

`texts` に追加（設定の「結果文言」で編集可）:

```js
preFillTitle: '面接前に分かっている項目があれば入力（任意）',
preFillHint: '空欄のままで構いません。ここにある項目は面接で確認し、Step3「面接で確認する項目」で入力します。ここで入力した内容は Step3 にそのまま表示されます。',
interviewConfirmIntro: '面接で確認した内容を入力してください。Step1 で入力済みの値も表示しています。ここで変えた内容は応募情報にも反映されます。* は判定の前に入力が必要です。',
reviewerNotesIntro: '面接者が最初に読む欄です。応募書類・電話で気になった点、配慮が必要な事情、面接で確認してほしいことを自由に書いてください。申し送り文の冒頭に表示されます。',
```

既定文言の変更（2-2 の `upgradeTexts` で旧既定と完全一致するものだけ置換）:

| 場所 | 旧既定（完全一致で置換） | 新既定 |
| --- | --- | --- |
| `handoffRules[id=shift_unanswered].text` | `面接で確認が必要なシフト条件があります（{missingLabels}）。面接で確認し、Step3「シフト条件の最終確認」に入力してください。` | `判定の前に面接で確認が必要なシフト条件があります（{confirmSummary}）。面接で確認し、Step3「面接で確認する項目」に入力してください。` |
| `texts.contributionIntro` | `応募情報から計算したシフト貢献度の見込みです。「未確認」は面接で確認し、Step3「シフト条件の最終確認」で入力すると確定します。` | `応募情報から計算したシフト貢献度の見込みです。「未確認」は面接で確認し、Step3「面接で確認する項目」で入力すると確定します。` |

`shift_unanswered` の重要度（warn）・カテゴリ（busy）・**条件**（`c.contribution.missing.length > 0`）は変えない。

### 2-2. `storage.normalizeProfile`（毎回実行・冪等）

`fillArrays(merged, base)` の後、`enforceLocked(merged)` の前に 2 つ追加する。

```js
const STAGES = ['pre', 'interview'];
// 入力の段階: 既定のキーだけ残し、不正値・欠落は既定に戻す（未知のキーは削除）
function fillStages(merged, base) {
  const def = base.inputStages;
  const src = U.isObj(merged.inputStages) ? merged.inputStages : {};
  const out = {};
  Object.keys(def).forEach(function (k) { out[k] = STAGES.indexOf(src[k]) >= 0 ? src[k] : def[k]; });
  if (out.foreignFlag === 'interview') out.foreignDetail = 'interview';
  merged.inputStages = out;
  const so = U.isObj(merged.stageOptions) ? merged.stageOptions : {};
  merged.stageOptions = {};
  Object.keys(base.stageOptions).forEach(function (k) { merged.stageOptions[k] = typeof so[k] === 'boolean' ? so[k] : base.stageOptions[k]; });
}
// v2 内での既定文言の変更。旧既定と完全一致するものだけ新既定へ（編集済みの文言は維持）
const V2_TEXT_UPGRADES = {
  rules: { shift_unanswered: ['面接で確認が必要なシフト条件があります（{missingLabels}）。面接で確認し、Step3「シフト条件の最終確認」に入力してください。'] },
  texts: { contributionIntro: ['応募情報から計算したシフト貢献度の見込みです。「未確認」は面接で確認し、Step3「シフト条件の最終確認」で入力すると確定します。'] }
};
function upgradeTexts(merged, base) {
  (merged.handoffRules || []).forEach(function (r) {
    const olds = V2_TEXT_UPGRADES.rules[r && r.id];
    const b = olds && base.handoffRules.find(function (x) { return x.id === r.id; });
    if (b && olds.indexOf(r.text) >= 0) r.text = b.text;
  });
  Object.keys(V2_TEXT_UPGRADES.texts).forEach(function (k) {
    if (merged.texts && V2_TEXT_UPGRADES.texts[k].indexOf(merged.texts[k]) >= 0) merged.texts[k] = base.texts[k];
  });
}
```

- `texts.preFillTitle` 等の新しい文言は `deepMerge` で既定が補われる（追加処理不要）。
- 旧プロファイル（`inputStages` なし。新宿・他劇場、v1・v2 とも）は既定の段階になる（要件どおり）。`migrateV1` は変更しない。他劇場で従来の並びに戻すときは設定画面の「すべて面接前に入力（従来の並び）」（2-3）を使う。
- 冪等: `normalize(normalize(x))` と `normalize(x)` が deepEqual（`fillStages` は既定キー順で作り直す。新文言は旧文言の配列に含まれない）。既定プロファイルは normalize で不変。
- `validateProfile` は変更しない（段階・運用設定は normalize で必ず正しい値になる）。

### 2-3. 設定画面（`settings.js`）

- ナビ: 「入力項目のON/OFF」の直後に `<a href="#s-stages">面接前／面接時</a>`。`template()` で `featuresHtml()` の直後に `stagesHtml()`。
- `section('s-stages', '入力の段階（面接前に入力／面接時に確認）', '応募情報（Step1）に出す項目と、面接で確認して Step3「面接で確認する項目」で入力する項目を分けます。「面接時に確認」の項目も、分かっていれば Step1 下部の折りたたみから先に入力できます。判定の計算は段階に関係なく同じです。', body)`
- body（上から）:
  1. 固定行（表示のみ。`<div class="s-stage-row fixed">`）: 「基本情報（氏名・性別・年齢・区分・卒業予定年月）」「勤務条件（曜日・時間・週の勤務日数・勤務期間）」「面接者への申し送りコメント」→ 右に `<span class="badge">常に面接前</span>`
  2. 切り替え行: fixed でない `R().INPUT_SECTIONS` の順に `<div class="s-stage-row" data-stage-id="<id>">`
     - 左: `<div class="lbl">{sectionLabel(draft, id)}</div><div class="hint">含む項目: {sectionAsk(draft, id)}{追記}</div>`
     - 右: `selectTag('inputStages.<id>', [{ value: 'pre', label: '面接前に入力（Step1）' }, { value: 'interview', label: '面接時に確認（Step3）' }], { aria: sectionLabel, repaint: id === 'foreignFlag', disabled: <下記> })`
     - `!R().sectionActive(draft, id)` の行は `.off` を付け、`offNotice(false, …)` を添える: hsException は「高校生の扱いが『制限なし』のため使われません」、それ以外は「入力項目が OFF のため使われません」（選択は保存できる）
     - 追記: commute「（面接時にすると、通勤方法・通勤時間を Step1 で必須にしません）」、hsException「（高校3年生のみ）」、continuation「（高校3年生以外の学生）」
     - `foreignDetail`: `draft.inputStages.foreignFlag === 'interview'` のときは描画前に `draft.inputStages.foreignDetail = 'interview'` にそろえ、select を `disabled`、hint に「外国籍（該当の有無）が面接時のため、詳細も面接時になります」
  3. `sCheck('stageOptions.requireDaysMax', '週の最大勤務日数を Step1 の必須にする', 'OFF のときは空欄でも Step1 から進め、面接で確認します（判定の前には Step3 で必須）。')`
  4. `sCheck('stageOptions.preFillAlwaysOpen', '「面接前に分かっている項目」を常に開いて表示する', 'OFF のときは閉じて表示し、入力済みの項目があるときだけ自動で開きます。')`
  5. ボタン: `<button type="button" class="btn sm" data-action="stages-default">既定に戻す</button>`、`<button type="button" class="btn sm ghost" data-action="stages-all-pre">すべて面接前に入力（従来の並び）</button>`
- `selectTag` に `opts.disabled`（`' disabled'` を付ける）を追加。
- `onClick` に追加: `stages-default` → `draft.inputStages = U.deepClone(global.RECRUIT_DEFAULT_PROFILE.inputStages)`、`stages-all-pre` → 既定のキーをすべて `'pre'`。どちらも `paint(window.scrollY)`。
- `textsHtml()` の「シフト貢献度（面接前の見込み）の説明文」の後に `sTextarea('texts.preFillTitle', 'Step1 折りたたみの見出し', { rows: 1 })`・`sTextarea('texts.preFillHint', 'Step1 折りたたみの説明文', { rows: 2 })`・`sTextarea('texts.interviewConfirmIntro', 'Step3「面接で確認する項目」の説明文', { rows: 2 })`・`sTextarea('texts.reviewerNotesIntro', 'Step1 申し送りコメントの説明文', { rows: 2 })`。
- `VARS_HINT` に `{confirmSummary} {confirmSections}` を追加。
- 保存は既存の `doSave` → `validateProfile` → `onSave`（`normalizeProfile` → `handoffStale = true` → `invalidateJudgment()`）。Step1 は `renderStep` が毎回 `inputStepHtml()` を作るので段階の変更は自動で反映される。
- 文言の一括置換: settings.js・app.js（コメント・ヘルプ・トースト）の「シフト条件の最終確認」→「面接で確認する項目」。
- CSS（styles.css）: `.s-stage-row{display:grid;grid-template-columns:1fr 260px;gap:8px 16px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}`、`.s-stage-row.fixed{opacity:.75}`、`.s-stage-row.off .lbl{color:var(--muted)}`、幅 720px 以下は 1 列。

---

## 3. Step1 の構成

### 3-1. カードの並び（`inputStepHtml()`）

```
[基本情報]（固定）
  見出し説明: 面接に進めるかを判断するための項目です（目安 2〜3 分）。* は必須です。
             繁忙期・深夜帯・オールナイト・かけもちなどは面接で確認します（分かっていれば下の折りたたみから入力できます）。
  応募者名* 性別 / 年齢* 区分* 卒業予定年月（学生）
  #hsPolicyAlert #minorNotice #ageCategoryWarn          … 段階と無関係（常に表示条件どおり）
  #grp-continue                                         … continueSection=hsException かつ hsException=pre のとき（高3）
                                                          continueSection=continuation かつ continuation=pre のとき（学生）
  #grp-hs-exception（hsExceptionHtml）                   … hsException=pre のとき
  外国籍 [該当しない][該当する]（#grp-foreign-flag）       … foreignFlag=pre かつ features.foreignNational
  #grp-foreign-detail                                   … foreignDetail=pre のとき（isForeign==='yes' で表示）
  #foreignStageHint（alert info）                        … foreignDetail=interview のとき（isForeign==='yes' で表示）
      「在留資格・資格外活動許可・在留期限・日本語レベルは面接で確認します。在留カードの持参を依頼してください（分かっていれば下の折りたたみに入力できます）。」
[通勤]               … commute=pre のとき（commuteFieldsHtml(true)。必須は従来どおり）
[勤務条件]（固定）     曜日* / 週の最低・最大勤務日数（requireDaysMax なら最大に *）/ #daysError #daysWarn / 勤務希望時間* #hsWarn / 勤務期間*
                     sideJob=pre なら末尾に sideJobFieldsHtml()（従来の位置）
[繁忙期・土日祝] #busyCard     … busy=pre のとき（従来どおり。見出しに meterHtml）
[深夜帯] #lateNightCard        … lateNight=pre のとき（従来どおり。中身は lateNightFieldsHtml(false)）
[オールナイト上映] #allNightCard … allNight=pre のとき（従来どおり）
[その他]                      … extras=pre かつ sectionActive のとき（希望部署・応募経路のみ）
▶ #preFill 面接前に分かっている項目があれば入力（任意）   … 3-3
[面接者への申し送りコメント] #notesCard（固定・常に最後）
                                          [留意点を生成して申し送りへ →]
```

- 従来の「外国籍・在留資格」カードと「その他」カードの `reviewerNotes` は廃止し、上記へ移す。
- **`#notesCard`**: 見出し「面接者への申し送りコメント」、`<p>{texts.reviewerNotesIntro}</p>`、`fTextarea('reviewerNotes', 'コメント（任意）', { rows: 4, placeholder: '例：電話の受け答えが丁寧。土曜は月2回なら可と話していた。家族の介護で急な休みがあり得るとのこと。通勤経路を面接で確認してほしい。' })`。

### 3-2. 部品の切り出し（app.js。Step1 本体／折りたたみ／Step3 で共用。副作用なし）

| 関数 | 中身 |
| --- | --- |
| `commuteFieldsHtml(req)` | 通勤方法・通勤時間（`required: req`）・最寄り駅（`#grp-station`）・`#stationHints` datalist |
| `continueFieldHtml()` | 従来の `fSeg('continueAfterGraduation', '卒業後も当劇場で継続', CONTINUE_OPTS, { id: 'grp-continue', hint: … })` |
| `foreignFlagHtml()` | `fSeg('foreign.isForeign', '外国籍', [{ value: 'no', label: '該当しない' }, { value: 'yes', label: '該当する', tone: 'warn' }], { id: 'grp-foreign-flag' })` |
| `foreignDetailHtml()` | 従来の `<div id="grp-foreign-detail">`（在留資格・資格外活動許可・在留期限・日本語レベル） |
| `sideJobFieldsHtml()` | `fSeg('sideJob', …)` ＋ `#grp-sidejob-detail`（かけもち先・週あたり時間） |
| `lateNightFieldsHtml(req)` | 従来の深夜帯カードの中身（`#lateNightLegal`、可否 seg（`required: req && !night.restricted`）、帰宅手段、`#grp-lasttrain`、`#grp-taxi`、`#lastTrainWarn`） |
| `extrasFieldsHtml()` | 希望部署・応募経路（ON のものだけ） |
| `busyFieldsHtml(req)` / `allNightFieldsHtml(req)` / `hsExceptionHtml()` | 既存のまま |
| `sectionFieldsHtml(id, mode)` | id ごとに上を呼び分ける。`mode`: `'pre'`（Step1 本体）/`'prefill'`（折りたたみ。必須なし）/`'confirm'`（Step3） |

**1 画面に同じ `data-field`・同じ id を 2 回描かない。** 描画場所は 3-1・3-3・4-1 の規則で一意に決まる（Step1 と Step3 は同時に DOM に無い）。

### 3-3. 折りたたみ `#preFill`

```html
<details class="card prefill" id="preFill" [open]>
  <summary>
    <span class="prefill-title">{texts.preFillTitle}</span>
    <span class="badge info hidden" id="preFillCount">入力あり：繁忙期・土日祝・深夜帯（22時以降）</span>
    <span class="hint prefill-list">{interview かつ sectionActive かつ sectionRelevant のセクション名を「／」で連結（applyVisibility で入力に合わせて更新）}</span>
  </summary>
  <p class="hint">{texts.preFillHint}</p>
  <div class="prefill-sec" data-section="busy" id="busyCard"><h3 class="sub">繁忙期・土日祝</h3><p class="hint">{texts.busyIntro}</p>…busyFieldsHtml(false)…</div>
  <div class="prefill-sec" data-section="lateNight" id="lateNightCard"><h3 class="sub">深夜帯（22時以降）</h3>…lateNightFieldsHtml(false)…</div>
  <div class="prefill-sec" data-section="allNight" id="allNightCard"><h3 class="sub">オールナイト上映</h3><p class="hint">{allNightIntroText()}</p>…allNightFieldsHtml(false)…</div>
  <div class="prefill-sec" data-section="sideJob" id="pf-sideJob">…</div>
  …
</details>
```

- 中身: 段階が interview で `sectionActive` のセクションを `INPUT_SECTIONS` の順に。部品は Step1 本体・Step3 と**同じ関数・同じ `data-field`**。`required` / `data-required` / `data-required-seg` は**一切付けない**。貢献度メーター（`meterHtml`）は出さない（未入力が多いと低い点に見え、誤解を招くため。合計は右サマリーにある）。
- 各ブロックの id: busy/lateNight/allNight は従来のカード id（`#busyCard` / `#lateNightCard` / `#allNightCard`。既存の CSS・e2e の selector と互換）、それ以外は `pf-<id>`。
- 個別の扱い:
  - `hsException`=interview: `pf-hsException` に（高3なら）`continueFieldHtml()` ＋ `hsExceptionHtml()`
  - `continuation`=interview: `pf-continuation` に `continueFieldHtml()`（`continueSection === 'continuation'` のとき）
  - `foreignFlag`=interview（→ foreignDetail も interview）: `pf-foreign`（`data-section="foreign"`）に `foreignFlagHtml()` ＋ `foreignDetailHtml()`
  - `foreignFlag`=pre・`foreignDetail`=interview: `pf-foreignDetail` に `foreignDetailHtml()`
  - `commute`=interview: `pf-commute` に `commuteFieldsHtml(false)`
- 開閉: `state.preFillOpen`（`null`=自動・初期値）。描画時 `open = stageOptions.preFillAlwaysOpen || (state.preFillOpen != null ? state.preFillOpen : interview のセクションのどれかで sectionHasInput)`。`renderStep` の case 1 の後に `#preFill` へ `toggle` リスナーを**直接**付けて `state.preFillOpen = el.open`（`toggle` はバブリングしない）。「すべて ○ にする」「未確認に戻す」などの再描画で閉じない。`newRecord` / `applyRecord` で `null` に戻す。
- `#preFillCount`: interview のセクションのうち `sectionHasInput` のもののラベルを「・」で連結して「入力あり：…」。0 件なら `hidden`（`applyVisibility` で更新）。
- interview かつ `sectionActive` のセクションが 1 つも無い（全部 pre・機能 OFF）ときは `#preFill` を描かない。

### 3-4. `continueAfterGraduation` の置き場所と区分の変更

- 描画時に `state.continueAt = continueSection(a, p) + ':' + stageOf(p, continueSection(a, p))` を記録。置き場所: `hsException:pre` → 基本情報カード（`#grp-hs-exception` の直前）、`continuation:pre` → 基本情報カード、`*:interview` → `#preFill` の該当ブロック。
- `onFieldEvent` で `state.step === 1 && path === 'category'` のとき、新しい `continueAt` が `state.continueAt` と違えば Step1 を描き直す: `const y = window.scrollY; renderStep(); window.scrollTo(0, y); const el = $('[data-field="category"]'); if (el) el.focus();`（例: 大学2年 → 高校3年。既定では折りたたみ → 基本情報カードへ移る）。

### 3-5. `applyVisibility()` の追加（Step1・Step3 共通。無い要素は無視）

| 要素 | 表示条件 |
| --- | --- |
| `.prefill-sec[data-section=<id>]`、`.confirm-sec[data-section=<id>]`（id がセクション id のもの） | `R.sectionRelevant(a, p, id)`（例: `foreignDetail` は `isForeign==='yes'`、`continuation` は学生かつ例外区分でない、`hsException` は高3） |
| `[data-section="foreign"]`（外国籍をまとめたブロック） | ブロック内に該当の有無の欄（`foreign.isForeign`）があるか、`isForeign === 'yes'` |
| `#preFill .prefill-list` | 3-3（`preFillNames()`。区分・外国籍の入力に合わせて書き換える） |
| `#grp-foreign-detail` | `isForeign === 'yes'`（従来どおり。置き場所によらず 1 か所） |
| `#foreignStageHint` | `isForeign === 'yes' && stageOf(p, 'foreignDetail') === 'interview'` |
| `#preFillCount` | 3-3 |
| `#grp-continue` | 従来どおり `isStudent && (f.graduationDate !== false \|\| hs.isExceptionCategory)` |

その他の既存条件（`#grp-sidejob-detail`、`#grp-lasttrain`、`#grp-taxi`、`#grp-vdays-*`、`#lastTrainWarn` 等）は要素が折りたたみ・Step3 にあってもそのまま動く。

### 3-6. 必須チェック

- `validateInput()` は変更しない。`checkRequired('#stepContent')` は可視の `[data-required]` だけを見る。折りたたみ内には required を付けないので対象外。`commute` を interview にした場合は通勤欄に required を付けない。
- `stageOptions.requireDaysMax` が true（既定）のときだけ、Step1 の `daysMax` を `required: true` で描く。
- 週日数の 1〜7 整数・最低≦最大（`validateDays`）は従来どおり Step1 でも止める。

---

## 4. Step3「面接で確認する項目」

### 4-1. カード（`shiftConfirmHtml()` を `interviewConfirmHtml()` に置き換え。id は互換のため `#shiftConfirm` / `#shiftConfirmStatus` / `#shiftConfirmHs` を維持）

- 表示条件 `interviewCardOn()` = `shiftConfirmOn()`（既存）`|| hs.isExceptionCategory || （下の 3 で描くブロックが 1 つ以上）`。
- 見出し「面接で確認する項目」（常にこの名前。従来の「高校3年生の例外条件の確認」も統一）。右に `contribOn()` のとき `<span class="badge info">シフト貢献度</span><span class="contrib-meter" data-meter="total"></span>`（従来どおり）。説明 `<p>{texts.interviewConfirmIntro}</p>`。
- `strict = contribOn() && (p.contribution || {}).requireComplete !== false`（必須の * と `.invalid` の対象。2軸 OFF の劇場では * を出さない）。
- 本文（上から）:
  1. `#shiftConfirmStatus`（4-3）
  2. 高3例外（`hs.isExceptionCategory` のとき・**段階に関係なく**）: `<h3 class="sub">高校3年生の例外条件</h3><div id="shiftConfirmHs">` ＋ `continueFieldHtml()` ＋ `hsExceptionHtml()`（従来どおり）
  3. `INPUT_SECTIONS` の順に（`basic`・`work`・`notes`・`hsException` は除く）、ブロック `<div class="confirm-sec" data-section="<id>" id="cf-<id>"><h3 class="sub">{sectionLabel}</h3>…</div>` を描く。**どのブロックを描くかは描画時に決める**（入力のたびにブロックが増減しないように。表示・非表示は `applyVisibility`）:
     - 段階 interview かつ `sectionActive` → **全項目**（未入力だけでなく全部）: `continuation` → `continueFieldHtml()`（`continueSection === 'continuation'` のときだけ。高3では 2 で描いている）／`commute` → `commuteFieldsHtml(false)`／`sideJob` → `sideJobFieldsHtml()`／`busy` → `busyFieldsHtml(strict)`／`lateNight` → `lateNightFieldsHtml(strict)`／`allNight` → `allNightFieldsHtml(strict)`／`extras` → `extrasFieldsHtml()`
     - 外国籍は 1 ブロック `<div class="confirm-sec" data-section="foreign" id="cf-foreign">`（`features.foreignNational` のとき）。該当の有無の欄を出す条件 `flagHere = stageOf('foreignFlag') === 'interview' || isForeign === '' || state.cfSnap.foreignFlag`（Step3 を開いた時点で空欄なら、選んだ後の再描画でも欄を残す）。`flagHere` なら見出しなしで `foreignFlagHtml()` ＋ `foreignDetailHtml()`。そうでなく `stageOf('foreignDetail') === 'interview' && isForeign === 'yes'` なら見出し「外国籍の詳細」＋ `foreignDetailHtml()`。**それ以外（応募時に「該当しない」）は描かない**（中身のない見出しを出さない）
     - 1 項目だけのセクション（`continuation`・`sideJob`・外国籍の該当の有無）は見出し `h3.sub` を省き（`.confirm-sec.single`）、欄のラベルが見出しを兼ねる。Step1 の `#preFill` も同じ
     - 段階 pre の `busy` / `allNight`（`shiftConfirmOn()` かつ `sectionActive`）→ 従来どおり最終確認として全項目。見出しは Step3 を開いた時点で `sectionHasInput` なら `{sectionLabel}（応募時に入力済み・変更があれば修正）`、空なら `{sectionLabel}（応募時は未入力）`（`state.cfSnap`。`goStep` のたびに取り直し、入力中の再描画では変えない）
     - 段階 pre の `lateNight`（`shiftConfirmOn()` かつ機能 ON）→ 従来の可否 seg 1 行だけ（`required: strict && !night.restricted`）
  4. 「週の勤務日数（確認）」（`shiftConfirmOn()` のとき。そうでない劇場でも、`interviewConfirm` に `daysMax` の未入力があるとき＝Step2 の「応募時に未入力」から Step3 へ案内される場合）: `daysMin`・`daysMax`（`required: strict`）・`#daysError`・`#daysWarn`。カードを描くかの判定にも含める
  5. `#interviewNewItems`（4-4b）→ `#deferredItems`（4-4）
- Step1 で先に入力した値は同じ `state.applicant` を読むのでそのまま表示される。ここで変えた内容は応募情報に反映される。

### 4-2. 判定前のチェック（変更なし）

`data-action="judge"` → `validateScores() && validateDays() && validateContribution()`。`validateContribution` は `strict` のとき貢献度の未確認（`required`）だけを見て止める（toast「判定の前にシフト条件を確定してください：…」も従来どおり）。`check` / `optional` の未入力では止めない（未入力のまま判定すると deferred の留意点が未確認として判定に出る）。

### 4-3. `#shiftConfirmStatus`（`updateContribMeters()` 内。既存の行を拡張）

上から該当するものだけ `<br>` で連結:
1. 貢献度の未確認（既存のまま）: `未確認：{c.missing.join('・')}。判定の前に入力してください。`（strict でなければ「面接で確認できた項目を入力してください。」）
2. **新**: `interviewConfirm` の `toAsk` セクションの `level === 'check'` の項目（`hsException` を除く）: `未入力（判定は止めません）：{sectionLabel}：{label}、…／…。未入力のまま判定すると確認事項として残ります。`
3. **新**: 上の 1・2 に出ない `toAsk` セクション（`hsException` を除く）の空欄＝`optional` の項目と、`shiftConfirmOn()` でないときの `required` の項目: `まだ入力のない項目（判定は止めません）：{sectionLabel}（hasInput なら「（{label}、…）」を付ける）／…。面接で確認して入力してください。`
4. 高3例外（既存のまま）

1・2・4 のどれかがあれば `alert warn`（3 も末尾に連結）。3 だけなら `alert info`（ℹ）。**どれも無いときだけ** `alert ok`: 「面接で確認する項目はすべて確認済みです。」（高3例外だけのカード＝`data-mode="hs"` なら「例外条件はすべて入力済みです。」）。Step2「面接で確認すること」で未入力と出した項目（かけもち・卒業後の継続など）が残っている間は「すべて確認済み」にしない。

### 4-4. `#deferredItems`（未入力のまま判定する場合の留意点）

- 見出し `<h3 class="sub">未入力のまま判定する場合の留意点</h3>`、説明「面接で確認できなかった項目です。確認した上でチェックしてください（入力すると消えます）。」
- 中身: live の `R.buildHandoff(state.applicant, state.profile)` のうち `deferred || aggregate` の項目（**ただし判定前にシフト条件が必須＝`contribOn() && requireComplete !== false && computeContribution().enabled`（`validateContribution` と同じ条件）のときは `aggregate`＝`shift_unanswered` を除く**。この項目は未入力のままでは判定に進めず、チェックしても意味がないため。上部の件数と `#shiftConfirmStatus` の 1 行目で示す）を、Step2 と同じ見た目のチェックリスト（`<label class="handoff-item sev-…" data-item-id="<id>"><input type="checkbox" data-check="<id>">…`）で。0 件なら要素ごと `hidden`。
- `refreshDeferredItems()` を新設し、Step3 の data-field 変更時に `refreshUnresolvedAlert()` と一緒に呼ぶ（チェックボックスだけの容器なので innerHTML を作り直しても入力中のフォーカスを失わない）。
- `onFieldEvent` の `data-check` 分岐: 先頭で `if (state.step === 3 && state.handoffStale) rebuildHandoff();`（Step3 で入力した直後のチェックが古い文言に付き、判定時の `rebuildHandoff` で外れるのを防ぐ）。末尾で `if (state.step === 3) refreshUnresolvedAlert();`。

### 4-4b. `#interviewNewItems`「面接で入力した内容から出た留意点」（最終修正で追加）

- 背景: 既定では繁忙期・深夜帯・オールナイト・かけもち・外国籍の詳細を Step3 で入力するため、その回答から出る留意点（繁忙期× → `vacation_ng`〈要判断〉、オールナイト× → `allnight_ng`、22時以降× → `late_night_ng` など）は Step2 の一覧に一度も出ない。`#deferredItems` は deferred / aggregate だけなので、Step3 → Step2 に戻ってチェック → Step3 → 判定 の往復が必要になり、戻らずに判定すると要判断が `unresolved_block` で上長最終判断要に留まっていた。
- 置き場所: `#deferredItems` の直前に `<div id="interviewNewItems" class="deferred-items hidden">`（別容器。`#deferredItems` の意味「未入力のまま判定する場合」は変えない）。`refreshDeferredItems()` が両方を作り直す（初回描画・Step3 の data-field 変更時）。
- 中身 `interviewNewItems(h)`（app.js）: live の `R.buildHandoff` の項目のうち deferred / aggregate **以外**で、次のどちらか:
  1. `state.handoffBase`（Step2 までに作った留意点の `{ id: text }`。`rebuildHandoff()` が `state.step < 3` のとき、または未設定のときに取る。Step3 以降の作り直しでは更新しない。`applyRecord` は読込直後の留意点で取る。新規作成で null）に**無い**、または文言が変わった項目
  2. カテゴリが段階 interview かつ有効なセクションに属する項目（`CATEGORY_SECTION = { busy: 'busy', allNight: 'allNight', lateNight: 'lateNight', foreign: 'foreignDetail' }`。sideJob・continuation は `general` カテゴリなので 1 で拾う）
- 見出し `<h3 class="sub">面接で入力した内容から出た留意点</h3>`・説明（チェックは Step2 の一覧と共通）・`handoffItemHtml` のチェックリスト。チェック済みの表示は `#deferredItems` と同じく `state.handoff` の文言が同じときだけ。0 件なら hidden。
- チェックの処理は既存の `data-check` 分岐（Step3 で stale なら先に `rebuildHandoff()`）。法令・高校生のカテゴリでも Step3 の入力で新しく出たもの（例: 年少者の 22 時以降○）は 1 で拾う。
- Step4 の未確認一覧: 未確認にこの項目があれば「面接で確認する項目へ」ボタンを出す（「面接で確認」タグは deferred / aggregate だけ）。

### 4-5. 上部の未確認アラート（`unresolvedAlertHtml`）

- 件数 `#unresolvedCount` は従来どおり**全件**（deferred・aggregate を含む＝判定時の `judgment.unresolved.length` と一致）。
- deferred・aggregate・**`interviewNewItems`** の未確認が m 件あれば文末に「（うち m 件は下の『面接で確認する項目』で入力・確認すると解消します）」。「申し送りを確認する」ボタンは `N - m > 0` のときだけ出す。

### 4-6. 再描画・handoffStale

- Step3 の data-field 変更は従来どおり `handoffStale = true`・`invalidateJudgment()`・`applyVisibility()`・`updateContribMeters()`・`refreshUnresolvedAlert()`、追加で `refreshDeferredItems()`。全体の再描画はしない（`busy-all-ok` / `busy-clear` だけ従来どおり `renderStep()`）。
- Step3 では区分を変えられないので `continueAt` は変わらない。`goStep(4)` は従来どおり stale なら `rebuildHandoff()` → `evaluateHiring`。

---

## 5. Step2「面接者への申し送り」と未入力ルールの集約

### 5-1. 画面の並び（`handoffStepHtml`）

1. 旧形式バナー（`legacyBannerHtml`。ボタン文言を「面接で確認する項目を入力する」に）
2. 「面接者への申し送り」カード（既存）
   - **`#handoffComment`（新・card-head の直後）**: `reviewerNotes` があれば `<div class="alert info" id="handoffComment"><span class="ico">✎</span><div><b>申し送りコメント</b><div style="white-space:pre-wrap">{reviewerNotes}</div></div></div>`。空なら `<p class="muted" id="handoffComment">申し送りコメントはありません（Step1 で入力できます）。</p>`。右に `<button type="button" class="btn link" data-action="to-step" data-step="1">編集</button>`
   - 応募者表（既存の 区分・高校生・通勤・勤務期間・週勤務日数）に、`isForeign === 'yes'` なら `外国籍｜該当（詳細は面接で確認）`（foreignDetail が pre なら `describeApplicant` の外国籍の値。interview でも `sectionHasInput(a, p, 'foreignDetail')` なら値＋「（面接で再確認）」＝折りたたみで先に入れた在留資格などを出す）。希望シフト・バッジ・強み（既存）
3. **`#interviewTodo`「面接で確認すること」カード（新）** — `h.confirm`（＝`interviewConfirm`）から作る。`contribution` の ON/OFF に関係なく出す
   - 説明「面接で次の項目を確認し、Step3「面接で確認する項目」に入力してください。」
   - `<ul class="todo-list">`、`toAsk` のセクションごとに `<li data-section="<id>">`:
     - `hasInput` が false: `<b>{label}</b>　<span class="hint">{ask}</span> <span class="badge warn">未入力</span>`
     - `hasInput` が true で missing あり: `<b>{label}</b> <span class="badge warn">未入力: {missing の label を「、」で連結}</span>`
     - `hasInput` が true で missing なし: `<b>{label}</b> <span class="badge ok">入力済み（面接で再確認）</span>`
     - `blocking` なら末尾に `<span class="badge danger">判定前に入力が必要</span>`
     - `hasInput` なら 2 行目に `<div class="hint">{describeApplicant のうち section===id の行を「label：value」で「 / 」連結}</div>`（Step1 で先に入れた値の共有）
   - `toAsk` でないセクション（pre・fixed）の missing（＝required のみ）があれば `<li data-section="pre"><b>応募時に未入力</b> {label を「、」で連結} {blocking なら danger バッジ}</li>`（例「週の最大勤務日数」）
   - `contribOn()` のとき、得点率の低い項目の問いかけ（既存 `confirmList` の後半＝`CONFIRM_HINT`）を `<h3 class="sub">回答から確認したいこと</h3>` の下に。`showBeforeInterview !== false` なら「（現在 x/y点）」付き。既存 `confirmList(c, withPoints)` は `lowRatioHints(c, withPoints)`（未回答・restricted 以外で ratio < 0.5 の CONFIRM_HINT）に置き換える
   - どれも無ければ `<p class="empty">面接で確認が必要な未入力の項目はありません。</p>`
   - deferred の留意点の文言はここに出さない（セクションの「未入力: 帰宅手段」で代表させる）
4. 留意点カード: **`shownItems(h) = h.items.filter(function (i) { return !i.deferred && !i.aggregate; })`** だけを表示。見出しの件数・`renderHandoffProgress`（`#handoffProgress`）・右サマリーの「確認済み x/y」も `shownItems` で数える。非表示の件数 m > 0 なら説明文の後に `<p class="hint">面接で確認する項目の未入力に関する留意点（m 件）は「面接で確認すること」にまとめています。Step3 で入力するか、未入力のまま確認してチェックしてください。</p>`。`shownItems` が 0 件なら既存の「自動抽出された留意点はありません。」
5. 「シフト貢献度（面接前の見込み）」`#contribPreview`: `contribOn() && showBeforeInterview !== false && c.enabled` のときだけ（**`showBeforeInterview` OFF ならカードごと出さない**）。**面接時に聞くセクション（`toAsk`）に `required` の未回答が残る間は、点数・帯・内訳バーを出さず「面接後に確定」のバッジと「{セクション名}を面接で確認してから点数を出します」だけ**（D21）。点数・内訳バー・繁忙期ミニ表（`features.vacation` かつ回答済みの期間が 1 つ以上あるとき）。末尾の「面接で確認すること」は 3 に移したので削除。説明は `texts.contributionIntro`
6. 「追記（申し送りコメントの補足・任意）」`#handoffNoteCard`（既存 `data-note="handoff"`。保存データ `handoff.note` の互換のため残す）。フリーコメントは Step1 の申し送りコメントが基本なので、**空のときは閉じた折りたたみ**（`details.card.prefill`）、値があればカード。コピー文の見出しは「■追記（申し送りコメントの補足）」、レポートは `<h2>追記（申し送りコメントの補足）</h2>`
7. ボタン（既存）

### 5-2. 段階とルールの扱い（まとめ）

| ルール・印 | 段階 | Step2 一覧 | Step2「面接で確認すること」 | Step3 | 判定（evaluateHiring） |
| --- | --- | --- | --- | --- | --- |
| `legal` / `highschool` カテゴリ（`hs_exception_unmet` 等） | 関係なし | 出す | — | 上部件数 | 従来どおり |
| `shift_unanswered`（`aggregate`） | 関係なし（条件は従来どおり＝貢献度の未確認） | 出さない | セクションの「未入力」と「判定前に入力が必要」で表す | `#shiftConfirmStatus` 1 行目・`#deferredItems`・上部件数 | 従来どおり（requireComplete ON なら判定前に消える） |
| `late_night_return_unknown` / `late_night_last_train` / `late_night_taxi_unknown`（`deferred`） | lateNight=interview のとき | 出さない | 深夜帯の「未入力: 帰宅手段」等 | `#shiftConfirmStatus` 2 行目・`#deferredItems`・上部件数 | 未チェックなら未確認（要確認＝警告のみ） |
| `foreign_permit_missing` / `foreign_expiry`（値が空のときだけ `deferred`） | foreignDetail=interview のとき | 出さない | 外国籍の詳細の「未入力: 資格外活動許可…」 | 同上 | 未チェックなら未確認。`foreign_permit_missing`（要判断）は `unresolved_block` で採用推奨に留めない |
| 上記で段階が pre のとき | — | 出す（従来どおり） | — | 上部件数 | 従来どおり |
| `weekly_days_unknown`・`shift_times_missing` など Step1（固定）項目のルール | — | 出す | — | 上部件数 | 従来どおり |
| 値で発火するルール（繁忙期×、深夜帯△、資格外活動許可「不明」の `foreign_permit_missing` 等） | — | 出す（折りたたみで先に入れていれば Step2 に出る） | — | 上部件数 | 従来どおり |

- deferred の項目は、Step3 で入力すれば消える（回答すれば発火しない／値で発火すれば deferred ではなくなり通常の項目になる）。入力できなければ Step3 の `#deferredItems` でチェックできる。
- Step4「未確認の留意点」一覧（`resultStepHtml`）: `state.handoff` で同じ id が `deferred || aggregate` の項目に `<span class="tag">面接で確認</span>` を付け、1 件でもあれば「申し送りを確認する」の横に `<button type="button" class="btn sm" data-action="to-step" data-step="3">面接で確認する項目へ</button>`。

### 5-3. 申し送りコピー文（`buildHandoffText`）

```
【面接者への申し送り】TOHOシネマズ新宿
応募者：佐藤 花子 さん（大学3年生・21歳）

■申し送りコメント                          ← reviewerNotes があるとき
電話応対が丁寧。

■応募時の情報                              ← stageOf(row.section) === 'pre' の行（氏名・年齢・区分・申し送りコメントは除く）
性別：女性
卒業予定：2027-03
通勤方法：公共交通機関
…

■面接前に分かっている情報                  ← stageOf(row.section) === 'interview' かつ sectionHasInput(section) の行（無ければ見出しごと省略）
繁忙期：3連休（祝日を含む連休）:未確認　GW:○5日　…
かけもち：あり（カフェ 週1日）

■面接で確認すること                        ← 5-1 の 3 と同じ内容（無ければ見出しごと省略。見出しは既存 e2e のため変えない）
・繁忙期・土日祝：未入力（繁忙期の可否（3連休（祝日を含む連休）・夏休み期間・…）、祝日の勤務）［判定前に入力が必要］
・深夜帯（22時以降）：入力済み（面接で再確認）
・オールナイト上映：オールナイトの可否と頻度／未入力［判定前に入力が必要］
・応募時に未入力：週の最大勤務日数
・（回答から）週の勤務日数を増やせるか

■要判断（…） ☐ …                          ← shownItems だけ。[法令] [高校生] の接頭辞は従来どおり
■要確認（…） ☐ …
■共有（…）   ☐ …

■強み
・…

■シフト貢献度（面接前の見込み）65.4/100点（高・暫定）   ← 点数を出すのは 5-1 の 5 で点数を出す場合だけ（showBeforeInterview OFF・面接時の未回答があるときは省略）
繁忙期 20.9/30・土日 …

■追記（申し送りコメントの補足）            ← handoffNote があるとき
```

- 「■面接で確認すること」の 1 行の書式: `・{label}：` に続けて、`hasInput` が false なら `未入力（{ask}）`、missing ありなら `未入力（{missing の label を「、」で連結}）`、missing なしなら `入力済み（面接で再確認）`。`blocking` なら末尾に `［判定前に入力が必要］`。
- 従来末尾の「■担当者所見」は廃止（冒頭の「■申し送りコメント」に置き換え。重複させない）。
- 「■シフト貢献度（面接前の見込み）」「■面接で確認すること」の見出し文字列は変えない。

---

## 6. 保存・読込・レポート

### 6-1. `buildRecord`（追加のみ）

- `inputStages: U.deepClone(state.profile.inputStages || null)`（保存時点の段階のスナップショット。レポートの振り分け用。読込では使わない）
- `handoff.items[]` に、該当するときだけ `deferred: true, section: '<id>'`、`aggregate: true` を追加
- `applicant`（フィールド名・構造）・`schemaVersion: 2`・`kind`・埋め込み方式は変えない

### 6-2. `generateReportHTML` の並び

- 段階の参照元: `const stages = record.inputStages || profile.inputStages`、`const sp = { inputStages: stages || {} }`、行の段階は `R.stageOf(sp, row.section)`（どちらも無い旧レコード×旧 profile では全部 pre 扱い＝従来の 1 表に近い見た目）。
- 章の順:
  1. ヘッダ（既存）
  2. `<h2>応募時の情報</h2>` 表: 段階 pre の行（fixed を含む。`section === 'notes'` は除く）＋ 直後に高校生の採用方針の callout（既存 `hsHtml`）
  3. `<h2>面接者への申し送りコメント</h2><div class="note">…</div>`（reviewerNotes があるとき）
  4. `<h2>面接者への申し送り（留意点）</h2>`（既存。`deferred` / `aggregate` の項目には `<span class="tag warn">面接で確認</span>`）
  5. 強み・追記（申し送りコメントの補足）（既存 `handoff.note`）
  6. `<h2>面接で確認した情報</h2>` 表: 段階 interview の行。行が無ければ `<p class="muted">面接で確認した項目の入力はありません。</p>`。**面接前の保存（`!record.judgment && record.step < 3`）では見出しを `<h2>面接前に分かっている情報（未確認）</h2>`、空なら「面接前に分かっている項目の入力はありません（面接で確認します）。」**（コピー文の「■面接前に分かっている情報」と表記を揃える。Step4 は常に判定後なので「面接で確認した情報」のまま）。`R.interviewConfirm(record.applicant, Object.assign({}, profile, sp)).items` に `required` / `check` が残っていれば `<div class="callout">保存時点で未入力: {sectionLabel}：{label}、…／…</div>`
  7. シフト貢献度 → 面接評価 → 面接所見 → 採用可否判定（既存）
- 従来の `<h2>応募情報</h2>` は無くなる（テストで参照なし）。単体テスト #42 の繁忙期表の正規表現は影響なし。

### 6-3. 読込（`applyRecord`）

- 変更なし（`U.deepMerge(emptyApplicant(p), rec.applicant)`）。追加は `state.preFillOpen = null` のみ。段階は**現在の設定**で表示する（Step1 を開くと、面接時のセクションに値があれば `#preFill` は自動で開く）。
- 旧レコード（v1・本変更前の v2）は `inputStages` が無いだけで、そのまま読める。段階は判定に影響しないので、保存時と段階の設定が違っても再判定の結果は変わらない。

### 6-4. Step4・ヘルプ・ステップ表示

- Step4「応募情報サマリー」カード: 同じカード内で `<h3 class="sub">応募時の情報</h3>` と `<h3 class="sub">面接で確認した情報</h3>` の 2 表に分ける（`R.stageOf`。申し送りコメントは前者の末尾）。
- Step4「未確認の留意点」: 5-2 のとおり。
- `STEPS[2].hint`: 「面接者が採点・面接で確認」。
- `helpHtml()`: Step1「必須は氏名・年齢・区分・通勤・曜日・時間・勤務期間です。繁忙期・深夜帯・オールナイト・かけもちなどは面接で確認します（分かっていれば折りたたみから先に入力できます）。面接者への申し送りコメントは申し送りの冒頭に表示されます。」／Step2「申し送りコメント、面接で確認すること、留意点（要判断・要確認・共有）と強みが自動で出ます。…」／Step3「面接評価・面接で確認」「面接者が各項目を採点し、『面接で確認する項目』に面接で聞いた内容を入力します。判定に必要なシフト条件（*）が未確認だと判定に進めません。」。設定の説明に「面接前／面接時は設定画面で切り替えられます」を追加。

---

## 7. テスト

### 7-1. 単体 `tests/rules.test.js`（追加。既存 #01〜#42 は変更なしで緑）

| # | 内容 |
| --- | --- |
| 43 段階の既定とカタログ | `plain(P().inputStages)` が 2-1 と deepEqual。`R.INPUT_SECTIONS` の fixed でない id の集合 = `Object.keys(P().inputStages)`、fixed の id = `['basic','work','notes']`。`R.stageOf(P(),'busy')==='interview'`、`R.stageOf(P(),'work')==='pre'`、`R.stageOf({},'busy')==='pre'`（未 normalize は従来どおり）、`R.stageOf({ inputStages: { foreignFlag: 'interview', foreignDetail: 'pre' } }, 'foreignDetail')==='interview'`。`R.sectionLabel(P(),'lateNight')==='深夜帯（22時以降）'`。`plain(P().stageOptions)` が `{ requireDaysMax: false, preFillAlwaysOpen: false }` |
| 44 normalize | `S.normalizeProfile({}).inputStages` が既定と deepEqual／`{ inputStages: { busy: 'x', lateNight: 'pre', commute: null, bogus: 'pre' } }` → busy は `interview`・lateNight は `pre`・commute は `pre`・`bogus` なし／`{ foreignFlag: 'interview', foreignDetail: 'pre' }` → 両方 `interview`／`stageOptions: { requireDaysMax: 'yes' }` → `false`／冪等（normalize 2 回で deepEqual）／v1 fixtures（新宿・他劇場）に既定の段階／既定プロファイルは normalize で不変（#34 も緑） |
| 45 文言の差し替え | `shift_unanswered` の旧既定文言 → 新既定、`texts.contributionIntro` も同様／編集済み文言は維持／冪等。最終修正で `vacation_ng`（旧「面接実施の可否」→ 新「採用可否」。v1 の旧既定からも新既定へ）と `SEVERITY.block.desc` を追加 |
| 46 deferred / aggregate の印 | 大学2年・`mon 18:00–23:30`・`allAnswered` から lateNight の returnMethod を空にした応募者 → `late_night_return_unknown` が items にあり `deferred === true`・`section === 'lateNight'`。`shift_unanswered` が出る応募者では `aggregate === true`。`p.inputStages.lateNight = 'pre'` にすると `deferred` キーなし。外国籍 yes・`workPermit: ''` → `foreign_permit_missing.deferred === true`、`'unknown'` → `deferred` キーなし。`legal` / `highschool` カテゴリの item には付かない。items の id 集合・`counts` は段階を変えても同じ |
| 47 判定は段階に依存しない | 例A・例B・高2・17歳深夜について、既定 profile と `inputStages` を全部 `pre` にした profile で `evaluateHiring`（全チェック）の `result`・`mode`・`baseResult`・`contribution.total`・`adjustments` のコードが一致。`computeContribution` も一致。例A 65.4・例B 17.6（#19・#20 と同値） |
| 48 deferred の未確認は判定に出る | 例A の外国籍を `workPermit: ''` にし、`foreign_permit_missing` だけ未チェック → `unresolved` に含まれ `adjustments` に `unresolved_block`（上長最終判断要）。`workPermit: 'yes'` にすると items から消え採用推奨 |
| 49 interviewConfirm | 大学3年・Step1 の項目だけ（例A の基本・勤務条件、daysMax 空）→ `toAsk` のセクション id が `['continuation','sideJob','busy','lateNight','allNight']`、`work` の missing が `[{ key: 'daysMax', level: 'required' }]` で `blocking === true`、`sideJob` の missing は `optional` のみ・`blocking === false`。`summary` が `勤務条件：` で始まり `／繁忙期・土日祝：` を含む。外国籍 yes で `foreignDetail` が toAsk・missing 4 件（check 2・optional 2）。17歳では lateNight・allNight の `toAsk === false`。全部入力すると `items` が空・`summary === ''`。`inputStages.busy = 'pre'` で busy の `stage === 'pre'`・missing は required のみ。`sectionHasInput`（`vacation.*` のどれか・`continueAfterGraduation` は `continueSection` 一致時だけ） |
| 50 shift_unanswered の文言 | 既定 profile で繁忙期 1 期間だけ未回答 → 文言に「繁忙期・土日祝：繁忙期の可否（春休み期間）」。追加期間名を含む（E8 と同じ性質）。`{missingLabels}` を使う編集済み文言でも従来どおり置換される |
| 51 describeApplicant の section | 例A で 繁忙期→`busy`、深夜帯（22時以降）→`lateNight`、勤務期間→`work`、高校生の例外→`basic`、`申し送りコメント`（旧「担当者所見」）→`notes`、高3 の「卒業後の継続」→`hsException`、大学3年→`continuation`、外国籍「該当」→`foreignFlag`・詳細あり→`foreignDetail`。#39 の値は変わらない |
| 52 保存レポート | 例A＋reviewerNotes で `generateReportHTML(buildRecord(state), p)` に `<h2>応募時の情報</h2>`・`<h2>面接者への申し送りコメント</h2>`・`<h2>面接で確認した情報</h2>`。「繁忙期」行は面接で確認した情報の表、「勤務期間」行は応募時の情報の表。`buildRecord` に `inputStages`。`record.inputStages` を全部 `pre` にすると「繁忙期」行が応募時の情報に入る（スナップショット優先）。未入力が残る応募者で「保存時点で未入力」。`inputStages` の無い旧レコードでも例外を出さない。最終修正: 面接前（step 2・判定なし）の保存では見出しが `<h2>面接前に分かっている情報（未確認）</h2>`、step 3 以降または判定ありでは `<h2>面接で確認した情報</h2>`。#43・#44 の `stageOptions` の既定は `requireDaysMax: true` |

### 7-2. e2e `tests/e2e.js`

**ヘルパーの追加・変更**
- `openPreFill = async () => { const d = await page.$('#preFill'); if (d && !(await d.evaluate(el => el.open))) { await page.click('#preFill > summary'); await wait(150); } }`
- `fillBasic(o)`: 最後に `if (o.preFill !== false) await openPreFill();`（既存 E2〜E14 の Step1 での繁忙期・深夜帯・オールナイト入力がそのまま動く）
- `checkAll`: 最後の検証を `state.handoff.items.filter(i => !i.deferred && !i.aggregate).every(i => checks[i.id])` に（Step2 に出ない項目は対象外）
- `checkDeferred = async () => { for (const cb of await page.$$('#deferredItems input[data-check]')) if (!(await cb.isChecked())) await cb.check({ force: true }); await wait(100); }`
- `setStage = async (id, stage) => { await toView('settings'); await page.selectOption('[data-bind="inputStages.' + id + '"]', stage); await wait(150); await saveSettings(); await toView('judge'); }`

**既存シナリオの修正（期待値の数値は変えない）**
- E1: Step1 で `!(await visible('#busyCard'))`・`#preFill` が閉じている・`#busyCard` が `#preFill` の子孫であることを確認 → `openPreFill()` してから `sideJob`・繁忙期（GW・年末年始）・深夜帯・タクシーを入力（外国籍「該当する」は基本情報カード、詳細は折りたたみ）。`reviewerNotes` は `#notesCard`。「繁忙期カードのライブ表示」の確認は E17 へ移す。Step2: `#handoffComment` に「電話応対が丁寧。」、`#interviewTodo` に「繁忙期・土日祝」「オールナイト上映」、`state.handoff` に `warn:shift_unanswered`（既存）かつ DOM に `.handoff-item[data-item-id="shift_unanswered"]` が無い、`#contribPreview` は「面接後に確定」で点数・帯を出さない、右サマリーは「面接後に確定」「面接で確認」（D21）。コピー文: `■申し送りコメント` が `■面接で確認すること` より前、`■面接で確認すること` が `■要判断` より前、`■担当者所見` を含まない、`■シフト貢献度` を含まない（面接時の未回答があるため。D21）。Step3: `#shiftConfirm h2` が「面接で確認する項目」、`#shiftConfirm [data-field="vacationDays.gw"]` の値が `5`。以降（65.4・high_high・`unresolved_block` → 全チェックで採用推奨・件数一致）は現行の期待値のまま。`#shiftConfirmStatus` は卒業後の継続が空なら「まだ入力のない項目」、入れた後も外国籍・かけもちありで「かけもち先の週あたり時間」が空なので「すべて確認済み」にはならない（「すべて確認済み」は E15 で確認）
- E10・E13・E3・E4・E5・E6 など Step1 で繁忙期・深夜帯・オールナイトに入力する箇所: `fillBasic` で開くので原則変更なし。`fillBasic` を使わない箇所は入力前に `openPreFill()`
- E8: `#busyCard .busy-row` は折りたたみ内でも DOM にあるので変更なし
- E12: 保存 HTML に `<h2>応募時の情報</h2>` と `<h2>面接で確認した情報</h2>`、`rec.inputStages.busy === 'interview'`、`rec.applicant.reviewerNotes` が復元
- E14: `#contribPreview` が**無い**こと、`#interviewTodo` に確認事項（「繁忙期・土日祝」）があること、コピー文に `■シフト貢献度` が無く `■面接で確認すること` があること（既存の後半は同じ）
- E9: 他劇場の旧プロファイル読込後、`state.profile.inputStages` が既定と一致し、Step1 に `#preFill` がある

**追加シナリオ**

| # | 手順と確認 |
| --- | --- |
| E15 Step1 の絞り込み → Step3 で入力して判定 | `fresh()` → `fillBasic({ …大学2年, shifts: sat/sun 10:00–18:00, daysMin 2, daysMax 3, workPeriod long, preFill: false })`。可視: `name`・`age`・`category`・`commuteMethod`・`daysMax`・`workPeriod`・`[data-field="foreign.isForeign"]`・`#notesCard textarea[data-field="reviewerNotes"]`。不可視: `[data-field="weekendFreq"]`・`[data-field="allNight.availability"]`・`[data-field="sideJob"]`・`[data-field="lateNight.returnMethod"]`。`#preFill` は `open === false`、summary に「繁忙期・土日祝」。`#stepContent [data-required]`・`[data-required-seg]` に繁忙期・深夜帯の欄が無い。氏名を空にすると Step1 に留まる → 入れ直すと繁忙期が空でも Step2 へ → Step2: `#interviewTodo` に「繁忙期・土日祝」「深夜帯（22時以降）」「オールナイト上映」「かけもち」「判定前に入力が必要」、DOM に `[data-item-id="shift_unanswered"]` が無い（state には有る）→ Step3: `#shiftConfirm` に `[data-field="sideJob"]`・`[data-field="lateNight.returnMethod"]`・`[data-field="weekendFreq"]` → 採点 5 → 未入力で判定すると止まる（toast「シフト条件を確定」）→ Step3 で `busyAllFull()`・土日頻度 `every_both`・祝日○・オールナイト×・22時以降×・かけもち「なし」を入力 → `#shiftConfirmStatus` は「卒業後の継続」が残る（「すべて確認済み」ではない）→ 卒業後の継続「未定」→「すべて確認済み」→ `navStep(2)`・`checkAll()`・Step3 → 判定 → `mode === 'matrix'`・`adjustments` が空 |
| E16 折りたたみで先行入力・区分の変更 | `fresh()` → `fillBasic({ …大学2年, shifts: fri 18:00–23:30・sat 10:00–18:00, preFill: false })`・`reviewerNotes` に「土曜は月2回なら可」→ `openPreFill()` → GW ○ 5 日・深夜帯 ○（帰宅手段は空）→ `#preFillCount` に「入力あり」「繁忙期・土日祝」→ Step2: `#handoffComment` に申し送り、`#interviewTodo` の深夜帯の行に「帰宅手段」、繁忙期の行の 2 行目に「GW:○5日」。`state.handoff` に `late_night_return_unknown`（`deferred`）があり DOM の一覧には無い。コピー文に「■面接前に分かっている情報」と「GW:○5日」→ Step1 に戻ると `#preFill` は開いたまま → 区分を「高校3年生」に変えると Step1 が描き直され、`[data-field="continueAfterGraduation"]` の radio が 3 個（1 組）で `#preFill` の外（基本情報カード）にある → 「大学2年生」に戻すと再び `#preFill` 内 |
| E17 設定で段階を切り替える | `fresh()` → 設定 `#s-stages` が表示される → `setStage('busy','pre')`・`setStage('lateNight','pre')` → `storedProfile().inputStages.busy === 'pre'` → Step1 で `#busyCard` が `#preFill` の外にあり開かずに可視、見出しのメーターが `/繁忙期 [\d.]+\/30/`（E1 から移した確認）→ 深夜帯 ○・帰宅手段空で Step2 → `.handoff-item[data-item-id="late_night_return_unknown"]` が一覧に表示（`deferred` なし）→ 設定で `foreignFlag` を `interview` にすると `[data-bind="inputStages.foreignDetail"]` が disabled、保存後 `storedProfile().inputStages.foreignDetail === 'interview'` → `stages-all-pre` → 保存 → Step1 に `#preFill` が無く `sideJob`・`foreign.isForeign` が可視 → `stages-default` → 保存で既定に戻る → localStorage に `inputStages: { busy: 'foo' }` を入れた profile を置いて reload → `state.profile.inputStages.busy === 'interview'` |
| E18 外国籍は該当だけ面接前 | `fresh()` → 必須＋外国籍「該当する」だけ → Step1 に `#foreignStageHint` が可視 → Step2: `#interviewTodo` に「外国籍の詳細」「資格外活動許可」、`foreign_permit_missing` は一覧に無い（state では `deferred`）、`foreign_hour_cap`（要確認）は一覧にある → `checkAll()` → Step3: `#deferredItems [data-check="foreign_permit_missing"]` がある → 繁忙期等を入力・採点 5 → 何もチェックせず判定 → `unresolved_block` で上長最終判断要、Step4 の未確認一覧に「面接で確認」タグと「面接で確認する項目へ」ボタン → Step3 で資格外活動許可「あり」・在留期限 `2028-03` を入力 → `#deferredItems` が空（hidden）→ 判定 → `foreign_permit_missing` が items から消え、`adjustments` に `unresolved_block` が無い |
| E20 面接で確認する項目の表示（指摘の修正） | `fresh()` → フリーター・外国籍「該当しない」→ `#preFill .prefill-list` に「外国籍の詳細」「卒業後の継続」が無く「かけもち」はある → 「該当する」にすると「外国籍の詳細」が出る → そのまま Step2：右サマリーの要判断 0・`#sumLater` に「要判断 1 件」、`#interviewTodo` の外国籍の詳細に「要判断」、コピー文に「［要判断］」→ Step1 で「該当しない」に戻して Step3：`#cf-foreign` が無い、`#deferredItems` に `shift_unanswered` が無い、`#shiftConfirmStatus` に「かけもち」（「すべて確認済み」ではない）→ 外国籍が空のまま Step3 で「該当しない」を選び「すべて ○」で再描画しても該当の欄が残る → 他劇場の旧プロファイル・`daysMax` 空で Step3：「まだ入力のない項目」に繁忙期、`#shiftConfirm [data-field="daysMax"]` がある |
| E19 保存 → 読込 | E16 の状態（Step2）で保存 → 埋め込み JSON: `applicant.vacationDays.gw === '5'`・`applicant.reviewerNotes` あり・`inputStages.busy === 'interview'`・`handoff.items` の `late_night_return_unknown` に `deferred: true`。HTML に `<h2>応募時の情報</h2>`・`<h2>面接者への申し送りコメント</h2>`・`<h2>面接前に分かっている情報（未確認）</h2>`（面接前の保存なので。繁忙期の行はこの下）・「保存時点で未入力」。新規 → 読込 → 値が復元・Step2 から再開 → `navStep(1)` で `#preFill` が自動で開いている。E15 の判定後に保存したファイルを読み込むと再判定が保存時と一致 |

| E21 Step3 の入力から出た留意点（最終修正で追加） | フリーター・週2日・外国籍「該当しない」→ Step2 で `checkAll()` → Step3 で `busyAllFull()` 後に GW×・土日頻度・祝日○・オールナイト×・22時以降×・かけもちなし → `#interviewNewItems` に `vacation_ng`・`allnight_ng`・`late_night_ng`、上部アラートは「うち 3 件は下の…」で「申し送りを確認する」ボタンなし → 採点 5・未チェックで判定すると `unresolved_block`、Step4 に「面接で確認する項目へ」→ Step3 で `#interviewNewItems` をチェック → 上部アラートが消える → 判定で `mode === 'matrix'`・`unresolved` 0。続けて、折りたたみで在留資格「永住者」を入れた外国籍の応募者は Step2 の応募者表に「在留資格: 永住者（面接で再確認）」 |

E17 は `requireDaysMax` が既定 ON（空欄なら Step1 に留まる）→ 設定で OFF にすると空欄でも Step2、E20 の他劇場シナリオは OFF にしてから Step3 の欄を確かめる。E1 は追記が空のとき閉じた折りたたみであることを確認してから開いて記入する。

完了条件: `cd recruit-system && node build.js && node tests/rules.test.js && node tests/e2e.js` がすべて緑（FAIL 0・ページエラー 0）。

---

## 8. 決定事項と理由・リスク

### 8-1. 決定事項（未決だったものは既定値を決め、設定で変更可能にした）

| # | 決定 | 理由 |
| --- | --- | --- |
| D1 | 段階は**セクション単位**（`profile.inputStages`、`pre`/`interview` の 2 値・10 セクション）。基本情報・勤務条件・申し送りコメントは固定で面接前 | 設定が 10 行で済み、画面の塊が崩れない。固定の 3 つは副支配人の言う「面接に進めるかの判断材料（週日数・時間帯・期間）」と引き継ぎ用のコメントそのもの。項目単位の設定は同じ欄が 2 か所に出る不整合を招く |
| D2 | 既定は要望どおり（繁忙期・深夜帯・オールナイト・かけもち・外国籍の詳細・学生の卒業後の継続・部署/経路は面接時。通勤・高3例外・外国籍の該当は面接前） | Step1 を 2〜3 分で終えられる量にする。ユーザー確認済みの残す項目リストと一致 |
| D3 | セクションの構造は rules.js（`INPUT_SECTIONS`）、既定の段階は config。`stageOf` は `inputStages` が無い・不正なら `'pre'`（案 0 のカタログ既定値方式は採らない） | 劇場固有値を rules.js に持たない方針。未 normalize の profile を直接渡しても従来どおり（deferred なし）に動き、既存テストの前提を崩さない。アプリ内の profile は必ず normalize されるので画面上は既定の段階になる |
| D4 | 面接時の項目は Step1 では**閉じた折りたたみ**（`#preFill`）に同じ部品で置く。値が入っていれば自動で開く。常に開く設定 `stageOptions.preFillAlwaysOpen`（既定 false） | 応募フォーム等で分かっている情報を捨てずに済み、普段は画面を占めない。開閉の好みは試行後に設定で変えられる |
| D5 | 折りたたみ内には貢献度メーターを出さない。busy/lateNight/allNight のブロックは従来のカード id を引き継ぐ | 未入力が多い段階の点数は低く見えて誤解を招く（合計は右サマリーにある）。id の継承で CSS・既存 e2e の selector を変えずに済む |
| D6 | Step3 は面接時の項目を**全項目**表示（未入力だけにしない）。どのブロックを描くかは描画時に決める。段階 pre の繁忙期・オールナイト・22時以降の可否は従来どおり「最終確認」として出す | 面接者が先に入った値を確認・訂正できる。入力中にブロックが消えると迷う。pre に切り替えた劇場でも判定前の確定の場所が従来どおり残る |
| D7 | 判定ロジックは変えない。`shift_unanswered` の**条件も変えない**（案 1 の「面接時セクションの未入力まで広げる」は採らない）。文言だけ `{confirmSummary}`（セクションごとの未確認）に変える | 条件を広げると、帰宅手段が空のとき `shift_unanswered` と `late_night_return_unknown` が二重に未確認として数えられ、判定時の件数が膨らむ。セクション名の列挙は文言と「面接で確認すること」カードで満たせる |
| D8 | 未入力が原因の留意点は削除せず、`deferred`（5 ルール・空欄のときだけ）・`aggregate`（`shift_unanswered`）の印で Step2 の一覧から外す。判定時は従来どおり未確認として数える。`legal`・`highschool` は対象外 | Step2 を短くしつつ、「面接で聞き漏らした」ときに採用推奨へ進まない安全側を保つ。高校生の方針・法令は必ず面接前に届く。既存テスト（#18c・#37・#38）と保存データの互換を保つ最小の変更 |
| D9（改訂） | 週の最大勤務日数は Step1 で**必須（既定）**。`stageOptions.requireDaysMax` を OFF にすると任意になり、未入力なら「面接で確認すること」の「応募時に未入力」に出て、判定前に Step3 で必須 | 当初は「必須は現状維持」で任意にしていたが、副支配人の要望は「面接に進めるかは週何日・入れる時間帯・勤務期間で判断」で、時間帯・勤務期間が必須なのに週何日だけ空欄で進めるのは要望と食い違うため既定を ON にした。運用で不要なら設定で 1 クリックで外せる |
| D10 | deferred / aggregate の項目は Step3 の `#deferredItems` でチェックできる（案 1）。Step2 ではチェックしない | 面接で確認できなかったが内容は把握している場合に、入力せずに確認済みにできる。Step2 から外した項目を確認する場所が無いと、要判断が必ず上長判断に落ちてしまう |
| D11 | 外国籍は「該当する／しない」だけ面接前。資格外活動許可「不明」「なし」は回答なので従来どおり Step2 の要判断。`foreign_hour_cap`（要確認）も Step2 に残す | 空欄（未確認）と「許可がない／不明」は意味が違う。後者は面接実施の判断に必要。週28時間の説明は面接前の心づもりとして有用 |
| D12 | 卒業後の継続は、高3（例外対象区分）では例外条件（既定 pre）、それ以外の学生は `continuation`（既定 interview）。1 画面に 1 か所だけ描き、置き場所が変わる区分の変更時だけ Step1 を描き直す | 高3では例外判定の条件そのもの。大学生などは `graduation_midterm` が面接での確認を促す。同じ name の radio が 2 組あると値が壊れる |
| D13 | `describeApplicant` の「高校生の例外」行は `basic`（常に面接前）に置く | 「原則対象外」などの方針の表示は、例外条件の段階を面接時にしても面接前に伝える必要がある |
| D14 | `reviewerNotes` を「面接者への申し送りコメント」として Step1 の最後・Step2 の先頭・コピー文の先頭・レポートの独立した章に置く。Step2 の追記は「追記（申し送りコメントの補足・任意）」に改名し、空なら閉じた折りたたみ | 要望の「留意点を引き継げるフリーコメント（1 つで十分）」。追記は保存形式（`handoff.note`）の互換のため残すが、書き分けに迷わないよう目立たせない |
| D15 | Step2 の並びは 申し送りカード → 面接で確認すること → 留意点 → 貢献度の見込み → 追記。貢献度カードは `showBeforeInterview` OFF ならカードごと出さない | 面接前は大半が未確認で、点数より「何を聞くか」が先 |
| D16 | Step3 上部の未確認件数は判定時と同じ全件（deferred・aggregate を含む）。Step2 の進捗・右サマリーの「確認済み x/y」は Step2 に出る項目（`shownItems`）で数える | Step3 の件数＝判定時の件数（E1 の検証）を保つ。Step2 ではチェックできる項目だけを分母にしないと 100% にならない |
| D17 | `schemaVersion` は 2 のまま。`inputStages` / `stageOptions` は normalize で補い、既定文言（「シフト条件の最終確認」）は旧既定と完全一致のときだけ新しい名前に置き換える | 保存形式は変わらない。編集済みの文言は尊重する（v1 移行と同じ考え方） |
| D18 | 他劇場の旧プロファイル（`inputStages` なし）も既定の段階。設定画面に「すべて面接前に入力（従来の並び）」「既定に戻す」 | 要件どおり。他劇場は 2軸 OFF・`shift_unanswered` OFF なので判定・留意点はほぼ変わらず、画面の並びだけが変わる。1 クリックで従来に戻せる |
| D19 | 保存レコードに `inputStages` のスナップショットを入れ、レポートの「応募時の情報／面接で確認した情報」の振り分けに使う。読込（再開）の画面は現在の設定で表示 | 後で段階の設定を変えても、保存時点の並びで読める。再開時は今の運用の画面で作業できる |
| D20 | Step3 のカード id（`#shiftConfirm` 等）は維持し、見出しだけ「面接で確認する項目」に統一 | 既存 e2e・CSS の互換。高3例外だけの劇場でも同じ名前で迷わない |
| D21 | 面接時に聞くセクションに貢献度の未回答（`required`）が残る間は、面接前（Step1・2）の点数・帯を出さない（`#contribPreview`・コピー文・右サマリー）。右サマリーは「面接後に確定」とし、未回答は「面接で確認 n」と分けて出す（Step1・2 のうち面接前のセクションの未回答だけ「未確認」） | 未回答は 0 点で数えるため、既定の段階では面接前の見込みが最大でも約 35/100 になり、ほぼ全員「低」に偏る（D5 と同じ理由）。面接に進めるかは週日数・時間帯・勤務期間で判断する（ユーザー要望） |
| D23 | Step3 の入力から出た留意点は Step3 の `#interviewNewItems` でチェックできる（4-4b）。`vacation_ng` の既定文言は「面接実施の可否」→「採用可否」（`V2_TEXT_UPGRADES.rules` で旧既定と完全一致のときだけ差し替え）、`SEVERITY.block.desc` は「採用担当が面接実施・採用の可否を判断する項目」 | 既定では繁忙期などが面接後に入力されるため、Step2 に戻る往復をなくし、面接後に出ても意味が通る文言にする |
| D22 | 右サマリーの要判断／要確認／共有の件数は、Step1・2 では Step2 の一覧と同じ `shownItems` で数え、面接で確認する項目の未入力による留意点（deferred・aggregate）は「ほかに … n 件（うち要判断 k 件）」と内訳で出す。Step3 以降は判定時と同じ全件。Step2「面接で確認すること」のセクションに、そのセクションが原因の deferred の要判断があれば「要判断」バッジ（コピー文は「［要判断］」） | 同じ画面で件数が食い違わないように。単純に数え直すだけだと要判断の存在が隠れる（R4）ため、内訳とセクションの印で示す |

### 8-2. リスクと対策

| # | リスク | 対策 |
| --- | --- | --- |
| R1 | 既存 e2e の大幅な修正（Step1 で面接時の項目に入力しているシナリオ） | 部品・`data-field`・カード id を変えず、`fillBasic` が折りたたみを開くので、多くは無修正で通る |
| R2 | 閉じた `<details>` 内の欄は Playwright の `fill` / `click` が失敗する。`toggle` はバブリングしない | e2e は `openPreFill()`。アプリは開閉を `state.preFillOpen` に持ち、描画後に `#preFill` へ直接リスナーを付ける |
| R3 | 同じ `data-field` を 1 画面に 2 回描くと radio の name 重複で選択が壊れる | 描画場所を 3-1・3-3・4-1 の規則で一意に決める。`continueAfterGraduation` は `continueAt` で管理（3-4） |
| R4 | deferred の要判断（資格外活動許可の空欄）が Step2 に出ず、面接で見落とすと上長最終判断要になる | Step2「面接で確認すること」に「外国籍の詳細　未入力: 資格外活動許可…」、Step1 に `#foreignStageHint`（在留カードの持参依頼）、Step3 の `#shiftConfirmStatus`・`#deferredItems`・上部件数、Step4 の「面接で確認」タグで示す。分からなければ「不明」を選ぶと通常の要判断として Step2 でチェックできる |
| R5 | Step2 の「確認済み x/y」と判定時の未確認件数が一致しない（D16） | Step3 上部で「うち m 件は下の『面接で確認する項目』で入力・確認すると解消」と書く |
| R6 | Step3 で入力した直後に deferred をチェックすると、古い文言へのチェックになり判定時に外れる | `data-check` の処理前に Step3 では stale なら `rebuildHandoff()`（4-4） |
| R7 | 区分の変更で Step1 が描き直され、フォーカスが区分に戻る | 置き場所が変わるときだけ（select の change 時）。スクロール位置を保つ |
| R8 | 他劇場で Step3 に「面接で確認する項目」カードが新たに出る（かけもちが既定で面接時のため） | 2軸 OFF なら * を出さず判定も止めない。「すべて面接前に入力」で従来に戻せる |
| R9 | `shift_unanswered` の文言を編集済みの劇場は「シフト条件の最終確認」の表記が残る | 設定画面で直せる。HANDOFF に記載 |
| R10 | 「応募情報」の見出し（保存レポート）を参照する外部の運用（印刷の手順書など） | README・HANDOFF に変更点を書く |

### 8-3. 副支配人に確認したいこと（実装は既定値で進め、試行後に設定で調整）

- 週の最大勤務日数を Step1 の必須にしたこと（`stageOptions.requireDaysMax`。D9 改訂で既定 ON）でよいか
- 「面接前に分かっている項目」を常に開いて表示するか（`stageOptions.preFillAlwaysOpen`）
- 通勤・高3の例外条件・外国籍の該当を面接前のままでよいか、かけもち・外国籍の詳細を面接時でよいか（`inputStages`）
- 学生の「卒業後の継続」を面接時でよいか（`inputStages.continuation`）
- 面接前（Step2）に貢献度の見込みカードを出すか（既存 `contribution.showBeforeInterview`）

### 8-4. 実装の順番（推奨）

1. rules.js（`INPUT_SECTIONS` ほか定数・`stageOf` ほか関数・`interviewConfirm`・`buildContext` の `c.confirm`・`buildHandoff` の印と `confirm`・`templateVars`・`describeApplicant` の section とラベル）→ config.default.js（`inputStages`・`stageOptions`・texts・既定文言）→ storage.js（`fillStages`・`upgradeTexts`・`buildRecord`・`generateReportHTML`）→ `node tests/rules.test.js`（#43〜#52 を追加し全部緑）
2. app.js: 部品の切り出し（3-2）→ Step1（本体・`#preFill`・`#notesCard`・`continueAt`）→ Step3（`interviewConfirmHtml`・`#shiftConfirmStatus`・`#deferredItems`・上部件数）→ Step2（`#handoffComment`・`#interviewTodo`・`shownItems`・`#contribPreview` の条件・コピー文）→ Step4・ヘルプ・`STEPS`
3. settings.js（`#s-stages`・`selectTag` の disabled・`textsHtml`・`VARS_HINT`）→ styles.css（`.prefill` の summary・`.prefill-sec`・`.confirm-sec`・`.todo-list`・`#handoffComment`・`.s-stage-row`）
4. `node build.js && node tests/e2e.js`（既存の修正 → E15〜E19）
5. README・HANDOFF・`helpHtml()` を更新し、`node build.js` で `dist/` を再生成
