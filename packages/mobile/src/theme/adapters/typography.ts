import type { TextStyle } from "react-native";

/**
 * CSS→RN のタイポグラフィ変換。
 *
 * DS の CSS は行高を「無単位の倍率」(例: `1.55`)、字間を `em`/`px` で表現するが、
 * RN の `TextStyle` はどちらも絶対 px を要求する。ここでは fontSize を基準に確定させる。
 *
 * `react-native` を値として import しない（型のみ `import type`）。
 * Vitest（node環境・react-native スタブ差し替え）でそのままテストできるようにするため。
 */

/** `"16px"` / `"1.55"` のどちらかを受け取り、fontSize 基準の px 行高に確定する */
export function toLineHeight(fontSize: number, ratio: number | string): number {
  if (typeof ratio === "number") {
    return Math.round(fontSize * ratio);
  }
  const trimmed = ratio.trim();
  const pxMatch = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed);
  if (pxMatch) {
    return Number(pxMatch[1]);
  }
  const numeric = Number(trimmed);
  if (Number.isNaN(numeric)) {
    throw new Error(`toLineHeight: 解釈できない値です: "${ratio}"`);
  }
  return Math.round(fontSize * numeric);
}

/** 小数第2位までに丸める（em 換算時の浮動小数点誤差を吸収する） */
function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `"-0.01em"` / `"0.5px"` / 未指定 を fontSize 基準の px 字間に換算する */
export function toLetterSpacing(fontSize: number, value?: string): number {
  if (value === undefined) {
    return 0;
  }
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "0" || trimmed === "0em" || trimmed === "0px") {
    return 0;
  }
  const emMatch = /^(-?\d+(?:\.\d+)?)em$/.exec(trimmed);
  if (emMatch) {
    return roundTo2(fontSize * Number(emMatch[1]));
  }
  const pxMatch = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed);
  if (pxMatch) {
    return Number(pxMatch[1]);
  }
  throw new Error(`toLetterSpacing: 解釈できない値です: "${value}"`);
}

export type TextStyleToken = {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontWeight: TextStyle["fontWeight"];
  fontVariant?: TextStyle["fontVariant"];
};

/**
 * generated の1エントリ(fontSize/lineHeight/letterSpacing/fontWeight の生値)を
 * RN の TextStyle 相当に変換する。
 * `options.tabularNums` は StatBlock のような数値表示に必須（桁揺れ防止）。
 */
export function toTextStyle(
  token: {
    fontSize: number;
    lineHeight: string | number;
    letterSpacing?: string;
    fontWeight: string;
  },
  options?: { tabularNums?: boolean },
): TextStyleToken {
  const style: TextStyleToken = {
    fontSize: token.fontSize,
    lineHeight: toLineHeight(token.fontSize, token.lineHeight),
    letterSpacing: toLetterSpacing(token.fontSize, token.letterSpacing),
    fontWeight: token.fontWeight as TextStyle["fontWeight"],
  };
  if (options?.tabularNums === true) {
    style.fontVariant = ["tabular-nums"];
  }
  return style;
}
