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

MONTHS = [(2026, 8), (2026, 9), (2026, 10), (2026, 11), (2026, 12), (2027, 1)]
MONTH_LOAD = {8: 1.0, 9: 0.92, 10: 0.95, 11: 0.97, 12: 1.15, 1: 1.05}      # 月ごとの忙しさ
JST = dt.timezone(dt.timedelta(hours=9))


def hm(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def fmt(minutes):
    return f"{minutes // 60}:{minutes % 60:02d}"


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


def make_month(prof, year, month, rng, state, header):
    ndays = calendar.monthrange(year, month)[1]
    dates = [dt.date(year, month, d) for d in range(1, ndays + 1)]
    wd_count = defaultdict(int)
    for d in dates:
        wd_count[d.weekday()] += 1
    aug_wd = defaultdict(int)
    for d in [dt.date(2026, 8, x) for x in range(1, 32)]:
        aug_wd[d.weekday()] += 1
    out = []
    load = MONTH_LOAD[month]
    for key, p in prof.items():
        st = state[key]
        if not (st["first"] <= (year, month) <= st["last"]):
            continue
        name = st["name_by_month"].get((year, month), p["name"])
        grade = st["grade_by_month"].get((year, month), p["grade"])
        for d in dates:
            wd = d.weekday()
            groups = p["groups"].get(wd) or [g for gs in p["groups"].values() for g in gs]
            if not groups:
                continue
            prob = min(0.95, len(p["groups"].get(wd, [])) / aug_wd[wd] * load * st["mult"])
            if rng.random() > prob:
                continue
            group = rng.choice(groups)
            # 休みへの変更（人ごとの傾向）
            rest = rng.random() < st["absence"]
            timing = None
            if rest:
                timing = rng.choices(["事前", "前日", "当日"], weights=[0.55, 0.15, 0.30])[0]
            # 却下（店側の判断）: たまに同じ日に別枠で
            reject = (not rest) and rng.random() < 0.02
            for src in group:
                r = dict(src)
                r["募集シフトの日付"] = d.strftime("%Y/%m/%d")
                r["応募者の名前"] = name
                r["応募者の資格"] = grade
                r["スケジュールID"] = str(uuid.uuid4())
                s0, e0 = hm(src["募集シフトの開始時間"]), hm(src["募集シフトの終了時間"])
                cs, ce = s0, e0
                if rng.random() < 0.08:            # 変更後の時間が少しずれる
                    cs = max(s0 - 60, min(s0 + 60, s0 + rng.choice([-60, -30, 30, 60])))
                    ce = max(cs + 60, e0 + rng.choice([-60, 0, 0, 60]))
                status = rng.choices(["確定（シフト作成）", "確定", "確定（アサイン）"], weights=[93, 6, 1])[0]
                upd = dt.datetime.combine(d, dt.time(rng.choice([9, 10, 11, 13, 14, 15, 22, 23]), rng.randrange(60)), JST) - dt.timedelta(days=rng.randint(3, 13))
                r["勤務種別"] = "1"
                r["募集シフトの開始時間"], r["募集シフトの終了時間"] = fmt(s0), fmt(e0)
                r["変更後の開始時間"], r["変更後の終了時間"] = fmt(cs), fmt(ce)
                if rest:
                    r["勤務種別"] = "4"
                    r["パターン名"] = "休み"
                    r["変更後の開始時間"], r["変更後の終了時間"] = "5:00", "29:00"
                    if rng.random() < 0.65:
                        r["募集シフトの開始時間"], r["募集シフトの終了時間"] = "5:00", "29:00"
                    for i in (1, 2, 3):
                        r[f"休憩{i}開始時間"] = r[f"休憩{i}終了時間"] = ""
                    if timing == "当日":
                        upd = dt.datetime.combine(d, dt.time(rng.choices(range(5, 15), weights=[1, 6, 6, 11, 7, 2, 8, 1, 2, 1])[0], rng.randrange(60)), JST)
                    elif timing == "前日":
                        upd = dt.datetime.combine(d - dt.timedelta(days=1), dt.time(rng.randint(8, 23), rng.randrange(60)), JST)
                    else:
                        upd = dt.datetime.combine(d - dt.timedelta(days=rng.randint(2, 14)), dt.time(rng.randint(8, 23), rng.randrange(60)), JST)
                    status = "確定（シフト作成）"
                r["応募ステータス"] = status
                r["更新時間"] = str(int(upd.timestamp() * 1000))
                out.append(r)
            if reject:
                r = dict(group[0])
                r["募集シフトの日付"] = d.strftime("%Y/%m/%d")
                r["応募者の名前"], r["応募者の資格"] = name, grade
                r["応募ステータス"] = rng.choice(["却下（シフト作成）", "却下"])
                r["勤務種別"] = "1"
                s0 = hm(group[0]["募集シフトの開始時間"]) - 240
                if s0 < 420:
                    s0 = hm(group[0]["募集シフトの終了時間"])
                r["募集シフトの開始時間"], r["変更後の開始時間"] = fmt(s0), fmt(s0)
                r["募集シフトの終了時間"], r["変更後の終了時間"] = fmt(s0 + 180), fmt(s0 + 180)
                for i in (1, 2, 3):
                    r[f"休憩{i}開始時間"] = r[f"休憩{i}終了時間"] = ""
                r["スケジュールID"] = str(uuid.uuid4())
                upd = dt.datetime.combine(d, dt.time(rng.randint(9, 20), rng.randrange(60)), JST) - dt.timedelta(days=rng.randint(1, 10))
                r["更新時間"] = str(int(upd.timestamp() * 1000))
                out.append(r)
    out.sort(key=lambda r: (r["募集シフトの日付"], int(r["更新時間"])))
    return out


def build_state(prof, rng):
    """途中退職・途中加入・名前の記号変更・欠勤傾向などを人ごとに決める."""
    state = {}
    keys = list(prof)
    rng.shuffle(keys)
    leavers = set(keys[:14])                 # 途中で退職
    joiners = set(keys[14:24])               # 途中から加入（前半は出てこない）
    promoted = keys[24:30]                   # 資格が上がり名前の記号が変わる
    heavy = set(keys[30:42])                 # 欠勤が多め
    for k in keys:
        p = prof[k]
        st = {"first": (2026, 8), "last": (2027, 1), "name_by_month": {}, "grade_by_month": {},
              "mult": rng.uniform(0.95, 1.25), "absence": rng.choice([0.0, 0.01, 0.02, 0.03, 0.04, 0.05])}
        if k in heavy:
            st["absence"] = rng.uniform(0.08, 0.16)
        if k in leavers:
            st["last"] = MONTHS[rng.randint(1, 4)]
        if k in joiners:
            st["first"] = MONTHS[rng.randint(1, 3)]
        if k in promoted:
            m0 = rng.randint(2, 4)
            new_name = p["name"] + ("F" if not p["name"].endswith("F") else "C")
            for i in range(m0, len(MONTHS)):
                st["name_by_month"][MONTHS[i]] = new_name
                if rng.random() < 0.5:
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
        path = os.path.join(a.outdir, f"TC___{y}{m:02d}01-{y}{m:02d}{last}_sample.csv")
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=header, quoting=csv.QUOTE_ALL)
            w.writeheader()
            w.writerows(rows)
        staff = len({r["応募者の従業員番号"] for r in rows})
        rest = sum(1 for r in rows if r["勤務種別"] == "4")
        print(f"{y}/{m:02d}: {len(rows)} rows, {staff} staff, rest rows {rest} -> {path}")


if __name__ == "__main__":
    main()
