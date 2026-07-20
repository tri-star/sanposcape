import { StyleSheet } from "react-native-unistyles";

import { darkTheme, lightTheme } from "@/theme/tokens";

const appThemes = {
  light: lightTheme,
  dark: darkTheme,
};

const breakpoints = {
  xs: 0,
  sm: 360,
  md: 480,
  lg: 768,
} as const;

type AppThemes = typeof appThemes;
type AppBreakpoints = typeof breakpoints;

// Unistyles にテーマ/ブレークポイントの型を認識させる
declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes: appThemes,
  breakpoints,
  settings: {
    adaptiveThemes: true,
  },
});
