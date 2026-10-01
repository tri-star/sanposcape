import type { Theme, ThemeMode } from "@/theme/tokens";

/** 選択肢として取りうる全モード。保存値の検証と、UI の選択肢の網羅チェックに使う。 */
export const THEME_MODES = ["system", "light", "dark"] as const satisfies readonly ThemeMode[];

/** 初回起動時（保存値なし・保存値が壊れている）の既定値。SS-86 の要件で「端末の設定」。 */
export const DEFAULT_THEME_MODE: ThemeMode = "system";

/** 保存値の検証。未知の文字列・大文字違い（"Dark"）・非文字列はすべて false。 */
export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

/**
 * Appearance.setColorScheme に渡す値。RN 0.86 の型は 'light' | 'dark' | 'unspecified'
 * （'auto' は RN の最新ドキュメントにあるが 0.86 には無い。null も受け付けない）。
 */
export type NativeColorScheme = "light" | "dark" | "unspecified";

/** system → "unspecified"（アプリ単位の上書きを外し、端末の設定に戻す）。 */
export function toNativeColorScheme(mode: ThemeMode): NativeColorScheme {
  switch (mode) {
    case "light":
      return "light";
    case "dark":
      return "dark";
    case "system":
      return "unspecified";
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }
}

/** expo-status-bar の style。暗いテーマでは明るいアイコン（"light"）にする。 */
export type StatusBarContentStyle = "light" | "dark";

export function statusBarStyleFor(themeName: Theme["name"]): StatusBarContentStyle {
  switch (themeName) {
    case "dark":
      return "light";
    case "light":
      return "dark";
    default: {
      const unreachable: never = themeName;
      return unreachable;
    }
  }
}
