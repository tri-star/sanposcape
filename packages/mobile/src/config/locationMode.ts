/**
 * `EXPO_PUBLIC_LOCATION_MODE` の解析。
 * 未設定・不正値はすべて "real"（fail-safe）にフォールバックする。
 *
 * `src/config/authMode.ts` と異なり `dev` モードを持たない。
 * 認証と違い、位置情報は Android エミュレータ / 実機の位置設定・`adb emu geo fix` で
 * real のまま再現できるため、「本物に近いが実機依存しない中間実装」に相当するものが無い
 * （`docs/folder-structure.md` の3モード基本形からの意図的な逸脱）。
 */
export type LocationMode = "real" | "mock";

/**
 * 環境変数値を LocationMode に解析する。
 * `"mock"` に完全一致したときだけ mock。未設定・不正値は "real" を返す。
 * 大文字小文字は救済しない（設定ミスを本番安全側に倒す）。
 */
export function parseLocationMode(raw: string | undefined | null): LocationMode {
  const trimmed = raw?.trim();
  if (trimmed === "mock") {
    return trimmed;
  }
  return "real";
}

/**
 * 実行時のモード。EXPO_PUBLIC_LOCATION_MODE を読む。
 * Expo(Babel) が `process.env.EXPO_PUBLIC_XXX` というメンバ式を静的に文字列へ置換するため、
 * リテラルで参照する（動的アクセスはビルドに焼き込まれない）。
 */
export function getLocationMode(): LocationMode {
  return parseLocationMode(process.env.EXPO_PUBLIC_LOCATION_MODE);
}
