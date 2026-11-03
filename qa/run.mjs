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
const { answers, check: judge, condText, perms } = require(path.join(root, "rules.js"));
const { LEVELS, CHAPTERS } = require(path.join(root, "levels.js"));
const url = "file://" + path.join(root, "index.html");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

// 1. 問題の形（ブラウザを使わない）
check("お客さんは30人・3章（1章10人）", LEVELS.length === 30 && CHAPTERS.length === 3);
const notUnique = LEVELS.map((L, i) => [i, answers(L.items, L.conds)]).filter(([i, a]) => a.length !== 1 || a[0].join() !== LEVELS[i].answer.join());
check("どの問題も答えがちょうど1つで、answer と合う（全部の並べ方を試す）", notUnique.length === 0, notUnique.map(([i]) => i + 1).join(","));
const extra = LEVELS.map((L, i) => [i, L.conds.findIndex((_, k) => answers(L.items, L.conds.filter((__, j) => j !== k)).length === 1)]).filter(([, k]) => k >= 0);
check("要らない条件が無い（どの条件を外しても答えが2つ以上になる）", extra.length === 0, extra.map(([i, k]) => `${i + 1}の${k + 1}つ目`).join(","));
const KINDS = [["bottom", "top", "notTop", "above", "on"], ["apart", "same", "notBottom"], ["gap"]];
const allowed = (ch) => KINDS.slice(0, ch + 1).flat();
const early = LEVELS.map((L, i) => [i, L.conds.find((c) => !allowed(Math.floor(i / 10)).includes(c[0]))]).filter(([, c]) => c);
check("まだ習っていない種類の条件が出ない（章ごとに新しいこだわりを1つずつ）", early.length === 0, early.map(([i, c]) => `${i + 1}:${c[0]}`).join(","));
check("2章・3章は、その章の新しいこだわりを使う問題が半分以上", [1, 2].every((ch) => LEVELS.slice(ch * 10, ch * 10 + 10).filter((L) => L.conds.some((c) => KINDS[ch].includes(c[0]))).length >= 5));
const longT = LEVELS.flatMap((L, i) => L.conds.map((c) => [i, condText(c)])).filter(([, t]) => t.length > 18);
check("条件の文は18字以内（一目で読める）", longT.length === 0, longT.map(([i, t]) => `${i + 1}:${t}`).join(","));
check("お客さんの台詞は17字以内", LEVELS.every((L) => [...L.say].length <= 17), LEVELS.filter((L) => [...L.say].length > 17).map((L) => L.say).join(","));
check("具材は3〜7個・条件は2〜6個（1画面に収まる）", LEVELS.every((L) => L.items.length >= 3 && L.items.length <= 7 && L.conds.length >= 2 && L.conds.length <= 6));
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

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear()); await page.reload();

  // 2. タイトル：30人並び、最初の1人だけ選べる
  check("タイトルに30人並ぶ", (await page.locator(".lvbtn").count()) === 30);
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
  check("30問すべて、間違えた所からヒントだけで解ける", hintFail.length === 0, hintFail.join(","));

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
  check("シェアの文にクリア人数と星が入る", /お客さん \d+\/30 人クリア ★\d+/.test(share), share.split("\n")[1]);
  check("ページのエラーが無い", errors.length === 0, errors.join(" / "));

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
    check("電波が無くてもタイトルが開き、30人並ぶ", !offErr && (await pw.locator(".lvbtn").count()) === 30, offErr);
    if (!offErr) { await pw.click('.lvbtn[data-i="0"]'); }
    check("電波が無くても遊べる（具材が並ぶ）", (await pw.locator(".ing").count()) >= 2);
    await ctx.setOffline(false); down = true;
    const downErr = await pw.goto(base).then(() => "", (e) => e.message.split("\n")[0]);
    check("サーバーが 503 を返しても、保存したタイトルが開く", !downErr && (await pw.locator(".lvbtn").count()) === 30, downErr);
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
