/*
 * 判定エンジン（DOM非依存・純関数）
 * ----------------------------------------------------------------------
 * - interviewModel ほか : 面接チェックリスト（面接台本。○△× と総合判断の得点率・必須条件。docs/SPEC-checklist.md）
 * - checklistSummary    : 面接チェックリストの表示用ビューモデル（② 面接チェックリスト・③ 報告書・右サマリー・保存レポート・A4 報告で共用）
 * - evaluateScript      : 採用可否の判定（面接者の総合判断が基準。必須条件の不一致は不採用推奨。docs/SPEC-script-mode.md）
 * - scriptApplicantRows : 応募者情報の行（① 応募者の入力と台本のヘッダー）
 *
 * 劇場固有の数値・文言はすべて profile（config.default.js）から受け取る。
 * 2026-10-14 の面接特化で削除した判定は docs/SPEC-slim.md と docs/HANDOFF.md の「削除済み機能」を参照。
 */
;(function (global) {
  'use strict';

  const U = global.RecruitUtil;

  const RESULT_RANK = { reject: 0, review: 1, recommend: 2 };

  // ---------- 共通ヘルパー ----------
  // 0 を「未設定」と区別して読む（Number(x) || 既定 だと 0 が既定値に戻るため）
  function num(v, def) {
    const n = Number(v);
    return (v === '' || v == null || typeof v === 'boolean' || isNaN(n)) ? def : n;
  }
  function round1(x) { return Math.round(x * 10) / 10; }

  function categoryGroup(profile, value) {
    const c = (((profile || {}).options || {}).categories || []).find(function (x) { return x.value === value; });
    return c ? c.group : '';
  }

  function isStudentGroup(g) {
    return g === 'highschool' || g === 'university' || g === 'vocational';
  }

  function bandOf(pct, highPct, midPct) {
    return pct >= highPct ? 'high' : pct >= midPct ? 'mid' : 'low';
  }

  // ---------- 面接チェックリスト（面接台本。docs/SPEC-checklist.md 1・3 章） ----------
  // 台本は profile.checklist（ページ → セクション → ブロック → 項目）。回答は record.checklist（= state.checklist）。
  // 判定に効くのは must（必須条件）・rating（確認事項／確認点）・総合判断だけ。説明・質問・記入欄・合否連絡は記録用。
  const CHECKLIST_BLOCK_TYPES = ['must', 'fields', 'explain', 'question', 'rating', 'notify', 'note'];
  const CHECKLIST_FIELD_KINDS = ['text', 'date', 'month', 'choice'];
  const CHECKLIST_SCALE = 2;                       // ○△× と総合判断の満点（固定）
  const RATING_MARKS = {                           // 確認事項／確認点
    good: { mark: '○', label: '○ できている', points: 2, tone: 'ok' },
    fair: { mark: '△', label: '△ やや不安', points: 1, tone: 'warn' },
    poor: { mark: '×', label: '× できていない', points: 0, tone: 'danger' }
  };
  const OVERALL_POINTS = { hire: 2, hold: 1, reject: 0 };   // 総合判断（表示名は profile.checklist.overallOptions）
  const OVERALL_TONE = { hire: 'ok', hold: 'warn', reject: 'danger' };
  const OVERALL_DEFAULT_LABELS = { hire: '採用', hold: '保留', reject: '不採用' };
  const MUST_VALUES = {                            // 必須条件（'' = 未確認）
    match: { label: '一致', mark: '○', tone: 'ok' },
    mismatch: { label: '不一致', mark: '×', tone: 'danger' },
    '': { label: '未確認', mark: '－', tone: 'muted' }
  };
  const CHECKLIST_OVERALL_ID = '__overall';        // breakdown・scores 上の総合判断のキー（項目 id は英字始まりなので衝突しない）
  const MUST_FAIL_RESULTS = ['reject', 'review'];
  const MUST_UNKNOWN_RESULTS = ['none', 'review'];
  const OVERALL_CAP_VALUES = ['none', 'review', 'reject'];
  const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
  function circled(n) { return CIRCLED[n - 1] || ('(' + n + ')'); }

  function clDef(profile) { return (profile && U.isObj(profile.checklist)) ? profile.checklist : {}; }
  function clStr(v) { return v == null ? '' : String(v); }
  function oneOf(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  // 空の回答
  function emptyChecklist() {
    // header.negatives（消極属性）は 2026-10-13 に削除。旧レコードに残っていても読み飛ばす（docs/SPEC-script-mode.md 12 章）
    return { v: 1, header: { date: '', interviewer: '', posting: '', taxi: '' }, values: {}, notes: {}, overall: '' };
  }

  // 回答が 1 つでもあるか（header は数えない。面接日は自動で入るため）
  function checklistHasInput(cl) {
    if (!U.isObj(cl)) return false;
    const vals = U.isObj(cl.values) ? cl.values : {};
    const notes = U.isObj(cl.notes) ? cl.notes : {};
    if (Object.keys(vals).some(function (k) { const v = vals[k]; return v != null && v !== '' && v !== false; })) return true;
    if (Object.keys(notes).some(function (k) { return clStr(notes[k]).trim() !== ''; })) return true;
    return !!cl.overall;
  }

  // 台本順の項目一覧 [{ item, block, section, sectionIndex, no, noMark }]（type 省略で全項目）
  function checklistItems(def, type) {
    const out = [];
    const secs = def && Array.isArray(def.sections) ? def.sections : [];
    let n = 0;
    secs.forEach(function (sec) {
      if (!U.isObj(sec)) return;
      const idx = n++;
      (Array.isArray(sec.blocks) ? sec.blocks : []).forEach(function (b) {
        if (!U.isObj(b) || (type && b.type !== type)) return;
        (Array.isArray(b.items) ? b.items : []).forEach(function (it) {
          if (!U.isObj(it)) return;
          out.push({ item: it, block: b, section: sec, sectionIndex: idx, no: idx + 1, noMark: circled(idx + 1) });
        });
      });
    });
    return out;
  }

  function ratingValue(cl, id) {
    const v = U.isObj(cl) && U.isObj(cl.values) ? cl.values[id] : '';
    return RATING_MARKS[v] ? v : '';
  }
  function mustValue(cl, id) {
    const v = U.isObj(cl) && U.isObj(cl.values) ? cl.values[id] : '';
    return v === 'match' || v === 'mismatch' ? v : '';
  }
  function overallValue(cl) {
    const v = U.isObj(cl) ? cl.overall : '';
    return OVERALL_POINTS[v] != null ? v : '';
  }
  function overallLabelOf(def, v) {
    const o = U.isObj(def.overallOptions) ? def.overallOptions : {};
    return v ? (clStr(o[v]) || OVERALL_DEFAULT_LABELS[v]) : '';
  }

  // 面接評価の項目・点の出どころ（確認点〔rating〕の ○△× ＋ 総合判断 2/1/0）。② 面接チェックリスト・右サマリー・報告書・設定画面で共用
  //   2026-10-14 に旧形式（10 項目×5 点の evaluation.items）を削除（docs/SPEC-slim.md D7）。mode は 'checklist' 固定
  function interviewModel(profile, cl) {
    profile = profile || {};
    cl = U.isObj(cl) ? cl : emptyChecklist();
    const ev = profile.evaluation || {};
    const def = clDef(profile);
    const ratings = checklistItems(def, 'rating');
    const clNotes = U.isObj(cl.notes) ? cl.notes : {};
    const marks = {}, notes = {}, sc = {};
    const counts = { good: 0, fair: 0, poor: 0, blank: 0 };
    const items = ratings.map(function (x) {
      return {
        id: x.item.id, label: clStr(x.item.label), hint: clStr(x.item.hint), isOverall: false,
        sectionId: x.section.id, sectionNo: x.no, sectionTitle: clStr(x.section.title)
      };
    });
    items.push({ id: CHECKLIST_OVERALL_ID, label: clStr(def.overallLabel) || '面接者の総合判断', hint: '', isOverall: true,
      sectionId: '', sectionNo: null, sectionTitle: '' });
    ratings.forEach(function (x) {
      const id = x.item.id, v = ratingValue(cl, id);
      if (v) { sc[id] = RATING_MARKS[v].points; marks[id] = v; counts[v]++; } else counts.blank++;
      if (clStr(clNotes[id]).trim()) notes[id] = clStr(clNotes[id]);
    });
    const ov = overallValue(cl);
    if (ov) { sc[CHECKLIST_OVERALL_ID] = OVERALL_POINTS[ov]; marks[CHECKLIST_OVERALL_ID] = ov; }
    let total = 0, rated = 0;
    const unrated = [];
    items.forEach(function (it) {
      const s = sc[it.id];
      if (s == null) { unrated.push(it.id); return; }
      total += s; rated++;
    });
    const max = items.length * CHECKLIST_SCALE;
    const pct = max ? Math.round((total / max) * 1000) / 10 : 0;
    const th = ev.thresholds || {};
    const band = rated ? bandOf(pct, num(th.recommendPct, 70), num(th.reviewPct, 40)) : null;
    const bl = ((profile.texts || {}).bandLabels) || {};
    return {
      mode: 'checklist', items: items, scale: CHECKLIST_SCALE, scores: sc, overallItemId: CHECKLIST_OVERALL_ID,
      marks: marks, notes: notes, counts: counts,
      total: total, max: max, pct: pct, rated: rated, ratable: items.length, unrated: unrated,
      band: band, bandLabel: band ? (bl[band] || { high: '高', mid: '中', low: '低' }[band]) : ''
    };
  }

  // 必須条件の集計
  function mustSummary(def, cl) {
    const out = { items: [], total: 0, match: 0, mismatch: 0, unknown: 0, mismatchLabels: [], unknownLabels: [] };
    checklistItems(def || {}, 'must').forEach(function (x) {
      const v = mustValue(cl, x.item.id), mv = MUST_VALUES[v], label = clStr(x.item.label);
      out.items.push({ id: x.item.id, label: label, sectionNo: x.no, sectionId: x.section.id, value: v, valueLabel: mv.label, mark: mv.mark, tone: mv.tone });
      out.total++;
      if (v === 'match') out.match++;
      else if (v === 'mismatch') { out.mismatch++; out.mismatchLabels.push(label); }
      else { out.unknown++; out.unknownLabels.push(label); }
    });
    return out;
  }

  // 表示用のビューモデル（② 面接チェックリスト・③ 報告書・右サマリー・レポート・A4 報告で共用）。opts = { management }
  function checklistSummary(applicant, cl, profile, opts) {
    opts = opts || {};
    profile = profile || {};
    cl = U.isObj(cl) ? cl : emptyChecklist();
    const def = clDef(profile);
    const vals = U.isObj(cl.values) ? cl.values : {};
    const notes = U.isObj(cl.notes) ? cl.notes : {};
    const hdr = U.isObj(cl.header) ? cl.header : {};
    const dh = U.isObj(def.header) ? def.header : {};
    const model = interviewModel(profile, cl);

    // ヘッダー
    const posting = clStr(hdr.posting);
    const postingOpt = ((U.isObj(dh.posting) && Array.isArray(dh.posting.options)) ? dh.posting.options : []).find(function (x) { return x && x.value === posting; });
    const mg = U.isObj(opts.management) ? opts.management : {};
    const stamp = dh.interviewerField && U.isObj(mg[dh.interviewerField]) ? clStr(mg[dh.interviewerField].name) : '';
    const ivName = clStr(hdr.interviewer).trim();
    const taxiOv = clStr(hdr.taxi).trim();
    const header = {
      date: clStr(hdr.date), posting: posting, postingLabel: postingOpt ? clStr(postingOpt.label) : '',
      interviewer: ivName || stamp, interviewerFromStamp: !ivName && !!stamp,
      taxi: { text: taxiOv, tone: taxiOv ? 'info' : 'muted', auto: false }
    };

    // 必須条件
    const must = mustSummary(def, cl);

    // 確認点・総合判断
    const ratings = checklistItems(def, 'rating').map(function (x) {
      const v = ratingValue(cl, x.item.id), rm = RATING_MARKS[v];
      return {
        id: x.item.id, label: clStr(x.item.label), hint: clStr(x.item.hint), sectionId: x.section.id, sectionNo: x.no, noMark: x.noMark,
        value: v, mark: rm ? rm.mark : '', points: rm ? rm.points : null, tone: rm ? rm.tone : 'muted', note: clStr(notes[x.item.id])
      };
    });
    const ov = overallValue(cl);
    const overall = { value: ov, label: overallLabelOf(def, ov), points: ov ? OVERALL_POINTS[ov] : null, tone: ov ? OVERALL_TONE[ov] : 'muted' };

    // セクション
    let minutesTotal = 0;
    const sections = [];
    (Array.isArray(def.sections) ? def.sections : []).filter(function (s) { return U.isObj(s); }).forEach(function (sec, i) {
      const minutes = Math.max(0, Math.floor(num(sec.minutes, 0)));
      minutesTotal += minutes;
      let mustMismatch = 0, gradable = 0, answered = 0, checkable = 0, checked = 0;
      const blocks = (Array.isArray(sec.blocks) ? sec.blocks : []).filter(function (b) { return U.isObj(b); }).map(function (b) {
        const items = (Array.isArray(b.items) ? b.items : []).filter(function (it) { return U.isObj(it); }).map(function (it) {
          const r = Object.assign({}, it);
          r.note = clStr(notes[it.id]);
          r.dim = false;
          if (b.type === 'must') {
            const v = mustValue(cl, it.id), mv = MUST_VALUES[v];
            r.value = v; r.valueLabel = mv.label; r.mark = mv.mark; r.tone = mv.tone;
            gradable++; if (v) answered++;
            if (v === 'mismatch') mustMismatch++;
            r.effective = mv.label;
          } else if (b.type === 'rating') {
            const v = ratingValue(cl, it.id), rm = RATING_MARKS[v];
            r.value = v; r.mark = rm ? rm.mark : ''; r.points = rm ? rm.points : null; r.tone = rm ? rm.tone : 'muted';
            gradable++; if (v) answered++;
            r.effective = r.mark;
          } else if (b.type === 'explain' || b.type === 'notify') {
            r.value = vals[it.id] === true;
            r.dim = b.type === 'explain' && it.shortOnly === true && posting !== 'short';
            checkable++; if (r.value) checked++;
            r.effective = r.value;
          } else if (b.type === 'fields') {
            const v = clStr(vals[it.id]);
            r.value = v;
            r.effective = v;
            if (it.kind === 'choice') {
              const opt = (Array.isArray(it.options) ? it.options : []).find(function (x) { return x && x.value === r.effective; });
              r.effectiveLabel = opt ? clStr(opt.label) : clStr(r.effective);
            } else r.effectiveLabel = clStr(r.effective);
          } else {
            r.value = vals[it.id] == null ? '' : vals[it.id];
            r.effective = r.value;
          }
          return r;
        });
        return {
          id: b.id, type: b.type, title: clStr(b.title), note: clStr(b.note), memo: b.memo === true, memoLabel: clStr(b.memoLabel),
          memoText: clStr(notes[b.id]), items: items
        };
      });
      const no = i + 1;
      sections.push({
        id: sec.id, no: no, noMark: circled(no), title: clStr(sec.title), minutes: minutes, minutesMax: sec.minutesMax === true,
        minutesText: minutes ? (sec.minutesMax === true ? '最大' : '') + minutes + '分' : '',
        page: Math.max(1, Math.floor(num(sec.page, 1))), lead: clStr(sec.lead),
        mustMismatch: mustMismatch,
        done: gradable ? answered === gradable : (checkable ? checked === checkable : false),
        answered: answered, gradable: gradable,
        blocks: blocks
      });
    });

    return {
      def: def, hasInput: checklistHasInput(cl),
      header: header, must: must, ratings: ratings, overall: overall,
      score: { total: model.total, max: model.max, pct: model.pct, band: model.band, bandLabel: model.bandLabel,
        rated: model.rated, ratable: model.ratable, counts: model.counts },
      sections: sections,
      pages: Array.isArray(def.pages) ? def.pages : [],
      minutesTotal: minutesTotal
    };
  }

  // 確認点（rating 項目）の差。defA=保存時、defB=現在 → { added: B にだけある id, removed: A にだけある id }
  function checklistDiff(defA, defB) {
    const a = checklistItems(defA || {}, 'rating').map(function (x) { return x.item.id; });
    const b = checklistItems(defB || {}, 'rating').map(function (x) { return x.item.id; });
    return {
      added: b.filter(function (id) { return a.indexOf(id) < 0; }),
      removed: a.filter(function (id) { return b.indexOf(id) < 0; })
    };
  }

  // ---------- 採用可否判定（docs/SPEC-script-mode.md） ----------
  //   結果は面接者の総合判断が基準（採用 → 採用推奨・保留 → 上長最終判断要・不採用 → 不採用推奨）。必須条件の不一致は不採用推奨
  const OVERALL_RESULT = { hire: 'recommend', hold: 'review', reject: 'reject' };   // 総合判断 → 台本モードの結果
  const DEFAULT_SCRIPT_TEXTS = {
    recommend: '{name}は面接者の総合判断が「{overallLabel}」です（面接評価 {total}/{max}点・{pct}%）。採用を推奨します。',
    review: '{name}は面接者の総合判断が「{overallLabel}」です（面接評価 {total}/{max}点・{pct}%）。上長の最終判断が必要です。',
    reject: '{name}は面接者の総合判断が「{overallLabel}」です（面接評価 {total}/{max}点・{pct}%）。不採用を推奨します。',
    missing: '{name}は面接者の総合判断が未入力です（面接評価 {total}/{max}点・{pct}%）。上長の最終判断が必要です。',
    mustGate: '{name}は必須条件（{mustLabels}）が一致しないため、面接者の総合判断・面接評価にかかわらず{resultTitle}とします。',
    adjusted: '{name}は面接者の総合判断が「{overallLabel}」（面接評価 {total}/{max}点）ですが、下記の理由により{resultTitle}とします。'
  };

  // 「応募者情報」の行（台本順。空の行は省く）。アプリの ② のヘッダー・右サマリーと保存 HTML で共用
  //   → [{ key, label, value }]
  function scriptApplicantRows(applicant, cl, profile, management) {
    const a = U.isObj(applicant) ? applicant : {};
    const h = U.isObj(cl) && U.isObj(cl.header) ? cl.header : {};
    const def = clDef(profile);
    const dh = U.isObj(def.header) ? def.header : {};
    const mg = U.isObj(management) ? management : {};
    const rows = [];
    const add = function (key, label, value) {
      const v = clStr(value).trim();
      if (v) rows.push({ key: key, label: label, value: v });
    };
    add('name', '氏名', a.name);
    add('age', '年齢', clStr(a.age).trim() ? clStr(a.age).trim() + '歳' : '');
    add('gender', '性別', a.gender);
    add('category', '区分', a.category);
    const gm = /^(\d{4})-(\d{2})$/.exec(clStr(a.graduationDate).trim());
    add('graduation', '卒業予定年月', gm ? gm[1] + '年' + Number(gm[2]) + '月' : a.graduationDate);
    const posting = U.isObj(dh.posting) ? dh.posting : {};
    const pv = clStr(h.posting);
    const pOpt = pv ? (Array.isArray(posting.options) ? posting.options : []).find(function (o) { return U.isObj(o) && clStr(o.value) === pv; }) : null;
    add('posting', clStr(posting.label) || '応募した求人', pOpt ? (clStr(pOpt.label) || clStr(pOpt.value)) : '');
    // 消極属性（header.negatives）は 2026-10-13 に削除。旧レコードに残っていても出さない
    add('taxi', 'タクシー可否・料金', h.taxi);
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clStr(h.date).trim());
    add('date', '面接日', dm ? dm[1] + '/' + dm[2] + '/' + dm[3] : h.date);
    const iv = clStr(h.interviewer).trim();
    const stamp = dh.interviewerField && U.isObj(mg[dh.interviewerField]) ? clStr(mg[dh.interviewerField].name) : '';
    add('interviewer', '面接担当者', iv || stamp);
    add('notes', 'メモ', a.reviewerNotes);   // Step① の入力欄「メモ（任意）」と同じ呼び名（報告書・保存 HTML の応募者情報も「メモ」）
    return rows;
  }

  // 採用可否の判定（DOM 非依存）。基準は面接者の総合判断（採用→採用推奨・保留→上長最終判断要・不採用→不採用推奨・未入力→上長最終判断要）。
  //   必須条件の規則・overallCaps は既存の設定値を使い、結果は下げる方向のみ。○△× は面接評価（点数・帯）として報告する。
  //   戻り値は record.judgment と同じ形（mode: 'script'。保存済みの記録と形を揃えるため、使わないキーも null で残す）
  function evaluateScript(applicant, cl, profile, opts) {
    const a = U.isObj(applicant) ? applicant : {};
    profile = U.isObj(profile) ? profile : {};
    cl = U.isObj(cl) ? cl : emptyChecklist();
    const def = clDef(profile);
    const texts = U.isObj(profile.texts) ? profile.texts : {};
    const ev = U.isObj(profile.evaluation) ? profile.evaluation : {};
    const model = interviewModel(profile, cl);
    const breakdown = model.items.map(function (it) {
      const raw = model.scores[it.id];
      const s = raw === undefined || raw === null || raw === '' ? null : Number(raw);
      const mk = model.marks[it.id] || '';
      return {
        id: it.id, label: it.label, score: isNaN(s) ? null : s, isOverall: it.id === model.overallItemId,
        mark: mk, markLabel: !mk ? '' : it.isOverall ? overallLabelOf(def, mk) : RATING_MARKS[mk].mark,
        sectionId: it.sectionId, sectionNo: it.sectionNo, sectionTitle: it.sectionTitle, note: model.notes[it.id] || ''
      };
    });
    const total = model.total, max = model.max, pct = model.pct;
    const th = ev.thresholds || {};
    const recPct = num(th.recommendPct, 70);
    const revPct = num(th.reviewPct, 40);
    const iBand = bandOf(pct, recPct, revPct);
    const bl = texts.bandLabels || {};
    const bandLabel = function (b) { return b ? (bl[b] || { high: '高', mid: '中', low: '低' }[b]) : ''; };
    const must = mustSummary(def, cl);
    const mustFailResult = oneOf(def.mustFailResult, MUST_FAIL_RESULTS, 'reject');
    const mustGate = must.mismatch > 0 && mustFailResult === 'reject';
    const ov = overallValue(cl);
    const ovl = overallLabelOf(def, ov);
    const titleOf = function (r) { return (texts[r] || {}).title || r; };
    const counts = model.counts || { good: 0, fair: 0, poor: 0, blank: 0 };
    let result = ov ? OVERALL_RESULT[ov] : 'review';
    const baseResult = result;

    const warnings = [];
    if (!mustGate) {
      // 必須条件の不一致で面接を打ち切ったとき（不採用推奨）は確認点・総合判断の入力は不要
      const unRated = breakdown.filter(function (b) { return !b.isOverall && b.score == null; }).length;
      if (unRated) warnings.push('未入力の確認点が' + unRated + '件あります（0点として集計）。');
      if (!ov) warnings.push('面接者の総合判断が未入力です（結果は' + titleOf('review') + 'として扱います）。');
    }

    // 調整（下げる方向のみ。実際に変わったときだけ記録）
    const adjustments = [];
    function down(to, code, reason, alwaysWarn) {
      const from = result;
      if (RESULT_RANK[to] < RESULT_RANK[from]) {
        result = to;
        adjustments.push({ code: code, from: from, to: to, reason: reason });
        warnings.push(reason);
      } else if (alwaysWarn) {
        warnings.push(reason);
      }
    }
    // (a) 必須条件の不一致（台本: 不一致なら不採用。設定で上長最終判断要）
    if (must.mismatch > 0) {
      const ml = must.mismatchLabels.join('、');
      if (mustGate) {
        // 結論の理由は必須条件なので、結果が変わらなくても必ず adjustments と warnings の先頭に記録する
        const reason = '必須条件が一致しないため（' + ml + '）、不採用推奨とします。';
        adjustments.push({ code: 'must_conditions', from: result, to: 'reject', reason: reason });
        result = 'reject';
        warnings.unshift(reason);
      } else {
        down('review', 'must_conditions', '必須条件が一致しないため（' + ml + '）、採用推奨ではなく上長最終判断要として扱います。', true);
      }
    }
    // (b) 必須条件の未確認（既定は警告のみ。設定で採用推奨に留めない）
    if (must.mismatch === 0 && must.unknown > 0) {
      const ul = must.unknownLabels.join('、');
      if (oneOf(def.mustUnknownResult, MUST_UNKNOWN_RESULTS, 'none') === 'review') {
        down('review', 'must_unconfirmed', '必須条件に未確認があるため（' + ul + '）、採用推奨ではなく上長最終判断要として扱います。面接チェックリストの ① で一致／不一致を入力してください。', true);
      } else {
        warnings.push('必須条件に未確認が' + must.unknown + '件あります（' + ul + '）。面接で確認してください。');
      }
    }
    // (c) 総合判断の上限（overallCaps）。基準が総合判断なので、既定値では調整は起きない（厳しくしたときだけ下がる）
    if (ov) {
      const caps = U.isObj(def.overallCaps) ? def.overallCaps : {};
      const tail = function (cap) { return cap === 'reject' ? '不採用推奨とします。' : '採用推奨ではなく上長最終判断要として扱います。'; };
      if (ov === 'reject') {
        const cap = oneOf(caps.reject, OVERALL_CAP_VALUES, 'reject');
        if (cap !== 'none') down(cap, 'overall_cutoff', '面接者の総合判断が「' + ovl + '」のため、' + tail(cap));
      } else if (ov === 'hold') {
        const cap = oneOf(caps.hold, OVERALL_CAP_VALUES, 'review');
        if (cap !== 'none') down(cap, 'overall_hold', '面接者の総合判断が「' + ovl + '」のため、' + tail(cap));
      }
    }
    // (d) ○△× と総合判断の食い違い（結果は変えない）
    if (!mustGate && ov === 'hire' && counts.poor > 0) {
      const poorLabels = breakdown.filter(function (b) { return !b.isOverall && b.mark === 'poor'; }).map(function (b) { return b.label; });
      warnings.push('確認点に × が' + counts.poor + '件あります（' + poorLabels.join('、') + '）。総合判断「' + ovl + '」と合わせて確認してください。');
    }

    // 強み・懸念（○ = 強み、× = 懸念、総合判断は除く）
    const scale = model.scale;
    const withNote = function (b) { return b.note ? b.label + '（' + b.note + '）' : b.label; };
    const strengths = breakdown.filter(function (b) { return b.score != null && !b.isOverall && b.score / scale >= 0.8; }).map(withNote);
    const concerns = breakdown.filter(function (b) { return b.score != null && !b.isOverall && b.score / scale <= 0.4; }).map(withNote);

    // 本文（texts.script。空のキーは既定の文）
    const scIn = U.isObj(texts.script) ? texts.script : {};
    const sc = {};
    Object.keys(DEFAULT_SCRIPT_TEXTS).forEach(function (k) { sc[k] = typeof scIn[k] === 'string' && scIn[k].trim() ? scIn[k] : DEFAULT_SCRIPT_TEXTS[k]; });
    const lowered = adjustments.length > 0 && result !== baseResult;
    const tpl = mustGate ? sc.mustGate : lowered ? sc.adjusted : !ov ? sc.missing : sc[result];
    const vars = {
      name: a.name ? a.name + 'さん' : '応募者', overallLabel: ovl || '未入力', total: total, max: max, pct: pct, band: bandLabel(iBand),
      marks: '○' + counts.good + ' △' + counts.fair + ' ×' + counts.poor, mustLabels: must.mismatchLabels.join('、'),
      resultTitle: titleOf(result), baseTitle: titleOf(baseResult)
    };
    const ovPoints = ov ? OVERALL_POINTS[ov] : null;

    return {
      result: result,
      title: titleOf(result),
      body: U.fill(tpl, vars),
      disclaimer: texts.disclaimer || '',
      total: total, max: max, pct: pct,
      thresholds: {
        recommendPct: recPct, reviewPct: revPct,
        recommendPts: Math.ceil((max * recPct) / 100),
        reviewPts: Math.ceil((max * revPct) / 100)
      },
      breakdown: breakdown,
      strengths: strengths,
      concerns: concerns,
      warnings: warnings,
      unresolved: [],
      adjusted: adjustments.length > 0,
      evaluatedAt: (opts && opts.now ? new Date(opts.now) : new Date()).toISOString(),
      mode: 'script',
      interview: { total: total, max: max, pct: pct, band: iBand, bandLabel: bandLabel(iBand) },
      contribution: null,
      matrix: null,
      highschool: null,
      baseResult: baseResult,
      adjustments: adjustments,
      interviewMode: 'checklist',
      scaleMax: CHECKLIST_SCALE,
      checklist: { version: clStr(def.version), counts: counts, overall: { value: ov, label: ovl, points: ovPoints }, must: must },
      must: must,   // checklist.must と同じ（台本モードの描画用の別名）
      overall: { value: ov, label: ovl, points: ovPoints, tone: ov ? OVERALL_TONE[ov] : 'muted' }
    };
  }

  global.RecruitRules = {
    RESULT_RANK: RESULT_RANK,
    num: num,
    round1: round1,
    bandOf: bandOf,
    categoryGroup: categoryGroup,
    isStudentGroup: isStudentGroup,
    // 面接チェックリスト（SPEC-checklist）
    CHECKLIST_BLOCK_TYPES: CHECKLIST_BLOCK_TYPES,
    CHECKLIST_FIELD_KINDS: CHECKLIST_FIELD_KINDS,
    CHECKLIST_SCALE: CHECKLIST_SCALE,
    RATING_MARKS: RATING_MARKS,
    OVERALL_POINTS: OVERALL_POINTS,
    OVERALL_TONE: OVERALL_TONE,
    MUST_VALUES: MUST_VALUES,
    CHECKLIST_OVERALL_ID: CHECKLIST_OVERALL_ID,
    MUST_FAIL_RESULTS: MUST_FAIL_RESULTS,
    MUST_UNKNOWN_RESULTS: MUST_UNKNOWN_RESULTS,
    OVERALL_CAP_VALUES: OVERALL_CAP_VALUES,
    circled: circled,
    emptyChecklist: emptyChecklist,
    checklistHasInput: checklistHasInput,
    checklistItems: checklistItems,
    interviewModel: interviewModel,
    mustSummary: mustSummary,
    checklistSummary: checklistSummary,
    checklistDiff: checklistDiff,
    // 判定（SPEC-script-mode）
    OVERALL_RESULT: OVERALL_RESULT,
    DEFAULT_SCRIPT_TEXTS: DEFAULT_SCRIPT_TEXTS,
    scriptApplicantRows: scriptApplicantRows,
    evaluateScript: evaluateScript
  };
})(window);
