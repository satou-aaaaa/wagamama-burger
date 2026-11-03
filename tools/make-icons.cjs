// アプリのアイコン（icon-192.png・icon-512.png）を CSS のバーガーから作る。使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    const u = s / 100;
    await p.setContent(`<body style="margin:0;width:${s}px;height:${s}px;background:#e8572a;display:flex;flex-direction:column-reverse;align-items:center;justify-content:center;padding-top:${8*u}px">
      <div style="width:${60*u}px;height:${12*u}px;background:linear-gradient(#f4b062,#d98a3a);border-radius:${3*u}px ${3*u}px ${8*u}px ${8*u}px"></div>
      <div style="width:${62*u}px;height:${11*u}px;background:linear-gradient(#7a4422,#4d2610);border-radius:${6*u}px;margin-bottom:-${u}px"></div>
      <div style="width:${64*u}px;height:${5*u}px;background:#ffd84a;margin-bottom:-${u}px"></div>
      <div style="width:${66*u}px;height:${6*u}px;background:linear-gradient(#8fdc5a,#4caf2c);border-radius:${4*u}px;margin-bottom:-${u}px"></div>
      <div style="width:${60*u}px;height:${22*u}px;border-radius:50% 50% ${3*u}px ${3*u}px/95% 95% ${3*u}px ${3*u}px;background:radial-gradient(ellipse ${1.5*u}px ${0.8*u}px at 30% 40%,#fff 98%,transparent),radial-gradient(ellipse ${1.5*u}px ${0.8*u}px at 55% 25%,#fff 98%,transparent),radial-gradient(ellipse ${1.5*u}px ${0.8*u}px at 72% 45%,#fff 98%,transparent),linear-gradient(#f7bd6e,#d98a3a);margin-bottom:-${u}px"></div></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", `icon-${s}.png`) });
  }
  await b.close();
})();
