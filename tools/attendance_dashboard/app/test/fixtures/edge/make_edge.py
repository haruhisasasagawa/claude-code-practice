"""Synthetic edge-case CSVs for the engine parity case `edge` (no real data; every name is fake).

Regenerate (from this directory):
  python3 make_edge.py
  python3 ../../../../build_dashboard.py edge_raw.xlsx --csv edge1.csv edge2.csv edge3.csv - edge5.csv edge6.csv \
          --maxrows 80 --select 'テスト二郎C'
  LibreOffice recalculation of edge_raw.xlsx (headless calculateAll + store, e.g. the xlsx skill's recalc.py),
  then dump the cached values with the golden dump script (dump_cells.py) to edge_golden.json.
Covers: wildcard / short / missing / permuted / duplicate headers, an extra column, an empty line, a quoted newline,
text and odd staff numbers, text / blank / full-width / other-month dates, holidays and weekends, all rest timings,
blank and text 更新時間, same-day time changes (incl. 10:Q15), work + rest on one day (Q22), statuses and kinds,
night shifts, one-sided breaks, text times, 相談応募, numeric 職種 codes.
"""
import csv, datetime as dt, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[4]))      # tools/attendance_dashboard
os.chdir(Path(__file__).resolve().parent)
import build_dashboard as bd
H = list(bd.CSV_HEADERS)
JST = dt.timezone(dt.timedelta(hours=9))
def ms(y, m, d, hh=12, mm=0):
    return str(int(dt.datetime(y, m, d, hh, mm, tzinfo=JST).timestamp() * 1000))
def row(**kw):
    base = {'募集シフトの日付': '2026/09/01', '募集店舗': 'TC新宿', '応募ステータス': '確定（シフト作成）',
            '募集シフトの開始時間': '10:00', '募集シフトの終了時間': '18:00', '募集シフトの職種': '02コンセ',
            '募集シフトの資格': '01アルバイト', '応募者の名前': 'テスト一郎T', '応募者の従業員番号': '9000001',
            '応募者の所属店舗': 'TC新宿', '応募者の職種': '02コンセ', '応募者の資格': '01アルバイト', '時給': '1200',
            '勤務店舗コード': '076', '所属店舗コード': '076', '更新時間': ms(2026, 8, 20), 'スケジュールID': 'x', 'パターン名': 'p', '勤務種別': '1'}
    base.update(kw)
    return base
R = []
add = lambda **kw: R.append(row(**kw))
# 1-2 two work rows on one person-day, breaks
add(**{'休憩1開始時間': '13:00', '休憩1終了時間': '14:00'})
add(**{'募集シフトの開始時間': '19:00', '募集シフトの終了時間': '22:00'})
# 3-5 same-day time changes (AY / AZ / both)
add(**{'応募者の従業員番号': '9000002', '応募者の名前': 'テスト二郎C', '募集シフトの日付': '2026/09/02', '変更後の開始時間': '11:00', '変更後の終了時間': '18:00', '更新時間': ms(2026, 9, 2, 8)})
add(**{'応募者の従業員番号': '9000002', '応募者の名前': 'テスト二郎C', '募集シフトの日付': '2026/09/03', '変更後の開始時間': '10:00', '変更後の終了時間': '16:30', '更新時間': ms(2026, 9, 3, 0, 1)})
add(**{'応募者の従業員番号': '9000002', '応募者の名前': 'テスト二郎C', '募集シフトの日付': '2026/09/04', '変更後の開始時間': '12:00', '変更後の終了時間': '17:00', '更新時間': ms(2026, 9, 4, 23, 59)})
# 6 Q15: early leave on the first row, late start on a later row of the same person-day
add(**{'応募者の従業員番号': '9000002', '応募者の名前': 'テスト二郎C', '募集シフトの日付': '2026/09/08', '変更後の開始時間': '10:00', '変更後の終了時間': '15:00', '更新時間': ms(2026, 9, 8, 9)})
add(**{'応募者の従業員番号': '9000002', '応募者の名前': 'テスト二郎C', '募集シフトの日付': '2026/09/08', '募集シフトの開始時間': '16:00', '募集シフトの終了時間': '20:00', '変更後の開始時間': '17:00', '変更後の終了時間': '20:00', '更新時間': ms(2026, 9, 8, 9)})
# 7-13 rest rows: same-day full-day, same-day partial, previous day, after, blank 更新時間 (Q4), text 更新時間, blank posted start (Q9)
rest = {'勤務種別': '4', '変更後の開始時間': '5:00', '変更後の終了時間': '29:00'}
add(**rest, **{'応募者の従業員番号': '9000003', '応募者の名前': 'テスト三子F', '募集シフトの日付': '2026/09/09', '募集シフトの開始時間': '5:00', '募集シフトの終了時間': '29:00', '更新時間': ms(2026, 9, 9, 7)})
add(**rest, **{'応募者の従業員番号': '9000003', '応募者の名前': 'テスト三子F', '募集シフトの日付': '2026/09/10', '募集シフトの開始時間': '14:00', '募集シフトの終了時間': '18:00', '更新時間': ms(2026, 9, 10, 7)})
add(**rest, **{'応募者の従業員番号': '9000003', '応募者の名前': 'テスト三子F', '募集シフトの日付': '2026/09/11', '更新時間': ms(2026, 9, 10, 22)})
add(**rest, **{'応募者の従業員番号': '9000003', '応募者の名前': 'テスト三子F', '募集シフトの日付': '2026/09/12', '更新時間': ms(2026, 9, 13, 10)})
add(**rest, **{'応募者の従業員番号': '9000003', '応募者の名前': 'テスト三子F', '募集シフトの日付': '2026/09/14', '更新時間': ''})
add(**rest, **{'応募者の従業員番号': '9000003', '応募者の名前': 'テスト三子F', '募集シフトの日付': '2026/09/15', '更新時間': 'abc'})
add(**rest, **{'応募者の従業員番号': '9000003', '応募者の名前': 'テスト三子F', '募集シフトの日付': '2026/09/16', '募集シフトの開始時間': '', '募集シフトの終了時間': '18:00', '更新時間': ms(2026, 9, 1)})
# 14 Q22: work + same-day rest on one person-day; 15 two same-day rests
add(**{'応募者の従業員番号': '9000004', '応募者の名前': 'テスト四郎C', '募集シフトの日付': '2026/09/17'})
add(**rest, **{'応募者の従業員番号': '9000004', '応募者の名前': 'テスト四郎C', '募集シフトの日付': '2026/09/17', '更新時間': ms(2026, 9, 17, 6)})
add(**rest, **{'応募者の従業員番号': '9000004', '応募者の名前': 'テスト四郎C', '募集シフトの日付': '2026/09/18', '更新時間': ms(2026, 9, 18, 6)})
add(**rest, **{'応募者の従業員番号': '9000004', '応募者の名前': 'テスト四郎C', '募集シフトの日付': '2026/09/18', '更新時間': ms(2026, 9, 18, 7)})
# 16-18 statuses and kinds
add(**{'応募者の従業員番号': '9000005', '応募者の名前': 'テスト五美S', '応募ステータス': '却下（シフト作成）'})
add(**{'応募者の従業員番号': '9000005', '応募者の名前': 'テスト五美S', '応募ステータス': ''})
add(**{'応募者の従業員番号': '9000005', '応募者の名前': 'テスト五美S', '勤務種別': ''})
add(**{'応募者の従業員番号': '9000005', '応募者の名前': 'テスト五美S', '勤務種別': 'x'})
add(**{'応募者の従業員番号': '9000005', '応募者の名前': 'テスト五美S', '勤務種別': '2'})
add(**{'応募者の従業員番号': '9000005', '応募者の名前': 'テスト五美S', '応募ステータス': '確定（アサイン）', '募集シフトの日付': '2026/09/19'})
# 19-21 staff numbers: text (case-insensitive identity), leading space, blank, decimals, leading zeros
add(**{'応募者の従業員番号': 'AB12', '応募者の名前': 'テスト六太C', '募集シフトの日付': '2026/09/20'})
add(**{'応募者の従業員番号': 'ab12', '応募者の名前': 'テスト六太C', '募集シフトの日付': '2026/09/20'})
add(**{'応募者の従業員番号': ' 9000020', '応募者の名前': 'テスト七海F'})
add(**{'応募者の従業員番号': '', '応募者の名前': 'テスト番号なし'})
add(**{'応募者の従業員番号': '9000037.0', '応募者の名前': 'テスト八雲C'})
add(**{'応募者の従業員番号': '0009000038', '応募者の名前': 'テスト九重C'})
# 22-25 dates: ISO text, blank, garbage, other month, full-width digits, trailing newline, holidays / weekend
add(**{'応募者の従業員番号': '9000006', '応募者の名前': 'テスト十和C', '募集シフトの日付': '2026-09-03'})
add(**{'応募者の従業員番号': '9000006', '応募者の名前': 'テスト十和C', '募集シフトの日付': ''})
add(**rest, **{'応募者の従業員番号': '9000006', '応募者の名前': 'テスト十和C', '募集シフトの日付': 'abc'})
add(**{'応募者の従業員番号': '9000006', '応募者の名前': 'テスト十和C', '募集シフトの日付': '2026/10/01'})
add(**{'応募者の従業員番号': '9000006', '応募者の名前': 'テスト十和C', '募集シフトの日付': '２０２６/09/05'})
add(**{'応募者の従業員番号': '9000006', '応募者の名前': 'テスト十和C', '募集シフトの日付': '2026/09/07\n'})
add(**{'応募者の従業員番号': '9000006', '応募者の名前': 'テスト十和C', '募集シフトの日付': '2026/09/21'})
add(**{'応募者の従業員番号': '9000006', '応募者の名前': 'テスト十和C', '募集シフトの日付': '2026/09/22'})
# 26-30 times: night shift with break, one-sided break (Q5), text times, extra application, numeric job/dept codes (Q13)
add(**{'応募者の従業員番号': '9000007', '応募者の名前': 'テスト十一C', '募集シフトの日付': '2026/09/23', '募集シフトの開始時間': '21:00', '募集シフトの終了時間': '29:00', '休憩1開始時間': '25:00', '休憩1終了時間': '26:00'})
add(**{'応募者の従業員番号': '9000007', '応募者の名前': 'テスト十一C', '募集シフトの日付': '2026/09/24', '募集シフトの開始時間': '4:00', '募集シフトの終了時間': '30:00', '休憩2開始時間': '12:00'})
add(**{'応募者の従業員番号': '9000007', '応募者の名前': 'テスト十一C', '募集シフトの日付': '2026/09/25', '募集シフトの開始時間': '10:00:00', '募集シフトの終了時間': '18:30:00'})
add(**{'応募者の従業員番号': '9000007', '応募者の名前': 'テスト十一C', '募集シフトの日付': '2026/09/26', '相談応募の開始時間': '10:00', '相談応募の終了時間': '18:00'})
add(**{'応募者の従業員番号': '9000007', '応募者の名前': 'テスト十一C', '募集シフトの日付': '2026/09/27', '相談応募の開始時間': '10:00', '応募ステータス': '却下'})
add(**{'応募者の従業員番号': '9000008', '応募者の名前': 'テスト十二F', '募集シフトの日付': '2026/09/28', '募集シフトの職種': '02', '応募者の職種': '05'})
rows_out = [dict(r) for r in R]
def write(path, header, rows, extra_lines=None, raw_header=None):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL, lineterminator='\r\n')
        w.writerow(raw_header or header)
        for i, r in enumerate(rows):
            if extra_lines and i in extra_lines: f.write(extra_lines[i])
            w.writerow([r.get(h, '') for h in header])
# edge1: wildcard header (spaces around one name), an extra trailing column, an empty line and a quoted newline
h1 = H + ['備考']
raw1 = list(h1); raw1[2] = ' 応募ステータス '
rows_out[0]['応募者の名前'] = 'テスト一郎T'
rows_out[1]['備考'] = 'line1\nline2'
write('edge1.csv', h1, rows_out, extra_lines={5: '\r\n'}, raw_header=raw1)
# edge2: a needed header is missing → whole month blank (Q1)
raw2 = list(H); raw2[33] = '区分'
write('edge2.csv', H, R[:6], raw_header=raw2)
# edge3: short header (33 columns, 勤務種別 dropped) → the template default name stays in AH1 (Q2)
write('edge3.csv', H[:33], R[:10])
# edge5: header only
write('edge5.csv', H, [])
# edge6: permuted columns, a literal U+FEFF before the first name, a duplicate 従業員番号 header (leftmost wins)
h6 = H[::-1]
raw6 = list(h6); raw6[0] = '﻿' + raw6[0]
h6x = h6 + ['応募者の従業員番号']
raw6x = raw6 + ['応募者の従業員番号']
with open('edge6.csv', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f, quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
    w.writerow(raw6x)
    for r in R[:20]:
        w.writerow([r.get(h, '') for h in h6] + ['1'])
print('ok', len(R))
