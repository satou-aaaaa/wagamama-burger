// わがままバーガーの検査。問題の形（答えが1つ）を全部の並べ方で確かめ、index.html をブラウザで開いて遊び方を確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { answers, check: judge, condText, perms, makeDaily, makeExtra, makeWeekly, weekOf, EXTRA, dayNumber, ING } = require(path.join(root, "rules.js"));
const { LEVELS, CHAPTERS } = require(path.join(root, "levels.js"));
const url = "file://" + path.join(root, "index.html");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

// 1. 問題の形（ブラウザを使わない）
check("お客さんは40人・4章（1章10人）", LEVELS.length === 40 && CHAPTERS.length === 4);
const notUnique = LEVELS.map((L, i) => [i, answers(L.items, L.conds)]).filter(([i, a]) => a.length !== 1 || a[0].join() !== LEVELS[i].answer.join());
check("どの問題も答えがちょうど1つで、answer と合う（全部の並べ方を試す）", notUnique.length === 0, notUnique.map(([i]) => i + 1).join(","));
const extra = LEVELS.map((L, i) => [i, L.conds.findIndex((_, k) => answers(L.items, L.conds.filter((__, j) => j !== k)).length === 1)]).filter(([, k]) => k >= 0);
check("要らない条件が無い（どの条件を外しても答えが2つ以上になる）", extra.length === 0, extra.map(([i, k]) => `${i + 1}の${k + 1}つ目`).join(","));
const KINDS = [["bottom", "top", "notTop", "above", "on"], ["apart", "same", "notBottom"], ["gap"], []];
const allowed = (ch) => KINDS.slice(0, ch + 1).flat();
const early = LEVELS.map((L, i) => [i, L.conds.find((c) => !allowed(Math.floor(i / 10)).includes(c[0]))]).filter(([, c]) => c);
check("まだ習っていない種類の条件が出ない（章ごとに新しいこだわりを1つずつ）", early.length === 0, early.map(([i, c]) => `${i + 1}:${c[0]}`).join(","));
check("2章・3章は、その章の新しいこだわりを使う問題が半分以上", [1, 2].every((ch) => LEVELS.slice(ch * 10, ch * 10 + 10).filter((L) => L.conds.some((c) => KINDS[ch].includes(c[0]))).length >= 5));
const longT = LEVELS.flatMap((L, i) => L.conds.map((c) => [i, condText(c)])).filter(([, t]) => t.length > 18);
check("条件の文は18字以内（一目で読める）", longT.length === 0, longT.map(([i, t]) => `${i + 1}:${t}`).join(","));
check("お客さんの台詞は17字以内", LEVELS.every((L) => [...L.say].length <= 17), LEVELS.filter((L) => [...L.say].length > 17).map((L) => L.say).join(","));
check("具材は3〜8個・条件は2〜7個（1画面に収まる）", LEVELS.every((L) => L.items.length >= 3 && L.items.length <= 8 && L.conds.length >= 2 && L.conds.length <= 7));
// 4章（達人）は、それまでの全部の種類を使い、具材は7枚以上が多い（深く遊ぶ人向け）
const ch4 = LEVELS.slice(30, 40), ch4Kinds = new Set(ch4.flatMap((L) => L.conds.map((c) => c[0])));
check("4章は全部の種類のこだわりが出て、7枚以上の人が8人以上", KINDS.slice(0, 3).flat().every((k) => ch4Kinds.has(k)) && ch4.filter((L) => L.items.length >= 7).length >= 8, [...ch4Kinds].join(","));
check("具材の数は後ろほど減らない（章の中で急にやさしくならない）", CHAPTERS.every((_, ch) => { const n = LEVELS.slice(ch * 10, ch * 10 + 10).map((L) => L.items.length); return n.every((x, k) => k === 0 || x >= n[k - 1] - 1); }));
check("同じ具材は2つまで", LEVELS.every((L) => L.items.every((x) => L.items.filter((y) => y === x).length <= 2)));
// 判定の決まりを、ランダムな並び 3000 通りで「数え方の違う書き方」と突き合わせる
let seed = 1; const R = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
const ref = {
  bottom: (o, a) => o[0] === a, top: (o, a) => o.at(-1) === a, notTop: (o, a) => o.at(-1) !== a, notBottom: (o, a) => o[0] !== a,
  above: (o, a, b) => Math.min(...o.flatMap((x, i) => (x === a ? [i] : []))) > Math.max(...o.flatMap((x, i) => (x === b ? [i] : []))),
  on: (o, a, b) => o.slice(1).some((x, i) => x === a && o[i] === b),
  apart: (o, a, b) => o.slice(1).every((x, i) => !((x === a && o[i] === b) || (x === b && o[i] === a))),
  same: (o, a) => o.slice(1).every((x, i) => !(x === a && o[i] === a)),
  gap: (o, a, b) => o.slice(2).some((x, i) => (x === a && o[i] === b) || (x === b && o[i] === a)),
};
const mism = [];
for (let k = 0; k < 3000; k++) {
  const L = LEVELS[Math.floor(R() * LEVELS.length)], all = perms(L.items), o = all[Math.floor(R() * all.length)];
  L.conds.forEach((c) => { if (judge(o, [c])[0] !== ref[c[0]](o, c[1], c[2])) mism.push(`${c.join("/")}@${o.join(",")}`); });
}
check("判定の決まりが、別の書き方の判定と3000通りで一致する", mism.length === 0, mism.slice(0, 3).join(" | "));

// 1b. きょうのわがまま：2年分（730日）作り、毎日答えがちょうど1つ・要らない条件なし・同じ日は同じ問題・文は18字以内
const dBad = [];
for (let d = 0; d < 730; d++) {
  const L = makeDaily(d), L2 = makeDaily(d);
  if (!L) { dBad.push(`${d}:作れない`); continue; }
  if (JSON.stringify(L) !== JSON.stringify(L2)) dBad.push(`${d}:毎回ちがう`);
  const a = answers(L.items, L.conds);
  if (a.length !== 1 || a[0].join() !== L.answer.join()) dBad.push(`${d}:答え${a.length}`);
  if (L.conds.some((_, k) => answers(L.items, L.conds.filter((__, j) => j !== k)).length === 1)) dBad.push(`${d}:要らない条件`);
  if (L.conds.some((c) => condText(c).length > 18) || L.items.length > 7) dBad.push(`${d}:長い`);
}
check("きょうのわがまま：730日分すべて答えが1つ・要らない条件なし・同じ日は同じ問題", dBad.length === 0, dBad.slice(0, 5).join(","));
const days = new Set(Array.from({ length: 60 }, (_, d) => JSON.stringify(makeDaily(d).conds)));
check("きょうのわがまま：60日続けて同じ問題が出ない", days.size === 60, String(days.size));
// 1c. おかわり：3つの難しさ × 150問。どれも答えが1つ・要らない条件なし・同じ番号は同じ問題・続けて同じ問題が出ない
const xBad = [];
for (let l = 0; l < EXTRA.length; l++) {
  const seen = new Set();
  for (let k = 0; k < 150; k++) {
    const L = makeExtra(l, k), L2 = makeExtra(l, k);
    const key = L && JSON.stringify([L.items, L.conds]);
    if (!L || L.items.length !== EXTRA[l].n || answers(L.items, L.conds).length !== 1 || answers(L.items, L.conds)[0].join() !== L.answer.join() || key !== JSON.stringify([L2.items, L2.conds]) || seen.has(key)
      || L.conds.some((_, c) => answers(L.items, L.conds.filter((__, j) => j !== c)).length === 1) || L.conds.length < EXTRA[l].min || L.conds.length > EXTRA[l].max || L.conds.some((c) => condText(c).length > 18)) xBad.push(`${l}-${k}`);
    seen.add(key);
  }
}
check("おかわり：3つの難しさ×150問すべて答えが1つ・要らない条件なし・同じ番号は同じ問題・重複なし", xBad.length === 0, xBad.slice(0, 5).join(","));
// おかわりは何問でも続く。並べ方を変えただけの同じ問題（具材の組と条件の組が同じ）が早く戻らないか、ふつう1500問・むずかしい300問で見る
// （2026-11-06 測った値：ふつうは2000問で1998通り・はじめて同じ問題が戻るのは1899問目。むずかしい・達人は2000問で重なりなし）
{
  const canon = (p) => [...p.items].sort().join() + "|" + p.conds.map((c) => c.join(":")).sort().join(";");
  const far = [];
  [[0, 1500], [1, 300]].forEach(([l, N]) => { const m = new Map(); for (let k = 0; k < N; k++) { const K = canon(makeExtra(l, k)); if (m.has(K)) far.push(`${EXTRA[l].name}${m.get(K) + 1}=${k + 1}`); m.set(K, k); } });
  check("おかわり：ふつう1500問・むずかしい300問のあいだ、同じ問題（具材と条件の組）が戻らない", far.length === 0, far.slice(0, 5).join(","));
}
// 1d. 今週の特大わがまま：156週（3年分）。具8枚・条件5〜7・答えが1つ・要らない条件なし・同じ週は同じ問題・重複なし。週は月曜はじまり
const wBad = [], wSeen = new Set();
for (let w = 0; w < 156; w++) {
  const L = makeWeekly(w), L2 = makeWeekly(w), key = L && JSON.stringify([L.items, L.conds]);
  if (!L || L.items.length !== 8 || answers(L.items, L.conds).length !== 1 || answers(L.items, L.conds)[0].join() !== L.answer.join() || key !== JSON.stringify([L2.items, L2.conds]) || wSeen.has(key)
    || L.conds.some((_, c) => answers(L.items, L.conds.filter((__, j) => j !== c)).length === 1) || L.conds.length < 5 || L.conds.length > 7 || L.conds.some((c) => condText(c).length > 18)) wBad.push(w);
  wSeen.add(key);
}
check("今週の特大わがまま：3年分すべて具8枚・答えが1つ・要らない条件なし・同じ週は同じ問題・重複なし", wBad.length === 0, wBad.slice(0, 5).join(","));
// 1e. 過去の問題が変わらない（指紋）。同じ処理で2回作って比べるだけでは、作り方を変えたとき両方が同じように変わって見逃す。
// 値が変わったら、過去の日・週・番号の問題とシェアの文が全部変わるということ。作り方は変えず、意図して変えるなら AGENTS.md の決まりを先に見直す。
const fp = (a) => createHash("sha256").update(JSON.stringify(a)).digest("hex");
const FP = {
  daily: "82e62058e781fd51b3f67d09981ec113614fb48b45ed43c4671cf9db0ac0d056",
  weekly: "76ae1e4a5289f33cf285dfe731b38918ff947fc0a4c7e36cde79a7fa43e78a20",
  extra: "07583058e3a4596a85629dfcc8d8340c491185d26531f6ecbcb59b1ae1a4a238",
};
const fpNow = {
  daily: fp(Array.from({ length: 200 }, (_, d) => makeDaily(d))),
  weekly: fp(Array.from({ length: 20 }, (_, w) => makeWeekly(w))),
  extra: fp([0, 1, 2].flatMap((lv) => Array.from({ length: 10 }, (_, k) => makeExtra(lv, k)))),
};
for (const k of Object.keys(FP)) check(`過去の問題が変わらない（${k} の指紋）`, fpNow[k] === FP[k], fpNow[k]);
check("週は月曜はじまり（11/3火は0週、11/9月から1週）", weekOf(0) === 0 && weekOf(5) === 0 && weekOf(6) === 1 && weekOf(12) === 1 && weekOf(13) === 2);
check("日の番号は日本時間の0時で変わる（2026-11-03 が #1）", dayNumber(new Date("2026-11-02T23:59:00+09:00")) === -1 && dayNumber(new Date("2026-11-03T00:00:00+09:00")) === 0 && dayNumber(new Date("2026-11-03T23:59:00+09:00")) === 0 && dayNumber(new Date("2026-11-04T00:00:00+09:00")) === 1);
const html = readFileSync(path.join(root, "index.html"), "utf8");
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームの name が3字以上（「感想」の2字だと GitHub がフォームを出さず白紙の Issue になる。shared-workflows incidents/2026-11-05-feedback-form-not-shown.md）", [...((fy.match(/^name:\s*(.+)$/m) || [])[1] || "").trim()].length >= 3 && /^description:\s*\S/m.test(fy), (fy.match(/^name:.*$/m) || [""])[0]); }
const og = (p) => (html.match(new RegExp(`<meta (?:property|name)="${p}" content="([^"]+)"`)) || [])[1];
check("OGP：題・説明・画像（絶対 URL）・大きいカードの指定がある", og("og:title") && og("og:description") && /^https:\/\/satou-aaaaa\.github\.io\/wagamama-burger\/ogp\.png$/.test(og("og:image") || "") && og("twitter:card") === "summary_large_image", og("og:image"));
const png = existsSync(path.join(root, "ogp.png")) ? readFileSync(path.join(root, "ogp.png")) : null;
check("ogp.png が 1200×630 で 1MB 未満", png && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.length < 1e6, png ? `${png.readUInt32BE(16)}x${png.readUInt32BE(20)} ${png.length}B` : "無い");

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear()); await page.reload();

  // 2. タイトル：40人並び、はじめから全員選べる（🔒で開く仕組みは入れない。2026-11-06 satou さん「好きなだけ遊んでほしい」）
  check("タイトルに40人並ぶ", (await page.locator(".lvbtn").count()) === 40);
  check("はじめから40人全員を選べる（押せないお客さん・🔒・？が無い）", (await page.locator(".lvbtn:not([disabled])").count()) === 40 && (await page.locator(".lvbtn.lock").count()) === 0 && !/🔒|？/u.test(await page.textContent("#chapters")));
  check("はじめは1人目だけに「つぎ」の印", (await page.locator(".lvbtn.next").count()) === 1 && (await page.getAttribute(".lvbtn.next", "data-i")) === "0");
  {
    const t = await page.evaluate(() => document.body.innerText);
    check("ページに🎫（チケット）・回数制限・「…すると開く」の文が無い", !/🎫|チケット|すると開く|で開く|回まで遊べ|残り\d+回/.test(t), (t.match(/.{0,10}(🎫|チケット|すると開く|で開く|回まで遊べ).{0,10}/) || [""])[0]);
    check("Ko-fi はタイトルの下のリンクと結果の画面の1行だけ（ほかに出さない）", await page.evaluate(() => { const a = [...document.querySelectorAll('a[href*="ko-fi"]')]; return a.length === 2 && a.some((x) => x.closest(".foot")) && a.some((x) => x.closest("#kofi")) && document.getElementById("kofi").closest("#play") !== null; }));
  }
  await page.click('.lvbtn[data-i="39"]');
  check("はじめての人でも40人目（4章・達人）をタイトルから遊べる", await page.evaluate(() => __game.state.mode === "level" && __game.state.lv === 39 && !document.getElementById("play").hidden));
  await page.evaluate(() => __game.showTitle());
  check("外のサイトのスクリプトを読まない", await page.evaluate(() => [...document.scripts].every((s) => !s.src || new URL(s.src).protocol === "file:")));
  const kofi = await page.evaluate(() => [...document.links].find((a) => a.href.includes("ko-fi"))?.href);
  check("応援のリンクが Ko-fi のページを指す（ボタン用スクリプトは入れない）", kofi === "https://ko-fi.com/satouaaaaa", kofi || "無い");
  // Ko-fi のひとこと：章を初めてクリアした結果の画面でだけ出す。遊ぶ前（タイトル）・途中・失敗・ふつうのクリアでは出さない（共有フォルダ kofi/app-guide.md）
  const kofi1 = await page.evaluate(() => {
    const vis = () => !document.getElementById("kofi").hidden && document.getElementById("kofi").offsetParent !== null;
    localStorage.clear(); const out = {}; out.title = vis();
    __game.start(0); out.playing = vis();
    const c0 = __game.state.cur; [...c0.answer].reverse().forEach((t) => __game.add(t)); __game.finish(); out.fail = __game.state.done ? "solved" : vis();
    __game.start(0); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); out.normalClear = vis();
    __game.start(9); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); out.chapterClear = vis();
    out.href = document.querySelector("#kofi a").href;
    __game.start(9); out.again = vis(); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); out.secondChapterClear = vis();
    return out;
  });
  check("Ko-fi のひとことは章を初めてクリアした結果の画面だけに出る（遊ぶ前・途中・失敗・ふつうのクリア・2回目には出ない）", kofi1.title === false && kofi1.playing === false && kofi1.fail === false && kofi1.normalClear === false && kofi1.chapterClear === true && kofi1.again === false && kofi1.secondChapterClear === false && kofi1.href === "https://ko-fi.com/satouaaaaa", JSON.stringify(kofi1));
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForLoadState("load");
  // 感想の受け口：タイトル・遊び方・終わりの画面に、Issue フォームへのただのリンク（ゲームからは何も送らない。shared-workflows routines/game-feedback.md）
  const fbs = await page.evaluate(() => [...document.querySelectorAll("a.fb")].map((a) => [a.href, a.target, a.rel, a.closest("#after,.guide,.foot")?.className]));
  check("感想を送るリンクが、タイトル・遊び方・終わりの画面にあり、Issue フォーム「感想」を新しいタブで開く", fbs.length === 3 && fbs.every(([h, t, r]) => h === "https://github.com/satou-aaaaa/wagamama-burger/issues/new?template=feedback.yml" && t === "_blank" && /noopener/.test(r)) && ["after", "guide", "foot"].every((c) => fbs.some((f) => f[3] === c)), JSON.stringify(fbs));

  // 3. 正しい順に積むと星3つ・次が開く
  await page.click('.lvbtn[data-i="0"]');
  for (const t of LEVELS[0].answer) await page.click(`.ing[data-t="${t}"]`);
  check("全部積むまで「できあがり！」は押せない（積んだ数）", await page.locator("#go").isEnabled());
  await page.click("#go");
  let st = await page.evaluate(() => __game.state);
  check("正しい順で「できあがり！」→ クリア・星3つ", st.done && st.stars === 3, JSON.stringify(st.stars));
  check("クリアすると条件が全部 ✓", (await page.locator("ul.conds li.ok").count()) === LEVELS[0].conds.length);
  await page.click("#go");
  check("「次のお客さん」で2人目へ", (await page.evaluate(() => __game.state.lv)) === 1);

  // 4. 間違えると ✗ が出て、外して直せる。2回目で解くと星2つ
  const L1 = LEVELS[1], wrong = perms(L1.items).find((o) => o.join() !== L1.answer.join());
  await page.click(`.ing[data-t="${wrong[0]}"]`);
  check("1つ積むまでは「できあがり！」が押せない", await page.locator("#go").isDisabled());
  for (const t of wrong.slice(1)) await page.click(`.ing[data-t="${t}"]`);
  await page.click("#go");
  st = await page.evaluate(() => __game.state);
  const ngCount = await page.locator("ul.conds li.ng").count();
  check("違う順だとクリアにならず、守れていない条件に ✗", !st.done && ngCount === judge(wrong, L1.conds).filter((x) => !x).length && ngCount > 0, `✗${ngCount}`);
  await page.locator(".stage .ly.t-" + wrong[0]).first().click();
  st = await page.evaluate(() => __game.state);
  check("積んだ具をタップすると外れて手元に戻る", st.stack.length === wrong.length - 1 && st.left.length === 1);
  await page.click("#undo");
  check("「ひとつ戻す」で一番上が外れる", (await page.evaluate(() => __game.state.stack.length)) === wrong.length - 2);
  await page.click("#retry");
  for (const t of L1.answer) await page.click(`.ing[data-t="${t}"]`);
  await page.click("#go");
  st = await page.evaluate(() => __game.state);
  check("2回目に解くと星2つ", st.done && st.stars === 2, String(st.stars));

  // 4b. 全部正しく積んでからヒントを押しても、ヒントを使ったことにならない（星3つのまま）
  await page.evaluate(() => __game.start(2));
  for (const t of LEVELS[2].answer) await page.click(`.ing[data-t="${t}"]`);
  await page.click("#hint"); await page.click("#go");
  st = await page.evaluate(() => __game.state);
  check("完成した並びでヒントを押しても星は減らない", st.done && st.stars === 3, String(st.stars));

  // 5. どの問題もヒントだけで解ける（ヒントを使うと星1つ）。わざと間違えた所からもヒントでたどり着ける
  const hintFail = [];
  for (let i = 0; i < LEVELS.length; i++) {
    await page.evaluate((i) => __game.start(i), i);
    const L = LEVELS[i], w = [...L.answer].reverse();
    for (const t of w.slice(0, 2)) await page.click(`.ing[data-t="${t}"]`);
    for (let k = 0; k < 20 && (await page.evaluate(() => __game.state.left.length)) > 0; k++) {
      await page.click("#hint");
      // 1回目のヒントは条件を光らせるだけ（具は教えない）。具が光っていなければもう一度押す
      if (!(await page.locator(".stage .ly.hint, .ing.hint").count())) await page.click("#hint");
      const bad = page.locator(".stage .ly.hint");
      if (await bad.count()) await bad.click(); else await page.click(".ing.hint");
    }
    // ヒントで一度外した後、残りもヒントでそろえる
    await page.click("#go");
    const s = await page.evaluate(() => __game.state);
    if (!(s.done && s.stars >= 1)) hintFail.push(i + 1);
  }
  check(LEVELS.length + "問すべて、間違えた所からヒントだけで解ける", hintFail.length === 0, hintFail.join(","));

  // 6. でたらめに積んだり外したりしても、具材の数は変わらず、エラーも出ない（各問題 30 手 × 30 問）
  const lost = await page.evaluate((LV) => {
    const bad = [];
    for (let i = 0; i < LV.length; i++) {
      __game.start(i);
      for (let k = 0; k < 30; k++) {
        const s = __game.state;
        if (s.left.length && (Math.random() < 0.7 || !s.stack.length)) __game.add(s.left[Math.floor(Math.random() * s.left.length)]);
        else if (s.stack.length) document.querySelectorAll(".stage .ly:not(.t-bun-b):not(.t-bun-t)")[Math.floor(Math.random() * s.stack.length)].click();
        const t = __game.state; if (t.left.length + t.stack.length !== LV[i].items.length) bad.push(i + 1);
      }
    }
    return [...new Set(bad)];
  }, LEVELS);
  check("でたらめに積み外ししても具材の数が変わらない", lost.length === 0, lost.join(","));

  // 7. 記録と音の設定は、開き直しても残る。星の合計がシェアの文に入る
  await page.click("#back");
  await page.click("#sound1");
  await page.reload();
  check("開き直しても記録が残る（クリアした人に★が出る・全員選べるまま）", (await page.locator(".lvbtn .s", { hasText: "★" }).count()) >= 2 && (await page.locator(".lvbtn:not([disabled])").count()) === 40);
  check("開き直しても音を消した設定が残る", (await page.textContent("#sound1")) === "🔈");
  const share = await page.evaluate(() => shareText());
  check("シェアの文にクリア人数と星が入る", /お客さん \d+\/40 人クリア ★\d+/.test(share), share.split("\n")[1]);
  check("ページのエラーが無い", errors.length === 0, errors.join(" / "));

  // 7b. 出題リンク・きょうのわがまま・連続日数・シェアの文（答えを書かない）
  const names = Object.values(ING);
  const leak = (t) => names.filter((n) => t.includes(n));
  const pq = await browser.newPage({ viewport: { width: 390, height: 800 } });
  pq.on("pageerror", (e) => errors.push(e.message));
  await pq.goto(url + "?q=15");
  let qs = await pq.evaluate(() => __game.state);
  check("出題リンク（?q=15）で開くと、まだ開いていなくても15人目から遊べる", qs.mode === "level" && qs.lv === 14 && await pq.locator("#banner").isVisible());
  for (const bad of ["?q=0", "?q=41", "?q=abc", "?q=2.5"]) { await pq.goto(url + bad); if (!(await pq.locator("#title").isVisible())) errors.push("変な出題リンクでタイトルが出ない " + bad); }
  check("変な出題リンク（0・41・文字・小数）ではタイトルが出る", !errors.some((e) => e.startsWith("変な出題リンク")));
  await pq.evaluate(() => localStorage.clear()); await pq.goto(url);
  check("はじめて遊ぶ人には遊び方の案内が出る", await (async () => { await pq.click("#cont"); return pq.locator("#guide").isVisible(); })());
  await pq.click("#guideOk"); await pq.reload(); await pq.click("#cont");
  check("案内は「わかった」のあと、開き直しても出ない", !(await pq.locator("#guide").isVisible()));
  check("条件の文に具材の小さな絵が付く", (await pq.locator("ul.conds .chip i.ly").count()) >= 2);
  check("「できあがり！」に残りの数が出る", /あと\d+個/.test(await pq.textContent("#go")));
  // 連続日数：10日目・11日目に解くと2日連続、13日目は0に戻り、解くと1。最高は2のまま
  const solveDaily = async (d) => { await pq.evaluate((d) => { __game.setToday(d); __game.startDaily(); }, d); const a = await pq.evaluate(() => __game.state.cur.answer); for (const t of a) await pq.click(`.ing[data-t="${t}"]`); await pq.click("#go"); return pq.evaluate(() => __game.state); };
  let ds = await solveDaily(10);
  check("きょうのわがまま：一発で解くと星3つ・連続1日", ds.done && ds.stars === 3 && ds.streak === 1, JSON.stringify([ds.stars, ds.streak]));
  const dText = await pq.evaluate(() => __game.shareText("daily"));
  check("きょうの結果のシェア文：番号・結果の絵文字・URL・タグがあり、具材の名前（答え）を書かない", /#11/.test(dText) && dText.includes("🟩") && /^https:\/\/satou-aaaaa\.github\.io\/wagamama-burger\/$/m.test(dText) && dText.includes("#わがままバーガー") && leak(dText).length === 0, leak(dText).join(","));
  ds = await solveDaily(11);
  check("次の日も解くと2日連続", ds.streak === 2, String(ds.streak));
  await pq.evaluate(() => { __game.setToday(11); __game.startDaily(); });
  check("同じ日にもう一度解いても連続は増えず、クリア済みと出る", (await pq.evaluate(() => __game.state.streak)) === 2 && await pq.locator("#banner").isVisible());
  await pq.evaluate(() => { __game.setToday(13); __game.showTitle(); });
  // 休んだ日を責めない：連続が0のときは連続の言葉を出さない（2026-11-04 やりこみの決まり。前は「とぎれました」と出していた）
  check("1日あけると連続は0に戻り、タイトルに連続の言葉を出さない（とぎれた・0日と書かない）", (await pq.evaluate(() => __game.state.streak)) === 0 && (await pq.textContent("#streak")).trim() === "");
  ds = await solveDaily(13);
  check("とぎれたあと解くと1日から数え直す", ds.streak === 1);
  await pq.reload();
  check("開き直しても連続日数と最高が残る", /最高 2日/.test(await pq.textContent("#streak")), await pq.textContent("#streak"));
  // 間違えてから解くと、結果の絵文字に 🟥 が入る
  await pq.evaluate(() => { __game.setToday(20); __game.startDaily(); });
  const d20 = await pq.evaluate(() => __game.state.cur);
  const w20 = perms(d20.items).find((o) => o.join() !== d20.answer.join());
  for (const t of w20) await pq.click(`.ing[data-t="${t}"]`); await pq.click("#go"); await pq.click("#retry");
  for (const t of d20.answer) await pq.click(`.ing[data-t="${t}"]`); await pq.click("#go");
  const d20t = await pq.evaluate(() => __game.shareText("daily"));
  check("間違えてから解いたシェア文は 🟥🟩・星2つ", d20t.includes("🟥🟩") && d20t.includes("★★☆"), d20t.split("\n")[1]);
  // 日付をまたいで解いても、その問題の日として記録し、次の日の問題も記録できる（2026-11-03 CodeRabbit 指摘）
  await pq.evaluate(() => { __game.setToday(40); __game.startDaily(); });
  const d40 = await pq.evaluate(() => __game.state.cur.answer);
  await pq.evaluate(() => __game.setToday(41));
  for (const t of d40) await pq.click(`.ing[data-t="${t}"]`); await pq.click("#go");
  const s40 = await pq.evaluate(() => [__game.state.streak, __game.shareText("daily")]);
  ds = await solveDaily(41);
  const s41 = await pq.evaluate(() => { __game.setToday(42); return __game.shareText("daily"); });
  check("日付をまたいで解いた問題はその日の記録になり、次の日の問題も記録され、日が変わってもその結果をシェアできる", /#41\n/.test(s40[1]) && s40[0] === 1 && ds.streak === 2 && /#42\n/.test(s41), JSON.stringify([s40, ds.streak, s41.split("\n")[0]]));
  // 取りこぼした日をあとから解く：記録帳のカレンダーの ↺ から、その日の問題を遊べる。連続日数とカレンダーの正（log）は変えない
  await pq.evaluate(() => { __game.setToday(45); __game.showTitle(); document.getElementById("log").open = true; });
  const before = await pq.evaluate(() => ({ streak: __game.rec().streak, missed: __game.missedDays() }));
  await pq.click('.misses .miss[data-d="44"]');
  const p44 = await pq.evaluate(() => ({ mode: __game.state.mode, items: __game.state.cur.items, answer: __game.state.cur.answer, lv: document.getElementById("lv").textContent }));
  for (const t of p44.answer) await pq.click(`.ing[data-t="${t}"]`); await pq.click("#go");
  const a44 = await pq.evaluate(() => ({ rec: __game.rec(), stars: __game.state.stars, shareR: !document.getElementById("shareR").hidden, go: document.getElementById("go").textContent }));
  check("あとから：↺ を押すとその日の問題（makeDaily と同じ）が出て、解くと past に星が付き、log・連続日数は変わらず、結果のシェアは出ない",
    before.missed.includes(44) && !before.missed.includes(40) && p44.mode === "past" && JSON.stringify(p44.items) === JSON.stringify(makeDaily(44).items) && /#45/.test(p44.lv)
    && a44.rec.past[44] === 3 && !a44.rec.log[44] && JSON.stringify(a44.rec.streak) === JSON.stringify(before.streak) && a44.stars === 3 && !a44.shareR && /タイトル/.test(a44.go),
    JSON.stringify({ missed: before.missed.slice(0, 3), p44: p44.mode, lv: p44.lv, past: a44.rec.past, shareR: a44.shareR, go: a44.go }));
  await pq.evaluate(() => { __game.showTitle(); document.getElementById("log").open = true; });
  const cell44 = await pq.textContent('.cal i[title="#45（あとから）"]');
  const gone44 = await pq.locator('.misses .miss[data-d="44"]').count();
  check("あとから解いた日はカレンダーに ↺★ で出て、取りこぼしのボタンからは消える", cell44 === "↺★3" && gone44 === 0, cell44 + " " + gone44);
  const mp = await pq.evaluate(() => __game.mergeRec({ best: [], log: {}, past: { 5: 1, 6: 3 }, extra: [], streak: { max: 0 }, wlog: {}, badges: [] }, { past: { 5: 3, 6: 1, 7: 2 } }).past);
  check("タブを合わせても、あとから解いた日の星は多いほうが残る", mp[5] === 3 && mp[6] === 3 && mp[7] === 2, JSON.stringify(mp));
  // 出題・結果のシェア文
  await pq.evaluate(() => __game.start(0)); for (const t of LEVELS[0].answer) await pq.click(`.ing[data-t="${t}"]`); await pq.click("#go");
  check("クリアすると「出題する」「結果をシェア」が出て、使えない「ひとつ戻す・ヒント」の列は隠れる", await pq.locator("#shareQ").isVisible() && await pq.locator("#shareR").isVisible() && !(await pq.locator("#sub").isVisible()));
  const cText = await pq.evaluate(() => __game.shareText("challenge")), lText = await pq.evaluate(() => __game.shareText("level"));
  check("出題の文は ?q=番号 の URL 付きで、答えを書かない", cText.includes("?q=1\n") && lText.includes("?q=1\n") && leak(cText + lText).length === 0, leak(cText + lText).join(","));
  // 出題の文は台詞にも具材の名前が出ることがあるので、全員分で確かめる（2026-11-03 CodeRabbit 指摘：2人目の台詞に「パティ」）
  const cLeaks = await pq.evaluate((n) => { const out = []; for (let i = 0; i < n; i++) { __game.start(i); const t = __game.shareText("challenge"); out.push([i + 1, t, t.includes("?q=" + (i + 1) + "\n")]); } return out; }, LEVELS.length);
  const badC = cLeaks.filter(([i, t, ok]) => !ok || leak(t).length);
  check("全員分の出題の文に具材の名前が無く、それぞれの ?q=番号 が付く", badC.length === 0, badC.map(([i, t]) => i + ":" + leak(t).join("/")).join(" "));
  // 「コピーしました」を続けて出しても、最後は元の文言に戻る
  const flashBack = await pq.evaluate(async () => { const b = document.getElementById("share1"); const o = b.innerHTML; __game.flash(b, "コピーしました"); await new Promise((r) => setTimeout(r, 300)); __game.flash(b, "コピーしました"); await new Promise((r) => setTimeout(r, 1900)); return b.innerHTML === o; });
  check("シェアのボタンを続けて押しても、文言が元に戻る", flashBack);
  // おかわり：解くと次の問題へ、ノーミス連続を数え、ミスすると0に戻る。最高は残る
  await pq.evaluate(() => { localStorage.clear(); __game.showTitle(); });
  await pq.reload();
  const solveExtra = async (miss) => {
    const c = await pq.evaluate(() => __game.state.cur);
    if (miss) { const w = perms(c.items).find((o) => o.join() !== c.answer.join()); for (const t of w) await pq.click(`.ing[data-t="${t}"]`); await pq.click("#go"); await pq.click("#retry"); }
    for (const t of c.answer) await pq.click(`.ing[data-t="${t}"]`); await pq.click("#go");
    return c;
  };
  await pq.evaluate((src) => { window.perms = new Function("return " + src)(); }, perms.toString());
  // おかわりの大きな入口（2026-11-05 satou さん「一日で遊べる量が少なすぎる」）：ホームの上の方に、はじめての人にも見える
  const gx0 = await pq.evaluate(() => { const b = document.getElementById("go-x"), r = b.getBoundingClientRect(), ex = document.querySelector(".extra").getBoundingClientRect(), w = document.getElementById("weeklyBtn").getBoundingClientRect(); return { vis: !!b.offsetParent, h: r.height, top: r.top, exTop: ex.top, wb: w.bottom, t: b.textContent }; });
  check("ホーム：おかわりの大きなボタンが今週の特大のすぐ下にあり（下の箱より上）、44px以上・はじめては ふつう", gx0.vis && gx0.h >= 44 && gx0.top >= gx0.wb && gx0.top - gx0.wb < 20 && gx0.top < gx0.exTop && /何問続けて/.test(gx0.t) && /ふつう/.test(gx0.t) && /はじめて/.test(gx0.t), JSON.stringify(gx0));
  await pq.click('#extras button[data-l="1"]');
  const e1 = await solveExtra(false);
  await pq.click("#go");
  const e2 = await solveExtra(false);
  let xr = await pq.evaluate(() => __game.rec().extra[1]);
  check("おかわり：一発で2問解くとノーミス2連続・次は別の問題", xr.n === 2 && xr.run === 2 && xr.best === 2 && JSON.stringify(e1.conds) !== JSON.stringify(e2.conds), JSON.stringify(xr));
  check("おかわり：結果のシェア文に答え（具材の名前）を書かない", (await pq.evaluate(() => __game.shareText("extra"))).includes("ノーミス 2連続") && leak(await pq.evaluate(() => __game.shareText("extra"))).length === 0);
  await pq.click("#go"); await solveExtra(true);
  xr = await pq.evaluate(() => __game.rec().extra[1]);
  check("おかわり：ミスすると連続は0に戻り、最高は残る", xr.n === 3 && xr.run === 0 && xr.best === 2, JSON.stringify(xr));
  await pq.click("#back");
  check("タイトルのおかわりに解いた数と最高が出る", /3問/.test(await pq.textContent('#extras button[data-l="1"]')) && /最高 2/.test(await pq.textContent('#extras button[data-l="1"]')));
  check("ホームのおかわりの大きなボタンは、遊んだいちばん上の難しさと、そのノーミス最高を出す", await pq.evaluate(() => __game.exPick()) === 1 && /むずかしい.*最高 2連続/.test(await pq.textContent("#go-x")), await pq.textContent("#go-x"));
  await pq.click("#go-x");
  check("ホームのおかわりの大きなボタンで、その難しさのおかわりが始まる", await pq.evaluate(() => __game.state.mode === "extra" && /おかわり・むずかしい/.test(document.getElementById("lv").textContent)));
  await pq.click("#back");
  // 練習（お客さん）を解いた結果には出さない。毎日1問・今週の特大の結果にだけ出す
  await pq.evaluate(() => __game.start(0)); await solveExtra(false);
  check("お客さん（章）の結果の画面には、おかわりへの案内を出さない", await pq.locator("#goX2").isHidden());
  await pq.click("#back");
  await pq.evaluate(() => __game.startWeekly()); await solveExtra(false);
  const gxw = await pq.evaluate(() => { const b = document.getElementById("goX2"); return { vis: !!b.offsetParent, h: b.getBoundingClientRect().height, t: b.textContent }; });
  check("今週の特大を解くと、結果の画面に「続けて遊ぶ：おかわり」とノーミス最高の大きなボタン（44px以上）", gxw.vis && gxw.h >= 44 && /続けて遊ぶ：おかわり/.test(gxw.t) && /ノーミス最高 2連続/.test(gxw.t), JSON.stringify(gxw));
  await pq.click("#back");
  // 記録帳：きょうの星がカレンダーに、章の王冠は全員★3で付く
  await pq.evaluate(() => { __game.setToday(30); }); await pq.evaluate(() => __game.startDaily());
  await solveExtra(false);
  const gxd = await pq.evaluate(() => { const b = document.getElementById("goX2"); return { vis: !!b.offsetParent, h: b.getBoundingClientRect().height, t: b.textContent }; });
  check("きょうのわがままを解くと、結果の画面に「続けて遊ぶ：おかわり」の大きなボタン（44px以上）", gxd.vis && gxd.h >= 44 && /続けて遊ぶ：おかわり/.test(gxd.t) && /ノーミス最高 2連続/.test(gxd.t) && /むずかしい/.test(gxd.t), JSON.stringify(gxd));
  await pq.click("#goX2");
  const gxs = await pq.evaluate(() => ({ mode: __game.state.mode, done: __game.state.done, lv: document.getElementById("lv").textContent, n: __game.rec().extra[1].n, log: __game.rec().log[30], toast: document.getElementById("toast").classList.contains("on") }));
  check("結果の画面の「続けて遊ぶ」で、おかわりの次の問題が始まる（きょうの記録はそのまま・前の知らせを持ち越さない）", gxs.mode === "extra" && !gxs.done && /おかわり・むずかしい/.test(gxs.lv) && gxs.n === 3 && gxs.log === 3 && !gxs.toast, JSON.stringify(gxs));
  await pq.click("#back");
  await pq.click("#log summary");
  const logText = await pq.textContent("#logBody");
  check("記録帳に、きょうの星（カレンダー）・解いた日・おかわりの記録が出る", (await pq.locator(".cal i.today.s3").count()) === 1 && /解いた日 1日/.test(logText) && /むずかしい3問/.test(logText), logText.slice(0, 120));
  await pq.evaluate(() => { const r = JSON.parse(localStorage.getItem("wagamamaBurger1")); r.best = Array(10).fill(3); localStorage.setItem("wagamamaBurger1", JSON.stringify(r)); });
  await pq.reload();
  check("1章を全員★3にすると、章と記録帳に王冠が付く", /👑/.test(await pq.textContent(".chap h2")) && /1章👑/.test(await pq.textContent("#logBody")));
  // お客さん図鑑：満足させた人の顔が出て、まだの人は ？。数は解いた人数と同じ
  const zk = await pq.evaluate(() => { const els = [...document.querySelectorAll("#logBody .zukan i")]; return { n: els.length, shown: els.filter((e) => e.textContent !== "？").length, cleared: JSON.parse(localStorage.getItem("wagamamaBurger1")).best.filter((b) => b > 0).length, title: document.querySelector("#logBody .zt").textContent }; });
  check("記録帳のお客さん図鑑に全員の枠があり、満足させた人だけ顔が出る", zk.n === 40 && zk.shown >= 10 && zk.shown === zk.cleared && zk.title.includes(zk.cleared + "/40"), JSON.stringify(zk));
  // 改善 2026-11-03：次の問題までの時間・星の分布・キーボード・おかわりの先作り
  check("次のきょうのわがまままでの時間：日本時間0時の1分前は「0時間1分」、0時ちょうどは「24時間0分」", await pq.evaluate(() => __game.untilNext(Date.UTC(2026, 10, 3, 14, 59)) === "0時間1分" && __game.untilNext(Date.UTC(2026, 10, 3, 15, 0)) === "24時間0分"));
  await pq.evaluate(() => { __game.setToday(30); __game.showTitle(); });
  check("きょうの分を解くと、タイトルに「次まで ○時間○分」が出る", /次まで \d+時間\d+分/.test(await pq.textContent("#dailySub")), await pq.textContent("#dailySub"));
  check("記録帳に、きょうのわがままの星の分布が出る", (await pq.locator("#logBody .dist i").count()) === 3 && /★3/.test(await pq.textContent("#logBody .dist")));
  await pq.evaluate(() => __game.start(3));
  const kAns = LEVELS[3].answer;
  for (const t of kAns) { const idx = await pq.evaluate((t) => [...document.querySelectorAll("#tray .ing")].findIndex((b) => b.dataset.t === t), t); await pq.keyboard.press(String(idx + 1)); }
  await pq.keyboard.press("Backspace");
  const kLeft = await pq.evaluate(() => __game.state.left.length);
  const lastIdx = await pq.evaluate((t) => [...document.querySelectorAll("#tray .ing")].findIndex((b) => b.dataset.t === t), kAns[kAns.length - 1]);
  await pq.keyboard.press(String(lastIdx + 1)); await pq.evaluate(() => document.activeElement && document.activeElement.blur()); await pq.keyboard.press("Enter");
  check("キーボードだけで解ける（数字でのせる・Backspaceで戻す・Enterでできあがり）", kLeft === 1 && (await pq.evaluate(() => __game.state.done)));
  await pq.evaluate(() => __game.startExtra(2));
  const xk = await pq.evaluate(() => __game.rec().extra[2] ? __game.rec().extra[2].n : 0);
  const xc = await pq.evaluate(() => __game.state.cur.answer);
  for (const t of xc) await pq.click(`.ing[data-t="${t}"]`); await pq.click("#go");
  await pq.waitForTimeout(2500);
  check("おかわりを解くと、次の問題を先に作っておく（待ち時間なし）", await pq.evaluate((k) => __game.exCached(2, k + 1), xk));
  await pq.keyboard.press("Escape");
  check("Esc でタイトルにもどる", await pq.locator("#title").isVisible());
  // 別のタブで新しい日を解いた後に、古いタブで前の日を解いても、新しい記録が消えない（2026-11-03 CodeRabbit 指摘）
  const merged = await pq.evaluate(() => {
    localStorage.clear(); __game.setToday(40); __game.startDaily();
    const c = __game.state.cur;
    const other = { best: [3], daily: { day: 41, solved: true, stars: 3, tries: 1, hint: false }, streak: { last: 41, n: 4, max: 4 }, log: { 38: 2, 39: 3, 41: 3 }, extra: [{ n: 9, run: 2, best: 4, perfect: 6 }] };
    localStorage.setItem("wagamamaBurger1", JSON.stringify(other));
    __game.setToday(41); c.answer.forEach((t) => __game.add(t)); __game.finish();
    return JSON.parse(localStorage.getItem("wagamamaBurger1"));
  });
  check("別のタブの新しい記録（きょう・連続・カレンダー・おかわり・星）を、古いタブの保存で消さない", merged.daily.day === 41 && merged.streak.last === 41 && merged.streak.n === 4 && merged.log[41] === 3 && merged.log[40] === 3 && merged.extra[0].n === 9 && merged.best[0] === 3, JSON.stringify([merged.daily.day, merged.streak, merged.log, merged.extra[0]]));
  // 解いた数はこのタブが多くても、別のタブのノーミス最高・★3の数は残す（2026-11-03 CodeRabbit 指摘）
  const mergedEx = await pq.evaluate(() => {
    const a = { best: [], log: {}, daily: null, streak: { last: -1, n: 0, max: 0 }, extra: [{ n: 6, run: 1, best: 1, perfect: 2 }], guided: false };
    return __game.mergeRec(a, { extra: [{ n: 5, run: 5, best: 5, perfect: 5 }] }).extra[0];
  });
  check("おかわりの記録を合わせるとき、ノーミス最高と★3の数は大きいほうを残す", mergedEx.n === 6 && mergedEx.run === 1 && mergedEx.best === 5 && mergedEx.perfect === 5, JSON.stringify(mergedEx));
  // 同じ日を2つのタブで解いたら、先に保存した結果を残す（共有の星とカレンダーがそろう。2026-11-03 CodeRabbit 指摘）
  const sameDay = await pq.evaluate(() => {
    const a = { best: [], log: { 41: 3 }, daily: { day: 41, solved: true, stars: 3 }, streak: { last: 41, n: 1, max: 1 }, extra: [], guided: false };
    const r = __game.mergeRec(a, { log: { 41: 2, 40: 1 }, daily: { day: 41, solved: true, stars: 2 } });
    return [r.daily.stars, r.log[41], r.log[40]];
  });
  check("同じ日のきょうのわがままは、先に保存した結果を残す（星とカレンダーがそろう）", sameDay.join() === "2,2,1", sameDay.join());
  // 連続日数はカレンダー（log）から数え直す（2026-11-03 CodeRabbit 指摘：タブごとの連続数を比べて選ぶと日が抜けた）
  const streakCases = await pq.evaluate(() => {
    const base = () => ({ best: [], log: {}, daily: null, streak: { last: -99, n: 0, max: 0 }, extra: [], guided: false });
    // 保存済みは D=600 まで 501 日連続、このタブは D+1 だけ → 502 日連続
    const stored = { log: {} }; for (let d = 100; d <= 600; d++) stored.log[d] = 2; stored.streak = { last: 600, n: 501, max: 501 };
    const a = base(); a.log[601] = 3; const r1 = __game.mergeRec(a, stored).streak;
    // 離れた日どうしは、新しいほうから数える
    const b = base(); b.log[50] = 3; const r2 = __game.mergeRec(b, { log: { 40: 1, 41: 1, 42: 1 }, streak: { last: 42, n: 3, max: 3 } }).streak;
    return [r1, r2];
  });
  check("連続日数は合わせたカレンダーから数える（501日＋次の日＝502日、離れた日は新しいほうから）", streakCases[0].last === 601 && streakCases[0].n === 502 && streakCases[0].max === 502 && streakCases[1].last === 50 && streakCases[1].n === 1 && streakCases[1].max === 3, JSON.stringify(streakCases));
  // 次の日の記録を取り込んだあとで前の日を解いても、前の日がカレンダーと連続に入り、シェアはその日の結果になる
  const lateDay = await pq.evaluate(() => {
    localStorage.clear(); __game.setToday(60); __game.startDaily();
    const c = __game.state.cur;
    localStorage.setItem("wagamamaBurger1", JSON.stringify({ best: [], daily: { day: 61, solved: true, stars: 1, tries: 2, hint: true }, log: { 59: 3, 61: 1 }, streak: { last: 61, n: 1, max: 1 } }));
    __game.setToday(61); c.answer.forEach((t) => __game.add(t)); __game.finish();
    const saved = JSON.parse(localStorage.getItem("wagamamaBurger1"));
    return { log: saved.log, streak: saved.streak, daily: saved.daily.day, share: __game.shareText("daily").split("\n").slice(0, 2).join("|") };
  });
  check("前の日をあとから解いても、その日がカレンダーと連続に入り（3日連続）、シェアはその日の結果", lateDay.log[60] === 3 && lateDay.log[61] === 1 && lateDay.streak.n === 3 && lateDay.daily === 61 && /#61\|.*★★★/.test(lateDay.share), JSON.stringify(lateDay));
  // 実績：初めてお客さんを満足させると「はじめての一品」が付いて知らせが出る。記録帳に取った数とまだの条件（🔒）が出る
  await pq.evaluate(() => localStorage.clear()); await pq.reload(); await pq.waitForLoadState("load");
  const badge1 = await pq.evaluate(async () => {
    __game.start(0); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish();
    await new Promise((r) => setTimeout(r, 2100));
    const toast = document.getElementById("toast").textContent;
    __game.showTitle(); document.querySelector("details.log").open = true; document.querySelector("details.log summary").click(); document.querySelector("details.log").open = true;
    await new Promise((r) => setTimeout(r, 100));
    const saved = JSON.parse(localStorage.getItem("wagamamaBurger1"));
    return { toast, badges: saved.badges, head: document.querySelector(".badges")?.previousElementSibling?.textContent, locked: document.querySelectorAll(".badges li:not(.on)").length, lockedText: document.querySelector(".badges li:not(.on)")?.textContent };
  });
  const goalText = await pq.evaluate(() => { __game.showTitle(); return document.getElementById("goal").textContent; });
  check("タイトルに次の目標（まだ取っていない実績の条件）が出る", /次の目標：1章を全員クリア/.test(goalText), goalText);
  check("初めて満足させると実績「はじめての一品」が付き、知らせと記録帳（取った数・まだの条件）に出る", /はじめての一品/.test(badge1.toast) && JSON.stringify(badge1.badges) === '["first"]' && /実績 1\//.test(badge1.head) && badge1.locked === 17 && /🔒/.test(badge1.lockedText), JSON.stringify(badge1));
  // 実績の条件は、記録がそろえば全部取れる（取れない実績が無い）。タブを合わせても取った実績は消えない
  await pq.evaluate(() => {
    const full = { best: Array(40).fill(3), log: {}, extra: [{ n: 50, run: 0, best: 10, perfect: 50 }, { n: 30, run: 0, best: 3, perfect: 3 }, { n: 20, run: 0, best: 1, perfect: 1 }], streak: { max: 30 }, badges: [], wlog: { 0: 3, 1: 2, 2: 3, 3: 1 } };
    for (let d = 0; d < 60; d++) full.log[d] = 3;
    localStorage.setItem("wagamamaBurger1", JSON.stringify(full));
  });
  await pq.reload(); await pq.waitForLoadState("load");
  const badgeAll = await pq.evaluate(async () => {
    document.querySelector("details.log summary").click(); await new Promise((r) => setTimeout(r, 100));
    const on = document.querySelectorAll(".badges li.on").length, total = __game.BADGES.length;
    const m = __game.mergeRec({ best: [], log: {}, daily: null, streak: { last: -99, n: 0, max: 0 }, extra: [], guided: false, badges: ["first"] }, { badges: ["d3", "first"] }).badges;
    localStorage.clear();
    return { on, total, m };
  });
  check("記録がそろえば実績は全部取れ（取れない実績が無い）、タブを合わせても取った実績は消えない", badgeAll.on === badgeAll.total && badgeAll.total === 18 && badgeAll.m.join() === "first,d3", JSON.stringify(badgeAll));
  // 今週の特大わがまま：タイトルに出て、解くと週の記録に入り、同じ週の2回目は記録を変えない。シェアに具材の名前を入れない
  await pq.evaluate(() => localStorage.clear()); await pq.reload(); await pq.waitForLoadState("load");
  const wk = await pq.evaluate(() => {
    const out = { btn: !!document.getElementById("weeklyBtn") && document.getElementById("weeklyBtn").offsetParent !== null };
    __game.setToday(12); __game.showTitle(); out.sub0 = document.getElementById("weeklySub").textContent;
    __game.startWeekly(); const c = __game.state.cur; out.items = c.items.length; out.week = c.weekly;
    c.answer.forEach((t) => __game.add(t)); __game.finish(); out.stars = __game.state.stars; out.share = __game.shareText("weekly");
    __game.startWeekly(); c.answer.slice().reverse().forEach((t) => __game.add(t)); __game.finish(); if (!__game.state.done) { __game.state.cur.answer.forEach(() => {}); }
    const saved = JSON.parse(localStorage.getItem("wagamamaBurger1")); out.wlog = saved.wlog;
    __game.showTitle(); out.sub1 = document.getElementById("weeklySub").textContent; out.go = document.getElementById("go").textContent;
    return out;
  });
  const wkLeak = Object.values(ING).filter((n) => wk.share.includes(n));
  check("今週の特大わがまま：タイトルにあり、具8枚、解くと週の記録に★が入りタイトルにクリア済みと出る。シェアに具材の名前が無い", wk.btn && wk.items === 8 && wk.week === 1 && wk.wlog[1] === 3 && /#2 クリア済み ★3/.test(wk.sub1) && /今週の特大わがまま #2/.test(wk.share) && wkLeak.length === 0, JSON.stringify({ ...wk, wkLeak }));
  // できあがりの瞬間、台の具がぎゅっとつぶれて戻る（あとに class が残らない）
  const sq = await pq.evaluate(async () => { __game.start(0); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); const seen = []; for (let i = 0; i < 14; i++) { await new Promise((r) => setTimeout(r, 60)); seen.push(document.getElementById("stage").classList.contains("squash")); } return { during: seen.some(Boolean), after: seen[seen.length - 1] }; });
  check("できあがりの瞬間にバーガーがぎゅっとつぶれて戻る", sq.during && !sq.after, JSON.stringify(sq));
  // 積んだ具の横の番号が、どの具でも見える（チーズの形の切り抜きで番号が消えていた。2026-11-03）
  const cheeseLv = LEVELS.findIndex((L) => L.items.includes("cheese"));
  const numHidden = await pq.evaluate((i) => {
    __game.start(i); __game.state.cur.answer.forEach((t) => __game.add(t));
    const bad = []; if (!document.querySelector(".stage .t-cheese .num")) bad.push("チーズが無い");
    document.querySelectorAll(".stage .ly .num").forEach((n) => { const r = n.getBoundingClientRect(), cp = getComputedStyle(n.parentElement).clipPath; if (r.width === 0 || (cp && cp !== "none")) bad.push(n.parentElement.className); });
    return bad;
  }, cheeseLv);
  check("積んだ具の横の番号が切り抜きで消えない（チーズなど）", numHidden.length === 0, numHidden.join(","));
  // 押す所の大きさ（指で押す所は 48px 以上。積んだ具材と条件の中の絵は除く）
  const small = [];
  for (const view of ["title", "play"]) {
    if (view === "title") await pq.evaluate(() => __game.showTitle()); else await pq.evaluate(() => __game.start(5));
    small.push(...(await pq.evaluate(() => [...document.querySelectorAll("button, a, summary")].filter((b) => b.offsetParent && !b.classList.contains("ly")).map((b) => { const r = b.getBoundingClientRect(); return { n: b.id || b.className || b.textContent.trim().slice(0, 8), w: r.width, h: r.height }; }).filter((r) => r.h < 48 || r.w < 48).map((r) => `${r.n}:${Math.round(r.w)}x${Math.round(r.h)}`))));
  }
  check("ボタンは指で押しやすい大きさ（48px 以上）", small.length === 0, small.join(" "));
  // できあがりのあと、キーボードで「感想を送る」リンクに合わせて Enter を押しても、次へ進まない（リンクの動きにまかせる）
  const enterLink = await pq.evaluate(() => {
    __game.start(0); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish();
    const a = document.querySelector("#after a.fb"); window.__fbClicks = 0;
    a.addEventListener("click", (e) => { window.__fbClicks++; e.preventDefault(); }); a.focus(); // once を付けない（2回起きたら見つける）
    return { lv0: __game.state.lv };
  });
  await pq.keyboard.press("Enter"); // 合成のイベントではリンクの click が起きないので、本物のキー入力で
  const afterEnter = await pq.evaluate(() => ({ clicks: window.__fbClicks, done: __game.state.done, lv: __game.state.lv }));
  check("できあがりのあと「感想を送る」に合わせて Enter を押すと、リンクが開き、次のお客さんへ進まない", afterEnter.clicks === 1 && afterEnter.done && afterEnter.lv === enterLink.lv0, JSON.stringify(afterEnter));
  // 1つのタブで毎日解き続けても、連続日数が途中（古い日の片付けなど）で止まらない
  const longRun = await pq.evaluate(() => { for (let d = 1000; d < 1450; d++) __game.recordDaily(3, d); const r = __game.rec(); return { n: r.streak.n, max: r.streak.max }; });
  check("毎日1問を450日続けると、連続日数が450日になる", longRun.n === 450 && longRun.max >= 450, JSON.stringify(longRun));
  await pq.close();
  check("出題リンク・記録・遊ぶ画面の確かめでページのエラーが無い", errors.length === 0, errors.join(" / "));
  // 10. やりこみ（2026-11-04）：2段のヒント・できあがりのひとこと・実績の画面と進み具合・ひと月のカレンダー・あとから遊ぶ日
  {
    const pz = await browser.newPage({ viewport: { width: 320, height: 700 } });
    const errZ = []; pz.on("pageerror", (e) => errZ.push(e.message));
    await pz.goto(url); await pz.evaluate(() => { localStorage.clear(); localStorage.setItem("wagamamaBurger1", JSON.stringify({ best: [], guided: true })); }); await pz.reload();
    const names = Object.values(ING);
    // 10a. 1回目のヒントは条件を1つ光らせるだけで、具の名前を言わない。そのまま一発で解くと★2。2回目からは次の具を教え★1
    const h1 = await pz.evaluate(async () => {
      __game.start(12); __game.hint();
      const out = { lv: __game.hintLv, focus: document.querySelectorAll("ul.conds li.focus").length, ingHint: document.querySelectorAll(".ing.hint,.stage .ly.hint").length, toast: document.getElementById("toast").textContent, btn: document.getElementById("hint").textContent };
      __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); out.stars = __game.state.stars; out.focusAfter = document.querySelectorAll("ul.conds li.focus").length;
      return out;
    });
    check("ヒント1回目：条件を1つだけ光らせ、具は光らせず名前も言わない。ボタンは「次の具」に替わる。そのまま解くと★2", h1.lv === 1 && h1.focus === 1 && h1.ingHint === 0 && !names.some((n) => h1.toast.includes(n)) && /次の具/.test(h1.btn) && h1.stars === 2 && h1.focusAfter === 0, JSON.stringify(h1));
    const h2 = await pz.evaluate(() => { localStorage.clear(); __game.start(0); __game.hint(); __game.hint(); const o = { lv: __game.hintLv, ing: document.querySelectorAll(".ing.hint").length }; __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); o.stars = __game.state.stars; return o; });
    check("ヒント2回目：次の具が光り、解くと★1", h2.lv === 2 && h2.ing === 1 && h2.stars === 1, JSON.stringify(h2));
    // いまの積み方でもう守れない条件があれば、それを光らせる（「いちばん下は〇〇」の問題で、ちがう具を下に置く）
    const bi = LEVELS.findIndex((L) => L.conds.some((c) => c[0] === "bottom"));
    const h3 = await pz.evaluate((i) => {
      __game.start(i); const c = __game.state.cur, k = c.conds.findIndex((x) => x[0] === "bottom"), wrong = c.items.find((t) => t !== c.conds[k][1]);
      __game.add(wrong); __game.hint(); const li = [...document.querySelectorAll("ul.conds li")];
      return { k, focus: li.findIndex((e) => e.classList.contains("focus")), toast: document.getElementById("toast").textContent };
    }, bi);
    check("積み方でもう守れない条件（いちばん下）があれば、その条件を光らせて「もう守れない」と言う", h3.focus === h3.k && /もう守れない/.test(h3.toast), JSON.stringify(h3));
    // 1つずつなら守れるが全部いっしょには守れない積み方でも、1回目のヒントで条件が1つ光る（2人目の下にオニオン。2026-11-04 CodeRabbit の指摘：何も光らず★だけ減っていた）
    const h4 = await pz.evaluate(() => {
      __game.start(1); __game.add("onion"); __game.hint();
      return { lv: __game.hintLv, focus: document.querySelectorAll("ul.conds li.focus").length, toast: document.getElementById("toast").textContent };
    });
    check("2人目でオニオンを下に置いて1回目のヒント：どの条件も1つずつなら守れるが、条件が1つ光る", h4.lv === 1 && h4.focus === 1 && /見直す/.test(h4.toast), JSON.stringify(h4));
    // 40人 × まちがった置き方（下に答えとちがう具を1枚・逆順に2枚・逆順に3枚）：1回目のヒントでヒントを使ったなら、必ず条件が1つ光る
    const hw = await pz.evaluate((LV) => {
      const bad = []; let n = 0;
      LV.forEach((L, i) => {
        const tries = [...new Set(L.items.filter((x) => x !== L.answer[0]))].map((x) => [x]);
        const rv = [...L.answer].reverse(); tries.push(rv.slice(0, 2), rv.slice(0, 3));
        tries.forEach((st) => {
          __game.start(i); st.forEach((t) => __game.add(t)); __game.hint(); n++;
          const lit = document.querySelectorAll("ul.conds li.focus").length;
          if (__game.hintLv !== 1 || lit !== 1) bad.push(i + 1 + ":" + st.join("/"));
        });
      });
      return { bad, n };
    }, LEVELS);
    check(`40人 × まちがった置き方（${hw.n}通り）すべてで、1回目のヒントが条件を1つ光らせる`, hw.bad.length === 0 && hw.n >= 200, hw.bad.slice(0, 5).join(" "));
    // 40人と、きょうのわがまま200日分：何も積んでいないとき、考えどころ（まだ決まっていない条件）が必ず1つ見つかる
    const fc = await pz.evaluate((n) => { const bad = []; for (let i = 0; i < n; i++) { __game.start(i); const f = __game.focusCond(); if (f.k < 0 || f.broken) bad.push(i + 1); } return bad; }, LEVELS.length);
    const fcd = await pz.evaluate(() => { const bad = []; for (let d = 0; d < 200; d += 1) { __game.setToday(d + 1); __game.startDaily(); const f = __game.focusCond(); if (f.k < 0 || f.broken) bad.push(d); } __game.setToday(null); return bad; });
    check("40人ときょうのわがまま200日分で、1回目のヒントが必ず条件を1つ示す", fc.length === 0 && fcd.length === 0, fc.concat(fcd).join(","));
    // 10b. できあがりの瞬間、お客さんの吹き出しが満足のひとことに替わる
    const say = await pz.evaluate(() => { __game.start(1); const before = document.getElementById("say").textContent; __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); return { before, after: document.getElementById("say").textContent }; });
    check("できあがると、お客さんの吹き出しが満足のひとことに替わる", say.before !== say.after && /^「.+」$/.test(say.after) && !names.some((n) => say.after.includes(n)), JSON.stringify(say));
    // 10c. 実績：遊んだ日は「きょう」と「あとから」を合わせた数（同じ日は1回）。まだの実績は「いま/目標」を出す。ホームから実績の画面を開ける
    await pz.evaluate(() => localStorage.setItem("wagamamaBurger1", JSON.stringify({ best: [3, 3], guided: true, log: { 10: 3, 11: 2, 13: 1 }, past: { 12: 2, 13: 3 } })));
    await pz.reload(); await pz.evaluate(() => { __game.setToday(14); __game.showTitle(); });
    const a1 = await pz.evaluate(() => ({ played: __game.playedDays(), sub: document.getElementById("achSub").textContent }));
    await pz.click("#achBtn");
    const a2 = await pz.evaluate(() => {
      const li = [...document.querySelectorAll("#ach .badges li")], d7 = li[__game.BADGES.findIndex((b) => b[0] === "d7")];
      const r = document.getElementById("achBtn").getBoundingClientRect();
      return { vis: !document.getElementById("ach").hidden && document.getElementById("title").hidden, n: li.length, d7: d7.textContent, d7on: d7.classList.contains("on"), bars: document.querySelectorAll("#ach .badges li:not(.on) .pg i").length, locked: document.querySelectorAll("#ach .badges li:not(.on)").length, wide: document.documentElement.scrollWidth > innerWidth };
    });
    await pz.screenshot({ path: path.join(root, "qa-report", "ach-320.png"), fullPage: true }).catch(() => {});
    await pz.click("#achBack");
    const a3 = await pz.evaluate(() => !document.getElementById("title").hidden && document.getElementById("ach").hidden);
    check("実績：遊んだ日は合計で数え（きょう3日＋あとから2日・重なり1日＝4日）、ホームのボタンから実績の画面が開き、まだのものに「4/7」と進み具合のバーが出て、320px で崩れず戻れる",
      a1.played === 4 && /\/ 18/.test(a1.sub) && a2.vis && a2.n === 18 && /4\/7/.test(a2.d7) && !a2.d7on && a2.bars === a2.locked && !a2.wide && a3, JSON.stringify({ a1, a2, a3 }));
    // 新しく取れた実績は、結果の画面に小さく「🏅 実績：」と残る（取らなかったときは出ない）
    await pz.evaluate(() => localStorage.setItem("wagamamaBurger1", JSON.stringify({ best: [], guided: true }))); await pz.reload();
    const g1 = await pz.evaluate(() => { __game.start(0); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); const e = document.getElementById("gotAch"); const o = { first: !e.hidden && e.offsetParent !== null ? e.textContent : "" }; __game.start(0); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); o.second = !e.hidden; return o; });
    check("実績を取った結果の画面に「🏅 実績：はじめての一品」と残り、取らなかったときは出ない", /🏅 実績：.*はじめての一品/.test(g1.first) && !g1.second, JSON.stringify(g1));
    // 10d. カレンダー：ひと月のます目。きょうの★・あとからの↺★・取りこぼした日は押せるます。前の月へ戻れ、2026年11月より前と今月より先へは行けない
    // 「きょう」は QA_DAY（日の番号。ふだん 34 = 2026-12-07）で変えられる。月をまたぐ値（例：QA_DAY=29 = 12/2）でも通るよう、日を読む前にその日の月まで「前の月」で戻る
    const T = +(process.env.QA_DAY || 34);
    const ymOf = (d) => { const t = new Date(Date.UTC(2026, 10, 3) + d * 86400000); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
    const calTo = async (d) => {
      const [y, m] = ymOf(d);
      for (let k = 0; k < 40 && (await pz.textContent("#calTitle")) !== `${y}年${m}月`; k++) { if (await pz.locator("#calPrev").isDisabled()) break; await pz.click("#calPrev"); }
      return pz.evaluate((n) => { const e = document.querySelector('.cal [data-n="' + n + '"]'); return e ? { tag: e.tagName, text: e.textContent, cls: e.className, d: e.dataset.d } : null; }, ymOf(d)[2]);
    };
    const reopen = async () => { await pz.evaluate((t) => { __game.setToday(t); __game.showTitle(); }, T); await pz.click("#calBtn"); };
    await pz.evaluate((T) => { const log = {}; log[T - 4] = 3; log[T - 3] = 2; log[T - 1] = 1; const past = {}; past[T - 2] = 2; localStorage.setItem("wagamamaBurger1", JSON.stringify({ best: [], guided: true, log, past })); }, T);
    await pz.reload(); await reopen();
    const head = await pz.evaluate(() => {
      const small = [...document.querySelectorAll(".cal button.mc, .calhead button")].filter((b) => b.getBoundingClientRect().height < 44).length;
      return { title: document.getElementById("calTitle").textContent, nextOff: document.getElementById("calNext").disabled, sum: document.getElementById("calSum").textContent, small, wide: document.documentElement.scrollWidth > innerWidth, open: document.getElementById("log").open };
    });
    await pz.screenshot({ path: path.join(root, "qa-report", "calendar-320.png"), fullPage: true }).catch(() => {});
    const cells = {};
    for (const d of [T - 4, T - 3, T - 2, T - 1]) { await reopen(); cells[d] = await calTo(d); }
    await reopen(); const todayCell = await pz.evaluate((n) => document.querySelector('.cal [data-n="' + n + '"]').className, ymOf(T)[2]);
    const [ty, tm] = ymOf(T);
    check(`カレンダー（きょう #${T + 1}）：今月のます目に、きょうの★・あとからの↺★が出て（前の月の日は「前の月」で戻って読む）、押せる所は44px以上。連続は1日以上のときだけ。320px で崩れない`,
      head.open && head.title === `${ty}年${tm}月` && head.nextOff && cells[T - 4]?.text === "★3" && /s2/.test(cells[T - 3]?.cls) && cells[T - 2]?.text === "↺★2" && cells[T - 1]?.text === "★1" && /today/.test(todayCell) && /🔥 1日連続/.test(head.sum) && head.small === 0 && !head.wide,
      JSON.stringify({ head, cells, todayCell }));
    // 取りこぼした日はどれも、その日の月まで戻ると押せるますになっている
    const missed = await pz.evaluate(() => __game.missedDays());
    const notBtn = [];
    for (const d of missed) { await reopen(); const c = await calTo(d); if (!c || c.tag !== "BUTTON" || +c.d !== d) notBtn.push(d); }
    check(`カレンダー：取りこぼした日（${missed.length}日）はすべて、その日の月で押せるます`, missed.length === Math.min(T, 27) - 4 && notBtn.length === 0, notBtn.join(","));
    // いちばん前の月（2026年11月）まで戻れ、それより前へは行けない。11/1・11/2（始まる前）は押せない
    await reopen();
    for (let k = 0; k < 40 && !(await pz.locator("#calPrev").isDisabled()); k++) await pz.click("#calPrev");
    const c2 = await pz.evaluate(() => ({ title: document.getElementById("calTitle").textContent, before: [1, 2].map((n) => document.querySelector('.cal [data-n="' + n + '"]').tagName) }));
    check("カレンダー：前の月をたどると2026年11月で止まり、11/1・11/2（始まる前）は押せない", c2.title === "2026年11月" && c2.before.every((t) => t === "I"), JSON.stringify(c2));
    const pickD = missed[missed.length - 1];
    await reopen(); await calTo(pickD);
    await pz.click(`.cal button.mc[data-d="${pickD}"]`);
    const c3 = await pz.evaluate(() => ({ mode: __game.state.mode, items: __game.state.cur.items, conds: __game.state.cur.conds }));
    check("カレンダーの取りこぼした日を押すと、その日の問題（makeDaily と同じ）をあとから遊べる", c3.mode === "past" && JSON.stringify([c3.items, c3.conds]) === JSON.stringify([makeDaily(pickD).items, makeDaily(pickD).conds]), JSON.stringify({ pickD, mode: c3.mode }));
    // 連続が0のときは、カレンダーにも連続の言葉を出さない
    const c4 = await pz.evaluate(() => { __game.setToday(40); __game.showTitle(); return document.getElementById("calSum").textContent; });
    check("連続が0の日は、カレンダーに連続の言葉を出さない", !/連続/.test(c4), c4);
    // 10e. あとから：300日分、その日の問題が makeDaily と同じで、解いても今日の記録（log）・連続・daily を変えない
    await pz.evaluate(() => localStorage.setItem("wagamamaBurger1", JSON.stringify({ best: [], guided: true, log: { 400: 3 } }))); await pz.reload();
    const late = await pz.evaluate(() => {
      const out = []; const r0 = __game.rec();
      for (let d = 5; d < 305; d++) {
        __game.setToday(d + 3); __game.startPast(d); const c = __game.state.cur;
        out.push([d, __game.state.mode, JSON.stringify([c.items, c.conds])]);
        c.answer.forEach((t) => __game.add(t)); __game.finish();
      }
      const r = __game.rec(); return { out, logKeys: Object.keys(r.log), past: Object.keys(r.past).length, streak: r.streak, daily: r.daily, r0daily: r0.daily };
    });
    const lateBad = late.out.filter(([d, m, j]) => m !== "past" || j !== JSON.stringify([makeDaily(d).items, makeDaily(d).conds])).map(([d]) => d);
    check("あとから：300日分すべて、その日の問題（makeDaily）と同じで、解いても今日の記録・連続日数・daily を変えない", lateBad.length === 0 && late.past >= 300 && !late.logKeys.some((d) => +d >= 5 && +d < 305) && JSON.stringify(late.daily) === JSON.stringify(late.r0daily) && late.streak.n <= 1, JSON.stringify({ lateBad: lateBad.slice(0, 5), past: late.past, streak: late.streak }));
    // 古いタブ：別のタブがもう解いた日は、あとから遊ばずタイトルへ戻って知らせる
    const old = await pz.evaluate(() => {
      __game.setToday(500); __game.showTitle();
      const r = JSON.parse(localStorage.getItem("wagamamaBurger1")); r.past[495] = 2; localStorage.setItem("wagamamaBurger1", JSON.stringify(r));
      __game.startPast(495); return { mode: __game.state.mode === "past" && !document.getElementById("play").hidden, title: !document.getElementById("title").hidden, note: document.getElementById("tnote").textContent };
    });
    check("別のタブでもう解いた日は、あとから遊ばずにタイトルへ戻り「もう解いてあります」と出る", !old.mode && old.title && /もう解いて/.test(old.note), JSON.stringify(old));
    // 10f. キーで選んだときの枠：タイトル・実績の画面のボタンとリンクは、focus-visible で2px以上の枠が出る
    await pz.evaluate(() => { __game.setToday(null); __game.showTitle(); document.getElementById("log").open = true; });
    await pz.keyboard.press("Tab");
    const thin = await pz.evaluate(async () => {
      const bad = [];
      const look = () => [...document.querySelectorAll("button, a, summary")].filter((b) => b.offsetParent).forEach((b) => { b.focus(); const cs = getComputedStyle(b); if (b.matches(":focus-visible") && (cs.outlineStyle === "none" || parseFloat(cs.outlineWidth) < 2)) bad.push(b.id || b.className || b.textContent.trim().slice(0, 6)); });
      look(); __game.showAch(); look(); __game.showTitle(); return bad;
    });
    check("タイトル・カレンダー・実績のボタンは、キーで選ぶと2px以上の枠が出る", thin.length === 0, thin.join(","));
    // 10g. 押せる所の大きさ（実績の画面・ホームの実績とカレンダー・記録帳）
    const smallZ = await pz.evaluate(() => {
      const f = () => [...document.querySelectorAll("button, a, summary")].filter((b) => b.offsetParent && !b.classList.contains("ly")).map((b) => { const r = b.getBoundingClientRect(); return [b.id || b.className || b.textContent.trim().slice(0, 6), r.height]; }).filter(([, h]) => h < 44).map(([n, h]) => n + ":" + Math.round(h));
      __game.showTitle(); document.getElementById("log").open = true; const a = f(); __game.showAch(); return a.concat(f());
    });
    check("記録帳・カレンダー・実績の画面の押せる所は高さ44px以上（320px）", smallZ.length === 0, smallZ.join(" "));
    await pz.close();
    check("やりこみの確かめでページのエラーが無い", errZ.length === 0, errZ.join(" / "));
  }

  // 動きを減らす設定の人には、紙吹雪を出さない
  const pr = await browser.newPage({ viewport: { width: 390, height: 800 }, reducedMotion: "reduce" });
  pr.on("pageerror", (e) => errors.push(e.message));
  await pr.goto(url); await pr.evaluate(() => __game.start(0));
  for (const t of LEVELS[0].answer) await pr.click(`.ing[data-t="${t}"]`); await pr.click("#go");
  check("動きを減らす設定では紙吹雪を出さない", (await pr.locator(".confetti").count()) === 0 && (await pr.evaluate(() => __game.state.done)));
  await pr.close();
  check("動きを減らす設定の確かめでページのエラーが無い", errors.length === 0, errors.join(" / "));

  // 8. スマホ幅（320・390）で横にはみ出さず、具材7個でも上のパンが台の中に収まる
  const wide = [];
  for (const w of [320, 390]) {
    const p = await browser.newPage({ viewport: { width: w, height: 700 } });
    await p.goto(url);
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push(`${w}:タイトル`);
    const big = LEVELS.findIndex((L) => L.items.length === Math.max(...LEVELS.map((x) => x.items.length)));
    await p.evaluate((i) => __game.start(i), big);
    for (const t of LEVELS[big].answer) await p.click(`.ing[data-t="${t}"]`);
    await p.click("#go"); await p.waitForTimeout(500); // 上のパンが落ちてくる動きを待つ
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push(`${w}:遊ぶ画面`);
    const fits = await p.evaluate(() => { const s = document.querySelector(".stage").getBoundingClientRect(), t = document.querySelector(".stage .t-bun-t").getBoundingClientRect(); return t.top >= s.top && t.left >= s.left && t.right <= s.right; });
    if (!fits) wide.push(`${w}:上のパンがはみ出す`);
    if (w === 390) { await p.waitForTimeout(900); await p.locator(".stage").screenshot({ path: path.join(root, "qa-report", "play-390.png") }).catch(() => {}); }
    await p.close();
  }
  check("スマホ幅で横にはみ出さず、いちばん大きいバーガーも台に収まる", wide.length === 0, wide.join(","));

  // 8b. 小さいスマホ（375×667）でも、具材の棚と「できあがり！」に指が届き、積んだバーガーが棚の後ろに隠れない。
  //     積んでいる間は条件も画面に残る（2026-11-03 4章で棚が画面の下に押し出され、毎回スクロールが要った）
  {
    const p = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await p.goto(url); await p.evaluate(() => { localStorage.setItem("wagamamaBurger1", JSON.stringify({ best: [], guided: true })); }); await p.reload();
    const bad = [];
    for (const i of [0, 10, 20, LEVELS.findIndex((L) => L.items.length === 8)]) {
      await p.evaluate((k) => __game.start(k), i); await p.waitForTimeout(250);
      const inView = (sel) => p.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; }, sel);
      if (!(await inView("#go"))) bad.push(`${i + 1}人目:できあがりが画面の外`);
      for (const [k, t] of LEVELS[i].answer.entries()) {
        await p.click(`.ing[data-t="${t}"]`); await p.waitForTimeout(700);
        const r = await p.evaluate(() => { const s = document.querySelector(".stage").getBoundingClientRect(), d = document.querySelector("#dock").getBoundingClientRect(), c = document.querySelector("#conds").getBoundingClientRect(); return { hidden: s.bottom > d.top + 1, go: d.bottom <= innerHeight + 1, conds: c.bottom > 0 }; });
        if (r.hidden) bad.push(`${i + 1}人目${k + 1}枚目:バーガーが棚に隠れる`);
        if (!r.go) bad.push(`${i + 1}人目${k + 1}枚目:棚が画面の外`);
        if (k < LEVELS[i].answer.length - 1 && !r.conds) bad.push(`${i + 1}人目${k + 1}枚目:条件が見えない`);
      }
    }
    await p.close();
    check("小さいスマホでも、棚と「できあがり！」に届き、積んだバーガーと条件が見えたまま遊べる", bad.length === 0, bad.slice(0, 5).join(","));
  }

  // 8c. はじめての人のスマホの見え方（2026-11-07 UI/UX の見直し）
  //     ホームを開いた最初の画面に、きょうのわがまま・おかわり・「はじめから」が収まる。はじめての人の「はじめから」は幅いっぱい。
  //     まちがえたら直し方を出す。1つ完成させたら遊び方の案内は閉じる。毎日1問の結果では、おかわりが「タイトルへ」より上で目立つ
  {
    const bad = [];
    for (const [w, h] of [[390, 844], [320, 640]]) {
      const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.reload();
      const home = await p.evaluate(() => {
        const r = (q) => document.querySelector(q).getBoundingClientRect();
        const row = r(".row2"), cont = r("#cont");
        return { inView: ["#dailyBtn", "#weeklyBtn", "#go-x", "#cont"].filter((q) => { const b = r(q); return !(b.top >= 0 && b.bottom <= innerHeight + 1); }), contWide: cont.width >= row.width - 1, over: document.documentElement.scrollWidth > innerWidth };
      });
      if (home.inView.length) bad.push(`${w}:最初の画面の外 ${home.inView.join(" ")}`);
      if (!home.contWide) bad.push(`${w}:はじめからが幅いっぱいでない`);
      if (home.over) bad.push(`${w}:ホームが横にはみ出す`);
      // はじめての1人目：まちがえると、✗の条件を直す案内が出る
      await p.click("#cont");
      const L = LEVELS[0], wrong = perms(L.items).find((o) => !judge(o, L.conds).every(Boolean));
      for (const t of wrong) await p.click(`.ing[data-t="${t}"]`);
      await p.click("#go");
      const nt = await p.evaluate(() => { const n = document.getElementById("note"); return { t: n.textContent, ng: n.classList.contains("ngn") }; });
      if (!/✗の条件を直そう/.test(nt.t) || !nt.ng) bad.push(`${w}:まちがえたあとの案内 ${JSON.stringify(nt)}`);
      await p.click("#retry");
      const nt2 = await p.textContent("#note");
      if (/✗/.test(nt2)) bad.push(`${w}:積み直したのに✗の案内が残る`);
      if (!(await p.locator("#guide").isVisible())) bad.push(`${w}:はじめての人に案内が出ない`);
      for (const t of L.answer) await p.click(`.ing[data-t="${t}"]`);
      await p.click("#go");
      const g = await p.evaluate(() => ({ hidden: document.getElementById("guide").hidden, saved: JSON.parse(localStorage.getItem("wagamamaBurger1")).guided === true }));
      if (!g.hidden || !g.saved) bad.push(`${w}:1つ完成しても案内が閉じない ${JSON.stringify(g)}`);
      // 毎日1問の結果：おかわりが上・「タイトルへ」は控えめ（sec）
      await p.evaluate(() => { __game.startDaily(); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); });
      await p.waitForTimeout(400);
      const rs = await p.evaluate(() => { const x = document.getElementById("goX2").getBoundingClientRect(), go = document.getElementById("go"); return { above: x.height > 0 && x.bottom <= go.getBoundingClientRect().top + 1, sec: go.classList.contains("sec"), over: document.documentElement.scrollWidth > innerWidth }; });
      if (!rs.above || !rs.sec) bad.push(`${w}:結果でおかわりが上にない ${JSON.stringify(rs)}`);
      if (rs.over) bad.push(`${w}:結果が横にはみ出す`);
      // お客さん（章）の結果では「次のお客さん」は目立つまま
      await p.evaluate(() => { __game.start(1); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); });
      if (await p.evaluate(() => document.getElementById("go").classList.contains("sec"))) bad.push(`${w}:次のお客さんが控えめになっている`);
      await p.close();
    }
    check("スマホ（390×844・320×640）：最初の画面に入口が収まり、まちがいの直し方・案内の自動で閉じる・結果のおかわりが上", bad.length === 0, bad.join(" / "));
  }

  // 9. PWA：ホーム画面に置ける形と、一度開けば電波が無くても遊べる（http で開いて確かめる）
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png" };
  let down = false;
  const server = http.createServer((req, res) => {
    if (down) { res.writeHead(503); res.end("down"); return; }
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.join(root, rel);
    if ((file !== root && !file.startsWith(root + path.sep)) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  try {
    const pw = await ctx.newPage();
    const errPw = []; pw.on("pageerror", (e) => errPw.push(e.message));
    await pw.goto(base);
    const man = await pw.evaluate(async () => { const href = document.querySelector('link[rel="manifest"]')?.getAttribute("href"); return href ? (await fetch(href)).json() : null; });
    const icons = man?.icons || [];
    check("manifest に名前・開く場所・アプリ表示・192と512のアイコンがある", man && man.name === "わがままバーガー" && man.start_url && man.display === "standalone"
      && ["192x192", "512x512"].every((sz) => icons.some((i) => i.sizes === sz)) && icons.some((i) => i.purpose === "maskable"), JSON.stringify(man));
    const iconOk = await pw.evaluate(async (list) => (await Promise.all(list.map((i) => fetch(i.src).then((r) => r.ok && r.headers.get("content-type") === "image/png")))).every(Boolean), icons);
    check("アイコンの画像が取れる", iconOk);
    // sw.js は https でだけ入れる（file:// や http の手元では入れない）ので、検査では手で入れる
    await pw.evaluate(() => navigator.serviceWorker.register("sw.js"));
    await pw.evaluate(() => navigator.serviceWorker.ready);
    await pw.reload(); await pw.waitForFunction(() => !!navigator.serviceWorker.controller);
    check("sw.js が入り、画面を受け持つ", await pw.evaluate(() => !!navigator.serviceWorker.controller));
    const shell = readFileSync(path.join(root, "sw.js"), "utf8");
    const scripts = ["rules.js", "levels.js", "transfer.js"].filter((f) => !shell.includes(`"./${f}"`));
    check("画面が読むファイルが sw.js の SHELL にそろう", scripts.length === 0, scripts.join(","));
    await ctx.setOffline(true);
    const offErr = await pw.reload().then(() => "", (e) => e.message.split("\n")[0]);
    check("電波が無くてもタイトルが開き、40人並ぶ", !offErr && (await pw.locator(".lvbtn").count()) === 40, offErr);
    if (!offErr) { await pw.click('.lvbtn[data-i="0"]'); }
    check("電波が無くても遊べる（具材が並ぶ）", (await pw.locator(".ing").count()) >= 2);
    await ctx.setOffline(false); down = true;
    const downErr = await pw.goto(base).then(() => "", (e) => e.message.split("\n")[0]);
    check("サーバーが 503 を返しても、保存したタイトルが開く", !downErr && (await pw.locator(".lvbtn").count()) === 40, downErr);
    down = false;
    check("PWA の確かめでページのエラーが無い", errPw.length === 0, errPw.join(" / "));
  } finally { await ctx.close(); server.close(); }
  // おかわりは、まちがえてもヒントを使っても終わらず、何も減らない（チケット・回数制限なし。2026-11-06 satou さん）
  {
  const px = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await px.goto(url); await px.evaluate(() => { localStorage.clear(); localStorage.setItem("wagamamaBurger1", JSON.stringify({ best: [], guided: true })); }); await px.reload();
  const xm = await px.evaluate(() => {
    const out = [];
    for (let i = 0; i < 20; i++) {
      const l = i % 3; __game.startExtra(l);
      const c = __game.state.cur, k0 = c.k, n0 = __game.rec().extra[l] ? __game.rec().extra[l].n : 0;
      const bad = perms(c.items).find((o) => !check(o, c.conds).every(Boolean));
      bad.forEach((t) => __game.add(t)); __game.finish();
      const afterMiss = __game.state.mode === "extra" && !__game.state.done && __game.state.cur.k === k0;
      document.getElementById("retry").click(); __game.hint(); __game.hint(); __game.hint();
      const afterHint = __game.state.mode === "extra" && !__game.state.done && !document.getElementById("hint").disabled;
      document.getElementById("retry").click(); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish();
      const solved = __game.state.done && __game.rec().extra[l].n === n0 + 1;
      __game.finish();
      const next = __game.state.mode === "extra" && !__game.state.done && __game.state.cur.k === k0 + 1;
      if (!(afterMiss && afterHint && solved && next)) out.push({ i, afterMiss, afterHint, solved, next });
    }
    return out;
  });
  check("おかわり：まちがえてもヒントを3回使っても終わらず、解けば次の問題へ続く（20問）", xm.length === 0, JSON.stringify(xm.slice(0, 3)));
  await px.close();
  }
  // 色だけで分けない（WCAG 1.4.1。shared-workflows routines/game-dev.md A1）：守れた/守れない・つぎ・まだ・星・ヒント・章の進み具合が、記号・文字・aria-label でも分かる
  {
    const pc = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await pc.goto(url); await pc.evaluate(() => localStorage.clear()); await pc.reload();
    const c = await pc.evaluate(() => {
      const o = {};
      const next = document.querySelector(".lvbtn.next"), lock = document.querySelector(".lvbtn.todo");
      o.next = next && /つぎ/.test(next.textContent) && /つぎ/.test(next.getAttribute("aria-label"));
      o.lock = lock && /まだ/.test(lock.textContent) && /まだ/.test(lock.getAttribute("aria-label")) && !lock.disabled && getComputedStyle(lock).borderStyle === "dashed";
      __game.start(0); const L = __game.state.cur;
      [...L.answer].reverse().forEach((t) => __game.add(t)); __game.finish();
      const lis = [...document.querySelectorAll("ul.conds li")];
      o.marks = lis.every((li) => (li.classList.contains("ok") && /✓/.test(li.textContent) && /守れた：/.test(li.textContent)) || (li.classList.contains("ng") && /✗/.test(li.textContent) && /守れていない：/.test(li.textContent)));
      o.dots = /人クリア/.test(document.getElementById("dots").getAttribute("aria-label") || "");
      __game.start(0); __game.state.cur.answer.forEach((t, i) => { if (i < 1) __game.add(t); }); __game.hint(); __game.hint();
      const h = document.querySelector(".ing.hint");
      o.hint = !!h && /👉/.test(h.textContent) && /ヒント/.test(h.getAttribute("aria-label"));
      return o;
    });
    await pc.waitForTimeout(150);
    const lv = await pc.evaluate(() => document.getElementById("live").textContent);
    check("色だけで分けない：つぎ/まだのお客さん・守れた✓/守れない✗（読み上げにも）・章の進み具合・ヒントの具（👉）が、記号と文字でも分かる（WCAG 1.4.1）", c.next && c.lock && c.marks && c.dots && c.hint, JSON.stringify(c));
    check("知らせ（ヒント・正解・まちがい）が読み上げ用の場所 #live（role=status）に文字で出る（WCAG 4.1.3）", /次は/.test(lv) && (await pc.locator("#live[role=status]").count()) === 1, lv);
    const s3 = await pc.evaluate(() => { __game.start(0); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.hint(); __game.finish(); return [...document.querySelectorAll(".stage .stars span")].map((e) => e.textContent).join(""); });
    check("結果の星は、取れなかった分を ☆（形）で出す（色の濃さだけにしない）", /^★+☆+$/.test(s3) || s3 === "★★★", s3);
    // 色の見分けを助ける設定：守れた/守れないの色をカラーユニバーサルデザインの組に替え、積んだ具に名前を出す
    await pc.evaluate(() => { localStorage.setItem("a11y-v1", JSON.stringify({ cvd: true })); }); await pc.reload();
    const cv = await pc.evaluate(() => { __game.start(0); const L = __game.state.cur; [...L.answer].reverse().forEach((t) => __game.add(t)); __game.finish();
      const nm = document.querySelector(".stage .ly .nm"); const ok = getComputedStyle(document.documentElement).getPropertyValue("--ok").trim();
      return { cvd: document.documentElement.classList.contains("a11y-cvd"), nm: nm && getComputedStyle(nm).display !== "none" && nm.textContent, ok }; });
    check("色の見分けを助ける設定で、守れた＝青（#0072b2）に替わり、積んだ具に名前が出る", cv.cvd && cv.nm && /^#0072b2$/i.test(cv.ok), JSON.stringify(cv));
    // 動きを減らす設定で、紙吹雪を出さない
    await pc.evaluate(() => { localStorage.setItem("a11y-v1", JSON.stringify({ calm: true })); }); await pc.reload();
    const cf = await pc.evaluate(() => { __game.start(0); __game.state.cur.answer.forEach((t) => __game.add(t)); __game.finish(); return document.querySelectorAll(".confetti").length; });
    check("動きを減らす設定で、紙吹雪を出さない", cf === 0, String(cf));
    await pc.close();
  }
} catch (e) {
  // 操作が途中で止まっても、失敗として report.md に残す
  check("QA の実行が途中で止まった", false, String(e.message || e).split("\n")[0]);
} finally {
  try { // 引き継ぎコード（別の端末へ記録を移す。shared-workflows template/qa/transfer-check.mjs）
    await checkTransfer({ browser, url, game: "wagamama-burger", sample: { "wagamamaBurger1": JSON.stringify({ best: [3, 2], guided: true, log: { 10: 3 }, past: {}, badges: ["first"] }) }, check });
  } catch (e) { check("引き継ぎコード", false, e.message.split("\n")[0]); }
  await browser.close();
}

{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し。routines/game-dev.md「だれでも遊べるように」）
  const { spawnSync } = await import("node:child_process");
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const failed = results.filter((r) => !r.ok);
const md = ["# QA わがままバーガー", "", ...results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`), "", failed.length ? `❌ ${failed.length}件失敗` : "✅ 全部通った"].join("\n");
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report", "report.md"), md + "\n");
console.log(md);
process.exit(failed.length ? 1 : 0);
