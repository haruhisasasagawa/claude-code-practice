/*
 * 劇場プロファイル既定値（TOHOシネマズ新宿）
 * ----------------------------------------------------------------------
 * 判定ロジック本体（rules.js）は劇場に依存しない。
 * 劇場ごとに変わるもの（名称・区分の選択肢・面接チェックリスト（台本）・押印欄・結果の文言）は
 * すべてこのプロファイルに集約し、アプリ内の設定画面から編集／JSON書き出し／読み込みできる。
 * 2026-10-14 の面接特化で削除した設定は docs/SPEC-slim.md と docs/HANDOFF.md の「削除済み機能」を参照。
 */
;(function (global) {
  'use strict';

  const DEFAULT_PROFILE = {
    schemaVersion: 2,

    meta: {
      theaterName: 'TOHOシネマズ新宿',
      appTitle: 'リクルート判定システム',
      version: '5.0.0-alpha',
      footer: '© 2025 Haruhisa Sasagawa｜このツールの著作権は制作者に帰属します。無断転用・改変を禁じます。'
    },

    // 入力項目のON/OFF
    features: {
      graduationDate: true      // 学生の卒業予定年月
    },

    // 応募者の管理（押印欄）。報告書（A4）と保存レポートの末尾に 2 つの押印欄を出し、名簿から選んで日付印を押す
    management: {
      fields: [
        { id: 'interviewer', label: '面接対応者', hint: '面接を行った担当者' },
        { id: 'final', label: '最終確認', hint: '採用可否を最終確認した上長' }
      ],
      // name: 氏名 / short: 印字名（ハンコに入る名前。2〜4文字が目安）/ title: 役職 / grade: 等級（任意・参考）
      // 劇場の名簿は設定画面「応募者の管理（押印）」で追加するか、ここに既定値として並べる
      managers: [
        { name: '笹川 晴央', short: '笹川', title: '副支配人', grade: 'S3' }
      ],
      allowFreeName: true,  // 名簿にない氏名を手入力で押せる
      // 最終合否（採用／不採用のスタンプ）。アプリの判定（推奨）とは別の「人の決定」。
      // 保存 HTML の「最終合否」パネルとアプリの報告書（③）で押す。押すと stampField の押印欄が未押印なら同じ担当者の印も押す
      decision: {
        enabled: true,
        label: '最終合否',
        hireLabel: '採用',
        rejectLabel: '不採用',
        hireColor: '#c8232c',      // 朱
        rejectColor: '#1f4e8c',    // 藍
        stampField: 'final',       // 連動する押印欄の id（'' = 連動しない）
        autoStampFinal: true,      // 合否を押したとき stampField の欄が未押印なら同じ担当者の印も押す
        filenameSuffix: true,      // 合否ありの保存ファイル名に _採用 / _不採用 を付ける
        hint: '最終確認者が合否を決めて押します'
      },
      // 最終承認のパスワード（src/lock.js）。最終確認（decision.stampField の欄）の押印・取消と最終合否の決定・取消の前に求める。
      //   平文は持たない: hash = sha256Hex(salt + ':' + パスワード)（16 進 64 文字）、salt は 16 進 32 文字。hash が空＝パスワードなし（公開版の既定）。
      //   誤操作を防ぐための鍵で、HTML をテキストで開いて書き換える人までは防げない。
      //   ローカル版の初期パスワードは local/final-password.txt（node build.js --local がここに salt と hash を差し込む）
      finalLock: { salt: '', hash: '' }
    },

    options: {
      genders: ['男性', '女性', '回答しない'],
      // group: 学生は highschool / university / vocational（Step① に卒業予定年月の欄を出す）、それ以外は other
      categories: [
        { value: '高校1年生', group: 'highschool' },
        { value: '高校2年生', group: 'highschool' },
        { value: '高校3年生', group: 'highschool' },
        { value: '大学1年生', group: 'university' },
        { value: '大学2年生', group: 'university' },
        { value: '大学3年生', group: 'university' },
        { value: '大学4年生', group: 'university' },
        { value: '大学院生', group: 'university' },
        { value: '専門学校生1年生', group: 'vocational' },
        { value: '専門学校生2年生', group: 'vocational' },
        { value: '専門学校生3年生', group: 'vocational' },
        { value: 'フリーター', group: 'other' },
        { value: '主婦・主夫', group: 'other' },
        { value: 'ダブルワーカー', group: 'other' },
        { value: 'その他', group: 'other' }
      ]
    },

    // 面接評価（確認点 ○△× ＋総合判断の得点率）の帯の境界（満点に対する割合 %）。高 ≥ recommendPct、中 ≥ reviewPct
    evaluation: {
      thresholds: { recommendPct: 70, reviewPct: 40 }
    },

    // 面接チェックリスト（面接台本「スタッフ面接チェックリスト」2026-10-08 版。docs/SPEC-checklist.md 1 章）
    //   sections（台本の ①〜⑤）→ blocks → items。id はチェックリスト全体で一意（回答 record.checklist のキー）。
    //   block.type: must=必須条件（一致／不一致） / fields=記入欄 / explain=説明（チェック） / question=質問（文の表示＋メモ）
    //               rating=確認事項・確認点（○△×） / notify=合否連絡（チェック） / note=流れの注記
    //   判定に効くのは must・総合判断（overall）・人物像（persona）だけ（結果は総合判断のとおり。必須条件の不一致は不採用推奨。
    //   人物像の合計・1 点の項目・未入力は結果を下げる方向にだけ使う。docs/SPEC-persona.md）。
    //   ○=2・△=1・×=0、総合判断 採用=2・保留=1・不採用=0 の得点率は面接評価（点数・帯）として報告書に載せる（境界は evaluation.thresholds）。人物像は面接評価に入れない（別の合計）。
    //   short: A4「面接チェックリスト報告」（1 ページ）と面接記入シート（手書き用）で使う短い名前（question・notify・fields・explain・rating。任意。
    //          無ければ文言の先頭 14 文字＋「…」）。説明（explain）と確認点（rating）の short は 2026-10-16 に追加（記入シート・確認点のメモの行）
    checklist: {
      version: '2026-10-08',
      pages: [
        { no: 1, title: '必須条件一致・継続性', lead: '必須条件と報連相の意識・具体性を確認。最低限の話し方、敬語が可能か。必須条件が不一致なら不採用、逆質問を最大１０分で終了。' },
        { no: 2, title: '人物確認・逆質問', lead: '行動を確認。採用を検討できる人には不安解消の時間を取る。' }
      ],
      mustFailResult: 'reject',     // 必須条件に不一致があるとき: reject=不採用推奨 / review=上長最終判断要
      mustUnknownResult: 'none',    // 必須条件に未確認が残るとき: none=警告のみ / review=採用推奨に留めない
      mustFailJumpTo: 'reverse',    // 不一致のとき案内するセクション（'' で案内しない）
      overallLabel: '面接者の総合判断',
      overallHint: '①〜⑤の確認を踏まえて選んでください。',
      overallOptions: { hire: '採用', hold: '保留', reject: '不採用' },   // 表示名（点 2/1/0 は固定）
      overallCaps: { hold: 'review', reject: 'reject' },                  // 総合判断による結果の上限（none=調整しない）
      // 人物像（接客。1〜5 点。docs/SPEC-persona.md）。Step② の総評で項目ごとに 1〜5 点を付け、結果を下げる方向にだけ使う（面接評価には入れない）。
      //   得点率（合計÷満点）が keepPct 以上ならそのまま・rejectBelowPct 以上 keepPct 未満は上長最終判断要まで・rejectBelowPct 未満は不採用推奨。
      //   1 点の項目があれば onePointResult まで・未入力の項目があれば unscoredResult まで（none / review / reject）。
      //   items: { id, label, short?（判定の理由・記入シート）, hint?（Step② に小さく表示） }。回答は record.checklist.persona = { id: 1..5 }
      persona: {
        enabled: true,
        title: '人物像（接客）',
        scaleMax: 5,
        scaleLabels: ['不採用レベル', 'やや不安', '普通', '良い', 'とても良い'],
        items: [
          { id: 'ps_greeting', label: '挨拶ができていたか', short: '挨拶' },
          { id: 'ps_impression', label: '第一印象・身だしなみ', short: '身だしなみ', hint: '服装・清潔感' },
          { id: 'ps_smile', label: '笑顔・表情', short: '笑顔・表情' },
          { id: 'ps_voice', label: '声のトーン・ハキハキさ', short: '声のトーン' },
          { id: 'ps_eye', label: '目を見て話していたか', short: '目線' },
          { id: 'ps_speech', label: '言葉遣い・説明のわかりやすさ', short: '言葉遣い' },
          { id: 'ps_motivation', label: '志望動機・接客で大切にしたいこと', short: '志望動機' }
        ],
        keepPct: 70,              // 得点率がこれ以上なら下げない
        rejectBelowPct: 40,       // これ未満なら不採用推奨（その間は上長最終判断要まで）
        onePointResult: 'review', // 1 点の項目があるとき: none / review / reject
        unscoredResult: 'review'  // 未入力の項目があるとき: none / review / reject
      },
      header: {
        // 消極属性（negatives・morningOnlyEnd）は 2026-10-13 に削除（docs/SPEC-script-mode.md 12 章）
        posting: { label: '応募した求人', options: [{ value: 'regular', label: '通常求人' }, { value: 'short', label: '短期求人' }] },
        interviewerField: 'interviewer'
      },
      print: { showQuestions: true },
      sections: [
        { id: 'conditions', title: '勤務条件', minutes: 10, minutesMax: false, page: 1, lead: '', blocks: [
          { id: 'conditions_must', type: 'must', title: '必須条件', note: '1つでも不一致なら不採用（追加質問して解消しなければ「⑤」へ）', memo: false, memoLabel: '', items: [
            { id: 'must_weekly', label: '土日を含む週3日以上、5時間以上' },
            { id: 'must_busy', label: '指定繁忙期間すべて可（クリスマス・年末年始・春休み・GW・お盆）' }
          ] },
          { id: 'conditions_f1', type: 'fields', title: '', note: '', memo: false, memoLabel: '', items: [
            { id: 'weekend', label: '土日勤務可否', kind: 'choice', options: [{ value: 'one', label: 'いずれか' }, { value: 'both', label: '両日' }] },
            { id: 'busy_ng', label: '出勤不可な繁忙', kind: 'text' }
          ] },
          { id: 'conditions_explain', type: 'explain', title: '説明', note: '※は短期求人に応募の場合のみご説明ください', memo: false, memoLabel: '', items: [
            { id: 'ex_fare', label: '交通費（往復500円まで/日）', short: '交通費' },
            { id: 'ex_hours', label: '営業開始・終了時間、タクシー条件の説明', short: '営業時間・タクシー' },
            { id: 'ex_contract', label: '初回契約は2か月間(契約日の翌月末)。', short: '初回契約2か月', shortOnly: true },
            { id: 'ex_switch', label: '長期への切り替えあり。本人希望と勤務状況等で判断', short: '長期への切替', shortOnly: true }
          ] },
          { id: 'conditions_f2', type: 'fields', title: '質問', note: '', memo: false, memoLabel: '', items: [
            { id: 'term', label: '短期／長期の希望', kind: 'choice', options: [{ value: 'short', label: '短期希望' }, { value: 'long', label: '長期希望' }] },
            { id: 'start_date', label: '契約開始日の希望', kind: 'date' },
            { id: 'first_end', label: '初回契約終了（月末締）', short: '初回契約終了', kind: 'month' },
            { id: 'open_late', label: 'OPEN／25時(タク〇のみ)までの可否', short: 'OPEN／25時の可否', kind: 'text' }
          ] },
          { id: 'conditions_q', type: 'question', title: '', note: '', memo: true, memoLabel: 'メモ', items: [
            { id: 'q_term', label: '「いまのところ、短期希望ですか？長期希望ですか？」or「採用となった場合、希望としては、いつ頃まで勤務継続希望でしょうか？」', short: '短期／長期の希望' },
            { id: 'q_two_months', label: '「最初の2か月で勤務条件が満たせない可能性は？（土日出せない、など）」', short: '最初の2か月で条件を満たせない可能性' },
            { id: 'q_family', label: '「歌舞伎町ですので、ご家族の反対などあれば遠慮なく辞退お願いします。」', short: '家族の反対' }
          ] },
          { id: 'conditions_rate', type: 'rating', title: '確認事項', note: '', memo: false, memoLabel: '', items: [
            { id: 'rt_concrete', label: '勤務条件の一致に「具体性」があるか', short: '具体性', hint: '「大丈夫です」のみ連呼は特に要注意。' }
            // 確認点「最低限の話し方、敬語が可能か」（rt_manner。台本 1 枚目冒頭の確認目的）は、人物像の言葉遣いと重なるため 2026-10-16 に既定から外した。docs/SPEC-persona.md
          ] },
          { id: 'conditions_flow', type: 'note', title: '', note: '条件一致：2へ　／　必須条件不一致：追加質問してみて、解消しなければ「５」へ', memo: false, memoLabel: '', items: [] }
        ] },
        { id: 'continuity', title: '継続性・報連相', minutes: 3, minutesMax: false, page: 1, lead: '', blocks: [
          // 台本 1 枚目の右列（② の【説明】）。① の【必須条件】は左列の 2 件だけ
          { id: 'continuity_explain', type: 'explain', title: '説明', note: '', memo: false, memoLabel: '', items: [
            { id: 'ex_submit', label: 'シフト提出は木曜23時、確定は水曜', short: 'シフト提出' },
            { id: 'ex_phone', label: 'シフト関連の連絡：原則電話のみ', short: '連絡は電話' },
            { id: 'ex_absence', label: '欠勤・遅刻は分かった時点で連絡', short: '欠勤・遅刻の連絡' }
          ] },
          { id: 'continuity_q', type: 'question', title: '質問', note: '', memo: true, memoLabel: 'メモ', items: [
            { id: 'q_prev_job', label: '「前のアルバイトの期間と退職理由は？差し支えなければ退職理由は？」', short: '前のバイトの期間・退職理由' },
            { id: 'q_cant_3days', label: '「週3日出せないと事前に分かったら、どうするべきだと思いますか？」', short: '週3日出せないと分かったら' },
            { id: 'q_sudden_absence', label: '「当日、急に出勤できなくなったら、どうするべきだと思いますか？」', short: '当日急に出られなくなったら' }
          ] },
          // 台本の「報連相できるか／離職要因はないか」を 2 行に分けて評価する
          { id: 'continuity_rate', type: 'rating', title: '確認事項', note: '', memo: false, memoLabel: '', items: [
            { id: 'rt_hourensou', label: '報連相できるか', short: '報連相' },
            { id: 'rt_turnover', label: '離職要因はないか', short: '離職要因', hint: '○＝離職要因なし（前のアルバイトの期間・退職理由から）' }
          ] }
        ] },
        // 台本 2 枚目は 3 列（③・④・⑤）。各列の上から順に並べる
        { id: 'job', title: '仕事内容の説明', minutes: 10, minutesMax: false, page: 2, lead: '', blocks: [
          { id: 'job_explain', type: 'explain', title: '説明', note: '', memo: false, memoLabel: '', items: [
            { id: 'ex_start', label: 'コンセorフロア業務からスタート', short: 'コンセ／フロア' },
            { id: 'ex_busy', label: '多忙・立ち仕事・汚物清掃の可否', short: '多忙・立ち仕事・清掃' },
            { id: 'ex_opinion', label: 'ときにはご意見の対応も', short: 'ご意見対応' },
            { id: 'ex_rules', label: '細かなルールや接客指導あり', short: 'ルール・接客指導' }
          ] },
          { id: 'job_q', type: 'question', title: '質問', note: '', memo: true, memoLabel: '回答', items: [
            { id: 'q_value', label: '「前職で大切にしていたことは？」', short: '前職で大切にしていたこと' },
            { id: 'q_failure', label: '「前職での失敗談はありますか？」', short: '前職の失敗談' },
            { id: 'q_unsure', label: '「説明した業務で自信がないことや、相談・不明点はありますか？」', short: '自信がない業務・不明点' }
          ] },
          { id: 'job_rate', type: 'rating', title: '確認点', note: '', memo: false, memoLabel: '', items: [
            { id: 'rt_understand', label: '業務理解と接客の実行可能性', short: '業務理解' }
          ] }
        ] },
        { id: 'teamwork', title: '集団行動特性', minutes: 8, minutesMax: false, page: 2, lead: '', blocks: [
          { id: 'teamwork_explain', type: 'explain', title: '説明', note: '', memo: false, memoLabel: '', items: [
            { id: 'ex_team', label: 'チームで分業（例：清掃、商材補充）', short: 'チーム分業' },
            { id: 'ex_sudden', label: '急な指示も多い（例：SH、無線呼出）', short: '急な指示' },
            { id: 'ex_radio', label: '不明点・権限外の対応は無線で確認。', short: '無線で確認' }
          ] },
          { id: 'teamwork_q', type: 'question', title: '質問', note: '', memo: true, memoLabel: '回答', items: [
            { id: 'q_feedback', label: '「指摘を受けて行動を変えた経験はありますか？（仕事・部活動など）」', short: '指摘で行動を変えた経験' },
            { id: 'q_unknown', label: '「お客様に質問されて答えがわからない時、どうしますか？」', short: '答えが分からない時' },
            { id: 'q_busy_mind', label: '「忙しいときこそ心掛けたいことは？」', short: '忙しい時に心掛けること' }
          ] },
          { id: 'teamwork_rate', type: 'rating', title: '確認点', note: '', memo: false, memoLabel: '', items: [
            { id: 'rt_team', label: '自己判断せずチームで動けるか', short: 'チーム行動' }
          ] }
        ] },
        { id: 'reverse', title: '逆質問', minutes: 10, minutesMax: true, page: 2, lead: 'ミスマッチを解消するための時間', blocks: [
          { id: 'reverse_q', type: 'question', title: '', note: '※業務の大変な面も率直に伝える。', memo: true, memoLabel: '回答', items: [
            { id: 'q_concerns', label: '「条件・業務・映画館のことなど、何か気になる点はありますか？」', short: '気になる点（逆質問）' }
          ] },
          { id: 'reverse_notify', type: 'notify', title: '合否連絡', note: '面接の最後に伝えたらチェック', memo: false, memoLabel: '', items: [
            { id: 'nt_hire', label: '採用時：数日中に電話連絡。ご家族の反対あればご辞退ください。同時に初日出勤日時を調整、もちものなど詳細はメールで送付。', short: '採用時' },
            { id: 'nt_reject', label: '不合格：メール連絡', short: '不合格' }
          ] },
          { id: 'reverse_rate', type: 'rating', title: '確認点', note: '', memo: false, memoLabel: '', items: [
            { id: 'rt_mismatch', label: '採用後のミスマッチを低減', short: 'ミスマッチ', hint: '○＝不安・不明点を解消できた' }
          ] }
        ] }
      ]
    },

    texts: {
      recommend: { title: '採用推奨' },
      review: { title: '上長最終判断要' },
      reject: { title: '不採用推奨' },
      disclaimer: '※本判定は基準統一のための参考値です。最終判断は上長が行います。',
      bandLabels: { high: '高', mid: '中', low: '低' },
      // 結果の本文。変数: {name} {overallLabel} {total} {max} {pct} {band} {marks} {mustLabels} {resultTitle} {baseTitle}
      script: {
        recommend: '{name}は面接者の総合判断が「{overallLabel}」です（面接評価 {total}/{max}点・{pct}%）。採用を推奨します。',
        review: '{name}は面接者の総合判断が「{overallLabel}」です（面接評価 {total}/{max}点・{pct}%）。上長の最終判断が必要です。',
        reject: '{name}は面接者の総合判断が「{overallLabel}」です（面接評価 {total}/{max}点・{pct}%）。不採用を推奨します。',
        missing: '{name}は面接者の総合判断が未入力です（面接評価 {total}/{max}点・{pct}%）。上長の最終判断が必要です。',
        mustGate: '{name}は必須条件（{mustLabels}）が一致しないため、面接者の総合判断・面接評価にかかわらず{resultTitle}とします。',
        adjusted: '{name}は面接者の総合判断が「{overallLabel}」（面接評価 {total}/{max}点）ですが、下記の理由により{resultTitle}とします。'
      }
    }
  };

  global.RECRUIT_DEFAULT_PROFILE = DEFAULT_PROFILE;
})(window);
