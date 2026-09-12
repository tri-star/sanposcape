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
        往復値のスナップショット。片道値 × 2 に LOOP_FACTOR で補正した近似値）をそのまま表示している。
        選択後に `WalkRouteSummary`（`WalkRouteSummary.tsx`）が出す「往復の目安」は SS-33 以降、
        /explore/routes/walking が返す**周回ルート全体の実値**（往路 leg + 復路 leg の実測合計）で、
        算出元が異なるため、同じスポットでもこのカードの数値と選択後の数値がわずかにズレることがある
        （プランが明示的に選んだ設計。「一覧は概算・選択後は実測値」として両方「目安」の語感で許容する。
        ズレを縮める補正は backend の候補絞り込み側〈LOOP_FACTOR〉に一本化し、mobile では再補正しない）。
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
