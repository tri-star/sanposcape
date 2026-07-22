import { type ReactNode, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { ThemeContext, type ThemeContextValue } from "@/theme/themeContext";
import { resolveTheme, type ThemeMode } from "@/theme/tokens";

type ThemeProviderProps = {
  children: ReactNode;
  /** 初期モード。既定は端末の外観設定に追従する `system`。 */
  initialMode?: ThemeMode;
};

/**
 * アプリ全体にデザイントークンを配るProvider。
 * `mode` が `system` のときは端末のライト/ダーク設定に追従する。
 */
export function ThemeProvider({ children, initialMode = "system" }: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const systemScheme = useColorScheme();
  const theme = resolveTheme(mode, systemScheme);

  const value = useMemo<ThemeContextValue>(() => ({ theme, mode, setMode }), [theme, mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
