# AGENTS.md — claude-code-practice の引き継ぎメモ

このファイルは、このリポジトリで作業する AI（Codex・Claude Code・Claude）と人のための共通メモです。
どちらが続きを始めても迷わないよう、作業を始める前に読み、終えたら該当ツールの欄を更新してください。

- 持ち主：TOHOシネマズ新宿 副支配人（劇場の業務ツールを作っているリポジトリ）
- 返事・コミットメッセージ・ドキュメントは日本語で書く
- 最終更新：2026-11-27

## リポジトリのつくり

- 既定ブランチは `main`。中身はリポジトリ直下の `README.md` と `index.html`（自己紹介ページ）だけ。
- 各ツールは **ツールごとのブランチ** にあり、`main` にはまだ入っていない（コンセッション準備ツールだけ PR #2 が開いている）。
- このため、ツールのブランチをチェックアウトするとこの AGENTS.md は見えないことがある。その場合は次で読む：

```
git fetch origin main && git show origin/main:AGENTS.md
```

## ツール一覧

| ツール | ブランチ | 主なファイル | 使用技術 | 最後のコミット |
|---|---|---|---|---|
| MGRシフト → シフトライン人数確認表 | `claude/friendly-ride-0jrvet` | `mgr-shift-converter/` | Python（xlsx の XML を直接編集）、Excel | 2026-11-26 |
| コンセッション事前準備数ツール（v5.2 / 店舗版 ver2.0） | `claude/toho-shinjuku-concession-prep-la3vee` | `concession-prep/` | Python（openpyxl）、Excel | 2026-09-16（PR #2 オープン） |
| 採用判定アプリ（リクルート判定システム 新宿版） | `claude/toho-shinjuku-hiring-app-quhjtc` | `recruit-system/` | HTML/CSS/JS（1ファイルにビルド）、Node、Playwright | 2026-10-19 |
| 勤務実績ダッシュボード（Excel 版＋HTML 版） | `claude/toho-cinemas-attendance-dashboard-m9fc5a` | `tools/attendance_dashboard/` | Python（openpyxl）、HTML/JS、Node、Playwright | 2026-10-22 |
| 新宿映画館サミット2026 リレートーク用プレゼン | `claude/toho-shinjuku-presentation-6uwc4s` | `toho-shinjuku-summit-2026/` | HTML/CSS/JS（1ファイルにビルド）、Python | 2026-09-25 |
| 京王バス リアルタイムマップ | `claude/keio-bus-realtime-map-tmeekq` | `bus/` | HTML/JS（ODPT の GTFS/GTFS-RT、OpenStreetMap） | 2026-09-07 |
| 自己紹介ページ | `main`（`claude/create-intro-page-WFKM9` は PR #1 でマージ済み） | `index.html` | HTML | 2026-05-19 |

詳しい使い方・仕様は各ツールのフォルダの `README.md` にある。ここには要点と状態だけを書く。

### MGRシフト → シフトライン人数確認表（`mgr-shift-converter/`）

- 目的：MGRシフト表（月シート＋マスタ）から、日別・30分ごとの出勤人数を確かめる Excel を作る。
- 主なファイル：`build.py`（確認表を生成）、`make_master.py`（データを空にした原本を作る）、生成済みの xlsx 2点。
- 動かし方：`python build.py <MGRシフト.xlsx> <月シート名> <出力.xlsx>`、`python make_master.py <安定版.xlsx> <原本.xlsx>`
- 注意：条件付き書式・入力規則・図形を保つため、openpyxl を通さず xlsx 内の XML を直接編集している。
- 状態（2026-11-26）：シフトライン行の B6〜D6 のラベルを外し、行事タグの灰色背景を外したところまでプッシュ済み。

### コンセッション事前準備数ツール（`concession-prep/`）

- 目的：コンセ（飲食売店）のピーク前に作る数を、過去の購買率×ピーク動員×時間帯係数から出す Excel。
- 主なファイル：`build_tool.py`（テンプレート生成）、`build_calib.py`（係数算出シート）、`upgrade_v2.py`（店舗版 ver1.1 → ver2.0）、`verify_tool.py`・`verify_v2.py`（Python で独立に計算して突き合わせる）、`make_sample_v2.py`（乱数の仮数値サンプル）、`add_cooking_sheet.py`（調理時間シート）、`seal_protection.py`（再計算で落ちたシート保護の書き戻し）。
- 動かし方：`pip install openpyxl` のあと、README の「再生成・検証」の手順（生成 → LibreOffice で再計算 → 保護の書き戻し → 検証）。
- 注意：実売上 CSV・実データ入りのブック・店舗版ワークブックはリポジトリに入れない（README に明記）。
- 状態（2026-09-16）：「いつ作る」の 0 分表示と ⑥ 終了の入れ忘れガードを追加したところまで。PR #2（→ `main`）がオープンのまま。

### 採用判定アプリ（`recruit-system/`）

- 目的：面接台本の順に入力すると、A4 1枚の「面接チェックリスト報告」（電子印・最終合否つきの 1ファイル HTML）を作る。
- 主なファイル：`src/`（app.js・rules.js・storage.js ほか）、`build.js`、配布用 `dist/toho-recruit-judge.html`、仕様 `docs/SPEC-*.md`、デザイン `docs/DESIGN.md`、経緯 `docs/HANDOFF.md`。
- 動かし方：`node build.js`（配布ファイルの生成）、`node tests/rules.test.js`（単体）、`node build.js && node tests/e2e.js`（通しテスト。Playwright + Chromium が必要）。
- 注意：`node build.js --local` はロゴ等を差し込んだローカル版を `local/` に出す（公開版の `dist/` は書き換えない）。テスト用フィクスチャにあるパスワード等の値をこのファイルや会話に書き写さない。
- 状態（2026-10-19）：画面の見直し（デザインシステム v2）の仕上げまでプッシュ済み。README の記録では単体 42件・e2e 427件すべて通過。次の作業は `docs/HANDOFF.md` を先に読む。

### 勤務実績ダッシュボード（`tools/attendance_dashboard/`）

- 目的：シェアフルの月次シフト CSV から、スタッフごとの出勤率・当欠率・勤務時間などを出す（契約更新面談・エリア会議用）。
- 主なファイル：Excel 版 `build_dashboard.py`・`inject_values.py`・テンプレート xlsx、HTML 版 `app/src/`（engine と ui）・`app/build.py`・`app/dist/勤務実績ダッシュボード.html`、資料 `docs/`。
- 動かし方：`cd tools/attendance_dashboard/app && python3 build.py`。単体テスト `node test/unit_ingest.js` ほか、Excel 版との突き合わせ `node test/parity.js --extra`。
- 注意：テストデータはすべて架空の名前。実在スタッフのデータはリポジトリに入れない。
- 状態（2026-10-22）：HTML 版の「CSV 読み込み後もそのタブに留まる」修正とサンプルフィクスチャのコミットまでプッシュ済み。それより後の作業が手元に残っていたかは、このリポジトリからは分からない。

### 新宿映画館サミット2026 プレゼン（`toho-shinjuku-summit-2026/`）

- 目的：オフラインの会場 PC で動く 1ファイル HTML のプレゼンと台本。
- 主なファイル：`TOHO_Shinjuku_Summit2026.html`（本番用）、`src/`（編集用）、`build.py`、`script.json`・`gen_script.py`（台本）。
- 状態（2026-09-25）：下の操作バーを左右のタップ領域に置き換えたところまで。

### 京王バス リアルタイムマップ（`bus/`）

- 目的：京王バスの現在位置を地図に表示する Web アプリ（ODPT のオープンデータ）。
- 状態（2026-09-07）：初版を追加したところまで。

## 作業のルール

1. **`main` に直接 push しない。** 既存ツールの続きはそのツールのブランチで、新しい作業は新しいブランチを切って行う。`main` に入れるときは PR を作り、マージは持ち主が判断する。
2. **1つのブランチでは 1つのツールだけを触る。**
3. **公開・デプロイ（Web への公開など）は持ち主に確認してから。**
4. **実データ・個人情報・認証情報をリポジトリやこのファイルに入れない。** 売上 CSV、シフト・勤怠、応募者の情報、人事評価、パスワード、API キーなど。テスト・サンプルは架空データで作る。
5. 生成物（xlsx・dist の HTML）を変えたら、生成スクリプトも合わせてコミットし、各ツールの README の手順で検証してから push する。
6. コミットメッセージは日本語で、何をなぜ変えたかを書く。
7. 作業を終えたら、このファイルの「ツール一覧」の最後のコミットと、そのツールの「状態」を更新する（下の手順）。

## Codex と Claude の受け渡し

### 作業を始めるとき

1. このファイルを読み、触るツールの「状態」と、そのツールの `README.md`（採用判定アプリは `docs/HANDOFF.md` も）を読む。
2. そのツールのブランチの最新を取る：`git fetch origin <ブランチ> && git checkout <ブランチ> && git pull`
3. `git log --oneline -10` で、前の担当（Codex か Claude か）が最後に何をしたかを確かめる。ここに書いた状態より新しいコミットがあれば、そちらが正しい。

### 作業を終えるとき

1. テスト・検証を通してから、ツールのブランチにコミットして push する。
2. このファイルの該当ツールの「状態」を、日付・やったこと・次にやること・未解決の点で書き直す。AGENTS.md は `main` に置くので、更新は `main` 向けの小さな PR として出す（ツールのブランチに混ぜない）。
3. 途中で止めるときは、どこで止まったか・何が未コミットかを「状態」に書く。

### 書き方の決まり

- 状態は「日付（YYYY-MM-DD）：やったこと。次：〇〇。未解決：〇〇。」の形で、事実だけを書く。
- 誰が作業したか（Codex / Claude）を書く場合は、状態の末尾に（Codex）（Claude）と添える。
