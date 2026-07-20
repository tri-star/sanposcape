import type { GeneratedTheme } from "./buildThemes";

const HEADER = `/**
 * このファイルは自動生成物です。手編集しないでください。
 *
 * 生成元: design/tokens/*.css (Claude Design プロジェクト ea6ab024-4c09-45b2-94f5-0a6a0315a88d)
 * 再生成: pnpm --filter mobile design:tokens
 */
`;

function serializeValue(value: string | number): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

function serializeRecord(record: Record<string, string | number>): string {
  const keys = Object.keys(record).sort();
  if (keys.length === 0) {
    return "{}";
  }
  const lines = keys.map((key) => `    ${JSON.stringify(key)}: ${serializeValue(record[key])},`);
  return `{\n${lines.join("\n")}\n  }`;
}

function serializeTheme(theme: GeneratedTheme): string {
  const categoryKeys = (Object.keys(theme) as (keyof GeneratedTheme)[]).sort();
  const lines = categoryKeys.map(
    (category) => `  ${JSON.stringify(category)}: ${serializeRecord(theme[category])},`,
  );
  return `{\n${lines.join("\n")}\n}`;
}

/**
 * `buildThemes` の結果から `tokens.generated.ts` のソース文字列を生成する。
 *
 * - トップレベルのカテゴリキー・各カテゴリ内のキーは常にソートして出力する
 *   (取得順に依存すると意味のない diff が出るため)。
 * - 出力後は `oxfmt` で整形する運用(呼び出し側の `generate-tokens.ts` が行う)ため、
 *   ここではインデント・改行の見た目までは厳密に作り込まない。
 */
export function emitTypeScript(themes: { light: GeneratedTheme; dark: GeneratedTheme }): string {
  return `${HEADER}
export const generatedLightTokens = ${serializeTheme(themes.light)} as const;

export const generatedDarkTokens = ${serializeTheme(themes.dark)} as const;

export type GeneratedTokens = typeof generatedLightTokens;
`;
}
