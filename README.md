# わがままバーガー 🍔

お客さんのわがままな注文を全部守る順に、具材を下から積むパズル。答えはいつも1つ。

- 遊ぶ: https://satou-aaaaa.github.io/wagamama-burger/
- 30人・3章（上・下・すぐ上 → くっつけない → 間に1枚）。時間制限なし・広告なし。
- 毎日1問「きょうのわがまま」（みんな同じ注文・連続日数つき）。結果は答えが分からない絵文字でシェアでき、`?q=番号` のリンクで友だちに出題できる。
- ホーム画面に追加すると、電波が無くても遊べる。記録はこの端末の中だけ。
- 応援: https://ko-fi.com/satouaaaaa

## 開発

準備は `bash scripts/setup.sh`、確認は `node qa/run.mjs`。決まりは [AGENTS.md](AGENTS.md)。SNS 用の画像 `ogp.png` は `node tools/make-ogp.cjs` で作り直せる。
