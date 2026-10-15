import { type StyleProp, Text, View, type ViewStyle } from "react-native";

import { makeStyles } from "@/theme/makeStyles";
import { letterSpacing } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export type StatBlockProps = {
  /** 数値部分。ライブ更新される値は等幅で揃うようにしている。 */
  value: string;
  /** 単位（km・歩 など）。数値より小さく添える。 */
  unit?: string;
  label: string;
  align?: "center" | "start";
  /** 3つ以上を横に並べるときは `sm`。 */
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * StatBlock — 大きな数値 + 単位 + キャプション（経過時間 / 歩行距離 / 歩数）。
 * デザイン: Sanpo Design System / components/data/StatBlock
 */
export function StatBlock({
  value,
  unit,
  label,
  align = "center",
  size = "md",
  style,
  testID,
}: StatBlockProps) {
  const theme = useTheme();
  const styles = useStyles();
  const valueSize = size === "sm" ? theme.typography.size["2xl"] : theme.typography.size["4xl"];

  return (
    <View
      testID={testID}
      style={[styles.root, { alignItems: align === "center" ? "center" : "flex-start" }, style]}
    >
      <View style={styles.valueRow}>
        {/*
          幅の足りない値を切らずに縮める安全策（端末の文字サイズを大きくしたときなど）。
          並べる側は、想定する値が既定の文字サイズで収まる配置にしておく（例: WalkStatGrid）。
        */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          style={[
            styles.value,
            {
              fontSize: valueSize,
              letterSpacing: letterSpacing(valueSize, theme.typography.tracking.tight),
            },
          ]}
        >
          {value}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "column",
    minWidth: 0,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    maxWidth: "100%",
  },
  value: {
    // 値の側だけが縮む（単位は縮めない）
    flexShrink: 1,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
    // 数字が更新されても幅が揺れないようにする
    fontVariant: ["tabular-nums"],
  },
  unit: {
    flexShrink: 0,
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.medium,
    color: theme.colors.textSecondary,
  },
  label: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
}));
