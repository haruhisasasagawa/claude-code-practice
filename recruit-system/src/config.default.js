/*
 * 劇場プロファイル既定値（TOHOシネマズ新宿）
 * ----------------------------------------------------------------------
 * 判定ロジック本体（rules.js）は劇場に依存しない。
 * 劇場ごとに変わるもの（名称・選択肢・閾値・留意点の文言・評価項目）は
 * すべてこのプロファイルに集約し、アプリ内の設定画面から編集／JSON書き出し／読み込みできる。
 *
 * handoffRules[].id は rules.js 側の条件関数（CONDITIONS）のキーと対応する。
 * 条件そのものを追加する場合は rules.js の CONDITIONS に関数を追加し、ここに既定の行を追加する。
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

    // 入力項目のON/OFF（劇場ごとに不要な項目を隠せる）
    features: {
      graduationDate: true,     // 学生の卒業予定年月
      vacation: true,           // 繁忙期（連休・長期休暇）の勤務可否（キー名は互換のため vacation のまま）
      lateNight: true,          // 深夜帯（22時以降）勤務可否・帰宅手段
      taxi: true,               // タクシー帰宅時の規定金額チェック（lateNight が前提）
      foreignNational: true,    // 外国籍・在留資格・日本語レベル
      department: false,        // 希望部署
      applicationRoute: false,  // 応募経路
      vacationDays: true,       // 繁忙期ごとの出られる日数（vacation が前提）
      holidayWork: true,        // 祝日の勤務可否
      weekendFreq: true,        // 土日の出勤頻度
      allNight: true,           // オールナイト上映シフト
      contribution: true        // シフト貢献度と2軸判定（OFF=従来どおり面接評価のみで判定）
    },

    // 入力の段階: 'pre'=面接前に入力（Step1 に表示） / 'interview'=面接時に確認（Step3 に表示。Step1 では折りたたみで任意入力）
    // 基本情報・勤務条件（曜日・時間・週日数・勤務期間）・面接者への申し送りコメントは常に面接前（ここには書かない）
    // セクションの中身は rules.js の INPUT_SECTIONS（docs/SPEC-stages.md 1 章）
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
      // true: 週の最大勤務日数を Step1 の必須にする（既定 ON。副支配人の要望「面接に進めるかは週何日・時間帯・勤務期間で判断」に合わせる）
      requireDaysMax: true,
      preFillAlwaysOpen: false      // true: Step1 の「面接前に分かっている項目」を常に開いて表示する
    },

    // 高校生の採用方針
    //   mode: 'allow'=制限なし（従来） / 'exceptionOnly'=原則対象外・例外のみ選考（新宿） / 'deny'=高校生は全員対象外
    highschoolPolicy: {
      mode: 'exceptionOnly',
      exceptionCategories: ['高校3年生'],   // 例外を検討できる区分（options.categories の value と完全一致）
      requireCareerDecided: true,          // 例外条件: 進路決定済み
      allowedCareerPaths: { university: true, vocational: true, employment: false, other: false },
      requireContinue: true,               // 例外条件: 卒業後も当劇場で継続する意思
      // 例外の対象外の進路のうち、不採用推奨まで下げる進路（副支配人回答: 就職はほぼ短期採用のため不採用）。
      // ここに無い対象外の進路（その他＝浪人・未定など）と進路未決定・未入力は上長最終判断要
      rejectCareerPaths: { university: false, vocational: false, employment: true, other: false },
      nightRestricted: true,               // 18歳以上でも高校在学中は深夜帯・オールナイト不可として扱う（当劇場運用）
      notice: '新宿では高校生は原則採用対象外です。例外は高校3年生で進路（進学）が決定済み、かつ進学後も当劇場でアルバイトを継続する方のみです。就職予定の方は短期採用となるため対象外です。'
    },

    options: {
      genders: ['男性', '女性', '回答しない'],
      // group: highschool / university / vocational / freeter / homemaker / doubleworker / other
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
        { value: 'フリーター', group: 'freeter' },
        { value: '主婦・主夫', group: 'homemaker' },
        { value: 'ダブルワーカー', group: 'doubleworker' },
        { value: 'その他', group: 'other' }
      ],
      commuteMethods: ['徒歩', '自転車', '公共交通機関', 'バイク（原付）', 'マイカー'],
      stationHints: ['新宿', '新宿三丁目', '西武新宿', '新宿西口', '東新宿', '新宿御苑前', '代々木'],
      // minMonths: 卒業までの残月数と比べる最低月数 / contributionRatio: シフト貢献度「勤務期間」の割合
      workPeriods: [
        { value: 'long', label: '長期（1年以上）', minMonths: 12, contributionRatio: 1 },
        { value: 'mid', label: '中期（半年以上〜1年未満）', minMonths: 6, contributionRatio: 0.5 },
        { value: 'short', label: '短期（半年以下）', minMonths: 0, contributionRatio: 0 }
      ],
      // 画面上の名前は「繁忙期」。内部キーは互換のため vacationItems のまま。表示順＝配列順
      //   unit: 'total'=期間中の合計日数 / 'perWeek'=期間中の週あたり日数 / 'perEvent'=1回あたり
      //   maxDays: 日数入力の上限（perWeek は 7 固定扱い）。refDays: この日数以上で満点（refDays ≤ maxDays）
      //   weight: 繁忙期小計の中での重み（0〜10。0 は「記録のみ・点数と未確認判定に使わない」）
      //   critical: × のとき vacation_ng（要判断）の対象。false の期間の × は busy_optional_ng（要確認）
      vacationItems: [
        { id: 'threeday', label: '3連休（祝日を含む連休）', periodNote: '成人の日・海の日・スポーツの日など年数回。1回の3連休で何日出られるか',
          unit: 'perEvent', maxDays: 3, refDays: 2, weight: 3, critical: true },
        { id: 'gw', label: 'GW', periodNote: '4月末〜5月上旬（暦により5〜9連休）',
          unit: 'total', maxDays: 9, refDays: 5, weight: 3, critical: true },
        { id: 'summer', label: '夏休み期間', periodNote: '7月下旬〜8月末（お盆を除く）。期間中の週あたり日数',
          unit: 'perWeek', maxDays: 7, refDays: 4, weight: 2, critical: true },
        { id: 'obon', label: 'お盆', periodNote: '8月中旬',
          unit: 'total', maxDays: 6, refDays: 3, weight: 3, critical: true },
        { id: 'silver', label: 'シルバーウィーク', periodNote: '9月の敬老の日・秋分の日前後の連休',
          unit: 'total', maxDays: 5, refDays: 3, weight: 2, critical: false },
        { id: 'yearend', label: '年末年始', periodNote: '12月下旬〜1月上旬',
          unit: 'total', maxDays: 9, refDays: 4, weight: 3, critical: true },
        { id: 'spring', label: '春休み期間', periodNote: '2月〜4月上旬。期間中の週あたり日数',
          unit: 'perWeek', maxDays: 7, refDays: 3, weight: 1, critical: false }
      ],
      weekendFrequencies: [
        { value: 'every_both', label: '毎週 土日とも', ratio: 1 },
        { value: 'every_one', label: '毎週 土日どちらか', ratio: 0.6 },
        { value: 'biweekly', label: '隔週程度', ratio: 0.4 },
        { value: 'monthly', label: '月1回程度', ratio: 0.2 }
      ],
      allNightFrequencies: [
        { value: 'weekly', label: '毎週でも可', ratio: 1 },
        { value: 'biweekly', label: '月2〜3回', ratio: 0.75 },
        { value: 'monthly', label: '月1回程度', ratio: 0.5 },
        { value: 'rare', label: '繁忙期・特別上映のときのみ', ratio: 0.25 }
      ],
      careerPaths: [
        { value: 'university', label: '大学・短大へ進学' },
        { value: 'vocational', label: '専門学校へ進学' },
        { value: 'employment', label: '就職' },
        { value: 'other', label: 'その他（浪人・未定など）' }
      ],
      returnMethods: [
        { value: 'train', label: '終電で帰宅' },
        { value: 'taxi', label: 'タクシーで帰宅' },
        { value: 'walk_bike', label: '徒歩・自転車' },
        { value: 'other', label: 'その他' }
      ],
      residenceStatuses: ['留学', '家族滞在', '永住者', '定住者', '日本人の配偶者等', '特定活動', '技術・人文知識・国際業務', 'その他'],
      workPermitStates: [
        { value: 'yes', label: 'あり（資格外活動許可済）' },
        { value: 'no', label: 'なし' },
        { value: 'unknown', label: '未確認' },
        { value: 'na', label: '不要（就労制限なし）' }
      ],
      japaneseLevels: ['ネイティブ', 'ビジネス（N1相当）', '日常会話（N2相当）', '基礎（N3相当以下）'],
      departments: ['コンセッション', 'フロア', 'ボックス（チケット）', '特に希望なし'],
      applicationRoutes: ['求人サイト', '店頭ポスター', '紹介', '公式サイト', 'その他']
    },

    // 判定パラメータ（数値のしきい値）
    params: {
      maxAge: 60,                       // この年齢以上は「要判断」
      minShiftMinutes: 180,             // 1日の最低勤務時間（分）
      lowMaxDays: 2,                    // 週最大勤務日数がこの値以下なら「要確認」
      commuteWarnMinutes: 60,           // 通勤時間がこれを超えると「要確認」
      commuteBlockMinutes: 90,          // 通勤時間がこれ以上で「要判断」
      openStartFrom: 7,                 // オープン要員とみなす開始時刻（時）下限
      openStartTo: 8,                   // 同 上限
      closeEndHour: 22,                 // この時刻以降まで働けるならクローズ要員
      daytimeStartBefore: 15,           // 平日この時刻より前の開始は「日中帯」
      lateNightStartHour: 22,           // 深夜帯の開始時刻（時）
      taxiLimitYen: 3000,               // タクシー帰宅の規定金額（円）
      highschoolLatestEnd: '22:00',     // 高校生の勤務終了上限（当劇場運用）
      foreignWeeklyHourCap: 28,         // 資格外活動の週上限（時間）
      foreignVacationWeeklyHourCap: 40, // 長期休暇中の週上限（時間）
      residenceExpiryWarnMonths: 6,     // 在留期限が何か月以内なら「要確認」
      lastTrainBufferMinutes: 15,       // 勤務終了〜終電に必要な余裕（着替え・移動）
      dayBoundaryHour: 5,               // 終電時刻がこの時より前なら翌日扱い（00:35 → 翌0:35）
      allNightShiftStart: '22:00',      // オールナイト勤務の目安（表示用）
      allNightShiftEnd: '06:00',        //   同 終了（翌日）
      weekendFreqWarnBelow: 0.4,        // 土日頻度の割合がこれ未満で weekend_freq_low（既定では「月1回程度」）
      groupAgeRanges: {                 // 区分グループと年齢の整合（'' は制限なし）
        highschool: { min: 15, max: 19 },
        university: { min: 18, max: '' },
        vocational: { min: 18, max: '' }
      },
      closeShiftStandardEnd: ''         // クローズ勤務の標準終了時刻（例 '00:30'）。終電の突合に使う。空なら使わない
    },

    // 面接者への申し送り（留意点）ルール
    // severity: block=要判断（採用担当が面接実施・採用の可否を判断。面接前にも面接後にも出る） / warn=要確認（面接時に確認） / info=共有
    handoffRules: [
      // --- 法令（労働基準法。設定画面で OFF・重要度変更不可。文言は編集可） ---
      { id: 'minor_late_night', enabled: true, severity: 'block', category: 'legal',
        text: '{ageText}（18歳未満）は22:00〜翌5:00に勤務できません（労働基準法第61条）。{nightWish}ため、希望を修正するよう面接で説明してください。' },
      { id: 'allnight_minor', enabled: true, severity: 'block', category: 'legal',
        text: '{ageText}（18歳未満）はオールナイト上映のシフトに入れません（労働基準法第61条）。オールナイトの希望が「{allNightAvail}」になっているため、不可である旨を説明してください（貢献度は0点で計算）。' },
      { id: 'under_working_age', enabled: true, severity: 'block', category: 'legal',
        text: '{age}歳です。労働基準法第56条により中学生以下は雇用できません。年齢・区分の入力を確認してください。' },
      { id: 'minor_hours', enabled: true, severity: 'block', category: 'legal',
        text: '18歳未満は1日8時間・週40時間を超えて勤務できません（労働基準法第60条）。希望シフトを範囲内に調整してください。' },
      { id: 'minor_documents', enabled: true, severity: 'info', category: 'legal',
        text: '18歳未満のため、採用時に年齢証明書（住民票記載事項証明書等。労働基準法第57条）と保護者の同意書を受け取ってください。' },

      // --- 高校生 ---
      { id: 'hs_out_of_policy', enabled: true, severity: 'block', category: 'highschool',
        text: '{category}は当劇場では原則採用対象外です（例外は{hsExceptionCategories}で進路（進学）決定済み・進学後も当劇場で継続する方のみ）。面接実施の可否を採用担当で判断してください。' },
      { id: 'hs_exception_unmet', enabled: true, severity: 'block', category: 'highschool',
        text: '{category}ですが、例外の条件を満たしていません（{hsUnmet}）。高校生は原則採用対象外のため、面接実施の可否を採用担当で判断してください。' },
      { id: 'hs_exception_ok', enabled: true, severity: 'warn', category: 'highschool',
        text: '{category}・進路決定済み（{careerPathLabel}／進学先: {destination}）・卒業後も継続希望のため、例外として選考対象です。合格通知等で進路を確認し、進学後の通学・時間割から卒業後も勤務を続けられるか確認してください。' },
      { id: 'hs_exception_period', enabled: true, severity: 'warn', category: 'highschool',
        text: '卒業後も継続する意思がある一方、勤務期間の希望が「{workPeriodLabel}」です。どちらが正しいか確認してください。' },
      { id: 'hs_night_policy', enabled: true, severity: 'block', category: 'highschool',
        text: '高校在学中は当劇場の運用により{highschoolLatestEnd}以降の勤務・オールナイトに入れません（18歳以上でも卒業まで）。{nightWish}となっているため、卒業後の希望として扱うか確認してください。' },
      { id: 'highschool_permission', enabled: true, severity: 'warn', category: 'highschool',
        text: '所属高校のアルバイト許可を得ているか確認してください。' },
      { id: 'highschool_hours', enabled: true, severity: 'warn', category: 'highschool',
        text: '18歳未満は法令上22:00〜翌5:00の勤務ができません。当劇場では高校生は年齢にかかわらず{highschoolLatestEnd}までの勤務としている旨を伝えてください。' },
      { id: 'highschool_time_violation', enabled: true, severity: 'block', category: 'highschool',
        text: '{highschoolLatestEnd}を超える勤務希望時間が入力されています。高校生は深夜帯勤務不可のため入力内容を確認してください。' },

      // --- 全般 ---
      { id: 'age_limit', enabled: true, severity: 'block', category: 'general',
        text: '{age}歳のため年齢基準（{maxAge}歳以上）に該当します。面接実施の可否を採用担当で判断してください。' },
      { id: 'short_period', enabled: true, severity: 'block', category: 'general',
        text: '短期（半年以下）の勤務希望です。研修期間・シフト貢献度を踏まえ、面接実施の可否を採用担当で判断してください。' },
      { id: 'weekly_days_one', enabled: true, severity: 'block', category: 'general',
        text: '週最大勤務日数が1日のため、シフト貢献度の観点で条件を満たしません。' },
      { id: 'commute_block', enabled: true, severity: 'block', category: 'general',
        text: '通勤時間{commuteTime}分は長すぎるため、継続勤務が難しい可能性があります。面接実施の可否を判断してください。' },
      { id: 'graduation_midterm', enabled: true, severity: 'warn', category: 'general',
        text: '卒業予定（{graduationDate}）まで約{monthsLeft}か月で、希望の勤務期間「{workPeriodLabel}」（{periodMinMonths}か月以上）を満たさない可能性があります。卒業後も継続できるか確認してください。' },
      { id: 'weekly_days_low', enabled: true, severity: 'warn', category: 'general',
        text: '週最大勤務日数が{maxDays}日のためシフト貢献度が低めです。増やせる見込みがあるか確認してください。' },
      { id: 'weekly_days_unknown', enabled: true, severity: 'info', category: 'general',
        text: '週の勤務日数が未入力です。希望日数を面接時に確認してください。' },
      { id: 'shift_times_missing', enabled: true, severity: 'info', category: 'general',
        text: '勤務希望時間が未入力の曜日があります。面接時に具体的な時間帯を確認してください。' },
      { id: 'short_shift', enabled: true, severity: 'warn', category: 'general',
        text: '1日{minShiftHours}時間に満たない勤務希望日があります。シフト組みの観点で確認してください。' },
      { id: 'weekday_daytime', enabled: true, severity: 'warn', category: 'general',
        text: '平日の朝〜夕方は既存スタッフでシフトが埋まりやすい時間帯です。希望通りに入れない可能性を事前に説明してください。' },
      { id: 'commute_warn', enabled: true, severity: 'warn', category: 'general',
        text: '通勤時間{commuteTime}分は長めです。通勤負担と継続性について確認してください。' },
      { id: 'commute_car', enabled: true, severity: 'info', category: 'general',
        text: 'マイカー通勤希望です。当劇場の駐車場事情（スタッフ用駐車場なし）を説明してください。' },
      { id: 'side_job_student', enabled: true, severity: 'info', category: 'general',
        text: 'かけもちあり（学生）。扶養控除内であれば当劇場でどの程度の収入を希望しているか確認してください。' },
      { id: 'side_job_nonstudent', enabled: true, severity: 'info', category: 'general',
        text: 'かけもちあり。扶養控除内の希望収入、および週40時間超の時間外手当を当劇場では支払えない旨を説明してください。' },
      { id: 'freeter_insurance', enabled: true, severity: 'info', category: 'general',
        text: 'フリーターの方は社会保険の加入希望について確認してください。' },

      // --- 繁忙期・休日（土日祝、特に3連休以上の連休・長期休暇） ---
      { id: 'vacation_ng', enabled: true, severity: 'block', category: 'busy',
        text: '繁忙期（{vacationLabels}）の勤務ができません。新宿は連休・長期休暇の貢献を重視するため、事情と代わりに出られる時期を確認し、採用可否を判断してください。' },
      { id: 'vacation_consult', enabled: true, severity: 'warn', category: 'busy',
        text: '繁忙期（{vacationLabels}）が要相談です。期間中に何日程度入れるか確認してください。' },
      { id: 'busy_optional_ng', enabled: true, severity: 'warn', category: 'busy',
        text: '繁忙期のうち{vacationLabels}の勤務ができません。代わりに出られる時期があるか確認してください。' },
      { id: 'weekend_missing', enabled: true, severity: 'warn', category: 'busy',
        text: '土日両日にチェックが入っていません。土日勤務の可否と頻度を確認してください。' },
      { id: 'weekend_freq_low', enabled: true, severity: 'warn', category: 'busy',
        text: '土日の出勤頻度が「{weekendFreqLabel}」です。当劇場は土日祝の貢献を重視しているため、増やせる余地があるか確認してください。' },
      { id: 'holiday_ng', enabled: true, severity: 'warn', category: 'busy',
        text: '祝日の勤務ができません。3連休・祝日は繁忙のため、出られない理由と例外的に入れる日があるか確認してください。' },
      { id: 'holiday_consult', enabled: true, severity: 'warn', category: 'busy',
        text: '祝日の勤務が要相談です。月に何回程度、どの祝日なら入れるか確認してください。' },
      { id: 'shift_unanswered', enabled: true, severity: 'warn', category: 'busy',
        text: '判定の前に面接で確認が必要なシフト条件があります（{confirmSummary}）。面接で確認し、Step3「面接で確認する項目」に入力してください。' },

      // --- オールナイト上映 ---
      { id: 'allnight_ok', enabled: true, severity: 'info', category: 'allNight',
        text: 'オールナイト上映のシフトに入れます（頻度: {allNightFreq}）。勤務時間（{allNightShiftStart}〜翌{allNightShiftEnd}目安）・休憩・始発での帰宅について説明してください。' },
      { id: 'allnight_consult', enabled: true, severity: 'warn', category: 'allNight',
        text: 'オールナイト上映のシフトが要相談です（頻度: {allNightFreq}）。入れる曜日・頻度と、始発での帰宅が可能か確認してください。' },
      { id: 'allnight_ng', enabled: true, severity: 'info', category: 'allNight',
        text: 'オールナイト上映のシフトには入れません。新宿はオールナイト上映が多いため、土日祝・繁忙期での貢献を確認してください。' },

      // --- 深夜帯 ---
      { id: 'late_night_ng', enabled: true, severity: 'info', category: 'lateNight',
        text: '{lateNightStartHour}時以降の勤務が不可です。クローズ要員としては見込めないため、日中〜夕方帯での配置を前提に検討してください。' },
      { id: 'late_night_consult', enabled: true, severity: 'warn', category: 'lateNight',
        text: '{lateNightStartHour}時以降の勤務が要相談です。可能な曜日・頻度を確認してください。' },
      { id: 'late_night_shift_conflict', enabled: true, severity: 'warn', category: 'lateNight',
        text: '{lateNightStartHour}時以降の勤務時間が入力されていますが、深夜帯は「不可」となっています。入力内容を確認してください。' },
      { id: 'late_night_last_train', enabled: true, severity: 'warn', category: 'lateNight',
        text: '深夜帯勤務の希望がありますが終電時刻が未入力です。クローズ（{closeEndHour}時以降）後に帰宅手段があるか確認してください。' },
      { id: 'late_night_return_unknown', enabled: true, severity: 'warn', category: 'lateNight',
        text: '{lateNightStartHour}時以降の勤務希望（または希望シフト）がありますが、深夜帯の帰宅手段が未入力です。終電で帰れるか、タクシーの場合は料金が規定（{taxiLimitYen}円）内かを確認してください。' },
      { id: 'late_night_last_train_early', enabled: true, severity: 'warn', category: 'lateNight',
        text: '希望シフトの最も遅い終了（{latestEnd}）から終電（{lastTrain}）まで{lastTrainBufferMinutes}分の余裕がありません。クローズ後に帰宅できるか、終了時刻の調整・帰宅手段を確認してください。' },
      { id: 'late_night_taxi_over', enabled: true, severity: 'block', category: 'lateNight',
        text: 'タクシー帰宅の料金目安{taxiFare}円が規定（{taxiLimitYen}円）を超えています。深夜帯の採用可否を採用担当で判断してください。' },
      { id: 'late_night_taxi_unknown', enabled: true, severity: 'warn', category: 'lateNight',
        text: 'タクシー帰宅希望ですが料金目安が未入力です。自宅までの料金が規定（{taxiLimitYen}円）内か確認してください。' },
      { id: 'late_night_taxi_ok', enabled: true, severity: 'info', category: 'lateNight',
        text: 'タクシー帰宅（料金目安{taxiFare}円）は規定（{taxiLimitYen}円）内です。利用ルールを説明してください。' },

      // --- 専門学校生 ---
      { id: 'vocational_permission', enabled: true, severity: 'warn', category: 'vocational',
        text: '所属専門学校のアルバイト許可を得ているか確認してください。' },

      // --- 外国籍 ---
      { id: 'foreign_permit_missing', enabled: true, severity: 'block', category: 'foreign',
        text: '資格外活動許可が確認できていません。在留カード裏面の許可印を必ず確認してください（許可なしでは就労不可）。' },
      { id: 'foreign_hour_cap', enabled: true, severity: 'warn', category: 'foreign',
        text: '資格外活動は週{foreignWeeklyHourCap}時間（長期休暇中は{foreignVacationWeeklyHourCap}時間）が上限です。かけもち分も含めて超えないか確認してください。' },
      { id: 'foreign_hour_cap_exceeded', enabled: true, severity: 'block', category: 'foreign',
        text: '希望シフトとかけもちの合計（週{weeklyHours}時間目安。うちかけもち{sideJobHours}時間）が週{foreignWeeklyHourCap}時間の上限を超えています。シフト調整の可否を判断してください。' },
      { id: 'foreign_expiry', enabled: true, severity: 'warn', category: 'foreign',
        text: '在留期限（{residenceExpiry}）が近い、または未入力です。更新予定を確認してください。' },
      { id: 'foreign_japanese', enabled: true, severity: 'warn', category: 'foreign',
        text: '日本語レベルが「{japaneseLevel}」です。接客・案内業務が可能か面接での会話を通じて確認してください。' },
      { id: 'foreign_busy_cap', enabled: true, severity: 'info', category: 'foreign',
        text: '繁忙期の勤務希望があります。週{foreignVacationWeeklyHourCap}時間まで認められるのは、在留資格「留学」で学則上の長期休業期間中のみです。GW・3連休・シルバーウィーク等は週{foreignWeeklyHourCap}時間が上限である旨を説明してください。' },
      { id: 'allnight_foreign_hours', enabled: true, severity: 'info', category: 'foreign',
        text: 'オールナイトは1回の勤務が長時間になります。週{foreignWeeklyHourCap}時間の上限内に収まるシフトが組めるか確認してください。' },

      // --- 入力の整合 ---
      { id: 'age_category_mismatch', enabled: true, severity: 'warn', category: 'consistency',
        text: '年齢{age}歳と区分「{category}」が一致しません（想定 {ageRange}）。入力誤りでないか、定時制・通信制・社会人学生等でないか確認してください。' },
      { id: 'weekly_days_mismatch', enabled: true, severity: 'warn', category: 'consistency',
        text: '週の勤務日数の入力に矛盾があります（勤務可能曜日 {dayCount}日分・週{minDays}〜{maxDays}日）。実際に入れる曜日と日数を確認してください。' },
      { id: 'allnight_latenight_conflict', enabled: true, severity: 'warn', category: 'consistency',
        text: 'オールナイトは「{allNightAvail}」ですが、{lateNightStartHour}時以降の勤務は「× 不可」です。終電の都合による不可であれば、始発帰宅のオールナイトは可能か確認してください。' },
      { id: 'graduation_past', enabled: true, severity: 'warn', category: 'consistency',
        text: '卒業予定年月（{graduationDate}）が過去の日付です。入力内容と現在の区分を確認してください。' },
      { id: 'allnight_shift_conflict', enabled: true, severity: 'warn', category: 'consistency',
        text: '勤務希望時間に深夜2時〜5時の時間帯が含まれていますが、オールナイトは「× 不可」です。入力内容を確認してください。' }
    ],


    // 面接評価（面接後の採用可否判定の中核）
    evaluation: {
      scaleMax: 5,
      items: [
        { id: 'greeting', label: '挨拶はできていたか' },
        { id: 'first_impression', label: '第一印象は良かったか' },
        { id: 'communication', label: '明るくハキハキとしていたか' },
        { id: 'eye_contact', label: '話をするときに目を見て話していたか' },
        { id: 'appearance', label: '服装、身だしなみはきちんとしていたか' },
        { id: 'explanation', label: '意見を判りやすく説明できていたか' },
        { id: 'motivation', label: '志望動機に好感が持てたか' },
        { id: 'self_analysis', label: '長所や短所などの自己分析ができていたか' },
        { id: 'service_mindset', label: '接客する上で大切にしたいことを答えられたか' },
        { id: 'overall_judgment', label: '面接者から見ての総合判断' }
      ],
      overallItemId: 'overall_judgment',
      overallWarnBelow: 3,
      // 満点に対する割合（%）で判定。項目数を変えても閾値を調整不要にするため。
      thresholds: { recommendPct: 70, reviewPct: 40 },
      // 「要判断」の留意点が未確認のまま採用推奨になった場合、上長最終判断要に留める
      holdOnUnresolvedBlock: true,
      // 高校生の「原則対象外」「例外条件未充足/未入力」は確認済みでも採用推奨にしない
      holdOnHighschoolException: true,
      // 総合判断がこの点以下なら不採用推奨（0=無効）
      overallRejectAtOrBelow: 0
    },

    // シフト貢献度（面接評価とは別軸。得点率で 高/中/低 の帯に分ける）
    contribution: {
      items: [                           // 表示順＝配列順。合計 100 でなくてもよい（得点率で判定）
        { id: 'busy', enabled: true, label: '繁忙期（3連休・GW・お盆・年末年始など）', max: 30 },
        { id: 'weekend', enabled: true, label: '土日', max: 15 },
        { id: 'holiday', enabled: true, label: '祝日', max: 5 },
        { id: 'allNight', enabled: true, label: 'オールナイト', max: 15 },
        { id: 'close', enabled: true, label: 'クローズ・深夜帯', max: 10 },
        { id: 'open', enabled: true, label: 'オープン', max: 5 },
        { id: 'weeklyDays', enabled: true, label: '週の勤務日数', max: 10 },
        { id: 'period', enabled: true, label: '勤務期間', max: 10 }
      ],
      consultFactor: 0.5,                // △（要相談）を満点の何割として数えるか
      weekendDerived: { both: 0.8, one: 0.4 }, // 土日の頻度欄が OFF のとき曜日選択から推定する割合
      weekendOneDayCap: 0.6,             // 土日の片方しか選んでいないときの上限
      lateNightAvailFactor: 0.5,         // 「22時以降○」をクローズ項目で何割として数えるか
      targets: { closeDaysPerWeek: 2, openDaysPerWeek: 1, weeklyDaysFull: 4 },
      bands: { highPct: 60, midPct: 35 },// 貢献度 高 ≥60%、中 ≥35%、低 <35%
      busyStrongPct: 80,                 // 繁忙期の得点率がこれ以上で強み「busyStrong」
      requireComplete: true,             // 判定前に未確認ゼロを必須にする
      showBeforeInterview: true          // 申し送り（面接前）に貢献度の見込み（点数）を出す
    },

    // 2軸マトリクス（キー = <面接帯>_<貢献度帯>）。値: recommend / review / reject
    matrix: {
      cells: {
        high_high: 'recommend', high_mid: 'recommend', high_low: 'review',
        mid_high: 'review', mid_mid: 'review', mid_low: 'reject',
        low_high: 'reject', low_mid: 'reject', low_low: 'reject'
      },
      cellNotes: {
        high_high: '', high_mid: '',
        high_low: '面接評価は高い一方、シフト貢献度（繁忙期・土日祝・オールナイト等）が低めです。配置の見込みを踏まえて上長が最終判断してください。',
        mid_high: 'シフト貢献度が高く、繁忙期・オールナイトの戦力として期待できます。面接評価の懸念点と合わせて前向きに検討してください。',
        mid_mid: '',
        mid_low: '面接評価が標準的で、シフト貢献度（繁忙期・土日祝・オールナイト等）も低めです。無理に採用する必要はないため、不採用を推奨します。',
        low_high: 'シフト貢献度は高いものの、面接評価が基準に達していません（面接評価を優先します）。',
        low_mid: '', low_low: ''
      }
    },

    texts: {
      recommend: { title: '採用推奨', body: '{name}は面接評価が優秀（{total}/{max}点）で、採用を強く推奨します。' },
      review: { title: '上長最終判断要', body: '{name}は面接評価が標準的（{total}/{max}点）です。面接評価を踏まえた上長の最終判断が必要です。' },
      reject: { title: '不採用推奨', body: '{name}は面接評価が低く（{total}/{max}点）、不採用を推奨します。' },
      disclaimer: '※本判定は基準統一のための参考値です。最終判断は上長が行います。',
      handoffIntro: '応募情報から自動抽出した留意点です。面接者へ共有し、面接時に確認してください。「要判断」は採用担当が面接実施の可否を判断する項目です。',
      bandLabels: { high: '高', mid: '中', low: '低' },
      // 2軸判定（面接評価×シフト貢献度）の本文。上の recommend/review/reject.body は面接のみ判定で使用
      matrix: {
        recommend: '{name}は面接評価{interviewPct}%（{interviewBand}）・シフト貢献度{contribPct}%（{contribBand}）で、採用を推奨します。',
        review: '{name}は面接評価{interviewPct}%（{interviewBand}）・シフト貢献度{contribPct}%（{contribBand}）です。上長の最終判断が必要です。',
        reject: '{name}は面接評価{interviewPct}%（{interviewBand}）・シフト貢献度{contribPct}%（{contribBand}）で、不採用を推奨します。'
      },
      // 調整（高校生の方針・未確認の留意点など）で結果が下がったときの本文。マスの注記はこのとき表示しない
      adjusted: '{name}は{scoreSummary}で点数上は{baseTitle}ですが、下記の理由により{resultTitle}とします。',
      busyIntro: '新宿は土日祝、特に3連休以上の連休・長期休暇の貢献を重視します。分からない期間は空欄のまま（面接で確認）で構いません。',
      allNightIntro: '終映後〜翌朝までの通し勤務（{allNightShiftStart}〜翌{allNightShiftEnd}目安）です。{lateNightStartHour}時以降の勤務（クローズ）とは別に確認します。',
      contributionIntro: '応募情報から計算したシフト貢献度の見込みです。「未確認」は面接で確認し、Step3「面接で確認する項目」で入力すると確定します。',
      // 入力の段階（面接前に入力／面接時に確認）まわりの文言
      preFillTitle: '面接前に分かっている項目があれば入力（任意）',
      preFillHint: '空欄のままで構いません。ここにある項目は面接で確認し、Step3「面接で確認する項目」で入力します。ここで入力した内容は Step3 にそのまま表示されます。',
      interviewConfirmIntro: '面接で確認した内容を入力してください。Step1 で入力済みの値も表示しています。ここで変えた内容は応募情報にも反映されます。* は判定の前に入力が必要です。',
      reviewerNotesIntro: '面接者が最初に読む欄です。応募書類・電話で気になった点、配慮が必要な事情、面接で確認してほしいことを自由に書いてください。申し送り文の冒頭に表示されます。',
      strengths: {
        open: 'オープン要員として期待できます',
        close: 'クローズ要員として期待できます',
        weekend: '土日両日の勤務が可能です',
        longTerm: '長期勤務希望で安定が見込めます',
        days3: '週{minDays}日以上の勤務が可能です',
        vacationOk: '繁忙期すべてに対応可能です',
        commuteNear: '通勤{commuteTime}分で通勤負担が小さいです',
        longShift: '1日{minShiftHours}時間以上の勤務が可能です',
        lateNightOk: '深夜帯（{lateNightStartHour}時以降）の勤務が可能です',
        allNightOk: 'オールナイト上映のシフトに入れます（{allNightFreq}）',
        holidayOk: '祝日も勤務できます',
        busyStrong: '繁忙期（3連休・長期休暇）の貢献が見込めます（{busyPct}%）'
      }
    }
  };

  global.RECRUIT_DEFAULT_PROFILE = DEFAULT_PROFILE;
})(window);
