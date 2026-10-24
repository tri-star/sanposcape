/**
 * `#RRGGBB` の2色を `ratio`（`color` の割合）で混ぜた不透明な `#rrggbb` を返す純粋関数。
 * mock の `color-mix(in srgb, color 16%, #ffffff)` 相当を RN のスタイルで表現するために使う
 * （`withAlpha` は透過色なので、下の面の色に左右されない不透明な色が要るときはこちら）。
 *
 * `ratio` は 0〜1 にクランプする。どちらかが `#RRGGBB` 形式でない場合は `color` をそのまま返す。
 *
 * @example mixHex("#0e8fc7", "#ffffff", 0.16) // "#d8edf6"
 */
export function mixHex(color: string, base: string, ratio: number): string {
  const pattern = /^#[0-9a-fA-F]{6}$/;
  if (!pattern.test(color) || !pattern.test(base)) return color;
  const r = Math.max(0, Math.min(1, ratio));
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) =>
    Math.round(channel(color, i) * r + channel(base, i) * (1 - r))
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${mixed.join("")}`;
}
