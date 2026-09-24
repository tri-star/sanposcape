/**
 * `EXPO_PUBLIC_PHOTO_MODE` の解析。
 * 未設定・不正値はすべて "real"（fail-safe）にフォールバックする。
 *
 * `src/config/locationMode.ts` と同じく `dev` モードを持たない。写真の取得・加工
 * （カメラ/ライブラリ・縮小・再圧縮）は「本物に近いが実機に依存しない中間実装」に
 * 相当するものが無い（mock はダミー画像を返すだけで実ファイルの加工を伴わない）ため
 * （ADR-006 と同じ判断。ADR-010）。
 */
export type PhotoMode = "real" | "mock";

/**
 * 環境変数値を PhotoMode に解析する。
 * `"mock"` に完全一致したときだけ mock。未設定・不正値は "real" を返す。
 * 大文字小文字は救済しない（設定ミスを本番安全側に倒す）。
 */
export function parsePhotoMode(raw: string | undefined | null): PhotoMode {
  const trimmed = raw?.trim();
  if (trimmed === "mock") {
    return trimmed;
  }
  return "real";
}

/**
 * 実行時のモード。EXPO_PUBLIC_PHOTO_MODE を読む。
 * Expo(Babel) が `process.env.EXPO_PUBLIC_XXX` というメンバ式を静的に文字列へ置換するため、
 * リテラルで参照する（動的アクセスはビルドに焼き込まれない）。
 */
export function getPhotoMode(): PhotoMode {
  return parsePhotoMode(process.env.EXPO_PUBLIC_PHOTO_MODE);
}
