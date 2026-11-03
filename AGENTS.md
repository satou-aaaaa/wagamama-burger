# AGENTS.md

わがままバーガー：お客さんのわがままな注文（条件）を全部守る順に具材を積む、答えが1つのバーガーパズル。`index.html` と `rules.js`（判定の決まり）・`levels.js`（お客さん30人）を GitHub Pages で公開する。

## 準備（最初に一度）

```bash
bash scripts/setup.sh   # Node.js（版は .nvmrc）を確かめ、検査の依存とブラウザを入れる。何度実行してもよい
```

## push する前の確認

```bash
node qa/run.mjs   # 全問の答えが1つ・要らない条件が無い・ヒントで解ける・星・記録・スマホ幅・PWA・エラーを見る（CI の QA と同じ）
```

## このリポジトリの決まり

- 遊びの目的は説明なしで納得できるものにする（2026-11-03 見本「ななめに積んで口に届ける」は「意味がわからない」で不採用）。
- 問題は「答えがちょうど1つ」「どの条件を外しても答えが2つ以上」。足すときは `node tools/gen-levels.cjs` で候補を作り、お客さんの顔と台詞（17字以内）は手で書く。条件の文は18字以内。
- 章ごとに新しいこだわり（条件の種類）を1つずつ増やす。1章：上・下・すぐ上、2章：くっつけない、3章：間に1枚。まだ習っていない種類を前の章に出さない（QA が見る）。
- 毎日1問（`makeDaily`）は日本時間の日付から決まった乱数で作る。どの端末でも同じ問題になるよう `Math.random` は使わない。シェアの文には具材の名前（答え）を入れない（QA が見る）。
- 時間制限は付けない。文字は少なめ・一画面一人。お笑いは台詞と反応で。ほかの作品の名前・キャラ・見た目は使わない。
- 外へ通信しない。外のスクリプト・フォント・広告・解析を入れない（CSP の `connect-src 'self'` を広げない）。記録は遊ぶ人のブラウザ（localStorage）だけ。
- 応援は Ko-fi（https://ko-fi.com/satouaaaaa）へのただのリンクだけ。遊ぶのは無料のまま、有料版は置かない（GitHub Pages は売り買いが主目的のサイトに使えない）。
- 機能を足す・直すたびに `qa/run.mjs` に検査を足す。乱数で動く部分は1回でなく何百回も試す。
- PWA（`manifest.webmanifest`・`sw.js`・`icon-*.png`）：画面のファイルを足したら `sw.js` の `SHELL` にも足し、中身を大きく変えたら `CACHE` の版を上げる。アイコンは `node tools/make-icons.cjs` で作り直せる。
- 公開リポジトリなので、個人情報・鍵を入れない。

## 公開

- GitHub Pages は `main` のルート（`/`）を公開する。PR の QA と Secret scan が ✅ になると `automerge.yml` が自動でマージする。止めたいときは下書きにするか、ラベル「自動マージしない」を付ける。
- `sw.js`・`manifest.webmanifest` を変える PR は自動ではマージされない（`hold_paths`）。CodeRabbit のレビューを待ち、手でマージする直前に今の head へのレビューを読み直す（shared-workflows `incidents/2026-11-01-roppo-merged-before-review.md`）。

## 共通のきまり

- PR の作り方・マージの仕方は satou-aaaaa/shared-workflows の `routines/pr.md`、全体のきまりは `routines/common.md` に従う。
- CI の部品は shared-workflows の共通部品を呼ぶ。リポジトリ側の .github/workflows には呼び出しと設定値だけを書く。
- Claude 以外の AI・人が作業するときは、shared-workflows の `routines/tool-map.md` と `routines/without-claude.md` を読む。
