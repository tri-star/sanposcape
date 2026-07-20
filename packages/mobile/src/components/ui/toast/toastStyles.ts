import type { IconName } from "@/components/ui/icon/iconRegistry";
import type { ToastVariant } from "@/components/ui/toast/toastQueue";
import type { AppTheme } from "@/theme/tokens";

export type ToastAppearance = {
  backgroundColor: string;
  textColor: string;
  iconColor: string;
  iconName: IconName;
};

const ICON_NAME: Record<ToastVariant, IconName> = {
  info: "info",
  success: "check",
  warning: "alert-triangle",
  danger: "alert-triangle",
};

/**
 * variant から Toast の見た目を解決する純粋関数。
 * 背景は常に `surfaceInverse`(暗い面)で、variant はアイコン色のみに反映する
 * (地図の上に浮くスナックバーとして、どの画面でも視認できるようにするため)。
 */
export function resolveToastAppearance(
  theme: AppTheme,
  args: { variant: ToastVariant },
): ToastAppearance {
  const { variant } = args;
  const accentColor: Record<ToastVariant, string> = {
    info: theme.colors.info,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
  };

  return {
    backgroundColor: theme.colors.surfaceInverse,
    textColor: theme.colors.textOnPrimary,
    iconColor: accentColor[variant],
    iconName: ICON_NAME[variant],
  };
}
