import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import type { CategoryMeta, SpotCandidate } from "@/features/walk/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";
import { withAlpha } from "@/theme/withAlpha";

export type SpotCardProps = {
  spot: SpotCandidate;
  meta: CategoryMeta;
  selected: boolean;
  onPress: () => void;
  testID?: string;
};

/**
 * SpotCard — 「歩いて行けるスポット」の横スクロールカード。
 * デザイン: mock `isStart` の reachable カード。
 */
export function SpotCard({ spot, meta, selected, onPress, testID }: SpotCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const categoryColor = theme.map[meta.mapColorKey];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.root,
        selected ? styles.rootSelected : styles.rootUnselected,
        { transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.tint, { backgroundColor: withAlpha(categoryColor, 0.16) }]}>
          <Icon name={meta.icon} size={13} color={categoryColor} />
        </View>
        <Text style={styles.category}>{meta.label}</Text>
      </View>
      <Text numberOfLines={2} style={styles.name}>
        {spot.name}
      </Text>
      {/*
        `spot.roundTripMinutes`/`roundTripKm` は /explore/places のレスポンス（backend が返す
        片道値 × 2 の近似スナップショット）をそのまま表示している。選択後は `POST /explore/routes/loop`
        で取得する周回ルートの実値（`ActiveWalk.loopMinutes`/`loopKm`）に切り替わる（SS-33）。
        算出元の API が異なる（近似 vs 実測）ため、同じスポットでもこのカードの数値と選択後の数値が
        わずかにズレることがある（ユーザー確認済みの設計。「一覧は概算・選択後は実測」として
        両方「目安」の語感で許容し、UI では説明しない）。
      */}
      <Text style={styles.meta}>
        往復 <Text style={styles.metaStrong}>{spot.roundTripMinutes}</Text>分・約
        {spot.roundTripKm.toFixed(1)}km
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    width: 132,
    padding: theme.spacing[3],
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceCard,
  },
  rootSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    ...theme.shadows.sm,
  },
  rootUnselected: {
    borderWidth: 2,
    borderColor: "transparent",
    ...theme.shadows.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: theme.spacing[2],
  },
  tint: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.xs + 1,
    alignItems: "center",
    justifyContent: "center",
  },
  category: {
    fontSize: theme.typography.size["2xs"],
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textTertiary,
  },
  name: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  meta: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textSecondary,
  },
  metaStrong: {
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
}));
