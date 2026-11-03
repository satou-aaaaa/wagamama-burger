// 問題（levels.js）を作り直す道具。答えがちょうど1つで、要らない条件の無い問題だけを作る。
// 使い方: node tools/gen-levels.cjs > /tmp/levels.txt で候補を見て、levels.js に写す（お客さんの台詞は手で書く）。
const { ING, answers, perms, check, condText } = require("../rules.js");
// 4章だけを作るとき: node tools/gen-levels.cjs ch4（1〜3章は変えない）
const CH4 = process.argv[2] === "ch4";
let seed = CH4 ? 404 : Number(process.argv[2] || 11);
const R = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(R() * a.length)];
const KEYS = Object.keys(ING);
function randCond(items, kinds) {
  const u = [...new Set(items)], dup = u.filter((x) => items.filter((y) => y === x).length > 1);
  const t = pick(kinds.filter((k) => k !== "same" || dup.length));
  if (t === "same") return ["same", pick(dup)];
  if (["bottom", "top", "notTop", "notBottom"].includes(t)) return [t, pick(u)];
  const a = pick(u), b = pick(u);
  return a === b ? null : [t, a, b];
}
function make(n, minC, maxC, kinds, dup, must) {
  for (let tries = 0; tries < 50000; tries++) {
    const items = [];
    while (items.length < n) { const x = pick(KEYS); if (!dup && items.includes(x)) continue; if (items.filter((y) => y === x).length >= 2) continue; items.push(x); }
    if (dup && new Set(items).size === items.length) continue;
    let conds = [], ans = perms(items);
    for (let k = 0; k < 20 && ans.length > 1; k++) { const c = randCond(items, kinds); if (!c) continue; const na = ans.filter((o) => check(o, [c])[0]); if (!na.length || na.length === ans.length) continue; conds.push(c); ans = na; }
    if (ans.length !== 1) continue;
    for (let i = conds.length - 1; i >= 0; i--) { const t = conds.filter((_, j) => j !== i); if (answers(items, t).length === 1) conds = t; }
    if (conds.length < minC || conds.length > maxC) continue;
    if (conds.every((c) => ["bottom", "top"].includes(c[0]))) continue;
    if (must && !conds.some((c) => c[0] === must)) continue;
    return { items, conds, answer: ans[0] };
  }
  return null;
}
const K1 = ["bottom", "top", "notTop", "above", "above", "on"];
const K2 = [...K1, "apart", "apart", "same", "same", "notBottom"];
const K3 = [...K2, "gap", "gap"];
const plan = [
  [3, 2, 2, K1, false], [3, 2, 2, K1, false, "above"], [3, 2, 2, K1, false, "on"], [4, 2, 3, K1, false], [4, 3, 3, K1, false, "notTop"],
  [4, 3, 3, K1, false], [4, 3, 3, K1, false, "on"], [5, 3, 4, K1, false], [5, 3, 4, K1, false], [5, 4, 4, K1, false],
  [4, 2, 3, K2, false, "apart"], [4, 3, 3, K2, true, "same"], [4, 3, 3, K2, false, "apart"], [5, 3, 4, K2, true, "same"], [5, 3, 4, K2, false, "notBottom"],
  [5, 3, 4, K2, true], [5, 4, 4, K2, false, "apart"], [6, 3, 4, K2, true, "same"], [6, 4, 5, K2, false], [6, 4, 5, K2, true],
  [4, 2, 3, K3, false, "gap"], [5, 3, 3, K3, false, "gap"], [5, 3, 4, K3, true, "gap"], [5, 3, 4, K3, false], [6, 3, 4, K3, true, "gap"],
  [6, 4, 4, K3, false, "gap"], [6, 4, 5, K3, true], [6, 4, 5, K3, false, "gap"], [7, 4, 5, K3, true], [7, 5, 6, K3, true, "gap"],
];
// 4章「達人のわがまま」：新しい種類は無し。具材7〜8枚で、全部の種類をまぜる。途中にひと息つける人を入れる
const plan4 = [
  [7, 4, 5, K3, true], [7, 4, 5, K3, false, "gap"], [7, 5, 6, K3, true, "same"], [6, 4, 5, K3, true, "notTop"], [7, 5, 6, K3, false],
  [8, 5, 6, K3, true, "gap"], [7, 5, 6, K3, true, "notBottom"], [8, 5, 7, K3, false], [7, 5, 6, K3, true, "apart"], [8, 6, 7, K3, true, "gap"],
];
const out = (CH4 ? plan4 : plan).map((p, i) => { const L = make(...p); if (!L) throw new Error("作れなかった: " + i); return L; });
out.forEach((L, i) => console.log(String(i + 1).padStart(2), L.items.join(","), "|", L.conds.map(condText).join(" / ")));
console.log(JSON.stringify(out));
