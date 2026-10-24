# 地図のアイコンの画像（Noto Emoji）

地図ごとのアイコン（API の値 `pin` / `cat` など。ルート ADR-009 決定31）を描くカラーの画像の原本。
アプリが読むのは、ここから生成した `src/features/pin/data/sanpoMapIconArt.ts`（SVGO で軽くした SVG の文字列）。
設計理由は [ADR-M-019](../../adr/ADR-M-019-sanpo-map-icon-and-map-pin-shape.md) の SS-191 追補を参照。

## 取得元

[googlefonts/noto-emoji](https://github.com/googlefonts/noto-emoji) のコミット
`e20cbc2bbec1926686be9f9bee7d1d2cfa1fea0e`（2026-09-24）の `2D/svg/emoji_u<コードポイント>.svg` を無加工で `source/` に置いている。

| API の値 | 絵 | コードポイント |
| --- | --- | --- |
| `pin` | ラウンドピン | U+1F4CD |
| `tree` | 広葉樹 | U+1F333 |
| `flower` | 桜 | U+1F338 |
| `leaf` | もみじ | U+1F341 |
| `sun` | 太陽 | U+2600 |
| `rain` | 傘と雨粒 | U+2614 |
| `retreat` | かき氷 | U+1F367 |
| `landmark` | 神社 | U+26E9 |
| `coffee` | ホットドリンク | U+2615 |
| `food` | おにぎり | U+1F359 |
| `bakery` | クロワッサン | U+1F950 |
| `shopping` | 買い物袋 | U+1F6CD |
| `cat` | 猫の顔 | U+1F431 |

## ライセンス

Copyright 2013 Google LLC。リポジトリの README は「画像は Apache License 2.0」とするが、
README がリンクするルートの `LICENSE` は 2024-07-29 のコミット `254596e`（Update LICENSE to OFL）で
SIL Open Font License 1.1 の本文に差し替えられており、食い違っている。どちらでも商用利用・改変・同梱は許されるので、
両方の本文（`LICENSE-Apache-2.0.txt`・`LICENSE-OFL-1.1.txt`）を置き、アプリの設定の「ライセンス」画面にも全文を載せる。

- `LICENSE-OFL-1.1.txt`: 上記コミットのルートの `LICENSE`
- `LICENSE-Apache-2.0.txt`: https://www.apache.org/licenses/LICENSE-2.0.txt
- 生成物は SVGO で最適化した改変物（見た目は変えていない）。「Noto」は Google の商標なので、機能名や宣伝には使わない。

## 再生成

`source/` を差し替えた・アイコンを足したときは、リポジトリルートから実行し、続けて整形する。
SVGO は `pnpm dlx` で版を固定して使う（依存には足していない）。アプリ用の環境変数や `.env` は不要。

```bash
node packages/mobile/assets/sanpo-map-icons/generate.mjs
pnpm --filter mobile format
```

アイコンを足すときは、`generate.mjs` の `ICONS` と上の表に1行ずつ足す。backend が先に値を足すと、
`SANPO_MAP_ICON_ART` の `Record` が typecheck で足りない値を知らせる。
