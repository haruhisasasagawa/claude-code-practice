#!/usr/bin/env python3
"""DEV ONLY (never bundled): turn a LibreOffice golden JSON into a fixture for dev/mock_layers.js,
so the UI can be developed before the roster / view engine layers exist.

    python3 dev/make_fixture.py GOLDEN.json OUT.js

OUT.js defines globalThis.__MOCK__ = {roster, view}. Write OUT.js outside the repository
(e.g. the session scratchpad): it contains the staff names of the golden workbook.
"""
import json
import re
import sys


def main(src, out):
    d = json.load(open(src, encoding='utf-8'))
    db, dc, ro = d['ダッシュボード'], d['DB計算'], d['名簿']
    sl, su, st = d['スタッフ一覧'], d['全体サマリー'], d['設定']
    ho = d['祝日・繁忙日']
    g = lambda sh, c: sh.get(c, '')

    roster = {
        'period_label': g(ro, 'AY29'),
        'month_label': [g(ro, f'AY{21 + k}') for k in range(1, 7)],
        'paste_rows': [g(ro, f'AZ{21 + k}') or 0 for k in range(1, 7)],
        'paste_status': [g(ro, f'BA{21 + k}') for k in range(1, 7)],
        'month_order_warning': g(ro, 'AY30'), 'staff_cap_warning': g(ro, 'AY32'),
        'has_warning': g(ro, 'AY31') or 0,
        'total_staff': g(ro, 'AY2'), 'total_work_days': g(ro, 'AY3'), 'total_abs_days': g(ro, 'AY4'),
        'total_confirmed_days': g(ro, 'AY5'), 'total_att_rate': g(ro, 'AY6'), 'total_abs_rate': g(ro, 'AY7'),
        'total_evaluated': g(ro, 'AY8'), 'total_alert_count': g(ro, 'AY10'), 'total_busy_rate': g(ro, 'AY11'),
    }
    names = []
    for n in range(1, 401):
        v = g(ro, f'AT{n + 1}')
        if v == '':
            break
        names.append({'name': v, 'key': g(ro, f'AU{n + 1}')})
    roster['names'] = names
    cols = ['rank', 'name', 'id', 'dept', 'qual', 'work_days', 'absent_days', 'shift_days', 'attend_rate',
            'absent_rate', 'judgement', 'work_hours', 'avg_hours', 'night_hours', 'months', 'late_days', 'late_rate',
            'early_days', 'early_rate', 'busy_days', 'busy_rate', 'extra_apps', 'extra_apps_busy']
    letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W']
    mw = ['X', 'Y', 'Z', 'AA', 'AB', 'AC']
    ma = ['AD', 'AE', 'AF', 'AG', 'AH', 'AI']
    rows = []
    for r in range(6, 406):
        if g(sl, f'B{r}') == '':
            break
        row = {c: g(sl, f'{L}{r}') for c, L in zip(cols, letters)}
        row['month_work'] = [g(sl, f'{L}{r}') for L in mw]
        row['month_absent'] = [g(sl, f'{L}{r}') for L in ma]
        rows.append(row)
    lists = {
        'staff_period_text': g(sl, 'A2'),
        'staff_hdr_work': [g(sl, f'{L}5') for L in mw],
        'staff_hdr_absent': [g(sl, f'{L}5') for L in ma],
        'staff_rows': rows,
        'sum_title': g(su, 'A1'), 'sum_period_text': g(su, 'A2'),
        'sum_tile_staff_count': g(su, 'A5'), 'sum_tile_eval_count': g(su, 'C5'), 'sum_tile_attend_rate': g(su, 'E5'),
        'sum_tile_absent_rate': g(su, 'G5'), 'sum_tile_work_days': g(su, 'J5'), 'sum_tile_alert_count': g(su, 'K5'),
        'sum_dept_rows': [{k: g(su, f'{L}{r}') for k, L in zip(['name', 'headcount', 'work_days', 'absent_days', 'shift_days', 'attend_rate', 'absent_rate'], 'ABCDEFG')} for r in range(9, 29)],
        'sum_worst_title': g(su, 'J7'),
        'sum_worst_rows': [{k: g(su, f'{L}{r}') for k, L in zip(['name', 'dept', 'shift_days', 'absent_days', 'absent_rate'], 'JKLMN')} for r in range(9, 19)],
        'howto_warning': '',
    }
    roster['lists'] = lists
    sets = {'job_rowcount': [g(st, f'C{r}') for r in range(13, 33)], 'dept_rowcount': [g(st, f'C{r}') for r in range(38, 58)]}

    def cells(prefix_row_map):
        return prefix_row_map

    view = {
        'dashtop_title': g(db, 'B2'), 'dashtop_subtitle': g(db, 'B3'), 'dashtop_period': g(db, 'O2'), 'dashtop_status': g(db, 'O3'),
        'dashtop_staff_box': g(db, 'B7'), 'dashtop_sel_no': g(dc, 'AC3'),
        'dashtop_info_emp_no': g(db, 'J7'), 'dashtop_info_dept': g(db, 'N7'), 'dashtop_info_months': g(db, 'R7'),
        'dashtop_badge': g(db, 'V7'), 'dashtop_badge_criteria': g(db, 'V8'),
        'dashtop_th_good': g(dc, 'AC7'), 'dashtop_th_warn': g(dc, 'AC8'), 'dashtop_th_min_days': g(dc, 'AC9'), 'dashtop_th_alert': g(dc, 'AC56'),
        'dashtop_sel_att_rate': g(dc, 'AC6'), 'dashtop_sel_abs_rate': g(dc, 'AC57'), 'dashtop_sel_confirmed_days': g(dc, 'AC10'),
        'dashtop_kpi_work_days': g(db, 'B11'), 'dashtop_kpi_att_rate': g(db, 'F11'), 'dashtop_kpi_abs_days': g(db, 'J11'),
        'dashtop_kpi_abs_rate': g(db, 'N11'), 'dashtop_kpi_hours': g(db, 'R11'), 'dashtop_kpi_busy_rate': g(db, 'V11'),
        'dashtop_kpi_work_days_sub': g(db, 'B13'), 'dashtop_kpi_att_rate_sub': g(db, 'F13'), 'dashtop_kpi_abs_days_sub': g(db, 'J13'),
        'dashtop_kpi_abs_rate_sub': g(db, 'N13'), 'dashtop_kpi_hours_sub': g(db, 'R13'), 'dashtop_kpi_busy_rate_sub': g(db, 'V13'),
        'dashtop_summary': g(db, 'B15'), 'dashtop_warning': g(db, 'B16'),
        'dashtop_ring_work': g(dc, 'AC12'), 'dashtop_ring_abs': g(dc, 'AC13'), 'dashtop_ring_center_value': g(db, 'D23'),
        'dashtop_ring_legend_work': g(db, 'C30'), 'dashtop_ring_legend_abs': g(db, 'F30'),
        'dashtop_month_label': [g(dc, f'AB{r}') for r in range(46, 52)],
        'dashtop_month_work': [g(dc, f'AC{r}') for r in range(46, 52)],
        'dashtop_month_abs': [g(dc, f'AD{r}') for r in range(46, 52)],
        'dashtop_job_label': [g(dc, f'AB{r}') for r in range(72, 93)],
        'dashtop_job_hours': [g(dc, f'AC{r}') for r in range(72, 93)],
        'dashtop_job_share': [g(dc, f'AD{r}') for r in range(72, 93)],
        'dashtop_job_legend_idx': [g(dc, f'AF{r}') for r in range(72, 93)],
        'dashtop_job_center_value': g(db, 'T23'),
        'dashtop_job_legend_slot': [g(db, c) for c in ['R30', 'T30', 'V30', 'R31', 'T31', 'V31']],
        'dashtop_wd_label': [g(dc, f'AB{r}') for r in range(25, 32)],
        'dashtop_wd_work_days': [g(dc, f'AC{r}') for r in range(25, 32)],
        'dashtop_band_label': [g(dc, f'AB{r}') for r in range(306, 311)],
        'dashtop_band_self': [g(dc, f'AC{r}') for r in range(306, 311)],
        'dashtop_band_all': [g(dc, f'AD{r}') for r in range(306, 311)],
        'dashtop_band_dept': [g(dc, f'AE{r}') for r in range(306, 311)],
        'dashtop_rest_count': {'事前': g(dc, 'AC39'), '前日': g(dc, 'AC40'), '当日': g(dc, 'AC41'), '事後': g(dc, 'AC42')},
        'dashtop_timing_late': g(db, 'V42'), 'dashtop_timing_early': g(db, 'V44'), 'dashtop_timing_note': g(db, 'R46'),
        'dashbottom_month_label': [g(db, f'B{r}') for r in range(52, 58)],
    }
    for k, L in [('work_days', 'F'), ('abs_days', 'H'), ('confirmed_days', 'J'), ('att_rate', 'M'), ('work_hours', 'P'),
                 ('avg_hours', 'S'), ('busy_work_days', 'U'), ('prevday_rest_days', 'W')]:
        view['dashbottom_month_' + k] = [g(db, f'{L}{r}') for r in range(52, 58)]
        view['dashbottom_month_total_' + k] = g(db, f'{L}58')
    abs_rows = []
    for r in range(63, 75):
        abs_rows.append({k: g(db, f'{L}{r}') for k, L in zip(['date', 'weekday', 'kind_label', 'updated', 'orig_time', 'new_time', 'job_label'], 'BEFJMQU')})
    view['dashbottom_abs_row'] = abs_rows
    view['dashbottom_abs_footnote'] = g(db, 'B75')
    view['dashbottom_busy_summary_line'] = g(db, 'B79')
    view['dashbottom_busy_extra_apps_line'] = g(db, 'B80')
    view['dashbottom_busy_runs_label'] = g(db, 'B81')
    view['dashbottom_busy_run_row'] = [{k: g(db, f'{L}{r}') for k, L in zip(['period', 'names', 'len', 'worked'], 'BMSV')} for r in range(83, 89)]
    view['dashbottom_busy_missed_cell'] = [g(db, f'{L}{r}') for r in range(90, 98) for L in 'BJR']
    view['dashbottom_busy_footnote'] = g(db, 'B98')

    hol = {'msg_count': g(ho, 'A12'), 'msg_format': g(ho, 'A13'), 'msg_range': g(ho, 'A14'), 'msg_coverage': g(ho, 'A15')}
    with open(out, 'w', encoding='utf-8') as f:
        f.write('globalThis.__MOCK__ = ' + json.dumps({'roster': roster, 'set': sets, 'hol': hol, 'view': view}, ensure_ascii=False) + ';\n')
    print('wrote', out, len(rows), 'staff rows')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
