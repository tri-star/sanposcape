import { hexToRgba } from "@/lib/hexToRgba";
import type { AppTheme } from "@/theme/tokens";

export type BottomSheetAppearance = {
  backgroundColor: string;
  /** 背面スクリムの色。DS に overlay 専用トークンが無いため surfaceInverse + 固定 alpha を代用する */
  overlayColor: string;
  borderRadius: number;
  handleColor: string;
  boxShadow: string;
};

const OVERLAY_ALPHA = 0.48;

/** BottomSheet の静的な見た目(スナップ位置に依存しない部分)を解決する純粋関数 */
export function resolveBottomSheetAppearance(theme: AppTheme): BottomSheetAppearance {
  return {
    backgroundColor: theme.colors.surface,
    overlayColor: hexToRgba(theme.colors.surfaceInverse, OVERLAY_ALPHA),
    // 上辺のみ丸める(BottomSheet.tsx で borderTopLeftRadius/borderTopRightRadius に適用)
    borderRadius: theme.radius.xl,
    handleColor: theme.colors.borderStrong,
    boxShadow: theme.shadow.sheet,
  };
}
