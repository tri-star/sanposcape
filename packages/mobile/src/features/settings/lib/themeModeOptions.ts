import type { ThemeMode } from "@/theme/tokens";

/** 設定画面のテーマ選択肢。並びは課題の記載（Light/Dark/System）に合わせる。 */
export const THEME_MODE_OPTIONS: readonly { label: string; value: ThemeMode }[] = [
  { label: "ライト", value: "light" },
  { label: "ダーク", value: "dark" },
  { label: "端末の設定", value: "system" },
];

export const APPEARANCE_SECTION_TITLE = "表示";
export const THEME_MODE_FIELD_LABEL = "テーマ";
export const THEME_MODE_DESCRIPTION =
  "「端末の設定」では、端末のライト/ダーク設定に合わせて切り替わります。この設定はこの端末に保存されます。";
