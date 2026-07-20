import { hexToRgba } from "@/lib/hexToRgba";
import type { AppTheme } from "@/theme/tokens";

export type DialogAppearance = {
  backgroundColor: string;
  /** DS に overlay 専用トークンが無いため surfaceInverse + 固定 alpha を代用する(BottomSheet と同じ方針) */
  overlayColor: string;
  borderRadius: number;
  titleColor: string;
  messageColor: string;
};

const OVERLAY_ALPHA = 0.48;

/** Dialog の見た目を解決する純粋関数。影ではなく overlay(背面スクリム)で浮遊感を出す */
export function resolveDialogAppearance(theme: AppTheme): DialogAppearance {
  return {
    backgroundColor: theme.colors.surface,
    overlayColor: hexToRgba(theme.colors.surfaceInverse, OVERLAY_ALPHA),
    borderRadius: theme.radius.lg,
    titleColor: theme.colors.text,
    messageColor: theme.colors.textMuted,
  };
}
