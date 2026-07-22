import type { ReactNode } from "react";
import { Pressable, type StyleProp, Text, View, type ViewStyle } from "react-native";

import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { hitSlopFor } from "@/lib/hitSlop";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/** 地図カテゴリ（`theme.map`）に対応するタグの色分け。 */
export type TagCategory = "park" | "cafe" | "culture" | "station" | "neutral";

/** paddingVertical(8*2) + 本文の行高(約17) + borderWidth(1.5*2) の実測に基づく概算。 */
const TAG_HEIGHT = 36;

export type TagProps = {
  children: ReactNode;
  icon?: IconName;
  category?: TagCategory;
  selected?: boolean;
  /**
   * 省略した場合は静的なラベルとして描画する（スポットのカテゴリ表示など）。
   * このとき `Pressable` を使わず `accessibilityRole` も付けないため、
   * 「押せるように見えて何も起きない」状態にはならない。
   * disabled（＝今は利用できない）とは別物なので、そちらの表現には使わないこと。
   */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Tag — スポットのカテゴリ絞り込みチップ。選択すると category の色で塗る。
 * デザイン: Sanpo Design System / components/feedback/Tag
 */
export function Tag({
  children,
  icon,
  category = "neutral",
  selected = false,
  onPress,
  style,
  testID,
}: TagProps) {
  const theme = useTheme();
  const styles = useStyles();

  const categoryColor = category === "neutral" ? theme.colors.textSecondary : theme.map[category];
  const foreground = selected ? theme.colors.onColor : theme.colors.textPrimary;

  const surface = {
    backgroundColor: selected ? categoryColor : theme.colors.surfaceCard,
    borderColor: selected ? "transparent" : theme.colors.borderSubtle,
  };

  const content = (
    <>
      {icon ? <Icon name={icon} size={14} color={selected ? foreground : categoryColor} /> : null}
      <Text style={[styles.label, { color: foreground }]}>{children}</Text>
    </>
  );

  // 押せないタグをボタンとして露出させないため、onPress の有無で要素ごと切り替える。
  if (!onPress) {
    return (
      <View testID={testID} style={[styles.base, surface, style]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      hitSlop={hitSlopFor(TAG_HEIGHT)}
      style={({ pressed }) => [styles.base, surface, { opacity: pressed ? 0.85 : 1 }, style]}
    >
      {content}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  base: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
  },
  label: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.medium,
  },
}));
