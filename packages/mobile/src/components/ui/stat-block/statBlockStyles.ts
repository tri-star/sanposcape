import type { AppTheme } from "@/theme/tokens";
import type { TextStyleToken } from "@/theme/adapters";

export type StatBlockSize = "md" | "lg";
export type StatBlockAlign = "left" | "center";

export type StatBlockAppearance = {
  valueTextStyle: TextStyleToken;
  unitTextStyle: TextStyleToken;
  labelTextStyle: TextStyleToken;
  alignItems: "flex-start" | "center";
  textAlign: "left" | "center";
};

/**
 * size/align から StatBlock の見た目を解決する純粋関数。
 * `value` は `theme.typography.data`(lg)/`dataSm`(md) を使い、tabular-nums を必ず含む
 * (`00:28:34` のような数値表示で桁が揺れないようにするため)。
 */
export function resolveStatBlockAppearance(
  theme: AppTheme,
  args: { size: StatBlockSize; align: StatBlockAlign },
): StatBlockAppearance {
  const { size, align } = args;
  return {
    valueTextStyle: size === "lg" ? theme.typography.data : theme.typography.dataSm,
    unitTextStyle: theme.typography.bodySm,
    labelTextStyle: theme.typography.caption,
    alignItems: align === "center" ? "center" : "flex-start",
    textAlign: align,
  };
}
