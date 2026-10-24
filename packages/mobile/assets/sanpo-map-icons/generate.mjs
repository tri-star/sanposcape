// source/ の Noto Emoji の SVG を SVGO で軽くし、src/features/pin/data/sanpoMapIconArt.ts を作り直す。
// 使い方は README.md の「再生成」を参照。
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SVGO_VERSION = "3.3.2";

// 地図のアイコン（API の値）→ Noto Emoji のコードポイントと絵の名前。表の順は SANPO_MAP_ICON_ORDER に合わせる。
const ICONS = [
  ["pin", "1f4cd", "ラウンドピン"],
  ["tree", "1f333", "広葉樹"],
  ["flower", "1f338", "桜"],
  ["leaf", "1f341", "もみじ"],
  ["sun", "2600", "太陽"],
  ["rain", "2614", "傘と雨粒"],
  ["retreat", "1f367", "かき氷"],
  ["landmark", "26e9", "神社"],
  ["coffee", "2615", "ホットドリンク"],
  ["food", "1f359", "おにぎり"],
  ["bakery", "1f950", "クロワッサン"],
  ["shopping", "1f6cd", "買い物袋"],
  ["cat", "1f431", "猫の顔"],
];

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../../src/features/pin/data/sanpoMapIconArt.ts");
const work = mkdtempSync(join(tmpdir(), "sanpo-map-icons-"));

try {
  execFileSync(
    "pnpm",
    [
      "dlx",
      `svgo@${SVGO_VERSION}`,
      "--config",
      join(here, "svgo.config.mjs"),
      "--quiet",
      "-f",
      join(here, "source"),
      "-o",
      work,
    ],
    { stdio: "inherit" },
  );

  const entries = ICONS.map(([key, codepoint, name]) => {
    const svg = readFileSync(join(work, `emoji_u${codepoint}.svg`), "utf8").trim();
    if (svg.includes("'")) throw new Error(`emoji_u${codepoint}.svg に ' が含まれる`);
    return `  // U+${codepoint.toUpperCase()} ${name}\n  ${key}:\n    '${svg}',`;
  });

  writeFileSync(
    out,
    `/**
 * 地図のアイコンの画像（Noto Emoji のカラー SVG を SVGO で軽くしたもの。SS-191。ADR-M-019）。
 *
 * 生成物なので手で編集しない。\`assets/sanpo-map-icons/generate.mjs\` で作り直す（同じフォルダの README を参照）。
 * Copyright 2013 Google LLC。Apache License 2.0 / SIL Open Font License 1.1（設定のライセンスの画面に全文を載せる）。
 */
import type { SanpoMapIconKey } from "@/features/pin/types";

export const SANPO_MAP_ICON_ART: Record<SanpoMapIconKey, string> = {
${entries.join("\n")}
};
`,
  );
  console.log(`wrote ${out}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
