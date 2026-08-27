# -*- coding: utf-8 -*-
"""サンプルデータ生成（build_tool.py と verify_tool.py で共有）"""
import datetime as dt
import random

TODAY = dt.date(2026, 8, 26)
DATES = [TODAY - dt.timedelta(days=7 - i) for i in range(7)]        # 8/19..8/25
ATTEND = [4200, 3900, 5100, 8300, 7800, 3600, 4100]                 # 動員(日計)サンプル

BANDS = ["朝", "昼", "夕方", "夜"]
BAND_TIME = {"朝": 10.5 / 24, "昼": 13.0 / 24, "夕方": 16.5 / 24, "夜": 19.5 / 24}
ATT_RATIO = {"朝": 0.15, "昼": 0.30, "夕方": 0.25}                   # 夜は残り
QTY_RATIO = {"朝": 0.14, "昼": 0.31, "夕方": 0.24}                   # 夜は残り

PRODUCTS = [  # (商品名, 基準購買率, 単価)  ※サンプル値
    ("ポップコーン（塩）M", 0.075, 550),
    ("ポップコーン（キャラメル）M", 0.058, 570),
    ("ポップコーン ハーフ＆ハーフ", 0.040, 600),
    ("ドリンク S", 0.045, 340),
    ("ドリンク M", 0.092, 400),
    ("ドリンク L", 0.033, 460),
    ("チュロス（シナモン）", 0.028, 380),
    ("ホットドッグ", 0.022, 500),
    ("ナチョス（チーズソース）", 0.016, 480),
    ("フライドポテト", 0.026, 420),
    ("チキンナゲット", 0.015, 450),
    ("ソフトクリーム（バニラ）", 0.013, 350),
]


def build():
    """returns (att_bands, qty, csv_rows)
    att_bands: {band: [7日分の動員]}   qty: {(day_idx, name, band): 販売数}
    csv_rows: [(date, name, qty, time_fraction, amount)]
    """
    att_bands = {}
    for b, ratio in ATT_RATIO.items():
        att_bands[b] = [round(a * ratio) for a in ATTEND]
    att_bands["夜"] = [a - att_bands["朝"][i] - att_bands["昼"][i] - att_bands["夕方"][i]
                      for i, a in enumerate(ATTEND)]

    rng = random.Random(20260826)
    qty = {}
    csv_rows = []
    for di, (d, att) in enumerate(zip(DATES, ATTEND)):
        weekend = d.weekday() in (5, 6)
        for name, rate, price in PRODUCTS:
            q = round(att * rate * (1.08 if weekend else 1.0) * rng.uniform(0.85, 1.15))
            parts = {}
            for b, ratio in QTY_RATIO.items():
                parts[b] = max(0, round(q * ratio * rng.uniform(0.85, 1.15)))
            parts["夜"] = max(0, q - parts["朝"] - parts["昼"] - parts["夕方"])
            for b in BANDS:
                qty[(di, name, b)] = parts[b]
                csv_rows.append((d, name, parts[b], BAND_TIME[b], parts[b] * price))
    return att_bands, qty, csv_rows
