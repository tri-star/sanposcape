import type { AppTheme } from "@/theme/tokens";

export type BottomSheetAppearance = {
  backgroundColor: string;
  /** 背面スクリムの色。Dialog と共通の `theme.colors.overlay`(C-6。以前は各所で個別に組み立てていた) */
  overlayColor: string;
  borderRadius: number;
  handleColor: string;
  boxShadow: string;
};

/** BottomSheet の静的な見た目(スナップ位置に依存しない部分)を解決する純粋関数 */
export function resolveBottomSheetAppearance(theme: AppTheme): BottomSheetAppearance {
  return {
    backgroundColor: theme.colors.surface,
    overlayColor: theme.colors.overlay,
    // 上辺のみ丸める(BottomSheet.tsx で borderTopLeftRadius/borderTopRightRadius に適用)
    borderRadius: theme.radius.xl,
    // DS: ハンドルは ink-200(= border と同値)。以前は borderStrong(ink-300 系)で一段濃かった
    handleColor: theme.colors.border,
    boxShadow: theme.shadow.sheet,
  };
}
