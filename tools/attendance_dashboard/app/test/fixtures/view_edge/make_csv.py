"""Synthetic CSVs for the dashboard edge cases vb1..vb6 of test/parity.js (fake names only).

Writes june.csv and july.csv into the current directory. june2.csv is a 16-row variant of june.csv, committed as is.
The goldens t1..t6_golden.json were made with the Excel generator (--maxrows 60), recalculated in LibreOffice and
dumped with the golden dump script (dump_cells.py):
  t1  CSV_1 = june.csv                          --select テスト太郎   (> 12 list items, no busy days, no 連休)
  t2  CSV_1 = june.csv,  CSV_2 = july.csv       --select テスト花子   (参考値, one 連休, 追加応募)
  t3  same as t2                                --select 存在しない人 (name not in 名簿)
  t4  CSV_1 = june2.csv, CSV_2 = july.csv, plus add_holidays.py on 祝日・繁忙日 (Fridays named 金曜テスト, Tuesdays and
      Wednesdays with a blank name)            --select テスト花子   (> 24 missed busy days, > 6 連休, blank names)
  t5  same as t4                                --select 存在しない人 (連休は ほか N 件 without a selection)
  t6  same as t4                                --select テスト太郎   (0:00 shift start, unregistered job code)
"""
import csv, datetime as dt, sys
H = ["募集シフトの日付", "募集店舗", "応募ステータス", "募集シフトの開始時間", "募集シフトの終了時間",
    "相談応募の開始時間", "相談応募の終了時間", "アサインの開始時間", "アサインの終了時間",
    "変更後の開始時間", "変更後の終了時間", "募集シフトの職種", "募集シフトの資格", "応募者の名前",
    "応募者の従業員番号", "応募者の所属店舗", "応募者の電話番号", "応募者の職種", "応募者の資格", "時給",
    "休憩1開始時間", "休憩1終了時間", "休憩2開始時間", "休憩2終了時間", "休憩3開始時間", "休憩3終了時間",
    "連携ID", "勤務店舗コード", "所属店舗コード", "更新時間", "スケジュールID", "パターン名", "パターンコード", "勤務種別"]
def ms(d, hh=7, mm=0):
    t = dt.datetime(d.year, d.month, d.day) + dt.timedelta(hours=hh - 9, minutes=mm)
    return str(int((t - dt.datetime(1970, 1, 1)).total_seconds() * 1000))
def row(d, status, s, e, name, num, kind, upd, cs="", ce="", ns="", ne="", job="04ストア", b1="", b2="", sodan=""):
    r = dict.fromkeys(H, "")
    r.update({"募集シフトの日付": d.strftime("%Y/%m/%d"), "募集店舗": "TC新宿", "応募ステータス": status,
              "募集シフトの開始時間": s, "募集シフトの終了時間": e, "変更後の開始時間": ns, "変更後の終了時間": ne,
              "募集シフトの職種": job, "応募者の名前": name, "応募者の従業員番号": num, "応募者の職種": "04ストア",
              "応募者の資格": "01アルバイト", "休憩1開始時間": b1, "休憩1終了時間": b2, "更新時間": upd, "勤務種別": str(kind),
              "相談応募の開始時間": sodan})
    return [r[h] for h in H]
D = dt.date
june, july = [], []
A = ("テスト太郎", "100001")
for i in range(1, 15):
    d = D(2026, 6, i)
    s, e = ("5:00", "29:00") if i == 3 else ("10:00", "15:00")
    june.append(row(d, "確定", s, e, *A, 4, ms(d, 7, i)))
for i in range(15, 26):
    d = D(2026, 6, i)
    june.append(row(d, "確定", "10:00", "18:00", *A, 1, ms(d - dt.timedelta(days=5)), ns="10:00", ne="18:00", b1="13:00", b2="14:00"))
d = D(2026, 6, 26); june.append(row(d, "確定", "0:00", "5:00", *A, 1, ms(d, 0, 30), ns="1:00", ne="5:00", job="99謎"))
d = D(2026, 6, 27); june.append(row(d, "確定", "10:00", "18:00", *A, 1, ms(d, 12, 0), ns="10:00", ne="15:00", job="03フロア"))
d = D(2026, 6, 28); june.append(row(d, "確定", "10:00", "18:00", *A, 4, ms(d - dt.timedelta(days=1), 20, 59)))
# 花子: July only
B = ("テスト花子", "100002")
for dd in (18, 19, 21, 22):
    d = D(2026, 7, dd)
    july.append(row(d, "確定", "9:00", "17:00", *B, 1, ms(d - dt.timedelta(days=9)), b1="12:00", b2="13:00", sodan=("9:00" if dd == 18 else "")))
d = D(2026, 7, 20); july.append(row(d, "確定", "9:00", "17:00", *B, 4, ms(d, 6, 0)))
d = D(2026, 7, 25); july.append(row(d, "却下", "9:00", "17:00", *B, 1, ms(d - dt.timedelta(days=3))))
# 太郎 also in July a bit
d = D(2026, 7, 1); july.append(row(d, "確定", "10:00", "18:00", *A, 1, ms(d - dt.timedelta(days=3)), b1="13:00", b2="14:00"))
for name, rows in (("june.csv", june), ("july.csv", july)):
    with open(name, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f); w.writerow(H); w.writerows(rows)
print(len(june), len(july))
