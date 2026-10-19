# 詳細仕様書（確定版）: 面接チェックリスト（面接台本 2026-10-08 版）への置き換えと A4 報告

> 2026-10-14 の面接特化（docs/SPEC-slim.md）で、詳細モード・初期対応者・旧 10 項目評価・レポート全体印刷に関する記述は無効。
> 2026-10-14 に保存 HTML を A4 縦 1 枚へ変更（docs/SPEC-a4.md）。報告書表示／詳細表示の切替・`#clPaper`／`#clSheet`（保存 HTML）・`#mgmt`／`#decision`・「A4 で印刷（1 ページ）」・'section' モード・押印欄の件数による上限（`checklistSheetLimit`）の記述は無効。保存 HTML は用紙 `main.a4#a4` 1 枚で、押印・最終合否は用紙の欄を直接クリックして押す。

- 対象: `recruit-system/`（ブランチ `claude/toho-shinjuku-hiring-app-quhjtc`。**commit / push はしない**）
- **2026-10-13 追記: 消極属性は削除した**（副支配人「消極属性って意味がわからないから削除でいいかも」）。本書の `CHECKLIST_AUTO.negatives`（shortTerm・morningOnly）、`checklist.header.negatives`・`morningOnlyEnd`、`record.checklist.header.negatives`、`checklistAuto` / `checklistSummary` の `negatives`、Step3 ヘッダーの 3 択 seg・`#clNeg-*`、A4 報告・レポートの消極属性のチップ、設定の消極属性の行・`cl-neg-add` / `cl-neg-del`、validate の終了時刻の記述は当時のもの。現行の扱い（旧データは読み飛ばす・台本の正規化で外す）は `docs/SPEC-script-mode.md` 12 章
- **2026-10-14 改訂: A4「面接チェックリスト報告」は 1 ページの要約にした**（副支配人「出力される報告書が煩雑すぎて頭に入ってこない。わかりやすく、かつ1ページで」）。台本の説明文・質問文・空の記入欄は載せず、結果 → 必須条件 → 確認点 → 面接メモの順に 10 秒で読める 1 枚にする。台本の全文は保存 HTML「詳細」の「面接チェックリスト」節（`mode: 'section'`）に残す。現仕様は 4 章（4-2・4-4・4-5）、旧仕様（台本の 2 枚＝2 ページ）は 4-6 に短く残した。本書のほかの箇所の「A4 1〜2 枚」「.cl-page」「.cl-fit」は旧版の記述
- 根拠: 副支配人の要望「印鑑部分以外なんか微妙。添付の面接台本のチェックリスト（採点リスト）を入力して出力・報告できるようにしたほうがいい」と決定 1〜3（下記）。既存決定（単一 HTML 配布・設定画面＋JSON・HTML ファイル保存・PC 利用・面接前は Step1 最小入力＋Step2 申し送り・Step3 で面接時項目・2 軸マトリクス・押印・A4 申し送りシート）は維持する
  - 決定 1: Step3 の面接評価を台本のチェックリストに**置き換える**（10 項目×5 点は廃止）。面接評価の点数は確認事項／確認点の ○△× と面接者の総合判断から算出し、2 軸判定（面接評価 × シフト貢献度）は維持
  - 決定 2: 必須条件が 1 つでも「不一致」なら不採用推奨に固定（設定で「上長最終判断要」に変更可）
  - 決定 3: 「面接チェックリスト報告」を A4 1〜2 枚で印刷できる。保存レポートにも同じ節を入れる（**2026-10-14 に A4 1 枚の要約へ変更＝4 章**）
- 前提資料: `docs/archive/SPEC.md`（4・5 章: 貢献度・2 軸判定）、`docs/archive/SPEC-stages.md`（入力の段階）、`docs/HANDOFF.md`（7〜9 章: 押印・申し送りシート・全体印刷）、`docs/reference/interview-script-1008.md`（台本の抽出テキスト）
- 本書は 2 つの設計案（台本への忠実さ／判定ロジックの整合）を統合した確定版。フィールド名・profile キー・data-bind パス・既定値・文言は本書の値で実装する。統合時に決めた点は 8 章

## 0. 方針

### 0-1. 設計の優先順位
1. 台本への忠実さ（文言・順序・所要時間が画面と報告書にそのまま出る）
2. 判定ロジックの整合（2 軸判定・調整は下げる方向のみ・旧データの再判定結果を変えない）
3. 面接中の入力の速さ（上から順にクリックしていけば終わる。入力で再描画しない）
4. 他劇場が設定で台本を差し替えられる汎用性（台本はデータ）
5. 既存テストへの影響を最小に

### 0-2. 変えないもの
`rules.js` は DOM 非依存・profile 駆動／IIFE・function スタイル・外部ライブラリなし／単一 HTML／`applicant` のフィールド名と意味／`schemaVersion: 2`／申し送りコピー文（`buildHandoffText`）／Step2 の構成（文言 2 か所だけ直す。2-10）／2 軸マトリクス・貢献度・押印・申し送りシート（`body.print-handoff`）の表示対象／`evaluateHiring` の引数順と `opts.checklist` が無いときの結果／旧 `evaluation.*` のキー／`judgment` の既存キー／`record.scores`・`record.interviewNotes` の意味。build.js の制約（src に「</」＋「script」の並びを書かない）。

### 0-3. 要約

| 項目 | 決定 |
| --- | --- |
| 台本の持ち方 | `profile.checklist` にデータとして持つ（ページ → セクション → ブロック → 項目）。判定に効くのは `must`（必須条件）・`rating`（確認事項／確認点）・総合判断だけ。説明・質問・記入欄・合否連絡は記録用 |
| 面接評価 | 確認点 ○△× = 2/1/0 ＋ 総合判断 採用/保留/不採用 = 2/1/0。得点率 = 合計 ÷（(確認点数 + 1) × 2）。既定は確認点 7 ＋総合 1 = **16 点満点**。帯は既存 `evaluation.thresholds`（高 ≥70%・中 ≥40%） |
| evaluateHiring | 評価項目の出どころだけ差し替える（`interviewModel`）。`opts.checklist` があり入力がある（または旧採点が無い）ときチェックリスト方式、そうでなければ旧方式（10 項目×5 点）。マトリクス・戻り値の形は共通。調整を 4 つ追加（must_conditions / must_unconfirmed / overall_hold / overall_cutoff の新形式） |
| 必須条件 | 不一致 1 つで `down(checklist.mustFailResult)`（既定 reject）。未確認は警告（止めない。`mustUnknownResult` 既定 'none'、設定で「採用推奨に留めない」） |
| 回答の保存 | `record.checklist`（項目 id をキーにしたフラットな `values` / `notes` ＋ `overall` ＋ `header`）＋ `record.checklistDef`（保存時点の台本のスナップショット） |
| 出力 | レポートに「面接チェックリスト」節（`data-sec="checklist"`）。A4「面接チェックリスト報告」は `body.print-checklist`（アプリ・レポート共通の描画関数 `storage.checklistSheetHtml`）。台本の 2 枚＝印刷 2 ページ |
| 旧データ | `evaluation.items` は削除しない（旧レコードの表示・再判定専用。設定では読み取り専用）。旧レコード（scores あり・checklist 入力なし）は旧方式で再判定し、レポートは旧形式の表 |
| テスト | 単体の既存 #01〜#53 は**変更なしで緑**（旧方式の経路が残る）。#54〜#66 を追加。e2e の `scoreAll` は `rateAll` に置き換え、E25〜E29 を追加 |

---

## 1. データモデル

### 1-1. rules.js に追加する定数（export する。設定不可）

```js
const CHECKLIST_BLOCK_TYPES = ['must', 'fields', 'explain', 'question', 'rating', 'notify', 'note'];
const CHECKLIST_FIELD_KINDS = ['text', 'date', 'month', 'choice'];
const CHECKLIST_SCALE = 2;                       // ○△× と総合判断の満点（固定）
const RATING_MARKS = {                           // 確認事項／確認点
  good: { mark: '○', label: '○ できている',   points: 2, tone: 'ok' },
  fair: { mark: '△', label: '△ やや不安',     points: 1, tone: 'warn' },
  poor: { mark: '×', label: '× できていない', points: 0, tone: 'danger' }
};
const OVERALL_POINTS = { hire: 2, hold: 1, reject: 0 };   // 総合判断（表示名は profile.checklist.overallOptions）
const OVERALL_TONE = { hire: 'ok', hold: 'warn', reject: 'danger' };
const MUST_VALUES = {                            // 必須条件（'' = 未確認）
  match:    { label: '一致',   mark: '○', tone: 'ok' },
  mismatch: { label: '不一致', mark: '×', tone: 'danger' },
  '':       { label: '未確認', mark: '－', tone: 'muted' }
};
const CHECKLIST_OVERALL_ID = '__overall';        // breakdown・scores 上の総合判断のキー（項目 id は英字始まりなので衝突しない）
const CHECKLIST_AUTO = {                         // profile の auto に書ける値（自動表示の種類）
  must: ['weeklyCondition', 'busyAll'],
  fields: ['weekend', 'busyNg', 'term', 'firstEnd', 'openLate'],
  negatives: ['shortTerm', 'morningOnly']
};
const CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
function circled(n) { return CIRCLED[n - 1] || ('(' + n + ')'); }   // export
```

セクション番号（①〜⑤）は保存しない。`sections` の並び順（1 始まり）から `circled()` で付ける。

### 1-2. `profile.checklist`（`config.default.js` に新設）の構造

```text
checklist: {
  title, version, intro,                               // 文字列
  pages: [{ no, title, lead }],                        // 台本のスライド＝印刷のページ
  mustFailResult: 'reject' | 'review',                 // 必須条件に不一致があるとき
  mustUnknownResult: 'none' | 'review',                // 必須条件に未確認が残るとき（none = 警告のみ）
  mustFailJumpTo: <sectionId> | '',                    // 不一致のとき案内するセクション（'' で案内ボタンを出さない）
  overallLabel, overallHint,
  overallOptions: { hire, hold, reject },              // 表示名（点 2/1/0 は固定）
  overallCaps: { hold: 'none'|'review'|'reject', reject: 'none'|'review'|'reject' },  // 総合判断による上限
  header: {
    posting: { label, options: [{ value: 'regular'|'short', label }] },   // 応募した求人
    negatives: [{ id, label, auto }],                  // 消極属性（auto は CHECKLIST_AUTO.negatives か ''）
    morningOnlyEnd: 'HH:MM',                           // 「朝～12時のみ」の判定の終了時刻
    interviewerField: <management.fields の id> | ''   // 担当と連動する押印欄（'' で連動しない）
  },
  print: { showQuestions: boolean },                   // A4 報告・レポートに質問文を載せるか
  sections: [{
    id, title, minutes: 0〜60 の整数, minutesMax: boolean, page: 1 以上の整数, lead,
    blocks: [{
      id, type: CHECKLIST_BLOCK_TYPES, title, note,    // title は【】を付けずに書く（描画で付ける）。type='note' は note が本文
      memo: boolean, memoLabel,                        // ブロックのメモ欄（question は既定 true）
      items: [{
        id, label,
        hint?,                                         // rating のみ: 補足
        shortOnly?: boolean,                           // explain のみ: ※短期求人に応募の場合のみ説明
        auto?, autoParams?,                            // must / fields のみ（CHECKLIST_AUTO）
        kind?, options?: [{ value, label }]            // fields のみ（kind=choice は options 2 件以上）
      }]
    }]
  }]
}
```

- セクション・ブロック・項目の id は**チェックリスト全体で一意**（DOM id・回答のキーに使う）。形式 `/^[A-Za-z][\w-]{0,40}$/`。
- 「確認点の有無」= rating ブロック／項目の追加・削除。rating が 0 件でも動く（面接評価は総合判断だけ。設定保存時に警告）。

### 1-3. 既定値（台本全文。id はテストで使う確定値。`/* 追加 */` は台本に無いが入れたもの＝8 章）

```js
checklist: {
  title: 'スタッフ面接チェックリスト',
  version: '2026-10-08',
  intro: '台本の順に確認し、その場で入力してください。必須条件が1つでも不一致なら判定は不採用推奨になります（追加質問して解消しなければ「⑤ 逆質問」へ進み、最大10分で終了してください）。',
  pages: [
    { no: 1, title: '必須条件一致・継続性', lead: '必須条件と報連相の意識・具体性を確認。最低限の話し方、敬語が可能か。必須条件が不一致なら不採用、逆質問を最大１０分で終了。' },
    { no: 2, title: '人物確認・逆質問', lead: '行動を確認。採用を検討できる人には不安解消の時間を取る。' }
  ],
  mustFailResult: 'reject',
  mustUnknownResult: 'none',
  mustFailJumpTo: 'reverse',
  overallLabel: '面接者の総合判断',
  overallHint: '①〜⑤の確認を踏まえて選んでください。',
  overallOptions: { hire: '採用', hold: '保留', reject: '不採用' },
  overallCaps: { hold: 'review', reject: 'reject' },
  header: {
    posting: { label: '応募した求人', options: [{ value: 'regular', label: '通常求人' }, { value: 'short', label: '短期求人' }] },
    negatives: [
      { id: 'short', label: '短期希望', auto: 'shortTerm' },
      { id: 'morningOnly', label: '朝～12時のみ', auto: 'morningOnly' }
    ],
    morningOnlyEnd: '12:00',
    interviewerField: 'interviewer'
  },
  print: { showQuestions: true },
  sections: [
    { id: 'conditions', title: '勤務条件', minutes: 10, minutesMax: false, page: 1, lead: '', blocks: [
      { id: 'conditions_must', type: 'must', title: '必須条件', note: '1つでも不一致なら不採用（追加質問して解消しなければ「⑤」へ）', memo: false, memoLabel: '', items: [
        { id: 'must_weekly', label: '土日を含む週3日以上、5時間以上', auto: 'weeklyCondition', autoParams: { minDays: 3, minHours: 5 } },
        // 「クリスマス」は既定の繁忙期に単独の期間が無いため、年末年始（yearend）に含めて見込みを出す
        { id: 'must_busy', label: '指定繁忙期間すべて可（クリスマス・年末年始・春休み・GW・お盆）', auto: 'busyAll', autoParams: { periods: ['yearend', 'spring', 'gw', 'obon'] } }
      ] },
      { id: 'conditions_f1', type: 'fields', title: '', note: '', memo: false, memoLabel: '', items: [
        { id: 'weekend', label: '土日勤務可否', kind: 'choice', options: [{ value: 'one', label: 'いずれか' }, { value: 'both', label: '両日' }], auto: 'weekend' },
        { id: 'busy_ng', label: '出勤不可な繁忙', kind: 'text', auto: 'busyNg' }
      ] },
      { id: 'conditions_explain', type: 'explain', title: '説明', note: '※は短期求人に応募の場合のみご説明ください', memo: false, memoLabel: '', items: [
        { id: 'ex_fare', label: '交通費（往復500円まで/日）' },
        { id: 'ex_hours', label: '営業開始・終了時間、タクシー条件の説明' },
        { id: 'ex_contract', label: '初回契約は2か月間(契約日の翌月末)。', shortOnly: true },
        { id: 'ex_switch', label: '長期への切り替えあり。本人希望と勤務状況等で判断', shortOnly: true }
      ] },
      { id: 'conditions_f2', type: 'fields', title: '質問', note: '', memo: false, memoLabel: '', items: [
        { id: 'term', label: '短期／長期の希望', kind: 'choice', options: [{ value: 'short', label: '短期希望' }, { value: 'long', label: '長期希望' }], auto: 'term' },
        { id: 'start_date', label: '契約開始日の希望', kind: 'date' },
        { id: 'first_end', label: '初回契約終了（月末締）', kind: 'month', auto: 'firstEnd', autoParams: { monthsAfter: 1 } },
        { id: 'open_late', label: 'OPEN／25時(タク〇のみ)までの可否', kind: 'text', auto: 'openLate' }
      ] },
      { id: 'conditions_q', type: 'question', title: '', note: '', memo: true, memoLabel: 'メモ', items: [
        { id: 'q_term', label: '「いまのところ、短期希望ですか？長期希望ですか？」or「採用となった場合、希望としては、いつ頃まで勤務継続希望でしょうか？」' },
        { id: 'q_two_months', label: '「最初の2か月で勤務条件が満たせない可能性は？（土日出せない、など）」' },
        { id: 'q_family', label: '「歌舞伎町ですので、ご家族の反対などあれば遠慮なく辞退お願いします。」' }
      ] },
      { id: 'conditions_rate', type: 'rating', title: '確認事項', note: '', memo: false, memoLabel: '', items: [
        { id: 'rt_concrete', label: '勤務条件の一致に「具体性」があるか', hint: '「大丈夫です」のみ連呼は特に要注意。' },
                { id: 'rt_manner', label: '最低限の話し方、敬語が可能か', hint: '面接全体を通して（台本1枚目の冒頭）' }
      ] },
      { id: 'conditions_flow', type: 'note', title: '', note: '条件一致：2へ　／　必須条件不一致：追加質問してみて、解消しなければ「５」へ', memo: false, memoLabel: '', items: [] }
    ] },
    { id: 'continuity', title: '継続性・報連相', minutes: 3, minutesMax: false, page: 1, lead: '', blocks: [
      // 台本 1 枚目の右列（② の【説明】）。① の【必須条件】は左列の 2 件だけ
      { id: 'continuity_explain', type: 'explain', title: '説明', note: '', memo: false, memoLabel: '', items: [
        { id: 'ex_submit', label: 'シフト提出は木曜23時、確定は水曜' },
        { id: 'ex_phone', label: 'シフト関連の連絡：原則電話のみ' },
        { id: 'ex_absence', label: '欠勤・遅刻は分かった時点で連絡' }
      ] },
      { id: 'continuity_q', type: 'question', title: '質問', note: '', memo: true, memoLabel: 'メモ', items: [
        { id: 'q_prev_job', label: '「前のアルバイトの期間と退職理由は？差し支えなければ退職理由は？」' },
        { id: 'q_cant_3days', label: '「週3日出せないと事前に分かったら、どうするべきだと思いますか？」' },
        { id: 'q_sudden_absence', label: '「当日、急に出勤できなくなったら、どうするべきだと思いますか？」' }
      ] },
      // 台本の「報連相できるか／離職要因はないか」を 2 行に分けて評価する
      { id: 'continuity_rate', type: 'rating', title: '確認事項', note: '', memo: false, memoLabel: '', items: [
        { id: 'rt_hourensou', label: '報連相できるか' },
        { id: 'rt_turnover', label: '離職要因はないか', hint: '○＝離職要因なし（前のアルバイトの期間・退職理由から）' }
      ] }
    ] },
    // 台本 2 枚目は 3 列（③・④・⑤）。各列の上から順に並べる
    { id: 'job', title: '仕事内容の説明', minutes: 10, minutesMax: false, page: 2, lead: '', blocks: [
      { id: 'job_explain', type: 'explain', title: '説明', note: '', memo: false, memoLabel: '', items: [
        { id: 'ex_start', label: 'コンセorフロア業務からスタート' },
        { id: 'ex_busy', label: '多忙・立ち仕事・汚物清掃の可否' },
        { id: 'ex_opinion', label: 'ときにはご意見の対応も' },
        { id: 'ex_rules', label: '細かなルールや接客指導あり' }
      ] },
      { id: 'job_q', type: 'question', title: '質問', note: '', memo: true, memoLabel: '回答', items: [
        { id: 'q_value', label: '「前職で大切にしていたことは？」' },
        { id: 'q_failure', label: '「前職での失敗談はありますか？」' },
        { id: 'q_unsure', label: '「説明した業務で自信がないことや、相談・不明点はありますか？」' }
      ] },
      { id: 'job_rate', type: 'rating', title: '確認点', note: '', memo: false, memoLabel: '', items: [
        { id: 'rt_understand', label: '業務理解と接客の実行可能性' }
      ] }
    ] },
    { id: 'teamwork', title: '集団行動特性', minutes: 8, minutesMax: false, page: 2, lead: '', blocks: [
      { id: 'teamwork_explain', type: 'explain', title: '説明', note: '', memo: false, memoLabel: '', items: [
        { id: 'ex_team', label: 'チームで分業（例：清掃、商材補充）' },
        { id: 'ex_sudden', label: '急な指示も多い（例：SH、無線呼出）' },
        { id: 'ex_radio', label: '不明点・権限外の対応は無線で確認。' }
      ] },
      { id: 'teamwork_q', type: 'question', title: '質問', note: '', memo: true, memoLabel: '回答', items: [
        { id: 'q_feedback', label: '「指摘を受けて行動を変えた経験はありますか？（仕事・部活動など）」' },
        { id: 'q_unknown', label: '「お客様に質問されて答えがわからない時、どうしますか？」' },
        { id: 'q_busy_mind', label: '「忙しいときこそ心掛けたいことは？」' }
      ] },
      { id: 'teamwork_rate', type: 'rating', title: '確認点', note: '', memo: false, memoLabel: '', items: [
        { id: 'rt_team', label: '自己判断せずチームで動けるか' }
      ] }
    ] },
    { id: 'reverse', title: '逆質問', minutes: 10, minutesMax: true, page: 2, lead: 'ミスマッチを解消するための時間', blocks: [
      { id: 'reverse_q', type: 'question', title: '', note: '※業務の大変な面も率直に伝える。', memo: true, memoLabel: '回答', items: [
        { id: 'q_concerns', label: '「条件・業務・映画館のことなど、何か気になる点はありますか？」' }
      ] },
      { id: 'reverse_notify', type: 'notify', title: '合否連絡', note: '面接の最後に伝えたらチェック', memo: false, memoLabel: '', items: [
        { id: 'nt_hire', label: '採用時：数日中に電話連絡。ご家族の反対あればご辞退ください。同時に初日出勤日時を調整、もちものなど詳細はメールで送付。' },
        { id: 'nt_reject', label: '不合格：メール連絡' }
      ] },
      { id: 'reverse_rate', type: 'rating', title: '確認点', note: '', memo: false, memoLabel: '', items: [
        { id: 'rt_mismatch', label: '採用後のミスマッチを低減', hint: '○＝不安・不明点を解消できた' }
      ] }
    ] }
  ]
}
```

- 件数: セクション 5（目安 10+3+10+8+最大10 = 41 分）／必須条件 2／記入欄 6／説明 14（① 4・② 3・③ 4・④ 3）／質問 13（① 3・② 3・③ 3・④ 3・⑤ 1）／確認点 7／合否連絡 2。満点 = (7+1)×2 = **16 点**。
- **台本 PPTX の配置どおり**（2026-10-13 修正。`docs/reference/interview-script-1008.md` は図形の順に平坦化した抽出で、列の区別が失われている）: 1 枚目は左列 ①・右列 ②、2 枚目は 3 列 ③④⑤。① の【必須条件】は「土日を含む週3日以上、5時間以上」「指定繁忙期間すべて可」の 2 件だけで、「シフト提出は木曜23時、確定は水曜」「シフト関連の連絡：原則電話のみ」「欠勤・遅刻は分かった時点で連絡」は ② 継続性・報連相の【説明】（☑ 説明済み。判定に効かない）。③ は説明 4 件（コンセorフロア…）＋【質問】3 件（前職で大切に／失敗談／自信がないこと）＋回答、④ は説明 3 件（チームで分業…）＋【質問】3 件＋回答、⑤ は質問 1 件と「※業務の大変な面も率直に伝える。」＋【合否連絡】＋回答（台本にある）。8-3 の確認事項も参照。
- 「クリスマス」は既定の繁忙期（`options.vacationItems`）に単独の期間が無いため「年末年始（yearend）」に含めて見込みを出す。
- `evaluation`（旧 10 項目・`scaleMax`・`overallItemId`・`overallWarnBelow`・`overallRejectAtOrBelow`）は**残す**。コメントを「旧形式（10項目×5点）。2026-10 以前の保存データの表示・再判定専用」に変える。`evaluation.thresholds`・`holdOnUnresolvedBlock`・`holdOnHighschoolException` は両方式で使う。

### 1-4. 回答 `record.checklist`（= `state.checklist`）

```js
{
  v: 1,
  header: {
    date: '2026-10-10',            // 面接日（YYYY-MM-DD）。Step3 を描画したとき空なら今日を入れる（dirty にしない）
    interviewer: '笹川 晴央',       // 担当（名簿の氏名 or 手入力）。空なら表示・報告では押印「面接対応者」の氏名を使う（保存はしない）
    posting: '',                   // 'regular' | 'short' | ''
    taxi: '',                      // タクシー可否・料金の上書き（'' = 自動表示）
    negatives: { short: '', morningOnly: '' }   // '' = 自動 / 'on' = 該当 / 'off' = 該当しない
  },
  values: {                        // 項目 id → 回答（型はブロック種別で決まる）
    must_weekly: 'match',          //   must: 'match' | 'mismatch' | ''
    weekend: 'both', busy_ng: '',  //   fields: 文字列（choice は option.value、date は YYYY-MM-DD、month は YYYY-MM）
    ex_fare: true,                 //   explain / notify: true（false・欠落 = 未チェック）
    rt_concrete: 'good'            //   rating: 'good' | 'fair' | 'poor' | ''
  },
  notes: {                         // メモ: ブロック id（question・memo=true のブロック）または rating の項目 id → 文字列
    conditions_q: '長期希望。土日は毎週どちらか…', rt_concrete: '曜日・時間を具体的に回答'
  },
  overall: 'hire',                 // 'hire' | 'hold' | 'reject' | ''
  updatedAt: '2026-10-10T…'
}
```

- 面接所見は既存の `record.interviewNotes`（キー・意味は不変。画面上は総合判断のカードに置く）。
- 設定で文言を変えても id は変わらないので回答は残る。設定で削除した項目の回答も**消さない**（読込 → 保存で失わない。表示・判定では無視）。
- `record.checklistDef` = 保存時点の `profile.checklist` のディープコピー（レポートの文言・並び用。読込では使わない。`inputStages` と同じ扱い）。
- 旧 `record.scores` は残す（新規は `{}`）。

### 1-5. rules.js に追加する関数（DOM 非依存・export）

| 関数 | 仕様 |
| --- | --- |
| `emptyChecklist()` | `{ v:1, header:{ date:'', interviewer:'', posting:'', taxi:'', negatives:{} }, values:{}, notes:{}, overall:'' }` |
| `checklistHasInput(cl)` | `values` に `''`・`false` 以外の値、`notes` に空白以外、`overall` が 1 つでもあれば true。**header は数えない**（面接日は自動で入るため） |
| `checklistItems(def, type)` | `[{ item, block, section, sectionIndex, no, noMark }]`（台本順。type 省略で全項目） |
| `interviewModel(profile, scores, cl)` | 面接評価の項目・点の出どころ（下記）。evaluateHiring・Step3・右サマリー・Step4・レポート・設定画面で共用 |
| `mustSummary(def, cl)` | `{ items:[{ id, label, sectionNo, value, valueLabel, mark, tone }], total, match, mismatch, unknown, mismatchLabels:[], unknownLabels:[] }` |
| `firstContractEnd(ymd, monthsAfter)` | 契約開始日から「monthsAfter か月後の月」を `'YYYY-MM'` で返す（月末締め）。`('2026-11-01',1) → '2026-12'`、`('2026-12-15',1) → '2027-01'`、`(…,0) → 同月`、空・不正 → `''` |
| `checklistAuto(applicant, cl, profile)` | 自動表示（1-6）。値は保存しない |
| `checklistSummary(applicant, cl, profile, opts)` | ビューモデル（1-7）。Step3・Step4・右サマリー・レポート・A4 報告で共用 |
| `checklistDiff(defA, defB)` | rating 項目 id の差 `{ added:[id], removed:[id] }`（読込時の toast 用） |

`interviewModel(profile, scores, cl)`:

```text
mode = (isObj(cl) && (checklistHasInput(cl) || !hasNumericScore(scores))) ? 'checklist' : 'legacy'
checklist:
  def = profile.checklist、ratings = checklistItems(def, 'rating')
  items  = ratings.map → { id, label, hint, isOverall:false, sectionId, sectionNo, sectionTitle }
           ＋ { id: CHECKLIST_OVERALL_ID, label: def.overallLabel, isOverall: true }
  scores = { <ratingId>: RATING_MARKS[v].points, __overall: OVERALL_POINTS[overall] }（未入力のキーは入れない）
  marks  = { <ratingId>: 'good'|'fair'|'poor', __overall: 'hire'|'hold'|'reject' }（未入力は入れない）
  notes  = { <ratingId>: cl.notes[ratingId] }
  scale = CHECKLIST_SCALE、overallItemId = CHECKLIST_OVERALL_ID
  counts = { good, fair, poor, blank }（rating のみ。総合判断は含めない）
legacy:
  items = profile.evaluation.items（isOverall = id === evaluation.overallItemId）、scale = evaluation.scaleMax || 5、
  scores = 引数の scores（数値化）、overallItemId = evaluation.overallItemId、marks = {}、counts = null
共通: total = Σ、max = items.length × scale、pct = round1(total/max*100)（max 0 なら 0）、
      rated / ratable（items 数）/ unrated:[id]、band = bandOf(pct, thresholds)（rated 0 なら null）
```

- `hasNumericScore(scores)`: scores の値に数値として有効なものが 1 つ以上ある。
- 判定: `opts.checklist` を渡さない呼び出し（既存の単体テスト）は常に legacy。アプリは常に `{ checklist: state.checklist }` を渡すので、新規 → checklist、旧レコードでチェックリスト未入力 → legacy、入力した時点で checklist に切り替わる。

### 1-6. 自動表示 `checklistAuto(applicant, cl, profile)`

回答を自動で埋めることはしない。空欄の記入欄・ヘッダーの既定表示、必須条件の「見込み」ヒントにだけ使う。`sh = analyzeShifts(a, profile)`。`analyzeShifts` に `minEntryMinutes`（entries の最小 minutes、無ければ null）を**追加のみ**で足す。

戻り値: `{ taxi: { text, tone }, negatives: { <id>: { autoOn, on, overridden, text } }, fields: { <id>: { value, text } }, must: { <id>: { ok, tone, text } } }`（tone は ok / warn / danger / info / muted）。

| 対象 | auto | 計算 | 表示例 |
| --- | --- | --- | --- |
| ヘッダー タクシー | 常に | `features.lateNight === false` → `—`（muted）。`lateNight.availability === 'ng'` → 「深夜帯×（タクシー対象外）」muted。`returnMethod === 'taxi'`: 料金あり ≤ `params.taxiLimitYen` → 「可・2,500円（規定3,000円以内）」ok／超過 → 「要確認・3,800円（規定3,000円超）」warn／料金空 → 「可・料金未確認」warn。その他の帰宅手段 → 「否（{returnMethods のラベル}{終電があれば ' ' + lastTrain}）」info。未入力 → 「未確認」muted | 可・2,500円（規定3,000円以内） |
| 消極属性 | `shortTerm` | `cl.values.term` があれば `=== 'short'`、無ければ `a.workPeriod === 'short'` | 短期希望（自動） |
| 消極属性 | `morningOnly` | `sh.hasAnyEntry` かつ すべての entry の `endAbs ≤ toMinutes(header.morningOnlyEnd)` | 朝～12時のみ（自動） |
| must | `weeklyCondition`（minDays, minHours） | 土日: `a.anyDay` または workDays に sat/sun。週日数: `daysMin ≥ minDays` → 満たす／`daysMax ≥ minDays > daysMin`（または daysMin 空）→ 要確認／`daysMax < minDays` → 満たさない。時間: `sh.minEntryMinutes ≥ minHours×60`。すべて満たす → ok:true・ok／どれか満たさない → ok:false・danger／未入力・要確認あり → ok:null・warn | 応募情報: 土日を含む（土・日）／週3〜4日／最短 5時間 → 満たす見込み |
| must | `busyAll`（periods） | 各期間の `a.vacation[id]`。すべて ok → ok／ng あり → danger／consult・未入力あり → warn。profile に無い期間 id は無視 | 応募情報: 年末年始○ 春休み期間△ GW○ お盆 未確認 → 要確認 |
| fields | `weekend` | weekendFreq: every_both → 'both'、every_one → 'one'。空なら workDays（anyDay 含む）: 土日両方 → 'both'、片方 → 'one'、無し → '' | 応募情報: 両日 |
| fields | `busyNg` | `a.vacation[id] === 'ng'` の期間ラベルを「・」区切り | シルバーウィーク・春休み期間 |
| fields | `term` | workPeriod: 'short' → 'short'、'long'/'mid' → 'long'、空 → '' | 応募情報: 長期（1年以上） |
| fields | `firstEnd`（monthsAfter） | `firstContractEnd(cl.values.start_date, monthsAfter)` | 2026-12（契約開始日の翌月末） |
| fields | `openLate` | OPEN: `sh.isOpen`（「OPEN 可（週{openDays}日）」/「OPEN なし」）。25時（タクシー可の人のみ）: 深夜帯 未確認 → 「25時まで 未確認」、× → 「不可」、ok/consult ＋ returnMethod='taxi' → 「可／要相談（…・タクシー帰宅）」、ok/consult ＋ 終電など → 「不可（…・終電で帰宅 23:30）」、帰宅手段 未入力 → 「未確認」 | OPEN 可（週1日）／25時まで 可（22時以降○・タクシー帰宅） |

### 1-7. `checklistSummary(applicant, cl, profile, opts)`（`opts = { scores, management }`。def は正規化済みを前提）

```js
{
  def, mode, hasInput,
  header: {
    date, posting, postingLabel,
    interviewer,             // header.interviewer || management[def.header.interviewerField].name || ''
    interviewerFromStamp,    // 押印から補ったとき true
    taxi: { text, tone, auto },                 // 上書きがあれば auto:false・text = 上書き値
    negatives: [{ id, label, on, auto, autoOn, text }]   // on = 上書き（on/off）があればそれ、無ければ autoOn
  },
  autos,                     // checklistAuto の結果
  must,                      // mustSummary ＋ 各 item に autoText / autoTone
  ratings: [{ id, label, hint, sectionId, sectionNo, value, mark, points, tone, note }],
  overall: { value, label, points, tone },
  score: { total, max, pct, band, bandLabel, rated, ratable, counts },   // interviewModel と同じ値
  sections: [{
    id, no, noMark, title, minutes, minutesMax, minutesText /* '10分' / '最大10分' / '' */, page, lead,
    mustMismatch, done,      // done = must がすべて回答済み かつ rating がすべて入力済み
    blocks: [{ id, type, title, note, memo, memoLabel, memoText, items: [{ ...item, value, note, effective, autoText, dim }] }]
      // effective: fields の表示値（値があればそれ、無ければ auto の value）。dim: explain の shortOnly で posting !== 'short'
  }],
  pages: def.pages,
  minutesTotal               // minutes の合計（41）
}
```

### 1-8. state（app.js）

- `state.checklist = R.emptyChecklist()` を追加（`newRecord` でリセット、`applyRecord` で `U.deepMerge(R.emptyChecklist(), U.isObj(rec.checklist) ? rec.checklist : {})`）。
- `state.scores` は旧レコード用に残す（新しく書き込む UI は無い。新規は常に `{}`）。
- 判定の呼び出しを `evaluateNow()` 1 か所にまとめる（`goStep` / `renderStep` case 4 / `saveRecord` から呼ぶ）:
  ```js
  function evaluateNow() {
    return R.evaluateHiring(state.applicant, state.scores, state.profile, state.handoff, state.handoffChecks, { checklist: state.checklist });
  }
  ```
- チェックリストの変更は `state.checklist.updatedAt` 更新・`state.dirty = true`・`invalidateJudgment()`。応募情報ではないので `handoffStale` にはしない。

---

## 2. Step3 の UI（「面接チェックリスト」）

### 2-1. 名称
- `STEPS[2] = { n: 3, label: '面接チェックリスト', hint: '台本に沿って確認・評価' }`。軸の名前「面接評価」（面接評価 × シフト貢献度）とマトリクスの文言（`texts.matrix` の `{interviewPct}` 等）は変えない。
- Step4 の「← 面接評価に戻る」→「← 面接チェックリストに戻る」。レポートの進捗 `stepLabel[3]` = '面接チェックリストの入力中'。右サマリーの判定カードの空表示「面接評価とシフト貢献度の2軸で判定します。」はそのまま、`contribOn()` OFF 時の「面接評価を入力後に判定します。」→「面接チェックリストを入力後に判定します。」。

### 2-2. 画面の並び（`interviewStepHtml()` を置き換え。関数名は維持）

```
legacyBannerHtml()                      … 既存（v1 ファイル）
#legacyScores                           … 旧形式の面接評価が保存されているときだけ（2-9）
#unresolvedAlert                        … 既存（未確認の留意点）
#clHeader   .card                       … ヘッダー（2-3）
#clNav      .cl-nav（sticky）            … 目次（2-4）
.cl-page-head[data-page="1"]            … 「1枚目　必須条件一致・継続性」＋ pages[0].lead
#cl-conditions  .card.cl-sec            … ① 勤務条件
  .cl-group-label「① 勤務条件（シフト条件の確認・貢献度に反映）」
#shiftConfirm   .card                   … 既存「面接で確認する項目」（id・中身・必須チェック・#shiftConfirmStatus・#interviewNewItems・#deferredItems は不変）
#cl-continuity  .card.cl-sec            … ② 継続性・報連相
.cl-page-head[data-page="2"]            … 「2枚目　人物確認・逆質問」＋ lead
#cl-job / #cl-teamwork / #cl-reverse    … ③〜⑤（⑤ に合否連絡）
#clOverall  .card                       … 総合判断・面接評価・必須条件のまとめ・面接所見（2-6）
.actions.between  [← 申し送りに戻る] [🖨 面接チェックリスト報告（A4） data-action="print-checklist"] [採用可否判定を実行 → data-action="judge"]
```

- セクション・ブロックの並びは `profile.checklist.sections` の配列順。`#shiftConfirm` は「must か fields ブロックを持つ最初のセクション」の直後（無ければ最初のセクションの直後。既定は ①）。`interviewConfirmHtml()` が '' の劇場では出さない（既存どおり）。
- ページ見出しは `section.page` が変わる位置に出す（`pages` に該当 no が無ければ「{n}枚目」だけ）。

### 2-3. ヘッダー `#clHeader`

見出し: `checklist.title`＋ `<span class="badge">{version} 版</span>`、下に `checklist.intro`（hint）と「目安 合計 {minutesTotal}分（逆質問は最大）」。

| 欄 | 部品 | 既定・連動 |
| --- | --- | --- |
| 応募者名 | 表示のみ（`applicant.name` さん・区分・年齢） | |
| 面接日 | `<input type="date" data-cl="header.date">` | 空なら今日（`U.fmtDate(new Date())`）を入れる |
| 担当 | `<input type="text" list="clManagers" data-cl="header.interviewer">` ＋ `<datalist id="clManagers">`（`management.managers` の氏名） | 空のとき placeholder に押印「面接対応者」の氏名（`interviewerFromStamp`）。押印カード（Step2/Step4）の `interviewerField` の select は、未押印かつ担当が名簿にあればその人を初期選択（自動で押印はしない） |
| 応募した求人 | seg（通常求人／短期求人。`data-action="cl-set" data-cl="header.posting"`、再押下で解除） | 短期求人のときだけ `shortOnly` の説明を強調、それ以外は `.dim`（チェックは可能） |
| タクシー可否・料金 | 自動表示 `#clTaxiAuto`（tone 色）＋ `<input data-cl="header.taxi" placeholder="上書き（空欄なら自動）">` | `autos.taxi` |
| 消極属性 | 項目ごとに 3 択 seg「自動 / 該当 / 該当しない」（`data-action="cl-set" data-cl="header.negatives.<id>" data-value="" / "on" / "off"`）＋ 状態バッジ（該当: warn、自動なら「（自動）」） | `autos.negatives` |

- `header.posting`・`header.negatives.*`・`header.taxi` を変えたら `#clHeader` だけ作り直す（`rerenderClHeader()`）。

### 2-4. 目次 `#clNav`
- `position: sticky; top: <topbar の高さ>`。セクションごとのチップ `<a data-action="cl-jump" data-sec="<id>">①勤務条件 10分</a>`（`done` なら ✓・ok 色、必須条件に不一致があれば danger の点）。クリックで `#cl-<id>` へ smooth scroll。
- 右端に `#clNavScore`「面接評価 12/16（75%・高）」（未入力は「面接評価 —/16」）。

### 2-5. セクションのカード `#cl-<sectionId>`

見出し: `<h2><span class="cl-no">①</span>勤務条件</h2><span class="badge info">10分</span><span class="cl-sec-state" id="clState-<id>"></span>`（minutesMax なら「最大10分」、0 なら出さない。状態: 未入力／入力中 n/m／済、不一致があれば danger「不一致あり」）。lead があれば下に hint。

入力部品（ボタンは既存 `.score-seg .seg-btn` を流用し、`.good/.fair/.poor/.match/.mismatch` の色を追加）:

| type | 部品 | 入力・保存先 |
| --- | --- | --- |
| must | 見出し【必須条件】＋ note。行 `.cl-row.cl-must-row[data-item]`: 文言（14.5px）＋自動の見込み `.cl-auto.tone-*`（auto がある項目）｜ボタン「一致」「不一致」（押下中を再度押すと未確認に戻る）｜未回答なら `<span class="badge">未確認</span>` | `data-action="cl-set" data-cl="values.<id>" data-value="match|mismatch"` |
| must（ブロック末尾） | `#clMustAlert`（不一致 1 件以上で表示・danger）:「必須条件が一致しません（{文言}）。追加質問して解消しなければ ⑤ 逆質問へ進み、最大10分で終了してください（判定は{mustFailResult のタイトル}になります）。」＋ボタン「⑤ 逆質問へ」（`data-action="cl-jump" data-sec="{mustFailJumpTo}"`。'' なら出さない）。このとき ②〜④（`mustFailJumpTo` より前の ① 以外）に `.cl-skippable`（見出し右に「必須条件不一致のため省略可」） | — |
| fields | `.cl-fields`（2 列グリッド、390px で 1 列）。choice → seg（`data-action="cl-set" data-cl="values.<id>"`、再押下で解除）、text → `input type=text`、date → `type=date`、month → `type=month`（すべて `data-cl="values.<id>"`）。auto があれば空欄時に placeholder と hint「自動: {text}」。`first_end` は `start_date` の変更で hint を更新。`term` が応募情報の勤務期間と食い違う（short × long/mid など）とき hint warn「応募情報の勤務期間（{label}）と異なります。勤務期間は『面接で確認する項目』または Step1 で直してください」（自動では直さない） | values |
| explain | `.cl-checks`（2 列）: `<label class="cl-check"><input type="checkbox" data-cl="values.<id>"><span>文言</span>[<span class="tag">※短期求人のみ</span>]</label>`。note は見出し横に強調 | values（true） |
| question | 質問文のリスト `ol.cl-questions`（15px・行間広め＝読み上げ用。入力なし）＋ `memo` なら `<label>{memoLabel}</label><textarea rows="3" data-cl="notes.<blockId>">` | notes |
| rating | 見出し【確認事項】/【確認点】。行 `.cl-row.cl-rate-row[data-item]`: 文言（太字）＋ hint ｜ボタン ○ △ ×（48×40px・18px の記号、再押下で解除）｜1 行メモ `<input data-cl="notes.<id>" placeholder="メモ（任意）">`。凡例「○ できている／△ やや不安／× できていない」 | `data-action="cl-set" data-cl="values.<id>" data-value="good|fair|poor"` |
| notify | 見出し【合否連絡】＋ `.cl-checks`（文言＋チェック）。note は hint | values（true） |
| note | `<p class="cl-flow">→ {note}</p>`（A4 報告・レポートの章は `.cl-sflow`） | — |

- 入力で全体を再描画しない（フォーカスを保つ）。`updateChecklistUI()` が更新するもの: ボタンの `.active`、`#clState-*`、`#clNav` のチップと `#clNavScore`、`#clMustAlert` と `.cl-skippable`、`#clScore`・`#clMustSummary`・`#overallWarn`、記入欄の自動 hint、`shortOnly` の `.dim`、`#clTaxiAuto`・消極属性バッジ、`.missing` の解除。最後に `renderSummary()`。
- 既存の `data-field` の変更（Step3 の「面接で確認する項目」で繁忙期・深夜帯などを変えたとき）でも `updateChecklistUI()` を呼ぶ（タクシー・消極属性・必須条件の見込みが追従する）。

### 2-6. `#clOverall`「総合判断・面接所見」
- `overallLabel` ＋ ボタン「採用」「保留」「不採用」（`data-action="cl-set" data-cl="overall" data-value="hire|hold|reject"`、再押下で解除。大きめ）。hint: `overallHint` ＋ overallCaps から作る文（例「保留は上長最終判断要、不採用は不採用推奨が上限になります」。'none' の側は文に入れない）。
- `#clScore`:「面接評価 <b id="clScoreTotal">13</b> / 16点　<span id="clScorePct">81.3%</span>　[高]　（○4 △3 ×0・総合判断 採用）」。
- `#clMustSummary`: バッジ「一致 n」(ok)「不一致 n」(danger)「未確認 n」(muted。0 のバッジは出さない)＋不一致・未確認の文言。
- `#overallWarn`（id を流用）: 総合判断が保留・不採用のとき warn「面接者の総合判断が「{label}」です。」。
- 面接所見: 既存 `<textarea data-note="interview" rows="4">`（ここへ移す。placeholder「特記事項、受け答えの印象など」）。

### 2-7. イベント（app.js）
- `onFieldEvent`: `t.dataset.cl` を `data-field` より先に処理。checkbox → `checked`（false は delete）、それ以外 → `value` を `U.setPath(state.checklist, path, v)`。その後 `touchChecklist()`（updatedAt・dirty・invalidateJudgment）→ `updateChecklistUI()`。
- `onContentClick`: `cl-set`（現在値と同じなら '' に戻す。header.* なら `rerenderClHeader()`）、`cl-jump`、`print-checklist`（4-4）。旧 `case 'score'` は削除。`judge` は 2-8。
- `renderStep` case 3: `c.innerHTML = interviewStepHtml(); applyVisibility(); updateContribMeters(); refreshDeferredItems(); updateChecklistUI();`（`updateScoreUI` は削除）。描画時に `header.date` が空なら今日を入れる。
- toast に kind `'warn'` を追加（`.toast.warn { background: var(--warn); color: #fff; }`）。

### 2-8. 判定前のチェック（`validateScores()` を `validateChecklist()` に置き換え）

```
case 'judge':
  const gate = mustGateReject();   // 必須条件に不一致があり mustFailResult === 'reject'
  if (validateChecklist(gate) && validateDays() && (gate || validateContribution())) goStep(4);

validateChecklist(gate):
  if (R.interviewModel(p, state.scores, state.checklist).mode === 'legacy') return true   // 旧レコードは旧方式で判定
  if (gate) return true                          // 面接を打ち切るため確認点・総合判断は必須にしない（台本の「5へ」）
  未入力の rating 行と総合判断 → .missing（行の赤枠）、toast('未入力の確認点が n 件あります' + (総合判断未入力 ? '・総合判断が未入力です' : ''), 'error')、
  最初の .missing へ scrollIntoView、return false
  必須条件に未確認があれば toast('必須条件に未確認が n 件あります（判定は続けます）：' + 文言, 'warn')（止めない）
  return true
```

- 説明・質問メモ・記入欄・合否連絡の未入力は止めない（報告書に ☐ や「—」で残る）。
- `mustFailResult === 'review'` のときは確認点・総合判断を必須のままにする（結果が不採用推奨まで下がる可能性があるため）。

### 2-9. 旧形式の面接評価 `#legacyScores`
- `state.scores` に数値があるときだけ表示（info カード）。見出し「旧形式の面接評価（10項目×5点）」、旧 `evaluation.items` の各行「ラベル ｜ 点」と合計「39 / 50点（78%）」。編集 UI は出さない。
- 文言: チェックリスト未入力（mode legacy）のとき「旧形式の面接評価で保存されたデータです。判定はこの点数で行います。面接チェックリストに入力すると、チェックリストで判定し直します（旧形式の点数は保存レポートに参考として残ります）。」／入力後「面接チェックリストの評価に切り替わりました（旧形式の点数は参考）。」

### 2-10. Step2 の文言（構成・コピー文は変えない）
- ボタン「面接評価へ進む →」→「面接チェックリストへ進む →」。
- `#interviewTodo` の説明「面接で次の項目を確認し、Step3「面接で確認する項目」に入力してください。」→「面接で次の項目を確認し、Step3「面接チェックリスト」の ① 勤務条件の下にある「面接で確認する項目」に入力してください。」
- 「面接で確認する項目」カードの名前は維持するので、`texts.contributionIntro`・`preFillHint`・`shift_unanswered` の文言は変えない。

### 2-11. ヘルプ・スタイル
- ヘルプ Step3: 見出し「面接チェックリスト」、本文「面接者が台本（スタッフ面接チェックリスト）の順に確認・入力します。必須条件（一致／不一致）、説明のチェック、質問のメモ、確認点の ○△×、総合判断から面接評価を計算します。必須条件が不一致なら不採用推奨です。『面接で確認する項目』には繁忙期・深夜帯・オールナイトなどを入力します。判定に必要なシフト条件（*）が未確認だと判定に進めません（必須条件が不一致のときを除く）。」
- styles.css に `.cl-sec / .cl-page-head / .cl-nav / .cl-no / .cl-block / .cl-block-title / .cl-row / .cl-must-row / .cl-rate-row（grid: 1fr auto minmax(10em,16em)）/ .cl-fields / .cl-checks / .cl-questions / .cl-auto.tone-* / .cl-flow / .cl-skippable / .cl-group-label / .dim / .cl-row.missing{outline:2px solid var(--danger)}` を追加。840px 以下で行を 1 列に、**390px で横スクロールなし**。ダークモードは既存トークン（`--ok-soft` など）だけで色を付ける。

---

## 3. 判定

### 3-1. `evaluateHiring(applicant, scores, profile, handoff, checks, opts)` の変更（最小差分）

シグネチャは変えない。冒頭の評価項目の取得だけを差し替える:

```js
const ev = profile.evaluation || {};
const cl = opts && U.isObj(opts.checklist) ? opts.checklist : null;
const model = interviewModel(profile, scores, cl);
const items = model.items;
const scale = model.scale;
const overallItemId = model.overallItemId;
scores = model.scores;
const isCl = model.mode === 'checklist';
const def = profile.checklist || {};
```

以降の `breakdown` / `total` / `max` / `pct` / 帯 / マトリクスは既存のまま（`ev.overallItemId` を `overallItemId` に置き換える）。`breakdown` の各要素にチェックリスト方式のとき `mark`（good/fair/poor/hire/hold/reject）・`markLabel`（○/△/×/採用…）・`sectionId`・`sectionNo`・`sectionTitle`・`note` を足す。

- 得点率: `pct = round1(total/max*100)`（既存式）。`thresholds.recommendPts = ceil(16×0.7) = 12`、`reviewPts = ceil(16×0.4) = 7`。

| 例（既定 16 点） | 点 | % | 帯 |
| --- | --- | --- | --- |
| 全○＋採用 | 16 | 100 | 高 |
| ○5 △2＋採用 | 14 | 87.5 | 高 |
| ○4 △3＋採用 | 13 | 81.3 | 高 |
| ○4 △2 ×1＋採用 | 12 | 75 | 高（12 点以上が高） |
| ○3 △3 ×1＋採用 | 11 | 68.8 | 中 |
| 全△＋採用 | 9 | 56.3 | 中 |
| ○1 △3 ×3＋保留 | 6 | 37.5 | 低（7 点以上が中） |
| 全×＋採用 | 2 | 12.5 | 低 |

- strengths / concerns は**割合**で判定する（旧方式の結果は変わらない）: `score/scale ≥ 0.8` → 強み、`≤ 0.4` → 懸念、総合判断は除く。scale 5 では 4 点以上／2 点以下で従来どおり、scale 2 では ○ が強み・× が懸念・△ はどちらでもない。チェックリスト方式でメモがあれば「ラベル（メモ）」。

### 3-2. 警告（warnings）

| 条件 | 旧方式 | チェックリスト方式 |
| --- | --- | --- |
| 総合判断 | 既存（`overallWarnBelow` 未満） | 3-3 (2) |
| 未入力 | 「未入力の評価項目がN件あります（0点として集計）。」 | 確認点:「未入力の確認点がN件あります（0点として集計）。」、総合判断:「面接者の総合判断が未入力です（0点として集計）。」。**必須条件の不一致で mustFailResult が reject のときは出さない**（打ち切った面接では入力不要） |
| 必須条件の見込みとの食い違い | — | must が 'match' なのに `checklistAuto().must[id].ok === false` →「必須条件「{label}」は一致としましたが、応募情報と食い違いがあります（{auto text}）。応募情報の修正が必要か確認してください。」（結果は変えない） |

### 3-3. 調整（下げる方向のみ。既存の `down()`。この順に適用し、実際に変わったときだけ adjustments に積む）

```
(0a) must_conditions  : isCl && must.mismatch > 0
       → down(mustFailResult, 'must_conditions', reason, true)      // alwaysWarn: 既に不採用推奨でも理由は warnings に出す
       reason(reject) = '必須条件が一致しないため（{不一致の文言を「、」区切り}）、不採用推奨とします。'
       reason(review) = '必須条件が一致しないため（{…}）、採用推奨ではなく上長最終判断要として扱います。'
(0b) must_unconfirmed : isCl && must.mismatch === 0 && must.unknown > 0
       mustUnknownResult === 'review' → down('review', 'must_unconfirmed',
         '必須条件に未確認があるため（{文言}）、採用推奨ではなく上長最終判断要として扱います。Step3 の ① で一致／不一致を入力してください。', true)
       mustUnknownResult === 'none'（既定）→ warnings.push('必須条件に未確認が{n}件あります（{文言}）。面接で確認してください。')
(1)  contribution_incomplete … 既存
(2)  総合判断
       旧方式: 既存（overallRejectAtOrBelow → overall_cutoff、overallWarnBelow の警告）
       チェックリスト方式（evaluation.overallRejectAtOrBelow は使わない＝5 点尺度の値で誤爆しないため）:
         overall === 'reject': caps.reject !== 'none' → down(caps.reject, 'overall_cutoff', '面接者の総合判断が「{label}」のため、{不採用推奨とします｜採用推奨ではなく上長最終判断要として扱います}。', true)
                               caps.reject === 'none' → warnings '面接者の総合判断が「{label}」です。採用可否は慎重に判断してください。'
         overall === 'hold'  : caps.hold !== 'none'   → down(caps.hold, 'overall_hold', '面接者の総合判断が「{label}」のため、採用推奨ではなく上長最終判断要として扱います。', true)
                               （caps.hold === 'reject' なら文末は「不採用推奨とします。」）
                               caps.hold === 'none'   → warnings '面接者の総合判断が「{label}」です。上長と確認してください。'
(3) highschool_hold / (4) legal_hold / (5) unresolved_block … 既存
```

- (0a) を先頭に置くのは、台本どおりの不採用を結論の理由の 1 行目に出すため（後続の down は既に最低なので記録されない）。
- reject 設定（ゲート）のときは、結果が変わらなくても（打ち切りで ②〜④ が 0 点 → 点数上も不採用推奨）`must_conditions` を **必ず** adjustments に積み（`from === to` があり得る）、理由を warnings の**先頭**に入れる。本文は `texts.mustGate`（既定「{name}は必須条件（{mustLabels}）が一致しないため、面接評価・シフト貢献度にかかわらず{resultTitle}とします。」）にし、マスの注記（`matrix.note`）は出さない（`cellNote` には残る）。表示は Step4 の調整欄・レポートの調整欄・A4 の `.cl-adj` とも、`from === to` を「不採用推奨（固定）」と書く。review 設定は従来どおり（実際に下がったときだけ記録）。
- `mustFailResult`・`overallCaps` の不正値は normalize で既定に戻す（rules 側でも不正値は既定扱い）。
- 結果が下がったときの本文は既存の `texts.adjusted`（「…点数上は{baseTitle}ですが、下記の理由により{resultTitle}とします。」）。マスの注記は出さない（既存）。
- app.js `ADJUST_SHORT` に追加・変更: `must_conditions: '必須条件の不一致で調整'`、`must_unconfirmed: '必須条件が未確認のため調整'`、`overall_hold: '総合判断「保留」で調整'`、`overall_cutoff: '総合判断で調整'`（旧「総合判断の足切りで調整」）。

### 3-4. 戻り値（既存キーはすべて維持。追加のみ）

```js
{ /* 既存すべて */,
  interviewMode: 'checklist' | 'legacy',
  scaleMax: 2 | 5,
  checklist: isCl ? {                 // 判定時点のスナップショット（Step4・レポート用）
    version, counts: { good, fair, poor, blank },
    overall: { value, label, points },
    must: mustSummary(def, cl)
  } : null }
```

### 3-5. 未確認・未入力の扱い（まとめ）

| 状態 | Step3 | 判定 |
| --- | --- | --- |
| 必須条件に不一致（reject 設定） | `#clMustAlert`・②〜④ 省略可。確認点・総合判断・シフト条件が未入力でも判定へ進める | (0a) 不採用推奨 |
| 必須条件に不一致（review 設定） | `#clMustAlert` は「追加質問で確認し、ほかのセクションの確認点も評価してから判定」（②〜④ の「省略可」・「⑤ へ」ボタン・「終了してください」は出さない）。確認点・総合判断は必須 | (0a) 上長最終判断要以下 |
| 必須条件に未確認 | toast warn（止めない） | 既定: warnings のみ。設定 review: 上長最終判断要まで |
| 確認点・総合判断が未入力 | 判定に進めない（不一致 reject 時を除く） | 0 点で集計＋warnings |
| 説明・質問メモ・記入欄・合否連絡の未入力 | 何もしない | 影響なし（報告書に ☐・「—」） |

### 3-6. Step4（`resultStepHtml`）
- `axisMetricsHtml`: 面接評価の欄に「{total} / {max}点・{pct}%・帯」に加え、チェックリスト方式では 1 行「○n △n ×n・総合判断 {label}」と、必須条件に不一致・未確認があれば danger / muted バッジ。
- 結果カードの metrics の上に `.result-must`「必須条件: 一致 2 ／ 不一致 0 ／ 未確認 0」（既定の台本は必須条件 2 件）（不一致・未確認があれば文言も。チェックリスト方式のみ）。
- 「面接評価の内訳」カード: チェックリスト方式は `checklistBreakdownHtml(j)`（`#clBreakdown`、見出し「面接チェックリストの結果」・右に `{pct}%` の帯バッジ）:
  - 必須条件の表: 文言 ｜ 一致(ok) / 不一致(danger) / 未確認(muted)
  - 確認点の表: `①` 文言 ｜ ○△× バッジ ｜ 点（2/1/0）｜ メモ（セクション番号順）。最後に総合判断の行、合計行「{total}/{max}点（{pct}%・{帯}）」
  - 旧方式は既存 `interviewBarsHtml(j)`（見出し「面接評価の内訳（旧形式）」、scale は `j.scaleMax`）
- 強み・懸念カード: チェックリスト方式は見出し「面接での強み（○ の確認点）」「面接での懸念（× の確認点）」、空は「○ の確認点はありません。」「× の確認点はありません。」。旧方式は既存。
- 判定履歴の Step3 行: チェックリスト方式「Step 3　面接チェックリスト {total}/{max}点（○n △n ×n・総合判断 {label}）／必須条件 一致n・不一致n・未確認n」。旧方式は既存文。
- 操作: 「🖨 面接チェックリスト報告（A4）」（`data-action="print-checklist"`）を「🖨 印刷」の左に追加。

### 3-7. 右サマリー（`renderSummary` の面接評価カード）
- 数値は `R.interviewModel(p, state.scores, state.checklist)` から（入力中もライブ）。見出し: チェックリスト方式「面接チェックリスト」、旧方式「面接評価（旧形式）」。
- ゲージ `total / max点`、行「確認点 {rated−総合}/{確認点数}・総合判断 {label|未入力}」「得点率 {pct}% [帯]」、チェックリスト方式のみ `#sumMust`「必須条件」: 不一致あり → `badge danger 不一致 n`、未確認あり → `badge muted 未確認 n`、全一致 → `badge ok すべて一致`、未回答のみ → 「未確認 2」（既定の台本の必須条件 2 件）。

---

## 4. 出力

### 4-1. 保存レコード（`storage.buildRecord` に追加のみ）

```js
checklist: U.deepClone(state.checklist || R.emptyChecklist()),
checklistDef: state.profile.checklist ? U.deepClone(state.profile.checklist) : null,
scores: U.deepClone(state.scores || {}),        // 既存。新規レコードでは {}
```
`schemaVersion: 2` のまま（旧 v1 判定 `ver < 2 && !vacationDays` に影響しない）。`judgment` には 3-4 の追加キーが入る。

### 4-2. 共通の描画関数（storage.js・export。DOM 非依存）

```js
checklistSheetHtml(record, profile, o)   // o = { mode: 'section' | 'sheet', stamps: html文字列 | '', decisionId, decisionSvgId }
checklistSheetCss()                      // .cl-sheet 以下のスタイル＋@page clsheet＋body.print-checklist の印刷規則（アプリ・レポート共通）
fitChecklistSheet(sheetEl, limitPx?)     // 1 ページ保証（4-4）。limit の既定は CL_SHEET_BODY_PX（= 1040 − 押印行 90 = 950px）
checklistSheetLimit(nStamps)             // 押印行を除いた本文の上限（押印欄の件数で決める。3 件まで 950・4〜6 件 890・7〜9 件 830px。4-4）
checklistShortLabel(item)                // 1 ページ用の短い名前（下記）
normalizeChecklistDef(def, baseDef)      // 6-1。レポート描画時に record.checklistDef にも通す
```

- `def = normalizeChecklistDef(record.checklistDef || profile.checklist, defaults().checklist)`、`sum = R.checklistSummary(record.applicant, record.checklist || R.emptyChecklist(), Object.assign({}, profile, { checklist: def }), { scores: record.scores, management: record.management })`。
- 記号は白黒印刷でも読めるよう文字で出す: 必須条件「○一致」「×不一致」「－未確認」、説明・合否連絡「☑」「☐」、確認点「○／△／×」（色は補助）。値はすべて `U.esc`。
- `checklistSheetCss()` は「</」＋「script」の並びを含めない。アプリは `init()` で `<style id="clSheetCss">` に 1 回だけ入れ（CSS の二重管理をしない）、レポートは `reportCss()` の末尾に足す。
- **2 つのモードは別物**: `'section'` は保存レポート「詳細」の節で**台本の全文**（2026-10-13 までの描画をそのまま。下記）。`'sheet'` は A4「面接チェックリスト報告」で **1 ページの要約**（2026-10-14〜。下記）。アプリの ③ の紙プレビュー（`#appPaper`）、保存 HTML の紙プレビュー（`#clPaper`）、印刷用（`#clSheet`）はすべて `'sheet'`。

**mode 'section'**（保存レポート「詳細」の「面接チェックリスト」節。変更なし）:

```
  .cl-sheet-head.cl-sec-head   面接日｜担当（「（押印より）」）｜目安 {minutesTotal}分（詳細モードの記録だけ）
                    チップ .cl-hchip: タクシー可否・料金（詳細モードの手入力は「（手入力）」）／応募した求人
  .cl-page[data-page="n"]   … 台本のページごと。見出し .cl-page-h「台本1枚目　必須条件一致・継続性」＋ lead（台本の前書き）。title も lead も空のページは見出しを省く
    section.cl-s[data-cl-sec="<id>"]
      h3: ① 勤務条件 <small>10分</small> <span class="cl-s-sum">確認点 ○2 ／ 必須 一致2</span>（不一致があれば .cl-s-ng）
      must → table.cl-must ／ fields → dl.cl-fields（自動値は「（応募情報より）」、契約終了は「（自動）」。空欄は「—」）／ explain・notify → ul.cl-checks（☑/☐。shortOnly は「※」）
      question → ol.cl-qs（質問文。print.showQuestions=false なら出さない）＋ .cl-memo「{memoLabel}：本文」（空は「—」）
      rating → table.cl-rate（文言＋ hint .cl-hint｜○△×｜点｜メモ。未入力は「未入力」）／ note → p.cl-sflow
  .cl-overall        総合判断｜面接評価 {total}/{max}点（{pct}%・{帯}）○n △n ×n｜必須条件 一致n・不一致n・未確認n｜面接所見（全文）
```

**mode 'sheet'**（A4「面接チェックリスト報告」＝ 1 ページの要約。A4 縦・幅 190mm ≒ 718px・本文の上限 950px＋押印行）:

目的: 副支配人が 10 秒で「誰を・どう判断し・何が気になるか」を掴める。**台本の説明文（【説明】の文言）・質問文・確認点の補足（hint）・ブロックの注記・ページの前書き・空の記入欄（の説明）は載せない**。

| # | ブロック（上から） | 中身 | 実測の高さ（標準のサンプル・1440px） |
| --- | --- | --- | --- |
| 1 | ヘッダー帯 `.cl-sheet-head > .cl-band`（濃紺地・白文字・高さ 22px） | 左「面接チェックリスト報告」、中「台本 {version} 版」小さく、右「{劇場名} ／ 作成 YYYY/MM/DD」 | 22px |
| 2 | 応募者 `.cl-who`（2 行） | 1 行目: 氏名 16px 太字「さん」＋区分・年齢・性別（`.cl-sh-who`）＋卒業予定（`.cl-sh-grad`）。2 行目 `dl.cl-sh-kv`: 面接日／担当／応募した求人／タクシー可否・料金（詳細モードの記録は＋勤務期間／週／希望シフト）を「ラベル 値」で。**空の値は項目ごと省く**。値は 1 行（長ければ末尾を…） | 帯と合わせて 72px |
| 3 | 結果ストリップ `.cl-judge`（地色は結果に合わせた薄い色＝`data-result`） | 左から 結果バッジ `.cl-tile.cl-tile-res`（採用推奨＝緑／上長最終判断要＝琥珀／不採用推奨＝赤、14px 太字、判定日時）・総合判断・必須条件（すべて一致／不一致 n〔赤〕／未確認 n）・確認点（`{total}/{max}点`＋`○n △n ×n`。総合判断の点を含む面接評価の点）の 4 タイル（詳細モードの記録は＋シフト貢献度）、右端に最終合否 `.cl-decision`（`#clPaperDecision` / `#clDecision` / `#appPaperDecision`。未押印は点線枠「最終合否 未押印」）。調整があればストリップの下に `<ul class="cl-adj"><li><b>…</b>：理由</li></ul>`（必須条件の不一致は「必須条件の不一致により「不採用推奨」に固定」、ほかは「A → B」「B（固定）」）。**判定が無いときは結果タイルに「未実施」**（`.cl-judge-none`・判定を勝手に走らせない） | 72px（＋調整 1 行 ≒ 14px） |
| 4 | 2 カラム `.cl-cols`（左 45%・右 55%） | 左 `.cl-blk-must`「必須条件」: 必須条件の行（`.m-match`／`.m-mismatch`／`.m-unknown` のマーク「○一致」「×不一致」「－未確認」＋文言）＋必須条件の直後の記入欄（土日勤務可否・出勤不可な繁忙）。右 `.cl-blk-terms`「勤務条件の確認」: ほかの記入欄（短期／長期の希望・契約開始日の希望・初回契約終了・OPEN／25時の可否）。どちらも `dl.cl-kv` の「ラベル｜値」2 列（空は「—」、値は 2 行まで） | 113px |
| 5 | 確認点 `.cl-blk-rate`（全幅・`table.cl-rt`） | 確認点の全項目（既定 7 行。未入力の行も出す＝何を見なかったか分かる）。列: セクション番号（①〜⑤）｜確認点の名前｜○△× の丸バッジ（`.cl-mark` ○緑 △琥珀 ×赤、未入力は灰「—」）｜メモ（1 行。長ければ末尾を…） | 185px |
| 6 | 面接メモ `.cl-blk-notes`（**記入があるものだけ**。何も無ければブロックごと省く） | 「短い名前｜回答」の 2 列（名前の列 18em）: 質問ブロックのメモ（`.cl-nm-q`。名前はセクション番号＋**1 問目の短い名前＋「ほか n 問」**〔例「② 前のバイトの期間・退職理由 ほか2問」。1 問だけのブロックは短い名前だけ。回答はブロックに 1 つなので 3 問の名前は並べない＝名前が 1 行に収まり回答より目立たない〕。回答は 2 行まで＝line-clamp）、メモ欄を ON にした説明ブロックのメモ（`.cl-nm-b`。名前はメモ欄の名前）、面接所見（`.cl-nm-iv`。全文）、台本モードは Step① のメモ（`.cl-nm-memo`「メモ」。全文）。最後に案内 1 行 `.cl-nm-ref`（**「…」で切れたメモがあるとき**〔`.cl-nm-cut`〕「「…」で切れたメモの全文は、保存 HTML の「詳細」表示にあります」、`.cl-compact-2` で質問の回答を省いたとき「質問の回答は省略（…）」。どちらでもなければ出さない） | 179〜202px |
| 7 | 説明・連絡 `.cl-exline`（1 行） | 「説明済み ① 4/4 ・ ② 3/3 ・ ③ 4/4 ・ ④ 3/3 ｜ 合否連絡 採用時 ☑ ／ 不合格 ☐」。説明は【説明】ブロックのチェック数（**※短期求人のみ の項目は求人が「短期」のときだけ数える**＝通常・未選択なら分母から除く。全部でなければ太字・下線）。合否連絡は短い名前＋☑/☐ | 24px |
| 8 | 押印行 `.cl-stamps`（最下段） | アプリの印刷用（`#clSheet`）だけ `o.stamps`＝初期対応者／面接対応者／最終確認の小さなハンコ枠（未押印は点線丸「未押印」）。保存 HTML は `''` で、直後の押印の節（`section[data-sec="mgmt"]`）を続けて印刷する（4-4）。紙プレビューには出さない（押印はプレビューの下の押印欄で操作）。1 段 3 件で、押印欄を 4 件以上にした設定は段が増える | 50px（保存 HTML の押印の節は 78px＋間 8px。2 段で 134px） |

- 文字: 本文 9.5px、ラベル 8.5px、見出し `.cl-h` 10.5px（左に 3px の濃紺の線）。色は結果・○△×（必須条件の一致／不一致を含む）・最終合否だけ。ほかはグレースケール、罫線は薄灰 1px。紙は白（アプリのダークテーマでも白地）。
- 短い名前（`short`）: `config.default.js` の質問（例 `q_prev_job` →「前のバイトの期間・退職理由」）・合否連絡（`nt_hire` →「採用時」、`nt_reject` →「不合格」）・記入欄（`first_end` →「初回契約終了」、`open_late` →「OPEN／25時の可否」）に `short` を持たせた。`checklistShortLabel(item)` は `short` → **文言が既定と同じ項目は既定の short**（short の無い旧い設定・保存済みの記録の台本）→ 文言の先頭 14 文字＋「…」（前後の「」は外す）。`normalizeChecklistDef` は `short` の前後の空白を外し、空・文字列以外は消すだけで**補わない**（設定で質問文を書き換えたときに古い short が残らないよう、補うのは描画時）。設定画面の質問・合否連絡・記入欄の各行に「報告書（A4 1 枚）での短い名前」の欄を追加した。
- 旧い id・構造は残す: `.cl-sheet.cl-mode-sheet`・`.cl-sheet-head`・`.cl-judge`（`class="cl-judge"` のまま。地色は `data-result`）・`.cl-judge-row`・`.cl-tile-res`・`.cl-adj`・`.cl-decision`（`#clPaperDecision` / `#clDecision` / `#appPaperDecision` の差し替えは従来どおり）・`.cl-stamps`。`.cl-page`・`.cl-s`・`.cl-overall`・`.cl-hchip`・`.cl-qs` は 'sheet' には出さない（'section' には残る）。
- 「面接で確認した勤務条件」（詳細モードの記録の `.cl-confirmed`）は 1 ページの要約には載せない（保存 HTML「詳細」の「面接で確認した情報」の節にある）。
- 旧形式（`interviewModel(...).mode === 'legacy'`）の record に呼んだ場合は、空欄の要約（確認点はすべて「—」）を出す（アプリ・レポートとも旧形式では印刷ボタンを出さないので通常は呼ばれない）。

### 4-3. 保存レポート（`generateReportHTML`）
- 章の並び: 応募時の情報 → 申し送りコメント → 留意点 → 面接で確認した情報 → シフト貢献度 → **面接チェックリスト**（`data-sec="checklist"`）→ **面接評価（旧形式・10項目×5点）**（`data-sec="scores"`、旧 scores があるときだけ）→ 採用可否判定 → 応募者の管理 → （`#clSheet`、4-4）。

| record | 「面接チェックリスト」節 | 「面接評価（旧形式）」節 | 面接所見の置き場所 |
| --- | --- | --- | --- |
| チェックリスト入力あり・旧 scores なし | `checklistSheetHtml(record, profile, { mode: 'section' })` | 出さない | チェックリスト節（.cl-overall） |
| 入力なし・旧 scores なし（面接前の保存など） | 「面接チェックリストは未入力です。」＋面接所見 | 出さない | チェックリスト節 |
| 入力なし・旧 scores あり（旧レコード） | 出さない | 従来の棒グラフ表（ラベルは `profile.evaluation.items`、無ければ `record.judgment.breakdown[].label`、それも無ければ id） | 旧節 |
| 入力あり・旧 scores あり | 上記どおり | 見出し「面接評価（旧形式・10項目×5点・参考）」 | チェックリスト節 |

- ダッシュボードの「面接評価」タイル: `R.interviewModel(profile, record.scores, record.checklist)`（checklistDef を def に）から `{total}/{max}点`、t-sub「得点率 {pct}%・{帯}」、チェックリスト方式で不一致があれば「・必須 不一致{n}」を danger で。
- 判定の結果ボックスに「必須条件: 一致{n}・不一致{n}・未確認{n}」の行（`judgment.checklist` があるとき）。
- ツールバー `.rtool` に `<button id="rtPrintChecklist">面接チェックリスト報告（A4）</button>` を「申し送りシート」の右に追加（チェックリスト入力があるときだけ）。hint に「面接チェックリスト報告は結果・必須条件・確認点・面接メモ・押印を A4 1 枚にまとめます（台本の全文は「詳細」）。」を追記（2026-10-14 改訂。旧「台本の①〜⑤の記入内容・判定・押印欄を A4 1〜2 枚にまとめます。」）。
- 埋め込み JSON は既存どおり `jsonForScript`（メモに閉じタグやコメント開始が入っても壊れない）。

### 4-4. A4「面接チェックリスト報告」の印刷（申し送りシートと同じ body クラス方式）

**アプリ**
- `index.html` の `.app` の後ろに `<div id="clSheet" class="cl-sheet-host" aria-hidden="true"></div>`。
- `prepareChecklistSheet(on)`（`RecruitApp` に export）:
  ```
  on : rec = S.buildRecord(state)（judgment は state.judgment。stale・未実施なら null）
       #clSheet.innerHTML = S.checklistSheetHtml(rec, state.profile, { mode: 'sheet', stamps: checklistStampsHtml() })
       body.classList.add('print-checklist'); fitChecklistSheet()
  off: body.classList.remove('print-checklist'); #clSheet.innerHTML = ''
  ```
- `checklistStampsHtml()`: `management.fields` ごとに静的な押印（`Stamp.render(e, { size: 46, id: 'cl' + idx })`）・未押印は枠（操作部品なし）。
- `printChecklistSheet()`: `prepareChecklistSheet(true)` → `afterprint`（保険 3 秒）で off → `window.print()`。Step3・Step4 のボタンから呼ぶ。旧形式（legacy）では Step3・Step4 にボタンを出さない。
- `fitChecklistSheet()`（2026-10-14〜。**1 ページ保証**）: `storage.fitChecklistSheet(#clSheet .cl-sheet, checklistSheetLimit(押印欄の件数))`。シートの高さから押印行 `.cl-stamps` とその上の余白を除いた値（押印行の直前の要素の下端まで）が上限を超えたら、次の順に 1 段ずつ詰めて、収まったところで止める。
  - 上限 `checklistSheetLimit(n)`: A4 の印字可能高さ 297mm − 上下余白 16mm ≒ 1062px の安全側 1040px − 押印行の取り置き 90px（1 段＝押印欄 3 件まで）− 2 段目以降 1 段 60px。**3 件まで 950px**（`CL_SHEET_BODY_PX`）・4〜6 件 890px・7〜9 件 830px。アプリの印刷用・紙プレビュー、保存 HTML の印刷用・紙プレビューで同じ値（保存 HTML は保存時の押印欄の件数）。
  - `.cl-compact`: 本文 9px・余白を詰める・面接メモの名前と記入欄の値を 1 行。**質問の回答は 2 行のまま**、面接所見は **10 行まで**・Step① のメモは 3 行まで（行数の上限は CSS で固定。残りの高さまで広げない＝長い所見が紙を占めて結果・確認点より目立たないように。超えた分は面接所見から先に削る）。
  - `.cl-compact-q1`: 質問の回答・説明ブロックのメモを 1 行、面接所見 6 行・Step① のメモ 2 行。
  - `.cl-compact-2`: 質問の回答の行を隠して案内 1 行（`.cl-nm-ref` の「質問の回答は省略（回答と「…」で切れたメモの全文は、保存 HTML の「詳細」表示にあります）」）、面接所見 4 行・Step① のメモ 1 行、調整は 1 行目だけ。
  - 縮小: シートを `zoom` で縮める。**縮小後の高さを測り直し**、上限に収まるまで倍率を下げる（Chromium の zoom は小さくするほど高さが比例して縮まないため。最大 12 回・下限 0.3 倍）。
  - 各段で、面接メモ・確認点のメモが「…」で切れているか（`scrollHeight > clientHeight` または `scrollWidth > clientWidth`。非表示の行は除く）を調べ、切れていれば `.cl-nm-cut` を付けて案内 1 行「「…」で切れたメモの全文は、保存 HTML の「詳細」表示にあります」を出す（案内の高さも含めて計る。詰めていない段でも出す）。
  - 計測のため `body.print-checklist` のときは画面でも `#clSheet` を `display:block; position:absolute; left:-10000px; width:190mm` にする。
- **紙プレビューにも同じクラス**: ③ の `#appPaper`（`renderStep` の ③・`rerenderReportPaper`・画面幅の変更で `fitReportPaper()`）と保存 HTML の `#clPaper`（読み込み時・「報告書」表示に戻したとき＝`setView('report')`。`window.__fitChecklistPaper`）に同じ関数を使う。紙プレビューは押印行を持たないので、印刷と同じ上限（`checklistSheetLimit`）で計れば印刷と同じ見た目になる。
- **③ の紙プレビューは等倍で見せる**（2026-10-14 レビュー後。本文 9.5px・ラベル 8.5px を画面でも下回らない）: 右サマリー（312px）の横に A4 の紙（約 796px）が等倍で入らない幅（1280px・1366px など、1438px 未満）では `.judge-layout` に `.paper-stack` を付けて右サマリーを紙の下に回す（右サマリーは横並びのカード。③ 以外のステップでは外す。2026-10-19 に削除: 2026-10-18 から報告書は 1 列〔`.page.reading`〕で右サマリーはいつも紙の下。`docs/SPEC-flow.md` 16-9）。それでも列が紙より狭いときだけ `#appPaper` を `zoom`（列の幅 ÷ 紙の幅）で縮め、**縮小は 0.95 倍まで**（本文 9px 以上）。それより狭い画面（サイドバーのある 841〜1,063px・790px 未満のスマホ 390px など）は等倍のまま紙だけ横スクロール（E36）。計測は縮小を外してから行う。旧: 縮小 0.7 倍まで（1280px で 0.80 倍＝本文 7.6px になっていた）。
- styles.css:
  ```css
  .cl-sheet-host { display: none; }
  body.print-checklist .cl-sheet-host { display: block; position: absolute; left: -10000px; top: 0; width: 190mm; }
  @media print {
    body.print-checklist .app, body.print-checklist .toast { display: none !important; }
    body.print-checklist .cl-sheet-host { position: static; left: auto; width: auto; }
    body:not(.print-checklist) .cl-sheet-host { display: none !important; }   /* 申し送りシート・全体印刷には出さない */
  }
  ```

**保存レポート**
- 押印節（`section[data-sec="mgmt"]`）の直前に `<div id="clSheet" class="cl-sheet-print">{checklistSheetHtml(record, profile, { mode: 'sheet', stamps: '' })}</div>`（チェックリスト入力があるときだけ）。
- インラインスクリプトに `window.__prepareChecklistSheet(on)`（`body.print-checklist` の付け外しと 1 ページ保証。2026-10-14〜はアプリと**同じ関数** `clFitSheet` のソースを `Function.prototype.toString` で埋め込み、上限 `var CL_LIMIT=` `checklistSheetLimit(押印欄の件数)`〔既定 3 件で 950。押印の節を直後に印刷するので、その段数の分を除く〕。外部参照なしの ES5 で、関数内にコメントを書かない）を追加し、`#rtPrintChecklist` で prep(true) → print → afterprint（保険 3 秒）で戻す。
- `checklistSheetCss()` に含めるレポート用規則:
  ```css
  .cl-sheet-print { display: none; }
  body.print-checklist .cl-sheet-print { display: block; }
  @media print {
    body.print-checklist .page > :not(#clSheet):not(section[data-sec="mgmt"]) { display: none !important; }
    body:not(.print-checklist) .cl-sheet-print { display: none !important; }
  }
  ```
  押印節のコンパクト化は既存の `body.print-handoff …stamp…` の規則に `body.print-checklist` のセレクタを並べて共用（hint・操作・保存バー・注記を隠し、ハンコ 46px）。レポート上で後から押した印も報告書に出る。

**共通の印刷 CSS（`checklistSheetCss()`）**
- `@page clsheet { size: A4; margin: 8mm 10mm; }`、`body.print-checklist { page: clsheet; font-size: 9.5px; line-height: 1.35; }`。
- （旧版の `.cl-page + .cl-page { break-before: page }`・`.cl-fit` は 2026-10-14 に削除。1 ページの要約は改ページを指定しない）
- 'sheet' の寸法・色は 4-2 の表（本文 9.5px・ラベル 8.5px・見出し 10.5px・結果 14px）。'section' は従来どおり（① と記入欄のあるセクションは 2 段組み、セクション見出しは濃い帯＋白文字）。
- 'sheet' のブロック（`.cl-judge`・`.cl-blk`・`.cl-stamps`・`.stamp-row`）は `break-inside: avoid`、色付き要素（`.cl-band`・`.cl-judge`・`.cl-tile`・`.cl-mark`・`.cl-mm`・`.cl-decision`・ハンコ）は `print-color-adjust: exact`。'section' の行・セクションの改ページ規則は従来どおり（HANDOFF 9 章の方針）。
- 申し送りシート（`body.print-handoff`）の表示対象には入れない（レポートの `:not()` リストに `checklist` を足さない。アプリは `.cl-sheet-host` が非表示）。全体印刷（`rtPrintAll`・アプリの 🖨 印刷）では `#clSheet` を出さず、本文の「面接チェックリスト」節（`mode: 'section'`）を詰めて出す（`dl.cl-fields` 2 列、表のセル余白 2px、`.cl-qs` は `print.showQuestions` に従う）。

### 4-5. ページ数の目標と確認（2026-10-14〜: すべて 1 ページ）

| ケース | 目標 | e2e の固定 |
| --- | --- | --- |
| 標準（E25・E34 のサンプル: メモ各 30〜60 字） | A4 1 枚（`.cl-compact` なし。本文 約 700px） | アプリ・レポートとも `n === 1`（E27・E30・E34。E39 で紙の高さ ≤ 950px・.cl-compact なし） |
| 重い（全メモ 150 字・確認点メモ 40 字・説明すべて☑・面接所見 200 字・調整 2 件） | A4 1 枚 | アプリ・レポートとも `n === 1`（E27） |
| 本文が上限を超える（全メモ・確認点のメモ・Step① のメモ 300 字・面接所見 1,500〜2,000 字） | A4 1 枚（`.cl-compact`。質問の回答は 2 行のまま・面接所見は 10 行まで・「…」の案内 1 行） | `.cl-compact` が付き `n === 1`（E27 の詳細モード・E39 の台本モード。アプリ・保存 HTML の紙プレビューと印刷用）。E39 は質問の回答 2 行・面接所見 10 行以内（紙の 2 割未満）・名前 1 行・案内 1 行も |
| 面接所見 4,000 字（保存 HTML） | A4 1 枚（`.cl-compact` のまま所見は 10 行で「…」・案内 1 行） | `n === 1`・PDF の本文に案内（E39） |
| 押印欄 4 件（押印行・押印の節が 2 段）＋重いメモ | A4 1 枚（上限 890px） | アプリの印刷・保存 HTML とも `n === 1`（E39） |
| 台本の確認点を 65 件追加（保存 HTML） | A4 1 枚（`.cl-compact-2`＋縮小。縮小後の高さを測り直す） | `n === 1`・印刷用の高さ ≤ 950px（E39） |
| 申し送りシート（E23） | 1 枚のまま（`#clSheet` が混ざらない） | 既存どおり `=== 1` |
| 全体印刷（E24） | アプリ Step4 ≤ 5、レポートは ≤ 6（「詳細」の面接チェックリスト節は台本の全文のまま） | `<= 5` / `<= 6` |

- 質問の回答は 2 行・確認点のメモは 1 行・記入欄の値は 2 行で打ち切るので、各メモ 300 字でも本文は上限に届かない（約 820px）。本文が上限を超えるのは際限なく長くなる面接所見（と Step① のメモ）が長いときで、そのとき `.cl-compact` が付く。
- 確認方法は E23 と同じ（`page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true })` → `pdfinfo`。pdfinfo が無ければ省略して PASS）。E34・E39 は `pdftotext` で本文に 結果・氏名・最終合否・笹川晴央 があり、質問文・説明文が無いことも確かめる。
- 実測（2026-10-14・1440px）: 標準のサンプルの紙 552px（E34・メモ 1 件）〜717px（全ブロックにメモ）、押印行込みの印刷用 754〜777px、保存 HTML の押印の節 78px（間 8px。押印欄 4 件で 134px）、アプリの押印行 50px。重いサンプル（E39。全メモ 300 字・面接所見 1,500 字）は `.cl-compact` で 825px（面接所見 10 行 121px・質問の回答 2 行）。面接所見 4,000 字は `.cl-compact` で 637px。確認点 +65 件は `.cl-compact-2`＋縮小 0.478 倍で 945px。PDF はすべて 1 ページ（pdfinfo）

### 4-6. 旧版（台本の 2 枚＝2 ページ。2026-10-13 まで）
- 'sheet' は 'section' と同じ台本の全文（ページ見出し `.cl-page`・セクション `.cl-s`・質問文 `.cl-qs`・説明のチェック・記入欄・確認点の補足・`.cl-overall`）にヘッダーのチップ（`.cl-hchip`）・判定サマリー（4 タイル）・押印を足したもので、1 枚目 ①②、2 枚目 ③④⑤＋判定＋押印の A4 2 ページ（`.cl-page + .cl-page { break-before: page }`）。1 枚目があふれる、または 2 枚目だけがあふれるが全体なら 2 枚に収まるときは `.cl-fit` で強制改ページを外した（D17）。詳細モードの記録は ① の直後に「面接で確認した勤務条件」（`.cl-confirmed`）。
- 廃止の理由: 副支配人「出力される報告書が煩雑すぎて頭に入ってこない」。読み手（副支配人）には台本の文言・空欄が多すぎ、結果が 2 ページ目の下にあった。

---

## 5. 設定画面（settings.js）

### 5-1. 構成
- ナビ「面接評価」→「面接チェックリスト」（`<a href="#s-checklist">`）。`evalHtml()` を `checklistHtml()` に置き換える。節の説明:「面接台本のチェックリストです。必須条件（一致／不一致）と確認点（○△×）・総合判断で面接評価を計算します。文言・項目の増減・確認点の有無を編集できます。高・中の境界（%）は「2軸判定」で設定します。」
- 節の見出し下に「確認点 {n} 項目＋総合判断 ＝ 満点 {2(n+1)} 点」。2 軸判定の節の「現在の満点 …点では …点以上」は `R.interviewModel(draft, {}, R.emptyChecklist()).max` を使う（既定 16 点で 12 点以上・7 点以上）。
- 上から:
  1. **判定**: `sSelect('checklist.mustFailResult', '必須条件に不一致があるとき', [reject: 不採用推奨, review: 上長最終判断要])`、`sSelect('checklist.mustUnknownResult', '必須条件に未確認が残るとき', [none: 警告のみ（判定は変えない）, review: 採用推奨に留めない（上長最終判断要まで）])`、`sSelect('checklist.overallCaps.hold', '総合判断「保留」のとき', [none: 調整しない, review: 上長最終判断要まで, reject: 不採用推奨])`、`sSelect('checklist.overallCaps.reject', '総合判断「不採用」のとき', [同])`、`sSelect('checklist.mustFailJumpTo', '不一致のとき案内するセクション', ['': 案内しない, ＋各セクション「⑤ 逆質問」])`。既存の `evaluation.holdOnUnresolvedBlock`・`evaluation.holdOnHighschoolException` のチェックをここへ移す（文言は既存のまま）。
  2. **総合判断**: `checklist.overallLabel` / `checklist.overallHint` / `checklist.overallOptions.hire|hold|reject`（hint「点は 採用 2・保留 1・不採用 0 で固定です」）。
  3. **ヘッダー**: 消極属性の行（`checklist.header.negatives[i].label` ＋ `.auto` の select〔なし／短期希望（勤務期間・短期／長期の希望が短期）／朝～12時のみ（勤務の終了がすべて {morningOnlyEnd} まで）〕＋ 削除、「＋ 消極属性を追加」）、`checklist.header.morningOnlyEnd`（time）、`checklist.header.interviewerField`（select: management.fields ＋「連動しない」''）、`checklist.header.posting.label` / `.options[m].label`。
  4. **印刷**: `sCheck('checklist.print.showQuestions', '保存レポートの「詳細」に質問文も載せる', 'A4 の面接チェックリスト報告（1 枚）には質問文・説明文を載せません（質問の回答は短い名前で載せます）。OFF にすると「詳細」の面接チェックリスト節もメモだけになります。')`（2026-10-14 改訂。A4 報告は設定に関係なく質問文を載せない）。
  5. **台本**: `checklist.title` / `checklist.version` / `checklist.intro`（textarea）、`checklist.pages[n].title` / `.lead`（textarea）。続いてセクションごとに `<details class="s-details s-cl-sec">`（① は開く）:
     - 行: 番号（自動）｜`sections[i].title`｜`sections[i].minutes`（number 0〜60、suffix 分）｜`sections[i].minutesMax`（「最大」）｜`sections[i].page`（select 1..pages 数、repaint）｜↑ ↓ 削除
     - `sections[i].lead`
     - ブロックごとに `.s-cl-block`: 種別バッジ（必須条件／記入欄／説明／質問／確認点（○△×）／合否連絡／注記。種別は変更不可）｜`blocks[j].title`｜`blocks[j].note`｜（question・explain）`blocks[j].memo`（checkbox, repaint）＋`memoLabel`｜↑ ↓ 削除
     - 項目行 `.s-cl-item`: `items[k].label`（質問は textarea rows=2）＋ 種別ごとの欄 — rating: `.hint`／explain: `.shortOnly`（checkbox「※短期求人のみ」）／must: `.auto`（select〔なし／週3日・5時間・土日（weeklyCondition）／繁忙期すべて可（busyAll）〕, repaint）、auto が weeklyCondition なら `.autoParams.minDays`・`.autoParams.minHours`（number）、busyAll なら繁忙期（`options.vacationItems`）のチェック群（`data-action="cl-period"`。押すと `autoParams.periods` に出し入れ）／fields: `.kind`（select text/date/month/choice, repaint）・`.auto`（select, kind に合うもの）・choice なら `.options`（textarea `data-type="options"`、1 行 `value|label`）・firstEnd なら `.autoParams.monthsAfter`（number 0〜12）｜↑ ↓ 削除
     - 各ブロックの下「＋ 項目を追加」、セクションの下に種別 select（`data-cl-newtype`）＋「＋ ブロックを追加」、最後に「＋ セクションを追加」
     - 「既定の台本（2026-10-08 版）に戻す」
  6. **旧形式の面接評価**: 閉じた `<details>`「旧形式の面接評価（10項目×5点）— 2026-10 以前の保存データの表示・再判定にだけ使います」に `evaluation.items` のラベル一覧と `scaleMax`・総合判断の扱いを**読み取り専用**で表示。旧 `item-add/del/up/down` の UI と処理は削除。

### 5-2. data-bind パス（すべて `U.setPath` で書ける）

```
checklist.title / checklist.version / checklist.intro
checklist.pages[n].title / checklist.pages[n].lead
checklist.mustFailResult / checklist.mustUnknownResult / checklist.mustFailJumpTo                (select)
checklist.overallCaps.hold / checklist.overallCaps.reject                                        (select)
checklist.overallLabel / checklist.overallHint / checklist.overallOptions.hire|hold|reject
checklist.header.negatives[i].label / .auto ; checklist.header.morningOnlyEnd ; checklist.header.interviewerField
checklist.header.posting.label / checklist.header.posting.options[m].label
checklist.print.showQuestions                                                                    (checkbox)
checklist.sections[i].title / minutes / minutesMax / page (repaint) / lead
checklist.sections[i].blocks[j].title / note / memo (repaint) / memoLabel
checklist.sections[i].blocks[j].items[k].label / hint / shortOnly / auto (repaint) / kind (repaint)
checklist.sections[i].blocks[j].items[k].options (data-type="options")
checklist.sections[i].blocks[j].items[k].autoParams.minDays / minHours / monthsAfter              (number)
evaluation.holdOnUnresolvedBlock / evaluation.holdOnHighschoolException
```

- `coerce()` に `data-type="options"` を追加: 行ごとに `value|label`（全角 `｜` も可）→ `[{ value, label }]`（空行除外、label 省略時は value）。

### 5-3. クリック操作（`onClick` に追加。構造の変更はすべて `paint(y)`。文言は data-bind のみで再描画しない）

| action | data 属性 | 処理 |
| --- | --- | --- |
| `cl-sec-add` | — | `{ id: U.uid('sec'), title: '新しいセクション', minutes: 0, minutesMax: false, page: 最後のページ, lead: '', blocks: [{ id: U.uid('blk'), type: 'rating', title: '確認点', note: '', memo: false, memoLabel: '', items: [{ id: U.uid('cl'), label: '新しい確認点' }] }] }` を末尾に |
| `cl-sec-del` / `-up` / `-down` | `data-sec` | 削除は confirm。最低 1 件（削除ボタン disabled）。削除したセクションが `mustFailJumpTo` なら '' に |
| `cl-block-add` | `data-sec`（種別は同じ行の `select[data-cl-newtype]`） | 種別ごとの空ブロック（項目 1 件付き。note は項目 0） |
| `cl-block-del` / `-up` / `-down` | `data-sec data-block` | 削除は confirm |
| `cl-item-add` | `data-sec data-block` | `{ id: U.uid('cl'), label: '新しい項目' }`（fields は `{ kind: 'text', label: '新しい欄' }`、rating は `label: '新しい確認点'`） |
| `cl-item-del` / `-up` / `-down` | `data-sec data-block data-index` | 削除は confirm |
| `cl-period` | `data-sec data-block data-index data-period` | `autoParams.periods` に出し入れ |
| `cl-neg-add` / `cl-neg-del` | `data-index` | 消極属性の追加（`{ id: U.uid('neg'), label: '新しい消極属性', auto: '' }`）・削除 |
| `cl-default` | — | confirm 後 `draft.checklist = U.deepClone(RECRUIT_DEFAULT_PROFILE.checklist)` |

- 削除の confirm 文:「この{項目／ブロック／セクション}を削除します。保存済みの応募者データのこの回答は表示・判定に使われなくなります（データは残ります）。よろしいですか？」
- 既定に戻す confirm 文:「面接チェックリストを既定の台本（2026-10-08 版）に戻します。編集した文言・項目は失われます。保存済みの応募者ファイルのレポートは保存時点の台本で表示されます。よろしいですか？」

### 5-4. 検証（`validateProfile` に追加）

errors:
- セクションが 0 件／セクション名が空／`minutes` が 0〜60 の整数でない／`page` が 1 以上の整数でない
- ブロック種別が不正／must・explain・question・rating・notify の項目の label が空（例「面接チェックリスト ① 勤務条件【必須条件】の 3 行目が空です。」）／fields の label が空／id の重複・形式不正
- choice の選択肢が 2 件未満・value の重複
- 総合判断の表示名（overallLabel・overallOptions）が空
- `mustFailResult`・`mustUnknownResult`・`overallCaps.*` が範囲外、`autoParams` の範囲外（minDays 1〜7、minHours 1〜12、monthsAfter 0〜12）、`morningOnlyEnd` が HH:MM でない

warnings:
- 確認点（rating 項目）が 0 件「確認点がありません。面接評価は総合判断だけで決まります。」
- 必須条件（must 項目）が 0 件「必須条件がないため、不一致による不採用推奨は働きません。」
- `interviewerField` が `management.fields` に無い「担当と連動する押印欄が見つかりません。」

---

## 6. 互換と移行

### 6-1. `storage.normalizeProfile` に `fillChecklist(merged, base, raw, report)` を追加（`fillStages` の後・毎回・冪等）

1. `raw.checklist` がオブジェクトでない、`sections` が配列でない、またはオブジェクトのセクションが 0 件 → `merged.checklist = deepClone(base.checklist)`。`raw.checklist` が無かったとき `report.checklistAdded = true`（新宿・他劇場とも。toast を出すかは 6-3）。
2. それ以外 → `merged.checklist = normalizeChecklistDef(merged.checklist, base.checklist)`（`deepMerge` は配列を丸ごと置き換えるので、保存済みの sections・pages・negatives はそのまま残る）。

`normalizeChecklistDef(def, baseDef)`（export。決定的・冪等）:
- 文字列キー（title / version / intro / overallLabel / overallHint / overallOptions.*）: 文字列でなければ既定。
- `pages`: 配列でなければ既定。各 `{ no: 1 以上の整数, title, lead }`（no 不正は i+1）。
- `mustFailResult ∈ {reject, review}`、`mustUnknownResult ∈ {none, review}`、`overallCaps.hold / reject ∈ {none, review, reject}`、不正は既定。`print.showQuestions` は boolean（不正は既定）。
- `header`: `negatives` は配列でなければ既定。各 `{ id, label, auto }`（id 不正・欠落は `neg{n}`、auto が `CHECKLIST_AUTO.negatives` に無ければ ''）。`morningOnlyEnd` は HH:MM でなければ既定。`posting` は既定で補う（options が不正なら既定）。`interviewerField` は文字列（不正は既定）。
- `sections`: 非オブジェクトを除く。`id` が形式不正なら `sec{i+1}`。`minutes` は 0〜60 の整数（不正は 0）、`minutesMax` は boolean、`page` は 1 以上の整数（不正は 1）、`title`・`lead` は文字列化。
- `blocks`: 非オブジェクト・`type` が `CHECKLIST_BLOCK_TYPES` 外は除く。`id` 不正は `{secId}_b{j+1}`。`items` は配列でなければ `[]`、非オブジェクトを除く。`memo` は boolean（欠落は type === 'question'）、`title`・`note`・`memoLabel` は文字列化。
- `items`: `id` 不正・欠落は `{blockId}_{k+1}`。`label`・`hint` は文字列化（旧案の `text` キーがあり `label` が無ければ `text` を `label` に移す）。fields: `kind` が `CHECKLIST_FIELD_KINDS` 外なら 'text'、choice で options が 2 件未満・不正なら kind を 'text' に、options は `{ value, label }` に整形。`auto` が型ごとの `CHECKLIST_AUTO` に無ければ削除。`autoParams` は数値・配列を検査し、不正値は既定の項目なら既定値、そうでなければ削除。`shortOnly` は boolean（explain 以外では削除）。
- id は**チェックリスト全体（セクション・ブロック・項目）で一意**にする。重複は 2 つ目以降に `_2`, `_3`…（決定的）。
- `mustFailJumpTo` が存在しないセクション id なら ''。
- 未知のキーはそのまま残す（他劇場の拡張で消さない）。
- 冪等: `normalize(normalize(x))` と `normalize(x)` が deepEqual（採番が決定的なので満たす）。編集済みの文言・追加した項目は保持。
- `evaluation` の既存処理（items が空なら既定 10 項目）はそのまま。`evaluation.items` を checklist から作り直すことはしない。`schemaVersion` は 2 のまま。

### 6-2. 旧レコード（`app.applyRecord`）

```js
state.checklist = U.deepMerge(R.emptyChecklist(), U.isObj(rec.checklist) ? rec.checklist : {});
state.scores = U.deepClone(rec.scores || {});
const target = sj ? 4 : (R.checklistHasInput(state.checklist) || Object.keys(state.scores).length) ? 3 : 2;
```

| 読み込むファイル | 判定 | Step3 | レポート（保存し直し） |
| --- | --- | --- | --- |
| v1（scores 10 項目・checklist なし） | 旧方式（scores × 旧 items、scale 5。E7 の再判定結果は変わらない）。旧形式バナーは既存 | `#legacyScores` ＋ 空のチェックリスト | 「面接評価（旧形式・10項目×5点）」 |
| v2・チェックリスト導入前 | 同上 | 同上 | 同上 |
| v2・チェックリストあり | チェックリスト方式 | 回答を復元（ボタンの active・メモ・ヘッダー） | 「面接チェックリスト」 |
| 旧 scores ＋ 後からチェックリスト入力 | チェックリスト方式（入力した時点で切り替え） | 両方表示（旧は参考） | 両方（旧は「参考」） |

- `record.checklistDef` と現在の `profile.checklist` の確認点が違うとき、読込 toast に「保存時と面接チェックリストの確認点が異なります（追加 n・削除 m）。現在の台本で再判定します。」（`R.checklistDiff`。ほかの toast と重なるときは文末に追記）。
- `checklist` キーが無い・不正型でも落ちない（`isObj` で空に）。
- レポートは保存時に作るため、旧レコードを開き直さずにレポートだけ作り直す経路は無い。

### 6-3. 起動時・JSON 読込時の案内
- `report.checklistAdded` かつ `meta.theaterName !== 'TOHOシネマズ新宿'` のとき toast「面接チェックリスト（新宿の台本 2026-10-08 版）を既定で追加しました。設定画面の『面接チェックリスト』で劇場の台本に合わせてください。」（`MIGRATION_MSG` と重なるときは連結）。新宿の旧プロファイルでは黙って補う（保存して localStorage を更新する）。

---

## 7. テスト

### 7-1. 単体 `tests/rules.test.js`（既存 #01〜#53 は**変更なしで緑**。#54〜#66 を追加）

追加ヘルパー:

```js
// mark: 'good'|'fair'|'poor'（全確認点）、overall: 既定 'hire'（総合判断の上限を混ぜない）
function clAll(mark, overall, over, p) {
  const def = (p || P()).checklist, cl = R.emptyChecklist();
  R.checklistItems(def, 'must').forEach(function (x) { cl.values[x.item.id] = 'match'; });
  R.checklistItems(def, 'rating').forEach(function (x) { cl.values[x.item.id] = mark; });
  cl.overall = overall || 'hire';
  return merge(cl, over || {});
}
function judgeCL(a, cl, p, checksFn) {   // judge() と同じで evaluateHiring(a, {}, p, h, checks, Object.assign({}, OPTS, { checklist: cl }))
  p = p || P(); const h = HO(a, p); const checks = checksFn ? checksFn(h) : allChecks(h);
  return R.evaluateHiring(a, {}, p, h, checks, Object.assign({}, OPTS, { checklist: cl }));
}
```

| # | 内容 | 期待値 |
| --- | --- | --- |
| 54 | 既定の台本 | セクション id = conditions,continuity,job,teamwork,reverse／minutes 10,3,10,8,10・minutesMax は reverse だけ・page 1,1,2,2,2／must 2（must_weekly・must_busy）・fields 6・explain 14（② continuity_explain に ex_submit・ex_phone・ex_absence）・question 13・rating 7・notify 2・note 0／id（セクション・ブロック・項目）が全体で一意・形式 `/^[A-Za-z][\w-]{0,40}$/`／`interviewModel(P(), {}, R.emptyChecklist()).max === 16` |
| 55 | 得点率と帯 | `clAll('good')` → 16/16・100・high／○5△2＋採用 → 14・87.5・high／○4△3＋採用 → 13・81.3・high／○4△2×1 → 12・75・high／○3△3×1 → 11・68.8・mid／全△ → 9・56.3・mid／○1△3×3＋保留 → 6・37.5・low／`thresholds.recommendPts === 12`・`reviewPts === 7`／breakdown 8 行・最後の行が `isOverall`・`id === '__overall'`・`mark`・`sectionNo` が入る／確認点 1 件未入力 → total 2 減・warnings に「未入力の確認点が1件」 |
| 56 | interviewMode | opts.checklist なし → legacy（既存の呼び出し）／空の checklist＋旧 scores → legacy（v1 fixture の scores で total 39・max 50・pct 78・`scaleMax 5`・結果が従来と同じ）／checklist に 1 つでも入力 → checklist／checklist 空・scores 空 → checklist（`max 16`）／`checklistHasInput` は header だけでは false |
| 57 | 必須条件ゲート | `strongApplicant()`×`clAll('good')` で recommend → `must_weekly: 'mismatch'` で result reject・baseResult recommend・adjustments[0] `must_conditions`（from recommend）・body は `texts.mustGate`（「必須条件（…）が一致しないため、面接評価・シフト貢献度にかかわらず不採用推奨とします。」）・warnings[0] が理由・matrix.note 空／`mustFailResult='review'` → review（本文は「点数上は」）／貢献度 incomplete でも reject・専用の本文／打ち切り（①⑤ 以外未入力 → 0% で点数上も不採用推奨・low_high）でも adjustments に `{must_conditions, from: reject, to: reject}`・本文に 0% を出さない・note 空（cellNote は残る）・未入力の警告なし／マトリクスが既に不採用推奨（例B×`clAll('poor')`）でも must_conditions を記録／`texts.mustGate` の差し替え／legacy では must を見ない |
| 58 | 必須条件の未確認・食い違い | `must_busy: ''` だけ → 結果は変わらず warnings に「必須条件に未確認が1件」／`mustUnknownResult='review'` → review・`must_unconfirmed`／土日なしの応募者で `must_weekly: 'match'` → warnings に「応募情報と食い違いがあります」・結果は変えない |
| 59 | 総合判断の上限 | `clAll('good','hold')` → 15/16（93.8・high）でも review（`overall_hold`）／`clAll('good','reject')` → 14/16 でも reject（`overall_cutoff`）／`overallCaps={hold:'none',reject:'none'}` → recommend＋警告文／旧 `overallRejectAtOrBelow=2` はチェックリスト方式で無視 |
| 60 | マトリクス等価 | 25b の 9 マスを `clAll('good'|'fair'|'poor')`（high/mid/low）で再実行し、`scoresAll(5|3|1)` と同じ `cellKey`・`baseResult`・`result` |
| 61 | 強み・懸念 | チェックリスト方式: ○ → strengths（メモ付きは「ラベル（メモ）」）、× → concerns、△ はどちらでもない、総合判断は含めない／旧方式の strengths・concerns は従来どおり（4 点以上／2 点以下） |
| 62 | checklistAuto・firstContractEnd | weeklyCondition（土日なし → ok:false、週2〜4日 → ok:null、土日あり週3日最短5時間 → ok:true）／busyAll（GW× → ok:false・text に GW）／weekend（every_both → 'both'、workDays 土のみ → 'one'）／busyNg のラベル／term（workPeriod mid → 'long'）／`firstContractEnd('2026-11-01',1) === '2026-12'`・`('2026-12-15',1) === '2027-01'`・`(…,0)` 同月・`('',1) === ''`／taxi（2,500 → ok「規定3,000円以内」・3,800 → warn・train → 「否」・lateNight ng → 対象外・features.lateNight OFF → 「—」）／morningOnly（09:00–12:00 だけ → on、09:00–13:00 あり → off、シフトなし → off）／shortTerm（`values.term='short'` が workPeriod より優先） |
| 63 | checklistSummary | sections 5・ratings 7・must 2（未入力で unknown 2）・minutesTotal 41／`done`（① は must 全回答＋rating 全入力で true）／`effective`（記入欄の自動値）／`dim`（posting が 'short' 以外で shortOnly）／interviewer が空なら押印 interviewer の氏名・`interviewerFromStamp` |
| 64 | normalize（チェックリスト） | checklist なし（新宿 v2・v1 fixture 2 種）→ 既定の台本と deepEqual・`report.checklistAdded`／`sections: 'x'` → 既定／不正な block type を除去／item id の欠落 → `conditions_must_3` 形式・重複 → `_2`／choice の options 空 → kind 'text'／`mustFailResult:'xxx'` → 'reject'／`overallCaps.hold:'up'` → 'review'／未知の auto を削除／`mustFailJumpTo` 不在 → ''／編集した label・追加項目は保持／冪等／`evaluation.items` は 10 件のまま |
| 65 | validateProfile | 既定はエラーなし／label 空・id 重複・セクション 0・choice の選択肢 1 件・overallLabel 空・minutes 61 → errors／rating 0・must 0 → warnings |
| 66 | 保存・レポート | `buildRecord` に checklist・checklistDef（version '2026-10-08'）・scores {}／新形式 → `data-sec="checklist"` あり `data-sec="scores"` なし・「① 勤務条件」〜「⑤ 逆質問」・「×不一致」・メモ文・確認点の ○・`id="clSheet"`・`id="rtPrintChecklist"`／メモに `</script><!--x` を入れても `parseRecordFromHTML` で同じ値／旧形式（scores のみ）→ `data-sec="scores"`・チェックリスト節と `rtPrintChecklist` なし／`checklistDef` があれば profile 側の文言を変えてもレポートは保存時の文言／`print.showQuestions=false` で質問文が出ない／`mode: 'section'` に台本ヘッダー（`<dt>面接日</dt><dd>2026/10/10</dd>`・担当・タクシー可否・料金・消極属性・応募した求人）とページ題名・前書き（「台本1枚目」「必須条件一致・継続性」「人物確認・逆質問」）、判定サマリー・押印は無し／担当が空なら「笹川 晴央（押印より）」、タクシー手入力「（手入力）」、消極属性の手動 ON（朝～12時のみ）／確認点の hint（「大丈夫です」のみ連呼は特に要注意。）が section・sheet・レポート全体に出て、`print.showQuestions=false` の sheet では出ない |

- 2026-10-14（A4 報告を 1 ページの要約に）: #66 の A4（'sheet'）の確認を新レイアウトの同じ確認に置き換え（`.cl-s-ng` → `.cl-must-ng`、`.cl-hchip` → `dl.cl-sh-kv`、「採用可否判定は未実施（…の時点）」→ 結果タイル「未実施」、A4 の hint は**出ない**こと）。**#80**（1 ページの要約。`docs/SPEC-script-mode.md` 13-5）を追加

### 7-2. e2e `tests/e2e.js`

書き換えるヘルパー（`scoreAll` は削除）:

```js
// 既に同じ値なら押さない（再押下で解除されるため）
const setCl = async (path, v) => {
  const cur = await st(p => window.RecruitUtil.getPath(window.RecruitApp.state.checklist, p) || '', path);
  if (cur !== v) await page.click(`[data-action="cl-set"][data-cl="${path}"][data-value="${v}"]`);
};
// 必須条件すべて一致（o.must=false で触らない）・確認点すべて level・総合判断 o.overall（既定 hire）
const rateAll = async (level = 'good', o = {}) => {
  const ids = await st(() => { const d = window.RecruitApp.state.profile.checklist, R = window.RecruitRules;
    return { must: R.checklistItems(d, 'must').map(x => x.item.id), rate: R.checklistItems(d, 'rating').map(x => x.item.id) }; });
  if (o.must !== false) for (const id of ids.must) await setCl('values.' + id, 'match');
  for (const id of ids.rate) await setCl('values.' + id, level);
  await setCl('overall', o.overall || 'hire');
  await wait(100);
};
```

既存シナリオの置き換え:
- `scoreAll(5)`（E5・E2・E13・E14・E15/E18・E21 など）→ `rateAll('good')`（100%＝高で結果は従来と同じ）。
- E1: 最初の `judge()` の確認を「確認点未入力では判定に進まない（toast「未入力の確認点」・`.cl-rate-row.missing` 7 件・`#clOverall.missing`）」に。`scoreAll(4)`＋個別点 → `rateAll('good')` の後 `setCl('values.rt_manner','fair')`・`rt_turnover`・`rt_team` を fair（○4△3＋採用）。期待値「面接 39/50（78%）」→ `j.total === 13 && j.max === 16 && j.pct === 81.3`（帯は高のままでマトリクス結果は従来と同じ）、Step4 の `[data-axis="interview"]` に「13」。スクリーンショット `05-step3-scored.png` → `05-step3-checklist.png`。
- E12 読込: `loaded.scores === 10` → `loaded.ratings === 7 && loaded.overall === 'hire' && loaded.scores === 0`（`Object.keys(state.checklist.values)` の rating 数・`state.checklist.overall`・`Object.keys(state.scores).length`）。
- 設定（E1 末尾）: 「評価項目を追加できる（`.item-row` 11 件）」→「③ の説明に `cl-item-add` で `.s-cl-item` が 1 件増える」。
- E7（v1 ファイル）: 追加の確認 — Step3 に `#legacyScores`（「39 / 50」）、`judgment.interviewMode === 'legacy'`・`max === 50`、保存し直したレポートに `data-sec="scores"`・チェックリスト節と `#rtPrintChecklist` なし。
- E24: レポートの全体印刷の上限 `<= 6`（アプリ Step4 は `<= 5` のまま）。

追加シナリオ（日時は既存どおり 2026-10-10 固定。ヘッダー冒頭のシナリオ一覧にも追記）:

| ID | 内容 | 主な確認 |
| --- | --- | --- |
| E25 | Step3 チェックリスト入力 → 判定 → Step4 → 保存 → 読込 → レポート | E15 と同じ応募者（長期）で Step3 へ。DOM 順 `#clHeader → #clNav → #cl-conditions → #shiftConfirm → #cl-continuity → #cl-job → #cl-teamwork → #cl-reverse → #clOverall`（compareDocumentPosition）、`.cl-page-head` 2 個、見出しに「① 勤務条件」「10分」「最大10分」・「合計 41分」、質問文「歌舞伎町ですので」が表示／ヘッダー: 面接日 `2026-10-10` 自動・担当の datalist に「笹川 晴央」・`#shiftConfirm` で深夜帯○・帰宅手段タクシー・料金 2500 を入れると `#clTaxiAuto` に「可・2,500円」／`setCl('values.term','short')` で消極属性「短期希望」が該当（自動）→ 「該当しない」で外れる／必須 `must_weekly` 一致＋`must_busy` 未確認（`#cl-conditions .cl-must-row` は 2 行。② に【説明】ex_submit・ex_phone・ex_absence がある）、① の説明 2 件・② の説明 3 件☑、`start_date=2026-11-01` → `first_end` の hint「2026-12」、メモ入力、○4△3＋採用 → `#clScoreTotal` 13・`#clScorePct` 81.3%・`#clNavScore`「13/16」／判定 → toast「必須条件に未確認が 1 件」・step 4・`#judgeWarnings` に未確認の文言・`#clBreakdown` に必須条件 2 行（未確認 1）・確認点 7 行＋総合判断・合計「13/16」・右サマリー `#sumMust`「未確認 1」／Step3 で `must_busy` を一致 → 再判定 → `#sumMust`「すべて一致」・強みに ○ の確認点／保存: `rec.checklist.values.rt_team === 'fair'`・`rec.checklistDef.version === '2026-10-08'`・`Object.keys(rec.scores).length === 0`・レポートに `data-sec="checklist"`・「① 勤務条件」・メモ文・「面接評価（旧形式」なし・節（`section.sec[data-sec="checklist"]` の textContent。印刷専用の `#clSheet` を除く）に「面接日」「2026/10/10」「担当」「タクシー可否・料金」「可・2,500円」「消極属性」「応募した求人」「必須条件一致・継続性」「人物確認・逆質問」「「大丈夫です」のみ連呼は特に要注意。」／メモに `</script><!--` を含めた値が読込後も一致／読込: `state.checklist` が保存時と deepEqual・ボタンの active・`start_date` が復元・再判定の結果が保存時と一致。スクリーンショット `28-step3-checklist.png`・`30-step4-checklist.png` |
| E26 | 必須条件ゲート | E25 の応募者で `must_busy` を不一致 → `#clMustAlert`（「⑤ 逆質問へ進み…終了」）・`#clState-conditions` に「不一致あり」・②〜④ に `.cl-skippable`・「⑤ 逆質問へ」で `#cl-reverse` へスクロール／判定 → `result === 'reject'`・`adjustments[0] === 'must_conditions'`・本文は必須条件を理由にし「点数上は」を含まない・`.adjust-box`「→ 最終: 不採用推奨」・右サマリー「不一致 1」・結果カードの `.result-must`／設定 `mustFailResult=review` → 案内は「確認点も評価…上長最終判断要以下」（省略可・⑤ へ ボタンなし）→ 確認点未入力では止まる → 入力して再判定 review → 設定を戻す／新規応募者（貢献度未確定のまま）で必須 1 件不一致＋確認点空＋総合判断空 → 判定に進める・結果 不採用推奨・adjustments[0] と warnings[0] が必須条件・本文に 0% を出さない・調整欄「不採用推奨（固定）」・A4 の `.cl-adj` に理由。スクリーンショット `29-step3-must-ng.png` |
| E27 | A4「面接チェックリスト報告」（**2026-10-14〜: `.cl-page` 0 個・確認点 7 行・PDF `n === 1`・本文が上限を超えるサンプルは `.cl-compact`・質問文は設定に関係なく出さない**。以下は旧版の記述） | Step3・Step4 に `[data-action="print-checklist"]`、画面では `#clSheet` 非表示／`RecruitApp.prepareChecklistSheet(true)` → print メディアで `.app` が none・`#clSheet .cl-sheet` が block・`.cl-page` 2 個・`.cl-judge` に結果・押印 3 枠／PDF `1 ≤ n ≤ 2`（E25 の応募者・重いサンプルとも）／`prepareChecklistSheet(false)` で戻る（`body.print-checklist` なし・`#clSheet` 空）／レポート: `#rtPrintChecklist` → `__prepareChecklistSheet(true)` で print 時に見えるのは `#clSheet` と `section[data-sec="mgmt"]` だけ・`.rtool/.dash` none・レポート上で押した印が出る・PDF `1 ≤ n ≤ 2`（重いサンプルも）／`__prepareHandoffSheet(true)` では `#clSheet` が出ない（E23 の表示節リストが従来どおり）／`print.showQuestions` OFF で `.cl-qs` が出ない |
| E28 | 設定で台本を変更 | `[data-bind="checklist.sections[0].blocks[0].items[1].label"]` を「指定繁忙期間すべて出勤可（年末年始・GW・お盆）」に変更・保存 → Step3 の must 行と判定の理由文に新しい文言／③ の説明に「＋ 項目を追加」→ Step3 に新しい行／① の `rt_manner` を削除 → 満点 14（右サマリー「/ 14点」、2 軸判定の節「現在の満点 14点」）／④ に確認点を追加 → 満点 16／E25 で保存したファイルを読み込むと読込 toast に「確認点が異なります（追加 1・削除 1）」・元ファイルのレポートは旧文言のまま／空 label で保存 → 検証エラーで保存されない／「既定の台本に戻す」で満点 16／localStorage に壊れた checklist（`sections: 'x'`・`mustFailResult: 'xxx'`）を入れて再読込 → 既定の台本・'reject' で表示・エラーなし。スクリーンショット `31-settings-checklist.png` |
| E29 | 旧データ・他劇場・狭い画面 | v1 fixture: `#legacyScores` に「39 / 50」・`j.interviewMode === 'legacy'`・`j.total === 39`／確認点を 1 つ入れると `interviewMode === 'checklist'`・`#legacyScores` の文言が「切り替わりました」・`#clPrintBtn` が出る（旧形式のあいだは Step3 でも非表示）／E19 の手法で checklist を取り除いた旧 v2 レコードも落ちずに読める／他劇場の旧プロファイル（v1-profile-other.json）を読むと toast「面接チェックリスト（新宿の台本…）を既定で追加」・Step3 に既定の台本／390px 幅の Step3 で横スクロールなし（`scrollWidth <= clientWidth`）／ダークモードのスクリーンショット `32-step3-checklist-dark.png` |

### 7-3. 完了条件
`cd recruit-system && node build.js && node tests/rules.test.js && node tests/e2e.js` がすべて exit 0。`dist/` を再生成。`ERRORS: none`。

### 7-4. ドキュメント
- README: 使い方の Step3（「面接チェックリスト」…必須条件・説明・質問メモ・確認点 ○△×・総合判断、必須条件不一致は不採用推奨）、判定モデルの「面接評価」（○△× と総合判断の得点率・3-1 の目安表・必須条件ゲート・総合判断の上限）、印刷（面接チェックリスト報告 A4 1〜2 枚）、テストのシナリオ一覧に E25〜E29。
- HANDOFF: 新しい章「10. 面接チェックリスト — 追加分」（現状・決定事項 D1〜D20 の要約・触る場所: `config.default.js checklist` / `rules.js interviewModel・checklistAuto・checklistSummary・evaluateHiring (0a)(0b)(2)` / `app.js interviewStepHtml・updateChecklistUI・validateChecklist・prepareChecklistSheet` / `storage.js checklistSheetHtml・checklistSheetCss・normalizeChecklistDef・fillChecklist` / `settings.js checklistHtml`）、早見表に「台本の文言・項目を変える」「必須条件の扱いを変える」「A4 報告の見た目を変える」を追加、ユーザー決定事項の表に「G. 面接チェックリスト」を追加、4-1 に 8-3 の確認事項、1-4 のテスト件数を更新。
- `docs/SPEC-checklist.md`（本書）。

### 7-5. 推奨の実装順
1. `config.default.js`（checklist 既定値・evaluation のコメント）
2. `rules.js`（定数・`interviewModel`・`mustSummary`・`firstContractEnd`・`checklistAuto`・`checklistSummary`・`checklistDiff`・`analyzeShifts.minEntryMinutes`・evaluateHiring の差し替えと調整）→ 単体 #54〜#63
3. `storage.js`（`fillChecklist`・`normalizeChecklistDef`・`validateProfile`・`buildRecord`・`checklistSheetHtml/Css`・レポート節・ツールバー・`__prepareChecklistSheet`）→ #64〜#66
4. `app.js`・`index.html`・`styles.css`（state・`evaluateNow`・Step3 UI・イベント・`validateChecklist`・Step4・右サマリー・印刷・applyRecord・Step2 の文言・ヘルプ）→ e2e の `rateAll` 置き換えで既存 E1〜E24 を緑に
5. `settings.js`（`checklistHtml`・操作・coerce・検証の表示）→ E25〜E29
6. ドキュメント

---

## 8. 決定事項と理由・リスク

### 8-1. 統合時に決めたこと（未決は既定値を決め、設定で変更可能にした）

| # | 決定 | 理由 |
| --- | --- | --- |
| D1 | Step3 の 10 項目×5 点を廃止し、台本の確認事項／確認点の ○△× と総合判断で面接評価を出す。旧 `evaluation.items` は削除せず、旧レコードの表示・再判定専用（設定では読み取り専用） | ユーザー決定 1。旧ファイルの再判定が 0% → 不採用推奨になる事故を防ぎ、E7 の結果を変えない |
| D2 | 台本は `profile.checklist` にデータとして持ち、ブロック 7 種。判定に効くのは must・rating・総合判断だけ | 他劇場が台本を差し替えられる。記録用の欄を増やしても判定ロジックは変わらない |
| D3 | 得点は ○2・△1・×0、総合判断 採用2・保留1・不採用0、重み均等、帯は既存の 70/40% | ユーザー決定（2/1/0）。得点率なので確認点の数が変わっても境界を直さなくてよい（既存の設計方針）。2 軸マトリクス・設定画面の境界をそのまま使える |
| D4 | evaluateHiring は評価項目の出どころだけを `interviewModel` で差し替える。方式は「opts.checklist に入力がある、または旧採点が無い → チェックリスト」で自動判定 | 二重管理と同期漏れを避ける（`evaluation.items` を checklist から生成する案は採らない）。既存の単体テスト 53 件が無修正で緑のまま。旧レコードはチェックリストに入力した時点で切り替わる |
| D5 | 確認点は 7 項目。台本の【確認事項】「報連相できるか／離職要因はないか」を 2 行に分け、台本 1 枚目冒頭の「最低限の話し方、敬語が可能か」を ① に追加 | 1 行に 2 つの観点があると ○△× の意味が曖昧になる。冒頭文は台本の確認目的に明記されており、評価に入れないと台本との差が出る。不要なら設定で削除できる |
| D6 | 必須条件の不一致は調整 (0a) として先頭で適用し、既定は不採用推奨（設定で上長最終判断要）。reject 設定では結果が変わらなくても adjustments に積み、理由を warnings の先頭・専用の本文（`texts.mustGate`）にする | ユーザー決定 2・台本「必須条件が不一致なら不採用」。結論の理由が 1 行目に出る |
| D7 | 不一致かつ mustFailResult='reject' のときは確認点・総合判断・シフト条件（貢献度）の未入力で判定を止めず、未入力警告も出さない。'review' のときは確認点・総合判断を必須のまま | 台本「解消しなければ 5 へ」（②〜④ を省略して打ち切る流れ）。review のときは点数で結果が変わり得る |
| D8 | 必須条件の「未確認」は判定を止めず警告のみ（`mustUnknownResult` 既定 'none'）。設定 'review' で「採用推奨に留めない」 | 要件は「警告（止めない）」。既存原則（要判断・シフト条件が未確認なら採用推奨に留めない）に寄せたい劇場は設定で選べる |
| D9 | 総合判断は点に入れたうえで、保留 → 上長最終判断要まで・不採用 → 不採用推奨までを上限にする（`overallCaps`、各 'none' で無効化可）。旧 `overallRejectAtOrBelow` はチェックリスト方式では使わない | 確認点が ○ ばかりでも面接者が保留・不採用と判断したのに「採用推奨」が出るのは不自然（判定への信頼）。旧値は 5 点尺度で、2 点尺度では誤爆する |
| D10 | 回答は項目 id をキーにしたフラット map（`values` / `notes`）＋ `overall` ＋ `header`。保存時に `checklistDef` を一緒に保存。`schemaVersion` は 2 のまま | 設定で文言を変えても回答が残り、保存済みレポートは面接当時の文言で読める（監査性）。data-cl のパスが単純。v1 判定ロジックに触れない |
| D11 | 構造化欄（短期/長期・土日・出勤不可な繁忙・初回契約終了・OPEN/25時）とタクシー・消極属性は応募情報から**自動表示**し、保存するのは手で入れた値だけ。応募情報へ同期しない | 判定（貢献度）の入力元を applicant 1 つに保つ（applicant のフィールド名・意味を変えない約束）。二重入力は減らす。食い違いは hint・warnings で知らせる |
| D12 | 必須条件の「応募情報からの見込み」は表示のみで、一致／不一致を自動で入れない。一致としたのに見込みが「満たさない」なら warnings に出す（結果は変えない） | 台本の目的は本人に口頭で確認したことの記録。自動入力は確認漏れの原因になる |
| D13 | 質問は「質問文の表示＋ブロックのメモ」だけ（質問ごとの「質問した」チェックは付けない） | 面接中のクリックを減らす。台本の質問に □ は無い |
| D14 | 「※短期求人のみ」の説明は、ヘッダーの「応募した求人」が短期求人のとき強調、それ以外は薄く表示（チェックは常に可能） | 台本の条件は「短期求人に応募した場合」で、本人の短期希望（消極属性）とは別 |
| D15 | ③④⑤ の質問ブロックに「回答」欄（台本の「回答：」）。⑤ は台本どおり質問 1 件＋「※業務の大変な面も率直に伝える。」 | 台本 PPTX の各列にある「回答：」をそのまま入力欄にする（2026-10-13 修正: 当初「⑤ のメモ欄は台本に無い」としたのは抽出テキストの誤読） |
| D16 | 担当は名簿の datalist から選ぶ自由入力。押印「面接対応者」とは初期値・表示を相互に補うだけで、自動押印はしない | 押印は本人の操作で行う（既存の押印の考え方を崩さない）。名簿にない担当者も書ける |
| D17 | （**2026-10-14 に A4 1 枚の要約へ変更＝4-2・4-6**）A4 報告は台本の 2 枚＝印刷 2 ページ（1 枚目 ①②、2 枚目 ③④⑤＋判定＋押印）。1 枚目があふれるとき、または 2 枚目だけがあふれるが全体なら 2 枚に収まるときは強制改ページを外す。質問文は既定で載せる（設定で外せる） | 報告書が台本の見た目に近く、紙の台本と対応づけやすい。3 ページになるのを防ぐ |
| D18 | 報告の HTML/CSS は storage.js の 1 関数で作り、アプリとレポートで共用（アプリは CSS を起動時に注入）。アプリは専用ホスト `#clSheet` に描画 | 入力 UI（ボタン・textarea）をそのまま印刷すると崩れる。2 か所の見た目のずれと二重保守を防ぐ。申し送りシートと同じ body クラス方式で既存の印刷と干渉しない |
| D19 | Step3 の名称を「面接チェックリスト」、軸の名前は「面接評価」のまま。Step2 は文言 2 か所だけ合わせる | 画面と紙の台本を対応づけやすくしつつ、マトリクス・`texts.matrix` を変えずに済む |
| D20 | 旧プロファイル（新宿・他劇場）には既定の台本を補い、他劇場には toast で設定の見直しを促す | 要件 1。normalize で補えるため版上げ不要。新宿固有の文言（歌舞伎町・交通費 500 円）が他劇場に入るのは案内で補う |

### 8-2. リスクと対策

| # | リスク | 対策 |
| --- | --- | --- |
| R1 | 確認点 7＋総合 1 では 1 項目の重みが大きい（△ 1 つで −6.25%）。11/16=68.8% が「中」になる境界が台本の感覚に合わない可能性 | 3-1 の目安表を README に載せる。試行後に `evaluation.thresholds` を調整。項目ごとの重みは HANDOFF 4-2 の既存 TODO に統合 |
| R2 | 設定で確認点を増減すると、保存済みレコードの再判定で得点率が変わる（追加分は未入力＝0 点） | レポートはスナップショットで不変。読込 toast で差分を知らせる。台本の改訂時は version を上げる運用 |
| R3 | 項目を削除するとその回答は判定・表示に使われない | データは残す（D10）。削除時の confirm で明示 |
| R4 | 旧レコードでチェックリストに 1 つでも入力すると評価方式が切り替わり、点数の意味が変わる | `#legacyScores` の文言で切り替えを明示し、旧点数はレポートに参考として残す |
| R5 | 自動の見込み（必須条件・タクシー・消極属性）を確認済みと誤解する | 「応募情報: … → 見込み」と表記し、必須条件の未回答は「未確認」バッジのまま。消極属性は手動で上書き可 |
| R6 | メモが長いと A4 2 枚を超える（2026-10-14〜: 1 枚の要約は `.cl-compact` → `.cl-compact-2` → 縮小で必ず 1 枚＝4-4） | fit 計測で強制改ページを外す。e2e で重いサンプル ≤ 2 枚を固定。それでも超える極端なケースは 3 枚目に流れる（申し送りシートと同じ運用）。質問文は設定で外せる |
| R7 | レポートの全体印刷が 1 ページ増える（E24 の上限 5 → 6） | 章が増えたことによる正当な増加。印刷用 CSS で詰める |
| R8 | 総合判断「不採用」→ 不採用推奨は面接者 1 人の判断が強く効く | 本文は調整後の文（点数上は○○ですが…）で理由を明示。設定で review / none に変更可 |
| R9 | `type=date` / `type=month` の表示はブラウザのロケール依存 | 保存は ISO（YYYY-MM-DD / YYYY-MM）。レポート・A4 は「2026/11/01」「2026年12月」で表示 |
| R10 | 構造化欄の「短期希望」と応募情報の勤務期間（長期）が食い違う | hint で警告（D11）。消極属性の自動判定は面接での回答（`values.term`）を優先し、報告書は両方を出す |

### 8-3. 副支配人に確認したいこと（実装は既定値で進め、試行後に設定で調整）
1. 確認点の分け方（② を「報連相」「離職要因」に分割、「最低限の話し方・敬語」を ① に追加）でよいか
2. 総合判断の重み（今は確認点 1 行と同じ 2 点）。もっと重くするか
3. 総合判断「保留」→ 上長最終判断要、「不採用」→ 不採用推奨 の上限でよいか（`overallCaps`）
4. 必須条件が「未確認」のまま判定したとき、警告だけ（既定）でよいか、採用推奨に留めないか（`mustUnknownResult`）
5. 得点率の境界（高 70%・中 40%）が台本の感覚に合うか（16 点満点で 12 点以上が「高」、7 点以上が「中」）
6. 必須条件「土日を含む週3日以上、5時間以上」の見込みの判定（週の最低日数・1 回の拘束 5 時間）でよいか。「クリスマス」を年末年始に含めてよいか
7. 「OPEN／25時までの可否」を自由記述でよいか（選択式にするか）
8. A4 報告に質問文を載せるか（既定は載せる）、押印欄 3 つをそのまま載せてよいか
9. 紙の台本の代わりに、Step2 から「空欄のチェックリスト（A4 2 枚）」も印刷できると便利か（今回は対象外）
10. **（重要）必須条件の範囲**: 台本 PPTX の配置では「シフト提出は木曜23時、確定は水曜」「シフト関連の連絡：原則電話のみ」「欠勤・遅刻は分かった時点で連絡」は ② の【説明】で、① の【必須条件】は 2 件。既定はこの配置に合わせた（不一致で不採用推奨に固定するのは 2 件だけ）。この 3 件も不採用ゲートにしたい場合は、設定 → 面接チェックリスト → ① 勤務条件【必須条件】に行を追加すれば同じ動きになる

---

## 9. 実装時の補足（2026-10-13。本書との差・決めたこと）

- **A4 報告の寸法**: `.cl-mode-sheet`（'sheet'）の文字サイズ・余白は印刷メディアに限らず常に適用する（画面外の 190mm 幅で 1 ページ目の高さを計測し、印刷と一致させるため）。'section'（レポートの章）は画面向けの大きさで、全体印刷では本文の印刷規則に従う。色はライト固定（アプリのダークテーマでも白地で印刷）。
- **ホストの規則**: 4-4 の `.cl-sheet-host`（アプリ）と `.cl-sheet-print`（レポート）の表示・画面外配置・`@page clsheet`・`body.print-checklist` の印刷規則は `checklistSheetCss()` にまとめた（アプリの styles.css にも同じホスト規則が残っているが、内容は同じ）。レポートの押印の節は印刷時に見出しの番号を消し、押印欄を 46px に詰める（申し送りシートと同じ寸法）。
- **改ページ解除のしきい値**: 1040px（`CL_SHEET_PAGE_PX`）。アプリ `fitChecklistSheet` とレポートのインラインスクリプトで同じ値を使う。
- **見出しの HTML**: セクション見出しは `<span class="cl-s-no">①</span><span class="cl-s-title">勤務条件</span>`（テキストは「①勤務条件」）。レポートの文字列検査はこの形で行う（単体 #66・e2e E25）。
- **判定前・stale**: `checklistSheetHtml` は `record.judgment` が無ければ「採用可否判定は未実施（面接評価 {total}/{max}・{pct}% の時点）」と書く（判定を走らせない）。
- **レポートの章**: 4-3 の表どおり。旧形式の節のラベルは現在の `evaluation.items`、無ければ判定の内訳（旧方式のとき）、それも無ければ id。チェックリスト方式の判定がある「参考」表示では旧点数の合計を点数から計算する（判定の値はチェックリストの点のため）。ダッシュボードの面接評価タイルは `interviewModel`（保存時点の台本）で、旧方式では見出しに「（旧形式）」。
- **ツールバー**: `#rtPrintChecklist` はチェックリストに入力があるときだけ出す。インラインスクリプトは常に `__prepareChecklistSheet` を定義する（`#clSheet` が無ければ何もしない）。
- **E26 の最後の確認**（2026-10-13 修正）: 確認点が空（0 点）のまま不一致で打ち切ると点数上も不採用推奨になるが、結論の理由が「面接評価 0%」に見えないよう、ゲート時は `must_conditions` を必ず adjustments に積み（from = to）、専用の本文・warnings の先頭にする（3-3）。e2e は「adjustments[0] と warnings[0] が必須条件・本文に 0% なし・調整欄『不採用推奨（固定）』・A4 の `.cl-adj` に理由・未入力の確認点の警告なし」を確認する。
- **既存の不具合の修正**: 同じファイルを続けて読み込むと change が起きなかったため、`app.js` の `onFileChosen` / `onProfileFileChosen` で読み取り後に input の値を空にした。
- **2026-10-13 の修正（レビュー指摘）**:
  - 既定の台本を PPTX の実際の配置に合わせた（1-3）。必須条件は 2 件、② に【説明】3 件、③④⑤ の質問・回答欄を各列どおりに。項目 id は維持（`ex_submit` / `ex_phone` / `ex_absence` と `continuity_explain` / `job_q` / `teamwork_explain` は新規）。
  - 必須条件ゲートの本文・調整の記録（3-3）、review 設定の案内（3-5）。
  - 【説明】・【合否連絡】ブロックでメモ欄を ON にしたとき、レポートの章と A4 報告にもメモを出す（`checklistSheetHtml` の explain / notify）。
  - A4 報告のヘッダーのチップを `.cl-hchip`、流れの注記を `.cl-sflow` にした。アプリの styles.css の Step3 用 `.cl-chip`（印刷で非表示）・`.cl-flow` と衝突し、アプリから印刷するとタクシー可否・消極属性が消えていた。印刷規則は `.cl-nav, .cl-skip-note` だけを隠す。
  - 記入欄「OPEN／25時(タク〇のみ)までの可否」の自動値を 25時の可否で書く（1-6）。
  - 改ページ解除（`fitChecklistSheet` / `__prepareChecklistSheet`）は、2 ページ目だけがあふれて全体が 2 × 1040px 以内のときも働く（D17）。レポート側は押印の節がシートの外にあるため、効かない場合がある（3 枚目に流れるのは R6 のとおり）。
- **2026-10-13 の修正（抜け漏れの最終確認）**:
  - 保存レポートの「面接チェックリスト」節（'section'）に、台本ヘッダー（面接日・担当〔押印から補ったら「（押印より）」〕・目安・タクシー可否・料金〔手入力は「（手入力）」〕・消極属性・応募した求人）と、台本のページ題名・前書き（「台本1枚目　必須条件一致・継続性」＋前書き）を出す。これまでは印刷専用の `#clSheet` にしか無く、画面のレポートでは見えなかった（4-2）。
  - 確認事項／確認点の hint（例: ①「「大丈夫です」のみ連呼は特に要注意。」、⑤「○＝不安・不明点を解消できた」）を `table.cl-rate` の文言の下に小さく出す（レポートの節は常に、A4 報告は `print.showQuestions` が ON のとき）。台本の文言がレポートから欠けていた。
  - Step3 の `#clPrintBtn` は描画時点から旧形式（legacy）では `.hidden`（従来は `updateChecklistUI` で後から隠していた）。
  - 本書 3-6・3-7・7-1 #54/#63/#66・7-2 E25/E28/E29 を実装・テストの実際の値（必須 2・説明 14、E28 は items[1]）に合わせた。
  - 8-3 #1（確認点 7 行＝16 点か、台本の字面どおり 5 行＝12 点か）と #10（必須条件 2 件か 5 件か）は副支配人の回答待ち。既定は変えていない（HANDOFF 4-1 に直し方を記載）。
