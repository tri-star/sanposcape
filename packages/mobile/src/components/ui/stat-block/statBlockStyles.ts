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
 * `unit` は DS 通り `theme.typography.dataUnit`(font-data/weight-medium)を使う。
 * 以前は `bodySm`(font-body/weight-regular)を流用しており DS と不一致だった(B 追加分)。
 */
export function resolveStatBlockAppearance(
  theme: AppTheme,
  args: { size: StatBlockSize; align: StatBlockAlign },
): StatBlockAppearance {
  const { size, align } = args;
  return {
    valueTextStyle: size === "lg" ? theme.typography.data : theme.typography.dataSm,
    unitTextStyle: theme.typography.dataUnit,
    labelTextStyle: theme.typography.caption,
    alignItems: align === "center" ? "center" : "flex-start",
    textAlign: align,
  };
}
