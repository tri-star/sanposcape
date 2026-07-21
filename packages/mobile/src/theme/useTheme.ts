import { useContext } from "react";

import { ThemeContext } from "@/theme/themeContext";
import type { Theme, ThemeMode } from "@/theme/tokens";

/** 現在のテーマ（色・余白・タイポグラフィ等）を取得する。 */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** ライト/ダークの切り替え UI 用。 */
export function useThemeMode(): { mode: ThemeMode; setMode: (mode: ThemeMode) => void } {
  const { mode, setMode } = useContext(ThemeContext);
  return { mode, setMode };
}
