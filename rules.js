// わがままバーガーの決まり。画面（index.html）と検査（qa/、tools/）で同じものを使う。
// order は下から上への具材の並び（上下のパンは含めない）。
var ING = { patty: "パティ", cheese: "チーズ", lettuce: "レタス", tomato: "トマト", pickle: "ピクルス", egg: "たまご", bacon: "ベーコン", onion: "オニオン" };
var COND = {
  bottom:    { txt: function (a) { return "いちばん下は" + ING[a]; }, ok: function (o, a) { return o[0] === a; } },
  top:       { txt: function (a) { return "いちばん上は" + ING[a]; }, ok: function (o, a) { return o[o.length - 1] === a; } },
  notTop:    { txt: function (a) { return ING[a] + "はいちばん上にしない"; }, ok: function (o, a) { return o[o.length - 1] !== a; } },
  notBottom: { txt: function (a) { return ING[a] + "はいちばん下にしない"; }, ok: function (o, a) { return o[0] !== a; } },
  above:     { txt: function (a, b) { return ING[a] + "は" + ING[b] + "より上"; }, ok: function (o, a, b) { return o.indexOf(a) > o.lastIndexOf(b); } },
  on:        { txt: function (a, b) { return ING[a] + "は" + ING[b] + "のすぐ上"; }, ok: function (o, a, b) { return o.some(function (x, i) { return x === a && o[i - 1] === b; }); } },
  apart:     { txt: function (a, b) { return ING[a] + "と" + ING[b] + "はくっつけない"; }, ok: function (o, a, b) { return !o.some(function (x, i) { return (x === a && o[i + 1] === b) || (x === b && o[i + 1] === a); }); } },
  same:      { txt: function (a) { return ING[a] + "どうしはくっつけない"; }, ok: function (o, a) { return !o.some(function (x, i) { return x === a && o[i + 1] === a; }); } },
  gap:       { txt: function (a, b) { return ING[a] + "と" + ING[b] + "の間に1枚"; }, ok: function (o, a, b) { return o.some(function (x, i) { return (x === a && o[i + 2] === b) || (x === b && o[i + 2] === a); }); } },
};
function check(order, conds) { return conds.map(function (c) { return COND[c[0]].ok(order, c[1], c[2]); }); }
function condText(c) { return COND[c[0]].txt(c[1], c[2]); }
// 重なりのない並べ方をすべて作る（同じ具材が2つあっても1回ずつ）
function perms(items) {
  var out = [], s = items.slice().sort(), used = s.map(function () { return false; }), cur = [];
  (function rec() {
    if (cur.length === s.length) { out.push(cur.slice()); return; }
    for (var i = 0; i < s.length; i++) {
      if (used[i] || (i > 0 && s[i] === s[i - 1] && !used[i - 1])) continue;
      used[i] = true; cur.push(s[i]); rec(); cur.pop(); used[i] = false;
    }
  })();
  return out;
}
function answers(items, conds) { return perms(items).filter(function (o) { return check(o, conds).every(Boolean); }); }

// --- きょうのわがまま（毎日1問。全員が同じ問題になるよう、日の番号だけから作る）---
// 乱数は Math.imul を使う mulberry32（どのブラウザでも同じ並びになる）
function rng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
var DAILY_FACES = ["🐻", "🐱", "🐧", "🐸", "🐰", "🐶", "🐹", "🐮", "🐵", "🐨", "🐷", "🦊", "🐔", "🐙", "🐼", "🦄", "🐯", "🦉", "🐳", "🦒", "🐢", "🦩", "🦔", "🦝", "🐘"];
// 日の番号 day（0 = 2026-11-03）から、答えがちょうど1つで要らない条件の無い問題を作る
function makeDaily(day) {
  var R = rng(20261103 + day * 7919), pick = function (a) { return a[Math.floor(R() * a.length)]; };
  var keys = Object.keys(ING), kinds = ["bottom", "top", "notTop", "notBottom", "above", "above", "on", "apart", "apart", "same", "same", "gap"];
  var n = day % 3 === 2 ? 6 : 5;
  for (var tries = 0; tries < 5000; tries++) {
    var items = [];
    while (items.length < n) { var x = pick(keys); if (items.filter(function (y) { return y === x; }).length >= (R() < 0.3 ? 2 : 1)) continue; items.push(x); }
    var u = items.filter(function (x, i) { return items.indexOf(x) === i; });
    var dup = u.filter(function (x) { return items.indexOf(x) !== items.lastIndexOf(x); });
    var conds = [], ans = perms(items);
    for (var k = 0; k < 20 && ans.length > 1; k++) {
      var t = pick(kinds.filter(function (q) { return q !== "same" || dup.length; })), c;
      if (t === "same") c = ["same", pick(dup)];
      else if (["bottom", "top", "notTop", "notBottom"].indexOf(t) >= 0) c = [t, pick(u)];
      else { var a = pick(u), b = pick(u); if (a === b) continue; c = [t, a, b]; }
      var na = ans.filter(function (o) { return check(o, [c])[0]; });
      if (!na.length || na.length === ans.length) continue;
      conds.push(c); ans = na;
    }
    if (ans.length !== 1) continue;
    for (var i = conds.length - 1; i >= 0; i--) { var rest = conds.filter(function (_, j) { return j !== i; }); if (answers(items, rest).length === 1) conds = rest; }
    if (conds.length < 3 || conds.length > 5) continue;
    if (conds.every(function (c2) { return c2[0] === "bottom" || c2[0] === "top"; })) continue;
    if (conds.some(function (c2) { return condText(c2).length > 18; })) continue;
    return { face: DAILY_FACES[day % DAILY_FACES.length], say: "きょうのわがまま #" + (day + 1), items: items, conds: conds, answer: ans[0], daily: day };
  }
  return null;
}
// 日本時間の日付から日の番号を出す（2026-11-03 が 0）
function dayNumber(date) {
  var jst = (date || new Date()).getTime() + 9 * 3600 * 1000;
  return Math.floor(jst / 86400000) - Math.floor(Date.UTC(2026, 10, 3) / 86400000);
}
if (typeof module !== "undefined") module.exports = { ING: ING, COND: COND, check: check, condText: condText, perms: perms, answers: answers, makeDaily: makeDaily, dayNumber: dayNumber, rng: rng };
