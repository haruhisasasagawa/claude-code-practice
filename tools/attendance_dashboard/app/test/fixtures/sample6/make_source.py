"""架空スタッフ 30名分の「元になる1ヶ月分CSV（2026年8月）」を作る。gen_sample.py の入力用。"""
import csv, random, uuid, datetime as dt, sys
rng = random.Random(7)
header = next(csv.reader(open(sys.argv[1], encoding='utf-8-sig')))
SUR = ["佐藤","鈴木","高橋","田中","伊藤","渡辺","山本","中村","小林","加藤","吉田","山田","佐々木","山口","松本","井上","木村","林","斎藤","清水","山崎","森","池田","橋本","阿部","石川","山下","中島","石井","小川"]
GIV = ["陽翔","結衣","大翔","葵","蓮","凛","悠真","紬","陽菜","湊","結菜","樹","咲良","朝陽","莉子","颯真","芽依","蒼","凪","琴音","律","美月","悠人","杏","新","心春","海翔","花","大和","楓"]
JOBS = [("02コンセ","C)"),("03フロア","F)"),("04ストア","SB)"),("05オフィス","O)")]
PAT = [("8:00","16:00"),("9:00","17:00"),("10:00","18:00"),("12:00","21:00"),("16:00","23:00"),("17:00","25:00"),("13:00","17:00"),("18:00","22:00")]
JST = dt.timezone(dt.timedelta(hours=9))
rows = []
for i in range(30):
    job, pre = JOBS[i % 4] if i < 24 else JOBS[rng.randrange(4)]
    name = pre + SUR[i] + GIV[i] + ("" if i % 3 else "F")
    num = str(800001 + i)
    wds = rng.sample(range(7), rng.randint(2, 5))
    pats = {w: rng.choice(PAT) for w in wds}
    grade = "01アルバイト" if i % 7 else "02サブリーダー"
    wage = str(rng.choice([1200, 1250, 1300, 1350]))
    for d in range(1, 32):
        day = dt.date(2026, 8, d)
        if day.weekday() not in wds: continue
        s, e = pats[day.weekday()]
        sh, eh = int(s.split(':')[0]), int(e.split(':')[0])
        brk = (f"{sh+3}:00", f"{sh+4}:00") if eh - sh >= 7 else ("", "")
        upd = dt.datetime.combine(day - dt.timedelta(days=rng.randint(3, 12)), dt.time(22, rng.randrange(60), rng.randrange(60)), JST)
        r = {h: "" for h in header}
        r.update({"募集シフトの日付": day.strftime("%Y/%m/%d"), "募集店舗": "TC架空", "応募ステータス": "確定（シフト作成）",
                  "募集シフトの開始時間": s, "募集シフトの終了時間": e, "変更後の開始時間": s, "変更後の終了時間": e,
                  "募集シフトの職種": job, "募集シフトの資格": grade, "応募者の名前": name, "応募者の従業員番号": num,
                  "応募者の所属店舗": "TC架空", "応募者の電話番号": "090-0000-0000", "応募者の職種": job, "応募者の資格": grade,
                  "時給": wage, "休憩1開始時間": brk[0], "休憩1終了時間": brk[1], "連携ID": str(uuid.uuid4()),
                  "勤務店舗コード": "9999", "所属店舗コード": "9999", "更新時間": str(int(upd.timestamp() * 1000)),
                  "スケジュールID": str(uuid.uuid4()), "パターン名": "勤務", "パターンコード": "A1", "勤務種別": "1"})
        rows.append(r)
with open(sys.argv[2], "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=header, quoting=csv.QUOTE_ALL); w.writeheader(); w.writerows(rows)
print(len(rows), "rows")
