/*
 * 最終承認のパスワード（誤操作を防ぐ鍵。docs/SPEC-a4.md 11 章）
 * ----------------------------------------------------------------------
 * 最終確認の押印（management.decision.stampField の欄）と最終合否（採用／不採用）の決定・取消の前に求めるパスワード。
 * プロファイルには平文を持たず management.finalLock = { salt, hash }（hash = sha256Hex(salt + ':' + パスワード)。hash が空＝パスワードなし）だけを持つ。
 * これは誤操作を防ぐための鍵で、HTML をテキストで開いて書き換える人までは防げない。
 * 保存 HTML には source()（sha256Hex・hashPassword・isLocked・verify のソース）を埋め込み、#recruit-mgmt-config の finalLock で照合する。
 * そのため関数は外部参照のない ES5 の純関数で書く（関数内にコメント・閉じタグを書かない）。
 */
;(function (global) {
  'use strict';

  function sha256Hex(str) {
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var bytes = [], i, c;
    str = String(str == null ? '' : str);
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { var d = str.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var W = new Array(64), j, t1, t2, a, b, cc, dd, e, f, g, h;
    var rotr = function (x, n) { return (x >>> n) | (x << (32 - n)); };
    for (i = 0; i < bytes.length; i += 64) {
      for (j = 0; j < 16; j++) W[j] = ((bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3]) >>> 0;
      for (j = 16; j < 64; j++) {
        var s0 = rotr(W[j - 15], 7) ^ rotr(W[j - 15], 18) ^ (W[j - 15] >>> 3);
        var s1 = rotr(W[j - 2], 17) ^ rotr(W[j - 2], 19) ^ (W[j - 2] >>> 10);
        W[j] = (W[j - 16] + s0 + W[j - 7] + s1) >>> 0;
      }
      a = H[0]; b = H[1]; cc = H[2]; dd = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
      for (j = 0; j < 64; j++) {
        t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + W[j]) >>> 0;
        t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & cc) ^ (b & cc))) >>> 0;
        h = g; g = f; f = e; e = (dd + t1) >>> 0; dd = cc; cc = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + cc) >>> 0; H[3] = (H[3] + dd) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = '';
    for (i = 0; i < 8; i++) out += ('00000000' + H[i].toString(16)).slice(-8);
    return out;
  }

  function hashPassword(salt, pw) {
    return sha256Hex(String(salt == null ? '' : salt) + ':' + String(pw == null ? '' : pw));
  }
  function isLocked(lock) {
    return !!lock && typeof lock === 'object' && typeof lock.salt === 'string' && /^[0-9a-f]{32}$/.test(lock.salt) && typeof lock.hash === 'string' && /^[0-9a-f]{64}$/.test(lock.hash);
  }
  function verify(lock, pw) {
    if (!isLocked(lock)) return true;
    return hashPassword(lock.salt, pw) === lock.hash;
  }

  // 16 進 32 文字の乱数（crypto.getRandomValues があればそれ、無ければ Math.random）
  function newSalt() {
    var out = '', i, b = null;
    var c = global.crypto;
    if (c && typeof c.getRandomValues === 'function') {
      try { b = c.getRandomValues(new Uint8Array(16)); } catch (e) { b = null; }
    }
    for (i = 0; i < 16; i++) out += ('0' + ((b ? b[i] : Math.floor(Math.random() * 256)) & 255).toString(16)).slice(-2);
    return out;
  }

  // 新しいロック（パスワードが空ならロックなし）
  function makeLock(pw) {
    if (pw == null || String(pw) === '') return { salt: '', hash: '' };
    var salt = newSalt();
    return { salt: salt, hash: hashPassword(salt, pw) };
  }

  global.RecruitLock = {
    sha256Hex: sha256Hex,
    hashPassword: hashPassword,
    verify: verify,
    isLocked: isLocked,
    newSalt: newSalt,
    makeLock: makeLock,
    // 保存 HTML に埋め込む関数ソース（いずれも外部参照なし。hashPassword → sha256Hex、verify → isLocked・hashPassword）
    source: function () {
      return [sha256Hex, hashPassword, isLocked, verify].map(function (f) { return f.toString(); }).join('\n');
    }
  };
})(window);
