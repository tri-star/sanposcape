import { StatusBar } from "expo-status-bar";

import { statusBarStyleFor } from "@/theme/themeMode";
import { useTheme } from "@/theme/useTheme";

/**
 * ステータスバーのアイコン色を、ネイティブの配色ではなくアプリのテーマから決める。
 * `ThemeProvider` の内側に置くこと（外だと light テーマにフォールバックする）。
 */
export function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar style={statusBarStyleFor(theme.name)} />;
}
