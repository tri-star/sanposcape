import type { ThemeMode } from "@/theme/tokens";

/**
 * 端末ローカルに文字列1つを同期で読み書きする最小の I/F。
 * 同期にしているのは、最初の描画の前（app/_layout.tsx のモジュール評価時）に読むため
 * （ちらつき防止。ADR-M-016）。
 */
export type PreferenceStorage = {
  /** 保存済みの文字列。未保存なら null。読めない場合は throw してよい（サービス側で既定値に倒す）。 */
  read(): string | null;
  /** 文字列を丸ごと保存する。失敗は throw してよい（サービス側で握りつぶす）。 */
  write(raw: string): void;
};

/**
 * 端末に保存するアプリ設定。端末単位であり、ユーザー（アカウント）単位ではない。
 * サインアウトで消さないため、ユーザー識別情報（ID・メール等）は入れないこと。
 */
export type AppPreferences = {
  themeMode: ThemeMode;
  /**
   * ユーザーが最後に設定画面で themeMode を選んだ時刻（ISO 8601）。一度も選んでいなければ null。
   * フェーズAでは読み出して使う箇所は無い。将来サーバーと同期するときに
   * 「この端末で明示的に選んだか」を判定するため、保存形式に今から含めておく。
   */
  themeModeUpdatedAt: string | null;
};

export type AppPreferencesService = {
  /** 保存値の themeMode。未保存・破損・読込失敗は DEFAULT_THEME_MODE。throw しない。 */
  loadThemeMode(): ThemeMode;
  /** themeMode を保存する。失敗しても throw しない（診断ログのみ）。 */
  saveThemeMode(mode: ThemeMode): void;
};
