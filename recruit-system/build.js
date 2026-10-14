#!/usr/bin/env node
/*
 * src/ の分割ファイルを 1 つの HTML に結合して dist/ に出力する。
 *   node build.js
 * 外部依存なし。
 *
 * ロゴ・名簿入りの版（公開リポジトリには入れないもの）:
 *   node build.js --local [ディレクトリ] [--out 出力ファイル]
 *   ディレクトリ（既定 ./local。.gitignore 済み）に次を置くと、その内容を差し込んだ版を
 *   <ディレクトリ>/dist/toho-recruit-judge.html に出力する（dist/ は書き換えない）。
 *     logo.png / logo.svg / logo.webp / logo.jpg … サイドバーと保存レポートのロゴ（最初に見つかったもの）
 *     logo-alt.txt                              … ロゴの代替テキスト（例: TOHO CINEMAS）
 *     managers.txt                              … 担当者名簿。1 行 1 人「氏名|印字名|役職|等級」（設定画面と同じ形式）
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const argv = process.argv.slice(2);
const localIdx = argv.indexOf('--local');
const LOCAL = localIdx >= 0 ? path.resolve(argv[localIdx + 1] && !argv[localIdx + 1].startsWith('--') ? argv[localIdx + 1] : path.join(__dirname, 'local')) : null;
const outIdx = argv.indexOf('--out');
const OUT = outIdx >= 0 && argv[outIdx + 1] ? path.resolve(argv[outIdx + 1])
  : LOCAL ? path.join(LOCAL, 'dist', 'toho-recruit-judge.html')
  : path.join(DIST, 'toho-recruit-judge.html');
if (LOCAL && !fs.existsSync(LOCAL)) throw new Error('--local のディレクトリがありません: ' + LOCAL);
if (LOCAL && OUT === path.join(DIST, 'toho-recruit-judge.html')) throw new Error('--local の出力で dist/ を上書きしないでください（公開版です）');

// --local: 差し込む内容を読む
const local = { logo: '', logoAlt: '', managers: null };
if (LOCAL) {
  const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
  const logoFile = ['logo.png', 'logo.svg', 'logo.webp', 'logo.jpg', 'logo.jpeg'].map(f => path.join(LOCAL, f)).find(f => fs.existsSync(f));
  if (logoFile) local.logo = 'data:' + MIME[path.extname(logoFile).toLowerCase()] + ';base64,' + fs.readFileSync(logoFile).toString('base64');
  const altFile = path.join(LOCAL, 'logo-alt.txt');
  if (fs.existsSync(altFile)) local.logoAlt = fs.readFileSync(altFile, 'utf8').trim();
  const mgrFile = path.join(LOCAL, 'managers.txt');
  if (fs.existsSync(mgrFile)) {
    local.managers = fs.readFileSync(mgrFile, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
      const [name, short, title, grade] = l.split(/[|｜]/).map(x => (x || '').trim());
      const m = { name: name, short: short || name.split(/[\s　]+/)[0], title: title || '' };
      if (grade) m.grade = grade;
      return m;
    }).filter(m => m.name);
  }
}
// ファイルごとの差し込み（--local のときだけ）
function applyLocal(file, js) {
  if (!LOCAL) return js;
  if (file === 'brand.js' && local.logo) {
    const before = js;
    js = js.replace(/logo: '',/, 'logo: ' + JSON.stringify(local.logo) + ',').replace(/logoAlt: ''/, 'logoAlt: ' + JSON.stringify(local.logoAlt));
    if (js === before) throw new Error('brand.js の logo を差し込めませんでした');
  }
  if (file === 'config.default.js' && local.managers) {
    const re = /managers: \[[\s\S]*?\n\s*\],/;
    if (!re.test(js)) throw new Error('config.default.js の managers を差し込めませんでした');
    js = js.replace(re, 'managers: ' + JSON.stringify(local.managers, null, 2).replace(/\n/g, '\n      ') + ',');
  }
  return js;
}

let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, file) => {
  const css = fs.readFileSync(path.join(SRC, file), 'utf8');
  return '<style>\n' + css + '\n</style>';
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, file) => {
  const js = applyLocal(file, fs.readFileSync(path.join(SRC, file), 'utf8'));
  if (/<\/script/i.test(js)) {
    throw new Error(file + ' に </' + 'script> が含まれています。インライン化できません。');
  }
  return '<script>\n/* ---- ' + file + ' ---- */\n' + js + '\n</script>';
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('built: ' + path.relative(process.cwd(), OUT) + ' (' + kb + ' KB)');
if (LOCAL) console.log('  local: ' + ([local.logo ? 'ロゴ' : '', local.managers ? '名簿 ' + local.managers.length + ' 名' : ''].filter(Boolean).join('・') || '差し込むものがありません'));
