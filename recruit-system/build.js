#!/usr/bin/env node
/*
 * src/ の分割ファイルを 1 つの HTML に結合して dist/ に出力する。
 *   node build.js
 * 外部依存なし。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const OUT = path.join(DIST, 'toho-recruit-judge.html');

let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, file) => {
  const css = fs.readFileSync(path.join(SRC, file), 'utf8');
  return '<style>\n' + css + '\n</style>';
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, file) => {
  const js = fs.readFileSync(path.join(SRC, file), 'utf8');
  if (/<\/script/i.test(js)) {
    throw new Error(file + ' に </' + 'script> が含まれています。インライン化できません。');
  }
  return '<script>\n/* ---- ' + file + ' ---- */\n' + js + '\n</script>';
});

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(OUT, html);
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('built: ' + path.relative(process.cwd(), OUT) + ' (' + kb + ' KB)');
