import type { AppTheme } from "@/theme/tokens";

export type CardElevation = "none" | "sm" | "md" | "lg";
export type CardPadding = "none" | "sm" | "md" | "lg";

export type CardAppearance = {
  backgroundColor: string;
  borderRadius: number;
  padding: number;
  /** RN 0.86 の boxShadow に渡す文字列。elevation: "none" のとき undefined */
  boxShadow: string | undefined;
  scale: number;
};

const PADDING_CONFIG: Record<CardPadding, keyof AppTheme["spacing"]> = {
  none: 0,
  sm: 8,
  md: 16,
  lg: 24,
};

/**
 * elevation/padding/押下状態 から Card の見た目を解決する純粋関数。
 * `onPress` が指定されているときだけ Card.tsx が Pressable にし、pressed を渡す。
 */
export function resolveCardAppearance(
  theme: AppTheme,
  args: { elevation: CardElevation; padding: CardPadding; pressed: boolean },
): CardAppearance {
  const { elevation, padding, pressed } = args;

  return {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing[PADDING_CONFIG[padding]],
    boxShadow: elevation === "none" ? undefined : theme.shadow[elevation],
    scale: pressed ? 0.97 : 1,
  };
}
