import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Appearance, Platform, useColorScheme } from "react-native";

import { ThemeContext, type ThemeContextValue } from "@/theme/themeContext";
import { DEFAULT_THEME_MODE, toNativeColorScheme } from "@/theme/themeMode";
import { resolveTheme, type ThemeMode } from "@/theme/tokens";

type ThemeProviderProps = {
  children: ReactNode;
  /** 初期モード。保存値を app/_layout.tsx が同期で読んで渡す。既定は DEFAULT_THEME_MODE（system）。 */
  initialMode?: ThemeMode;
  /**
   * ユーザー操作で mode が変わったときに呼ばれる（永続化用）。初期化時には呼ばれない。
   * 同じ値を選び直したときも呼ばれない。
   */
  onModeChange?: (mode: ThemeMode) => void;
};

/**
 * アプリ全体にデザイントークンを配るProvider。
 * `mode` は Context が唯一の情報源。`system` のときは端末のライト/ダーク設定に追従する。
 * 永続化は `onModeChange`（呼び出し側が注入）、ネイティブの外観は
 * `Appearance.setColorScheme` で揃える（ADR-M-015）。
 */
export function ThemeProvider({
  children,
  initialMode = DEFAULT_THEME_MODE,
  onModeChange,
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const systemScheme = useColorScheme();
  const theme = resolveTheme(mode, systemScheme);

  const setMode = useCallback(
    (next: ThemeMode) => {
      // Tabs は選択中の項目を押しても onChange を呼ぶため
      if (next === mode) return;
      setModeState(next);
      // 永続化はイベント起点で行う（effect にしない＝初期化時に書き込まない）
      onModeChange?.(next);
    },
    [mode, onModeChange],
  );

  // 外部システム（ネイティブの外観）との同期。初回マウントでも実行され、保存値が dark なら
  // 起動直後にネイティブ側もダークになる。JS 側の配色は resolveTheme が最初の描画から決める。
  useEffect(() => {
    // react-native-web では setColorScheme が無い可能性があるため
    if (Platform.OS === "web") return;
    Appearance.setColorScheme(toNativeColorScheme(mode));
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, setMode }),
    [theme, mode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
