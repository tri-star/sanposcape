/**
 * CSS→RN の影・モーション変換。
 *
 * `react-native` / `react-native-reanimated` を値として import しない。
 * `Easing.bezier(...)` の生成は呼び出し側（コンポーネント）の責務とする
 * （reanimated を import すると node 環境の Vitest で読み込めなくなるため）。
 */

/**
 * CSS の box-shadow 文字列をそのまま返す(RN 0.86 は boxShadow を iOS/Android 両対応)。
 * 想定外の形式(空文字・`none`)を早期に検出するバリデーションを兼ねる。
 */
export function toBoxShadow(cssShadow: string): string {
  const trimmed = cssShadow.trim();
  if (trimmed === "" || trimmed === "none") {
    throw new Error(`toBoxShadow: 無効な box-shadow です: "${cssShadow}"`);
  }
  return trimmed;
}

/** `"cubic-bezier(.2,.8,.2,1)"` → `[0.2, 0.8, 0.2, 1]` */
export function parseCubicBezier(value: string): [number, number, number, number] {
  const match = /^cubic-bezier\(\s*([^)]+?)\s*\)$/.exec(value.trim());
  if (!match) {
    throw new Error(`parseCubicBezier: cubic-bezier 形式ではありません: "${value}"`);
  }
  const parts = match[1].split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`parseCubicBezier: 引数が4つの数値ではありません: "${value}"`);
  }
  return parts as [number, number, number, number];
}

/** `"320ms"` / `"0.32s"` → `320` */
export function toDurationMs(value: string): number {
  const trimmed = value.trim();
  const msMatch = /^(-?\d+(?:\.\d+)?)ms$/.exec(trimmed);
  if (msMatch) {
    return Number(msMatch[1]);
  }
  const sMatch = /^(-?\d+(?:\.\d+)?)s$/.exec(trimmed);
  if (sMatch) {
    return Number(sMatch[1]) * 1000;
  }
  throw new Error(`toDurationMs: 単位が不明です: "${value}"`);
}
