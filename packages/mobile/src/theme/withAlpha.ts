/**
 * `#RRGGBB` 形式のカラー文字列にアルファ値を合成し `#RRGGBBAA` を返す純粋関数。
 * mock の `color-mix(in srgb, color 16%, transparent)` 相当を RN のスタイルで表現するために使う
 * （RN の `StyleSheet` は `color-mix()` を扱えないため、8桁hexで代替する）。
 *
 * `opacity` は 0〜1 にクランプする。`hexColor` が `#RRGGBB` 形式でない場合はそのまま返す
 * （テーマの `theme.colors.*` / `theme.map.*` は常に `#RRGGBB` 形式のため通常は到達しない）。
 *
 * @example withAlpha("#1585fe", 0.16) // "#1585fe29"
 */
export function withAlpha(hexColor: string, opacity: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hexColor)) return hexColor;
  const clamped = Math.max(0, Math.min(1, opacity));
  const alphaHex = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hexColor}${alphaHex}`;
}
