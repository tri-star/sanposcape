import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  buildThemes,
  type FileBlocks,
  type GeneratedTheme,
  type TokenFile,
} from "./design-tokens/buildThemes";
import { emitTypeScript } from "./design-tokens/emitTypeScript";
import { parseCss, type CssBlock } from "./design-tokens/parseCss";
import { resolveVars } from "./design-tokens/resolveVars";

/**
 * デザイントークン codegen の CLI エントリポイント。
 *
 * `design/tokens/*.css`(Claude Design から取得した生スナップショット。手編集禁止)を読み込み、
 * `src/theme/generated/tokens.generated.ts` を再生成する。ネットワークアクセスは行わない
 * (DesignSync は CI/このスクリプトから呼べないため、fetch(手動) と transform(このスクリプト)を分離している)。
 *
 * 実行方法: `pnpm --filter mobile design:tokens`(このパッケージのルートを cwd として実行される前提)。
 */

const TOKEN_FILES: TokenFile[] = ["colors", "typography", "spacing", "effects", "fonts"];

const TOKENS_DIR = path.resolve(process.cwd(), "design/tokens");
const OUTPUT_PATH = path.resolve(process.cwd(), "src/theme/generated/tokens.generated.ts");

function readTokenFile(file: TokenFile): string {
  const filePath = path.join(TOKENS_DIR, `${file}.css`);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `generate-tokens: ${filePath} が見つかりません。design/tokens/ に5ファイルが揃っているか確認してください。`,
    );
  }
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * 1ファイル分のブロックについて `var()` を解決する。
 * `:root`(または `html`)相当のブロックをそのファイルの基準スコープとし、
 * 他のブロック(dark 等)がそのスコープの値も参照できるよう `fallbackScope` として渡す。
 */
function resolveFileBlocks(blocks: CssBlock[]): CssBlock[] {
  const rootBlock = blocks.find((block) => block.selector === ":root" || block.selector === "html");
  const rootResolved = rootBlock ? resolveVars(rootBlock.declarations, rootBlock.declarations) : {};

  return blocks.map((block) => ({
    selector: block.selector,
    declarations: resolveVars(block.declarations, rootResolved),
  }));
}

function countTokens(theme: GeneratedTheme): Record<string, number> {
  const categories = Object.keys(theme) as (keyof GeneratedTheme)[];
  return Object.fromEntries(
    categories.map((category) => [category, Object.keys(theme[category]).length]),
  );
}

function main(): void {
  const fileBlocksList: FileBlocks[] = TOKEN_FILES.map((file) => {
    const source = readTokenFile(file);
    const blocks = parseCss(source);
    return { file, blocks: resolveFileBlocks(blocks) };
  });

  const themes = buildThemes(fileBlocksList);
  const source = emitTypeScript(themes);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, source, "utf-8");

  // 生成直後に oxfmt で整形する。format:check が生成物も対象にするため、
  // ここで整形しておかないと CI の format:check が落ちる。
  execFileSync("oxfmt", [OUTPUT_PATH], { stdio: "inherit" });

  const relativeOutputPath = path.relative(process.cwd(), OUTPUT_PATH);
  console.log(`generate-tokens: ${relativeOutputPath} を生成しました`);
  console.log("generate-tokens: light トークン数", JSON.stringify(countTokens(themes.light)));
  console.log("generate-tokens: dark トークン数", JSON.stringify(countTokens(themes.dark)));
}

main();
