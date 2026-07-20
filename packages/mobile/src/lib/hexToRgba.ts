/**
 * `#rrggbb` / `#rgb` 形式の16進カラーコードに不透明度を適用し `rgba(...)` 文字列へ変換する純粋関数。
 *
 * DS のトークンには半透明のオーバーレイ(モーダル/シートの背景スクリム)専用の色が
 * 定義されていない(`src/theme/tokens.ts` のコメント参照)。そのため BottomSheet / Dialog の
 * 背景スクリムは、既存の semantic 色(`theme.colors.surfaceInverse` 等)にこの関数で
 * 透過度を適用して代用する。色そのものは必ず theme 経由のトークンを渡すこと
 * (`alpha` の数値のみをコンポーネント側で決める)。
 */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    throw new Error(`hexToRgba: 16進カラーコードではありません: "${hex}"`);
  }
  if (alpha < 0 || alpha > 1) {
    throw new Error(`hexToRgba: alpha は 0〜1 の範囲でなければなりません: ${alpha}`);
  }

  const digits = match[1];
  const expanded =
    digits.length === 3
      ? digits
          .split("")
          .map((char) => char + char)
          .join("")
      : digits;

  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
