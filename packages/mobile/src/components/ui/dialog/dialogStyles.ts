import type { AppTheme } from "@/theme/tokens";

export type DialogAppearance = {
  backgroundColor: string;
  overlayColor: string;
  borderRadius: number;
  titleColor: string;
  messageColor: string;
};

/** Dialog の見た目を解決する純粋関数。影ではなく overlay(背面スクリム)で浮遊感を出す */
export function resolveDialogAppearance(theme: AppTheme): DialogAppearance {
  return {
    backgroundColor: theme.colors.surface,
    overlayColor: theme.colors.overlay,
    borderRadius: theme.radius.xl,
    titleColor: theme.colors.text,
    messageColor: theme.colors.textMuted,
  };
}
