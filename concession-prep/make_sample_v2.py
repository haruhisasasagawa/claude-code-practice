# -*- coding: utf-8 -*-
"""
v2.0(店舗版)のワークブックに「仮数値」を入れた入力済みサンプルを作る。
実データは一切使わず、売上・在庫・原価CSV(期間A/B)とMSO商品CSV(金曜4週分)を
決まった乱数で合成して貼り込み、動員数・保持時間・優先・ピーク時間・事前準備率も入れる。
  python make_sample_v2.py <ver2.0.xlsx> <出力.xlsx> [--csv-dir DIR] [--sunday 2026-09-13]
    --csv-dir : 合成したCSV(期間A/B・MSO4週)と verify_v2.py 用の引数を書き出す
    --sunday  : 期間Aの最終日(日曜)。省略時は今日以前で直近の日曜
"""
import argparse
import csv
import datetime as dt
import json
import os
import random
import sys
import zlib

from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_calib import CALIB_SHEETS, MSO_HEADERS, MSO_MAX, MSO_NCOL, read_mso_rows  # noqa: E402
from build_tool import CSV_HEADERS, CSV_MAX, NCOL, N_SLOTS, read_csv_rows            # noqa: E402
from upgrade_v2 import VIEW_ALL, check_hidden_cols, restore_comment_vml               # noqa: E402

SEED = 20260913
ROW_P0 = 14                                   # 期間データ: 商品1行目
ATT_A = [8000, 12000, 11000]                  # 期間A 金・土・日 の動員数(仮)
ATT_B = [7500, 11500, 10500, 5000, 4500, 5500, 5000]   # 期間B 金〜木(仮)
PEAK_ATT = 1200                               # ピーク動員数(仮)
RATE = 100                                    # 事前準備率(%)
PEAK_START, PEAK_END = (18, 30), (19, 30)     # ⑥ピーク時間(仮)
HT_THR = 30                                   # 優先「高」の基準(分)
CSV_A_DAYS, CSV_B_DAYS = 3, 7

# 店舗商品の仮の設定: (名前に含まれる語, 購買率, 保持時間(分), 1日のMSO明細数, 帯別の売れ方の重み①〜⑤, 単価)
# 名前の部分一致で当てる(店舗版の登録商品名がそのまま使えるように)。該当なしは既定値
PRODUCT_RULES = [
    ("ポップチキン",      0.022, 20,  60, (0.8, 1.5, 1.0, 1.0, 0.6), 500),
    ("トリュフソルトバタ", 0.018, 30,  55, (1.0, 1.1, 1.0, 1.1, 0.7), 450),
    ("シチリアハーブ",    0.012, 30,  30, (1.0, 1.0, 1.0, 1.0, 0.8), 450),
    ("ケチャップ＆マスタード", 0.015, 15, 50, (1.3, 1.2, 0.9, 0.9, 0.5), 550),
    ("４種のチーズ",      0.009, 15,  25, (1.2, 1.1, 0.9, 1.0, 0.5), 600),
    ("ハラペーニョ",      0.006, 15,  18, (0.9, 1.0, 1.0, 1.2, 0.8), 650),
    ("ビーフシチュ",      0.007, 15,  20, (0.7, 1.0, 1.1, 1.3, 0.8), 700),
    ("ジョンソンヴィル",  0.008, 20,  22, (1.0, 1.1, 1.0, 1.0, 0.6), 650),
    ("２００％",          0.005, 20,  15, (0.8, 1.0, 1.1, 1.2, 0.7), 750),
    ("シナモンシュガー",  0.014, 60,  40, (0.5, 0.8, 1.3, 1.5, 0.7), 400),
    ("チョコクリーム",    0.009, 45,  25, (0.5, 0.8, 1.3, 1.4, 0.8), 450),
    ("レインボー",        0.004, 45,  12, (0.4, 0.9, 1.4, 1.3, 0.6), 450),
    ("レモン＆ラムネ",    0.003, 45,   5, (0.4, 0.9, 1.4, 1.3, 0.6), 450),   # 4週で30個未満 → 少データ
]
DEFAULT_RULE = (None, 0.008, 30, 20, (1.0, 1.0, 1.0, 1.0, 1.0), 500)
MANUAL_PRIORITY = {"シナモンシュガー": "高"}      # 手動優先の例(保持時間は長いが売れ筋なので高)
MEMOS = {"ポップチキン": "仮のメモ：揚げ時間3分", "シナモンシュガー": "仮のメモ：売れ筋なので手動で優先「高」"}

# 売上CSVの店舗商品以外の行(小分類, 商品名, 購買率, 単価)。除外小分類はプルダウンに出ない
FILLER_SALES = [
    ("ポップコーン", "ポップコーン　塩Ｍ", 0.045, 500), ("ポップコーン", "ポップコーン　キャラメルＭ", 0.055, 500),
    ("ポップコーン", "ハーフ＆ハーフ（塩／キャラメル）", 0.060, 550), ("ポップコーン", "北海道濃厚バターしょうゆ味", 0.030, 550),
    ("ポップコーン", "ポップコーン　塩Ｌ", 0.012, 650), ("ポップコーン", "ポップコーン　キャラメルＬ", 0.014, 650),
    ("その他フード", "アイスクレープ　バナナ＆チョコ", 0.004, 450),
    ("コールド", "ドリンクバー　コールド", 0.180, 475), ("コールド", "ミニッツメイドオレンジ", 0.010, 400),
    ("コーヒー", "ＣＯＳＴＡ　ホットコーヒー", 0.020, 450), ("コーヒー", "ＣＯＳＴＡ　アイスラテ", 0.015, 500),
    ("ホット", "ドリンクバー　ホット", 0.012, 475),
    ("アルコール", "プレミアムモルツ", 0.015, 700), ("アルコール", "ハイボール", 0.008, 650),
    ("その他ドリンク", "ＩＣＥＥ　イエロー＆ブルー", 0.020, 450), ("その他ドリンク", "超ストロベリーフローズン", 0.010, 550),
    ("ドリンク調味料", "ＥＣＯガムシロップ", 0.002, 0), ("フード調味料", "ケチャップソース３００Ｇ", 0.001, 0),
    ("ＳＥＴ作品コンボ", "サンプル作品　Ｄカップ　仕入", 0.008, 1200), ("ＳＥＴ作品コンボ", "サンプル作品　Ｐボックス　仕入", 0.005, 1500),
    ("引換券", "引換／ポップコーン塩Ｍ", 0.006, 0), ("引換券", "引換／ドリンクバー　アイス", 0.006, 0),
    ("コンセ包材", "Ｍカップ（ポップコーン）", 0.100, 0), ("コンセ包材", "バイオマスストロー", 0.180, 0),
]
CAT_CODE = {"コールド": "01", "コーヒー": "02", "ホット": "03", "アルコール": "04", "その他ドリンク": "05",
            "ドリンク調味料": "06", "ポップコーン": "31", "ホットドッグ": "32", "軽食系フード": "33",
            "調理系スイーツ": "34", "その他フード": "35", "フード調味料": "36", "ＳＥＴ作品コンボ": "51",
            "引換券": "61", "コンセ包材": "71"}
# MSO(注文明細)の店舗商品以外の商品: (商品名, 1日の明細数, 単価, 商品区分)。セット親は集計対象外
FILLER_MSO = [
    ("ドリンクバー　コールド", 330, 475, "単品"), ("ポップコーン　塩Ｍ", 70, 500, "単品"),
    ("ポップコーン　キャラメルＭ", 90, 500, "単品"), ("ハーフ＆ハーフ（塩／キャラメル）", 100, 550, "単品"),
    ("北海道濃厚バターしょうゆ味", 50, 550, "単品"), ("ＣＯＳＴＡ　ホットコーヒー", 35, 450, "単品"),
    ("ＩＣＥＥ　イエロー＆ブルー", 35, 450, "単品"), ("プレミアムモルツ", 25, 700, "単品"),
]
SET_ORDERS = 90                                 # 1日のセット注文数(セット親1行＋構成品2行)
HOUR_W = {7: 40, 8: 300, 9: 110, 10: 190, 11: 900, 12: 180, 13: 510, 14: 950, 15: 400, 16: 520,
          17: 760, 18: 850, 19: 540, 20: 1070, 21: 530, 22: 190, 23: 240, 0: 60, 1: 20}


def rule_for(name):
    for r in PRODUCT_RULES:
        if r[0] and r[0] in name:
            return r
    return DEFAULT_RULE


def latest_sunday(today):
    return today - dt.timedelta(days=(today.weekday() - 6) % 7)


def serial_time(h, m):
    return (h * 60 + m) / 1440


def store_products(wb):
    pd = wb["期間データ"]
    out = []
    for i in range(N_SLOTS):
        v = pd[f"B{ROW_P0 + i}"].value
        out.append(v if isinstance(v, str) and v.strip() else None)
    return out


def band_index(hour):
    """帯別の重み用(6:45-11 / 11-14 / 14-18 / 18-21 / 21-翌2)。店舗版の区切りに合わせた目安"""
    if 7 <= hour < 11:
        return 0
    if 11 <= hour < 14:
        return 1
    if 14 <= hour < 18:
        return 2
    if 18 <= hour < 21:
        return 3
    return 4


# ---------------------------------------------------------------- 売上CSV ----
def make_sales_csv(path, products, start, end, att_sum, rng):
    """1商品1行(期間合計)の「売上・在庫・原価」CSVを書く。cp932・ヘッダー付き"""
    rows = []
    items = []
    for cat, name, rate, price in FILLER_SALES:
        items.append((cat, name, rate, price))
    for name in products:
        if not name:
            continue
        r = rule_for(name)
        cat = "調理系スイーツ" if "チュリトス" in name else (
            "軽食系フード" if ("じゃが" in name or "チキン" in name) else "ホットドッグ")
        items.append((cat, name, r[1], r[5]))
    items.sort(key=lambda x: CAT_CODE.get(x[0], "99"))
    for k, (cat, name, rate, price) in enumerate(items):
        qty = max(0, int(round(rate * att_sum * rng.lognormvariate(0, 0.08))))
        stock0 = int(qty * 0.3) + rng.randint(0, 5)
        purchase = qty + rng.randint(0, 3)
        waste = rng.randint(0, 2) if price else 0
        left = stock0 + purchase - qty - waste
        gross = qty * price
        net = round(gross / 1.08) if price else 0
        rows.append(["売上・在庫・原価", "0761", "新宿", start.strftime("%Y%m%d"), end.strftime("%Y%m%d"),
                     "01", CAT_CODE.get(cat, "99"), cat, "", "",
                     "19900001", "サンプル商事株式会社", f"18130009{k + 1:05d}", name, "1", "買取",
                     stock0, purchase, 0, 0, waste, 0, 0, 0, 0, left, qty, gross, qty if price else 0,
                     gross, net, round(price / 1.08, 2) if price else 0, round(net * 0.35), "0"])
    with open(path, "w", encoding="cp932", newline="") as f:
        w = csv.writer(f)
        w.writerow(CSV_HEADERS)
        w.writerows(rows)
    return {r[13]: r[26] for r in rows}


# ---------------------------------------------------------------- MSO CSV ----
def make_mso_csv(path, products, day, rng):
    """金曜1日分のMSO商品CSV(注文明細)を書く。時刻の分布は実データに近い山を持たせ、
    店舗商品は商品ごとに帯別の重みを変えて「商品別の波」が見えるようにする"""
    lines = []                                   # (秒, 商品名, 単価, 数量, 区分)

    def sample_time(mult=(1, 1, 1, 1, 1)):
        hours = list(HOUR_W)
        w = [HOUR_W[h] * mult[band_index(h)] for h in hours]
        h = rng.choices(hours, w)[0]
        m, s = rng.randint(0, 59), rng.randint(0, 59)
        if h == 7:
            m = rng.randint(0, 59)               # 6:45開店。7時台から
        if h == 1:
            m = rng.randint(0, 55)               # 翌2:00閉店の手前まで
        return h * 3600 + m * 60 + s

    for name in products:
        if not name:
            continue
        r = rule_for(name)
        n = max(0, int(round(r[3] * rng.lognormvariate(0, 0.12))))
        for _ in range(n):
            lines.append([sample_time(r[4]), name, r[5], 1 if rng.random() < 0.85 else 2, "単品", None])
    for name, n_day, price, kind in FILLER_MSO:
        n = max(0, int(round(n_day * rng.lognormvariate(0, 0.1))))
        for _ in range(n):
            lines.append([sample_time(), name, price, 1 if rng.random() < 0.8 else 2, kind, None])
    for k in range(SET_ORDERS):                  # セット親＋構成品(親は集計対象外、構成品は対象)
        t = sample_time()
        gid = f"set{k}"
        lines.append([t, "ポップコーンセット", 950, 1, "セット親", gid])
        lines.append([t, rng.choice(["ハーフ＆ハーフ（塩／キャラメル）", "ポップコーン　塩Ｍ", "ポップコーン　キャラメルＭ"]), 475, 1, "構成品", gid])
        lines.append([t, "ドリンクバー　コールド", 475, 1, "構成品", gid])
    lines.sort(key=lambda x: (x[0], x[5] or ""))
    rows = []
    slip = 0
    i = 0
    ymd = day.strftime("%Y/%m/%d")
    while i < len(lines):
        grp = [lines[i]]
        if lines[i][5]:                          # セット注文は3行で1伝票
            while i + len(grp) < len(lines) and lines[i + len(grp)][5] == lines[i][5]:
                grp.append(lines[i + len(grp)])
        else:
            while (len(grp) < 3 and i + len(grp) < len(lines) and not lines[i + len(grp)][5]
                   and rng.random() < 0.35):
                grp.append(lines[i + len(grp)])
        slip += 1
        mobile = rng.random() < 0.08
        t0 = grp[0][0]
        order_day = day if t0 >= 6 * 3600 else day + dt.timedelta(days=1)   # 翌0〜2時は翌日付の注文
        t_disp = t0 % 86400
        total = sum(p * q for _, _, p, q, kind, _ in grp if kind != "構成品")
        cancel = rng.random() < 0.004            # ごく少数の取消(集計対象外)
        for j, (t, name, price, qty, kind, _) in enumerate(grp, start=1):
            tt = [t_disp, t_disp + 25, t_disp + 190, t_disp + 200]
            rows.append([1, f"0764{day.strftime('%y%m%d')}{slip:05d}", "01", "076", "新宿", "0761", "ＴＯＨＯシネマズ新宿",
                         "0080" if mobile else "0070", "モバイルオーダー" if mobile else "セルフオーダー",
                         40 if mobile else rng.randint(71, 78), ymd, order_day.strftime("%Y/%m/%d"),
                         *(f"{(x // 3600) % 24:02d}:{(x // 60) % 60:02d}:{x % 60:02d}" for x in tt),
                         total, slip, "提供済", "取消" if cancel else "販売",
                         f"{rng.randint(10 ** 9, 10 ** 10 - 1)}" if mobile else "",
                         j, f"18130009{zlib.crc32(name.encode('utf-8')) % 100000:05d}", name, price, qty,
                         0 if kind == "構成品" else price * qty, kind])
        i += len(grp)
    with open(path, "w", encoding="cp932", newline="") as f:
        w = csv.writer(f)
        w.writerow(MSO_HEADERS)
        w.writerows(rows)
    return len(rows)


# ---------------------------------------------------------------- 貼り込み ----
def paste(ws, rows, ncol, max_rows):
    for i, row in enumerate(rows[:max_rows]):
        for c_idx, v in enumerate(row[:ncol], start=1):
            ws.cell(row=5 + i, column=c_idx).value = v


def build(src, dst, csv_dir, sunday, label=True):
    rng = random.Random(SEED)
    os.makedirs(csv_dir, exist_ok=True)
    a_end = sunday
    a_start = a_end - dt.timedelta(days=CSV_A_DAYS - 1)              # 金
    b_end = a_start - dt.timedelta(days=1)                            # 前週木
    b_start = b_end - dt.timedelta(days=CSV_B_DAYS - 1)               # 前週金
    fridays = [a_start - dt.timedelta(days=7 * k) for k in (3, 2, 1, 0)]   # 4週分(古い順)
    assert a_start.weekday() == 4 and b_start.weekday() == 4

    wb = load_workbook(src)
    products = store_products(wb)
    names = [p for p in products if p]
    csv_a = os.path.join(csv_dir, f"sample_periodA_{a_start:%m%d}-{a_end:%m%d}.csv")
    csv_b = os.path.join(csv_dir, f"sample_periodB_{b_start:%m%d}-{b_end:%m%d}.csv")
    make_sales_csv(csv_a, names, a_start, a_end, sum(ATT_A), rng)
    make_sales_csv(csv_b, names, b_start, b_end, sum(ATT_B), rng)
    mso_paths = []
    for k, d in enumerate(fridays):
        p = os.path.join(csv_dir, f"sample_mso_week{k + 1}_{d:%m%d}.csv")
        make_mso_csv(p, names, d, rng)
        mso_paths.append(p)

    paste(wb["CSV貼付A"], read_csv_rows(csv_a), NCOL, CSV_MAX)
    paste(wb["CSV貼付B"], read_csv_rows(csv_b), NCOL, CSV_MAX)
    for sheet, p in zip(CALIB_SHEETS, mso_paths):
        paste(wb[sheet], read_mso_rows(p), MSO_NCOL, MSO_MAX)

    pd = wb["期間データ"]
    for c, v in zip("CDE", ATT_A):
        pd[f"{c}6"] = v
    for c, v in zip("CDEFGHI", ATT_B):
        pd[f"{c}10"] = v
    pd["E12"] = HT_THR
    ht, manual = [], {}
    for i, name in enumerate(products):
        r = ROW_P0 + i
        if not name:
            ht.append(None)
            continue
        rule = rule_for(name)
        pd[f"E{r}"] = rule[2]
        ht.append(rule[2])
        for key, v in MANUAL_PRIORITY.items():
            if key in name:
                pd[f"F{r}"] = v
                manual[i] = v
        for key, v in MEMOS.items():
            if key in name:
                pd[f"G{r}"] = v

    m = wb["準備数計算"]
    ks = wb["係数算出"]
    m["D4"] = "期間A（直近金土日）"
    m["D5"] = PEAK_ATT
    f4, g4 = ks["F4"].value, ks["G4"].value                       # ④ 夜ピークの区切り(店舗設定)
    m["D6"] = f"④ 夜ピーク{f4.hour}:{f4.minute:02d}〜{g4.hour}:{g4.minute:02d}"
    m["D7"] = "使う"
    m["D8"] = RATE
    m["O5"] = serial_time(*PEAK_START)
    m["O6"] = serial_time(*PEAK_END)
    wb["印刷用"]["G2"] = VIEW_ALL
    if label:                                    # 実データと取り違えないよう各シートの説明行に明記
        tag = "【サンプル：数値はすべて仮の値です】"
        for sheet, ref in (("使い方", "B2"), ("準備数計算", "B2"), ("期間データ", "F2"), ("印刷用", "B5")):
            ws = wb[sheet]
            ws[ref] = tag + "　" + str(ws[ref].value or "").lstrip("｜").strip()
    wb.save(dst)
    n = restore_comment_vml(src, dst)
    ok, hidden = check_hidden_cols(dst)
    if not ok:
        raise SystemExit(f"非表示列が壊れています: {hidden}")

    params = {
        "csv_a": csv_a, "csv_b": csv_b, "mso": mso_paths, "att_a": ATT_A, "att_b": ATT_B,
        "peak": PEAK_ATT, "rate": RATE, "ht": ht, "manual": manual, "thr": HT_THR,
        "peak_start": f"{PEAK_START[0]}:{PEAK_START[1]:02d}", "band": 4, "products": names,
        "period_a": [a_start.isoformat(), a_end.isoformat()], "period_b": [b_start.isoformat(), b_end.isoformat()],
        "fridays": [d.isoformat() for d in fridays],
    }
    with open(os.path.join(csv_dir, "sample_params.json"), "w", encoding="utf-8") as f:
        json.dump(params, f, ensure_ascii=False, indent=1)
    args = (f"--products auto --csv-a {csv_a} --csv-b {csv_b} "
            f"--att-a {','.join(map(str, ATT_A))} --att-b {','.join(map(str, ATT_B))} "
            f"--peak {PEAK_ATT} --mult 0 --rate {RATE} --view {VIEW_ALL} "
            f"--ht {','.join('' if h is None else str(h) for h in ht[:len(names)])} "
            f"--manual {','.join(f'{k}:{v}' for k, v in manual.items())} --thr {HT_THR} "
            f"--peak-start {params['peak_start']} " + " ".join(f"--mso{k + 1} {p}" for k, p in enumerate(mso_paths)))
    with open(os.path.join(csv_dir, "verify_args.txt"), "w", encoding="utf-8") as f:
        f.write(args + "\n")
    print(f"sample: {dst}  (products={len(names)}, 期間A {a_start:%m/%d}〜{a_end:%m/%d}, "
          f"期間B {b_start:%m/%d}〜{b_end:%m/%d}, MSO {', '.join(f'{d:%m/%d}' for d in fridays)}, comments restored: {n})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--csv-dir", default=None)
    ap.add_argument("--sunday", default=None, help="期間Aの最終日(日曜)。省略時は直近の日曜")
    ap.add_argument("--no-label", action="store_true", help="「サンプル」の表記を入れない")
    a = ap.parse_args()
    sun = dt.date.fromisoformat(a.sunday) if a.sunday else latest_sunday(dt.date.today())
    if sun.weekday() != 6:
        raise SystemExit("--sunday は日曜の日付を指定してください")
    build(a.src, a.dst, a.csv_dir or os.path.join(os.path.dirname(os.path.abspath(a.dst)), "sample_csv"), sun,
          label=not a.no_label)
