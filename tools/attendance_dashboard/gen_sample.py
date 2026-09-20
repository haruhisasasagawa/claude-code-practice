#!/usr/bin/env python3
"""動作確認用の架空シフトCSV（6ヶ月分）を生成する.

実際の1ヶ月分CSVから各スタッフの「曜日ごとのシフトの型」を抽出し、乱数で6ヶ月分を作り直す。
名前・従業員番号・所属・資格は元CSVの値を流用し、シフトの内容は架空。
途中退職・途中加入・資格変更による名前の記号変更・欠勤の多い人・繁忙月などを混ぜる。

使い方: python gen_sample.py 元CSV 出力先ディレクトリ [--seed 1]
"""
import argparse
import calendar
import csv
import datetime as dt
import random
import uuid
from collections import defaultdict

MONTHS = [(2026, 9), (2026, 10), (2026, 11), (2026, 12), (2027, 1), (2027, 2)]
MONTH_LOAD = {9: 0.95, 10: 0.97, 11: 0.97, 12: 1.15, 1: 1.05, 2: 0.93}      # 月ごとの忙しさ
JST = dt.timezone(dt.timedelta(hours=9))
AUG_WD = {}                                                                # 8月の曜日ごとの日数
for _d in range(1, 32):
    _w = dt.date(2026, 8, _d).weekday()
    AUG_WD[_w] = AUG_WD.get(_w, 0) + 1


def hm(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def fmt(minutes):
    return f"{minutes // 60}:{minutes % 60:02d}"


def ts(dtobj):
    return str(int(dtobj.timestamp() * 1000))


def load_profiles(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    header = list(rows[0].keys())
    prof = {}
    for r in rows:
        key = r["応募者の従業員番号"]
        p = prof.setdefault(key, {"name": r["応募者の名前"], "dept": r["応募者の職種"], "grade": r["応募者の資格"],
                                  "wage": r["時給"], "days": defaultdict(list), "ndays": set(), "raw": r})
        if r["勤務種別"] == "1" and "確定" in r["応募ステータス"]:
            d = dt.datetime.strptime(r["募集シフトの日付"], "%Y/%m/%d").date()
            p["days"][d].append(r)
    for p in prof.values():
        groups = defaultdict(list)          # weekday -> list of day-groups (list of rows)
        for d, rs in p["days"].items():
            groups[d.weekday()].append(rs)
        p["groups"] = groups
        p["active_days"] = len(p["days"])
    return header, prof


def batch_times(year, month, rng):
    """シフト作成の一括更新は水曜夜にまとまって行われる（実データの傾向）。月内の各週の水曜のうち、シフト日の3〜13日前のものを使う."""
    first = dt.date(year, month, 1) - dt.timedelta(days=21)
    out = []
    d = first
    while d <= dt.date(year, month, calendar.monthrange(year, month)[1]):
        if d.weekday() == 2:
            out.append(dt.datetime.combine(d, dt.time(rng.choice([13, 21, 22, 22, 23]), rng.randrange(60), rng.randrange(60), rng.randrange(1000) * 1000), JST))
        d += dt.timedelta(days=1)
    return out


def make_month(prof, year, month, rng, state, header):
    ndays = calendar.monthrange(year, month)[1]
    dates = [dt.date(year, month, d) for d in range(1, ndays + 1)]
    batches = batch_times(year, month, rng)
    out = []
    load = MONTH_LOAD[month]
    for key, p in prof.items():
        st = state[key]
        if not (st["first"] <= (year, month) <= st["last"]):
            continue
        name = st["name_by_month"].get((year, month), p["name"])
        grade = st["grade_by_month"].get((year, month), p["grade"])
        streak = st.get("streak", 0)
        week_work = 0
        for d in dates:
            wd = d.weekday()
            if wd == 0:
                week_work = 0
            groups = p["groups"].get(wd) or [g for gs in p["groups"].values() for g in gs]
            if not groups:
                streak = 0
                continue
            prob = min(0.92, len(p["groups"].get(wd, [])) / AUG_WD[wd] * load * st["mult"])
            if streak >= 6 or week_work >= 6:          # 週休なしや長期連勤は作らない
                prob = 0.0
            if rng.random() > prob:
                streak = 0
                continue
            streak += 1
            week_work += 1
            group = rng.choice(groups)
            rest = rng.random() < st["absence"]
            timing = rng.choices(["事前", "前日", "当日"], weights=[0.55, 0.15, 0.30])[0] if rest else None
            delta = rng.choice([-60, -30, 30, 60]) if rng.random() < 0.06 else 0     # 1日分をまとめて前後にずらす
            status_day = rng.choices(["確定（シフト作成）", "確定", "確定（アサイン）"], weights=[93, 6, 1])[0]
            # 一括更新（水曜）か、個別の更新か
            cands = [b for b in batches if 3 <= (d - b.date()).days <= 13]
            if cands and rng.random() < 0.92:
                upd = rng.choice(cands)
            else:
                upd = dt.datetime.combine(d - dt.timedelta(days=rng.randint(0, 2)), dt.time(rng.randint(8, 23), rng.randrange(60), rng.randrange(60), rng.randrange(1000) * 1000), JST)
            if rest:
                r = dict(group[0])
                r.update({"募集シフトの日付": d.strftime("%Y/%m/%d"), "応募者の名前": name, "応募者の資格": grade, "応募者の職種": p["dept"],
                          "スケジュールID": str(uuid.uuid4()), "勤務種別": "4", "パターン名": "休み", "パターンコード": "",
                          "変更後の開始時間": "5:00", "変更後の終了時間": "29:00", "応募ステータス": "確定（シフト作成）"})
                if rng.random() < 0.65:
                    r["募集シフトの開始時間"], r["募集シフトの終了時間"] = "5:00", "29:00"
                else:
                    r["募集シフトの開始時間"], r["募集シフトの終了時間"] = group[0]["募集シフトの開始時間"], group[-1]["募集シフトの終了時間"]
                for i in (1, 2, 3):
                    r[f"休憩{i}開始時間"] = r[f"休憩{i}終了時間"] = ""
                if timing == "当日":
                    hour = rng.choices(range(5, 15), weights=[1, 6, 6, 11, 7, 2, 8, 1, 2, 1])[0]
                    u = dt.datetime.combine(d, dt.time(hour, rng.randrange(60), rng.randrange(60), rng.randrange(1000) * 1000), JST)
                elif timing == "前日":
                    u = dt.datetime.combine(d - dt.timedelta(days=1), dt.time(rng.randint(8, 23), rng.randrange(60), rng.randrange(60), rng.randrange(1000) * 1000), JST)
                else:
                    u = dt.datetime.combine(d - dt.timedelta(days=rng.randint(2, 14)), dt.time(rng.randint(8, 23), rng.randrange(60), rng.randrange(60), rng.randrange(1000) * 1000), JST)
                r["更新時間"] = ts(u)
                out.append(r)
                continue
            for src in group:
                r = dict(src)
                r.update({"募集シフトの日付": d.strftime("%Y/%m/%d"), "応募者の名前": name, "応募者の資格": grade, "応募者の職種": p["dept"],
                          "スケジュールID": str(uuid.uuid4()), "勤務種別": "1", "応募ステータス": status_day, "更新時間": ts(upd)})
                # 元行の募集時刻・変更後時刻をそのまま使い、ずらすときは1日分すべて同じ幅で
                for col in ("募集シフトの開始時間", "募集シフトの終了時間", "変更後の開始時間", "変更後の終了時間"):
                    if src[col]:
                        r[col] = fmt(hm(src[col]) + delta)
                for i in (1, 2, 3):
                    if src[f"休憩{i}開始時間"] and src[f"休憩{i}終了時間"]:
                        r[f"休憩{i}開始時間"] = fmt(hm(src[f"休憩{i}開始時間"]) + delta)
                        r[f"休憩{i}終了時間"] = fmt(hm(src[f"休憩{i}終了時間"]) + delta)
                out.append(r)
            # 却下（店側の判断）: 1.5%。多くは勤務日とは別の日に応募した分
            if rng.random() < 0.015:
                r = dict(group[0])
                rd = d if rng.random() < 0.15 else rng.choice(dates)
                length = rng.choice([120, 180, 240, 300, 360])
                s0 = hm(group[0]["募集シフトの開始時間"]) + rng.choice([-240, -180, 0, 60, 120])
                s0 = max(420, min(s0, 1440))
                r.update({"募集シフトの日付": rd.strftime("%Y/%m/%d"), "応募者の名前": name, "応募者の資格": grade, "応募者の職種": p["dept"],
                          "応募ステータス": rng.choice(["却下（シフト作成）", "却下（シフト作成）", "却下"]), "勤務種別": "1",
                          "募集シフトの開始時間": fmt(s0), "変更後の開始時間": fmt(s0), "募集シフトの終了時間": fmt(s0 + length), "変更後の終了時間": fmt(s0 + length),
                          "スケジュールID": str(uuid.uuid4())})
                for i in (1, 2, 3):
                    r[f"休憩{i}開始時間"] = r[f"休憩{i}終了時間"] = ""
                u = dt.datetime.combine(rd - dt.timedelta(days=rng.randint(0, 10)), dt.time(rng.randint(9, 22), rng.randrange(60), rng.randrange(60), rng.randrange(1000) * 1000), JST)
                r["更新時間"] = ts(u)
                out.append(r)
        st["streak"] = streak
    out.sort(key=lambda r: (r["募集シフトの日付"], int(r["更新時間"])))
    return out


def build_state(prof, rng):
    """途中退職・途中加入・名前の記号変更・欠勤傾向などを人ごとに決める."""
    state = {}
    keys = list(prof)
    rng.shuffle(keys)
    regular = [k for k in keys if "月_" not in prof[k]["name"]]
    leavers = set(keys[:14])                          # 途中で退職
    joiners = set(regular[14:24])                     # 途中から加入（前半は出てこない）
    promoted = [k for k in regular[24:34]][:6]        # 資格が上がり名前の記号が変わる
    heavy = set(keys[34:46])                          # 欠勤が多め
    for k in keys:
        p = prof[k]
        st = {"first": MONTHS[0], "last": MONTHS[-1], "name_by_month": {}, "grade_by_month": {},
              "mult": rng.uniform(0.95, 1.25), "absence": rng.choice([0.01, 0.02, 0.03, 0.04, 0.05, 0.06])}
        if k in heavy:
            st["absence"] = rng.uniform(0.10, 0.18)
        if k in leavers:
            st["last"] = MONTHS[rng.randint(1, 4)]
        if k in joiners:
            st["first"] = MONTHS[rng.randint(1, 3)]
        if k in promoted:
            m0 = rng.randint(2, 4)
            base = p["name"]
            suffix = "F" if not base.endswith("F") else ("C" if not base.endswith("C") else "")
            if suffix:
                promote_grade = rng.random() < 0.5
                for i in range(m0, len(MONTHS)):
                    st["name_by_month"][MONTHS[i]] = base + suffix
                    if promote_grade and p["grade"] == "01アルバイト":
                        st["grade_by_month"][MONTHS[i]] = "02サブリーダー"
        state[k] = st
    return state


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source_csv")
    ap.add_argument("outdir")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    header, prof = load_profiles(a.source_csv)
    state = build_state(prof, rng)
    import os
    os.makedirs(a.outdir, exist_ok=True)
    for (y, m) in MONTHS:
        rows = make_month(prof, y, m, rng, state, header)
        last = calendar.monthrange(y, m)[1]
        path = os.path.join(a.outdir, f"TC___{y}{m:02d}01-{y}{m:02d}{last:02d}_sample.csv")
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=header, quoting=csv.QUOTE_ALL)
            w.writeheader()
            w.writerows(rows)
        staff = len({r["応募者の従業員番号"] for r in rows})
        rest = sum(1 for r in rows if r["勤務種別"] == "4")
        print(f"{y}/{m:02d}: {len(rows)} rows, {staff} staff, rest rows {rest} -> {path}")


if __name__ == "__main__":
    main()
