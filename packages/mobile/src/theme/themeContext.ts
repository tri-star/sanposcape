import { createContext } from "react";

import { lightTheme, type Theme, type ThemeMode } from "@/theme/tokens";

export type ThemeContextValue = {
  /** 現在適用されているテーマ。 */
  theme: Theme;
  /** ユーザーが選んだモード（`system` は端末設定に追従）。 */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

/**
 * Provider の外で参照された場合は light テーマにフォールバックする。
 * （Storybook 的な単発レンダリングやテストで Provider を省いても壊れないようにするため）
 */
export const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  mode: "system",
  setMode: () => {},
});
