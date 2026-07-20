import type { AppTheme } from "@/theme/tokens";

export type CardElevation = "none" | "sm" | "md" | "lg";
export type CardPadding = "none" | "sm" | "md" | "lg";

export type CardAppearance = {
  backgroundColor: string;
  borderRadius: number;
  padding: number;
  /** RN 0.86 の boxShadow に渡す文字列。elevation: "none" のとき undefined */
  boxShadow: string | undefined;
  /** elevation: "none" のときのみ 1px。影が無いカードは枠線で境界を保つ(B-2) */
  borderWidth: number;
  borderColor: string;
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
 *
 * DS: 非 elevated(`elevation: "none"`)のときは影の代わりに 1px `border-subtle` を持つ
 * (design/components/DS-COMPONENT-SPECS.md の Card 表。B-2)。`surface-app` と `surface-card` が
 * 近い色のため、影も枠線も無いと境界が消えてしまう。
 */
export function resolveCardAppearance(
  theme: AppTheme,
  args: { elevation: CardElevation; padding: CardPadding; pressed: boolean },
): CardAppearance {
  const { elevation, padding, pressed } = args;
  const isElevated = elevation !== "none";

  return {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing[PADDING_CONFIG[padding]],
    boxShadow: isElevated ? theme.shadow[elevation] : undefined,
    borderWidth: isElevated ? 0 : theme.sizing.hairline,
    borderColor: theme.colors.border,
    scale: pressed ? 0.97 : 1,
  };
}
