/**
 * デザイントークン（暫定）。
 *
 * M2「デザイン取り込み・UI基盤」で Claude Design から取り込んだ値に置き換える。
 * ここでは Unistyles のテーマを成立させるための最小の primitive / semantic を定義する。
 */

// primitive: 生の値（意味を持たない）
const palette = {
  white: "#ffffff",
  black: "#0b0b0c",
  gray100: "#f4f5f7",
  gray300: "#d3d7de",
  gray500: "#8b909a",
  gray800: "#2a2d33",
  green500: "#3aa675",
  green300: "#8fd3b6",
} as const;

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

const radius = {
  sm: 6,
  md: 12,
  lg: 20,
} as const;

// semantic: 用途に紐づく（コンポーネントはこちらを参照する）
export const lightTheme = {
  colors: {
    background: palette.white,
    surface: palette.gray100,
    text: palette.black,
    textMuted: palette.gray500,
    border: palette.gray300,
    primary: palette.green500,
  },
  spacing,
  radius,
} as const;

export const darkTheme = {
  colors: {
    background: palette.black,
    surface: palette.gray800,
    text: palette.white,
    textMuted: palette.gray500,
    border: palette.gray800,
    primary: palette.green300,
  },
  spacing,
  radius,
} as const;

export type AppTheme = typeof lightTheme;
