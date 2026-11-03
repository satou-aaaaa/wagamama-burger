// わがままバーガーの検査。問題の形（答えが1つ）を全部の並べ方で確かめ、index.html をブラウザで開いて遊び方を確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { answers, check: judge, condText, perms, makeDaily, makeExtra, EXTRA, dayNumber, ING } = require(path.join(root, "rules.js"));
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
check("日の番号は日本時間の0時で変わる（2026-11-03 が #1）", dayNumber(new Date("2026-11-02T23:59:00+09:00")) === -1 && dayNumber(new Date("2026-11-03T00:00:00+09:00")) === 0 && dayNumber(new Date("2026-11-03T23:59:00+09:00")) === 0 && dayNumber(new Date("2026-11-04T00:00:00+09:00")) === 1);
const html = readFileSync(path.join(root, "index.html"), "utf8");
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

  // 2. タイトル：30人並び、最初の1人だけ選べる
  check("タイトルに40人並ぶ", (await page.locator(".lvbtn").count()) === 40);
  check("はじめは最初のお客さんだけ選べる", (await page.locator(".lvbtn:not(.lock)").count()) === 1);
  check("外のサイトのスクリプトを読まない", await page.evaluate(() => [...document.scripts].every((s) => !s.src || new URL(s.src).protocol === "file:")));
  const kofi = await page.evaluate(() => [...document.links].find((a) => a.href.includes("ko-fi"))?.href);
  check("応援のリンクが Ko-fi のページを指す（ボタン用スクリプトは入れない）", kofi === "https://ko-fi.com/satouaaaaa", kofi || "無い");

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
  check("開き直しても記録が残る（2人クリア → 3人目が開く）", (await page.locator(".lvbtn:not(.lock)").count()) >= 3);
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
  check("1日あけると連続は0に戻り、タイトルにとぎれたと出る", (await pq.evaluate(() => __game.state.streak)) === 0 && /とぎれ/.test(await pq.textContent("#streak")));
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
  // 出題・結果のシェア文
  await pq.evaluate(() => __game.start(0)); for (const t of LEVELS[0].answer) await pq.click(`.ing[data-t="${t}"]`); await pq.click("#go");
  check("クリアすると「この注文を出題」「結果をシェア」が出る", await pq.locator("#shareQ").isVisible() && await pq.locator("#shareR").isVisible());
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
  // 記録帳：きょうの星がカレンダーに、章の王冠は全員★3で付く
  await pq.evaluate(() => { __game.setToday(30); }); await pq.evaluate(() => __game.startDaily());
  await solveExtra(false); await pq.click("#back");
  await pq.click("#log summary");
  const logText = await pq.textContent("#logBody");
  check("記録帳に、きょうの星（カレンダー）・解いた日・おかわりの記録が出る", (await pq.locator(".cal i.today.s3").count()) === 1 && /解いた日 1日/.test(logText) && /むずかしい3問/.test(logText), logText.slice(0, 120));
  await pq.evaluate(() => { const r = JSON.parse(localStorage.getItem("wagamamaBurger1")); r.best = Array(10).fill(3); localStorage.setItem("wagamamaBurger1", JSON.stringify(r)); });
  await pq.reload();
  check("1章を全員★3にすると、章と記録帳に王冠が付く", /👑/.test(await pq.textContent(".chap h2")) && /1章👑/.test(await pq.textContent("#logBody")));
  // 別のタブで新しい日を解いた後に、古いタブで前の日を解いても、新しい記録が消えない（2026-11-03 CodeRabbit 指摘）
  const merged = await pq.evaluate(() => {
    localStorage.clear(); __game.setToday(40); __game.startDaily();
    const c = __game.state.cur;
    const other = { best: [3], daily: { day: 41, solved: true, stars: 3, tries: 1, hint: false }, streak: { last: 41, n: 5, max: 5 }, log: { 41: 3 }, extra: [{ n: 9, run: 2, best: 4, perfect: 6 }] };
    localStorage.setItem("wagamamaBurger1", JSON.stringify(other));
    __game.setToday(41); c.answer.forEach((t) => __game.add(t)); __game.finish();
    return JSON.parse(localStorage.getItem("wagamamaBurger1"));
  });
  check("別のタブの新しい記録（きょう・連続・カレンダー・おかわり・星）を、古いタブの保存で消さない", merged.daily.day === 41 && merged.streak.last === 41 && merged.streak.n === 5 && merged.log[41] === 3 && merged.extra[0].n === 9 && merged.best[0] === 3, JSON.stringify([merged.daily.day, merged.streak, merged.log, merged.extra[0]]));
  // 押す所の大きさ（指で押す所は 48px 以上。積んだ具材と条件の中の絵は除く）
  const small = [];
  for (const view of ["title", "play"]) {
    if (view === "title") await pq.evaluate(() => __game.showTitle()); else await pq.evaluate(() => __game.start(5));
    small.push(...(await pq.evaluate(() => [...document.querySelectorAll("button, a, summary")].filter((b) => b.offsetParent && !b.classList.contains("ly")).map((b) => { const r = b.getBoundingClientRect(); return { n: b.id || b.className || b.textContent.trim().slice(0, 8), w: r.width, h: r.height }; }).filter((r) => r.h < 48 || r.w < 48).map((r) => `${r.n}:${Math.round(r.w)}x${Math.round(r.h)}`))));
  }
  check("ボタンは指で押しやすい大きさ（48px 以上）", small.length === 0, small.join(" "));
  await pq.close();
  // 動きを減らす設定の人には、紙吹雪を出さない
  const pr = await browser.newPage({ viewport: { width: 390, height: 800 }, reducedMotion: "reduce" });
  await pr.goto(url); await pr.evaluate(() => __game.start(0));
  for (const t of LEVELS[0].answer) await pr.click(`.ing[data-t="${t}"]`); await pr.click("#go");
  check("動きを減らす設定では紙吹雪を出さない", (await pr.locator(".confetti").count()) === 0 && (await pr.evaluate(() => __game.state.done)));
  await pr.close();

  // 8. スマホ幅（320・390）で横にはみ出さず、具材7個でも上のパンが台の中に収まる
  const wide = [];
  for (const w of [320, 390]) {
    const p = await browser.newPage({ viewport: { width: w, height: 700 } });
    await p.goto(url);
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push(`${w}:タイトル`);
    const big = LEVELS.findIndex((L) => L.items.length === Math.max(...LEVELS.map((x) => x.items.length)));
    await p.evaluate((i) => __game.start(i), big);
    for (const t of LEVELS[big].answer) await p.click(`.ing[data-t="${t}"]`);
    await p.click("#go");
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push(`${w}:遊ぶ画面`);
    const fits = await p.evaluate(() => { const s = document.querySelector(".stage").getBoundingClientRect(), t = document.querySelector(".stage .t-bun-t").getBoundingClientRect(); return t.top >= s.top && t.left >= s.left && t.right <= s.right; });
    if (!fits) wide.push(`${w}:上のパンがはみ出す`);
    if (w === 390) { await p.waitForTimeout(900); await p.locator(".stage").screenshot({ path: path.join(root, "qa-report", "play-390.png") }).catch(() => {}); }
    await p.close();
  }
  check("スマホ幅で横にはみ出さず、いちばん大きいバーガーも台に収まる", wide.length === 0, wide.join(","));

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
    const scripts = ["rules.js", "levels.js"].filter((f) => !shell.includes(`"./${f}"`));
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
} catch (e) {
  // 操作が途中で止まっても、失敗として report.md に残す
  check("QA の実行が途中で止まった", false, String(e.message || e).split("\n")[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
const md = ["# QA わがままバーガー", "", ...results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`), "", failed.length ? `❌ ${failed.length}件失敗` : "✅ 全部通った"].join("\n");
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report", "report.md"), md + "\n");
console.log(md);
process.exit(failed.length ? 1 : 0);
