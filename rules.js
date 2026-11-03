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
if (typeof module !== "undefined") module.exports = { ING: ING, COND: COND, check: check, condText: condText, perms: perms, answers: answers };
