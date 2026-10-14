/*
 * ブランド（ロゴ画像）
 * ----------------------------------------------------------------------
 * 公開リポジトリには実際のロゴ（商標）を入れない。logo が空のときは、劇場名の 1 文字のマークを出す。
 * ロゴ入りの版は local/logo.png（または .svg / .webp）を置いて `node build.js --local` で作る（README「ロゴ・名簿入りの版」）。
 * アプリのサイドバーと、保存レポートの「詳細」表示のヘッダーで使う。
 */
;(function (global) {
  'use strict';

  global.RecruitBrand = {
    logo: '',      // 画像の data URL。build.js --local が local/ の画像で置き換える
    logoAlt: ''    // 代替テキスト（例: TOHO CINEMAS）。local/logo-alt.txt があればその内容
  };
})(window);
