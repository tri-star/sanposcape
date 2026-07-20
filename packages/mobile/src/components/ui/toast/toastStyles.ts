import type { IconName } from "@/components/ui/icon/iconRegistry";
import type { ToastVariant } from "@/components/ui/toast/toastQueue";
import type { AppTheme } from "@/theme/tokens";

export type ToastAppearance = {
  backgroundColor: string;
  textColor: string;
  iconName: IconName;
  paddingHorizontal: number;
  paddingVertical: number;
};

/** DS: パディング 12px 18px、アイコン/文字の間隔 10、アイコンサイズ 17 */
const PADDING_VERTICAL = 12;
const PADDING_HORIZONTAL = 18;

type TonePalette = { backgroundColor: string; textColor: string; iconName: IconName };

/**
 * variant から Toast の見た目を解決する純粋関数。
 * DS: tone は `default`/`success`/`danger` の3種(`warning` は無い)。以前の実装は
 * `info`/`success`/`warning`/`danger` の4種を持ち、かつ背景を常に `surfaceInverse` 固定にして
 * variant はアイコン色だけに反映していたが、DS は tone ごとに背景・文字色・アイコンが
 * まとまって切り替わる(design/components/DS-COMPONENT-SPECS.md の Toast 表。DS 差異)。
 */
export function resolveToastAppearance(
  theme: AppTheme,
  args: { variant: ToastVariant },
): ToastAppearance {
  const palette = resolveTonePalette(theme, args.variant);
  return {
    backgroundColor: palette.backgroundColor,
    textColor: palette.textColor,
    iconName: palette.iconName,
    paddingHorizontal: PADDING_HORIZONTAL,
    paddingVertical: PADDING_VERTICAL,
  };
}

function resolveTonePalette(theme: AppTheme, variant: ToastVariant): TonePalette {
  switch (variant) {
    case "default":
      return {
        backgroundColor: theme.colors.surfaceInverse,
        textColor: theme.colors.textOnPrimary,
        iconName: "info",
      };
    case "success":
      return {
        backgroundColor: theme.colors.success,
        textColor: "#fff",
        iconName: "check-circle-2",
      };
    case "danger":
      return {
        backgroundColor: theme.colors.danger,
        textColor: "#fff",
        iconName: "alert-circle",
      };
  }
}
