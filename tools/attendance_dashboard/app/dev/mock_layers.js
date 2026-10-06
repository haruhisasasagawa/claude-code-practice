/* DEV ONLY (never bundled): stand-in AE.roster / AE.view layers fed by globalThis.__MOCK__
 * (made by dev/make_fixture.py from a golden workbook), so the UI can be exercised before the real
 * roster.js / view.js exist. Real engine files loaded later overwrite these definitions.
 * Every staff member gets the golden dashboard of the golden selection, with name / KPI values swapped
 * in from the スタッフ一覧 row — enough to check layout, navigation and printing, not numbers.
 */
(function (root) {
  'use strict';
  const AE = root.AE || (root.AE = {});
  const M = () => root.__MOCK__;
  if (!AE.roster) {
    AE.roster = {
      build(WB) {
        const m = M();
        if (!m) return {};
        const loaded = (WB.sheets || []).some(s => s && s.recordCount > 0);
        if (!loaded) return { period_label: '（CSV未貼付）', total_staff: 0, names: [] };
        Object.assign(WB.set || (WB.set = {}), m.set);
        return JSON.parse(JSON.stringify(m.roster));
      },
      filter(WB, q) {
        const names = (WB.roster && WB.roster.names) || [];
        if (!q) return names;
        const ql = String(q).toLowerCase();
        return names.filter(n => n.name.toLowerCase().indexOf(ql) >= 0 || String(n.key).indexOf(ql) >= 0);
      },
    };
  }
  if (!AE.view) {
    AE.view = {
      view(WB, name) {
        const m = M();
        if (!m || !WB.roster || !WB.roster.names || !WB.roster.names.length) {
          return { dashtop_title: '勤務実績ダッシュボード', dashtop_status: '集計対象 0名　　貼付済み 0ヶ月',
            dashtop_period: '対象期間　（CSV未貼付）', dashtop_badge: '－' };
        }
        const v = JSON.parse(JSON.stringify(m.view));
        const row = (WB.roster.lists.staff_rows || []).find(r => r.name === name);
        v.dashtop_staff_box = name;
        if (!row) {
          v.dashtop_sel_no = '';
          v.dashtop_warning = '「' + name + '」は名簿にありません。▼から選ぶか、上の黄色い欄に名前か従業員番号の一部を入れてください。';
          return v;
        }
        v.dashtop_info_emp_no = row.id;
        v.dashtop_info_dept = row.dept;
        v.dashtop_kpi_work_days = row.work_days;
        v.dashtop_kpi_att_rate = row.attend_rate;
        v.dashtop_kpi_abs_days = row.absent_days;
        v.dashtop_kpi_abs_rate = row.absent_rate;
        v.dashtop_kpi_hours = row.work_hours;
        v.dashtop_kpi_busy_rate = row.busy_rate;
        v.dashtop_sel_att_rate = row.attend_rate;
        v.dashtop_sel_abs_rate = row.absent_rate;
        v.dashtop_sel_confirmed_days = row.shift_days;
        v.dashtop_ring_work = row.work_days;
        v.dashtop_ring_abs = row.absent_days;
        v.dashtop_ring_center_value = row.attend_rate;
        v.dashtop_badge = row.judgement;
        v.dashtop_month_work = row.month_work;
        v.dashtop_month_abs = row.month_absent;
        return v;
      },
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
