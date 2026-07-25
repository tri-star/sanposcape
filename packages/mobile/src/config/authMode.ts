/**
 * `EXPO_PUBLIC_AUTH_MODE` の解析。
 * 既存の `EXPO_PUBLIC_USE_AUTH_STUB`（未設定なら stub = fail-open）を置き換える中核。
 * 未設定・不正値・旧値("stub")はすべて "real"（fail-safe）にフォールバックする。
 */
export type AuthMode = "real" | "dev" | "mock";

/**
 * 環境変数値を AuthMode に解析する。
 * `"dev"` / `"mock"` に完全一致したときのみそれを返し、それ以外は `"real"` を返す。
 * 大文字小文字は救済しない（設定ミスを本番安全側に倒す）。
 */
export function parseAuthMode(raw: string | undefined | null): AuthMode {
  const trimmed = raw?.trim();
  if (trimmed === "dev" || trimmed === "mock") {
    return trimmed;
  }
  return "real";
}

/**
 * 実行時のモード。EXPO_PUBLIC_AUTH_MODE を読む。
 * Expo(Babel) が `process.env.EXPO_PUBLIC_XXX` というメンバ式を静的に文字列へ置換するため、
 * リテラルで参照する（動的アクセスはビルドに焼き込まれない）。
 */
export function getAuthMode(): AuthMode {
  return parseAuthMode(process.env.EXPO_PUBLIC_AUTH_MODE);
}
