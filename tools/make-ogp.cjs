// SNS でリンクを貼ったときに出る画像（ogp.png、1200×630）を作る。使い方: node tools/make-ogp.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto("file://" + path.join(__dirname, "..", "index.html"));
  const css = await p.evaluate(() => [...document.styleSheets[0].cssRules].map((r) => r.cssText).join("\n"));
  await p.setContent(`<style>${css}
    body{margin:0;width:1200px;height:630px;background:linear-gradient(135deg,#fff3dc,#ffd59e);display:flex;align-items:center;justify-content:center;gap:70px;font-family:"Hiragino Maru Gothic ProN","Noto Sans CJK JP",sans-serif;color:#3b2414}
    .bg{display:flex;flex-direction:column-reverse;align-items:center;width:380px}
    .bg .ly{animation:none;width:300px!important;margin-top:-4px}
    .bg .t-bun-b{height:60px}.bg .t-bun-t{height:110px;width:320px!important}.bg .t-patty{height:56px}.bg .t-cheese{height:24px}.bg .t-lettuce{height:36px}.bg .t-tomato{height:30px;width:250px!important}.bg .t-egg{height:34px}
    h1{font-size:92px;margin:0;line-height:1.1}
    p{font-size:40px;margin:22px 0 0;font-weight:700}
    .tag{display:inline-block;margin-top:30px;background:#e8572a;color:#fff;border-radius:20px;padding:10px 26px;font-size:34px;font-weight:800}
    ul{list-style:none;padding:0;margin:26px 0 0;font-size:30px}</style>
    <div class="bg"><span class="ly t-bun-b"></span><span class="ly t-patty"></span><span class="ly t-cheese"></span><span class="ly t-lettuce"></span><span class="ly t-tomato"></span><span class="ly t-egg"></span><span class="ly t-bun-t"></span></div>
    <div><h1>わがまま<br>バーガー</h1><p>注文どおりに積むパズル</p><ul><li>・チーズはパティのすぐ上</li><li>・トマトとレタスはくっつけない</li></ul><span class="tag">毎日1問・無料</span></div>`);
  await p.screenshot({ path: path.join(__dirname, "..", "ogp.png") });
  await b.close();
})();
